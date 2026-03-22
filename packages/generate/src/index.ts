/**
 * @paradigm/generate — Procedural content generation toolkit.
 *
 * Layer 5 (Social + Behavior) module providing noise, WFC, L-systems,
 * cellular automata, Markov name generation, color palettes, and a
 * unified content pipeline. All randomness flows through DeterministicRNG
 * for full reproducibility.
 *
 * @packageDocumentation
 */

import type {
  UniversalSeed,
  Gene,
  GeneMap,
  ScalarGene,
  CategoricalGene,
  VectorGene,
} from '@paradigm/types';

import { DeterministicRNG } from '@paradigm/rng';
import { createSeed } from '@paradigm/seed';

// ─────────────────────────────────────────────
// HSL Color Type
// ─────────────────────────────────────────────

/** HSL color representation with hue [0,360), saturation [0,1], lightness [0,1]. */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

// ─────────────────────────────────────────────
// NoiseGenerator — Value Noise + fBm
// ─────────────────────────────────────────────

/** Permutation-table-based 2D value noise with fractal Brownian motion layering. */
export class NoiseGenerator {
  private readonly perm: number[];

  constructor(rng: DeterministicRNG) {
    // Build a 256-entry permutation table, then double it for overflow-safe indexing
    const base: number[] = [];
    for (let i = 0; i < 256; i++) {
      base.push(i);
    }
    rng.shuffle(base);
    this.perm = [...base, ...base];
  }

  /**
   * 2D value noise returning a value in approximately [-1, 1].
   * Uses bilinear interpolation of hashed gradient-like values.
   */
  noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[(this.perm[xi]! + yi) & 511]!;
    const ab = this.perm[(this.perm[xi]! + yi + 1) & 511]!;
    const ba = this.perm[(this.perm[(xi + 1) & 255]! + yi) & 511]!;
    const bb = this.perm[(this.perm[(xi + 1) & 255]! + yi + 1) & 511]!;

    const gradAA = this.grad(aa, xf, yf);
    const gradBA = this.grad(ba, xf - 1, yf);
    const gradAB = this.grad(ab, xf, yf - 1);
    const gradBB = this.grad(bb, xf - 1, yf - 1);

    const lerpX1 = this.lerp(gradAA, gradBA, u);
    const lerpX2 = this.lerp(gradAB, gradBB, u);
    return this.lerp(lerpX1, lerpX2, v);
  }

  /**
   * Fractal Brownian motion: layered noise with configurable octaves.
   * @param octaves - Number of noise layers (default 6)
   * @param lacunarity - Frequency multiplier per octave (default 2.0)
   * @param gain - Amplitude multiplier per octave (default 0.5)
   */
  fbm2D(
    x: number,
    y: number,
    octaves: number = 6,
    lacunarity: number = 2.0,
    gain: number = 0.5,
  ): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }

    return maxAmplitude > 0 ? total / maxAmplitude : 0;
  }

  /** Quintic fade curve for smoother interpolation: 6t^5 - 15t^4 + 10t^3. */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /** Linear interpolation. */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /** Pseudo-gradient from hash value and offset. */
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    switch (h) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  }
}

// ─────────────────────────────────────────────
// WaveFunctionCollapse — Tile-based constraint propagation
// ─────────────────────────────────────────────

/** Adjacency rule for a single tile type. */
export interface TileRule {
  tileId: string;
  up: string[];
  down: string[];
  left: string[];
  right: string[];
}

/** Internal cell state during WFC collapse. */
interface WFCCell {
  collapsed: boolean;
  options: Set<string>;
}

/** Tile-based Wave Function Collapse with stack-based constraint propagation. */
export class WaveFunctionCollapse {
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /**
   * Collapse a grid of the given dimensions using the provided tile rules.
   * Returns a 2D array of tileIds (row-major: result[y][x]).
   */
  collapse(width: number, height: number, rules: TileRule[]): string[][] {
    if (rules.length === 0) {
      throw new Error('WFC requires at least one tile rule');
    }
    if (width <= 0 || height <= 0) {
      throw new Error('WFC grid dimensions must be positive');
    }

    const ruleMap = new Map<string, TileRule>();
    const allTileIds: string[] = [];
    for (const rule of rules) {
      ruleMap.set(rule.tileId, rule);
      allTileIds.push(rule.tileId);
    }

    // Initialize grid: every cell can be any tile
    const grid: WFCCell[][] = [];
    for (let y = 0; y < height; y++) {
      const row: WFCCell[] = [];
      for (let x = 0; x < width; x++) {
        row.push({ collapsed: false, options: new Set(allTileIds) });
      }
      grid.push(row);
    }

    const totalCells = width * height;
    for (let iteration = 0; iteration < totalCells; iteration++) {
      // Find the uncollapsed cell with minimum entropy
      const target = this.findMinEntropy(grid, width, height);
      if (target === null) break;

      const [tx, ty] = target;
      const cell = grid[ty]![tx]!;

      // Collapse: pick a random tile from remaining options
      const optionsArray = Array.from(cell.options);
      if (optionsArray.length === 0) {
        // Contradiction: assign first tile as fallback
        cell.options = new Set([allTileIds[0]!]);
        cell.collapsed = true;
        continue;
      }

      const chosen = this.rng.choice(optionsArray);
      cell.options = new Set([chosen]);
      cell.collapsed = true;

      // Propagate constraints using stack
      this.propagate(grid, width, height, tx, ty, ruleMap);
    }

    // Build result grid
    const result: string[][] = [];
    for (let y = 0; y < height; y++) {
      const row: string[] = [];
      for (let x = 0; x < width; x++) {
        const cell = grid[y]![x]!;
        const opts = Array.from(cell.options);
        row.push(opts[0] ?? allTileIds[0]!);
      }
      result.push(row);
    }
    return result;
  }

  /** Find the uncollapsed cell with the fewest remaining options (lowest entropy). */
  private findMinEntropy(
    grid: WFCCell[][],
    width: number,
    height: number,
  ): [number, number] | null {
    let minEntropy = Infinity;
    const candidates: Array<[number, number]> = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y]![x]!;
        if (cell.collapsed) continue;

        const entropy = cell.options.size;
        if (entropy < minEntropy) {
          minEntropy = entropy;
          candidates.length = 0;
          candidates.push([x, y]);
        } else if (entropy === minEntropy) {
          candidates.push([x, y]);
        }
      }
    }

    if (candidates.length === 0) return null;
    return this.rng.choice(candidates);
  }

  /** Stack-based constraint propagation from a collapsed cell. */
  private propagate(
    grid: WFCCell[][],
    width: number,
    height: number,
    startX: number,
    startY: number,
    ruleMap: Map<string, TileRule>,
  ): void {
    const stack: Array<[number, number]> = [[startX, startY]];
    const directions: Array<[number, number, 'up' | 'down' | 'left' | 'right', 'down' | 'up' | 'right' | 'left']> = [
      [0, -1, 'up', 'down'],     // neighbor is above -> we constrain via our 'up', neighbor's 'down'
      [0, 1, 'down', 'up'],      // neighbor is below
      [-1, 0, 'left', 'right'],  // neighbor is left
      [1, 0, 'right', 'left'],   // neighbor is right
    ];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const [cx, cy] = current;
      const currentCell = grid[cy]![cx]!;

      for (const [dx, dy, dir, oppositeDir] of directions) {
        const nx = cx + dx;
        const ny = cy + dy;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const neighbor = grid[ny]![nx]!;
        if (neighbor.collapsed) continue;

        // Compute allowed tiles for neighbor based on current cell's options
        const allowed = new Set<string>();
        for (const tileId of currentCell.options) {
          const rule = ruleMap.get(tileId);
          if (!rule) continue;
          const compatibleTiles = rule[dir];
          for (const compatible of compatibleTiles) {
            // Also verify the neighbor's rule allows this connection back
            const neighborRule = ruleMap.get(compatible);
            if (neighborRule && neighborRule[oppositeDir].includes(tileId)) {
              allowed.add(compatible);
            }
          }
        }

        // Intersect neighbor's options with allowed set
        const before = neighbor.options.size;
        const intersection = new Set<string>();
        for (const opt of neighbor.options) {
          if (allowed.has(opt)) {
            intersection.add(opt);
          }
        }
        neighbor.options = intersection;

        // If options were reduced, propagate further
        if (neighbor.options.size < before) {
          stack.push([nx, ny]);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────
// LSystemGenerator — Lindenmayer Systems
// ─────────────────────────────────────────────

/** Production rule for an L-system. Probability enables stochastic L-systems. */
export interface LSystemRule {
  symbol: string;
  replacement: string;
  probability?: number;
}

/** Configuration for turtle-graphics interpretation of L-system output. */
export interface TurtleConfig {
  angle: number;
  stepLength: number;
  startX?: number;
  startY?: number;
  startAngle?: number;
}

/** A single point in the turtle-graphics trace. */
export interface TurtlePoint {
  x: number;
  y: number;
  angle: number;
}

/** Lindenmayer system generator with stochastic rule support. */
export class LSystemGenerator {
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /**
   * Expand an axiom string through the given rules for a number of iterations.
   * Supports stochastic L-systems: when multiple rules share a symbol,
   * one is chosen probabilistically.
   */
  generate(axiom: string, rules: LSystemRule[], iterations: number): string {
    // Group rules by symbol for efficient lookup
    const ruleGroups = new Map<string, LSystemRule[]>();
    for (const rule of rules) {
      const existing = ruleGroups.get(rule.symbol);
      if (existing) {
        existing.push(rule);
      } else {
        ruleGroups.set(rule.symbol, [rule]);
      }
    }

    let current = axiom;

    for (let iter = 0; iter < iterations; iter++) {
      let next = '';
      for (let i = 0; i < current.length; i++) {
        const ch = current[i]!;
        const group = ruleGroups.get(ch);

        if (!group || group.length === 0) {
          next += ch;
          continue;
        }

        if (group.length === 1) {
          const rule = group[0]!;
          const prob = rule.probability ?? 1.0;
          if (this.rng.next() < prob) {
            next += rule.replacement;
          } else {
            next += ch;
          }
        } else {
          // Multiple rules: weighted probabilistic selection
          const weights = group.map((r) => r.probability ?? 1.0);
          const totalWeight = weights.reduce((sum, w) => sum + w, 0);

          if (totalWeight <= 0) {
            next += ch;
            continue;
          }

          let roll = this.rng.next() * totalWeight;
          let selected: LSystemRule | undefined;
          for (let j = 0; j < group.length; j++) {
            roll -= weights[j]!;
            if (roll <= 0) {
              selected = group[j];
              break;
            }
          }
          next += selected ? selected.replacement : ch;
        }
      }
      current = next;
    }

    return current;
  }

  /**
   * Interpret an L-system string as turtle graphics commands.
   * Symbols: F = forward, + = turn right, - = turn left, [ = push, ] = pop.
   * Returns an array of points traced by the turtle.
   */
  interpret(result: string, config: TurtleConfig): TurtlePoint[] {
    const points: TurtlePoint[] = [];
    let x = config.startX ?? 0;
    let y = config.startY ?? 0;
    let angle = config.startAngle ?? 0;
    const stack: Array<{ x: number; y: number; angle: number }> = [];

    points.push({ x, y, angle });

    for (let i = 0; i < result.length; i++) {
      const ch = result[i];

      switch (ch) {
        case 'F':
        case 'G': {
          const rad = (angle * Math.PI) / 180;
          x += Math.cos(rad) * config.stepLength;
          y += Math.sin(rad) * config.stepLength;
          points.push({ x, y, angle });
          break;
        }
        case '+':
          angle += config.angle;
          break;
        case '-':
          angle -= config.angle;
          break;
        case '[':
          stack.push({ x, y, angle });
          break;
        case ']': {
          const state = stack.pop();
          if (state) {
            x = state.x;
            y = state.y;
            angle = state.angle;
            points.push({ x, y, angle });
          }
          break;
        }
        default:
          // Unknown symbols are ignored (common in L-systems for variables)
          break;
      }
    }

    return points;
  }
}

// ─────────────────────────────────────────────
// CellularAutomata — Grid-based simulation
// ─────────────────────────────────────────────

/** Grid-based cellular automata for cave generation, mazes, and custom rulesets. */
export class CellularAutomata {
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /**
   * Advance the grid by one generation using birth/survival rules.
   * @param grid - Current boolean grid (true = alive)
   * @param birthRule - Neighbor counts that cause a dead cell to become alive
   * @param survivalRule - Neighbor counts that keep a living cell alive
   */
  step(grid: boolean[][], birthRule: number[], survivalRule: number[]): boolean[][] {
    const height = grid.length;
    if (height === 0) return [];
    const width = grid[0]!.length;
    if (width === 0) return [];

    const birthSet = new Set(birthRule);
    const survivalSet = new Set(survivalRule);

    const result: boolean[][] = [];

    for (let y = 0; y < height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x++) {
        const neighbors = this.countNeighbors(grid, x, y, width, height);
        const alive = grid[y]![x] ?? false;
        if (alive) {
          row.push(survivalSet.has(neighbors));
        } else {
          row.push(birthSet.has(neighbors));
        }
      }
      result.push(row);
    }
    return result;
  }

  /**
   * Generate a cave-like map using cellular automata.
   * @param fillChance - Probability [0,1] that a cell starts as wall (true)
   * @param steps - Number of automata iterations (typically 4-6)
   */
  generateCave(
    width: number,
    height: number,
    fillChance: number,
    steps: number,
  ): boolean[][] {
    // Initialize random grid
    let grid: boolean[][] = [];
    for (let y = 0; y < height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x++) {
        // Borders are always walls
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          row.push(true);
        } else {
          row.push(this.rng.next() < fillChance);
        }
      }
      grid.push(row);
    }

    // Apply B5678/S45678 cave rules
    const birthRule = [5, 6, 7, 8];
    const survivalRule = [4, 5, 6, 7, 8];

    for (let i = 0; i < steps; i++) {
      grid = this.step(grid, birthRule, survivalRule);
    }

    return grid;
  }

  /**
   * Generate a maze using recursive backtracker algorithm.
   * Returns a boolean grid where true = wall, false = passage.
   */
  generateMaze(width: number, height: number): boolean[][] {
    // Ensure odd dimensions for proper maze structure
    const w = width % 2 === 0 ? width + 1 : width;
    const h = height % 2 === 0 ? height + 1 : height;

    // Start with all walls
    const grid: boolean[][] = [];
    for (let y = 0; y < h; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < w; x++) {
        row.push(true);
      }
      grid.push(row);
    }

    // Recursive backtracker using explicit stack
    const startX = 1;
    const startY = 1;
    grid[startY]![startX] = false;

    const stack: Array<[number, number]> = [[startX, startY]];
    const visited = new Set<string>();
    visited.add(`${startX},${startY}`);

    const directions: Array<[number, number]> = [
      [0, -2], // up
      [0, 2],  // down
      [-2, 0], // left
      [2, 0],  // right
    ];

    while (stack.length > 0) {
      const current = stack[stack.length - 1]!;
      const [cx, cy] = current;

      // Find unvisited neighbors
      const unvisited: Array<[number, number, number, number]> = [];
      for (const [dx, dy] of directions) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && !visited.has(`${nx},${ny}`)) {
          unvisited.push([nx, ny, cx + dx / 2, cy + dy / 2]);
        }
      }

      if (unvisited.length === 0) {
        stack.pop();
        continue;
      }

      // Pick a random unvisited neighbor
      const [nx, ny, wallX, wallY] = this.rng.choice(unvisited);
      grid[ny]![nx] = false;      // carve the cell
      grid[wallY]![wallX] = false; // carve the wall between
      visited.add(`${nx},${ny}`);
      stack.push([nx, ny]);
    }

    return grid;
  }

  /** Count the 8-connected (Moore) neighbors that are alive. */
  private countNeighbors(
    grid: boolean[][],
    x: number,
    y: number,
    width: number,
    height: number,
  ): number {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          // Treat out-of-bounds as alive (wall)
          count++;
        } else if (grid[ny]![nx]) {
          count++;
        }
      }
    }
    return count;
  }
}

// ─────────────────────────────────────────────
// MarkovNameGenerator — Character Markov Chains
// ─────────────────────────────────────────────

/** Training data for domain-specific name generation. */
const TRAINING_DATA: Record<string, string[]> = {
  fantasy: ['Aldric', 'Branwen', 'Cedric', 'Elowen', 'Thorin', 'Isolde', 'Gareth', 'Rowena'],
  'sci-fi': ['Zephyr', 'Nexus', 'Quantum', 'Nova', 'Cypher', 'Stellara', 'Voltex', 'Aethon'],
  nature: ['Oakwood', 'Rivermist', 'Thorndale', 'Willowbrook', 'Frostpeak', 'Sunhaven', 'Stormridge', 'Duskmeadow'],
};

/** Order-N character Markov chain for procedural name generation. */
export class MarkovNameGenerator {
  private readonly rng: DeterministicRNG;
  private readonly transitions: Map<string, Map<string, number>>;
  private readonly starters: string[];
  private order: number;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
    this.transitions = new Map();
    this.starters = [];
    this.order = 2;
  }

  /**
   * Train the Markov chain on an array of example names.
   * @param names - Training corpus
   * @param order - Context window size (default 2)
   */
  train(names: string[], order: number = 2): void {
    this.order = order;
    this.transitions.clear();
    this.starters.length = 0;

    for (const name of names) {
      const lower = name.toLowerCase();
      if (lower.length < order) continue;

      // Record starter
      this.starters.push(lower.substring(0, order));

      // Build transition table
      for (let i = 0; i <= lower.length - order; i++) {
        const key = lower.substring(i, i + order);
        const nextChar = i + order < lower.length ? lower[i + order]! : '\0'; // '\0' = end sentinel

        let charMap = this.transitions.get(key);
        if (!charMap) {
          charMap = new Map();
          this.transitions.set(key, charMap);
        }

        const current = charMap.get(nextChar) ?? 0;
        charMap.set(nextChar, current + 1);
      }
    }
  }

  /**
   * Generate a name from the trained model.
   * @param minLength - Minimum output length (default 3)
   * @param maxLength - Maximum output length (default 12)
   */
  generate(minLength: number = 3, maxLength: number = 12): string {
    if (this.starters.length === 0) {
      throw new Error('MarkovNameGenerator has not been trained. Call train() first.');
    }

    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const starter = this.rng.choice(this.starters);
      let result = starter;

      for (let i = 0; i < maxLength - this.order; i++) {
        const key = result.substring(result.length - this.order);
        const charMap = this.transitions.get(key);

        if (!charMap || charMap.size === 0) break;

        // Build arrays for weighted selection
        const chars: string[] = [];
        const weights: number[] = [];
        for (const [ch, count] of charMap) {
          chars.push(ch);
          weights.push(count);
        }

        const nextChar = this.rng.weightedChoice(chars, weights);

        if (nextChar === '\0') {
          // End sentinel: accept if long enough
          if (result.length >= minLength) break;
          // Otherwise keep going by picking a non-end character
          const nonEnd = chars.filter((c) => c !== '\0');
          if (nonEnd.length === 0) break;
          const nonEndWeights = nonEnd.map((c) => {
            const w = charMap.get(c);
            return w ?? 1;
          });
          result += this.rng.weightedChoice(nonEnd, nonEndWeights);
          continue;
        }

        result += nextChar;
      }

      if (result.length >= minLength && result.length <= maxLength) {
        // Capitalize first letter
        return result[0]!.toUpperCase() + result.substring(1);
      }
    }

    // Fallback: return a starter, capitalized
    const fallback = this.starters[0] ?? 'Name';
    return fallback[0]!.toUpperCase() + fallback.substring(1);
  }
}

// ─────────────────────────────────────────────
// ColorPaletteGenerator — HSL-based color palettes
// ─────────────────────────────────────────────

/** HSL-based procedural color palette generator. */
export class ColorPaletteGenerator {
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /** Generate a complementary pair (180 degrees apart). */
  complementary(hue: number): [HSL, HSL] {
    return [
      { h: this.normalizeHue(hue), s: 0.7, l: 0.5 },
      { h: this.normalizeHue(hue + 180), s: 0.7, l: 0.5 },
    ];
  }

  /** Generate analogous colors (clustered around base hue). */
  analogous(hue: number, spread: number = 30): HSL[] {
    const base = this.normalizeHue(hue);
    return [
      { h: this.normalizeHue(base - spread * 2), s: 0.6, l: 0.55 },
      { h: this.normalizeHue(base - spread), s: 0.65, l: 0.5 },
      { h: base, s: 0.7, l: 0.5 },
      { h: this.normalizeHue(base + spread), s: 0.65, l: 0.5 },
      { h: this.normalizeHue(base + spread * 2), s: 0.6, l: 0.55 },
    ];
  }

  /** Generate a triadic palette (three hues 120 degrees apart). */
  triadic(hue: number): [HSL, HSL, HSL] {
    return [
      { h: this.normalizeHue(hue), s: 0.7, l: 0.5 },
      { h: this.normalizeHue(hue + 120), s: 0.7, l: 0.5 },
      { h: this.normalizeHue(hue + 240), s: 0.7, l: 0.5 },
    ];
  }

  /**
   * Derive a color palette from a UniversalSeed.
   * Extracts hue from a VectorGene named 'color' if present,
   * otherwise hashes the seed name to derive a base hue.
   */
  fromSeed(seed: UniversalSeed): HSL[] {
    let baseHue: number;

    // Try to extract color from a VectorGene named 'color'
    const colorGene = seed.genes['color'];
    if (colorGene && colorGene.type === 'vector' && colorGene.value.length >= 1) {
      // Interpret first component as hue [0,360)
      baseHue = this.normalizeHue((colorGene.value[0] ?? 0) * 360);
    } else {
      // Hash the seed name to derive a hue
      baseHue = this.hashToHue(seed.$name);
    }

    // Generate a rich palette with variation from RNG
    const satBase = 0.5 + this.rng.next() * 0.3;
    const lightBase = 0.4 + this.rng.next() * 0.2;

    return [
      { h: this.normalizeHue(baseHue), s: satBase + 0.15, l: lightBase },
      { h: this.normalizeHue(baseHue + 30), s: satBase, l: lightBase + 0.1 },
      { h: this.normalizeHue(baseHue + 180), s: satBase + 0.1, l: lightBase + 0.05 },
      { h: this.normalizeHue(baseHue + 210), s: satBase - 0.1, l: lightBase + 0.2 },
      { h: this.normalizeHue(baseHue + 60), s: satBase + 0.05, l: lightBase + 0.15 },
    ];
  }

  /** Normalize hue to [0, 360). */
  private normalizeHue(hue: number): number {
    return ((hue % 360) + 360) % 360;
  }

  /** Simple hash of a string to a hue value in [0, 360). */
  private hashToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
  }
}

// ─────────────────────────────────────────────
// ContentPipeline — Unified generation coordinator
// ─────────────────────────────────────────────

/** Generated character data. */
export interface GeneratedCharacter {
  name: string;
  traits: string[];
  appearance: string[];
  abilities: string[];
}

/** Generated item data. */
export interface GeneratedItem {
  name: string;
  type: string;
  rarity: string;
  stats: Record<string, number>;
  description: string;
}

/** Generated world data. */
export interface GeneratedWorld {
  name: string;
  biome: string;
  features: string[];
  inhabitants: string[];
}

/** Trait pools for character generation. */
const CHARACTER_TRAITS = [
  'brave', 'cunning', 'wise', 'compassionate', 'fierce',
  'stoic', 'charismatic', 'mysterious', 'loyal', 'ambitious',
  'gentle', 'ruthless', 'patient', 'impulsive', 'clever',
];

const APPEARANCE_TRAITS = [
  'tall', 'scarred', 'tattooed', 'cloaked', 'armored',
  'slender', 'muscular', 'weathered', 'youthful', 'imposing',
  'elegant', 'ragged', 'pale', 'dark-skinned', 'red-haired',
];

const ABILITY_POOL = [
  'swordsmanship', 'archery', 'fire magic', 'healing', 'stealth',
  'necromancy', 'alchemy', 'telekinesis', 'shapeshifting', 'divination',
  'leadership', 'tracking', 'enchanting', 'summoning', 'illusion',
];

const ITEM_TYPES = ['weapon', 'armor', 'potion', 'scroll', 'ring', 'amulet', 'staff', 'shield'];

const RARITY_LEVELS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_WEIGHTS = [40, 30, 18, 9, 3];

const BIOMES = [
  'forest', 'desert', 'tundra', 'swamp', 'mountain',
  'plains', 'volcanic', 'oceanic', 'cavern', 'sky-realm',
];

const WORLD_FEATURES = [
  'ancient ruins', 'crystal caves', 'floating islands', 'deep chasms',
  'enchanted springs', 'petrified forest', 'obsidian spires', 'coral reefs',
  'sand dunes', 'glacier valleys', 'lava rivers', 'mushroom groves',
];

const INHABITANT_TYPES = [
  'elves', 'dwarves', 'goblins', 'dragons', 'sprites',
  'centaurs', 'merfolk', 'golems', 'phoenixes', 'treants',
  'nomads', 'monks', 'raiders', 'scholars', 'mystics',
];

/** Unified content generation pipeline reading from seed genes. */
export class ContentPipeline {
  private readonly rng: DeterministicRNG;
  private readonly markov: MarkovNameGenerator;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
    this.markov = new MarkovNameGenerator(rng.fork('markov'));
  }

  /**
   * Generate a character from a seed's genes.
   * Reads scalar genes for stat biases, categorical for archetypes.
   */
  generateCharacter(seed: UniversalSeed): GeneratedCharacter {
    const charRng = this.rng.fork(`character:${seed.$hash}`);

    // Generate name based on domain
    const name = this.generateName('fantasy');

    // Determine trait count from seed genes
    const traitCount = this.extractScalarInfluence(seed, 'complexity', 2, 5);
    const abilityCount = this.extractScalarInfluence(seed, 'power', 1, 4);
    const appearanceCount = this.extractScalarInfluence(seed, 'detail', 2, 5);

    const traits = charRng.sample(CHARACTER_TRAITS, Math.min(traitCount, CHARACTER_TRAITS.length));
    const appearance = charRng.sample(APPEARANCE_TRAITS, Math.min(appearanceCount, APPEARANCE_TRAITS.length));
    const abilities = charRng.sample(ABILITY_POOL, Math.min(abilityCount, ABILITY_POOL.length));

    return { name, traits, appearance, abilities };
  }

  /**
   * Generate an item from a seed's genes.
   * Reads scalar genes for quality/power, categorical for type preferences.
   */
  generateItem(seed: UniversalSeed): GeneratedItem {
    const itemRng = this.rng.fork(`item:${seed.$hash}`);

    const name = this.generateName('fantasy');
    const type = itemRng.choice(ITEM_TYPES);
    const rarity = itemRng.weightedChoice(RARITY_LEVELS, RARITY_WEIGHTS);

    // Scale stats by rarity
    const rarityIdx = RARITY_LEVELS.indexOf(rarity);
    const rarityMultiplier = 1 + (rarityIdx >= 0 ? rarityIdx : 0) * 0.5;
    const powerInfluence = this.extractScalarValue(seed, 'power', 0.5);

    const stats: Record<string, number> = {
      attack: Math.round((5 + itemRng.next() * 15) * rarityMultiplier * powerInfluence),
      defense: Math.round((3 + itemRng.next() * 10) * rarityMultiplier * powerInfluence),
      durability: Math.round((20 + itemRng.next() * 80) * rarityMultiplier),
      value: Math.round((10 + itemRng.next() * 90) * rarityMultiplier * rarityMultiplier),
    };

    const prefixes = ['Gleaming', 'Shadow', 'Ancient', 'Enchanted', 'Cursed', 'Divine', 'Runic', 'Void'];
    const prefix = itemRng.choice(prefixes);
    const description = `${prefix} ${type} of ${name}. Rarity: ${rarity}.`;

    return { name: `${prefix} ${name}`, type, rarity, stats, description };
  }

  /**
   * Generate a world from a seed's genes.
   * Reads genes for scale, diversity, and environmental parameters.
   */
  generateWorld(seed: UniversalSeed): GeneratedWorld {
    const worldRng = this.rng.fork(`world:${seed.$hash}`);

    const name = this.generateName('nature');
    const biome = worldRng.choice(BIOMES);

    const featureCount = this.extractScalarInfluence(seed, 'complexity', 2, 6);
    const inhabitantCount = this.extractScalarInfluence(seed, 'diversity', 1, 5);

    const features = worldRng.sample(WORLD_FEATURES, Math.min(featureCount, WORLD_FEATURES.length));
    const inhabitants = worldRng.sample(INHABITANT_TYPES, Math.min(inhabitantCount, INHABITANT_TYPES.length));

    return { name, biome, features, inhabitants };
  }

  /**
   * Generate a name for a specific domain using the Markov chain.
   * @param domain - One of 'fantasy', 'sci-fi', or 'nature'
   */
  generateName(domain: string): string {
    const data = TRAINING_DATA[domain] ?? TRAINING_DATA['fantasy']!;
    const nameRng = this.rng.fork(`name:${domain}:${this.rng.next()}`);
    const gen = new MarkovNameGenerator(nameRng);
    gen.train(data, 2);
    return gen.generate(3, 10);
  }

  /**
   * Extract a scalar gene's normalized value to influence generation parameters.
   * Returns an integer in [min, max] based on the gene's relative value.
   */
  private extractScalarInfluence(
    seed: UniversalSeed,
    geneName: string,
    min: number,
    max: number,
  ): number {
    const gene = seed.genes[geneName];
    if (gene && gene.type === 'scalar') {
      const range = gene.max - gene.min;
      const normalized = range > 0 ? (gene.value - gene.min) / range : 0.5;
      return Math.round(min + normalized * (max - min));
    }
    // Default: use RNG
    return this.rng.nextInt(min, max + 1);
  }

  /**
   * Extract a scalar gene's normalized value as a float.
   * Returns defaultVal if gene is not found or not scalar.
   */
  private extractScalarValue(
    seed: UniversalSeed,
    geneName: string,
    defaultVal: number,
  ): number {
    const gene = seed.genes[geneName];
    if (gene && gene.type === 'scalar') {
      const range = gene.max - gene.min;
      return range > 0 ? (gene.value - gene.min) / range + 0.5 : defaultVal;
    }
    return defaultVal;
  }
}

// ─────────────────────────────────────────────
// GenerateEngine — Top-level entry point
// ─────────────────────────────────────────────

/** Top-level procedural generation engine with factory methods for all generators. */
export class GenerateEngine {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('paradigm-generate');
  }

  /** Create a noise generator with a forked RNG stream. */
  createNoise(): NoiseGenerator {
    return new NoiseGenerator(this.rng.fork('noise'));
  }

  /** Create a Wave Function Collapse solver with a forked RNG stream. */
  createWFC(): WaveFunctionCollapse {
    return new WaveFunctionCollapse(this.rng.fork('wfc'));
  }

  /** Create an L-system generator with a forked RNG stream. */
  createLSystem(): LSystemGenerator {
    return new LSystemGenerator(this.rng.fork('lsystem'));
  }

  /** Create a cellular automata engine with a forked RNG stream. */
  createCA(): CellularAutomata {
    return new CellularAutomata(this.rng.fork('ca'));
  }

  /** Create a Markov name generator with a forked RNG stream. */
  createMarkov(): MarkovNameGenerator {
    return new MarkovNameGenerator(this.rng.fork('markov'));
  }

  /** Create a color palette generator with a forked RNG stream. */
  createPalette(): ColorPaletteGenerator {
    return new ColorPaletteGenerator(this.rng.fork('palette'));
  }

  /** Create a unified content pipeline with a forked RNG stream. */
  createPipeline(): ContentPipeline {
    return new ContentPipeline(this.rng.fork('pipeline'));
  }

  /**
   * Generate content appropriate to a seed's domain.
   * Dispatches to the content pipeline based on the seed's $domain field.
   */
  fromSeed(seed: UniversalSeed): GeneratedCharacter | GeneratedItem | GeneratedWorld {
    const pipeline = new ContentPipeline(this.rng.fork(`seed:${seed.$hash}`));
    const domain = seed.$domain;

    switch (domain) {
      case 'organism':
      case 'mammal':
      case 'bird':
      case 'fish':
      case 'insect':
      case 'robot':
      case 'narrative':
        return pipeline.generateCharacter(seed);

      case 'weapon':
      case 'material':
      case 'crystal':
      case 'product':
        return pipeline.generateItem(seed);

      case 'terrain':
      case 'building':
      case 'plant':
      case 'ecosystem':
      case 'city':
      case 'simulation':
      case 'game':
        return pipeline.generateWorld(seed);

      default:
        // Default to character generation for unknown domains
        return pipeline.generateCharacter(seed);
    }
  }
}
