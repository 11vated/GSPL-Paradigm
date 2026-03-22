/**
 * OpenAI LLM provider implementation.
 *
 * Uses the OpenAI Chat Completions API with full support for function calling,
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
// OpenAI API Types (request)
// ═══════════════════════════════════════════════════════════════════

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCallRequest[];
  tool_call_id?: string;
}

interface OpenAIToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIRequestBody {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  tools?: OpenAIToolDef[];
  stream?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// OpenAI API Types (response)
// ═══════════════════════════════════════════════════════════════════

interface OpenAIChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: OpenAIToolCallRequest[];
  };
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
}

interface OpenAIResponseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  id: string;
  choices: OpenAIChoice[];
  model: string;
  usage?: OpenAIResponseUsage;
}

// ═══════════════════════════════════════════════════════════════════
// SSE stream types
// ═══════════════════════════════════════════════════════════════════

interface OpenAIStreamChoice {
  delta: {
    role?: string;
    content?: string | null;
    tool_calls?: Array<{
      index: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason: string | null;
}

interface OpenAIStreamChunk {
  choices?: OpenAIStreamChoice[];
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

/** Configuration for the OpenAI provider. */
export interface OpenAIConfig {
  /** OpenAI API key. Falls back to OPENAI_API_KEY env var. */
  apiKey?: string;
  /** Base URL for the API. Defaults to https://api.openai.com/v1. */
  baseUrl?: string;
  /** Default model. Defaults to gpt-4o. */
  model?: string;
  /** Default max tokens. Defaults to 4096. */
  maxTokens?: number;
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MAX_TOKENS = 4096;

// ═══════════════════════════════════════════════════════════════════
// Provider Implementation
// ═══════════════════════════════════════════════════════════════════

/**
 * LLM provider for OpenAI's Chat Completions API.
 *
 * Supports chat completions, function calling (tools), and SSE streaming.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: OpenAIConfig = {}) {
    const resolvedKey = config.apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    if (!resolvedKey) {
      throw new Error(
        'OpenAIProvider: No API key provided. Pass apiKey in config or set OPENAI_API_KEY environment variable.',
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
    const body = this.buildRequestBody(messages, options, false);

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `OpenAI API error ${resp.status}: ${errText}. ` +
        `Check your API key and model (${body.model}) availability.`,
      );
    }

    const data = (await resp.json()) as OpenAIResponse;
    return this.parseResponse(data);
  }

  // ─────────────────────────────────────────────────────────────────
  // stream()
  // ─────────────────────────────────────────────────────────────────

  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, undefined> {
    const body = this.buildRequestBody(messages, options, true);

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `OpenAI stream error ${resp.status}: ${errText}. ` +
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
          if (payload === '[DONE]') return;
          if (!payload) continue;

          try {
            const chunk = JSON.parse(payload) as OpenAIStreamChunk;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield delta;
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
      const resp = await fetch(`${this.baseUrl}/models`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────

  /** Build standard request headers for the OpenAI API. */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /** Map LLMMessage[] to the OpenAI message format. */
  private mapMessages(messages: LLMMessage[]): OpenAIMessage[] {
    return messages.map(msg => {
      const mapped: OpenAIMessage = {
        role: msg.role,
        content: msg.content,
      };

      // Tool call results reference the originating tool_call_id
      if (msg.role === 'tool' && msg.toolCallId) {
        mapped.tool_call_id = msg.toolCallId;
      }

      // Assistant messages may include tool calls
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        mapped.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      return mapped;
    });
  }

  /** Map LLMToolDefinition to OpenAI's function tool format. */
  private mapToolDefinitions(tools: LLMToolDefinition[]): OpenAIToolDef[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as Record<string, unknown>,
      },
    }));
  }

  /** Build the JSON request body for the Chat Completions API. */
  private buildRequestBody(
    messages: LLMMessage[],
    options: LLMOptions | undefined,
    stream: boolean,
  ): OpenAIRequestBody {
    const body: OpenAIRequestBody = {
      model: options?.model ?? this.model,
      messages: this.mapMessages(messages),
      max_tokens: options?.maxTokens ?? this.maxTokens,
      stream,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options?.stop?.length) {
      body.stop = options.stop;
    }
    if (options?.tools?.length) {
      body.tools = this.mapToolDefinitions(options.tools);
    }

    return body;
  }

  /** Parse an OpenAI response into the standard LLMResponse format. */
  private parseResponse(data: OpenAIResponse): LLMResponse {
    const choice = data.choices[0];
    if (!choice) {
      return {
        content: '',
        finishReason: 'error',
        model: data.model,
      };
    }

    const content = choice.message.content ?? '';
    const toolCalls: LLMToolCall[] = [];

    if (choice.message.tool_calls?.length) {
      for (const tc of choice.message.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          parsedArgs = { _raw: tc.function.arguments };
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    const usage: LLMUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;

    let finishReason: LLMResponse['finishReason'];
    switch (choice.finish_reason) {
      case 'tool_calls':
        finishReason = 'tool_use';
        break;
      case 'length':
        finishReason = 'length';
        break;
      case 'stop':
        finishReason = 'stop';
        break;
      default:
        finishReason = toolCalls.length > 0 ? 'tool_use' : 'stop';
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason,
      model: data.model,
    };
  }
}
