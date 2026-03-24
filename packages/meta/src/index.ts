/**
 * @paradigm/meta — Meta-learning engine.
 *
 * GSPL learns from past evolution experiments to optimize future searches.
 * Tracks per-gene mutation success rates, recommends strategies via UCB1
 * bandit algorithm, and predicts evolution convergence.
 *
 * @packageDocumentation
 */

import { DeterministicRNG } from '@paradigm/rng';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface ExperimentRecord {
  readonly id: string;
  readonly domain: string;
  readonly strategy: string;
  readonly populationSize: number;
  readonly mutationRate: number;
  readonly generations: number;
  readonly fitnessTrajectory: readonly number[];
  readonly finalFitness: number;
  readonly geneConfigs: Record<string, number>;
  readonly timestamp: number;
}

export interface MutationAnalysis {
  readonly geneName: string;
  readonly attempts: number;
  readonly successes: number;
  readonly successRate: number;
  readonly confidenceLow: number;
  readonly confidenceHigh: number;
  readonly classification: 'beneficial' | 'harmful' | 'neutral';
}

export interface StrategyRecommendation {
  readonly domain: string;
  readonly recommendedMutationRate: number;
  readonly recommendedPopulationSize: number;
  readonly recommendedStrategy: string;
  readonly confidence: number;
  readonly basedOnExperiments: number;
}

// ═══════════════════════════════════════════════════════════════════
// ExperimentLog — Append-only experiment storage
// ═══════════════════════════════════════════════════════════════════

export class ExperimentLog {
  private readonly experiments: ExperimentRecord[] = [];

  record(experiment: ExperimentRecord): void {
    this.experiments.push(experiment);
  }

  getAll(): readonly ExperimentRecord[] {
    return this.experiments;
  }

  getByDomain(domain: string): ExperimentRecord[] {
    return this.experiments.filter((e) => e.domain === domain);
  }

  getByMinFitness(threshold: number): ExperimentRecord[] {
    return this.experiments.filter((e) => e.finalFitness >= threshold);
  }

  getByStrategy(strategy: string): ExperimentRecord[] {
    return this.experiments.filter((e) => e.strategy === strategy);
  }

  get size(): number { return this.experiments.length; }
}

// ═══════════════════════════════════════════════════════════════════
// MutationAnalyzer — Per-gene success rate tracking
// ═══════════════════════════════════════════════════════════════════

export class MutationAnalyzer {
  private readonly geneStats: Map<string, { attempts: number; successes: number }> = new Map();

  /** Record a mutation result (did fitness improve?). */
  recordMutation(geneName: string, improved: boolean): void {
    let stats = this.geneStats.get(geneName);
    if (!stats) {
      stats = { attempts: 0, successes: 0 };
      this.geneStats.set(geneName, stats);
    }
    stats.attempts++;
    if (improved) stats.successes++;
  }

  /** Analyze a gene's mutation effectiveness. Uses 95% binomial CI. */
  analyze(geneName: string): MutationAnalysis | null {
    const stats = this.geneStats.get(geneName);
    if (!stats || stats.attempts === 0) return null;

    const p = stats.successes / stats.attempts;
    const z = 1.96; // 95% CI
    const n = stats.attempts;

    // Wilson score interval
    const denominator = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denominator;
    const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denominator;

    const confidenceLow = Math.max(0, center - spread);
    const confidenceHigh = Math.min(1, center + spread);

    let classification: 'beneficial' | 'harmful' | 'neutral';
    if (confidenceLow > 0.5) classification = 'beneficial';
    else if (confidenceHigh < 0.5) classification = 'harmful';
    else classification = 'neutral';

    return {
      geneName,
      attempts: stats.attempts,
      successes: stats.successes,
      successRate: p,
      confidenceLow,
      confidenceHigh,
      classification,
    };
  }

  /** Get all analyzed genes sorted by success rate. */
  analyzeAll(): MutationAnalysis[] {
    const results: MutationAnalysis[] = [];
    for (const geneName of this.geneStats.keys()) {
      const analysis = this.analyze(geneName);
      if (analysis) results.push(analysis);
    }
    return results.sort((a, b) => b.successRate - a.successRate);
  }
}

// ═══════════════════════════════════════════════════════════════════
// StrategyOptimizer — UCB1 bandit for parameter selection
// ═══════════════════════════════════════════════════════════════════

interface ArmStats {
  pulls: number;
  totalReward: number;
}

export class StrategyOptimizer {
  private readonly arms: Map<string, ArmStats> = new Map();
  private totalPulls = 0;

  /** Record the result of a strategy trial. Reward = final fitness [0,1]. */
  recordTrial(strategyKey: string, reward: number): void {
    let arm = this.arms.get(strategyKey);
    if (!arm) {
      arm = { pulls: 0, totalReward: 0 };
      this.arms.set(strategyKey, arm);
    }
    arm.pulls++;
    arm.totalReward += reward;
    this.totalPulls++;
  }

  /** Recommend the best strategy using UCB1. */
  recommend(): { strategyKey: string; score: number } | null {
    if (this.arms.size === 0) return null;

    let bestKey = '';
    let bestScore = -Infinity;

    for (const [key, arm] of this.arms) {
      if (arm.pulls === 0) return { strategyKey: key, score: Infinity }; // Explore untried

      const avgReward = arm.totalReward / arm.pulls;
      const exploration = Math.sqrt(2 * Math.log(this.totalPulls) / arm.pulls);
      const ucb1Score = avgReward + exploration;

      if (ucb1Score > bestScore) {
        bestScore = ucb1Score;
        bestKey = key;
      }
    }

    return { strategyKey: bestKey, score: bestScore };
  }

  /** Seed with known strategy options. */
  registerStrategies(keys: string[]): void {
    for (const key of keys) {
      if (!this.arms.has(key)) {
        this.arms.set(key, { pulls: 0, totalReward: 0 });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// ConvergencePredictor — Detect fitness plateaus
// ═══════════════════════════════════════════════════════════════════

export interface ConvergencePrediction {
  readonly plateauDetected: boolean;
  readonly estimatedFinalFitness: number;
  readonly estimatedGenerationsRemaining: number;
  readonly improvementRate: number;
}

export class ConvergencePredictor {
  /**
   * Predict convergence from a fitness trajectory.
   * Fits exponential decay to improvement rate.
   */
  predict(trajectory: readonly number[], lookback: number = 10): ConvergencePrediction {
    if (trajectory.length < 3) {
      return { plateauDetected: false, estimatedFinalFitness: 0, estimatedGenerationsRemaining: 100, improvementRate: 1.0 };
    }

    const recent = trajectory.slice(-lookback);
    const improvements: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      improvements.push((recent[i]! - recent[i - 1]!) / Math.max(0.001, recent[i - 1]!));
    }

    const avgImprovement = improvements.length > 0
      ? improvements.reduce((s, v) => s + v, 0) / improvements.length
      : 0;

    const plateauDetected = Math.abs(avgImprovement) < 0.001 && trajectory.length > 10;
    const currentFitness = trajectory[trajectory.length - 1] ?? 0;

    // Simple exponential decay estimate
    const estimatedFinal = plateauDetected ? currentFitness : currentFitness * (1 + avgImprovement * 20);
    const estimatedRemaining = plateauDetected ? 0 : Math.ceil(Math.abs(1.0 / Math.max(0.0001, avgImprovement)));

    return {
      plateauDetected,
      estimatedFinalFitness: Math.min(1, estimatedFinal),
      estimatedGenerationsRemaining: Math.min(1000, estimatedRemaining),
      improvementRate: avgImprovement,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// MetaLearningCoordinator — Orchestrates all subsystems
// ═══════════════════════════════════════════════════════════════════

export class MetaLearningCoordinator {
  readonly experiments = new ExperimentLog();
  readonly mutations = new MutationAnalyzer();
  readonly strategies = new StrategyOptimizer();
  readonly convergence = new ConvergencePredictor();

  /** Record a completed evolution experiment. */
  learn(experiment: ExperimentRecord): void {
    this.experiments.record(experiment);
    this.strategies.recordTrial(
      `${experiment.domain}:${experiment.strategy}:mr${experiment.mutationRate.toFixed(2)}`,
      experiment.finalFitness,
    );
  }

  /** Get recommendation for a domain. */
  recommend(domain: string): StrategyRecommendation {
    const domainExperiments = this.experiments.getByDomain(domain);
    const best = this.strategies.recommend();

    if (domainExperiments.length === 0 || !best) {
      return {
        domain,
        recommendedMutationRate: 0.1,
        recommendedPopulationSize: 20,
        recommendedStrategy: 'tournament',
        confidence: 0,
        basedOnExperiments: 0,
      };
    }

    // Parse strategy key
    const parts = best.strategyKey.split(':');
    const strategy = parts[1] ?? 'tournament';
    const mutationRate = parseFloat(parts[2]?.replace('mr', '') ?? '0.1');

    // Average population size from successful experiments
    const avgPop = domainExperiments.reduce((s, e) => s + e.populationSize, 0) / domainExperiments.length;

    return {
      domain,
      recommendedMutationRate: mutationRate,
      recommendedPopulationSize: Math.round(avgPop),
      recommendedStrategy: strategy,
      confidence: Math.min(1, domainExperiments.length / 10),
      basedOnExperiments: domainExperiments.length,
    };
  }

  /** Predict convergence for an active run. */
  predictConvergence(trajectory: readonly number[]): ConvergencePrediction {
    return this.convergence.predict(trajectory);
  }
}
