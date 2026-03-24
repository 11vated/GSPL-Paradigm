/**
 * Provider configuration, auto-detection, and factory.
 *
 * Centralizes environment variable resolution and provider instantiation
 * for all supported LLM providers.
 *
 * @packageDocumentation
 */

import type { LLMProvider } from '../index.js';
import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';

// ═══════════════════════════════════════════════════════════════════
// Configuration Types
// ═══════════════════════════════════════════════════════════════════

/** Configuration for an LLM provider. */
export interface ProviderConfig {
  /** API key for authentication. */
  apiKey: string;
  /** Base URL override for the provider's API. */
  baseUrl?: string;
  /** Model identifier to use. */
  model?: string;
  /** Maximum tokens for completions. */
  maxTokens?: number;
  /** Default temperature for generation. */
  temperature?: number;
}

// ═══════════════════════════════════════════════════════════════════
// Environment Variable Mapping
// ═══════════════════════════════════════════════════════════════════

interface ProviderEnvMapping {
  apiKeyVar: string;
  baseUrlVar?: string;
  modelVar?: string;
  defaultBaseUrl?: string;
  defaultModel: string;
}

const PROVIDER_ENV_MAP: Record<string, ProviderEnvMapping> = {
  claude: {
    apiKeyVar: 'ANTHROPIC_API_KEY',
    baseUrlVar: 'ANTHROPIC_BASE_URL',
    modelVar: 'ANTHROPIC_MODEL',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  openai: {
    apiKeyVar: 'OPENAI_API_KEY',
    baseUrlVar: 'OPENAI_BASE_URL',
    modelVar: 'OPENAI_MODEL',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  gemini: {
    apiKeyVar: 'GEMINI_API_KEY',
    baseUrlVar: 'GEMINI_BASE_URL',
    modelVar: 'GEMINI_MODEL',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
  },
  ollama: {
    apiKeyVar: 'OLLAMA_HOST',
    baseUrlVar: 'OLLAMA_HOST',
    modelVar: 'OLLAMA_MODEL',
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
  },
};

/** Known provider names for type safety in detection. */
const KNOWN_PROVIDERS = ['claude', 'openai', 'gemini', 'ollama'] as const;
type KnownProvider = typeof KNOWN_PROVIDERS[number];

// ═══════════════════════════════════════════════════════════════════
// Configuration Resolution
// ═══════════════════════════════════════════════════════════════════

/**
 * Resolve provider configuration from environment variables.
 *
 * Reads the appropriate env vars for the given provider name and returns
 * a ProviderConfig. Returns a config with an empty apiKey if the env var
 * is not set (check before using).
 *
 * @param name - Provider name: 'claude', 'openai', 'gemini', or 'ollama'
 * @returns Resolved ProviderConfig from environment
 */
export function getProviderConfig(name: string): ProviderConfig {
  const mapping = PROVIDER_ENV_MAP[name.toLowerCase()];
  if (!mapping) {
    throw new Error(
      `Unknown provider "${name}". Supported providers: ${Object.keys(PROVIDER_ENV_MAP).join(', ')}.`,
    );
  }

  const apiKey = process.env[mapping.apiKeyVar] ?? '';
  const baseUrl = mapping.baseUrlVar
    ? process.env[mapping.baseUrlVar] ?? mapping.defaultBaseUrl
    : mapping.defaultBaseUrl;
  const model = mapping.modelVar
    ? process.env[mapping.modelVar] ?? mapping.defaultModel
    : mapping.defaultModel;

  return {
    apiKey,
    baseUrl,
    model,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Provider Auto-Detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect which LLM providers are available based on environment variables.
 *
 * Checks for the presence of:
 * - ANTHROPIC_API_KEY (claude)
 * - OPENAI_API_KEY (openai)
 * - GEMINI_API_KEY (gemini)
 * - OLLAMA_HOST (ollama)
 *
 * @returns Array of available provider names
 */
export function detectAvailableProviders(): string[] {
  const available: string[] = [];

  const checks: Array<{ name: KnownProvider; envVar: string }> = [
    { name: 'claude', envVar: 'ANTHROPIC_API_KEY' },
    { name: 'openai', envVar: 'OPENAI_API_KEY' },
    { name: 'gemini', envVar: 'GEMINI_API_KEY' },
    { name: 'ollama', envVar: 'OLLAMA_HOST' },
  ];

  for (const check of checks) {
    const value = process.env[check.envVar];
    if (value && value.trim().length > 0) {
      available.push(check.name);
    }
  }

  return available;
}

// ═══════════════════════════════════════════════════════════════════
// Provider Factory
// ═══════════════════════════════════════════════════════════════════

/**
 * Create an LLM provider instance by name.
 *
 * Resolves configuration from environment variables, merges with any
 * explicit overrides, and instantiates the appropriate provider class.
 *
 * @param name - Provider name: 'claude', 'openai', or 'gemini'
 * @param config - Optional configuration overrides
 * @returns Instantiated LLMProvider
 * @throws Error if provider name is unknown or required config is missing
 *
 * @example
 * ```typescript
 * // Auto-detect from env vars
 * const provider = createProvider('claude');
 *
 * // Explicit configuration
 * const provider = createProvider('openai', { model: 'gpt-4o-mini' });
 * ```
 */
export function createProvider(
  name: string,
  config?: Partial<ProviderConfig>,
): LLMProvider {
  const envConfig = getProviderConfig(name);
  const merged: ProviderConfig = {
    apiKey: config?.apiKey ?? envConfig.apiKey,
    baseUrl: config?.baseUrl ?? envConfig.baseUrl,
    model: config?.model ?? envConfig.model,
    maxTokens: config?.maxTokens,
    temperature: config?.temperature,
  };

  const normalized = name.toLowerCase();

  switch (normalized) {
    case 'claude':
    case 'anthropic':
      return new ClaudeProvider({
        apiKey: merged.apiKey,
        baseUrl: merged.baseUrl,
        model: merged.model,
        maxTokens: merged.maxTokens,
      });

    case 'openai':
      return new OpenAIProvider({
        apiKey: merged.apiKey,
        baseUrl: merged.baseUrl,
        model: merged.model,
        maxTokens: merged.maxTokens,
      });

    case 'gemini':
    case 'google':
      return new GeminiProvider({
        apiKey: merged.apiKey,
        baseUrl: merged.baseUrl,
        model: merged.model,
        maxTokens: merged.maxTokens,
      });

    default:
      throw new Error(
        `Cannot create provider "${name}". Supported: claude, openai, gemini. ` +
        `For Ollama, use OllamaProvider directly from the main package.`,
      );
  }
}
