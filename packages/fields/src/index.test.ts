import { describe, it, expect } from 'vitest';
import { FieldGrid, FieldEffectEngine, FIELD_TYPES } from './index.js';

describe('FieldGrid', () => {
  it('emits and samples field intensity', () => {
    const grid = new FieldGrid(16, 16, 1.0);
    grid.emit({ x: 0, z: 0, type: 'heat', intensity: 0.8, radius: 3 });
    const sample = grid.sample(0, 0, 'heat');
    expect(sample).toBeGreaterThan(0.5);
  });

  it('intensity falls off with distance', () => {
    const grid = new FieldGrid(16, 16, 1.0);
    grid.emit({ x: 0, z: 0, type: 'electric', intensity: 1.0, radius: 5 });
    const center = grid.sample(0, 0, 'electric');
    const edge = grid.sample(3, 0, 'electric');
    expect(center).toBeGreaterThan(edge);
  });

  it('decay reduces intensity', () => {
    const grid = new FieldGrid(16, 16, 1.0);
    grid.emit({ x: 0, z: 0, type: 'magic', intensity: 1.0, radius: 2 });
    const before = grid.sample(0, 0, 'magic');
    grid.decay(1.0, 0.5);
    const after = grid.sample(0, 0, 'magic');
    expect(after).toBeLessThan(before);
  });

  it('clear zeroes all fields', () => {
    const grid = new FieldGrid(8, 8, 1.0);
    grid.emit({ x: 0, z: 0, type: 'heat', intensity: 1.0, radius: 4 });
    expect(grid.getActiveCellCount()).toBeGreaterThan(0);
    grid.clear();
    expect(grid.getActiveCellCount()).toBe(0);
  });

  it('toFloat32Array returns correct size', () => {
    const grid = new FieldGrid(8, 8, 1.0);
    const arr = grid.toFloat32Array();
    expect(arr.length).toBe(8 * 8 * 4);
  });

  it('samples zero outside grid bounds', () => {
    const grid = new FieldGrid(8, 8, 1.0);
    grid.emit({ x: 0, z: 0, type: 'heat', intensity: 1.0, radius: 2 });
    expect(grid.sample(100, 100, 'heat')).toBe(0);
  });
});

describe('FieldEffectEngine', () => {
  it('triggers mutation after sustained exposure', () => {
    const grid = new FieldGrid(16, 16, 1.0);
    grid.emit({ x: 0, z: 0, type: 'heat', intensity: 0.8, radius: 3 });

    const engine = new FieldEffectEngine({ exposureThreshold: 0.3 });

    // First 9 ticks: no mutation yet
    for (let i = 0; i < 9; i++) {
      const mutations = engine.checkExposure('entity_1', 0, 0, grid);
      expect(mutations.length).toBe(0);
    }

    // 10th tick: mutation triggered
    const mutations = engine.checkExposure('entity_1', 0, 0, grid);
    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations[0]!.fieldType).toBe('heat');
  });

  it('resets counter when below threshold', () => {
    const grid = new FieldGrid(16, 16, 1.0);
    const engine = new FieldEffectEngine({ exposureThreshold: 0.5 });

    // Emit weak field (below threshold)
    grid.emit({ x: 0, z: 0, type: 'cold', intensity: 0.2, radius: 2 });

    for (let i = 0; i < 15; i++) {
      const mutations = engine.checkExposure('entity_2', 0, 0, grid);
      expect(mutations.length).toBe(0);
    }
  });
});
