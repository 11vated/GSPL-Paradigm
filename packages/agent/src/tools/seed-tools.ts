/**
 * Seed manipulation tools for the GSPL agent.
 *
 * These tools allow the agent to create, inspect, mutate, breed, compare,
 * and list seeds — the fundamental units of the GSPL paradigm.
 *
 * @packageDocumentation
 */

import type { GeneMap, SeedDomain, Gene } from '@paradigm/types';
import { createSeed, mutateSeed, breedSeeds } from '@paradigm/seed';
import type { ToolContext } from './tool-context.js';

// ─────────────────────────────────────────────
// Shared interfaces — re-exported by index.ts
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Domain default genes
// ─────────────────────────────────────────────

const DOMAIN_DEFAULT_GENES: Readonly<Record<string, () => GeneMap>> = {
  organism: () => ({
    health:  { type: 'scalar', value: 50, min: 0, max: 100 },
    attack:  { type: 'scalar', value: 30, min: 0, max: 100 },
    defense: { type: 'scalar', value: 30, min: 0, max: 100 },
    speed:   { type: 'scalar', value: 40, min: 0, max: 100 },
    role:    { type: 'categorical', value: 'scout', options: ['tank', 'dps', 'healer', 'support', 'scout'] },
  }),
  creature: () => ({
    health:  { type: 'scalar', value: 50, min: 0, max: 100 },
    attack:  { type: 'scalar', value: 30, min: 0, max: 100 },
    defense: { type: 'scalar', value: 30, min: 0, max: 100 },
    speed:   { type: 'scalar', value: 40, min: 0, max: 100 },
    habitat: { type: 'categorical', value: 'land', options: ['land', 'water', 'air', 'underground', 'amphibious'] },
    size:    { type: 'scalar', value: 50, min: 0, max: 100 },
  }),
  vehicle: () => ({
    speed:        { type: 'scalar', value: 60, min: 0, max: 200 },
    durability:   { type: 'scalar', value: 70, min: 0, max: 100 },
    fuel:         { type: 'scalar', value: 80, min: 0, max: 100 },
    capacity:     { type: 'scalar', value: 4, min: 1, max: 50 },
    terrain_type: { type: 'categorical', value: 'road', options: ['road', 'offroad', 'water', 'air', 'space'] },
  }),
  weapon: () => ({
    damage:  { type: 'scalar', value: 50, min: 0, max: 100 },
    range:   { type: 'scalar', value: 30, min: 0, max: 100 },
    speed:   { type: 'scalar', value: 40, min: 0, max: 100 },
    weight:  { type: 'scalar', value: 30, min: 0, max: 100 },
    element: { type: 'categorical', value: 'physical', options: ['fire', 'ice', 'lightning', 'poison', 'physical', 'dark', 'light'] },
  }),
  building: () => ({
    health:   { type: 'scalar', value: 200, min: 0, max: 500 },
    capacity: { type: 'scalar', value: 10, min: 1, max: 100 },
    cost:     { type: 'scalar', value: 100, min: 0, max: 1000 },
    style:    { type: 'categorical', value: 'medieval', options: ['medieval', 'modern', 'futuristic', 'organic', 'industrial'] },
  }),
  terrain: () => ({
    height:      { type: 'scalar', value: 0, min: -100, max: 500 },
    moisture:    { type: 'scalar', value: 50, min: 0, max: 100 },
    temperature: { type: 'scalar', value: 20, min: -50, max: 60 },
    biome:       { type: 'categorical', value: 'plains', options: ['forest', 'desert', 'tundra', 'ocean', 'plains', 'mountain', 'swamp', 'volcanic'] },
  }),
  robot: () => ({
    processing: { type: 'scalar', value: 50, min: 0, max: 100 },
    durability: { type: 'scalar', value: 60, min: 0, max: 100 },
    energy:     { type: 'scalar', value: 80, min: 0, max: 100 },
    speed:      { type: 'scalar', value: 40, min: 0, max: 100 },
    role:       { type: 'categorical', value: 'utility', options: ['combat', 'utility', 'recon', 'medical', 'construction'] },
  }),
  plant: () => ({
    growth_rate: { type: 'scalar', value: 50, min: 0, max: 100 },
    height:      { type: 'scalar', value: 30, min: 0, max: 100 },
    toxicity:    { type: 'scalar', value: 0, min: 0, max: 100 },
    edible:      { type: 'categorical', value: 'no', options: ['yes', 'no', 'partial'] },
    biome:       { type: 'categorical', value: 'forest', options: ['forest', 'desert', 'tundra', 'ocean', 'plains', 'mountain', 'swamp'] },
  }),
  mammal: () => ({
    health:  { type: 'scalar', value: 50, min: 0, max: 100 },
    attack:  { type: 'scalar', value: 30, min: 0, max: 100 },
    defense: { type: 'scalar', value: 30, min: 0, max: 100 },
    speed:   { type: 'scalar', value: 50, min: 0, max: 100 },
    size:    { type: 'scalar', value: 40, min: 0, max: 100 },
    habitat: { type: 'categorical', value: 'forest', options: ['forest', 'plains', 'mountain', 'arctic', 'desert', 'urban'] },
  }),
  material: () => ({
    hardness:     { type: 'scalar', value: 50, min: 0, max: 100 },
    conductivity: { type: 'scalar', value: 30, min: 0, max: 100 },
    density:      { type: 'scalar', value: 50, min: 0, max: 100 },
    transparency: { type: 'scalar', value: 0, min: 0, max: 100 },
    color:        { type: 'vector', value: [128, 128, 128], dimensions: 3 },
  }),
};

/**
 * Get default genes for a given domain.
 * Falls back to organism genes for unknown domains.
 */
function getDefaultGenes(domain: string): GeneMap {
  const factory = DOMAIN_DEFAULT_GENES[domain];
  return factory ? factory() : (DOMAIN_DEFAULT_GENES['organism'] as () => GeneMap)();
}

/**
 * Parse a raw genes argument into a proper GeneMap.
 * Accepts either a pre-formed GeneMap or a simplified { key: { type, value } } object.
 */
function parseGeneArgs(raw: Record<string, unknown>): GeneMap {
  const genes: GeneMap = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === 'object' && val !== null && 'type' in val) {
      genes[key] = val as Gene;
    }
  }
  return genes;
}

/**
 * Normalize a scalar gene value to [0, 1].
 */
function normalizeGeneValue(gene: Gene): number {
  if (gene.type === 'scalar') {
    const range = gene.max - gene.min;
    if (range === 0) return 1;
    return (gene.value - gene.min) / range;
  }
  if (gene.type === 'vector') {
    if (gene.value.length === 0) return 0;
    const sum = gene.value.reduce((acc, v) => acc + v, 0);
    return Math.min(1, Math.max(0, sum / (gene.value.length * 255)));
  }
  return 0.5;
}

// ─────────────────────────────────────────────
// Seed tool factory
// ─────────────────────────────────────────────

/** Create all seed-related tools with injected context. */
export function createSeedTools(ctx: ToolContext): AgentTool[] {
  return [
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
            'Domain the seed belongs to: organism, creature, vehicle, weapon, building, ' +
            'terrain, robot, plant, mammal, material, or any valid SeedDomain',
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

        const rawGenes = args['genes'] as Record<string, unknown> | undefined;
        const genes: GeneMap = rawGenes
          ? { ...getDefaultGenes(domain), ...parseGeneArgs(rawGenes) }
          : getDefaultGenes(domain);

        const seed = createSeed(name, domain as SeedDomain, genes, ctx.rng.fork(`seed-create-${name}`));

        const description = args['description'] as string | undefined;
        if (description) {
          seed.$metadata.description = description;
        }

        ctx.saveSeed(seed);

        ctx.eventBus.emit({
          type: 'seed.created',
          seed,
          timestamp: Date.now(),
        });

        return {
          success: true,
          data: {
            hash: seed.$hash,
            name: seed.$name,
            domain: seed.$domain,
            geneCount: Object.keys(seed.genes).length,
            genes: Object.fromEntries(
              Object.entries(seed.genes).map(([k, g]) => [k, { type: g.type, value: g.type === 'scalar' ? g.value : g.type === 'categorical' ? g.value : '(complex)' }]),
            ),
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

        const seed = ctx.getSeed(hash);
        if (!seed) {
          return {
            success: false,
            error: `Seed with hash "${hash}" not found. Use seed_list to see available seeds.`,
          };
        }

        const includeLineage = args['includeLineage'] as boolean | undefined;

        const data: Record<string, unknown> = {
          hash: seed.$hash,
          name: seed.$name,
          domain: seed.$domain,
          gst: seed.$gst,
          geneCount: Object.keys(seed.genes).length,
          genes: Object.fromEntries(
            Object.entries(seed.genes).map(([k, g]) => {
              if (g.type === 'scalar') return [k, { type: 'scalar', value: g.value, min: g.min, max: g.max }];
              if (g.type === 'categorical') return [k, { type: 'categorical', value: g.value, options: g.options }];
              if (g.type === 'vector') return [k, { type: 'vector', value: g.value, dimensions: g.dimensions }];
              return [k, { type: g.type }];
            }),
          ),
          fitness: seed.$fitness ?? null,
          metadata: seed.$metadata,
          activation: seed.$activation ?? null,
        };

        if (includeLineage) {
          data['lineage'] = seed.$lineage;
        }

        return { success: true, data };
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

        const original = ctx.getSeed(hash);
        if (!original) {
          return {
            success: false,
            error: `Seed with hash "${hash}" not found. Use seed_list to see available seeds.`,
          };
        }

        const mutated = mutateSeed(original, intensity, ctx.rng.fork(`mutate-${hash}-${intensity}`));
        ctx.saveSeed(mutated);

        ctx.eventBus.emit({
          type: 'seed.mutated',
          original,
          mutated,
          intensity,
          timestamp: Date.now(),
        });

        return {
          success: true,
          data: {
            originalHash: original.$hash,
            mutatedHash: mutated.$hash,
            mutatedName: mutated.$name,
            intensity,
            generation: mutated.$lineage.generation,
            geneCount: Object.keys(mutated.genes).length,
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
            '"blend" (interpolate scalar genes), "sbx", or "layer". Default: "uniform".',
          required: false,
        },
        offspringCount: {
          type: 'number',
          description: 'Number of offspring to produce (default: 1, max: 10)',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const parentAHash = args['parentA'] as string | undefined;
        const parentBHash = args['parentB'] as string | undefined;

        if (!parentAHash || !parentBHash) {
          return {
            success: false,
            error: 'Both "parentA" and "parentB" hashes are required to breed seeds.',
          };
        }

        const parentA = ctx.getSeed(parentAHash);
        const parentB = ctx.getSeed(parentBHash);

        if (!parentA) {
          return { success: false, error: `Parent A seed "${parentAHash}" not found.` };
        }
        if (!parentB) {
          return { success: false, error: `Parent B seed "${parentBHash}" not found.` };
        }

        const strategy = (args['crossoverStrategy'] as string | undefined) ?? 'uniform';
        const validStrategies = ['uniform', 'single_point', 'blend', 'sbx', 'layer'];
        if (!validStrategies.includes(strategy)) {
          return {
            success: false,
            error: `Invalid crossover strategy "${strategy}". Valid: ${validStrategies.join(', ')}.`,
          };
        }

        const count = Math.min(Math.max(1, (args['offspringCount'] as number | undefined) ?? 1), 10);
        const offspring: Array<{ hash: string; name: string; generation: number }> = [];

        for (let i = 0; i < count; i++) {
          const child = breedSeeds(
            parentA,
            parentB,
            strategy as 'uniform' | 'single_point' | 'blend' | 'sbx' | 'layer',
            0.5,
            ctx.rng.fork(`breed-${parentAHash}-${parentBHash}-${i}`),
          );
          ctx.saveSeed(child);
          offspring.push({
            hash: child.$hash,
            name: child.$name,
            generation: child.$lineage.generation,
          });

          ctx.eventBus.emit({
            type: 'seed.bred',
            parentA,
            parentB,
            child,
            strategy,
            timestamp: Date.now(),
          });
        }

        return {
          success: true,
          data: {
            parentA: { hash: parentA.$hash, name: parentA.$name },
            parentB: { hash: parentB.$hash, name: parentB.$name },
            strategy,
            offspring,
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

        const seedA = ctx.getSeed(hashA);
        const seedB = ctx.getSeed(hashB);

        if (!seedA) {
          return { success: false, error: `Seed "${hashA}" not found.` };
        }
        if (!seedB) {
          return { success: false, error: `Seed "${hashB}" not found.` };
        }

        // Gene-by-gene comparison
        const allGeneNames = new Set<string>([
          ...Object.keys(seedA.genes),
          ...Object.keys(seedB.genes),
        ]);

        const geneComparison: Array<{
          gene: string;
          winner: 'a' | 'b' | 'tie';
          strengthA: number;
          strengthB: number;
          delta: number;
        }> = [];

        for (const geneName of allGeneNames) {
          const geneA = seedA.genes[geneName];
          const geneB = seedB.genes[geneName];
          const strengthA = geneA ? normalizeGeneValue(geneA) : 0;
          const strengthB = geneB ? normalizeGeneValue(geneB) : 0;
          const delta = Math.abs(strengthA - strengthB);

          let winner: 'a' | 'b' | 'tie';
          if (delta < 0.01) {
            winner = 'tie';
          } else if (strengthA > strengthB) {
            winner = 'a';
          } else {
            winner = 'b';
          }

          geneComparison.push({
            gene: geneName,
            winner,
            strengthA: Math.round(strengthA * 1000) / 1000,
            strengthB: Math.round(strengthB * 1000) / 1000,
            delta: Math.round(delta * 1000) / 1000,
          });
        }

        geneComparison.sort((x, y) => y.delta - x.delta);

        // Fitness comparison
        const fitnessA = seedA.$fitness?.['primary'] ?? 0;
        const fitnessB = seedB.$fitness?.['primary'] ?? 0;

        // Domain compatibility
        const sameDomain = seedA.$domain === seedB.$domain;

        return {
          success: true,
          data: {
            seedA: { hash: seedA.$hash, name: seedA.$name, domain: seedA.$domain },
            seedB: { hash: seedB.$hash, name: seedB.$name, domain: seedB.$domain },
            sameDomain,
            breedingCompatible: sameDomain,
            fitnessDelta: Math.round((fitnessA - fitnessB) * 1000) / 1000,
            geneOverlap: {
              onlyA: Object.keys(seedA.genes).filter((k) => !(k in seedB.genes)),
              onlyB: Object.keys(seedB.genes).filter((k) => !(k in seedA.genes)),
              shared: Object.keys(seedA.genes).filter((k) => k in seedB.genes),
            },
            geneComparison,
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
            'Optional domain filter. Omit to list all domains.',
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
        const sortBy = (args['sortBy'] as string | undefined) ?? 'created';
        const limit = (args['limit'] as number | undefined) ?? 50;

        let seeds = ctx.getSeeds();

        if (domain) {
          seeds = seeds.filter((s) => s.$domain === domain);
        }

        // Sort
        switch (sortBy) {
          case 'fitness':
            seeds.sort((a, b) => (b.$fitness?.['primary'] ?? 0) - (a.$fitness?.['primary'] ?? 0));
            break;
          case 'name':
            seeds.sort((a, b) => a.$name.localeCompare(b.$name));
            break;
          case 'created':
          default:
            seeds.sort((a, b) => (b.$metadata.created ?? 0) - (a.$metadata.created ?? 0));
            break;
        }

        seeds = seeds.slice(0, limit);

        return {
          success: true,
          data: {
            count: seeds.length,
            totalInStore: ctx.getSeeds().length,
            seeds: seeds.map((s) => ({
              hash: s.$hash,
              name: s.$name,
              domain: s.$domain,
              generation: s.$lineage.generation,
              fitness: s.$fitness?.['primary'] ?? null,
              geneCount: Object.keys(s.genes).length,
            })),
          },
        };
      },
    },
  ];
}
