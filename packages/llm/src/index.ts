/**
 * @paradigm/llm — 100% FREE LLM integration, NLP compiler, reflection engine,
 * native intelligence, tool system, and provider routing.
 *
 * Core insight: The agent works WITHOUT any LLM. The NLP compiler (pattern-based
 * intent classification), reflection engine (strategy memory + anomaly detection),
 * and native intelligence (seed analysis + planning) all run as pure TypeScript.
 * LLMs via Ollama (free, local) are an optional enhancement layer.
 *
 * @packageDocumentation
 */

import type {
  UniversalSeed,
  GeneMap,
  Gene,
  IntentType,
  ParsedIntent,
  SeedDomain,
} from '@paradigm/types';

// ═══════════════════════════════════════════════════════════════════
// LLM Types
// ═══════════════════════════════════════════════════════════════════

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchemaObject;
}

export interface JSONSchemaObject {
  type: 'object';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: JSONSchemaProperty;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  usage?: LLMUsage;
  finishReason: 'stop' | 'tool_use' | 'length' | 'error';
  model?: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stop?: string[];
  tools?: LLMToolDefinition[];
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  stream(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, undefined>;
  isAvailable(): Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════════
// Ollama Provider (PRIMARY — 100% free, local)
// ═══════════════════════════════════════════════════════════════════

export interface OllamaConfig {
  host?: string;
  port?: number;
  model?: string;
  contextLength?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly contextLength: number;

  constructor(config: OllamaConfig = {}) {
    const host = config.host ?? 'localhost';
    const port = config.port ?? 11434;
    this.baseUrl = `http://${host}:${port}`;
    this.model = config.model ?? 'llama3.2';
    this.contextLength = config.contextLength ?? 8192;
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.model;
    const toolDefs = options?.tools;

    const systemContent = toolDefs
      ? this.buildToolSystemPrompt(toolDefs)
      : undefined;

    const ollamaMessages = messages.map(m => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.role === 'tool'
        ? `[Tool Result for ${m.toolCallId}]: ${m.content}`
        : m.content,
    }));

    if (systemContent) {
      ollamaMessages.unshift({ role: 'system', content: systemContent });
    }

    const body = {
      model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
        num_ctx: this.contextLength,
        stop: options?.stop,
      },
    };

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`Ollama error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as {
      message?: { content?: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };
    const content = data.message?.content ?? '';
    const toolCalls = this.parseToolCalls(content);

    return {
      content: toolCalls.length > 0 ? '' : content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: toolCalls.length > 0 ? 'tool_use' : 'stop',
      model,
    };
  }

  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, undefined> {
    const model = options?.model ?? this.model;
    const ollamaMessages = messages.map(m => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    }));

    const body = {
      model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
        num_ctx: this.contextLength,
      },
    };

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`Ollama stream error: ${resp.status}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();

    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        const text = decoder.decode(result.value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as { message?: { content?: string } };
            if (obj.message?.content) {
              yield obj.message.content;
            }
          } catch {
            // partial JSON line, skip
          }
        }
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  private buildToolSystemPrompt(tools: LLMToolDefinition[]): string {
    const toolDescs = tools.map(t =>
      `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}`,
    ).join('\n');
    return [
      'You have access to the following tools:',
      toolDescs,
      '',
      'To use a tool, respond with a JSON block:',
      '```json',
      '{"tool": "tool_name", "arguments": {...}}',
      '```',
    ].join('\n');
  }

  private parseToolCalls(content: string): LLMToolCall[] {
    const calls: LLMToolCall[] = [];
    const jsonBlockRe = /```json\s*\n?([\s\S]*?)\n?```/g;
    let match: RegExpExecArray | null;
    let callId = 0;
    while ((match = jsonBlockRe.exec(content)) !== null) {
      try {
        const obj = JSON.parse(match[1] as string) as {
          tool?: string;
          arguments?: Record<string, unknown>;
        };
        if (obj.tool) {
          calls.push({
            id: `call_${callId++}`,
            name: obj.tool,
            arguments: obj.arguments ?? {},
          });
        }
      } catch {
        // malformed JSON, skip
      }
    }
    return calls;
  }
}

// ═══════════════════════════════════════════════════════════════════
// OpenAI-Compatible Provider (OPTIONAL — for users who choose
// to connect external APIs like Claude, GPT, Groq, Together)
// ═══════════════════════════════════════════════════════════════════

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  defaultHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly headers: Record<string, string>;

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = config.model ?? 'gpt-4o';
    this.name = `openai-compatible(${this.baseUrl})`;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...config.defaultHeaders,
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: options?.model ?? this.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stop: options?.stop,
    };

    if (options?.tools?.length) {
      body['tools'] = options.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${errText}`);
    }

    const data = (await resp.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';
    const rawToolCalls = choice?.message?.tool_calls;
    const toolCalls: LLMToolCall[] | undefined = rawToolCalls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined,
      finishReason: choice?.finish_reason === 'tool_calls' ? 'tool_use'
        : choice?.finish_reason === 'length' ? 'length'
        : 'stop',
      model: options?.model ?? this.model,
    };
  }

  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, undefined> {
    const body = {
      model: options?.model ?? this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stream: true,
    };

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`OpenAI stream error: ${resp.status}`);

    const reader = resp.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;

    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') return;
          try {
            const obj = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = obj.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // partial SSE
          }
        }
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Provider Router — intelligent provider selection with failover
// ═══════════════════════════════════════════════════════════════════

export type RouterPreference = 'local_first' | 'cloud_first' | 'auto';

export interface ProviderRouterConfig {
  providers: LLMProvider[];
  preference?: RouterPreference;
  cacheTtlMs?: number;
}

interface AvailabilityEntry {
  available: boolean;
  checkedAt: number;
}

export class ProviderRouter implements LLMProvider {
  readonly name = 'router';
  private readonly providers: LLMProvider[];
  private readonly preference: RouterPreference;
  private readonly cacheTtlMs: number;
  private readonly availabilityCache = new Map<string, AvailabilityEntry>();

  constructor(config: ProviderRouterConfig) {
    this.providers = config.providers;
    this.preference = config.preference ?? 'local_first';
    this.cacheTtlMs = config.cacheTtlMs ?? 30_000;
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const provider = await this.selectProvider(messages);
    return provider.chat(messages, options);
  }

  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, undefined> {
    const provider = await this.selectProvider(messages);
    yield* provider.stream(messages, options);
  }

  async isAvailable(): Promise<boolean> {
    for (const p of this.providers) {
      if (await this.checkAvailability(p)) return true;
    }
    return false;
  }

  async selectProvider(messages?: LLMMessage[]): Promise<LLMProvider> {
    const ordered = this.orderByPreference(messages);
    for (const p of ordered) {
      if (await this.checkAvailability(p)) return p;
    }
    throw new Error('No LLM provider available');
  }

  private orderByPreference(messages?: LLMMessage[]): LLMProvider[] {
    if (this.preference === 'local_first') return [...this.providers];
    if (this.preference === 'cloud_first') return [...this.providers].reverse();

    // auto: use complexity heuristic
    const totalChars = messages?.reduce((sum, m) => sum + m.content.length, 0) ?? 0;
    const isComplex = totalChars > 1000 || (messages?.length ?? 0) > 10;
    return isComplex
      ? [...this.providers].reverse() // complex → prefer cloud
      : [...this.providers];          // simple → prefer local
  }

  private async checkAvailability(provider: LLMProvider): Promise<boolean> {
    const cached = this.availabilityCache.get(provider.name);
    if (cached && (Date.now() - cached.checkedAt) < this.cacheTtlMs) {
      return cached.available;
    }
    const available = await provider.isAvailable();
    this.availabilityCache.set(provider.name, { available, checkedAt: Date.now() });
    return available;
  }
}

// ═══════════════════════════════════════════════════════════════════
// NLP Compiler — pattern-based intent classification (NO LLM required)
// ═══════════════════════════════════════════════════════════════════

interface IntentPattern {
  type: IntentType;
  patterns: RegExp[];
  confidence: number;
}

interface SlotExtraction {
  numbers: number[];
  ranges: Array<{ min: number; max: number }>;
  domains: string[];
  names: string[];
  seedRefs: string[];
}

export interface NLPResult {
  intent: ParsedIntent;
  gsplCode: string;
  slots: SlotExtraction;
  suggestions: string[];
}

interface ConversationContext {
  lastSeed?: string;
  lastDomain?: string;
  lastAction?: IntentType;
}

const DOMAIN_NAMES: string[] = [
  'organism', 'vehicle', 'weapon', 'building', 'terrain', 'material',
  'plant', 'insect', 'fish', 'bird', 'mammal', 'robot', 'particle',
  'fluid', 'crystal', 'sound', 'music', 'pattern', 'network', 'language',
  'code', 'strategy', 'schedule', 'rule', 'constraint', 'ecosystem',
  'game', 'simulation', 'audio', 'narrative', 'ui', 'city', 'neural',
  'intelligence', 'quantum', 'molecular', 'education', 'finance',
  'infrastructure', 'product', 'void', 'web',
];

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: 'create',
    patterns: [
      /\b(?:create|make|build|generate|spawn|new|design)\b\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:\s+(?:as|in|with|for)\s|\s+(?:organism|creature|entity)\b|$)/i,
    ],
    confidence: 0.9,
  },
  {
    type: 'breed',
    patterns: [
      /\b(?:breed|cross|combine|merge|mix)\b.*?(\w+)\s+(?:and|with|&)\s+(\w+)/i,
      /\b(?:breed|cross)\b.*?\bthem\b/i,
    ],
    confidence: 0.92,
  },
  {
    type: 'mutate',
    patterns: [
      /\b(?:mutate|modify|change|alter|tweak)\b.*?(\w+)(?:\s+(?:by|with|at)\s+([\d.]+))?/i,
      /\b(?:mutate|modify)\b.*?\bit\b/i,
    ],
    confidence: 0.91,
  },
  {
    type: 'evolve',
    patterns: [
      /\b(?:evolve|evolute|run evolution|optimize)\b.*?(?:for\s+)?(\d+)\s*(?:to\s+(\d+)\s*)?(?:gen(?:eration)?s?)?/i,
      /\b(?:evolve|run evolution)\b/i,
    ],
    confidence: 0.93,
  },
  {
    type: 'inspect',
    patterns: [
      /\b(?:inspect|examine|look at|analyze|show|describe|detail)\b\s+(\w+)/i,
    ],
    confidence: 0.88,
  },
  {
    type: 'query',
    patterns: [
      /\b(?:query|find|search|list|get|show)\b\s+(?:all\s+)?(?:seeds?|entities?)/i,
      /\b(?:filter|sort)\b.*?\bseeds?\b/i,
    ],
    confidence: 0.87,
  },
  {
    type: 'explain',
    patterns: [
      /\b(?:explain|why|how does|what does|what is)\b/i,
    ],
    confidence: 0.85,
  },
  {
    type: 'compare',
    patterns: [
      /\b(?:compare|diff|versus|vs)\b.*?(\w+)\s+(?:and|with|to|vs)\s+(\w+)/i,
    ],
    confidence: 0.89,
  },
  {
    type: 'simulate',
    patterns: [
      /\b(?:simulate|sim|run simulation)\b/i,
    ],
    confidence: 0.88,
  },
  {
    type: 'export',
    patterns: [
      /\b(?:export|save|download|output)\b/i,
    ],
    confidence: 0.86,
  },
  {
    type: 'import',
    patterns: [
      /\b(?:import|load|upload|ingest)\b/i,
    ],
    confidence: 0.86,
  },
  {
    type: 'forge',
    patterns: [
      /\b(?:forge|render|generate artifact|produce|make a)\b\s+(?:a\s+)?(?:game|sprite|story|html|website|logo|music|character sheet)/i,
    ],
    confidence: 0.91,
  },
  {
    type: 'status',
    patterns: [
      /\b(?:status|info|world|overview|summary|state|stats)\b/i,
    ],
    confidence: 0.84,
  },
  {
    type: 'help',
    patterns: [
      /\b(?:help|how to|tutorial|guide|usage|commands|what can)\b/i,
    ],
    confidence: 0.83,
  },
  {
    type: 'configure',
    patterns: [
      /\b(?:configure|config|set|setting|option|preference)\b/i,
    ],
    confidence: 0.85,
  },
  {
    type: 'search',
    patterns: [
      /\b(?:web search|search the web|look up|google|find online)\b/i,
    ],
    confidence: 0.87,
  },
  {
    type: 'undo',
    patterns: [/\b(?:undo|revert|go back|rollback)\b/i],
    confidence: 0.95,
  },
  {
    type: 'redo',
    patterns: [/\b(?:redo|redo that|do again)\b/i],
    confidence: 0.95,
  },
];

export class NLPCompiler {
  private context: ConversationContext = {};

  classifyIntent(input: string): ParsedIntent {
    const trimmed = input.trim();
    if (!trimmed) {
      return { type: 'help', entities: {}, confidence: 0.5, rawInput: input };
    }

    for (const { type, patterns, confidence } of INTENT_PATTERNS) {
      for (const pattern of patterns) {
        const match = pattern.exec(trimmed);
        if (match) {
          const entities = this.extractEntities(type, match, trimmed);
          this.context.lastAction = type;
          if (entities['name']) this.context.lastSeed = entities['name'];
          if (entities['domain']) this.context.lastDomain = entities['domain'];
          return { type, entities, confidence, rawInput: input };
        }
      }
    }

    // fallback: treat as create intent
    return {
      type: 'create',
      entities: { name: trimmed },
      confidence: 0.4,
      rawInput: input,
    };
  }

  classifyMultiIntent(input: string): ParsedIntent[] {
    const parts = input.split(/\b(?:and then|then|,\s*then|;\s*)\b/i);
    if (parts.length <= 1) return [this.classifyIntent(input)];
    return parts.map(p => this.classifyIntent(p.trim())).filter(p => p.confidence > 0.3);
  }

  extractSlots(input: string): SlotExtraction {
    const numbers: number[] = [];
    const ranges: Array<{ min: number; max: number }> = [];
    const domains: string[] = [];
    const names: string[] = [];
    const seedRefs: string[] = [];

    // numbers
    const numRe = /\b(\d+(?:\.\d+)?)\b/g;
    let numMatch: RegExpExecArray | null;
    while ((numMatch = numRe.exec(input)) !== null) {
      numbers.push(Number(numMatch[1]));
    }

    // ranges
    const rangeRe = /(\d+)\s*(?:to|-)\s*(\d+)/g;
    let rangeMatch: RegExpExecArray | null;
    while ((rangeMatch = rangeRe.exec(input)) !== null) {
      ranges.push({ min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) });
    }

    // domains
    const lower = input.toLowerCase();
    for (const d of DOMAIN_NAMES) {
      if (lower.includes(d)) domains.push(d);
    }

    // capitalized words as potential seed/entity names
    const nameRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let nameMatch: RegExpExecArray | null;
    while ((nameMatch = nameRe.exec(input)) !== null) {
      names.push(nameMatch[1] as string);
    }

    // "it" / "them" → use context
    if (/\bit\b/i.test(input) && this.context.lastSeed) {
      seedRefs.push(this.context.lastSeed);
    }

    return { numbers, ranges, domains, names, seedRefs };
  }

  compileToGSPL(intent: ParsedIntent): string {
    const name = intent.entities['name'] ?? 'Unnamed';
    const domain = intent.entities['domain'] ?? 'organism';
    switch (intent.type) {
      case 'create':
        return `seed ${name} : ${domain} {\n  fields {\n    health: 100\n  }\n}`;
      case 'breed': {
        const a = intent.entities['parentA'] ?? 'A';
        const b = intent.entities['parentB'] ?? 'B';
        return `breed Offspring = (${a}, ${b});`;
      }
      case 'mutate': {
        const target = intent.entities['target'] ?? name;
        const rate = intent.entities['rate'] ?? '0.3';
        return `mutate Mutant = (${target}, ${rate});`;
      }
      case 'evolve': {
        const gens = intent.entities['generations'] ?? '50';
        return `evolve Population for ${gens} generations;`;
      }
      case 'status':
        return 'world status;';
      case 'export':
        return 'export world as "world-export.gseed";';
      default:
        return `// ${intent.type}: ${intent.rawInput}`;
    }
  }

  suggestCommands(partial: string): string[] {
    const commands = [
      'create', 'breed', 'mutate', 'evolve', 'inspect', 'query', 'explain',
      'compare', 'simulate', 'export', 'import', 'forge', 'status', 'help',
      'search', 'configure', 'undo', 'redo',
    ];
    const lower = partial.toLowerCase();
    return commands
      .map(c => ({ cmd: c, dist: levenshtein(lower, c.slice(0, lower.length)) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)
      .map(x => x.cmd);
  }

  processNaturalLanguage(input: string): NLPResult {
    const intent = this.classifyIntent(input);
    const gsplCode = this.compileToGSPL(intent);
    const slots = this.extractSlots(input);
    const suggestions = intent.confidence < 0.7
      ? this.suggestCommands(input.split(/\s+/)[0] ?? '')
      : [];
    return { intent, gsplCode, slots, suggestions };
  }

  getContext(): ConversationContext {
    return { ...this.context };
  }

  resetContext(): void {
    this.context = {};
  }

  private extractEntities(
    type: IntentType,
    match: RegExpExecArray,
    _input: string,
  ): Record<string, string> {
    const entities: Record<string, string> = {};
    switch (type) {
      case 'create':
        if (match[1]) entities['name'] = match[1].trim();
        for (const d of DOMAIN_NAMES) {
          if (_input.toLowerCase().includes(d)) { entities['domain'] = d; break; }
        }
        break;
      case 'breed':
        if (match[1]) entities['parentA'] = match[1].trim();
        if (match[2]) entities['parentB'] = match[2].trim();
        break;
      case 'mutate':
        if (match[1]) entities['target'] = match[1].trim();
        if (match[2]) entities['rate'] = match[2];
        break;
      case 'evolve':
        if (match[1]) entities['generations'] = match[1];
        if (match[2]) entities['maxGenerations'] = match[2];
        break;
      case 'inspect':
        if (match[1]) entities['target'] = match[1].trim();
        break;
      case 'compare':
        if (match[1]) entities['seedA'] = match[1].trim();
        if (match[2]) entities['seedB'] = match[2].trim();
        break;
    }
    return entities;
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        (dp[i - 1]?.[j] ?? i) + 1,
        (dp[i]?.[j - 1] ?? j) + 1,
        (dp[i - 1]?.[j - 1] ?? Math.max(i, j)) + cost,
      );
    }
  }
  return dp[m]?.[n] ?? Math.max(m, n);
}

// ═══════════════════════════════════════════════════════════════════
// Reflection Engine — strategy memory, anomaly detection, meta-learning
// ═══════════════════════════════════════════════════════════════════

export interface ReflectionContext {
  seedCount: number;
  avgFitness: number;
  diversity: number;
  convergenceRate: number;
  generation: number;
  goal?: string;
  domain?: string;
}

export interface ReflectionEntry {
  action: string;
  qualityScore: number;
  insights: string[];
  suggestedNextAction: string;
  strategyUsed?: string;
  performanceDelta: number;
  anomalyDetected: boolean;
  timestamp: number;
}

export interface StrategyRecord {
  name: string;
  domain: string;
  successCount: number;
  failureCount: number;
  avgPerformance: number;
  lastUsed: number;
}

export type TrendDirection = 'improving' | 'declining' | 'stable' | 'stagnating';

export interface PerformanceTrend {
  metric: string;
  values: number[];
  direction: TrendDirection;
  rate: number;
  earlyWarning: boolean;
}

export type AnomalyType =
  | 'fitness_jump'
  | 'population_collapse'
  | 'convergence_halt'
  | 'diversity_loss';

export interface AnomalyResult {
  detected: boolean;
  type?: AnomalyType;
  severity: number;
  description: string;
}

export interface Recommendation {
  action: string;
  confidence: number;
  expectedImprovement: number;
  reasoning: string;
}

export class ReflectionEngine {
  private entries: ReflectionEntry[] = [];
  private strategies = new Map<string, StrategyRecord>();
  private fitnessHistory: number[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  reflect(
    action: string,
    result: { success: boolean; data?: unknown },
    context: ReflectionContext,
  ): ReflectionEntry {
    const qualityScore = this.scoreAction(result, context);
    const anomaly = this.detectAnomaly(context);
    const insights = this.generateInsights(action, result, context, anomaly);
    const suggestedNextAction = this.suggestNextAction(context, qualityScore);
    const performanceDelta = this.computePerformanceDelta(context);

    this.fitnessHistory.push(context.avgFitness);

    const entry: ReflectionEntry = {
      action,
      qualityScore,
      insights,
      suggestedNextAction,
      performanceDelta,
      anomalyDetected: anomaly.detected,
      timestamp: Date.now(),
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();

    // update strategy record
    const strategyKey = `${action}:${context.domain ?? 'general'}`;
    const existing = this.strategies.get(strategyKey);
    if (existing) {
      if (qualityScore > 0.6) existing.successCount++;
      else existing.failureCount++;
      existing.avgPerformance =
        (existing.avgPerformance * (existing.successCount + existing.failureCount - 1) + qualityScore) /
        (existing.successCount + existing.failureCount);
      existing.lastUsed = Date.now();
    } else {
      this.strategies.set(strategyKey, {
        name: action,
        domain: context.domain ?? 'general',
        successCount: qualityScore > 0.6 ? 1 : 0,
        failureCount: qualityScore <= 0.6 ? 1 : 0,
        avgPerformance: qualityScore,
        lastUsed: Date.now(),
      });
    }

    return entry;
  }

  detectAnomaly(context: ReflectionContext): AnomalyResult {
    // fitness jump: >2x baseline improvement
    if (this.fitnessHistory.length > 2) {
      const prev = this.fitnessHistory[this.fitnessHistory.length - 1] ?? 0;
      if (context.avgFitness > prev * 2 && prev > 0) {
        return {
          detected: true,
          type: 'fitness_jump',
          severity: 0.8,
          description: `Fitness jumped from ${prev.toFixed(3)} to ${context.avgFitness.toFixed(3)}`,
        };
      }
    }

    // population collapse
    if (context.avgFitness < 0.2 && context.seedCount > 0) {
      return {
        detected: true,
        type: 'population_collapse',
        severity: 0.9,
        description: `Average fitness collapsed to ${context.avgFitness.toFixed(3)}`,
      };
    }

    // convergence halt
    if (context.generation > 5 && context.convergenceRate < 0.01) {
      return {
        detected: true,
        type: 'convergence_halt',
        severity: 0.6,
        description: `Convergence stalled at generation ${context.generation}`,
      };
    }

    // diversity loss
    if (context.generation > 3 && context.diversity < 0.2) {
      return {
        detected: true,
        type: 'diversity_loss',
        severity: 0.7,
        description: `Diversity dropped to ${context.diversity.toFixed(3)}`,
      };
    }

    return { detected: false, severity: 0, description: 'No anomalies detected' };
  }

  getRecommendations(context: ReflectionContext): Recommendation[] {
    const recs: Recommendation[] = [];

    // domain-specific strategy recommendations
    const domainStrategies = [...this.strategies.values()]
      .filter(s => s.domain === (context.domain ?? 'general') && s.successCount > 0)
      .sort((a, b) => b.avgPerformance - a.avgPerformance);

    if (domainStrategies.length > 0) {
      const best = domainStrategies[0]!;
      recs.push({
        action: best.name,
        confidence: Math.min(best.avgPerformance, 0.95),
        expectedImprovement: best.avgPerformance * 0.1,
        reasoning: `Strategy "${best.name}" has ${best.successCount} successes in domain ${best.domain}`,
      });
    }

    // trend-based recommendations
    const trend = this.analyzeTrend('fitness');
    if (trend.direction === 'declining') {
      recs.push({
        action: 'increase_mutation_rate',
        confidence: 0.7,
        expectedImprovement: 0.15,
        reasoning: 'Fitness declining — inject diversity via higher mutation',
      });
    }
    if (trend.direction === 'stagnating') {
      recs.push({
        action: 'island_migration',
        confidence: 0.65,
        expectedImprovement: 0.1,
        reasoning: 'Fitness stagnating — try island model with migration',
      });
    }

    // low diversity
    if (context.diversity < 0.3) {
      recs.push({
        action: 'novelty_search',
        confidence: 0.75,
        expectedImprovement: 0.2,
        reasoning: 'Low diversity — switch to novelty search temporarily',
      });
    }

    return recs;
  }

  analyzeTrend(metric: string): PerformanceTrend {
    const values = metric === 'fitness' ? [...this.fitnessHistory] : [];
    if (values.length < 3) {
      return { metric, values, direction: 'stable', rate: 0, earlyWarning: false };
    }

    const recent = values.slice(-10);
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const rate = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 0;

    let direction: TrendDirection;
    if (rate > 0.05) direction = 'improving';
    else if (rate < -0.05) direction = 'declining';
    else if (values.length > 10 && Math.abs(rate) < 0.01) direction = 'stagnating';
    else direction = 'stable';

    return {
      metric,
      values,
      direction,
      rate,
      earlyWarning: direction === 'declining' || direction === 'stagnating',
    };
  }

  metaReflect(): {
    totalReflections: number;
    avgQuality: number;
    strategiesUsed: number;
    anomaliesDetected: number;
    topStrategies: StrategyRecord[];
  } {
    const avgQuality = this.entries.length > 0
      ? this.entries.reduce((s, e) => s + e.qualityScore, 0) / this.entries.length
      : 0;
    const anomaliesDetected = this.entries.filter(e => e.anomalyDetected).length;
    const topStrategies = [...this.strategies.values()]
      .sort((a, b) => b.avgPerformance - a.avgPerformance)
      .slice(0, 5);

    return {
      totalReflections: this.entries.length,
      avgQuality,
      strategiesUsed: this.strategies.size,
      anomaliesDetected,
      topStrategies,
    };
  }

  getHistory(): readonly ReflectionEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
    this.strategies.clear();
    this.fitnessHistory = [];
  }

  private scoreAction(
    result: { success: boolean; data?: unknown },
    context: ReflectionContext,
  ): number {
    let score = 0.5;
    score += result.success ? 0.2 : -0.3;
    if (context.avgFitness > 0.7) score += 0.15;
    else if (context.avgFitness < 0.3) score -= 0.1;
    if (context.diversity > 0.5) score += 0.08;
    else if (context.diversity < 0.2) score -= 0.05;
    if (context.convergenceRate > 0.05) score += 0.05;
    return Math.max(0, Math.min(1, score));
  }

  private generateInsights(
    action: string,
    result: { success: boolean },
    context: ReflectionContext,
    anomaly: AnomalyResult,
  ): string[] {
    const insights: string[] = [];
    if (result.success) {
      insights.push(`Action "${action}" completed successfully`);
    } else {
      insights.push(`Action "${action}" failed — consider alternative approach`);
    }
    if (context.avgFitness > 0.8) {
      insights.push('Population is highly fit — consider increasing selection pressure');
    }
    if (context.diversity < 0.2) {
      insights.push('Low diversity — population may be converging prematurely');
    }
    if (anomaly.detected) {
      insights.push(`Anomaly: ${anomaly.description}`);
    }
    return insights;
  }

  private suggestNextAction(context: ReflectionContext, lastQuality: number): string {
    if (lastQuality < 0.3) return 'status';
    if (context.diversity < 0.2) return 'mutate';
    if (context.avgFitness < 0.5) return 'evolve';
    if (context.seedCount < 5) return 'create';
    return 'evolve';
  }

  private computePerformanceDelta(context: ReflectionContext): number {
    if (this.fitnessHistory.length === 0) return 0;
    const prev = this.fitnessHistory[this.fitnessHistory.length - 1] ?? 0;
    return context.avgFitness - prev;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Native Intelligence — seed analysis, comparison, planning (NO LLM)
// ═══════════════════════════════════════════════════════════════════

export interface MutationSuggestion {
  gene: string;
  reason: string;
  suggestedAction: 'increase' | 'decrease' | 'randomize' | 'diversify';
}

export interface SeedAnalysis {
  strengths: string[];
  weaknesses: string[];
  suggestions: MutationSuggestion[];
  overallAssessment: string;
}

export interface GeneDifference {
  gene: string;
  valueA: unknown;
  valueB: unknown;
  advantage: 'A' | 'B' | 'neutral';
}

export interface SeedComparison {
  differences: GeneDifference[];
  fitnessDelta: number;
  summary: string;
}

export interface PlannedAction {
  step: number;
  action: string;
  tool: string;
  params: Record<string, unknown>;
  expectedOutcome: string;
}

export class NativeIntelligence {
  analyzeSeed(seed: UniversalSeed): SeedAnalysis {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const suggestions: MutationSuggestion[] = [];

    const entries = Object.entries(seed.genes);
    for (const [name, gene] of entries) {
      const normalized = this.normalizeGene(gene);
      if (normalized > 0.75) {
        strengths.push(`${name} is highly developed (${(normalized * 100).toFixed(0)}%)`);
      } else if (normalized < 0.25) {
        weaknesses.push(`${name} is underdeveloped (${(normalized * 100).toFixed(0)}%)`);
        suggestions.push({
          gene: name,
          reason: `${name} is below 25% — needs improvement`,
          suggestedAction: 'increase',
        });
      } else if (normalized < 0.4) {
        weaknesses.push(`${name} is below average (${(normalized * 100).toFixed(0)}%)`);
        suggestions.push({
          gene: name,
          reason: `${name} is below 40% — could benefit from mutation`,
          suggestedAction: 'randomize',
        });
      }
    }

    if (entries.length < 3) {
      weaknesses.push('Seed has very few genes — limited complexity');
      suggestions.push({
        gene: '_structure',
        reason: 'Too few genes for meaningful evolution',
        suggestedAction: 'diversify',
      });
    }

    const fitness = seed.$fitness?.primary ?? 0;
    let overallAssessment: string;
    if (fitness > 0.9 && weaknesses.length === 0) overallAssessment = 'Exceptional — well-optimized seed';
    else if (fitness > 0.7) overallAssessment = 'Strong — performing well with minor gaps';
    else if (fitness > 0.4) overallAssessment = 'Moderate — has potential but needs evolution';
    else overallAssessment = 'Developing — significant room for improvement';

    return { strengths, weaknesses, suggestions, overallAssessment };
  }

  describeSeed(seed: UniversalSeed): string {
    const fitness = seed.$fitness?.primary ?? 0;
    const fitnessDesc = fitness > 0.9 ? 'exceptional'
      : fitness > 0.7 ? 'strong'
      : fitness > 0.4 ? 'moderate'
      : 'developing';

    const geneCount = Object.keys(seed.genes).length;
    const traits: string[] = [];
    for (const [name, gene] of Object.entries(seed.genes)) {
      const normalized = this.normalizeGene(gene);
      if (normalized > 0.7) traits.push(name);
    }

    const traitStr = traits.length > 0 ? ` Notable traits: ${traits.join(', ')}.` : '';
    const gen = seed.$lineage.generation;
    const lineageStr = gen > 0
      ? ` Generation ${gen} with ${seed.$lineage.parents.length} parent(s).`
      : ' First generation (origin seed).';

    return `${seed.$name} is a ${seed.$domain} seed with ${fitnessDesc} fitness (${(fitness * 100).toFixed(0)}%) and ${geneCount} genes.${traitStr}${lineageStr}`;
  }

  compareSeed(seedA: UniversalSeed, seedB: UniversalSeed): SeedComparison {
    const differences: GeneDifference[] = [];
    const allGenes = new Set([
      ...Object.keys(seedA.genes),
      ...Object.keys(seedB.genes),
    ]);

    for (const gene of allGenes) {
      const gA = seedA.genes[gene];
      const gB = seedB.genes[gene];
      if (!gA || !gB) {
        differences.push({
          gene,
          valueA: gA ? this.normalizeGene(gA) : undefined,
          valueB: gB ? this.normalizeGene(gB) : undefined,
          advantage: gA ? 'A' : 'B',
        });
        continue;
      }
      const nA = this.normalizeGene(gA);
      const nB = this.normalizeGene(gB);
      if (Math.abs(nA - nB) > 0.05) {
        differences.push({
          gene,
          valueA: nA,
          valueB: nB,
          advantage: nA > nB ? 'A' : nA < nB ? 'B' : 'neutral',
        });
      }
    }

    const fA = seedA.$fitness?.primary ?? 0;
    const fB = seedB.$fitness?.primary ?? 0;
    const fitnessDelta = fA - fB;
    const aAdvCount = differences.filter(d => d.advantage === 'A').length;
    const bAdvCount = differences.filter(d => d.advantage === 'B').length;

    const winner = fitnessDelta > 0.05 ? seedA.$name
      : fitnessDelta < -0.05 ? seedB.$name
      : 'neither (comparable)';

    return {
      differences: differences.slice(0, 20),
      fitnessDelta,
      summary: `${seedA.$name} vs ${seedB.$name}: ${differences.length} gene differences. ` +
        `${seedA.$name} leads in ${aAdvCount}, ${seedB.$name} in ${bAdvCount}. ` +
        `Overall advantage: ${winner}.`,
    };
  }

  planActions(goal: string, worldState: { seedCount: number; avgFitness: number }): PlannedAction[] {
    const actions: PlannedAction[] = [];
    const lower = goal.toLowerCase();

    if (lower.includes('warrior') || lower.includes('creature') || lower.includes('character')) {
      actions.push(
        { step: 1, action: 'Create base seed', tool: 'create_seed', params: { name: 'Base', domain: 'organism' }, expectedOutcome: 'Base seed with initial genes' },
        { step: 2, action: 'Create population', tool: 'create_seed', params: { count: 10 }, expectedOutcome: '10 seeds for evolution pool' },
        { step: 3, action: 'Run evolution', tool: 'evolve', params: { generations: 100 }, expectedOutcome: 'Optimized population via selection' },
        { step: 4, action: 'Export best', tool: 'export', params: { format: 'gseed' }, expectedOutcome: 'Best seed exported' },
      );
    } else if (lower.includes('diversity') || lower.includes('explore')) {
      actions.push(
        { step: 1, action: 'Heavy mutation pass', tool: 'mutate', params: { rate: 0.8 }, expectedOutcome: 'Diversified gene pool' },
        { step: 2, action: 'Novelty search', tool: 'evolve', params: { strategy: 'novelty' }, expectedOutcome: 'Diverse population maintained' },
      );
    } else if (lower.includes('optimize') || lower.includes('improve')) {
      actions.push(
        { step: 1, action: 'Check status', tool: 'status', params: {}, expectedOutcome: 'Current population metrics' },
        { step: 2, action: 'Evolve with tournament', tool: 'evolve', params: { generations: 200, strategy: 'tournament' }, expectedOutcome: 'Fitness improvement' },
        { step: 3, action: 'Verify improvement', tool: 'status', params: {}, expectedOutcome: 'Confirm fitness gain' },
      );
    } else {
      // default plan based on world state
      if (worldState.seedCount === 0) {
        actions.push(
          { step: 1, action: 'Create initial seed', tool: 'create_seed', params: { domain: 'organism' }, expectedOutcome: 'First seed created' },
        );
      } else if (worldState.seedCount < 5) {
        actions.push(
          { step: 1, action: 'Expand population', tool: 'create_seed', params: { count: 5 }, expectedOutcome: 'Population expanded' },
          { step: 2, action: 'Start evolution', tool: 'evolve', params: { generations: 50 }, expectedOutcome: 'Initial evolution run' },
        );
      } else {
        actions.push(
          { step: 1, action: 'Continue evolution', tool: 'evolve', params: { generations: 100 }, expectedOutcome: 'Further optimization' },
        );
      }
    }

    return actions;
  }

  private normalizeGene(gene: Gene): number {
    switch (gene.type) {
      case 'scalar': {
        const range = gene.max - gene.min;
        return range > 0 ? (gene.value - gene.min) / range : 0.5;
      }
      case 'categorical': {
        const idx = gene.options.indexOf(gene.value);
        return gene.options.length > 1 ? idx / (gene.options.length - 1) : 0.5;
      }
      case 'vector': {
        const mag = Math.sqrt(gene.value.reduce((s, v) => s + v * v, 0));
        return Math.min(mag / (gene.dimensions || 1), 1);
      }
      case 'expression':
        return gene.source.length > 0 ? 0.5 : 0;
      case 'struct':
        return Object.keys(gene.value).length > 0 ? 0.6 : 0;
      case 'array':
        return gene.value.length > 0
          ? Math.min(gene.value.length / (gene.maxLength ?? 10), 1)
          : 0;
      case 'graph':
        return gene.nodes.size > 0 ? 0.5 + Math.min(gene.edges.length / 10, 0.5) : 0;
      case 'tensor':
        return gene.data.length > 0 ? 0.5 : 0;
      case 'timeseries':
        return gene.keyframes.length > 0
          ? Math.min(gene.keyframes.length / 20, 1)
          : 0;
      default:
        return 0.5;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Tool System — registry, executor, chaining
// ═══════════════════════════════════════════════════════════════════

export type ToolCategory =
  | 'seed_management'
  | 'evolution'
  | 'simulation'
  | 'world_building'
  | 'content_generation'
  | 'analysis'
  | 'export'
  | 'agent'
  | 'knowledge'
  | 'security'
  | 'marketplace'
  | 'language'
  | 'internet';

export type ToolParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface ToolParameterDef {
  name: string;
  type: ToolParameterType;
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  min?: number;
  max?: number;
}

export interface ToolArtifact {
  type: string;
  name: string;
  content: string | Uint8Array;
  size: number;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
  artifacts?: ToolArtifact[];
  durationMs: number;
  cached?: boolean;
  error?: string;
}

export interface ToolSpec {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameterDef[];
  examples?: Array<{ input: Record<string, unknown>; description: string }>;
  requiresNetwork?: boolean;
  rateLimit?: { maxPerMinute: number };
  timeoutMs?: number;
}

export type ToolExecutor = (
  params: Record<string, unknown>,
) => Promise<ToolExecutionResult>;

export class ToolRegistry {
  private tools = new Map<string, { spec: ToolSpec; executor: ToolExecutor }>();

  register(spec: ToolSpec, executor: ToolExecutor): void {
    this.tools.set(spec.id, { spec, executor });
  }

  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  get(id: string): { spec: ToolSpec; executor: ToolExecutor } | undefined {
    return this.tools.get(id);
  }

  list(category?: ToolCategory): ToolSpec[] {
    const all = [...this.tools.values()].map(t => t.spec);
    return category ? all.filter(t => t.category === category) : all;
  }

  search(query: string): ToolSpec[] {
    const lower = query.toLowerCase();
    return this.list().filter(
      t =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower),
    );
  }

  async execute(id: string, params: Record<string, unknown>): Promise<ToolExecutionResult> {
    const entry = this.tools.get(id);
    if (!entry) {
      return { success: false, message: `Tool "${id}" not found`, durationMs: 0, error: 'not_found' };
    }

    // validate required params
    for (const p of entry.spec.parameters) {
      if (p.required && !(p.name in params)) {
        return {
          success: false,
          message: `Missing required parameter: ${p.name}`,
          durationMs: 0,
          error: 'validation',
        };
      }
    }

    const start = Date.now();
    try {
      const result = await entry.executor(params);
      return { ...result, durationMs: Date.now() - start };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        error: 'execution',
      };
    }
  }

  toLLMTools(): LLMToolDefinition[] {
    return this.list().map(spec => ({
      name: spec.id,
      description: spec.description,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          spec.parameters.map(p => [
            p.name,
            {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {}),
              ...(p.min !== undefined ? { minimum: p.min } : {}),
              ...(p.max !== undefined ? { maximum: p.max } : {}),
            },
          ]),
        ),
        required: spec.parameters.filter(p => p.required).map(p => p.name),
      },
    }));
  }

  get size(): number {
    return this.tools.size;
  }
}

export class ToolChain {
  private steps: Array<{ toolId: string; params: Record<string, unknown> | ((prev: ToolExecutionResult) => Record<string, unknown>) }> = [];

  add(
    toolId: string,
    params: Record<string, unknown> | ((prev: ToolExecutionResult) => Record<string, unknown>),
  ): this {
    this.steps.push({ toolId, params });
    return this;
  }

  async execute(registry: ToolRegistry): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    for (const step of this.steps) {
      const prev = results[results.length - 1];
      const params = typeof step.params === 'function'
        ? step.params(prev ?? { success: true, message: '', durationMs: 0 })
        : step.params;
      const result = await registry.execute(step.toolId, params);
      results.push(result);
      if (!result.success) break; // halt chain on failure
    }
    return results;
  }

  get length(): number {
    return this.steps.length;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Tool Bridge — connects LLM tool calls to the ToolRegistry
// ═══════════════════════════════════════════════════════════════════

export class ToolBridge {
  constructor(private readonly registry: ToolRegistry) {}

  async executeTool(call: LLMToolCall): Promise<string> {
    const result = await this.registry.execute(call.name, call.arguments);
    if (result.success) {
      return result.data
        ? JSON.stringify(result.data, null, 2)
        : result.message;
    }
    return `Error: ${result.message}`;
  }

  async runToolLoop(
    provider: LLMProvider,
    messages: LLMMessage[],
    maxIterations = 10,
  ): Promise<{ response: string; toolsUsed: string[] }> {
    const conversation = [...messages];
    const toolsUsed: string[] = [];
    const tools = this.registry.toLLMTools();

    for (let i = 0; i < maxIterations; i++) {
      const resp = await provider.chat(conversation, { tools });

      if (!resp.toolCalls?.length) {
        return { response: resp.content, toolsUsed };
      }

      conversation.push({
        role: 'assistant',
        content: resp.content,
        toolCalls: resp.toolCalls,
      });

      for (const call of resp.toolCalls) {
        toolsUsed.push(call.name);
        const result = await this.executeTool(call);
        conversation.push({
          role: 'tool',
          content: result,
          toolCallId: call.id,
        });
      }
    }

    return { response: 'Max tool iterations reached', toolsUsed };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Re-export intent-related types from @paradigm/types for convenience
// ═══════════════════════════════════════════════════════════════════

export type { IntentType, ParsedIntent, SeedDomain, UniversalSeed, Gene, GeneMap };
