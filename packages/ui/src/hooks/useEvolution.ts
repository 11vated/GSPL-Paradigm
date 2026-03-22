import { useState, useCallback } from 'react';
import * as api from '../services/api';
import type { UniversalSeed } from '@paradigm/types';

export interface EvolutionState {
  running: boolean;
  generation: number;
  totalGenerations: number;
  stats: Array<{ generation: number; bestFitness: number; avgFitness: number }>;
  best: UniversalSeed | null;
  error: string | null;
}

export function useEvolution() {
  const [state, setState] = useState<EvolutionState>({
    running: false,
    generation: 0,
    totalGenerations: 0,
    stats: [],
    best: null,
    error: null,
  });

  const run = useCallback(async (config: api.EvolutionConfig) => {
    setState(prev => ({
      ...prev,
      running: true,
      error: null,
      stats: [],
      totalGenerations: config.generations,
    }));
    try {
      const result = await api.runEvolution(config);
      setState(prev => ({
        ...prev,
        running: false,
        generation: config.generations,
        stats: result.stats,
        best: result.best,
      }));
      return result;
    } catch (err) {
      setState(prev => ({
        ...prev,
        running: false,
        error: err instanceof Error ? err.message : 'Evolution failed',
      }));
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      running: false,
      generation: 0,
      totalGenerations: 0,
      stats: [],
      best: null,
      error: null,
    });
  }, []);

  return { ...state, run, reset };
}
