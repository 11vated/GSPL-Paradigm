/**
 * World tools for the GSPL agent.
 *
 * These tools manage simulated worlds — environments where seeds exist as entities
 * and can interact, triggering emergent behaviors and system-level dynamics.
 *
 * @packageDocumentation
 */

import type { AgentTool, AgentToolResult } from './seed-tools.js';

/** All world-related tools. */
export const worldTools: AgentTool[] = [
  {
    name: 'world_create',
    description:
      'Create a new simulated world with a theme and optional constraints. ' +
      'Worlds are sandboxed environments where seeds interact as entities.',
    parameters: {
      name: {
        type: 'string',
        description: 'Name for the world (e.g. "Medieval Fantasy Realm", "Space Station Alpha")',
        required: true,
      },
      theme: {
        type: 'string',
        description:
          'Natural-language description of the world\'s theme, rules, and atmosphere. ' +
          'Influences how entities interact and what behaviors emerge.',
        required: true,
      },
      dimensions: {
        type: 'object',
        description:
          'Optional world dimensions: { width: number, height: number, depth?: number }. ' +
          'Defines spatial bounds for entity placement. Default: { width: 100, height: 100 }.',
        required: false,
      },
      maxEntities: {
        type: 'number',
        description: 'Maximum number of entities the world can hold (default: 50)',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const name = args['name'] as string | undefined;
      const theme = args['theme'] as string | undefined;

      if (!name || !theme) {
        return {
          success: false,
          error: 'Both "name" and "theme" are required to create a world.',
        };
      }

      return {
        success: true,
        data: {
          description:
            `World "${name}" created with theme: "${theme}". ` +
            'Pending WebEngine connection for simulation initialization.',
        },
      };
    },
  },

  {
    name: 'world_add_entity',
    description:
      'Add a seed to a world as an active entity. The seed\'s genes determine the ' +
      'entity\'s behaviors, properties, and interaction capabilities within the world.',
    parameters: {
      worldId: {
        type: 'string',
        description: 'ID of the world to add the entity to',
        required: true,
      },
      seedHash: {
        type: 'string',
        description: 'Hash of the seed to instantiate as an entity',
        required: true,
      },
      position: {
        type: 'object',
        description:
          'Optional initial position: { x: number, y: number, z?: number }. ' +
          'If omitted, placed at a random valid position.',
        required: false,
      },
      role: {
        type: 'string',
        description:
          'Optional role hint: "protagonist", "antagonist", "neutral", "environment", ' +
          '"resource". Influences AI-driven behavior selection.',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const worldId = args['worldId'] as string | undefined;
      const seedHash = args['seedHash'] as string | undefined;

      if (!worldId || !seedHash) {
        return {
          success: false,
          error: 'Both "worldId" and "seedHash" are required to add an entity.',
        };
      }

      return {
        success: true,
        data: {
          description:
            `Entity from seed "${seedHash}" added to world "${worldId}". ` +
            'Pending WebEngine connection for instantiation.',
        },
      };
    },
  },

  {
    name: 'world_simulate',
    description:
      'Run one or more simulation ticks in a world. Each tick advances time, ' +
      'processes entity interactions, resolves conflicts, and updates world state.',
    parameters: {
      worldId: {
        type: 'string',
        description: 'ID of the world to simulate',
        required: true,
      },
      ticks: {
        type: 'number',
        description: 'Number of simulation ticks to run (1-100, default: 1)',
        required: false,
      },
      speed: {
        type: 'string',
        description:
          'Simulation speed: "slow" (detailed per-tick output), "normal" (summary per tick), ' +
          '"fast" (aggregate summary only). Default: "normal".',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const worldId = args['worldId'] as string | undefined;

      if (!worldId) {
        return { success: false, error: '"worldId" is required to run a simulation.' };
      }

      const ticks = (args['ticks'] as number | undefined) ?? 1;

      if (ticks < 1 || ticks > 100) {
        return {
          success: false,
          error: `Ticks must be between 1 and 100, got ${String(ticks)}.`,
        };
      }

      return {
        success: true,
        data: {
          description:
            `Simulating ${String(ticks)} tick(s) in world "${worldId}". ` +
            'Pending WebEngine connection for simulation execution.',
        },
      };
    },
  },

  {
    name: 'world_status',
    description:
      'Get the current state of a world — entity count, active interactions, ' +
      'resource levels, tick count, and notable events from recent ticks.',
    parameters: {
      worldId: {
        type: 'string',
        description: 'ID of the world to query',
        required: true,
      },
      includeEntities: {
        type: 'boolean',
        description: 'Whether to include full entity list with positions and states (default: false)',
        required: false,
      },
      eventHistory: {
        type: 'number',
        description: 'Number of recent events to include in response (0-50, default: 10)',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const worldId = args['worldId'] as string | undefined;

      if (!worldId) {
        return { success: false, error: '"worldId" is required to get world status.' };
      }

      return {
        success: true,
        data: {
          description:
            `Status of world "${worldId}" requested. ` +
            'Pending WebEngine connection for state retrieval.',
        },
      };
    },
  },
];
