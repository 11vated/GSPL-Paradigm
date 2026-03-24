/**
 * @paradigm/fields — Environmental field system.
 *
 * Spatial grid of environmental pressures (heat, cold, electricity, etc.)
 * that affect entity evolution and behavior. Fields decay over time and
 * can trigger targeted gene mutations on exposed entities.
 *
 * @packageDocumentation
 */

import { DeterministicRNG } from '@paradigm/rng';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type FieldType =
  | 'heat' | 'cold' | 'electric' | 'gravity' | 'magic'
  | 'poison' | 'light' | 'dark' | 'nature' | 'void'
  | 'aura' | 'chaos' | 'time' | 'radiation' | 'spatial';

export const FIELD_TYPES: readonly FieldType[] = [
  'heat', 'cold', 'electric', 'gravity', 'magic',
  'poison', 'light', 'dark', 'nature', 'void',
  'aura', 'chaos', 'time', 'radiation', 'spatial',
];

export interface FieldEmission {
  readonly x: number;
  readonly z: number;
  readonly type: FieldType;
  readonly intensity: number;
  readonly radius: number;
}

// ═══════════════════════════════════════════════════════════════════
// FieldGrid — 2D spatial grid of environmental intensities
// ═══════════════════════════════════════════════════════════════════

/**
 * 2D grid storing environmental field intensities.
 * Each cell holds intensity values [0,1] for each field type.
 * Supports radial emission with falloff, decay over time,
 * and GPU-friendly Float32Array export.
 */
export class FieldGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  private readonly cells: Float32Array;
  private readonly fieldCount = FIELD_TYPES.length;

  constructor(width: number = 32, height: number = 32, cellSize: number = 1.0) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cells = new Float32Array(width * height * this.fieldCount);
  }

  /** Get field intensity at a world position. */
  sample(worldX: number, worldZ: number, type: FieldType): number {
    const cx = Math.floor((worldX + this.width * this.cellSize / 2) / this.cellSize);
    const cz = Math.floor((worldZ + this.height * this.cellSize / 2) / this.cellSize);
    if (cx < 0 || cx >= this.width || cz < 0 || cz >= this.height) return 0;
    const fieldIndex = FIELD_TYPES.indexOf(type);
    if (fieldIndex < 0) return 0;
    return this.cells[(cz * this.width + cx) * this.fieldCount + fieldIndex] ?? 0;
  }

  /** Emit a field at a world position with radial falloff. */
  emit(emission: FieldEmission): void {
    const fieldIndex = FIELD_TYPES.indexOf(emission.type);
    if (fieldIndex < 0) return;

    const halfW = this.width * this.cellSize / 2;
    const halfH = this.height * this.cellSize / 2;
    const radiusCells = Math.ceil(emission.radius / this.cellSize);

    const centerCx = Math.floor((emission.x + halfW) / this.cellSize);
    const centerCz = Math.floor((emission.z + halfH) / this.cellSize);

    for (let dz = -radiusCells; dz <= radiusCells; dz++) {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        if (cx < 0 || cx >= this.width || cz < 0 || cz >= this.height) continue;

        const dist = Math.sqrt(dx * dx + dz * dz) * this.cellSize;
        if (dist > emission.radius) continue;

        const falloff = 1.0 - dist / emission.radius;
        const idx = (cz * this.width + cx) * this.fieldCount + fieldIndex;
        this.cells[idx] = Math.min(1.0, (this.cells[idx] ?? 0) + emission.intensity * falloff);
      }
    }
  }

  /** Decay all field values by rate per second. */
  decay(dt: number, decayRate: number = 0.5): void {
    const factor = Math.pow(1.0 - decayRate, dt);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i]! *= factor;
      if (this.cells[i]! < 0.001) this.cells[i] = 0;
    }
  }

  /** Export as Float32Array for GPU upload (RGBA per cell: R=type0, G=type1, B=type2, A=maxIntensity). */
  toFloat32Array(): Float32Array {
    const rgba = new Float32Array(this.width * this.height * 4);
    for (let i = 0; i < this.width * this.height; i++) {
      const base = i * this.fieldCount;
      let maxIntensity = 0;
      let maxR = 0, maxG = 0, maxB = 0;

      // Find dominant field for visualization
      for (let f = 0; f < this.fieldCount; f++) {
        const val = this.cells[base + f] ?? 0;
        if (val > maxIntensity) {
          maxIntensity = val;
          const color = FIELD_COLORS[FIELD_TYPES[f]!]!;
          maxR = color[0]; maxG = color[1]; maxB = color[2];
        }
      }

      rgba[i * 4] = maxR * maxIntensity;
      rgba[i * 4 + 1] = maxG * maxIntensity;
      rgba[i * 4 + 2] = maxB * maxIntensity;
      rgba[i * 4 + 3] = maxIntensity;
    }
    return rgba;
  }

  /** Clear all fields. */
  clear(): void {
    this.cells.fill(0);
  }

  /** Get total active cells (intensity > threshold). */
  getActiveCellCount(threshold: number = 0.01): number {
    let count = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if ((this.cells[i] ?? 0) > threshold) count++;
    }
    return count;
  }
}

/** RGB colors for each field type (used in GPU visualization). */
const FIELD_COLORS: Record<FieldType, readonly [number, number, number]> = {
  heat: [1.0, 0.3, 0.0], cold: [0.2, 0.6, 1.0], electric: [1.0, 1.0, 0.2],
  gravity: [0.5, 0.0, 0.8], magic: [0.8, 0.2, 1.0], poison: [0.2, 1.0, 0.1],
  light: [1.0, 0.95, 0.7], dark: [0.1, 0.0, 0.2], nature: [0.1, 0.7, 0.2],
  void: [0.0, 0.0, 0.0], aura: [0.6, 0.4, 1.0], chaos: [1.0, 0.0, 0.5],
  time: [0.0, 0.8, 0.8], radiation: [0.5, 1.0, 0.0], spatial: [0.3, 0.3, 0.8],
};

// ═══════════════════════════════════════════════════════════════════
// FieldEffectEngine — Maps field exposure to gene mutations
// ═══════════════════════════════════════════════════════════════════

/** Describes a gene mutation triggered by field exposure. */
export interface FieldMutation {
  readonly geneKey: string;
  readonly subKey?: string;
  readonly delta: number;
  readonly fieldType: FieldType;
}

/**
 * Maps environmental field exposure to targeted gene mutations.
 * Seeds in high-heat zones develop fire resistance. Seeds in cold zones gain ice affinity.
 * Exposure must exceed threshold for N ticks before triggering mutation.
 */
export class FieldEffectEngine {
  private readonly exposureThreshold: number;
  private readonly exposureTicks: Map<string, Map<FieldType, number>> = new Map();

  constructor(options?: { exposureThreshold?: number }) {
    this.exposureThreshold = options?.exposureThreshold ?? 0.3;
  }

  /**
   * Check field exposure for an entity at a position.
   * Returns mutations to apply if exposure exceeds threshold for enough ticks.
   */
  checkExposure(
    entityId: string,
    worldX: number,
    worldZ: number,
    grid: FieldGrid,
  ): FieldMutation[] {
    const mutations: FieldMutation[] = [];

    // Track exposure ticks per entity per field
    if (!this.exposureTicks.has(entityId)) {
      this.exposureTicks.set(entityId, new Map());
    }
    const entityExposure = this.exposureTicks.get(entityId)!;

    for (const fieldType of FIELD_TYPES) {
      const intensity = grid.sample(worldX, worldZ, fieldType);

      if (intensity > this.exposureThreshold) {
        const currentTicks = entityExposure.get(fieldType) ?? 0;
        entityExposure.set(fieldType, currentTicks + 1);

        // Trigger mutation after 10 ticks of sustained exposure
        if (currentTicks + 1 >= 10) {
          const fieldMutations = FIELD_MUTATION_MAP[fieldType];
          if (fieldMutations) {
            for (const mut of fieldMutations) {
              mutations.push({ ...mut, delta: mut.delta * intensity });
            }
          }
          entityExposure.set(fieldType, 0); // Reset after triggering
        }
      } else {
        // Reset exposure counter if below threshold
        entityExposure.delete(fieldType);
      }
    }

    return mutations;
  }

  /** Clear all exposure tracking. */
  reset(): void {
    this.exposureTicks.clear();
  }
}

/** Maps field types to gene mutations they trigger. */
const FIELD_MUTATION_MAP: Partial<Record<FieldType, FieldMutation[]>> = {
  heat: [
    { geneKey: 'surface', subKey: 'emission', delta: 0.1, fieldType: 'heat' },
    { geneKey: 'surface', subKey: 'roughness', delta: -0.05, fieldType: 'heat' },
  ],
  cold: [
    { geneKey: 'surface', subKey: 'roughness', delta: -0.1, fieldType: 'cold' },
    { geneKey: 'surface', subKey: 'metallic', delta: 0.05, fieldType: 'cold' },
  ],
  electric: [
    { geneKey: 'motion', subKey: 'idleSpeed', delta: 0.3, fieldType: 'electric' },
    { geneKey: 'surface', subKey: 'emission', delta: 0.15, fieldType: 'electric' },
  ],
  magic: [
    { geneKey: 'surface', subKey: 'emission', delta: 0.2, fieldType: 'magic' },
  ],
  poison: [
    { geneKey: 'surface', subKey: 'emission', delta: 0.1, fieldType: 'poison' },
  ],
  nature: [
    { geneKey: 'bodyParams', subKey: 'torsoHeight', delta: 0.02, fieldType: 'nature' },
  ],
  gravity: [
    { geneKey: 'bodyParams', subKey: 'torsoWidth', delta: 0.01, fieldType: 'gravity' },
    { geneKey: 'bodyParams', subKey: 'limbThickness', delta: 0.005, fieldType: 'gravity' },
  ],
};
