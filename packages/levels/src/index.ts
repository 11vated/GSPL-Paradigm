import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ---------------------------------------------------------------------------
// TileType enum
// ---------------------------------------------------------------------------

export enum TileType {
  Empty   = 0,
  Floor   = 1,
  Wall    = 2,
  Water   = 3,
  Lava    = 4,
  Door    = 5,
  Stairs  = 6,
  Chest   = 7,
  Spawn   = 8,
  Exit    = 9,
  Grass   = 10,
  Sand    = 11,
  Stone   = 12,
  Tree    = 13,
  Bridge  = 14,
}

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

export interface TileMap {
  width: number;
  height: number;
  tiles: TileType[][];
  metadata?: Record<string, unknown>;
}

export interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  id: number;
}

export interface Corridor {
  from: Room;
  to: Room;
  points: Array<{ x: number; y: number }>;
}

export type Biome = 'plains' | 'forest' | 'desert' | 'tundra' | 'swamp' | 'mountain' | 'ocean' | 'volcanic';

export interface BiomeConfig {
  biome: Biome;
  primaryTile: TileType;
  secondaryTile: TileType;
  density: number;
  waterLevel: number;
}

export interface HeightMap {
  width: number;
  height: number;
  data: number[][];
}

export interface AdjacencyRule {
  tile: TileType;
  neighbors: {
    up?: TileType[];
    down?: TileType[];
    left?: TileType[];
    right?: TileType[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Allocate a 2-D array filled with a constant value. */
function makeGrid<T>(width: number, height: number, fill: T): T[][] {
  const rows: T[][] = [];
  for (let y = 0; y < height; y++) {
    const row: T[] = [];
    for (let x = 0; x < width; x++) {
      row.push(fill);
    }
    rows.push(row);
  }
  return rows;
}

/** Clamp a number between min and max (inclusive). */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Smoothstep interpolation (Ken Perlin's improved version). */
function smoothstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Distance between two rooms (center to center). */
function roomDistance(a: Room, b: Room): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// ---------------------------------------------------------------------------
// NoiseGenerator
// ---------------------------------------------------------------------------

/**
 * Value-noise generator that uses a seeded RNG for gradient table
 * initialisation and smoothstep interpolation for smooth results.
 */
export class NoiseGenerator {
  private readonly perm: Uint8Array;

  constructor(private readonly rng: DeterministicRNG) {
    // Build a 512-element permutation table for fast lattice lookups.
    this.perm = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    // Fisher-Yates shuffle driven by the seeded RNG.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = base[i];
      base[i] = base[j] as number;
      base[j] = tmp as number;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = base[i & 255] as number;
    }
  }

  /**
   * Value noise in the range [0, 1] at continuous coordinates (x, y).
   * Uses bilinear interpolation with smoothstep blending.
   */
  noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = smoothstep(xf);
    const v = smoothstep(yf);

    const aa = this.perm[(this.perm[xi]     as number) + yi]     as number;
    const ab = this.perm[(this.perm[xi]     as number) + yi + 1] as number;
    const ba = this.perm[(this.perm[xi + 1] as number) + yi]     as number;
    const bb = this.perm[(this.perm[xi + 1] as number) + yi + 1] as number;

    const x1 = lerp(aa / 255, ba / 255, u);
    const x2 = lerp(ab / 255, bb / 255, u);
    return lerp(x1, x2, v);
  }

  /**
   * Fractal Brownian Motion — sums `octaves` noise layers with decreasing
   * amplitude (controlled by `persistence`, default 0.5).
   */
  octaveNoise2D(x: number, y: number, octaves: number, persistence = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }

  /** Generate a HeightMap of dimensions (width × height). */
  generateHeightMap(width: number, height: number, scale = 0.05, octaves = 4): HeightMap {
    const data: number[][] = makeGrid(width, height, 0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        (data[y] as number[])[x] = this.octaveNoise2D(x * scale, y * scale, octaves);
      }
    }
    return { width, height, data };
  }
}

// ---------------------------------------------------------------------------
// CellularAutomata
// ---------------------------------------------------------------------------

/**
 * Classic cave generation via cellular automata.
 * A random fill percentage is smoothed over multiple iterations so that
 * isolated walls coalesce into organic cave passages.
 */
export class CellularAutomata {
  constructor(private readonly rng: DeterministicRNG) {}

  /**
   * Generate a cave TileMap.
   * @param width - tile columns
   * @param height - tile rows
   * @param fillPercent - initial wall probability 0-100 (default 45)
   * @param iterations - smoothing passes (default 5)
   */
  generate(width: number, height: number, fillPercent = 45, iterations = 5): TileMap {
    // Initial random fill.
    let tiles: TileType[][] = makeGrid(width, height, TileType.Empty);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          (tiles[y] as TileType[])[x] = TileType.Wall;
        } else {
          (tiles[y] as TileType[])[x] =
            this.rng.next() * 100 < fillPercent ? TileType.Wall : TileType.Floor;
        }
      }
    }

    // Smoothing iterations.
    for (let i = 0; i < iterations; i++) {
      tiles = this.step(tiles, width, height);
    }

    return { width, height, tiles };
  }

  /**
   * Execute one cellular-automata smoothing pass.
   * A cell becomes (or stays) a wall when it has 5 or more wall neighbours.
   */
  step(tiles: TileType[][], width: number, height: number): TileType[][] {
    const next: TileType[][] = makeGrid(width, height, TileType.Empty);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          (next[y] as TileType[])[x] = TileType.Wall;
        } else {
          const walls = this.countNeighbors(tiles, x, y, TileType.Wall);
          (next[y] as TileType[])[x] = walls >= 5 ? TileType.Wall : TileType.Floor;
        }
      }
    }
    return next;
  }

  /** Count 8-directional neighbours of a given type. */
  countNeighbors(tiles: TileType[][], x: number, y: number, type: TileType): number {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        const row = tiles[ny];
        if (row === undefined) {
          count++;
        } else {
          const cell = row[nx];
          if (cell === undefined || cell === type) count++;
        }
      }
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// DungeonGenerator
// ---------------------------------------------------------------------------

/**
 * Classic room-and-corridor dungeon generator.
 * Rooms are placed with overlap rejection; corridors are L-shaped and sorted
 * by inter-room distance so the shortest connections are carved first.
 */
export class DungeonGenerator {
  constructor(private readonly rng: DeterministicRNG) {}

  /** Generate a dungeon TileMap. */
  generate(width: number, height: number, roomCount = 8): TileMap {
    const tiles: TileType[][] = makeGrid(width, height, TileType.Wall);
    const rooms = this.placeRooms(tiles, width, height, roomCount);
    const corridors = this.connectRooms(rooms);

    for (const room of rooms) {
      this.carveRoom(tiles, room);
    }
    for (const corridor of corridors) {
      this.carveCorridor(tiles, corridor);
    }
    this.placeDoors(tiles, rooms, corridors);
    this.placeSpawnAndExit(tiles, rooms);

    return { width, height, tiles, metadata: { rooms, corridors } };
  }

  /** Attempt to place `count` non-overlapping rooms. */
  placeRooms(
    _tiles: TileType[][],
    width: number,
    height: number,
    count: number,
    minSize = 4,
    maxSize = 10,
  ): Room[] {
    const rooms: Room[] = [];
    const maxAttempts = count * 20;

    for (let attempt = 0; attempt < maxAttempts && rooms.length < count; attempt++) {
      const rw = minSize + Math.floor(this.rng.next() * (maxSize - minSize + 1));
      const rh = minSize + Math.floor(this.rng.next() * (maxSize - minSize + 1));
      const rx = 1 + Math.floor(this.rng.next() * (width  - rw - 2));
      const ry = 1 + Math.floor(this.rng.next() * (height - rh - 2));

      const candidate: Room = { x: rx, y: ry, width: rw, height: rh, id: rooms.length };

      const overlaps = rooms.some(
        (r) =>
          candidate.x < r.x + r.width  + 1 &&
          candidate.x + candidate.width  + 1 > r.x &&
          candidate.y < r.y + r.height + 1 &&
          candidate.y + candidate.height + 1 > r.y,
      );

      if (!overlaps) rooms.push(candidate);
    }

    return rooms;
  }

  /** Connect rooms with L-shaped corridors, nearest-first. */
  connectRooms(rooms: Room[]): Corridor[] {
    if (rooms.length < 2) return [];

    // Sort pairs by distance — greedy nearest-neighbour spanning.
    const connected = new Set<number>([0]);
    const corridors: Corridor[] = [];

    while (connected.size < rooms.length) {
      let bestDist = Infinity;
      let bestFrom: Room | undefined;
      let bestTo: Room | undefined;

      for (const fromId of connected) {
        const from = rooms[fromId] as Room;
        for (let toId = 0; toId < rooms.length; toId++) {
          if (connected.has(toId)) continue;
          const to = rooms[toId] as Room;
          const dist = roomDistance(from, to);
          if (dist < bestDist) {
            bestDist = dist;
            bestFrom = from;
            bestTo = to;
          }
        }
      }

      if (bestFrom === undefined || bestTo === undefined) break;

      connected.add(bestTo.id);
      corridors.push(this.buildCorridor(bestFrom, bestTo));
    }

    return corridors;
  }

  private buildCorridor(from: Room, to: Room): Corridor {
    const fx = from.x + Math.floor(from.width  / 2);
    const fy = from.y + Math.floor(from.height / 2);
    const tx = to.x   + Math.floor(to.width    / 2);
    const ty = to.y   + Math.floor(to.height   / 2);

    const points: Array<{ x: number; y: number }> = [];

    // Horizontal then vertical (L-shaped).
    const stepX = fx < tx ? 1 : -1;
    for (let x = fx; x !== tx; x += stepX) points.push({ x, y: fy });
    const stepY = fy < ty ? 1 : -1;
    for (let y = fy; y !== ty + stepY; y += stepY) points.push({ x: tx, y });

    return { from, to, points };
  }

  /** Carve floor tiles into a room rectangle. */
  carveRoom(tiles: TileType[][], room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        (tiles[y] as TileType[])[x] = TileType.Floor;
      }
    }
  }

  /** Carve floor tiles along a corridor path. */
  carveCorridor(tiles: TileType[][], corridor: Corridor): void {
    for (const { x, y } of corridor.points) {
      const row = tiles[y];
      if (row !== undefined) (row as TileType[])[x] = TileType.Floor;
    }
  }

  /**
   * Place doors at room entrances — i.e. wherever a corridor point is
   * adjacent to a room boundary wall that was previously carved to Floor.
   */
  placeDoors(tiles: TileType[][], rooms: Room[], corridors: Corridor[]): void {
    for (const corridor of corridors) {
      for (const pt of [corridor.points[0], corridor.points[corridor.points.length - 1]]) {
        if (pt === undefined) continue;
        // Only place a door if we are on the edge of a room bounding box.
        const onEdge = rooms.some(
          (r) =>
            (pt.x === r.x - 1 || pt.x === r.x + r.width) &&
            pt.y >= r.y && pt.y < r.y + r.height ||
            (pt.y === r.y - 1 || pt.y === r.y + r.height) &&
            pt.x >= r.x && pt.x < r.x + r.width,
        );
        if (onEdge) {
          const row = tiles[pt.y];
          if (row !== undefined) (row as TileType[])[pt.x] = TileType.Door;
        }
      }
    }
  }

  /** Place Spawn in the first room and Exit in the last room. */
  placeSpawnAndExit(tiles: TileType[][], rooms: Room[]): void {
    if (rooms.length === 0) return;

    const first = rooms[0] as Room;
    const last  = rooms[rooms.length - 1] as Room;

    const spawnX = first.x + Math.floor(first.width  / 2);
    const spawnY = first.y + Math.floor(first.height / 2);
    (tiles[spawnY] as TileType[])[spawnX] = TileType.Spawn;

    const exitX = last.x + Math.floor(last.width  / 2);
    const exitY = last.y + Math.floor(last.height / 2);
    (tiles[exitY] as TileType[])[exitX] = TileType.Exit;
  }
}

// ---------------------------------------------------------------------------
// BSPGenerator
// ---------------------------------------------------------------------------

interface BSPRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Binary Space Partitioning dungeon generator.
 * Recursively bisects the map area then places one room inside each leaf.
 */
export class BSPGenerator {
  constructor(private readonly rng: DeterministicRNG) {}

  generate(width: number, height: number, minRoomSize = 5): TileMap {
    const tiles: TileType[][] = makeGrid(width, height, TileType.Wall);
    const root: BSPRect = { x: 0, y: 0, width, height };
    const leaves = this.split(root, 0, minRoomSize);
    const rooms = this.createRooms(tiles, leaves, minRoomSize);

    // Connect adjacent rooms with corridors.
    const dungeon = new DungeonGenerator(this.rng);
    const corridors = dungeon.connectRooms(rooms);
    for (const corridor of corridors) {
      dungeon.carveCorridor(tiles, corridor);
    }
    dungeon.placeSpawnAndExit(tiles, rooms);

    return { width, height, tiles, metadata: { rooms } };
  }

  /** Recursively split a rect, alternating horizontal/vertical cuts. */
  split(rect: BSPRect, depth: number, minSize: number): BSPRect[] {
    const maxDepth = 5;
    if (depth >= maxDepth) return [rect];

    const splitHorizontal = this.rng.next() > 0.5;

    if (splitHorizontal) {
      if (rect.height < minSize * 2 + 1) return [rect];
      const splitY = minSize + Math.floor(this.rng.next() * (rect.height - minSize * 2));
      const top:    BSPRect = { x: rect.x, y: rect.y,           width: rect.width, height: splitY };
      const bottom: BSPRect = { x: rect.x, y: rect.y + splitY,  width: rect.width, height: rect.height - splitY };
      return [...this.split(top, depth + 1, minSize), ...this.split(bottom, depth + 1, minSize)];
    } else {
      if (rect.width < minSize * 2 + 1) return [rect];
      const splitX = minSize + Math.floor(this.rng.next() * (rect.width - minSize * 2));
      const left:  BSPRect = { x: rect.x,          y: rect.y, width: splitX,              height: rect.height };
      const right: BSPRect = { x: rect.x + splitX, y: rect.y, width: rect.width - splitX, height: rect.height };
      return [...this.split(left, depth + 1, minSize), ...this.split(right, depth + 1, minSize)];
    }
  }

  /** Place one room inside each leaf rectangle, carving it into the grid. */
  createRooms(tiles: TileType[][], leaves: BSPRect[], minRoomSize: number): Room[] {
    const rooms: Room[] = [];
    const dungeon = new DungeonGenerator(this.rng);

    for (const leaf of leaves) {
      if (leaf.width < minRoomSize + 2 || leaf.height < minRoomSize + 2) continue;

      const padding = 1;
      const maxW = leaf.width  - padding * 2;
      const maxH = leaf.height - padding * 2;
      const rw = minRoomSize + Math.floor(this.rng.next() * (maxW - minRoomSize + 1));
      const rh = minRoomSize + Math.floor(this.rng.next() * (maxH - minRoomSize + 1));
      const rx = leaf.x + padding + Math.floor(this.rng.next() * (maxW - rw + 1));
      const ry = leaf.y + padding + Math.floor(this.rng.next() * (maxH - rh + 1));

      const room: Room = { x: rx, y: ry, width: rw, height: rh, id: rooms.length };
      dungeon.carveRoom(tiles, room);
      rooms.push(room);
    }

    return rooms;
  }
}

// ---------------------------------------------------------------------------
// WaveFunctionCollapse
// ---------------------------------------------------------------------------

/**
 * Minimal Wave Function Collapse implementation for tile-based maps.
 * Each cell maintains a superposition of allowed TileTypes; the algorithm
 * iteratively collapses the cell with the lowest entropy then propagates
 * constraints to neighbours.
 */
export class WaveFunctionCollapse {
  constructor(private readonly rng: DeterministicRNG) {}

  generate(width: number, height: number, rules: AdjacencyRule[]): TileMap {
    const allTiles = rules.map((r) => r.tile);

    // Each cell starts as a superposition of all tiles.
    const grid: TileType[][] = makeGrid(width, height, TileType.Empty);
    const possibilities: TileType[][][] = [];
    for (let y = 0; y < height; y++) {
      const row: TileType[][] = [];
      for (let x = 0; x < width; x++) {
        row.push([...allTiles]);
      }
      possibilities.push(row);
    }

    this.collapse(grid, possibilities, width, height, rules);

    // Fill any un-collapsed cells with Floor.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const opts = (possibilities[y] as TileType[][])[x] as TileType[];
        if (opts.length > 0) {
          (grid[y] as TileType[])[x] = opts[0] as TileType;
        }
      }
    }

    return { width, height, tiles: grid };
  }

  /** Run the collapse loop until all cells are determined or a contradiction occurs. */
  collapse(
    grid: TileType[][],
    possibilities: TileType[][][],
    width: number,
    height: number,
    rules: AdjacencyRule[],
  ): void {
    for (;;) {
      const cell = this.getLowestEntropy(possibilities, width, height);
      if (cell === null) break;

      const { x, y } = cell;
      const opts = (possibilities[y] as TileType[][])[x] as TileType[];
      if (opts.length === 0) break; // Contradiction — stop.

      // Collapse: pick one option at random.
      const chosen = opts[Math.floor(this.rng.next() * opts.length)] as TileType;
      (possibilities[y] as TileType[][])[x] = [chosen];
      (grid[y] as TileType[])[x] = chosen;

      this.propagate(possibilities, x, y, width, height, rules);
    }
  }

  /** Return coordinates of the cell with the fewest (>1) options, or null if done. */
  getLowestEntropy(
    possibilities: TileType[][][],
    width: number,
    height: number,
  ): { x: number; y: number } | null {
    let minEntropy = Infinity;
    let result: { x: number; y: number } | null = null;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const opts = (possibilities[y] as TileType[][])[x] as TileType[];
        if (opts.length > 1 && opts.length < minEntropy) {
          minEntropy = opts.length;
          result = { x, y };
        }
      }
    }

    return result;
  }

  /**
   * Propagate constraints from (x, y) to its four neighbours.
   * Removes neighbour options that violate the adjacency rules.
   */
  propagate(
    possibilities: TileType[][][],
    x: number,
    y: number,
    width: number,
    height: number,
    rules: AdjacencyRule[],
  ): void {
    const ruleMap = new Map<TileType, AdjacencyRule>();
    for (const rule of rules) ruleMap.set(rule.tile, rule);

    const stack: Array<{ x: number; y: number }> = [{ x, y }];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;

      const { x: cx, y: cy } = current;
      const currentOpts = (possibilities[cy] as TileType[][])[cx] as TileType[];

      const directions: Array<{ dx: number; dy: number; dir: 'up' | 'down' | 'left' | 'right' }> = [
        { dx:  0, dy: -1, dir: 'up'    },
        { dx:  0, dy:  1, dir: 'down'  },
        { dx: -1, dy:  0, dir: 'left'  },
        { dx:  1, dy:  0, dir: 'right' },
      ];

      for (const { dx, dy, dir } of directions) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const neighbourOpts = (possibilities[ny] as TileType[][])[nx] as TileType[];
        const before = neighbourOpts.length;

        // Compute the union of allowed neighbour tiles given current options.
        const allowed = new Set<TileType>();
        for (const tile of currentOpts) {
          const rule = ruleMap.get(tile);
          const neighbours = rule?.neighbors[dir];
          if (neighbours !== undefined) {
            for (const t of neighbours) allowed.add(t);
          }
        }

        if (allowed.size > 0) {
          const filtered = neighbourOpts.filter((t) => allowed.has(t));
          (possibilities[ny] as TileType[][])[nx] = filtered;
          if (filtered.length < before) stack.push({ x: nx, y: ny });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// BiomeMapper
// ---------------------------------------------------------------------------

const BIOME_CONFIGS: Record<Biome, BiomeConfig> = {
  plains:   { biome: 'plains',   primaryTile: TileType.Grass,  secondaryTile: TileType.Floor,  density: 0.2, waterLevel: 0.2 },
  forest:   { biome: 'forest',   primaryTile: TileType.Tree,   secondaryTile: TileType.Grass,  density: 0.6, waterLevel: 0.1 },
  desert:   { biome: 'desert',   primaryTile: TileType.Sand,   secondaryTile: TileType.Stone,  density: 0.1, waterLevel: 0.0 },
  tundra:   { biome: 'tundra',   primaryTile: TileType.Stone,  secondaryTile: TileType.Floor,  density: 0.3, waterLevel: 0.1 },
  swamp:    { biome: 'swamp',    primaryTile: TileType.Water,  secondaryTile: TileType.Grass,  density: 0.5, waterLevel: 0.6 },
  mountain: { biome: 'mountain', primaryTile: TileType.Stone,  secondaryTile: TileType.Wall,   density: 0.8, waterLevel: 0.0 },
  ocean:    { biome: 'ocean',    primaryTile: TileType.Water,  secondaryTile: TileType.Sand,   density: 0.0, waterLevel: 1.0 },
  volcanic: { biome: 'volcanic', primaryTile: TileType.Lava,   secondaryTile: TileType.Stone,  density: 0.4, waterLevel: 0.0 },
};

/**
 * Maps HeightMap values to biomes and tiles using simple thresholds.
 */
export class BiomeMapper {
  constructor(private readonly rng: DeterministicRNG) {}

  /**
   * Convert a HeightMap to a TileMap using height-based classification.
   * @param waterLevel - height threshold below which tiles become Water (default 0.3)
   */
  classify(heightMap: HeightMap, waterLevel = 0.3): TileMap {
    const tiles: TileType[][] = makeGrid(heightMap.width, heightMap.height, TileType.Empty);

    // Generate a moisture map for secondary biome differentiation.
    const noiseGen = new NoiseGenerator(this.rng);
    const moisture = noiseGen.generateHeightMap(heightMap.width, heightMap.height, 0.04, 3);

    for (let y = 0; y < heightMap.height; y++) {
      for (let x = 0; x < heightMap.width; x++) {
        const h = (heightMap.data[y] as number[])[x] as number;
        const m = (moisture.data[y] as number[])[x] as number;
        const biome = this.getBiome(h, m, waterLevel);
        (tiles[y] as TileType[])[x] = this.biomeToTile(biome);
      }
    }

    return { width: heightMap.width, height: heightMap.height, tiles };
  }

  /** Determine biome from height and moisture values (all in [0, 1]). */
  getBiome(height: number, moisture: number, waterLevel = 0.3): Biome {
    if (height < waterLevel)            return 'ocean';
    if (height < waterLevel + 0.05)     return 'swamp';
    if (height > 0.75)                  return height > 0.88 ? 'volcanic' : 'mountain';
    if (moisture < 0.25)                return 'desert';
    if (moisture < 0.45)                return height < 0.5 ? 'plains' : 'tundra';
    return 'forest';
  }

  /** Map a biome to its primary TileType. */
  biomeToTile(biome: Biome): TileType {
    return BIOME_CONFIGS[biome].primaryTile;
  }

  /** Full pipeline: generate noise -> heightmap -> classified tile world. */
  generateWorld(width: number, height: number): TileMap {
    const noiseGen = new NoiseGenerator(this.rng);
    const heightMap = noiseGen.generateHeightMap(width, height, 0.05, 5);
    return this.classify(heightMap);
  }
}

// ---------------------------------------------------------------------------
// TileMapExporter
// ---------------------------------------------------------------------------

const ASCII_MAP: Record<TileType, string> = {
  [TileType.Empty]:  ' ',
  [TileType.Floor]:  '.',
  [TileType.Wall]:   '#',
  [TileType.Water]:  '~',
  [TileType.Lava]:   '^',
  [TileType.Door]:   '+',
  [TileType.Stairs]: '>',
  [TileType.Chest]:  '$',
  [TileType.Spawn]:  '@',
  [TileType.Exit]:   'X',
  [TileType.Grass]:  ',',
  [TileType.Sand]:   ':',
  [TileType.Stone]:  '%',
  [TileType.Tree]:   'T',
  [TileType.Bridge]: '=',
};

const HTML_COLOR_MAP: Record<TileType, string> = {
  [TileType.Empty]:  '#111111',
  [TileType.Floor]:  '#c8a96e',
  [TileType.Wall]:   '#555555',
  [TileType.Water]:  '#3399ff',
  [TileType.Lava]:   '#ff4400',
  [TileType.Door]:   '#8b4513',
  [TileType.Stairs]: '#ddcc88',
  [TileType.Chest]:  '#ffd700',
  [TileType.Spawn]:  '#00ff88',
  [TileType.Exit]:   '#ff00cc',
  [TileType.Grass]:  '#44aa44',
  [TileType.Sand]:   '#e8d080',
  [TileType.Stone]:  '#888888',
  [TileType.Tree]:   '#226622',
  [TileType.Bridge]: '#aa8844',
};

/** Serialises TileMaps to various output formats. */
export class TileMapExporter {
  /** Serialise to a plain JSON string. */
  toJSON(map: TileMap): string {
    return JSON.stringify(
      {
        width: map.width,
        height: map.height,
        tiles: map.tiles,
        metadata: map.metadata ?? null,
      },
      null,
      2,
    );
  }

  /** Serialise to CSV where each row is a comma-separated list of TileType IDs. */
  toCSV(map: TileMap): string {
    return map.tiles.map((row) => row.join(',')).join('\n');
  }

  /** Serialise to a human-readable ASCII string using the ASCII_MAP lookup. */
  toASCII(map: TileMap): string {
    return map.tiles
      .map((row) => row.map((t) => ASCII_MAP[t] ?? '?').join(''))
      .join('\n');
  }

  /**
   * Serialise to Tiled-compatible TMX XML format.
   * Each tile GID equals TileType + 1 (Tiled uses 1-based GIDs; 0 = empty).
   */
  toTMX(map: TileMap): string {
    const flatData = map.tiles.flatMap((row) => row.map((t) => t + 1)).join(',');
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<map version="1.10" orientation="orthogonal" renderorder="right-down"`,
      `     width="${map.width}" height="${map.height}" tilewidth="16" tileheight="16">`,
      `  <tileset firstgid="1" name="paradigm-tiles" tilewidth="16" tileheight="16"`,
      `           tilecount="15" columns="15"/>`,
      `  <layer id="1" name="Ground" width="${map.width}" height="${map.height}">`,
      `    <data encoding="csv">`,
      flatData,
      `    </data>`,
      `  </layer>`,
      `</map>`,
    ].join('\n');
  }

  /**
   * Serialise to an HTML table where each cell is coloured according to
   * HTML_COLOR_MAP for quick visual inspection in a browser.
   */
  toHTML(map: TileMap): string {
    const cellSize = 8;
    const rows = map.tiles
      .map(
        (row) =>
          '<tr>' +
          row
            .map(
              (t) =>
                `<td style="width:${cellSize}px;height:${cellSize}px;background:${HTML_COLOR_MAP[t] ?? '#000'};"></td>`,
            )
            .join('') +
          '</tr>',
      )
      .join('\n');

    return [
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      `<title>TileMap ${map.width}x${map.height}</title>`,
      '<style>table{border-collapse:collapse;}td{padding:0;}</style>',
      '</head><body>',
      '<table>',
      rows,
      '</table>',
      '</body></html>',
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// LevelEngine
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'csv' | 'ascii' | 'tmx' | 'html';

/**
 * Facade that aggregates all level-generation algorithms behind a single,
 * ergonomic API.  An optional seeded RNG is accepted; if omitted, a fresh
 * one is constructed from a random 32-bit seed.
 */
export class LevelEngine {
  private readonly rng: DeterministicRNG;
  private readonly exporter = new TileMapExporter();

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG(Math.floor(Math.random() * 0xffffffff));
  }

  /** Create a new LevelEngine seeded deterministically from a UniversalSeed. */
  static fromSeed(seed: UniversalSeed): LevelEngine {
    // Derive a stable numeric seed by hashing the first 8 hex chars of the seed string.
    const numericSeed = parseInt(String(seed).slice(0, 8).replace(/[^0-9a-f]/gi, '0'), 16) || 1;
    return new LevelEngine(new DeterministicRNG(numericSeed));
  }

  /** Convenience wrapper — same signature as the static overload. */
  fromSeed(seed: UniversalSeed): LevelEngine {
    return LevelEngine.fromSeed(seed);
  }

  /**
   * Generate a cave using cellular automata.
   * @param fillPercent - initial wall probability 0-100 (default 45)
   */
  generateCave(width: number, height: number, fillPercent = 45): TileMap {
    return new CellularAutomata(this.rng).generate(width, height, fillPercent);
  }

  /** Generate a classic room-and-corridor dungeon. */
  generateDungeon(width: number, height: number, rooms = 8): TileMap {
    return new DungeonGenerator(this.rng).generate(width, height, rooms);
  }

  /** Generate a BSP-partitioned dungeon. */
  generateBSP(width: number, height: number): TileMap {
    return new BSPGenerator(this.rng).generate(width, height);
  }

  /** Generate an open-world tile map using biome classification. */
  generateWorld(width: number, height: number): TileMap {
    return new BiomeMapper(this.rng).generateWorld(width, height);
  }

  /** Generate a raw height map (useful for terrain analysis or custom pipelines). */
  generateHeightMap(width: number, height: number): HeightMap {
    return new NoiseGenerator(this.rng).generateHeightMap(width, height);
  }

  /** Export a TileMap to the requested string format. */
  export(map: TileMap, format: ExportFormat): string {
    switch (format) {
      case 'json':  return this.exporter.toJSON(map);
      case 'csv':   return this.exporter.toCSV(map);
      case 'ascii': return this.exporter.toASCII(map);
      case 'tmx':   return this.exporter.toTMX(map);
      case 'html':  return this.exporter.toHTML(map);
    }
  }
}
