import { useState, useCallback } from 'react';
import * as api from '../services/api';

export interface EvolutionState {
  running: boolean;
  generation: number;
  totalGenerations: number;
  bestFitness: number;
  averageFitness: number;
  finalPopulation: number;
  error: string | null;
}

export function useEvolution() {
  const [state, setState] = useState<EvolutionState>({
    running: false,
    generation: 0,
    totalGenerations: 0,
    bestFitness: 0,
    averageFitness: 0,
    finalPopulation: 0,
    error: null,
  });

  const run = useCallback(async (config: api.EvolutionConfig) => {
    setState(prev => ({
      ...prev,
      running: true,
      error: null,
      totalGenerations: config.generations,
    }));
    try {
      const result = await api.runEvolution(config);
      setState(prev => ({
        ...prev,
        running: false,
        generation: result.generations,
        bestFitness: result.bestFitness,
        averageFitness: result.averageFitness,
        finalPopulation: result.finalPopulation,
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
      bestFitness: 0,
      averageFitness: 0,
      finalPopulation: 0,
      error: null,
    });
  }, []);

  return { ...state, run, reset };
}
