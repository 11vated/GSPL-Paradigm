/**
 * Zod v4 validation schemas for all API request bodies.
 *
 * Used at route handler entry to validate incoming data and produce
 * structured 400 errors with field-level details.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ─────────────────────────────────────────────
// Seed Schemas
// ─────────────────────────────────────────────

export const CreateSeedSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1),
  genes: z.record(z.string(), z.unknown()).optional(),
});

export const MutateSeedSchema = z.object({
  hash: z.string().min(1),
  rate: z.number().min(0).max(1).optional().default(0.1),
});

export const BreedSeedsSchema = z.object({
  parent1: z.string().min(1),
  parent2: z.string().min(1),
  strategy: z.enum(['uniform', 'single_point', 'blend', 'sbx', 'layer']).optional().default('uniform'),
  ratio: z.number().min(0).max(1).optional().default(0.5),
});

export const FitnessSchema = z.object({
  hash: z.string().min(1),
  scores: z.record(z.string(), z.number()),
});

export const BatchSeedSchema = z.object({
  operations: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('create'), name: z.string().min(1), domain: z.string().min(1), genes: z.record(z.string(), z.unknown()).optional() }),
      z.object({ type: z.literal('mutate'), hash: z.string().min(1), rate: z.number().min(0).max(1).optional() }),
      z.object({ type: z.literal('breed'), parent1: z.string().min(1), parent2: z.string().min(1) }),
    ]),
  ).min(1).max(100),
});

// ─────────────────────────────────────────────
// Evolution Schemas
// ─────────────────────────────────────────────

export const EvolutionConfigSchema = z.object({
  generations: z.number().int().min(1).max(100_000),
  populationSize: z.number().int().min(2).max(10_000),
  mutationRate: z.number().min(0).max(1).optional().default(0.1),
  crossoverRate: z.number().min(0).max(1).optional().default(0.7),
  elitismCount: z.number().int().min(0).optional().default(1),
  selectionStrategy: z.enum(['tournament', 'roulette', 'rank', 'truncation']).optional().default('tournament'),
  crossoverStrategy: z.enum(['uniform', 'single_point', 'blend', 'sbx', 'layer']).optional().default('uniform'),
  tournamentSize: z.number().int().min(2).max(20).optional().default(3),
});

export const SimulateSchema = z.object({
  steps: z.number().int().min(1).max(100_000),
});

// ─────────────────────────────────────────────
// Forge Schemas
// ─────────────────────────────────────────────

export const ForgeRequestSchema = z.object({
  hash: z.string().min(1),
  type: z.string().min(1),
  theme: z.enum(['dark', 'light']).optional().default('dark'),
  quality: z.enum(['draft', 'standard', 'high']).optional().default('standard'),
});

export const ForgeBatchSchema = z.object({
  hash: z.string().min(1),
  types: z.array(z.string().min(1)).min(1).max(20),
  theme: z.enum(['dark', 'light']).optional().default('dark'),
});

// ─────────────────────────────────────────────
// Agent Schemas
// ─────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  message: z.string().min(1).max(10_000),
  autonomyMode: z.enum(['supervised', 'copilot', 'autonomous']).optional(),
});

// ─────────────────────────────────────────────
// Import Schema
// ─────────────────────────────────────────────

export const ImportSeedsSchema = z.object({
  seeds: z.array(z.object({
    $gst: z.literal('4.0'),
    $domain: z.string(),
    $hash: z.string(),
    $name: z.string(),
    genes: z.record(z.string(), z.unknown()),
  }).passthrough()).min(1),
});

// ─────────────────────────────────────────────
// Search Schema
// ─────────────────────────────────────────────

export const SearchSchema = z.object({
  q: z.string().min(1).max(500),
  domain: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

// ─────────────────────────────────────────────
// Validation Helper
// ─────────────────────────────────────────────

export interface ValidationResult<T> {
  readonly success: true;
  readonly data: T;
}

export interface ValidationError {
  readonly success: false;
  readonly error: string;
  readonly details: Array<{ path: string; message: string }>;
}

/**
 * Validate request body against a Zod schema.
 * Returns typed data on success or structured error details on failure.
 */
export function validateBody<T>(
  body: unknown,
  schema: z.ZodType<T>,
): ValidationResult<T> | ValidationError {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map((issue: z.core.$ZodIssue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));

  const summary = details.map((d) => d.path ? `${d.path}: ${d.message}` : d.message).join('; ');

  return {
    success: false,
    error: summary,
    details,
  };
}
