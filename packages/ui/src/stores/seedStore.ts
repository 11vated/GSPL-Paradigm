/**
 * Zustand store for seed state management.
 * Replaces useState/prop-drilling for seed CRUD and selection.
 */

import { create } from 'zustand';
import type { UniversalSeed } from '@paradigm/types';
import * as api from '../services/api';

export interface SeedState {
  /** All seeds in the current world. */
  seeds: UniversalSeed[];
  /** Currently selected seed for inspection/forging. */
  selectedSeed: UniversalSeed | null;
  /** Loading indicator for async operations. */
  loading: boolean;
  /** Last error message, null if no error. */
  error: string | null;
}

export interface SeedActions {
  /** Fetch all seeds from backend. */
  fetchSeeds(): Promise<void>;
  /** Create a new seed. */
  createSeed(params: { name: string; domain: string; genes?: Record<string, unknown> }): Promise<UniversalSeed | null>;
  /** Select a seed for inspection. */
  selectSeed(seed: UniversalSeed | null): void;
  /** Select a seed by hash. */
  selectSeedByHash(hash: string): void;
  /** Delete a seed by hash. */
  deleteSeed(hash: string): Promise<void>;
  /** Mutate a seed. */
  mutateSeed(hash: string, intensity: number): Promise<UniversalSeed | null>;
  /** Breed two seeds. */
  breedSeeds(hashA: string, hashB: string): Promise<UniversalSeed | null>;
  /** Replace the entire seeds array (for SSE updates). */
  setSeeds(seeds: UniversalSeed[]): void;
  /** Clear error state. */
  clearError(): void;
}

export const useSeedStore = create<SeedState & SeedActions>((set, get) => ({
  seeds: [],
  selectedSeed: null,
  loading: false,
  error: null,

  async fetchSeeds() {
    set({ loading: true, error: null });
    try {
      const seeds = await api.listSeeds();
      set({ seeds, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch seeds', loading: false });
    }
  },

  async createSeed(params) {
    set({ loading: true, error: null });
    try {
      const seed = await api.createSeed(params);
      set((state) => ({
        seeds: [...state.seeds, seed],
        selectedSeed: seed,
        loading: false,
      }));
      return seed;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create seed', loading: false });
      return null;
    }
  },

  selectSeed(seed) {
    set({ selectedSeed: seed });
  },

  selectSeedByHash(hash) {
    const seed = get().seeds.find((s) => s.$hash === hash) ?? null;
    set({ selectedSeed: seed });
  },

  async deleteSeed(hash) {
    set({ loading: true, error: null });
    try {
      await api.deleteSeed(hash);
      set((state) => ({
        seeds: state.seeds.filter((s) => s.$hash !== hash),
        selectedSeed: state.selectedSeed?.$hash === hash ? null : state.selectedSeed,
        loading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete seed', loading: false });
    }
  },

  async mutateSeed(hash, intensity) {
    set({ loading: true, error: null });
    try {
      const mutated = await api.mutateSeed(hash, intensity);
      set((state) => ({
        seeds: [...state.seeds, mutated],
        selectedSeed: mutated,
        loading: false,
      }));
      return mutated;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to mutate seed', loading: false });
      return null;
    }
  },

  async breedSeeds(hashA, hashB) {
    set({ loading: true, error: null });
    try {
      const child = await api.breedSeeds(hashA, hashB);
      set((state) => ({
        seeds: [...state.seeds, child],
        selectedSeed: child,
        loading: false,
      }));
      return child;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to breed seeds', loading: false });
      return null;
    }
  },

  setSeeds(seeds) {
    set({ seeds });
  },

  clearError() {
    set({ error: null });
  },
}));
