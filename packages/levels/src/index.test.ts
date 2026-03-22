/**
 * Comprehensive tests for @paradigm/levels
 *
 * Covers:
 * - TileType enum values
 * - NoiseGenerator: noise2D, octaveNoise2D, generateHeightMap
 * - CellularAutomata: generate, step, countNeighbors
 * - DungeonGenerator: generate, placeRooms, connectRooms, placeDoors, placeSpawnAndExit
 * - BSPGenerator: generate, split
 * - WaveFunctionCollapse: generate with adjacency rules
 * - BiomeMapper: classify, getBiome, biomeToTile, generateWorld
 * - TileMapExporter: toJSON, toCSV, toASCII, toTMX, toHTML
 * - LevelEngine: fromSeed, generateCave, generateDungeon, generateBSP,
 *                generateWorld, generateHeightMap, export in all formats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicRNG } from '@paradigm/rng';
import type { UniversalSeed } from '@paradigm/types';
import {
  TileType,
  NoiseGenerator,
  CellularAutomata,
  DungeonGenerator,
  BSPGenerator,
  WaveFunctionCollapse,
  BiomeMapper,
  TileMapExporter,
  LevelEngine,
} from './index.js';
import type {
  TileMap,
  Room,
  Corridor,
  HeightMap,
  AdjacencyRule,
  BiomeConfig,
  Biome,
  ExportFormat,
} from './index.js';

// ---------------------------------------------------------------------------
// Seed helper
// ---------------------------------------------------------------------------

const makeSeed = (name: string, domain: string, genes: Record<string, unknown> = {}): UniversalSeed => ({
  $gst: '4.0', $name: name, $domain: domain as any, genes: genes as any,
  $hash: name + '-hash', $lineage: [], $metadata: { created: Date.now(), generation: 0 }, $fitness: [0.5],
});

// ---------------------------------------------------------------------------
// Shared RNG instances (deterministic seeds for reproducibility)
// ---------------------------------------------------------------------------

const SEED_A = 42;
const SEED_B = 12345;

function makeRng(seed: number = SEED_A): DeterministicRNG {
  return new DeterministicRNG(seed);
}

// ---------------------------------------------------------------------------
// Helper: assert a TileMap has valid structure
// ---------------------------------------------------------------------------

function assertValidTileMap(map: TileMap, w: number, h: number): void {
  expect(map.width).toBe(w);
  expect(map.height).toBe(h);
  expect(map.tiles).toHaveLength(h);
  for (const row of map.tiles) {
    expect(row).toHaveLength(w);
    for (const cell of row) {
      expect(Number.isInteger(cell)).toBe(true);
      expect(cell).toBeGreaterThanOrEqual(TileType.Empty);
      expect(cell).toBeLessThanOrEqual(TileType.Bridge);
    }
  }
}

// ---------------------------------------------------------------------------
// TileType enum
// ---------------------------------------------------------------------------

describe('TileType enum', () => {
  it('has numeric value 0 for Empty', () => {
    expect(TileType.Empty).toBe(0);
  });

  it('has numeric value 1 for Floor', () => {
    expect(TileType.Floor).toBe(1);
  });

  it('has numeric value 2 for Wall', () => {
    expect(TileType.Wall).toBe(2);
  });

  it('has numeric value 3 for Water', () => {
    expect(TileType.Water).toBe(3);
  });

  it('has numeric value 4 for Lava', () => {
    expect(TileType.Lava).toBe(4);
  });

  it('has numeric value 5 for Door', () => {
    expect(TileType.Door).toBe(5);
  });

  it('has numeric value 6 for Stairs', () => {
    expect(TileType.Stairs).toBe(6);
  });

  it('has numeric value 7 for Chest', () => {
    expect(TileType.Chest).toBe(7);
  });

  it('has numeric value 8 for Spawn', () => {
    expect(TileType.Spawn).toBe(8);
  });

  it('has numeric value 9 for Exit', () => {
    expect(TileType.Exit).toBe(9);
  });

  it('has numeric value 10 for Grass', () => {
    expect(TileType.Grass).toBe(10);
  });

  it('has numeric value 11 for Sand', () => {
    expect(TileType.Sand).toBe(11);
  });

  it('has numeric value 12 for Stone', () => {
    expect(TileType.Stone).toBe(12);
  });

  it('has numeric value 13 for Tree', () => {
    expect(TileType.Tree).toBe(13);
  });

  it('has numeric value 14 for Bridge', () => {
    expect(TileType.Bridge).toBe(14);
  });

  it('has exactly 15 named values', () => {
    // TypeScript numeric enums expose both name->value and value->name entries
    const keys = Object.keys(TileType).filter((k) => isNaN(Number(k)));
    expect(keys).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// NoiseGenerator
// ---------------------------------------------------------------------------

describe('NoiseGenerator', () => {
  let gen: NoiseGenerator;

  beforeEach(() => {
    gen = new NoiseGenerator(makeRng(SEED_A));
  });

  describe('noise2D', () => {
    it('returns a number in [0, 1]', () => {
      for (let i = 0; i < 50; i++) {
        const v = gen.noise2D(i * 0.1, i * 0.07);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('is deterministic for the same seed', () => {
      const gen2 = new NoiseGenerator(makeRng(SEED_A));
      for (let i = 0; i < 10; i++) {
        expect(gen.noise2D(i, i)).toBeCloseTo(gen2.noise2D(i, i), 10);
      }
    });

    it('produces different values for different seeds', () => {
      const genB = new NoiseGenerator(makeRng(SEED_B));
      // At least one of the samples should differ
      const diffs = Array.from({ length: 10 }, (_, i) =>
        Math.abs(gen.noise2D(i, i) - genB.noise2D(i, i)),
      );
      expect(diffs.some((d) => d > 0)).toBe(true);
    });

    it('handles integer coordinates', () => {
      expect(() => gen.noise2D(0, 0)).not.toThrow();
      expect(() => gen.noise2D(255, 255)).not.toThrow();
    });

    it('handles fractional coordinates', () => {
      const v = gen.noise2D(0.5, 0.5);
      expect(typeof v).toBe('number');
      expect(isNaN(v)).toBe(false);
    });
  });

  describe('octaveNoise2D', () => {
    it('returns a value in [0, 1]', () => {
      for (let octaves = 1; octaves <= 6; octaves++) {
        const v = gen.octaveNoise2D(0.5, 0.5, octaves);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('uses persistence to reduce amplitude per octave', () => {
      // With persistence=1 all octaves contribute equally; with <1 higher
      // octaves contribute less — the result should differ.
      const vHigh = gen.octaveNoise2D(1.0, 1.0, 4, 1.0);
      const gen2 = new NoiseGenerator(makeRng(SEED_A));
      const vLow = gen2.octaveNoise2D(1.0, 1.0, 4, 0.5);
      // They should produce different values (different persistence).
      expect(vHigh).not.toBeCloseTo(vLow, 5);
    });

    it('single octave matches noise2D result scaled by totalAmplitude=1', () => {
      // With 1 octave and default persistence, total = noise2D(x, y) / 1
      const gen3 = new NoiseGenerator(makeRng(99));
      const gen4 = new NoiseGenerator(makeRng(99));
      const direct = gen3.noise2D(2, 3);
      const octave = gen4.octaveNoise2D(2, 3, 1);
      // Both use the same RNG state at construction; should be identical.
      expect(octave).toBeCloseTo(direct, 10);
    });
  });

  describe('generateHeightMap', () => {
    it('returns correct dimensions', () => {
      const hm = gen.generateHeightMap(20, 15);
      expect(hm.width).toBe(20);
      expect(hm.height).toBe(15);
      expect(hm.data).toHaveLength(15);
      for (const row of hm.data) {
        expect(row).toHaveLength(20);
      }
    });

    it('all values are in [0, 1]', () => {
      const hm = gen.generateHeightMap(10, 10);
      for (const row of hm.data) {
        for (const v of row) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    });

    it('accepts custom scale and octave arguments', () => {
      expect(() => gen.generateHeightMap(8, 8, 0.1, 2)).not.toThrow();
    });

    it('produces a non-trivially-flat map (has variance)', () => {
      const hm = gen.generateHeightMap(16, 16);
      const flat = hm.data.flat();
      const min = Math.min(...flat);
      const max = Math.max(...flat);
      expect(max - min).toBeGreaterThan(0.01);
    });
  });
});

// ---------------------------------------------------------------------------
// CellularAutomata
// ---------------------------------------------------------------------------

describe('CellularAutomata', () => {
  let ca: CellularAutomata;

  beforeEach(() => {
    ca = new CellularAutomata(makeRng(SEED_A));
  });

  describe('generate', () => {
    it('returns a valid TileMap', () => {
      const map = ca.generate(40, 30);
      assertValidTileMap(map, 40, 30);
    });

    it('border cells are always Wall', () => {
      const map = ca.generate(20, 20);
      const w = map.width;
      const h = map.height;
      for (let x = 0; x < w; x++) {
        expect(map.tiles[0]![x]).toBe(TileType.Wall);
        expect(map.tiles[h - 1]![x]).toBe(TileType.Wall);
      }
      for (let y = 0; y < h; y++) {
        expect(map.tiles[y]![0]).toBe(TileType.Wall);
        expect(map.tiles[y]![w - 1]).toBe(TileType.Wall);
      }
    });

    it('interior cells are Floor or Wall only', () => {
      const map = ca.generate(20, 20);
      for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
          const t = map.tiles[y]![x];
          expect(t === TileType.Wall || t === TileType.Floor).toBe(true);
        }
      }
    });

    it('is deterministic with the same seed', () => {
      const ca2 = new CellularAutomata(makeRng(SEED_A));
      const m1 = ca.generate(20, 20);
      const m2 = ca2.generate(20, 20);
      expect(m1.tiles).toEqual(m2.tiles);
    });

    it('respects fillPercent=0 — mostly Floor', () => {
      const map = ca.generate(20, 20, 0, 0);
      let floors = 0;
      for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
          if (map.tiles[y]![x] === TileType.Floor) floors++;
        }
      }
      const interior = (map.width - 2) * (map.height - 2);
      // With 0% fill probability the interior should be all Floor before smoothing
      expect(floors).toBe(interior);
    });

    it('respects fillPercent=100 — mostly Wall interior', () => {
      const map = ca.generate(20, 20, 100, 0);
      let walls = 0;
      for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
          if (map.tiles[y]![x] === TileType.Wall) walls++;
        }
      }
      const interior = (map.width - 2) * (map.height - 2);
      expect(walls).toBe(interior);
    });
  });

  describe('step', () => {
    it('returns a grid of the same dimensions', () => {
      const map = ca.generate(15, 15, 45, 0);
      const next = ca.step(map.tiles, 15, 15);
      expect(next).toHaveLength(15);
      for (const row of next) expect(row).toHaveLength(15);
    });

    it('border cells are Wall after step', () => {
      const map = ca.generate(15, 15, 45, 0);
      const next = ca.step(map.tiles, 15, 15);
      expect(next[0]![0]).toBe(TileType.Wall);
      expect(next[14]![14]).toBe(TileType.Wall);
    });

    it('interior cells are only Floor or Wall after step', () => {
      const map = ca.generate(15, 15, 45, 0);
      const next = ca.step(map.tiles, 15, 15);
      for (let y = 1; y < 14; y++) {
        for (let x = 1; x < 14; x++) {
          const t = next[y]![x];
          expect(t === TileType.Wall || t === TileType.Floor).toBe(true);
        }
      }
    });
  });

  describe('countNeighbors', () => {
    it('counts 8 wall neighbors for a corner-adjacent interior cell of an all-wall grid', () => {
      // All-wall 5x5 grid
      const tiles: TileType[][] = Array.from({ length: 5 }, () =>
        Array(5).fill(TileType.Wall) as TileType[],
      );
      // Center cell (2,2) is surrounded by 8 walls
      expect(ca.countNeighbors(tiles, 2, 2, TileType.Wall)).toBe(8);
    });

    it('counts 0 wall neighbors for a surrounded-by-floor cell', () => {
      const tiles: TileType[][] = Array.from({ length: 5 }, () =>
        Array(5).fill(TileType.Floor) as TileType[],
      );
      expect(ca.countNeighbors(tiles, 2, 2, TileType.Wall)).toBe(0);
    });

    it('counts out-of-bounds positions as wall (boundary behavior)', () => {
      const tiles: TileType[][] = Array.from({ length: 3 }, () =>
        Array(3).fill(TileType.Floor) as TileType[],
      );
      // Cell (0,0): 8-directional neighbors are (-1,-1),(-1,0),(-1,1),(0,-1),(1,-1) = 5 OOB
      // plus (0,1),(1,0),(1,1) which are Floor (not Wall).
      // OOB positions are counted as walls, so result = 5.
      const count = ca.countNeighbors(tiles, 0, 0, TileType.Wall);
      expect(count).toBe(5);
    });

    it('returns value in range [0, 8]', () => {
      const tiles: TileType[][] = Array.from({ length: 5 }, () =>
        Array(5).fill(TileType.Empty) as TileType[],
      );
      const count = ca.countNeighbors(tiles, 2, 2, TileType.Wall);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(8);
    });
  });
});

// ---------------------------------------------------------------------------
// DungeonGenerator
// ---------------------------------------------------------------------------

describe('DungeonGenerator', () => {
  let gen: DungeonGenerator;

  beforeEach(() => {
    gen = new DungeonGenerator(makeRng(SEED_A));
  });

  describe('generate', () => {
    it('returns a valid TileMap', () => {
      const map = gen.generate(60, 40, 6);
      assertValidTileMap(map, 60, 40);
    });

    it('attaches rooms and corridors to metadata', () => {
      const map = gen.generate(60, 40, 4);
      expect(map.metadata).toBeDefined();
      expect(Array.isArray((map.metadata as any).rooms)).toBe(true);
      expect(Array.isArray((map.metadata as any).corridors)).toBe(true);
    });

    it('places at least one Spawn tile', () => {
      const map = gen.generate(60, 40, 4);
      const flat = map.tiles.flat();
      expect(flat.includes(TileType.Spawn)).toBe(true);
    });

    it('places at least one Exit tile', () => {
      const map = gen.generate(60, 40, 4);
      const flat = map.tiles.flat();
      expect(flat.includes(TileType.Exit)).toBe(true);
    });

    it('places at least one Floor tile', () => {
      const map = gen.generate(60, 40, 4);
      const flat = map.tiles.flat();
      expect(flat.includes(TileType.Floor)).toBe(true);
    });

    it('is deterministic with the same seed', () => {
      const gen2 = new DungeonGenerator(makeRng(SEED_A));
      const m1 = gen.generate(50, 35, 5);
      const m2 = gen2.generate(50, 35, 5);
      expect(m1.tiles).toEqual(m2.tiles);
    });

    it('generates dungeons of various room counts', () => {
      for (const roomCount of [1, 3, 8, 12]) {
        const g = new DungeonGenerator(makeRng(SEED_A));
        expect(() => g.generate(60, 40, roomCount)).not.toThrow();
      }
    });
  });

  describe('placeRooms', () => {
    it('returns an array of rooms', () => {
      const fakeRng = makeRng(SEED_A);
      const g = new DungeonGenerator(fakeRng);
      const tiles: TileType[][] = Array.from({ length: 40 }, () =>
        Array(60).fill(TileType.Wall) as TileType[],
      );
      const rooms = g.placeRooms(tiles, 60, 40, 5);
      expect(Array.isArray(rooms)).toBe(true);
      expect(rooms.length).toBeGreaterThan(0);
    });

    it('all rooms have positive dimensions and valid coordinates', () => {
      const fakeRng = makeRng(SEED_B);
      const g = new DungeonGenerator(fakeRng);
      const tiles: TileType[][] = Array.from({ length: 60 }, () =>
        Array(80).fill(TileType.Wall) as TileType[],
      );
      const rooms = g.placeRooms(tiles, 80, 60, 8);
      for (const room of rooms) {
        expect(room.width).toBeGreaterThan(0);
        expect(room.height).toBeGreaterThan(0);
        expect(room.x).toBeGreaterThanOrEqual(1);
        expect(room.y).toBeGreaterThanOrEqual(1);
        expect(room.x + room.width).toBeLessThan(80);
        expect(room.y + room.height).toBeLessThan(60);
      }
    });

    it('rooms have sequential ids starting at 0', () => {
      const fakeRng = makeRng(SEED_A);
      const g = new DungeonGenerator(fakeRng);
      const tiles: TileType[][] = Array.from({ length: 40 }, () =>
        Array(60).fill(TileType.Wall) as TileType[],
      );
      const rooms = g.placeRooms(tiles, 60, 40, 5);
      rooms.forEach((room, idx) => expect(room.id).toBe(idx));
    });
  });

  describe('connectRooms', () => {
    it('returns empty array for fewer than 2 rooms', () => {
      const room: Room = { x: 5, y: 5, width: 5, height: 5, id: 0 };
      expect(gen.connectRooms([])).toEqual([]);
      expect(gen.connectRooms([room])).toEqual([]);
    });

    it('returns n-1 corridors for n rooms (spanning tree)', () => {
      const rooms: Room[] = [
        { x: 2,  y: 2,  width: 5, height: 5, id: 0 },
        { x: 15, y: 2,  width: 5, height: 5, id: 1 },
        { x: 2,  y: 15, width: 5, height: 5, id: 2 },
        { x: 15, y: 15, width: 5, height: 5, id: 3 },
      ];
      const corridors = gen.connectRooms(rooms);
      expect(corridors).toHaveLength(3);
    });

    it('each corridor has a non-empty points array', () => {
      const rooms: Room[] = [
        { x: 2,  y: 2,  width: 5, height: 5, id: 0 },
        { x: 20, y: 20, width: 5, height: 5, id: 1 },
      ];
      const corridors = gen.connectRooms(rooms);
      expect(corridors[0]!.points.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// BSPGenerator
// ---------------------------------------------------------------------------

describe('BSPGenerator', () => {
  let bsp: BSPGenerator;

  beforeEach(() => {
    bsp = new BSPGenerator(makeRng(SEED_A));
  });

  describe('generate', () => {
    it('returns a valid TileMap', () => {
      const map = bsp.generate(64, 48);
      assertValidTileMap(map, 64, 48);
    });

    it('attaches rooms in metadata', () => {
      const map = bsp.generate(64, 48);
      expect(map.metadata).toBeDefined();
      expect(Array.isArray((map.metadata as any).rooms)).toBe(true);
    });

    it('places at least one Floor tile', () => {
      const map = bsp.generate(64, 48);
      expect(map.tiles.flat().includes(TileType.Floor)).toBe(true);
    });

    it('places Spawn and Exit when rooms exist', () => {
      const map = bsp.generate(64, 48);
      const flat = map.tiles.flat();
      // BSP may produce rooms — if it does, spawn/exit are placed
      const rooms = (map.metadata as any).rooms as Room[];
      if (rooms.length >= 1) {
        expect(flat.includes(TileType.Spawn) || flat.includes(TileType.Exit)).toBe(true);
      }
    });

    it('is deterministic with the same seed', () => {
      const bsp2 = new BSPGenerator(makeRng(SEED_A));
      const m1 = bsp.generate(40, 40);
      const m2 = bsp2.generate(40, 40);
      expect(m1.tiles).toEqual(m2.tiles);
    });

    it('accepts a custom minRoomSize', () => {
      expect(() => bsp.generate(60, 60, 6)).not.toThrow();
    });
  });

  describe('split', () => {
    it('returns at least one rect', () => {
      const rect = { x: 0, y: 0, width: 40, height: 40 };
      const leaves = bsp.split(rect, 0, 5);
      expect(leaves.length).toBeGreaterThan(0);
    });

    it('leaf rects cover the original area (sum of areas equals parent)', () => {
      const rect = { x: 0, y: 0, width: 40, height: 40 };
      const leaves = bsp.split(rect, 0, 5);
      const totalArea = leaves.reduce((acc, r) => acc + r.width * r.height, 0);
      expect(totalArea).toBe(40 * 40);
    });

    it('stops splitting at maxDepth=5 (depth parameter)', () => {
      // Calling split at depth=5 should return [rect] immediately
      const rect = { x: 0, y: 0, width: 40, height: 40 };
      const leaves = bsp.split(rect, 5, 5);
      expect(leaves).toEqual([rect]);
    });

    it('returns [rect] when too small to split', () => {
      // Width < minSize*2+1 and height < minSize*2+1 => cannot split
      const rect = { x: 0, y: 0, width: 6, height: 6 };
      const leaves = bsp.split(rect, 0, 5);
      // A 6x6 rect with minSize=5 cannot split (5*2+1=11 > 6)
      expect(leaves).toEqual([rect]);
    });

    it('all leaf coordinates are within parent bounds', () => {
      const rect = { x: 5, y: 10, width: 50, height: 50 };
      const leaves = bsp.split(rect, 0, 5);
      for (const leaf of leaves) {
        expect(leaf.x).toBeGreaterThanOrEqual(rect.x);
        expect(leaf.y).toBeGreaterThanOrEqual(rect.y);
        expect(leaf.x + leaf.width).toBeLessThanOrEqual(rect.x + rect.width);
        expect(leaf.y + leaf.height).toBeLessThanOrEqual(rect.y + rect.height);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// WaveFunctionCollapse
// ---------------------------------------------------------------------------

describe('WaveFunctionCollapse', () => {
  let wfc: WaveFunctionCollapse;

  const basicRules: AdjacencyRule[] = [
    {
      tile: TileType.Floor,
      neighbors: {
        up:    [TileType.Floor, TileType.Wall],
        down:  [TileType.Floor, TileType.Wall],
        left:  [TileType.Floor, TileType.Wall],
        right: [TileType.Floor, TileType.Wall],
      },
    },
    {
      tile: TileType.Wall,
      neighbors: {
        up:    [TileType.Floor, TileType.Wall],
        down:  [TileType.Floor, TileType.Wall],
        left:  [TileType.Floor, TileType.Wall],
        right: [TileType.Floor, TileType.Wall],
      },
    },
  ];

  beforeEach(() => {
    wfc = new WaveFunctionCollapse(makeRng(SEED_A));
  });

  describe('generate', () => {
    it('returns a valid TileMap', () => {
      const map = wfc.generate(10, 10, basicRules);
      assertValidTileMap(map, 10, 10);
    });

    it('all tiles are from the rules tile set', () => {
      const map = wfc.generate(8, 8, basicRules);
      const allowed = new Set(basicRules.map((r) => r.tile));
      for (const row of map.tiles) {
        for (const tile of row) {
          expect(allowed.has(tile)).toBe(true);
        }
      }
    });

    it('is deterministic with the same seed', () => {
      const wfc2 = new WaveFunctionCollapse(makeRng(SEED_A));
      const m1 = wfc.generate(8, 8, basicRules);
      const m2 = wfc2.generate(8, 8, basicRules);
      expect(m1.tiles).toEqual(m2.tiles);
    });

    it('handles a single-tile rule set', () => {
      const singleRule: AdjacencyRule[] = [
        {
          tile: TileType.Grass,
          neighbors: {
            up:    [TileType.Grass],
            down:  [TileType.Grass],
            left:  [TileType.Grass],
            right: [TileType.Grass],
          },
        },
      ];
      const map = wfc.generate(5, 5, singleRule);
      for (const row of map.tiles) {
        for (const t of row) {
          expect(t).toBe(TileType.Grass);
        }
      }
    });

    it('works with three-tile rules', () => {
      const threeRules: AdjacencyRule[] = [
        {
          tile: TileType.Water,
          neighbors: { up: [TileType.Water, TileType.Sand], down: [TileType.Water, TileType.Sand], left: [TileType.Water, TileType.Sand], right: [TileType.Water, TileType.Sand] },
        },
        {
          tile: TileType.Sand,
          neighbors: { up: [TileType.Water, TileType.Sand, TileType.Grass], down: [TileType.Water, TileType.Sand, TileType.Grass], left: [TileType.Water, TileType.Sand, TileType.Grass], right: [TileType.Water, TileType.Sand, TileType.Grass] },
        },
        {
          tile: TileType.Grass,
          neighbors: { up: [TileType.Sand, TileType.Grass], down: [TileType.Sand, TileType.Grass], left: [TileType.Sand, TileType.Grass], right: [TileType.Sand, TileType.Grass] },
        },
      ];
      expect(() => wfc.generate(10, 10, threeRules)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// BiomeMapper
// ---------------------------------------------------------------------------

describe('BiomeMapper', () => {
  let mapper: BiomeMapper;

  beforeEach(() => {
    mapper = new BiomeMapper(makeRng(SEED_A));
  });

  describe('getBiome', () => {
    it('returns ocean when height < waterLevel', () => {
      expect(mapper.getBiome(0.1, 0.5, 0.3)).toBe('ocean');
    });

    it('returns swamp at waterLevel + small delta', () => {
      expect(mapper.getBiome(0.32, 0.5, 0.3)).toBe('swamp');
    });

    it('returns volcanic for very high (>0.88) heights', () => {
      expect(mapper.getBiome(0.95, 0.5, 0.3)).toBe('volcanic');
    });

    it('returns mountain for high (>0.75, <=0.88) heights', () => {
      expect(mapper.getBiome(0.80, 0.5, 0.3)).toBe('mountain');
    });

    it('returns desert for low moisture below 0.25', () => {
      expect(mapper.getBiome(0.5, 0.1, 0.3)).toBe('desert');
    });

    it('returns plains for moderate moisture and moderate height', () => {
      expect(mapper.getBiome(0.4, 0.35, 0.3)).toBe('plains');
    });

    it('returns tundra for moderate moisture and higher altitude', () => {
      expect(mapper.getBiome(0.6, 0.35, 0.3)).toBe('tundra');
    });

    it('returns forest for high moisture outside mountain/water zone', () => {
      expect(mapper.getBiome(0.5, 0.7, 0.3)).toBe('forest');
    });

    it('uses default waterLevel of 0.3', () => {
      expect(mapper.getBiome(0.1, 0.5)).toBe('ocean');
    });
  });

  describe('biomeToTile', () => {
    it('maps plains to Grass', () => {
      expect(mapper.biomeToTile('plains')).toBe(TileType.Grass);
    });

    it('maps forest to Tree', () => {
      expect(mapper.biomeToTile('forest')).toBe(TileType.Tree);
    });

    it('maps desert to Sand', () => {
      expect(mapper.biomeToTile('desert')).toBe(TileType.Sand);
    });

    it('maps tundra to Stone', () => {
      expect(mapper.biomeToTile('tundra')).toBe(TileType.Stone);
    });

    it('maps swamp to Water', () => {
      expect(mapper.biomeToTile('swamp')).toBe(TileType.Water);
    });

    it('maps mountain to Stone', () => {
      expect(mapper.biomeToTile('mountain')).toBe(TileType.Stone);
    });

    it('maps ocean to Water', () => {
      expect(mapper.biomeToTile('ocean')).toBe(TileType.Water);
    });

    it('maps volcanic to Lava', () => {
      expect(mapper.biomeToTile('volcanic')).toBe(TileType.Lava);
    });
  });

  describe('classify', () => {
    it('returns a valid TileMap with correct dimensions', () => {
      const noiseGen = new NoiseGenerator(makeRng(SEED_A));
      const hm = noiseGen.generateHeightMap(20, 15);
      const tileMap = mapper.classify(hm);
      assertValidTileMap(tileMap, 20, 15);
    });

    it('all tiles are known TileType values', () => {
      const noiseGen = new NoiseGenerator(makeRng(SEED_A));
      const hm = noiseGen.generateHeightMap(10, 10);
      const tileMap = mapper.classify(hm);
      for (const row of tileMap.tiles) {
        for (const t of row) {
          expect(t).toBeGreaterThanOrEqual(TileType.Empty);
          expect(t).toBeLessThanOrEqual(TileType.Bridge);
        }
      }
    });

    it('respects custom waterLevel — high waterLevel produces more Water tiles', () => {
      const noiseGen1 = new NoiseGenerator(makeRng(SEED_A));
      const hm = noiseGen1.generateHeightMap(20, 20);

      const mapperLow  = new BiomeMapper(makeRng(SEED_A));
      const mapperHigh = new BiomeMapper(makeRng(SEED_A));

      const lowWater  = mapperLow.classify(hm, 0.1).tiles.flat().filter((t) => t === TileType.Water).length;
      const highWater = mapperHigh.classify(hm, 0.7).tiles.flat().filter((t) => t === TileType.Water).length;

      expect(highWater).toBeGreaterThan(lowWater);
    });
  });

  describe('generateWorld', () => {
    it('returns a valid TileMap', () => {
      const map = mapper.generateWorld(30, 20);
      assertValidTileMap(map, 30, 20);
    });

    it('produces varied tiles (not uniform)', () => {
      const map = mapper.generateWorld(30, 30);
      const uniqueTiles = new Set(map.tiles.flat());
      expect(uniqueTiles.size).toBeGreaterThan(1);
    });
  });
});

// ---------------------------------------------------------------------------
// TileMapExporter
// ---------------------------------------------------------------------------

describe('TileMapExporter', () => {
  let exporter: TileMapExporter;
  let sampleMap: TileMap;

  beforeEach(() => {
    exporter = new TileMapExporter();
    // Manually crafted 3x2 map for predictable assertions
    sampleMap = {
      width: 3,
      height: 2,
      tiles: [
        [TileType.Wall,  TileType.Floor, TileType.Wall],
        [TileType.Spawn, TileType.Floor, TileType.Exit],
      ],
    };
  });

  describe('toJSON', () => {
    it('returns a valid JSON string', () => {
      const json = exporter.toJSON(sampleMap);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('contains width, height, tiles fields', () => {
      const parsed = JSON.parse(exporter.toJSON(sampleMap));
      expect(parsed.width).toBe(3);
      expect(parsed.height).toBe(2);
      expect(Array.isArray(parsed.tiles)).toBe(true);
    });

    it('serialises metadata when present', () => {
      const mapWithMeta: TileMap = { ...sampleMap, metadata: { level: 1 } };
      const parsed = JSON.parse(exporter.toJSON(mapWithMeta));
      expect(parsed.metadata).toEqual({ level: 1 });
    });

    it('serialises metadata as null when absent', () => {
      const parsed = JSON.parse(exporter.toJSON(sampleMap));
      expect(parsed.metadata).toBeNull();
    });
  });

  describe('toCSV', () => {
    it('returns a string with newline-separated rows', () => {
      const csv = exporter.toCSV(sampleMap);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
    });

    it('each row has width-1 commas', () => {
      const csv = exporter.toCSV(sampleMap);
      for (const line of csv.split('\n')) {
        expect(line.split(',').length).toBe(sampleMap.width);
      }
    });

    it('encodes tile values as integers', () => {
      const csv = exporter.toCSV(sampleMap);
      const values = csv.split('\n').flatMap((r) => r.split(',').map(Number));
      expect(values).toContain(TileType.Wall);
      expect(values).toContain(TileType.Floor);
      expect(values).toContain(TileType.Spawn);
      expect(values).toContain(TileType.Exit);
    });
  });

  describe('toASCII', () => {
    it('returns correct character for each tile', () => {
      // sampleMap row 0: [Wall, Floor, Wall]  => '#.#'
      // sampleMap row 1: [Spawn, Floor, Exit] => '@.X'
      const ascii = exporter.toASCII(sampleMap);
      const lines = ascii.split('\n');
      expect(lines[0]).toBe('#.#');
      expect(lines[1]).toBe('@.X');
    });

    it('has height rows', () => {
      const ascii = exporter.toASCII(sampleMap);
      expect(ascii.split('\n')).toHaveLength(sampleMap.height);
    });

    it('each row has width characters', () => {
      const gen = new LevelEngine(makeRng(SEED_A));
      const map = gen.generateDungeon(30, 20, 4);
      const ascii = exporter.toASCII(map);
      for (const line of ascii.split('\n')) {
        expect(line.length).toBe(30);
      }
    });
  });

  describe('toTMX', () => {
    it('returns a string containing XML declaration', () => {
      const tmx = exporter.toTMX(sampleMap);
      expect(tmx).toContain('<?xml version="1.0"');
    });

    it('includes map width and height attributes', () => {
      const tmx = exporter.toTMX(sampleMap);
      expect(tmx).toContain(`width="${sampleMap.width}"`);
      expect(tmx).toContain(`height="${sampleMap.height}"`);
    });

    it('contains a <data> element', () => {
      const tmx = exporter.toTMX(sampleMap);
      expect(tmx).toContain('<data encoding="csv">');
      expect(tmx).toContain('</data>');
    });

    it('encodes GIDs as TileType + 1', () => {
      const tmx = exporter.toTMX(sampleMap);
      // Wall(2)+1=3, Floor(1)+1=2, Spawn(8)+1=9, Exit(9)+1=10
      expect(tmx).toContain('3,2,3');
      expect(tmx).toContain('9,2,10');
    });
  });

  describe('toHTML', () => {
    it('returns a string containing DOCTYPE', () => {
      const html = exporter.toHTML(sampleMap);
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('contains a <table> element', () => {
      const html = exporter.toHTML(sampleMap);
      expect(html).toContain('<table>');
      expect(html).toContain('</table>');
    });

    it('contains height <tr> rows', () => {
      const html = exporter.toHTML(sampleMap);
      const trCount = (html.match(/<tr>/g) ?? []).length;
      expect(trCount).toBe(sampleMap.height);
    });

    it('contains width*height <td> cells', () => {
      const html = exporter.toHTML(sampleMap);
      const tdCount = (html.match(/<td /g) ?? []).length;
      expect(tdCount).toBe(sampleMap.width * sampleMap.height);
    });

    it('embeds background colors for each tile', () => {
      const html = exporter.toHTML(sampleMap);
      expect(html).toContain('background:');
    });
  });
});

// ---------------------------------------------------------------------------
// LevelEngine
// ---------------------------------------------------------------------------

describe('LevelEngine', () => {
  let engine: LevelEngine;

  beforeEach(() => {
    engine = new LevelEngine(makeRng(SEED_A));
  });

  describe('constructor', () => {
    it('constructs without an RNG argument', () => {
      expect(() => new LevelEngine()).not.toThrow();
    });

    it('constructs with a provided RNG', () => {
      expect(() => new LevelEngine(makeRng(SEED_A))).not.toThrow();
    });
  });

  describe('fromSeed (static)', () => {
    it('creates a LevelEngine from a UniversalSeed', () => {
      const seed = makeSeed('hero', 'game');
      const engineFromSeed = LevelEngine.fromSeed(seed);
      expect(engineFromSeed).toBeInstanceOf(LevelEngine);
    });

    it('is deterministic — two engines from the same seed produce the same cave', () => {
      const seed = makeSeed('cave-world', 'game');
      const e1 = LevelEngine.fromSeed(seed);
      const e2 = LevelEngine.fromSeed(seed);
      expect(e1.generateCave(20, 20)).toEqual(e2.generateCave(20, 20));
    });

    it('instance method fromSeed delegates to static', () => {
      const seed = makeSeed('dungeon-world', 'game');
      const fromInstance = engine.fromSeed(seed);
      const fromStatic   = LevelEngine.fromSeed(seed);
      expect(fromInstance.generateCave(15, 15)).toEqual(fromStatic.generateCave(15, 15));
    });
  });

  describe('generateCave', () => {
    it('returns a valid TileMap', () => {
      const map = engine.generateCave(40, 30);
      assertValidTileMap(map, 40, 30);
    });

    it('accepts custom fillPercent', () => {
      expect(() => engine.generateCave(20, 20, 60)).not.toThrow();
    });

    it('produces deterministic output', () => {
      const e1 = new LevelEngine(makeRng(SEED_A));
      const e2 = new LevelEngine(makeRng(SEED_A));
      expect(e1.generateCave(20, 20)).toEqual(e2.generateCave(20, 20));
    });
  });

  describe('generateDungeon', () => {
    it('returns a valid TileMap', () => {
      const map = engine.generateDungeon(60, 40);
      assertValidTileMap(map, 60, 40);
    });

    it('accepts custom room count', () => {
      expect(() => engine.generateDungeon(60, 40, 6)).not.toThrow();
    });

    it('has rooms in metadata', () => {
      const map = engine.generateDungeon(60, 40, 4);
      expect(Array.isArray((map.metadata as any)?.rooms)).toBe(true);
    });
  });

  describe('generateBSP', () => {
    it('returns a valid TileMap', () => {
      const map = engine.generateBSP(64, 48);
      assertValidTileMap(map, 64, 48);
    });

    it('has rooms in metadata', () => {
      const map = engine.generateBSP(64, 48);
      expect(Array.isArray((map.metadata as any)?.rooms)).toBe(true);
    });
  });

  describe('generateWorld', () => {
    it('returns a valid TileMap', () => {
      const map = engine.generateWorld(40, 30);
      assertValidTileMap(map, 40, 30);
    });

    it('produces varied biome tiles', () => {
      const map = engine.generateWorld(40, 40);
      const unique = new Set(map.tiles.flat());
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe('generateHeightMap', () => {
    it('returns a HeightMap with correct dimensions', () => {
      const hm = engine.generateHeightMap(20, 15);
      expect(hm.width).toBe(20);
      expect(hm.height).toBe(15);
      expect(hm.data).toHaveLength(15);
      for (const row of hm.data) expect(row).toHaveLength(20);
    });

    it('all values are in [0, 1]', () => {
      const hm = engine.generateHeightMap(10, 10);
      for (const row of hm.data) {
        for (const v of row) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('export', () => {
    let map: TileMap;

    beforeEach(() => {
      map = engine.generateDungeon(30, 20, 3);
    });

    it('exports to json format', () => {
      const out = engine.export(map, 'json');
      expect(() => JSON.parse(out)).not.toThrow();
    });

    it('exports to csv format', () => {
      const out = engine.export(map, 'csv');
      expect(out.split('\n')).toHaveLength(20);
    });

    it('exports to ascii format', () => {
      const out = engine.export(map, 'ascii');
      const lines = out.split('\n');
      expect(lines).toHaveLength(20);
      expect(lines[0]!.length).toBe(30);
    });

    it('exports to tmx format', () => {
      const out = engine.export(map, 'tmx');
      expect(out).toContain('<?xml');
      expect(out).toContain('<map');
    });

    it('exports to html format', () => {
      const out = engine.export(map, 'html');
      expect(out).toContain('<!DOCTYPE html>');
      expect(out).toContain('<table>');
    });

    it('all export formats return a non-empty string', () => {
      const formats: ExportFormat[] = ['json', 'csv', 'ascii', 'tmx', 'html'];
      for (const fmt of formats) {
        expect(engine.export(map, fmt).length).toBeGreaterThan(0);
      }
    });
  });
});
