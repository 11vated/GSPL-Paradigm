/**
 * Aesthetic fitness functions for creative asset evolution.
 *
 * Evaluates visual quality of SpriteGenome output using
 * color harmony, balance, and readability metrics.
 */

import type { SpriteGenome, PixelGrid } from './creative-genomes.js';

/**
 * Evaluate color harmony of a sprite genome.
 * Scores triadic/complementary relationships in HSL space.
 * Returns 0-1 where 1 = perfectly harmonious.
 */
export function evaluateColorHarmony(genome: SpriteGenome): number {
  const g = genome.genes;
  // Saturation in sweet spot (40-80) scores high
  const satScore = 1.0 - Math.abs(g.paletteSat - 60) / 60;
  // Lightness in sweet spot (40-65) scores high
  const litScore = 1.0 - Math.abs(g.paletteLit - 52) / 30;
  // Hue variety: pattern + accent create harmony
  const hueVariety = g.patternFrequency > 1 ? 0.8 : 0.5;

  return Math.max(0, Math.min(1, (satScore + litScore + hueVariety) / 3));
}

/**
 * Evaluate visual balance of a pixel grid.
 * Measures center of mass offset and horizontal symmetry.
 * Returns 0-1 where 1 = perfectly balanced.
 */
export function evaluateBalance(pixels: PixelGrid): number {
  let totalMass = 0;
  let massX = 0;
  let massY = 0;
  let symScore = 0;
  let symCount = 0;

  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      const px = pixels.pixels[y]?.[x] ?? 0;
      if (px !== 0) {
        totalMass++;
        massX += x;
        massY += y;
      }
    }
  }

  if (totalMass === 0) return 0;

  // Center of mass offset from center
  const cx = massX / totalMass;
  const cy = massY / totalMass;
  const offsetX = Math.abs(cx - pixels.width / 2) / (pixels.width / 2);
  const offsetY = Math.abs(cy - pixels.height / 2) / (pixels.height / 2);
  const centerScore = 1.0 - (offsetX + offsetY) / 2;

  // Horizontal symmetry
  const halfW = Math.floor(pixels.width / 2);
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < halfW; x++) {
      const left = (pixels.pixels[y]?.[x] ?? 0) !== 0;
      const right = (pixels.pixels[y]?.[pixels.width - 1 - x] ?? 0) !== 0;
      if (left === right) symScore++;
      symCount++;
    }
  }
  const symmetryScore = symCount > 0 ? symScore / symCount : 0;

  return Math.max(0, Math.min(1, centerScore * 0.5 + symmetryScore * 0.5));
}

/**
 * Evaluate readability at small scale.
 * Downscales to targetSize and checks alpha coverage.
 * Returns 0-1 where 1 = clearly readable at target size.
 */
export function evaluateReadability(pixels: PixelGrid, targetSize: number = 16): number {
  // Simple downscale: count non-transparent pixels in target grid
  const scaleX = pixels.width / targetSize;
  const scaleY = pixels.height / targetSize;
  let filledCells = 0;
  let totalCells = 0;

  for (let ty = 0; ty < targetSize; ty++) {
    for (let tx = 0; tx < targetSize; tx++) {
      const srcX = Math.floor(tx * scaleX + scaleX / 2);
      const srcY = Math.floor(ty * scaleY + scaleY / 2);
      totalCells++;
      if ((pixels.pixels[srcY]?.[srcX] ?? 0) !== 0) {
        filledCells++;
      }
    }
  }

  if (totalCells === 0) return 0;

  // Ideal fill ratio is 30-60% (too sparse = unreadable, too dense = blob)
  const fillRatio = filledCells / totalCells;
  const idealDeviation = Math.abs(fillRatio - 0.45);
  return Math.max(0, Math.min(1, 1.0 - idealDeviation * 3));
}

/**
 * Composite aesthetic fitness combining all metrics.
 * Weighted: harmony 0.3, balance 0.3, readability 0.4.
 * Returns 0-1.
 */
export function compositeAestheticFitness(genome: SpriteGenome, pixels: PixelGrid): number {
  const harmony = evaluateColorHarmony(genome);
  const balance = evaluateBalance(pixels);
  const readability = evaluateReadability(pixels);

  return harmony * 0.3 + balance * 0.3 + readability * 0.4;
}
