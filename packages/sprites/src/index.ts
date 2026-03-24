/**
 * @paradigm/sprites — Procedural sprite generation, pixel art, atlas packing,
 * palette derivation, and multi-format export for the GSPL Paradigm platform.
 *
 * Layer 4 (Creative). Depends on Layer 0 (@paradigm/types, @paradigm/rng).
 * Zero external npm dependencies. All generation is seed-deterministic.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, VectorGene, ScalarGene, CategoricalGene } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Core interfaces
// ─────────────────────────────────────────────

/** A single frame region within a sprite sheet texture. */
export interface SpriteFrame {
  /** Pixel X offset of the frame on the sheet. */
  x: number;
  /** Pixel Y offset of the frame on the sheet. */
  y: number;
  /** Pixel width of the frame. */
  width: number;
  /** Pixel height of the frame. */
  height: number;
  /** Display duration of this frame in milliseconds. */
  duration: number;
}

/** A named animation composed of ordered sprite frames. */
export interface Animation {
  /** Unique animation name (e.g. "idle", "walk"). */
  name: string;
  /** Ordered sequence of frames for this animation. */
  frames: SpriteFrame[];
  /** Whether the animation loops after its last frame. */
  loop: boolean;
  /** Playback rate in frames per second. */
  fps: number;
}

/** Sprite sheet metadata describing the layout of all animations. */
export interface SpriteSheet {
  /** Human-readable name derived from the source seed. */
  name: string;
  /** Total pixel width of the sprite sheet texture. */
  width: number;
  /** Total pixel height of the sprite sheet texture. */
  height: number;
  /** Width of an individual frame cell in pixels. */
  frameWidth: number;
  /** Height of an individual frame cell in pixels. */
  frameHeight: number;
  /** All animations defined in this sheet. */
  animations: Animation[];
  /** Arbitrary key-value metadata (domain, seed hash, etc.). */
  metadata: Record<string, unknown>;
}

/** A single named region inside a sprite atlas. */
export interface AtlasEntry {
  /** Unique identifier for this sprite. */
  name: string;
  /** X position of the sprite in the atlas. */
  x: number;
  /** Y position of the sprite in the atlas. */
  y: number;
  /** Width of the sprite. */
  width: number;
  /** Height of the sprite. */
  height: number;
  /** Whether the sprite was rotated 90° clockwise to fit. */
  rotated: boolean;
}

/** A packed atlas containing multiple sprites. */
export interface SpriteAtlas {
  /** Total atlas width in pixels. */
  width: number;
  /** Total atlas height in pixels. */
  height: number;
  /** All sprite entries packed into this atlas. */
  entries: AtlasEntry[];
  /** Padding between entries in pixels. */
  padding: number;
}

/**
 * Raw pixel data as a 2-D array of RGBA values packed into a single 32-bit
 * unsigned integer: (r << 24) | (g << 16) | (b << 8) | a.
 */
export interface PixelData {
  /** Width of the pixel grid in pixels. */
  width: number;
  /** Height of the pixel grid in pixels. */
  height: number;
  /**
   * Row-major 2-D array: pixels[y][x] = packed RGBA uint32.
   * Outer array length === height; inner array length === width.
   */
  pixels: number[][];
}

/** An RGB color value. */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/** A named color palette. */
export interface ColorPalette {
  /** Human-readable palette name. */
  name: string;
  /** Ordered array of RGB colors. */
  colors: RGBColor[];
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/** Pack separate r, g, b, a bytes into a single uint32. */
function packRGBA(r: number, g: number, b: number, a: number): number {
  return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0;
}

/** Unpack a uint32 into r, g, b, a bytes. */
function unpackRGBA(packed: number): RGBColor & { a: number } {
  return {
    r: (packed >>> 24) & 0xff,
    g: (packed >>> 16) & 0xff,
    b: (packed >>> 8) & 0xff,
    a: packed & 0xff,
  };
}

/** Clamp a value to [0, 255]. */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Create an empty (transparent) pixel grid. */
function createPixelGrid(width: number, height: number): number[][] {
  return Array.from({ length: height }, () => new Array<number>(width).fill(0));
}

/** Extract a scalar gene value normalized to [0, 1]. Returns fallback if absent. */
function scalarNorm(seed: UniversalSeed, key: string, fallback: number): number {
  const gene = seed.genes[key];
  if (gene === undefined) return fallback;
  if (gene.type !== 'scalar') return fallback;
  const sg = gene as ScalarGene;
  const range = sg.max - sg.min;
  if (range === 0) return 0;
  return (sg.value - sg.min) / range;
}

/** Extract a vector gene's values. Returns empty array if absent or wrong type. */
function vectorValues(seed: UniversalSeed, key: string): number[] {
  const gene = seed.genes[key];
  if (gene === undefined) return [];
  if (gene.type !== 'vector') return [];
  return (gene as VectorGene).value;
}

/** Extract a categorical gene's string value. Returns fallback if absent. */
function categoricalValue(seed: UniversalSeed, key: string, fallback: string): string {
  const gene = seed.genes[key];
  if (gene === undefined) return fallback;
  if (gene.type !== 'categorical') return fallback;
  return (gene as CategoricalGene).value;
}

// ─────────────────────────────────────────────
// Domain animation sets
// ─────────────────────────────────────────────

/** Default animation names keyed by seed domain group. */
const DOMAIN_ANIMATIONS: Readonly<Record<string, string[]>> = {
  organism: ['idle', 'walk', 'run', 'attack', 'die'],
  mammal: ['idle', 'walk', 'run', 'attack', 'die'],
  bird: ['idle', 'walk', 'fly', 'attack', 'die'],
  fish: ['idle', 'swim', 'dash', 'die'],
  insect: ['idle', 'walk', 'fly', 'die'],
  robot: ['idle', 'walk', 'run', 'attack', 'die'],
  vehicle: ['idle', 'move', 'boost', 'damaged'],
  weapon: ['idle', 'equip', 'attack', 'special'],
  plant: ['idle', 'grow', 'wilt'],
  building: ['idle', 'construct', 'destroy'],
  game: ['idle', 'move', 'action', 'hit', 'special'],
  character: ['idle', 'walk', 'run', 'attack', 'die'],
  creature: ['idle', 'walk', 'run', 'attack', 'die'],
  default: ['idle', 'walk', 'run', 'jump', 'attack'],
} as const;

// ─────────────────────────────────────────────
// Domain palette presets
// ─────────────────────────────────────────────

/** Preset RGB palettes per seed domain. */
const DOMAIN_PALETTES: Readonly<Record<string, RGBColor[]>> = {
  organism: [
    { r: 34, g: 139, b: 34 }, { r: 85, g: 107, b: 47 }, { r: 154, g: 205, b: 50 },
    { r: 0, g: 100, b: 0 }, { r: 107, g: 142, b: 35 },
  ],
  robot: [
    { r: 112, g: 128, b: 144 }, { r: 70, g: 130, b: 180 }, { r: 176, g: 196, b: 222 },
    { r: 47, g: 79, b: 79 }, { r: 0, g: 191, b: 255 },
  ],
  vehicle: [
    { r: 184, g: 134, b: 11 }, { r: 139, g: 69, b: 19 }, { r: 205, g: 133, b: 63 },
    { r: 210, g: 105, b: 30 }, { r: 255, g: 140, b: 0 },
  ],
  weapon: [
    { r: 169, g: 169, b: 169 }, { r: 128, g: 0, b: 0 }, { r: 192, g: 192, b: 192 },
    { r: 255, g: 215, b: 0 }, { r: 105, g: 105, b: 105 },
  ],
  plant: [
    { r: 0, g: 128, b: 0 }, { r: 34, g: 139, b: 34 }, { r: 144, g: 238, b: 144 },
    { r: 0, g: 100, b: 0 }, { r: 50, g: 205, b: 50 },
  ],
  building: [
    { r: 139, g: 90, b: 43 }, { r: 160, g: 82, b: 45 }, { r: 188, g: 143, b: 143 },
    { r: 128, g: 128, b: 128 }, { r: 192, g: 192, b: 192 },
  ],
  game: [
    { r: 255, g: 99, b: 71 }, { r: 255, g: 165, b: 0 }, { r: 255, g: 215, b: 0 },
    { r: 60, g: 179, b: 113 }, { r: 100, g: 149, b: 237 },
  ],
  fluid: [
    { r: 0, g: 105, b: 148 }, { r: 0, g: 191, b: 255 }, { r: 135, g: 206, b: 250 },
    { r: 70, g: 130, b: 180 }, { r: 173, g: 216, b: 230 },
  ],
  default: [
    { r: 100, g: 100, b: 200 }, { r: 200, g: 100, b: 100 }, { r: 100, g: 200, b: 100 },
    { r: 200, g: 200, b: 100 }, { r: 150, g: 100, b: 200 },
  ],
} as const;

// ─────────────────────────────────────────────
// SpriteGenerator
// ─────────────────────────────────────────────

/** Options for sprite sheet generation. */
export interface SpriteSheetOptions {
  /** Width of each frame cell in pixels. Defaults to 32. */
  frameWidth?: number;
  /** Height of each frame cell in pixels. Defaults to 32. */
  frameHeight?: number;
  /** Override animation names to generate. */
  animations?: string[];
}

/**
 * Generates sprite sheet metadata from UniversalSeed genes.
 * All generation is deterministic for a given seed.
 */
export class SpriteGenerator {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('sprites:default');
  }

  /**
   * Generate a complete SpriteSheet descriptor from a seed.
   *
   * Frame count per animation is derived from scalar gene "energy" (or
   * "speed"), defaulting to 4–8 frames. Sheet dimensions are computed to
   * pack all animation rows without gaps.
   *
   * @param seed - Source UniversalSeed providing genes and domain.
   * @param options - Optional overrides for frame size and animation list.
   * @returns Fully populated SpriteSheet with all animations.
   */
  generateSpriteSheet(seed: UniversalSeed, options: SpriteSheetOptions = {}): SpriteSheet {
    const frameWidth = options.frameWidth ?? 32;
    const frameHeight = options.frameHeight ?? 32;
    const animationNames = options.animations ?? this.deriveAnimations(seed);

    const energyNorm = scalarNorm(seed, 'energy', 0.5);
    const speedNorm = scalarNorm(seed, 'speed', 0.5);
    const combinedNorm = (energyNorm + speedNorm) / 2;

    const animations = animationNames.map((animName) => {
      const frameCount = this.deriveFrameCount(animName, combinedNorm);
      const frames = this.generateFrames(animName, frameCount, frameWidth, frameHeight);
      const fps = this.deriveFPS(animName, combinedNorm);
      const loop = this.deriveLoop(animName);
      return { name: animName, frames, loop, fps } satisfies Animation;
    });

    const maxFrames = Math.max(...animations.map((a) => a.frames.length), 1);
    const sheetWidth = maxFrames * frameWidth;
    const sheetHeight = animations.length * frameHeight;

    return {
      name: seed.$name,
      width: sheetWidth,
      height: sheetHeight,
      frameWidth,
      frameHeight,
      animations,
      metadata: {
        domain: seed.$domain,
        seedHash: seed.$hash,
        generation: seed.$lineage.generation,
        created: seed.$metadata.created,
      },
    };
  }

  /**
   * Generate frame positions for a single animation in a grid layout.
   * Frames are laid out left-to-right; Y offset is determined by the
   * animation's row index within the sheet via its name hash.
   *
   * @param animation - Animation name (used to derive row offset).
   * @param frameCount - Number of frames to generate.
   * @param frameWidth - Width of each frame.
   * @param frameHeight - Height of each frame.
   * @returns Array of SpriteFrame descriptors.
   */
  generateFrames(
    animation: string,
    frameCount: number,
    frameWidth: number,
    frameHeight: number,
  ): SpriteFrame[] {
    const rowRng = this.rng.fork(animation);
    const rowIndex = rowRng.nextInt(0, 32);
    const y = rowIndex * frameHeight;
    const durationMs = Math.round(1000 / 8);

    return Array.from({ length: frameCount }, (_, i) => ({
      x: i * frameWidth,
      y,
      width: frameWidth,
      height: frameHeight,
      duration: durationMs,
    }));
  }

  /**
   * Derive the set of animation names appropriate for the seed's domain.
   *
   * @param seed - Source seed whose $domain drives the selection.
   * @returns Array of animation name strings.
   */
  deriveAnimations(seed: UniversalSeed): string[] {
    const domain = seed.$domain as string;

    // Check overrides stored in a categorical gene
    const geneAnim = categoricalValue(seed, 'animation_set', '');
    if (geneAnim.length > 0) {
      return geneAnim.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    }

    return (DOMAIN_ANIMATIONS[domain] ?? DOMAIN_ANIMATIONS['default']) as string[];
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private deriveFrameCount(animName: string, energyNorm: number): number {
    const base: Record<string, number> = {
      idle: 4,
      walk: 6,
      run: 8,
      jump: 5,
      attack: 6,
      die: 8,
      fly: 6,
      swim: 6,
      move: 6,
      action: 6,
      hit: 4,
      special: 8,
      boost: 6,
      damaged: 4,
      equip: 4,
      grow: 6,
      wilt: 4,
      construct: 8,
      destroy: 8,
      dash: 5,
    };
    const baseCount = base[animName] ?? 6;
    const bonus = Math.round(energyNorm * 4);
    return Math.max(1, Math.min(16, baseCount + bonus));
  }

  private deriveFPS(animName: string, speedNorm: number): number {
    const base: Record<string, number> = {
      idle: 6,
      walk: 10,
      run: 16,
      jump: 12,
      attack: 14,
      die: 8,
      fly: 12,
      swim: 8,
      special: 14,
      default: 8,
    };
    const baseFps = base[animName] ?? base['default'] ?? 8;
    return Math.max(1, Math.round(baseFps * (0.7 + speedNorm * 0.6)));
  }

  private deriveLoop(animName: string): boolean {
    const nonLooping = new Set(['die', 'destroy', 'hit', 'damaged', 'equip']);
    return !nonLooping.has(animName);
  }
}

// ─────────────────────────────────────────────
// PixelArtGenerator
// ─────────────────────────────────────────────

/**
 * Generates procedural pixel art from UniversalSeed genes.
 * Characters use bilateral symmetry; abstract domains use full-grid noise.
 */
export class PixelArtGenerator {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('pixelart:default');
  }

  /**
   * Generate a PixelData grid from a seed.
   * Character/creature/organism domains use symmetric generation.
   * Other domains use full-width generation with domain palette.
   *
   * @param seed - Source seed for deterministic generation.
   * @param width - Output width in pixels.
   * @param height - Output height in pixels.
   * @returns PixelData with packed RGBA values.
   */
  generate(seed: UniversalSeed, width: number, height: number): PixelData {
    const symmetricDomains = new Set([
      'organism', 'mammal', 'bird', 'fish', 'insect', 'robot', 'character', 'creature',
    ]);
    const domain = seed.$domain as string;
    const useSymmetry = symmetricDomains.has(domain);

    const palette = this.derivePaletteFromSeed(seed);
    const seedRng = new DeterministicRNG(seed.$hash);

    if (useSymmetry) {
      return this.generateSymmetric(seed, width, height);
    }

    return this.generateFull(seedRng, width, height, palette);
  }

  /**
   * Generate symmetric pixel art by computing a half-width grid and mirroring.
   * The left half is generated then reflected to produce bilateral symmetry.
   *
   * @param seed - Source seed.
   * @param width - Total width (half is generated, then mirrored).
   * @param height - Full height.
   * @returns Mirrored PixelData.
   */
  generateSymmetric(seed: UniversalSeed, width: number, height: number): PixelData {
    const halfWidth = Math.ceil(width / 2);
    const palette = this.derivePaletteFromSeed(seed);
    const seedRng = new DeterministicRNG(seed.$hash + ':sym');
    const densityNorm = scalarNorm(seed, 'density', 0.6);

    const pixels = createPixelGrid(width, height);

    for (let y = 0; y < height; y++) {
      for (let lx = 0; lx < halfWidth; lx++) {
        const rx = width - 1 - lx;
        const filled = seedRng.next() < densityNorm + (y / height) * 0.2;
        if (!filled) continue;

        const color = palette[seedRng.nextInt(0, palette.length)] ?? { r: 128, g: 128, b: 128 };
        const packed = packRGBA(color.r, color.g, color.b, 255);
        const row = pixels[y];
        if (row !== undefined) {
          row[lx] = packed;
          if (rx !== lx) row[rx] = packed;
        }
      }
    }

    return { width, height, pixels };
  }

  /**
   * Nearest-neighbor upscale of pixel data.
   *
   * @param pixels - Source pixel data.
   * @param factor - Integer scale factor (must be >= 1).
   * @returns Upscaled PixelData.
   * @throws {RangeError} If factor is less than 1.
   */
  upscale(pixels: PixelData, factor: number): PixelData {
    if (factor < 1) {
      throw new RangeError(`Upscale factor must be >= 1, got ${factor}`);
    }
    const intFactor = Math.floor(factor);
    const newWidth = pixels.width * intFactor;
    const newHeight = pixels.height * intFactor;
    const result = createPixelGrid(newWidth, newHeight);

    for (let sy = 0; sy < pixels.height; sy++) {
      for (let sx = 0; sx < pixels.width; sx++) {
        const srcRow = pixels.pixels[sy];
        const packed = srcRow !== undefined ? (srcRow[sx] ?? 0) : 0;
        for (let dy = 0; dy < intFactor; dy++) {
          const ry = sy * intFactor + dy;
          const destRow = result[ry];
          if (destRow === undefined) continue;
          for (let dx = 0; dx < intFactor; dx++) {
            destRow[sx * intFactor + dx] = packed;
          }
        }
      }
    }

    return { width: newWidth, height: newHeight, pixels: result };
  }

  /**
   * Remap all non-transparent pixels to the nearest color in the palette.
   * Uses Euclidean distance in RGB space.
   *
   * @param pixels - Source pixel data.
   * @param palette - Target palette.
   * @returns New PixelData with colors quantized to the palette.
   */
  applyPalette(pixels: PixelData, palette: ColorPalette): PixelData {
    if (palette.colors.length === 0) return pixels;

    const remapped = createPixelGrid(pixels.width, pixels.height);

    for (let y = 0; y < pixels.height; y++) {
      const srcRow = pixels.pixels[y];
      const dstRow = remapped[y];
      if (srcRow === undefined || dstRow === undefined) continue;

      for (let x = 0; x < pixels.width; x++) {
        const packed = srcRow[x] ?? 0;
        const { r, g, b, a } = unpackRGBA(packed);
        if (a === 0) {
          dstRow[x] = 0;
          continue;
        }
        const nearest = this.nearestColor({ r, g, b }, palette.colors);
        dstRow[x] = packRGBA(nearest.r, nearest.g, nearest.b, a);
      }
    }

    return { width: pixels.width, height: pixels.height, pixels: remapped };
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private generateFull(
    rng: DeterministicRNG,
    width: number,
    height: number,
    palette: RGBColor[],
  ): PixelData {
    const pixels = createPixelGrid(width, height);
    const density = 0.55;

    for (let y = 0; y < height; y++) {
      const row = pixels[y];
      if (row === undefined) continue;
      for (let x = 0; x < width; x++) {
        if (rng.next() < density) {
          const color = palette[rng.nextInt(0, palette.length)] ?? { r: 128, g: 128, b: 128 };
          row[x] = packRGBA(color.r, color.g, color.b, 255);
        }
      }
    }

    return { width, height, pixels };
  }

  private derivePaletteFromSeed(seed: UniversalSeed): RGBColor[] {
    const vectorVals = vectorValues(seed, 'color');
    if (vectorVals.length >= 3) {
      const colors: RGBColor[] = [];
      for (let i = 0; i + 2 < vectorVals.length; i += 3) {
        colors.push({
          r: clamp255((vectorVals[i] ?? 0) * 255),
          g: clamp255((vectorVals[i + 1] ?? 0) * 255),
          b: clamp255((vectorVals[i + 2] ?? 0) * 255),
        });
      }
      if (colors.length > 0) return colors;
    }

    const domain = seed.$domain as string;
    return (DOMAIN_PALETTES[domain] ?? DOMAIN_PALETTES['default']) as RGBColor[];
  }

  private nearestColor(target: RGBColor, palette: RGBColor[]): RGBColor {
    let best = palette[0] ?? { r: 0, g: 0, b: 0 };
    let bestDist = Infinity;

    for (const color of palette) {
      const dr = target.r - color.r;
      const dg = target.g - color.g;
      const db = target.b - color.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = color;
      }
    }

    return best;
  }
}

// ─────────────────────────────────────────────
// AtlasPacker
// ─────────────────────────────────────────────

/** Input descriptor for a sprite to be packed. */
interface PackInput {
  name: string;
  width: number;
  height: number;
}

/**
 * Packs sprite rectangles into a single atlas using a shelf-based algorithm.
 * Sprites are placed left-to-right; a new shelf starts when the current row
 * cannot accommodate the next sprite.
 */
export class AtlasPacker {
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly padding: number;

  /**
   * @param maxWidth - Maximum atlas width. Defaults to 4096.
   * @param maxHeight - Maximum atlas height. Defaults to 4096.
   * @param padding - Pixel gap between sprites. Defaults to 1.
   */
  constructor(maxWidth = 4096, maxHeight = 4096, padding = 1) {
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
    this.padding = padding;
  }

  /**
   * Pack sprites using the shelf (strip) algorithm.
   * Sprites are not rotated.
   *
   * @param entries - Sprites to pack, each with name, width, height.
   * @returns SpriteAtlas with assigned positions.
   * @throws {RangeError} If any sprite exceeds the atlas dimensions.
   */
  pack(entries: PackInput[]): SpriteAtlas {
    return this.packInternal(entries, false);
  }

  /**
   * Pack sprites, attempting to rotate each 90° if it produces a better fit
   * on the current shelf.
   *
   * @param entries - Sprites to pack.
   * @returns SpriteAtlas with assigned positions and rotation flags.
   */
  packWithRotation(entries: PackInput[]): SpriteAtlas {
    return this.packInternal(entries, true);
  }

  // ── private ──────────────────────────────────────────────────────────────

  private packInternal(entries: PackInput[], allowRotation: boolean): SpriteAtlas {
    const pad = this.padding;
    const packed: AtlasEntry[] = [];

    let cursorX = pad;
    let cursorY = pad;
    let shelfHeight = 0;
    let atlasWidth = 0;
    let atlasHeight = 0;

    for (const entry of entries) {
      let w = entry.width;
      let h = entry.height;
      let rotated = false;

      if (w <= 0 || h <= 0) {
        throw new RangeError(
          `Sprite "${entry.name}" has invalid dimensions ${w}x${h}`,
        );
      }

      // Try rotation: if landscape and height fits the remaining shelf width better
      if (allowRotation && h > w) {
        const tmp = w;
        w = h;
        h = tmp;
        rotated = true;
      }

      // Start a new shelf if the sprite does not fit horizontally
      if (cursorX + w + pad > this.maxWidth) {
        cursorX = pad;
        cursorY += shelfHeight + pad;
        shelfHeight = 0;
      }

      if (cursorY + h + pad > this.maxHeight) {
        throw new RangeError(
          `Atlas overflow: sprite "${entry.name}" (${w}x${h}) does not fit within ` +
          `${this.maxWidth}x${this.maxHeight} atlas`,
        );
      }

      packed.push({ name: entry.name, x: cursorX, y: cursorY, width: w, height: h, rotated });

      cursorX += w + pad;
      shelfHeight = Math.max(shelfHeight, h);
      atlasWidth = Math.max(atlasWidth, cursorX);
      atlasHeight = Math.max(atlasHeight, cursorY + shelfHeight + pad);
    }

    return {
      width: atlasWidth,
      height: atlasHeight,
      entries: packed,
      padding: pad,
    };
  }
}

// ─────────────────────────────────────────────
// PaletteGenerator
// ─────────────────────────────────────────────

/**
 * Generates color palettes from UniversalSeed genes or mathematical
 * color relationships.
 */
export class PaletteGenerator {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('palette:default');
  }

  /**
   * Extract a color palette from a seed's vector genes or domain presets.
   * Reads "color" vector gene first; falls back to domain palette generator.
   *
   * @param seed - Source seed.
   * @param colorCount - Desired number of colors. Defaults to 5.
   * @returns Named ColorPalette.
   */
  fromSeed(seed: UniversalSeed, colorCount = 5): ColorPalette {
    const vectorVals = vectorValues(seed, 'color');
    if (vectorVals.length >= 3) {
      const colors: RGBColor[] = [];
      for (let i = 0; i + 2 < vectorVals.length && colors.length < colorCount; i += 3) {
        colors.push({
          r: clamp255((vectorVals[i] ?? 0) * 255),
          g: clamp255((vectorVals[i + 1] ?? 0) * 255),
          b: clamp255((vectorVals[i + 2] ?? 0) * 255),
        });
      }
      if (colors.length > 0) {
        const remaining = colorCount - colors.length;
        if (remaining > 0 && colors[0] !== undefined) {
          const analog = this.analogous(colors[0], remaining);
          colors.push(...analog.colors);
        }
        return { name: `${seed.$name}-palette`, colors: colors.slice(0, colorCount) };
      }
    }

    const base = this.fromDomain(seed.$domain as string);
    const seedRng = new DeterministicRNG(seed.$hash + ':palette');

    // Expand or trim palette to match requested count
    const colors: RGBColor[] = [...base.colors];
    while (colors.length < colorCount) {
      const src = colors[seedRng.nextInt(0, colors.length)];
      if (src !== undefined) {
        const jittered: RGBColor = {
          r: clamp255(src.r + seedRng.nextInt(-30, 31)),
          g: clamp255(src.g + seedRng.nextInt(-30, 31)),
          b: clamp255(src.b + seedRng.nextInt(-30, 31)),
        };
        colors.push(jittered);
      }
    }

    return { name: `${seed.$name}-palette`, colors: colors.slice(0, colorCount) };
  }

  /**
   * Generate a two-color complementary palette (base + 180° hue rotation).
   *
   * @param base - Base RGB color.
   * @returns ColorPalette with the base and its complement plus tints.
   */
  complementary(base: RGBColor): ColorPalette {
    const { h, s, l } = rgbToHsl(base);
    const compH = (h + 0.5) % 1;
    const comp = hslToRgb(compH, s, l);

    return {
      name: 'complementary',
      colors: [
        base,
        hslToRgb(h, s, Math.min(1, l + 0.2)),
        comp,
        hslToRgb(compH, s, Math.min(1, l + 0.2)),
        hslToRgb(h, Math.max(0, s - 0.3), l),
      ],
    };
  }

  /**
   * Generate an analogous palette of adjacent hues.
   *
   * @param base - Base RGB color.
   * @param count - Number of colors to generate (including base). Defaults to 5.
   * @returns Analogous ColorPalette.
   */
  analogous(base: RGBColor, count = 5): ColorPalette {
    const { h, s, l } = rgbToHsl(base);
    const step = 0.05;
    const colors: RGBColor[] = [base];

    for (let i = 1; colors.length < count; i++) {
      const direction = i % 2 === 1 ? 1 : -1;
      const offset = Math.ceil(i / 2) * step * direction;
      colors.push(hslToRgb(((h + offset) % 1 + 1) % 1, s, l));
    }

    return { name: 'analogous', colors };
  }

  /**
   * Return a preset palette for the given domain string.
   * Falls back to "default" if the domain has no preset.
   *
   * @param domain - Seed domain string.
   * @returns Named ColorPalette.
   */
  fromDomain(domain: string): ColorPalette {
    const colors = (DOMAIN_PALETTES[domain] ?? DOMAIN_PALETTES['default']) as RGBColor[];
    return { name: `${domain}-preset`, colors };
  }
}

// ── HSL helpers ──────────────────────────────────────────────────────────────

/** Convert RGB (0-255 each) to HSL (0-1 each). */
function rgbToHsl(color: RGBColor): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return { h, s, l };
}

/** Convert HSL (0-1 each) to RGB (0-255 each). */
function hslToRgb(h: number, s: number, l: number): RGBColor {
  if (s === 0) {
    const v = clamp255(l * 255);
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: clamp255(hueToRgbChannel(p, q, h + 1 / 3) * 255),
    g: clamp255(hueToRgbChannel(p, q, h) * 255),
    b: clamp255(hueToRgbChannel(p, q, h - 1 / 3) * 255),
  };
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  const tc = ((t % 1) + 1) % 1;
  if (tc < 1 / 6) return p + (q - p) * 6 * tc;
  if (tc < 1 / 2) return q;
  if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
  return p;
}

// ─────────────────────────────────────────────
// SpriteExporter
// ─────────────────────────────────────────────

/**
 * Exports SpriteSheet metadata to various formats.
 * All methods are pure functions over immutable sheet data.
 */
export class SpriteExporter {
  /**
   * Serialize a SpriteSheet to a formatted JSON string.
   *
   * @param sheet - Source SpriteSheet.
   * @returns Indented JSON string.
   */
  toJSON(sheet: SpriteSheet): string {
    return JSON.stringify(sheet, null, 2);
  }

  /**
   * Export a SpriteSheet as a minimal Godot .tres resource file.
   * Generates a SpriteFrames resource with one AnimatedSprite per animation.
   *
   * @param sheet - Source SpriteSheet.
   * @returns Godot .tres resource text.
   */
  toGodotTres(sheet: SpriteSheet): string {
    const lines: string[] = [
      '[gd_resource type="SpriteFrames" load_steps=2 format=2]',
      '',
      '[sub_resource type="AtlasTexture" id=1]',
      `atlas = ExtResource( 1 )`,
      `region = Rect2( 0, 0, ${sheet.width}, ${sheet.height} )`,
      '',
      '[resource]',
      `animations = [`,
    ];

    for (const anim of sheet.animations) {
      lines.push(`  {`);
      lines.push(`  "frames": [`);

      for (const frame of anim.frames) {
        lines.push(
          `    SubResource( 1 ),  # x:${frame.x} y:${frame.y} ` +
          `w:${frame.width} h:${frame.height}`,
        );
      }

      lines.push(`  ],`);
      lines.push(`  "loop": ${anim.loop},`);
      lines.push(`  "name": "${anim.name}",`);
      lines.push(`  "speed": ${anim.fps}.0`);
      lines.push(`  },`);
    }

    lines.push(`]`);
    return lines.join('\n');
  }

  /**
   * Export a SpriteSheet as CSS background-position utility rules.
   * One class per frame per animation, named `.sprite-{name}-{anim}-{index}`.
   *
   * @param sheet - Source SpriteSheet.
   * @returns CSS string with one rule per frame.
   */
  toCSS(sheet: SpriteSheet): string {
    const slug = sheet.name.toLowerCase().replace(/\s+/g, '-');
    const lines: string[] = [
      `/* @paradigm/sprites — ${sheet.name} */`,
      `.sprite-${slug} {`,
      `  width: ${sheet.frameWidth}px;`,
      `  height: ${sheet.frameHeight}px;`,
      `  background-size: ${sheet.width}px ${sheet.height}px;`,
      `}`,
      '',
    ];

    for (const anim of sheet.animations) {
      for (let i = 0; i < anim.frames.length; i++) {
        const frame = anim.frames[i];
        if (frame === undefined) continue;
        const className = `.sprite-${slug}-${anim.name}-${i}`;
        lines.push(`${className} {`);
        lines.push(`  background-position: -${frame.x}px -${frame.y}px;`);
        lines.push(`}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export a SpriteSheet as a self-contained HTML preview page.
   * Each animation is shown as a CSS-animated sprite strip with controls.
   *
   * @param sheet - Source SpriteSheet.
   * @returns Complete HTML document string.
   */
  toHTML(sheet: SpriteSheet): string {
    const slug = sheet.name.toLowerCase().replace(/\s+/g, '-');

    const keyframeBlocks = sheet.animations.map((anim) => {
      const totalDuration =
        anim.frames.reduce((sum, f) => sum + f.duration, 0);
      const durationS = (totalDuration / 1000).toFixed(2);
      const loopStyle = anim.loop ? 'infinite' : '1';

      const steps: string[] = [];
      let elapsed = 0;
      for (const frame of anim.frames) {
        const pct = ((elapsed / totalDuration) * 100).toFixed(1);
        steps.push(
          `    ${pct}% { background-position: -${frame.x}px -${frame.y}px; }`,
        );
        elapsed += frame.duration;
      }

      const animCss = [
        `@keyframes ${slug}-${anim.name} {`,
        ...steps,
        `}`,
        `.anim-${slug}-${anim.name} {`,
        `  animation: ${slug}-${anim.name} ${durationS}s steps(1) ${loopStyle};`,
        `}`,
      ].join('\n');

      return animCss;
    });

    const animDivs = sheet.animations.map(
      (anim) =>
        `  <div class="anim-card">` +
        `<h3>${anim.name}</h3>` +
        `<div class="sprite anim-${slug}-${anim.name}"></div>` +
        `<p>${anim.frames.length} frames @ ${anim.fps} fps` +
        `${anim.loop ? ' (loop)' : ''}</p>` +
        `</div>`,
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sheet.name} — Sprite Preview</title>
  <style>
    body { font-family: sans-serif; background: #1a1a2e; color: #eee; padding: 2rem; }
    h1 { color: #e94560; }
    .meta { color: #aaa; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .grid { display: flex; flex-wrap: wrap; gap: 1.5rem; }
    .anim-card { background: #16213e; border-radius: 8px; padding: 1rem; text-align: center; }
    .anim-card h3 { margin: 0 0 0.5rem; color: #0f3460; font-size: 0.9rem; text-transform: uppercase; }
    .anim-card p { margin: 0.5rem 0 0; font-size: 0.8rem; color: #888; }
    .sprite {
      display: inline-block;
      width: ${sheet.frameWidth}px;
      height: ${sheet.frameHeight}px;
      background-color: #0f3460;
      background-size: ${sheet.width}px ${sheet.height}px;
      image-rendering: pixelated;
    }
${keyframeBlocks.join('\n')}
  </style>
</head>
<body>
  <h1>${sheet.name}</h1>
  <p class="meta">
    Sheet: ${sheet.width}×${sheet.height}px &nbsp;|&nbsp;
    Frame: ${sheet.frameWidth}×${sheet.frameHeight}px &nbsp;|&nbsp;
    Animations: ${sheet.animations.length}
  </p>
  <div class="grid">
${animDivs.join('\n')}
  </div>
</body>
</html>`;
  }
}

// ─────────────────────────────────────────────
// SpriteEngine
// ─────────────────────────────────────────────

/** Options forwarded to the generator when calling fromSeed. */
export type SpriteEngineOptions = SpriteSheetOptions;

/**
 * Main entry point for the @paradigm/sprites package.
 * Composes SpriteGenerator, PixelArtGenerator, AtlasPacker, PaletteGenerator,
 * and SpriteExporter behind a unified API.
 */
export class SpriteEngine {
  private readonly generator: SpriteGenerator;
  private readonly pixelArt: PixelArtGenerator;
  private readonly packer: AtlasPacker;
  private readonly palette: PaletteGenerator;
  private readonly exporter: SpriteExporter;

  /**
   * @param rng - Optional shared deterministic RNG. Each subsystem forks its
   *   own child RNG from this root so they remain independent.
   */
  constructor(rng?: DeterministicRNG) {
    const root = rng ?? new DeterministicRNG('sprite-engine:root');
    this.generator = new SpriteGenerator(root.fork('generator'));
    this.pixelArt = new PixelArtGenerator(root.fork('pixelart'));
    this.packer = new AtlasPacker();
    this.palette = new PaletteGenerator(root.fork('palette'));
    this.exporter = new SpriteExporter();
  }

  /**
   * Generate a complete SpriteSheet from a seed.
   *
   * @param seed - Source UniversalSeed.
   * @param options - Optional frame size and animation list overrides.
   * @returns Populated SpriteSheet.
   */
  fromSeed(seed: UniversalSeed, options?: SpriteEngineOptions): SpriteSheet {
    return this.generator.generateSpriteSheet(seed, options);
  }

  /**
   * Generate procedural pixel art from a seed at a given resolution.
   *
   * @param seed - Source UniversalSeed.
   * @param width - Output width in pixels.
   * @param height - Output height in pixels.
   * @returns PixelData grid.
   */
  generatePixelArt(seed: UniversalSeed, width: number, height: number): PixelData {
    return this.pixelArt.generate(seed, width, height);
  }

  /**
   * Pack multiple sprite sheets into a single atlas.
   * Uses each sheet's frame dimensions as the sprite size descriptor.
   *
   * @param sheets - Array of SpriteSheet to pack.
   * @returns SpriteAtlas with all sheets positioned.
   */
  packAtlas(sheets: SpriteSheet[]): SpriteAtlas {
    const inputs = sheets.map((s) => ({
      name: s.name,
      width: s.width,
      height: s.height,
    }));
    return this.packer.pack(inputs);
  }

  /**
   * Generate a color palette from a seed.
   *
   * @param seed - Source UniversalSeed.
   * @returns ColorPalette derived from seed genes.
   */
  generatePalette(seed: UniversalSeed): ColorPalette {
    return this.palette.fromSeed(seed);
  }

  /**
   * Export a SpriteSheet to the requested format.
   *
   * @param sheet - Source SpriteSheet.
   * @param format - One of 'json' | 'godot' | 'css' | 'html'.
   * @returns Formatted string in the requested representation.
   * @throws {TypeError} If an unsupported format is provided.
   */
  export(sheet: SpriteSheet, format: 'json' | 'godot' | 'css' | 'html'): string {
    switch (format) {
      case 'json':
        return this.exporter.toJSON(sheet);
      case 'godot':
        return this.exporter.toGodotTres(sheet);
      case 'css':
        return this.exporter.toCSS(sheet);
      case 'html':
        return this.exporter.toHTML(sheet);
      default: {
        const _exhaustive: never = format;
        throw new TypeError(`Unsupported export format: ${String(_exhaustive)}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// BonePose — Animation pose data
// ═══════════════════════════════════════════════════════════════════

export interface BonePose {
  readonly boneName: string;
  readonly rotationOffset: { readonly x: number; readonly y: number; readonly z: number };
}

// ═══════════════════════════════════════════════════════════════════
// PoseLibrary — Pre-defined animation poses per body type
// ═══════════════════════════════════════════════════════════════════

export class PoseLibrary {
  /** Neutral idle pose (all offsets near zero with subtle breathing). */
  getIdlePose(bodyStructure: string, frame: number, totalFrames: number): BonePose[] {
    const breathCycle = Math.sin((frame / totalFrames) * Math.PI * 2) * 0.03;

    if (bodyStructure === 'humanoid' || bodyStructure === 'winged') {
      return [
        { boneName: 'chest', rotationOffset: { x: breathCycle, y: 0, z: 0 } },
        { boneName: 'head', rotationOffset: { x: breathCycle * 0.5, y: 0, z: 0 } },
        { boneName: 'upper_arm.L', rotationOffset: { x: 0, y: 0, z: breathCycle * 0.5 } },
        { boneName: 'upper_arm.R', rotationOffset: { x: 0, y: 0, z: -breathCycle * 0.5 } },
      ];
    }

    if (bodyStructure === 'quadruped') {
      return [
        { boneName: 'spine', rotationOffset: { x: breathCycle, y: 0, z: 0 } },
        { boneName: 'head', rotationOffset: { x: breathCycle * 0.5, y: 0, z: 0 } },
        { boneName: 'tail', rotationOffset: { x: 0, y: Math.sin((frame / totalFrames) * Math.PI * 4) * 0.1, z: 0 } },
      ];
    }

    return [{ boneName: 'root', rotationOffset: { x: breathCycle, y: 0, z: 0 } }];
  }

  /** Walk cycle with alternating limb swings. */
  getWalkPose(bodyStructure: string, frame: number, totalFrames: number): BonePose[] {
    const t = (frame / totalFrames) * Math.PI * 2;
    const swing = Math.sin(t) * 0.4;
    const counterSwing = Math.sin(t + Math.PI) * 0.4;

    if (bodyStructure === 'humanoid' || bodyStructure === 'winged') {
      return [
        { boneName: 'thigh.L', rotationOffset: { x: swing, y: 0, z: 0 } },
        { boneName: 'thigh.R', rotationOffset: { x: counterSwing, y: 0, z: 0 } },
        { boneName: 'shin.L', rotationOffset: { x: Math.max(0, -swing) * 0.6, y: 0, z: 0 } },
        { boneName: 'shin.R', rotationOffset: { x: Math.max(0, -counterSwing) * 0.6, y: 0, z: 0 } },
        { boneName: 'upper_arm.L', rotationOffset: { x: counterSwing * 0.5, y: 0, z: 0 } },
        { boneName: 'upper_arm.R', rotationOffset: { x: swing * 0.5, y: 0, z: 0 } },
        { boneName: 'spine', rotationOffset: { x: 0, y: Math.sin(t) * 0.05, z: 0 } },
      ];
    }

    if (bodyStructure === 'quadruped') {
      return [
        { boneName: 'hip.L', rotationOffset: { x: swing, y: 0, z: 0 } },
        { boneName: 'hip.R', rotationOffset: { x: counterSwing, y: 0, z: 0 } },
        { boneName: 'upper_leg.L', rotationOffset: { x: swing * 0.5, y: 0, z: 0 } },
        { boneName: 'upper_leg.R', rotationOffset: { x: counterSwing * 0.5, y: 0, z: 0 } },
        { boneName: 'spine', rotationOffset: { x: Math.sin(t * 2) * 0.03, y: 0, z: 0 } },
      ];
    }

    return [];
  }

  /** Basic attack pose (weapon swing or claw/bite). */
  getAttackPose(bodyStructure: string, frame: number, totalFrames: number): BonePose[] {
    const t = frame / totalFrames;
    // 3 phases: windup (0-0.3), swing (0.3-0.6), recovery (0.6-1.0)
    const windupEnd = 0.3;
    const swingEnd = 0.6;

    let armAngle = 0;
    if (t < windupEnd) {
      armAngle = -(t / windupEnd) * 1.2; // pull back
    } else if (t < swingEnd) {
      const swingT = (t - windupEnd) / (swingEnd - windupEnd);
      armAngle = -1.2 + swingT * 2.8; // swing forward past neutral
    } else {
      const recoveryT = (t - swingEnd) / (1.0 - swingEnd);
      armAngle = 1.6 * (1 - recoveryT); // return to rest
    }

    if (bodyStructure === 'humanoid' || bodyStructure === 'winged') {
      return [
        { boneName: 'upper_arm.R', rotationOffset: { x: armAngle, y: 0, z: 0 } },
        { boneName: 'forearm.R', rotationOffset: { x: armAngle * 0.5, y: 0, z: 0 } },
        { boneName: 'chest', rotationOffset: { x: 0, y: armAngle * 0.2, z: 0 } },
      ];
    }

    if (bodyStructure === 'quadruped' || bodyStructure === 'winged') {
      return [
        { boneName: 'head', rotationOffset: { x: armAngle * 0.8, y: 0, z: 0 } },
        { boneName: 'neck', rotationOffset: { x: armAngle * 0.4, y: 0, z: 0 } },
      ];
    }

    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// SkeletonToSpriteRasterizer — Skeleton → 2D Pixel Art
// ═══════════════════════════════════════════════════════════════════

/** Skeleton bone in 2D screen space after projection. */
interface ScreenBone {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly parentX: number;
  readonly parentY: number;
  readonly hasParent: boolean;
}

/**
 * Converts a 3D skeleton into 2D pixel art via orthographic front-view projection.
 * Draws body segments between connected bones with style-appropriate line thickness
 * and fills. Produces PixelData suitable for sprite sheet assembly.
 */
export class SkeletonToSpriteRasterizer {
  /**
   * Rasterize a skeleton into a single frame of pixel art.
   *
   * @param bones - Array of { name, position: {x,y,z}, parentIndex } bones
   * @param frameWidth - Output frame width in pixels
   * @param frameHeight - Output frame height in pixels
   * @param palette - RGB colors to use (index 0 = primary body, 1 = accent, 2 = outline)
   * @param style - Art style affecting line thickness and rendering
   */
  rasterize(
    bones: ReadonlyArray<{ name: string; position: { x: number; y: number; z: number }; parentIndex: number }>,
    frameWidth: number,
    frameHeight: number,
    palette: RGBColor[],
    style: string,
  ): PixelData {
    // Create empty pixel grid (transparent)
    const pixels: number[][] = [];
    for (let y = 0; y < frameHeight; y++) {
      pixels.push(new Array(frameWidth).fill(0));
    }

    // Project bones to 2D screen space (front view: X→screen X, Y→screen Y, ignore Z)
    const screenBones = this.projectBones(bones, frameWidth, frameHeight);

    // Style parameters
    const lineThickness = style === 'cartoon' || style === 'chibi' ? 3 : style === 'pixel' ? 1 : 2;
    const bodyRadius = style === 'cartoon' || style === 'chibi' ? 4 : style === 'pixel' ? 2 : 3;
    const outlineColor = palette[2] ?? { r: 30, g: 30, b: 40 };
    const bodyColor = palette[0] ?? { r: 120, g: 160, b: 200 };
    const accentColor = palette[1] ?? { r: 200, g: 160, b: 80 };

    // Draw outline (slightly larger)
    for (const bone of screenBones) {
      if (bone.hasParent) {
        this.drawLine(pixels, frameWidth, frameHeight, bone.parentX, bone.parentY, bone.x, bone.y, lineThickness + 1, outlineColor);
      }
      this.drawCircle(pixels, frameWidth, frameHeight, bone.x, bone.y, bodyRadius + 1, outlineColor);
    }

    // Draw body fill
    for (const bone of screenBones) {
      if (bone.hasParent) {
        this.drawLine(pixels, frameWidth, frameHeight, bone.parentX, bone.parentY, bone.x, bone.y, lineThickness, bodyColor);
      }
      const isHead = bone.name === 'head';
      const radius = isHead ? bodyRadius + 2 : bodyRadius;
      const color = isHead ? accentColor : bodyColor;
      this.drawCircle(pixels, frameWidth, frameHeight, bone.x, bone.y, radius, color);
    }

    return { width: frameWidth, height: frameHeight, pixels };
  }

  private projectBones(
    bones: ReadonlyArray<{ name: string; position: { x: number; y: number; z: number }; parentIndex: number }>,
    fw: number,
    fh: number,
  ): ScreenBone[] {
    // Compute world positions by walking the hierarchy
    const worldPositions: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i]!;
      if (bone.parentIndex < 0) {
        worldPositions.push({ x: bone.position.x, y: bone.position.y, z: bone.position.z });
      } else {
        const parent = worldPositions[bone.parentIndex]!;
        worldPositions.push({
          x: parent.x + bone.position.x,
          y: parent.y + bone.position.y,
          z: parent.z + bone.position.z,
        });
      }
    }

    // Find bounding box for centering
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const wp of worldPositions) {
      if (wp.x < minX) minX = wp.x;
      if (wp.x > maxX) maxX = wp.x;
      if (wp.y < minY) minY = wp.y;
      if (wp.y > maxY) maxY = wp.y;
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min((fw - 12) / rangeX, (fh - 12) / rangeY);
    const cx = fw / 2;
    const cy = fh / 2;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    return bones.map((bone, i) => {
      const wp = worldPositions[i]!;
      const sx = Math.round(cx + (wp.x - midX) * scale);
      const sy = Math.round(cy - (wp.y - midY) * scale); // flip Y

      let parentSx = sx;
      let parentSy = sy;
      if (bone.parentIndex >= 0) {
        const pwp = worldPositions[bone.parentIndex]!;
        parentSx = Math.round(cx + (pwp.x - midX) * scale);
        parentSy = Math.round(cy - (pwp.y - midY) * scale);
      }

      return { name: bone.name, x: sx, y: sy, parentX: parentSx, parentY: parentSy, hasParent: bone.parentIndex >= 0 };
    });
  }

  private drawCircle(pixels: number[][], fw: number, fh: number, cx: number, cy: number, radius: number, color: RGBColor): void {
    const packed = packRGBA(color.r, color.g, color.b, 255);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const px = cx + dx;
          const py = cy + dy;
          if (px >= 0 && px < fw && py >= 0 && py < fh) {
            pixels[py]![px] = packed;
          }
        }
      }
    }
  }

  private drawLine(pixels: number[][], fw: number, fh: number, x0: number, y0: number, x1: number, y1: number, thickness: number, color: RGBColor): void {
    // Bresenham with thickness via perpendicular circles
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const steps = Math.max(dx, dy, 1);
    const halfThick = Math.floor(thickness / 2);

    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      this.drawCircle(pixels, fw, fh, x, y, halfThick, color);
    }
  }
}
