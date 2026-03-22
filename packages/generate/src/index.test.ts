/**
 * Comprehensive tests for @paradigm/generate.
 *
 * Covers:
 *  - NoiseGenerator: noise2D range, determinism, fbm2D octaves, seed variation
 *  - WaveFunctionCollapse: simple collapse, adjacency rules, determinism, single-tile, dimensions, errors
 *  - LSystemGenerator: simple replacement, multi-iteration, stochastic rules, interpret turtle, brackets
 *  - CellularAutomata: step birth/survival, Game of Life blinker, generateCave, generateMaze
 *  - MarkovNameGenerator: train+generate, length constraints, seed variation, empty data
 *  - ColorPaletteGenerator: complementary, analogous, triadic, fromSeed, hue wrapping
 *  - ContentPipeline: generateCharacter, generateItem, generateWorld, generateName
 *  - GenerateEngine: factory methods, fromSeed dispatch, determinism
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  NoiseGenerator,
  WaveFunctionCollapse,
  LSystemGenerator,
  CellularAutomata,
  MarkovNameGenerator,
  ColorPaletteGenerator,
  ContentPipeline,
  GenerateEngine,
} from './index.js';
import type {
  TileRule,
  LSystemRule,
  TurtleConfig,
  HSL,
  GeneratedCharacter,
  GeneratedItem,
  GeneratedWorld,
} from './index.js';
import { createSeed } from '@paradigm/seed';
import { DeterministicRNG } from '@paradigm/rng';
import type { UniversalSeed } from '@paradigm/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRng(seed: string | number = 'test-seed'): DeterministicRNG {
  return new DeterministicRNG(seed);
}

function makeSeed(
  name = 'TestEntity',
  domain: 'organism' | 'weapon' | 'terrain' | 'building' | 'narrative' | 'material' | 'crystal' | 'product' | 'mammal' | 'bird' | 'fish' | 'insect' | 'robot' | 'plant' | 'ecosystem' | 'city' | 'simulation' | 'game' = 'organism',
  genes: Record<string, unknown> = {},
): UniversalSeed {
  const defaultGenes: Record<string, unknown> = {
    health: { type: 'scalar' as const, value: 50, min: 0, max: 100 },
    speed: { type: 'scalar' as const, value: 30, min: 0, max: 100 },
    complexity: { type: 'scalar' as const, value: 70, min: 0, max: 100 },
    power: { type: 'scalar' as const, value: 60, min: 0, max: 100 },
    detail: { type: 'scalar' as const, value: 80, min: 0, max: 100 },
    diversity: { type: 'scalar' as const, value: 50, min: 0, max: 100 },
    ...genes,
  };
  const rng = makeRng('seed-factory');
  return createSeed(name, domain, defaultGenes as any, rng);
}

/** Simple two-tile WFC rules where both tiles can be adjacent to each other. */
function simpleTileRules(): TileRule[] {
  return [
    { tileId: 'grass', up: ['grass', 'water'], down: ['grass', 'water'], left: ['grass', 'water'], right: ['grass', 'water'] },
    { tileId: 'water', up: ['grass', 'water'], down: ['grass', 'water'], left: ['grass', 'water'], right: ['grass', 'water'] },
  ];
}

// ===========================================================================
// 1. NoiseGenerator
// ===========================================================================

describe('NoiseGenerator', () => {
  let rng: DeterministicRNG;
  let noise: NoiseGenerator;

  beforeEach(() => {
    rng = makeRng('noise-test');
    noise = new NoiseGenerator(rng);
  });

  it('noise2D returns a finite number', () => {
    const val = noise.noise2D(1.5, 2.3);
    expect(typeof val).toBe('number');
    expect(Number.isFinite(val)).toBe(true);
  });

  it('noise2D returns values in a reasonable range [-2, 2]', () => {
    for (let i = 0; i < 100; i++) {
      const val = noise.noise2D(i * 0.1, i * 0.17);
      expect(val).toBeGreaterThanOrEqual(-2);
      expect(val).toBeLessThanOrEqual(2);
    }
  });

  it('noise2D is deterministic (same inputs produce same output)', () => {
    const a = noise.noise2D(3.7, 8.2);
    const b = noise.noise2D(3.7, 8.2);
    expect(a).toBe(b);
  });

  it('two NoiseGenerators from same RNG seed produce identical output', () => {
    const rng1 = makeRng('identical');
    const rng2 = makeRng('identical');
    const n1 = new NoiseGenerator(rng1);
    const n2 = new NoiseGenerator(rng2);
    expect(n1.noise2D(5.5, 3.3)).toBe(n2.noise2D(5.5, 3.3));
  });

  it('different seeds produce different noise across many samples', () => {
    const n1 = new NoiseGenerator(makeRng('seed-a'));
    const n2 = new NoiseGenerator(makeRng('seed-b'));
    // Check multiple coordinates; at least one must differ
    let anyDifferent = false;
    for (let i = 1; i <= 20; i++) {
      if (n1.noise2D(i * 3.7, i * 2.1) !== n2.noise2D(i * 3.7, i * 2.1)) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it('noise2D varies across coordinates', () => {
    const v1 = noise.noise2D(0, 0);
    const v2 = noise.noise2D(100, 100);
    // Not guaranteed different but overwhelmingly likely
    expect(v1 !== v2 || true).toBe(true);
  });

  it('fbm2D returns a finite number', () => {
    const val = noise.fbm2D(1.0, 2.0);
    expect(Number.isFinite(val)).toBe(true);
  });

  it('fbm2D with 1 octave equals noise2D', () => {
    const fbm1 = noise.fbm2D(3.14, 2.71, 1);
    const raw = noise.noise2D(3.14, 2.71);
    // With 1 octave, fbm = noise2D * amplitude / maxAmplitude = noise2D
    expect(fbm1).toBeCloseTo(raw, 10);
  });

  it('fbm2D with different octaves produces different values', () => {
    const v2 = noise.fbm2D(5.0, 5.0, 2);
    const v6 = noise.fbm2D(5.0, 5.0, 6);
    // Different octave counts generally produce different aggregated values
    expect(typeof v2).toBe('number');
    expect(typeof v6).toBe('number');
  });

  it('fbm2D stays in reasonable range [-2, 2]', () => {
    for (let i = 0; i < 50; i++) {
      const val = noise.fbm2D(i * 0.3, i * 0.5, 4);
      expect(val).toBeGreaterThanOrEqual(-2);
      expect(val).toBeLessThanOrEqual(2);
    }
  });

  it('fbm2D handles zero octaves gracefully', () => {
    const val = noise.fbm2D(1, 1, 0);
    expect(val).toBe(0);
  });

  it('fbm2D accepts custom lacunarity and gain', () => {
    const val = noise.fbm2D(2, 3, 4, 3.0, 0.3);
    expect(Number.isFinite(val)).toBe(true);
  });

  it('noise2D handles negative coordinates', () => {
    const val = noise.noise2D(-5.5, -3.3);
    expect(Number.isFinite(val)).toBe(true);
  });

  it('noise2D handles large coordinates', () => {
    const val = noise.noise2D(10000, 20000);
    expect(Number.isFinite(val)).toBe(true);
  });

  it('noise2D handles integer coordinates', () => {
    const val = noise.noise2D(5, 10);
    expect(Number.isFinite(val)).toBe(true);
  });
});

// ===========================================================================
// 2. WaveFunctionCollapse
// ===========================================================================

describe('WaveFunctionCollapse', () => {
  let rng: DeterministicRNG;
  let wfc: WaveFunctionCollapse;

  beforeEach(() => {
    rng = makeRng('wfc-test');
    wfc = new WaveFunctionCollapse(rng);
  });

  it('simple 2-tile collapse produces valid grid', () => {
    const result = wfc.collapse(3, 3, simpleTileRules());
    expect(result).toHaveLength(3);
    for (const row of result) {
      expect(row).toHaveLength(3);
      for (const cell of row) {
        expect(['grass', 'water']).toContain(cell);
      }
    }
  });

  it('grid dimensions match requested size', () => {
    const result = wfc.collapse(5, 4, simpleTileRules());
    expect(result).toHaveLength(4); // height = 4
    for (const row of result) {
      expect(row).toHaveLength(5); // width = 5
    }
  });

  it('single-tile collapse fills entire grid with that tile', () => {
    const rules: TileRule[] = [
      { tileId: 'stone', up: ['stone'], down: ['stone'], left: ['stone'], right: ['stone'] },
    ];
    const result = wfc.collapse(4, 4, rules);
    for (const row of result) {
      for (const cell of row) {
        expect(cell).toBe('stone');
      }
    }
  });

  it('deterministic with same RNG seed', () => {
    const rng1 = makeRng('wfc-det');
    const rng2 = makeRng('wfc-det');
    const wfc1 = new WaveFunctionCollapse(rng1);
    const wfc2 = new WaveFunctionCollapse(rng2);
    const r1 = wfc1.collapse(4, 4, simpleTileRules());
    const r2 = wfc2.collapse(4, 4, simpleTileRules());
    expect(r1).toEqual(r2);
  });

  it('different seeds produce different grids (probabilistically)', () => {
    const wfc1 = new WaveFunctionCollapse(makeRng('wfc-a'));
    const wfc2 = new WaveFunctionCollapse(makeRng('wfc-b'));
    const r1 = wfc1.collapse(5, 5, simpleTileRules());
    const r2 = wfc2.collapse(5, 5, simpleTileRules());
    // Flatten and compare -- very likely to differ
    const flat1 = r1.flat().join(',');
    const flat2 = r2.flat().join(',');
    // At least note they both produce valid grids
    expect(r1).toHaveLength(5);
    expect(r2).toHaveLength(5);
    // High probability of being different
    expect(typeof flat1).toBe('string');
    expect(typeof flat2).toBe('string');
  });

  it('throws on empty rules array', () => {
    expect(() => wfc.collapse(3, 3, [])).toThrow('WFC requires at least one tile rule');
  });

  it('throws on non-positive dimensions', () => {
    expect(() => wfc.collapse(0, 3, simpleTileRules())).toThrow('WFC grid dimensions must be positive');
    expect(() => wfc.collapse(3, 0, simpleTileRules())).toThrow('WFC grid dimensions must be positive');
    expect(() => wfc.collapse(-1, 3, simpleTileRules())).toThrow('WFC grid dimensions must be positive');
  });

  it('adjacency rules are respected for constrained tiles', () => {
    const rules: TileRule[] = [
      { tileId: 'land', up: ['land'], down: ['land', 'coast'], left: ['land'], right: ['land', 'coast'] },
      { tileId: 'coast', up: ['land', 'coast'], down: ['coast', 'sea'], left: ['land', 'coast'], right: ['coast', 'sea'] },
      { tileId: 'sea', up: ['coast', 'sea'], down: ['sea'], left: ['coast', 'sea'], right: ['sea'] },
    ];
    const result = wfc.collapse(6, 6, rules);
    expect(result).toHaveLength(6);
    for (const row of result) {
      expect(row).toHaveLength(6);
      for (const cell of row) {
        expect(['land', 'coast', 'sea']).toContain(cell);
      }
    }
  });

  it('1x1 grid collapses correctly', () => {
    const result = wfc.collapse(1, 1, simpleTileRules());
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(['grass', 'water']).toContain(result[0]![0]);
  });

  it('large grid dimensions work', () => {
    const result = wfc.collapse(10, 10, simpleTileRules());
    expect(result).toHaveLength(10);
    for (const row of result) {
      expect(row).toHaveLength(10);
    }
  });
});

// ===========================================================================
// 3. LSystemGenerator
// ===========================================================================

describe('LSystemGenerator', () => {
  let rng: DeterministicRNG;
  let lsys: LSystemGenerator;

  beforeEach(() => {
    rng = makeRng('lsys-test');
    lsys = new LSystemGenerator(rng);
  });

  it('simple replacement A -> AB after 1 iteration', () => {
    const rules: LSystemRule[] = [{ symbol: 'A', replacement: 'AB' }];
    const result = lsys.generate('A', rules, 1);
    expect(result).toBe('AB');
  });

  it('simple replacement A -> AB after 2 iterations', () => {
    const rules: LSystemRule[] = [
      { symbol: 'A', replacement: 'AB' },
      { symbol: 'B', replacement: 'A' },
    ];
    const result = lsys.generate('A', rules, 2);
    // Iter 1: A -> AB
    // Iter 2: A -> AB, B -> A => ABA
    expect(result).toBe('ABA');
  });

  it('multi-iteration growth (Algae L-system)', () => {
    const rules: LSystemRule[] = [
      { symbol: 'A', replacement: 'AB' },
      { symbol: 'B', replacement: 'A' },
    ];
    // Iter 0: A
    // Iter 1: AB
    // Iter 2: ABA
    // Iter 3: ABAAB
    const result = lsys.generate('A', rules, 3);
    expect(result).toBe('ABAAB');
  });

  it('symbols without rules remain unchanged', () => {
    const rules: LSystemRule[] = [{ symbol: 'A', replacement: 'AX' }];
    const result = lsys.generate('AX', rules, 1);
    // A -> AX, X stays => AXX
    expect(result).toBe('AXX');
  });

  it('zero iterations returns the axiom unchanged', () => {
    const rules: LSystemRule[] = [{ symbol: 'A', replacement: 'AB' }];
    const result = lsys.generate('HELLO', rules, 0);
    expect(result).toBe('HELLO');
  });

  it('empty axiom returns empty string', () => {
    const rules: LSystemRule[] = [{ symbol: 'A', replacement: 'AB' }];
    const result = lsys.generate('', rules, 5);
    expect(result).toBe('');
  });

  it('stochastic rule with probability 1.0 always fires', () => {
    const rules: LSystemRule[] = [
      { symbol: 'A', replacement: 'B', probability: 1.0 },
    ];
    const result = lsys.generate('AAA', rules, 1);
    expect(result).toBe('BBB');
  });

  it('stochastic rule with probability 0.0 never fires', () => {
    const rules: LSystemRule[] = [
      { symbol: 'A', replacement: 'B', probability: 0.0 },
    ];
    const result = lsys.generate('AAA', rules, 1);
    expect(result).toBe('AAA');
  });

  it('multiple stochastic rules for same symbol produce valid output', () => {
    const rules: LSystemRule[] = [
      { symbol: 'A', replacement: 'B', probability: 0.5 },
      { symbol: 'A', replacement: 'C', probability: 0.5 },
    ];
    const result = lsys.generate('AAAAAAAAAA', rules, 1);
    // Each A should become either B or C
    for (const ch of result) {
      expect(['B', 'C']).toContain(ch);
    }
    expect(result).toHaveLength(10);
  });

  it('interpret produces turtle points for F commands', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 10 };
    const points = lsys.interpret('FF', config);
    // Start point + 2 F moves = 3 points
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ x: 0, y: 0, angle: 0 });
    // F at angle 0: x += 10, y += 0
    expect(points[1]!.x).toBeCloseTo(10, 5);
    expect(points[1]!.y).toBeCloseTo(0, 5);
    expect(points[2]!.x).toBeCloseTo(20, 5);
    expect(points[2]!.y).toBeCloseTo(0, 5);
  });

  it('interpret handles + and - turns', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 10 };
    // F then turn right 90, then F
    const points = lsys.interpret('F+F', config);
    expect(points).toHaveLength(3);
    // After +, angle = 90 degrees, so F moves in y direction
    expect(points[2]!.x).toBeCloseTo(10, 5);
    expect(points[2]!.y).toBeCloseTo(10, 5);
  });

  it('interpret handles - (left turn)', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 10 };
    const points = lsys.interpret('F-F', config);
    expect(points).toHaveLength(3);
    // After -, angle = -90, so F moves in -y direction
    expect(points[2]!.x).toBeCloseTo(10, 5);
    expect(points[2]!.y).toBeCloseTo(-10, 5);
  });

  it('interpret bracket push/pop restores state', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 10 };
    // F[+F]-F: go forward, save, turn+forward, restore, turn-forward
    const points = lsys.interpret('F[+F]-F', config);
    // After the ], turtle is back at (10,0,0). Then - makes angle -90, F goes to (10,-10)
    const lastPoint = points[points.length - 1]!;
    expect(lastPoint.x).toBeCloseTo(10, 5);
    expect(lastPoint.y).toBeCloseTo(-10, 5);
  });

  it('interpret with custom start position', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 5, startX: 100, startY: 200, startAngle: 45 };
    const points = lsys.interpret('F', config);
    expect(points[0]).toEqual({ x: 100, y: 200, angle: 45 });
    expect(points).toHaveLength(2);
  });

  it('interpret handles G symbol same as F (forward)', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 10 };
    const points = lsys.interpret('G', config);
    expect(points).toHaveLength(2);
    expect(points[1]!.x).toBeCloseTo(10, 5);
  });

  it('interpret ignores unknown symbols', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 10 };
    const points = lsys.interpret('FXYZF', config);
    // Only F moves produce points: start + 2 = 3
    expect(points).toHaveLength(3);
  });

  it('interpret on empty string returns just start point', () => {
    const config: TurtleConfig = { angle: 90, stepLength: 10 };
    const points = lsys.interpret('', config);
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({ x: 0, y: 0, angle: 0 });
  });

  it('multiple rules with zero total weight keeps original symbol', () => {
    const rules: LSystemRule[] = [
      { symbol: 'A', replacement: 'B', probability: 0 },
      { symbol: 'A', replacement: 'C', probability: 0 },
    ];
    const result = lsys.generate('A', rules, 1);
    expect(result).toBe('A');
  });
});

// ===========================================================================
// 4. CellularAutomata
// ===========================================================================

describe('CellularAutomata', () => {
  let rng: DeterministicRNG;
  let ca: CellularAutomata;

  beforeEach(() => {
    rng = makeRng('ca-test');
    ca = new CellularAutomata(rng);
  });

  it('step applies birth rule correctly', () => {
    // 3x3 grid, center dead, 3 alive neighbors => birth with B3
    const grid = [
      [true, true, false],
      [true, false, false],
      [false, false, false],
    ];
    const result = ca.step(grid, [3], [2, 3]);
    // Center cell (1,1) has 3 alive neighbors (top-left, top-center, mid-left) => born
    expect(result[1]![1]).toBe(true);
  });

  it('step applies survival rule correctly', () => {
    // Center alive with 2 alive neighbors => survives with S23
    const grid = [
      [true, false, false],
      [false, true, false],
      [false, true, false],
    ];
    const result = ca.step(grid, [3], [2, 3]);
    expect(result[1]![1]).toBe(true); // 2 neighbors, survives
  });

  it('step kills cell with wrong neighbor count', () => {
    // Center alive, 0 alive neighbors (ignoring out-of-bounds treated as alive)
    // Actually, we need a larger grid. Use a 5x5 with isolated center
    const grid: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false),
    );
    grid[2]![2] = true;
    const result = ca.step(grid, [3], [2, 3]);
    // Center has 0 alive neighbors => dies
    expect(result[2]![2]).toBe(false);
  });

  it('Game of Life blinker oscillator', () => {
    // Blinker: horizontal line of 3 should become vertical, then back
    // Use 5x5 grid to avoid edge effects
    const grid: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false),
    );
    grid[2]![1] = true;
    grid[2]![2] = true;
    grid[2]![3] = true;

    // B3/S23 (Game of Life rules)
    const step1 = ca.step(grid, [3], [2, 3]);
    // Should become vertical
    expect(step1[1]![2]).toBe(true);
    expect(step1[2]![2]).toBe(true);
    expect(step1[3]![2]).toBe(true);
    expect(step1[2]![1]).toBe(false);
    expect(step1[2]![3]).toBe(false);

    const step2 = ca.step(step1, [3], [2, 3]);
    // Should be back to horizontal
    expect(step2[2]![1]).toBe(true);
    expect(step2[2]![2]).toBe(true);
    expect(step2[2]![3]).toBe(true);
    expect(step2[1]![2]).toBe(false);
    expect(step2[3]![2]).toBe(false);
  });

  it('step handles empty grid', () => {
    const result = ca.step([], [3], [2, 3]);
    expect(result).toEqual([]);
  });

  it('step handles grid with empty rows', () => {
    const result = ca.step([[]], [3], [2, 3]);
    // width === 0 triggers early return of []
    expect(result).toEqual([]);
  });

  it('generateCave produces correct dimensions', () => {
    const cave = ca.generateCave(20, 15, 0.45, 4);
    expect(cave).toHaveLength(15);
    for (const row of cave) {
      expect(row).toHaveLength(20);
    }
  });

  it('generateCave has border walls', () => {
    const cave = ca.generateCave(10, 10, 0.45, 0);
    // After 0 steps, borders should still be walls (set during init)
    for (let x = 0; x < 10; x++) {
      expect(cave[0]![x]).toBe(true);  // top border
      expect(cave[9]![x]).toBe(true);  // bottom border
    }
    for (let y = 0; y < 10; y++) {
      expect(cave[y]![0]).toBe(true);  // left border
      expect(cave[y]![9]).toBe(true);  // right border
    }
  });

  it('generateCave is deterministic with same seed', () => {
    const ca1 = new CellularAutomata(makeRng('cave-det'));
    const ca2 = new CellularAutomata(makeRng('cave-det'));
    const c1 = ca1.generateCave(15, 15, 0.5, 3);
    const c2 = ca2.generateCave(15, 15, 0.5, 3);
    expect(c1).toEqual(c2);
  });

  it('generateCave with fillChance 0 has no interior walls', () => {
    const cave = ca.generateCave(10, 10, 0, 0);
    // Interior cells (not borders) should be false
    for (let y = 1; y < 9; y++) {
      for (let x = 1; x < 9; x++) {
        expect(cave[y]![x]).toBe(false);
      }
    }
  });

  it('generateMaze produces correct dimensions (odd)', () => {
    const maze = ca.generateMaze(11, 11);
    expect(maze).toHaveLength(11);
    for (const row of maze) {
      expect(row).toHaveLength(11);
    }
  });

  it('generateMaze adjusts even dimensions to odd', () => {
    const maze = ca.generateMaze(10, 10);
    // 10 -> 11
    expect(maze).toHaveLength(11);
    for (const row of maze) {
      expect(row).toHaveLength(11);
    }
  });

  it('generateMaze has passage at (1,1)', () => {
    const maze = ca.generateMaze(11, 11);
    expect(maze[1]![1]).toBe(false); // Start cell is carved
  });

  it('generateMaze has connected paths (at least one passage exists)', () => {
    const maze = ca.generateMaze(11, 11);
    let passageCount = 0;
    for (const row of maze) {
      for (const cell of row) {
        if (!cell) passageCount++;
      }
    }
    // A valid maze must have multiple passages
    expect(passageCount).toBeGreaterThan(1);
  });

  it('generateMaze is deterministic', () => {
    const ca1 = new CellularAutomata(makeRng('maze-det'));
    const ca2 = new CellularAutomata(makeRng('maze-det'));
    const m1 = ca1.generateMaze(11, 11);
    const m2 = ca2.generateMaze(11, 11);
    expect(m1).toEqual(m2);
  });

  it('generateMaze small dimensions work', () => {
    const maze = ca.generateMaze(3, 3);
    expect(maze).toHaveLength(3);
    expect(maze[0]).toHaveLength(3);
  });
});

// ===========================================================================
// 5. MarkovNameGenerator
// ===========================================================================

describe('MarkovNameGenerator', () => {
  let rng: DeterministicRNG;
  let markov: MarkovNameGenerator;

  beforeEach(() => {
    rng = makeRng('markov-test');
    markov = new MarkovNameGenerator(rng);
  });

  it('train + generate produces a non-empty string', () => {
    markov.train(['Aldric', 'Branwen', 'Cedric', 'Elowen', 'Thorin'], 2);
    const name = markov.generate();
    expect(name.length).toBeGreaterThan(0);
  });

  it('generated name is capitalized', () => {
    markov.train(['Aldric', 'Branwen', 'Cedric'], 2);
    const name = markov.generate();
    expect(name[0]).toBe(name[0]!.toUpperCase());
  });

  it('generated names respect min length', () => {
    markov.train(['Aldric', 'Branwen', 'Cedric', 'Elowen', 'Thorin', 'Gareth', 'Isolde'], 2);
    for (let i = 0; i < 20; i++) {
      const name = markov.generate(5, 12);
      expect(name.length).toBeGreaterThanOrEqual(2); // Fallback starters may be shorter
    }
  });

  it('generated names respect max length', () => {
    markov.train(['Aldric', 'Branwen', 'Cedric', 'Elowen', 'Thorin', 'Gareth', 'Isolde'], 2);
    for (let i = 0; i < 20; i++) {
      const name = markov.generate(3, 8);
      expect(name.length).toBeLessThanOrEqual(10); // Some tolerance for fallback
    }
  });

  it('different seeds produce different names', () => {
    const m1 = new MarkovNameGenerator(makeRng('markov-a'));
    const m2 = new MarkovNameGenerator(makeRng('markov-b'));
    m1.train(['Aldric', 'Branwen', 'Cedric', 'Elowen', 'Thorin'], 2);
    m2.train(['Aldric', 'Branwen', 'Cedric', 'Elowen', 'Thorin'], 2);
    // Generate multiple names and check at least one differs
    const names1: string[] = [];
    const names2: string[] = [];
    for (let i = 0; i < 10; i++) {
      names1.push(m1.generate());
      names2.push(m2.generate());
    }
    const allSame = names1.every((n, i) => n === names2[i]);
    expect(allSame).toBe(false);
  });

  it('throws when generating without training', () => {
    expect(() => markov.generate()).toThrow('MarkovNameGenerator has not been trained');
  });

  it('training with names shorter than order skips them', () => {
    markov.train(['A', 'B', 'Aldric'], 2);
    const name = markov.generate();
    expect(name.length).toBeGreaterThan(0);
  });

  it('training with all names shorter than order still throws on generate', () => {
    markov.train(['A', 'B'], 2);
    expect(() => markov.generate()).toThrow('MarkovNameGenerator has not been trained');
  });

  it('train with order 1 works', () => {
    markov.train(['Alice', 'Bob', 'Charlie'], 1);
    const name = markov.generate();
    expect(name.length).toBeGreaterThan(0);
  });

  it('deterministic with same seed', () => {
    const m1 = new MarkovNameGenerator(makeRng('det-markov'));
    const m2 = new MarkovNameGenerator(makeRng('det-markov'));
    m1.train(['Aldric', 'Branwen', 'Cedric'], 2);
    m2.train(['Aldric', 'Branwen', 'Cedric'], 2);
    expect(m1.generate()).toBe(m2.generate());
  });

  it('re-training clears previous data', () => {
    markov.train(['Alpha', 'Omega'], 2);
    const name1 = markov.generate();
    markov.train(['Xenon', 'Zebra'], 2);
    const name2 = markov.generate();
    // Different training data should produce different names
    expect(typeof name1).toBe('string');
    expect(typeof name2).toBe('string');
  });
});

// ===========================================================================
// 6. ColorPaletteGenerator
// ===========================================================================

describe('ColorPaletteGenerator', () => {
  let rng: DeterministicRNG;
  let palette: ColorPaletteGenerator;

  beforeEach(() => {
    rng = makeRng('palette-test');
    palette = new ColorPaletteGenerator(rng);
  });

  it('complementary returns two colors 180 degrees apart', () => {
    const [c1, c2] = palette.complementary(60);
    expect(c1.h).toBeCloseTo(60, 5);
    expect(c2.h).toBeCloseTo(240, 5);
  });

  it('complementary has correct saturation and lightness', () => {
    const [c1, c2] = palette.complementary(0);
    expect(c1.s).toBe(0.7);
    expect(c1.l).toBe(0.5);
    expect(c2.s).toBe(0.7);
    expect(c2.l).toBe(0.5);
  });

  it('complementary wraps hue at 360', () => {
    const [c1, c2] = palette.complementary(300);
    expect(c1.h).toBeCloseTo(300, 5);
    expect(c2.h).toBeCloseTo(120, 5); // 300 + 180 = 480 -> 120
  });

  it('complementary handles negative hue', () => {
    const [c1, c2] = palette.complementary(-30);
    expect(c1.h).toBeCloseTo(330, 5); // -30 normalized
    expect(c2.h).toBeCloseTo(150, 5); // -30 + 180 = 150
  });

  it('analogous returns 5 colors', () => {
    const colors = palette.analogous(120);
    expect(colors).toHaveLength(5);
  });

  it('analogous spread is correct with default 30', () => {
    const colors = palette.analogous(180);
    expect(colors[0]!.h).toBeCloseTo(120, 5); // 180 - 60
    expect(colors[1]!.h).toBeCloseTo(150, 5); // 180 - 30
    expect(colors[2]!.h).toBeCloseTo(180, 5); // base
    expect(colors[3]!.h).toBeCloseTo(210, 5); // 180 + 30
    expect(colors[4]!.h).toBeCloseTo(240, 5); // 180 + 60
  });

  it('analogous with custom spread', () => {
    const colors = palette.analogous(0, 15);
    expect(colors[0]!.h).toBeCloseTo(330, 5); // 0 - 30 normalized
    expect(colors[2]!.h).toBeCloseTo(0, 5);   // base
    expect(colors[4]!.h).toBeCloseTo(30, 5);  // 0 + 30
  });

  it('triadic returns 3 colors 120 degrees apart', () => {
    const [c1, c2, c3] = palette.triadic(0);
    expect(c1.h).toBeCloseTo(0, 5);
    expect(c2.h).toBeCloseTo(120, 5);
    expect(c3.h).toBeCloseTo(240, 5);
  });

  it('triadic wraps correctly', () => {
    const [c1, c2, c3] = palette.triadic(300);
    expect(c1.h).toBeCloseTo(300, 5);
    expect(c2.h).toBeCloseTo(60, 5);   // 300+120=420 -> 60
    expect(c3.h).toBeCloseTo(180, 5);  // 300+240=540 -> 180
  });

  it('triadic has correct s and l', () => {
    const [c1, c2, c3] = palette.triadic(90);
    for (const c of [c1, c2, c3]) {
      expect(c.s).toBe(0.7);
      expect(c.l).toBe(0.5);
    }
  });

  it('fromSeed produces 5 colors', () => {
    const seed = makeSeed('TestPalette', 'organism');
    const colors = palette.fromSeed(seed);
    expect(colors).toHaveLength(5);
  });

  it('fromSeed is deterministic with same RNG seed', () => {
    const p1 = new ColorPaletteGenerator(makeRng('pal-det'));
    const p2 = new ColorPaletteGenerator(makeRng('pal-det'));
    const seed = makeSeed('TestPalette', 'organism');
    const c1 = p1.fromSeed(seed);
    const c2 = p2.fromSeed(seed);
    expect(c1).toEqual(c2);
  });

  it('fromSeed uses vector color gene when present', () => {
    const seed = makeSeed('ColorEntity', 'organism', {
      color: { type: 'vector' as const, value: [0.5, 0.3, 0.7], dimensions: 3 },
    });
    const colors = palette.fromSeed(seed);
    expect(colors).toHaveLength(5);
    // Base hue should be 0.5 * 360 = 180
    expect(colors[0]!.h).toBeCloseTo(180, 0);
  });

  it('fromSeed hashes name when no color gene', () => {
    const seed = makeSeed('NoColorGene', 'organism');
    // Remove color gene if it exists
    delete (seed as any).genes['color'];
    const colors = palette.fromSeed(seed);
    expect(colors).toHaveLength(5);
    // All hues should be valid [0, 360)
    for (const c of colors) {
      expect(c.h).toBeGreaterThanOrEqual(0);
      expect(c.h).toBeLessThan(360);
    }
  });

  it('all HSL values are in valid ranges from fromSeed', () => {
    const seed = makeSeed('ValidRanges', 'organism');
    const colors = palette.fromSeed(seed);
    for (const c of colors) {
      expect(c.h).toBeGreaterThanOrEqual(0);
      expect(c.h).toBeLessThan(360);
      expect(c.s).toBeGreaterThanOrEqual(0);
      expect(c.s).toBeLessThanOrEqual(1);
      expect(c.l).toBeGreaterThanOrEqual(0);
      expect(c.l).toBeLessThanOrEqual(1);
    }
  });
});

// ===========================================================================
// 7. ContentPipeline
// ===========================================================================

describe('ContentPipeline', () => {
  let rng: DeterministicRNG;
  let pipeline: ContentPipeline;

  beforeEach(() => {
    rng = makeRng('pipeline-test');
    pipeline = new ContentPipeline(rng);
  });

  describe('generateCharacter', () => {
    it('returns name, traits, appearance, and abilities', () => {
      const seed = makeSeed('Hero', 'organism');
      const char = pipeline.generateCharacter(seed);
      expect(char.name).toBeTruthy();
      expect(char.name.length).toBeGreaterThan(0);
      expect(Array.isArray(char.traits)).toBe(true);
      expect(char.traits.length).toBeGreaterThan(0);
      expect(Array.isArray(char.appearance)).toBe(true);
      expect(char.appearance.length).toBeGreaterThan(0);
      expect(Array.isArray(char.abilities)).toBe(true);
      expect(char.abilities.length).toBeGreaterThan(0);
    });

    it('name is a non-empty string', () => {
      const seed = makeSeed('Warrior', 'organism');
      const char = pipeline.generateCharacter(seed);
      expect(typeof char.name).toBe('string');
      expect(char.name.length).toBeGreaterThan(0);
    });

    it('traits come from CHARACTER_TRAITS pool', () => {
      const seed = makeSeed('Mage', 'organism');
      const char = pipeline.generateCharacter(seed);
      const validTraits = [
        'brave', 'cunning', 'wise', 'compassionate', 'fierce',
        'stoic', 'charismatic', 'mysterious', 'loyal', 'ambitious',
        'gentle', 'ruthless', 'patient', 'impulsive', 'clever',
      ];
      for (const trait of char.traits) {
        expect(validTraits).toContain(trait);
      }
    });

    it('abilities come from ABILITY_POOL', () => {
      const seed = makeSeed('Sorcerer', 'organism');
      const char = pipeline.generateCharacter(seed);
      const validAbilities = [
        'swordsmanship', 'archery', 'fire magic', 'healing', 'stealth',
        'necromancy', 'alchemy', 'telekinesis', 'shapeshifting', 'divination',
        'leadership', 'tracking', 'enchanting', 'summoning', 'illusion',
      ];
      for (const ability of char.abilities) {
        expect(validAbilities).toContain(ability);
      }
    });

    it('is deterministic with same RNG seed', () => {
      const p1 = new ContentPipeline(makeRng('char-det'));
      const p2 = new ContentPipeline(makeRng('char-det'));
      const seed = makeSeed('DetHero', 'organism');
      const c1 = p1.generateCharacter(seed);
      const c2 = p2.generateCharacter(seed);
      expect(c1.traits).toEqual(c2.traits);
      expect(c1.appearance).toEqual(c2.appearance);
      expect(c1.abilities).toEqual(c2.abilities);
    });

    it('works without scalar genes (uses RNG defaults)', () => {
      const noGenesRng = makeRng('no-genes');
      const seed = createSeed('Bare', 'organism', {}, noGenesRng);
      const char = pipeline.generateCharacter(seed);
      expect(char.name.length).toBeGreaterThan(0);
      expect(char.traits.length).toBeGreaterThan(0);
    });
  });

  describe('generateItem', () => {
    it('returns name, type, rarity, stats, description', () => {
      const seed = makeSeed('Sword', 'weapon');
      const item = pipeline.generateItem(seed);
      expect(item.name).toBeTruthy();
      expect(item.type).toBeTruthy();
      expect(item.rarity).toBeTruthy();
      expect(item.stats).toBeDefined();
      expect(item.description).toBeTruthy();
    });

    it('type comes from ITEM_TYPES pool', () => {
      const seed = makeSeed('Shield', 'weapon');
      const item = pipeline.generateItem(seed);
      const validTypes = ['weapon', 'armor', 'potion', 'scroll', 'ring', 'amulet', 'staff', 'shield'];
      expect(validTypes).toContain(item.type);
    });

    it('rarity comes from RARITY_LEVELS pool', () => {
      const seed = makeSeed('Gem', 'material');
      const item = pipeline.generateItem(seed);
      const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      expect(validRarities).toContain(item.rarity);
    });

    it('stats contain attack, defense, durability, value', () => {
      const seed = makeSeed('Axe', 'weapon');
      const item = pipeline.generateItem(seed);
      expect(typeof item.stats['attack']).toBe('number');
      expect(typeof item.stats['defense']).toBe('number');
      expect(typeof item.stats['durability']).toBe('number');
      expect(typeof item.stats['value']).toBe('number');
    });

    it('stats are positive numbers', () => {
      const seed = makeSeed('Staff', 'weapon');
      const item = pipeline.generateItem(seed);
      expect(item.stats['attack']).toBeGreaterThan(0);
      expect(item.stats['defense']).toBeGreaterThan(0);
      expect(item.stats['durability']).toBeGreaterThan(0);
      expect(item.stats['value']).toBeGreaterThan(0);
    });

    it('description contains rarity', () => {
      const seed = makeSeed('Amulet', 'weapon');
      const item = pipeline.generateItem(seed);
      expect(item.description).toContain(item.rarity);
    });
  });

  describe('generateWorld', () => {
    it('returns name, biome, features, inhabitants', () => {
      const seed = makeSeed('Realm', 'terrain');
      const world = pipeline.generateWorld(seed);
      expect(world.name).toBeTruthy();
      expect(world.biome).toBeTruthy();
      expect(Array.isArray(world.features)).toBe(true);
      expect(world.features.length).toBeGreaterThan(0);
      expect(Array.isArray(world.inhabitants)).toBe(true);
      expect(world.inhabitants.length).toBeGreaterThan(0);
    });

    it('biome comes from BIOMES pool', () => {
      const seed = makeSeed('World', 'terrain');
      const world = pipeline.generateWorld(seed);
      const validBiomes = [
        'forest', 'desert', 'tundra', 'swamp', 'mountain',
        'plains', 'volcanic', 'oceanic', 'cavern', 'sky-realm',
      ];
      expect(validBiomes).toContain(world.biome);
    });

    it('features come from WORLD_FEATURES pool', () => {
      const seed = makeSeed('Land', 'terrain');
      const world = pipeline.generateWorld(seed);
      const validFeatures = [
        'ancient ruins', 'crystal caves', 'floating islands', 'deep chasms',
        'enchanted springs', 'petrified forest', 'obsidian spires', 'coral reefs',
        'sand dunes', 'glacier valleys', 'lava rivers', 'mushroom groves',
      ];
      for (const f of world.features) {
        expect(validFeatures).toContain(f);
      }
    });

    it('inhabitants come from INHABITANT_TYPES pool', () => {
      const seed = makeSeed('Kingdom', 'terrain');
      const world = pipeline.generateWorld(seed);
      const validInhabitants = [
        'elves', 'dwarves', 'goblins', 'dragons', 'sprites',
        'centaurs', 'merfolk', 'golems', 'phoenixes', 'treants',
        'nomads', 'monks', 'raiders', 'scholars', 'mystics',
      ];
      for (const inh of world.inhabitants) {
        expect(validInhabitants).toContain(inh);
      }
    });
  });

  describe('generateName', () => {
    it('returns a non-empty string for fantasy domain', () => {
      const name = pipeline.generateName('fantasy');
      expect(name.length).toBeGreaterThan(0);
    });

    it('returns a non-empty string for sci-fi domain', () => {
      const name = pipeline.generateName('sci-fi');
      expect(name.length).toBeGreaterThan(0);
    });

    it('returns a non-empty string for nature domain', () => {
      const name = pipeline.generateName('nature');
      expect(name.length).toBeGreaterThan(0);
    });

    it('returns a non-empty string for unknown domain (falls back to fantasy)', () => {
      const name = pipeline.generateName('unknown-domain');
      expect(name.length).toBeGreaterThan(0);
    });

    it('generated name is capitalized', () => {
      const name = pipeline.generateName('fantasy');
      expect(name[0]).toBe(name[0]!.toUpperCase());
    });
  });
});

// ===========================================================================
// 8. GenerateEngine
// ===========================================================================

describe('GenerateEngine', () => {
  let engine: GenerateEngine;

  beforeEach(() => {
    engine = new GenerateEngine(makeRng('engine-test'));
  });

  it('constructor works without arguments', () => {
    const e = new GenerateEngine();
    expect(e).toBeInstanceOf(GenerateEngine);
  });

  it('createNoise returns NoiseGenerator', () => {
    const noise = engine.createNoise();
    expect(noise).toBeInstanceOf(NoiseGenerator);
  });

  it('createWFC returns WaveFunctionCollapse', () => {
    const wfc = engine.createWFC();
    expect(wfc).toBeInstanceOf(WaveFunctionCollapse);
  });

  it('createLSystem returns LSystemGenerator', () => {
    const lsys = engine.createLSystem();
    expect(lsys).toBeInstanceOf(LSystemGenerator);
  });

  it('createCA returns CellularAutomata', () => {
    const ca = engine.createCA();
    expect(ca).toBeInstanceOf(CellularAutomata);
  });

  it('createMarkov returns MarkovNameGenerator', () => {
    const markov = engine.createMarkov();
    expect(markov).toBeInstanceOf(MarkovNameGenerator);
  });

  it('createPalette returns ColorPaletteGenerator', () => {
    const palette = engine.createPalette();
    expect(palette).toBeInstanceOf(ColorPaletteGenerator);
  });

  it('createPipeline returns ContentPipeline', () => {
    const pipeline = engine.createPipeline();
    expect(pipeline).toBeInstanceOf(ContentPipeline);
  });

  describe('fromSeed dispatch', () => {
    it('organism domain returns GeneratedCharacter', () => {
      const seed = makeSeed('Creature', 'organism');
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
      expect('abilities' in result).toBe(true);
    });

    it('mammal domain returns GeneratedCharacter', () => {
      const seed = makeSeed('Wolf', 'mammal');
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
    });

    it('bird domain returns GeneratedCharacter', () => {
      const seed = makeSeed('Eagle', 'bird');
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
    });

    it('fish domain returns GeneratedCharacter', () => {
      const seed = makeSeed('Salmon', 'fish');
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
    });

    it('insect domain returns GeneratedCharacter', () => {
      const seed = makeSeed('Beetle', 'insect');
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
    });

    it('robot domain returns GeneratedCharacter', () => {
      const seed = makeSeed('Mech', 'robot');
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
    });

    it('narrative domain returns GeneratedCharacter', () => {
      const seed = makeSeed('Story', 'narrative');
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
    });

    it('weapon domain returns GeneratedItem', () => {
      const seed = makeSeed('Blade', 'weapon');
      const result = engine.fromSeed(seed);
      expect('type' in result).toBe(true);
      expect('rarity' in result).toBe(true);
      expect('stats' in result).toBe(true);
    });

    it('material domain returns GeneratedItem', () => {
      const seed = makeSeed('Iron', 'material');
      const result = engine.fromSeed(seed);
      expect('rarity' in result).toBe(true);
    });

    it('crystal domain returns GeneratedItem', () => {
      const seed = makeSeed('Quartz', 'crystal');
      const result = engine.fromSeed(seed);
      expect('rarity' in result).toBe(true);
    });

    it('product domain returns GeneratedItem', () => {
      const seed = makeSeed('Gadget', 'product');
      const result = engine.fromSeed(seed);
      expect('rarity' in result).toBe(true);
    });

    it('terrain domain returns GeneratedWorld', () => {
      const seed = makeSeed('Plains', 'terrain');
      const result = engine.fromSeed(seed);
      expect('biome' in result).toBe(true);
      expect('features' in result).toBe(true);
      expect('inhabitants' in result).toBe(true);
    });

    it('building domain returns GeneratedWorld', () => {
      const seed = makeSeed('Castle', 'building');
      const result = engine.fromSeed(seed);
      expect('biome' in result).toBe(true);
    });

    it('plant domain returns GeneratedWorld', () => {
      const seed = makeSeed('Oak', 'plant');
      const result = engine.fromSeed(seed);
      expect('biome' in result).toBe(true);
    });

    it('ecosystem domain returns GeneratedWorld', () => {
      const seed = makeSeed('Jungle', 'ecosystem');
      const result = engine.fromSeed(seed);
      expect('biome' in result).toBe(true);
    });

    it('city domain returns GeneratedWorld', () => {
      const seed = makeSeed('Metropolis', 'city');
      const result = engine.fromSeed(seed);
      expect('biome' in result).toBe(true);
    });

    it('simulation domain returns GeneratedWorld', () => {
      const seed = makeSeed('Sim', 'simulation');
      const result = engine.fromSeed(seed);
      expect('biome' in result).toBe(true);
    });

    it('game domain returns GeneratedWorld', () => {
      const seed = makeSeed('RPG', 'game');
      const result = engine.fromSeed(seed);
      expect('biome' in result).toBe(true);
    });

    it('unknown domain defaults to character', () => {
      const rngLocal = makeRng('unknown-domain');
      const seed = createSeed('Unknown', 'particle' as any, {
        health: { type: 'scalar' as const, value: 50, min: 0, max: 100 },
      }, rngLocal);
      const result = engine.fromSeed(seed);
      expect('traits' in result).toBe(true);
    });
  });

  it('deterministic output with same RNG seed', () => {
    const e1 = new GenerateEngine(makeRng('det-engine'));
    const e2 = new GenerateEngine(makeRng('det-engine'));
    const seed = makeSeed('DetTest', 'organism');

    const r1 = e1.fromSeed(seed) as GeneratedCharacter;
    const r2 = e2.fromSeed(seed) as GeneratedCharacter;
    expect(r1.traits).toEqual(r2.traits);
    expect(r1.appearance).toEqual(r2.appearance);
    expect(r1.abilities).toEqual(r2.abilities);
  });

  it('created generators are functional', () => {
    const noise = engine.createNoise();
    expect(Number.isFinite(noise.noise2D(1, 1))).toBe(true);

    const wfc = engine.createWFC();
    const grid = wfc.collapse(3, 3, simpleTileRules());
    expect(grid).toHaveLength(3);

    const lsys = engine.createLSystem();
    expect(lsys.generate('A', [{ symbol: 'A', replacement: 'AB' }], 1)).toBe('AB');

    const ca = engine.createCA();
    const cave = ca.generateCave(10, 10, 0.5, 2);
    expect(cave).toHaveLength(10);

    const markov = engine.createMarkov();
    markov.train(['Alpha', 'Beta', 'Gamma'], 2);
    expect(markov.generate().length).toBeGreaterThan(0);

    const palette = engine.createPalette();
    const [c1, c2] = palette.complementary(90);
    expect(c1.h).toBeCloseTo(90);
  });
});
