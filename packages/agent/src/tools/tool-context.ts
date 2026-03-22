/**
 * ToolContext — Dependency-injection interface for agent tools.
 *
 * Every tool factory receives a ToolContext that provides access to seed
 * storage, the deterministic RNG, and the typed event bus. This decouples
 * tool logic from concrete infrastructure, enabling in-memory, persistent,
 * or networked backends without changing tool code.
 *
 * @packageDocumentation
 */

import type { UniversalSeed } from '@paradigm/types';
import type { DeterministicRNG } from '@paradigm/rng';
import type { EventBus } from '@paradigm/events';

/** Injected context that every tool factory receives. */
export interface ToolContext {
  /** Get all seeds in the store. */
  getSeeds: () => UniversalSeed[];
  /** Get a seed by its hash. Returns undefined if not found. */
  getSeed: (hash: string) => UniversalSeed | undefined;
  /** Store (or update) a seed. */
  saveSeed: (seed: UniversalSeed) => void;
  /** Delete a seed by hash. Returns true if a seed was removed. */
  deleteSeed: (hash: string) => boolean;
  /** The deterministic RNG instance shared across all tools. */
  rng: DeterministicRNG;
  /** The typed event bus for emitting paradigm events. */
  eventBus: EventBus;
}
