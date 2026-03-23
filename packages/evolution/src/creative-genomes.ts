/**
 * Creative Asset Genomes — evolvable visual and animation genomes.
 *
 * SpriteGenome has 12 evolvable genes that produce actual pixel output
 * via renderToGrid(). AnimationGenome has 10 genes controlling motion.
 * Both support mutation and crossover for evolutionary visual design.
 *
 * @packageDocumentation
 */

import { DeterministicRNG } from '@paradigm/rng';

// ═══════════════════════════════════════════════════════════════════
// Pixel Grid — minimal PixelData compatible with @paradigm/sprites
// ═══════════════════════════════════════════════════════════════════

/** Pixel grid where pixels[y][x] = packed RGBA uint32. */
export interface PixelGrid {
  readonly width: number;
  readonly height: number;
  readonly pixels: number[][];
}

function packRGBA(r: number, g: number, b: number, a: number): number {
  return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// ═══════════════════════════════════════════════════════════════════
// SpriteGenome — 12 evolvable visual genes
// ═══════════════════════════════════════════════════════════════════

export interface SpriteGenes {
  paletteHue: number;        // 0-360
  paletteSat: number;        // 0-100
  paletteLit: number;        // 30-80
  bodyShapeIndex: number;    // 0-5 (circle, oval, diamond, triangle, hexagon, star)
  symmetry: number;          // 0=none, 0.5=horizontal, 1=bilateral
  detailLevel: number;       // 0-1
  outlineWeight: number;     // 0.5-3
  fillDensity: number;       // 0.3-1
  aspectRatio: number;       // 0.5-2
  cornerRoundness: number;   // 0-1
  patternFrequency: number;  // 0-10
  glowAmount: number;        // 0-1
}

const GENE_RANGES: Record<keyof SpriteGenes, [number, number]> = {
  paletteHue: [0, 360],
  paletteSat: [0, 100],
  paletteLit: [30, 80],
  bodyShapeIndex: [0, 5.99],
  symmetry: [0, 1],
  detailLevel: [0, 1],
  outlineWeight: [0.5, 3],
  fillDensity: [0.3, 1],
  aspectRatio: [0.5, 2],
  cornerRoundness: [0, 1],
  patternFrequency: [0, 10],
  glowAmount: [0, 1],
};

export class SpriteGenome {
  readonly genes: SpriteGenes;

  constructor(genes: SpriteGenes) {
    this.genes = genes;
  }

  /** Create a random genome. */
  static random(rng: DeterministicRNG): SpriteGenome {
    const genes: SpriteGenes = {} as SpriteGenes;
    for (const [key, [min, max]] of Object.entries(GENE_RANGES) as Array<[keyof SpriteGenes, [number, number]]>) {
      (genes as unknown as Record<string, number>)[key] = min + rng.next() * (max - min);
    }
    return new SpriteGenome(genes);
  }

  /** Mutate with Gaussian perturbation per gene. */
  mutate(intensity: number, rng: DeterministicRNG): SpriteGenome {
    const newGenes = { ...this.genes };
    for (const [key, [min, max]] of Object.entries(GENE_RANGES) as Array<[keyof SpriteGenes, [number, number]]>) {
      const range = max - min;
      const perturbation = rng.gaussian() * intensity * range;
      (newGenes as unknown as Record<string, number>)[key] = Math.max(min, Math.min(max, newGenes[key] + perturbation));
    }
    return new SpriteGenome(newGenes);
  }

  /** Blend crossover with another genome. */
  crossover(other: SpriteGenome, dominance: number, rng: DeterministicRNG): SpriteGenome {
    const newGenes: SpriteGenes = {} as SpriteGenes;
    for (const key of Object.keys(GENE_RANGES) as Array<keyof SpriteGenes>) {
      (newGenes as unknown as Record<string, number>)[key] = this.genes[key] * dominance + other.genes[key] * (1 - dominance);
    }
    return new SpriteGenome(newGenes);
  }

  /**
   * Render this genome to a pixel grid.
   * Produces actual visual output from gene values.
   */
  renderToGrid(width: number, height: number): PixelGrid {
    const g = this.genes;
    const pixels: number[][] = [];

    // Derive colors from palette genes
    const [pr, pg, pb] = hslToRgb(g.paletteHue, g.paletteSat, g.paletteLit);
    const [sr, sg, sb] = hslToRgb((g.paletteHue + 120) % 360, g.paletteSat * 0.7, g.paletteLit + 10);
    const bodyColor = packRGBA(pr, pg, pb, 255);
    const accentColor = packRGBA(sr, sg, sb, 255);
    const outlineColor = packRGBA(30, 30, 40, 255);
    const transparent = 0;

    const cx = width / 2;
    const cy = height / 2;
    const rx = (width / 2 - 2) * (g.aspectRatio > 1 ? 1 : g.aspectRatio);
    const ry = (height / 2 - 2) * (g.aspectRatio > 1 ? 1 / g.aspectRatio : 1);
    const shapeIdx = Math.floor(g.bodyShapeIndex) % 6;

    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        // Normalize coordinates to [-1, 1]
        let nx = (x - cx) / Math.max(1, rx);
        let ny = (y - cy) / Math.max(1, ry);

        // Apply symmetry
        if (g.symmetry > 0.5) nx = Math.abs(nx);

        // Shape test
        let inside = false;
        const dist = Math.sqrt(nx * nx + ny * ny);

        switch (shapeIdx) {
          case 0: // Circle
            inside = dist <= 1.0;
            break;
          case 1: // Oval (already handled by aspect ratio)
            inside = dist <= 1.0;
            break;
          case 2: // Diamond
            inside = Math.abs(nx) + Math.abs(ny) <= 1.0;
            break;
          case 3: // Triangle
            inside = ny >= -0.8 && ny <= 0.8 - Math.abs(nx) * 1.6;
            break;
          case 4: // Hexagon
            inside = Math.abs(nx) <= 0.87 && Math.abs(ny) <= 1.0 && Math.abs(nx) + Math.abs(ny) * 0.58 <= 1.0;
            break;
          case 5: // Star
            { const angle = Math.atan2(ny, nx);
              const r5 = 0.5 + 0.5 * Math.cos(angle * 5);
              inside = dist <= r5; }
            break;
        }

        if (!inside) {
          row.push(transparent);
          continue;
        }

        // Outline test
        const edgeDist = 1.0 - dist;
        const outlineThreshold = g.outlineWeight / Math.max(rx, ry);
        if (edgeDist < outlineThreshold && edgeDist >= 0) {
          row.push(outlineColor);
          continue;
        }

        // Pattern overlay
        let useAccent = false;
        if (g.patternFrequency > 0.5) {
          const patternVal = Math.sin(x * g.patternFrequency * 0.5) * Math.sin(y * g.patternFrequency * 0.5);
          useAccent = patternVal > (1 - g.detailLevel) * 0.5;
        }

        // Fill
        if (g.fillDensity < 1.0 && ((x + y) % Math.round(2 / g.fillDensity)) !== 0) {
          row.push(transparent);
        } else {
          row.push(useAccent ? accentColor : bodyColor);
        }
      }
      pixels.push(row);
    }

    return { width, height, pixels };
  }
}

// ═══════════════════════════════════════════════════════════════════
// AnimationGenome — 10 evolvable motion genes
// ═══════════════════════════════════════════════════════════════════

export interface AnimationGenes {
  frameCount: number;     // 2-12
  duration: number;       // 0.2-3.0 seconds
  easingType: number;     // 0-5 (linear, easeIn, easeOut, easeInOut, bounce, elastic)
  amplitude: number;      // 0-1
  frequency: number;      // 0.5-5
  phase: number;          // 0-6.28 (radians)
  loopMode: number;       // 0=none, 0.5=loop, 1=pingpong
  trailLength: number;    // 0-5
  squashFactor: number;   // 0-0.5
  anticipation: number;   // 0-0.3
}

const ANIM_GENE_RANGES: Record<keyof AnimationGenes, [number, number]> = {
  frameCount: [2, 12],
  duration: [0.2, 3.0],
  easingType: [0, 5.99],
  amplitude: [0, 1],
  frequency: [0.5, 5],
  phase: [0, 6.28],
  loopMode: [0, 1],
  trailLength: [0, 5],
  squashFactor: [0, 0.5],
  anticipation: [0, 0.3],
};

export class AnimationGenome {
  readonly genes: AnimationGenes;

  constructor(genes: AnimationGenes) {
    this.genes = genes;
  }

  static random(rng: DeterministicRNG): AnimationGenome {
    const genes: AnimationGenes = {} as AnimationGenes;
    for (const [key, [min, max]] of Object.entries(ANIM_GENE_RANGES) as Array<[keyof AnimationGenes, [number, number]]>) {
      (genes as unknown as Record<string, number>)[key] = min + rng.next() * (max - min);
    }
    return new AnimationGenome(genes);
  }

  mutate(intensity: number, rng: DeterministicRNG): AnimationGenome {
    const newGenes = { ...this.genes };
    for (const [key, [min, max]] of Object.entries(ANIM_GENE_RANGES) as Array<[keyof AnimationGenes, [number, number]]>) {
      const range = max - min;
      const perturbation = rng.gaussian() * intensity * range;
      (newGenes as unknown as Record<string, number>)[key] = Math.max(min, Math.min(max, newGenes[key] + perturbation));
    }
    return new AnimationGenome(newGenes);
  }

  crossover(other: AnimationGenome, dominance: number): AnimationGenome {
    const newGenes: AnimationGenes = {} as AnimationGenes;
    for (const key of Object.keys(ANIM_GENE_RANGES) as Array<keyof AnimationGenes>) {
      (newGenes as unknown as Record<string, number>)[key] = this.genes[key] * dominance + other.genes[key] * (1 - dominance);
    }
    return new AnimationGenome(newGenes);
  }
}
