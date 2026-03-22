/**
 * End-to-end integration test for the GSPL Paradigm pipeline.
 *
 * Exercises: seed creation -> mutation -> breeding -> evolution ->
 * forge -> export -> persist -> reload -> determinism verification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSeed, mutateSeed, breedSeeds } from '@paradigm/seed';
import { DeterministicRNG } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import { EvolutionEngine } from '@paradigm/evolution';
import { Forge } from '@paradigm/forge';
import { StoreEngine, MemoryAdapter, ImportExport } from '@paradigm/store';
import type { UniversalSeed, Gene, GeneMap } from '@paradigm/types';

/** Helper: create a warrior seed with known genes. */
function createWarriorSeed(rng: DeterministicRNG): UniversalSeed {
  return createSeed(
    'Test Warrior',
    'organism',
    {
      health: { type: 'scalar', value: 100, min: 0, max: 200 },
      attack: { type: 'scalar', value: 25, min: 0, max: 100 },
      defense: { type: 'scalar', value: 15, min: 0, max: 100 },
      speed: { type: 'scalar', value: 40, min: 0, max: 100 },
      role: { type: 'categorical', value: 'warrior', options: ['warrior', 'mage', 'rogue', 'healer'] },
      position: { type: 'vector', value: [0, 0, 0], dimensions: 3 },
      color: { type: 'vector', value: [0.8, 0.2, 0.1], dimensions: 3 },
    },
    rng,
  );
}

describe('E2E Pipeline', () => {
  let rng: DeterministicRNG;
  let bus: EventBus;
  let store: StoreEngine;

  beforeEach(() => {
    rng = new DeterministicRNG(42);
    bus = new EventBus();
    store = new StoreEngine({ adapter: new MemoryAdapter(), eventBus: bus });
  });

  it('creates a seed with valid structure', () => {
    const seed = createWarriorSeed(rng);

    expect(seed.$gst).toBe('4.0');
    expect(seed.$domain).toBe('organism');
    expect(seed.$name).toBe('Test Warrior');
    expect(seed.$hash).toBeTruthy();
    expect(seed.genes.health).toBeDefined();
    expect(seed.genes.health!.type).toBe('scalar');
    expect((seed.genes.health as Extract<Gene, { type: 'scalar' }>).value).toBe(100);
  });

  it('mutates a seed producing a different hash', () => {
    const original = createWarriorSeed(rng);
    const mutated = mutateSeed(original, 0.5, rng);

    expect(mutated.$hash).not.toBe(original.$hash);
    expect(mutated.$lineage.parents.length).toBeGreaterThan(0);
    expect(mutated.$lineage.generation).toBe(original.$lineage.generation + 1);
  });

  it('breeds two seeds producing offspring', () => {
    const parentA = createWarriorSeed(rng);
    const rng2 = new DeterministicRNG(99);
    const parentB = createSeed(
      'Test Mage',
      'organism',
      {
        health: { type: 'scalar', value: 60, min: 0, max: 200 },
        attack: { type: 'scalar', value: 50, min: 0, max: 100 },
        defense: { type: 'scalar', value: 5, min: 0, max: 100 },
        speed: { type: 'scalar', value: 30, min: 0, max: 100 },
        role: { type: 'categorical', value: 'mage', options: ['warrior', 'mage', 'rogue', 'healer'] },
        position: { type: 'vector', value: [10, 5, 0], dimensions: 3 },
        color: { type: 'vector', value: [0.1, 0.3, 0.9], dimensions: 3 },
      },
      rng2,
    );

    const offspring = breedSeeds(parentA, parentB, 'uniform', 0.5, rng);

    expect(offspring.$hash).not.toBe(parentA.$hash);
    expect(offspring.$hash).not.toBe(parentB.$hash);
    expect(offspring.$lineage.parents.length).toBe(2);
    expect(offspring.$lineage.generation).toBeGreaterThan(0);
  });

  it('runs evolution for multiple generations', () => {
    const template = createWarriorSeed(rng);

    const engine = new EvolutionEngine({
      populationSize: 8,
      generations: 5,
      mutationRate: 0.3,
      selectionStrategy: 'tournament',
    }, rng);

    const fitnessFunction = (seed: UniversalSeed) => {
      const atk = seed.genes.attack;
      const def = seed.genes.defense;
      const a = atk?.type === 'scalar' ? atk.value : 0;
      const d = def?.type === 'scalar' ? def.value : 0;
      return (a + d) / 200;
    };

    const result = engine.run(template, fitnessFunction);

    expect(result.stats.length).toBe(5);
    expect(result.population.length).toBe(8);
    expect(result.best).toBeDefined();
    expect(result.stats[0]!.bestFitness).toBeGreaterThanOrEqual(0);
  });

  it('forges an HTML game artifact from a seed', () => {
    const seed = createWarriorSeed(rng);
    const forge = new Forge(rng);

    const artifact = forge.forge(seed, { type: 'html_game' });

    expect(artifact.type).toBe('html_game');
    expect(artifact.mimeType).toContain('html');
    expect(artifact.content).toContain('<!DOCTYPE html>');
    expect(artifact.content).toContain(seed.$name);
    expect(artifact.size).toBeGreaterThan(100);
  });

  it('forges multiple artifact types from a single seed', () => {
    const seed = createWarriorSeed(rng);
    const forge = new Forge(rng);

    const artifacts = forge.forgeAll(seed, ['html_page', 'character_sheet', 'source_code', 'logo']);

    expect(artifacts.length).toBeGreaterThanOrEqual(3);
    const types = artifacts.map(a => a.type);
    expect(types).toContain('html_page');
    expect(types).toContain('character_sheet');
  });

  it('exports seeds to JSON and reimports them', () => {
    const seed = createWarriorSeed(rng);
    const ie = new ImportExport();

    const json = ie.exportSeeds([seed], 'json');
    const reimported = ie.importSeeds(json, 'json');

    expect(reimported.length).toBe(1);
    expect(reimported[0]!.$hash).toBe(seed.$hash);
    expect(reimported[0]!.$name).toBe(seed.$name);
    expect(reimported[0]!.$domain).toBe(seed.$domain);
  });

  it('exports seeds to GSPL format and reimports them', () => {
    const seed = createWarriorSeed(rng);
    const ie = new ImportExport();

    const gspl = ie.exportSeeds([seed], 'gspl');
    expect(gspl).toContain('seed "Test Warrior" organism');

    const reimported = ie.importSeeds(gspl, 'gspl');
    expect(reimported.length).toBe(1);
    expect(reimported[0]!.$name).toBe('Test Warrior');
    expect(reimported[0]!.$domain).toBe('organism');
  });

  it('persists seeds to store and retrieves them', () => {
    const seed = createWarriorSeed(rng);

    store.seeds.save(seed);
    expect(store.seeds.count()).toBe(1);

    const retrieved = store.seeds.get(seed.$hash);
    expect(retrieved).toBeDefined();
    expect(retrieved!.$hash).toBe(seed.$hash);
    expect(retrieved!.$name).toBe(seed.$name);
    expect(retrieved!.genes.health!.type).toBe('scalar');
  });

  it('records evolution logs and retrieves them', () => {
    store.evolution.record({
      runId: 'test-run',
      generation: 0,
      bestFitness: 0.3,
      avgFitness: 0.2,
      populationSize: 8,
      timestamp: Date.now(),
    });
    store.evolution.record({
      runId: 'test-run',
      generation: 1,
      bestFitness: 0.5,
      avgFitness: 0.35,
      populationSize: 8,
      timestamp: Date.now(),
    });

    const log = store.evolution.getLog('test-run');
    expect(log.length).toBe(2);
    expect(log[1]!.bestFitness).toBe(0.5);

    const latest = store.evolution.getLatestEntry('test-run');
    expect(latest!.generation).toBe(1);
  });

  it('produces deterministic output from same RNG seed', () => {
    const rng1 = new DeterministicRNG(42);
    const rng2 = new DeterministicRNG(42);

    const seed1 = createWarriorSeed(rng1);
    const seed2 = createWarriorSeed(rng2);

    expect(seed1.$hash).toBe(seed2.$hash);

    const forge1 = new Forge(new DeterministicRNG(42));
    const forge2 = new Forge(new DeterministicRNG(42));

    const art1 = forge1.forge(seed1, { type: 'html_page' });
    const art2 = forge2.forge(seed2, { type: 'html_page' });

    expect(art1.content).toBe(art2.content);
  });

  it('full pipeline: create -> mutate -> evolve -> forge -> persist -> reload', () => {
    // 1. Create initial seed
    const original = createWarriorSeed(rng);
    store.seeds.save(original);

    // 2. Mutate
    const mutated = mutateSeed(original, 0.3, rng);
    store.seeds.save(mutated);

    // 3. Evolve
    const engine = new EvolutionEngine({
      populationSize: 6,
      generations: 3,
      mutationRate: 0.2,
      selectionStrategy: 'tournament',
    }, rng);

    const fitnessFunction = (seed: UniversalSeed) => {
      const atk = seed.genes.attack;
      const def = seed.genes.defense;
      const a = atk?.type === 'scalar' ? atk.value : 0;
      const d = def?.type === 'scalar' ? def.value : 0;
      return (a + d) / 200;
    };

    const result = engine.run(original, fitnessFunction);
    const champion = result.best;

    // 4. Forge artifact from champion
    const forge = new Forge(rng);
    const artifact = forge.forge(champion, { type: 'html_game' });
    expect(artifact.content.length).toBeGreaterThan(0);

    // 5. Persist champion
    store.seeds.save(champion);

    // 6. Reload from store
    const reloaded = store.seeds.get(champion.$hash);
    expect(reloaded).toBeDefined();
    expect(reloaded!.$hash).toBe(champion.$hash);

    // 7. Verify store has seeds
    expect(store.seeds.count()).toBeGreaterThanOrEqual(3);

    // 8. Log evolution
    for (const gen of result.stats) {
      store.evolution.record({
        runId: 'e2e-test',
        generation: gen.generation,
        bestFitness: gen.bestFitness,
        avgFitness: gen.avgFitness,
        populationSize: gen.populationSize,
        timestamp: Date.now(),
      });
    }
    expect(store.evolution.getLog('e2e-test').length).toBe(3);
  });
});
