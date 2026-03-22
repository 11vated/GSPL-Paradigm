/**
 * @paradigm/paradigm — Unified entry point for the GSPL Paradigm platform.
 *
 * Re-exports all Tier 1 (Core Engine) packages for convenient single-import usage.
 *
 * @example
 * ```ts
 * import { createSeed, DeterministicRNG, Forge, WebEngine } from '@paradigm/paradigm';
 * ```
 *
 * @packageDocumentation
 */

// Foundation
export * from '@paradigm/types';
export { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
export { EventBus } from '@paradigm/events';

// Seed operations
export { createSeed, mutateSeed, breedSeeds, cloneSeed } from '@paradigm/seed';

// Evolution
export { EvolutionEngine } from '@paradigm/evolution';
export type { EvolutionConfig, EvolutionStats, SelectionStrategy } from '@paradigm/evolution';

// Persistence
export { StoreEngine, MemoryAdapter, SeedRepository, ImportExport } from '@paradigm/store';
export { SqliteAdapter } from '@paradigm/store';
export type { StorageAdapter } from '@paradigm/store';

// Forge
export { Forge } from '@paradigm/forge';
export type { ArtifactType, Artifact, ForgeOptions, ForgerStrategy } from '@paradigm/forge';

// LLM
export { OllamaProvider, ClaudeProvider, OpenAIProvider, GeminiProvider } from '@paradigm/llm';
export { createProvider, detectAvailableProviders } from '@paradigm/llm';
export type { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from '@paradigm/llm';

// Web
export { WebEngine } from '@paradigm/web';
