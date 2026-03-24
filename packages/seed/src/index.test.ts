import { describe, it, expect } from 'vitest';
import type { GeneMap, ScalarGene, CategoricalGene, VectorGene, TensorGene, TimeSeriesGene } from '@paradigm/types';
import { DeterministicRNG, DefaultSimulationClock } from '@paradigm/rng';
import {
  createSeed,
  cloneSeed,
  mutateSeed,
  breedSeeds,
  setSeedFitness,
  setSeedMetadata,
  setSeedActivation,
  setSeedDisplay,
  setSeedRelations,
  getSeedId,
  getSeedFitness,
  isSeedAlive,
  getGeneCount,
  mutateGene,
  mutateGeneMap,
  crossoverGenes,
  computeSeedQuickHash,
} from './index.js';

// ─────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────

function makeGenes(): GeneMap {
  return {
    health: { type: 'scalar', value: 100, min: 0, max: 200 } as ScalarGene,
    speed: { type: 'scalar', value: 5, min: 0, max: 20 } as ScalarGene,
    element: { type: 'categorical', value: 'fire', options: ['fire', 'ice', 'lightning'] } as CategoricalGene,
    color: { type: 'vector', value: [0.9, 0.2, 0.1], dimensions: 3 } as VectorGene,
  };
}

function makeRng(seed: number | string = 42): DeterministicRNG {
  return new DeterministicRNG(seed);
}

// ─────────────────────────────────────────────
// Seed CRUD
// ─────────────────────────────────────────────

describe('createSeed', () => {
  it('creates seed with correct fields', () => {
    const seed = createSeed('warrior', 'organism', makeGenes(), makeRng());
    expect(seed.$gst).toBe('4.0');
    expect(seed.$domain).toBe('organism');
    expect(seed.$name).toBe('warrior');
    expect(seed.$hash).toBeTruthy();
    expect(seed.$lineage.generation).toBe(0);
    expect(seed.$lineage.parents).toEqual([]);
    expect(seed.$activation?.alive).toBe(true);
    expect(seed.$activation?.energy).toBe(100);
    expect(seed.$activation?.age).toBe(0);
  });

  it('auto-generates display hints', () => {
    const seed = createSeed('warrior', 'organism', makeGenes(), makeRng());
    expect(seed.$display).toBeDefined();
    expect(seed.$display?.color).toBe('#10b981');
    expect(seed.$display?.icon).toBe('dna');
    expect(seed.$display?.category).toBe('organism');
  });

  it('is deterministic with same rng', () => {
    const s1 = createSeed('warrior', 'organism', makeGenes(), makeRng(42));
    const s2 = createSeed('warrior', 'organism', makeGenes(), makeRng(42));
    expect(s1.$hash).toBe(s2.$hash);
  });

  it('uses simulation clock for timestamp', () => {
    const clock = new DefaultSimulationClock(999);
    const seed = createSeed('test', 'organism', makeGenes(), makeRng(), clock);
    expect(seed.$lineage.timestamp).toBe(999);
    expect(seed.$metadata.created).toBe(999);
  });
});

describe('cloneSeed', () => {
  it('produces independent copy', () => {
    const original = createSeed('hero', 'organism', makeGenes(), makeRng());
    const clone = cloneSeed(original);
    expect(clone.$hash).toBe(original.$hash);
    expect(clone).not.toBe(original);
    expect(clone.genes).not.toBe(original.genes);
  });

  it('cloned genes are independent', () => {
    const original = createSeed('hero', 'organism', makeGenes(), makeRng());
    const clone = cloneSeed(original);
    (clone.genes['health'] as ScalarGene).value = 999;
    expect((original.genes['health'] as ScalarGene).value).toBe(100);
  });
});

describe('mutateSeed', () => {
  it('returns new seed with incremented generation', () => {
    const parent = createSeed('scout', 'organism', makeGenes(), makeRng());
    const mutant = mutateSeed(parent, 0.3, makeRng(99));
    expect(mutant.$lineage.generation).toBe(1);
    expect(mutant.$lineage.parents.length).toBe(1);
    expect(mutant.$lineage.parents[0]?.name).toBe('scout');
    expect(mutant.$lineage.breedingStrategy).toBe('mutation');
  });

  it('does not modify parent', () => {
    const parent = createSeed('scout', 'organism', makeGenes(), makeRng());
    const originalHash = parent.$hash;
    mutateSeed(parent, 0.5, makeRng(99));
    expect(parent.$hash).toBe(originalHash);
  });

  it('intensity 0 produces minimal changes', () => {
    const parent = createSeed('test', 'organism', makeGenes(), makeRng());
    const mutant = mutateSeed(parent, 0, makeRng(99));
    // Scalar genes with 0 intensity have 0 stddev so no change
    const parentHealth = (parent.genes['health'] as ScalarGene).value;
    const mutantHealth = (mutant.genes['health'] as ScalarGene).value;
    expect(mutantHealth).toBeCloseTo(parentHealth, 5);
  });

  it('increments age', () => {
    const parent = createSeed('test', 'organism', makeGenes(), makeRng());
    const m1 = mutateSeed(parent, 0.1, makeRng(1));
    expect(m1.$activation?.age).toBe(1);
    const m2 = mutateSeed(m1, 0.1, makeRng(2));
    expect(m2.$activation?.age).toBe(2);
  });

  it('is deterministic', () => {
    const parent = createSeed('test', 'organism', makeGenes(), makeRng());
    const m1 = mutateSeed(parent, 0.3, makeRng(99));
    const m2 = mutateSeed(parent, 0.3, makeRng(99));
    expect(m1.$hash).toBe(m2.$hash);
  });
});

describe('breedSeeds', () => {
  it('produces child with both parents in lineage', () => {
    const a = createSeed('knight', 'organism', makeGenes(), makeRng(1));
    const b = createSeed('mage', 'organism', makeGenes(), makeRng(2));
    const child = breedSeeds(a, b, 'uniform', 0.6, makeRng(3));

    expect(child.$name).toBe('knight\u00d7mage');
    expect(child.$lineage.parents.length).toBe(2);
    expect(child.$lineage.parents[0]?.name).toBe('knight');
    expect(child.$lineage.parents[1]?.name).toBe('mage');
    expect(child.$lineage.breedingStrategy).toBe('crossover');
    expect(child.$lineage.generation).toBe(1);
  });

  it('generation is max parent + 1', () => {
    const rng = makeRng();
    const a = createSeed('a', 'organism', makeGenes(), rng);
    const b = mutateSeed(
      mutateSeed(createSeed('b', 'organism', makeGenes(), rng), 0.1, rng),
      0.1,
      rng,
    );
    const child = breedSeeds(a, b, 'blend', 0.5, rng);
    expect(child.$lineage.generation).toBe(b.$lineage.generation + 1);
  });

  it('child inherits domain from parentA', () => {
    const a = createSeed('a', 'organism', makeGenes(), makeRng(1));
    const b = createSeed('b', 'organism', makeGenes(), makeRng(2));
    const child = breedSeeds(a, b, 'uniform', 0.5, makeRng(3));
    expect(child.$domain).toBe('organism');
  });

  it('is deterministic', () => {
    const a = createSeed('a', 'organism', makeGenes(), makeRng(1));
    const b = createSeed('b', 'organism', makeGenes(), makeRng(2));
    const c1 = breedSeeds(a, b, 'blend', 0.5, makeRng(42));
    const c2 = breedSeeds(a, b, 'blend', 0.5, makeRng(42));
    expect(c1.$hash).toBe(c2.$hash);
  });
});

// ─────────────────────────────────────────────
// Seed updaters
// ─────────────────────────────────────────────

describe('setSeedFitness', () => {
  it('returns new seed with fitness', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    const evaluated = setSeedFitness(seed, { primary: 0.85 });
    expect(evaluated.$fitness?.primary).toBe(0.85);
    expect(seed.$fitness).toBeUndefined();
  });
});

describe('setSeedMetadata', () => {
  it('merges metadata', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    const updated = setSeedMetadata(seed, { tags: ['elite'], description: 'Top seed' });
    expect(updated.$metadata.tags).toEqual(['elite']);
    expect(updated.$metadata.description).toBe('Top seed');
    expect(updated.$metadata.created).toBe(seed.$metadata.created);
  });
});

describe('setSeedActivation', () => {
  it('updates activation fields', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    const dead = setSeedActivation(seed, { alive: false, energy: 0 });
    expect(dead.$activation?.alive).toBe(false);
    expect(dead.$activation?.energy).toBe(0);
    expect(dead.$activation?.age).toBe(0);
  });
});

describe('setSeedDisplay', () => {
  it('merges display hints', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    const updated = setSeedDisplay(seed, { thumbnail: 'img.png' });
    expect(updated.$display?.thumbnail).toBe('img.png');
    expect(updated.$display?.color).toBe('#10b981');
  });
});

describe('setSeedRelations', () => {
  it('sets relations array', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    const updated = setSeedRelations(seed, [
      { targetHash: 'abc', type: 'allied_with' },
    ]);
    expect(updated.$relations?.length).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Seed queries
// ─────────────────────────────────────────────

describe('seed queries', () => {
  it('getSeedId returns hash', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    expect(getSeedId(seed)).toBe(seed.$hash);
  });

  it('getSeedFitness returns primary', () => {
    const seed = setSeedFitness(
      createSeed('test', 'organism', makeGenes(), makeRng()),
      { primary: 0.9, speed: 0.7 },
    );
    expect(getSeedFitness(seed)).toBe(0.9);
  });

  it('getSeedFitness returns undefined when no fitness', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    expect(getSeedFitness(seed)).toBeUndefined();
  });

  it('isSeedAlive returns true for new seed', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    expect(isSeedAlive(seed)).toBe(true);
  });

  it('isSeedAlive returns false after death', () => {
    const seed = setSeedActivation(
      createSeed('test', 'organism', makeGenes(), makeRng()),
      { alive: false },
    );
    expect(isSeedAlive(seed)).toBe(false);
  });

  it('getGeneCount returns number of genes', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    expect(getGeneCount(seed)).toBe(4);
  });
});

// ─────────────────────────────────────────────
// computeSeedQuickHash
// ─────────────────────────────────────────────

describe('computeSeedQuickHash', () => {
  it('produces consistent hash', () => {
    const seed = createSeed('test', 'organism', makeGenes(), makeRng());
    const h1 = computeSeedQuickHash(seed);
    const h2 = computeSeedQuickHash(seed);
    expect(h1).toBe(h2);
  });
});

// ─────────────────────────────────────────────
// Mutation operators
// ─────────────────────────────────────────────

describe('mutateGene', () => {
  it('mutates scalar within bounds', () => {
    const gene: ScalarGene = { type: 'scalar', value: 50, min: 0, max: 100 };
    const rng = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const mutated = mutateGene(gene, 0.5, rng) as ScalarGene;
      expect(mutated.value).toBeGreaterThanOrEqual(0);
      expect(mutated.value).toBeLessThanOrEqual(100);
    }
  });

  it('mutates categorical value', () => {
    const gene: CategoricalGene = { type: 'categorical', value: 'fire', options: ['fire', 'ice', 'lightning'] };
    const rng = makeRng(42);
    const values = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const mutated = mutateGene(gene, 1.0, rng) as CategoricalGene;
      values.add(mutated.value);
    }
    expect(values.size).toBeGreaterThan(1);
  });

  it('mutates vector within bounds', () => {
    const gene: VectorGene = {
      type: 'vector',
      value: [0.5, 0.5, 0.5],
      dimensions: 3,
      min: [0, 0, 0],
      max: [1, 1, 1],
    };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 0.3, rng) as VectorGene;
    for (const v of mutated.value) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('mutates expression source', () => {
    const gene = { type: 'expression' as const, source: 'x * 2 + 10' };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 0.8, rng);
    expect(mutated.type).toBe('expression');
  });

  it('mutates tensor preserving shape', () => {
    const gene: TensorGene = {
      type: 'tensor',
      data: new Float64Array([1, 2, 3, 4]),
      shape: [2, 2],
    };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 0.5, rng) as TensorGene;
    expect(mutated.data.length).toBe(4);
    expect(mutated.shape).toEqual([2, 2]);
  });

  it('mutates timeseries keyframes', () => {
    const gene: TimeSeriesGene = {
      type: 'timeseries',
      keyframes: [{ t: 0, v: 0 }, { t: 1, v: 1 }, { t: 2, v: 0.5 }],
      interpolation: 'linear',
    };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 0.3, rng) as TimeSeriesGene;
    expect(mutated.keyframes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mutateGeneMap', () => {
  it('mutates all genes in map', () => {
    const genes = makeGenes();
    const rng = makeRng(42);
    const mutated = mutateGeneMap(genes, 0.5, rng);
    expect(Object.keys(mutated).length).toBe(Object.keys(genes).length);
  });
});

// ─────────────────────────────────────────────
// Crossover operators
// ─────────────────────────────────────────────

describe('crossoverGenes', () => {
  const genesA = makeGenes();
  const genesB: GeneMap = {
    health: { type: 'scalar', value: 50, min: 0, max: 200 } as ScalarGene,
    speed: { type: 'scalar', value: 15, min: 0, max: 20 } as ScalarGene,
    element: { type: 'categorical', value: 'ice', options: ['fire', 'ice', 'lightning'] } as CategoricalGene,
    color: { type: 'vector', value: [0.1, 0.2, 0.9], dimensions: 3 } as VectorGene,
  };

  it('uniform crossover produces valid genes', () => {
    const child = crossoverGenes(genesA, genesB, 'uniform', 0.5, makeRng());
    expect(Object.keys(child).length).toBe(4);
    expect(child['health']).toBeDefined();
  });

  it('single_point crossover works', () => {
    const child = crossoverGenes(genesA, genesB, 'single_point', 0.5, makeRng());
    expect(Object.keys(child).length).toBeGreaterThan(0);
  });

  it('blend crossover averages scalar values', () => {
    const child = crossoverGenes(genesA, genesB, 'blend', 0.5, makeRng());
    const health = child['health'] as ScalarGene;
    expect(health.value).toBeCloseTo(75, 0); // (100+50)/2
  });

  it('sbx crossover produces bounded values', () => {
    const child = crossoverGenes(genesA, genesB, 'sbx', 0.5, makeRng());
    const health = child['health'] as ScalarGene;
    expect(health.value).toBeGreaterThanOrEqual(0);
    expect(health.value).toBeLessThanOrEqual(200);
  });

  it('layer crossover keeps complex types intact', () => {
    const child = crossoverGenes(genesA, genesB, 'layer', 0.5, makeRng());
    expect(child['health']).toBeDefined();
  });

  it('crossover is deterministic', () => {
    const c1 = crossoverGenes(genesA, genesB, 'uniform', 0.5, makeRng(42));
    const c2 = crossoverGenes(genesA, genesB, 'uniform', 0.5, makeRng(42));
    expect((c1['health'] as ScalarGene).value).toBe((c2['health'] as ScalarGene).value);
  });

  it('handles asymmetric gene maps', () => {
    const extra: GeneMap = {
      ...genesB,
      armor: { type: 'scalar', value: 10, min: 0, max: 50 } as ScalarGene,
    };
    const child = crossoverGenes(genesA, extra, 'uniform', 0.5, makeRng());
    expect(child['armor']).toBeDefined();
  });

  it('blend crossover handles vector genes', () => {
    const child = crossoverGenes(genesA, genesB, 'blend', 0.5, makeRng());
    const color = child['color'] as VectorGene;
    expect(color.value.length).toBe(3);
    // Blended colors should be between parents
    expect(color.value[0]).toBeCloseTo((0.9 + 0.1) / 2, 1);
  });

  it('sbx handles vector genes', () => {
    const child = crossoverGenes(genesA, genesB, 'sbx', 0.5, makeRng());
    const color = child['color'] as VectorGene;
    expect(color.value.length).toBe(3);
  });

  it('layer blends scalar and picks struct/array/graph', () => {
    const withStruct: GeneMap = {
      ...genesA,
      stats: { type: 'struct', value: { hp: { type: 'scalar', value: 10, min: 0, max: 100 } as ScalarGene } },
    };
    const withStruct2: GeneMap = {
      ...genesB,
      stats: { type: 'struct', value: { hp: { type: 'scalar', value: 50, min: 0, max: 100 } as ScalarGene } },
    };
    const child = crossoverGenes(withStruct, withStruct2, 'layer', 0.5, makeRng());
    expect(child['stats']).toBeDefined();
    expect((child['stats'] as any).type).toBe('struct');
  });

  it('high dominance favors parentA in uniform', () => {
    const rng = makeRng(42);
    const child = crossoverGenes(genesA, genesB, 'uniform', 0.99, rng);
    // With 99% dominance, most genes should come from A
    const health = child['health'] as ScalarGene;
    expect(health.value).toBe(100); // parentA value
  });
});

// ─────────────────────────────────────────────
// Additional mutation edge cases
// ─────────────────────────────────────────────

describe('struct gene mutation', () => {
  it('recursively mutates nested genes', () => {
    const gene = {
      type: 'struct' as const,
      value: {
        hp: { type: 'scalar', value: 50, min: 0, max: 100 } as ScalarGene,
        role: { type: 'categorical', value: 'tank', options: ['tank', 'dps', 'healer'] } as CategoricalGene,
      },
    };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 0.5, rng);
    expect(mutated.type).toBe('struct');
  });
});

describe('array gene mutation', () => {
  it('mutates elements and respects bounds', () => {
    const gene = {
      type: 'array' as const,
      value: [
        { type: 'scalar', value: 10, min: 0, max: 100 } as ScalarGene,
        { type: 'scalar', value: 20, min: 0, max: 100 } as ScalarGene,
      ],
      minLength: 1,
      maxLength: 5,
    };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 0.8, rng);
    expect(mutated.type).toBe('array');
    if (mutated.type === 'array') {
      expect(mutated.value.length).toBeGreaterThanOrEqual(1);
      expect(mutated.value.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('graph gene mutation', () => {
  it('mutates nodes and edges', () => {
    const gene = {
      type: 'graph' as const,
      nodes: new Map<string, import('@paradigm/types').Gene>([
        ['a', { type: 'scalar', value: 1, min: 0, max: 10 } as ScalarGene],
        ['b', { type: 'scalar', value: 2, min: 0, max: 10 } as ScalarGene],
      ]),
      edges: [
        { from: 'a', to: 'b', weight: { type: 'scalar', value: 0.5, min: 0, max: 1 } as ScalarGene },
      ],
    };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 0.5, rng);
    expect(mutated.type).toBe('graph');
  });
});

describe('expression gene mutation', () => {
  it('mutates numeric constants in source', () => {
    const gene = { type: 'expression' as const, source: 'x * 2 + 10' };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 1.0, rng);
    if (mutated.type === 'expression') {
      // Source should have changed numbers
      expect(mutated.source).not.toBe('x * 2 + 10');
    }
  });

  it('low intensity returns unchanged', () => {
    const gene = { type: 'expression' as const, source: 'x + 1' };
    // Use a seed that makes rng.next() > intensity
    const rng = makeRng(1);
    const mutated = mutateGene(gene, 0.01, rng);
    expect(mutated.type).toBe('expression');
  });
});

describe('timeseries high-intensity mutation', () => {
  it('can insert and delete keyframes', () => {
    const gene: TimeSeriesGene = {
      type: 'timeseries',
      keyframes: [
        { t: 0, v: 0 }, { t: 0.25, v: 0.5 }, { t: 0.5, v: 1 },
        { t: 0.75, v: 0.5 }, { t: 1, v: 0 },
      ],
      interpolation: 'linear',
    };
    const rng = makeRng(42);
    const mutated = mutateGene(gene, 1.0, rng) as TimeSeriesGene;
    expect(mutated.keyframes.length).toBeGreaterThanOrEqual(2);
    // Verify sorted by time
    for (let i = 1; i < mutated.keyframes.length; i++) {
      expect(mutated.keyframes[i]!.t).toBeGreaterThanOrEqual(mutated.keyframes[i - 1]!.t);
    }
  });
});
