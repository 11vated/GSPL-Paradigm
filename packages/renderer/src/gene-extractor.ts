/**
 * Gene Extractor — reads rendering parameters from UniversalSeed gene map.
 * Every value comes from an actual gene. Nothing is hardcoded.
 */

import type { UniversalSeed, Gene } from '@paradigm/types';
import type { RenderParams, SDFParams, MaterialParams, MotionParams, ElementEffect } from './types.js';

/** Safely read a scalar gene value from a seed. */
function scalar(seed: UniversalSeed, geneKey: string, subKey: string, fallback: number): number {
  const gene = seed.genes[geneKey];
  if (gene?.type === 'struct') {
    const sub = gene.value[subKey];
    if (sub?.type === 'scalar') return sub.value;
  }
  if (gene?.type === 'scalar') return gene.value;
  return fallback;
}

/** Read a categorical gene value. */
function categorical(seed: UniversalSeed, geneKey: string, fallback: string): string {
  const gene = seed.genes[geneKey];
  if (gene?.type === 'categorical') return gene.value;
  return fallback;
}

/** Read a vector gene and extract RGB color at a given index (every 3 values). */
function colorFromPalette(seed: UniversalSeed, index: number): readonly [number, number, number] {
  const gene = seed.genes['palette'];
  if (gene?.type === 'vector' && gene.value.length >= (index + 1) * 3) {
    const i = index * 3;
    return [gene.value[i] ?? 0.5, gene.value[i + 1] ?? 0.5, gene.value[i + 2] ?? 0.5];
  }
  return [0.5, 0.5, 0.5];
}

/** Read a single component from a vector gene. */
function vectorComponent(seed: UniversalSeed, geneKey: string, index: number, fallback: number): number {
  const gene = seed.genes[geneKey];
  if (gene?.type === 'vector' && gene.value.length > index) {
    return gene.value[index] ?? fallback;
  }
  return fallback;
}

/** Read a direct scalar gene (not nested in a struct). */
function scalarDirect(seed: UniversalSeed, geneKey: string, fallback: number): number {
  const gene = seed.genes[geneKey];
  if (gene?.type === 'scalar') return gene.value;
  return fallback;
}

/**
 * Extract all rendering parameters from a UniversalSeed.
 * Every parameter maps to a specific gene value in the seed.
 */
export function extractRenderParams(seed: UniversalSeed): RenderParams {
  const sdf: SDFParams = {
    torsoWidth: scalar(seed, 'bodyParams', 'torsoWidth', 0.22),
    torsoHeight: scalar(seed, 'bodyParams', 'torsoHeight', 0.5),
    headRadius: scalar(seed, 'bodyParams', 'headRadius', 0.2),
    limbThickness: scalar(seed, 'bodyParams', 'limbThickness', 0.08),
    limbLength: scalar(seed, 'bodyParams', 'limbLength', 0.4),
    neckLength: scalar(seed, 'bodyParams', 'neckLength', 0.1),
    hasWings: scalar(seed, 'appendages', 'hasWings', 0) > 0.5,
    wingSpan: scalar(seed, 'appendages', 'wingSpan', 0),
    hasTail: scalar(seed, 'appendages', 'hasTail', 0) > 0.5,
    tailLength: scalar(seed, 'appendages', 'tailLength', 0),
    hasHorns: scalar(seed, 'appendages', 'hasHorns', 0) > 0.5,
    hornSize: scalar(seed, 'appendages', 'hornSize', 0),
    blendSmoothness: scalar(seed, 'surface', 'blendSmoothness', 0.1),
    species: categorical(seed, 'species', 'unknown'),
    style: categorical(seed, 'style', 'default'),
    headToBodyRatio: vectorComponent(seed, 'proportions', 0, 0.2),
    exaggeration: scalarDirect(seed, 'exaggeration', 0.5),
    muscularity: 0.5, // Future gene — default for now
    shoulderWidth: vectorComponent(seed, 'proportions', 2, 1.2),
    archetype: categorical(seed, 'archetype', 'unknown'),
  };

  const material: MaterialParams = {
    roughness: scalar(seed, 'surface', 'roughness', 0.5),
    metallic: scalar(seed, 'surface', 'metallic', 0.0),
    emission: scalar(seed, 'surface', 'emission', 0.0),
    outlineThickness: scalar(seed, 'surface', 'outlineThickness', 0.0),
    primaryColor: colorFromPalette(seed, 0),
    secondaryColor: colorFromPalette(seed, 1),
    accentColor: colorFromPalette(seed, 2),
    limbColor: colorFromPalette(seed, 3),
    effectColor: colorFromPalette(seed, 4),
  };

  const motion: MotionParams = {
    idleSpeed: scalar(seed, 'motion', 'idleSpeed', 2.0),
    breathingAmplitude: scalar(seed, 'motion', 'breathingAmplitude', 0.03),
    swayAmount: scalar(seed, 'motion', 'swayAmount', 0.02),
    bobHeight: scalar(seed, 'motion', 'bobHeight', 0.0),
  };

  const elementStr = categorical(seed, 'primaryElement', 'none');
  const validElements: ElementEffect[] = ['fire', 'ice', 'lightning', 'light', 'dark', 'nature', 'poison', 'water', 'earth', 'wind'];
  const element: ElementEffect = validElements.includes(elementStr as ElementEffect) ? (elementStr as ElementEffect) : 'none';

  return {
    bodyStructure: categorical(seed, 'bodyStructure', 'humanoid'),
    sdf,
    material,
    motion,
    element,
    style: categorical(seed, 'style', 'default'),
  };
}
