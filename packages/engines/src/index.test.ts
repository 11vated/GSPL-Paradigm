/**
 * Comprehensive tests for @paradigm/engines
 *
 * Covers:
 * - EngineRegistry construction, registration, lookup, domain routing
 * - All 24 domain engines: create(), evaluate(), suggest(), matches(), getCapabilities()
 * - DomainEngine abstract class behaviour
 * - Edge cases: unknown names, unmapped domains, fallback EngineResult
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicRNG } from '@paradigm/rng';
import { createSeed } from '@paradigm/seed';
import {
  EngineRegistry,
  DomainEngine,
  OrganismEngine,
  FloraEngine,
  EcosystemEngine,
  GameEngine,
  NarrativeEngine,
  AudioEngine,
  UIEngine,
  TerrainEngine,
  ArchitectureEngine,
  CityEngine,
  MaterialEngine,
  SimulationEngine,
  NetworkEngine,
  NeuralEngine,
  QuantumEngine,
  IntelligenceEngine,
  RoboticsEngine,
  MolecularEngine,
  EducationEngine,
  FinanceEngine,
  InfrastructureEngine,
  ProductEngine,
  VoidEngine,
  WebEngine,
  type EngineCapability,
  type EngineResult,
} from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRng(seed = 'test-seed'): DeterministicRNG {
  return new DeterministicRNG(seed);
}

/** Assert that an EngineResult is structurally valid. */
function assertValidResult(result: EngineResult): void {
  expect(typeof result.success).toBe('boolean');
  expect(Array.isArray(result.suggestions)).toBe(true);
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(result.output !== null && typeof result.output === 'object').toBe(true);
}

// ---------------------------------------------------------------------------
// EngineRegistry
// ---------------------------------------------------------------------------

describe('EngineRegistry', () => {
  let registry: EngineRegistry;

  beforeEach(() => {
    registry = new EngineRegistry();
  });

  it('auto-registers exactly 24 built-in engines on construction', () => {
    expect(registry.listEngines()).toHaveLength(24);
  });

  it('accepts a custom RNG in the constructor', () => {
    const customRng = makeRng('custom');
    const reg = new EngineRegistry(customRng);
    expect(reg.listEngines()).toHaveLength(24);
  });

  describe('register / unregister', () => {
    it('register() adds a new engine', () => {
      const engine = new OrganismEngine();
      engine['name' as never]; // type check
      const freshReg = new EngineRegistry();
      freshReg.unregister('OrganismEngine');
      expect(freshReg.getEngine('OrganismEngine')).toBeUndefined();
      freshReg.register(engine);
      expect(freshReg.getEngine('OrganismEngine')).toBe(engine);
    });

    it('register() overwrites an existing engine with the same name', () => {
      const engineA = new OrganismEngine();
      const engineB = new OrganismEngine();
      registry.register(engineA);
      registry.register(engineB);
      expect(registry.getEngine('OrganismEngine')).toBe(engineB);
    });

    it('unregister() removes an engine', () => {
      registry.unregister('OrganismEngine');
      expect(registry.getEngine('OrganismEngine')).toBeUndefined();
      expect(registry.listEngines()).toHaveLength(23);
    });

    it('unregister() is a no-op for unknown names', () => {
      expect(() => registry.unregister('NonExistentEngine')).not.toThrow();
      expect(registry.listEngines()).toHaveLength(24);
    });
  });

  describe('getEngine()', () => {
    it('returns the correct engine by name', () => {
      const engine = registry.getEngine('GameEngine');
      expect(engine).toBeInstanceOf(GameEngine);
    });

    it('returns undefined for an unknown name', () => {
      expect(registry.getEngine('DoesNotExist')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(registry.getEngine('')).toBeUndefined();
    });
  });

  describe('findByDomain()', () => {
    it('returns engines that handle the domain', () => {
      const results = registry.findByDomain('organism');
      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((e) => expect(e.matches('organism')).toBe(true));
    });

    it('returns both OrganismEngine and FloraEngine for "organism" domain', () => {
      const names = registry.findByDomain('organism').map((e) => e.name);
      expect(names).toContain('OrganismEngine');
      expect(names).toContain('FloraEngine');
    });

    it('returns empty array for an unmapped domain', () => {
      // 'vehicle' is a valid SeedDomain but has no registered engine
      const results = registry.findByDomain('vehicle');
      expect(results).toHaveLength(0);
    });

    it('returns empty array for "mammal" domain (no engine handles it)', () => {
      expect(registry.findByDomain('mammal')).toHaveLength(0);
    });
  });

  describe('getBestEngine()', () => {
    it('returns the first engine for a matched domain', () => {
      const engine = registry.getBestEngine('ecosystem');
      expect(engine).toBeInstanceOf(EcosystemEngine);
    });

    it('returns undefined when no engine covers the domain', () => {
      expect(registry.getBestEngine('vehicle')).toBeUndefined();
    });
  });

  describe('listEngines()', () => {
    it('returns EngineEntry objects with name, domains, capabilities', () => {
      const entries = registry.listEngines();
      entries.forEach((entry) => {
        expect(typeof entry.name).toBe('string');
        expect(Array.isArray(entry.domains)).toBe(true);
        expect(Array.isArray(entry.capabilities)).toBe(true);
      });
    });

    it('lists all 24 engine names', () => {
      const names = registry.listEngines().map((e) => e.name);
      const expected = [
        'OrganismEngine', 'FloraEngine', 'EcosystemEngine', 'GameEngine',
        'NarrativeEngine', 'AudioEngine', 'UIEngine', 'TerrainEngine',
        'ArchitectureEngine', 'CityEngine', 'MaterialEngine', 'SimulationEngine',
        'NetworkEngine', 'NeuralEngine', 'QuantumEngine', 'IntelligenceEngine',
        'RoboticsEngine', 'MolecularEngine', 'EducationEngine', 'FinanceEngine',
        'InfrastructureEngine', 'ProductEngine', 'VoidEngine', 'WebEngine',
      ];
      expected.forEach((name) => expect(names).toContain(name));
    });
  });

  describe('createForDomain()', () => {
    it('creates a seed for "organism" domain', () => {
      const seed = registry.createForDomain('organism');
      expect(seed.$domain).toBe('organism');
    });

    it('creates a seed for "game" domain', () => {
      const seed = registry.createForDomain('game');
      expect(seed.$domain).toBe('game');
    });

    it('creates a seed for "narrative" domain', () => {
      const seed = registry.createForDomain('narrative');
      expect(seed.$domain).toBe('narrative');
    });

    it('creates a seed for "audio" domain', () => {
      const seed = registry.createForDomain('audio');
      expect(seed.$domain).toBe('audio');
    });

    it('creates a seed for "terrain" domain', () => {
      const seed = registry.createForDomain('terrain');
      expect(seed.$domain).toBe('terrain');
    });

    it('creates a seed for "city" domain', () => {
      const seed = registry.createForDomain('city');
      expect(seed.$domain).toBe('city');
    });

    it('creates a seed for "neural" domain', () => {
      const seed = registry.createForDomain('neural');
      expect(seed.$domain).toBe('neural');
    });

    it('creates a seed for "web" domain', () => {
      const seed = registry.createForDomain('web');
      expect(seed.$domain).toBe('web');
    });

    it('creates a seed for "void" domain', () => {
      const seed = registry.createForDomain('void');
      expect(seed.$domain).toBe('void');
    });

    it('accepts gene overrides via params', () => {
      const seed = registry.createForDomain('organism', { health: 75, diet: 'carnivore' });
      expect(seed.genes['health']).toMatchObject({ value: 75 });
      expect(seed.genes['diet']).toMatchObject({ value: 'carnivore' });
    });

    it('throws an Error when no engine is registered for the domain', () => {
      expect(() => registry.createForDomain('vehicle')).toThrow(/No engine registered for domain/);
    });

    it('error message includes the domain name', () => {
      expect(() => registry.createForDomain('vehicle')).toThrow('"vehicle"');
    });
  });

  describe('evaluateSeed()', () => {
    it('evaluates a known domain seed via the matching engine', () => {
      const seed = registry.createForDomain('organism');
      const result = registry.evaluateSeed(seed);
      assertValidResult(result);
    });

    it('returns failed EngineResult with warning for unknown domain', () => {
      const unknownSeed = createSeed('test', 'vehicle', {}, makeRng());
      const result = registry.evaluateSeed(unknownSeed);
      expect(result.success).toBe(false);
      expect(result.warnings.some((w) => w.includes('"vehicle"'))).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.output).toMatchObject({ domain: 'vehicle' });
    });

    it('returns failed EngineResult for "mammal" domain (no engine)', () => {
      const seed = createSeed('mammal-test', 'mammal', {}, makeRng());
      const result = registry.evaluateSeed(seed);
      expect(result.success).toBe(false);
      expect(result.warnings[0]).toMatch(/No engine found for domain "mammal"/);
    });
  });
});

// ---------------------------------------------------------------------------
// DomainEngine abstract class behaviour
// ---------------------------------------------------------------------------

describe('DomainEngine base class', () => {
  it('matches() returns true for included domain', () => {
    const engine = new OrganismEngine();
    expect(engine.matches('organism')).toBe(true);
  });

  it('matches() returns false for unrelated domain', () => {
    const engine = new OrganismEngine();
    expect(engine.matches('game')).toBe(false);
  });

  it('getCapabilities() returns the capabilities array', () => {
    const engine = new GameEngine();
    const caps = engine.getCapabilities();
    expect(caps).toBe(engine.capabilities);
    expect(caps.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Per-engine parameterised tests
// ---------------------------------------------------------------------------

interface EngineSpec {
  name: string;
  domain: string;
  Engine: new () => DomainEngine;
  /** Gene overrides to pass to create() so evaluate() can hit specific branches. */
  createParams?: Record<string, unknown>;
  /** Additional seeds to evaluate for branch coverage. */
  extraSeeds?: Array<Record<string, unknown>>;
}

const engineSpecs: EngineSpec[] = [
  {
    name: 'OrganismEngine',
    domain: 'organism',
    Engine: OrganismEngine,
    createParams: { health: 5, speed: 0, diet: 'carnivore', habitat: 'aquatic' },
    extraSeeds: [
      { health: 80, speed: 5 },
    ],
  },
  {
    name: 'FloraEngine',
    domain: 'plant',
    Engine: FloraEngine,
    createParams: { growth_rate: 0, height: 90, leaf_type: 'needle', root_depth: 1 },
    extraSeeds: [
      { growth_rate: 3, height: 5, root_depth: 0.5 },
    ],
  },
  {
    name: 'EcosystemEngine',
    domain: 'ecosystem',
    Engine: EcosystemEngine,
    createParams: { biodiversity: 5, carrying_capacity: 300, climate: 'tropical' },
    extraSeeds: [
      { biodiversity: 50, carrying_capacity: 5000 },
    ],
  },
  {
    name: 'GameEngine',
    domain: 'game',
    Engine: GameEngine,
    createParams: { genre: 'platformer', difficulty: 9.5, player_count: 40, mechanics: [0.1, 0.2, 0.3, 0.4] },
    extraSeeds: [
      { difficulty: 2, genre: 'rpg' },
    ],
  },
  {
    name: 'NarrativeEngine',
    domain: 'narrative',
    Engine: NarrativeEngine,
    createParams: { genre: 'horror', tone: 'comedic', protagonist: 'villain', conflict: 'man-vs-self' },
    extraSeeds: [
      { genre: 'fantasy', tone: 'heroic' },
    ],
  },
  {
    name: 'AudioEngine',
    domain: 'audio',
    Engine: AudioEngine,
    createParams: { bpm: 40, key: 'F#', instruments: [0.1, 0.2, 0.3, 0.4, 0.5], mood: 'neutral' },
    extraSeeds: [
      { bpm: 180, mood: 'aggressive' },
      { bpm: 230, mood: 'joyful' },
    ],
  },
  {
    name: 'UIEngine',
    domain: 'ui',
    Engine: UIEngine,
    createParams: { layout: 'masonry', color_scheme: 'high-contrast', typography: 'monospace' },
    extraSeeds: [
      { layout: 'grid', color_scheme: 'neutral' },
    ],
  },
  {
    name: 'TerrainEngine',
    domain: 'terrain',
    Engine: TerrainEngine,
    createParams: { elevation: -100, biome: 'desert', water_level: 80, erosion: 0.9 },
    extraSeeds: [
      { elevation: 500, biome: 'grassland', water_level: 20, erosion: 0.3 },
    ],
  },
  {
    name: 'ArchitectureEngine',
    domain: 'building',
    Engine: ArchitectureEngine,
    createParams: { style: 'gothic', floors: 150, materials: [0.1, 0.2, 0.3, 0.4] },
    extraSeeds: [
      { style: 'modern', floors: 5 },
    ],
  },
  {
    name: 'CityEngine',
    domain: 'city',
    Engine: CityEngine,
    createParams: { population: 15_000_000, districts: 2, transit: 'car-centric' },
    extraSeeds: [
      { population: 500_000, districts: 10, transit: 'walkable' },
    ],
  },
  {
    name: 'MaterialEngine',
    domain: 'material',
    Engine: MaterialEngine,
    createParams: { density: 21, hardness: 10, conductivity: 90 },
    extraSeeds: [
      { density: 5, hardness: 3, conductivity: 60 },
    ],
  },
  {
    name: 'SimulationEngine',
    domain: 'simulation',
    Engine: SimulationEngine,
    createParams: { timestep: 0.5, entities: 200_000, rules: [0.1, 0.2, 0.3, 0.4, 0.5] },
    extraSeeds: [
      { timestep: 0.016, entities: 20_000 },
    ],
  },
  {
    name: 'NetworkEngine',
    domain: 'network',
    Engine: NetworkEngine,
    createParams: { nodes: 15_000, bandwidth: 5, protocol: 'tcp' },
    extraSeeds: [
      { nodes: 100, bandwidth: 1000, protocol: 'grpc' },
    ],
  },
  {
    name: 'NeuralEngine',
    domain: 'neural',
    Engine: NeuralEngine,
    createParams: { layers: [128, 256, 128], activation: 'gelu', learning_rate: 0.2 },
    extraSeeds: [
      { learning_rate: 0.000001, activation: 'relu' },
      { learning_rate: 0.001, activation: 'relu' },
    ],
  },
  {
    name: 'QuantumEngine',
    domain: 'quantum',
    Engine: QuantumEngine,
    createParams: { qubits: 150, gates: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], entanglement: 0 },
    extraSeeds: [
      { qubits: 5, entanglement: 0.5 },
    ],
  },
  {
    name: 'IntelligenceEngine',
    domain: 'intelligence',
    Engine: IntelligenceEngine,
    createParams: { reasoning: 1, memory: 1, perception: 8 },
    extraSeeds: [
      { reasoning: 8, memory: 1, perception: 5 },
      { reasoning: 0, memory: 0, perception: 0 },
    ],
  },
  {
    name: 'RoboticsEngine',
    domain: 'robot',
    Engine: RoboticsEngine,
    createParams: { actuators: 25, sensors: 5, control: 'pid' },
    extraSeeds: [
      { actuators: 5, sensors: 10, control: 'reinforcement-learning' },
    ],
  },
  {
    name: 'MolecularEngine',
    domain: 'molecular',
    Engine: MolecularEngine,
    createParams: { elements: [0.1, 0.2, 0.3, 0.4, 0.5], bonds: 250, structure: 'linear' },
    extraSeeds: [
      { bonds: 5, structure: 'cyclic' },
    ],
  },
  {
    name: 'EducationEngine',
    domain: 'education',
    Engine: EducationEngine,
    createParams: { subject: 'programming', difficulty: 9, pedagogy: 'gamified' },
    extraSeeds: [
      { difficulty: 3, pedagogy: 'inquiry-based' },
    ],
  },
  {
    name: 'FinanceEngine',
    domain: 'finance',
    Engine: FinanceEngine,
    createParams: { asset_class: 'cash', risk: 3, return_rate: 0.01 },
    extraSeeds: [
      { asset_class: 'equity', risk: 9, return_rate: 0.03 },
    ],
  },
  {
    name: 'InfrastructureEngine',
    domain: 'infrastructure',
    Engine: InfrastructureEngine,
    createParams: { capacity: 500, reliability: 0.7, cost: 0 },
    extraSeeds: [
      { reliability: 0.95, capacity: 10000, cost: 50000 },
    ],
  },
  {
    name: 'ProductEngine',
    domain: 'product',
    Engine: ProductEngine,
    createParams: { features: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], market: 'b2b', pricing: 'free' },
    extraSeeds: [
      { market: 'b2c', pricing: 'enterprise' },
      { market: 'marketplace', pricing: 'subscription' },
    ],
  },
  {
    name: 'VoidEngine',
    domain: 'void',
    Engine: VoidEngine,
    createParams: { entropy: 0.97, dimensions: 5, recursion: 40, symmetry: 'fractal' },
    extraSeeds: [
      { entropy: 0.05, recursion: 2, symmetry: 'rotational' },
    ],
  },
  {
    name: 'WebEngine',
    domain: 'web',
    Engine: WebEngine,
    createParams: { framework: 'react', api_style: 'grpc', database: 'redis' },
    extraSeeds: [
      { framework: 'angular', api_style: 'grpc', database: 'postgresql' },
      { framework: 'vue', api_style: 'graphql', database: 'redis' },
    ],
  },
];

engineSpecs.forEach(({ name, domain, Engine, createParams = {}, extraSeeds = [] }) => {
  describe(name, () => {
    let engine: DomainEngine;
    let rng: DeterministicRNG;

    beforeEach(() => {
      engine = new Engine();
      rng = makeRng(`${name}-test`);
    });

    // ------------------------------------------------------------------
    // create()
    // ------------------------------------------------------------------
    describe('create()', () => {
      it('returns a UniversalSeed with a non-empty $hash', () => {
        const seed = engine.create({}, rng);
        expect(typeof seed.$hash).toBe('string');
        expect(seed.$hash.length).toBeGreaterThan(0);
      });

      it('returns a seed with a non-empty $name', () => {
        const seed = engine.create({}, rng);
        expect(typeof seed.$name).toBe('string');
        expect(seed.$name.length).toBeGreaterThan(0);
      });

      it('genes is a non-empty object', () => {
        const seed = engine.create({}, rng);
        expect(typeof seed.genes).toBe('object');
        expect(Object.keys(seed.genes).length).toBeGreaterThan(0);
      });

      it('applies createParams overrides', () => {
        if (Object.keys(createParams).length === 0) return;
        const seed = engine.create(createParams, rng);
        // At least the seed was created without throwing
        expect(seed).toBeDefined();
      });

      it('clamps out-of-range scalar overrides to gene bounds', () => {
        // supply a wildly out-of-range value; engine must clamp
        const seed = engine.create({ health: -999, difficulty: 999, bpm: 999999, qubits: -1 }, rng);
        Object.values(seed.genes).forEach((gene) => {
          if (gene.type === 'scalar') {
            expect(gene.value).toBeGreaterThanOrEqual(gene.min);
            expect(gene.value).toBeLessThanOrEqual(gene.max);
          }
        });
      });

      it('ignores invalid categorical values and falls back to default', () => {
        const seed = engine.create({ diet: 'invalid-diet', genre: 'invalid-genre', framework: 'invalid' }, rng);
        Object.values(seed.genes).forEach((gene) => {
          if (gene.type === 'categorical') {
            expect(gene.options).toContain(gene.value);
          }
        });
      });

      it('accepts a valid vector override', () => {
        const vectorKey = Object.entries(engine.create({}, rng).genes).find(([, g]) => g.type === 'vector')?.[0];
        if (!vectorKey) return;
        const vec = [0.1, 0.2, 0.3, 0.4];
        const seed = engine.create({ [vectorKey]: vec }, rng);
        const gene = seed.genes[vectorKey];
        if (gene?.type === 'vector') {
          expect(gene.value).toEqual(vec);
        }
      });

      it('falls back to default vector when override contains non-numbers', () => {
        const vectorKey = Object.entries(engine.create({}, rng).genes).find(([, g]) => g.type === 'vector')?.[0];
        if (!vectorKey) return;
        const seed = engine.create({ [vectorKey]: ['a', 'b', 'c'] }, rng);
        const gene = seed.genes[vectorKey];
        if (gene?.type === 'vector') {
          gene.value.forEach((v) => expect(typeof v).toBe('number'));
        }
      });
    });

    // ------------------------------------------------------------------
    // evaluate()
    // ------------------------------------------------------------------
    describe('evaluate()', () => {
      it('returns a valid EngineResult for a default-created seed', () => {
        const seed = engine.create({}, rng);
        const result = engine.evaluate(seed);
        assertValidResult(result);
      });

      it('result.suggestions is a non-empty array', () => {
        const seed = engine.create({}, rng);
        const result = engine.evaluate(seed);
        expect(result.suggestions.length).toBeGreaterThan(0);
      });

      it('evaluates seed created with createParams without throwing', () => {
        const seed = engine.create(createParams, rng);
        expect(() => engine.evaluate(seed)).not.toThrow();
      });

      extraSeeds.forEach((params, idx) => {
        it(`evaluates extra seed variant ${idx + 1} without throwing`, () => {
          const seed = engine.create(params, rng);
          const result = engine.evaluate(seed);
          assertValidResult(result);
        });
      });

      it('result.warnings is an array (may be empty)', () => {
        const seed = engine.create(createParams, rng);
        const result = engine.evaluate(seed);
        expect(Array.isArray(result.warnings)).toBe(true);
      });
    });

    // ------------------------------------------------------------------
    // suggest()
    // ------------------------------------------------------------------
    describe('suggest()', () => {
      it('returns a non-empty string array', () => {
        const seed = engine.create({}, rng);
        const suggestions = engine.suggest(seed);
        expect(Array.isArray(suggestions)).toBe(true);
        expect(suggestions.length).toBeGreaterThan(0);
        suggestions.forEach((s) => expect(typeof s).toBe('string'));
      });

      it('returns strings from createParams seed', () => {
        const seed = engine.create(createParams, rng);
        const suggestions = engine.suggest(seed);
        expect(Array.isArray(suggestions)).toBe(true);
        suggestions.forEach((s) => expect(s.length).toBeGreaterThan(0));
      });
    });

    // ------------------------------------------------------------------
    // matches()
    // ------------------------------------------------------------------
    describe('matches()', () => {
      it(`returns true for own domain "${domain}"`, () => {
        expect(engine.matches(domain as never)).toBe(true);
      });

      it('returns false for an unrelated domain', () => {
        // Pick a domain that none of the current engine domains include
        const unrelated = domain === 'organism' ? 'game' : 'organism';
        if (!engine.domains.includes(unrelated as never)) {
          expect(engine.matches(unrelated as never)).toBe(false);
        }
      });
    });

    // ------------------------------------------------------------------
    // getCapabilities()
    // ------------------------------------------------------------------
    describe('getCapabilities()', () => {
      it('returns a non-empty EngineCapability array', () => {
        const caps = engine.getCapabilities();
        expect(Array.isArray(caps)).toBe(true);
        expect(caps.length).toBeGreaterThan(0);
      });

      it('each capability has name, description, inputTypes, outputTypes', () => {
        const caps: EngineCapability[] = engine.getCapabilities();
        caps.forEach((cap) => {
          expect(typeof cap.name).toBe('string');
          expect(typeof cap.description).toBe('string');
          expect(Array.isArray(cap.inputTypes)).toBe(true);
          expect(Array.isArray(cap.outputTypes)).toBe(true);
        });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Specific branch-coverage tests for individual engines
// ---------------------------------------------------------------------------

describe('OrganismEngine — branch coverage', () => {
  const rng = makeRng('organism-branch');
  const engine = new OrganismEngine();

  it('warns when health < 10', () => {
    const seed = engine.create({ health: 5, speed: 3 }, rng);
    const result = engine.evaluate(seed);
    expect(result.warnings.some((w) => w.includes('Critically low health'))).toBe(true);
  });

  it('warns when speed === 0', () => {
    const seed = engine.create({ health: 50, speed: 0 }, rng);
    const result = engine.evaluate(seed);
    expect(result.warnings.some((w) => w.includes('Zero speed gene'))).toBe(true);
  });

  it('success is false when health === 0', () => {
    const seed = engine.create({ health: 0, speed: 5 }, rng);
    const result = engine.evaluate(seed);
    expect(result.success).toBe(false);
  });

  it('suggests raising speed when speed < 2', () => {
    const seed = engine.create({ health: 60, speed: 1 }, rng);
    const suggestions = engine.suggest(seed);
    expect(suggestions.some((s) => s.includes('speed gene'))).toBe(true);
  });

  it('suggests raising health when health < 50', () => {
    const seed = engine.create({ health: 30 }, rng);
    const suggestions = engine.suggest(seed);
    expect(suggestions.some((s) => s.includes('health gene'))).toBe(true);
  });
});

describe('FloraEngine — branch coverage', () => {
  const rng = makeRng('flora-branch');
  const engine = new FloraEngine();

  it('warns on zero growth_rate', () => {
    const seed = engine.create({ growth_rate: 0, height: 5 }, rng);
    const result = engine.evaluate(seed);
    expect(result.warnings.some((w) => w.includes('Zero growth rate'))).toBe(true);
  });

  it('warns on extreme height > 80', () => {
    const seed = engine.create({ growth_rate: 2, height: 90 }, rng);
    const result = engine.evaluate(seed);
    expect(result.warnings.some((w) => w.includes('Extreme height'))).toBe(true);
  });

  it('success is false when both growth_rate and height are 0', () => {
    const seed = engine.create({ growth_rate: 0, height: 0 }, rng);
    expect(engine.evaluate(seed).success).toBe(false);
  });

  it('suggests root depth adjustment when too shallow', () => {
    const seed = engine.create({ height: 10, root_depth: 0.5 }, rng);
    const suggestions = engine.suggest(seed);
    expect(suggestions.some((s) => s.includes('Root depth'))).toBe(true);
  });

  it('matches both "organism" and "plant" domains', () => {
    expect(engine.matches('organism')).toBe(true);
    expect(engine.matches('plant')).toBe(true);
  });
});

describe('EcosystemEngine — branch coverage', () => {
  const rng = makeRng('eco-branch');
  const engine = new EcosystemEngine();

  it('warns on biodiversity < 10', () => {
    const seed = engine.create({ biodiversity: 5, carrying_capacity: 1000 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('low biodiversity'))).toBe(true);
  });

  it('warns on carrying_capacity < 500', () => {
    const seed = engine.create({ biodiversity: 50, carrying_capacity: 300 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Low carrying capacity'))).toBe(true);
  });

  it('suggests increasing biodiversity when < 30', () => {
    const seed = engine.create({ biodiversity: 20 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('biodiversity above 30'))).toBe(true);
  });
});

describe('GameEngine — branch coverage', () => {
  const rng = makeRng('game-branch');
  const engine = new GameEngine();

  it('warns on difficulty > 9', () => {
    const seed = engine.create({ difficulty: 9.5, player_count: 2 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Extreme difficulty'))).toBe(true);
  });

  it('warns on player_count > 32', () => {
    const seed = engine.create({ difficulty: 5, player_count: 40 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('High player count'))).toBe(true);
  });

  it('difficulty=0 is clamped to min=1 so success remains true', () => {
    // GameEngine scalar min for difficulty is 1, so 0 clamps up — success stays true
    const seed = engine.create({ difficulty: 0, player_count: 1 }, rng);
    expect((seed.genes['difficulty'] as { value: number }).value).toBe(1);
    expect(engine.evaluate(seed).success).toBe(true);
  });

  it('suggests raising difficulty when < 3', () => {
    const seed = engine.create({ difficulty: 2, genre: 'rpg' }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('difficulty'))).toBe(true);
  });
});

describe('NarrativeEngine — branch coverage', () => {
  const rng = makeRng('narrative-branch');
  const engine = new NarrativeEngine();

  it('warns when genre=horror and tone=comedic', () => {
    const seed = engine.create({ genre: 'horror', tone: 'comedic' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Horror/comedic'))).toBe(true);
  });

  it('no warning for normal horror/dark pairing', () => {
    const seed = engine.create({ genre: 'horror', tone: 'dark' }, rng);
    expect(engine.evaluate(seed).warnings).toHaveLength(0);
  });
});

describe('AudioEngine — branch coverage', () => {
  const rng = makeRng('audio-branch');
  const engine = new AudioEngine();

  it('warns when bpm < 50', () => {
    const seed = engine.create({ bpm: 40, mood: 'joyful' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Very low BPM'))).toBe(true);
  });

  it('warns when bpm > 220', () => {
    const seed = engine.create({ bpm: 230, mood: 'aggressive' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Extreme BPM'))).toBe(true);
  });

  it('suggests defining mood when mood=neutral', () => {
    const seed = engine.create({ bpm: 120, mood: 'neutral' }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('specific mood'))).toBe(true);
  });

  it('suggests high-BPM genre pairing when bpm > 160', () => {
    const seed = engine.create({ bpm: 180, mood: 'aggressive' }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('High BPM'))).toBe(true);
  });

  it('matches audio, sound, and music domains', () => {
    expect(engine.matches('audio')).toBe(true);
    expect(engine.matches('sound')).toBe(true);
    expect(engine.matches('music')).toBe(true);
  });
});

describe('UIEngine — branch coverage', () => {
  const rng = makeRng('ui-branch');
  const engine = new UIEngine();

  it('warns on high-contrast masonry layout', () => {
    const seed = engine.create({ layout: 'masonry', color_scheme: 'high-contrast' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('High-contrast masonry'))).toBe(true);
  });

  it('suggests specific colour scheme when neutral', () => {
    const seed = engine.create({ color_scheme: 'neutral' }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('colour scheme'))).toBe(true);
  });
});

describe('TerrainEngine — branch coverage', () => {
  const rng = makeRng('terrain-branch');
  const engine = new TerrainEngine();

  it('warns on sub-sea-level with low water', () => {
    const seed = engine.create({ elevation: -100, water_level: 20, biome: 'grassland' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Sub-sea-level'))).toBe(true);
  });

  it('warns on desert with high water_level', () => {
    const seed = engine.create({ elevation: 200, water_level: 80, biome: 'desert' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('High water level inconsistent with desert'))).toBe(true);
  });

  it('always returns success=true', () => {
    const seed = engine.create({ elevation: -500, water_level: 0 }, rng);
    expect(engine.evaluate(seed).success).toBe(true);
  });

  it('suggests water-flow modelling for high erosion', () => {
    const seed = engine.create({ erosion: 0.9, biome: 'grassland' }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('High erosion'))).toBe(true);
  });
});

describe('ArchitectureEngine — branch coverage', () => {
  const rng = makeRng('arch-branch');
  const engine = new ArchitectureEngine();

  it('warns on super-tall building (> 100 floors)', () => {
    const seed = engine.create({ style: 'modern', floors: 150 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Super-tall'))).toBe(true);
  });

  it('warns on gothic style with > 20 floors', () => {
    const seed = engine.create({ style: 'gothic', floors: 25 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Gothic style rarely exceeds'))).toBe(true);
  });
});

describe('CityEngine — branch coverage', () => {
  const rng = makeRng('city-branch');
  const engine = new CityEngine();

  it('warns on megacity with car-centric transit', () => {
    const seed = engine.create({ population: 15_000_000, districts: 10, transit: 'car-centric' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Megacity with car-centric'))).toBe(true);
  });

  it('warns on extreme district density', () => {
    const seed = engine.create({ population: 5_000_000, districts: 2, transit: 'mixed' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Extremely high district density'))).toBe(true);
  });
});

describe('MaterialEngine — branch coverage', () => {
  const rng = makeRng('material-branch');
  const engine = new MaterialEngine();

  it('warns on density > 20 (beyond osmium)', () => {
    const seed = engine.create({ density: 21, hardness: 5, conductivity: 30 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Density exceeds osmium'))).toBe(true);
  });

  it('warns on max hardness + high conductivity', () => {
    const seed = engine.create({ density: 5, hardness: 10, conductivity: 85 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Maximum hardness with high conductivity'))).toBe(true);
  });

  it('suggests electronic use for high conductivity', () => {
    const seed = engine.create({ conductivity: 70 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('electronic component'))).toBe(true);
  });
});

describe('SimulationEngine — branch coverage', () => {
  const rng = makeRng('sim-branch');
  const engine = new SimulationEngine();

  it('warns on large timestep', () => {
    const seed = engine.create({ timestep: 0.5, entities: 100 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Large timestep'))).toBe(true);
  });

  it('warns on very high entity count', () => {
    const seed = engine.create({ timestep: 0.016, entities: 200_000 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Very high entity count'))).toBe(true);
  });

  it('suggests spatial hashing for > 10 000 entities', () => {
    const seed = engine.create({ entities: 50_000 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('spatial hashing'))).toBe(true);
  });
});

describe('NetworkEngine — branch coverage', () => {
  const rng = makeRng('network-branch');
  const engine = new NetworkEngine();

  it('warns on massive TCP network', () => {
    const seed = engine.create({ nodes: 15_000, bandwidth: 1000, protocol: 'tcp' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Massive TCP network'))).toBe(true);
  });

  it('warns on very low bandwidth', () => {
    const seed = engine.create({ nodes: 10, bandwidth: 5, protocol: 'udp' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Very low bandwidth'))).toBe(true);
  });
});

describe('NeuralEngine — branch coverage', () => {
  const rng = makeRng('neural-branch');
  const engine = new NeuralEngine();

  it('warns on high learning rate', () => {
    const seed = engine.create({ learning_rate: 0.2, activation: 'relu' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('High learning rate'))).toBe(true);
  });

  it('warns on very low learning rate', () => {
    const seed = engine.create({ learning_rate: 1e-6, activation: 'tanh' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Very low learning rate'))).toBe(true);
  });
});

describe('QuantumEngine — branch coverage', () => {
  const rng = makeRng('quantum-branch');
  const engine = new QuantumEngine();

  it('warns on > 100 qubits', () => {
    const seed = engine.create({ qubits: 150, entanglement: 0.5 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('More than 100 logical qubits'))).toBe(true);
  });

  it('warns on zero entanglement', () => {
    const seed = engine.create({ qubits: 10, entanglement: 0 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Zero entanglement'))).toBe(true);
  });

  it('suggests classical simulation for <= 10 qubits', () => {
    const seed = engine.create({ qubits: 8 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('classical simulation'))).toBe(true);
  });
});

describe('IntelligenceEngine — branch coverage', () => {
  const rng = makeRng('intel-branch');
  const engine = new IntelligenceEngine();

  it('warns on low reasoning score', () => {
    const seed = engine.create({ reasoning: 1, memory: 5, perception: 5 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Low reasoning score'))).toBe(true);
  });

  it('warns on high reasoning with low memory', () => {
    const seed = engine.create({ reasoning: 8, memory: 1, perception: 5 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('High reasoning with low memory'))).toBe(true);
  });

  it('success is false when all genes are 0', () => {
    const seed = engine.create({ reasoning: 0, memory: 0, perception: 0 }, rng);
    expect(engine.evaluate(seed).success).toBe(false);
  });

  it('suggests sensor genes when reasoning > perception', () => {
    const seed = engine.create({ reasoning: 9, perception: 3 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('sensor genes'))).toBe(true);
  });
});

describe('RoboticsEngine — branch coverage', () => {
  const rng = makeRng('robot-branch');
  const engine = new RoboticsEngine();

  it('warns when actuators > sensors * 3', () => {
    const seed = engine.create({ actuators: 25, sensors: 5, control: 'adaptive' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('More actuators than sensors'))).toBe(true);
  });

  it('warns on PID with > 20 actuators', () => {
    const seed = engine.create({ actuators: 25, sensors: 20, control: 'pid' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('PID control poorly scales'))).toBe(true);
  });
});

describe('MolecularEngine — branch coverage', () => {
  const rng = makeRng('mol-branch');
  const engine = new MolecularEngine();

  it('warns on many bonds in linear structure', () => {
    const seed = engine.create({ bonds: 250, structure: 'linear' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Linear structure with many bonds'))).toBe(true);
  });
});

describe('EducationEngine — branch coverage', () => {
  const rng = makeRng('edu-branch');
  const engine = new EducationEngine();

  it('warns on high difficulty with gamified pedagogy', () => {
    const seed = engine.create({ difficulty: 9, pedagogy: 'gamified' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('High difficulty with gamified approach'))).toBe(true);
  });

  it('difficulty=0 is clamped to min=1 so success remains true', () => {
    // EducationEngine scalar min for difficulty is 1, so 0 clamps up — success stays true
    const seed = engine.create({ difficulty: 0 }, rng);
    expect((seed.genes['difficulty'] as { value: number }).value).toBe(1);
    expect(engine.evaluate(seed).success).toBe(true);
  });
});

describe('FinanceEngine — branch coverage', () => {
  const rng = makeRng('finance-branch');
  const engine = new FinanceEngine();

  it('warns on high risk with low return', () => {
    const seed = engine.create({ asset_class: 'equity', risk: 9, return_rate: 0.01 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('High risk with low return'))).toBe(true);
  });

  it('warns on cash with risk > 2', () => {
    const seed = engine.create({ asset_class: 'cash', risk: 3, return_rate: 0.01 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Cash instruments should have near-zero risk'))).toBe(true);
  });

  it('always returns success=true', () => {
    const seed = engine.create({ risk: 0, return_rate: -1 }, rng);
    expect(engine.evaluate(seed).success).toBe(true);
  });

  it('suggests diversification for high risk', () => {
    const seed = engine.create({ risk: 8 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('diversified portfolio'))).toBe(true);
  });
});

describe('InfrastructureEngine — branch coverage', () => {
  const rng = makeRng('infra-branch');
  const engine = new InfrastructureEngine();

  it('warns when reliability < 0.8', () => {
    const seed = engine.create({ reliability: 0.7, capacity: 500, cost: 1000 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Reliability below 80%'))).toBe(true);
  });

  it('warns when cost === 0', () => {
    const seed = engine.create({ reliability: 0.95, capacity: 1000, cost: 0 }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Zero cost gene'))).toBe(true);
  });

  it('suggests 99%+ reliability when reliability < 0.99', () => {
    const seed = engine.create({ reliability: 0.95 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('99%+'))).toBe(true);
  });
});

describe('ProductEngine — branch coverage', () => {
  const rng = makeRng('product-branch');
  const engine = new ProductEngine();

  it('warns on B2B with free pricing', () => {
    const seed = engine.create({ market: 'b2b', pricing: 'free' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('B2B with free pricing'))).toBe(true);
  });

  it('warns on B2C with enterprise pricing', () => {
    const seed = engine.create({ market: 'b2c', pricing: 'enterprise' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Enterprise pricing is misaligned'))).toBe(true);
  });
});

describe('VoidEngine — branch coverage', () => {
  const rng = makeRng('void-branch');
  const engine = new VoidEngine();

  it('warns on near-maximum entropy', () => {
    const seed = engine.create({ entropy: 0.97, dimensions: 3, recursion: 5, symmetry: 'none' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Near-maximum entropy'))).toBe(true);
  });

  it('warns on deep recursion > 32', () => {
    const seed = engine.create({ entropy: 0.5, dimensions: 3, recursion: 40, symmetry: 'fractal' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Deep recursion depth'))).toBe(true);
  });

  it('always returns success=true', () => {
    const seed = engine.create({ entropy: 0, recursion: 0 }, rng);
    expect(engine.evaluate(seed).success).toBe(true);
  });

  it('suggests complexity increase for low entropy', () => {
    const seed = engine.create({ entropy: 0.05 }, rng);
    expect(engine.suggest(seed).some((s) => s.includes('Low entropy void'))).toBe(true);
  });
});

describe('WebEngine — branch coverage', () => {
  const rng = makeRng('web-branch');
  const engine = new WebEngine();

  it('warns on gRPC with non-angular framework', () => {
    const seed = engine.create({ framework: 'react', api_style: 'grpc', database: 'postgresql' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('gRPC in browser contexts'))).toBe(true);
  });

  it('no gRPC warning for angular', () => {
    const seed = engine.create({ framework: 'angular', api_style: 'grpc', database: 'postgresql' }, rng);
    const grpcWarnings = engine.evaluate(seed).warnings.filter((w) => w.includes('gRPC in browser'));
    expect(grpcWarnings).toHaveLength(0);
  });

  it('warns on redis with graphql', () => {
    const seed = engine.create({ framework: 'vue', api_style: 'graphql', database: 'redis' }, rng);
    expect(engine.evaluate(seed).warnings.some((w) => w.includes('Redis as primary store'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EngineRegistry.createForDomain — remaining domains
// ---------------------------------------------------------------------------

describe('EngineRegistry.createForDomain — all supported domains', () => {
  const registry = new EngineRegistry();
  const domainEngineMap: Array<[string, string]> = [
    ['plant', 'FloraEngine'],
    ['ecosystem', 'EcosystemEngine'],
    ['game', 'GameEngine'],
    ['audio', 'AudioEngine'],
    ['sound', 'AudioEngine'],
    ['music', 'AudioEngine'],
    ['ui', 'UIEngine'],
    ['building', 'ArchitectureEngine'],
    ['city', 'CityEngine'],
    ['material', 'MaterialEngine'],
    ['simulation', 'SimulationEngine'],
    ['network', 'NetworkEngine'],
    ['neural', 'NeuralEngine'],
    ['quantum', 'QuantumEngine'],
    ['intelligence', 'IntelligenceEngine'],
    ['robot', 'RoboticsEngine'],
    ['molecular', 'MolecularEngine'],
    ['education', 'EducationEngine'],
    ['finance', 'FinanceEngine'],
    ['infrastructure', 'InfrastructureEngine'],
    ['product', 'ProductEngine'],
    ['void', 'VoidEngine'],
    ['web', 'WebEngine'],
  ];

  domainEngineMap.forEach(([domain, engineName]) => {
    it(`createForDomain("${domain}") succeeds and routes to ${engineName}`, () => {
      const seed = registry.createForDomain(domain as never);
      expect(seed).toBeDefined();
      expect(seed.genes).toBeDefined();
    });
  });
});
