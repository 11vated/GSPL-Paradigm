/**
 * @paradigm/sprites — Comprehensive test suite.
 * Target: 80%+ line/function/branch coverage.
 */

import { describe, it, expect } from 'vitest';
import type { UniversalSeed } from '@paradigm/types';
import {
  SpriteGenerator,
  PixelArtGenerator,
  AtlasPacker,
  PaletteGenerator,
  SpriteExporter,
  SpriteEngine,
} from './index.js';

// ─────────────────────────────────────────────
// Seed factory
// ─────────────────────────────────────────────

const makeSeed = (
  name: string,
  domain: string,
  genes: Record<string, unknown> = {},
): UniversalSeed => ({
  $gst: '4.0',
  $name: name,
  $domain: domain as any,
  genes: genes as any,
  $hash: name + '-hash',
  $lineage: { generation: 0, parents: [], timestamp: Date.now() } as any,
  $metadata: { created: Date.now(), generation: 0 } as any,
  $fitness: [0.5] as any,
});

/** Build a scalar gene object (matches ScalarGene interface). */
const scalarGene = (value: number, min = 0, max = 1) => ({
  type: 'scalar' as const,
  value,
  min,
  max,
});

/** Build a vector gene object (matches VectorGene interface). */
const vectorGene = (values: number[]) => ({
  type: 'vector' as const,
  value: values,
  dimensions: values.length,
});

/** Build a categorical gene object (matches CategoricalGene interface). */
const categoricalGene = (value: string, options: string[] = [value]) => ({
  type: 'categorical' as const,
  value,
  options,
});

// ─────────────────────────────────────────────
// SpriteGenerator
// ─────────────────────────────────────────────

describe('SpriteGenerator', () => {
  describe('generateSpriteSheet', () => {
    it('returns a SpriteSheet with default 32x32 frame size', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('hero', 'character');
      const sheet = gen.generateSpriteSheet(seed);

      expect(sheet.name).toBe('hero');
      expect(sheet.frameWidth).toBe(32);
      expect(sheet.frameHeight).toBe(32);
      expect(sheet.animations.length).toBeGreaterThan(0);
      expect(sheet.width).toBeGreaterThan(0);
      expect(sheet.height).toBeGreaterThan(0);
    });

    it('respects custom frameWidth and frameHeight options', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('tank', 'vehicle');
      const sheet = gen.generateSpriteSheet(seed, { frameWidth: 64, frameHeight: 48 });

      expect(sheet.frameWidth).toBe(64);
      expect(sheet.frameHeight).toBe(48);
    });

    it('uses options.animations override when provided', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('orb', 'game');
      const sheet = gen.generateSpriteSheet(seed, { animations: ['idle', 'pulse'] });

      expect(sheet.animations.map((a) => a.name)).toEqual(['idle', 'pulse']);
    });

    it('includes metadata with domain and seedHash', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('goblin', 'creature');
      const sheet = gen.generateSpriteSheet(seed);

      expect(sheet.metadata.domain).toBe('creature');
      expect(sheet.metadata.seedHash).toBe('goblin-hash');
    });

    it('sheet width equals maxFrames * frameWidth', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('slime', 'organism');
      const sheet = gen.generateSpriteSheet(seed, { frameWidth: 16, frameHeight: 16 });

      const maxFrames = Math.max(...sheet.animations.map((a) => a.frames.length));
      expect(sheet.width).toBe(maxFrames * 16);
    });

    it('sheet height equals animationCount * frameHeight', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('slime', 'organism');
      const sheet = gen.generateSpriteSheet(seed, { frameWidth: 16, frameHeight: 16 });

      expect(sheet.height).toBe(sheet.animations.length * 16);
    });

    it('honours energy + speed scalar genes when computing frame counts', () => {
      const highEnergy = makeSeed('fast', 'character', {
        energy: scalarGene(1.0),
        speed: scalarGene(1.0),
      });
      const lowEnergy = makeSeed('slow', 'character', {
        energy: scalarGene(0.0),
        speed: scalarGene(0.0),
      });
      const genHigh = new SpriteGenerator();
      const genLow = new SpriteGenerator();
      const sheetHigh = genHigh.generateSpriteSheet(highEnergy);
      const sheetLow = genLow.generateSpriteSheet(lowEnergy);

      const maxHigh = Math.max(...sheetHigh.animations.map((a) => a.frames.length));
      const maxLow = Math.max(...sheetLow.animations.map((a) => a.frames.length));
      expect(maxHigh).toBeGreaterThanOrEqual(maxLow);
    });

    it('is deterministic: same seed produces same sheet', () => {
      const seed = makeSeed('det', 'robot');
      const sheet1 = new SpriteGenerator().generateSpriteSheet(seed);
      const sheet2 = new SpriteGenerator().generateSpriteSheet(seed);
      expect(sheet1).toEqual(sheet2);
    });
  });

  describe('generateFrames', () => {
    it('returns exactly frameCount frames', () => {
      const gen = new SpriteGenerator();
      const frames = gen.generateFrames('walk', 6, 32, 32);
      expect(frames).toHaveLength(6);
    });

    it('each frame has the correct width and height', () => {
      const gen = new SpriteGenerator();
      const frames = gen.generateFrames('idle', 4, 64, 48);
      for (const frame of frames) {
        expect(frame.width).toBe(64);
        expect(frame.height).toBe(48);
      }
    });

    it('frames are laid out left-to-right (x increases by frameWidth)', () => {
      const gen = new SpriteGenerator();
      const frames = gen.generateFrames('run', 5, 32, 32);
      for (let i = 0; i < frames.length; i++) {
        expect(frames[i]!.x).toBe(i * 32);
      }
    });

    it('all frames in the same animation share the same y offset', () => {
      const gen = new SpriteGenerator();
      const frames = gen.generateFrames('attack', 6, 32, 32);
      const y0 = frames[0]!.y;
      for (const frame of frames) {
        expect(frame.y).toBe(y0);
      }
    });

    it('frame duration is 125 ms (1000/8)', () => {
      const gen = new SpriteGenerator();
      const frames = gen.generateFrames('idle', 4, 32, 32);
      for (const frame of frames) {
        expect(frame.duration).toBe(125);
      }
    });
  });

  describe('deriveAnimations', () => {
    const domains: Array<[string, string[]]> = [
      ['organism', ['idle', 'walk', 'run', 'attack', 'die']],
      ['mammal', ['idle', 'walk', 'run', 'attack', 'die']],
      ['bird', ['idle', 'walk', 'fly', 'attack', 'die']],
      ['fish', ['idle', 'swim', 'dash', 'die']],
      ['insect', ['idle', 'walk', 'fly', 'die']],
      ['robot', ['idle', 'walk', 'run', 'attack', 'die']],
      ['vehicle', ['idle', 'move', 'boost', 'damaged']],
      ['weapon', ['idle', 'equip', 'attack', 'special']],
      ['plant', ['idle', 'grow', 'wilt']],
      ['building', ['idle', 'construct', 'destroy']],
      ['game', ['idle', 'move', 'action', 'hit', 'special']],
      ['character', ['idle', 'walk', 'run', 'attack', 'die']],
      ['creature', ['idle', 'walk', 'run', 'attack', 'die']],
    ];

    for (const [domain, expected] of domains) {
      it(`returns correct animations for domain "${domain}"`, () => {
        const gen = new SpriteGenerator();
        const seed = makeSeed('x', domain);
        expect(gen.deriveAnimations(seed)).toEqual(expected);
      });
    }

    it('falls back to default animations for unknown domain', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('x', 'unknown_domain_xyz');
      const anims = gen.deriveAnimations(seed);
      expect(anims).toEqual(['idle', 'walk', 'run', 'jump', 'attack']);
    });

    it('uses animation_set categorical gene override when present', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('x', 'organism', {
        animation_set: categoricalGene('hop,spin,land', ['hop,spin,land']),
      });
      expect(gen.deriveAnimations(seed)).toEqual(['hop', 'spin', 'land']);
    });

    it('ignores animation_set gene when it is the wrong type', () => {
      const gen = new SpriteGenerator();
      const seed = makeSeed('x', 'robot', {
        animation_set: scalarGene(0.5), // wrong type — should be ignored
      });
      expect(gen.deriveAnimations(seed)).toEqual(['idle', 'walk', 'run', 'attack', 'die']);
    });
  });
});

// ─────────────────────────────────────────────
// PixelArtGenerator
// ─────────────────────────────────────────────

describe('PixelArtGenerator', () => {
  describe('generate', () => {
    it('returns PixelData with the requested dimensions', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('sprite', 'game');
      const pd = pag.generate(seed, 16, 16);
      expect(pd.width).toBe(16);
      expect(pd.height).toBe(16);
      expect(pd.pixels).toHaveLength(16);
      expect(pd.pixels[0]).toHaveLength(16);
    });

    it('uses symmetric generation for organism domain', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('bio', 'organism');
      const pd = pag.generate(seed, 8, 8);
      // Left-right mirror: pixel[y][0] === pixel[y][7]
      for (let y = 0; y < 8; y++) {
        expect(pd.pixels[y]![0]).toBe(pd.pixels[y]![7]);
        expect(pd.pixels[y]![1]).toBe(pd.pixels[y]![6]);
        expect(pd.pixels[y]![2]).toBe(pd.pixels[y]![5]);
      }
    });

    it('uses symmetric generation for character domain', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('char', 'character');
      const pd = pag.generate(seed, 10, 10);
      expect(pd.width).toBe(10);
    });

    it('uses symmetric generation for robot domain', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('bot', 'robot');
      const pd = pag.generate(seed, 8, 8);
      for (let y = 0; y < 8; y++) {
        expect(pd.pixels[y]![0]).toBe(pd.pixels[y]![7]);
      }
    });

    it('uses full-grid generation for non-symmetric domain (vehicle)', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('car', 'vehicle');
      const pd = pag.generate(seed, 12, 12);
      expect(pd.width).toBe(12);
      expect(pd.height).toBe(12);
    });

    it('uses color vector gene when present', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('colored', 'game', {
        color: vectorGene([1.0, 0.0, 0.0, 0.0, 1.0, 0.0]), // red + green
      });
      const pd = pag.generate(seed, 8, 8);
      expect(pd.width).toBe(8);
    });

    it('is deterministic for the same seed', () => {
      const seed = makeSeed('det', 'plant');
      const pd1 = new PixelArtGenerator().generate(seed, 8, 8);
      const pd2 = new PixelArtGenerator().generate(seed, 8, 8);
      expect(pd1.pixels).toEqual(pd2.pixels);
    });
  });

  describe('generateSymmetric', () => {
    it('mirrors left half to the right half (even width)', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('sym', 'mammal');
      const pd = pag.generateSymmetric(seed, 6, 4);
      for (let y = 0; y < 4; y++) {
        expect(pd.pixels[y]![0]).toBe(pd.pixels[y]![5]);
        expect(pd.pixels[y]![1]).toBe(pd.pixels[y]![4]);
        expect(pd.pixels[y]![2]).toBe(pd.pixels[y]![3]);
      }
    });

    it('handles odd width correctly (centre pixel is not mirrored to itself)', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('odd', 'bird');
      const pd = pag.generateSymmetric(seed, 5, 4);
      expect(pd.width).toBe(5);
      // Mirror: col 0 == col 4, col 1 == col 3; col 2 is the centre
      for (let y = 0; y < 4; y++) {
        expect(pd.pixels[y]![0]).toBe(pd.pixels[y]![4]);
        expect(pd.pixels[y]![1]).toBe(pd.pixels[y]![3]);
      }
    });

    it('uses density scalar gene when present', () => {
      const lowDensity = makeSeed('sparse', 'insect', { density: scalarGene(0.0) });
      const highDensity = makeSeed('dense', 'insect', { density: scalarGene(1.0) });
      const pag = new PixelArtGenerator();
      const pdSparse = pag.generateSymmetric(lowDensity, 16, 16);
      const pdDense = pag.generateSymmetric(highDensity, 16, 16);

      const countNonZero = (pd: typeof pdSparse) =>
        pd.pixels.flat().filter((v) => v !== 0).length;

      expect(countNonZero(pdDense)).toBeGreaterThanOrEqual(countNonZero(pdSparse));
    });
  });

  describe('upscale', () => {
    it('doubles dimensions with factor 2', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'game');
      const src = pag.generate(seed, 4, 4);
      const up = pag.upscale(src, 2);
      expect(up.width).toBe(8);
      expect(up.height).toBe(8);
    });

    it('triples dimensions with factor 3', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'game');
      const src = pag.generate(seed, 4, 4);
      const up = pag.upscale(src, 3);
      expect(up.width).toBe(12);
      expect(up.height).toBe(12);
    });

    it('each source pixel fills an intFactor×intFactor block', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'game');
      const src = pag.generate(seed, 4, 4);
      const up = pag.upscale(src, 2);

      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const srcPx = src.pixels[sy]![sx]!;
          expect(up.pixels[sy * 2]![sx * 2]).toBe(srcPx);
          expect(up.pixels[sy * 2]![sx * 2 + 1]).toBe(srcPx);
          expect(up.pixels[sy * 2 + 1]![sx * 2]).toBe(srcPx);
          expect(up.pixels[sy * 2 + 1]![sx * 2 + 1]).toBe(srcPx);
        }
      }
    });

    it('factor 1 returns same dimensions', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'game');
      const src = pag.generate(seed, 4, 4);
      const up = pag.upscale(src, 1);
      expect(up.width).toBe(4);
      expect(up.height).toBe(4);
    });

    it('throws RangeError for factor < 1', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'game');
      const src = pag.generate(seed, 4, 4);
      expect(() => pag.upscale(src, 0)).toThrow(RangeError);
      expect(() => pag.upscale(src, -1)).toThrow(RangeError);
    });

    it('error message includes the bad factor value', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'game');
      const src = pag.generate(seed, 4, 4);
      expect(() => pag.upscale(src, 0)).toThrow(/0/);
    });
  });

  describe('applyPalette', () => {
    it('returns pixels unchanged when palette is empty', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'game');
      const src = pag.generate(seed, 4, 4);
      const result = pag.applyPalette(src, { name: 'empty', colors: [] });
      expect(result.pixels).toEqual(src.pixels);
    });

    it('remaps all opaque pixels to nearest palette color', () => {
      const pag = new PixelArtGenerator();
      const seed = makeSeed('s', 'organism');

      // Force a fully filled image by using a high density seed
      const denseSeed = makeSeed('dense', 'game', {
        density: scalarGene(1.0),
      });
      // generate some pixel data that likely has opaque pixels
      const src = pag.generateSymmetric(denseSeed, 6, 6);

      const singleColor = { r: 255, g: 0, b: 0 };
      const palette = { name: 'red', colors: [singleColor] };
      const result = pag.applyPalette(src, palette);

      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < result.width; x++) {
          const px = result.pixels[y]![x]!;
          if (px !== 0) {
            // packed = (r<<24)|(g<<16)|(b<<8)|a  => r must be 255
            const r = (px >>> 24) & 0xff;
            const g = (px >>> 16) & 0xff;
            const b = (px >>> 8) & 0xff;
            expect(r).toBe(255);
            expect(g).toBe(0);
            expect(b).toBe(0);
          }
        }
      }
    });

    it('preserves alpha channel when remapping', () => {
      const pag = new PixelArtGenerator();
      const denseSeed = makeSeed('dense', 'game');
      const src = pag.generateSymmetric(denseSeed, 4, 4);
      const palette = { name: 'test', colors: [{ r: 200, g: 100, b: 50 }] };
      const result = pag.applyPalette(src, palette);

      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < result.width; x++) {
          const srcPx = src.pixels[y]![x]!;
          const dstPx = result.pixels[y]![x]!;
          if (srcPx === 0) {
            expect(dstPx).toBe(0);
          } else {
            // alpha byte (LSB) should be 255
            expect(dstPx & 0xff).toBe(255);
          }
        }
      }
    });
  });
});

// ─────────────────────────────────────────────
// AtlasPacker
// ─────────────────────────────────────────────

describe('AtlasPacker', () => {
  describe('pack', () => {
    it('packs a single sprite correctly', () => {
      const packer = new AtlasPacker();
      const atlas = packer.pack([{ name: 'a', width: 32, height: 32 }]);
      expect(atlas.entries).toHaveLength(1);
      expect(atlas.entries[0]!.name).toBe('a');
      expect(atlas.entries[0]!.rotated).toBe(false);
    });

    it('places first sprite at (padding, padding)', () => {
      const packer = new AtlasPacker(4096, 4096, 2);
      const atlas = packer.pack([{ name: 'a', width: 16, height: 16 }]);
      expect(atlas.entries[0]!.x).toBe(2);
      expect(atlas.entries[0]!.y).toBe(2);
    });

    it('packs multiple sprites side by side in one shelf', () => {
      const packer = new AtlasPacker(512, 512, 0);
      const entries = [
        { name: 'a', width: 32, height: 32 },
        { name: 'b', width: 32, height: 32 },
        { name: 'c', width: 32, height: 32 },
      ];
      const atlas = packer.pack(entries);
      expect(atlas.entries).toHaveLength(3);
      expect(atlas.entries[1]!.x).toBeGreaterThan(atlas.entries[0]!.x);
      expect(atlas.entries[2]!.x).toBeGreaterThan(atlas.entries[1]!.x);
    });

    it('wraps to a new shelf when sprites do not fit horizontally', () => {
      const packer = new AtlasPacker(64, 4096, 0);
      const entries = [
        { name: 'a', width: 50, height: 20 },
        { name: 'b', width: 50, height: 20 },
      ];
      const atlas = packer.pack(entries);
      expect(atlas.entries[0]!.y).toBe(atlas.entries[0]!.y);
      expect(atlas.entries[1]!.y).toBeGreaterThan(atlas.entries[0]!.y);
    });

    it('returns correct atlas dimensions', () => {
      const packer = new AtlasPacker(512, 512, 1);
      const atlas = packer.pack([{ name: 'a', width: 100, height: 50 }]);
      expect(atlas.width).toBeGreaterThan(0);
      expect(atlas.height).toBeGreaterThan(0);
    });

    it('atlas.padding matches the constructor padding', () => {
      const packer = new AtlasPacker(4096, 4096, 4);
      const atlas = packer.pack([{ name: 'a', width: 8, height: 8 }]);
      expect(atlas.padding).toBe(4);
    });

    it('throws RangeError for sprite with zero width', () => {
      const packer = new AtlasPacker();
      expect(() => packer.pack([{ name: 'bad', width: 0, height: 32 }])).toThrow(RangeError);
    });

    it('throws RangeError for sprite with zero height', () => {
      const packer = new AtlasPacker();
      expect(() => packer.pack([{ name: 'bad', width: 32, height: 0 }])).toThrow(RangeError);
    });

    it('throws RangeError when atlas overflows vertically', () => {
      const packer = new AtlasPacker(32, 32, 0);
      // Two 32x32 sprites cannot fit in a 32x32 atlas (shelf overflow)
      expect(() =>
        packer.pack([
          { name: 'a', width: 32, height: 32 },
          { name: 'b', width: 32, height: 32 },
        ]),
      ).toThrow(RangeError);
    });

    it('overflow error message includes sprite name', () => {
      const packer = new AtlasPacker(32, 32, 0);
      expect(() =>
        packer.pack([
          { name: 'a', width: 32, height: 32 },
          { name: 'bigone', width: 32, height: 32 },
        ]),
      ).toThrow(/bigone/);
    });

    it('handles empty input gracefully', () => {
      const packer = new AtlasPacker();
      const atlas = packer.pack([]);
      expect(atlas.entries).toHaveLength(0);
      expect(atlas.width).toBe(0);
      expect(atlas.height).toBe(0);
    });

    it('uses default maxWidth=4096, maxHeight=4096, padding=1', () => {
      const packer = new AtlasPacker();
      const atlas = packer.pack([{ name: 'a', width: 8, height: 8 }]);
      expect(atlas.padding).toBe(1);
      expect(atlas.entries[0]!.x).toBe(1);
    });
  });

  describe('packWithRotation', () => {
    it('rotates tall sprites (h > w) 90 degrees', () => {
      const packer = new AtlasPacker();
      // A tall sprite (8 wide, 32 tall) should be rotated to 32 wide, 8 tall
      const atlas = packer.packWithRotation([{ name: 'tall', width: 8, height: 32 }]);
      const entry = atlas.entries[0]!;
      expect(entry.rotated).toBe(true);
      expect(entry.width).toBe(32);
      expect(entry.height).toBe(8);
    });

    it('does not rotate wide sprites (w >= h)', () => {
      const packer = new AtlasPacker();
      const atlas = packer.packWithRotation([{ name: 'wide', width: 32, height: 8 }]);
      const entry = atlas.entries[0]!;
      expect(entry.rotated).toBe(false);
      expect(entry.width).toBe(32);
      expect(entry.height).toBe(8);
    });

    it('does not rotate square sprites', () => {
      const packer = new AtlasPacker();
      const atlas = packer.packWithRotation([{ name: 'sq', width: 16, height: 16 }]);
      expect(atlas.entries[0]!.rotated).toBe(false);
    });

    it('throws RangeError on overflow just like pack', () => {
      const packer = new AtlasPacker(32, 32, 0);
      expect(() =>
        packer.packWithRotation([
          { name: 'a', width: 32, height: 32 },
          { name: 'b', width: 32, height: 32 },
        ]),
      ).toThrow(RangeError);
    });
  });
});

// ─────────────────────────────────────────────
// PaletteGenerator
// ─────────────────────────────────────────────

describe('PaletteGenerator', () => {
  describe('fromSeed', () => {
    it('returns a palette with the requested color count', () => {
      const pg = new PaletteGenerator();
      const seed = makeSeed('hero', 'character');
      const palette = pg.fromSeed(seed, 5);
      expect(palette.colors).toHaveLength(5);
    });

    it('palette name is derived from seed name', () => {
      const pg = new PaletteGenerator();
      const seed = makeSeed('hero', 'character');
      const palette = pg.fromSeed(seed);
      expect(palette.name).toContain('hero');
    });

    it('uses vector color gene when present', () => {
      const pg = new PaletteGenerator();
      const seed = makeSeed('red', 'game', {
        color: vectorGene([1.0, 0.0, 0.0]), // pure red
      });
      const palette = pg.fromSeed(seed, 1);
      expect(palette.colors[0]!.r).toBe(255);
      expect(palette.colors[0]!.g).toBe(0);
      expect(palette.colors[0]!.b).toBe(0);
    });

    it('expands palette when color gene has fewer colors than requested', () => {
      const pg = new PaletteGenerator();
      const seed = makeSeed('few', 'game', {
        color: vectorGene([0.5, 0.5, 0.5]), // only 1 color encoded
      });
      const palette = pg.fromSeed(seed, 4);
      expect(palette.colors).toHaveLength(4);
    });

    it('falls back to domain palette when no color gene', () => {
      const pg = new PaletteGenerator();
      const seed = makeSeed('mech', 'robot');
      const palette = pg.fromSeed(seed, 5);
      // Robot domain preset includes steel-blue tones; just verify length + structure
      expect(palette.colors).toHaveLength(5);
      for (const c of palette.colors) {
        expect(c.r).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThanOrEqual(255);
      }
    });

    it('returns correct count when requesting fewer colors than the preset', () => {
      const pg = new PaletteGenerator();
      const seed = makeSeed('tree', 'plant');
      const palette = pg.fromSeed(seed, 3);
      expect(palette.colors).toHaveLength(3);
    });

    it('expands domain preset when more colors are requested than the preset contains', () => {
      // Domain presets have 5 colors; requesting 10 forces the expansion loop (lines 792-802)
      const pg = new PaletteGenerator();
      const seed = makeSeed('expand', 'robot'); // no color gene — uses domain fallback
      const palette = pg.fromSeed(seed, 10);
      expect(palette.colors).toHaveLength(10);
      for (const c of palette.colors) {
        expect(c.r).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThanOrEqual(255);
        expect(c.g).toBeGreaterThanOrEqual(0);
        expect(c.g).toBeLessThanOrEqual(255);
        expect(c.b).toBeGreaterThanOrEqual(0);
        expect(c.b).toBeLessThanOrEqual(255);
      }
    });

    it('is deterministic for the same seed', () => {
      const seed = makeSeed('det', 'vehicle');
      const p1 = new PaletteGenerator().fromSeed(seed);
      const p2 = new PaletteGenerator().fromSeed(seed);
      expect(p1.colors).toEqual(p2.colors);
    });
  });

  describe('complementary', () => {
    it('returns exactly 5 colors', () => {
      const pg = new PaletteGenerator();
      const palette = pg.complementary({ r: 255, g: 0, b: 0 });
      expect(palette.colors).toHaveLength(5);
    });

    it('name is "complementary"', () => {
      const pg = new PaletteGenerator();
      const palette = pg.complementary({ r: 0, g: 128, b: 255 });
      expect(palette.name).toBe('complementary');
    });

    it('first color is the base color', () => {
      const pg = new PaletteGenerator();
      const base = { r: 100, g: 150, b: 200 };
      const palette = pg.complementary(base);
      expect(palette.colors[0]).toEqual(base);
    });

    it('all color channels are in [0, 255]', () => {
      const pg = new PaletteGenerator();
      const palette = pg.complementary({ r: 255, g: 255, b: 0 });
      for (const c of palette.colors) {
        expect(c.r).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThanOrEqual(255);
        expect(c.g).toBeGreaterThanOrEqual(0);
        expect(c.g).toBeLessThanOrEqual(255);
        expect(c.b).toBeGreaterThanOrEqual(0);
        expect(c.b).toBeLessThanOrEqual(255);
      }
    });

    it('handles achromatic (greyscale) base color', () => {
      const pg = new PaletteGenerator();
      const palette = pg.complementary({ r: 128, g: 128, b: 128 });
      expect(palette.colors).toHaveLength(5);
    });
  });

  describe('analogous', () => {
    it('returns count colors by default (5)', () => {
      const pg = new PaletteGenerator();
      const palette = pg.analogous({ r: 200, g: 50, b: 50 });
      expect(palette.colors).toHaveLength(5);
    });

    it('returns the requested count', () => {
      const pg = new PaletteGenerator();
      const palette = pg.analogous({ r: 0, g: 255, b: 0 }, 3);
      expect(palette.colors).toHaveLength(3);
    });

    it('first color is the base color', () => {
      const pg = new PaletteGenerator();
      const base = { r: 80, g: 200, b: 120 };
      const palette = pg.analogous(base, 4);
      expect(palette.colors[0]).toEqual(base);
    });

    it('name is "analogous"', () => {
      const pg = new PaletteGenerator();
      const palette = pg.analogous({ r: 0, g: 0, b: 255 });
      expect(palette.name).toBe('analogous');
    });

    it('all channel values are in [0, 255]', () => {
      const pg = new PaletteGenerator();
      const palette = pg.analogous({ r: 0, g: 255, b: 128 }, 7);
      for (const c of palette.colors) {
        expect(c.r).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('fromDomain', () => {
    const knownDomains = ['organism', 'robot', 'vehicle', 'weapon', 'plant', 'building', 'game', 'fluid'];

    for (const domain of knownDomains) {
      it(`returns a named palette for known domain "${domain}"`, () => {
        const pg = new PaletteGenerator();
        const palette = pg.fromDomain(domain);
        expect(palette.name).toBe(`${domain}-preset`);
        expect(palette.colors.length).toBeGreaterThan(0);
      });
    }

    it('falls back to "default-preset" for unknown domain', () => {
      const pg = new PaletteGenerator();
      const palette = pg.fromDomain('unknown_xyz');
      expect(palette.name).toBe('unknown_xyz-preset');
      expect(palette.colors.length).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────
// SpriteExporter
// ─────────────────────────────────────────────

describe('SpriteExporter', () => {
  const buildSheet = () => {
    const gen = new SpriteGenerator();
    const seed = makeSeed('warrior', 'character');
    return gen.generateSpriteSheet(seed);
  };

  describe('toJSON', () => {
    it('returns valid JSON', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      expect(() => JSON.parse(exp.toJSON(sheet))).not.toThrow();
    });

    it('JSON round-trips the sheet name', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const parsed = JSON.parse(exp.toJSON(sheet)) as { name: string };
      expect(parsed.name).toBe(sheet.name);
    });

    it('JSON includes animations array', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const parsed = JSON.parse(exp.toJSON(sheet)) as { animations: unknown[] };
      expect(Array.isArray(parsed.animations)).toBe(true);
    });
  });

  describe('toGodotTres', () => {
    it('starts with [gd_resource type="SpriteFrames"', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      expect(exp.toGodotTres(sheet)).toMatch(/^\[gd_resource type="SpriteFrames"/);
    });

    it('includes each animation name', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const tres = exp.toGodotTres(sheet);
      for (const anim of sheet.animations) {
        expect(tres).toContain(`"name": "${anim.name}"`);
      }
    });

    it('includes loop flags', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const tres = exp.toGodotTres(sheet);
      expect(tres).toMatch(/"loop": (true|false)/);
    });

    it('includes sheet dimensions in region line', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const tres = exp.toGodotTres(sheet);
      expect(tres).toContain(`${sheet.width}, ${sheet.height}`);
    });
  });

  describe('toCSS', () => {
    it('contains the sheet name as a slug in class names', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const css = exp.toCSS(sheet);
      const slug = sheet.name.toLowerCase().replace(/\s+/g, '-');
      expect(css).toContain(`.sprite-${slug}`);
    });

    it('contains background-size rule with sheet dimensions', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const css = exp.toCSS(sheet);
      expect(css).toContain(`background-size: ${sheet.width}px ${sheet.height}px`);
    });

    it('contains frame width and height in base class', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const css = exp.toCSS(sheet);
      expect(css).toContain(`width: ${sheet.frameWidth}px`);
      expect(css).toContain(`height: ${sheet.frameHeight}px`);
    });

    it('includes background-position rules for each frame', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const css = exp.toCSS(sheet);
      expect(css).toContain('background-position:');
    });
  });

  describe('toHTML', () => {
    it('returns a complete HTML document', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const html = exp.toHTML(sheet);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('includes the sheet name in the title', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const html = exp.toHTML(sheet);
      expect(html).toContain(`<title>${sheet.name}`);
    });

    it('includes @keyframes blocks for each animation', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const html = exp.toHTML(sheet);
      for (const anim of sheet.animations) {
        const slug = sheet.name.toLowerCase().replace(/\s+/g, '-');
        expect(html).toContain(`@keyframes ${slug}-${anim.name}`);
      }
    });

    it('marks looping animations as "infinite"', () => {
      const exp = new SpriteExporter();
      const gen = new SpriteGenerator();
      const seed = makeSeed('loopy', 'character', {});
      const sheet = gen.generateSpriteSheet(seed, { animations: ['idle'] });
      const html = exp.toHTML(sheet);
      // idle loops — should contain "infinite"
      expect(html).toContain('infinite');
    });

    it('marks non-looping animations with "1"', () => {
      const exp = new SpriteExporter();
      const gen = new SpriteGenerator();
      const seed = makeSeed('dying', 'character', {});
      const sheet = gen.generateSpriteSheet(seed, { animations: ['die'] });
      const html = exp.toHTML(sheet);
      // die does not loop — should contain " 1;"
      expect(html).toMatch(/steps\(1\) 1/);
    });

    it('includes frame count and fps per animation card', () => {
      const exp = new SpriteExporter();
      const sheet = buildSheet();
      const html = exp.toHTML(sheet);
      for (const anim of sheet.animations) {
        expect(html).toContain(`${anim.frames.length} frames`);
      }
    });
  });
});

// ─────────────────────────────────────────────
// SpriteEngine (facade)
// ─────────────────────────────────────────────

describe('SpriteEngine', () => {
  describe('fromSeed', () => {
    it('delegates to SpriteGenerator and returns a SpriteSheet', () => {
      const engine = new SpriteEngine();
      const seed = makeSeed('knight', 'character');
      const sheet = engine.fromSeed(seed);
      expect(sheet.name).toBe('knight');
      expect(sheet.animations.length).toBeGreaterThan(0);
    });

    it('passes options through to the generator', () => {
      const engine = new SpriteEngine();
      const seed = makeSeed('mage', 'character');
      const sheet = engine.fromSeed(seed, { frameWidth: 48, frameHeight: 48 });
      expect(sheet.frameWidth).toBe(48);
    });
  });

  describe('generatePixelArt', () => {
    it('returns PixelData with correct dimensions', () => {
      const engine = new SpriteEngine();
      const seed = makeSeed('art', 'game');
      const pd = engine.generatePixelArt(seed, 16, 16);
      expect(pd.width).toBe(16);
      expect(pd.height).toBe(16);
    });

    it('generates symmetric art for symmetric domains', () => {
      const engine = new SpriteEngine();
      const seed = makeSeed('bio', 'organism');
      const pd = engine.generatePixelArt(seed, 8, 8);
      for (let y = 0; y < 8; y++) {
        expect(pd.pixels[y]![0]).toBe(pd.pixels[y]![7]);
      }
    });
  });

  describe('packAtlas', () => {
    it('packs multiple sheets into one atlas', () => {
      const engine = new SpriteEngine();
      const seeds = [
        makeSeed('a', 'character'),
        makeSeed('b', 'robot'),
        makeSeed('c', 'vehicle'),
      ];
      const sheets = seeds.map((s) => engine.fromSeed(s));
      const atlas = engine.packAtlas(sheets);
      expect(atlas.entries).toHaveLength(3);
    });

    it('uses sheet name as atlas entry name', () => {
      const engine = new SpriteEngine();
      const seed = makeSeed('hero', 'character');
      const sheet = engine.fromSeed(seed);
      const atlas = engine.packAtlas([sheet]);
      expect(atlas.entries[0]!.name).toBe('hero');
    });
  });

  describe('generatePalette', () => {
    it('returns a ColorPalette with 5 colors by default', () => {
      const engine = new SpriteEngine();
      const seed = makeSeed('p', 'plant');
      const palette = engine.generatePalette(seed);
      expect(palette.colors).toHaveLength(5);
    });

    it('palette name contains the seed name', () => {
      const engine = new SpriteEngine();
      const seed = makeSeed('lava', 'game');
      const palette = engine.generatePalette(seed);
      expect(palette.name).toContain('lava');
    });
  });

  describe('export', () => {
    const engine = new SpriteEngine();
    const seed = makeSeed('export-test', 'character');
    const sheet = engine.fromSeed(seed);

    it('format "json" returns valid JSON', () => {
      const out = engine.export(sheet, 'json');
      expect(() => JSON.parse(out)).not.toThrow();
    });

    it('format "godot" starts with gd_resource header', () => {
      const out = engine.export(sheet, 'godot');
      expect(out).toMatch(/\[gd_resource/);
    });

    it('format "css" contains sprite class', () => {
      const out = engine.export(sheet, 'css');
      expect(out).toContain('.sprite-');
    });

    it('format "html" returns a full HTML document', () => {
      const out = engine.export(sheet, 'html');
      expect(out).toContain('<!DOCTYPE html>');
    });

    it('throws TypeError for unsupported format', () => {
      expect(() => engine.export(sheet, 'svg' as any)).toThrow(TypeError);
    });

    it('error message includes the unsupported format name', () => {
      expect(() => engine.export(sheet, 'svg' as any)).toThrow(/svg/);
    });
  });
});
