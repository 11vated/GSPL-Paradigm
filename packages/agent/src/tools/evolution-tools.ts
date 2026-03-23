/**
 * Evolution tools for the GSPL agent.
 *
 * These tools control the evolutionary process — starting runs, monitoring
 * status, analyzing fitness landscapes, and getting strategy recommendations.
 *
 * @packageDocumentation
 */

import type { UniversalSeed } from '@paradigm/types';
import { EvolutionEngine } from '@paradigm/evolution';
import type { EvolutionStats } from '@paradigm/evolution';
import type { AgentTool, AgentToolResult } from './seed-tools.js';
import type { ToolContext } from './tool-context.js';

// ─────────────────────────────────────────────
// Module-level evolution state
// ─────────────────────────────────────────────

interface EvolutionRun {
  id: string;
  templateHash: string;
  population: UniversalSeed[];
  stats: EvolutionStats[];
  best: UniversalSeed;
  config: {
    generations: number;
    populationSize: number;
    mutationRate: number;
    selectionStrategy: string;
  };
  startedAt: number;
}

const evolutionRuns: Map<string, EvolutionRun> = new Map();
let runCounter: number = 0;

/** Simple fitness function: average of all scalar gene values normalized to [0,1]. */
function defaultFitnessFunction(seed: UniversalSeed): number {
  const genes = Object.values(seed.genes);
  const scalars = genes.filter((g): g is Extract<typeof g, { type: 'scalar' }> => g.type === 'scalar');
  if (scalars.length === 0) return 0.5;
  const sum = scalars.reduce((acc, g) => {
    const range = g.max - g.min;
    if (range === 0) return acc + 1;
    return acc + (g.value - g.min) / range;
  }, 0);
  return sum / scalars.length;
}

/** Get the most recent evolution run. */
function getLatestRun(): EvolutionRun | undefined {
  let latest: EvolutionRun | undefined;
  for (const run of evolutionRuns.values()) {
    if (!latest || run.startedAt > latest.startedAt) {
      latest = run;
    }
  }
  return latest;
}

// ─────────────────────────────────────────────
// Evolution tool factory
// ─────────────────────────────────────────────

/** Create all evolution-related tools with injected context. */
export function createEvolutionTools(ctx: ToolContext): AgentTool[] {
  return [
    {
      name: 'evolution_start',
      description:
        'Start an evolution run with the given configuration. Seeds in the initial population ' +
        'undergo selection, crossover, and mutation across generations to optimize fitness.',
      parameters: {
        templateHash: {
          type: 'string',
          description: 'Hash of the template seed used to spawn the initial population',
          required: true,
        },
        generations: {
          type: 'number',
          description: 'Number of generations to evolve (1-1000, default: 50)',
          required: false,
        },
        populationSize: {
          type: 'number',
          description: 'Number of seeds per generation (4-500, default: 20)',
          required: false,
        },
        mutationRate: {
          type: 'number',
          description:
            'Probability of mutating each gene per generation (0.0-1.0, default: 0.1). ' +
            'Higher values increase exploration but reduce convergence speed.',
          required: false,
        },
        selectionStrategy: {
          type: 'string',
          description:
            'Selection method: "tournament" (k-way tournament), "roulette" (fitness-proportionate), ' +
            '"rank" (rank-based), "truncation" (top-N survive). Default: "tournament".',
          required: false,
        },
        fitnessWeights: {
          type: 'object',
          description:
            'Optional weights for multi-objective fitness. Keys are fitness dimension names, ' +
            'values are numeric weights (e.g. { "coherence": 0.4, "novelty": 0.3, "utility": 0.3 }).',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const templateHash = args['templateHash'] as string | undefined;

        if (!templateHash) {
          return {
            success: false,
            error: '"templateHash" is required to start an evolution run.',
          };
        }

        const template = ctx.getSeed(templateHash);
        if (!template) {
          return {
            success: false,
            error: `Template seed "${templateHash}" not found. Create a seed first with seed_create.`,
          };
        }

        const generations = (args['generations'] as number | undefined) ?? 50;
        const populationSize = (args['populationSize'] as number | undefined) ?? 20;
        const mutationRate = (args['mutationRate'] as number | undefined) ?? 0.1;
        const selectionStrategy = (args['selectionStrategy'] as string | undefined) ?? 'tournament';

        if (generations < 1 || generations > 1000) {
          return {
            success: false,
            error: `Generations must be between 1 and 1000, got ${String(generations)}.`,
          };
        }

        if (populationSize < 4 || populationSize > 500) {
          return {
            success: false,
            error: `Population size must be between 4 and 500, got ${String(populationSize)}.`,
          };
        }

        const engine = new EvolutionEngine(
          {
            populationSize,
            generations,
            mutationRate,
            selectionStrategy: selectionStrategy as 'tournament' | 'roulette' | 'rank' | 'truncation',
          },
          ctx.rng.fork(`evolution-${templateHash}-${runCounter}`),
        );

        const result = engine.run(template, defaultFitnessFunction);

        // Store the best seed and all final population members
        ctx.saveSeed(result.best);
        for (const seed of result.population) {
          ctx.saveSeed(seed);
        }

        runCounter++;
        const runId = `evo-${runCounter}`;

        const run: EvolutionRun = {
          id: runId,
          templateHash,
          population: result.population,
          stats: result.stats,
          best: result.best,
          config: { generations, populationSize, mutationRate, selectionStrategy },
          startedAt: Date.now(),
        };

        evolutionRuns.set(runId, run);

        const lastStats = result.stats[result.stats.length - 1];
        ctx.eventBus.emit({
          type: 'evolution.tick',
          generation: generations,
          populationSize: result.population.length,
          bestFitness: lastStats?.bestFitness ?? 0,
          avgFitness: lastStats?.avgFitness ?? 0,
          diversity: lastStats?.diversity ?? 0,
          timestamp: Date.now(),
        });

        return {
          success: true,
          data: {
            runId,
            generations,
            populationSize,
            mutationRate,
            selectionStrategy,
            bestSeed: {
              hash: result.best.$hash,
              name: result.best.$name,
              fitness: result.best.$fitness?.['primary'] ?? null,
            },
            finalStats: lastStats
              ? {
                  bestFitness: Math.round(lastStats.bestFitness * 1000) / 1000,
                  avgFitness: Math.round(lastStats.avgFitness * 1000) / 1000,
                  diversity: Math.round(lastStats.diversity * 1000) / 1000,
                  populationSize: lastStats.populationSize,
                }
              : null,
            populationStored: result.population.length,
          },
        };
      },
    },

    {
      name: 'evolution_status',
      description:
        'Get the current status of an evolution run — generation count, ' +
        'best fitness, average fitness, convergence metrics.',
      parameters: {
        runId: {
          type: 'string',
          description:
            'ID of the evolution run to query. If omitted, returns status of the most recent run.',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const runId = args['runId'] as string | undefined;
        const run = runId ? evolutionRuns.get(runId) : getLatestRun();

        if (!run) {
          return {
            success: false,
            error: runId
              ? `Evolution run "${runId}" not found.`
              : 'No evolution runs have been started. Use evolution_start first.',
          };
        }

        const lastStats = run.stats[run.stats.length - 1];

        return {
          success: true,
          data: {
            runId: run.id,
            templateHash: run.templateHash,
            config: run.config,
            generationsCompleted: run.stats.length,
            populationSize: run.population.length,
            bestSeed: {
              hash: run.best.$hash,
              name: run.best.$name,
              fitness: run.best.$fitness?.['primary'] ?? null,
            },
            latestStats: lastStats
              ? {
                  generation: lastStats.generation,
                  bestFitness: Math.round(lastStats.bestFitness * 1000) / 1000,
                  avgFitness: Math.round(lastStats.avgFitness * 1000) / 1000,
                  worstFitness: Math.round(lastStats.worstFitness * 1000) / 1000,
                  diversity: Math.round(lastStats.diversity * 1000) / 1000,
                }
              : null,
            startedAt: new Date(run.startedAt).toISOString(),
          },
        };
      },
    },

    {
      name: 'evolution_analyze',
      description:
        'Analyze the fitness landscape of the current population. Returns diversity metrics, ' +
        'fitness distribution, gene frequency analysis, and identification of local optima.',
      parameters: {
        runId: {
          type: 'string',
          description: 'ID of the evolution run to analyze. If omitted, uses most recent run.',
          required: false,
        },
        depth: {
          type: 'string',
          description:
            'Analysis depth: "summary" (key metrics only), "standard" (metrics + distributions), ' +
            '"deep" (full landscape mapping with gene correlations). Default: "standard".',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const runId = args['runId'] as string | undefined;
        const run = runId ? evolutionRuns.get(runId) : getLatestRun();

        if (!run) {
          return {
            success: false,
            error: runId
              ? `Evolution run "${runId}" not found.`
              : 'No evolution runs available. Use evolution_start first.',
          };
        }

        const depth = (args['depth'] as string | undefined) ?? 'standard';
        const population = run.population;

        // Compute fitness distribution
        const fitnesses = population.map((s) => s.$fitness?.['primary'] ?? 0);
        const sorted = [...fitnesses].sort((a, b) => a - b);
        const mean = fitnesses.reduce((a, b) => a + b, 0) / (fitnesses.length || 1);
        const variance = fitnesses.reduce((a, v) => a + (v - mean) ** 2, 0) / (fitnesses.length || 1);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
          : sorted[mid] ?? 0;

        const fitnessDistribution = {
          mean: Math.round(mean * 1000) / 1000,
          stdDev: Math.round(Math.sqrt(variance) * 1000) / 1000,
          min: sorted[0] ?? 0,
          max: sorted[sorted.length - 1] ?? 0,
          median: Math.round(median * 1000) / 1000,
        };

        // Domain distribution
        const domainCounts: Record<string, number> = {};
        for (const seed of population) {
          domainCounts[seed.$domain] = (domainCounts[seed.$domain] ?? 0) + 1;
        }

        // Gene frequency analysis (for standard and deep)
        let geneFrequency: Record<string, number> | undefined;
        if (depth !== 'summary') {
          geneFrequency = {};
          for (const seed of population) {
            for (const key of Object.keys(seed.genes)) {
              geneFrequency[key] = (geneFrequency[key] ?? 0) + 1;
            }
          }
          for (const key of Object.keys(geneFrequency)) {
            geneFrequency[key] = Math.round((geneFrequency[key]! / population.length) * 1000) / 1000;
          }
        }

        // Convergence trend (for deep)
        let convergenceTrend: Array<{ generation: number; diversity: number; bestFitness: number }> | undefined;
        if (depth === 'deep' && run.stats.length > 0) {
          const step = Math.max(1, Math.floor(run.stats.length / 20));
          convergenceTrend = run.stats
            .filter((_, i) => i % step === 0 || i === run.stats.length - 1)
            .map((s) => ({
              generation: s.generation,
              diversity: Math.round(s.diversity * 1000) / 1000,
              bestFitness: Math.round(s.bestFitness * 1000) / 1000,
            }));
        }

        return {
          success: true,
          data: {
            runId: run.id,
            depth,
            populationSize: population.length,
            fitnessDistribution,
            domainDistribution: domainCounts,
            ...(geneFrequency ? { geneFrequency } : {}),
            ...(convergenceTrend ? { convergenceTrend } : {}),
          },
        };
      },
    },

    {
      name: 'evolution_recommend',
      description:
        'Get a strategy recommendation based on the fitness history of the current or specified ' +
        'evolution run. Suggests parameter adjustments (mutation rate, selection pressure, population ' +
        'size) to improve convergence or exploration.',
      parameters: {
        runId: {
          type: 'string',
          description: 'ID of the evolution run to recommend for. If omitted, uses most recent run.',
          required: false,
        },
        objective: {
          type: 'string',
          description:
            'What to optimize for: "convergence" (faster to optimum), "diversity" (broader search), ' +
            '"novelty" (new unexplored regions), "balance" (all factors). Default: "balance".',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const runId = args['runId'] as string | undefined;
        const run = runId ? evolutionRuns.get(runId) : getLatestRun();

        if (!run) {
          return {
            success: false,
            error: runId
              ? `Evolution run "${runId}" not found.`
              : 'No evolution runs available. Use evolution_start first.',
          };
        }

        const objective = (args['objective'] as string | undefined) ?? 'balance';
        const stats = run.stats;

        if (stats.length === 0) {
          return {
            success: true,
            data: {
              runId: run.id,
              objective,
              recommendation: {
                strategy: 'increase_mutation',
                reason: 'No evolution history available yet. Start with higher exploration.',
                suggestedMutationRate: 0.15,
                confidence: 0.3,
              },
            },
          };
        }

        // Detect stagnation
        const windowSize = Math.min(5, stats.length);
        const recentStats = stats.slice(-windowSize);
        const firstBest = recentStats[0]!.bestFitness;
        const lastBest = recentStats[recentStats.length - 1]!.bestFitness;
        const improvement = firstBest === 0 ? (lastBest > 0 ? 1 : 0) : (lastBest - firstBest) / Math.abs(firstBest);

        const latestDiversity = stats[stats.length - 1]!.diversity;
        const latestAvgFitness = stats[stats.length - 1]!.avgFitness;

        let strategy: string;
        let reason: string;
        let suggestedMutationRate: number | undefined;
        let suggestedPopulationSize: number | undefined;
        let confidence: number;

        const isStagnating = stats.length >= 5 && improvement <= 0.01;

        if (isStagnating && latestDiversity > 0.6) {
          strategy = 'island_model';
          reason = 'Population is stagnating despite high diversity. Island model may find new fitness peaks.';
          suggestedMutationRate = 0.12;
          confidence = 0.8;
        } else if (isStagnating) {
          strategy = 'increase_mutation';
          reason = `Best fitness has not improved by >1% in last ${windowSize} generations. Increase exploration.`;
          suggestedMutationRate = Math.min(0.25, run.config.mutationRate * 1.5);
          confidence = 0.85;
        } else if (latestDiversity > 0.7 && latestAvgFitness < 0.3) {
          strategy = 'tournament_selection';
          reason = 'High diversity with low average fitness. Tournament selection will focus on promising individuals.';
          confidence = 0.75;
        } else if (stats.length >= 3) {
          const recentDiversities = stats.slice(-3).map((s) => s.diversity);
          const diversityDrop = (recentDiversities[0]! - recentDiversities[2]!) / (recentDiversities[0]! || 1);
          if (diversityDrop > 0.3) {
            strategy = 'inject_random';
            reason = `Diversity dropped ${(diversityDrop * 100).toFixed(0)}% in last 3 generations. Inject random seeds.`;
            suggestedPopulationSize = Math.ceil(run.config.populationSize * 1.2);
            confidence = 0.7;
          } else {
            strategy = 'elitism_boost';
            reason = 'Evolution is progressing steadily. Slight elitism increase preserves best individuals.';
            confidence = 0.6;
          }
        } else {
          strategy = 'elitism_boost';
          reason = 'Evolution is progressing steadily. Slight elitism increase preserves best individuals.';
          confidence = 0.6;
        }

        return {
          success: true,
          data: {
            runId: run.id,
            objective,
            recommendation: {
              strategy,
              reason,
              ...(suggestedMutationRate !== undefined ? { suggestedMutationRate } : {}),
              ...(suggestedPopulationSize !== undefined ? { suggestedPopulationSize } : {}),
              confidence,
            },
            currentStats: {
              bestFitness: Math.round(lastBest * 1000) / 1000,
              diversity: Math.round(latestDiversity * 1000) / 1000,
              avgFitness: Math.round(latestAvgFitness * 1000) / 1000,
              generationsCompleted: stats.length,
              isStagnating,
            },
          },
        };
      },
    },
  ];
}
