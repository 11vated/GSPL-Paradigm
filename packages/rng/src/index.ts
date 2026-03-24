/**
 * @paradigm/rng — Deterministic randomness, hashing, and simulation time.
 *
 * Zero external dependencies. All operations are seeded for reproducible
 * evolution, world simulation, and snapshot fidelity.
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────
// DeterministicRNG — xoshiro256** algorithm
// ─────────────────────────────────────────────

/**
 * Deterministic RNG using xoshiro256** algorithm.
 * 256-bit state represented as 4 pairs of (hi, lo) uint32 values.
 * All operations are seeded for reproducible evolution.
 */
export class DeterministicRNG {
  private state: [number, number, number, number, number, number, number, number];
  private readonly seed: string | number;

  constructor(seed: string | number) {
    this.seed = seed;
    this.state = this.initializeState(seed);
  }

  /**
   * Initialize 256-bit state from seed using FNV-1a hash.
   * Produces 4 x 64-bit values (as pairs of uint32).
   */
  private initializeState(
    seed: string | number,
  ): [number, number, number, number, number, number, number, number] {
    const seedStr = typeof seed === 'string' ? seed : seed.toString();
    const fnvHash = this.fnv1a(seedStr);

    const pair0 = this.mixHash(fnvHash ^ 0x9e3779b9);
    const pair1 = this.mixHash(pair0[0] ^ pair0[1]);
    const pair2 = this.mixHash(pair1[0] ^ pair1[1]);
    const pair3 = this.mixHash(pair2[0] ^ pair2[1]);

    return [pair0[0], pair0[1], pair1[0], pair1[1], pair2[0], pair2[1], pair3[0], pair3[1]];
  }

  /** FNV-1a hash: deterministic string-to-number mapping. Returns 32-bit unsigned integer. */
  private fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    return hash;
  }

  /** Mix function: expand hash value to (hi, lo) pair for state initialization. */
  private mixHash(h: number): [number, number] {
    h ^= h >>> 33;
    h = (Math.imul(h, 0xff51afd7) >>> 0) ^ h;
    h ^= h >>> 33;
    return [h >>> 0, ((h >>> 32) | 0) >>> 0];
  }

  /** Rotate left (bitwise rotation). */
  private rotl(x: number, k: number): number {
    return (((x << k) | (x >>> (32 - k))) >>> 0) & 0xffffffff;
  }

  /** Next random number in [0, 1) using xoshiro256**. Advances internal state. */
  next(): number {
    const t = this.rotl((this.state[0] ^ this.state[4]) >>> 0, 23) ^ this.state[0];
    const u = this.state[3] >>> 0;

    this.state[3] = this.state[2];
    this.state[2] = this.state[1];
    this.state[1] = this.state[0];
    this.state[0] = t;
    this.state[4] = (u ^ (u << 18)) >>> 0;

    const result = ((this.rotl((this.state[1] * 5) >>> 0, 7) * 9) >>> 0) / 0x100000000;
    return Math.abs(result) % 1;
  }

  /** Random integer in [min, max) range. */
  nextInt(min: number, max: number): number {
    const range = max - min;
    return Math.floor(min + this.next() * range);
  }

  /** Random integer in [min, max] inclusive. */
  nextIntInclusive(min: number, max: number): number {
    return this.nextInt(min, max + 1);
  }

  /** Gaussian (normal) distribution using Box-Muller transform. Mean 0, stddev 1. */
  gaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Gaussian with custom mean and standard deviation. */
  gaussianWithParams(mean: number, stdDev: number): number {
    return mean + stdDev * this.gaussian();
  }

  /** Exponential distribution with rate parameter lambda. */
  exponential(lambda: number): number {
    return -Math.log(this.next()) / lambda;
  }

  /** Poisson distribution using Knuth algorithm. Efficient for small lambda (<30). */
  poisson(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  /** Gamma distribution using Marsaglia and Tsang algorithm. */
  gamma(shape: number, scale: number): number {
    if (shape < 1) {
      return this.gamma(shape + 1, scale) * Math.pow(this.next(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    let z: number;
    let v: number;
    do {
      z = this.gaussian();
      v = 1 + c * z;
    } while (v <= 0);
    const u = this.next();
    if (u < 1 - 0.0331 * (z * z * z * z)) {
      return d * v * v * v * scale;
    }
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) {
      return d * v * v * v * scale;
    }
    return this.gamma(shape, scale);
  }

  /** Beta distribution using gamma variates. */
  beta(alpha: number, betaParam: number): number {
    const g1 = this.gamma(alpha, 1);
    const g2 = this.gamma(betaParam, 1);
    return g1 / (g1 + g2);
  }

  /** Uniformly random element from array. Supports optional weights. */
  choice<T>(array: readonly T[], weights?: readonly number[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    if (weights !== undefined) {
      return this.weightedChoice(array, weights);
    }
    const idx = this.nextInt(0, array.length);
    const item = array[idx];
    if (item === undefined) {
      throw new Error('Array element is undefined');
    }
    return item;
  }

  /** Weighted random selection from array using roulette wheel. */
  weightedChoice<T>(array: readonly T[], weights: readonly number[]): T {
    if (array.length === 0) {
      throw new Error('Cannot select from empty array');
    }
    if (array.length !== weights.length) {
      throw new Error('Array and weights must have same length');
    }
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
      throw new Error('Weights must sum to positive value');
    }
    let r = this.next() * total;
    for (let i = 0; i < array.length; i++) {
      const weight = weights[i];
      if (weight === undefined) {
        throw new Error('Weight is undefined');
      }
      r -= weight;
      if (r <= 0) {
        const item = array[i];
        if (item === undefined) {
          throw new Error('Array item is undefined');
        }
        return item;
      }
    }
    const lastItem = array[array.length - 1];
    if (lastItem === undefined) {
      throw new Error('Last array item is undefined');
    }
    return lastItem;
  }

  /** Fisher-Yates shuffle: mutates array in-place and returns it. */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      const iItem = array[i];
      const jItem = array[j];
      if (iItem !== undefined && jItem !== undefined) {
        array[i] = jItem;
        array[j] = iItem;
      }
    }
    return array;
  }

  /** Sample n items from array without replacement. */
  sample<T>(array: readonly T[], n: number): T[] {
    if (n > array.length) {
      throw new Error(`Cannot sample ${n} items from array of length ${array.length}`);
    }
    const copy = [...array];
    this.shuffle(copy);
    return copy.slice(0, n);
  }

  /** Create deterministic child RNG with new seed based on label. */
  fork(label: string): DeterministicRNG {
    return new DeterministicRNG(`${this.seed}:${label}`);
  }

  /** Get current seed for reproducibility verification. */
  getSeed(): string | number {
    return this.seed;
  }
}

// ─────────────────────────────────────────────
// Xoshiro256 — Parallel-safe variant for Web Workers / GPU
// ─────────────────────────────────────────────

/**
 * Lightweight Xoshiro256 for parallel contexts (Web Workers, GPU compute).
 * State is a plain 4-element Uint32Array for easy transfer via SharedArrayBuffer.
 */
export class Xoshiro256 {
  private state: Uint32Array;

  constructor(seed: number) {
    this.state = new Uint32Array(4);
    this.state[0] = seed >>> 0;
    this.state[1] = (seed ^ 0x6c078965) >>> 0;
    this.state[2] = (seed ^ 0x9908b0df) >>> 0;
    this.state[3] = (seed ^ 0x5bd1e995) >>> 0;
  }

  /** Create from existing state (e.g., received from SharedArrayBuffer). */
  static fromState(state: Uint32Array): Xoshiro256 {
    const rng = new Xoshiro256(0);
    rng.state = state.slice(0, 4);
    return rng;
  }

  /** Get state as Uint32Array (for transfer to workers). */
  getState(): Uint32Array {
    return this.state.slice();
  }

  /** Next random float in [0, 1). */
  next(): number {
    const s0 = this.state[0] ?? 0;
    const s1 = this.state[1] ?? 0;
    const s2 = this.state[2] ?? 0;
    const s3 = this.state[3] ?? 0;

    const result = (((s0 + s3) >>> 0) * 2 + (s0 >>> 31)) >>> 0;
    const t = (s1 << 9) >>> 0;

    this.state[2] = (s2 ^ s0) >>> 0;
    this.state[3] = (s3 ^ s1) >>> 0;
    this.state[1] = (s1 ^ (this.state[2] ?? 0)) >>> 0;
    this.state[0] = (s0 ^ (this.state[3] ?? 0)) >>> 0;
    this.state[2] = ((this.state[2] ?? 0) ^ t) >>> 0;
    this.state[3] = (((this.state[3] ?? 0) << 11) | ((this.state[3] ?? 0) >>> 21)) >>> 0;

    return (result >>> 0) / 0x100000000;
  }
}

// ─────────────────────────────────────────────
// Canonical Hashing — Deterministic serialization + hashing
// ─────────────────────────────────────────────

/**
 * Canonicalize any value to a deterministic JSON-like string.
 * Handles nested objects, arrays, Maps, Sets, typed arrays.
 * Sorts all object keys at all depths for consistency.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';

  if (typeof obj === 'number') {
    if (!isFinite(obj)) return obj > 0 ? 'Infinity' : '-Infinity';
    return JSON.stringify(obj);
  }

  if (typeof obj === 'string') return JSON.stringify(obj);

  if (obj instanceof Float64Array) {
    return `["__Float64Array__",[${Array.from(obj).join(',')}]]`;
  }
  if (obj instanceof Float32Array) {
    return `["__Float32Array__",[${Array.from(obj).join(',')}]]`;
  }
  if (obj instanceof Uint8Array) {
    return `["__Uint8Array__",[${Array.from(obj).join(',')}]]`;
  }

  if (obj instanceof Map) {
    const entries = Array.from(obj.entries()).sort((a, b) => {
      return JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0]));
    });
    const serialized = entries
      .map(([k, v]) => `[${canonicalize(k)},${canonicalize(v)}]`)
      .join(',');
    return `["__Map__",[${serialized}]]`;
  }

  if (obj instanceof Set) {
    const values = Array.from(obj).sort((a, b) => {
      return canonicalize(a).localeCompare(canonicalize(b));
    });
    return `["__Set__",[${values.map((v) => canonicalize(v)).join(',')}]]`;
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `"${key}":${canonicalize(value)}`;
    });
    return `{${pairs.join(',')}}`;
  }

  return JSON.stringify(obj);
}

/**
 * Compute SHA-256 hash of arbitrary data (async, uses Web Crypto API).
 * Works in both Node.js and browsers.
 */
export async function computeHashAsync(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);

  // Use globalThis.crypto which is available in both Node 20+ and browsers
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute a deterministic hash of any object (async SHA-256).
 * Uses canonical serialization for consistency regardless of key order.
 */
export async function computeObjectHash(obj: unknown): Promise<string> {
  return computeHashAsync(canonicalize(obj));
}

/**
 * Compute a fast synchronous 32-bit hash using FNV-1a.
 * Not cryptographic — use for hash tables, bucketing, quick identity checks.
 */
export function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash;
}

/**
 * Fast sync hex hash for objects (FNV-1a based, not cryptographic).
 * 8-character hex string (32-bit). Use when async SHA-256 is overkill.
 */
export function computeQuickHash(obj: unknown): string {
  return fnv1aHash(canonicalize(obj)).toString(16).padStart(8, '0');
}

// ─────────────────────────────────────────────
// SimulationClock — Deterministic time source
// ─────────────────────────────────────────────

/**
 * Deterministic simulation clock for canonical state transitions.
 * All canonical operations (seed creation, mutation, breeding, world events)
 * must use this clock instead of Date.now().
 */
export interface SimulationClock {
  /** Current logical tick (monotonically increasing). */
  readonly tick: number;

  /** Returns the current logical timestamp (tick-derived, deterministic). */
  now(): number;

  /** Returns a new clock advanced by `step` ticks (default 1). */
  advance(step?: number): SimulationClock;
}

/**
 * Default tick-based simulation clock for deterministic execution.
 * Each tick increments by 1; `now()` returns the tick value directly.
 */
export class DefaultSimulationClock implements SimulationClock {
  readonly tick: number;

  constructor(tick: number = 0) {
    this.tick = tick;
  }

  now(): number {
    return this.tick;
  }

  advance(step: number = 1): SimulationClock {
    return new DefaultSimulationClock(this.tick + step);
  }
}

/**
 * Wall-clock adapter for non-canonical contexts (telemetry, logging, UI).
 * Must NOT be used in canonical state transitions.
 */
export class WallClockSimulationClock implements SimulationClock {
  readonly tick: number;

  constructor() {
    this.tick = Date.now();
  }

  now(): number {
    return Date.now();
  }

  advance(_step?: number): SimulationClock {
    return new WallClockSimulationClock();
  }
}

// ─────────────────────────────────────────────
// OKLab Color Science — Re-export
// ─────────────────────────────────────────────

export {
  srgbToOklab,
  oklabToSrgb,
  srgbToOklch,
  oklchToSrgb,
  oklabLerp,
  oklabDistance,
  generatePalette,
  generateHueShiftedRamp,
  srgbToHex,
  hexToSrgb,
} from './oklab.js';

export type {
  OkLabColor,
  SrgbColor,
  OkLchColor,
} from './oklab.js';
