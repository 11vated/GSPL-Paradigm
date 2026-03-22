/**
 * @paradigm/types — Complete type definitions for GSPL Paradigm.
 *
 * Zero runtime code. This package defines every shared interface, type alias,
 * and enum used across the 40-package Paradigm platform.
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────
// Gene System (9 types)
// ─────────────────────────────────────────────

export type GeneType =
  | 'scalar'
  | 'categorical'
  | 'vector'
  | 'expression'
  | 'struct'
  | 'array'
  | 'graph'
  | 'tensor'
  | 'timeseries';

export interface ScalarGene {
  readonly type: 'scalar';
  value: number;
  min: number;
  max: number;
  step?: number;
}

export interface CategoricalGene {
  readonly type: 'categorical';
  value: string;
  options: string[];
  weights?: number[];
}

export interface VectorGene {
  readonly type: 'vector';
  value: number[];
  dimensions: number;
  min?: number[];
  max?: number[];
}

export interface ExpressionGene {
  readonly type: 'expression';
  source: string;
  compiled?: (vars: Record<string, number>) => number;
}

export interface StructGene {
  readonly type: 'struct';
  value: Record<string, Gene>;
}

export interface ArrayGene {
  readonly type: 'array';
  value: Gene[];
  minLength?: number;
  maxLength?: number;
}

export interface GraphGene {
  readonly type: 'graph';
  nodes: Map<string, Gene>;
  edges: Array<{ from: string; to: string; weight: Gene }>;
}

export interface TensorGene {
  readonly type: 'tensor';
  data: Float64Array;
  shape: number[];
}

export interface TimeSeriesGene {
  readonly type: 'timeseries';
  keyframes: Array<{ t: number; v: number }>;
  interpolation: 'linear' | 'cubic' | 'step';
}

export type Gene =
  | ScalarGene
  | CategoricalGene
  | VectorGene
  | ExpressionGene
  | StructGene
  | ArrayGene
  | GraphGene
  | TensorGene
  | TimeSeriesGene;

export type GeneMap = Record<string, Gene>;

// ─────────────────────────────────────────────
// Seed Types
// ─────────────────────────────────────────────

export interface FitnessVector {
  primary?: number;
  [key: string]: number | undefined;
}

export interface LineageRecord {
  generation: number;
  parents: Array<{
    id: string;
    name: string;
    fitness?: FitnessVector;
  }>;
  breedingStrategy?: 'crossover' | 'mutation' | 'fission' | 'cloning';
  mutationIntensity?: number;
  crossoverStrategy?: string;
  timestamp: number;
}

export type SeedDomain =
  // Core domains
  | 'organism' | 'vehicle' | 'weapon' | 'building' | 'terrain'
  | 'material' | 'plant' | 'insect' | 'fish' | 'bird'
  | 'mammal' | 'robot' | 'particle' | 'fluid' | 'crystal'
  | 'sound' | 'music' | 'pattern' | 'network' | 'language'
  | 'code' | 'strategy' | 'schedule' | 'rule' | 'constraint'
  | 'ecosystem' | 'game' | 'simulation' | 'audio' | 'narrative'
  | 'ui' | 'city' | 'neural' | 'intelligence' | 'quantum'
  | 'molecular' | 'education' | 'finance' | 'infrastructure'
  | 'product' | 'seed-intelligence' | 'void' | 'web'
  // Visual & interaction domains
  | 'render' | 'shader' | 'animation-visual' | 'interaction'
  | 'aesthetic' | 'emotion' | 'perception' | 'cinematic'
  // Asset pipeline domains
  | 'rig' | 'mocap' | 'lod' | 'texture' | 'logo' | 'brand' | 'compression'
  // Security domains
  | 'security-threat' | 'intrusion' | 'forensics'
  // Memory domain
  | 'memory-store';

export interface SeedMetadata {
  created: number;
  creator?: string;
  description?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface ActivationState {
  alive: boolean;
  active: boolean;
  energy: number;
  age: number;
  customState?: Record<string, unknown>;
}

export interface CompositionOperator {
  type: 'union' | 'intersection' | 'weighted_sum' | 'custom';
  genes: string[];
  weights?: number[];
  metadata?: Record<string, unknown>;
}

// NEW in Paradigm 4.0: Visual metadata for no-code users
export interface DisplayHints {
  icon?: string;
  color?: string;
  thumbnail?: string;
  category?: string;
  description?: string;
  tags?: string[];
}

// NEW in Paradigm 4.0: Seed-to-seed relationships
export interface SeedRelation {
  targetHash: string;
  type: 'contains' | 'depends_on' | 'opposes' | 'allied_with'
      | 'evolved_from' | 'part_of' | 'custom';
  label?: string;
  weight?: number;
}

// NEW in Paradigm 4.0: Behavior script references
export interface BehaviorRef {
  scriptId: string;
  name: string;
  parameters?: Record<string, unknown>;
}

export interface UniversalSeed<TGenes extends GeneMap = GeneMap> {
  readonly $gst: '4.0';
  readonly $domain: SeedDomain;
  $hash: string;
  $name: string;
  $lineage: LineageRecord;
  genes: TGenes;
  $fitness?: FitnessVector;
  $operators?: CompositionOperator[];
  $metadata: SeedMetadata;
  $activation?: ActivationState;
  // Paradigm 4.0 additions
  $display?: DisplayHints;
  $relations?: SeedRelation[];
  $behaviors?: BehaviorRef[];
}

// ─────────────────────────────────────────────
// Event Types
// ─────────────────────────────────────────────

export interface SeedCreatedEvent {
  readonly type: 'seed.created';
  seed: UniversalSeed;
  timestamp: number;
}

export interface SeedMutatedEvent {
  readonly type: 'seed.mutated';
  original: UniversalSeed;
  mutated: UniversalSeed;
  intensity: number;
  timestamp: number;
}

export interface SeedBredEvent {
  readonly type: 'seed.bred';
  parentA: UniversalSeed;
  parentB: UniversalSeed;
  child: UniversalSeed;
  strategy: string;
  timestamp: number;
}

export interface SeedDiedEvent {
  readonly type: 'seed.died';
  seed: UniversalSeed;
  cause: string;
  timestamp: number;
}

export interface EvolutionTickEvent {
  readonly type: 'evolution.tick';
  generation: number;
  populationSize: number;
  bestFitness: number;
  avgFitness: number;
  diversity: number;
  timestamp: number;
}

export interface WorldChangedEvent {
  readonly type: 'world.changed';
  action: string;
  seedCount: number;
  timestamp: number;
}

export interface SimulationStepEvent {
  readonly type: 'simulation.step';
  tick: number;
  seedCount: number;
  timestamp: number;
}

export interface ForgeCompleteEvent {
  readonly type: 'forge.complete';
  seedHash: string;
  artifactType: string;
  timestamp: number;
}

export interface AgentResponseEvent {
  readonly type: 'agent.response';
  message: string;
  toolsUsed: string[];
  timestamp: number;
}

export type ParadigmEvent =
  | SeedCreatedEvent
  | SeedMutatedEvent
  | SeedBredEvent
  | SeedDiedEvent
  | EvolutionTickEvent
  | WorldChangedEvent
  | SimulationStepEvent
  | ForgeCompleteEvent
  | AgentResponseEvent;

// ─────────────────────────────────────────────
// Agent Types
// ─────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, ToolParameter>;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export type IntentType =
  | 'create' | 'breed' | 'mutate' | 'evolve'
  | 'inspect' | 'query' | 'explain' | 'compare'
  | 'optimize' | 'simulate' | 'export' | 'import'
  | 'help' | 'status' | 'undo' | 'redo' | 'meta'
  | 'forge' | 'search' | 'configure';

export interface ParsedIntent {
  type: IntentType;
  entities: Record<string, string>;
  confidence: number;
  rawInput: string;
}

// ─────────────────────────────────────────────
// Quality Types
// ─────────────────────────────────────────────

export type QualityDimension =
  | 'completeness' | 'coherence' | 'consistency'
  | 'diversity' | 'realism' | 'interactivity' | 'aesthetics';

export interface QualityScore {
  dimensions: Record<QualityDimension, number>;
  overall: number;
}

export type GapType =
  | 'missing_behavior' | 'missing_visual' | 'missing_voice'
  | 'missing_animation' | 'missing_physics' | 'missing_detail'
  | 'missing_consistency' | 'missing_structure'
  | 'missing_ability' | 'missing_relationship';

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface GapReport {
  gaps: Array<{
    type: GapType;
    severity: GapSeverity;
    description: string;
    suggestedFix?: string;
  }>;
  totalGaps: number;
  criticalCount: number;
  highCount: number;
  qualityBefore: number;
}

// ─────────────────────────────────────────────
// Crossover & Mutation Config
// ─────────────────────────────────────────────

export type CrossoverStrategy =
  | 'uniform' | 'single_point' | 'blend' | 'sbx' | 'layer';

export type SelectionStrategy =
  | 'tournament' | 'roulette' | 'rank' | 'truncation';

export interface EvolutionConfig {
  populationSize: number;
  generations: number;
  mutationRate: number;
  crossoverRate: number;
  elitismCount: number;
  selectionStrategy: SelectionStrategy;
  crossoverStrategy: CrossoverStrategy;
  tournamentSize?: number;
}

// ─────────────────────────────────────────────
// Marketplace Types
// ─────────────────────────────────────────────

export type PricingModel =
  | { type: 'free' }
  | { type: 'fixed'; price: number; currency: string }
  | { type: 'auction'; startPrice: number; minBid: number; endDate: number }
  | { type: 'donation'; suggestedAmount: number };

export interface SeedListing {
  id: string;
  seedHash: string;
  seller: string;
  pricing: PricingModel;
  title: string;
  description: string;
  tags: string[];
  domain: SeedDomain;
  fitness?: number;
  downloads: number;
  rating: number;
  reviewCount: number;
  createdAt: number;
}

export interface SeedReview {
  id: string;
  listingId: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  helpfulVotes: number;
  createdAt: number;
}

export type ReputationBadge =
  | 'seed_creator' | 'evolution_master' | 'community_helper'
  | 'top_seller' | 'curator' | 'pioneer';

export interface UserProfile {
  id: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  joinDate: number;
  badges: ReputationBadge[];
  seedCount: number;
  totalDownloads: number;
}

// ─────────────────────────────────────────────
// Security Types
// ─────────────────────────────────────────────

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target?: string;
  details: Record<string, unknown>;
  timestamp: number;
  prevHash: string;
  hash: string;
}

export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export interface ConsentDecision {
  id: string;
  userId: string;
  purpose: string;
  granted: boolean;
  timestamp: number;
  expiresAt?: number;
}

// ─────────────────────────────────────────────
// Concept & Identity Types
// ─────────────────────────────────────────────

export type ArchetypeId =
  | 'trickster' | 'hero' | 'sage' | 'lover'
  | 'creator' | 'destroyer' | 'ruler' | 'everyman'
  | 'rebel' | 'caregiver' | 'explorer' | 'jester';

export type ConceptType =
  | 'character' | 'creature' | 'object' | 'environment'
  | 'system' | 'abstract' | 'phenomenon' | 'interaction';

export type StyleType =
  | 'anime' | 'realistic' | 'pixel' | 'cyberpunk'
  | 'fantasy' | 'minimal' | 'cartoon' | 'noir' | 'default';

export type ConceptComplexity = 'simple' | 'moderate' | 'complex' | 'extreme';

export interface ConceptClassification {
  conceptType: ConceptType;
  style: StyleType;
  complexity: ConceptComplexity;
  realism: 'stylized' | 'semi_realistic' | 'photorealistic' | 'abstract';
  keywords: string[];
  confidence: number;
}

export interface PersonalityVector {
  // Big Five
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  // Character traits
  wit: number;
  cunning: number;
  courage: number;
  loyalty: number;
  adaptability: number;
}

export interface CharacterFingerprint {
  identityHash: string;
  visualHash: string;
  voiceHash: string;
  behaviorHash: string;
}

// ─────────────────────────────────────────────
// LLM Types (provider-agnostic)
// ─────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
}
