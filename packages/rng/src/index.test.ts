import { describe, it, expect } from 'vitest';
import {
  DeterministicRNG,
  Xoshiro256,
  canonicalize,
  computeHashAsync,
  computeObjectHash,
  fnv1aHash,
  computeQuickHash,
  DefaultSimulationClock,
  WallClockSimulationClock,
} from './index.js';

// ─────────────────────────────────────────────
// DeterministicRNG
// ─────────────────────────────────────────────

describe('DeterministicRNG', () => {
  it('produces deterministic sequences from same seed', () => {
    const rng1 = new DeterministicRNG(42);
    const rng2 = new DeterministicRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('produces different sequences from different seeds', () => {
    const rng1 = new DeterministicRNG(42);
    const rng2 = new DeterministicRNG(99);
    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());
    expect(seq1).not.toEqual(seq2);
  });

  it('accepts string seeds', () => {
    const rng1 = new DeterministicRNG('hello');
    const rng2 = new DeterministicRNG('hello');
    expect(rng1.next()).toBe(rng2.next());
  });

  it('next() returns values in [0, 1)', () => {
    const rng = new DeterministicRNG(42);
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextInt returns values in [min, max)', () => {
    const rng = new DeterministicRNG(42);
    for (let i = 0; i < 200; i++) {
      const val = rng.nextInt(5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThan(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('nextIntInclusive returns values in [min, max]', () => {
    const rng = new DeterministicRNG(42);
    const values = new Set<number>();
    for (let i = 0; i < 500; i++) {
      values.add(rng.nextIntInclusive(1, 3));
    }
    expect(values).toContain(1);
    expect(values).toContain(2);
    expect(values).toContain(3);
  });

  it('gaussian produces roughly normal distribution', () => {
    const rng = new DeterministicRNG(42);
    const samples = Array.from({ length: 1000 }, () => rng.gaussian());
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeCloseTo(0, 0);
  });

  it('gaussianWithParams uses custom mean/stddev', () => {
    const rng = new DeterministicRNG(42);
    const samples = Array.from({ length: 1000 }, () => rng.gaussianWithParams(10, 2));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeCloseTo(10, 0);
  });

  it('exponential produces positive values', () => {
    const rng = new DeterministicRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng.exponential(1)).toBeGreaterThan(0);
    }
  });

  it('poisson produces non-negative integers', () => {
    const rng = new DeterministicRNG(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.poisson(3);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('gamma produces positive values', () => {
    const rng = new DeterministicRNG(42);
    for (let i = 0; i < 50; i++) {
      expect(rng.gamma(2, 1)).toBeGreaterThan(0);
    }
  });

  it('gamma handles shape < 1', () => {
    const rng = new DeterministicRNG(42);
    const val = rng.gamma(0.5, 1);
    expect(val).toBeGreaterThan(0);
  });

  it('beta produces values in [0, 1]', () => {
    const rng = new DeterministicRNG(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.beta(2, 5);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('choice selects from array', () => {
    const rng = new DeterministicRNG(42);
    const arr = ['a', 'b', 'c'];
    const val = rng.choice(arr);
    expect(arr).toContain(val);
  });

  it('choice with weights respects weighting', () => {
    const rng = new DeterministicRNG(42);
    const arr = ['rare', 'common'];
    const weights = [0.01, 0.99];
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 500; i++) {
      counts[rng.choice(arr, weights) as 'rare' | 'common']++;
    }
    expect(counts.common).toBeGreaterThan(counts.rare);
  });

  it('choice throws on empty array', () => {
    const rng = new DeterministicRNG(42);
    expect(() => rng.choice([])).toThrow('Cannot choose from empty array');
  });

  it('weightedChoice throws on mismatched lengths', () => {
    const rng = new DeterministicRNG(42);
    expect(() => rng.weightedChoice(['a'], [1, 2])).toThrow('same length');
  });

  it('weightedChoice throws on zero weights', () => {
    const rng = new DeterministicRNG(42);
    expect(() => rng.weightedChoice(['a'], [0])).toThrow('positive value');
  });

  it('shuffle produces deterministic permutation', () => {
    const rng1 = new DeterministicRNG(42);
    const rng2 = new DeterministicRNG(42);
    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];
    rng1.shuffle(arr1);
    rng2.shuffle(arr2);
    expect(arr1).toEqual(arr2);
  });

  it('shuffle is in-place', () => {
    const rng = new DeterministicRNG(42);
    const arr = [1, 2, 3, 4, 5];
    const ref = rng.shuffle(arr);
    expect(ref).toBe(arr);
  });

  it('sample returns n items without replacement', () => {
    const rng = new DeterministicRNG(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const sampled = rng.sample(arr, 3);
    expect(sampled.length).toBe(3);
    const unique = new Set(sampled);
    expect(unique.size).toBe(3);
  });

  it('sample throws if n > array length', () => {
    const rng = new DeterministicRNG(42);
    expect(() => rng.sample([1, 2], 5)).toThrow('Cannot sample');
  });

  it('fork creates child with different sequence', () => {
    const parent = new DeterministicRNG(42);
    const child = parent.fork('child');
    expect(parent.next()).not.toBe(child.next());
  });

  it('fork is deterministic', () => {
    const p1 = new DeterministicRNG(42);
    const p2 = new DeterministicRNG(42);
    const c1 = p1.fork('label');
    const c2 = p2.fork('label');
    expect(c1.next()).toBe(c2.next());
  });

  it('getSeed returns the original seed', () => {
    const rng = new DeterministicRNG('test-seed');
    expect(rng.getSeed()).toBe('test-seed');
  });
});

// ─────────────────────────────────────────────
// Xoshiro256
// ─────────────────────────────────────────────

describe('Xoshiro256', () => {
  it('produces values in [0, 1)', () => {
    const rng = new Xoshiro256(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('is deterministic from same seed', () => {
    const rng1 = new Xoshiro256(42);
    const rng2 = new Xoshiro256(42);
    for (let i = 0; i < 50; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('getState returns 4-element Uint32Array', () => {
    const rng = new Xoshiro256(42);
    const state = rng.getState();
    expect(state).toBeInstanceOf(Uint32Array);
    expect(state.length).toBe(4);
  });

  it('fromState restores state', () => {
    const rng = new Xoshiro256(42);
    rng.next();
    rng.next();
    const state = rng.getState();
    const restored = Xoshiro256.fromState(state);
    expect(rng.next()).toBe(restored.next());
  });
});

// ─────────────────────────────────────────────
// Canonicalize
// ─────────────────────────────────────────────

describe('canonicalize', () => {
  it('handles null', () => {
    expect(canonicalize(null)).toBe('null');
  });

  it('handles undefined', () => {
    expect(canonicalize(undefined)).toBe('undefined');
  });

  it('handles booleans', () => {
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
  });

  it('handles numbers', () => {
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(3.14)).toBe('3.14');
  });

  it('handles Infinity', () => {
    expect(canonicalize(Infinity)).toBe('Infinity');
    expect(canonicalize(-Infinity)).toBe('-Infinity');
  });

  it('handles strings', () => {
    expect(canonicalize('hello')).toBe('"hello"');
  });

  it('sorts object keys', () => {
    const a = canonicalize({ z: 1, a: 2, m: 3 });
    expect(a).toBe('{"a":2,"m":3,"z":1}');
  });

  it('handles nested objects deterministically', () => {
    const r1 = canonicalize({ b: { z: 1, a: 2 }, a: 3 });
    const r2 = canonicalize({ a: 3, b: { a: 2, z: 1 } });
    expect(r1).toBe(r2);
  });

  it('handles arrays', () => {
    expect(canonicalize([1, 'two', true])).toBe('[1,"two",true]');
  });

  it('handles Float64Array', () => {
    const arr = new Float64Array([1.5, 2.5]);
    expect(canonicalize(arr)).toBe('["__Float64Array__",[1.5,2.5]]');
  });

  it('handles Map', () => {
    const map = new Map([['b', 2], ['a', 1]]);
    const result = canonicalize(map);
    expect(result).toContain('__Map__');
    expect(result).toContain('"a"');
  });

  it('handles Set', () => {
    const set = new Set([3, 1, 2]);
    const result = canonicalize(set);
    expect(result).toContain('__Set__');
  });
});

// ─────────────────────────────────────────────
// Hashing
// ─────────────────────────────────────────────

describe('hashing', () => {
  it('computeHashAsync produces hex string', async () => {
    const hash = await computeHashAsync('test data');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computeHashAsync is deterministic', async () => {
    const h1 = await computeHashAsync('same input');
    const h2 = await computeHashAsync('same input');
    expect(h1).toBe(h2);
  });

  it('computeObjectHash sorts keys', async () => {
    const h1 = await computeObjectHash({ a: 1, b: 2 });
    const h2 = await computeObjectHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('fnv1aHash returns consistent uint32', () => {
    expect(fnv1aHash('test')).toBe(fnv1aHash('test'));
    expect(fnv1aHash('test')).not.toBe(fnv1aHash('other'));
  });

  it('computeQuickHash produces 8-char hex', () => {
    const hash = computeQuickHash({ x: 1 });
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('computeQuickHash is deterministic regardless of key order', () => {
    const h1 = computeQuickHash({ a: 1, b: 2 });
    const h2 = computeQuickHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });
});

// ─────────────────────────────────────────────
// SimulationClock
// ─────────────────────────────────────────────

describe('DefaultSimulationClock', () => {
  it('starts at tick 0 by default', () => {
    const clock = new DefaultSimulationClock();
    expect(clock.tick).toBe(0);
    expect(clock.now()).toBe(0);
  });

  it('starts at specified tick', () => {
    const clock = new DefaultSimulationClock(100);
    expect(clock.tick).toBe(100);
  });

  it('advance returns new clock', () => {
    const c0 = new DefaultSimulationClock(0);
    const c1 = c0.advance();
    expect(c1.tick).toBe(1);
    expect(c0.tick).toBe(0); // immutable
  });

  it('advance by custom step', () => {
    const c0 = new DefaultSimulationClock(5);
    const c1 = c0.advance(10);
    expect(c1.tick).toBe(15);
  });
});

describe('WallClockSimulationClock', () => {
  it('returns real timestamps', () => {
    const clock = new WallClockSimulationClock();
    const now = clock.now();
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('advance returns new instance', () => {
    const c0 = new WallClockSimulationClock();
    const c1 = c0.advance();
    expect(c1).not.toBe(c0);
  });
});
