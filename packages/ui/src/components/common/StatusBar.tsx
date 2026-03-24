import { useSeedStore } from '../../stores/seedStore';
import { useEvolutionStore } from '../../stores/evolutionStore';
import { useUiStore } from '../../stores/uiStore';

export function StatusBar() {
  const seedCount = useSeedStore((s) => s.seeds.length);
  const connected = useUiStore((s) => s.connected);
  const evoRunning = useEvolutionStore((s) => s.running);
  const evoGeneration = useEvolutionStore((s) => s.generation);

  return (
    <div className="flex h-6 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[10px] text-[var(--color-text-muted)]">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          {connected ? 'Connected' : 'Offline'}
        </span>
        <span>{seedCount} seed{seedCount !== 1 ? 's' : ''}</span>
        {evoRunning && (
          <span className="flex items-center gap-1 text-[var(--color-cyan)]">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            Evolving gen {evoGeneration}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>GSPL Paradigm v1.0</span>
        <kbd className="rounded bg-[var(--color-surface-raised)] px-1 py-0.5 text-[9px]">1-5</kbd>
        <span>views</span>
        <kbd className="rounded bg-[var(--color-surface-raised)] px-1 py-0.5 text-[9px]">Ctrl+K</kbd>
        <span>commands</span>
      </div>
    </div>
  );
}
