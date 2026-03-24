/**
 * Google Gemini LLM provider implementation.
 *
 * Uses the Google Generative AI REST API with support for function calling,
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
// Gemini API Types (request)
// ═══════════════════════════════════════════════════════════════════

interface GeminiTextPart {
  text: string;
}

interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
}

interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart;

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GeminiTool {
  functionDeclarations: GeminiToolDeclaration[];
}

interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: GeminiGenerationConfig;
  tools?: GeminiTool[];
}

// ═══════════════════════════════════════════════════════════════════
// Gemini API Types (response)
// ═══════════════════════════════════════════════════════════════════

interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: string;
  };
  finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

// ═══════════════════════════════════════════════════════════════════
// SSE stream types
// ═══════════════════════════════════════════════════════════════════

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

/** Configuration for the Gemini provider. */
export interface GeminiConfig {
  /** Google AI API key. Falls back to GEMINI_API_KEY env var. */
  apiKey?: string;
  /** Base URL for the API. Defaults to https://generativelanguage.googleapis.com/v1beta. */
  baseUrl?: string;
  /** Default model. Defaults to gemini-2.0-flash. */
  model?: string;
  /** Default max output tokens. Defaults to 4096. */
  maxTokens?: number;
}

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MAX_TOKENS = 4096;

// ═══════════════════════════════════════════════════════════════════
// Provider Implementation
// ═══════════════════════════════════════════════════════════════════

/**
 * LLM provider for Google's Gemini models via the Generative AI REST API.
 *
 * Supports chat completions, function calling (tools), and SSE streaming.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: GeminiConfig = {}) {
    const resolvedKey = config.apiKey ?? process.env['GEMINI_API_KEY'] ?? '';
    if (!resolvedKey) {
      throw new Error(
        'GeminiProvider: No API key provided. Pass apiKey in config or set GEMINI_API_KEY environment variable.',
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
    const modelId = options?.model ?? this.model;
    const body = this.buildRequestBody(messages, options);
    const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `Gemini API error ${resp.status}: ${errText}. ` +
        `Check your API key and model (${modelId}) availability.`,
      );
    }

    const data = (await resp.json()) as GeminiResponse;
    return this.parseResponse(data, modelId);
  }

  // ─────────────────────────────────────────────────────────────────
  // stream()
  // ─────────────────────────────────────────────────────────────────

  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, undefined> {
    const modelId = options?.model ?? this.model;
    const body = this.buildRequestBody(messages, options);
    const url =
      `${this.baseUrl}/models/${modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `Gemini stream error ${resp.status}: ${errText}. ` +
        `Check your API key and model (${modelId}) availability.`,
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
          if (!payload) continue;

          try {
            const chunk = JSON.parse(payload) as GeminiStreamChunk;
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
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
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const resp = await fetch(url, {
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

  /**
   * Map LLMMessage[] to Gemini's contents format.
   * System messages are extracted into a separate systemInstruction.
   * Tool result messages become functionResponse parts.
   */
  private mapMessages(messages: LLMMessage[]): {
    systemInstruction: GeminiContent | undefined;
    contents: GeminiContent[];
  } {
    const systemParts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
        continue;
      }

      if (msg.role === 'tool') {
        // Tool results become user messages with functionResponse parts
        const functionName = msg.toolCallId ?? 'unknown';
        let responseData: Record<string, unknown>;
        try {
          responseData = JSON.parse(msg.content) as Record<string, unknown>;
        } catch {
          responseData = { result: msg.content };
        }
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: functionName,
              response: responseData,
            },
          }],
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        // Assistant with tool calls becomes model message with functionCall parts
        const parts: GeminiPart[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          });
        }
        contents.push({ role: 'model', parts });
        continue;
      }

      const role: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model';
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    const systemInstruction: GeminiContent | undefined =
      systemParts.length > 0
        ? { role: 'user', parts: [{ text: systemParts.join('\n\n') }] }
        : undefined;

    return { systemInstruction, contents };
  }

  /** Map LLMToolDefinition[] to Gemini's tool format. */
  private mapToolDefinitions(tools: LLMToolDefinition[]): GeminiTool[] {
    return [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as Record<string, unknown>,
      })),
    }];
  }

  /** Build the JSON request body for the Gemini API. */
  private buildRequestBody(
    messages: LLMMessage[],
    options: LLMOptions | undefined,
  ): GeminiRequestBody {
    const { systemInstruction, contents } = this.mapMessages(messages);

    const body: GeminiRequestBody = { contents };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const generationConfig: GeminiGenerationConfig = {};
    let hasGenerationConfig = false;

    if (options?.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
      hasGenerationConfig = true;
    }
    if (options?.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = options.maxTokens;
      hasGenerationConfig = true;
    } else {
      generationConfig.maxOutputTokens = this.maxTokens;
      hasGenerationConfig = true;
    }
    if (options?.stop?.length) {
      generationConfig.stopSequences = options.stop;
      hasGenerationConfig = true;
    }

    if (hasGenerationConfig) {
      body.generationConfig = generationConfig;
    }

    if (options?.tools?.length) {
      body.tools = this.mapToolDefinitions(options.tools);
    }

    return body;
  }

  /** Parse a Gemini response into the standard LLMResponse format. */
  private parseResponse(data: GeminiResponse, modelId: string): LLMResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      return {
        content: '',
        finishReason: 'error',
        model: modelId,
      };
    }

    let textContent = '';
    const toolCalls: LLMToolCall[] = [];
    let toolCallIndex = 0;

    for (const part of candidate.content.parts) {
      if ('text' in part) {
        textContent += (part as GeminiTextPart).text;
      } else if ('functionCall' in part) {
        const fc = (part as GeminiFunctionCallPart).functionCall;
        toolCalls.push({
          id: `gemini-tc-${toolCallIndex++}`,
          name: fc.name,
          arguments: fc.args,
        });
      }
    }

    const usage: LLMUsage | undefined = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined;

    let finishReason: LLMResponse['finishReason'];
    if (toolCalls.length > 0) {
      finishReason = 'tool_use';
    } else {
      switch (candidate.finishReason) {
        case 'MAX_TOKENS':
          finishReason = 'length';
          break;
        case 'STOP':
          finishReason = 'stop';
          break;
        case 'SAFETY':
        case 'RECITATION':
        case 'OTHER':
          finishReason = 'error';
          break;
        default:
          finishReason = 'stop';
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason,
      model: modelId,
    };
  }
}
