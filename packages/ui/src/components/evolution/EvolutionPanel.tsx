import { useCallback } from 'react';
import type { SelectionStrategy } from '@paradigm/types';
import { useSeedStore } from '../../stores/seedStore';
import { useEvolutionStore } from '../../stores/evolutionStore';
import { Panel } from '../common/Panel';
import { FitnessChart } from './FitnessChart';
import { DiversityChart } from './DiversityChart';

const SELECTION_STRATEGIES: SelectionStrategy[] = ['tournament', 'roulette', 'rank', 'truncation'];

export function EvolutionPanel() {
  const seeds = useSeedStore((s) => s.seeds);
  const fetchSeeds = useSeedStore((s) => s.fetchSeeds);

  const config = useEvolutionStore((s) => s.config);
  const updateConfig = useEvolutionStore((s) => s.updateConfig);
  const isRunning = useEvolutionStore((s) => s.running);
  const error = useEvolutionStore((s) => s.error);
  const history = useEvolutionStore((s) => s.history);
  const currentGen = useEvolutionStore((s) => s.generation);
  const startEvolution = useEvolutionStore((s) => s.startEvolution);

  const handleStart = useCallback(async () => {
    if (seeds.length === 0) return;
    await startEvolution();
    await fetchSeeds();
  }, [seeds.length, startEvolution, fetchSeeds]);

  const latestSnapshot = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Evolution Engine
      </h2>

      {/* Config */}
      <Panel title="Configuration">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px] text-[var(--color-text-muted)]">Generations</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={config.generations}
              onChange={(e) => updateConfig({ generations: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              disabled={isRunning}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] text-[var(--color-text-muted)]">Population Size</span>
            <input
              type="number"
              min={2}
              max={10000}
              value={config.populationSize}
              onChange={(e) => updateConfig({ populationSize: Math.max(2, parseInt(e.target.value, 10) || 2) })}
              disabled={isRunning}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] text-[var(--color-text-muted)]">
              Mutation Rate: <span className="font-mono text-[var(--color-primary)]">{config.mutationRate.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={config.mutationRate}
              onChange={(e) => updateConfig({ mutationRate: parseFloat(e.target.value) })}
              disabled={isRunning}
              className="w-full accent-[var(--color-primary)]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] text-[var(--color-text-muted)]">Selection Strategy</span>
            <select
              value={config.selectionStrategy}
              onChange={(e) => updateConfig({ selectionStrategy: e.target.value as SelectionStrategy })}
              disabled={isRunning}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
            >
              {SELECTION_STRATEGIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      {/* Start Button */}
      <button
        type="button"
        onClick={() => void handleStart()}
        disabled={isRunning || seeds.length === 0}
        className="rounded-md bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[var(--color-primary-dim)] disabled:cursor-not-allowed disabled:opacity-50"
        style={isRunning ? { boxShadow: '0 0 20px var(--color-primary-glow)' } : undefined}
      >
        {isRunning
          ? `Evolving... Generation ${currentGen}/${config.generations}`
          : seeds.length === 0
            ? 'Create seeds first'
            : 'Start Evolution'}
      </button>

      {/* Error */}
      {error !== null && (
        <div className="rounded-md border border-red-800/50 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Stats cards */}
      {latestSnapshot !== null && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <span className="block text-[10px] text-[var(--color-text-muted)]">Best Fitness</span>
            <span className="font-mono text-lg font-semibold text-[var(--color-primary)]">
              {latestSnapshot.bestFitness.toFixed(4)}
            </span>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <span className="block text-[10px] text-[var(--color-text-muted)]">Avg Fitness</span>
            <span className="font-mono text-lg font-semibold text-[var(--color-text-secondary)]">
              {latestSnapshot.avgFitness.toFixed(4)}
            </span>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <span className="block text-[10px] text-[var(--color-text-muted)]">Population</span>
            <span className="font-mono text-lg font-semibold text-[var(--color-text-secondary)]">
              {latestSnapshot.populationSize}
            </span>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <span className="block text-[10px] text-[var(--color-text-muted)]">Diversity</span>
            <span className="font-mono text-lg font-semibold text-[var(--color-cyan)]">
              {(latestSnapshot.diversity * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Fitness Chart */}
      <Panel title="Fitness Over Generations" subtitle="Green = best, gray = average, dashed = worst">
        <FitnessChart data={history} height={220} />
      </Panel>

      {/* Diversity Chart */}
      {history.length >= 2 && (
        <Panel title="Population Diversity">
          <DiversityChart data={history} height={130} />
        </Panel>
      )}
    </div>
  );
}
