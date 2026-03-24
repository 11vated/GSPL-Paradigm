import { useState, useCallback } from 'react';
import * as api from '../services/api';
import type { UniversalSeed } from '@paradigm/types';

export function useSeed() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (name: string, domain: string) => {
    setLoading(true);
    setError(null);
    try {
      const seed = await api.createSeed({ name, domain });
      return seed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create seed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const mutate = useCallback(async (hash: string, intensity: number) => {
    setLoading(true);
    setError(null);
    try {
      return await api.mutateSeed(hash, intensity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mutate');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const breed = useCallback(async (hashA: string, hashB: string) => {
    setLoading(true);
    setError(null);
    try {
      return await api.breedSeeds(hashA, hashB);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to breed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, mutate, breed, loading, error };
}
