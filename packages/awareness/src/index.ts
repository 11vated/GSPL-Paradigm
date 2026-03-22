/**
 * @paradigm/awareness — Conscious agent architecture, knowledge systems,
 * concept graphs, collective intelligence, and autonomous agent environments.
 *
 * This package provides the cognitive substrate that powers GSPL agents:
 * - KnowledgeStream: Multi-source ingestion with credibility scoring
 * - ConceptGraph: Semantic network with similarity, blending, pathfinding
 * - ContextEngine: Task-relevant knowledge filtering
 * - TrendDetector: Temporal trend analysis with momentum
 * - ReasoningEngine: Multi-step logical reasoning chains
 * - WorldModel: Entity-relationship model with prediction
 * - ConsciousAgent: 7-layer cognitive architecture
 * - CollectiveIntelligence: Multi-agent shared reasoning
 * - AutonomousAgent: Personality-driven agents with PALA cycle
 *
 * @packageDocumentation
 */

import type { UniversalSeed, GeneMap } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ═══════════════════════════════════════════════════════════════════
// Knowledge Stream — multi-source ingestion with credibility scoring
// ═══════════════════════════════════════════════════════════════════

export type SourceType = 'web_search' | 'rss' | 'api' | 'file' | 'manual';

export interface KnowledgeFragment {
  content: string;
  source: string;
  sourceType: SourceType;
  timestamp: number;
  credibility: number;
  domain?: string;
  entities: string[];
}

export interface SourceConfig {
  id: string;
  type: SourceType;
  url?: string;
  refreshIntervalMs?: number;
  credibilityScore: number;
  metadata?: Record<string, unknown>;
}

export class KnowledgeStream {
  private fragments: KnowledgeFragment[] = [];
  private sources = new Map<string, SourceConfig>();
  private readonly maxFragments: number;

  constructor(maxFragments = 5000) {
    this.maxFragments = maxFragments;
  }

  addSource(config: SourceConfig): void {
    this.sources.set(config.id, config);
  }

  removeSource(id: string): boolean {
    return this.sources.delete(id);
  }

  ingest(content: string, sourceId: string): KnowledgeFragment {
    const source = this.sources.get(sourceId);
    const credibility = source?.credibilityScore ?? 0.5;
    const entities = this.extractEntities(content);

    const fragment: KnowledgeFragment = {
      content,
      source: sourceId,
      sourceType: source?.type ?? 'manual',
      timestamp: Date.now(),
      credibility,
      entities,
    };

    this.fragments.push(fragment);
    if (this.fragments.length > this.maxFragments) {
      // evict lowest credibility
      this.fragments.sort((a, b) => b.credibility - a.credibility);
      this.fragments = this.fragments.slice(0, this.maxFragments);
    }

    return fragment;
  }

  query(query: string, minCredibility = 0): KnowledgeFragment[] {
    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter(t => t.length > 2);
    return this.fragments
      .filter(f => f.credibility >= minCredibility)
      .filter(f => {
        const content = f.content.toLowerCase();
        return terms.some(t => content.includes(t));
      })
      .sort((a, b) => {
        // rank by relevance (term match count) * credibility
        const aScore = terms.filter(t => a.content.toLowerCase().includes(t)).length * a.credibility;
        const bScore = terms.filter(t => b.content.toLowerCase().includes(t)).length * b.credibility;
        return bScore - aScore;
      })
      .slice(0, 20);
  }

  getByDomain(domain: string): KnowledgeFragment[] {
    return this.fragments.filter(f => f.domain === domain);
  }

  get size(): number {
    return this.fragments.length;
  }

  get sourceCount(): number {
    return this.sources.size;
  }

  private extractEntities(content: string): string[] {
    // extract capitalized words as potential entities
    const entities: string[] = [];
    const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      entities.push(match[1] as string);
    }
    return [...new Set(entities)];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Concept Graph — semantic network with similarity and pathfinding
// ═══════════════════════════════════════════════════════════════════

export type ConceptRelationType =
  | 'is_a' | 'has_a' | 'part_of' | 'causes'
  | 'similar_to' | 'opposite_of' | 'creates' | 'destroys';

export interface ConceptNode {
  name: string;
  embedding: number[];
  properties: Record<string, unknown>;
  createdAt: number;
  accessCount: number;
}

export interface ConceptEdge {
  from: string;
  to: string;
  type: ConceptRelationType;
  weight: number;
}

export class ConceptGraph {
  private nodes = new Map<string, ConceptNode>();
  private edges: ConceptEdge[] = [];

  addConcept(
    name: string,
    embedding: number[],
    properties: Record<string, unknown> = {},
  ): ConceptNode {
    const node: ConceptNode = {
      name,
      embedding,
      properties,
      createdAt: Date.now(),
      accessCount: 0,
    };
    this.nodes.set(name, node);
    return node;
  }

  getConcept(name: string): ConceptNode | undefined {
    const node = this.nodes.get(name);
    if (node) node.accessCount++;
    return node;
  }

  removeConcept(name: string): boolean {
    if (!this.nodes.delete(name)) return false;
    this.edges = this.edges.filter(e => e.from !== name && e.to !== name);
    return true;
  }

  addRelation(from: string, to: string, type: ConceptRelationType, weight = 1): ConceptEdge | undefined {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return undefined;
    const edge: ConceptEdge = { from, to, type, weight };
    this.edges.push(edge);
    return edge;
  }

  getRelations(name: string): ConceptEdge[] {
    return this.edges.filter(e => e.from === name || e.to === name);
  }

  findSimilar(embedding: number[], topK = 5): Array<{ node: ConceptNode; similarity: number }> {
    const results: Array<{ node: ConceptNode; similarity: number }> = [];
    for (const node of this.nodes.values()) {
      const sim = this.cosineSimilarity(embedding, node.embedding);
      results.push({ node, similarity: sim });
    }
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  blend(conceptNames: string[]): ConceptNode | undefined {
    const concepts = conceptNames
      .map(n => this.nodes.get(n))
      .filter((n): n is ConceptNode => n !== undefined);
    if (concepts.length < 2) return undefined;

    const dim = concepts[0]!.embedding.length;
    const blended = new Array<number>(dim).fill(0);
    for (const c of concepts) {
      for (let i = 0; i < dim; i++) {
        blended[i]! += (c.embedding[i] ?? 0) / concepts.length;
      }
    }

    const name = conceptNames.join('+');
    const mergedProps: Record<string, unknown> = {};
    for (const c of concepts) {
      Object.assign(mergedProps, c.properties);
    }

    return this.addConcept(name, blended, mergedProps);
  }

  pathBetween(from: string, to: string): string[] | undefined {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return undefined;
    if (from === to) return [from];

    // BFS
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];
    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.edges
        .filter(e => e.from === current.node || e.to === current.node)
        .map(e => e.from === current.node ? e.to : e.from);

      for (const neighbor of neighbors) {
        if (neighbor === to) return [...current.path, to];
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, path: [...current.path, neighbor] });
        }
      }
    }

    return undefined;
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < len; i++) {
      const ai = a[i] ?? 0;
      const bi = b[i] ?? 0;
      dot += ai * bi;
      magA += ai * ai;
      magB += bi * bi;
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Context Engine — task-relevant knowledge filtering
// ═══════════════════════════════════════════════════════════════════

export interface ContextState {
  currentTask: string;
  metadata: Record<string, unknown>;
  relevantConcepts: string[];
  timestamp: number;
}

export class ContextEngine {
  private currentContext: ContextState | undefined;
  private history: ContextState[] = [];
  private readonly maxHistory = 50;

  setContext(task: string, metadata: Record<string, unknown> = {}): ContextState {
    const state: ContextState = {
      currentTask: task,
      metadata,
      relevantConcepts: [],
      timestamp: Date.now(),
    };
    if (this.currentContext) {
      this.history.push(this.currentContext);
      if (this.history.length > this.maxHistory) this.history.shift();
    }
    this.currentContext = state;
    return state;
  }

  getContext(): ContextState | undefined {
    return this.currentContext;
  }

  addRelevantConcept(concept: string): void {
    if (this.currentContext && !this.currentContext.relevantConcepts.includes(concept)) {
      this.currentContext.relevantConcepts.push(concept);
    }
  }

  filterKnowledge(
    fragments: KnowledgeFragment[],
    graph: ConceptGraph,
  ): KnowledgeFragment[] {
    if (!this.currentContext) return fragments.slice(0, 10);
    const concepts = this.currentContext.relevantConcepts;
    const task = this.currentContext.currentTask.toLowerCase();

    return fragments
      .map(f => {
        let score = 0;
        // task relevance
        if (f.content.toLowerCase().includes(task)) score += 2;
        // concept overlap
        for (const c of concepts) {
          if (f.content.toLowerCase().includes(c.toLowerCase())) score += 1;
          if (f.entities.some(e => e.toLowerCase() === c.toLowerCase())) score += 1.5;
        }
        // credibility boost
        score *= f.credibility;
        return { fragment: f, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(x => x.fragment);
  }

  getHistory(): readonly ContextState[] {
    return this.history;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Trend Detector — temporal topic analysis with momentum
// ═══════════════════════════════════════════════════════════════════

export interface Trend {
  topic: string;
  momentum: number;
  mentions: number;
  sentiment: number;
  relatedConcepts: string[];
}

export class TrendDetector {
  private mentions = new Map<string, Array<{ timestamp: number; sentiment: number }>>();
  private readonly windowMs: number;

  constructor(windowMs = 3_600_000) { // default 1 hour
    this.windowMs = windowMs;
  }

  record(topic: string, sentiment = 0): void {
    const list = this.mentions.get(topic) ?? [];
    list.push({ timestamp: Date.now(), sentiment });
    this.mentions.set(topic, list);
  }

  detectTrends(topK = 10): Trend[] {
    const now = Date.now();
    const trends: Trend[] = [];

    for (const [topic, records] of this.mentions) {
      const recent = records.filter(r => now - r.timestamp < this.windowMs);
      if (recent.length === 0) continue;

      const older = records.filter(r =>
        now - r.timestamp >= this.windowMs && now - r.timestamp < this.windowMs * 2,
      );

      const momentum = older.length > 0
        ? (recent.length - older.length) / older.length
        : recent.length > 1 ? 1 : 0;

      const avgSentiment = recent.reduce((s, r) => s + r.sentiment, 0) / recent.length;

      trends.push({
        topic,
        momentum,
        mentions: recent.length,
        sentiment: avgSentiment,
        relatedConcepts: [],
      });
    }

    return trends
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, topK);
  }

  getMomentum(topic: string): number {
    const trend = this.detectTrends(100).find(t => t.topic === topic);
    return trend?.momentum ?? 0;
  }

  get topicCount(): number {
    return this.mentions.size;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Reasoning Engine — multi-step logical reasoning chains
// ═══════════════════════════════════════════════════════════════════

export interface ReasoningStep {
  premise: string;
  inference: string;
  evidence: string[];
  confidence: number;
}

export interface ReasoningChain {
  steps: ReasoningStep[];
  conclusion: string;
  confidence: number;
}

export interface FactCheckResult {
  verified: boolean;
  confidence: number;
  sources: string[];
  contradictions: string[];
}

export class ReasoningEngine {
  private knowledgeBase: KnowledgeFragment[] = [];

  addKnowledge(fragments: KnowledgeFragment[]): void {
    this.knowledgeBase.push(...fragments);
  }

  reason(query: string, context: KnowledgeFragment[] = []): ReasoningChain {
    const allKnowledge = [...this.knowledgeBase, ...context];
    const steps: ReasoningStep[] = [];

    // find relevant evidence
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const relevant = allKnowledge
      .filter(f => terms.some(t => f.content.toLowerCase().includes(t)))
      .sort((a, b) => b.credibility - a.credibility)
      .slice(0, 5);

    // build reasoning chain from evidence
    if (relevant.length > 0) {
      steps.push({
        premise: `Query: "${query}"`,
        inference: `Found ${relevant.length} relevant knowledge fragments`,
        evidence: relevant.map(r => r.content.slice(0, 100)),
        confidence: Math.min(...relevant.map(r => r.credibility), 0.9),
      });

      // synthesize
      const highCredibility = relevant.filter(r => r.credibility > 0.7);
      if (highCredibility.length > 0) {
        steps.push({
          premise: `${highCredibility.length} high-credibility sources agree`,
          inference: 'Synthesizing from trusted sources',
          evidence: highCredibility.map(r => r.source),
          confidence: 0.8,
        });
      }
    }

    const overallConfidence = steps.length > 0
      ? steps.reduce((s, st) => s + st.confidence, 0) / steps.length
      : 0.1;

    return {
      steps,
      conclusion: steps.length > 0
        ? `Based on ${relevant.length} sources: ${relevant[0]?.content.slice(0, 200) ?? 'No data'}`
        : `Insufficient knowledge to reason about: "${query}"`,
      confidence: overallConfidence,
    };
  }

  factCheck(claim: string): FactCheckResult {
    const terms = claim.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const supporting = this.knowledgeBase.filter(f =>
      terms.filter(t => f.content.toLowerCase().includes(t)).length >= terms.length * 0.5,
    );
    const contradicting = this.knowledgeBase.filter(f => {
      const content = f.content.toLowerCase();
      return content.includes('not') || content.includes('false') || content.includes('incorrect');
    }).filter(f => terms.some(t => f.content.toLowerCase().includes(t)));

    const confidence = supporting.length > 0
      ? supporting.reduce((s, f) => s + f.credibility, 0) / supporting.length
      : 0;

    return {
      verified: supporting.length > 0 && contradicting.length === 0 && confidence > 0.6,
      confidence,
      sources: supporting.map(s => s.source),
      contradictions: contradicting.map(c => c.content.slice(0, 100)),
    };
  }

  clear(): void {
    this.knowledgeBase = [];
  }

  get knowledgeCount(): number {
    return this.knowledgeBase.length;
  }
}

// ═══════════════════════════════════════════════════════════════════
// World Model — entity-relationship model with prediction
// ═══════════════════════════════════════════════════════════════════

export interface WorldEntity {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  relations: Array<{ target: string; type: string; weight: number }>;
}

export interface PredictedOutcome {
  action: string;
  likelyOutcome: string;
  probability: number;
  confidence: number;
}

export interface SimulationResult {
  scenario: string;
  steps: number;
  finalState: Record<string, unknown>;
  keyEvents: string[];
}

export interface Explanation {
  observation: string;
  possibleCauses: string[];
  mostLikelyCause: string;
  confidence: number;
}

export class WorldModel {
  private entities = new Map<string, WorldEntity>();
  private history: Array<{ tick: number; event: string }> = [];
  private tick = 0;

  addEntity(id: string, type: string, properties: Record<string, unknown> = {}): WorldEntity {
    const entity: WorldEntity = { id, type, properties, relations: [] };
    this.entities.set(id, entity);
    return entity;
  }

  removeEntity(id: string): boolean {
    if (!this.entities.delete(id)) return false;
    // clean up relations pointing to this entity
    for (const e of this.entities.values()) {
      e.relations = e.relations.filter(r => r.target !== id);
    }
    return true;
  }

  getEntity(id: string): WorldEntity | undefined {
    return this.entities.get(id);
  }

  addRelation(fromId: string, toId: string, type: string, weight = 1): boolean {
    const from = this.entities.get(fromId);
    if (!from || !this.entities.has(toId)) return false;
    from.relations.push({ target: toId, type, weight });
    return true;
  }

  predict(action: string): PredictedOutcome {
    const lower = action.toLowerCase();
    // simple prediction based on entity count and action type
    const entityCount = this.entities.size;

    if (lower.includes('evolve') || lower.includes('optimize')) {
      return {
        action,
        likelyOutcome: entityCount > 5
          ? 'Population fitness improvement expected'
          : 'Need more entities for effective evolution',
        probability: entityCount > 5 ? 0.75 : 0.4,
        confidence: 0.6,
      };
    }

    if (lower.includes('create') || lower.includes('add')) {
      return {
        action,
        likelyOutcome: 'New entity added to world',
        probability: 0.95,
        confidence: 0.9,
      };
    }

    if (lower.includes('delete') || lower.includes('remove')) {
      return {
        action,
        likelyOutcome: entityCount > 0 ? 'Entity removed' : 'No entities to remove',
        probability: entityCount > 0 ? 0.9 : 0.1,
        confidence: 0.8,
      };
    }

    return {
      action,
      likelyOutcome: 'Unknown action effect',
      probability: 0.5,
      confidence: 0.3,
    };
  }

  simulate(scenario: string, steps: number): SimulationResult {
    const keyEvents: string[] = [];
    const state: Record<string, unknown> = {
      entities: this.entities.size,
      scenario,
    };

    for (let i = 0; i < steps; i++) {
      this.tick++;
      // simple simulation: entities interact based on relations
      for (const entity of this.entities.values()) {
        for (const rel of entity.relations) {
          if (rel.type === 'competes' && rel.weight > 0.7) {
            keyEvents.push(`Tick ${this.tick}: ${entity.id} competes with ${rel.target}`);
          }
          if (rel.type === 'cooperates' && rel.weight > 0.5) {
            keyEvents.push(`Tick ${this.tick}: ${entity.id} cooperates with ${rel.target}`);
          }
        }
      }
    }

    state['finalTick'] = this.tick;
    state['events'] = keyEvents.length;

    return { scenario, steps, finalState: state, keyEvents: keyEvents.slice(0, 20) };
  }

  explain(observation: string): Explanation {
    const causes: string[] = [];
    const lower = observation.toLowerCase();

    if (lower.includes('fitness') && lower.includes('low')) {
      causes.push('Insufficient evolution generations');
      causes.push('Poor initial gene distribution');
      causes.push('Too high mutation rate destroying good genes');
    }
    if (lower.includes('diversity') && lower.includes('low')) {
      causes.push('Selection pressure too high');
      causes.push('Population size too small');
      causes.push('No migration between sub-populations');
    }
    if (lower.includes('stagnat')) {
      causes.push('Local optimum trap');
      causes.push('Mutation rate too low');
      causes.push('Need different crossover strategy');
    }

    if (causes.length === 0) {
      causes.push('Insufficient data for analysis');
    }

    return {
      observation,
      possibleCauses: causes,
      mostLikelyCause: causes[0]!,
      confidence: causes.length > 1 ? 0.6 : 0.3,
    };
  }

  get entityCount(): number {
    return this.entities.size;
  }

  get currentTick(): number {
    return this.tick;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Awareness System — unified orchestrator of all subsystems
// ═══════════════════════════════════════════════════════════════════

export class AwarenessSystem {
  readonly knowledge: KnowledgeStream;
  readonly concepts: ConceptGraph;
  readonly context: ContextEngine;
  readonly trends: TrendDetector;
  readonly reasoning: ReasoningEngine;
  readonly world: WorldModel;

  constructor() {
    this.knowledge = new KnowledgeStream();
    this.concepts = new ConceptGraph();
    this.context = new ContextEngine();
    this.trends = new TrendDetector();
    this.reasoning = new ReasoningEngine();
    this.world = new WorldModel();
  }

  async processInput(
    input: string,
    sourceId = 'user',
  ): Promise<{
    fragment: KnowledgeFragment;
    reasoning: ReasoningChain;
    trends: Trend[];
    prediction: PredictedOutcome;
  }> {
    // ingest knowledge
    const fragment = this.knowledge.ingest(input, sourceId);

    // record for trend detection
    for (const entity of fragment.entities) {
      this.trends.record(entity, 0.5);
    }

    // reason about the input
    const relevant = this.knowledge.query(input);
    this.reasoning.addKnowledge(relevant);
    const reasoning = this.reasoning.reason(input, relevant);

    // predict outcome
    const prediction = this.world.predict(input);

    // detect trends
    const trends = this.trends.detectTrends(5);

    return { fragment, reasoning, trends, prediction };
  }

  getStatus(): {
    knowledgeFragments: number;
    concepts: number;
    relations: number;
    trends: number;
    entities: number;
  } {
    return {
      knowledgeFragments: this.knowledge.size,
      concepts: this.concepts.nodeCount,
      relations: this.concepts.edgeCount,
      trends: this.trends.topicCount,
      entities: this.world.entityCount,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Conscious Agent — 7-layer cognitive architecture
// ═══════════════════════════════════════════════════════════════════

export type PerceptModality = 'visual' | 'auditory' | 'semantic' | 'spatial' | 'temporal' | 'social';

export interface Percept {
  id: string;
  timestamp: number;
  modality: PerceptModality;
  content: string;
  salience: number;
  source?: string;
}

export type KnowledgeType = 'fact' | 'skill' | 'concept' | 'experience';

export interface Knowledge {
  id: string;
  type: KnowledgeType;
  topic: string;
  content: string;
  acquiredAt: number;
  accessCount: number;
  lastAccessed: number;
  confidence: number;
  source?: string;
}

export interface Experience {
  state: string;
  action: string;
  reward: number;
  nextState: string;
  success: boolean;
  tags: string[];
}

export type AgentActionType =
  | 'observe' | 'communicate' | 'reason' | 'create'
  | 'evolve' | 'search' | 'learn' | 'teach' | 'wait';

export interface AgentAction {
  type: AgentActionType;
  target?: string;
  params?: Record<string, unknown>;
  energyCost: number;
  expectedUtility: number;
}

export type ReasoningMode =
  | 'logical' | 'probabilistic' | 'causal' | 'analogical' | 'creative';

export interface ReasoningConclusion {
  conclusion: string;
  confidence: number;
  evidence: string[];
  contradictions: string[];
  reasoningMode: ReasoningMode;
}

export interface CognitiveState {
  agentId: string;
  energy: number;
  currentGoal?: string;
  knowledgeCount: number;
  workingMemorySize: number;
  recentSuccessRate: number;
  mood: number;
  skillsAcquired: string[];
}

export enum AgentSpecies {
  RESEARCH = 'research',
  ENGINEERING = 'engineering',
  ANALYSIS = 'analysis',
  CREATIVE = 'creative',
  COORDINATOR = 'coordinator',
}

export class PerceptionLayer {
  private buffer: Percept[] = [];
  private readonly maxBuffer = 100;
  private attentionFilter: PerceptModality[] = [];

  perceive(percept: Percept): boolean {
    if (this.attentionFilter.length > 0 && !this.attentionFilter.includes(percept.modality)) {
      return false;
    }
    this.buffer.push(percept);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    return true;
  }

  getSalient(threshold = 0.5): Percept[] {
    return this.buffer.filter(p => p.salience >= threshold);
  }

  setAttentionFilter(modalities: PerceptModality[]): void {
    this.attentionFilter = modalities;
  }

  getRecent(count = 10): Percept[] {
    return this.buffer.slice(-count);
  }

  clear(): void {
    this.buffer = [];
  }

  get size(): number {
    return this.buffer.length;
  }
}

export class KnowledgeLayer {
  private longTerm = new Map<string, Knowledge>();
  private workingMemory: Knowledge[] = [];
  private readonly maxWorking = 7; // Miller's Law
  private readonly maxLongTerm: number;

  constructor(maxLongTerm = 10000) {
    this.maxLongTerm = maxLongTerm;
  }

  store(knowledge: Knowledge): void {
    this.longTerm.set(knowledge.id, knowledge);
    if (this.longTerm.size > this.maxLongTerm) {
      // evict least accessed
      let minAccess = Infinity;
      let minId = '';
      for (const [id, k] of this.longTerm) {
        if (k.accessCount < minAccess) {
          minAccess = k.accessCount;
          minId = id;
        }
      }
      if (minId) this.longTerm.delete(minId);
    }
  }

  recall(topic: string): Knowledge[] {
    const results: Knowledge[] = [];
    const lower = topic.toLowerCase();
    for (const k of this.longTerm.values()) {
      if (k.topic.toLowerCase().includes(lower) || k.content.toLowerCase().includes(lower)) {
        k.accessCount++;
        k.lastAccessed = Date.now();
        results.push(k);
      }
    }
    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  loadToWorking(knowledge: Knowledge): boolean {
    if (this.workingMemory.length >= this.maxWorking) {
      // evict oldest from working memory
      this.workingMemory.shift();
    }
    this.workingMemory.push(knowledge);
    return true;
  }

  getWorkingMemory(): readonly Knowledge[] {
    return this.workingMemory;
  }

  consolidate(): number {
    // move working memory items to long-term with boosted confidence
    let consolidated = 0;
    for (const k of this.workingMemory) {
      const existing = this.longTerm.get(k.id);
      if (existing) {
        existing.confidence = Math.min(existing.confidence + 0.1, 1);
        existing.accessCount++;
      } else {
        this.store(k);
      }
      consolidated++;
    }
    this.workingMemory = [];
    return consolidated;
  }

  get longTermSize(): number {
    return this.longTerm.size;
  }

  get workingMemorySize(): number {
    return this.workingMemory.length;
  }
}

export class ReasoningLayer {
  reason(
    query: string,
    knowledge: Knowledge[],
    mode: ReasoningMode = 'logical',
  ): ReasoningConclusion {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0.5;

    for (const k of knowledge) {
      if (k.confidence > 0.6) {
        evidence.push(k.content);
        confidence += 0.05;
      } else if (k.confidence < 0.3) {
        contradictions.push(k.content);
        confidence -= 0.02;
      }
    }

    confidence = Math.max(0, Math.min(1, confidence));

    let conclusion: string;
    switch (mode) {
      case 'logical':
        conclusion = evidence.length > 0
          ? `Logical analysis of "${query}": ${evidence.length} supporting facts found`
          : `Insufficient evidence for logical analysis of "${query}"`;
        break;
      case 'probabilistic':
        conclusion = `Probabilistic assessment: ${(confidence * 100).toFixed(0)}% confidence based on ${knowledge.length} data points`;
        break;
      case 'causal':
        conclusion = `Causal analysis: ${evidence.length} potential cause-effect relationships identified`;
        break;
      case 'analogical':
        conclusion = `By analogy with known patterns: ${evidence.length > 0 ? evidence[0]! : 'no analogues found'}`;
        break;
      case 'creative':
        conclusion = `Creative synthesis from ${evidence.length} inputs: novel combination possible`;
        break;
    }

    return { conclusion, confidence, evidence, contradictions, reasoningMode: mode };
  }
}

export class PlanningLayer {
  createPlan(
    goal: string,
    availableActions: AgentAction[],
  ): AgentAction[] {
    // greedy planning: pick highest utility actions that contribute to goal
    const plan = availableActions
      .filter(a => a.expectedUtility > 0)
      .sort((a, b) => (b.expectedUtility / b.energyCost) - (a.expectedUtility / a.energyCost))
      .slice(0, 5);

    return plan;
  }
}

export class LearningLayer {
  private experiences: Experience[] = [];
  private qTable = new Map<string, Map<string, number>>();
  private readonly learningRate = 0.1;
  private readonly discountFactor = 0.9;
  private readonly maxExperiences = 500;

  learn(experience: Experience): void {
    this.experiences.push(experience);
    if (this.experiences.length > this.maxExperiences) this.experiences.shift();

    // Q-learning update
    const stateActions = this.qTable.get(experience.state) ?? new Map<string, number>();
    const currentQ = stateActions.get(experience.action) ?? 0;

    // max Q of next state
    const nextStateActions = this.qTable.get(experience.nextState);
    const maxNextQ = nextStateActions
      ? Math.max(...nextStateActions.values(), 0)
      : 0;

    const newQ = currentQ + this.learningRate * (
      experience.reward + this.discountFactor * maxNextQ - currentQ
    );
    stateActions.set(experience.action, newQ);
    this.qTable.set(experience.state, stateActions);
  }

  bestAction(state: string): string | undefined {
    const actions = this.qTable.get(state);
    if (!actions || actions.size === 0) return undefined;
    let bestAction = '';
    let bestQ = -Infinity;
    for (const [action, q] of actions) {
      if (q > bestQ) {
        bestQ = q;
        bestAction = action;
      }
    }
    return bestAction || undefined;
  }

  getSuccessRate(): number {
    if (this.experiences.length === 0) return 0;
    const successes = this.experiences.filter(e => e.success).length;
    return successes / this.experiences.length;
  }

  get experienceCount(): number {
    return this.experiences.length;
  }

  get stateCount(): number {
    return this.qTable.size;
  }
}

export class ConsciousAgent {
  readonly id: string;
  readonly species: AgentSpecies;
  readonly perception: PerceptionLayer;
  readonly knowledge: KnowledgeLayer;
  readonly reasoning: ReasoningLayer;
  readonly planning: PlanningLayer;
  readonly learning: LearningLayer;

  private energy = 100;
  private currentGoal?: string;
  private skills: string[] = [];

  constructor(id: string, species: AgentSpecies) {
    this.id = id;
    this.species = species;
    this.perception = new PerceptionLayer();
    this.knowledge = new KnowledgeLayer();
    this.reasoning = new ReasoningLayer();
    this.planning = new PlanningLayer();
    this.learning = new LearningLayer();
  }

  setGoal(goal: string): void {
    this.currentGoal = goal;
  }

  think(query: string): ReasoningConclusion {
    const relevant = this.knowledge.recall(query);
    const mode: ReasoningMode = this.species === AgentSpecies.CREATIVE
      ? 'creative'
      : this.species === AgentSpecies.ANALYSIS
        ? 'probabilistic'
        : 'logical';
    return this.reasoning.reason(query, relevant, mode);
  }

  act(action: AgentAction): boolean {
    if (this.energy < action.energyCost) return false;
    this.energy -= action.energyCost;
    return true;
  }

  learnFromExperience(experience: Experience): void {
    this.learning.learn(experience);
    if (experience.success && !this.skills.includes(experience.action)) {
      this.skills.push(experience.action);
    }
  }

  recharge(amount: number): void {
    this.energy = Math.min(100, this.energy + amount);
  }

  getCognitiveState(): CognitiveState {
    return {
      agentId: this.id,
      energy: this.energy,
      currentGoal: this.currentGoal,
      knowledgeCount: this.knowledge.longTermSize,
      workingMemorySize: this.knowledge.workingMemorySize,
      recentSuccessRate: this.learning.getSuccessRate(),
      mood: this.energy > 50 ? 0.7 : 0.3,
      skillsAcquired: [...this.skills],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Collective Intelligence — multi-agent shared reasoning
// ═══════════════════════════════════════════════════════════════════

export type VotingMethod =
  | 'simple_majority' | 'ranked_choice' | 'weighted' | 'approval' | 'consensus';

export interface CollectiveDecision {
  question: string;
  votes: Map<string, string>;
  result: string;
  confidence: number;
  method: VotingMethod;
}

export interface SharedKnowledgeNode {
  id: string;
  content: string;
  contributedBy: string;
  confidence: number;
  evidenceCount: number;
  refutationCount: number;
  tags: string[];
}

export interface Idea {
  id: string;
  content: string;
  proposedBy: string;
  novelty: number;
  feasibility: number;
  impact: number;
  fitness: number;
  generation: number;
  parents: string[];
}

export class SharedKnowledgeGraph {
  private nodes = new Map<string, SharedKnowledgeNode>();
  private edges: Array<{ from: string; to: string; type: string; strength: number }> = [];
  private nextId = 0;

  contribute(content: string, agentId: string, tags: string[] = []): SharedKnowledgeNode {
    const id = `skn_${this.nextId++}`;
    const node: SharedKnowledgeNode = {
      id,
      content,
      contributedBy: agentId,
      confidence: 0.5,
      evidenceCount: 1,
      refutationCount: 0,
      tags,
    };
    this.nodes.set(id, node);
    return node;
  }

  support(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.evidenceCount++;
    node.confidence = node.evidenceCount / (node.evidenceCount + node.refutationCount);
    return true;
  }

  refute(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.refutationCount++;
    node.confidence = node.evidenceCount / (node.evidenceCount + node.refutationCount);
    return true;
  }

  query(tags: string[]): SharedKnowledgeNode[] {
    return [...this.nodes.values()]
      .filter(n => tags.some(t => n.tags.includes(t)))
      .sort((a, b) => b.confidence - a.confidence);
  }

  link(fromId: string, toId: string, type: string, strength = 1): boolean {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return false;
    this.edges.push({ from: fromId, to: toId, type, strength });
    return true;
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.length;
  }
}

export class IdeaEvolution {
  private ideas: Idea[] = [];
  private generation = 0;
  private nextId = 0;

  propose(content: string, agentId: string): Idea {
    const idea: Idea = {
      id: `idea_${this.nextId++}`,
      content,
      proposedBy: agentId,
      novelty: 0.5,
      feasibility: 0.5,
      impact: 0.5,
      fitness: 0.5,
      generation: this.generation,
      parents: [],
    };
    this.ideas.push(idea);
    return idea;
  }

  breed(parentA: Idea, parentB: Idea, agentId: string): Idea {
    const child: Idea = {
      id: `idea_${this.nextId++}`,
      content: `${parentA.content} + ${parentB.content}`,
      proposedBy: agentId,
      novelty: (parentA.novelty + parentB.novelty) / 2 + 0.1,
      feasibility: Math.min(parentA.feasibility, parentB.feasibility),
      impact: Math.max(parentA.impact, parentB.impact),
      fitness: (parentA.fitness + parentB.fitness) / 2,
      generation: this.generation,
      parents: [parentA.id, parentB.id],
    };
    this.ideas.push(child);
    return child;
  }

  evolve(): Idea[] {
    this.generation++;
    // select top ideas by fitness
    this.ideas.sort((a, b) => b.fitness - a.fitness);
    return this.ideas.slice(0, 10);
  }

  scoreFitness(ideaId: string, novelty: number, feasibility: number, impact: number): boolean {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return false;
    idea.novelty = novelty;
    idea.feasibility = feasibility;
    idea.impact = impact;
    idea.fitness = (novelty + feasibility + impact) / 3;
    return true;
  }

  get ideaCount(): number {
    return this.ideas.length;
  }

  get currentGeneration(): number {
    return this.generation;
  }
}

export class SwarmDecisionMaking {
  decide(
    question: string,
    options: string[],
    votes: Map<string, string>,
    method: VotingMethod = 'simple_majority',
  ): CollectiveDecision {
    let result: string;
    let confidence: number;

    switch (method) {
      case 'simple_majority': {
        const counts = new Map<string, number>();
        for (const vote of votes.values()) {
          counts.set(vote, (counts.get(vote) ?? 0) + 1);
        }
        let maxCount = 0;
        result = options[0] ?? '';
        for (const [option, count] of counts) {
          if (count > maxCount) {
            maxCount = count;
            result = option;
          }
        }
        confidence = votes.size > 0 ? maxCount / votes.size : 0;
        break;
      }
      case 'consensus': {
        const counts = new Map<string, number>();
        for (const vote of votes.values()) {
          counts.set(vote, (counts.get(vote) ?? 0) + 1);
        }
        result = options[0] ?? '';
        let maxRatio = 0;
        for (const [option, count] of counts) {
          const ratio = count / votes.size;
          if (ratio > maxRatio) {
            maxRatio = ratio;
            result = option;
          }
        }
        confidence = maxRatio >= 0.8 ? maxRatio : maxRatio * 0.5; // penalize non-consensus
        break;
      }
      default:
        // fallback to simple majority for other methods
        result = options[0] ?? '';
        confidence = 0.5;
    }

    return { question, votes, result, confidence, method };
  }
}

export class CollectiveIntelligenceEngine {
  readonly sharedKnowledge: SharedKnowledgeGraph;
  readonly ideas: IdeaEvolution;
  readonly decisions: SwarmDecisionMaking;

  constructor() {
    this.sharedKnowledge = new SharedKnowledgeGraph();
    this.ideas = new IdeaEvolution();
    this.decisions = new SwarmDecisionMaking();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Autonomous Agent — personality-driven with PALA cycle
// ═══════════════════════════════════════════════════════════════════

export interface AgentPersonality {
  curiosity: number;
  aggression: number;
  sociability: number;
  creativity: number;
  patience: number;
}

export type EnvironmentActionType =
  | 'move' | 'interact' | 'communicate' | 'evolve'
  | 'create' | 'observe' | 'wait';

export interface EnvironmentAction {
  type: EnvironmentActionType;
  target?: string;
  parameters?: Record<string, unknown>;
}

export interface AgentMemoryStore {
  episodic: Array<{ event: string; tick: number; importance: number }>;
  semantic: Map<string, unknown>;
  goals: string[];
  beliefs: Map<string, number>;
}

const ACTION_ENERGY_COSTS: Record<EnvironmentActionType, number> = {
  move: 2,
  interact: 3,
  communicate: 1,
  evolve: 8,
  create: 5,
  observe: 0.5,
  wait: 0,
};

const MAX_EPISODIC_MEMORIES = 200;

export class AutonomousAgent {
  readonly name: string;
  readonly personality: AgentPersonality;
  private energy = 100;
  private memory: AgentMemoryStore;
  private tick = 0;

  constructor(name: string, personality: AgentPersonality) {
    this.name = name;
    this.personality = personality;
    this.memory = {
      episodic: [],
      semantic: new Map(),
      goals: [],
      beliefs: new Map(),
    };
  }

  perceive(environment: { entities: string[]; messages: string[] }): string[] {
    const observations: string[] = [];
    // curiosity affects how much we notice
    const noticeThreshold = 1 - this.personality.curiosity;
    for (const entity of environment.entities) {
      if (Math.random() > noticeThreshold) {
        observations.push(`Observed: ${entity}`);
      }
    }
    for (const msg of environment.messages) {
      if (this.personality.sociability > 0.3) {
        observations.push(`Heard: ${msg}`);
      }
    }
    return observations;
  }

  plan(): EnvironmentAction {
    // personality-driven action selection
    if (this.energy < 10) return { type: 'wait' };

    if (this.personality.curiosity > 0.7) return { type: 'observe' };
    if (this.personality.creativity > 0.7) return { type: 'create' };
    if (this.personality.sociability > 0.7) return { type: 'communicate' };
    if (this.personality.aggression > 0.7) return { type: 'interact' };

    return { type: 'observe' };
  }

  act(action: EnvironmentAction): boolean {
    const cost = ACTION_ENERGY_COSTS[action.type];
    if (this.energy < cost) return false;
    this.energy -= cost;
    this.tick++;

    // record in episodic memory
    this.memory.episodic.push({
      event: `${action.type}${action.target ? ` → ${action.target}` : ''}`,
      tick: this.tick,
      importance: cost / 8, // normalize by max cost
    });
    if (this.memory.episodic.length > MAX_EPISODIC_MEMORIES) {
      this.memory.episodic.shift();
    }

    return true;
  }

  learn(fact: string, confidence: number): void {
    this.memory.semantic.set(fact, confidence);
    this.memory.beliefs.set(fact, confidence);
  }

  addGoal(goal: string): void {
    if (!this.memory.goals.includes(goal)) {
      this.memory.goals.push(goal);
    }
  }

  recharge(amount: number): void {
    this.energy = Math.min(100, this.energy + amount);
  }

  getState(): {
    name: string;
    energy: number;
    tick: number;
    memories: number;
    goals: string[];
    beliefs: number;
  } {
    return {
      name: this.name,
      energy: this.energy,
      tick: this.tick,
      memories: this.memory.episodic.length,
      goals: [...this.memory.goals],
      beliefs: this.memory.beliefs.size,
    };
  }
}

export function createRandomAgent(name: string, rng: DeterministicRNG): AutonomousAgent {
  return new AutonomousAgent(name, {
    curiosity: rng.next(),
    aggression: rng.next(),
    sociability: rng.next(),
    creativity: rng.next(),
    patience: rng.next(),
  });
}

export function createAgentTeam(names: string[], rng: DeterministicRNG): AutonomousAgent[] {
  return names.map(name => createRandomAgent(name, rng));
}

// ═══════════════════════════════════════════════════════════════════
// Agent Environment — multi-agent orchestrator
// ═══════════════════════════════════════════════════════════════════

export interface EnvironmentState {
  tick: number;
  entities: Map<string, Record<string, unknown>>;
  resources: Map<string, number>;
  messages: string[];
}

export interface EnvironmentSnapshot {
  tick: number;
  agentCount: number;
  totalEnergy: number;
  messages: number;
  events: string[];
}

export class AgentEnvironment {
  private agents = new Map<string, AutonomousAgent>();
  private state: EnvironmentState;
  private snapshots: EnvironmentSnapshot[] = [];
  private tick = 0;

  constructor() {
    this.state = {
      tick: 0,
      entities: new Map(),
      resources: new Map(),
      messages: [],
    };
  }

  addAgent(agent: AutonomousAgent): void {
    this.agents.set(agent.name, agent);
  }

  removeAgent(name: string): boolean {
    return this.agents.delete(name);
  }

  addEntity(id: string, properties: Record<string, unknown> = {}): void {
    this.state.entities.set(id, properties);
  }

  addResource(id: string, amount: number): void {
    this.state.resources.set(id, (this.state.resources.get(id) ?? 0) + amount);
  }

  step(): EnvironmentSnapshot {
    this.tick++;
    this.state.tick = this.tick;
    const events: string[] = [];

    for (const agent of this.agents.values()) {
      // perceive
      const observations = agent.perceive({
        entities: [...this.state.entities.keys()],
        messages: this.state.messages,
      });

      // plan
      const action = agent.plan();

      // act
      const success = agent.act(action);
      if (success) {
        events.push(`${agent.name}: ${action.type}`);
      }

      // recharge slowly
      agent.recharge(1);
    }

    // clear messages after processing
    this.state.messages = [];

    const snapshot: EnvironmentSnapshot = {
      tick: this.tick,
      agentCount: this.agents.size,
      totalEnergy: [...this.agents.values()].reduce(
        (s, a) => s + a.getState().energy, 0,
      ),
      messages: 0,
      events,
    };
    this.snapshots.push(snapshot);

    return snapshot;
  }

  broadcast(message: string): void {
    this.state.messages.push(message);
  }

  getSnapshot(): EnvironmentSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  getAgent(name: string): AutonomousAgent | undefined {
    return this.agents.get(name);
  }

  get agentCount(): number {
    return this.agents.size;
  }

  get currentTick(): number {
    return this.tick;
  }
}
