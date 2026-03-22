import { useState, Suspense } from 'react';
import type { UniversalSeed } from '@paradigm/types';
import { SeedCard } from '../seed/SeedCard';
import { GardenScene } from '../three/GardenScene';

interface GardenViewProps {
  seeds: UniversalSeed[];
  selectedSeed: UniversalSeed | null;
  onSeedSelect: (seed: UniversalSeed) => void;
}

type ViewMode = '3d' | 'grid';

export function GardenView({ seeds, selectedSeed, onSeedSelect }: GardenViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('3d');

  return (
    <div className="flex h-full flex-col">
      {/* View mode toggle */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Your Garden
          {seeds.length > 0 && (
            <span className="ml-2 text-zinc-600">({seeds.length} seeds)</span>
          )}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('3d')}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              viewMode === '3d'
                ? 'bg-green-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            3D Garden
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              viewMode === 'grid'
                ? 'bg-green-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Grid
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === '3d' ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-zinc-500">
                Loading 3D Garden...
              </div>
            }
          >
            <GardenScene
              seeds={seeds}
              selectedSeed={selectedSeed}
              onSeedSelect={onSeedSelect}
            />
          </Suspense>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {seeds.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                <span className="text-4xl">&#127793;</span>
                <p className="text-sm">Plant your first seed</p>
                <p className="text-xs text-zinc-700">
                  Switch to the Seed view to create one
                </p>
              </div>
            ) : (
              <div className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        )}
      </div>
    </div>
  );
}
