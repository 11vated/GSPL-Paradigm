/**
 * @paradigm/evolution — Advanced evolutionary computation for GSPL Paradigm.
 *
 * Layer 3 Domain Engine providing a complete genetic algorithm suite:
 * - Selection strategies: tournament, roulette, rank, truncation
 * - EvolutionEngine: generational loop with elitism and fitness thresholding
 * - IslandModel: parallel sub-populations with ring-topology migration
 * - SpeciationDetector: threshold-based species clustering
 * - EcologyMetrics: Shannon entropy, Simpson diversity, fitness variance
 * - LineageTracer: ancestry tree reconstruction with operation tagging
 *
 * All randomness is routed through DeterministicRNG for reproducibility.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, FitnessVector, LineageRecord, SeedDomain } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';
import { createSeed, mutateSeed, breedSeeds } from '@paradigm/seed';

// Re-export types the spec requires consumers to access from one place.
export type { UniversalSeed, FitnessVector, LineageRecord, SeedDomain };

// ═══════════════════════════════════════════════════════════════════
// Enumerations and config types
// ═══════════════════════════════════════════════════════════════════

/** Strategy used to select parents from a population for reproduction. */
export type SelectionStrategy = 'tournament' | 'roulette' | 'rank' | 'truncation';

/**
 * Full configuration for an EvolutionEngine run.
 *
 * All fields are optional when passed to the constructor; defaults are applied
 * by {@link resolveConfig}.
 */
export interface EvolutionConfig {
  /** Number of individuals maintained each generation. Default: 50 */
  populationSize: number;
  /** Hard upper limit on generations. Default: 100 */
  generations: number;
  /** Per-gene mutation probability in [0, 1]. Default: 0.05 */
  mutationRate: number;
  /** Probability that two selected parents undergo crossover. Default: 0.8 */
  crossoverRate: number;
  /** Number of top-ranked individuals copied unchanged to the next generation. Default: 2 */
  elitismCount: number;
  /** Parent selection algorithm. Default: 'tournament' */
  selectionStrategy: SelectionStrategy;
  /** Participants per tournament (used when strategy is 'tournament'). Default: 3 */
  tournamentSize: number;
  /**
   * Fraction of the population that survives before reproduction.
   * Used by truncation selection. Default: 0.5
   */
  survivalThreshold: number;
  /** Number of independent sub-populations for IslandModel. Default: 4 */
  islandCount: number;
  /** Fraction of each island's population that migrates per epoch. Default: 0.1 */
  migrationRate: number;
  /** Generations between migration events. Default: 10 */
  migrationInterval: number;
}

/** Statistics snapshot for a single generation. */
export interface EvolutionStats {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  worstFitness: number;
  /** Normalised population diversity in [0, 1]. */
  diversity: number;
  populationSize: number;
  /** Number of extinction events (islands that went empty) observed so far. */
  extinctions: number;
}

// ═══════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════

/** Apply default values to a partial EvolutionConfig. */
function resolveConfig(partial: Partial<EvolutionConfig>): EvolutionConfig {
  return {
    populationSize:    partial.populationSize    ?? 50,
    generations:       partial.generations       ?? 100,
    mutationRate:      partial.mutationRate       ?? 0.05,
    crossoverRate:     partial.crossoverRate      ?? 0.8,
    elitismCount:      partial.elitismCount       ?? 2,
    selectionStrategy: partial.selectionStrategy  ?? 'tournament',
    tournamentSize:    partial.tournamentSize      ?? 3,
    survivalThreshold: partial.survivalThreshold   ?? 0.5,
    islandCount:       partial.islandCount         ?? 4,
    migrationRate:     partial.migrationRate        ?? 0.1,
    migrationInterval: partial.migrationInterval    ?? 10,
  };
}

/** Extract primary scalar fitness from a seed; defaults to 0 when absent. */
function scalarFitness(seed: UniversalSeed): number {
  if (seed.$fitness === undefined) return 0;
  if (seed.$fitness.primary !== undefined) return seed.$fitness.primary;
  const keys = Object.keys(seed.$fitness);
  const first = keys[0];
  if (first === undefined) return 0;
  return seed.$fitness[first] ?? 0;
}

/** Attach a scalar fitness score to a seed as a new immutable instance. */
function withFitness(seed: UniversalSeed, score: number): UniversalSeed {
  return {
    ...seed,
    $fitness: { primary: score } satisfies FitnessVector,
    $metadata: { ...seed.$metadata },
    $lineage: { ...seed.$lineage },
    genes: seed.genes,
  };
}

/**
 * Normalise a single gene to [0, 1] for diversity / distance calculations.
 * scalar: (value − min) / (max − min)
 * categorical: index / (options.length − 1)
 * vector: magnitude / sqrt(dimensions)
 * all others: 0.5
 */
function normaliseGene(gene: UniversalSeed['genes'][string]): number {
  if (gene === undefined) return 0.5;
  switch (gene.type) {
    case 'scalar': {
      const range = gene.max - gene.min;
      if (range === 0) return 0;
      return Math.max(0, Math.min(1, (gene.value - gene.min) / range));
    }
    case 'categorical': {
      if (gene.options.length <= 1) return 0;
      const idx = gene.options.indexOf(gene.value);
      return Math.max(0, idx) / (gene.options.length - 1);
    }
    case 'vector': {
      if (gene.dimensions === 0 || gene.value.length === 0) return 0;
      const sumSq = gene.value.reduce((a, v) => a + v * v, 0);
      return Math.sqrt(sumSq) / Math.sqrt(gene.dimensions);
    }
    default:
      return 0.5;
  }
}

/**
 * Compute mean gene-variance diversity for a population, normalised to [0, 1].
 * Maximum variance of a uniform [0,1] distribution is 1/12 ≈ 0.0833.
 */
function populationDiversity(population: UniversalSeed[]): number {
  if (population.length < 2) return 0;

  const allKeys = new Set<string>();
  for (const s of population) {
    for (const k of Object.keys(s.genes)) allKeys.add(k);
  }
  if (allKeys.size === 0) return 0;

  let totalVariance = 0;
  let geneCount = 0;

  for (const key of allKeys) {
    const values: number[] = [];
    for (const s of population) {
      const g = s.genes[key];
      if (g !== undefined) values.push(normaliseGene(g));
    }
    if (values.length < 2) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
    totalVariance += variance;
    geneCount++;
  }

  if (geneCount === 0) return 0;
  const maxVariance = 1 / 12;
  return Math.min(1, totalVariance / geneCount / maxVariance);
}

// ═══════════════════════════════════════════════════════════════════
// EvolutionEngine
// ═══════════════════════════════════════════════════════════════════

/**
 * Core generational evolution loop.
 *
 * All randomness is channelled through the injected {@link DeterministicRNG}
 * so runs are fully reproducible given the same seed.
 *
 * @example
 * ```ts
 * const engine = new EvolutionEngine({ populationSize: 100, generations: 200 });
 * const { best, stats } = engine.run(templateSeed, s => s.$fitness?.primary ?? 0);
 * ```
 */
export class EvolutionEngine {
  private readonly config: EvolutionConfig;
  private readonly rng: DeterministicRNG;

  constructor(config: Partial<EvolutionConfig> = {}, rng?: DeterministicRNG) {
    this.config = resolveConfig(config);
    this.rng = rng ?? new DeterministicRNG(42);
  }

  // ─── Population initialisation ────────────────────────────────

  /**
   * Create an initial population by mutating `template` at varying intensities.
   *
   * @param template - Seed used as the generative prototype.
   * @param size - Population size (defaults to config.populationSize).
   */
  initPopulation(template: UniversalSeed, size?: number): UniversalSeed[] {
    const n = size ?? this.config.populationSize;
    const population: UniversalSeed[] = [];
    const mutRng = this.rng.fork('init');

    // Always include the template itself as index 0.
    population.push(template);

    for (let i = 1; i < n; i++) {
      const intensity = 0.1 + mutRng.next() * 0.4; // [0.1, 0.5]
      population.push(mutateSeed(template, intensity, mutRng.fork(`init-${i}`)));
    }

    return population;
  }

  // ─── Fitness evaluation ───────────────────────────────────────

  /**
   * Score each seed with `fitnessFunction` and return a new population with
   * `$fitness.primary` set on every member, sorted best-first.
   */
  evaluateFitness(
    population: UniversalSeed[],
    fitnessFunction: (seed: UniversalSeed) => number,
  ): UniversalSeed[] {
    return population
      .map(seed => withFitness(seed, fitnessFunction(seed)))
      .sort((a, b) => scalarFitness(b) - scalarFitness(a));
  }

  // ─── Selection ────────────────────────────────────────────────

  /**
   * Select `count` parents from an evaluated (sorted best-first) population
   * using the configured selection strategy.
   */
  select(population: UniversalSeed[], count: number): UniversalSeed[] {
    switch (this.config.selectionStrategy) {
      case 'tournament':  return this.tournamentSelect(population, count);
      case 'roulette':    return this.rouletteSelect(population, count);
      case 'rank':        return this.rankSelect(population, count);
      case 'truncation':  return this.truncationSelect(population, count);
    }
  }

  /** Tournament selection: run `count` tournaments of size `tournamentSize`. */
  tournamentSelect(population: UniversalSeed[], count: number): UniversalSeed[] {
    if (population.length === 0) return [];
    const k = Math.min(this.config.tournamentSize, population.length);
    const pool: UniversalSeed[] = [];
    const selRng = this.rng.fork('tournament');

    for (let i = 0; i < count; i++) {
      let best = population[selRng.nextInt(0, population.length)]!;
      for (let j = 1; j < k; j++) {
        const candidate = population[selRng.nextInt(0, population.length)]!;
        if (scalarFitness(candidate) > scalarFitness(best)) best = candidate;
      }
      pool.push(best);
    }
    return pool;
  }

  /** Roulette-wheel (fitness-proportionate) selection. Handles negative fitness. */
  rouletteSelect(population: UniversalSeed[], count: number): UniversalSeed[] {
    if (population.length === 0) return [];
    const fitnesses = population.map(s => scalarFitness(s));
    const minFit = Math.min(...fitnesses);
    const shifted = fitnesses.map(f => f - minFit);
    const total = shifted.reduce((a, b) => a + b, 0);
    const pool: UniversalSeed[] = [];
    const selRng = this.rng.fork('roulette');

    for (let i = 0; i < count; i++) {
      if (total === 0) {
        pool.push(population[selRng.nextInt(0, population.length)]!);
        continue;
      }
      let r = selRng.next() * total;
      let selected = population[population.length - 1]!;
      for (let j = 0; j < population.length; j++) {
        r -= shifted[j]!;
        if (r <= 0) { selected = population[j]!; break; }
      }
      pool.push(selected);
    }
    return pool;
  }

  /** Rank-based selection: selection probability proportional to rank, not raw fitness. */
  rankSelect(population: UniversalSeed[], count: number): UniversalSeed[] {
    if (population.length === 0) return [];
    // sorted worst-first so rank i+1 = weight i+1
    const sorted = [...population].sort((a, b) => scalarFitness(a) - scalarFitness(b));
    const n = sorted.length;
    const total = (n * (n + 1)) / 2;
    const pool: UniversalSeed[] = [];
    const selRng = this.rng.fork('rank');

    for (let i = 0; i < count; i++) {
      let r = selRng.next() * total;
      let selected = sorted[n - 1]!;
      for (let j = 0; j < n; j++) {
        r -= j + 1;
        if (r <= 0) { selected = sorted[j]!; break; }
      }
      pool.push(selected);
    }
    return pool;
  }

  /** Truncation selection: keep the top `survivalThreshold` fraction. */
  truncationSelect(population: UniversalSeed[], count: number): UniversalSeed[] {
    if (population.length === 0) return [];
    const cutoff = Math.max(1, Math.floor(population.length * this.config.survivalThreshold));
    const survivors = [...population]
      .sort((a, b) => scalarFitness(b) - scalarFitness(a))
      .slice(0, cutoff);

    // Repeat survivors to fill `count` slots.
    const pool: UniversalSeed[] = [];
    const selRng = this.rng.fork('truncation');
    for (let i = 0; i < count; i++) {
      pool.push(survivors[selRng.nextInt(0, survivors.length)]!);
    }
    return pool;
  }

  // ─── Generational step ────────────────────────────────────────

  /**
   * Advance the population by one generation:
   *   1. Evaluate fitness.
   *   2. Carry over elite individuals unchanged.
   *   3. Select parents and produce offspring via crossover + mutation.
   *
   * @returns Next-generation population (same size as input).
   */
  evolveGeneration(
    population: UniversalSeed[],
    fitnessFunction: (seed: UniversalSeed) => number,
  ): UniversalSeed[] {
    const evaluated = this.evaluateFitness(population, fitnessFunction);
    const popSize = this.config.populationSize;
    const elites = Math.min(this.config.elitismCount, evaluated.length);
    const next: UniversalSeed[] = evaluated.slice(0, elites);

    const needed = popSize - elites;
    const parents = this.select(evaluated, needed * 2);
    const breedRng = this.rng.fork('breed');
    const mutRng = this.rng.fork('mutate');

    for (let i = 0; i < needed; i++) {
      const parentA = parents[i % parents.length]!;
      const parentB = parents[(i + 1) % parents.length]!;

      let child: UniversalSeed;
      if (breedRng.next() < this.config.crossoverRate) {
        child = breedSeeds(parentA, parentB, 'uniform', 0.5, breedRng.fork(`cross-${i}`));
      } else {
        child = { ...parentA, genes: parentA.genes };
      }

      child = mutateSeed(child, this.config.mutationRate, mutRng.fork(`mut-${i}`));
      next.push(child);
    }

    return next.slice(0, popSize);
  }

  // ─── Full run ─────────────────────────────────────────────────

  /**
   * Run a complete evolution: initialise from template, iterate for
   * `config.generations` generations, and return the best individual.
   *
   * @param template - Seed used to generate the initial population.
   * @param fitnessFunction - Maps a seed to a scalar fitness score (higher = better).
   */
  run(
    template: UniversalSeed,
    fitnessFunction: (seed: UniversalSeed) => number,
  ): { population: UniversalSeed[]; stats: EvolutionStats[]; best: UniversalSeed } {
    let population = this.initPopulation(template);
    const statsHistory: EvolutionStats[] = [];
    let best: UniversalSeed = population[0]!;

    for (let gen = 0; gen < this.config.generations; gen++) {
      population = this.evolveGeneration(population, fitnessFunction);
      const genStats = this.getStats(population, gen);
      statsHistory.push(genStats);

      const topSeed = population[0]!;
      if (scalarFitness(topSeed) > scalarFitness(best)) best = topSeed;
    }

    return { population, stats: statsHistory, best };
  }

  // ─── Stats ────────────────────────────────────────────────────

  /**
   * Compute statistics for the current population at a given generation index.
   *
   * @param population - Current population (need not be sorted).
   * @param generation - Generation index to embed in the returned stats.
   */
  getStats(population: UniversalSeed[], generation: number): EvolutionStats {
    if (population.length === 0) {
      return {
        generation,
        bestFitness: 0,
        avgFitness: 0,
        worstFitness: 0,
        diversity: 0,
        populationSize: 0,
        extinctions: 0,
      };
    }

    const fitnesses = population.map(s => scalarFitness(s));
    const sum = fitnesses.reduce((a, b) => a + b, 0);

    return {
      generation,
      bestFitness:  Math.max(...fitnesses),
      avgFitness:   sum / fitnesses.length,
      worstFitness: Math.min(...fitnesses),
      diversity:    populationDiversity(population),
      populationSize: population.length,
      extinctions:  0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// IslandModel
// ═══════════════════════════════════════════════════════════════════

/**
 * Multi-island parallel evolution with ring-topology migration.
 *
 * Each island runs the same generational logic independently; every
 * `migrationInterval` generations the best individuals from each island
 * migrate to the next island in the ring.
 *
 * @example
 * ```ts
 * const im = new IslandModel(config, 4);
 * const { best } = im.run(templateSeed, s => s.$fitness?.primary ?? 0);
 * ```
 */
export class IslandModel {
  private readonly config: EvolutionConfig;
  private readonly islandCount: number;
  private readonly engine: EvolutionEngine;
  private readonly rng: DeterministicRNG;

  constructor(config: EvolutionConfig, islandCount: number, rng?: DeterministicRNG) {
    this.config = config;
    this.islandCount = Math.max(2, islandCount);
    this.rng = rng ?? new DeterministicRNG(42);
    this.engine = new EvolutionEngine(config, this.rng.fork('engine'));
  }

  /** Initialise `islandCount` independent populations from a template seed. */
  initIslands(template: UniversalSeed): UniversalSeed[][] {
    return Array.from({ length: this.islandCount }, (_, i) =>
      this.engine.initPopulation(template, this.config.populationSize),
    );
  }

  /**
   * Perform one ring-topology migration event.
   * Each island sends its best `migrationRate` fraction to the next island,
   * replacing the worst recipients.
   */
  migrate(islands: UniversalSeed[][]): UniversalSeed[][] {
    const n = islands.length;
    if (n < 2) return islands;

    const result = islands.map(island => [...island]);
    const migrateCount = Math.max(
      1,
      Math.floor((islands[0]?.length ?? 1) * this.config.migrationRate),
    );

    for (let i = 0; i < n; i++) {
      const source = result[i]!;
      const target = result[(i + 1) % n]!;

      // Pick best migrants from source.
      const migrants = [...source]
        .sort((a, b) => scalarFitness(b) - scalarFitness(a))
        .slice(0, migrateCount);

      // Replace worst members of target.
      target.sort((a, b) => scalarFitness(a) - scalarFitness(b));
      for (let j = 0; j < migrants.length && j < target.length; j++) {
        target[j] = migrants[j]!;
      }
    }

    return result;
  }

  /**
   * Advance every island by one generation, then return updated islands and
   * per-island stats.
   */
  evolveIslands(
    islands: UniversalSeed[][],
    fitnessFunction: (seed: UniversalSeed) => number,
  ): { islands: UniversalSeed[][]; stats: EvolutionStats[][] } {
    const newIslands: UniversalSeed[][] = [];
    const stats: EvolutionStats[][] = [];

    for (let i = 0; i < islands.length; i++) {
      const island = islands[i]!;
      const next = this.engine.evolveGeneration(island, fitnessFunction);
      newIslands.push(next);
      stats.push([this.engine.getStats(next, 0)]);
    }

    return { islands: newIslands, stats };
  }

  /**
   * Run the full island-model evolution: initialise from template, iterate
   * for `config.generations` generations with periodic ring migration.
   */
  run(
    template: UniversalSeed,
    fitnessFunction: (seed: UniversalSeed) => number,
  ): { best: UniversalSeed; islands: UniversalSeed[][] } {
    let islands = this.initIslands(template);

    for (let gen = 0; gen < this.config.generations; gen++) {
      const { islands: stepped } = this.evolveIslands(islands, fitnessFunction);
      islands = stepped;

      if (gen > 0 && gen % this.config.migrationInterval === 0) {
        islands = this.migrate(islands);
      }
    }

    // Find global best across all islands.
    let best: UniversalSeed = islands[0]![0]!;
    for (const island of islands) {
      for (const seed of island) {
        if (scalarFitness(seed) > scalarFitness(best)) best = seed;
      }
    }

    return { best, islands };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SpeciationDetector
// ═══════════════════════════════════════════════════════════════════

/**
 * Identifies emerging species in a population using greedy nearest-centroid
 * clustering on normalised gene values.
 *
 * Two individuals belong to the same species when their
 * {@link SpeciationDetector.geneticDistance} is below the threshold.
 */
export class SpeciationDetector {
  /**
   * Compute a normalised genetic distance in [0, 1] between two seeds.
   *
   * For each shared gene key the absolute difference of normalised values is
   * summed; missing keys contribute a neutral distance of 0.5.
   */
  geneticDistance(a: UniversalSeed, b: UniversalSeed): number {
    const keys = new Set([...Object.keys(a.genes), ...Object.keys(b.genes)]);
    if (keys.size === 0) return 0;

    let totalDiff = 0;
    for (const key of keys) {
      const gA = a.genes[key];
      const gB = b.genes[key];
      const vA = gA !== undefined ? normaliseGene(gA) : 0.5;
      const vB = gB !== undefined ? normaliseGene(gB) : 0.5;
      totalDiff += Math.abs(vA - vB);
    }

    return totalDiff / keys.size;
  }

  /**
   * Cluster `population` into species groups.
   * Members within `threshold` genetic distance of a cluster's centroid are
   * assigned to that cluster; otherwise a new species is started.
   *
   * @param population - Seeds to cluster.
   * @param threshold - Genetic distance threshold in [0, 1]. Default: 0.3.
   * @returns Array of species (each an array of member seeds).
   */
  detectSpecies(population: UniversalSeed[], threshold = 0.3): UniversalSeed[][] {
    if (population.length === 0) return [];

    const clusters: UniversalSeed[][] = [];
    const centroids: UniversalSeed[] = []; // representative seed for each cluster

    for (const seed of population) {
      let assigned = false;

      for (let i = 0; i < centroids.length; i++) {
        if (this.geneticDistance(seed, centroids[i]!) < threshold) {
          clusters[i]!.push(seed);
          // Update centroid to the member with median fitness.
          const members = clusters[i]!;
          centroids[i] = members[Math.floor(members.length / 2)]!;
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        clusters.push([seed]);
        centroids.push(seed);
      }
    }

    return clusters.sort((a, b) => b.length - a.length);
  }

  /** Compute aggregate statistics over a set of species clusters. */
  speciesStats(species: UniversalSeed[][]): {
    count: number;
    avgSize: number;
    maxSize: number;
    minSize: number;
  } {
    if (species.length === 0) {
      return { count: 0, avgSize: 0, maxSize: 0, minSize: 0 };
    }

    const sizes = species.map(s => s.length);
    const total = sizes.reduce((a, b) => a + b, 0);

    return {
      count:   species.length,
      avgSize: total / species.length,
      maxSize: Math.max(...sizes),
      minSize: Math.min(...sizes),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// EcologyMetrics
// ═══════════════════════════════════════════════════════════════════

/**
 * Mathematical ecology metrics for analysing population health and diversity.
 *
 * All methods are pure functions operating on UniversalSeed arrays.
 */
export class EcologyMetrics {
  /**
   * Compute Shannon entropy of the discretised gene distribution.
   *
   * Each gene is discretised into 10 buckets; entropy is averaged across all
   * gene keys. Returns a value in [0, log2(10)] — higher is more diverse.
   */
  shannonDiversity(population: UniversalSeed[]): number {
    if (population.length === 0) return 0;

    const buckets = 10;
    const allKeys = new Set<string>();
    for (const s of population) {
      for (const k of Object.keys(s.genes)) allKeys.add(k);
    }

    let totalEntropy = 0;
    let geneCount = 0;

    for (const key of allKeys) {
      const counts = new Array<number>(buckets).fill(0);
      let sampleCount = 0;

      for (const seed of population) {
        const g = seed.genes[key];
        if (g === undefined) continue;
        const v = normaliseGene(g);
        const bucket = Math.min(buckets - 1, Math.floor(v * buckets));
        counts[bucket]!++;
        sampleCount++;
      }

      if (sampleCount === 0) continue;

      let entropy = 0;
      for (const c of counts) {
        if (c === 0) continue;
        const p = c / sampleCount;
        entropy -= p * Math.log2(p);
      }
      totalEntropy += entropy;
      geneCount++;
    }

    return geneCount === 0 ? 0 : totalEntropy / geneCount;
  }

  /**
   * Compute Simpson's diversity index: 1 − Σ(nᵢ(nᵢ−1)) / (N(N−1)).
   *
   * Each individual is profiled by discretising all gene values into 5 buckets.
   * Returns a value in [0, 1]; 1 means maximum diversity.
   */
  simpsonDiversity(population: UniversalSeed[]): number {
    const n = population.length;
    if (n <= 1) return 0;

    const buckets = 5;
    const freqMap = new Map<string, number>();

    for (const seed of population) {
      const parts: string[] = [];
      for (const [key, gene] of Object.entries(seed.genes)) {
        const v = normaliseGene(gene);
        const bucket = Math.min(buckets - 1, Math.floor(v * buckets));
        parts.push(`${key}:${bucket}`);
      }
      const profile = parts.sort().join('|');
      freqMap.set(profile, (freqMap.get(profile) ?? 0) + 1);
    }

    let sumNiNi1 = 0;
    for (const ni of freqMap.values()) {
      sumNiNi1 += ni * (ni - 1);
    }

    return 1 - sumNiNi1 / (n * (n - 1));
  }

  /**
   * Compute variance of the primary fitness score across the population.
   * Returns 0 for populations with fewer than 2 members.
   */
  fitnessVariance(population: UniversalSeed[]): number {
    if (population.length < 2) return 0;

    const fitnesses = population.map(s => scalarFitness(s));
    const mean = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    return fitnesses.reduce((a, f) => a + (f - mean) ** 2, 0) / fitnesses.length;
  }

  /**
   * Composite population health report.
   *
   * - `diversity` — Simpson's diversity index [0, 1].
   * - `avgFitness` — Mean primary fitness.
   * - `stability` — 1 − normalised fitness variance (high = stable performance).
   */
  populationHealth(population: UniversalSeed[]): {
    diversity: number;
    avgFitness: number;
    stability: number;
  } {
    if (population.length === 0) {
      return { diversity: 0, avgFitness: 0, stability: 1 };
    }

    const fitnesses = population.map(s => scalarFitness(s));
    const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const variance = this.fitnessVariance(population);

    // Normalise variance against a reference of 1.0 so stability stays in [0,1].
    const stability = Math.max(0, 1 - Math.sqrt(variance));

    return {
      diversity:  this.simpsonDiversity(population),
      avgFitness,
      stability,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// LineageTracer
// ═══════════════════════════════════════════════════════════════════

/** Internal record linking a child seed hash to its parent hash and operation. */
interface LineageEdge {
  parentHash: string;
  operation: 'mutation' | 'crossover';
}

/**
 * Tracks parent–child relationships across a run, enabling ancestry
 * reconstruction and lineage depth analysis.
 *
 * The tracer maintains an in-memory graph; call {@link record} after each
 * genetic operation, then {@link getAncestors} / {@link getLineageDepth} at
 * any point.
 */
export class LineageTracer {
  /** Maps child hash → list of (parentHash, operation) edges. */
  private readonly edges: Map<string, LineageEdge[]> = new Map();
  /** Maps hash → seed for ancestor lookups. */
  private readonly registry: Map<string, UniversalSeed> = new Map();

  constructor() {}

  /**
   * Record a genetic operation that produced `child` from `parent`.
   *
   * @param parent - The source seed.
   * @param child - The result seed.
   * @param operation - Type of genetic operation performed.
   */
  record(
    parent: UniversalSeed,
    child: UniversalSeed,
    operation: 'mutation' | 'crossover',
  ): void {
    this.registry.set(parent.$hash, parent);
    this.registry.set(child.$hash, child);

    const existing = this.edges.get(child.$hash) ?? [];
    existing.push({ parentHash: parent.$hash, operation });
    this.edges.set(child.$hash, existing);
  }

  /**
   * Retrieve ancestors of `seed` up to `depth` generations back.
   *
   * Returns an array of unique ancestor seeds in BFS order (closest first).
   *
   * @param seed - The seed whose ancestry to trace.
   * @param depth - Maximum number of generations to traverse. Default: 5.
   */
  getAncestors(seed: UniversalSeed, depth = 5): UniversalSeed[] {
    const ancestors: UniversalSeed[] = [];
    const visited = new Set<string>();
    const queue: Array<{ hash: string; d: number }> = [{ hash: seed.$hash, d: 0 }];

    while (queue.length > 0) {
      const { hash, d } = queue.shift()!;
      if (visited.has(hash) || d >= depth) continue;
      visited.add(hash);

      const parentEdges = this.edges.get(hash) ?? [];
      for (const edge of parentEdges) {
        const parentSeed = this.registry.get(edge.parentHash);
        if (parentSeed !== undefined && !visited.has(edge.parentHash)) {
          ancestors.push(parentSeed);
          queue.push({ hash: edge.parentHash, d: d + 1 });
        }
      }
    }

    return ancestors;
  }

  /**
   * Find the most recent common ancestor of two seeds.
   *
   * Performs a BFS from each seed and returns the first hash that appears in
   * both ancestor sets. Returns `null` when no shared ancestor is found.
   */
  getMostRecentCommonAncestor(
    a: UniversalSeed,
    b: UniversalSeed,
  ): UniversalSeed | null {
    const ancestorsA = new Set([a.$hash, ...this.getAncestors(a, 50).map(s => s.$hash)]);

    const queue: Array<string> = [b.$hash];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const hash = queue.shift()!;
      if (visited.has(hash)) continue;
      visited.add(hash);

      if (ancestorsA.has(hash)) {
        return this.registry.get(hash) ?? null;
      }

      const parentEdges = this.edges.get(hash) ?? [];
      for (const edge of parentEdges) {
        if (!visited.has(edge.parentHash)) queue.push(edge.parentHash);
      }
    }

    return null;
  }

  /**
   * Compute the maximum lineage depth of `seed` — how many generations back
   * its oldest traceable ancestor lies.
   *
   * @param seed - The seed to measure.
   */
  getLineageDepth(seed: UniversalSeed): number {
    return this._maxDepth(seed.$hash, new Set<string>());
  }

  private _maxDepth(hash: string, visited: Set<string>): number {
    if (visited.has(hash)) return 0;
    visited.add(hash);

    const parentEdges = this.edges.get(hash) ?? [];
    if (parentEdges.length === 0) return 0;

    let max = 0;
    for (const edge of parentEdges) {
      const d = this._maxDepth(edge.parentHash, new Set(visited));
      if (d > max) max = d;
    }
    return max + 1;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Typed error
// ═══════════════════════════════════════════════════════════════════

/** Typed error thrown by all public evolution classes and functions. */
export class EvolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvolutionError';
  }
}
