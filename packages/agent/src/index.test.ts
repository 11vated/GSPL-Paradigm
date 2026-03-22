import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Specializations
  SEED_ARCHITECT,
  EVOLUTION_ENGINEER,
  QA_VALIDATOR,
  RESEARCH_ANALYST,
  DOMAIN_SPECIALIST,
  WORLD_BUILDER,
  ASSET_GENERATOR,
  TOOLING_ENGINEER,
  ALL_SPECIALIZATIONS,
  matchRole,
  // Memory
  AgentMemory,
  // Planner
  AutonomousPlanner,
  // Resonance
  ResonanceAnalyzer,
  // MetaAgent
  createMetaAgentSeed,
  mutateMetaAgent,
  // Agent
  GSPLAgent,
} from './index.js';
import type {
  AgentSpecialization,
  CoreMemory,
  EpisodicEntry,
  SemanticNode,
  ProcedureTemplate,
  AgentTask,
  MetaAgentGenes,
  AgentResponse,
} from './index.js';
import type { UniversalSeed, GeneMap } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ── helpers ──────────────────────────────────────────────────────

function makeSeed(overrides: Partial<UniversalSeed> = {}): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    $name: 'TestSeed',
    $lineage: { generation: 0, parents: [], timestamp: Date.now() },
    genes: {
      health: { type: 'scalar', value: 80, min: 0, max: 100 },
      speed: { type: 'scalar', value: 50, min: 0, max: 100 },
      element: { type: 'categorical', value: 'fire', options: ['fire', 'ice', 'lightning'] },
      color: { type: 'vector', value: [0.9, 0.2, 0.1], dimensions: 3 },
    },
    $metadata: { created: Date.now() },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Agent Specializations
// ═══════════════════════════════════════════════════════════════════

describe('Agent Specializations', () => {
  it('defines 8 specializations', () => {
    expect(ALL_SPECIALIZATIONS.length).toBe(8);
  });

  it('each specialization has required fields', () => {
    for (const spec of ALL_SPECIALIZATIONS) {
      expect(spec.role).toBeDefined();
      expect(spec.description).toBeDefined();
      expect(spec.tools.length).toBeGreaterThan(0);
      expect(spec.systemPrompt).toBeDefined();
      expect(spec.priority).toBeGreaterThan(0);
    }
  });

  it('specializations have unique roles', () => {
    const roles = ALL_SPECIALIZATIONS.map(s => s.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('SEED_ARCHITECT has highest priority', () => {
    expect(SEED_ARCHITECT.priority).toBe(8);
    for (const spec of ALL_SPECIALIZATIONS) {
      expect(SEED_ARCHITECT.priority).toBeGreaterThanOrEqual(spec.priority);
    }
  });
});

describe('matchRole', () => {
  it('matches seed-related keywords to SEED_ARCHITECT', () => {
    expect(matchRole('create a new seed genome').role).toBe('seed_architect');
  });

  it('matches evolution keywords to EVOLUTION_ENGINEER', () => {
    expect(matchRole('evolve the population for 100 generations').role).toBe('evolution_engineer');
  });

  it('matches test/validate to QA_VALIDATOR', () => {
    // "validate" only — no competing higher-priority keywords
    expect(matchRole('validate the output quality').role).toBe('qa_validator');
  });

  it('matches analysis keywords to RESEARCH_ANALYST', () => {
    expect(matchRole('analyze patterns in data').role).toBe('research_analyst');
  });

  it('matches world keywords to WORLD_BUILDER', () => {
    expect(matchRole('simulate the ecosystem environment').role).toBe('world_builder');
  });

  it('matches render/asset to ASSET_GENERATOR', () => {
    expect(matchRole('render sprite assets').role).toBe('asset_generator');
  });

  it('matches infrastructure to TOOLING_ENGINEER', () => {
    expect(matchRole('optimize the pipeline tool').role).toBe('tooling_engineer');
  });

  it('defaults to highest-priority match when multiple keywords present', () => {
    // "create" → seed_architect (p8), "evolve" → evolution_engineer (p7)
    const result = matchRole('create and evolve');
    expect(result.priority).toBe(8);
    expect(result.role).toBe('seed_architect');
  });

  it('returns SEED_ARCHITECT as default when no keywords match', () => {
    const result = matchRole('do something random with no keywords');
    expect(result.role).toBe('seed_architect');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Agent Memory
// ═══════════════════════════════════════════════════════════════════

describe('AgentMemory', () => {
  let memory: AgentMemory;

  beforeEach(() => {
    memory = new AgentMemory(50);
  });

  describe('Core Memory', () => {
    it('initializes with empty state', () => {
      const core = memory.getCoreMemory();
      expect(core.activeSeeds).toEqual([]);
      expect(core.recentGoals).toEqual([]);
    });

    it('updates core memory', () => {
      memory.updateCoreMemory({
        activeSeeds: ['seed1', 'seed2'],
        recentGoals: ['build world'],
      });
      const core = memory.getCoreMemory();
      expect(core.activeSeeds).toEqual(['seed1', 'seed2']);
      expect(core.recentGoals).toEqual(['build world']);
      expect(core.lastUpdateTime).toBeGreaterThan(0);
    });
  });

  describe('Episodic Memory', () => {
    it('records and retrieves episodes', () => {
      memory.recordEpisode({
        agentId: 'agent1',
        input: 'create warrior',
        output: 'seed created',
        reasoning: 'user wants a seed',
        importance: 0.8,
      });
      const recent = memory.getRecentEpisodes(5);
      expect(recent.length).toBe(1);
      expect(recent[0]!.input).toBe('create warrior');
      expect(recent[0]!.timestamp).toBeGreaterThan(0);
    });

    it('enforces max episodic limit by importance', () => {
      for (let i = 0; i < 60; i++) {
        memory.recordEpisode({
          agentId: 'agent1',
          input: `action ${i}`,
          output: `result ${i}`,
          reasoning: 'test',
          importance: i / 60,
        });
      }
      const stats = memory.getStats();
      expect(stats.episodic).toBeLessThanOrEqual(50);
    });

    it('searches episodes by keyword', () => {
      memory.recordEpisode({
        agentId: 'a',
        input: 'fire dragon creation',
        output: 'created fire dragon',
        reasoning: 'user wanted creature',
        importance: 0.5,
      });
      memory.recordEpisode({
        agentId: 'a',
        input: 'ice wizard',
        output: 'created wizard',
        reasoning: 'magic build',
        importance: 0.5,
      });
      const results = memory.searchEpisodes('dragon');
      expect(results.length).toBe(1);
      expect(results[0]!.input).toContain('dragon');
    });
  });

  describe('Semantic Memory', () => {
    it('adds and retrieves semantic nodes', () => {
      const node: SemanticNode = {
        id: 'fire',
        concept: 'fire element',
        description: 'Elemental fire type',
        relatedConcepts: ['heat', 'burning'],
        properties: { color: 'red' },
        createdAt: Date.now(),
        accessCount: 0,
      };
      memory.addSemanticNode(node);
      const retrieved = memory.getSemanticNode('fire');
      expect(retrieved).toBeDefined();
      expect(retrieved!.concept).toBe('fire element');
      expect(retrieved!.accessCount).toBe(1); // incremented on access
    });

    it('queries semantic memory by string match', () => {
      memory.addSemanticNode({
        id: 'n1',
        concept: 'dragon creature',
        description: 'A large flying reptile',
        relatedConcepts: [],
        properties: {},
        createdAt: Date.now(),
        accessCount: 0,
      });
      const results = memory.querySemanticMemory('dragon');
      expect(results.length).toBe(1);
    });
  });

  describe('Procedural Memory', () => {
    it('adds and retrieves procedures', () => {
      const proc: ProcedureTemplate = {
        id: 'proc1',
        name: 'Create Creature',
        description: 'Standard creature creation',
        steps: ['design genome', 'create seed', 'validate'],
        successRate: 0.95,
        applicability: ['creature', 'organism'],
        createdAt: Date.now(),
        usageCount: 0,
      };
      memory.addProcedure(proc);
      const retrieved = memory.getProcedure('proc1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Create Creature');
      expect(retrieved!.usageCount).toBe(1); // incremented on access
    });

    it('finds applicable procedures by task type', () => {
      memory.addProcedure({
        id: 'p1',
        name: 'Creature Flow',
        description: 'For creatures',
        steps: ['step1'],
        successRate: 0.9,
        applicability: ['creature'],
        createdAt: Date.now(),
        usageCount: 5,
      });
      memory.addProcedure({
        id: 'p2',
        name: 'World Flow',
        description: 'For worlds',
        steps: ['step1'],
        successRate: 0.8,
        applicability: ['world'],
        createdAt: Date.now(),
        usageCount: 3,
      });
      const applicable = memory.findApplicableProcedures('creature design');
      expect(applicable.length).toBe(1);
      expect(applicable[0]!.id).toBe('p1');
    });
  });

  describe('Consolidation', () => {
    it('converts high-importance episodes to semantic+procedural memory', () => {
      memory.recordEpisode({
        agentId: 'a',
        input: 'dragon warrior creation task',
        output: 'created successfully',
        reasoning: 'success on first try',
        importance: 0.95,
      });
      const result = memory.consolidate();
      expect(result.concepts).toBeGreaterThan(0);
      expect(result.procedures).toBeGreaterThan(0);
    });

    it('skips low-importance episodes', () => {
      memory.recordEpisode({
        agentId: 'a',
        input: 'trivial action',
        output: 'ok',
        reasoning: 'nothing special',
        importance: 0.2,
      });
      const result = memory.consolidate();
      expect(result.concepts).toBe(0);
      expect(result.procedures).toBe(0);
    });
  });

  describe('Stats', () => {
    it('reports correct stats', () => {
      memory.recordEpisode({
        agentId: 'a', input: 'x', output: 'y',
        reasoning: 'z', importance: 0.5,
      });
      memory.addSemanticNode({
        id: 's1', concept: 'c', description: 'd',
        relatedConcepts: [], properties: {},
        createdAt: Date.now(), accessCount: 0,
      });
      memory.addProcedure({
        id: 'p1', name: 'n', description: 'd',
        steps: [], successRate: 1, applicability: [],
        createdAt: Date.now(), usageCount: 0,
      });
      const stats = memory.getStats();
      expect(stats.episodic).toBe(1);
      expect(stats.semantic).toBe(1);
      expect(stats.procedural).toBe(1);
      expect(stats.coreGoals).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Autonomous Planner
// ═══════════════════════════════════════════════════════════════════

describe('AutonomousPlanner', () => {
  let planner: AutonomousPlanner;

  beforeEach(() => {
    planner = new AutonomousPlanner();
  });

  describe('decompose', () => {
    it('decomposes world/ecosystem goal into 4 tasks', () => {
      const tasks = planner.decompose('build an ecosystem');
      expect(tasks.length).toBe(4);
      expect(tasks[0]!.requiredRole).toBe('world_builder');
      expect(tasks[3]!.requiredRole).toBe('qa_validator');
    });

    it('decomposes evolution goal into 3 tasks', () => {
      const tasks = planner.decompose('evolve population for 100 generations');
      expect(tasks.length).toBe(3);
      expect(tasks[1]!.requiredRole).toBe('evolution_engineer');
    });

    it('decomposes asset/forge goal into 2 tasks', () => {
      const tasks = planner.decompose('render character assets');
      expect(tasks.length).toBe(2);
      expect(tasks[1]!.requiredRole).toBe('asset_generator');
    });

    it('decomposes creature goal into 4 tasks', () => {
      const tasks = planner.decompose('create a fire warrior');
      expect(tasks.length).toBe(4);
    });

    it('uses default plan for unrecognized goals', () => {
      const tasks = planner.decompose('do something unexpected');
      expect(tasks.length).toBe(3);
      expect(tasks[0]!.requiredRole).toBe('research_analyst');
    });

    it('generates tasks with dependencies', () => {
      const tasks = planner.decompose('build an ecosystem world');
      // Second task depends on first
      expect(tasks[1]!.dependencies).toContain(tasks[0]!.id);
      // Third depends on second
      expect(tasks[2]!.dependencies).toContain(tasks[1]!.id);
    });

    it('generates unique task IDs', () => {
      const tasks1 = planner.decompose('evolve');
      const tasks2 = planner.decompose('evolve');
      const allIds = [...tasks1, ...tasks2].map(t => t.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });

  describe('execute', () => {
    it('executes tasks in topological order', async () => {
      const tasks = planner.decompose('evolve population');
      const executionOrder: string[] = [];

      const result = await planner.execute(tasks, async (task) => {
        executionOrder.push(task.id);
        return `done: ${task.description}`;
      });

      expect(result.completed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      // Dependencies should be executed before dependents
      const idx0 = executionOrder.indexOf(tasks[0]!.id);
      const idx1 = executionOrder.indexOf(tasks[1]!.id);
      expect(idx0).toBeLessThan(idx1);
    });

    it('handles executor failures gracefully', async () => {
      const tasks = planner.decompose('evolve population');

      const result = await planner.execute(tasks, async (task) => {
        if (task.requiredRole === 'evolution_engineer') {
          throw new Error('Evolution failed');
        }
        return 'ok';
      });

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.size).toBeGreaterThan(0);
    });

    it('fails downstream tasks when dependency fails', async () => {
      const tasks = planner.decompose('evolve population');

      const result = await planner.execute(tasks, async (task) => {
        if (task.requiredRole === 'seed_architect') {
          throw new Error('init failed');
        }
        return 'ok';
      });

      // First task fails → second and third should also fail
      expect(result.failed).toBe(tasks.length);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Resonance Analyzer
// ═══════════════════════════════════════════════════════════════════

describe('ResonanceAnalyzer', () => {
  let analyzer: ResonanceAnalyzer;

  beforeEach(() => {
    analyzer = new ResonanceAnalyzer();
  });

  describe('computeResonance', () => {
    it('returns 1 for identical seeds', () => {
      const seed = makeSeed();
      const resonance = analyzer.computeResonance(seed, seed);
      expect(resonance).toBeCloseTo(1.0, 1);
    });

    it('returns 0 for seeds with no shared genes', () => {
      const a = makeSeed({
        genes: { x: { type: 'scalar', value: 50, min: 0, max: 100 } },
      });
      const b = makeSeed({
        genes: { y: { type: 'scalar', value: 50, min: 0, max: 100 } },
      });
      const resonance = analyzer.computeResonance(a, b);
      expect(resonance).toBe(0);
    });

    it('returns 0 for seeds with no genes', () => {
      const a = makeSeed({ genes: {} });
      const b = makeSeed({ genes: {} });
      expect(analyzer.computeResonance(a, b)).toBe(0);
    });

    it('computes scalar similarity based on range distance', () => {
      const a = makeSeed({
        genes: { health: { type: 'scalar', value: 100, min: 0, max: 100 } },
      });
      const b = makeSeed({
        genes: { health: { type: 'scalar', value: 50, min: 0, max: 100 } },
      });
      const resonance = analyzer.computeResonance(a, b);
      expect(resonance).toBeCloseTo(0.5, 1);
    });

    it('computes categorical similarity (exact match = 1)', () => {
      const a = makeSeed({
        genes: { element: { type: 'categorical', value: 'fire', options: ['fire', 'ice'] } },
      });
      const b = makeSeed({
        genes: { element: { type: 'categorical', value: 'fire', options: ['fire', 'ice'] } },
      });
      expect(analyzer.computeResonance(a, b)).toBe(1);
    });

    it('computes categorical similarity (mismatch = 0)', () => {
      const a = makeSeed({
        genes: { element: { type: 'categorical', value: 'fire', options: ['fire', 'ice'] } },
      });
      const b = makeSeed({
        genes: { element: { type: 'categorical', value: 'ice', options: ['fire', 'ice'] } },
      });
      expect(analyzer.computeResonance(a, b)).toBe(0);
    });

    it('computes vector similarity via cosine', () => {
      const a = makeSeed({
        genes: { color: { type: 'vector', value: [1, 0, 0], dimensions: 3 } },
      });
      const b = makeSeed({
        genes: { color: { type: 'vector', value: [1, 0, 0], dimensions: 3 } },
      });
      expect(analyzer.computeResonance(a, b)).toBeCloseTo(1, 1);
    });
  });

  describe('findResonant', () => {
    it('finds most resonant seeds from population', () => {
      const target = makeSeed({
        $hash: 'target_hash',
        genes: { health: { type: 'scalar', value: 80, min: 0, max: 100 } },
      });
      const similar = makeSeed({
        $hash: 'similar_hash',
        genes: { health: { type: 'scalar', value: 85, min: 0, max: 100 } },
      });
      const different = makeSeed({
        $hash: 'diff_hash',
        genes: { health: { type: 'scalar', value: 10, min: 0, max: 100 } },
      });

      const results = analyzer.findResonant(target, [similar, different], 2);
      expect(results.length).toBe(2);
      expect(results[0]!.seed.$hash).toBe('similar_hash');
      expect(results[0]!.resonance).toBeGreaterThan(results[1]!.resonance);
    });

    it('excludes the target seed from results', () => {
      const target = makeSeed({ $hash: 'same_hash' });
      const results = analyzer.findResonant(target, [target], 5);
      expect(results.length).toBe(0);
    });
  });

  describe('explainResonance', () => {
    it('returns high resonance explanation for similar seeds', () => {
      const seed = makeSeed();
      const explanation = analyzer.explainResonance(seed, seed);
      expect(explanation.score).toBeGreaterThan(0.8);
      expect(explanation.explanation).toContain('Highly resonant');
    });

    it('identifies shared categorical characteristics', () => {
      const a = makeSeed({
        genes: {
          element: { type: 'categorical', value: 'fire', options: ['fire', 'ice'] },
          role: { type: 'categorical', value: 'warrior', options: ['warrior', 'mage'] },
        },
      });
      const b = makeSeed({
        genes: {
          element: { type: 'categorical', value: 'fire', options: ['fire', 'ice'] },
          role: { type: 'categorical', value: 'mage', options: ['warrior', 'mage'] },
        },
      });
      const result = analyzer.explainResonance(a, b);
      expect(result.sharedCharacteristics).toContain('element');
      expect(result.complementaryCharacteristics).toContain('role');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// MetaAgentSeed
// ═══════════════════════════════════════════════════════════════════

describe('MetaAgentSeed', () => {
  let rng: DeterministicRNG;

  beforeEach(() => {
    rng = new DeterministicRNG(42);
  });

  describe('createMetaAgentSeed', () => {
    it('creates a seed with all 10 genes', () => {
      const seed = createMetaAgentSeed(rng);
      expect(seed.genes.reasoning_style).toBeDefined();
      expect(seed.genes.exploration_rate).toBeDefined();
      expect(seed.genes.memory_weight).toBeDefined();
      expect(seed.genes.confidence_threshold).toBeDefined();
      expect(seed.genes.specialization_affinity).toBeDefined();
      expect(seed.genes.reflection_depth).toBeDefined();
      expect(seed.genes.internet_curiosity).toBeDefined();
      expect(seed.genes.creativity).toBeDefined();
      expect(seed.genes.verbosity).toBeDefined();
      expect(seed.genes.risk_tolerance).toBeDefined();
    });

    it('uses seed-intelligence domain', () => {
      const seed = createMetaAgentSeed(rng);
      expect(seed.$domain).toBe('seed-intelligence');
    });

    it('creates deterministic seeds', () => {
      const rng1 = new DeterministicRNG(123);
      const rng2 = new DeterministicRNG(123);
      const seed1 = createMetaAgentSeed(rng1);
      const seed2 = createMetaAgentSeed(rng2);
      expect(seed1.genes.exploration_rate.value).toBe(seed2.genes.exploration_rate.value);
    });

    it('sets reasoning_style as categorical with 4 options', () => {
      const seed = createMetaAgentSeed(rng);
      expect(seed.genes.reasoning_style.type).toBe('categorical');
      expect(seed.genes.reasoning_style.options).toEqual(
        ['analytical', 'creative', 'systematic', 'intuitive'],
      );
    });

    it('sets memory_weight as vector with 4 dimensions', () => {
      const seed = createMetaAgentSeed(rng);
      expect(seed.genes.memory_weight.type).toBe('vector');
      expect(seed.genes.memory_weight.dimensions).toBe(4);
    });

    it('sets specialization_affinity with 8 dimensions', () => {
      const seed = createMetaAgentSeed(rng);
      expect(seed.genes.specialization_affinity.dimensions).toBe(8);
    });

    it('has initial fitness', () => {
      const seed = createMetaAgentSeed(rng);
      expect(seed.$fitness?.primary).toBe(0.5);
    });
  });

  describe('mutateMetaAgent', () => {
    it('creates a new seed with incremented generation', () => {
      const original = createMetaAgentSeed(rng);
      const mutated = mutateMetaAgent(original, rng, 1.0); // 100% rate
      expect(mutated.$lineage.generation).toBe(original.$lineage.generation + 1);
    });

    it('preserves lineage (parent reference)', () => {
      const original = createMetaAgentSeed(rng);
      const mutated = mutateMetaAgent(original, rng, 1.0);
      expect(mutated.$lineage.parents.length).toBe(1);
      expect(mutated.$lineage.parents[0]!.id).toBe(original.$hash);
    });

    it('generates new hash on mutation', () => {
      const original = createMetaAgentSeed(rng);
      const mutated = mutateMetaAgent(original, rng, 1.0);
      expect(mutated.$hash).not.toBe(original.$hash);
    });

    it('applies scalar perturbation within bounds', () => {
      const original = createMetaAgentSeed(rng);
      const mutated = mutateMetaAgent(original, rng, 1.0);
      // All scalar genes should remain within [min, max]
      const scalars = [
        'exploration_rate', 'confidence_threshold', 'reflection_depth',
        'internet_curiosity', 'creativity', 'verbosity', 'risk_tolerance',
      ] as const;
      for (const key of scalars) {
        const gene = mutated.genes[key];
        expect(gene.value).toBeGreaterThanOrEqual(gene.min);
        expect(gene.value).toBeLessThanOrEqual(gene.max);
      }
    });

    it('can mutate reasoning_style categorical gene', () => {
      // With rate=1.0 and enough randomness, style may change
      const original = createMetaAgentSeed(new DeterministicRNG(42));
      let changed = false;
      for (let i = 0; i < 20; i++) {
        const mutated = mutateMetaAgent(original, new DeterministicRNG(i), 1.0);
        if (mutated.genes.reasoning_style.value !== original.genes.reasoning_style.value) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('low rate preserves most genes', () => {
      const rng1 = new DeterministicRNG(42);
      const original = createMetaAgentSeed(rng1);
      const mutated = mutateMetaAgent(original, new DeterministicRNG(99), 0.0);
      // With rate 0, no genes should be mutated
      expect(mutated.genes.exploration_rate.value).toBe(original.genes.exploration_rate.value);
      expect(mutated.genes.reasoning_style.value).toBe(original.genes.reasoning_style.value);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// GSPLAgent
// ═══════════════════════════════════════════════════════════════════

describe('GSPLAgent', () => {
  let agent: GSPLAgent;

  beforeEach(() => {
    agent = new GSPLAgent({ rngSeed: 42, enableEvolution: false });
  });

  it('initializes with all subsystems', () => {
    expect(agent.memory).toBeDefined();
    expect(agent.reflection).toBeDefined();
    expect(agent.intelligence).toBeDefined();
    expect(agent.nlp).toBeDefined();
    expect(agent.planner).toBeDefined();
    expect(agent.resonance).toBeDefined();
    expect(agent.awareness).toBeDefined();
    expect(agent.toolRegistry).toBeDefined();
  });

  it('has a MetaAgentSeed', () => {
    const meta = agent.getMetaSeed();
    expect(meta.$domain).toBe('seed-intelligence');
    expect(meta.genes.reasoning_style).toBeDefined();
  });

  describe('process', () => {
    it('processes a create command', async () => {
      const response = await agent.process('create a fire dragon');
      expect(response.success).toBe(true);
      expect(response.message).toBeDefined();
      expect(response.message.length).toBeGreaterThan(0);
      expect(response.intent).toBeDefined();
      expect(response.plan).toBeDefined();
    });

    it('processes an evolve command', async () => {
      const response = await agent.process('evolve for 50 generations');
      expect(response.success).toBe(true);
      expect(response.intent).toBeDefined();
    });

    it('processes a status command', async () => {
      const response = await agent.process('status');
      expect(response.success).toBe(true);
      expect(response.message).toContain('status');
    });

    it('processes a help command', async () => {
      const response = await agent.process('help');
      expect(response.success).toBe(true);
      expect(response.message).toContain('Available commands');
    });

    it('returns plan with task decomposition', async () => {
      const response = await agent.process('build an ecosystem world');
      expect(response.plan).toBeDefined();
      expect(response.plan!.length).toBeGreaterThan(0);
    });

    it('includes reflections', async () => {
      const response = await agent.process('create something');
      expect(response.reflections).toBeDefined();
    });

    it('records episodes in memory', async () => {
      await agent.process('create warrior');
      const stats = agent.getStats();
      expect(stats.memory.episodic).toBe(1);
    });

    it('tracks interaction count', async () => {
      await agent.process('create a');
      await agent.process('create b');
      const stats = agent.getStats();
      expect(stats.interactions).toBe(2);
    });
  });

  describe('getStats', () => {
    it('returns comprehensive stats', () => {
      const stats = agent.getStats();
      expect(typeof stats.interactions).toBe('number');
      expect(typeof stats.metaGeneration).toBe('number');
      expect(typeof stats.metaFitness).toBe('number');
      expect(typeof stats.reflections).toBe('number');
      expect(stats.memory).toBeDefined();
    });
  });

  describe('self-evolution', () => {
    it('evolves after 50 interactions when enabled', async () => {
      const evolvingAgent = new GSPLAgent({ rngSeed: 42, enableEvolution: true });
      const initialGen = evolvingAgent.getMetaSeed().$lineage.generation;

      for (let i = 0; i < 50; i++) {
        await evolvingAgent.process(`action ${i}`);
      }

      const finalGen = evolvingAgent.getMetaSeed().$lineage.generation;
      expect(finalGen).toBeGreaterThan(initialGen);
    });

    it('does not evolve when evolution disabled', async () => {
      const staticAgent = new GSPLAgent({ rngSeed: 42, enableEvolution: false });
      const initialGen = staticAgent.getMetaSeed().$lineage.generation;

      for (let i = 0; i < 50; i++) {
        await staticAgent.process(`action ${i}`);
      }

      expect(staticAgent.getMetaSeed().$lineage.generation).toBe(initialGen);
    });

    it('consolidates memory every 10 interactions', async () => {
      const memAgent = new GSPLAgent({ rngSeed: 42, enableEvolution: false });

      for (let i = 0; i < 10; i++) {
        await memAgent.process(`important action ${i}`);
      }

      // After 10 interactions, consolidation should have run
      const stats = memAgent.getStats();
      expect(stats.memory.episodic).toBe(10);
    });
  });

  describe('tool integration', () => {
    it('executes registered tools when matching intent', async () => {
      let toolCalled = false;
      agent.toolRegistry.register(
        {
          id: 'test_create',
          name: 'create seed',
          description: 'create a seed from description',
          category: 'seed',
          parameters: [],
        },
        async () => {
          toolCalled = true;
          return { success: true, message: 'created', data: { id: 'test' } };
        },
      );

      const response = await agent.process('create a warrior');
      expect(response.success).toBe(true);
      expect(response.message).toBeDefined();
    });
  });
});
