import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicRNG } from '@paradigm/rng';
import {
  KnowledgeStream,
  ConceptGraph,
  ContextEngine,
  TrendDetector,
  ReasoningEngine,
  WorldModel,
  AwarenessSystem,
  PerceptionLayer,
  KnowledgeLayer,
  ReasoningLayer,
  PlanningLayer,
  LearningLayer,
  ConsciousAgent,
  AgentSpecies,
  SharedKnowledgeGraph,
  IdeaEvolution,
  SwarmDecisionMaking,
  CollectiveIntelligenceEngine,
  AutonomousAgent,
  AgentEnvironment,
  createRandomAgent,
  createAgentTeam,
} from './index.js';

// ═══════════════════════════════════════════════════════════════════
// Knowledge Stream
// ═══════════════════════════════════════════════════════════════════

describe('KnowledgeStream', () => {
  let stream: KnowledgeStream;

  beforeEach(() => {
    stream = new KnowledgeStream();
    stream.addSource({ id: 'test', type: 'manual', credibilityScore: 0.8 });
  });

  it('ingests content', () => {
    const frag = stream.ingest('Dragons are powerful creatures', 'test');
    expect(frag.content).toBe('Dragons are powerful creatures');
    expect(frag.credibility).toBe(0.8);
    expect(stream.size).toBe(1);
  });

  it('extracts entities', () => {
    const frag = stream.ingest('The Fire Dragon attacked Castle Rock', 'test');
    expect(frag.entities.some(e => e.includes('Fire'))).toBe(true);
  });

  it('queries by keyword', () => {
    stream.ingest('Dragons breathe fire', 'test');
    stream.ingest('Wolves hunt in packs', 'test');
    const results = stream.query('dragon');
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain('Dragons');
  });

  it('respects min credibility filter', () => {
    stream.addSource({ id: 'low', type: 'manual', credibilityScore: 0.2 });
    stream.ingest('unreliable data about dragons', 'low');
    stream.ingest('reliable data about dragons', 'test');
    const results = stream.query('dragon', 0.5);
    expect(results.length).toBe(1);
  });

  it('tracks source count', () => {
    expect(stream.sourceCount).toBe(1);
    stream.addSource({ id: 'another', type: 'api', credibilityScore: 0.9 });
    expect(stream.sourceCount).toBe(2);
  });

  it('removes sources', () => {
    expect(stream.removeSource('test')).toBe(true);
    expect(stream.sourceCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Concept Graph
// ═══════════════════════════════════════════════════════════════════

describe('ConceptGraph', () => {
  let graph: ConceptGraph;

  beforeEach(() => {
    graph = new ConceptGraph();
  });

  it('adds and retrieves concepts', () => {
    graph.addConcept('dragon', [1, 0, 0], { type: 'creature' });
    const node = graph.getConcept('dragon');
    expect(node).toBeDefined();
    expect(node!.name).toBe('dragon');
    expect(graph.nodeCount).toBe(1);
  });

  it('adds relations between concepts', () => {
    graph.addConcept('dragon', [1, 0, 0]);
    graph.addConcept('fire', [0.9, 0.1, 0]);
    const edge = graph.addRelation('dragon', 'fire', 'has_a', 0.9);
    expect(edge).toBeDefined();
    expect(graph.edgeCount).toBe(1);
  });

  it('fails to add relation for missing concepts', () => {
    graph.addConcept('dragon', [1, 0, 0]);
    expect(graph.addRelation('dragon', 'missing', 'is_a')).toBeUndefined();
  });

  it('finds similar concepts by embedding', () => {
    graph.addConcept('dragon', [1, 0, 0]);
    graph.addConcept('wyvern', [0.95, 0.05, 0]);
    graph.addConcept('sword', [0, 0, 1]);
    const similar = graph.findSimilar([1, 0, 0], 2);
    expect(similar[0]!.node.name).toBe('dragon');
    expect(similar[1]!.node.name).toBe('wyvern');
  });

  it('blends concepts', () => {
    graph.addConcept('fire', [1, 0, 0], { element: 'fire' });
    graph.addConcept('ice', [0, 0, 1], { element: 'ice' });
    const blended = graph.blend(['fire', 'ice']);
    expect(blended).toBeDefined();
    expect(blended!.name).toBe('fire+ice');
    expect(blended!.embedding[0]).toBeCloseTo(0.5);
  });

  it('finds path between concepts', () => {
    graph.addConcept('A', [1, 0, 0]);
    graph.addConcept('B', [0, 1, 0]);
    graph.addConcept('C', [0, 0, 1]);
    graph.addRelation('A', 'B', 'similar_to');
    graph.addRelation('B', 'C', 'causes');
    const path = graph.pathBetween('A', 'C');
    expect(path).toEqual(['A', 'B', 'C']);
  });

  it('returns undefined for no path', () => {
    graph.addConcept('A', [1, 0, 0]);
    graph.addConcept('B', [0, 1, 0]);
    expect(graph.pathBetween('A', 'B')).toBeUndefined();
  });

  it('removes concepts and their relations', () => {
    graph.addConcept('A', [1, 0, 0]);
    graph.addConcept('B', [0, 1, 0]);
    graph.addRelation('A', 'B', 'is_a');
    expect(graph.removeConcept('A')).toBe(true);
    expect(graph.nodeCount).toBe(1);
    expect(graph.edgeCount).toBe(0);
  });

  it('gets relations for a concept', () => {
    graph.addConcept('A', [1, 0, 0]);
    graph.addConcept('B', [0, 1, 0]);
    graph.addRelation('A', 'B', 'is_a');
    const rels = graph.getRelations('A');
    expect(rels.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Context Engine
// ═══════════════════════════════════════════════════════════════════

describe('ContextEngine', () => {
  let engine: ContextEngine;

  beforeEach(() => {
    engine = new ContextEngine();
  });

  it('sets and gets context', () => {
    engine.setContext('create dragon', { domain: 'organism' });
    const ctx = engine.getContext();
    expect(ctx).toBeDefined();
    expect(ctx!.currentTask).toBe('create dragon');
  });

  it('tracks context history', () => {
    engine.setContext('task 1');
    engine.setContext('task 2');
    expect(engine.getHistory().length).toBe(1);
    expect(engine.getContext()!.currentTask).toBe('task 2');
  });

  it('adds relevant concepts', () => {
    engine.setContext('create dragon');
    engine.addRelevantConcept('fire');
    engine.addRelevantConcept('wings');
    expect(engine.getContext()!.relevantConcepts).toContain('fire');
    expect(engine.getContext()!.relevantConcepts).toContain('wings');
  });

  it('filters knowledge by relevance', () => {
    engine.setContext('dragon');
    engine.addRelevantConcept('fire');
    const graph = new ConceptGraph();
    const fragments = [
      { content: 'Dragons breathe fire', source: 'a', sourceType: 'manual' as const, timestamp: 0, credibility: 0.9, entities: ['Dragon'] },
      { content: 'Fish swim in water', source: 'b', sourceType: 'manual' as const, timestamp: 0, credibility: 0.8, entities: ['Fish'] },
    ];
    const filtered = engine.filterKnowledge(fragments, graph);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0]!.content).toContain('Dragon');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Trend Detector
// ═══════════════════════════════════════════════════════════════════

describe('TrendDetector', () => {
  it('records and detects trends', () => {
    const detector = new TrendDetector(60_000);
    detector.record('dragon', 0.8);
    detector.record('dragon', 0.9);
    detector.record('wolf', 0.5);
    const trends = detector.detectTrends(5);
    expect(trends.length).toBe(2);
    expect(detector.topicCount).toBe(2);
  });

  it('returns momentum for a topic', () => {
    const detector = new TrendDetector(60_000);
    detector.record('dragon', 0.8);
    const momentum = detector.getMomentum('dragon');
    expect(typeof momentum).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Reasoning Engine
// ═══════════════════════════════════════════════════════════════════

describe('ReasoningEngine', () => {
  let engine: ReasoningEngine;

  beforeEach(() => {
    engine = new ReasoningEngine();
  });

  it('reasons about a query with knowledge', () => {
    engine.addKnowledge([
      { content: 'Dragons are powerful fire-breathing creatures', source: 'book', sourceType: 'manual', timestamp: 0, credibility: 0.9, entities: ['Dragon'] },
    ]);
    const chain = engine.reason('What are dragons?');
    expect(chain.steps.length).toBeGreaterThan(0);
    expect(chain.confidence).toBeGreaterThan(0);
  });

  it('returns low confidence with no knowledge', () => {
    const chain = engine.reason('quantum mechanics');
    expect(chain.confidence).toBeLessThanOrEqual(0.1);
  });

  it('fact-checks claims', () => {
    engine.addKnowledge([
      { content: 'The sky is blue', source: 'a', sourceType: 'manual', timestamp: 0, credibility: 0.95, entities: [] },
    ]);
    const result = engine.factCheck('the sky is blue');
    expect(result.verified).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('clears knowledge', () => {
    engine.addKnowledge([
      { content: 'test', source: 'a', sourceType: 'manual', timestamp: 0, credibility: 0.5, entities: [] },
    ]);
    engine.clear();
    expect(engine.knowledgeCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// World Model
// ═══════════════════════════════════════════════════════════════════

describe('WorldModel', () => {
  let world: WorldModel;

  beforeEach(() => {
    world = new WorldModel();
  });

  it('adds and retrieves entities', () => {
    world.addEntity('dragon', 'creature', { health: 100 });
    expect(world.entityCount).toBe(1);
    const entity = world.getEntity('dragon');
    expect(entity!.type).toBe('creature');
  });

  it('removes entities and cleans relations', () => {
    world.addEntity('A', 'creature');
    world.addEntity('B', 'creature');
    world.addRelation('A', 'B', 'allies');
    expect(world.removeEntity('A')).toBe(true);
    expect(world.entityCount).toBe(1);
  });

  it('predicts evolution outcomes', () => {
    world.addEntity('pop', 'population');
    world.addEntity('a', 'seed');
    world.addEntity('b', 'seed');
    world.addEntity('c', 'seed');
    world.addEntity('d', 'seed');
    world.addEntity('e', 'seed');
    const prediction = world.predict('evolve the population');
    expect(prediction.probability).toBeGreaterThan(0);
  });

  it('predicts create outcomes', () => {
    const prediction = world.predict('create a dragon');
    expect(prediction.probability).toBe(0.95);
  });

  it('simulates scenarios', () => {
    world.addEntity('A', 'creature');
    world.addEntity('B', 'creature');
    world.addRelation('A', 'B', 'competes', 0.9);
    const result = world.simulate('competition', 3);
    expect(result.steps).toBe(3);
    expect(result.keyEvents.length).toBeGreaterThan(0);
  });

  it('explains observations', () => {
    const explanation = world.explain('fitness is low');
    expect(explanation.possibleCauses.length).toBeGreaterThan(0);
    expect(explanation.mostLikelyCause).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Awareness System
// ═══════════════════════════════════════════════════════════════════

describe('AwarenessSystem', () => {
  it('processes input through full pipeline', async () => {
    const system = new AwarenessSystem();
    system.knowledge.addSource({ id: 'user', type: 'manual', credibilityScore: 0.9 });
    const result = await system.processInput('Create a fire dragon');
    expect(result.fragment).toBeDefined();
    expect(result.reasoning).toBeDefined();
    expect(result.prediction).toBeDefined();
  });

  it('reports status', () => {
    const system = new AwarenessSystem();
    const status = system.getStatus();
    expect(typeof status.knowledgeFragments).toBe('number');
    expect(typeof status.concepts).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Conscious Agent (7-layer)
// ═══════════════════════════════════════════════════════════════════

describe('ConsciousAgent', () => {
  it('creates agent with species', () => {
    const agent = new ConsciousAgent('agent1', AgentSpecies.RESEARCH);
    expect(agent.id).toBe('agent1');
    expect(agent.species).toBe(AgentSpecies.RESEARCH);
  });

  it('perceives and filters by salience', () => {
    const agent = new ConsciousAgent('a', AgentSpecies.ANALYSIS);
    agent.perception.perceive({ id: '1', timestamp: 0, modality: 'visual', content: 'dragon', salience: 0.9 });
    agent.perception.perceive({ id: '2', timestamp: 0, modality: 'visual', content: 'rock', salience: 0.2 });
    expect(agent.perception.getSalient(0.5).length).toBe(1);
  });

  it('stores and recalls knowledge', () => {
    const agent = new ConsciousAgent('a', AgentSpecies.CREATIVE);
    agent.knowledge.store({ id: 'k1', type: 'fact', topic: 'dragons', content: 'Fire breathing', acquiredAt: 0, accessCount: 0, lastAccessed: 0, confidence: 0.9 });
    const recalled = agent.knowledge.recall('dragons');
    expect(recalled.length).toBe(1);
  });

  it('reasons with different modes', () => {
    const agent = new ConsciousAgent('a', AgentSpecies.CREATIVE);
    agent.knowledge.store({ id: 'k1', type: 'fact', topic: 'test', content: 'Evidence', acquiredAt: 0, accessCount: 0, lastAccessed: 0, confidence: 0.8 });
    const result = agent.think('test query');
    expect(result.reasoningMode).toBe('creative');
  });

  it('learns from experience', () => {
    const agent = new ConsciousAgent('a', AgentSpecies.ENGINEERING);
    agent.learnFromExperience({ state: 's1', action: 'build', reward: 1, nextState: 's2', success: true, tags: [] });
    expect(agent.learning.experienceCount).toBe(1);
    expect(agent.learning.getSuccessRate()).toBe(1);
  });

  it('acts with energy cost', () => {
    const agent = new ConsciousAgent('a', AgentSpecies.RESEARCH);
    const action = { type: 'create' as const, energyCost: 20, expectedUtility: 0.8 };
    expect(agent.act(action)).toBe(true);
    expect(agent.getCognitiveState().energy).toBe(80);
  });

  it('consolidates working memory', () => {
    const agent = new ConsciousAgent('a', AgentSpecies.ANALYSIS);
    const k = { id: 'k1', type: 'fact' as const, topic: 'test', content: 'x', acquiredAt: 0, accessCount: 0, lastAccessed: 0, confidence: 0.5 };
    agent.knowledge.store(k);
    agent.knowledge.loadToWorking(k);
    expect(agent.knowledge.workingMemorySize).toBe(1);
    agent.knowledge.consolidate();
    expect(agent.knowledge.workingMemorySize).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Collective Intelligence
// ═══════════════════════════════════════════════════════════════════

describe('CollectiveIntelligence', () => {
  it('contributes and queries shared knowledge', () => {
    const graph = new SharedKnowledgeGraph();
    graph.contribute('Dragons are strong', 'agent1', ['dragon']);
    expect(graph.nodeCount).toBe(1);
    const results = graph.query(['dragon']);
    expect(results.length).toBe(1);
  });

  it('supports and refutes knowledge', () => {
    const graph = new SharedKnowledgeGraph();
    const node = graph.contribute('claim', 'agent1', ['test']);
    graph.support(node.id);
    graph.support(node.id);
    graph.refute(node.id);
    // 3 evidence / (3 evidence + 1 refutation) = 0.75
    const queried = graph.query(['test']);
    expect(queried[0]!.confidence).toBe(0.75);
  });

  it('links knowledge nodes', () => {
    const graph = new SharedKnowledgeGraph();
    const a = graph.contribute('A', 'agent1', []);
    const b = graph.contribute('B', 'agent2', []);
    expect(graph.link(a.id, b.id, 'supports')).toBe(true);
    expect(graph.edgeCount).toBe(1);
  });

  it('evolves ideas', () => {
    const ideas = new IdeaEvolution();
    const a = ideas.propose('Idea A', 'agent1');
    const b = ideas.propose('Idea B', 'agent2');
    ideas.scoreFitness(a.id, 0.8, 0.7, 0.9);
    ideas.scoreFitness(b.id, 0.5, 0.6, 0.4);
    const evolved = ideas.evolve();
    expect(evolved.length).toBe(2);
    expect(evolved[0]!.fitness).toBeGreaterThan(evolved[1]!.fitness);
  });

  it('breeds ideas', () => {
    const ideas = new IdeaEvolution();
    const a = ideas.propose('Idea A', 'agent1');
    const b = ideas.propose('Idea B', 'agent2');
    const child = ideas.breed(a, b, 'agent3');
    expect(child.parents.length).toBe(2);
    expect(ideas.ideaCount).toBe(3);
  });

  it('makes collective decisions', () => {
    const swarm = new SwarmDecisionMaking();
    const votes = new Map([['a1', 'yes'], ['a2', 'yes'], ['a3', 'no']]);
    const decision = swarm.decide('Approve?', ['yes', 'no'], votes, 'simple_majority');
    expect(decision.result).toBe('yes');
    expect(decision.confidence).toBeCloseTo(2 / 3, 1);
  });

  it('consensus method penalizes non-consensus', () => {
    const swarm = new SwarmDecisionMaking();
    const votes = new Map([['a1', 'A'], ['a2', 'A'], ['a3', 'B']]);
    const decision = swarm.decide('Pick', ['A', 'B'], votes, 'consensus');
    expect(decision.result).toBe('A');
    expect(decision.confidence).toBeLessThan(0.7);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Autonomous Agent + Environment
// ═══════════════════════════════════════════════════════════════════

describe('AutonomousAgent', () => {
  it('creates agent with personality', () => {
    const agent = new AutonomousAgent('Scout', {
      curiosity: 0.9, aggression: 0.1, sociability: 0.5, creativity: 0.7, patience: 0.6,
    });
    expect(agent.name).toBe('Scout');
    expect(agent.personality.curiosity).toBe(0.9);
  });

  it('perceives environment', () => {
    const agent = new AutonomousAgent('Scout', {
      curiosity: 1, aggression: 0, sociability: 1, creativity: 0, patience: 0,
    });
    const obs = agent.perceive({ entities: ['dragon', 'rock'], messages: ['hello'] });
    expect(obs.length).toBeGreaterThan(0);
  });

  it('plans based on personality', () => {
    const curious = new AutonomousAgent('C', {
      curiosity: 0.9, aggression: 0.1, sociability: 0.1, creativity: 0.1, patience: 0.1,
    });
    expect(curious.plan().type).toBe('observe');
  });

  it('acts and consumes energy', () => {
    const agent = new AutonomousAgent('A', {
      curiosity: 0.5, aggression: 0.5, sociability: 0.5, creativity: 0.5, patience: 0.5,
    });
    expect(agent.act({ type: 'create' })).toBe(true);
    expect(agent.getState().energy).toBe(95);
  });

  it('learns facts', () => {
    const agent = new AutonomousAgent('A', {
      curiosity: 0.5, aggression: 0.5, sociability: 0.5, creativity: 0.5, patience: 0.5,
    });
    agent.learn('sky is blue', 0.95);
    expect(agent.getState().beliefs).toBe(1);
  });
});

describe('AgentEnvironment', () => {
  it('manages agents', () => {
    const env = new AgentEnvironment();
    const rng = new DeterministicRNG(42);
    const agent = createRandomAgent('Scout', rng);
    env.addAgent(agent);
    expect(env.agentCount).toBe(1);
    expect(env.getAgent('Scout')).toBeDefined();
  });

  it('steps the simulation', () => {
    const env = new AgentEnvironment();
    const rng = new DeterministicRNG(42);
    env.addAgent(createRandomAgent('A', rng));
    env.addAgent(createRandomAgent('B', rng));
    const snapshot = env.step();
    expect(snapshot.tick).toBe(1);
    expect(snapshot.agentCount).toBe(2);
    expect(snapshot.events.length).toBeGreaterThan(0);
  });

  it('broadcasts messages', () => {
    const env = new AgentEnvironment();
    env.broadcast('alert!');
    // messages consumed on next step
    expect(env.currentTick).toBe(0);
  });

  it('creates agent teams', () => {
    const rng = new DeterministicRNG(99);
    const team = createAgentTeam(['A', 'B', 'C'], rng);
    expect(team.length).toBe(3);
    expect(team[0]!.name).toBe('A');
  });

  it('removes agents', () => {
    const env = new AgentEnvironment();
    const rng = new DeterministicRNG(42);
    env.addAgent(createRandomAgent('X', rng));
    expect(env.removeAgent('X')).toBe(true);
    expect(env.agentCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Perception & Learning Layers
// ═══════════════════════════════════════════════════════════════════

describe('PerceptionLayer', () => {
  it('filters by attention', () => {
    const layer = new PerceptionLayer();
    layer.setAttentionFilter(['visual']);
    expect(layer.perceive({ id: '1', timestamp: 0, modality: 'visual', content: 'x', salience: 1 })).toBe(true);
    expect(layer.perceive({ id: '2', timestamp: 0, modality: 'auditory', content: 'y', salience: 1 })).toBe(false);
    expect(layer.size).toBe(1);
  });

  it('clears buffer', () => {
    const layer = new PerceptionLayer();
    layer.perceive({ id: '1', timestamp: 0, modality: 'semantic', content: 'x', salience: 1 });
    layer.clear();
    expect(layer.size).toBe(0);
  });
});

describe('LearningLayer', () => {
  it('learns and recommends best action', () => {
    const layer = new LearningLayer();
    layer.learn({ state: 's1', action: 'observe', reward: 0.5, nextState: 's2', success: true, tags: [] });
    layer.learn({ state: 's1', action: 'create', reward: 1.0, nextState: 's3', success: true, tags: [] });
    expect(layer.bestAction('s1')).toBe('create');
  });

  it('returns undefined for unknown state', () => {
    const layer = new LearningLayer();
    expect(layer.bestAction('unknown')).toBeUndefined();
  });

  it('tracks state count', () => {
    const layer = new LearningLayer();
    layer.learn({ state: 's1', action: 'a', reward: 1, nextState: 's2', success: true, tags: [] });
    expect(layer.stateCount).toBe(1);
  });
});

describe('PlanningLayer', () => {
  it('creates a plan from available actions', () => {
    const layer = new PlanningLayer();
    const actions = [
      { type: 'observe' as const, energyCost: 1, expectedUtility: 0.5 },
      { type: 'create' as const, energyCost: 5, expectedUtility: 0.9 },
      { type: 'wait' as const, energyCost: 0, expectedUtility: 0 },
    ];
    const plan = layer.createPlan('build something', actions);
    expect(plan.length).toBe(2); // wait has 0 utility, excluded
  });
});
