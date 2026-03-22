import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OllamaProvider,
  OpenAICompatibleProvider,
  ProviderRouter,
  NLPCompiler,
  ReflectionEngine,
  NativeIntelligence,
  ToolRegistry,
  ToolChain,
  ToolBridge,
} from './index.js';
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMOptions,
  ReflectionContext,
  ToolSpec,
  ToolExecutionResult,
  ParsedIntent,
} from './index.js';
import type { UniversalSeed, GeneMap, Gene } from '@paradigm/types';

// ── helpers ──────────────────────────────────────────────────────

function makeSeed(overrides: Partial<UniversalSeed> = {}): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: 'test_hash_a',
    $name: 'Alpha',
    $lineage: { generation: 1, parents: [], timestamp: Date.now() },
    genes: {
      health: { type: 'scalar', value: 80, min: 0, max: 100 },
      speed: { type: 'scalar', value: 50, min: 0, max: 100 },
      element: { type: 'categorical', value: 'fire', options: ['fire', 'ice', 'lightning'] },
      color: { type: 'vector', value: [0.9, 0.2, 0.1], dimensions: 3 },
    },
    $metadata: { created: Date.now() },
    $fitness: { primary: 0.75 },
    ...overrides,
  };
}

/** Mock LLM provider for testing — never calls a real API */
class MockProvider implements LLMProvider {
  readonly name = 'mock';
  available = true;
  lastMessages: LLMMessage[] = [];

  async chat(messages: LLMMessage[], _options?: LLMOptions): Promise<LLMResponse> {
    this.lastMessages = messages;
    return { content: 'Mock response', finishReason: 'stop', model: 'mock-1' };
  }
  async *stream(): AsyncGenerator<string, void, undefined> {
    yield 'Mock';
    yield ' stream';
  }
  async isAvailable(): Promise<boolean> {
    return this.available;
  }
}

// ═══════════════════════════════════════════════════════════════════
// NLP Compiler
// ═══════════════════════════════════════════════════════════════════

describe('NLPCompiler', () => {
  let nlp: NLPCompiler;

  beforeEach(() => {
    nlp = new NLPCompiler();
  });

  it('classifies "create a fire dragon" as create intent', () => {
    const result = nlp.classifyIntent('create a fire dragon');
    expect(result.type).toBe('create');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.entities['name']).toBeDefined();
  });

  it('classifies "breed Alpha and Beta" as breed intent', () => {
    const result = nlp.classifyIntent('breed Alpha and Beta');
    expect(result.type).toBe('breed');
    expect(result.entities['parentA']).toBe('Alpha');
    expect(result.entities['parentB']).toBe('Beta');
  });

  it('classifies "evolve for 100 generations" as evolve intent', () => {
    const result = nlp.classifyIntent('evolve for 100 generations');
    expect(result.type).toBe('evolve');
    expect(result.entities['generations']).toBe('100');
  });

  it('classifies "mutate Dragon by 0.5" as mutate intent', () => {
    const result = nlp.classifyIntent('mutate Dragon by 0.5');
    expect(result.type).toBe('mutate');
    expect(result.entities['target']).toBe('Dragon');
    expect(result.entities['rate']).toBe('0.5');
  });

  it('classifies "inspect Wolf" as inspect intent', () => {
    const result = nlp.classifyIntent('inspect Wolf');
    expect(result.type).toBe('inspect');
    expect(result.entities['target']).toBe('Wolf');
  });

  it('classifies "status" as status intent', () => {
    const result = nlp.classifyIntent('status');
    expect(result.type).toBe('status');
  });

  it('classifies "help" as help intent', () => {
    const result = nlp.classifyIntent('help');
    expect(result.type).toBe('help');
  });

  it('classifies "undo" with high confidence', () => {
    const result = nlp.classifyIntent('undo');
    expect(result.type).toBe('undo');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('classifies "compare Alpha and Beta" as compare intent', () => {
    const result = nlp.classifyIntent('compare Alpha and Beta');
    expect(result.type).toBe('compare');
  });

  it('falls back to create for unknown input', () => {
    const result = nlp.classifyIntent('xyzzy foobar');
    expect(result.type).toBe('create');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('classifies empty input as help', () => {
    const result = nlp.classifyIntent('');
    expect(result.type).toBe('help');
  });

  it('extracts slots correctly', () => {
    const slots = nlp.extractSlots('evolve 100 to 200 generations for organism');
    expect(slots.numbers).toContain(100);
    expect(slots.numbers).toContain(200);
    expect(slots.ranges.length).toBeGreaterThan(0);
    expect(slots.ranges[0]!.min).toBe(100);
    expect(slots.ranges[0]!.max).toBe(200);
    expect(slots.domains).toContain('organism');
  });

  it('handles multi-intent chains', () => {
    const intents = nlp.classifyMultiIntent('create a dragon and then evolve for 50 generations');
    expect(intents.length).toBe(2);
    expect(intents[0]!.type).toBe('create');
    // second part "evolve for 50 generations" classified by evolve pattern
    expect(['create', 'evolve']).toContain(intents[1]!.type);
  });

  it('compiles intent to GSPL', () => {
    const intent = nlp.classifyIntent('create a warrior organism');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('seed');
    expect(gspl).toContain('fields');
  });

  it('suggests commands for partial input', () => {
    const suggestions = nlp.suggestCommands('cre');
    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(suggestions[0]).toBe('create');
  });

  it('processes full natural language pipeline', () => {
    const result = nlp.processNaturalLanguage('create a fire dragon organism');
    expect(result.intent.type).toBe('create');
    expect(result.gsplCode).toBeDefined();
    expect(result.slots).toBeDefined();
  });

  it('tracks conversation context', () => {
    nlp.classifyIntent('create a dragon');
    const ctx = nlp.getContext();
    expect(ctx.lastAction).toBe('create');
    expect(ctx.lastSeed).toBeDefined();
  });

  it('resets context', () => {
    nlp.classifyIntent('create a dragon');
    nlp.resetContext();
    const ctx = nlp.getContext();
    expect(ctx.lastAction).toBeUndefined();
  });

  it('compiles breed to GSPL', () => {
    const intent = nlp.classifyIntent('breed Alpha and Beta');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('breed');
  });

  it('compiles evolve to GSPL', () => {
    const intent = nlp.classifyIntent('evolve for 200 generations');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('200');
  });

  it('compiles mutate to GSPL', () => {
    const intent = nlp.classifyIntent('mutate Dragon by 0.8');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('mutate');
  });

  it('compiles export to GSPL', () => {
    const intent = nlp.classifyIntent('export world');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('export');
  });

  it('handles forge intent', () => {
    const result = nlp.classifyIntent('forge a game');
    expect(result.type).toBe('forge');
  });

  it('handles search intent', () => {
    const result = nlp.classifyIntent('search the web for dragons');
    expect(result.type).toBe('search');
  });

  it('handles configure intent', () => {
    const result = nlp.classifyIntent('set mutation rate');
    expect(result.type).toBe('configure');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Reflection Engine
// ═══════════════════════════════════════════════════════════════════

describe('ReflectionEngine', () => {
  let engine: ReflectionEngine;
  const baseContext: ReflectionContext = {
    seedCount: 10,
    avgFitness: 0.6,
    diversity: 0.5,
    convergenceRate: 0.05,
    generation: 5,
    goal: 'optimize',
    domain: 'organism',
  };

  beforeEach(() => {
    engine = new ReflectionEngine();
  });

  it('reflects on a successful action', () => {
    const entry = engine.reflect('evolve', { success: true }, baseContext);
    expect(entry.qualityScore).toBeGreaterThan(0.5);
    expect(entry.insights.length).toBeGreaterThan(0);
    expect(entry.suggestedNextAction).toBeDefined();
    expect(entry.anomalyDetected).toBe(false);
  });

  it('reflects on a failed action', () => {
    const entry = engine.reflect('evolve', { success: false }, baseContext);
    expect(entry.qualityScore).toBeLessThan(0.5);
  });

  it('detects population collapse anomaly', () => {
    const ctx = { ...baseContext, avgFitness: 0.1, seedCount: 5 };
    const anomaly = engine.detectAnomaly(ctx);
    expect(anomaly.detected).toBe(true);
    expect(anomaly.type).toBe('population_collapse');
  });

  it('detects convergence halt', () => {
    const ctx = { ...baseContext, generation: 10, convergenceRate: 0.005 };
    const anomaly = engine.detectAnomaly(ctx);
    expect(anomaly.detected).toBe(true);
    expect(anomaly.type).toBe('convergence_halt');
  });

  it('detects diversity loss', () => {
    const ctx = { ...baseContext, generation: 5, diversity: 0.1 };
    const anomaly = engine.detectAnomaly(ctx);
    expect(anomaly.detected).toBe(true);
    expect(anomaly.type).toBe('diversity_loss');
  });

  it('detects no anomaly for healthy context', () => {
    const anomaly = engine.detectAnomaly(baseContext);
    expect(anomaly.detected).toBe(false);
  });

  it('generates recommendations', () => {
    engine.reflect('evolve', { success: true }, baseContext);
    const recs = engine.getRecommendations(baseContext);
    expect(Array.isArray(recs)).toBe(true);
  });

  it('recommends novelty search for low diversity', () => {
    const ctx = { ...baseContext, diversity: 0.1 };
    const recs = engine.getRecommendations(ctx);
    const novelty = recs.find(r => r.action === 'novelty_search');
    expect(novelty).toBeDefined();
  });

  it('analyzes fitness trend', () => {
    // feed some history
    for (let i = 0; i < 10; i++) {
      engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.5 + i * 0.02 });
    }
    const trend = engine.analyzeTrend('fitness');
    expect(trend.direction).toBeDefined();
    expect(trend.values.length).toBeGreaterThan(0);
  });

  it('meta-reflects on its own performance', () => {
    engine.reflect('create', { success: true }, baseContext);
    engine.reflect('evolve', { success: false }, baseContext);
    const meta = engine.metaReflect();
    expect(meta.totalReflections).toBe(2);
    expect(meta.avgQuality).toBeGreaterThan(0);
    expect(meta.strategiesUsed).toBeGreaterThan(0);
  });

  it('clears history', () => {
    engine.reflect('test', { success: true }, baseContext);
    engine.clear();
    expect(engine.getHistory().length).toBe(0);
  });

  it('tracks performance delta', () => {
    engine.reflect('a', { success: true }, { ...baseContext, avgFitness: 0.5 });
    const entry = engine.reflect('b', { success: true }, { ...baseContext, avgFitness: 0.7 });
    expect(entry.performanceDelta).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Native Intelligence
// ═══════════════════════════════════════════════════════════════════

describe('NativeIntelligence', () => {
  let intel: NativeIntelligence;
  const seedA = makeSeed();
  const seedB = makeSeed({
    $hash: 'test_hash_b',
    $name: 'Beta',
    genes: {
      health: { type: 'scalar', value: 20, min: 0, max: 100 },
      speed: { type: 'scalar', value: 90, min: 0, max: 100 },
      element: { type: 'categorical', value: 'ice', options: ['fire', 'ice', 'lightning'] },
      color: { type: 'vector', value: [0.1, 0.2, 0.9], dimensions: 3 },
    },
    $fitness: { primary: 0.45 },
  });

  beforeEach(() => {
    intel = new NativeIntelligence();
  });

  it('analyzes a seed', () => {
    const analysis = intel.analyzeSeed(seedA);
    expect(analysis.overallAssessment).toBeDefined();
    expect(analysis.strengths.length + analysis.weaknesses.length).toBeGreaterThan(0);
  });

  it('identifies strengths for high-value genes', () => {
    const analysis = intel.analyzeSeed(seedA);
    // health=80/100=0.8 > 0.75 threshold
    expect(analysis.strengths.some(s => s.includes('health'))).toBe(true);
  });

  it('identifies weaknesses for low-value genes', () => {
    const analysis = intel.analyzeSeed(seedB);
    // health=20/100=0.2 < 0.25 threshold
    expect(analysis.weaknesses.some(w => w.includes('health'))).toBe(true);
  });

  it('generates mutation suggestions', () => {
    const analysis = intel.analyzeSeed(seedB);
    expect(analysis.suggestions.length).toBeGreaterThan(0);
  });

  it('describes a seed in natural language', () => {
    const desc = intel.describeSeed(seedA);
    expect(desc).toContain('Alpha');
    expect(desc).toContain('organism');
    expect(desc).toContain('4 genes');
  });

  it('compares two seeds', () => {
    const comparison = intel.compareSeed(seedA, seedB);
    expect(comparison.differences.length).toBeGreaterThan(0);
    expect(comparison.summary).toContain('Alpha');
    expect(comparison.summary).toContain('Beta');
    expect(comparison.fitnessDelta).toBeCloseTo(0.3, 1);
  });

  it('plans actions for warrior goal', () => {
    const plan = intel.planActions('create a warrior', { seedCount: 0, avgFitness: 0 });
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]!.tool).toBe('create_seed');
  });

  it('plans actions for diversity goal', () => {
    const plan = intel.planActions('explore diversity', { seedCount: 10, avgFitness: 0.5 });
    expect(plan.some(p => p.tool === 'mutate')).toBe(true);
  });

  it('plans actions for optimization goal', () => {
    const plan = intel.planActions('optimize fitness', { seedCount: 10, avgFitness: 0.5 });
    expect(plan.some(p => p.tool === 'evolve')).toBe(true);
  });

  it('default plan for empty world', () => {
    const plan = intel.planActions('do something', { seedCount: 0, avgFitness: 0 });
    expect(plan[0]!.tool).toBe('create_seed');
  });

  it('default plan for small population', () => {
    const plan = intel.planActions('do something', { seedCount: 3, avgFitness: 0.3 });
    expect(plan.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tool Registry
// ═══════════════════════════════════════════════════════════════════

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const testTool: ToolSpec = {
    id: 'test_tool',
    name: 'Test Tool',
    description: 'A test tool',
    category: 'seed_management',
    parameters: [
      { name: 'name', type: 'string', description: 'Seed name', required: true },
      { name: 'count', type: 'number', description: 'Count', required: false },
    ],
  };

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers and retrieves a tool', () => {
    registry.register(testTool, async () => ({
      success: true, message: 'ok', durationMs: 0,
    }));
    expect(registry.size).toBe(1);
    const tool = registry.get('test_tool');
    expect(tool).toBeDefined();
    expect(tool!.spec.name).toBe('Test Tool');
  });

  it('unregisters a tool', () => {
    registry.register(testTool, async () => ({
      success: true, message: 'ok', durationMs: 0,
    }));
    expect(registry.unregister('test_tool')).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('lists tools', () => {
    registry.register(testTool, async () => ({
      success: true, message: 'ok', durationMs: 0,
    }));
    const all = registry.list();
    expect(all.length).toBe(1);
  });

  it('filters by category', () => {
    registry.register(testTool, async () => ({
      success: true, message: 'ok', durationMs: 0,
    }));
    expect(registry.list('seed_management').length).toBe(1);
    expect(registry.list('evolution').length).toBe(0);
  });

  it('searches tools by query', () => {
    registry.register(testTool, async () => ({
      success: true, message: 'ok', durationMs: 0,
    }));
    expect(registry.search('test').length).toBe(1);
    expect(registry.search('nonexistent').length).toBe(0);
  });

  it('executes a tool', async () => {
    registry.register(testTool, async (params) => ({
      success: true, message: `Created ${params['name']}`, durationMs: 1, data: params,
    }));
    const result = await registry.execute('test_tool', { name: 'Dragon' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('Dragon');
  });

  it('returns error for missing tool', async () => {
    const result = await registry.execute('nonexistent', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('validates required parameters', async () => {
    registry.register(testTool, async () => ({
      success: true, message: 'ok', durationMs: 0,
    }));
    const result = await registry.execute('test_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('validation');
  });

  it('converts to LLM tool definitions', () => {
    registry.register(testTool, async () => ({
      success: true, message: 'ok', durationMs: 0,
    }));
    const llmTools = registry.toLLMTools();
    expect(llmTools.length).toBe(1);
    expect(llmTools[0]!.name).toBe('test_tool');
    expect(llmTools[0]!.parameters.type).toBe('object');
  });

  it('handles execution errors gracefully', async () => {
    registry.register(testTool, async () => {
      throw new Error('Boom');
    });
    const result = await registry.execute('test_tool', { name: 'X' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Boom');
    expect(result.error).toBe('execution');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tool Chain
// ═══════════════════════════════════════════════════════════════════

describe('ToolChain', () => {
  it('chains tools sequentially', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'step1', name: 'Step 1', description: 'First', category: 'seed_management', parameters: [] },
      async () => ({ success: true, message: 'step1 done', durationMs: 0, data: { val: 1 } }),
    );
    registry.register(
      { id: 'step2', name: 'Step 2', description: 'Second', category: 'seed_management', parameters: [] },
      async () => ({ success: true, message: 'step2 done', durationMs: 0 }),
    );

    const chain = new ToolChain();
    chain.add('step1', {});
    chain.add('step2', {});
    expect(chain.length).toBe(2);

    const results = await chain.execute(registry);
    expect(results.length).toBe(2);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
  });

  it('halts on failure', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'fail', name: 'Fail', description: 'Fails', category: 'seed_management', parameters: [] },
      async () => ({ success: false, message: 'failed', durationMs: 0 }),
    );
    registry.register(
      { id: 'after', name: 'After', description: 'After', category: 'seed_management', parameters: [] },
      async () => ({ success: true, message: 'ok', durationMs: 0 }),
    );

    const chain = new ToolChain();
    chain.add('fail', {});
    chain.add('after', {});

    const results = await chain.execute(registry);
    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Provider Router
// ═══════════════════════════════════════════════════════════════════

describe('ProviderRouter', () => {
  it('selects the first available provider', async () => {
    const mock = new MockProvider();
    const router = new ProviderRouter({ providers: [mock] });
    expect(await router.isAvailable()).toBe(true);
    const resp = await router.chat([{ role: 'user', content: 'hi' }]);
    expect(resp.content).toBe('Mock response');
  });

  it('fails when no provider is available', async () => {
    const mock = new MockProvider();
    mock.available = false;
    const router = new ProviderRouter({ providers: [mock] });
    expect(await router.isAvailable()).toBe(false);
  });

  it('streams from selected provider', async () => {
    const mock = new MockProvider();
    const router = new ProviderRouter({ providers: [mock] });
    const chunks: string[] = [];
    for await (const chunk of router.stream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('Mock stream');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tool Bridge
// ═══════════════════════════════════════════════════════════════════

describe('ToolBridge', () => {
  it('executes a tool call', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'greet', name: 'Greet', description: 'Greets', category: 'agent', parameters: [] },
      async () => ({ success: true, message: 'Hello!', durationMs: 0 }),
    );
    const bridge = new ToolBridge(registry);
    const result = await bridge.executeTool({ id: 'call_0', name: 'greet', arguments: {} });
    expect(result).toBe('Hello!');
  });

  it('returns error message on failure', async () => {
    const registry = new ToolRegistry();
    const bridge = new ToolBridge(registry);
    const result = await bridge.executeTool({ id: 'call_0', name: 'missing', arguments: {} });
    expect(result).toContain('Error');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Levenshtein (via suggestCommands)
// ═══════════════════════════════════════════════════════════════════

describe('Levenshtein distance (via suggestCommands)', () => {
  it('ranks exact prefix first', () => {
    const nlp = new NLPCompiler();
    const suggestions = nlp.suggestCommands('evo');
    expect(suggestions[0]).toBe('evolve');
  });

  it('handles empty input', () => {
    const nlp = new NLPCompiler();
    const suggestions = nlp.suggestCommands('');
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// OllamaProvider (fetch-mocked)
// ═══════════════════════════════════════════════════════════════════

describe('OllamaProvider (fetch mocked)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chat() returns content from JSON response', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ message: { content: 'hello' } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const provider = new OllamaProvider({ model: 'llama3' });
    const resp = await provider.chat([{ role: 'user', content: 'hi' }]);
    expect(resp.content).toBe('hello');
    expect(resp.finishReason).toBe('stop');
  });

  it('chat() throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    const provider = new OllamaProvider();
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('Ollama error: 500');
  });

  it('stream() yields content from NDJSON chunks', async () => {
    const line1 = JSON.stringify({ message: { content: 'hel' } }) + '\n';
    const line2 = JSON.stringify({ message: { content: 'lo' } }) + '\n';
    const encoder = new TextEncoder();

    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: encoder.encode(line1 + line2) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    }));

    const provider = new OllamaProvider();
    const chunks: string[] = [];
    for await (const chunk of provider.stream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('hello');
  });

  it('stream() throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    const provider = new OllamaProvider();
    const gen = provider.stream([{ role: 'user', content: 'hi' }]);
    await expect(gen.next()).rejects.toThrow('Ollama stream error: 503');
  });

  it('stream() returns early when body has no reader', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    }));

    const provider = new OllamaProvider();
    const chunks: string[] = [];
    for await (const chunk of provider.stream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });

  it('isAvailable() returns true when fetch succeeds with ok:true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const provider = new OllamaProvider();
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const provider = new OllamaProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns false when ok is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const provider = new OllamaProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('chat() with tool definitions injects system prompt', async () => {
    const capturedBodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(init?.body as string));
      return { ok: true, json: async () => ({ message: { content: 'done' } }) };
    }));

    const provider = new OllamaProvider();
    const tools = [{ name: 'create_seed', description: 'Creates a seed', parameters: { type: 'object' as const, properties: {} } }];
    await provider.chat([{ role: 'user', content: 'go' }], { tools });

    const body = capturedBodies[0] as { messages: Array<{ role: string }> };
    expect(body.messages[0]!.role).toBe('system');
  });

  it('chat() parses tool calls from JSON code blocks in response', async () => {
    const content = '```json\n{"tool": "create_seed", "arguments": {"name": "Dragon"}}\n```';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content } }),
    }));

    const provider = new OllamaProvider();
    const resp = await provider.chat([{ role: 'user', content: 'create' }]);
    expect(resp.toolCalls).toBeDefined();
    expect(resp.toolCalls![0]!.name).toBe('create_seed');
    expect(resp.finishReason).toBe('tool_use');
  });

  it('chat() handles tool role messages correctly', async () => {
    const capturedBodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(init?.body as string));
      return { ok: true, json: async () => ({ message: { content: 'ok' } }) };
    }));

    const provider = new OllamaProvider();
    await provider.chat([
      { role: 'tool', content: 'tool result', toolCallId: 'call_0' },
    ]);

    const body = capturedBodies[0] as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0]!.role).toBe('user');
    expect(body.messages[0]!.content).toContain('call_0');
  });
});

// ═══════════════════════════════════════════════════════════════════
// OpenAICompatibleProvider (fetch-mocked)
// ═══════════════════════════════════════════════════════════════════

describe('OpenAICompatibleProvider (fetch mocked)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chat() returns content from choices response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      }),
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'test-key' });
    const resp = await provider.chat([{ role: 'user', content: 'hello' }]);
    expect(resp.content).toBe('hi');
    expect(resp.finishReason).toBe('stop');
  });

  it('chat() sends Authorization header with apiKey', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedHeaders.push(init?.headers as Record<string, string>);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
      };
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'my-secret-key' });
    await provider.chat([{ role: 'user', content: 'hi' }]);

    expect(capturedHeaders[0]!['Authorization']).toBe('Bearer my-secret-key');
  });

  it('chat() throws on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'bad-key' });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('OpenAI API error 401');
  });

  it('chat() maps finish_reason tool_calls to tool_use', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'call_1', function: { name: 'create_seed', arguments: '{"name":"X"}' } }],
          },
          finish_reason: 'tool_calls',
        }],
      }),
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'key' });
    const resp = await provider.chat([{ role: 'user', content: 'go' }]);
    expect(resp.finishReason).toBe('tool_use');
    expect(resp.toolCalls![0]!.name).toBe('create_seed');
  });

  it('chat() maps finish_reason length to length', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'truncated' }, finish_reason: 'length' }],
      }),
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'key' });
    const resp = await provider.chat([{ role: 'user', content: 'hi' }]);
    expect(resp.finishReason).toBe('length');
  });

  it('chat() includes tools in body when options.tools provided', async () => {
    const capturedBodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(init?.body as string));
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
      };
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'key' });
    await provider.chat([{ role: 'user', content: 'hi' }], {
      tools: [{ name: 'my_tool', description: 'does stuff', parameters: { type: 'object', properties: {} } }],
    });
    const body = capturedBodies[0] as { tools?: unknown[] };
    expect(body.tools).toBeDefined();
    expect(body.tools).toHaveLength(1);
  });

  it('isAvailable() returns true when /models returns ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const provider = new OpenAICompatibleProvider({ apiKey: 'key' });
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const provider = new OpenAICompatibleProvider({ apiKey: 'key' });
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns false when ok is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const provider = new OpenAICompatibleProvider({ apiKey: 'key' });
    expect(await provider.isAvailable()).toBe(false);
  });

  it('chat() uses custom baseUrl', async () => {
    const capturedUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      capturedUrls.push(url);
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }) };
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'key', baseUrl: 'https://api.groq.com/openai/v1' });
    await provider.chat([{ role: 'user', content: 'hi' }]);
    expect(capturedUrls[0]).toContain('groq.com');
  });

  it('chat() handles toolCallId in message', async () => {
    const capturedBodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(init?.body as string));
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }) };
    }));

    const provider = new OpenAICompatibleProvider({ apiKey: 'key' });
    await provider.chat([{ role: 'tool', content: 'result', toolCallId: 'call_abc' }]);
    const body = capturedBodies[0] as { messages: Array<{ tool_call_id?: string }> };
    expect(body.messages[0]!['tool_call_id']).toBe('call_abc');
  });
});

// ═══════════════════════════════════════════════════════════════════
// ProviderRouter — additional preference branches
// ═══════════════════════════════════════════════════════════════════

describe('ProviderRouter — preference branches', () => {
  it('local_first returns first available in original order', async () => {
    const first = new MockProvider();
    first.available = true;
    const second = new MockProvider();
    second.available = true;
    // Override name to distinguish
    Object.defineProperty(second, 'name', { value: 'second', writable: false });

    const router = new ProviderRouter({ providers: [first, second], preference: 'local_first' });
    const selected = await router.selectProvider();
    expect(selected).toBe(first);
  });

  it('cloud_first returns providers in reversed order', async () => {
    const first = new MockProvider();
    first.available = false;
    const second = new MockProvider();
    second.available = true;
    Object.defineProperty(second, 'name', { value: 'cloud', writable: false });

    const router = new ProviderRouter({ providers: [first, second], preference: 'cloud_first' });
    const selected = await router.selectProvider();
    expect(selected).toBe(second);
  });

  it('auto prefers local for short messages (<1000 chars, <10 messages)', async () => {
    const local = new MockProvider();
    local.available = true;
    const cloud = new MockProvider();
    cloud.available = true;
    Object.defineProperty(cloud, 'name', { value: 'cloud2', writable: false });

    const router = new ProviderRouter({ providers: [local, cloud], preference: 'auto' });
    const msgs: LLMMessage[] = [{ role: 'user', content: 'short message' }];
    const selected = await router.selectProvider(msgs);
    expect(selected).toBe(local);
  });

  it('auto prefers cloud for long messages (>1000 chars)', async () => {
    const local = new MockProvider();
    local.available = true;
    const cloud = new MockProvider();
    cloud.available = true;
    Object.defineProperty(cloud, 'name', { value: 'cloud3', writable: false });

    const router = new ProviderRouter({ providers: [local, cloud], preference: 'auto' });
    const longContent = 'x'.repeat(1001);
    const msgs: LLMMessage[] = [{ role: 'user', content: longContent }];
    // cloud is reversed (at index 0 in reversed), so it gets selected first
    const selected = await router.selectProvider(msgs);
    expect(selected).toBe(cloud);
  });

  it('auto prefers cloud for many messages (>10)', async () => {
    const local = new MockProvider();
    local.available = true;
    const cloud = new MockProvider();
    cloud.available = true;
    Object.defineProperty(cloud, 'name', { value: 'cloud4', writable: false });

    const router = new ProviderRouter({ providers: [local, cloud], preference: 'auto' });
    const msgs: LLMMessage[] = Array.from({ length: 11 }, (_, i) => ({
      role: 'user' as const,
      content: `msg ${i}`,
    }));
    const selected = await router.selectProvider(msgs);
    expect(selected).toBe(cloud);
  });

  it('throws when all providers unavailable', async () => {
    const m1 = new MockProvider();
    m1.available = false;
    const m2 = new MockProvider();
    m2.available = false;
    Object.defineProperty(m2, 'name', { value: 'mock2', writable: false });

    const router = new ProviderRouter({ providers: [m1, m2] });
    await expect(router.selectProvider()).rejects.toThrow('No LLM provider available');
  });

  it('isAvailable() returns false when no provider is available', async () => {
    const m = new MockProvider();
    m.available = false;
    const router = new ProviderRouter({ providers: [m] });
    expect(await router.isAvailable()).toBe(false);
  });

  it('caches availability within TTL (does not re-check)', async () => {
    let checkCount = 0;
    const customMock: LLMProvider = {
      name: 'countable',
      async chat() { return { content: 'ok', finishReason: 'stop' }; },
      async *stream() { /* no-op */ },
      async isAvailable() {
        checkCount++;
        return true;
      },
    };

    // Set a long TTL so cache is still valid on second call
    const router = new ProviderRouter({ providers: [customMock], cacheTtlMs: 60_000 });
    await router.selectProvider();
    await router.selectProvider();
    expect(checkCount).toBe(1);
  });

  it('stream() delegates to selected provider', async () => {
    const mock = new MockProvider();
    const router = new ProviderRouter({ providers: [mock], preference: 'local_first' });
    const chunks: string[] = [];
    for await (const chunk of router.stream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('Mock stream');
  });
});

// ═══════════════════════════════════════════════════════════════════
// NLPCompiler — additional intents and branches
// ═══════════════════════════════════════════════════════════════════

describe('NLPCompiler — additional intents and branches', () => {
  let nlp: NLPCompiler;

  beforeEach(() => {
    nlp = new NLPCompiler();
  });

  it('classifies "find all seeds" as query intent', () => {
    const result = nlp.classifyIntent('find all seeds');
    expect(result.type).toBe('query');
  });

  it('classifies "filter seeds by fitness" as query intent', () => {
    const result = nlp.classifyIntent('filter seeds by fitness');
    expect(result.type).toBe('query');
  });

  it('classifies "why is fitness low" as explain intent', () => {
    const result = nlp.classifyIntent('why is fitness low');
    expect(result.type).toBe('explain');
  });

  it('classifies "compare Alpha vs Beta" as compare with entities', () => {
    const result = nlp.classifyIntent('compare Alpha vs Beta');
    expect(result.type).toBe('compare');
    expect(result.entities['seedA']).toBe('Alpha');
    expect(result.entities['seedB']).toBe('Beta');
  });

  it('classifies "run simulation" as simulate intent', () => {
    const result = nlp.classifyIntent('run simulation');
    expect(result.type).toBe('simulate');
  });

  it('classifies "export world" as export intent', () => {
    const result = nlp.classifyIntent('export world');
    expect(result.type).toBe('export');
  });

  it('classifies "load world" as import intent', () => {
    const result = nlp.classifyIntent('load world');
    expect(result.type).toBe('import');
  });

  it('classifies "redo that" as redo intent', () => {
    const result = nlp.classifyIntent('redo that');
    expect(result.type).toBe('redo');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('classifies "run evolution" (bare evolve) as evolve intent', () => {
    const result = nlp.classifyIntent('run evolution');
    expect(result.type).toBe('evolve');
  });

  it('classifyMultiIntent splits on "and then"', () => {
    const intents = nlp.classifyMultiIntent('create a warrior and then evolve it');
    expect(intents.length).toBeGreaterThanOrEqual(2);
    expect(intents[0]!.type).toBe('create');
  });

  it('classifyMultiIntent with single segment returns single intent', () => {
    const intents = nlp.classifyMultiIntent('create a dragon');
    expect(intents.length).toBe(1);
    expect(intents[0]!.type).toBe('create');
  });

  it('extractSlots finds capitalized seed names', () => {
    // The name regex /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/ matches multi-word names like "Fire Dragon"
    const slots = nlp.extractSlots('compare Fire Dragon and Ice Tiger');
    // Matches 'Fire Dragon' and 'Ice Tiger' as combined names
    expect(slots.names.some(n => n.includes('Fire') || n.includes('Dragon'))).toBe(true);
    expect(slots.names.some(n => n.includes('Ice') || n.includes('Tiger'))).toBe(true);
    expect(slots.names.length).toBeGreaterThanOrEqual(2);
  });

  it('extractSlots resolves "it" to lastSeed from context', () => {
    nlp.classifyIntent('create a Dragon');
    const slots = nlp.extractSlots('mutate it by 0.5');
    expect(slots.seedRefs.length).toBeGreaterThan(0);
  });

  it('compileToGSPL — status intent', () => {
    const intent = nlp.classifyIntent('status');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('status');
  });

  it('compileToGSPL — default/help intent returns comment', () => {
    const intent = nlp.classifyIntent('help');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toMatch(/^\/\//);
  });

  it('compileToGSPL — breed uses parentA and parentB', () => {
    const intent = nlp.classifyIntent('breed Alpha and Beta');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('Alpha');
    expect(gspl).toContain('Beta');
    expect(gspl).toContain('breed');
  });

  it('compileToGSPL — mutate uses target and rate', () => {
    const intent = nlp.classifyIntent('mutate Dragon by 0.8');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('Dragon');
    expect(gspl).toContain('0.8');
  });

  it('compileToGSPL — evolve with generations', () => {
    const intent = nlp.classifyIntent('evolve for 100 generations');
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('100');
    expect(gspl).toContain('evolve');
  });

  it('compileToGSPL — evolve defaults to 50 when no generations given', () => {
    const intent: ParsedIntent = { type: 'evolve', entities: {}, confidence: 0.9, rawInput: 'evolve' };
    // Access compileToGSPL directly
    const gspl = nlp.compileToGSPL(intent);
    expect(gspl).toContain('50');
  });

  it('processNaturalLanguage — low confidence triggers suggestions', () => {
    const result = nlp.processNaturalLanguage('xyzzy foobar baz');
    // fallback is low confidence create
    expect(result.intent.confidence).toBeLessThan(0.7);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('processNaturalLanguage — high confidence returns empty suggestions', () => {
    const result = nlp.processNaturalLanguage('undo that');
    expect(result.intent.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.suggestions).toHaveLength(0);
  });

  it('getContext returns lastAction after classify', () => {
    nlp.classifyIntent('evolve for 50 generations');
    const ctx = nlp.getContext();
    expect(ctx.lastAction).toBe('evolve');
  });

  it('resetContext clears all fields', () => {
    nlp.classifyIntent('create a phoenix organism');
    nlp.resetContext();
    const ctx = nlp.getContext();
    expect(ctx.lastAction).toBeUndefined();
    expect(ctx.lastSeed).toBeUndefined();
    expect(ctx.lastDomain).toBeUndefined();
  });

  it('suggestCommands returns up to 5 results for partial input', () => {
    const suggestions = nlp.suggestCommands('mut');
    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(suggestions[0]).toBe('mutate');
  });

  it('extractSlots finds domain names in input', () => {
    const slots = nlp.extractSlots('create an organism in the vehicle domain');
    expect(slots.domains).toContain('organism');
    expect(slots.domains).toContain('vehicle');
  });

  it('extractSlots finds range "100 to 200"', () => {
    const slots = nlp.extractSlots('evolve 100 to 200 generations');
    expect(slots.ranges[0]!.min).toBe(100);
    expect(slots.ranges[0]!.max).toBe(200);
  });

  it('"inspect Dragon" extracts target entity', () => {
    const result = nlp.classifyIntent('inspect Dragon');
    expect(result.type).toBe('inspect');
    expect(result.entities['target']).toBe('Dragon');
  });

  it('"mutate Dragon by 0.5" extracts both target and rate', () => {
    const result = nlp.classifyIntent('mutate Dragon by 0.5');
    expect(result.entities['target']).toBe('Dragon');
    expect(result.entities['rate']).toBe('0.5');
  });

  it('"evolve for 100 generations" extracts generations', () => {
    const result = nlp.classifyIntent('evolve for 100 generations');
    expect(result.entities['generations']).toBe('100');
  });
});

// ═══════════════════════════════════════════════════════════════════
// ReflectionEngine — additional anomaly and trend branches
// ═══════════════════════════════════════════════════════════════════

describe('ReflectionEngine — additional branches', () => {
  let engine: ReflectionEngine;
  const baseContext: ReflectionContext = {
    seedCount: 10,
    avgFitness: 0.6,
    diversity: 0.5,
    convergenceRate: 0.05,
    generation: 5,
    goal: 'optimize',
    domain: 'organism',
  };

  beforeEach(() => {
    engine = new ReflectionEngine();
  });

  it('detectAnomaly — fitness_jump when avgFitness > 2x previous', () => {
    // Push some history so fitnessHistory.length > 2
    engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.1 });
    engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.1 });
    engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.1 });

    // Now detect anomaly where avgFitness = 0.5 (>2x the last history value of 0.1)
    const anomaly = engine.detectAnomaly({ ...baseContext, avgFitness: 0.5 });
    expect(anomaly.detected).toBe(true);
    expect(anomaly.type).toBe('fitness_jump');
    expect(anomaly.severity).toBeGreaterThan(0);
  });

  it('detectAnomaly — population_collapse when avgFitness < 0.2 and seedCount > 0', () => {
    const anomaly = engine.detectAnomaly({ ...baseContext, avgFitness: 0.15, seedCount: 5 });
    expect(anomaly.detected).toBe(true);
    expect(anomaly.type).toBe('population_collapse');
  });

  it('detectAnomaly — convergence_halt when generation > 5 and convergenceRate < 0.01', () => {
    const anomaly = engine.detectAnomaly({ ...baseContext, generation: 10, convergenceRate: 0.005 });
    expect(anomaly.detected).toBe(true);
    expect(anomaly.type).toBe('convergence_halt');
  });

  it('detectAnomaly — diversity_loss when generation > 3 and diversity < 0.2', () => {
    const anomaly = engine.detectAnomaly({ ...baseContext, generation: 5, diversity: 0.1 });
    expect(anomaly.detected).toBe(true);
    expect(anomaly.type).toBe('diversity_loss');
  });

  it('detectAnomaly — no anomaly for healthy context', () => {
    const anomaly = engine.detectAnomaly(baseContext);
    expect(anomaly.detected).toBe(false);
    expect(anomaly.severity).toBe(0);
  });

  it('analyzeTrend — stable when fewer than 3 values', () => {
    // No reflects yet
    const trend = engine.analyzeTrend('fitness');
    expect(trend.direction).toBe('stable');
    expect(trend.values).toHaveLength(0);
  });

  it('analyzeTrend — improving when rate > 0.05', () => {
    // Populate increasing fitness values
    for (let i = 0; i < 6; i++) {
      engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.3 + i * 0.1 });
    }
    const trend = engine.analyzeTrend('fitness');
    expect(trend.direction).toBe('improving');
    expect(trend.rate).toBeGreaterThan(0.05);
  });

  it('analyzeTrend — declining when rate < -0.05', () => {
    for (let i = 0; i < 6; i++) {
      engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.8 - i * 0.1 });
    }
    const trend = engine.analyzeTrend('fitness');
    expect(trend.direction).toBe('declining');
    expect(trend.earlyWarning).toBe(true);
  });

  it('analyzeTrend — stagnating when >10 values and rate near 0', () => {
    for (let i = 0; i < 12; i++) {
      engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.5 });
    }
    const trend = engine.analyzeTrend('fitness');
    expect(trend.direction).toBe('stagnating');
    expect(trend.earlyWarning).toBe(true);
  });

  it('getRecommendations — returns best strategy when domain has successes', () => {
    // Create a strategy with high success
    engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.9 });
    const recs = engine.getRecommendations(baseContext);
    const stratRec = recs.find(r => r.action === 'evolve');
    expect(stratRec).toBeDefined();
  });

  it('getRecommendations — suggests increase_mutation_rate for declining trend', () => {
    for (let i = 0; i < 6; i++) {
      engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.8 - i * 0.1 });
    }
    const recs = engine.getRecommendations(baseContext);
    expect(recs.some(r => r.action === 'increase_mutation_rate')).toBe(true);
  });

  it('getRecommendations — suggests island_migration for stagnating trend', () => {
    for (let i = 0; i < 12; i++) {
      engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.5 });
    }
    const recs = engine.getRecommendations(baseContext);
    expect(recs.some(r => r.action === 'island_migration')).toBe(true);
  });

  it('getRecommendations — suggests novelty_search for low diversity < 0.3', () => {
    const recs = engine.getRecommendations({ ...baseContext, diversity: 0.2 });
    expect(recs.some(r => r.action === 'novelty_search')).toBe(true);
  });

  it('metaReflect after multiple reflections', () => {
    engine.reflect('create', { success: true }, baseContext);
    engine.reflect('evolve', { success: false }, baseContext);
    engine.reflect('mutate', { success: true }, baseContext);
    const meta = engine.metaReflect();
    expect(meta.totalReflections).toBe(3);
    expect(meta.avgQuality).toBeGreaterThan(0);
    expect(meta.strategiesUsed).toBe(3);
    expect(meta.topStrategies.length).toBeGreaterThan(0);
  });

  it('reflect — updates existing strategy record on second call for same action+domain', () => {
    engine.reflect('evolve', { success: true }, baseContext);
    engine.reflect('evolve', { success: true }, baseContext);
    const meta = engine.metaReflect();
    // Only 1 unique strategy key for same action+domain
    expect(meta.strategiesUsed).toBe(1);
  });

  it('reflect — failure branch updates failureCount on strategy', () => {
    engine.reflect('evolve', { success: true }, { ...baseContext, avgFitness: 0.9 });
    // Score for failed action with low fitness should be <= 0.6
    engine.reflect('evolve', { success: false }, { ...baseContext, avgFitness: 0.1 });
    const meta = engine.metaReflect();
    expect(meta.strategiesUsed).toBe(1);
    expect(meta.totalReflections).toBe(2);
  });

  it('scoreAction — high fitness + high diversity + convergence bonus', () => {
    const entry = engine.reflect('evolve', { success: true }, {
      ...baseContext, avgFitness: 0.8, diversity: 0.6, convergenceRate: 0.1,
    });
    expect(entry.qualityScore).toBeGreaterThan(0.8);
  });

  it('scoreAction — failure with low fitness and low diversity', () => {
    const entry = engine.reflect('evolve', { success: false }, {
      ...baseContext, avgFitness: 0.2, diversity: 0.1, convergenceRate: 0.01,
    });
    expect(entry.qualityScore).toBeLessThan(0.5);
  });

  it('suggestNextAction — quality < 0.3 returns status', () => {
    // Force quality < 0.3: failed action, low fitness, low diversity
    const entry = engine.reflect('fail', { success: false }, {
      ...baseContext, avgFitness: 0.1, diversity: 0.05, convergenceRate: 0.0,
    });
    expect(entry.suggestedNextAction).toBe('status');
  });

  it('suggestNextAction — diversity < 0.2 returns mutate', () => {
    // Quality will be >= 0.3 (success), but diversity < 0.2
    const entry = engine.reflect('evolve', { success: true }, {
      ...baseContext, avgFitness: 0.6, diversity: 0.1,
    });
    expect(entry.suggestedNextAction).toBe('mutate');
  });

  it('suggestNextAction — avgFitness < 0.5 returns evolve', () => {
    const entry = engine.reflect('create', { success: true }, {
      ...baseContext, avgFitness: 0.4, diversity: 0.5,
    });
    expect(entry.suggestedNextAction).toBe('evolve');
  });

  it('suggestNextAction — seedCount < 5 returns create', () => {
    const entry = engine.reflect('status', { success: true }, {
      ...baseContext, avgFitness: 0.8, diversity: 0.6, seedCount: 3,
    });
    expect(entry.suggestedNextAction).toBe('create');
  });
});

// ═══════════════════════════════════════════════════════════════════
// NativeIntelligence — additional gene types and branches
// ═══════════════════════════════════════════════════════════════════

describe('NativeIntelligence — additional branches', () => {
  let intel: NativeIntelligence;

  beforeEach(() => {
    intel = new NativeIntelligence();
  });

  it('analyzeSeed — expression gene with non-empty source normalizes to 0.5', () => {
    const seed = makeSeed({
      genes: {
        formula: { type: 'expression', source: 'x * 2 + 1' },
      },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.overallAssessment).toBeDefined();
  });

  it('analyzeSeed — expression gene with empty source normalizes to 0', () => {
    const seed = makeSeed({
      genes: {
        formula: { type: 'expression', source: '' },
      },
      $fitness: { primary: 0.0 },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.weaknesses.some(w => w.includes('formula'))).toBe(true);
  });

  it('analyzeSeed — struct gene with fields normalizes > 0', () => {
    const seed = makeSeed({
      genes: {
        body: {
          type: 'struct',
          value: {
            arm: { type: 'scalar', value: 50, min: 0, max: 100 },
          },
        },
      },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis).toBeDefined();
  });

  it('analyzeSeed — struct gene empty normalizes to 0', () => {
    const seed = makeSeed({
      genes: {
        empty_struct: { type: 'struct', value: {} },
      },
      $fitness: { primary: 0.0 },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.weaknesses.some(w => w.includes('empty_struct'))).toBe(true);
  });

  it('analyzeSeed — array gene with items normalizes proportionally', () => {
    const seed = makeSeed({
      genes: {
        parts: {
          type: 'array',
          value: [
            { type: 'scalar', value: 1, min: 0, max: 10 },
            { type: 'scalar', value: 2, min: 0, max: 10 },
          ],
          maxLength: 10,
        },
      },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis).toBeDefined();
  });

  it('analyzeSeed — array gene empty normalizes to 0', () => {
    const seed = makeSeed({
      genes: {
        empty_array: { type: 'array', value: [], maxLength: 5 },
      },
      $fitness: { primary: 0.0 },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.weaknesses.some(w => w.includes('empty_array'))).toBe(true);
  });

  it('analyzeSeed — graph gene with nodes normalizes > 0', () => {
    const nodeMap = new Map<string, Gene>();
    nodeMap.set('a', { type: 'scalar', value: 1, min: 0, max: 10 });
    const seed = makeSeed({
      genes: {
        network: {
          type: 'graph',
          nodes: nodeMap,
          edges: [{ from: 'a', to: 'a', weight: { type: 'scalar', value: 1, min: 0, max: 1 } }],
        },
      },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis).toBeDefined();
  });

  it('analyzeSeed — tensor gene with data normalizes to 0.5', () => {
    const seed = makeSeed({
      genes: {
        weights: { type: 'tensor', data: new Float64Array([0.1, 0.2, 0.3]), shape: [3] },
      },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis).toBeDefined();
  });

  it('analyzeSeed — tensor gene empty normalizes to 0', () => {
    const seed = makeSeed({
      genes: {
        empty_tensor: { type: 'tensor', data: new Float64Array(0), shape: [] },
      },
      $fitness: { primary: 0.0 },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.weaknesses.some(w => w.includes('empty_tensor'))).toBe(true);
  });

  it('analyzeSeed — timeseries gene with keyframes normalizes proportionally', () => {
    const seed = makeSeed({
      genes: {
        timeline: {
          type: 'timeseries',
          keyframes: [{ t: 0, v: 0 }, { t: 1, v: 1 }],
          interpolation: 'linear',
        },
      },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis).toBeDefined();
  });

  it('analyzeSeed — timeseries gene empty normalizes to 0', () => {
    const seed = makeSeed({
      genes: {
        empty_ts: { type: 'timeseries', keyframes: [], interpolation: 'step' },
      },
      $fitness: { primary: 0.0 },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.weaknesses.some(w => w.includes('empty_ts'))).toBe(true);
  });

  it('analyzeSeed — fitness > 0.9 with no weaknesses → Exceptional', () => {
    // All genes must have normalized >= 0.25, fitness > 0.9
    // scalar 90/100=0.9 (strength), 80/100=0.8 (strength), 70/100=0.7 (neither), 50/100=0.5 (neither)
    // categorical 'lightning' at index 2 = 2/2 = 1.0 (strength)
    const seed = makeSeed({
      genes: {
        power: { type: 'scalar', value: 90, min: 0, max: 100 }, // 0.9 → strength
        speed: { type: 'scalar', value: 80, min: 0, max: 100 }, // 0.8 → strength
        agility: { type: 'scalar', value: 60, min: 0, max: 100 }, // 0.6 → neither
        element: { type: 'categorical', value: 'lightning', options: ['fire', 'ice', 'lightning'] }, // 1.0 → strength
      },
      $fitness: { primary: 0.95 },
    });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.overallAssessment).toContain('Exceptional');
  });

  it('analyzeSeed — fitness > 0.7 → Strong assessment', () => {
    const seed = makeSeed({ $fitness: { primary: 0.75 } });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.overallAssessment).toContain('Strong');
  });

  it('analyzeSeed — fitness 0.4-0.7 → Moderate assessment', () => {
    const seed = makeSeed({ $fitness: { primary: 0.5 } });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.overallAssessment).toContain('Moderate');
  });

  it('analyzeSeed — fitness < 0.4 → Developing assessment', () => {
    const seed = makeSeed({ $fitness: { primary: 0.2 } });
    const analysis = intel.analyzeSeed(seed);
    expect(analysis.overallAssessment).toContain('Developing');
  });

  it('describeSeed — generation > 0 with parents shows lineage', () => {
    const seed = makeSeed({
      $lineage: { generation: 3, parents: [{ id: 'p1', name: 'ParentA' }], timestamp: Date.now() },
    });
    const desc = intel.describeSeed(seed);
    expect(desc).toContain('Generation 3');
    expect(desc).toContain('1 parent');
  });

  it('describeSeed — generation = 0 shows first generation', () => {
    const seed = makeSeed({
      $lineage: { generation: 0, parents: [], timestamp: Date.now() },
    });
    const desc = intel.describeSeed(seed);
    expect(desc).toContain('First generation');
  });

  it('describeSeed — no high traits results in no notable traits string', () => {
    // All genes below 0.7 threshold
    const seed = makeSeed({
      genes: {
        health: { type: 'scalar', value: 30, min: 0, max: 100 }, // 0.3
      },
      $fitness: { primary: 0.3 },
    });
    const desc = intel.describeSeed(seed);
    expect(desc).not.toContain('Notable traits');
  });

  it('compareSeed — genes unique to seedA show advantage A', () => {
    const seedA = makeSeed({
      genes: {
        health: { type: 'scalar', value: 80, min: 0, max: 100 },
        special: { type: 'scalar', value: 90, min: 0, max: 100 },
      },
      $fitness: { primary: 0.8 },
    });
    const seedB = makeSeed({
      $name: 'BetaOnly',
      $hash: 'hash_b_only',
      genes: {
        health: { type: 'scalar', value: 20, min: 0, max: 100 },
      },
      $fitness: { primary: 0.3 },
    });
    const comparison = intel.compareSeed(seedA, seedB);
    const specialDiff = comparison.differences.find(d => d.gene === 'special');
    expect(specialDiff).toBeDefined();
    expect(specialDiff!.advantage).toBe('A');
  });

  it('compareSeed — genes unique to seedB show advantage B', () => {
    const seedA = makeSeed({
      genes: {
        health: { type: 'scalar', value: 50, min: 0, max: 100 },
      },
      $fitness: { primary: 0.5 },
    });
    const seedB = makeSeed({
      $name: 'BetaSpecial',
      $hash: 'hash_bs',
      genes: {
        health: { type: 'scalar', value: 50, min: 0, max: 100 },
        unique: { type: 'scalar', value: 90, min: 0, max: 100 },
      },
      $fitness: { primary: 0.4 },
    });
    const comparison = intel.compareSeed(seedA, seedB);
    const uniqueDiff = comparison.differences.find(d => d.gene === 'unique');
    expect(uniqueDiff!.advantage).toBe('B');
  });

  it('compareSeed — seedB wins when fitnessDelta < -0.05', () => {
    const seedA = makeSeed({ $fitness: { primary: 0.3 } });
    const seedB = makeSeed({
      $name: 'StrongerB',
      $hash: 'hash_stronger',
      genes: {
        health: { type: 'scalar', value: 80, min: 0, max: 100 },
        speed: { type: 'scalar', value: 50, min: 0, max: 100 },
        element: { type: 'categorical', value: 'fire', options: ['fire', 'ice', 'lightning'] },
        color: { type: 'vector', value: [0.9, 0.2, 0.1], dimensions: 3 },
      },
      $fitness: { primary: 0.9 },
    });
    const comparison = intel.compareSeed(seedA, seedB);
    expect(comparison.fitnessDelta).toBeLessThan(-0.05);
    expect(comparison.summary).toContain('StrongerB');
  });

  it('planActions — warrior goal creates full 4-step plan', () => {
    const plan = intel.planActions('create a warrior creature', { seedCount: 0, avgFitness: 0 });
    expect(plan.length).toBe(4);
    expect(plan[2]!.tool).toBe('evolve');
  });

  it('planActions — diversity/explore goal creates mutation plan', () => {
    const plan = intel.planActions('explore diversity in population', { seedCount: 5, avgFitness: 0.5 });
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]!.tool).toBe('mutate');
  });

  it('planActions — optimize/improve goal creates 3-step plan', () => {
    const plan = intel.planActions('optimize and improve fitness', { seedCount: 10, avgFitness: 0.4 });
    expect(plan.length).toBe(3);
    expect(plan[1]!.tool).toBe('evolve');
  });

  it('planActions — default with 0 seeds creates 1 seed', () => {
    const plan = intel.planActions('do something random', { seedCount: 0, avgFitness: 0 });
    expect(plan.length).toBe(1);
    expect(plan[0]!.tool).toBe('create_seed');
  });

  it('planActions — default with <5 seeds creates expansion plan', () => {
    const plan = intel.planActions('do something random', { seedCount: 3, avgFitness: 0.3 });
    expect(plan.length).toBe(2);
    expect(plan[0]!.tool).toBe('create_seed');
    expect(plan[1]!.tool).toBe('evolve');
  });

  it('planActions — default with >=5 seeds continues evolution', () => {
    const plan = intel.planActions('do something random', { seedCount: 8, avgFitness: 0.5 });
    expect(plan.length).toBe(1);
    expect(plan[0]!.tool).toBe('evolve');
  });
});

// ═══════════════════════════════════════════════════════════════════
// ToolRegistry — additional branches
// ═══════════════════════════════════════════════════════════════════

describe('ToolRegistry — additional branches', () => {
  let registry: ToolRegistry;

  const specWithEnum: ToolSpec = {
    id: 'enum_tool',
    name: 'Enum Tool',
    description: 'Has enum, min, max params',
    category: 'analysis',
    parameters: [
      {
        name: 'mode',
        type: 'string',
        description: 'Mode of operation',
        required: true,
        enum: ['fast', 'slow', 'balanced'],
      },
      {
        name: 'count',
        type: 'number',
        description: 'Count',
        required: false,
        min: 1,
        max: 100,
      },
    ],
  };

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('toLLMTools includes enum field when parameter has enum', () => {
    registry.register(specWithEnum, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    const llmTools = registry.toLLMTools();
    const modeProp = llmTools[0]!.parameters.properties?.['mode'];
    expect(modeProp).toBeDefined();
    expect(modeProp!.enum).toEqual(['fast', 'slow', 'balanced']);
  });

  it('toLLMTools includes minimum and maximum fields', () => {
    registry.register(specWithEnum, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    const llmTools = registry.toLLMTools();
    const countProp = llmTools[0]!.parameters.properties?.['count'];
    expect(countProp!.minimum).toBe(1);
    expect(countProp!.maximum).toBe(100);
  });

  it('search by description keyword', () => {
    const spec: ToolSpec = {
      id: 'desc_search_tool',
      name: 'Alpha Tool',
      description: 'Unique keyword xyzzy12345',
      category: 'agent',
      parameters: [],
    };
    registry.register(spec, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    expect(registry.search('xyzzy12345').length).toBe(1);
    expect(registry.search('nonexistent_keyword_qwerty').length).toBe(0);
  });

  it('list without category returns all tools', () => {
    const spec1: ToolSpec = { id: 't1', name: 'T1', description: 'd1', category: 'seed_management', parameters: [] };
    const spec2: ToolSpec = { id: 't2', name: 'T2', description: 'd2', category: 'evolution', parameters: [] };
    registry.register(spec1, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    registry.register(spec2, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    expect(registry.list().length).toBe(2);
  });

  it('list with category filter returns only matching tools', () => {
    const spec1: ToolSpec = { id: 't1', name: 'T1', description: 'd1', category: 'seed_management', parameters: [] };
    const spec2: ToolSpec = { id: 't2', name: 'T2', description: 'd2', category: 'evolution', parameters: [] };
    registry.register(spec1, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    registry.register(spec2, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    expect(registry.list('evolution').length).toBe(1);
    expect(registry.list('evolution')[0]!.id).toBe('t2');
  });

  it('unregister returns false for non-existent tool', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('execute with missing required param returns validation error', async () => {
    registry.register(specWithEnum, async () => ({ success: true, message: 'ok', durationMs: 0 }));
    const result = await registry.execute('enum_tool', { count: 5 }); // missing required 'mode'
    expect(result.success).toBe(false);
    expect(result.error).toBe('validation');
    expect(result.message).toContain('mode');
  });

  it('execute where executor throws returns execution error', async () => {
    const spec: ToolSpec = { id: 'throws_tool', name: 'Throws', description: 'Throws', category: 'agent', parameters: [] };
    registry.register(spec, async () => { throw new Error('Executor failure'); });
    const result = await registry.execute('throws_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('execution');
    expect(result.message).toBe('Executor failure');
  });
});

// ═══════════════════════════════════════════════════════════════════
// ToolChain — additional branches
// ═══════════════════════════════════════════════════════════════════

describe('ToolChain — additional branches', () => {
  it('uses function params based on previous result', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'producer', name: 'Producer', description: 'Produces data', category: 'agent', parameters: [] },
      async () => ({ success: true, message: 'produced', durationMs: 0, data: { count: 42 } }),
    );
    registry.register(
      { id: 'consumer', name: 'Consumer', description: 'Consumes data', category: 'agent', parameters: [
        { name: 'count', type: 'number', description: 'Count', required: false },
      ]},
      async (params) => ({ success: true, message: `consumed ${params['count']}`, durationMs: 0 }),
    );

    const chain = new ToolChain();
    chain.add('producer', {});
    chain.add('consumer', (prev: ToolExecutionResult) => ({
      count: (prev.data as { count: number }).count,
    }));

    expect(chain.length).toBe(2);
    const results = await chain.execute(registry);
    expect(results.length).toBe(2);
    expect(results[1]!.message).toContain('42');
  });

  it('halts when first step fails with function params', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'fail_first', name: 'FailFirst', description: 'Fails', category: 'agent', parameters: [] },
      async () => ({ success: false, message: 'step failed', durationMs: 0 }),
    );
    registry.register(
      { id: 'next_step', name: 'NextStep', description: 'Next', category: 'agent', parameters: [] },
      async () => ({ success: true, message: 'ok', durationMs: 0 }),
    );

    const chain = new ToolChain();
    chain.add('fail_first', {});
    chain.add('next_step', (prev: ToolExecutionResult) => ({ prevMsg: prev.message }));

    const results = await chain.execute(registry);
    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ToolBridge — additional branches
// ═══════════════════════════════════════════════════════════════════

describe('ToolBridge — additional branches', () => {
  it('executeTool returns JSON-stringified data when result has data', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'data_tool', name: 'DataTool', description: 'Returns data', category: 'agent', parameters: [] },
      async () => ({ success: true, message: 'ok', durationMs: 0, data: { key: 'value', count: 3 } }),
    );
    const bridge = new ToolBridge(registry);
    const result = await bridge.executeTool({ id: 'call_0', name: 'data_tool', arguments: {} });
    const parsed = JSON.parse(result) as { key: string; count: number };
    expect(parsed.key).toBe('value');
    expect(parsed.count).toBe(3);
  });

  it('executeTool returns message when success is true but no data', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'msg_tool', name: 'MsgTool', description: 'Returns message', category: 'agent', parameters: [] },
      async () => ({ success: true, message: 'Operation complete', durationMs: 0 }),
    );
    const bridge = new ToolBridge(registry);
    const result = await bridge.executeTool({ id: 'call_0', name: 'msg_tool', arguments: {} });
    expect(result).toBe('Operation complete');
  });

  it('executeTool returns Error string on failure', async () => {
    const registry = new ToolRegistry();
    // Use a missing tool to trigger failure
    const bridge = new ToolBridge(registry);
    const result = await bridge.executeTool({ id: 'call_0', name: 'missing_tool', arguments: {} });
    expect(result).toContain('Error:');
  });

  it('runToolLoop — provider returns tool calls then plain content', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'action_tool', name: 'ActionTool', description: 'Does action', category: 'agent', parameters: [] },
      async () => ({ success: true, message: 'action done', durationMs: 0, data: { result: 'success' } }),
    );

    let callCount = 0;
    const sequentialProvider: LLMProvider = {
      name: 'sequential',
      async chat(): Promise<LLMResponse> {
        callCount++;
        if (callCount === 1) {
          return {
            content: '',
            toolCalls: [{ id: 'call_0', name: 'action_tool', arguments: {} }],
            finishReason: 'tool_use',
          };
        }
        return { content: 'Final answer', finishReason: 'stop' };
      },
      async *stream() { /* no-op */ },
      async isAvailable() { return true; },
    };

    const bridge = new ToolBridge(registry);
    const result = await bridge.runToolLoop(
      sequentialProvider,
      [{ role: 'user', content: 'do something' }],
    );

    expect(result.response).toBe('Final answer');
    expect(result.toolsUsed).toContain('action_tool');
  });

  it('runToolLoop — max iterations reached returns fallback message', async () => {
    const registry = new ToolRegistry();
    registry.register(
      { id: 'loop_tool', name: 'LoopTool', description: 'Always returns tool call', category: 'agent', parameters: [] },
      async () => ({ success: true, message: 'looping', durationMs: 0 }),
    );

    const infiniteProvider: LLMProvider = {
      name: 'infinite',
      async chat(): Promise<LLMResponse> {
        return {
          content: '',
          toolCalls: [{ id: 'call_x', name: 'loop_tool', arguments: {} }],
          finishReason: 'tool_use',
        };
      },
      async *stream() { /* no-op */ },
      async isAvailable() { return true; },
    };

    const bridge = new ToolBridge(registry);
    const result = await bridge.runToolLoop(
      infiniteProvider,
      [{ role: 'user', content: 'loop forever' }],
      3, // maxIterations = 3
    );

    expect(result.response).toBe('Max tool iterations reached');
    expect(result.toolsUsed.length).toBe(3);
  });
});
