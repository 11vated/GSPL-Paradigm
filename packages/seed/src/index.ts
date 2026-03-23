/**
 * @paradigm/seed — Immutable seed CRUD and all genetic operators.
 *
 * The UniversalSeed is the core data structure of the GSPL Paradigm system.
 * Every entity — organisms, vehicles, shaders, security profiles, narratives —
 * is represented as a UniversalSeed. All mutation and breeding operations return
 * new seed instances; the design is fully immutable.
 *
 * @packageDocumentation
 */

import type {
  UniversalSeed,
  GeneMap,
  Gene,
  ScalarGene,
  CategoricalGene,
  VectorGene,
  ExpressionGene,
  StructGene,
  ArrayGene,
  GraphGene,
  TensorGene,
  TimeSeriesGene,
  SeedDomain,
  FitnessVector,
  SeedMetadata,
  ActivationState,
  DisplayHints,
  SeedRelation,
  CrossoverStrategy,
} from '@paradigm/types';

import {
  DeterministicRNG,
  canonicalize,
  computeHashAsync,
  computeQuickHash,
  type SimulationClock,
  DefaultSimulationClock,
} from '@paradigm/rng';

// Re-export CrossoverStrategy for convenience
export type { CrossoverStrategy } from '@paradigm/types';

// ─────────────────────────────────────────────
// Seed Hashing
// ─────────────────────────────────────────────

/**
 * Compute content-addressable hash for a seed.
 * Hashes only invariant fields ($gst, $domain, $name, genes) so that
 * fitness/metadata updates don't change the seed's identity.
 */
export async function computeSeedHash(seed: UniversalSeed): Promise<string> {
  const hashData = {
    $gst: seed.$gst,
    $domain: seed.$domain,
    $name: seed.$name,
    genes: seed.genes,
  };
  return computeHashAsync(canonicalize(hashData));
}

/**
 * Compute a fast synchronous hash for a seed (FNV-1a, 8 hex chars).
 * Not cryptographic — suitable for quick identity checks and hash maps.
 */
export function computeSeedQuickHash(seed: UniversalSeed): string {
  return computeQuickHash({
    $gst: seed.$gst,
    $domain: seed.$domain,
    $name: seed.$name,
    genes: seed.genes,
  });
}

// ─────────────────────────────────────────────
// Seed CRUD
// ─────────────────────────────────────────────

/**
 * Creates a new seed with computed hash and initialized lineage.
 * Starts at generation 0, no parents, full energy, alive and active.
 */
export function createSeed<T extends GeneMap = GeneMap>(
  name: string,
  domain: SeedDomain,
  genes: T,
  rng: DeterministicRNG,
  clock?: SimulationClock,
): UniversalSeed<T> {
  const time = (clock ?? new DefaultSimulationClock()).now();
  const seed: UniversalSeed<T> = {
    $gst: '4.0',
    $domain: domain,
    $name: name,
    $hash: '',
    $lineage: {
      generation: 0,
      parents: [],
      timestamp: time,
    },
    genes,
    $metadata: {
      created: time,
    },
    $activation: {
      alive: true,
      active: true,
      energy: 100,
      age: 0,
    },
    $display: autoDisplayHints(domain, genes),
  };

  seed.$hash = computeSeedQuickHash(seed);
  return seed;
}

/**
 * Deep clone a seed. The clone is a fully independent object.
 * Uses structuredClone for proper handling of typed arrays and Maps.
 */
export function cloneSeed<T extends GeneMap = GeneMap>(seed: UniversalSeed<T>): UniversalSeed<T> {
  return structuredClone(seed);
}

/**
 * Mutates a seed to produce a new variant with updated lineage.
 * Applies stochastic mutations at the given intensity. Original is not modified.
 */
export function mutateSeed<T extends GeneMap = GeneMap>(
  seed: UniversalSeed<T>,
  intensity: number,
  rng: DeterministicRNG,
  clock?: SimulationClock,
): UniversalSeed<T> {
  const time = (clock ?? new DefaultSimulationClock()).now();
  const mutatedGenes = mutateGeneMap(seed.genes, intensity, rng) as T;

  const mutated: UniversalSeed<T> = {
    ...seed,
    genes: mutatedGenes,
    $lineage: {
      generation: seed.$lineage.generation + 1,
      parents: [
        {
          id: seed.$hash,
          name: seed.$name,
          fitness: seed.$fitness,
        },
      ],
      breedingStrategy: 'mutation',
      mutationIntensity: intensity,
      timestamp: time,
    },
    $metadata: { ...seed.$metadata },
    $activation: {
      alive: seed.$activation?.alive ?? true,
      active: seed.$activation?.active ?? true,
      energy: seed.$activation?.energy ?? 100,
      age: (seed.$activation?.age ?? 0) + 1,
    },
    $display: autoDisplayHints(seed.$domain, mutatedGenes),
  };

  mutated.$hash = computeSeedQuickHash(mutated);
  return mutated;
}

/**
 * Breeds two parent seeds to produce offspring via gene crossover.
 * Child inherits domain from parentA. Both parents recorded in lineage.
 */
export function breedSeeds<T extends GeneMap = GeneMap>(
  parentA: UniversalSeed<T>,
  parentB: UniversalSeed<T>,
  strategy: CrossoverStrategy,
  dominance: number,
  rng: DeterministicRNG,
  clock?: SimulationClock,
): UniversalSeed<T> {
  const time = (clock ?? new DefaultSimulationClock()).now();
  const childGenes = crossoverGenes(parentA.genes, parentB.genes, strategy, dominance, rng) as T;

  const child: UniversalSeed<T> = {
    $gst: '4.0',
    $domain: parentA.$domain,
    $name: `${(parentA.$name.split('+')[0] ?? parentA.$name).split('\u00d7')[0] ?? parentA.$name}\u00d7${(parentB.$name.split('+')[0] ?? parentB.$name).split('\u00d7')[0] ?? parentB.$name}`,
    $hash: '',
    genes: childGenes,
    $lineage: {
      generation: Math.max(parentA.$lineage.generation, parentB.$lineage.generation) + 1,
      parents: [
        { id: parentA.$hash, name: parentA.$name, fitness: parentA.$fitness },
        { id: parentB.$hash, name: parentB.$name, fitness: parentB.$fitness },
      ],
      breedingStrategy: 'crossover',
      crossoverStrategy: strategy,
      timestamp: time,
    },
    $metadata: {
      created: time,
      description: `Bred from ${parentA.$name} and ${parentB.$name} (dominance: ${dominance})`,
    },
    $activation: {
      alive: true,
      active: true,
      energy: 100,
      age: 0,
    },
    $display: autoDisplayHints(parentA.$domain, childGenes),
  };

  child.$hash = computeSeedQuickHash(child);
  return child;
}

/** Set fitness vector on a seed, returning a new immutable instance. */
export function setSeedFitness<T extends GeneMap = GeneMap>(
  seed: UniversalSeed<T>,
  fitness: FitnessVector,
): UniversalSeed<T> {
  return {
    ...seed,
    $metadata: { ...seed.$metadata },
    $lineage: { ...seed.$lineage },
    genes: structuredClone(seed.genes),
    $fitness: fitness,
  };
}

/** Update metadata on a seed (merges with existing). */
export function setSeedMetadata<T extends GeneMap = GeneMap>(
  seed: UniversalSeed<T>,
  metadata: Partial<SeedMetadata>,
): UniversalSeed<T> {
  return {
    ...seed,
    $metadata: { ...seed.$metadata, ...metadata },
  };
}

/** Update activation state on a seed (merges with existing). */
export function setSeedActivation<T extends GeneMap = GeneMap>(
  seed: UniversalSeed<T>,
  activation: Partial<ActivationState>,
): UniversalSeed<T> {
  const current = seed.$activation ?? {
    alive: true,
    active: true,
    energy: 100,
    age: 0,
  };
  return {
    ...seed,
    $activation: {
      alive: activation.alive ?? current.alive,
      active: activation.active ?? current.active,
      energy: activation.energy ?? current.energy,
      age: activation.age ?? current.age,
      customState: activation.customState ?? current.customState,
    },
  };
}

/** Set display hints on a seed. */
export function setSeedDisplay<T extends GeneMap = GeneMap>(
  seed: UniversalSeed<T>,
  display: Partial<DisplayHints>,
): UniversalSeed<T> {
  return {
    ...seed,
    $display: { ...seed.$display, ...display },
  };
}

/** Set relations on a seed. */
export function setSeedRelations<T extends GeneMap = GeneMap>(
  seed: UniversalSeed<T>,
  relations: SeedRelation[],
): UniversalSeed<T> {
  return {
    ...seed,
    $relations: relations,
  };
}

// ─────────────────────────────────────────────
// Seed Queries
// ─────────────────────────────────────────────

/** Get the unique identifier (content-addressable hash) of a seed. */
export function getSeedId<T extends GeneMap = GeneMap>(seed: UniversalSeed<T>): string {
  return seed.$hash;
}

/** Get primary fitness score, or undefined if not evaluated. */
export function getSeedFitness<T extends GeneMap = GeneMap>(
  seed: UniversalSeed<T>,
): number | undefined {
  if (!seed.$fitness) return undefined;
  if (seed.$fitness.primary !== undefined) return seed.$fitness.primary;
  const keys = Object.keys(seed.$fitness);
  const firstKey = keys[0];
  return firstKey !== undefined ? seed.$fitness[firstKey] : undefined;
}

/** Check whether a seed is alive. Seeds with no activation state are alive by default. */
export function isSeedAlive<T extends GeneMap = GeneMap>(seed: UniversalSeed<T>): boolean {
  return seed.$activation?.alive ?? true;
}

/** Get the count of genes in a seed. */
export function getGeneCount<T extends GeneMap = GeneMap>(seed: UniversalSeed<T>): number {
  return Object.keys(seed.genes).length;
}

// ─────────────────────────────────────────────
// Auto Display Hints
// ─────────────────────────────────────────────

const DOMAIN_COLORS: Partial<Record<SeedDomain, string>> = {
  organism: '#10b981',
  vehicle: '#3b82f6',
  weapon: '#ef4444',
  building: '#8b5cf6',
  terrain: '#84cc16',
  material: '#f59e0b',
  plant: '#22c55e',
  fish: '#06b6d4',
  bird: '#a855f7',
  mammal: '#f97316',
  robot: '#6366f1',
  particle: '#ec4899',
  sound: '#14b8a6',
  music: '#8b5cf6',
  pattern: '#f43f5e',
  narrative: '#d946ef',
  game: '#eab308',
  simulation: '#0ea5e9',
  ecosystem: '#22d3ee',
  city: '#a78bfa',
  neural: '#818cf8',
  intelligence: '#c084fc',
  web: '#2dd4bf',
};

const DOMAIN_ICONS: Partial<Record<SeedDomain, string>> = {
  organism: 'dna',
  vehicle: 'car',
  weapon: 'sword',
  building: 'building',
  terrain: 'mountain',
  plant: 'leaf',
  fish: 'fish',
  bird: 'bird',
  robot: 'bot',
  particle: 'sparkles',
  sound: 'volume',
  music: 'music',
  narrative: 'book',
  game: 'gamepad',
  simulation: 'atom',
  ecosystem: 'trees',
  city: 'buildings',
  neural: 'brain',
  intelligence: 'brain',
  web: 'globe',
};

/**
 * Auto-generate DisplayHints from seed domain and gene analysis.
 */
function autoDisplayHints(domain: SeedDomain, genes: GeneMap): DisplayHints {
  const color = DOMAIN_COLORS[domain] ?? '#64748b';
  const icon = DOMAIN_ICONS[domain] ?? 'box';
  const category = domain;
  const geneNames = Object.keys(genes);
  const tags = geneNames.slice(0, 5);

  return { icon, color, category, tags };
}

// ─────────────────────────────────────────────
// Mutation Operators — All 9 gene types
// ─────────────────────────────────────────────

/** Apply mutation to a single gene with given intensity [0,1]. Returns new gene. */
export function mutateGene(gene: Gene, intensity: number, rng: DeterministicRNG): Gene {
  switch (gene.type) {
    case 'scalar':
      return mutateScalar(gene, intensity, rng);
    case 'categorical':
      return mutateCategorical(gene, intensity, rng);
    case 'vector':
      return mutateVector(gene, intensity, rng);
    case 'expression':
      return mutateExpression(gene, intensity, rng);
    case 'struct':
      return mutateStruct(gene, intensity, rng);
    case 'array':
      return mutateArray(gene, intensity, rng);
    case 'graph':
      return mutateGraph(gene, intensity, rng);
    case 'tensor':
      return mutateTensor(gene, intensity, rng);
    case 'timeseries':
      return mutateTimeSeries(gene, intensity, rng);
  }
}

/** Apply mutation to entire gene map (genome). */
export function mutateGeneMap(genes: GeneMap, intensity: number, rng: DeterministicRNG): GeneMap {
  const result: GeneMap = {};
  for (const [key, gene] of Object.entries(genes)) {
    result[key] = mutateGene(gene, intensity, rng);
  }
  return result;
}

/** Scalar: Gaussian perturbation with bounds checking. */
function mutateScalar(gene: ScalarGene, intensity: number, rng: DeterministicRNG): ScalarGene {
  const range = gene.max - gene.min;
  const stdDev = range * intensity;
  const perturbation = rng.gaussianWithParams(0, stdDev);
  return {
    ...gene,
    value: Math.max(gene.min, Math.min(gene.max, gene.value + perturbation)),
  };
}

/** Categorical: roulette selection from options. */
function mutateCategorical(
  gene: CategoricalGene,
  intensity: number,
  rng: DeterministicRNG,
): CategoricalGene {
  if (rng.next() > intensity) return { ...gene };
  const weights = gene.weights ?? gene.options.map(() => 1);
  return { ...gene, value: rng.weightedChoice(gene.options, weights) };
}

/** Vector: per-dimension Gaussian perturbation respecting bounds. */
function mutateVector(gene: VectorGene, intensity: number, rng: DeterministicRNG): VectorGene {
  const newValue = gene.value.map((v, i) => {
    const min = gene.min?.[i] ?? Number.NEGATIVE_INFINITY;
    const max = gene.max?.[i] ?? Number.POSITIVE_INFINITY;
    const range = Math.abs(max - min);
    const stdDev = range === Infinity ? 0.1 : range * intensity;
    return Math.max(min, Math.min(max, v + rng.gaussianWithParams(0, stdDev)));
  });
  return { ...gene, value: newValue };
}

/**
 * Expression: string-level mutation (no AST dependency at Layer 0).
 * Mutates numeric constants by gaussian perturbation.
 * Full AST mutation available when @paradigm/lang is loaded.
 */
function mutateExpression(
  gene: ExpressionGene,
  intensity: number,
  rng: DeterministicRNG,
): ExpressionGene {
  if (rng.next() > intensity) return { ...gene, compiled: undefined };

  // Simple numeric constant perturbation via regex
  const newSource = gene.source.replace(/\b(\d+\.?\d*)\b/g, (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;
    const factor = 1 + rng.gaussian() * intensity;
    return (Math.round(num * factor * 1e6) / 1e6).toString();
  });

  return { ...gene, source: newSource, compiled: undefined };
}

/** Struct: recursively mutate nested genes. */
function mutateStruct(gene: StructGene, intensity: number, rng: DeterministicRNG): StructGene {
  const newValue: Record<string, Gene> = {};
  for (const [key, nestedGene] of Object.entries(gene.value)) {
    newValue[key] = mutateGene(nestedGene, intensity, rng);
  }
  return { ...gene, value: newValue };
}

/** Array: mutate elements + insert/delete based on intensity. */
function mutateArray(gene: ArrayGene, intensity: number, rng: DeterministicRNG): ArrayGene {
  let newValue = gene.value.map((element) => mutateGene(element, intensity, rng));
  const minLen = gene.minLength ?? 0;
  const maxLen = gene.maxLength ?? newValue.length + Math.ceil(5 * intensity);

  // Delete
  while (newValue.length > minLen && rng.next() < intensity * 0.3) {
    const idx = rng.nextInt(0, newValue.length);
    newValue = [...newValue.slice(0, idx), ...newValue.slice(idx + 1)];
  }

  // Insert (clone + mutate an existing element)
  while (newValue.length < maxLen && newValue.length > 0 && rng.next() < intensity * 0.3) {
    const idx = rng.nextInt(0, newValue.length + 1);
    const sourceIdx = rng.nextInt(0, newValue.length);
    const source = newValue[sourceIdx];
    if (source) {
      const cloned = structuredClone(source);
      const mutated = mutateGene(cloned, intensity, rng);
      newValue = [...newValue.slice(0, idx), mutated, ...newValue.slice(idx)];
    }
  }

  return { ...gene, value: newValue };
}

/** Graph: mutate node genes + add/remove edges. */
function mutateGraph(gene: GraphGene, intensity: number, rng: DeterministicRNG): GraphGene {
  const newNodes = new Map<string, Gene>();
  for (const [nodeId, nodeGene] of gene.nodes.entries()) {
    newNodes.set(nodeId, mutateGene(nodeGene, intensity, rng));
  }

  // Mutate edge weights + filter by probability
  let newEdges = gene.edges
    .map((edge) => ({ ...edge, weight: mutateGene(edge.weight, intensity, rng) }))
    .filter(() => rng.next() > intensity * 0.2);

  // Add new random edges
  const nodeIds = Array.from(newNodes.keys());
  while (rng.next() < intensity * 0.2 && nodeIds.length > 1) {
    const from = rng.choice(nodeIds);
    const others = nodeIds.filter((id) => id !== from);
    const to = rng.choice(others);
    const weightGene: ScalarGene = { type: 'scalar', value: rng.next(), min: 0, max: 1 };
    newEdges.push({ from, to, weight: weightGene });
  }

  return { ...gene, nodes: newNodes, edges: newEdges };
}

/** Tensor: element-wise Gaussian perturbation with shape preservation. */
function mutateTensor(gene: TensorGene, intensity: number, rng: DeterministicRNG): TensorGene {
  const newData = new Float64Array(gene.data);
  for (let i = 0; i < newData.length; i++) {
    newData[i] = (newData[i] ?? 0) + rng.gaussianWithParams(0, intensity * 0.1);
  }
  return { ...gene, data: newData };
}

/** TimeSeries: perturb keyframe times/values + insert/delete. */
function mutateTimeSeries(
  gene: TimeSeriesGene,
  intensity: number,
  rng: DeterministicRNG,
): TimeSeriesGene {
  let newKeyframes = gene.keyframes.map((kf) => ({
    t: kf.t + rng.gaussianWithParams(0, intensity * 0.01),
    v: kf.v + rng.gaussianWithParams(0, intensity * 0.1),
  }));

  // Delete (keep at least 2)
  while (newKeyframes.length > 2 && rng.next() < intensity * 0.2) {
    const idx = rng.nextInt(1, newKeyframes.length - 1);
    newKeyframes = [...newKeyframes.slice(0, idx), ...newKeyframes.slice(idx + 1)];
  }

  // Insert
  while (rng.next() < intensity * 0.2 && newKeyframes.length < 20) {
    const idx = rng.nextInt(0, newKeyframes.length);
    const kf = newKeyframes[idx];
    if (kf) {
      newKeyframes = [
        ...newKeyframes.slice(0, idx),
        { t: kf.t + (rng.next() - 0.5), v: rng.next() },
        ...newKeyframes.slice(idx),
      ];
    }
  }

  newKeyframes.sort((a, b) => a.t - b.t);

  const modes: Array<'linear' | 'cubic' | 'step'> = ['linear', 'cubic', 'step'];
  const interpolation = rng.next() < intensity * 0.1 ? rng.choice(modes) : gene.interpolation;

  return { ...gene, keyframes: newKeyframes, interpolation };
}

// ─────────────────────────────────────────────
// Crossover Operators — 5 strategies
// ─────────────────────────────────────────────

/**
 * Crossover two gene maps to produce offspring.
 * Dominance [0,1] controls which parent contributes more (0.5 = equal).
 */
export function crossoverGenes(
  parentA: GeneMap,
  parentB: GeneMap,
  strategy: CrossoverStrategy,
  dominance: number,
  rng: DeterministicRNG,
): GeneMap {
  switch (strategy) {
    case 'uniform':
      return uniformCrossover(parentA, parentB, dominance, rng);
    case 'single_point':
      return singlePointCrossover(parentA, parentB, dominance, rng);
    case 'blend':
      return blendCrossover(parentA, parentB, dominance, rng);
    case 'sbx':
      return sbxCrossover(parentA, parentB, dominance, rng);
    case 'layer':
      return layerCrossover(parentA, parentB, dominance, rng);
  }
}

/** Deep clone a gene via structuredClone. */
function cloneGene(gene: Gene): Gene {
  return structuredClone(gene);
}

/** Uniform: each gene independently chosen from A or B by dominance probability. */
function uniformCrossover(
  parentA: GeneMap,
  parentB: GeneMap,
  dominance: number,
  rng: DeterministicRNG,
): GeneMap {
  const result: GeneMap = {};
  const allKeys = new Set([...Object.keys(parentA), ...Object.keys(parentB)]);

  for (const key of allKeys) {
    const geneA = parentA[key];
    const geneB = parentB[key];

    if (!geneA && geneB) result[key] = cloneGene(geneB);
    else if (geneA && !geneB) result[key] = cloneGene(geneA);
    else if (geneA && geneB) result[key] = rng.next() < dominance ? cloneGene(geneA) : cloneGene(geneB);
  }
  return result;
}

/** Single-point: genes before cutoff from A, after from B. */
function singlePointCrossover(
  parentA: GeneMap,
  parentB: GeneMap,
  dominance: number,
  _rng: DeterministicRNG,
): GeneMap {
  const allKeys = Array.from(new Set([...Object.keys(parentA), ...Object.keys(parentB)]));
  const cutoff = Math.floor(allKeys.length * dominance);
  const result: GeneMap = {};

  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i]!;
    const source = i < cutoff ? parentA[key] : parentB[key];
    if (source) result[key] = cloneGene(source);
  }
  return result;
}

/** Blend: numeric genes averaged, categorical by dominance. */
function blendCrossover(
  parentA: GeneMap,
  parentB: GeneMap,
  dominance: number,
  rng: DeterministicRNG,
): GeneMap {
  const result: GeneMap = {};
  const allKeys = new Set([...Object.keys(parentA), ...Object.keys(parentB)]);

  for (const key of allKeys) {
    const geneA = parentA[key];
    const geneB = parentB[key];

    if (!geneA && geneB) { result[key] = cloneGene(geneB); continue; }
    if (geneA && !geneB) { result[key] = cloneGene(geneA); continue; }
    if (!geneA || !geneB) continue;

    if (geneA.type === 'scalar' && geneB.type === 'scalar') {
      const blended = geneA.value * dominance + geneB.value * (1 - dominance);
      result[key] = { ...geneA, value: Math.max(geneA.min, Math.min(geneA.max, blended)) };
    } else if (geneA.type === 'vector' && geneB.type === 'vector') {
      result[key] = {
        ...geneA,
        value: geneA.value.map((v, i) => v * dominance + (geneB.value[i] ?? 0) * (1 - dominance)),
      };
    } else {
      result[key] = rng.next() < dominance ? cloneGene(geneA) : cloneGene(geneB);
    }
  }
  return result;
}

/** SBX (Simulated Binary Crossover): controlled exploration for numeric genes. */
function sbxCrossover(
  parentA: GeneMap,
  parentB: GeneMap,
  dominance: number,
  rng: DeterministicRNG,
): GeneMap {
  const result: GeneMap = {};
  const allKeys = new Set([...Object.keys(parentA), ...Object.keys(parentB)]);
  const eta = 20; // Distribution index

  for (const key of allKeys) {
    const geneA = parentA[key];
    const geneB = parentB[key];

    if (!geneA && geneB) { result[key] = cloneGene(geneB); continue; }
    if (geneA && !geneB) { result[key] = cloneGene(geneA); continue; }
    if (!geneA || !geneB) continue;

    if (geneA.type === 'scalar' && geneB.type === 'scalar') {
      const u = rng.next();
      const beta = u <= 0.5
        ? Math.pow(2 * u, 1 / (eta + 1))
        : Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1));

      const y1 = 0.5 * ((geneA.value + geneB.value) - beta * Math.abs(geneB.value - geneA.value));
      const y2 = 0.5 * ((geneA.value + geneB.value) + beta * Math.abs(geneB.value - geneA.value));
      const selected = rng.next() < 0.5 ? y1 : y2;
      result[key] = { ...geneA, value: Math.max(geneA.min, Math.min(geneA.max, selected)) };
    } else if (geneA.type === 'vector' && geneB.type === 'vector') {
      result[key] = {
        ...geneA,
        value: geneA.value.map((v1, i) => {
          const v2 = geneB.value[i] ?? 0;
          const u = rng.next();
          const beta = u <= 0.5
            ? Math.pow(2 * u, 1 / (eta + 1))
            : Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1));
          const minVal = geneA.min?.[i] ?? Number.NEGATIVE_INFINITY;
          const maxVal = geneA.max?.[i] ?? Number.POSITIVE_INFINITY;
          const y = 0.5 * ((v1 + v2) - beta * Math.abs(v2 - v1));
          return Math.max(minVal, Math.min(maxVal, y));
        }),
      };
    } else {
      result[key] = rng.next() < dominance ? cloneGene(geneA) : cloneGene(geneB);
    }
  }
  return result;
}

/** Layer: entire sub-structures from one parent. Preserves internal integrity. */
function layerCrossover(
  parentA: GeneMap,
  parentB: GeneMap,
  dominance: number,
  rng: DeterministicRNG,
): GeneMap {
  const result: GeneMap = {};
  const allKeys = new Set([...Object.keys(parentA), ...Object.keys(parentB)]);

  for (const key of allKeys) {
    const geneA = parentA[key];
    const geneB = parentB[key];

    if (!geneA && geneB) { result[key] = cloneGene(geneB); continue; }
    if (geneA && !geneB) { result[key] = cloneGene(geneA); continue; }
    if (!geneA || !geneB) continue;

    if (geneA.type === 'struct' || geneA.type === 'array' || geneA.type === 'graph') {
      result[key] = rng.next() < dominance ? cloneGene(geneA) : cloneGene(geneB);
    } else if (geneA.type === 'scalar' && geneB.type === 'scalar') {
      const blended = geneA.value * dominance + geneB.value * (1 - dominance);
      result[key] = { ...geneA, value: Math.max(geneA.min, Math.min(geneA.max, blended)) };
    } else {
      result[key] = rng.next() < dominance ? cloneGene(geneA) : cloneGene(geneB);
    }
  }
  return result;
}
