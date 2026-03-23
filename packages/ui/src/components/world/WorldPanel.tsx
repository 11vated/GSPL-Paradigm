/**
 * WorldPanel — procedural world generation UI.
 * Input a seed string, generate a world with zones, NPCs, and narrative.
 */

import { useCallback } from 'react';
import { useWorldStore } from '../../stores/worldStore';
import { Panel } from '../common/Panel';

export function WorldPanel() {
  const seedString = useWorldStore((s) => s.seedString);
  const setSeedString = useWorldStore((s) => s.setSeedString);
  const worldData = useWorldStore((s) => s.worldData);
  const loading = useWorldStore((s) => s.loading);
  const error = useWorldStore((s) => s.error);
  const generateWorld = useWorldStore((s) => s.generateWorld);

  const handleGenerate = useCallback(() => {
    void generateWorld();
  }, [generateWorld]);

  const world = worldData as {
    narrative?: { worldName?: string; mysteryName?: string; acts?: string[]; clues?: Array<{ text: string; zoneIndex: number }> };
    biome?: string;
    zones?: Array<{ index: number; biome: string; difficulty: number; atmosphere: string }>;
    npcs?: Array<{ name: string; role: string; zoneIndex: number; greeting: string }>;
    fieldConfig?: { dominantField: string; intensity: number };
  } | null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        World Generator
      </h2>

      <Panel title="World Seed">
        <div className="flex gap-2">
          <input
            type="text"
            value={seedString}
            onChange={(e) => setSeedString(e.target.value)}
            placeholder="Enter a seed string (e.g., 'crystal-kingdom-42')"
            disabled={loading}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)] focus:outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || seedString.trim().length === 0}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dim)] disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate World'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['crystal-kingdom', 'shadow-realm', 'fire-wastes', 'ocean-depths', 'sky-citadel'].map((s) => (
            <button key={s} type="button" onClick={() => setSeedString(s)}
              className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >{s}</button>
          ))}
        </div>
      </Panel>

      {error && (
        <div className="rounded-md border border-red-800/50 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {world?.narrative && (
        <>
          <Panel title={world.narrative.worldName ?? 'Unknown World'} subtitle={world.narrative.mysteryName}>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-md bg-[var(--color-primary)] px-2 py-1 text-white">{world.biome}</span>
              {world.fieldConfig && (
                <span className="rounded-md bg-[var(--color-surface-raised)] px-2 py-1 text-[var(--color-text-muted)]">
                  {world.fieldConfig.dominantField} field ({(world.fieldConfig.intensity * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          </Panel>

          {world.zones && world.zones.length > 0 && (
            <Panel title={`Zones (${world.zones.length})`}>
              <div className="flex flex-col gap-2">
                {world.zones.map((zone) => (
                  <div key={zone.index} className="flex items-center justify-between rounded-md bg-[var(--color-bg)] px-3 py-2 text-xs">
                    <div>
                      <span className="font-medium text-[var(--color-text)]">Zone {zone.index + 1}</span>
                      <span className="ml-2 text-[var(--color-text-dim)]">{zone.atmosphere}</span>
                    </div>
                    <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                      difficulty {(zone.difficulty * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {world.npcs && world.npcs.length > 0 && (
            <Panel title={`NPCs (${world.npcs.length})`}>
              <div className="flex flex-col gap-2">
                {world.npcs.map((npc) => (
                  <div key={npc.name} className="rounded-md bg-[var(--color-bg)] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--color-text)]">{npc.name}</span>
                      <span className="rounded-full bg-[var(--color-violet-glow)] px-2 py-0.5 text-[10px] text-[var(--color-violet)]">{npc.role}</span>
                      <span className="text-[var(--color-text-dim)]">Zone {npc.zoneIndex + 1}</span>
                    </div>
                    <p className="mt-1 italic text-[var(--color-text-muted)]">"{npc.greeting}"</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {world.narrative.acts && (
            <Panel title="Story Structure">
              <div className="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
                {world.narrative.acts.map((act, i) => (
                  <div key={i}>{act}</div>
                ))}
              </div>
              {world.narrative.clues && world.narrative.clues.length > 0 && (
                <div className="mt-2 text-[10px] text-[var(--color-text-dim)]">
                  {world.narrative.clues.length} clues scattered across zones
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
