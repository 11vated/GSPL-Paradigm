import { useState, Suspense } from 'react';
import { SeedCard } from '../seed/SeedCard';
import { GardenScene } from '../three/GardenScene';
import { useSeedStore } from '../../stores/seedStore';

type ViewMode = '3d' | 'grid';

export function GardenView() {
  const seeds = useSeedStore((s) => s.seeds);
  const selectedSeed = useSeedStore((s) => s.selectedSeed);
  const selectSeed = useSeedStore((s) => s.selectSeed);
  const [viewMode, setViewMode] = useState<ViewMode>('3d');

  return (
    <div className="flex h-full flex-col">
      {/* View mode toggle */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Garden
          {seeds.length > 0 && (
            <span className="ml-2 text-[var(--color-text-dim)]">({seeds.length} seeds)</span>
          )}
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMode('3d')}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              viewMode === '3d'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            3D
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
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
              <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                Loading 3D Garden...
              </div>
            }
          >
            <GardenScene />
          </Suspense>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {seeds.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-dim)]">
                <span className="text-4xl opacity-40">&#127793;</span>
                <p className="text-sm">Plant your first seed</p>
                <p className="text-xs">Switch to the Seed view to create one</p>
              </div>
            ) : (
              <div className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {seeds.map((seed) => (
                  <SeedCard
                    key={seed.$hash}
                    seed={seed}
                    isSelected={selectedSeed?.$hash === seed.$hash}
                    onClick={() => selectSeed(seed)}
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
