/**
 * FitnessStrategist — Analyzes fitness landscapes and recommends evolution strategies.
 *
 * Computes population statistics (Shannon diversity, convergence, stagnation),
 * and produces evidence-based strategy recommendations for the evolutionary
 * engine. Zero LLM calls; all logic is deterministic.
 *
 * @packageDocumentation
 */

import type {
  FitnessVector,
  GeneMap,
  UniversalSeed,
} from '@paradigm/types';

// ─────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────

/** Statistical snapshot of a population's fitness distribution. */
export interface FitnessDistribution {
  readonly mean: number;
  readonly standardDeviation: number;
  readonly min: number;
  readonly max: number;
  readonly median: number;
}

/** Full analysis of a population of seeds. */
export interface PopulationAnalysis {
  /** Shannon diversity index across gene-type buckets. */
  readonly shannonDiversity: number;
  /** Fitness distribution statistics. */
  readonly fitnessDistribution: FitnessDistribution;
  /** True if the population's best seeds share >80% of gene values. */
  readonly isConverging: boolean;
  /** True if fitness has not improved significantly over recent history. */
  readonly isStagnating: boolean;
  /** Number of distinct domains represented. */
  readonly domainCount: number;
  /** Number of seeds evaluated. */
  readonly populationSize: number;
}

/** Single-generation snapshot for trend analysis. */
export interface EvolutionStats {
  readonly generation: number;
  readonly bestFitness: number;
  readonly averageFitness: number;
  readonly populationSize: number;
  readonly diversity: number;
}

/** Actionable strategy recommendation. */
export interface StrategyRecommendation {
  readonly strategy: 'increase_mutation' | 'decrease_mutation' | 'tournament_selection'
    | 'island_model' | 'inject_random' | 'elitism_boost' | 'diversify_crossover';
  readonly reason: string;
  readonly suggestedMutationRate?: number;
  readonly suggestedPopulationSize?: number;
  readonly confidence: number;
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Extract the primary fitness value from a FitnessVector.
 * Falls back to the average of all numeric values, then 0.
 */
function extractPrimaryFitness(fitness: FitnessVector | undefined): number {
  if (!fitness) return 0;
  const primary = fitness['primary'];
  if (typeof primary === 'number') return primary;
  const vals = Object.values(fitness).filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Compute the Shannon diversity index for a set of category counts.
 * H = -sum(p_i * ln(p_i))
 */
function shannonIndex(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h;
}

/**
 * Compute standard statistics for an array of numbers.
 */
function computeDistribution(values: readonly number[]): FitnessDistribution {
  if (values.length === 0) {
    return { mean: 0, standardDeviation: 0, min: 0, max: 0, median: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  return {
    mean,
    standardDeviation: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[n - 1]!,
    median,
  };
}

// ─────────────────────────────────────────────
// FitnessStrategist
// ─────────────────────────────────────────────

/**
 * Analyzes fitness landscapes and recommends evolution parameter adjustments.
 *
 * All methods are synchronous, deterministic, and require no external
 * services. Strategy recommendations follow established evolutionary
 * computation heuristics:
 * - Stagnation => increase exploration (higher mutation, island model).
 * - Rapid convergence => inject diversity.
 * - High diversity + low fitness => focus exploitation (tournament, elitism).
 */
export class FitnessStrategist {
  /** Number of recent generations to consider for stagnation detection. */
  private readonly stagnationWindow: number;
  /** Minimum relative improvement (0-1) to consider "not stagnating." */
  private readonly stagnationThreshold: number;

  /**
   * @param stagnationWindow - Generations to look back for stagnation (default 5).
   * @param stagnationThreshold - Min relative improvement to avoid stagnation flag (default 0.01).
   */
  constructor(stagnationWindow: number = 5, stagnationThreshold: number = 0.01) {
    this.stagnationWindow = stagnationWindow;
    this.stagnationThreshold = stagnationThreshold;
  }

  /**
   * Produce a full population analysis: diversity, fitness distribution,
   * convergence detection, and stagnation detection.
   *
   * @param seeds - Current population.
   * @returns PopulationAnalysis with all computed metrics.
   */
  analyzePopulation(seeds: readonly UniversalSeed[]): PopulationAnalysis {
    if (seeds.length === 0) {
      return {
        shannonDiversity: 0,
        fitnessDistribution: { mean: 0, standardDeviation: 0, min: 0, max: 0, median: 0 },
        isConverging: false,
        isStagnating: false,
        domainCount: 0,
        populationSize: 0,
      };
    }

    // Shannon diversity across gene-type distributions
    const typeCounts: Record<string, number> = {};
    for (const seed of seeds) {
      for (const gene of Object.values(seed.genes)) {
        typeCounts[gene.type] = (typeCounts[gene.type] ?? 0) + 1;
      }
    }
    const shannonDiversity = shannonIndex(Object.values(typeCounts));

    // Fitness distribution
    const fitnessValues = seeds.map((s) => extractPrimaryFitness(s.$fitness));
    const fitnessDistribution = computeDistribution(fitnessValues);

    // Domain count
    const domains = new Set(seeds.map((s) => s.$domain));

    // Convergence: check if the top quartile shares >80% scalar gene overlap
    const isConverging = this.detectConvergence(seeds);

    // Stagnation: can only be detected with historical data; for a snapshot, use fitness variance
    const isStagnating = fitnessDistribution.standardDeviation < 0.02
      && fitnessDistribution.mean > 0;

    return {
      shannonDiversity,
      fitnessDistribution,
      isConverging,
      isStagnating,
      domainCount: domains.size,
      populationSize: seeds.length,
    };
  }

  /**
   * Recommend an evolution strategy based on historical fitness data.
   *
   * Decision logic:
   * 1. If stagnating => increase mutation rate or switch to island model.
   * 2. If high diversity but low average fitness => use tournament selection.
   * 3. If converging rapidly => inject random individuals.
   * 4. If steady improvement => stay the course with minor elitism boost.
   *
   * @param stats - Array of per-generation statistics (oldest first).
   * @returns A prioritized StrategyRecommendation.
   */
  recommendStrategy(stats: readonly EvolutionStats[]): StrategyRecommendation {
    if (stats.length === 0) {
      return {
        strategy: 'increase_mutation',
        reason: 'No evolution history available. Starting with high exploration.',
        suggestedMutationRate: 0.15,
        confidence: 0.3,
      };
    }

    const isStagnating = this.detectStagnation(stats);
    const latest = stats[stats.length - 1]!;
    const diversity = latest.diversity;

    // Stagnation is the highest priority signal
    if (isStagnating) {
      // If diversity is already high and we're still stagnating, try island model
      if (diversity > 0.6) {
        return {
          strategy: 'island_model',
          reason: 'Population is stagnating despite high diversity. Island model may find new fitness peaks.',
          suggestedMutationRate: 0.12,
          confidence: 0.8,
        };
      }
      return {
        strategy: 'increase_mutation',
        reason: `Best fitness has not improved by >${(this.stagnationThreshold * 100).toFixed(0)}% in last ${this.stagnationWindow} generations.`,
        suggestedMutationRate: this.suggestMutationRate(stats),
        confidence: 0.85,
      };
    }

    // High diversity + low fitness = need exploitation
    if (diversity > 0.7 && latest.averageFitness < 0.3) {
      return {
        strategy: 'tournament_selection',
        reason: 'High diversity with low average fitness. Tournament selection will focus on promising individuals.',
        confidence: 0.75,
      };
    }

    // Rapid convergence = inject randomness
    if (stats.length >= 3) {
      const recentDiversities = stats.slice(-3).map((s) => s.diversity);
      const diversityDrop = (recentDiversities[0]! - recentDiversities[2]!) / (recentDiversities[0]! || 1);
      if (diversityDrop > 0.3) {
        return {
          strategy: 'inject_random',
          reason: `Diversity dropped ${(diversityDrop * 100).toFixed(0)}% in last 3 generations. Injecting random seeds to prevent premature convergence.`,
          suggestedPopulationSize: Math.ceil(latest.populationSize * 1.2),
          confidence: 0.7,
        };
      }
    }

    // Steady improvement: gentle elitism boost
    return {
      strategy: 'elitism_boost',
      reason: 'Evolution is progressing steadily. Slight elitism increase preserves best individuals.',
      confidence: 0.6,
    };
  }

  /**
   * Detect whether evolution has stagnated.
   *
   * Returns true if the best fitness over the last `stagnationWindow`
   * generations has not improved by more than `stagnationThreshold` (1%).
   *
   * @param stats - Generation history (oldest first).
   * @returns True if stagnating.
   */
  detectStagnation(stats: readonly EvolutionStats[]): boolean {
    if (stats.length < this.stagnationWindow) return false;

    const window = stats.slice(-this.stagnationWindow);
    const firstBest = window[0]!.bestFitness;
    const lastBest = window[window.length - 1]!.bestFitness;

    if (firstBest === 0) return lastBest === 0;
    const relativeImprovement = (lastBest - firstBest) / Math.abs(firstBest);
    return relativeImprovement <= this.stagnationThreshold;
  }

  /**
   * Suggest a mutation rate based on recent evolutionary trajectory.
   *
   * Heuristic:
   * - Stagnating => 0.15-0.25 (high exploration).
   * - Improving slowly => 0.08-0.12 (moderate).
   * - Improving rapidly => 0.03-0.06 (preserve gains).
   *
   * @param stats - Generation history (oldest first).
   * @returns Suggested mutation rate in [0.01, 0.30].
   */
  suggestMutationRate(stats: readonly EvolutionStats[]): number {
    if (stats.length < 2) return 0.10;

    const recent = stats.slice(-Math.min(this.stagnationWindow, stats.length));
    const firstBest = recent[0]!.bestFitness;
    const lastBest = recent[recent.length - 1]!.bestFitness;

    if (firstBest === 0) {
      return lastBest === 0 ? 0.25 : 0.10;
    }

    const relativeImprovement = (lastBest - firstBest) / Math.abs(firstBest);

    if (relativeImprovement <= this.stagnationThreshold) {
      // Stagnating: high mutation
      return Math.min(0.25, 0.15 + (1 - (recent[recent.length - 1]!.diversity || 0)) * 0.10);
    }

    if (relativeImprovement < 0.05) {
      // Slow improvement
      return 0.10;
    }

    // Rapid improvement: low mutation to preserve gains
    return Math.max(0.03, 0.06 - relativeImprovement * 0.1);
  }

  // ─── Private ─────────────────────────────────

  /**
   * Detect convergence by comparing scalar gene values across top-quartile seeds.
   */
  private detectConvergence(seeds: readonly UniversalSeed[]): boolean {
    if (seeds.length < 4) return false;

    // Sort by fitness descending, take top quartile
    const sorted = [...seeds].sort(
      (a, b) => extractPrimaryFitness(b.$fitness) - extractPrimaryFitness(a.$fitness),
    );
    const topCount = Math.max(2, Math.floor(sorted.length / 4));
    const topSeeds = sorted.slice(0, topCount);

    // Collect all scalar gene names across top seeds
    const scalarGeneNames = new Set<string>();
    for (const seed of topSeeds) {
      for (const [name, gene] of Object.entries(seed.genes)) {
        if (gene.type === 'scalar') scalarGeneNames.add(name);
      }
    }

    if (scalarGeneNames.size === 0) return false;

    // For each gene, compute coefficient of variation among top seeds
    let lowVarianceCount = 0;
    let totalChecked = 0;

    for (const name of scalarGeneNames) {
      const values: number[] = [];
      for (const seed of topSeeds) {
        const gene = seed.genes[name];
        if (gene?.type === 'scalar') {
          values.push(gene.value);
        }
      }
      if (values.length < 2) continue;

      totalChecked++;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      if (mean === 0) {
        // All zeros = converged
        lowVarianceCount++;
        continue;
      }
      const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
      const cv = Math.sqrt(variance) / Math.abs(mean);
      if (cv < 0.1) lowVarianceCount++;
    }

    return totalChecked > 0 && lowVarianceCount / totalChecked > 0.8;
  }
}
