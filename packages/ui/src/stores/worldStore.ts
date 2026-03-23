/**
 * Zustand store for procedural world state.
 */

import { create } from 'zustand';
import * as api from '../services/api';

export interface WorldState {
  seedString: string;
  worldData: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}

export interface WorldActions {
  setSeedString(seed: string): void;
  generateWorld(): Promise<void>;
  clearError(): void;
}

export const useWorldStore = create<WorldState & WorldActions>((set, get) => ({
  seedString: '',
  worldData: null,
  loading: false,
  error: null,

  setSeedString(seed) { set({ seedString: seed }); },

  async generateWorld() {
    const { seedString } = get();
    if (seedString.trim().length === 0) return;
    set({ loading: true, error: null });
    try {
      const response = await api.chatWithAgent(`create world: ${seedString}`);
      if (response.success && response.data) {
        set({ worldData: response.data as Record<string, unknown>, loading: false });
      } else {
        set({ error: response.reply || 'World generation failed', loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed', loading: false });
    }
  },

  clearError() { set({ error: null }); },
}));
