import { useState, useCallback, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { SeedCreator } from './components/seed/SeedCreator';
import { SeedInspector } from './components/seed/SeedInspector';
import { EvolutionPanel } from './components/evolution/EvolutionPanel';
import { ForgePanel } from './components/forge/ForgePanel';
import { ChatPanel } from './components/agent/ChatPanel';
import { GardenView } from './components/garden/GardenView';
import { sseClient } from './services/sse';
import * as api from './services/api';
import type { UniversalSeed } from '@paradigm/types';

export type ViewId = 'garden' | 'seed' | 'evolution' | 'forge' | 'chat';

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('garden');
  const [seeds, setSeeds] = useState<UniversalSeed[]>([]);
  const [selectedSeed, setSelectedSeed] = useState<UniversalSeed | null>(null);
  const [connected, setConnected] = useState(false);

  // Load initial seeds from backend on mount
  useEffect(() => {
    api.listSeeds()
      .then(setSeeds)
      .catch(() => { /* Backend not running — app still works offline */ });
  }, []);

  // Connect to SSE for real-time updates
  useEffect(() => {
    sseClient.connect();

    const unsubConnect = sseClient.on('connected', () => {
      setConnected(true);
    });

    // Refresh seeds on any seed-related event
    const seedEvents = ['seed.created', 'seed.mutated', 'seed.bred', 'seed.died', 'world.changed'];
    const unsubs = seedEvents.map(eventType =>
      sseClient.on(eventType, () => {
        api.listSeeds().then(setSeeds).catch(() => {});
      })
    );

    return () => {
      unsubConnect();
      unsubs.forEach(u => u());
      sseClient.disconnect();
      setConnected(false);
    };
  }, []);

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
      {/* Connection indicator */}
      <div className={`absolute right-4 top-2 z-50 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
        connected ? 'bg-green-900/30 text-green-400' : 'bg-zinc-800 text-zinc-500'
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-zinc-600'}`} />
        {connected ? 'Live' : 'Offline'}
      </div>

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
