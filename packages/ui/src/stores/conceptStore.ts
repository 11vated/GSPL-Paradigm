/**
 * Zustand store for entity concept state management.
 * Handles entity creation, evolution (mutation/breeding), and Sprite Forge generation.
 */

import { create } from 'zustand';
import type { ISCAResult, ConceptModel, EntityBlueprint, StyleType, UniversalSeed } from '@paradigm/types';
import * as api from '../services/api';

export type GenerationStatus = 'idle' | 'generating' | 'validating' | 'complete' | 'error';

export interface ConceptState {
  input: string;
  isca: ISCAResult | null;
  concept: ConceptModel | null;
  blueprint: EntityBlueprint | null;
  loading: boolean;
  error: string | null;
  canonicalEnabled: boolean;
  styleOverride: StyleType | null;
  // Evolution state
  mutationIntensity: number;
  evolutionHistory: UniversalSeed[];
  // Sprite Forge generation
  generationStatus: GenerationStatus;
  generationProgress: string;
  spriteResult: Record<string, unknown> | null;
}

export interface ConceptActions {
  setInput(input: string): void;
  setStyleOverride(style: StyleType | null): void;
  setCanonicalEnabled(enabled: boolean): void;
  setMutationIntensity(intensity: number): void;
  createEntity(): Promise<void>;
  mutateEntity(): Promise<void>;
  generateSprite(): Promise<void>;
  coCreate(message: string): Promise<void>;
  clearError(): void;
  reset(): void;
}

export const useConceptStore = create<ConceptState & ConceptActions>((set, get) => ({
  input: '',
  isca: null,
  concept: null,
  blueprint: null,
  loading: false,
  error: null,
  canonicalEnabled: true,
  styleOverride: null,
  mutationIntensity: 0.2,
  evolutionHistory: [],
  generationStatus: 'idle',
  generationProgress: '',
  spriteResult: null,

  setInput(input) { set({ input }); },
  setStyleOverride(style) { set({ styleOverride: style }); },
  setCanonicalEnabled(enabled) { set({ canonicalEnabled: enabled }); },
  setMutationIntensity(intensity) { set({ mutationIntensity: intensity }); },

  async createEntity() {
    const { input } = get();
    if (input.trim().length === 0) return;

    set({ loading: true, error: null });

    try {
      const response = await api.chatWithAgent(`create entity: ${input}`);

      if (response.success && response.data) {
        const data = response.data as { blueprint?: EntityBlueprint };
        if (data.blueprint) {
          set({
            blueprint: data.blueprint,
            concept: data.blueprint.concept,
            isca: data.blueprint.concept.isca,
            loading: false,
            evolutionHistory: [data.blueprint.seed],
          });
          return;
        }
      }

      set({ loading: false, error: response.reply || 'Entity creation returned no blueprint' });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create entity', loading: false });
    }
  },

  async mutateEntity() {
    const { blueprint, mutationIntensity } = get();
    if (!blueprint) return;

    set({ loading: true, error: null });

    try {
      const response = await api.mutateSeed(blueprint.seed.$hash, mutationIntensity);

      if (response) {
        // Re-interpret the mutated seed as a concept entity
        const conceptResponse = await api.chatWithAgent(`create entity: ${response.$name}`);

        if (conceptResponse.success && conceptResponse.data) {
          const data = conceptResponse.data as { blueprint?: EntityBlueprint };
          if (data.blueprint) {
            set((state) => ({
              blueprint: data.blueprint!,
              concept: data.blueprint!.concept,
              isca: data.blueprint!.concept.isca,
              loading: false,
              evolutionHistory: [...state.evolutionHistory, data.blueprint!.seed],
            }));
            return;
          }
        }

        // Fallback: just update the seed in the existing blueprint
        set((state) => ({
          blueprint: state.blueprint ? { ...state.blueprint, seed: response } : null,
          loading: false,
          evolutionHistory: [...state.evolutionHistory, response],
        }));
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Mutation failed', loading: false });
    }
  },

  async generateSprite() {
    const { concept } = get();
    if (!concept) return;

    set({ generationStatus: 'generating', generationProgress: 'Sending to Sprite Forge...', error: null });

    try {
      const res = await fetch('/api/entity/generate-sprite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
        throw new Error(err.message ?? `Server error ${res.status}`);
      }

      const data = await res.json() as { result: Record<string, unknown> };

      set({
        generationStatus: 'complete',
        generationProgress: 'Complete',
        spriteResult: data.result,
      });
    } catch (err) {
      set({
        generationStatus: 'error',
        error: err instanceof Error ? err.message : 'Sprite generation failed',
        generationProgress: '',
      });
    }
  },

  async coCreate(message) {
    const { blueprint } = get();
    if (!blueprint) return;
    set({ loading: true, error: null });
    try {
      const response = await api.chatWithAgent(`co_create: ${blueprint.seed.$hash} ${message}`);
      if (response.success) {
        // Refresh entity to pick up modified seed
        await get().createEntity();
      } else {
        set({ loading: false, error: response.reply || 'Co-creation failed' });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Co-creation failed', loading: false });
    }
  },

  clearError() { set({ error: null }); },

  reset() {
    set({
      input: '', isca: null, concept: null, blueprint: null,
      loading: false, error: null, evolutionHistory: [],
      generationStatus: 'idle', generationProgress: '', spriteResult: null,
    });
  },
}));
