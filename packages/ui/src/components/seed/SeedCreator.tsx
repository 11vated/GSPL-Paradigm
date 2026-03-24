import { useState, useCallback } from 'react';
import type { SeedDomain } from '@paradigm/types';
import { useSeedStore } from '../../stores/seedStore';

const DOMAINS: SeedDomain[] = [
  'organism', 'vehicle', 'weapon', 'building', 'terrain',
  'material', 'plant', 'insect', 'fish', 'bird',
  'mammal', 'robot', 'particle', 'fluid', 'crystal',
  'sound', 'music', 'pattern', 'network', 'language',
  'code', 'strategy', 'game', 'narrative', 'ecosystem',
];

export function SeedCreator() {
  const createSeed = useSeedStore((s) => s.createSeed);
  const storeLoading = useSeedStore((s) => s.loading);
  const storeError = useSeedStore((s) => s.error);

  const [name, setName] = useState('');
  const [domain, setDomain] = useState<SeedDomain>('organism');
  const [localError, setLocalError] = useState<string | null>(null);

  const isLoading = storeLoading;
  const error = localError ?? storeError;

  const handleCreate = useCallback(async () => {
    if (name.trim().length === 0) {
      setLocalError('Seed name is required.');
      return;
    }

    setLocalError(null);
    const result = await createSeed({ name: name.trim(), domain });
    if (result) {
      setName('');
    }
  }, [name, domain, createSeed]);

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
