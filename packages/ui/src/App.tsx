import { useState, useCallback } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { SeedCreator } from './components/seed/SeedCreator';
import { SeedInspector } from './components/seed/SeedInspector';
import { EvolutionPanel } from './components/evolution/EvolutionPanel';
import { ForgePanel } from './components/forge/ForgePanel';
import { ChatPanel } from './components/agent/ChatPanel';
import { GardenView } from './components/garden/GardenView';
import type { UniversalSeed } from '@paradigm/types';

export type ViewId = 'garden' | 'seed' | 'evolution' | 'forge' | 'chat';

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('garden');
  const [seeds, setSeeds] = useState<UniversalSeed[]>([]);
  const [selectedSeed, setSelectedSeed] = useState<UniversalSeed | null>(null);

  const handleSeedCreated = useCallback((seed: UniversalSeed) => {
    setSeeds(prev => [...prev, seed]);
    setSelectedSeed(seed);
  }, []);

  const handleSeedSelect = useCallback((seed: UniversalSeed) => {
    setSelectedSeed(seed);
  }, []);

  return (
    <AppShell
      sidebar={
        <Sidebar
          seeds={seeds}
          selectedSeed={selectedSeed}
          activeView={activeView}
          onViewChange={setActiveView}
          onSeedSelect={handleSeedSelect}
        />
      }
    >
      {activeView === 'garden' && (
        <GardenView
          seeds={seeds}
          selectedSeed={selectedSeed}
          onSeedSelect={handleSeedSelect}
        />
      )}
      {activeView === 'seed' && (
        <div className="flex h-full gap-4 p-4">
          <div className="w-1/2">
            <SeedCreator onSeedCreated={handleSeedCreated} />
          </div>
          <div className="w-1/2">
            {selectedSeed ? (
              <SeedInspector seed={selectedSeed} />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-500">
                Select or create a seed to inspect
              </div>
            )}
          </div>
        </div>
      )}
      {activeView === 'evolution' && (
        <EvolutionPanel seeds={seeds} onSeedsUpdate={setSeeds} />
      )}
      {activeView === 'forge' && (
        <ForgePanel seed={selectedSeed} />
      )}
      {activeView === 'chat' && (
        <ChatPanel />
      )}
    </AppShell>
  );
}
