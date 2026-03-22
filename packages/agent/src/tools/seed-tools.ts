/**
 * Seed manipulation tools for the GSPL agent.
 *
 * These tools allow the agent to create, inspect, mutate, breed, compare,
 * and list seeds — the fundamental units of the GSPL paradigm.
 *
 * @packageDocumentation
 */

/** Result returned by every agent tool execution. */
export interface AgentToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Schema for a single tool parameter. */
export interface ToolParameterSchema {
  type: string;
  description: string;
  required?: boolean;
}

/** Definition of an agent-callable tool. */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameterSchema>;
  execute: (args: Record<string, unknown>) => Promise<AgentToolResult>;
}

/** All seed-related tools. */
export const seedTools: AgentTool[] = [
  {
    name: 'seed_create',
    description:
      'Create a new Universal Seed with a name, domain, and optional initial genes. ' +
      'Returns the created seed hash and metadata.',
    parameters: {
      name: {
        type: 'string',
        description: 'Human-readable name for the seed (e.g. "Fire Mage", "REST API")',
        required: true,
      },
      domain: {
        type: 'string',
        description:
          'Domain the seed belongs to: character, creature, item, environment, ' +
          'mechanic, narrative, ui, system, or custom',
        required: true,
      },
      genes: {
        type: 'object',
        description:
          'Optional initial gene map. Keys are gene names, values are gene definitions ' +
          'with { type, value } where type is scalar | categorical | vector',
        required: false,
      },
      description: {
        type: 'string',
        description: 'Optional natural-language description of what this seed represents',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const name = args['name'] as string | undefined;
      const domain = args['domain'] as string | undefined;

      if (!name || !domain) {
        return {
          success: false,
          error: 'Both "name" and "domain" are required to create a seed.',
        };
      }

      return {
        success: true,
        data: {
          description: `Seed "${name}" created in domain "${domain}". ` +
            'Pending WebEngine connection for persistent storage.',
        },
      };
    },
  },

  {
    name: 'seed_inspect',
    description:
      'Get full details of a seed by its hash — genes, fitness, lineage, metadata.',
    parameters: {
      hash: {
        type: 'string',
        description: 'The unique hash identifier of the seed to inspect',
        required: true,
      },
      includeLineage: {
        type: 'boolean',
        description: 'Whether to include full parent/child lineage tree (default: false)',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const hash = args['hash'] as string | undefined;

      if (!hash) {
        return { success: false, error: '"hash" is required to inspect a seed.' };
      }

      return {
        success: true,
        data: {
          description: `Inspection requested for seed "${hash}". ` +
            'Pending WebEngine connection for data retrieval.',
        },
      };
    },
  },

  {
    name: 'seed_mutate',
    description:
      'Mutate a seed at a given intensity. Creates a new seed derived from the original ' +
      'with randomly altered genes proportional to the intensity.',
    parameters: {
      hash: {
        type: 'string',
        description: 'Hash of the seed to mutate',
        required: true,
      },
      intensity: {
        type: 'number',
        description:
          'Mutation intensity from 0.0 (no change) to 1.0 (maximum deviation). ' +
          'Typical values: 0.1 for fine-tuning, 0.3 for moderate variation, 0.7+ for exploration.',
        required: true,
      },
      targetGenes: {
        type: 'array',
        description:
          'Optional list of specific gene names to mutate. If omitted, all genes are candidates.',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const hash = args['hash'] as string | undefined;
      const intensity = args['intensity'] as number | undefined;

      if (!hash || intensity === undefined) {
        return {
          success: false,
          error: 'Both "hash" and "intensity" are required to mutate a seed.',
        };
      }

      if (intensity < 0 || intensity > 1) {
        return {
          success: false,
          error: `Intensity must be between 0.0 and 1.0, got ${String(intensity)}.`,
        };
      }

      return {
        success: true,
        data: {
          description: `Mutation of seed "${hash}" at intensity ${String(intensity)} queued. ` +
            'Pending WebEngine connection.',
        },
      };
    },
  },

  {
    name: 'seed_breed',
    description:
      'Breed two parent seeds together via genetic crossover. Produces one or more ' +
      'offspring seeds that combine genes from both parents.',
    parameters: {
      parentA: {
        type: 'string',
        description: 'Hash of the first parent seed',
        required: true,
      },
      parentB: {
        type: 'string',
        description: 'Hash of the second parent seed',
        required: true,
      },
      crossoverStrategy: {
        type: 'string',
        description:
          'Crossover method: "uniform" (random per-gene), "single_point" (split at one point), ' +
          '"two_point" (split at two points), or "blend" (interpolate scalar genes). Default: "uniform".',
        required: false,
      },
      offspringCount: {
        type: 'number',
        description: 'Number of offspring to produce (default: 1, max: 10)',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const parentA = args['parentA'] as string | undefined;
      const parentB = args['parentB'] as string | undefined;

      if (!parentA || !parentB) {
        return {
          success: false,
          error: 'Both "parentA" and "parentB" hashes are required to breed seeds.',
        };
      }

      return {
        success: true,
        data: {
          description: `Breeding of seeds "${parentA}" and "${parentB}" queued. ` +
            'Pending WebEngine connection for crossover execution.',
        },
      };
    },
  },

  {
    name: 'seed_compare',
    description:
      'Compare two seeds side-by-side — gene differences, fitness delta, domain compatibility, ' +
      'and breeding potential.',
    parameters: {
      hashA: {
        type: 'string',
        description: 'Hash of the first seed to compare',
        required: true,
      },
      hashB: {
        type: 'string',
        description: 'Hash of the second seed to compare',
        required: true,
      },
      metrics: {
        type: 'array',
        description:
          'Optional list of specific comparison metrics: "genes", "fitness", "lineage", ' +
          '"compatibility". Default: all metrics.',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const hashA = args['hashA'] as string | undefined;
      const hashB = args['hashB'] as string | undefined;

      if (!hashA || !hashB) {
        return {
          success: false,
          error: 'Both "hashA" and "hashB" are required to compare seeds.',
        };
      }

      return {
        success: true,
        data: {
          description: `Comparison of seeds "${hashA}" and "${hashB}" queued. ` +
            'Pending WebEngine connection for analysis.',
        },
      };
    },
  },

  {
    name: 'seed_list',
    description:
      'List all seeds in the current session, optionally filtered by domain. ' +
      'Returns hashes, names, domains, and fitness summaries.',
    parameters: {
      domain: {
        type: 'string',
        description:
          'Optional domain filter: character, creature, item, environment, mechanic, ' +
          'narrative, ui, system, or custom. Omit to list all domains.',
        required: false,
      },
      sortBy: {
        type: 'string',
        description:
          'Sort order: "created" (newest first), "fitness" (highest first), ' +
          '"name" (alphabetical). Default: "created".',
        required: false,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of seeds to return (default: 50)',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const domain = args['domain'] as string | undefined;
      const filterMsg = domain ? ` filtered by domain "${domain}"` : '';

      return {
        success: true,
        data: {
          description: `Seed listing${filterMsg} requested. ` +
            'Pending WebEngine connection for retrieval.',
        },
      };
    },
  },
];
