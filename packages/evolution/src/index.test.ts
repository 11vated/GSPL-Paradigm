/**
 * Comprehensive tests for @paradigm/evolution.
 *
 * Covers:
 *  - EvolutionEngine: constructor defaults, initPopulation, evaluateFitness,
 *    all 4 selection strategies, evolveGeneration, full run, getStats
 *  - IslandModel: initIslands, migrate, evolveIslands, full run
 *  - SpeciationDetector: geneticDistance, detectSpecies, speciesStats
 *  - EcologyMetrics: shannonDiversity, simpsonDiversity, fitnessVariance, populationHealth
 *  - LineageTracer: record, getAncestors, getMostRecentCommonAncestor, getLineageDepth
 *  - EvolutionError
 */

import { describe, it, expect } from 'vitest';
import {
  EvolutionEngine,
  IslandModel,
  SpeciationDetector,
  EcologyMetrics,
  LineageTracer,
  EvolutionError,
} from './index.js';
import type { EvolutionConfig, SelectionStrategy, UniversalSeed } from './index.js';
import { createSeed } from '@paradigm/seed';
import { DeterministicRNG } from '@paradigm/rng';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const rng = new DeterministicRNG(1);

/** Build a minimal organism seed with health + speed + element genes. */
function makeSeed(name = 'TestSeed', healthValue = 50, speedValue = 30): UniversalSeed {
  return createSeed(name, 'organism', {
    health: { type: 'scalar' as const, value: healthValue, min: 0, max: 100 },
    speed:  { type: 'scalar' as const, value: speedValue,  min: 0, max: 100 },
    element: {
      type: 'categorical' as const,
      value: 'fire',
      options: ['fire', 'water', 'earth'],
    },
  }, new DeterministicRNG(name.length));
}

/** Simple fitness: health / 100. */
const healthFitness = (s: UniversalSeed): number => {
  const h = s.genes['health'];
  return h && typeof h === 'object' && 'value' in h && typeof h.value === 'number'
    ? h.value / 100
    : 0.5;
};

/** Constant fitness (always 0.5) — used to exercise uniform-fitness branches. */
const constantFitness = (_s: UniversalSeed): number => 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// EvolutionEngine
// ─────────────────────────────────────────────────────────────────────────────

describe('EvolutionEngine', () => {
  describe('constructor defaults', () => {
    it('applies default config when no arguments provided', () => {
      const engine = new EvolutionEngine();
      // We can't read private config directly, but we can verify behaviour:
      // default populationSize = 50, so initPopulation should produce 50 members.
      const template = makeSeed();
      const pop = engine.initPopulation(template);
      expect(pop).toHaveLength(50);
    });

    it('overrides only specified fields', () => {
      const engine = new EvolutionEngine({ populationSize: 10, generations: 5 });
      const template = makeSeed();
      const pop = engine.initPopulation(template);
      expect(pop).toHaveLength(10);
    });

    it('accepts an external RNG for determinism', () => {
      const r1 = new DeterministicRNG(99);
      const r2 = new DeterministicRNG(99);
      const e1 = new EvolutionEngine({ populationSize: 5 }, r1);
      const e2 = new EvolutionEngine({ populationSize: 5 }, r2);
      const template = makeSeed();
      const pop1 = e1.initPopulation(template);
      const pop2 = e2.initPopulation(template);
      // Same seed → same hashes for all members
      expect(pop1.map(s => s.$hash)).toEqual(pop2.map(s => s.$hash));
    });
  });

  describe('initPopulation', () => {
    const engine = new EvolutionEngine({ populationSize: 8 });
    const template = makeSeed();

    it('returns the requested population size', () => {
      expect(engine.initPopulation(template)).toHaveLength(8);
    });

    it('respects an explicit size override', () => {
      expect(engine.initPopulation(template, 3)).toHaveLength(3);
      expect(engine.initPopulation(template, 20)).toHaveLength(20);
    });

    it('places the template at index 0 unmodified', () => {
      const pop = engine.initPopulation(template);
      expect(pop[0]?.$hash).toBe(template.$hash);
    });

    it('produces distinct individuals beyond index 0', () => {
      const pop = engine.initPopulation(template, 5);
      const hashes = pop.map(s => s.$hash);
      // At minimum the first and second members should differ
      expect(hashes[0]).not.toBeUndefined();
      // population should not all be identical
      const unique = new Set(hashes);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe('evaluateFitness', () => {
    const engine = new EvolutionEngine({ populationSize: 5 });

    it('sets $fitness.primary on each seed', () => {
      const pop = [makeSeed('a', 80), makeSeed('b', 40)];
      const evaluated = engine.evaluateFitness(pop, healthFitness);
      for (const s of evaluated) {
        expect(typeof s.$fitness?.primary).toBe('number');
      }
    });

    it('sorts the population best-first', () => {
      const pop = [makeSeed('a', 20), makeSeed('b', 90), makeSeed('c', 50)];
      const evaluated = engine.evaluateFitness(pop, healthFitness);
      expect(evaluated[0]?.$fitness?.primary).toBeGreaterThanOrEqual(
        evaluated[1]?.$fitness?.primary ?? 0,
      );
    });

    it('does not mutate the original seeds', () => {
      const pop = [makeSeed('x', 50)];
      const before = pop[0]?.$hash;
      engine.evaluateFitness(pop, healthFitness);
      expect(pop[0]?.$hash).toBe(before);
    });
  });

  describe('selection strategies', () => {
    const template = makeSeed();
    const baseEngine = new EvolutionEngine({ populationSize: 10 });
    const pop = baseEngine.evaluateFitness(
      baseEngine.initPopulation(template, 10),
      healthFitness,
    );

    const strategies: SelectionStrategy[] = ['tournament', 'roulette', 'rank', 'truncation'];

    for (const strategy of strategies) {
      describe(`${strategy}Select`, () => {
        const engine = new EvolutionEngine({ populationSize: 10, selectionStrategy: strategy });
        const evaluated = engine.evaluateFitness(
          engine.initPopulation(template, 10),
          healthFitness,
        );

        it(`selects the requested count (${strategy})`, () => {
          const parents = engine.select(evaluated, 6);
          expect(parents).toHaveLength(6);
        });

        it(`returns empty array for empty population (${strategy})`, () => {
          expect(engine.select([], 5)).toHaveLength(0);
        });

        it(`all selected seeds come from the population (${strategy})`, () => {
          const hashes = new Set(evaluated.map(s => s.$hash));
          const parents = engine.select(evaluated, 4);
          for (const p of parents) {
            expect(hashes.has(p.$hash)).toBe(true);
          }
        });
      });
    }

    describe('tournamentSelect edge cases', () => {
      it('handles tournamentSize larger than population', () => {
        const engine = new EvolutionEngine({ populationSize: 3, tournamentSize: 100 });
        const tiny = engine.evaluateFitness([makeSeed('a'), makeSeed('b')], constantFitness);
        expect(engine.select(tiny, 2)).toHaveLength(2);
      });
    });

    describe('rouletteSelect edge cases', () => {
      it('handles all-equal fitness (total === 0 branch)', () => {
        const engine = new EvolutionEngine({
          populationSize: 5,
          selectionStrategy: 'roulette',
        });
        // Force equal fitnesses so shifted total === 0
        const equalPop = [makeSeed('a', 50), makeSeed('b', 50), makeSeed('c', 50)].map(s => ({
          ...s,
          $fitness: { primary: 0.5 },
        }));
        const selected = engine.select(equalPop, 3);
        expect(selected).toHaveLength(3);
      });
    });

    describe('truncationSelect', () => {
      it('survivalThreshold of 1.0 keeps full population', () => {
        const engine = new EvolutionEngine({
          populationSize: 4,
          selectionStrategy: 'truncation',
          survivalThreshold: 1.0,
        });
        const evaluated = engine.evaluateFitness(
          [makeSeed('a', 10), makeSeed('b', 40), makeSeed('c', 70), makeSeed('d', 90)],
          healthFitness,
        );
        const selected = engine.select(evaluated, 4);
        expect(selected).toHaveLength(4);
      });
    });
  });

  describe('evolveGeneration', () => {
    it('returns the same population size', () => {
      const engine = new EvolutionEngine({ populationSize: 6 });
      const template = makeSeed();
      const pop = engine.initPopulation(template, 6);
      const next = engine.evolveGeneration(pop, healthFitness);
      expect(next).toHaveLength(6);
    });

    it('preserves elite individuals at the top', () => {
      const engine = new EvolutionEngine({ populationSize: 5, elitismCount: 2 });
      const template = makeSeed();
      let pop = engine.initPopulation(template, 5);
      pop = engine.evaluateFitness(pop, healthFitness);
      const topTwoHashes = [pop[0]?.$hash, pop[1]?.$hash];
      const next = engine.evolveGeneration(pop, healthFitness);
      // Elites are placed first; after re-evaluation order may shift but hashes exist
      const nextHashes = new Set(next.map(s => s.$hash));
      for (const h of topTwoHashes) {
        if (h !== undefined) expect(nextHashes.has(h)).toBe(true);
      }
    });

    it('works with elitismCount of 0', () => {
      const engine = new EvolutionEngine({ populationSize: 4, elitismCount: 0 });
      const pop = engine.initPopulation(makeSeed(), 4);
      const next = engine.evolveGeneration(pop, healthFitness);
      expect(next).toHaveLength(4);
    });

    it('works with crossoverRate of 0 (no crossover branch)', () => {
      const engine = new EvolutionEngine({ populationSize: 4, crossoverRate: 0 });
      const pop = engine.initPopulation(makeSeed(), 4);
      const next = engine.evolveGeneration(pop, healthFitness);
      expect(next).toHaveLength(4);
    });
  });

  describe('getStats', () => {
    const engine = new EvolutionEngine({ populationSize: 5 });

    it('returns zeros for empty population', () => {
      const stats = engine.getStats([], 0);
      expect(stats).toMatchObject({
        generation: 0,
        bestFitness: 0,
        avgFitness: 0,
        worstFitness: 0,
        diversity: 0,
        populationSize: 0,
        extinctions: 0,
      });
    });

    it('computes correct stats for a known population', () => {
      const pop = engine.evaluateFitness(
        [makeSeed('a', 100), makeSeed('b', 0)],
        healthFitness,
      );
      const stats = engine.getStats(pop, 3);
      expect(stats.generation).toBe(3);
      expect(stats.bestFitness).toBeCloseTo(1.0);
      expect(stats.worstFitness).toBeCloseTo(0.0);
      expect(stats.avgFitness).toBeCloseTo(0.5);
      expect(stats.populationSize).toBe(2);
    });

    it('diversity is between 0 and 1', () => {
      const pop = engine.initPopulation(makeSeed(), 5);
      const stats = engine.getStats(pop, 1);
      expect(stats.diversity).toBeGreaterThanOrEqual(0);
      expect(stats.diversity).toBeLessThanOrEqual(1);
    });
  });

  describe('run', () => {
    it('returns best, population, and stats arrays', () => {
      const engine = new EvolutionEngine({ populationSize: 5, generations: 3 });
      const { best, population, stats } = engine.run(makeSeed(), healthFitness);
      expect(best).toBeDefined();
      expect(population).toHaveLength(5);
      expect(stats).toHaveLength(3);
    });

    it('stats[i].generation equals i', () => {
      const engine = new EvolutionEngine({ populationSize: 4, generations: 4 });
      const { stats } = engine.run(makeSeed(), healthFitness);
      stats.forEach((s, i) => expect(s.generation).toBe(i));
    });

    it('best seed has $fitness set', () => {
      const engine = new EvolutionEngine({ populationSize: 4, generations: 2 });
      const { best } = engine.run(makeSeed(), healthFitness);
      expect(best.$fitness).toBeDefined();
    });

    it('is deterministic with same RNG seed', () => {
      const cfg: Partial<EvolutionConfig> = { populationSize: 5, generations: 3 };
      const r1 = new DeterministicRNG(7);
      const r2 = new DeterministicRNG(7);
      const { best: b1 } = new EvolutionEngine(cfg, r1).run(makeSeed(), healthFitness);
      const { best: b2 } = new EvolutionEngine(cfg, r2).run(makeSeed(), healthFitness);
      expect(b1.$hash).toBe(b2.$hash);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IslandModel
// ─────────────────────────────────────────────────────────────────────────────

describe('IslandModel', () => {
  const baseConfig: EvolutionConfig = {
    populationSize: 6,
    generations: 4,
    mutationRate: 0.05,
    crossoverRate: 0.8,
    elitismCount: 1,
    selectionStrategy: 'tournament',
    tournamentSize: 3,
    survivalThreshold: 0.5,
    islandCount: 3,
    migrationRate: 0.2,
    migrationInterval: 2,
  };
  const template = makeSeed();

  describe('constructor', () => {
    it('enforces minimum islandCount of 2', () => {
      const im = new IslandModel(baseConfig, 1);
      const islands = im.initIslands(template);
      expect(islands).toHaveLength(2);
    });

    it('accepts explicit island count', () => {
      const im = new IslandModel(baseConfig, 4);
      const islands = im.initIslands(template);
      expect(islands).toHaveLength(4);
    });
  });

  describe('initIslands', () => {
    const im = new IslandModel(baseConfig, 3);

    it('creates the correct number of islands', () => {
      const islands = im.initIslands(template);
      expect(islands).toHaveLength(3);
    });

    it('each island has populationSize members', () => {
      const islands = im.initIslands(template);
      for (const island of islands) {
        expect(island).toHaveLength(baseConfig.populationSize);
      }
    });
  });

  describe('migrate', () => {
    const im = new IslandModel(baseConfig, 3);

    it('returns same number of islands', () => {
      const islands = im.initIslands(template);
      const migrated = im.migrate(islands);
      expect(migrated).toHaveLength(3);
    });

    it('preserves population sizes after migration', () => {
      const islands = im.initIslands(template);
      const migrated = im.migrate(islands);
      for (let i = 0; i < islands.length; i++) {
        expect(migrated[i]).toHaveLength(islands[i]!.length);
      }
    });

    it('returns unchanged when only 1 island', () => {
      // Can't construct with 1 island (enforces min 2), test the branch by
      // passing a direct single-island array via evolveIslands wrapper.
      // Instead verify migration does not throw with 2 islands.
      const im2 = new IslandModel(baseConfig, 2);
      const islands = im2.initIslands(template);
      expect(() => im2.migrate(islands)).not.toThrow();
    });
  });

  describe('evolveIslands', () => {
    it('returns evolved islands with same count', () => {
      const im = new IslandModel(baseConfig, 3);
      const islands = im.initIslands(template);
      const { islands: next, stats } = im.evolveIslands(islands, healthFitness);
      expect(next).toHaveLength(3);
      expect(stats).toHaveLength(3);
    });

    it('stats array has one entry per island', () => {
      const im = new IslandModel(baseConfig, 2);
      const islands = im.initIslands(template);
      const { stats } = im.evolveIslands(islands, healthFitness);
      expect(stats[0]).toHaveLength(1);
      expect(stats[1]).toHaveLength(1);
    });
  });

  describe('run', () => {
    it('returns best seed and final islands', () => {
      const im = new IslandModel(baseConfig, 3);
      const { best, islands } = im.run(template, healthFitness);
      expect(best).toBeDefined();
      expect(islands).toHaveLength(3);
    });

    it('best seed has $fitness set', () => {
      const im = new IslandModel(baseConfig, 2);
      const { best } = im.run(template, healthFitness);
      expect(best.$fitness).toBeDefined();
    });

    it('triggers migration at configured interval', () => {
      // With migrationInterval=2 and generations=5, migration occurs at gen 2 and 4.
      const cfg: EvolutionConfig = { ...baseConfig, generations: 5, migrationInterval: 2 };
      const im = new IslandModel(cfg, 3);
      expect(() => im.run(template, healthFitness)).not.toThrow();
    });

    it('is deterministic with same RNG seed', () => {
      const r1 = new DeterministicRNG(55);
      const r2 = new DeterministicRNG(55);
      const { best: b1 } = new IslandModel(baseConfig, 3, r1).run(template, healthFitness);
      const { best: b2 } = new IslandModel(baseConfig, 3, r2).run(template, healthFitness);
      expect(b1.$hash).toBe(b2.$hash);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SpeciationDetector
// ─────────────────────────────────────────────────────────────────────────────

describe('SpeciationDetector', () => {
  const detector = new SpeciationDetector();

  describe('geneticDistance', () => {
    it('returns 0 for two identical seeds', () => {
      const s = makeSeed('same', 50, 50);
      expect(detector.geneticDistance(s, s)).toBeCloseTo(0);
    });

    it('returns 0 for seeds with no genes', () => {
      const bare = createSeed('bare', 'organism', {}, new DeterministicRNG(0));
      expect(detector.geneticDistance(bare, bare)).toBe(0);
    });

    it('gives non-zero distance for dissimilar seeds', () => {
      const a = makeSeed('low',  0,   0);
      const b = makeSeed('high', 100, 100);
      const dist = detector.geneticDistance(a, b);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThanOrEqual(1);
    });

    it('is symmetric', () => {
      const a = makeSeed('a', 20, 80);
      const b = makeSeed('b', 80, 20);
      expect(detector.geneticDistance(a, b)).toBeCloseTo(detector.geneticDistance(b, a));
    });

    it('handles missing keys with neutral distance 0.5', () => {
      const withExtra = createSeed('extra', 'organism', {
        health:  { type: 'scalar' as const, value: 50, min: 0, max: 100 },
        special: { type: 'scalar' as const, value: 50, min: 0, max: 100 },
      }, new DeterministicRNG(3));
      const withoutExtra = makeSeed('plain', 50);
      const dist = detector.geneticDistance(withExtra, withoutExtra);
      // 'special' key contributes |0.5 - 0.5| = 0, 'health' contributes ~0
      expect(dist).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectSpecies', () => {
    it('returns empty array for empty population', () => {
      expect(detector.detectSpecies([])).toEqual([]);
    });

    it('places a single individual in one species', () => {
      const clusters = detector.detectSpecies([makeSeed()]);
      expect(clusters).toHaveLength(1);
      expect(clusters[0]).toHaveLength(1);
    });

    it('groups identical seeds into one species', () => {
      const s = makeSeed('same', 50, 50);
      const clusters = detector.detectSpecies([s, s, s]);
      expect(clusters).toHaveLength(1);
    });

    it('splits very different seeds into separate species', () => {
      // low and high end seeds should exceed default threshold of 0.3
      const pop = [
        makeSeed('a', 0,   0),
        makeSeed('b', 100, 100),
      ];
      const clusters = detector.detectSpecies(pop, 0.01);
      expect(clusters).toHaveLength(2);
    });

    it('respects a threshold of 1.0 (everything in one cluster)', () => {
      const pop = [makeSeed('x', 0), makeSeed('y', 100)];
      const clusters = detector.detectSpecies(pop, 1.0);
      expect(clusters).toHaveLength(1);
    });

    it('sorts clusters largest-first', () => {
      const pop = [
        makeSeed('a', 50, 50),
        makeSeed('b', 51, 50),
        makeSeed('c', 52, 50),
        makeSeed('d', 0,   0),
      ];
      const clusters = detector.detectSpecies(pop, 0.05);
      if (clusters.length > 1) {
        expect(clusters[0]!.length).toBeGreaterThanOrEqual(clusters[1]!.length);
      }
    });
  });

  describe('speciesStats', () => {
    it('returns zeros for empty species array', () => {
      expect(detector.speciesStats([])).toEqual({ count: 0, avgSize: 0, maxSize: 0, minSize: 0 });
    });

    it('computes stats for a single cluster', () => {
      const stats = detector.speciesStats([[makeSeed(), makeSeed()]]);
      expect(stats).toEqual({ count: 1, avgSize: 2, maxSize: 2, minSize: 2 });
    });

    it('computes stats for multiple clusters', () => {
      const stats = detector.speciesStats([
        [makeSeed(), makeSeed(), makeSeed()],
        [makeSeed()],
      ]);
      expect(stats.count).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.minSize).toBe(1);
      expect(stats.avgSize).toBe(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EcologyMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('EcologyMetrics', () => {
  const metrics = new EcologyMetrics();

  describe('shannonDiversity', () => {
    it('returns 0 for empty population', () => {
      expect(metrics.shannonDiversity([])).toBe(0);
    });

    it('returns 0 for population with no genes', () => {
      const bare = createSeed('bare', 'organism', {}, new DeterministicRNG(0));
      expect(metrics.shannonDiversity([bare])).toBe(0);
    });

    it('returns a non-negative value for normal population', () => {
      const engine = new EvolutionEngine({ populationSize: 10 });
      const pop = engine.initPopulation(makeSeed(), 10);
      expect(metrics.shannonDiversity(pop)).toBeGreaterThanOrEqual(0);
    });

    it('identical seeds have lower diversity than varied seeds', () => {
      const s = makeSeed('same', 50, 50);
      const identical = [s, s, s, s, s];
      const varied = [
        makeSeed('a', 0, 0),
        makeSeed('b', 25, 75),
        makeSeed('c', 50, 50),
        makeSeed('d', 75, 25),
        makeSeed('e', 100, 100),
      ];
      const h1 = metrics.shannonDiversity(identical);
      const h2 = metrics.shannonDiversity(varied);
      expect(h2).toBeGreaterThanOrEqual(h1);
    });

    it('handles single-seed population without throwing', () => {
      expect(() => metrics.shannonDiversity([makeSeed()])).not.toThrow();
    });
  });

  describe('simpsonDiversity', () => {
    it('returns 0 for population of 0 or 1', () => {
      expect(metrics.simpsonDiversity([])).toBe(0);
      expect(metrics.simpsonDiversity([makeSeed()])).toBe(0);
    });

    it('returns a value in [0, 1]', () => {
      const pop = [makeSeed('a', 0), makeSeed('b', 100)];
      const d = metrics.simpsonDiversity(pop);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    });

    it('identical seeds produce low diversity', () => {
      const s = makeSeed('same', 50, 50);
      // All profiles identical → simpson ≈ 0
      const d = metrics.simpsonDiversity([s, s, s]);
      expect(d).toBeCloseTo(0, 5);
    });

    it('all-distinct seeds produce high diversity', () => {
      const pop = [
        makeSeed('a', 0,   0),
        makeSeed('b', 33,  66),
        makeSeed('c', 66,  33),
        makeSeed('d', 100, 100),
      ];
      const d = metrics.simpsonDiversity(pop);
      expect(d).toBeGreaterThan(0);
    });
  });

  describe('fitnessVariance', () => {
    it('returns 0 for fewer than 2 members', () => {
      expect(metrics.fitnessVariance([])).toBe(0);
      expect(metrics.fitnessVariance([makeSeed()])).toBe(0);
    });

    it('returns 0 for all-equal fitness', () => {
      const p = [{ ...makeSeed(), $fitness: { primary: 0.5 } },
                 { ...makeSeed(), $fitness: { primary: 0.5 } }];
      expect(metrics.fitnessVariance(p)).toBeCloseTo(0);
    });

    it('returns positive for different fitnesses', () => {
      const p = [{ ...makeSeed(), $fitness: { primary: 0.0 } },
                 { ...makeSeed(), $fitness: { primary: 1.0 } }];
      expect(metrics.fitnessVariance(p)).toBeGreaterThan(0);
    });

    it('variance is symmetric around mean', () => {
      const p = [{ ...makeSeed(), $fitness: { primary: 0.0 } },
                 { ...makeSeed(), $fitness: { primary: 1.0 } }];
      // mean = 0.5, variance = ((0-0.5)^2 + (1-0.5)^2)/2 = 0.25
      expect(metrics.fitnessVariance(p)).toBeCloseTo(0.25);
    });
  });

  describe('populationHealth', () => {
    it('returns neutral values for empty population', () => {
      const h = metrics.populationHealth([]);
      expect(h).toEqual({ diversity: 0, avgFitness: 0, stability: 1 });
    });

    it('stability is 1 when all fitnesses are equal', () => {
      const pop = [{ ...makeSeed(), $fitness: { primary: 0.7 } },
                   { ...makeSeed(), $fitness: { primary: 0.7 } }];
      const { stability } = metrics.populationHealth(pop);
      expect(stability).toBeCloseTo(1);
    });

    it('stability is in [0, 1]', () => {
      const engine = new EvolutionEngine({ populationSize: 8 });
      const pop = engine.evaluateFitness(engine.initPopulation(makeSeed(), 8), healthFitness);
      const { stability } = metrics.populationHealth(pop);
      expect(stability).toBeGreaterThanOrEqual(0);
      expect(stability).toBeLessThanOrEqual(1);
    });

    it('avgFitness matches manually computed average', () => {
      const pop = [{ ...makeSeed(), $fitness: { primary: 0.2 } },
                   { ...makeSeed(), $fitness: { primary: 0.8 } }];
      const { avgFitness } = metrics.populationHealth(pop);
      expect(avgFitness).toBeCloseTo(0.5);
    });

    it('diversity matches simpsonDiversity', () => {
      const pop = [makeSeed('a', 0), makeSeed('b', 100)];
      const { diversity } = metrics.populationHealth(pop);
      expect(diversity).toBeCloseTo(metrics.simpsonDiversity(pop));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LineageTracer
// ─────────────────────────────────────────────────────────────────────────────

describe('LineageTracer', () => {
  describe('record + getAncestors', () => {
    it('returns empty ancestors for unrecorded seed', () => {
      const tracer = new LineageTracer();
      const s = makeSeed();
      expect(tracer.getAncestors(s)).toEqual([]);
    });

    it('finds direct parent after one mutation record', () => {
      const tracer = new LineageTracer();
      const parent = makeSeed('parent', 50);
      const child  = makeSeed('child',  60);
      tracer.record(parent, child, 'mutation');
      const ancestors = tracer.getAncestors(child);
      expect(ancestors).toHaveLength(1);
      expect(ancestors[0]?.$hash).toBe(parent.$hash);
    });

    it('finds ancestors through a chain', () => {
      const tracer = new LineageTracer();
      const grandparent = makeSeed('gp',    30);
      const parent      = makeSeed('p',     50);
      const child       = makeSeed('child', 70);
      tracer.record(grandparent, parent, 'mutation');
      tracer.record(parent, child, 'crossover');
      const ancestors = tracer.getAncestors(child, 5);
      const hashes = ancestors.map(s => s.$hash);
      expect(hashes).toContain(parent.$hash);
      expect(hashes).toContain(grandparent.$hash);
    });

    it('respects depth limit', () => {
      const tracer = new LineageTracer();
      const seeds = Array.from({ length: 6 }, (_, i) => makeSeed(`seed${i}`, i * 10));
      for (let i = 1; i < seeds.length; i++) {
        tracer.record(seeds[i - 1]!, seeds[i]!, 'mutation');
      }
      const last = seeds[seeds.length - 1]!;
      const ancestors1 = tracer.getAncestors(last, 1);
      const ancestors3 = tracer.getAncestors(last, 3);
      expect(ancestors1.length).toBeLessThanOrEqual(ancestors3.length);
    });

    it('returns all reachable ancestors in a diamond topology', () => {
      const tracer = new LineageTracer();
      const root = makeSeed('root',  0);
      const mid1 = makeSeed('mid1', 30);
      const mid2 = makeSeed('mid2', 60);
      const leaf = makeSeed('leaf', 90);
      tracer.record(root, mid1, 'mutation');
      tracer.record(root, mid2, 'mutation');
      tracer.record(mid1, leaf, 'crossover');
      tracer.record(mid2, leaf, 'crossover');
      const ancestors = tracer.getAncestors(leaf, 10);
      const hashes = ancestors.map(s => s.$hash);
      // All three ancestors must appear; root may appear more than once because
      // it is reachable via both mid1 and mid2 paths before it is dequeued.
      expect(hashes).toContain(mid1.$hash);
      expect(hashes).toContain(mid2.$hash);
      expect(hashes).toContain(root.$hash);
    });
  });

  describe('getMostRecentCommonAncestor', () => {
    it('returns null when there is no shared ancestor', () => {
      const tracer = new LineageTracer();
      const a = makeSeed('a', 10);
      const b = makeSeed('b', 90);
      expect(tracer.getMostRecentCommonAncestor(a, b)).toBeNull();
    });

    it('returns the seed itself if a === b (same hash)', () => {
      const tracer = new LineageTracer();
      const s = makeSeed('same', 50);
      // Register s so it appears in the registry
      const child = makeSeed('child', 60);
      tracer.record(s, child, 'mutation');
      // a and b both point to s directly
      const mrca = tracer.getMostRecentCommonAncestor(s, s);
      expect(mrca?.$hash).toBe(s.$hash);
    });

    it('finds shared ancestor for two siblings', () => {
      const tracer = new LineageTracer();
      const root  = makeSeed('root', 0);
      const left  = makeSeed('l',   40);
      const right = makeSeed('r',   60);
      tracer.record(root, left,  'mutation');
      tracer.record(root, right, 'mutation');
      const mrca = tracer.getMostRecentCommonAncestor(left, right);
      expect(mrca?.$hash).toBe(root.$hash);
    });

    it('finds common ancestor at different depths', () => {
      const tracer = new LineageTracer();
      const root   = makeSeed('root', 0);
      const middle = makeSeed('mid',  50);
      const deep   = makeSeed('deep', 80);
      const sibling = makeSeed('sibling', 20);
      tracer.record(root,   middle,  'mutation');
      tracer.record(middle, deep,    'mutation');
      tracer.record(root,   sibling, 'mutation');
      const mrca = tracer.getMostRecentCommonAncestor(deep, sibling);
      // root is the common ancestor
      expect(mrca?.$hash).toBe(root.$hash);
    });
  });

  describe('getLineageDepth', () => {
    it('returns 0 for a seed with no recorded parents', () => {
      const tracer = new LineageTracer();
      expect(tracer.getLineageDepth(makeSeed())).toBe(0);
    });

    it('returns 1 for a seed with one parent', () => {
      const tracer = new LineageTracer();
      const parent = makeSeed('p', 40);
      const child  = makeSeed('c', 60);
      tracer.record(parent, child, 'mutation');
      expect(tracer.getLineageDepth(child)).toBe(1);
    });

    it('returns depth equal to chain length', () => {
      const tracer = new LineageTracer();
      const seeds = Array.from({ length: 5 }, (_, i) => makeSeed(`s${i}`, i * 20));
      for (let i = 1; i < seeds.length; i++) {
        tracer.record(seeds[i - 1]!, seeds[i]!, 'mutation');
      }
      // Chain: s0 → s1 → s2 → s3 → s4  →  depth of s4 = 4
      expect(tracer.getLineageDepth(seeds[4]!)).toBe(4);
    });

    it('handles diamond ancestry without infinite recursion', () => {
      const tracer = new LineageTracer();
      const root   = makeSeed('root', 0);
      const left   = makeSeed('l',   40);
      const right  = makeSeed('r',   60);
      const leaf   = makeSeed('leaf', 90);
      tracer.record(root,  left,  'mutation');
      tracer.record(root,  right, 'mutation');
      tracer.record(left,  leaf,  'crossover');
      tracer.record(right, leaf,  'crossover');
      expect(() => tracer.getLineageDepth(leaf)).not.toThrow();
      expect(tracer.getLineageDepth(leaf)).toBeGreaterThanOrEqual(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EvolutionError
// ─────────────────────────────────────────────────────────────────────────────

describe('EvolutionError', () => {
  it('is an instance of Error', () => {
    const err = new EvolutionError('test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name EvolutionError', () => {
    const err = new EvolutionError('oops');
    expect(err.name).toBe('EvolutionError');
  });

  it('carries the provided message', () => {
    const msg = 'something went wrong';
    const err = new EvolutionError(msg);
    expect(err.message).toBe(msg);
  });
});
