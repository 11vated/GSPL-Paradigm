/**
 * World tools for the GSPL agent.
 *
 * These tools manage simulated worlds — environments where seeds exist as entities
 * and can interact, triggering emergent behaviors and system-level dynamics.
 *
 * @packageDocumentation
 */

import type { AgentTool, AgentToolResult } from './seed-tools.js';
import type { ToolContext } from './tool-context.js';

// ─────────────────────────────────────────────
// World state
// ─────────────────────────────────────────────

interface WorldEntity {
  seedHash: string;
  seedName: string;
  domain: string;
  position: { x: number; y: number; z?: number };
  role: string;
  addedAt: number;
}

interface World {
  id: string;
  name: string;
  theme: string;
  dimensions: { width: number; height: number; depth?: number };
  maxEntities: number;
  entities: WorldEntity[];
  tickCount: number;
  events: Array<{ tick: number; description: string; timestamp: number }>;
  createdAt: number;
}

const worlds: Map<string, World> = new Map();
let worldCounter: number = 0;

// ─────────────────────────────────────────────
// World tool factory
// ─────────────────────────────────────────────

/** Create all world-related tools with injected context. */
export function createWorldTools(ctx: ToolContext): AgentTool[] {
  return [
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

        const dimArg = args['dimensions'] as { width?: number; height?: number; depth?: number } | undefined;
        const dimensions = {
          width: dimArg?.width ?? 100,
          height: dimArg?.height ?? 100,
          ...(dimArg?.depth !== undefined ? { depth: dimArg.depth } : {}),
        };

        const maxEntities = (args['maxEntities'] as number | undefined) ?? 50;

        worldCounter++;
        const worldId = `world-${worldCounter}`;

        const world: World = {
          id: worldId,
          name,
          theme,
          dimensions,
          maxEntities,
          entities: [],
          tickCount: 0,
          events: [],
          createdAt: Date.now(),
        };

        worlds.set(worldId, world);

        ctx.eventBus.emit({
          type: 'world.changed',
          action: 'created',
          seedCount: 0,
          timestamp: Date.now(),
        });

        return {
          success: true,
          data: {
            worldId,
            name,
            theme,
            dimensions,
            maxEntities,
            message: `World "${name}" created successfully.`,
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

        const world = worlds.get(worldId);
        if (!world) {
          return {
            success: false,
            error: `World "${worldId}" not found. Use world_create to create a world first.`,
          };
        }

        const seed = ctx.getSeed(seedHash);
        if (!seed) {
          return {
            success: false,
            error: `Seed "${seedHash}" not found. Use seed_list to see available seeds.`,
          };
        }

        if (world.entities.length >= world.maxEntities) {
          return {
            success: false,
            error: `World "${world.name}" has reached its entity limit of ${world.maxEntities}. Remove entities or increase maxEntities.`,
          };
        }

        const posArg = args['position'] as { x?: number; y?: number; z?: number } | undefined;
        const position = posArg
          ? {
              x: posArg.x ?? 0,
              y: posArg.y ?? 0,
              ...(posArg.z !== undefined ? { z: posArg.z } : {}),
            }
          : {
              x: Math.floor(ctx.rng.next() * world.dimensions.width),
              y: Math.floor(ctx.rng.next() * world.dimensions.height),
            };

        const role = (args['role'] as string | undefined) ?? 'neutral';

        const entity: WorldEntity = {
          seedHash: seed.$hash,
          seedName: seed.$name,
          domain: seed.$domain,
          position,
          role,
          addedAt: Date.now(),
        };

        world.entities.push(entity);

        world.events.push({
          tick: world.tickCount,
          description: `Entity "${seed.$name}" (${seed.$domain}) entered the world at (${position.x}, ${position.y}).`,
          timestamp: Date.now(),
        });

        ctx.eventBus.emit({
          type: 'world.changed',
          action: 'entity_added',
          seedCount: world.entities.length,
          timestamp: Date.now(),
        });

        return {
          success: true,
          data: {
            worldId: world.id,
            worldName: world.name,
            entity: {
              seedHash: seed.$hash,
              seedName: seed.$name,
              domain: seed.$domain,
              position,
              role,
            },
            totalEntities: world.entities.length,
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

        const world = worlds.get(worldId);
        if (!world) {
          return {
            success: false,
            error: `World "${worldId}" not found. Use world_create to create a world first.`,
          };
        }

        const ticks = (args['ticks'] as number | undefined) ?? 1;

        if (ticks < 1 || ticks > 100) {
          return {
            success: false,
            error: `Ticks must be between 1 and 100, got ${String(ticks)}.`,
          };
        }

        if (world.entities.length === 0) {
          return {
            success: false,
            error: `World "${world.name}" has no entities. Use world_add_entity to add seeds.`,
          };
        }

        const tickEvents: Array<{ tick: number; events: string[] }> = [];

        for (let t = 0; t < ticks; t++) {
          world.tickCount++;
          const events: string[] = [];

          // Simulate entity movement
          for (const entity of world.entities) {
            const seed = ctx.getSeed(entity.seedHash);
            const speedGene = seed?.genes['speed'];
            const moveSpeed = speedGene?.type === 'scalar'
              ? (speedGene.value / speedGene.max) * 5
              : 1;

            const dx = (ctx.rng.next() - 0.5) * moveSpeed * 2;
            const dy = (ctx.rng.next() - 0.5) * moveSpeed * 2;
            entity.position.x = Math.max(0, Math.min(world.dimensions.width, entity.position.x + dx));
            entity.position.y = Math.max(0, Math.min(world.dimensions.height, entity.position.y + dy));
          }

          // Detect interactions (entities within proximity)
          for (let i = 0; i < world.entities.length; i++) {
            for (let j = i + 1; j < world.entities.length; j++) {
              const a = world.entities[i]!;
              const b = world.entities[j]!;
              const dist = Math.sqrt(
                (a.position.x - b.position.x) ** 2 +
                (a.position.y - b.position.y) ** 2,
              );

              if (dist < 10) {
                const interaction = describeInteraction(a, b, ctx);
                events.push(interaction);
              }
            }
          }

          if (events.length === 0) {
            events.push('Entities moved. No interactions this tick.');
          }

          for (const evt of events) {
            world.events.push({
              tick: world.tickCount,
              description: evt,
              timestamp: Date.now(),
            });
          }

          tickEvents.push({ tick: world.tickCount, events });

          ctx.eventBus.emit({
            type: 'simulation.step',
            tick: world.tickCount,
            seedCount: world.entities.length,
            timestamp: Date.now(),
          });
        }

        // Trim event history to last 200
        if (world.events.length > 200) {
          world.events = world.events.slice(-200);
        }

        return {
          success: true,
          data: {
            worldId: world.id,
            worldName: world.name,
            ticksSimulated: ticks,
            currentTick: world.tickCount,
            entityCount: world.entities.length,
            tickEvents,
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

        const world = worlds.get(worldId);
        if (!world) {
          return {
            success: false,
            error: `World "${worldId}" not found. Use world_create to create a world first.`,
          };
        }

        const includeEntities = args['includeEntities'] as boolean | undefined;
        const eventHistory = Math.min(50, Math.max(0, (args['eventHistory'] as number | undefined) ?? 10));

        // Domain breakdown
        const domainCounts: Record<string, number> = {};
        for (const entity of world.entities) {
          domainCounts[entity.domain] = (domainCounts[entity.domain] ?? 0) + 1;
        }

        const data: Record<string, unknown> = {
          worldId: world.id,
          name: world.name,
          theme: world.theme,
          dimensions: world.dimensions,
          tickCount: world.tickCount,
          entityCount: world.entities.length,
          maxEntities: world.maxEntities,
          domainDistribution: domainCounts,
          createdAt: new Date(world.createdAt).toISOString(),
          recentEvents: world.events.slice(-eventHistory).map((e) => ({
            tick: e.tick,
            description: e.description,
          })),
        };

        if (includeEntities) {
          data['entities'] = world.entities.map((e) => ({
            seedHash: e.seedHash,
            seedName: e.seedName,
            domain: e.domain,
            position: e.position,
            role: e.role,
          }));
        }

        return { success: true, data };
      },
    },
  ];
}

// ─────────────────────────────────────────────
// Interaction description helper
// ─────────────────────────────────────────────

function describeInteraction(a: WorldEntity, b: WorldEntity, ctx: ToolContext): string {
  const seedA = ctx.getSeed(a.seedHash);
  const seedB = ctx.getSeed(b.seedHash);

  if (!seedA || !seedB) {
    return `${a.seedName} and ${b.seedName} crossed paths.`;
  }

  const atkA = seedA.genes['attack'];
  const atkB = seedB.genes['attack'];
  const defA = seedA.genes['defense'];
  const defB = seedB.genes['defense'];

  const hasAttackA = atkA?.type === 'scalar' && atkA.value > 50;
  const hasAttackB = atkB?.type === 'scalar' && atkB.value > 50;
  const hasDefenseA = defA?.type === 'scalar' && defA.value > 50;
  const hasDefenseB = defB?.type === 'scalar' && defB.value > 50;

  if (hasAttackA && !hasDefenseB) {
    return `${a.seedName} (${a.domain}) attacked ${b.seedName} (${b.domain}) at (${Math.round(a.position.x)}, ${Math.round(a.position.y)}).`;
  }
  if (hasAttackB && !hasDefenseA) {
    return `${b.seedName} (${b.domain}) attacked ${a.seedName} (${a.domain}) at (${Math.round(b.position.x)}, ${Math.round(b.position.y)}).`;
  }
  if (hasDefenseA && hasDefenseB) {
    return `${a.seedName} and ${b.seedName} stood guard near each other at (${Math.round(a.position.x)}, ${Math.round(a.position.y)}).`;
  }
  if (a.domain === b.domain) {
    return `${a.seedName} and ${b.seedName} (both ${a.domain}) encountered each other at (${Math.round(a.position.x)}, ${Math.round(a.position.y)}).`;
  }

  return `${a.seedName} (${a.domain}) and ${b.seedName} (${b.domain}) interacted at (${Math.round(a.position.x)}, ${Math.round(a.position.y)}).`;
}
