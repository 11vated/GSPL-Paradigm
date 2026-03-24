import { useState, useCallback } from 'react';
import * as api from '../services/api';

export function useForge() {
  const [artifact, setArtifact] = useState<api.ForgeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forge = useCallback(async (seedHash: string, type: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.forgeArtifact({ seedHash, type });
      setArtifact(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forge failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setArtifact(null);
    setError(null);
  }, []);

  return { artifact, forge, clear, loading, error };
}
