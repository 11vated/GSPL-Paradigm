/**
 * Zustand store for evolution state management.
 * Tracks evolution configuration, run state, and generation history.
 */

import { create } from 'zustand';
import type { EvolutionConfig, SelectionStrategy, CrossoverStrategy } from '@paradigm/types';
import * as api from '../services/api';

export interface GenerationSnapshot {
  readonly generation: number;
  readonly bestFitness: number;
  readonly avgFitness: number;
  readonly worstFitness: number;
  readonly populationSize: number;
  readonly diversity: number;
  readonly timestamp: number;
}

export interface EvolutionState {
  /** Current evolution configuration. */
  config: EvolutionConfig;
  /** Whether evolution is currently running. */
  running: boolean;
  /** Current generation number (0 if not started). */
  generation: number;
  /** History of generation snapshots for charting. */
  history: GenerationSnapshot[];
  /** Loading indicator. */
  loading: boolean;
  /** Last error message. */
  error: string | null;
}

export interface EvolutionActions {
  /** Update configuration fields. */
  updateConfig(partial: Partial<EvolutionConfig>): void;
  /** Start an evolution run with current config. */
  startEvolution(): Promise<void>;
  /** Pause evolution. */
  pauseEvolution(): void;
  /** Record a generation snapshot (from SSE/WebSocket). */
  recordGeneration(snapshot: GenerationSnapshot): void;
  /** Reset evolution state. */
  reset(): void;
  /** Clear error. */
  clearError(): void;
}

const DEFAULT_CONFIG: EvolutionConfig = {
  populationSize: 20,
  generations: 50,
  mutationRate: 0.1,
  crossoverRate: 0.7,
  elitismCount: 2,
  selectionStrategy: 'tournament' as SelectionStrategy,
  crossoverStrategy: 'uniform' as CrossoverStrategy,
  tournamentSize: 3,
};

export const useEvolutionStore = create<EvolutionState & EvolutionActions>((set, get) => ({
  config: { ...DEFAULT_CONFIG },
  running: false,
  generation: 0,
  history: [],
  loading: false,
  error: null,

  updateConfig(partial) {
    set((state) => ({
      config: { ...state.config, ...partial },
    }));
  },

  async startEvolution() {
    const { config } = get();
    set({ running: true, loading: true, error: null, history: [], generation: 0 });
    try {
      await api.runEvolution({
        generations: config.generations,
        populationSize: config.populationSize,
        mutationRate: config.mutationRate,
      });
      set({ running: false, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Evolution failed',
        running: false,
        loading: false,
      });
    }
  },

  pauseEvolution() {
    set({ running: false });
  },

  recordGeneration(snapshot) {
    set((state) => ({
      generation: snapshot.generation,
      history: [...state.history, snapshot],
    }));
  },

  reset() {
    set({
      config: { ...DEFAULT_CONFIG },
      running: false,
      generation: 0,
      history: [],
      loading: false,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },
}));
