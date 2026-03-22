import type { Gene } from '@paradigm/types';

interface GeneEditorProps {
  name: string;
  gene: Gene;
}

function ScalarDisplay({ gene }: { gene: Extract<Gene, { type: 'scalar' }> }) {
  const range = gene.max - gene.min;
  const ratio = range > 0 ? (gene.value - gene.min) / range : 0;
  const percentage = Math.round(ratio * 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{gene.min}</span>
        <span className="font-mono text-zinc-200">{gene.value}</span>
        <span className="text-zinc-400">{gene.max}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-700">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function CategoricalDisplay({ gene }: { gene: Extract<Gene, { type: 'categorical' }> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {gene.options.map((option) => (
        <span
          key={option}
          className={`rounded-full px-2 py-0.5 text-xs ${
            option === gene.value
              ? 'bg-green-600/30 text-green-400 ring-1 ring-green-500/50'
              : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {option}
        </span>
      ))}
    </div>
  );
}

function VectorDisplay({ gene }: { gene: Extract<Gene, { type: 'vector' }> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {gene.value.map((v, i) => (
        <span
          key={i}
          className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-300"
        >
          {v.toFixed(2)}
        </span>
      ))}
    </div>
  );
}

function ExpressionDisplay({ gene }: { gene: Extract<Gene, { type: 'expression' }> }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-zinc-800 p-2 font-mono text-xs text-amber-300">
      <code>{gene.source}</code>
    </pre>
  );
}

function FallbackDisplay({ gene }: { gene: Gene }) {
  let serializable: unknown;
  try {
    serializable = JSON.parse(JSON.stringify(gene, (_key, value: unknown) => {
      if (value instanceof Float64Array) return Array.from(value);
      if (value instanceof Map) return Object.fromEntries(value);
      if (typeof value === 'function') return '[Function]';
      return value;
    }));
  } catch {
    serializable = { error: 'Unable to serialize gene' };
  }

  return (
    <pre className="overflow-x-auto rounded-md bg-zinc-800 p-2 font-mono text-xs text-zinc-400">
      <code>{JSON.stringify(serializable, null, 2)}</code>
    </pre>
  );
}

export function GeneEditor({ name, gene }: GeneEditorProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">{name}</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
          {gene.type}
        </span>
      </div>

      {gene.type === 'scalar' && <ScalarDisplay gene={gene} />}
      {gene.type === 'categorical' && <CategoricalDisplay gene={gene} />}
      {gene.type === 'vector' && <VectorDisplay gene={gene} />}
      {gene.type === 'expression' && <ExpressionDisplay gene={gene} />}
      {gene.type !== 'scalar' &&
        gene.type !== 'categorical' &&
        gene.type !== 'vector' &&
        gene.type !== 'expression' && <FallbackDisplay gene={gene} />}
    </div>
  );
}
