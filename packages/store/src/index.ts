/**
 * @paradigm/store — Multi-adapter persistence layer for GSPL Paradigm.
 *
 * Layer 6: Infrastructure. Provides content-addressable seed storage,
 * evolution logging, configuration management, session state with undo/redo,
 * periodic auto-save, and seed import/export in JSON and GSPL formats.
 *
 * Zero external dependencies beyond @paradigm/types, @paradigm/rng, @paradigm/events.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, GeneMap, SeedDomain, Gene } from '@paradigm/types';
import { computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';

// ─────────────────────────────────────────────
// StorageAdapter Interface
// ─────────────────────────────────────────────

/**
 * Abstract adapter for key-value persistence.
 * Implementations may target in-memory, localStorage, IndexedDB, filesystem, etc.
 */
export interface StorageAdapter {
  /** Retrieve value by key, or undefined if not found. */
  get(key: string): string | undefined;
  /** Store a value under the given key. */
  set(key: string, value: string): void;
  /** Delete a key. Returns true if the key existed. */
  delete(key: string): boolean;
  /** Check whether a key exists. */
  has(key: string): boolean;
  /** Return all stored keys. */
  keys(): string[];
  /** Remove all entries. */
  clear(): void;
}

// ─────────────────────────────────────────────
// MemoryAdapter — In-memory StorageAdapter
// ─────────────────────────────────────────────

/**
 * In-memory implementation of StorageAdapter backed by a Map.
 * Data is lost when the process exits. Suitable for tests and ephemeral sessions.
 */
export class MemoryAdapter implements StorageAdapter {
  private readonly store: Map<string, string> = new Map();

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }

  clear(): void {
    this.store.clear();
  }
}

// ─────────────────────────────────────────────
// Serialization Helpers
// ─────────────────────────────────────────────

/**
 * JSON replacer that handles Map, Set, Float64Array, Float32Array, Uint8Array.
 * Encodes them as tagged arrays so they survive round-trip serialization.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { __type: '__Map__', entries: Array.from(value.entries()) };
  }
  if (value instanceof Set) {
    return { __type: '__Set__', values: Array.from(value) };
  }
  if (value instanceof Float64Array) {
    return { __type: '__Float64Array__', data: Array.from(value) };
  }
  if (value instanceof Float32Array) {
    return { __type: '__Float32Array__', data: Array.from(value) };
  }
  if (value instanceof Uint8Array) {
    return { __type: '__Uint8Array__', data: Array.from(value) };
  }
  return value;
}

/**
 * JSON reviver that reconstitutes Map, Set, and typed arrays from tagged objects.
 */
function jsonReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && '__type' in value) {
    const tagged = value as Record<string, unknown>;
    const tag = tagged['__type'] as string;
    if (tag === '__Map__' && Array.isArray(tagged['entries'])) {
      return new Map(tagged['entries'] as Array<[unknown, unknown]>);
    }
    if (tag === '__Set__' && Array.isArray(tagged['values'])) {
      return new Set(tagged['values'] as unknown[]);
    }
    if (tag === '__Float64Array__' && Array.isArray(tagged['data'])) {
      return new Float64Array(tagged['data'] as number[]);
    }
    if (tag === '__Float32Array__' && Array.isArray(tagged['data'])) {
      return new Float32Array(tagged['data'] as number[]);
    }
    if (tag === '__Uint8Array__' && Array.isArray(tagged['data'])) {
      return new Uint8Array(tagged['data'] as number[]);
    }
  }
  return value;
}

/** Serialize a seed to JSON using the custom replacer. */
function serializeSeed(seed: UniversalSeed): string {
  return JSON.stringify(seed, jsonReplacer);
}

/** Deserialize a seed from JSON using the custom reviver. */
function deserializeSeed(json: string): UniversalSeed {
  return JSON.parse(json, jsonReviver) as UniversalSeed;
}

// ─────────────────────────────────────────────
// SeedRepository — Content-addressable seed storage
// ─────────────────────────────────────────────

/** Key prefix for seed entries in the adapter. */
const SEED_PREFIX = 'seed:';

/**
 * Content-addressable seed repository.
 * Seeds are keyed by their `$hash` field. Supports save, get, delete,
 * search by predicate, and full enumeration.
 */
export class SeedRepository {
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  /** Persist a seed keyed by its $hash. Overwrites if hash already exists. */
  save(seed: UniversalSeed): void {
    const key = SEED_PREFIX + seed.$hash;
    this.adapter.set(key, serializeSeed(seed));
  }

  /** Retrieve a seed by its hash. Returns undefined if not found. */
  get(hash: string): UniversalSeed | undefined {
    const raw = this.adapter.get(SEED_PREFIX + hash);
    if (raw === undefined) {
      return undefined;
    }
    return deserializeSeed(raw);
  }

  /** Retrieve all stored seeds. */
  getAll(): UniversalSeed[] {
    const seeds: UniversalSeed[] = [];
    for (const key of this.adapter.keys()) {
      if (key.startsWith(SEED_PREFIX)) {
        const raw = this.adapter.get(key);
        if (raw !== undefined) {
          seeds.push(deserializeSeed(raw));
        }
      }
    }
    return seeds;
  }

  /** Delete a seed by hash. Returns true if it existed. */
  delete(hash: string): boolean {
    return this.adapter.delete(SEED_PREFIX + hash);
  }

  /** Search seeds by predicate. */
  search(predicate: (seed: UniversalSeed) => boolean): UniversalSeed[] {
    const results: UniversalSeed[] = [];
    for (const key of this.adapter.keys()) {
      if (key.startsWith(SEED_PREFIX)) {
        const raw = this.adapter.get(key);
        if (raw !== undefined) {
          const seed = deserializeSeed(raw);
          if (predicate(seed)) {
            results.push(seed);
          }
        }
      }
    }
    return results;
  }

  /** Count of stored seeds. */
  count(): number {
    let total = 0;
    for (const key of this.adapter.keys()) {
      if (key.startsWith(SEED_PREFIX)) {
        total++;
      }
    }
    return total;
  }
}

// ─────────────────────────────────────────────
// EvolutionLog — Evolution run history
// ─────────────────────────────────────────────

/** Key prefix for evolution log entries. */
const EVO_PREFIX = 'evo:';

/** Single entry in an evolution run log. */
export interface EvolutionLogEntry {
  readonly runId: string;
  readonly generation: number;
  readonly bestFitness: number;
  readonly avgFitness: number;
  readonly populationSize: number;
  readonly timestamp: number;
}

/**
 * Append-only log of evolution run entries.
 * Entries are grouped by runId. Each run stores an ordered array of entries.
 */
export class EvolutionLog {
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  /** Record a new evolution log entry. Appends to the run's entry list. */
  record(entry: EvolutionLogEntry): void {
    const key = EVO_PREFIX + entry.runId;
    const existing = this.loadEntries(entry.runId);
    existing.push(entry);
    this.adapter.set(key, JSON.stringify(existing));
  }

  /** Get all entries for a given run, ordered by recording time. */
  getLog(runId: string): EvolutionLogEntry[] {
    return this.loadEntries(runId);
  }

  /** Get all distinct run IDs. */
  getAllRuns(): string[] {
    const runs: string[] = [];
    for (const key of this.adapter.keys()) {
      if (key.startsWith(EVO_PREFIX)) {
        runs.push(key.slice(EVO_PREFIX.length));
      }
    }
    return runs;
  }

  /** Get the most recent entry for a run, or undefined if the run has no entries. */
  getLatestEntry(runId: string): EvolutionLogEntry | undefined {
    const entries = this.loadEntries(runId);
    if (entries.length === 0) {
      return undefined;
    }
    return entries[entries.length - 1]!;
  }

  /** Internal: load entries array for a run from the adapter. */
  private loadEntries(runId: string): EvolutionLogEntry[] {
    const raw = this.adapter.get(EVO_PREFIX + runId);
    if (raw === undefined) {
      return [];
    }
    return JSON.parse(raw) as EvolutionLogEntry[];
  }
}

// ─────────────────────────────────────────────
// ConfigStore — User preferences
// ─────────────────────────────────────────────

/** Key prefix for configuration entries. */
const CONFIG_PREFIX = 'config:';

/** Sentinel key that stores the full list of config keys (for enumeration). */
const CONFIG_INDEX_KEY = 'config:__index__';

/**
 * Typed configuration store for user preferences.
 * Values are JSON-serialized. Supports get with default, set, getAll, and reset.
 */
export class ConfigStore {
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  /** Get a configuration value. Returns defaultValue if key is not set. */
  get<T>(key: string, defaultValue?: T): T {
    const raw = this.adapter.get(CONFIG_PREFIX + key);
    if (raw === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      return undefined as T;
    }
    return JSON.parse(raw) as T;
  }

  /** Set a configuration value. */
  set(key: string, value: unknown): void {
    this.adapter.set(CONFIG_PREFIX + key, JSON.stringify(value));
    this.addToIndex(key);
  }

  /** Get all configuration entries as a plain object. */
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const index = this.loadIndex();
    for (const key of index) {
      const raw = this.adapter.get(CONFIG_PREFIX + key);
      if (raw !== undefined) {
        result[key] = JSON.parse(raw) as unknown;
      }
    }
    return result;
  }

  /** Remove all configuration entries. */
  reset(): void {
    const index = this.loadIndex();
    for (const key of index) {
      this.adapter.delete(CONFIG_PREFIX + key);
    }
    this.adapter.delete(CONFIG_INDEX_KEY);
  }

  /** Add a key to the config index for enumeration. */
  private addToIndex(key: string): void {
    const index = this.loadIndex();
    if (!index.includes(key)) {
      index.push(key);
      this.adapter.set(CONFIG_INDEX_KEY, JSON.stringify(index));
    }
  }

  /** Load the config key index. */
  private loadIndex(): string[] {
    const raw = this.adapter.get(CONFIG_INDEX_KEY);
    if (raw === undefined) {
      return [];
    }
    return JSON.parse(raw) as string[];
  }
}

// ─────────────────────────────────────────────
// SessionStore — Session state with undo/redo
// ─────────────────────────────────────────────

/** Default maximum number of states in the undo history. */
const DEFAULT_MAX_HISTORY = 50;

/**
 * Session state manager with undo/redo support.
 * Maintains a linear history stack. Saving a new state clears any redo future.
 * History depth is capped at a configurable maximum (default 50).
 */
export class SessionStore {
  private readonly maxHistory: number;
  private undoStack: Array<Record<string, unknown>> = [];
  private redoStack: Array<Record<string, unknown>> = [];
  private current: Record<string, unknown> = {};

  constructor(options?: { maxHistory?: number }) {
    this.maxHistory = options?.maxHistory ?? DEFAULT_MAX_HISTORY;
  }

  /** Save a new state snapshot. Pushes current state to undo stack and clears redo. */
  saveState(state: Record<string, unknown>): void {
    this.undoStack.push(structuredCloneShallow(this.current));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.current = structuredCloneShallow(state);
    this.redoStack = [];
  }

  /** Undo to the previous state. Returns the restored state, or undefined if nothing to undo. */
  undo(): Record<string, unknown> | undefined {
    const prev = this.undoStack.pop();
    if (prev === undefined) {
      return undefined;
    }
    this.redoStack.push(structuredCloneShallow(this.current));
    this.current = prev;
    return structuredCloneShallow(this.current);
  }

  /** Redo to the next state. Returns the restored state, or undefined if nothing to redo. */
  redo(): Record<string, unknown> | undefined {
    const next = this.redoStack.pop();
    if (next === undefined) {
      return undefined;
    }
    this.undoStack.push(structuredCloneShallow(this.current));
    this.current = next;
    return structuredCloneShallow(this.current);
  }

  /** Whether an undo operation is available. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether a redo operation is available. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Get a copy of the current state. */
  getCurrentState(): Record<string, unknown> {
    return structuredCloneShallow(this.current);
  }
}

/**
 * Shallow clone a Record<string, unknown> via JSON round-trip.
 * Ensures state snapshots are isolated from each other.
 */
function structuredCloneShallow(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

// ─────────────────────────────────────────────
// AutoSave — Periodic save coordinator
// ─────────────────────────────────────────────

/**
 * Periodic auto-save coordinator.
 * Calls a user-provided callback at a configurable interval.
 * Supports start, stop, status check, and immediate trigger.
 */
export class AutoSave {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private callback: (() => void) | null = null;

  /** Start periodic saves. Replaces any previous schedule. */
  start(intervalMs: number, callback: () => void): void {
    this.stop();
    this.callback = callback;
    this.timerId = setInterval(() => {
      this.invokeCallback();
    }, intervalMs);
  }

  /** Stop periodic saves and clear the timer. */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.callback = null;
  }

  /** Whether the auto-save timer is currently active. */
  isRunning(): boolean {
    return this.timerId !== null;
  }

  /** Force an immediate save outside the regular interval. */
  triggerNow(): void {
    this.invokeCallback();
  }

  /** Internal: safely invoke the callback. */
  private invokeCallback(): void {
    if (this.callback !== null) {
      try {
        this.callback();
      } catch (err) {
        console.error('[AutoSave] Callback error:', err);
      }
    }
  }
}

// ─────────────────────────────────────────────
// ImportExport — Seed serialization
// ─────────────────────────────────────────────

/** Supported export/import formats. */
export type ExportFormat = 'json' | 'gspl';

/**
 * Seed import/export in JSON and GSPL text formats.
 *
 * JSON format: standard JSON array of seed objects.
 * GSPL format: human-readable `seed "name" domain { genes }` blocks.
 */
export class ImportExport {
  /**
   * Export seeds to the specified format.
   * @param seeds - Array of seeds to export.
   * @param format - 'json' for JSON array, 'gspl' for GSPL text blocks.
   * @returns Serialized string.
   */
  exportSeeds(seeds: readonly UniversalSeed[], format: ExportFormat): string {
    if (format === 'json') {
      return JSON.stringify(seeds, jsonReplacer, 2);
    }
    return seeds.map((seed) => this.seedToGspl(seed)).join('\n\n');
  }

  /**
   * Import seeds from the specified format.
   * @param data - Serialized string to parse.
   * @param format - 'json' or 'gspl'.
   * @returns Array of parsed seeds.
   */
  importSeeds(data: string, format: ExportFormat): UniversalSeed[] {
    if (format === 'json') {
      return this.importJson(data);
    }
    return this.importGspl(data);
  }

  /** Convert a single seed to GSPL text format. */
  private seedToGspl(seed: UniversalSeed): string {
    const lines: string[] = [];
    lines.push(`seed "${seed.$name}" ${seed.$domain} {`);

    const geneEntries = Object.entries(seed.genes);
    for (const [name, gene] of geneEntries) {
      if (gene !== undefined) {
        lines.push(`  ${name}: ${this.geneToGsplValue(gene)};`);
      }
    }

    lines.push('}');

    if (seed.$hash) {
      lines.push(`// hash: ${seed.$hash}`);
    }

    return lines.join('\n');
  }

  /** Convert a gene value to a GSPL-compatible string representation. */
  private geneToGsplValue(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return `scalar(${gene.value}, ${gene.min}, ${gene.max})`;
      case 'categorical':
        return `categorical("${gene.value}", [${gene.options.map((o) => `"${o}"`).join(', ')}])`;
      case 'vector':
        return `vector([${gene.value.join(', ')}])`;
      case 'expression':
        return `expression("${gene.source}")`;
      case 'struct': {
        const inner = Object.entries(gene.value)
          .map(([k, v]) => `${k}: ${v !== undefined ? this.geneToGsplValue(v) : 'null'}`)
          .join(', ');
        return `struct({ ${inner} })`;
      }
      case 'array': {
        const items = gene.value
          .map((item) => (item !== undefined ? this.geneToGsplValue(item) : 'null'))
          .join(', ');
        return `array([${items}])`;
      }
      case 'graph':
        return `graph(${gene.nodes.size} nodes, ${gene.edges.length} edges)`;
      case 'tensor':
        return `tensor([${Array.from(gene.data).join(', ')}], shape=[${gene.shape.join(', ')}])`;
      case 'timeseries': {
        const kfs = gene.keyframes
          .map((kf) => `${kf.t}:${kf.v}`)
          .join(', ');
        return `timeseries(${gene.interpolation}, [${kfs}])`;
      }
    }
  }

  /** Parse JSON format into seed array. */
  private importJson(data: string): UniversalSeed[] {
    const parsed: unknown = JSON.parse(data, jsonReviver);
    if (!Array.isArray(parsed)) {
      throw new StoreError('JSON import expects a top-level array of seeds');
    }
    const seeds: UniversalSeed[] = [];
    for (const item of parsed) {
      if (this.isValidSeed(item)) {
        seeds.push(item);
      }
    }
    return seeds;
  }

  /** Parse GSPL text format into seed array. */
  private importGspl(data: string): UniversalSeed[] {
    const seeds: UniversalSeed[] = [];
    const blocks = data.split(/\n\n+/);

    for (const block of blocks) {
      const trimmed = block.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const headerMatch = /^seed\s+"([^"]+)"\s+(\S+)\s*\{/.exec(trimmed);
      if (headerMatch === null) {
        continue;
      }

      const name = headerMatch[1] ?? 'unnamed';
      const domain = headerMatch[2] ?? 'organism';
      const genes: GeneMap = {};

      // Extract gene lines between { and }
      const bodyMatch = /\{([\s\S]*)\}/.exec(trimmed);
      if (bodyMatch !== null) {
        const body = bodyMatch[1] ?? '';
        const geneLines = body.split(';').filter((line) => line.trim().length > 0);

        for (const geneLine of geneLines) {
          const geneMatch = /^\s*(\w+)\s*:\s*(.+)$/.exec(geneLine.trim());
          if (geneMatch !== null) {
            const geneName = geneMatch[1] ?? '';
            const geneValue = geneMatch[2] ?? '';
            const gene = this.parseGsplGene(geneValue.trim());
            if (gene !== null && geneName.length > 0) {
              genes[geneName] = gene;
            }
          }
        }
      }

      const seed: UniversalSeed = {
        $gst: '4.0',
        $domain: domain as SeedDomain,
        $hash: computeQuickHash({ name, domain, genes }),
        $name: name,
        $lineage: {
          generation: 0,
          parents: [],
          timestamp: Date.now(),
        },
        genes,
        $metadata: {
          created: Date.now(),
          description: `Imported from GSPL format`,
        },
      };

      seeds.push(seed);
    }

    return seeds;
  }

  /** Parse a GSPL gene value string into a Gene object. */
  private parseGsplGene(value: string): Gene | null {
    // scalar(value, min, max)
    const scalarMatch = /^scalar\(\s*([\d.e+-]+)\s*,\s*([\d.e+-]+)\s*,\s*([\d.e+-]+)\s*\)$/.exec(value);
    if (scalarMatch !== null) {
      return {
        type: 'scalar',
        value: Number(scalarMatch[1]),
        min: Number(scalarMatch[2]),
        max: Number(scalarMatch[3]),
      };
    }

    // categorical("value", ["opt1", "opt2"])
    const catMatch = /^categorical\(\s*"([^"]*)"\s*,\s*\[([^\]]*)\]\s*\)$/.exec(value);
    if (catMatch !== null) {
      const optStr = catMatch[2] ?? '';
      const options = optStr
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter((s) => s.length > 0);
      return {
        type: 'categorical',
        value: catMatch[1] ?? '',
        options,
      };
    }

    // vector([1, 2, 3])
    const vecMatch = /^vector\(\s*\[([^\]]*)\]\s*\)$/.exec(value);
    if (vecMatch !== null) {
      const nums = (vecMatch[1] ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
      return {
        type: 'vector',
        value: nums,
        dimensions: nums.length,
      };
    }

    // expression("source")
    const exprMatch = /^expression\(\s*"([^"]*)"\s*\)$/.exec(value);
    if (exprMatch !== null) {
      return {
        type: 'expression',
        source: exprMatch[1] ?? '',
      };
    }

    // Fallback: treat as scalar with value 0
    const numericValue = Number(value);
    if (!isNaN(numericValue)) {
      return {
        type: 'scalar',
        value: numericValue,
        min: 0,
        max: 1,
      };
    }

    return null;
  }

  /** Validate that an unknown value looks like a UniversalSeed. */
  private isValidSeed(value: unknown): value is UniversalSeed {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    return (
      typeof obj['$gst'] === 'string' &&
      typeof obj['$domain'] === 'string' &&
      typeof obj['$hash'] === 'string' &&
      typeof obj['$name'] === 'string' &&
      typeof obj['genes'] === 'object' &&
      obj['genes'] !== null
    );
  }
}

// ─────────────────────────────────────────────
// StoreError — Typed error for store operations
// ─────────────────────────────────────────────

/**
 * Error class for store-layer failures.
 * Provides structured context for debugging and recovery.
 */
export class StoreError extends Error {
  readonly code: string;

  constructor(message: string, code: string = 'STORE_ERROR') {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

// ─────────────────────────────────────────────
// Store Event Types
// ─────────────────────────────────────────────

/** Event type constants used by StoreEngine for EventBus emissions. */
export const STORE_EVENTS = {
  SEED_SAVED: 'seed.created',
  SEED_DELETED: 'seed.died',
} as const;

// ─────────────────────────────────────────────
// StoreEngine — Top-level entry point
// ─────────────────────────────────────────────

/**
 * Top-level persistence engine for GSPL Paradigm.
 *
 * Aggregates all persistence subsystems (seeds, evolution, config, session,
 * auto-save, import/export) behind a single constructor. Emits events
 * via EventBus when seeds are saved or deleted.
 *
 * Use `StoreEngine.create()` for async initialization with environment-aware
 * adapter selection (IndexedDB in browser, SQLite in Node, memory fallback).
 *
 * @example
 * ```ts
 * // Async factory (recommended — auto-detects best adapter)
 * const store = await StoreEngine.create({ eventBus: bus });
 *
 * // Sync constructor (memory adapter by default)
 * const store = new StoreEngine({ eventBus: bus });
 *
 * store.seeds.save(mySeed);         // Emits 'seed.created'
 * store.seeds.delete(mySeed.$hash); // Emits 'seed.died'
 *
 * store.config.set('theme', 'dark');
 * store.session.saveState({ activeSeed: mySeed.$hash });
 * store.session.undo();
 * ```
 */
export class StoreEngine {
  /** Content-addressable seed repository. */
  readonly seeds: SeedRepositoryWithEvents;
  /** Append-only evolution run log. */
  readonly evolution: EvolutionLog;
  /** User preference configuration store. */
  readonly config: ConfigStore;
  /** Session state with undo/redo. */
  readonly session: SessionStore;
  /** Periodic auto-save coordinator. */
  readonly autoSave: AutoSave;
  /** Seed import/export in JSON and GSPL formats. */
  readonly importExport: ImportExport;
  /** The underlying storage adapter. */
  readonly adapter: StorageAdapter;
  /** The event bus used for store events. */
  readonly eventBus: EventBus;
  /** Schema version for migration tracking. */
  readonly schemaVersion: number;

  constructor(options?: {
    adapter?: StorageAdapter;
    eventBus?: EventBus;
    maxSessionHistory?: number;
    autoSaveIntervalMs?: number;
  }) {
    this.adapter = options?.adapter ?? new MemoryAdapter();
    this.eventBus = options?.eventBus ?? new EventBus();
    this.schemaVersion = CURRENT_SCHEMA_VERSION;

    this.seeds = new SeedRepositoryWithEvents(this.adapter, this.eventBus);
    this.evolution = new EvolutionLog(this.adapter);
    this.config = new ConfigStore(this.adapter);
    this.session = new SessionStore({ maxHistory: options?.maxSessionHistory });
    this.autoSave = new AutoSave();
    this.importExport = new ImportExport();

    // Run schema migrations
    this.runMigrations();

    // Start auto-save if interval provided
    if (options?.autoSaveIntervalMs && options.autoSaveIntervalMs > 0) {
      this.startAutoSave(options.autoSaveIntervalMs);
    }
  }

  /**
   * Async factory: create a StoreEngine with environment-aware adapter.
   * Browser → IndexedDB (via CachedAsyncAdapter for sync API).
   * Node.js → SQLite.
   * Fallback → Memory.
   */
  static async create(options?: {
    adapterType?: 'auto' | 'memory' | 'sqlite' | 'indexeddb';
    dbPath?: string;
    eventBus?: EventBus;
    maxSessionHistory?: number;
    autoSaveIntervalMs?: number;
  }): Promise<StoreEngine> {
    const { createStorageAdapter } = await import('./factory.js');
    const rawAdapter = await createStorageAdapter({
      type: options?.adapterType ?? 'auto',
      dbPath: options?.dbPath,
    });

    // If the adapter is async (IndexedDB), wrap it in CachedAsyncAdapter
    let adapter: StorageAdapter;
    if (isAsyncAdapter(rawAdapter)) {
      adapter = await CachedAsyncAdapter.create(rawAdapter);
    } else {
      adapter = rawAdapter;
    }

    return new StoreEngine({
      adapter,
      eventBus: options?.eventBus,
      maxSessionHistory: options?.maxSessionHistory,
      autoSaveIntervalMs: options?.autoSaveIntervalMs ?? 500,
    });
  }

  /** Start debounced auto-save that persists dirty state to the adapter. */
  startAutoSave(intervalMs: number): void {
    this.autoSave.start(intervalMs, () => {
      if (this.adapter instanceof CachedAsyncAdapter) {
        this.adapter.flush().catch((err) => {
          console.error('[StoreEngine] Auto-save flush failed:', err);
        });
      }
    });
  }

  /** Stop auto-save and perform a final flush. */
  async shutdown(): Promise<void> {
    this.autoSave.stop();
    if (this.adapter instanceof CachedAsyncAdapter) {
      await this.adapter.flush();
    }
  }

  /** Run schema migrations if needed. */
  private runMigrations(): void {
    const versionKey = '__schema_version__';
    const rawVersion = this.adapter.get(versionKey);
    const currentVersion = rawVersion !== undefined ? parseInt(rawVersion, 10) : 0;

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      for (const migration of MIGRATIONS) {
        if (migration.version > currentVersion) {
          try {
            migration.migrate(this.adapter);
          } catch (err) {
            console.error(`[StoreEngine] Migration v${migration.version} failed:`, err);
            break;
          }
        }
      }
      this.adapter.set(versionKey, String(CURRENT_SCHEMA_VERSION));
    }
  }
}

// ─────────────────────────────────────────────
// Schema Migrations
// ─────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 1;

interface Migration {
  readonly version: number;
  readonly description: string;
  migrate(adapter: StorageAdapter): void;
}

/** Migration registry. Add new migrations here as the schema evolves. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema — no migration needed',
    migrate(_adapter: StorageAdapter): void {
      // v1 is the initial schema, no transformation required.
    },
  },
];

// ─────────────────────────────────────────────
// CachedAsyncAdapter — Sync wrapper for async adapters
// ─────────────────────────────────────────────

/**
 * Type guard for async storage adapters.
 * Tests whether get() returns a Promise (thenable) vs a plain value.
 */
function isAsyncAdapter(adapter: StorageAdapter | import('./indexeddb-adapter.js').AsyncStorageAdapter): adapter is import('./indexeddb-adapter.js').AsyncStorageAdapter {
  try {
    const result = adapter.get('__type_probe__');
    return result !== null && typeof result === 'object' && 'then' in result;
  } catch {
    return false;
  }
}

/**
 * Wraps an AsyncStorageAdapter (e.g., IndexedDB) with an in-memory cache
 * that provides the sync StorageAdapter interface. All reads come from cache;
 * writes are cached immediately and flushed to the backing store asynchronously.
 */
export class CachedAsyncAdapter implements StorageAdapter {
  private readonly cache: Map<string, string> = new Map();
  private readonly dirty: Set<string> = new Set();
  private readonly deleted: Set<string> = new Set();
  private readonly backing: import('./indexeddb-adapter.js').AsyncStorageAdapter;
  private flushPromise: Promise<void> | null = null;

  private constructor(backing: import('./indexeddb-adapter.js').AsyncStorageAdapter) {
    this.backing = backing;
  }

  /**
   * Create and initialize a CachedAsyncAdapter by loading all existing
   * data from the backing store into memory.
   */
  static async create(
    backing: import('./indexeddb-adapter.js').AsyncStorageAdapter,
  ): Promise<CachedAsyncAdapter> {
    const adapter = new CachedAsyncAdapter(backing);
    const keys = await backing.keys();
    for (const key of keys) {
      const value = await backing.get(key);
      if (value !== undefined) {
        adapter.cache.set(key, value);
      }
    }
    return adapter;
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
    this.dirty.add(key);
    this.deleted.delete(key);
  }

  delete(key: string): boolean {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.dirty.delete(key);
    if (existed) {
      this.deleted.add(key);
    }
    return existed;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  clear(): void {
    for (const key of this.cache.keys()) {
      this.deleted.add(key);
    }
    this.cache.clear();
    this.dirty.clear();
  }

  /**
   * Flush all dirty writes and deletes to the backing async store.
   * Safe to call concurrently — subsequent calls wait for the current flush.
   */
  async flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this.doFlush();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async doFlush(): Promise<void> {
    // Snapshot and clear dirty/deleted sets
    const dirtyKeys = Array.from(this.dirty);
    const deletedKeys = Array.from(this.deleted);
    this.dirty.clear();
    this.deleted.clear();

    // Write dirty keys
    for (const key of dirtyKeys) {
      const value = this.cache.get(key);
      if (value !== undefined) {
        await this.backing.set(key, value);
      }
    }

    // Delete removed keys
    for (const key of deletedKeys) {
      await this.backing.delete(key);
    }
  }
}

// ─────────────────────────────────────────────
// SeedRepositoryWithEvents — SeedRepository that emits events
// ─────────────────────────────────────────────

/**
 * Extended SeedRepository that emits events on save and delete operations
 * via the provided EventBus instance.
 */
class SeedRepositoryWithEvents extends SeedRepository {
  private readonly eventBus: EventBus;

  constructor(adapter: StorageAdapter, eventBus: EventBus) {
    super(adapter);
    this.eventBus = eventBus;
  }

  /** Save a seed and emit a 'seed.created' event. */
  override save(seed: UniversalSeed): void {
    super.save(seed);
    this.eventBus.emit({
      type: 'seed.created',
      seed,
      timestamp: Date.now(),
    });
  }

  /** Delete a seed and emit a 'seed.died' event if it existed. */
  override delete(hash: string): boolean {
    const seed = this.get(hash);
    const deleted = super.delete(hash);
    if (deleted && seed !== undefined) {
      this.eventBus.emit({
        type: 'seed.died',
        seed,
        cause: 'deleted',
        timestamp: Date.now(),
      });
    }
    return deleted;
  }
}

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

export type { EvolutionLogEntry as EvolutionEntry };

export { SqliteAdapter } from './sqlite-adapter.js';
export type { AsyncStorageAdapter } from './indexeddb-adapter.js';
export { IndexedDBAdapter } from './indexeddb-adapter.js';
export { createStorageAdapter } from './factory.js';
