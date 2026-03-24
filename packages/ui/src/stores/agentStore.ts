/**
 * Zustand store for agent/chat state management.
 * Tracks chat history, thinking state, tool execution log, and autonomy mode.
 */

import { create } from 'zustand';
import * as api from '../services/api';
import type { AgentResponse } from '../services/api';

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: number;
  readonly toolsUsed?: string[];
  readonly intent?: string;
}

export interface ToolLogEntry {
  readonly toolName: string;
  readonly params: Record<string, unknown>;
  readonly result: unknown;
  readonly timestamp: number;
  readonly durationMs: number;
}

export type AutonomyMode = 'supervised' | 'copilot' | 'autonomous';

export interface AgentState {
  /** Chat message history. */
  messages: ChatMessage[];
  /** Whether the agent is currently thinking/processing. */
  thinking: boolean;
  /** Tool execution log. */
  toolLog: ToolLogEntry[];
  /** Current autonomy mode. */
  autonomyMode: AutonomyMode;
  /** Last error. */
  error: string | null;
}

export interface AgentActions {
  /** Send a message to the agent and receive a response. */
  sendMessage(content: string): Promise<AgentResponse | null>;
  /** Set the autonomy mode. */
  setAutonomyMode(mode: AutonomyMode): void;
  /** Clear chat history. */
  clearMessages(): void;
  /** Clear tool log. */
  clearToolLog(): void;
  /** Clear error. */
  clearError(): void;
}

let messageCounter = 0;

function nextId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export const useAgentStore = create<AgentState & AgentActions>((set) => ({
  messages: [],
  thinking: false,
  toolLog: [],
  autonomyMode: 'copilot',
  error: null,

  async sendMessage(content) {
    const userMessage: ChatMessage = {
      id: nextId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      thinking: true,
      error: null,
    }));

    try {
      const response = await api.chatWithAgent(content);

      const assistantMessage: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now(),
        toolsUsed: response.toolsUsed,
        intent: response.intent,
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        thinking: false,
      }));

      return response;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Agent communication failed',
        thinking: false,
      });
      return null;
    }
  },

  setAutonomyMode(mode) {
    set({ autonomyMode: mode });
  },

  clearMessages() {
    set({ messages: [] });
  },

  clearToolLog() {
    set({ toolLog: [] });
  },

  clearError() {
    set({ error: null });
  },
}));
