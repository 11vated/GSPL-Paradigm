import type { UniversalSeed } from '@paradigm/types';
import { SeedCard } from '../seed/SeedCard';

interface GardenViewProps {
  seeds: UniversalSeed[];
  selectedSeed: UniversalSeed | null;
  onSeedSelect: (seed: UniversalSeed) => void;
}

export function GardenView({ seeds, selectedSeed, onSeedSelect }: GardenViewProps) {
  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Your Garden
      </h2>

      {seeds.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-600">
          <span className="text-4xl">&#127793;</span>
          <p className="text-sm">Plant your first seed</p>
          <p className="text-xs text-zinc-700">
            Switch to the Seed view to create one
          </p>
        </div>
      )}

      {seeds.length > 0 && (
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {seeds.map((seed) => (
            <SeedCard
              key={seed.$hash}
              seed={seed}
              isSelected={selectedSeed?.$hash === seed.$hash}
              onClick={() => onSeedSelect(seed)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
