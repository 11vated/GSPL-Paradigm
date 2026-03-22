import { useState, useCallback } from 'react';
import type { UniversalSeed, SelectionStrategy } from '@paradigm/types';

interface EvolutionPanelProps {
  seeds: UniversalSeed[];
  onSeedsUpdate: (seeds: UniversalSeed[]) => void;
}

interface EvolutionConfig {
  generations: number;
  populationSize: number;
  mutationRate: number;
  selectionStrategy: SelectionStrategy;
}

interface GenerationRecord {
  generation: number;
  bestFitness: number;
  avgFitness: number;
}

interface EvolutionApiError {
  message?: string;
}

const SELECTION_STRATEGIES: SelectionStrategy[] = [
  'tournament',
  'roulette',
  'rank',
  'truncation',
];

function FitnessSparkline({ data }: { data: GenerationRecord[] }) {
  if (data.length < 2) return null;

  const width = 300;
  const height = 80;
  const padding = 4;

  const maxFitness = Math.max(...data.map((d) => d.bestFitness), 0.001);
  const minFitness = Math.min(...data.map((d) => d.avgFitness), 0);
  const range = maxFitness - minFitness || 1;

  const toX = (i: number) =>
    padding + (i / (data.length - 1)) * (width - 2 * padding);
  const toY = (v: number) =>
    height - padding - ((v - minFitness) / range) * (height - 2 * padding);

  const bestLine = data.map((d, i) => `${toX(i)},${toY(d.bestFitness)}`).join(' ');
  const avgLine = data.map((d, i) => `${toX(i)},${toY(d.avgFitness)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full rounded-md border border-zinc-800 bg-zinc-900"
      preserveAspectRatio="none"
    >
      <polyline
        points={avgLine}
        fill="none"
        stroke="#71717a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points={bestLine}
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EvolutionPanel({ seeds, onSeedsUpdate }: EvolutionPanelProps) {
  const [config, setConfig] = useState<EvolutionConfig>({
    generations: 50,
    populationSize: 20,
    mutationRate: 0.1,
    selectionStrategy: 'tournament',
  });
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [currentGen, setCurrentGen] = useState(0);

  const handleStart = useCallback(async () => {
    if (seeds.length === 0) {
      setError('Add at least one seed before evolving.');
      return;
    }

    setIsRunning(true);
    setError(null);
    setHistory([]);
    setCurrentGen(0);

    try {
      const response = await fetch('/api/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generations: config.generations,
          populationSize: config.populationSize,
          mutationRate: config.mutationRate,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as EvolutionApiError | null;
        throw new Error(
          body?.message ?? `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const result = (await response.json()) as {
        generations: GenerationRecord[];
        finalPopulation: UniversalSeed[];
        bestFitness: number;
        averageFitness: number;
      };

      setHistory(result.generations);
      setCurrentGen(result.generations.length);
      onSeedsUpdate(result.finalPopulation);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Evolution failed. Is the API server running?';
      setError(message);
    } finally {
      setIsRunning(false);
    }
  }, [seeds, config, onSeedsUpdate]);

  const latestRecord = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Evolution Engine
      </h2>

      {/* Config */}
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Generations</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={config.generations}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                generations: Math.max(1, parseInt(e.target.value, 10) || 1),
              }))
            }
            disabled={isRunning}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Population Size</span>
          <input
            type="number"
            min={2}
            max={1000}
            value={config.populationSize}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                populationSize: Math.max(2, parseInt(e.target.value, 10) || 2),
              }))
            }
            disabled={isRunning}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">
            Mutation Rate: {config.mutationRate.toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={config.mutationRate}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                mutationRate: parseFloat(e.target.value),
              }))
            }
            disabled={isRunning}
            className="w-full accent-green-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Selection Strategy</span>
          <select
            value={config.selectionStrategy}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                selectionStrategy: e.target.value as SelectionStrategy,
              }))
            }
            disabled={isRunning}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
          >
            {SELECTION_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Start Button */}
      <button
        type="button"
        onClick={() => void handleStart()}
        disabled={isRunning || seeds.length === 0}
        className="mb-4 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? `Evolving... (Gen ${currentGen}/${config.generations})` : 'Start Evolution'}
      </button>

      {/* Error */}
      {error !== null && (
        <div className="mb-4 rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Progress */}
      {latestRecord !== null && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
            <span className="block text-xs text-zinc-500">Best Fitness</span>
            <span className="text-lg font-semibold text-green-400">
              {latestRecord.bestFitness.toFixed(4)}
            </span>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
            <span className="block text-xs text-zinc-500">Avg Fitness</span>
            <span className="text-lg font-semibold text-zinc-300">
              {latestRecord.avgFitness.toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Sparkline */}
      {history.length >= 2 && (
        <div>
          <span className="mb-1 block text-xs text-zinc-500">
            Fitness over generations (green = best, gray = avg)
          </span>
          <FitnessSparkline data={history} />
        </div>
      )}
    </div>
  );
}
