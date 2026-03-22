import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MemoryAdapter,
  SeedRepository,
  EvolutionLog,
  ConfigStore,
  SessionStore,
  AutoSave,
  ImportExport,
  StoreEngine,
  StoreError,
  STORE_EVENTS,
} from './index.js';
import type {
  StorageAdapter,
  EvolutionLogEntry,
  ExportFormat,
} from './index.js';
import { computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import type { UniversalSeed, GeneMap, Gene } from '@paradigm/types';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeSeed(name: string = 'test-seed', domain: string = 'organism', genes?: GeneMap): UniversalSeed {
  const g: GeneMap = genes ?? {
    health: { type: 'scalar', value: 0.8, min: 0, max: 1 },
    speed: { type: 'scalar', value: 50, min: 0, max: 100 },
    role: { type: 'categorical', value: 'warrior', options: ['warrior', 'mage', 'healer'] },
  };
  const now = Date.now();
  const seed: UniversalSeed = {
    $gst: '4.0',
    $domain: domain as UniversalSeed['$domain'],
    $name: name,
    $hash: '',
    $lineage: { generation: 0, parents: [], timestamp: now },
    genes: g,
    $metadata: { created: now },
  };
  seed.$hash = computeQuickHash({ name, domain, genes: g });
  return seed;
}

function makeSeedWithVector(name: string = 'vec-seed'): UniversalSeed {
  return makeSeed(name, 'organism', {
    position: { type: 'vector', value: [1, 2, 3], dimensions: 3 },
  });
}

function makeSeedWithExpression(name: string = 'expr-seed'): UniversalSeed {
  return makeSeed(name, 'organism', {
    formula: { type: 'expression', source: 'x * 2 + 1' },
  });
}

function makeEvoEntry(runId: string, generation: number, bestFitness: number = 0.9): EvolutionLogEntry {
  return {
    runId,
    generation,
    bestFitness,
    avgFitness: bestFitness * 0.7,
    populationSize: 100,
    timestamp: Date.now(),
  };
}

// ─────────────────────────────────────────────
// MemoryAdapter
// ─────────────────────────────────────────────

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  it('returns undefined for missing key', () => {
    expect(adapter.get('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    adapter.set('key1', 'value1');
    expect(adapter.get('key1')).toBe('value1');
  });

  it('overwrites an existing key', () => {
    adapter.set('key1', 'first');
    adapter.set('key1', 'second');
    expect(adapter.get('key1')).toBe('second');
  });

  it('reports has() correctly for existing key', () => {
    adapter.set('key1', 'v');
    expect(adapter.has('key1')).toBe(true);
  });

  it('reports has() correctly for missing key', () => {
    expect(adapter.has('key1')).toBe(false);
  });

  it('deletes an existing key and returns true', () => {
    adapter.set('key1', 'v');
    expect(adapter.delete('key1')).toBe(true);
    expect(adapter.has('key1')).toBe(false);
  });

  it('returns false when deleting a non-existent key', () => {
    expect(adapter.delete('nope')).toBe(false);
  });

  it('returns all keys', () => {
    adapter.set('a', '1');
    adapter.set('b', '2');
    adapter.set('c', '3');
    const keys = adapter.keys();
    expect(keys).toHaveLength(3);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
  });

  it('returns empty keys when empty', () => {
    expect(adapter.keys()).toEqual([]);
  });

  it('clears all entries', () => {
    adapter.set('a', '1');
    adapter.set('b', '2');
    adapter.clear();
    expect(adapter.keys()).toEqual([]);
    expect(adapter.get('a')).toBeUndefined();
  });

  it('implements StorageAdapter interface correctly', () => {
    const sa: StorageAdapter = adapter;
    sa.set('x', 'y');
    expect(sa.get('x')).toBe('y');
    expect(sa.has('x')).toBe(true);
    expect(sa.keys()).toEqual(['x']);
    sa.delete('x');
    expect(sa.has('x')).toBe(false);
    sa.clear();
  });
});

// ─────────────────────────────────────────────
// SeedRepository
// ─────────────────────────────────────────────

describe('SeedRepository', () => {
  let adapter: MemoryAdapter;
  let repo: SeedRepository;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    repo = new SeedRepository(adapter);
  });

  it('starts with count 0', () => {
    expect(repo.count()).toBe(0);
  });

  it('saves and retrieves a seed by hash', () => {
    const seed = makeSeed();
    repo.save(seed);
    const retrieved = repo.get(seed.$hash);
    expect(retrieved).toBeDefined();
    expect(retrieved!.$name).toBe('test-seed');
    expect(retrieved!.$hash).toBe(seed.$hash);
  });

  it('returns undefined for non-existent hash', () => {
    expect(repo.get('nonexistent-hash')).toBeUndefined();
  });

  it('increments count on save', () => {
    repo.save(makeSeed('s1'));
    repo.save(makeSeed('s2'));
    expect(repo.count()).toBe(2);
  });

  it('overwrites seed with same hash', () => {
    const seed = makeSeed();
    repo.save(seed);
    repo.save(seed);
    expect(repo.count()).toBe(1);
  });

  it('getAll returns all stored seeds', () => {
    const s1 = makeSeed('alpha');
    const s2 = makeSeed('beta');
    repo.save(s1);
    repo.save(s2);
    const all = repo.getAll();
    expect(all).toHaveLength(2);
    const names = all.map((s) => s.$name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
  });

  it('getAll returns empty array when no seeds', () => {
    expect(repo.getAll()).toEqual([]);
  });

  it('deletes a seed by hash', () => {
    const seed = makeSeed();
    repo.save(seed);
    expect(repo.delete(seed.$hash)).toBe(true);
    expect(repo.get(seed.$hash)).toBeUndefined();
    expect(repo.count()).toBe(0);
  });

  it('returns false when deleting non-existent seed', () => {
    expect(repo.delete('nope')).toBe(false);
  });

  it('search finds seeds matching predicate', () => {
    const s1 = makeSeed('warrior-1');
    const s2 = makeSeedWithVector('vector-entity');
    repo.save(s1);
    repo.save(s2);
    const results = repo.search((s) => s.$name.includes('warrior'));
    expect(results).toHaveLength(1);
    expect(results[0]!.$name).toBe('warrior-1');
  });

  it('search returns empty when no match', () => {
    repo.save(makeSeed());
    const results = repo.search(() => false);
    expect(results).toEqual([]);
  });

  it('search returns all when predicate always true', () => {
    repo.save(makeSeed('a'));
    repo.save(makeSeed('b'));
    const results = repo.search(() => true);
    expect(results).toHaveLength(2);
  });

  it('count ignores non-seed keys in adapter', () => {
    adapter.set('other:key', 'value');
    repo.save(makeSeed());
    expect(repo.count()).toBe(1);
  });

  it('getAll ignores non-seed keys in adapter', () => {
    adapter.set('config:something', 'value');
    repo.save(makeSeed());
    expect(repo.getAll()).toHaveLength(1);
  });

  it('preserves seed genes through serialization round-trip', () => {
    const seed = makeSeed();
    repo.save(seed);
    const retrieved = repo.get(seed.$hash)!;
    expect(retrieved.genes['health']).toBeDefined();
    const health = retrieved.genes['health']!;
    expect(health.type).toBe('scalar');
    if (health.type === 'scalar') {
      expect(health.value).toBe(0.8);
      expect(health.min).toBe(0);
      expect(health.max).toBe(1);
    }
  });

  it('preserves vector genes through serialization', () => {
    const seed = makeSeedWithVector();
    repo.save(seed);
    const retrieved = repo.get(seed.$hash)!;
    const pos = retrieved.genes['position']!;
    expect(pos.type).toBe('vector');
    if (pos.type === 'vector') {
      expect(pos.value).toEqual([1, 2, 3]);
    }
  });

  it('preserves expression genes through serialization', () => {
    const seed = makeSeedWithExpression();
    repo.save(seed);
    const retrieved = repo.get(seed.$hash)!;
    const formula = retrieved.genes['formula']!;
    expect(formula.type).toBe('expression');
    if (formula.type === 'expression') {
      expect(formula.source).toBe('x * 2 + 1');
    }
  });

  it('search ignores non-seed keys in adapter', () => {
    adapter.set('config:foo', 'bar');
    repo.save(makeSeed('target'));
    const results = repo.search((s) => s.$name === 'target');
    expect(results).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// EvolutionLog
// ─────────────────────────────────────────────

describe('EvolutionLog', () => {
  let adapter: MemoryAdapter;
  let log: EvolutionLog;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    log = new EvolutionLog(adapter);
  });

  it('records and retrieves a single entry', () => {
    const entry = makeEvoEntry('run-1', 0);
    log.record(entry);
    const entries = log.getLog('run-1');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.runId).toBe('run-1');
    expect(entries[0]!.generation).toBe(0);
  });

  it('appends multiple entries to the same run', () => {
    log.record(makeEvoEntry('run-1', 0, 0.5));
    log.record(makeEvoEntry('run-1', 1, 0.7));
    log.record(makeEvoEntry('run-1', 2, 0.9));
    const entries = log.getLog('run-1');
    expect(entries).toHaveLength(3);
    expect(entries[0]!.generation).toBe(0);
    expect(entries[2]!.generation).toBe(2);
  });

  it('returns empty array for unknown run', () => {
    expect(log.getLog('unknown')).toEqual([]);
  });

  it('getAllRuns lists distinct run IDs', () => {
    log.record(makeEvoEntry('run-a', 0));
    log.record(makeEvoEntry('run-b', 0));
    log.record(makeEvoEntry('run-a', 1));
    const runs = log.getAllRuns();
    expect(runs).toHaveLength(2);
    expect(runs).toContain('run-a');
    expect(runs).toContain('run-b');
  });

  it('getAllRuns returns empty when no entries', () => {
    expect(log.getAllRuns()).toEqual([]);
  });

  it('getLatestEntry returns the last recorded entry', () => {
    log.record(makeEvoEntry('run-1', 0, 0.3));
    log.record(makeEvoEntry('run-1', 1, 0.6));
    log.record(makeEvoEntry('run-1', 2, 0.9));
    const latest = log.getLatestEntry('run-1');
    expect(latest).toBeDefined();
    expect(latest!.generation).toBe(2);
    expect(latest!.bestFitness).toBe(0.9);
  });

  it('getLatestEntry returns undefined for unknown run', () => {
    expect(log.getLatestEntry('nope')).toBeUndefined();
  });

  it('keeps runs isolated from each other', () => {
    log.record(makeEvoEntry('run-x', 0, 0.1));
    log.record(makeEvoEntry('run-y', 0, 0.9));
    expect(log.getLog('run-x')).toHaveLength(1);
    expect(log.getLog('run-y')).toHaveLength(1);
    expect(log.getLog('run-x')[0]!.bestFitness).toBe(0.1);
    expect(log.getLog('run-y')[0]!.bestFitness).toBe(0.9);
  });

  it('preserves populationSize and avgFitness', () => {
    const entry = makeEvoEntry('run-1', 5, 0.8);
    log.record(entry);
    const retrieved = log.getLog('run-1')[0]!;
    expect(retrieved.populationSize).toBe(100);
    expect(retrieved.avgFitness).toBeCloseTo(0.56);
  });

  it('getAllRuns ignores non-evo keys in adapter', () => {
    adapter.set('seed:abc', 'data');
    log.record(makeEvoEntry('run-1', 0));
    expect(log.getAllRuns()).toEqual(['run-1']);
  });
});

// ─────────────────────────────────────────────
// ConfigStore
// ─────────────────────────────────────────────

describe('ConfigStore', () => {
  let adapter: MemoryAdapter;
  let config: ConfigStore;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    config = new ConfigStore(adapter);
  });

  it('returns default value for missing key', () => {
    expect(config.get('theme', 'light')).toBe('light');
  });

  it('returns undefined when no default and key missing', () => {
    expect(config.get('missing')).toBeUndefined();
  });

  it('sets and gets a string value', () => {
    config.set('theme', 'dark');
    expect(config.get('theme')).toBe('dark');
  });

  it('sets and gets a number value', () => {
    config.set('volume', 75);
    expect(config.get('volume')).toBe(75);
  });

  it('sets and gets a boolean value', () => {
    config.set('fullscreen', true);
    expect(config.get('fullscreen')).toBe(true);
  });

  it('sets and gets an object value', () => {
    config.set('window', { width: 800, height: 600 });
    expect(config.get('window')).toEqual({ width: 800, height: 600 });
  });

  it('sets and gets an array value', () => {
    config.set('recentFiles', ['a.gspl', 'b.gspl']);
    expect(config.get('recentFiles')).toEqual(['a.gspl', 'b.gspl']);
  });

  it('overwrites existing config value', () => {
    config.set('theme', 'light');
    config.set('theme', 'dark');
    expect(config.get('theme')).toBe('dark');
  });

  it('getAll returns all config entries', () => {
    config.set('theme', 'dark');
    config.set('volume', 50);
    const all = config.getAll();
    expect(all['theme']).toBe('dark');
    expect(all['volume']).toBe(50);
  });

  it('getAll returns empty object when no config', () => {
    expect(config.getAll()).toEqual({});
  });

  it('reset removes all config entries', () => {
    config.set('a', 1);
    config.set('b', 2);
    config.reset();
    expect(config.getAll()).toEqual({});
    expect(config.get('a')).toBeUndefined();
    expect(config.get('b')).toBeUndefined();
  });

  it('reset on empty store does not throw', () => {
    expect(() => config.reset()).not.toThrow();
  });

  it('does not duplicate keys in index on repeated set', () => {
    config.set('key', 'v1');
    config.set('key', 'v2');
    config.set('key', 'v3');
    const all = config.getAll();
    expect(Object.keys(all)).toEqual(['key']);
  });

  it('default value is not returned after key is set', () => {
    config.set('x', 42);
    expect(config.get('x', 99)).toBe(42);
  });

  it('handles null value', () => {
    config.set('nullable', null);
    expect(config.get('nullable', 'fallback')).toBeNull();
  });
});

// ─────────────────────────────────────────────
// SessionStore
// ─────────────────────────────────────────────

describe('SessionStore', () => {
  let session: SessionStore;

  beforeEach(() => {
    session = new SessionStore();
  });

  it('starts with empty current state', () => {
    expect(session.getCurrentState()).toEqual({});
  });

  it('canUndo is false initially', () => {
    expect(session.canUndo()).toBe(false);
  });

  it('canRedo is false initially', () => {
    expect(session.canRedo()).toBe(false);
  });

  it('saveState updates current state', () => {
    session.saveState({ a: 1 });
    expect(session.getCurrentState()).toEqual({ a: 1 });
  });

  it('saveState enables undo', () => {
    session.saveState({ a: 1 });
    expect(session.canUndo()).toBe(true);
  });

  it('undo restores previous state', () => {
    session.saveState({ a: 1 });
    session.saveState({ b: 2 });
    const restored = session.undo();
    expect(restored).toEqual({ a: 1 });
    expect(session.getCurrentState()).toEqual({ a: 1 });
  });

  it('undo returns undefined when nothing to undo', () => {
    expect(session.undo()).toBeUndefined();
  });

  it('redo returns undefined when nothing to redo', () => {
    expect(session.redo()).toBeUndefined();
  });

  it('undo then redo restores the undone state', () => {
    session.saveState({ a: 1 });
    session.saveState({ b: 2 });
    session.undo();
    expect(session.canRedo()).toBe(true);
    const redone = session.redo();
    expect(redone).toEqual({ b: 2 });
  });

  it('saveState clears redo stack', () => {
    session.saveState({ a: 1 });
    session.saveState({ b: 2 });
    session.undo();
    session.saveState({ c: 3 });
    expect(session.canRedo()).toBe(false);
  });

  it('multiple undos walk back through history', () => {
    session.saveState({ step: 1 });
    session.saveState({ step: 2 });
    session.saveState({ step: 3 });
    expect(session.undo()).toEqual({ step: 2 });
    expect(session.undo()).toEqual({ step: 1 });
    expect(session.undo()).toEqual({});
    expect(session.canUndo()).toBe(false);
  });

  it('multiple redos walk forward through history', () => {
    session.saveState({ step: 1 });
    session.saveState({ step: 2 });
    session.saveState({ step: 3 });
    session.undo();
    session.undo();
    session.undo();
    expect(session.redo()).toEqual({ step: 1 });
    expect(session.redo()).toEqual({ step: 2 });
    expect(session.redo()).toEqual({ step: 3 });
    expect(session.canRedo()).toBe(false);
  });

  it('respects maxHistory depth', () => {
    const small = new SessionStore({ maxHistory: 3 });
    small.saveState({ a: 1 });
    small.saveState({ b: 2 });
    small.saveState({ c: 3 });
    small.saveState({ d: 4 });
    // Only 3 undo levels
    small.undo();
    small.undo();
    small.undo();
    expect(small.canUndo()).toBe(false);
  });

  it('maxHistory=1 keeps only one undo step', () => {
    const tiny = new SessionStore({ maxHistory: 1 });
    tiny.saveState({ first: 1 });
    tiny.saveState({ second: 2 });
    tiny.saveState({ third: 3 });
    expect(tiny.undo()).toEqual({ second: 2 });
    expect(tiny.canUndo()).toBe(false);
  });

  it('state snapshots are isolated from mutations', () => {
    const state = { counter: 0 };
    session.saveState(state);
    state.counter = 999;
    expect(session.getCurrentState()).toEqual({ counter: 0 });
  });

  it('returned state from undo is isolated', () => {
    session.saveState({ x: 1 });
    session.saveState({ x: 2 });
    const restored = session.undo()!;
    restored['x'] = 999;
    expect(session.getCurrentState()).toEqual({ x: 1 });
  });

  it('default maxHistory is 50', () => {
    for (let i = 0; i < 60; i++) {
      session.saveState({ i });
    }
    let undoCount = 0;
    while (session.canUndo()) {
      session.undo();
      undoCount++;
    }
    expect(undoCount).toBe(50);
  });

  it('redo after undo returns correct state', () => {
    session.saveState({ val: 'A' });
    session.undo();
    const redone = session.redo();
    expect(redone).toEqual({ val: 'A' });
  });

  it('getCurrentState returns clone not reference', () => {
    session.saveState({ data: 'original' });
    const s1 = session.getCurrentState();
    const s2 = session.getCurrentState();
    expect(s1).toEqual(s2);
    s1['data'] = 'modified';
    expect(session.getCurrentState()).toEqual({ data: 'original' });
  });
});

// ─────────────────────────────────────────────
// AutoSave
// ─────────────────────────────────────────────

describe('AutoSave', () => {
  let autoSave: AutoSave;

  beforeEach(() => {
    vi.useFakeTimers();
    autoSave = new AutoSave();
  });

  afterEach(() => {
    autoSave.stop();
    vi.useRealTimers();
  });

  it('is not running initially', () => {
    expect(autoSave.isRunning()).toBe(false);
  });

  it('starts and reports running', () => {
    autoSave.start(1000, () => {});
    expect(autoSave.isRunning()).toBe(true);
  });

  it('calls callback at intervals', () => {
    const cb = vi.fn();
    autoSave.start(500, cb);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1500);
    expect(cb).toHaveBeenCalledTimes(5);
  });

  it('does not call callback before interval elapses', () => {
    const cb = vi.fn();
    autoSave.start(1000, cb);
    vi.advanceTimersByTime(999);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stop halts the timer', () => {
    const cb = vi.fn();
    autoSave.start(500, cb);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
    autoSave.stop();
    expect(autoSave.isRunning()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('triggerNow invokes callback immediately', () => {
    const cb = vi.fn();
    autoSave.start(10000, cb);
    autoSave.triggerNow();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('triggerNow does nothing when no callback set', () => {
    expect(() => autoSave.triggerNow()).not.toThrow();
  });

  it('triggerNow does nothing after stop', () => {
    const cb = vi.fn();
    autoSave.start(1000, cb);
    autoSave.stop();
    autoSave.triggerNow();
    expect(cb).not.toHaveBeenCalled();
  });

  it('start replaces previous schedule', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    autoSave.start(500, cb1);
    autoSave.start(500, cb2);
    vi.advanceTimersByTime(500);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('handles callback errors without crashing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    autoSave.start(100, () => { throw new Error('boom'); });
    vi.advanceTimersByTime(100);
    expect(consoleSpy).toHaveBeenCalled();
    expect(autoSave.isRunning()).toBe(true);
    consoleSpy.mockRestore();
  });

  it('handles callback errors on triggerNow without crashing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    autoSave.start(10000, () => { throw new Error('boom'); });
    expect(() => autoSave.triggerNow()).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('stop is idempotent', () => {
    autoSave.start(500, () => {});
    autoSave.stop();
    expect(() => autoSave.stop()).not.toThrow();
    expect(autoSave.isRunning()).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ImportExport
// ─────────────────────────────────────────────

describe('ImportExport', () => {
  let ie: ImportExport;

  beforeEach(() => {
    ie = new ImportExport();
  });

  describe('JSON format', () => {
    it('exports seeds to JSON format', () => {
      const seed = makeSeed();
      const json = ie.exportSeeds([seed], 'json');
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].$name).toBe('test-seed');
    });

    it('imports seeds from JSON format', () => {
      const seed = makeSeed();
      const json = ie.exportSeeds([seed], 'json');
      const imported = ie.importSeeds(json, 'json');
      expect(imported).toHaveLength(1);
      expect(imported[0]!.$name).toBe('test-seed');
      expect(imported[0]!.$hash).toBe(seed.$hash);
    });

    it('round-trips multiple seeds', () => {
      const seeds = [makeSeed('alpha'), makeSeed('beta'), makeSeedWithVector()];
      const json = ie.exportSeeds(seeds, 'json');
      const imported = ie.importSeeds(json, 'json');
      expect(imported).toHaveLength(3);
    });

    it('exports empty array as valid JSON', () => {
      const json = ie.exportSeeds([], 'json');
      expect(JSON.parse(json)).toEqual([]);
    });

    it('imports empty array', () => {
      expect(ie.importSeeds('[]', 'json')).toEqual([]);
    });

    it('throws StoreError for non-array JSON', () => {
      expect(() => ie.importSeeds('{"not":"array"}', 'json')).toThrow(StoreError);
    });

    it('throws for invalid JSON string', () => {
      expect(() => ie.importSeeds('not json', 'json')).toThrow();
    });

    it('filters out invalid seeds from JSON import', () => {
      const json = JSON.stringify([
        { $gst: '4.0', $domain: 'organism', $hash: 'h1', $name: 'valid', genes: {} },
        { notASeed: true },
        null,
        42,
      ]);
      const imported = ie.importSeeds(json, 'json');
      expect(imported).toHaveLength(1);
      expect(imported[0]!.$name).toBe('valid');
    });
  });

  describe('GSPL format', () => {
    it('exports a seed with scalar genes to GSPL format', () => {
      const seed = makeSeed();
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('seed "test-seed" organism {');
      expect(gspl).toContain('health: scalar(');
      expect(gspl).toContain('role: categorical(');
    });

    it('exports a seed with vector genes', () => {
      const seed = makeSeedWithVector();
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('vector([1, 2, 3])');
    });

    it('exports a seed with expression genes', () => {
      const seed = makeSeedWithExpression();
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('expression("x * 2 + 1")');
    });

    it('includes hash comment in GSPL export', () => {
      const seed = makeSeed();
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain(`// hash: ${seed.$hash}`);
    });

    it('imports scalar genes from GSPL format', () => {
      const gspl = `seed "warrior" organism {
  health: scalar(0.8, 0, 1);
  speed: scalar(50, 0, 100);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      expect(imported).toHaveLength(1);
      expect(imported[0]!.$name).toBe('warrior');
      expect(imported[0]!.$domain).toBe('organism');
      const health = imported[0]!.genes['health']!;
      expect(health.type).toBe('scalar');
      if (health.type === 'scalar') {
        expect(health.value).toBe(0.8);
        expect(health.min).toBe(0);
        expect(health.max).toBe(1);
      }
    });

    it('imports categorical genes from GSPL format', () => {
      const gspl = `seed "hero" organism {
  role: categorical("warrior", ["warrior", "mage", "healer"]);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      const role = imported[0]!.genes['role']!;
      expect(role.type).toBe('categorical');
      if (role.type === 'categorical') {
        expect(role.value).toBe('warrior');
        expect(role.options).toEqual(['warrior', 'mage', 'healer']);
      }
    });

    it('imports vector genes from GSPL format', () => {
      const gspl = `seed "entity" organism {
  pos: vector([10, 20, 30]);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      const pos = imported[0]!.genes['pos']!;
      expect(pos.type).toBe('vector');
      if (pos.type === 'vector') {
        expect(pos.value).toEqual([10, 20, 30]);
        expect(pos.dimensions).toBe(3);
      }
    });

    it('imports expression genes from GSPL format', () => {
      const gspl = `seed "computed" organism {
  formula: expression("x * 2 + 1");
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      const formula = imported[0]!.genes['formula']!;
      expect(formula.type).toBe('expression');
      if (formula.type === 'expression') {
        expect(formula.source).toBe('x * 2 + 1');
      }
    });

    it('imports multiple seeds separated by blank lines', () => {
      const gspl = `seed "alpha" organism {
  health: scalar(1, 0, 1);
}

seed "beta" vehicle {
  speed: scalar(100, 0, 200);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      expect(imported).toHaveLength(2);
      expect(imported[0]!.$name).toBe('alpha');
      expect(imported[1]!.$name).toBe('beta');
    });

    it('skips empty blocks', () => {
      const gspl = `

seed "only" organism {
  x: scalar(1, 0, 1);
}

`;
      const imported = ie.importSeeds(gspl, 'gspl');
      expect(imported).toHaveLength(1);
    });

    it('skips blocks without valid seed header', () => {
      const gspl = `not a seed block

seed "valid" organism {
  x: scalar(1, 0, 1);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      expect(imported).toHaveLength(1);
      expect(imported[0]!.$name).toBe('valid');
    });

    it('handles numeric fallback for unknown gene types', () => {
      const gspl = `seed "simple" organism {
  raw: 0.5;
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      const raw = imported[0]!.genes['raw']!;
      expect(raw.type).toBe('scalar');
      if (raw.type === 'scalar') {
        expect(raw.value).toBe(0.5);
        expect(raw.min).toBe(0);
        expect(raw.max).toBe(1);
      }
    });

    it('skips unrecognized gene formats', () => {
      const gspl = `seed "mixed" organism {
  valid: scalar(1, 0, 2);
  invalid: someUnknownThing(blah);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      expect(imported[0]!.genes['valid']).toBeDefined();
      expect(imported[0]!.genes['invalid']).toBeUndefined();
    });

    it('exports empty array as empty string', () => {
      const gspl = ie.exportSeeds([], 'gspl');
      expect(gspl).toBe('');
    });

    it('assigns $gst and $lineage on GSPL import', () => {
      const gspl = `seed "imported" organism {
  x: scalar(1, 0, 1);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      expect(imported[0]!.$gst).toBe('4.0');
      expect(imported[0]!.$lineage.generation).toBe(0);
      expect(imported[0]!.$lineage.parents).toEqual([]);
    });

    it('computes hash on GSPL import', () => {
      const gspl = `seed "hashed" organism {
  x: scalar(1, 0, 1);
}`;
      const imported = ie.importSeeds(gspl, 'gspl');
      expect(imported[0]!.$hash).toBeTruthy();
      expect(typeof imported[0]!.$hash).toBe('string');
    });

    it('imports empty string as no seeds', () => {
      const imported = ie.importSeeds('', 'gspl');
      expect(imported).toEqual([]);
    });
  });

  describe('GSPL format — advanced gene types', () => {
    it('exports struct genes', () => {
      const seed = makeSeed('struct-test', 'organism', {
        nested: {
          type: 'struct' as const,
          value: {
            inner: { type: 'scalar' as const, value: 0.5, min: 0, max: 1 },
          },
        },
      });
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('struct(');
    });

    it('exports array genes', () => {
      const seed = makeSeed('array-test', 'organism', {
        items: {
          type: 'array' as const,
          value: [
            { type: 'scalar' as const, value: 1, min: 0, max: 2 },
            { type: 'scalar' as const, value: 2, min: 0, max: 3 },
          ],
        },
      });
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('array([');
    });

    it('exports graph genes', () => {
      const seed = makeSeed('graph-test', 'organism', {
        network: {
          type: 'graph' as const,
          nodes: new Map([['a', { type: 'scalar' as const, value: 1, min: 0, max: 1 }]]),
          edges: [{ from: 'a', to: 'b', weight: 1.0 }],
        },
      });
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('graph(1 nodes, 1 edges)');
    });

    it('exports tensor genes', () => {
      const seed = makeSeed('tensor-test', 'organism', {
        weights: {
          type: 'tensor' as const,
          data: new Float64Array([1, 2, 3, 4]),
          shape: [2, 2],
        },
      });
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('tensor([');
      expect(gspl).toContain('shape=[2, 2]');
    });

    it('exports timeseries genes', () => {
      const seed = makeSeed('ts-test', 'organism', {
        signal: {
          type: 'timeseries' as const,
          interpolation: 'linear' as const,
          keyframes: [
            { t: 0, v: 0 },
            { t: 1, v: 1 },
          ],
        },
      });
      const gspl = ie.exportSeeds([seed], 'gspl');
      expect(gspl).toContain('timeseries(linear,');
      expect(gspl).toContain('0:0');
      expect(gspl).toContain('1:1');
    });
  });
});

// ─────────────────────────────────────────────
// StoreError
// ─────────────────────────────────────────────

describe('StoreError', () => {
  it('has correct name', () => {
    expect(new StoreError('test').name).toBe('StoreError');
  });

  it('has correct message', () => {
    expect(new StoreError('oops').message).toBe('oops');
  });

  it('has default code STORE_ERROR', () => {
    expect(new StoreError('test').code).toBe('STORE_ERROR');
  });

  it('accepts custom code', () => {
    expect(new StoreError('test', 'CUSTOM').code).toBe('CUSTOM');
  });

  it('is instance of Error', () => {
    expect(new StoreError('test')).toBeInstanceOf(Error);
  });

  it('is instance of StoreError', () => {
    expect(new StoreError('test')).toBeInstanceOf(StoreError);
  });
});

// ─────────────────────────────────────────────
// STORE_EVENTS
// ─────────────────────────────────────────────

describe('STORE_EVENTS', () => {
  it('has SEED_SAVED constant', () => {
    expect(STORE_EVENTS.SEED_SAVED).toBe('seed.created');
  });

  it('has SEED_DELETED constant', () => {
    expect(STORE_EVENTS.SEED_DELETED).toBe('seed.died');
  });
});

// ─────────────────────────────────────────────
// StoreEngine
// ─────────────────────────────────────────────

describe('StoreEngine', () => {
  it('constructs with default adapter and event bus', () => {
    const engine = new StoreEngine();
    expect(engine.adapter).toBeDefined();
    expect(engine.eventBus).toBeDefined();
    expect(engine.seeds).toBeDefined();
    expect(engine.evolution).toBeDefined();
    expect(engine.config).toBeDefined();
    expect(engine.session).toBeDefined();
    expect(engine.autoSave).toBeDefined();
    expect(engine.importExport).toBeDefined();
  });

  it('accepts custom adapter', () => {
    const adapter = new MemoryAdapter();
    const engine = new StoreEngine({ adapter });
    expect(engine.adapter).toBe(adapter);
  });

  it('accepts custom event bus', () => {
    const bus = new EventBus();
    const engine = new StoreEngine({ eventBus: bus });
    expect(engine.eventBus).toBe(bus);
  });

  it('accepts custom maxSessionHistory', () => {
    const engine = new StoreEngine({ maxSessionHistory: 5 });
    for (let i = 0; i < 7; i++) {
      engine.session.saveState({ i });
    }
    let undoCount = 0;
    while (engine.session.canUndo()) {
      engine.session.undo();
      undoCount++;
    }
    expect(undoCount).toBe(5);
  });

  it('seeds.save emits seed.created event', () => {
    const bus = new EventBus();
    const engine = new StoreEngine({ eventBus: bus });
    const events: unknown[] = [];
    bus.on('seed.created', (e) => events.push(e));
    engine.seeds.save(makeSeed());
    expect(events).toHaveLength(1);
    const evt = events[0] as Record<string, unknown>;
    expect(evt['type']).toBe('seed.created');
  });

  it('seeds.delete emits seed.died event when seed exists', () => {
    const bus = new EventBus();
    const engine = new StoreEngine({ eventBus: bus });
    const events: unknown[] = [];
    bus.on('seed.died', (e) => events.push(e));
    const seed = makeSeed();
    engine.seeds.save(seed);
    engine.seeds.delete(seed.$hash);
    expect(events).toHaveLength(1);
    const evt = events[0] as Record<string, unknown>;
    expect(evt['type']).toBe('seed.died');
    expect(evt['cause']).toBe('deleted');
  });

  it('seeds.delete does not emit event when seed does not exist', () => {
    const bus = new EventBus();
    const engine = new StoreEngine({ eventBus: bus });
    const events: unknown[] = [];
    bus.on('seed.died', (e) => events.push(e));
    engine.seeds.delete('nonexistent');
    expect(events).toHaveLength(0);
  });

  it('subsystems share the same adapter', () => {
    const engine = new StoreEngine();
    engine.seeds.save(makeSeed());
    expect(engine.adapter.keys().some((k) => k.startsWith('seed:'))).toBe(true);
  });

  it('config and evolution use the same adapter', () => {
    const engine = new StoreEngine();
    engine.config.set('theme', 'dark');
    engine.evolution.record(makeEvoEntry('r1', 0));
    const keys = engine.adapter.keys();
    expect(keys.some((k) => k.startsWith('config:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('evo:'))).toBe(true);
  });

  it('full workflow: save, search, export, import', () => {
    const engine = new StoreEngine();
    const s1 = makeSeed('warrior');
    const s2 = makeSeedWithVector('archer');
    engine.seeds.save(s1);
    engine.seeds.save(s2);
    const warriors = engine.seeds.search((s) => s.$name === 'warrior');
    expect(warriors).toHaveLength(1);
    const exported = engine.importExport.exportSeeds(engine.seeds.getAll(), 'json');
    const imported = engine.importExport.importSeeds(exported, 'json');
    expect(imported).toHaveLength(2);
  });

  it('constructs with no options', () => {
    const engine = new StoreEngine();
    expect(engine).toBeDefined();
    expect(engine.seeds.count()).toBe(0);
  });

  it('seed.created event includes seed data', () => {
    const bus = new EventBus();
    const engine = new StoreEngine({ eventBus: bus });
    const events: unknown[] = [];
    bus.on('seed.created', (e) => events.push(e));
    const seed = makeSeed('observed');
    engine.seeds.save(seed);
    const evt = events[0] as Record<string, unknown>;
    expect((evt['seed'] as UniversalSeed).$name).toBe('observed');
    expect(typeof evt['timestamp']).toBe('number');
  });

  it('seed.died event includes seed data', () => {
    const bus = new EventBus();
    const engine = new StoreEngine({ eventBus: bus });
    const events: unknown[] = [];
    bus.on('seed.died', (e) => events.push(e));
    const seed = makeSeed('doomed');
    engine.seeds.save(seed);
    engine.seeds.delete(seed.$hash);
    const evt = events[0] as Record<string, unknown>;
    expect((evt['seed'] as UniversalSeed).$name).toBe('doomed');
    expect(typeof evt['timestamp']).toBe('number');
  });
});

// ─────────────────────────────────────────────
// Serialization round-trip (Map, Set, typed arrays)
// ─────────────────────────────────────────────

describe('Serialization round-trip for special types', () => {
  it('preserves Map in graph gene through JSON export/import', () => {
    const seed = makeSeed('graph-seed', 'organism', {
      net: {
        type: 'graph' as const,
        nodes: new Map([['n1', { type: 'scalar' as const, value: 1, min: 0, max: 1 }]]),
        edges: [{ from: 'n1', to: 'n2', weight: 0.5 }],
      },
    });
    const ie = new ImportExport();
    const json = ie.exportSeeds([seed], 'json');
    const imported = ie.importSeeds(json, 'json');
    const net = imported[0]!.genes['net']!;
    expect(net.type).toBe('graph');
    if (net.type === 'graph') {
      expect(net.nodes).toBeInstanceOf(Map);
      expect(net.nodes.get('n1')).toBeDefined();
    }
  });

  it('preserves Float64Array in tensor gene through save/load', () => {
    const adapter = new MemoryAdapter();
    const repo = new SeedRepository(adapter);
    const seed = makeSeed('tensor-seed', 'organism', {
      w: {
        type: 'tensor' as const,
        data: new Float64Array([1.1, 2.2, 3.3]),
        shape: [3],
      },
    });
    repo.save(seed);
    const loaded = repo.get(seed.$hash)!;
    const w = loaded.genes['w']!;
    expect(w.type).toBe('tensor');
    if (w.type === 'tensor') {
      expect(w.data).toBeInstanceOf(Float64Array);
      expect(w.data[0]).toBeCloseTo(1.1);
    }
  });

  it('preserves Float32Array through save/load', () => {
    const adapter = new MemoryAdapter();
    const repo = new SeedRepository(adapter);
    const seed = makeSeed('f32-seed', 'organism', {
      w: {
        type: 'tensor' as const,
        data: new Float32Array([1.5, 2.5]),
        shape: [2],
      },
    });
    repo.save(seed);
    const loaded = repo.get(seed.$hash)!;
    const w = loaded.genes['w']!;
    if (w.type === 'tensor') {
      expect(w.data).toBeInstanceOf(Float32Array);
    }
  });

  it('preserves Uint8Array through save/load', () => {
    const adapter = new MemoryAdapter();
    const repo = new SeedRepository(adapter);
    const seed = makeSeed('u8-seed', 'organism', {
      w: {
        type: 'tensor' as const,
        data: new Uint8Array([10, 20, 30]),
        shape: [3],
      },
    });
    repo.save(seed);
    const loaded = repo.get(seed.$hash)!;
    const w = loaded.genes['w']!;
    if (w.type === 'tensor') {
      expect(w.data).toBeInstanceOf(Uint8Array);
    }
  });

  it('preserves Set through JSON round-trip', () => {
    const adapter = new MemoryAdapter();
    // Manually set a value that contains a Set (testing serialization directly)
    const obj = { tags: new Set(['a', 'b', 'c']) };
    const json = JSON.stringify(obj, (key, value) => {
      if (value instanceof Set) {
        return { __type: '__Set__', values: Array.from(value) };
      }
      return value;
    });
    const parsed = JSON.parse(json, (key, value) => {
      if (typeof value === 'object' && value !== null && '__type' in value) {
        if (value['__type'] === '__Set__' && Array.isArray(value['values'])) {
          return new Set(value['values']);
        }
      }
      return value;
    });
    expect(parsed.tags).toBeInstanceOf(Set);
    expect(parsed.tags.has('a')).toBe(true);
    expect(parsed.tags.size).toBe(3);
  });
});
