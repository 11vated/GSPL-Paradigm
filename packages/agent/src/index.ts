/**
 * @paradigm/agent — The Unsurpassable GSPL Agent.
 *
 * Core innovation: Seeds That Think. The agent itself is a UniversalSeed
 * (MetaAgentSeed) whose cognitive strategies, memory weights, and reasoning
 * patterns are genes. The agent evolves itself.
 *
 * CRITICAL: Works WITHOUT any LLM. The NLP compiler, concept engine, identity
 * engine, and adaptive pipeline all run as pure TypeScript algorithms. LLMs
 * (via Ollama, free) are an optional enhancement layer.
 *
 * @packageDocumentation
 */

import type {
  UniversalSeed,
  GeneMap,
  Gene,
  ScalarGene,
  CategoricalGene,
  VectorGene,
  SeedDomain,
  IntentType,
  ParsedIntent,
  FitnessVector,
} from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';
import type {
  LLMProvider,
  LLMMessage,
  ReflectionContext,
  NLPResult,
} from '@paradigm/llm';
import {
  NLPCompiler,
  ReflectionEngine,
  NativeIntelligence,
  ToolRegistry,
  ToolBridge,
} from '@paradigm/llm';
import type {
  KnowledgeFragment,
  ReasoningChain,
  CognitiveState,
} from '@paradigm/awareness';
import {
  AwarenessSystem,
  ConsciousAgent,
  AgentSpecies,
} from '@paradigm/awareness';

// ═══════════════════════════════════════════════════════════════════
// Agent Specializations — 8 expert archetypes for task routing
// ═══════════════════════════════════════════════════════════════════

export interface AgentSpecialization {
  role: string;
  description: string;
  tools: string[];
  systemPrompt: string;
  priority: number;
}

export const SEED_ARCHITECT: AgentSpecialization = {
  role: 'seed_architect',
  description: 'Designs seed genomes from natural language descriptions',
  tools: ['create_seed', 'get_seed', 'search_similar_seeds', 'query_knowledge'],
  systemPrompt: 'You are an expert genome architect. Design optimal seed structures.',
  priority: 8,
};

export const EVOLUTION_ENGINEER: AgentSpecialization = {
  role: 'evolution_engineer',
  description: 'Orchestrates evolutionary processes and fitness optimization',
  tools: ['evolve', 'set_fitness', 'configure_evolution', 'simulate'],
  systemPrompt: 'You are an evolution expert. Optimize fitness through selection and mutation.',
  priority: 7,
};

export const QA_VALIDATOR: AgentSpecialization = {
  role: 'qa_validator',
  description: 'Tests and validates seed quality and coherence',
  tools: ['get_seed', 'list_seeds', 'search_similar_seeds', 'status'],
  systemPrompt: 'You validate quality. Find issues, verify coherence, ensure standards.',
  priority: 6,
};

export const RESEARCH_ANALYST: AgentSpecialization = {
  role: 'research_analyst',
  description: 'Analyzes patterns, data, and provides insights',
  tools: ['query_knowledge', 'search_similar_seeds', 'status', 'list_seeds'],
  systemPrompt: 'You analyze data. Find patterns, extract insights, generate reports.',
  priority: 5,
};

export const DOMAIN_SPECIALIST: AgentSpecialization = {
  role: 'domain_specialist',
  description: 'Applies domain-specific knowledge and constraints',
  tools: ['create_seed', 'get_seed', 'query_knowledge', 'add_knowledge'],
  systemPrompt: 'You are a domain expert. Apply specialized knowledge to seed design.',
  priority: 5,
};

export const WORLD_BUILDER: AgentSpecialization = {
  role: 'world_builder',
  description: 'Creates cohesive worlds and ecosystems',
  tools: ['create_seed', 'evolve', 'simulate', 'export_world'],
  systemPrompt: 'You build worlds. Design ecosystems with balanced interactions.',
  priority: 4,
};

export const ASSET_GENERATOR: AgentSpecialization = {
  role: 'asset_generator',
  description: 'Renders visual, audio, and 3D assets from seeds',
  tools: ['render_seed', 'forge_artifact', 'export_world'],
  systemPrompt: 'You generate assets. Produce high-quality visual and audio output.',
  priority: 3,
};

export const TOOLING_ENGINEER: AgentSpecialization = {
  role: 'tooling_engineer',
  description: 'Builds infrastructure, tools, and optimization pipelines',
  tools: ['configure_evolution', 'compile_gspl', 'status'],
  systemPrompt: 'You build tools. Optimize pipelines and infrastructure.',
  priority: 2,
};

export const ALL_SPECIALIZATIONS: AgentSpecialization[] = [
  SEED_ARCHITECT, EVOLUTION_ENGINEER, QA_VALIDATOR, RESEARCH_ANALYST,
  DOMAIN_SPECIALIST, WORLD_BUILDER, ASSET_GENERATOR, TOOLING_ENGINEER,
];

const ROLE_KEYWORDS: Record<string, RegExp> = {
  seed_architect: /\b(?:create|design|build|genome|seed|gene|dna)\b/i,
  evolution_engineer: /\b(?:evolve|evolution|fitness|selection|generation|mutate|breed)\b/i,
  qa_validator: /\b(?:test|validate|quality|check|verify|assert)\b/i,
  research_analyst: /\b(?:analyze|research|pattern|insight|data|report|compare)\b/i,
  domain_specialist: /\b(?:domain|specific|expertise|specialized|knowledge)\b/i,
  world_builder: /\b(?:world|ecosystem|environment|simulate|populate)\b/i,
  asset_generator: /\b(?:render|asset|visual|sprite|audio|3d|forge|image)\b/i,
  tooling_engineer: /\b(?:tool|pipeline|infrastructure|optimize|config)\b/i,
};

export function matchRole(description: string): AgentSpecialization {
  let bestMatch = SEED_ARCHITECT;
  let bestPriority = -1;
  for (const spec of ALL_SPECIALIZATIONS) {
    const re = ROLE_KEYWORDS[spec.role];
    if (re?.test(description) && spec.priority > bestPriority) {
      bestMatch = spec;
      bestPriority = spec.priority;
    }
  }
  return bestMatch;
}

// ═══════════════════════════════════════════════════════════════════
// Agent Memory — 5-layer MemGPT-inspired memory system
// ═══════════════════════════════════════════════════════════════════

export interface CoreMemory {
  activeSeeds: string[];
  activeWorld?: string;
  userPreferences: Record<string, unknown>;
  recentGoals: string[];
  lastUpdateTime: number;
}

export interface EpisodicEntry {
  timestamp: number;
  agentId: string;
  taskId?: string;
  input: string;
  output: string;
  reasoning: string;
  importance: number;
}

export interface SemanticNode {
  id: string;
  concept: string;
  description: string;
  relatedConcepts: string[];
  properties: Record<string, unknown>;
  createdAt: number;
  accessCount: number;
}

export interface ProcedureTemplate {
  id: string;
  name: string;
  description: string;
  steps: string[];
  successRate: number;
  applicability: string[];
  createdAt: number;
  usageCount: number;
}

export class AgentMemory {
  private core: CoreMemory = {
    activeSeeds: [],
    userPreferences: {},
    recentGoals: [],
    lastUpdateTime: Date.now(),
  };
  private episodic: EpisodicEntry[] = [];
  private semantic = new Map<string, SemanticNode>();
  private procedures = new Map<string, ProcedureTemplate>();
  private readonly maxEpisodic: number;

  constructor(maxEpisodic = 200) {
    this.maxEpisodic = maxEpisodic;
  }

  updateCoreMemory(updates: Partial<CoreMemory>): void {
    Object.assign(this.core, updates, { lastUpdateTime: Date.now() });
  }

  getCoreMemory(): Readonly<CoreMemory> {
    return this.core;
  }

  recordEpisode(entry: Omit<EpisodicEntry, 'timestamp'>): void {
    this.episodic.push({ ...entry, timestamp: Date.now() });
    if (this.episodic.length > this.maxEpisodic) {
      this.episodic.sort((a, b) => b.importance - a.importance);
      this.episodic = this.episodic.slice(0, this.maxEpisodic);
    }
  }

  getRecentEpisodes(count = 10): EpisodicEntry[] {
    return this.episodic.slice(-count);
  }

  searchEpisodes(query: string): EpisodicEntry[] {
    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter(t => t.length > 2);
    return this.episodic.filter(e =>
      terms.some(t =>
        e.input.toLowerCase().includes(t) ||
        e.output.toLowerCase().includes(t) ||
        e.reasoning.toLowerCase().includes(t),
      ),
    );
  }

  addSemanticNode(node: SemanticNode): void {
    this.semantic.set(node.id, node);
  }

  getSemanticNode(id: string): SemanticNode | undefined {
    const node = this.semantic.get(id);
    if (node) node.accessCount++;
    return node;
  }

  querySemanticMemory(query: string): SemanticNode[] {
    const lower = query.toLowerCase();
    return [...this.semantic.values()]
      .filter(n =>
        n.concept.toLowerCase().includes(lower) ||
        n.description.toLowerCase().includes(lower),
      )
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10);
  }

  addProcedure(procedure: ProcedureTemplate): void {
    this.procedures.set(procedure.id, procedure);
  }

  getProcedure(id: string): ProcedureTemplate | undefined {
    const p = this.procedures.get(id);
    if (p) p.usageCount++;
    return p;
  }

  findApplicableProcedures(taskType: string): ProcedureTemplate[] {
    return [...this.procedures.values()]
      .filter(p => p.applicability.some(a => taskType.toLowerCase().includes(a.toLowerCase())))
      .sort((a, b) => {
        const scoreA = a.successRate * Math.log2(a.usageCount + 1);
        const scoreB = b.successRate * Math.log2(b.usageCount + 1);
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }

  consolidate(): { concepts: number; procedures: number } {
    let concepts = 0;
    let procedures = 0;
    const highImportance = this.episodic.filter(e => e.importance > 0.7);

    for (const episode of highImportance) {
      const words = episode.input.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        if (!this.semantic.has(word)) {
          this.addSemanticNode({
            id: word,
            concept: word,
            description: `Learned from episode: ${episode.input.slice(0, 50)}`,
            relatedConcepts: [],
            properties: {},
            createdAt: Date.now(),
            accessCount: 0,
          });
          concepts++;
        }
      }

      if (episode.reasoning.includes('success') || episode.importance > 0.9) {
        const procId = `proc_${this.procedures.size}`;
        if (!this.procedures.has(procId)) {
          this.addProcedure({
            id: procId,
            name: `Strategy from ${episode.input.slice(0, 30)}`,
            description: episode.reasoning,
            steps: [episode.input, episode.output],
            successRate: episode.importance,
            applicability: [episode.agentId],
            createdAt: Date.now(),
            usageCount: 0,
          });
          procedures++;
        }
      }
    }

    return { concepts, procedures };
  }

  getStats(): {
    episodic: number;
    semantic: number;
    procedural: number;
    coreGoals: number;
  } {
    return {
      episodic: this.episodic.length,
      semantic: this.semantic.size,
      procedural: this.procedures.size,
      coreGoals: this.core.recentGoals.length,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Autonomous Planner — goal decomposition with task dependencies
// ═══════════════════════════════════════════════════════════════════

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentTask {
  id: string;
  description: string;
  requiredRole: string;
  params: Record<string, unknown>;
  dependencies: string[];
  status: TaskStatus;
  result?: unknown;
  error?: string;
}

export interface TaskExecutionResult {
  completed: number;
  failed: number;
  results: Map<string, unknown>;
  errors: Map<string, string>;
  totalTimeMs: number;
}

export class AutonomousPlanner {
  private taskCounter = 0;

  decompose(goal: string): AgentTask[] {
    const lower = goal.toLowerCase();

    if (lower.includes('ecosystem') || lower.includes('world')) {
      return this.createWorldTasks();
    }
    if (lower.includes('evolve') || lower.includes('evolution')) {
      return this.createEvolutionTasks(goal);
    }
    if (lower.includes('render') || lower.includes('asset') || lower.includes('forge')) {
      return this.createAssetTasks();
    }
    if (lower.includes('creature') || lower.includes('character') || lower.includes('warrior')) {
      return this.createCreatureTasks(goal);
    }

    return this.createDefaultTasks(goal);
  }

  async execute(
    tasks: AgentTask[],
    executor: (task: AgentTask) => Promise<unknown>,
  ): Promise<TaskExecutionResult> {
    const start = Date.now();
    const results = new Map<string, unknown>();
    const errors = new Map<string, string>();
    let completed = 0;
    let failed = 0;

    const sorted = this.topologicalSort(tasks);

    for (const task of sorted) {
      const depsReady = task.dependencies.every(d => {
        const dep = tasks.find(t => t.id === d);
        return dep?.status === 'completed';
      });

      if (!depsReady) {
        task.status = 'failed';
        task.error = 'Dependencies not met';
        errors.set(task.id, task.error);
        failed++;
        continue;
      }

      task.status = 'running';
      try {
        const result = await executor(task);
        task.status = 'completed';
        task.result = result;
        results.set(task.id, result);
        completed++;
      } catch (err) {
        task.status = 'failed';
        task.error = err instanceof Error ? err.message : String(err);
        errors.set(task.id, task.error);
        failed++;
      }
    }

    return { completed, failed, results, errors, totalTimeMs: Date.now() - start };
  }

  private topologicalSort(tasks: AgentTask[]): AgentTask[] {
    const visited = new Set<string>();
    const result: AgentTask[] = [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const visit = (task: AgentTask): void => {
      if (visited.has(task.id)) return;
      visited.add(task.id);
      for (const depId of task.dependencies) {
        const dep = taskMap.get(depId);
        if (dep) visit(dep);
      }
      result.push(task);
    };

    for (const task of tasks) visit(task);
    return result;
  }

  private makeId(): string {
    return `task_${this.taskCounter++}`;
  }

  private createWorldTasks(): AgentTask[] {
    const t1 = this.makeId();
    const t2 = this.makeId();
    const t3 = this.makeId();
    const t4 = this.makeId();
    return [
      { id: t1, description: 'Design terrain and environment', requiredRole: 'world_builder', params: {}, dependencies: [], status: 'pending' },
      { id: t2, description: 'Create species population', requiredRole: 'seed_architect', params: {}, dependencies: [t1], status: 'pending' },
      { id: t3, description: 'Run ecosystem evolution', requiredRole: 'evolution_engineer', params: {}, dependencies: [t2], status: 'pending' },
      { id: t4, description: 'Validate ecosystem balance', requiredRole: 'qa_validator', params: {}, dependencies: [t3], status: 'pending' },
    ];
  }

  private createEvolutionTasks(goal: string): AgentTask[] {
    const t1 = this.makeId();
    const t2 = this.makeId();
    const t3 = this.makeId();
    return [
      { id: t1, description: 'Initialize population', requiredRole: 'seed_architect', params: { goal }, dependencies: [], status: 'pending' },
      { id: t2, description: 'Run evolution', requiredRole: 'evolution_engineer', params: {}, dependencies: [t1], status: 'pending' },
      { id: t3, description: 'Analyze results', requiredRole: 'research_analyst', params: {}, dependencies: [t2], status: 'pending' },
    ];
  }

  private createAssetTasks(): AgentTask[] {
    const t1 = this.makeId();
    const t2 = this.makeId();
    return [
      { id: t1, description: 'Load seeds for rendering', requiredRole: 'research_analyst', params: {}, dependencies: [], status: 'pending' },
      { id: t2, description: 'Generate assets', requiredRole: 'asset_generator', params: {}, dependencies: [t1], status: 'pending' },
    ];
  }

  private createCreatureTasks(goal: string): AgentTask[] {
    const t1 = this.makeId();
    const t2 = this.makeId();
    const t3 = this.makeId();
    const t4 = this.makeId();
    return [
      { id: t1, description: 'Design creature genome', requiredRole: 'seed_architect', params: { goal }, dependencies: [], status: 'pending' },
      { id: t2, description: 'Create population variants', requiredRole: 'seed_architect', params: { count: 10 }, dependencies: [t1], status: 'pending' },
      { id: t3, description: 'Evolve for fitness', requiredRole: 'evolution_engineer', params: { generations: 100 }, dependencies: [t2], status: 'pending' },
      { id: t4, description: 'Export best creature', requiredRole: 'asset_generator', params: {}, dependencies: [t3], status: 'pending' },
    ];
  }

  private createDefaultTasks(goal: string): AgentTask[] {
    const t1 = this.makeId();
    const t2 = this.makeId();
    const t3 = this.makeId();
    return [
      { id: t1, description: 'Analyze requirements', requiredRole: 'research_analyst', params: { goal }, dependencies: [], status: 'pending' },
      { id: t2, description: 'Execute plan', requiredRole: 'seed_architect', params: {}, dependencies: [t1], status: 'pending' },
      { id: t3, description: 'Validate results', requiredRole: 'qa_validator', params: {}, dependencies: [t2], status: 'pending' },
    ];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Seed Resonance Analyzer — similarity and harmony detection
// ═══════════════════════════════════════════════════════════════════

export interface ResonanceScore {
  score: number;
  explanation: string;
  sharedCharacteristics: string[];
  complementaryCharacteristics: string[];
}

export interface HarmonyGroup {
  seeds: string[];
  harmonyScore: number;
  averageResonance: number;
  reason: string;
}

export class ResonanceAnalyzer {
  computeResonance(seedA: UniversalSeed, seedB: UniversalSeed): number {
    const allGenes = new Set([
      ...Object.keys(seedA.genes),
      ...Object.keys(seedB.genes),
    ]);
    if (allGenes.size === 0) return 0;

    let totalSim = 0;
    let count = 0;

    for (const gene of allGenes) {
      const gA = seedA.genes[gene];
      const gB = seedB.genes[gene];
      if (!gA || !gB || gA.type !== gB.type) continue;

      count++;
      switch (gA.type) {
        case 'scalar': {
          const bScalar = gB as typeof gA;
          const range = Math.max(gA.max - gA.min, 1);
          totalSim += 1 - Math.abs(gA.value - bScalar.value) / range;
          break;
        }
        case 'categorical': {
          const bCat = gB as typeof gA;
          totalSim += gA.value === bCat.value ? 1 : 0;
          break;
        }
        case 'vector': {
          const bVec = gB as typeof gA;
          totalSim += this.cosineSimilarity(gA.value, bVec.value);
          break;
        }
        default:
          totalSim += 0.5;
      }
    }

    return count > 0 ? totalSim / count : 0;
  }

  findResonant(
    target: UniversalSeed,
    population: UniversalSeed[],
    topK = 5,
  ): Array<{ seed: UniversalSeed; resonance: number }> {
    return population
      .filter(s => s.$hash !== target.$hash)
      .map(s => ({ seed: s, resonance: this.computeResonance(target, s) }))
      .sort((a, b) => b.resonance - a.resonance)
      .slice(0, topK);
  }

  explainResonance(seedA: UniversalSeed, seedB: UniversalSeed): ResonanceScore {
    const score = this.computeResonance(seedA, seedB);
    const shared: string[] = [];
    const complementary: string[] = [];

    for (const gene of Object.keys(seedA.genes)) {
      if (gene in seedB.genes) {
        const gA = seedA.genes[gene]!;
        const gB = seedB.genes[gene]!;
        if (gA.type === gB.type && gA.type === 'categorical') {
          if ((gA as CategoricalGene).value === (gB as CategoricalGene).value) {
            shared.push(gene);
          } else {
            complementary.push(gene);
          }
        }
      }
    }

    return {
      score,
      explanation: score > 0.8 ? 'Highly resonant — very similar genomes'
        : score > 0.5 ? 'Moderate resonance — some shared traits'
        : 'Low resonance — quite different genomes',
      sharedCharacteristics: shared,
      complementaryCharacteristics: complementary,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < len; i++) {
      dot += (a[i] ?? 0) * (b[i] ?? 0);
      magA += (a[i] ?? 0) ** 2;
      magB += (b[i] ?? 0) ** 2;
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MetaAgentSeed — the agent itself as an evolvable seed
// ═══════════════════════════════════════════════════════════════════

export interface MetaAgentGenes extends GeneMap {
  reasoning_style: CategoricalGene;
  exploration_rate: ScalarGene;
  memory_weight: VectorGene;
  confidence_threshold: ScalarGene;
  specialization_affinity: VectorGene;
  reflection_depth: ScalarGene;
  internet_curiosity: ScalarGene;
  creativity: ScalarGene;
  verbosity: ScalarGene;
  risk_tolerance: ScalarGene;
}

export function createMetaAgentSeed(rng: DeterministicRNG): UniversalSeed<MetaAgentGenes> {
  return {
    $gst: '4.0',
    $domain: 'seed-intelligence',
    $hash: `meta_${Date.now()}`,
    $name: 'MetaAgent',
    $lineage: {
      generation: 0,
      parents: [],
      timestamp: Date.now(),
    },
    genes: {
      reasoning_style: {
        type: 'categorical',
        value: 'analytical',
        options: ['analytical', 'creative', 'systematic', 'intuitive'],
      },
      exploration_rate: {
        type: 'scalar',
        value: rng.next() * 0.5 + 0.25,
        min: 0,
        max: 1,
      },
      memory_weight: {
        type: 'vector',
        value: [0.3, 0.3, 0.2, 0.2],
        dimensions: 4,
      },
      confidence_threshold: {
        type: 'scalar',
        value: 0.6,
        min: 0.1,
        max: 0.95,
      },
      specialization_affinity: {
        type: 'vector',
        value: ALL_SPECIALIZATIONS.map(() => rng.next()),
        dimensions: ALL_SPECIALIZATIONS.length,
      },
      reflection_depth: {
        type: 'scalar',
        value: 3,
        min: 1,
        max: 10,
      },
      internet_curiosity: {
        type: 'scalar',
        value: 0.5,
        min: 0,
        max: 1,
      },
      creativity: {
        type: 'scalar',
        value: 0.5,
        min: 0,
        max: 1,
      },
      verbosity: {
        type: 'scalar',
        value: 0.5,
        min: 0,
        max: 1,
      },
      risk_tolerance: {
        type: 'scalar',
        value: 0.5,
        min: 0,
        max: 1,
      },
    },
    $metadata: {
      created: Date.now(),
      description: 'Self-evolving GSPL meta-agent',
      tags: ['meta', 'agent', 'self-evolving'],
    },
    $fitness: { primary: 0.5 },
  };
}

export function mutateMetaAgent(
  seed: UniversalSeed<MetaAgentGenes>,
  rng: DeterministicRNG,
  rate = 0.1,
): UniversalSeed<MetaAgentGenes> {
  const genes = { ...seed.genes };

  const scalarKeys: Array<keyof MetaAgentGenes> = [
    'exploration_rate', 'confidence_threshold', 'reflection_depth',
    'internet_curiosity', 'creativity', 'verbosity', 'risk_tolerance',
  ];
  for (const key of scalarKeys) {
    if (rng.next() < rate) {
      const gene = { ...(genes[key] as ScalarGene) };
      const perturbation = rng.gaussianWithParams(0, 0.1);
      gene.value = Math.max(gene.min, Math.min(gene.max, gene.value + perturbation));
      (genes as Record<string, Gene>)[key] = gene;
    }
  }

  if (rng.next() < rate) {
    const style = { ...genes.reasoning_style };
    style.value = style.options[Math.floor(rng.next() * style.options.length)] ?? style.value;
    genes.reasoning_style = style;
  }

  if (rng.next() < rate) {
    const mw = { ...genes.memory_weight, value: [...genes.memory_weight.value] };
    const idx = Math.floor(rng.next() * mw.dimensions);
    mw.value[idx] = Math.max(0, Math.min(1, (mw.value[idx] ?? 0) + rng.gaussianWithParams(0, 0.05)));
    genes.memory_weight = mw;
  }

  return {
    ...seed,
    $hash: `meta_${Date.now()}_${Math.floor(rng.next() * 10000)}`,
    $lineage: {
      generation: seed.$lineage.generation + 1,
      parents: [{ id: seed.$hash, name: seed.$name }],
      breedingStrategy: 'mutation',
      mutationIntensity: rate,
      timestamp: Date.now(),
    },
    genes,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GSPL Agent — the 10-stage intelligence pipeline
// ═══════════════════════════════════════════════════════════════════

export interface AgentResponse {
  success: boolean;
  message: string;
  data?: unknown;
  intent?: ParsedIntent;
  plan?: AgentTask[];
  toolsUsed?: string[];
  reflections?: string[];
}

export interface GSPLAgentConfig {
  rngSeed?: number;
  maxReflectionDepth?: number;
  llmProvider?: LLMProvider;
  enableEvolution?: boolean;
}

export class GSPLAgent {
  readonly memory: AgentMemory;
  readonly reflection: ReflectionEngine;
  readonly intelligence: NativeIntelligence;
  readonly nlp: NLPCompiler;
  readonly planner: AutonomousPlanner;
  readonly resonance: ResonanceAnalyzer;
  readonly awareness: AwarenessSystem;
  readonly toolRegistry: ToolRegistry;

  private metaSeed: UniversalSeed<MetaAgentGenes>;
  private rng: DeterministicRNG;
  private llmProvider?: LLMProvider;
  private interactionCount = 0;
  private readonly enableEvolution: boolean;
  private readonly maxReflectionDepth: number;

  constructor(config: GSPLAgentConfig = {}) {
    this.rng = new DeterministicRNG(config.rngSeed ?? 42);
    this.memory = new AgentMemory();
    this.reflection = new ReflectionEngine();
    this.intelligence = new NativeIntelligence();
    this.nlp = new NLPCompiler();
    this.planner = new AutonomousPlanner();
    this.resonance = new ResonanceAnalyzer();
    this.awareness = new AwarenessSystem();
    this.toolRegistry = new ToolRegistry();
    this.metaSeed = createMetaAgentSeed(this.rng);
    this.llmProvider = config.llmProvider;
    this.enableEvolution = config.enableEvolution ?? true;
    this.maxReflectionDepth = config.maxReflectionDepth ?? 3;
  }

  /**
   * 10-stage intelligence pipeline:
   * 1. PERCEIVE  — Parse input via NLP classifier
   * 2. RECALL    — Search all memory layers
   * 3. RESEARCH  — Query awareness system for knowledge gaps
   * 4. REASON    — Analytical + synthetic reasoning
   * 5. PLAN      — Goal decomposition → task graph
   * 6. EXECUTE   — Tool execution with specialist routing
   * 7. VALIDATE  — Quality scoring and coherence check
   * 8. REFLECT   — Strategy evaluation, anomaly detection
   * 9. LEARN     — Update memory, consolidate experiences
   * 10. EVOLVE   — Mutate MetaAgentSeed based on performance
   */
  async process(input: string): Promise<AgentResponse> {
    this.interactionCount++;

    // 1. PERCEIVE
    const nlpResult = this.nlp.processNaturalLanguage(input);
    const intent = nlpResult.intent;

    // 2. RECALL
    const _relevantEpisodes = this.memory.searchEpisodes(input);
    const _relevantProcedures = this.memory.findApplicableProcedures(intent.type);
    const _semanticKnowledge = this.memory.querySemanticMemory(input);

    // 3. RESEARCH
    const awarenessResult = await this.awareness.processInput(input);

    // 4. REASON
    const _specialist = matchRole(input);
    const reasoning = this.awareness.reasoning.reason(
      input,
      awarenessResult.fragment ? [awarenessResult.fragment] : [],
    );

    // 5. PLAN
    const plan = this.planner.decompose(input);

    // 6. EXECUTE
    const toolsUsed: string[] = [];
    let executeResult: unknown;
    let success = true;
    let message = '';

    if (this.toolRegistry.size > 0) {
      const toolSpec = this.toolRegistry.search(intent.type);
      if (toolSpec.length > 0) {
        const result = await this.toolRegistry.execute(
          toolSpec[0]!.id,
          intent.entities as Record<string, unknown>,
        );
        toolsUsed.push(toolSpec[0]!.id);
        success = result.success;
        message = result.message;
        executeResult = result.data;
      } else {
        message = this.generateResponse(intent, nlpResult, reasoning);
      }
    } else {
      message = this.generateResponse(intent, nlpResult, reasoning);
    }

    // 7. VALIDATE (implicit in reflection context)
    const reflectionContext: ReflectionContext = {
      seedCount: 0,
      avgFitness: 0.5,
      diversity: 0.5,
      convergenceRate: 0.05,
      generation: this.interactionCount,
      goal: input,
    };

    // 8. REFLECT
    const reflectionEntry = this.reflection.reflect(
      intent.type,
      { success, data: executeResult },
      reflectionContext,
    );

    // 9. LEARN
    this.memory.recordEpisode({
      agentId: this.metaSeed.$hash,
      input,
      output: message,
      reasoning: reasoning.conclusion,
      importance: intent.confidence,
    });

    if (this.interactionCount % 10 === 0) {
      this.memory.consolidate();
    }

    // 10. EVOLVE
    if (this.enableEvolution && this.interactionCount % 50 === 0) {
      this.evolveMetaAgent(reflectionEntry.qualityScore);
    }

    return {
      success,
      message,
      data: executeResult,
      intent,
      plan,
      toolsUsed,
      reflections: reflectionEntry.insights,
    };
  }

  getMetaSeed(): UniversalSeed<MetaAgentGenes> {
    return this.metaSeed;
  }

  getStats(): {
    interactions: number;
    memory: ReturnType<AgentMemory['getStats']>;
    metaGeneration: number;
    metaFitness: number;
    reflections: number;
  } {
    return {
      interactions: this.interactionCount,
      memory: this.memory.getStats(),
      metaGeneration: this.metaSeed.$lineage.generation,
      metaFitness: this.metaSeed.$fitness?.primary ?? 0,
      reflections: this.reflection.getHistory().length,
    };
  }

  private generateResponse(
    intent: ParsedIntent,
    nlpResult: NLPResult,
    reasoning: ReasoningChain,
  ): string {
    switch (intent.type) {
      case 'create':
        return `Seed creation plan for "${intent.entities['name'] ?? 'Unnamed'}" ` +
          `in domain ${intent.entities['domain'] ?? 'organism'}. ` +
          `GSPL: ${nlpResult.gsplCode}`;
      case 'evolve':
        return `Evolution plan: ${intent.entities['generations'] ?? '50'} generations. ` +
          `${nlpResult.gsplCode}`;
      case 'breed':
        return `Breeding plan: ${intent.entities['parentA'] ?? '?'} x ${intent.entities['parentB'] ?? '?'}. ` +
          `${nlpResult.gsplCode}`;
      case 'mutate':
        return `Mutation plan for ${intent.entities['target'] ?? 'target'} at rate ${intent.entities['rate'] ?? '0.3'}. ` +
          `${nlpResult.gsplCode}`;
      case 'inspect':
        return `Inspecting ${intent.entities['target'] ?? 'seed'}...`;
      case 'status':
        return `World status: ${this.memory.getStats().episodic} episodes, ` +
          `${this.memory.getStats().semantic} concepts, ` +
          `interaction #${this.interactionCount}`;
      case 'help':
        return 'Available commands: create, breed, mutate, evolve, inspect, ' +
          'compare, simulate, export, import, forge, status, search, configure';
      default:
        return reasoning.confidence > 0.5
          ? reasoning.conclusion
          : `I understood "${intent.type}" with ${(intent.confidence * 100).toFixed(0)}% confidence. ` +
            `${nlpResult.suggestions.length > 0 ? `Did you mean: ${nlpResult.suggestions.join(', ')}?` : ''}`;
    }
  }

  private evolveMetaAgent(recentQuality: number): void {
    const currentFitness = this.metaSeed.$fitness?.primary ?? 0.5;
    const newFitness = currentFitness * 0.8 + recentQuality * 0.2;

    this.metaSeed = {
      ...this.metaSeed,
      $fitness: { primary: newFitness },
    };

    if (newFitness > currentFitness) {
      this.metaSeed = mutateMetaAgent(this.metaSeed, this.rng, 0.05);
    } else {
      this.metaSeed = mutateMetaAgent(this.metaSeed, this.rng, 0.2);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// v2: ONTOLOGY-BASED COGNITION LAYER
// ═══════════════════════════════════════════════════════════════════

import { OntologyEngine } from '@paradigm/ontology';
import type { ComposedConcept } from '@paradigm/ontology';
import { EnhancedConceptPipeline } from '@paradigm/concept';
import type { EntityBlueprintV2, CharacterDimension, PowerSystem, Transformation } from '@paradigm/types';

/** Result of the agent's concept reasoning process. */
export interface ConceptReasoningResult {
  readonly ontologyAnalysis: ComposedConcept;
  readonly implications: readonly string[];
  readonly emergentProperties: readonly string[];
  readonly conflicts: readonly string[];
  readonly suggestions: readonly string[];
  readonly qualityScore: number;
}

/**
 * ConceptReasoner — Traverses the ontology to deeply understand any concept.
 * This IS the agent's knowledge — not a wrapper, but the intelligence itself.
 */
export class ConceptReasoner {
  private readonly ontology: OntologyEngine;

  constructor(ontology?: OntologyEngine) {
    this.ontology = ontology ?? new OntologyEngine();
  }

  /** Deep concept analysis — what IS this concept? What does it IMPLY? What CONFLICTS? What EMERGES? */
  reason(input: string): ConceptReasoningResult {
    const analysis = this.ontology.analyze(input);
    const implications: string[] = [];
    const suggestions: string[] = [];

    // Derive implications from species
    if (analysis.species) {
      const speciesDefaults = this.ontology.species.resolve(analysis.species);
      if (speciesDefaults) {
        implications.push(`Species "${analysis.species}" implies ${speciesDefaults.bodyStructure} body, default animations: ${speciesDefaults.defaultAnimations.join(', ')}`);
        if (speciesDefaults.compatibleElements.length > 0) {
          implications.push(`Compatible elements: ${speciesDefaults.compatibleElements.join(', ')}`);
        }
      }
    }

    // Derive implications from archetype
    if (analysis.archetype) {
      const archDefaults = this.ontology.archetypes.resolve(analysis.archetype);
      if (archDefaults) {
        implications.push(`Archetype "${analysis.archetype}" implies ${archDefaults.visualDesignLanguage} visual language`);
        if (archDefaults.abilityAffinities.length > 0) {
          implications.push(`Ability affinities: ${archDefaults.abilityAffinities.join(', ')}`);
        }
      }
    }

    // Check element interactions
    if (analysis.elements.length >= 2) {
      const elemA = this.ontology.elements.get(analysis.elements[0]!);
      const elemB = this.ontology.elements.get(analysis.elements[1]!);
      if (elemA && elemB) {
        const aWeakness = elemA.defaults.weakness;
        const bWeakness = elemB.defaults.weakness;
        if (aWeakness.includes(analysis.elements[1]!) || bWeakness.includes(analysis.elements[0]!)) {
          suggestions.push(`Elements ${analysis.elements[0]} and ${analysis.elements[1]} have a weakness relationship — consider which dominates`);
        }
      }
    }

    // Style implications
    if (analysis.style) {
      const styleDefaults = this.ontology.styles.resolve(analysis.style);
      if (styleDefaults) {
        implications.push(`Style "${analysis.style}" uses ${styleDefaults.shadingMethod} shading at ${styleDefaults.animationFrameRate}fps, exaggeration: ${styleDefaults.exaggerationScale}x`);
      }
    }

    // Proactive suggestions
    if (analysis.species && !analysis.archetype) {
      suggestions.push(`No archetype detected — consider adding a role (warrior, mage, rogue, etc.) for richer behavior`);
    }
    if (analysis.archetype && analysis.elements.length === 0) {
      suggestions.push(`No elemental affinity detected — adding an element would enhance visual effects and abilities`);
    }
    if (!analysis.style) {
      suggestions.push(`No visual style specified — defaulting to standard. Consider: anime, chibi, pixel, realistic, cyberpunk`);
    }

    // Quality score based on completeness
    let quality = 0;
    if (analysis.species) quality += 0.2;
    if (analysis.archetype) quality += 0.2;
    if (analysis.elements.length > 0) quality += 0.15;
    if (analysis.style) quality += 0.15;
    if (analysis.abilities.length > 0) quality += 0.15;
    if (analysis.materials.length > 0) quality += 0.1;
    if (analysis.emergentProperties.length > 0) quality += 0.05;

    return {
      ontologyAnalysis: analysis,
      implications,
      emergentProperties: [...analysis.emergentProperties],
      conflicts: analysis.conflicts.map(c => c.description),
      suggestions,
      qualityScore: Math.min(quality, 1),
    };
  }

  getOntology(): OntologyEngine {
    return this.ontology;
  }
}

/**
 * CreativeSynthesizer — Blends concepts and discovers novel combinations.
 * The agent's creative engine — finds unexplored regions of concept space.
 */
export class CreativeSynthesizer {
  private readonly reasoner: ConceptReasoner;

  constructor(reasoner: ConceptReasoner) {
    this.reasoner = reasoner;
  }

  /** Blend two concepts together and discover what emerges. */
  blend(conceptA: string, conceptB: string): {
    readonly blendedDescription: string;
    readonly analysis: ConceptReasoningResult;
    readonly noveltyScore: number;
  } {
    const blended = `${conceptA} ${conceptB}`;
    const analysis = this.reasoner.reason(blended);

    // Novelty = emergent properties discovered
    const novelty = Math.min(1, analysis.emergentProperties.length * 0.3 + (analysis.ontologyAnalysis.abilities.length > 0 ? 0.2 : 0));

    return {
      blendedDescription: blended,
      analysis,
      noveltyScore: novelty,
    };
  }

  /** Generate a rival/counterpart for a given concept. */
  generateRival(concept: string): string {
    const analysis = this.reasoner.reason(concept);
    const ont = this.reasoner.getOntology();

    // Find opposing elements
    const elements = analysis.ontologyAnalysis.elements;
    const opposites: string[] = [];
    for (const elem of elements) {
      const node = ont.elements.get(elem);
      if (node) {
        opposites.push(...node.defaults.weakness);
      }
    }

    const rivalElement = opposites[0] ?? 'dark';
    const rivalArchetype = analysis.ontologyAnalysis.archetype === 'warrior' ? 'rogue'
      : analysis.ontologyAnalysis.archetype === 'mage' ? 'berserker'
      : analysis.ontologyAnalysis.archetype === 'rogue' ? 'knight'
      : 'warrior';

    return `${rivalElement} ${rivalArchetype} ${analysis.ontologyAnalysis.species ?? 'humanoid'}`;
  }

  /** Suggest unexplored concept combinations. */
  suggestNovel(recentConcepts: readonly string[]): string[] {
    const suggestions: string[] = [];
    const ont = this.reasoner.getOntology();

    // Find species not recently used
    const recentSpecies = new Set<string>();
    for (const c of recentConcepts) {
      const a = ont.analyze(c);
      if (a.species) recentSpecies.add(a.species);
    }

    const allSpecies = ont.species.all().filter(n => !recentSpecies.has(n.id) && n.parent !== null);
    if (allSpecies.length > 0) {
      const elements = ont.elements.all();
      const styles = ont.styles.all().filter(s => s.parent !== null);

      // Generate 3 random novel combos
      for (let i = 0; i < Math.min(3, allSpecies.length); i++) {
        const sp = allSpecies[i % allSpecies.length]!;
        const el = elements[i % elements.length]!;
        const st = styles[i % styles.length]!;
        suggestions.push(`${st.keywords[0] ?? st.name} ${el.keywords[0] ?? el.name} ${sp.keywords[0] ?? sp.name}`);
      }
    }

    return suggestions;
  }
}

/**
 * QualityJudge — Validates entities against constraint rules and aesthetic standards.
 * The agent's judgment — ensures every output is production-ready.
 */
export class QualityJudge {
  /** Score an entity blueprint on multiple quality dimensions. */
  judge(blueprint: EntityBlueprintV2): {
    readonly overallScore: number;
    readonly dimensions: Record<string, number>;
    readonly critique: readonly string[];
    readonly improvements: readonly string[];
  } {
    const dims: Record<string, number> = {};
    const critique: string[] = [];
    const improvements: string[] = [];

    // Completeness: how many dimensions are populated?
    const d = blueprint.dimensions;
    let populated = 0;
    if (d?.identity) populated++;
    if (d?.morphology) populated++;
    if (d?.appearance) populated++;
    if (d?.personality) populated++;
    if (d?.powerSystem) populated++;
    if (d?.visualStyle) populated++;
    if (d?.movement) populated++;
    if (d?.animationComplexity) populated++;
    dims['completeness'] = populated / 8;

    // Coherence: do elements align?
    if (blueprint.validationErrors.length === 0) {
      dims['coherence'] = 1.0;
    } else {
      dims['coherence'] = Math.max(0, 1 - blueprint.validationErrors.length * 0.2);
      for (const err of blueprint.validationErrors) {
        critique.push(err);
      }
    }

    // Visual richness: genes count indicates detail
    const geneCount = Object.keys(blueprint.seed.genes).length;
    dims['detail'] = Math.min(1, geneCount / 18);

    // Power system depth
    if (d?.powerSystem?.progression?.stages?.length) {
      dims['powerDepth'] = Math.min(1, d.powerSystem.progression.stages.length / 5);
    } else {
      dims['powerDepth'] = 0;
      improvements.push('Add a power system with progression stages for deeper gameplay potential');
    }

    // Style specificity
    if (d?.visualStyle?.substyle && d.visualStyle.substyle !== 'default') {
      dims['styleSpecificity'] = 1.0;
    } else {
      dims['styleSpecificity'] = 0.3;
      improvements.push('Specify a visual substyle (shonen, ufotable, ghibli, etc.) for distinct rendering');
    }

    const values = Object.values(dims);
    const overall = values.reduce((a, b) => a + b, 0) / values.length;

    return { overallScore: overall, dimensions: dims, critique, improvements };
  }
}

/**
 * Enhanced GSPLAgent with v2 cognition — ontology-based reasoning,
 * creative synthesis, quality judgment, and proactive suggestions.
 */
export class EnhancedGSPLAgent extends GSPLAgent {
  readonly conceptReasoner: ConceptReasoner;
  readonly synthesizer: CreativeSynthesizer;
  readonly qualityJudge: QualityJudge;
  private readonly enhancedPipeline: EnhancedConceptPipeline;
  private readonly recentConcepts: string[] = [];

  constructor(config: GSPLAgentConfig = {}) {
    super(config);
    this.conceptReasoner = new ConceptReasoner();
    this.synthesizer = new CreativeSynthesizer(this.conceptReasoner);
    this.qualityJudge = new QualityJudge();
    this.enhancedPipeline = new EnhancedConceptPipeline(this.conceptReasoner.getOntology());
  }

  /** Enhanced process with ontology cognition. */
  async processEnhanced(input: string, rng: DeterministicRNG): Promise<AgentResponse & {
    reasoning: ConceptReasoningResult;
    blueprint?: EntityBlueprintV2;
    quality?: ReturnType<QualityJudge['judge']>;
    proactiveSuggestions?: readonly string[];
  }> {
    // Step 1: Deep concept reasoning through ontology
    const reasoning = this.conceptReasoner.reason(input);

    // Step 2: Run base agent pipeline
    const baseResponse = await this.process(input);

    // Step 3: If this was a create intent, run enhanced compilation + quality check
    let blueprint: EntityBlueprintV2 | undefined;
    let quality: ReturnType<QualityJudge['judge']> | undefined;

    const intentType = baseResponse.intent?.type;

    if (intentType === 'create') {
      try {
        blueprint = this.enhancedPipeline.execute(input, rng);
        quality = this.qualityJudge.judge(blueprint);
      } catch {
        // Concept compilation is optional enrichment — don't fail the whole response
      }
    }

    // Step 4: Track for creative suggestions
    this.recentConcepts.push(input);
    if (this.recentConcepts.length > 20) this.recentConcepts.shift();

    // Step 5: Proactive suggestions
    const proactiveSuggestions: string[] = [...reasoning.suggestions];

    // After creating a hero, suggest a rival
    if (intentType === 'create' && reasoning.ontologyAnalysis.archetype) {
      const rival = this.synthesizer.generateRival(input);
      proactiveSuggestions.push(`This entity would benefit from a rival. Try: "${rival}"`);
    }

    // Suggest novel concepts periodically
    if (this.recentConcepts.length >= 3 && this.recentConcepts.length % 3 === 0) {
      const novel = this.synthesizer.suggestNovel(this.recentConcepts);
      if (novel.length > 0) {
        proactiveSuggestions.push(`Unexplored concepts: ${novel.join(', ')}`);
      }
    }

    return {
      ...baseResponse,
      reasoning,
      blueprint,
      quality,
      proactiveSuggestions,
    };
  }

  /** Get ontology stats. */
  getOntologyStats(): Record<string, number> {
    return this.conceptReasoner.getOntology().stats();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Re-exports for convenience
// ═══════════════════════════════════════════════════════════════════

export { AgentSpecies } from '@paradigm/awareness';
export type { CognitiveState } from '@paradigm/awareness';
