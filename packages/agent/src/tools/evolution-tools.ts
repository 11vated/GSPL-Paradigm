/**
 * Evolution tools for the GSPL agent.
 *
 * These tools control the evolutionary process — starting runs, monitoring
 * status, analyzing fitness landscapes, and getting strategy recommendations.
 *
 * @packageDocumentation
 */

import type { AgentTool, AgentToolResult } from './seed-tools.js';

/** All evolution-related tools. */
export const evolutionTools: AgentTool[] = [
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
          '"rank" (rank-based), "elitist" (top-N survive). Default: "tournament".',
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

      const generations = (args['generations'] as number | undefined) ?? 50;
      const populationSize = (args['populationSize'] as number | undefined) ?? 20;

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

      return {
        success: true,
        data: {
          description:
            `Evolution started: ${String(generations)} generations, ` +
            `population ${String(populationSize)}, template "${templateHash}". ` +
            'Pending WebEngine connection for execution.',
        },
      };
    },
  },

  {
    name: 'evolution_status',
    description:
      'Get the current status of an active evolution run — current generation, ' +
      'best fitness, average fitness, convergence metrics, and estimated time remaining.',
    parameters: {
      runId: {
        type: 'string',
        description:
          'ID of the evolution run to query. If omitted, returns status of the most recent run.',
        required: false,
      },
    },
    execute: async (_args: Record<string, unknown>): Promise<AgentToolResult> => {
      return {
        success: true,
        data: {
          description: 'Evolution status requested. Pending WebEngine connection for retrieval.',
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
    execute: async (_args: Record<string, unknown>): Promise<AgentToolResult> => {
      return {
        success: true,
        data: {
          description:
            'Fitness landscape analysis requested. Pending WebEngine connection for computation.',
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
    execute: async (_args: Record<string, unknown>): Promise<AgentToolResult> => {
      return {
        success: true,
        data: {
          description:
            'Strategy recommendation requested. Pending WebEngine connection for history analysis.',
        },
      };
    },
  },
];
