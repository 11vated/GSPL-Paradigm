import { useState, useCallback } from 'react';
import type { UniversalSeed, SeedDomain } from '@paradigm/types';

const DOMAINS: SeedDomain[] = [
  'organism', 'vehicle', 'weapon', 'building', 'terrain',
  'material', 'plant', 'insect', 'fish', 'bird',
  'mammal', 'robot', 'particle', 'fluid', 'crystal',
  'sound', 'music', 'pattern', 'network', 'language',
  'code', 'strategy', 'game', 'narrative', 'ecosystem',
];

interface SeedCreatorProps {
  onSeedCreated: (seed: UniversalSeed) => void;
}

interface CreateSeedError {
  message: string;
}

export function SeedCreator({ onSeedCreated }: SeedCreatorProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState<SeedDomain>('organism');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (name.trim().length === 0) {
      setError('Seed name is required.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), domain, genes: {} }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as CreateSeedError | null;
        throw new Error(
          body?.message ?? `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const seed = (await response.json()) as UniversalSeed;
      onSeedCreated(seed);
      setName('');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create seed. Is the API server running?';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [name, domain, onSeedCreated]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Create Seed
      </h2>

      {/* Name Input */}
      <label className="mb-3 block">
        <span className="mb-1 block text-xs text-zinc-500">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fire Dragon"
          disabled={isLoading}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleCreate();
            }
          }}
        />
      </label>

      {/* Domain Dropdown */}
      <label className="mb-4 block">
        <span className="mb-1 block text-xs text-zinc-500">Domain</span>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as SeedDomain)}
          disabled={isLoading}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
        >
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {/* Error Message */}
      {error !== null && (
        <div className="mb-3 rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Create Button */}
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={isLoading || name.trim().length === 0}
        className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? 'Creating...' : 'Create Seed'}
      </button>
    </div>
  );
}
