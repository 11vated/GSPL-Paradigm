import { describe, it, expect } from 'vitest';
import { WorldGenerator } from './index.js';

describe('WorldGenerator', () => {
  const gen = new WorldGenerator();

  it('produces deterministic worlds from same seed', () => {
    const world1 = gen.generate('test-world-42');
    const world2 = gen.generate('test-world-42');
    expect(world1.narrative.worldName).toBe(world2.narrative.worldName);
    expect(world1.biome).toBe(world2.biome);
    expect(world1.zones.length).toBe(world2.zones.length);
    expect(world1.npcs.length).toBe(world2.npcs.length);
  });

  it('different seeds produce different worlds', () => {
    const world1 = gen.generate('seed-a');
    const world2 = gen.generate('seed-b');
    // Very unlikely to match (possible but improbable)
    const same = world1.narrative.worldName === world2.narrative.worldName && world1.biome === world2.biome;
    expect(same).toBe(false);
  });

  it('generates 2-5 zones', () => {
    const world = gen.generate('zone-test');
    expect(world.zones.length).toBeGreaterThanOrEqual(2);
    expect(world.zones.length).toBeLessThanOrEqual(5);
  });

  it('generates 3-8 NPCs', () => {
    const world = gen.generate('npc-test');
    expect(world.npcs.length).toBeGreaterThanOrEqual(3);
    expect(world.npcs.length).toBeLessThanOrEqual(8);
  });

  it('NPCs are assigned to valid zones', () => {
    const world = gen.generate('npc-zone-test');
    for (const npc of world.npcs) {
      expect(npc.zoneIndex).toBeGreaterThanOrEqual(0);
      expect(npc.zoneIndex).toBeLessThan(world.zones.length);
    }
  });

  it('narrative has world name and mystery', () => {
    const world = gen.generate('narrative-test');
    expect(world.narrative.worldName).toContain('The');
    expect(world.narrative.mysteryName).toContain('The');
    expect(world.narrative.acts.length).toBe(5);
    expect(world.narrative.clues.length).toBeGreaterThanOrEqual(3);
  });

  it('zones have increasing difficulty', () => {
    const world = gen.generate('difficulty-test');
    if (world.zones.length >= 2) {
      const first = world.zones[0]!;
      const last = world.zones[world.zones.length - 1]!;
      expect(last.difficulty).toBeGreaterThan(first.difficulty);
    }
  });

  it('world seed has correct domain', () => {
    const world = gen.generate('domain-test');
    expect(world.seed.$domain).toBe('ecosystem');
    expect(world.seed.$gst).toBe('4.0');
  });

  it('biome maps to field config', () => {
    const world = gen.generate('field-test');
    expect(world.fieldConfig.dominantField).toBeDefined();
    expect(world.fieldConfig.intensity).toBeGreaterThan(0);
  });
});
