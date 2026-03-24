import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { SeedCreator } from './components/seed/SeedCreator';
import { SeedInspector } from './components/seed/SeedInspector';
import { EvolutionPanel } from './components/evolution/EvolutionPanel';
import { ForgePanel } from './components/forge/ForgePanel';
import { ChatPanel } from './components/agent/ChatPanel';
import { GardenView } from './components/garden/GardenView';
import { ConceptPanel } from './components/concept/ConceptPanel';
import { WorldPanel } from './components/world/WorldPanel';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { StatusBar } from './components/common/StatusBar';
import { ToastContainer } from './components/common/Toast';
import { sseClient } from './services/sse';
import { useSeedStore } from './stores/seedStore';
import { useEvolutionStore } from './stores/evolutionStore';
import { useUiStore } from './stores/uiStore';

export type { ViewId } from './stores/uiStore';

export function App() {
  const activeView = useUiStore((s) => s.activeView);
  const connected = useUiStore((s) => s.connected);
  const setConnected = useUiStore((s) => s.setConnected);
  const selectedSeed = useSeedStore((s) => s.selectedSeed);
  const fetchSeeds = useSeedStore((s) => s.fetchSeeds);

  // Load initial seeds from backend on mount
  useEffect(() => {
    fetchSeeds();
  }, [fetchSeeds]);

  // Connect to SSE for real-time updates
  useEffect(() => {
    sseClient.connect();

    const unsubConnect = sseClient.on('connected', () => {
      setConnected(true);
    });

    // Refresh seeds on any seed-related event
    const seedEvents = ['seed.created', 'seed.mutated', 'seed.bred', 'seed.died', 'world.changed'];
    const unsubs = seedEvents.map((eventType) =>
      sseClient.on(eventType, () => {
        useSeedStore.getState().fetchSeeds();
      }),
    );

    // Wire evolution tick events to evolution store
    const unsubEvolution = sseClient.on('evolution.tick', (event) => {
      const data = event.data as Record<string, unknown>;
      useEvolutionStore.getState().recordGeneration({
        generation: (data['generation'] as number) ?? 0,
        bestFitness: (data['bestFitness'] as number) ?? 0,
        avgFitness: (data['avgFitness'] as number) ?? 0,
        worstFitness: 0,
        populationSize: (data['populationSize'] as number) ?? 0,
        diversity: (data['diversity'] as number) ?? 0,
        timestamp: Date.now(),
      });
    });

    return () => {
      unsubConnect();
      unsubs.forEach((u) => u());
      unsubEvolution();
      sseClient.disconnect();
      setConnected(false);
    };
  }, [setConnected]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K: Command palette (future)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        useUiStore.getState().toggleCommandPalette();
      }
      // Ctrl+Z: Undo (future)
      // Number keys for view switching (without modifiers, not in inputs)
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        const viewMap: Record<string, typeof activeView> = { '1': 'garden', '2': 'seed', '3': 'evolution', '4': 'forge', '5': 'chat', '6': 'entity', '7': 'world' };
        const view = viewMap[e.key];
        if (view) {
          e.preventDefault();
          useUiStore.getState().setView(view);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <AppShell sidebar={<Sidebar />}>
        <ErrorBoundary>
          {activeView === 'garden' && <GardenView />}
          {activeView === 'seed' && (
            <div className="flex h-full gap-4 p-4">
              <div className="w-1/2">
                <ErrorBoundary>
                  <SeedCreator />
                </ErrorBoundary>
              </div>
              <div className="w-1/2">
                <ErrorBoundary>
                  {selectedSeed ? (
                    <SeedInspector seed={selectedSeed} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                      Select or create a seed to inspect
                    </div>
                  )}
                </ErrorBoundary>
              </div>
            </div>
          )}
          {activeView === 'evolution' && <EvolutionPanel />}
          {activeView === 'forge' && <ForgePanel seed={selectedSeed} />}
          {activeView === 'chat' && <ChatPanel />}
          {activeView === 'entity' && <ConceptPanel />}
          {activeView === 'world' && <WorldPanel />}
        </ErrorBoundary>
      </AppShell>
      <StatusBar />
      <ToastContainer />
    </>
  );
}
