/**
 * Zustand store for forge/artifact state management.
 * Tracks artifact generation queue, results, and preview state.
 */

import { create } from 'zustand';
import * as api from '../services/api';
import type { ForgeRequest, ForgeResult } from '../services/api';

export interface ForgeState {
  /** All generated artifacts (most recent first). */
  artifacts: ForgeResult[];
  /** Currently previewed artifact. */
  currentArtifact: ForgeResult | null;
  /** Whether the forge is actively generating. */
  forging: boolean;
  /** Available artifact types (fetched from server). */
  availableTypes: string[];
  /** Last error. */
  error: string | null;
}

export interface ForgeActions {
  /** Generate an artifact from a seed. */
  forgeArtifact(request: ForgeRequest): Promise<ForgeResult | null>;
  /** Select an artifact for preview. */
  selectArtifact(artifact: ForgeResult | null): void;
  /** Clear all artifacts. */
  clearArtifacts(): void;
  /** Fetch available artifact types from server. */
  fetchTypes(): Promise<void>;
  /** Clear error. */
  clearError(): void;
}

export const useForgeStore = create<ForgeState & ForgeActions>((set) => ({
  artifacts: [],
  currentArtifact: null,
  forging: false,
  availableTypes: [],
  error: null,

  async forgeArtifact(request) {
    set({ forging: true, error: null });
    try {
      const artifact = await api.forgeArtifact(request);
      set((state) => ({
        artifacts: [artifact, ...state.artifacts],
        currentArtifact: artifact,
        forging: false,
      }));
      return artifact;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Forge failed',
        forging: false,
      });
      return null;
    }
  },

  selectArtifact(artifact) {
    set({ currentArtifact: artifact });
  },

  clearArtifacts() {
    set({ artifacts: [], currentArtifact: null });
  },

  async fetchTypes() {
    try {
      const types = await api.getForgeTypes();
      set({ availableTypes: types });
    } catch {
      // Non-critical — use empty array
    }
  },

  clearError() {
    set({ error: null });
  },
}));
