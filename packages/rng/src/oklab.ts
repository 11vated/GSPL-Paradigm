/**
 * OKLab Color Science — Perceptually uniform color operations.
 *
 * Ported from Sprite Forge's pixel/color_science.py with exact Bjorn Ottosson
 * (2020) M1/M2 conversion matrices. OKLab is a perceptually uniform color space
 * where equal numerical distances correspond to equal perceived color differences,
 * making it ideal for palette generation, color interpolation, and seed-driven
 * color derivation.
 *
 * Zero external dependencies. All operations are deterministic.
 *
 * @packageDocumentation
 */

import { DeterministicRNG } from './index.js';

// ─────────────────────────────────────────────
// OKLab Types
// ─────────────────────────────────────────────

/** OKLab color: L (lightness 0–1), a (green–red ~-0.5–0.5), b (blue–yellow ~-0.5–0.5). */
export interface OkLabColor {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

/** sRGB color with channels in [0, 1] range. */
export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** OKLCh color: L (lightness), C (chroma), h (hue in degrees 0–360). */
export interface OkLchColor {
  readonly L: number;
  readonly C: number;
  readonly h: number;
}

// ─────────────────────────────────────────────
// Exact conversion matrices (Bjorn Ottosson, 2020)
// ─────────────────────────────────────────────

// M1: Linear sRGB → LMS (cone response)
// Stored as flat row-major [row0_col0, row0_col1, row0_col2, row1_col0, ...]
const M1 = [
  0.4122214708, 0.5363325363, 0.0514459929,
  0.2119034982, 0.6806995451, 0.1073969566,
  0.0883024619, 0.2817188376, 0.6299787005,
] as const;

// M2: LMS^(1/3) → OKLab
const M2 = [
  0.2104542553,  0.7936177850, -0.0040720468,
  1.9779984951, -2.4285922050,  0.4505937099,
  0.0259040371,  0.7827717662, -0.8086757660,
] as const;

// M1 inverse: Linear sRGB ← LMS (precomputed for accuracy)
const M1_INV = [
   4.0767416621, -3.3077115913,  0.2309699292,
  -1.2684380046,  2.6097574011, -0.3413193965,
  -0.0041960863, -0.7034186147,  1.7076147010,
] as const;

// M2 inverse: LMS^(1/3) ← OKLab (precomputed for accuracy)
const M2_INV = [
  1.0000000000,  0.3963377774,  0.2158037573,
  1.0000000000, -0.1055613458, -0.0638541728,
  1.0000000000, -0.0894841775, -1.2914855480,
] as const;

// ─────────────────────────────────────────────
// Gamma transfer functions
// ─────────────────────────────────────────────

/** Convert sRGB channel [0,1] to linear RGB using exact gamma transfer. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Convert linear RGB channel [0,1] to sRGB using exact inverse gamma. */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1.0 / 2.4) - 0.055;
}

/** 3x3 matrix-vector multiply (row-major flat matrix). */
function mat3Mul(m: readonly number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z,
    m[3]! * x + m[4]! * y + m[5]! * z,
    m[6]! * x + m[7]! * y + m[8]! * z,
  ];
}

// ─────────────────────────────────────────────
// Conversion functions
// ─────────────────────────────────────────────

/**
 * Convert sRGB [0,1] to OKLab.
 *
 * @param color - sRGB color with r, g, b in [0, 1].
 * @returns OKLab color with L in [0, 1], a and b typically in [-0.5, 0.5].
 */
export function srgbToOklab(color: SrgbColor): OkLabColor {
  // sRGB → Linear RGB
  const lr = srgbToLinear(color.r);
  const lg = srgbToLinear(color.g);
  const lb = srgbToLinear(color.b);

  // Linear RGB → LMS
  const [l, m, s] = mat3Mul(M1, lr, lg, lb);

  // LMS → LMS^(1/3) (cube root nonlinearity)
  const lc = Math.cbrt(l);
  const mc = Math.cbrt(m);
  const sc = Math.cbrt(s);

  // LMS^(1/3) → OKLab
  const [L, a, b] = mat3Mul(M2, lc, mc, sc);

  return { L, a, b };
}

/**
 * Convert OKLab to sRGB [0,1].
 *
 * @param color - OKLab color.
 * @returns sRGB color with channels clamped to [0, 1].
 */
export function oklabToSrgb(color: OkLabColor): SrgbColor {
  // OKLab → LMS^(1/3)
  const [lc, mc, sc] = mat3Mul(M2_INV, color.L, color.a, color.b);

  // LMS^(1/3) → LMS (cube)
  const l = lc * lc * lc;
  const m = mc * mc * mc;
  const s = sc * sc * sc;

  // LMS → Linear RGB
  const [lr, lg, lb] = mat3Mul(M1_INV, l, m, s);

  // Linear RGB → sRGB, clamped
  return {
    r: Math.max(0, Math.min(1, linearToSrgb(lr))),
    g: Math.max(0, Math.min(1, linearToSrgb(lg))),
    b: Math.max(0, Math.min(1, linearToSrgb(lb))),
  };
}

/**
 * Convert sRGB to OKLCh (cylindrical OKLab).
 *
 * @param color - sRGB color with r, g, b in [0, 1].
 * @returns OKLCh color with L in [0,1], C >= 0, h in [0, 360).
 */
export function srgbToOklch(color: SrgbColor): OkLchColor {
  const lab = srgbToOklab(color);
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

/**
 * Convert OKLCh to sRGB.
 *
 * @param color - OKLCh color.
 * @returns sRGB color with channels clamped to [0, 1].
 */
export function oklchToSrgb(color: OkLchColor): SrgbColor {
  const hRad = color.h * (Math.PI / 180);
  const lab: OkLabColor = {
    L: color.L,
    a: color.C * Math.cos(hRad),
    b: color.C * Math.sin(hRad),
  };
  return oklabToSrgb(lab);
}

// ─────────────────────────────────────────────
// Color operations in OKLab space
// ─────────────────────────────────────────────

/**
 * Perceptually uniform linear interpolation between two colors in OKLab space.
 *
 * @param a - Start color (sRGB).
 * @param b - End color (sRGB).
 * @param t - Interpolation factor [0, 1].
 * @returns Interpolated sRGB color.
 */
export function oklabLerp(a: SrgbColor, b: SrgbColor, t: number): SrgbColor {
  const labA = srgbToOklab(a);
  const labB = srgbToOklab(b);
  return oklabToSrgb({
    L: labA.L + (labB.L - labA.L) * t,
    a: labA.a + (labB.a - labA.a) * t,
    b: labA.b + (labB.b - labA.b) * t,
  });
}

/**
 * Perceptual color distance in OKLab space (Euclidean).
 * Values < 0.02 are generally imperceptible.
 *
 * @param a - First color (sRGB).
 * @param b - Second color (sRGB).
 * @returns Distance value (0 = identical, higher = more different).
 */
export function oklabDistance(a: SrgbColor, b: SrgbColor): number {
  const labA = srgbToOklab(a);
  const labB = srgbToOklab(b);
  const dL = labA.L - labB.L;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ─────────────────────────────────────────────
// Palette generation
// ─────────────────────────────────────────────

/**
 * Generate a perceptually uniform color palette from a seed string.
 *
 * Uses K-means++ initialization in OKLab space to produce maximally
 * distinct colors. The palette is deterministic for a given seed.
 *
 * @param seed - Seed string for deterministic RNG.
 * @param count - Number of colors to generate (2–32).
 * @param options - Optional lightness and chroma constraints.
 * @returns Array of sRGB colors.
 */
export function generatePalette(
  seed: string,
  count: number,
  options?: {
    readonly minLightness?: number;
    readonly maxLightness?: number;
    readonly minChroma?: number;
    readonly maxChroma?: number;
  },
): SrgbColor[] {
  const rng = new DeterministicRNG(seed);
  const clampedCount = Math.max(2, Math.min(32, count));

  const minL = options?.minLightness ?? 0.3;
  const maxL = options?.maxLightness ?? 0.85;
  const minC = options?.minChroma ?? 0.05;
  const maxC = options?.maxChroma ?? 0.15;

  // Generate candidate colors in OKLCh space (cylindrical OKLab)
  const candidates: OkLabColor[] = [];
  for (let i = 0; i < clampedCount * 20; i++) {
    const L = minL + rng.next() * (maxL - minL);
    const C = minC + rng.next() * (maxC - minC);
    const h = rng.next() * 360;
    const hRad = h * (Math.PI / 180);
    candidates.push({
      L,
      a: C * Math.cos(hRad),
      b: C * Math.sin(hRad),
    });
  }

  // K-means++ initialization: pick first center randomly, then pick
  // subsequent centers proportional to squared distance from nearest center
  const centers: OkLabColor[] = [];
  const firstIdx = rng.nextInt(0, candidates.length);
  centers.push(candidates[firstIdx]!);

  for (let k = 1; k < clampedCount; k++) {
    const distances = candidates.map((c) => {
      let minDist = Infinity;
      for (const center of centers) {
        const dL = c.L - center.L;
        const da = c.a - center.a;
        const db = c.b - center.b;
        const dist = dL * dL + da * da + db * db;
        if (dist < minDist) minDist = dist;
      }
      return minDist;
    });

    const totalDist = distances.reduce((sum, d) => sum + d, 0);
    if (totalDist <= 0) {
      // All remaining candidates are duplicates of existing centers
      centers.push(candidates[rng.nextInt(0, candidates.length)]!);
      continue;
    }

    let r = rng.next() * totalDist;
    let chosen = 0;
    for (let i = 0; i < distances.length; i++) {
      r -= distances[i]!;
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centers.push(candidates[chosen]!);
  }

  // Run a few K-means iterations to refine
  const assignments = new Int32Array(candidates.length);
  for (let iter = 0; iter < 10; iter++) {
    // Assign each candidate to nearest center
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      let minDist = Infinity;
      let bestCenter = 0;
      for (let k = 0; k < centers.length; k++) {
        const center = centers[k]!;
        const dL = c.L - center.L;
        const da = c.a - center.a;
        const db = c.b - center.b;
        const dist = dL * dL + da * da + db * db;
        if (dist < minDist) {
          minDist = dist;
          bestCenter = k;
        }
      }
      assignments[i] = bestCenter;
    }

    // Update centers to mean of assigned candidates
    for (let k = 0; k < centers.length; k++) {
      let sumL = 0, sumA = 0, sumB = 0, count = 0;
      for (let i = 0; i < candidates.length; i++) {
        if (assignments[i] === k) {
          const c = candidates[i]!;
          sumL += c.L;
          sumA += c.a;
          sumB += c.b;
          count++;
        }
      }
      if (count > 0) {
        centers[k] = { L: sumL / count, a: sumA / count, b: sumB / count };
      }
    }
  }

  // Sort centers by lightness for consistent ordering
  centers.sort((a, b) => a.L - b.L);

  // Convert centers to sRGB
  return centers.map(oklabToSrgb);
}

/**
 * Generate a hue-shifted color ramp (light to dark) in OKLab space.
 * Mimics natural lighting where shadows shift in hue.
 *
 * @param baseColor - Base sRGB color for the ramp.
 * @param steps - Number of ramp steps (3–16).
 * @param hueShift - Hue rotation per step in degrees (default: 15).
 * @returns Array of sRGB colors from light to dark.
 */
export function generateHueShiftedRamp(
  baseColor: SrgbColor,
  steps: number,
  hueShift: number = 15,
): SrgbColor[] {
  const clampedSteps = Math.max(3, Math.min(16, steps));
  const lch = srgbToOklch(baseColor);
  const ramp: SrgbColor[] = [];

  for (let i = 0; i < clampedSteps; i++) {
    const t = i / (clampedSteps - 1);
    // Lightness: from bright (0.9) to dark (0.2)
    const L = 0.9 - t * 0.7;
    // Chroma: peaks in midtones, lower at extremes
    const chromaScale = 1.0 - Math.abs(t - 0.4) * 1.5;
    const C = lch.C * Math.max(0.3, chromaScale);
    // Hue: shift towards warm (higher h) in shadows
    const h = (lch.h + t * hueShift) % 360;

    ramp.push(oklchToSrgb({ L, C, h }));
  }

  return ramp;
}

// ─────────────────────────────────────────────
// Utility: sRGB hex conversion
// ─────────────────────────────────────────────

/** Convert sRGB [0,1] to hex string (e.g., '#ff8040'). */
export function srgbToHex(color: SrgbColor): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Parse hex string to sRGB [0,1]. Supports '#rgb' and '#rrggbb'. */
export function hexToSrgb(hex: string): SrgbColor {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16) / 255,
      g: parseInt(h[1]! + h[1]!, 16) / 255,
      b: parseInt(h[2]! + h[2]!, 16) / 255,
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
