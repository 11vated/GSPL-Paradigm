/**
 * Claude (Anthropic) LLM provider implementation.
 *
 * Uses the Anthropic Messages API with full support for tool_use,
 * streaming via SSE, and structured error handling.
 *
 * @packageDocumentation
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMOptions,
  LLMResponse,
  LLMToolCall,
  LLMToolDefinition,
  LLMUsage,
} from '../index.js';

// ═══════════════════════════════════════════════════════════════════
// Anthropic API Types (request)
// ═══════════════════════════════════════════════════════════════════

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  stop_sequences?: string[];
  system?: string;
  tools?: AnthropicToolDef[];
  stream?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Anthropic API Types (response)
// ═══════════════════════════════════════════════════════════════════

interface AnthropicResponseUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null;
  usage: AnthropicResponseUsage;
}

// ═══════════════════════════════════════════════════════════════════
// SSE stream event types
// ═══════════════════════════════════════════════════════════════════

interface ContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string };
}

interface MessageStreamEvent {
  type: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

/** Configuration for the Claude provider. */
export interface ClaudeConfig {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Base URL for the API. Defaults to https://api.anthropic.com. */
  baseUrl?: string;
  /** Default model. Defaults to claude-sonnet-4-20250514. */
  model?: string;
  /** Default max tokens. Defaults to 4096. */
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MAX_TOKENS = 4096;
const ANTHROPIC_VERSION = '2023-06-01';

// ═══════════════════════════════════════════════════════════════════
// Provider Implementation
// ═══════════════════════════════════════════════════════════════════

/**
 * LLM provider for Anthropic's Claude models via the Messages API.
 *
 * Supports chat completions, tool use (function calling), and SSE streaming.
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: ClaudeConfig = {}) {
    const resolvedKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    if (!resolvedKey) {
      throw new Error(
        'ClaudeProvider: No API key provided. Pass apiKey in config or set ANTHROPIC_API_KEY environment variable.',
      );
    }
    this.apiKey = resolvedKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.model = config.model ?? DEFAULT_MODEL;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  // ─────────────────────────────────────────────────────────────────
  // chat()
  // ─────────────────────────────────────────────────────────────────

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const { systemPrompt, anthropicMessages } = this.mapMessages(messages);
    const body = this.buildRequestBody(systemPrompt, anthropicMessages, options, false);

    const resp = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `Claude API error ${resp.status}: ${errText}. ` +
        `Check your API key and model (${body.model}) availability.`,
      );
    }

    const data = (await resp.json()) as AnthropicResponse;
    return this.parseResponse(data);
  }

  // ─────────────────────────────────────────────────────────────────
  // stream()
  // ─────────────────────────────────────────────────────────────────

  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, undefined> {
    const { systemPrompt, anthropicMessages } = this.mapMessages(messages);
    const body = this.buildRequestBody(systemPrompt, anthropicMessages, options, true);

    const resp = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `Claude stream error ${resp.status}: ${errText}. ` +
        `Check your API key and model (${body.model}) availability.`,
      );
    }

    const reader = resp.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        if (!result.value) continue;

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const event = JSON.parse(payload) as MessageStreamEvent;
            if (event.type === 'content_block_delta') {
              const delta = event as unknown as ContentBlockDelta;
              if (delta.delta.type === 'text_delta') {
                yield delta.delta.text;
              }
            }
          } catch {
            // Partial SSE chunk — continue accumulating
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // isAvailable()
  // ─────────────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      // Send a minimal request to verify the key works
      const resp = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });
      // 200 = success, 401 = bad key, anything else = service issue
      return resp.ok;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────

  /** Build standard request headers for the Anthropic API. */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  /**
   * Map LLMMessage[] to Anthropic format.
   * System messages are extracted and concatenated into a single system prompt.
   * Tool result messages become tool_result content blocks on the preceding user turn.
   */
  private mapMessages(messages: LLMMessage[]): {
    systemPrompt: string | undefined;
    anthropicMessages: AnthropicMessage[];
  } {
    const systemParts: string[] = [];
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
        continue;
      }

      if (msg.role === 'tool') {
        // Tool results must be sent as user messages with tool_result content blocks
        const toolResultBlock: AnthropicToolResultBlock = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId ?? '',
          content: msg.content,
        };
        anthropicMessages.push({ role: 'user', content: [toolResultBlock] });
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        // Assistant message with tool calls becomes content blocks
        const blocks: AnthropicContentBlock[] = [];
        if (msg.content) {
          blocks.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        anthropicMessages.push({ role: 'assistant', content: blocks });
        continue;
      }

      const role = msg.role === 'user' ? 'user' : 'assistant';
      anthropicMessages.push({ role, content: msg.content });
    }

    return {
      systemPrompt: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      anthropicMessages,
    };
  }

  /** Build the JSON request body for the Anthropic Messages API. */
  private buildRequestBody(
    systemPrompt: string | undefined,
    messages: AnthropicMessage[],
    options: LLMOptions | undefined,
    stream: boolean,
  ): AnthropicRequestBody {
    const body: AnthropicRequestBody = {
      model: options?.model ?? this.model,
      messages,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      stream,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options?.stop?.length) {
      body.stop_sequences = options.stop;
    }
    if (systemPrompt) {
      body.system = systemPrompt;
    }
    if (options?.tools?.length) {
      body.tools = options.tools.map(t => this.mapToolDefinition(t));
    }

    return body;
  }

  /** Map an LLMToolDefinition to Anthropic's tool format. */
  private mapToolDefinition(tool: LLMToolDefinition): AnthropicToolDef {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as unknown as Record<string, unknown>,
    };
  }

  /** Parse an Anthropic response into the standard LLMResponse format. */
  private parseResponse(data: AnthropicResponse): LLMResponse {
    let textContent = '';
    const toolCalls: LLMToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        textContent += (block as AnthropicTextBlock).text;
      } else if (block.type === 'tool_use') {
        const toolBlock = block as AnthropicToolUseBlock;
        toolCalls.push({
          id: toolBlock.id,
          name: toolBlock.name,
          arguments: toolBlock.input,
        });
      }
    }

    const usage: LLMUsage = {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    };

    let finishReason: LLMResponse['finishReason'];
    switch (data.stop_reason) {
      case 'tool_use':
        finishReason = 'tool_use';
        break;
      case 'max_tokens':
        finishReason = 'length';
        break;
      case 'end_turn':
      case 'stop_sequence':
        finishReason = 'stop';
        break;
      default:
        finishReason = 'stop';
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason,
      model: data.model,
    };
  }
}
