import { useState } from 'react';
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-[var(--color-text-muted)]">{gene.min}</span>
        <span className="font-mono text-lg font-semibold text-[var(--color-text)]">
          {typeof gene.value === 'number' && gene.value % 1 !== 0 ? gene.value.toFixed(3) : gene.value}
        </span>
        <span className="font-mono text-[var(--color-text-muted)]">{gene.max}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--color-surface-raised)]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percentage}%`,
            background: `linear-gradient(90deg, var(--color-primary-dim), var(--color-primary))`,
            boxShadow: '0 0 8px var(--color-primary-glow)',
          }}
        />
      </div>
      {gene.step !== undefined && (
        <span className="text-[10px] text-[var(--color-text-dim)]">step: {gene.step}</span>
      )}
    </div>
  );
}

function CategoricalDisplay({ gene }: { gene: Extract<Gene, { type: 'categorical' }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {gene.options.map((option, i) => {
        const isActive = option === gene.value;
        const weight = gene.weights?.[i];
        return (
          <span
            key={option}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              isActive
                ? 'bg-[var(--color-primary)] text-white shadow-[0_0_12px_var(--color-primary-glow)]'
                : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]'
            }`}
          >
            {option}
            {weight !== undefined && (
              <span className="ml-1 opacity-60">{(weight * 100).toFixed(0)}%</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function VectorDisplay({ gene }: { gene: Extract<Gene, { type: 'vector' }> }) {
  const maxAbs = Math.max(...gene.value.map(Math.abs), 0.001);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
        {gene.dimensions}D vector
      </div>
      <div className="flex flex-wrap gap-1">
        {gene.value.map((v, i) => {
          const barWidth = Math.abs(v / maxAbs) * 100;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-8 text-right font-mono text-xs text-[var(--color-text-secondary)]">
                {v.toFixed(2)}
              </span>
              <div className="h-3 w-16 rounded-sm bg-[var(--color-surface-raised)]">
                <div
                  className="h-full rounded-sm bg-[var(--color-cyan)]"
                  style={{ width: `${barWidth}%`, opacity: 0.7 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpressionDisplay({ gene }: { gene: Extract<Gene, { type: 'expression' }> }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-[var(--color-bg)] p-3 font-mono text-xs leading-relaxed text-amber-300">
      <code>{gene.source}</code>
    </pre>
  );
}

function StructDisplay({ gene }: { gene: Extract<Gene, { type: 'struct' }> }) {
  const [expanded, setExpanded] = useState(true);
  const entries = Object.entries(gene.value);

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        {entries.length} fields
      </button>
      {expanded && (
        <div className="flex flex-col gap-1 px-3 pb-2">
          {entries.map(([key, subGene]) => (
            <GeneEditor key={key} name={key} gene={subGene} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArrayDisplay({ gene }: { gene: Extract<Gene, { type: 'array' }> }) {
  const [expanded, setExpanded] = useState(gene.value.length <= 5);

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        [{gene.value.length} items]
      </button>
      {expanded && (
        <div className="flex flex-col gap-1 px-3 pb-2">
          {gene.value.map((item, i) => (
            <GeneEditor key={i} name={`[${i}]`} gene={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function TensorDisplay({ gene }: { gene: Extract<Gene, { type: 'tensor' }> }) {
  const data = Array.from(gene.data);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Render as a 1D heatmap strip (for any shape)
  const cellSize = Math.min(12, Math.floor(280 / Math.min(data.length, 50)));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] text-[var(--color-text-dim)]">
        shape: [{gene.shape.join(' x ')}] ({data.length} values)
      </span>
      <div className="flex flex-wrap gap-px">
        {data.slice(0, 200).map((v, i) => {
          const t = (v - min) / range;
          // Blue to green to yellow gradient
          const r = Math.round(t * 255);
          const g = Math.round((1 - Math.abs(t - 0.5) * 2) * 255);
          const b = Math.round((1 - t) * 255);
          return (
            <div
              key={i}
              title={`[${i}] = ${v.toFixed(4)}`}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: `rgb(${r},${g},${b})`,
                borderRadius: 1,
              }}
            />
          );
        })}
        {data.length > 200 && (
          <span className="ml-1 self-end text-[10px] text-[var(--color-text-dim)]">
            +{data.length - 200} more
          </span>
        )}
      </div>
    </div>
  );
}

function TimeSeriesDisplay({ gene }: { gene: Extract<Gene, { type: 'timeseries' }> }) {
  const kf = gene.keyframes;
  if (kf.length === 0) return <span className="text-xs text-[var(--color-text-dim)]">No keyframes</span>;

  const minV = Math.min(...kf.map((k) => k.v));
  const maxV = Math.max(...kf.map((k) => k.v));
  const rangeV = maxV - minV || 1;
  const width = 260;
  const height = 60;
  const pad = 4;

  const minT = kf[0]!.t;
  const maxT = kf[kf.length - 1]!.t;
  const rangeT = maxT - minT || 1;

  const toX = (t: number) => pad + ((t - minT) / rangeT) * (width - 2 * pad);
  const toY = (v: number) => height - pad - ((v - minV) / rangeV) * (height - 2 * pad);

  const points = kf.map((k) => `${toX(k.t)},${toY(k.v)}`).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-[var(--color-text-dim)]">
        {kf.length} keyframes, {gene.interpolation}
      </span>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-md bg-[var(--color-bg)]">
        <polyline points={points} fill="none" stroke="var(--color-cyan)" strokeWidth="2" strokeLinejoin="round" />
        {kf.map((k, i) => (
          <circle key={i} cx={toX(k.t)} cy={toY(k.v)} r="3" fill="var(--color-cyan)" stroke="var(--color-bg)" strokeWidth="1">
            <title>t={k.t.toFixed(2)}, v={k.v.toFixed(2)}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function GraphDisplay({ gene }: { gene: Extract<Gene, { type: 'graph' }> }) {
  const nodeCount = gene.nodes.size;
  const edgeCount = gene.edges.length;

  return (
    <div className="rounded-md bg-[var(--color-bg)] p-3">
      <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-violet)]" />
          {nodeCount} nodes
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-[var(--color-text-muted)]" />
          {edgeCount} edges
        </span>
      </div>
      {nodeCount <= 10 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from(gene.nodes.keys()).map((nodeId) => (
            <span key={nodeId} className="rounded bg-[var(--color-violet-glow)] px-1.5 py-0.5 text-[10px] text-[var(--color-violet)]">
              {nodeId}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function GeneEditor({ name, gene }: GeneEditorProps) {
  const typeColors: Record<string, string> = {
    scalar: 'text-emerald-400',
    categorical: 'text-blue-400',
    vector: 'text-cyan-400',
    expression: 'text-amber-400',
    struct: 'text-purple-400',
    array: 'text-pink-400',
    graph: 'text-violet-400',
    tensor: 'text-orange-400',
    timeseries: 'text-teal-400',
  };

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-sm font-medium text-[var(--color-text)]">{name}</span>
        <span className={`rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] font-medium ${typeColors[gene.type] ?? 'text-zinc-400'}`}>
          {gene.type}
        </span>
      </div>

      {gene.type === 'scalar' && <ScalarDisplay gene={gene} />}
      {gene.type === 'categorical' && <CategoricalDisplay gene={gene} />}
      {gene.type === 'vector' && <VectorDisplay gene={gene} />}
      {gene.type === 'expression' && <ExpressionDisplay gene={gene} />}
      {gene.type === 'struct' && <StructDisplay gene={gene} />}
      {gene.type === 'array' && <ArrayDisplay gene={gene} />}
      {gene.type === 'graph' && <GraphDisplay gene={gene} />}
      {gene.type === 'tensor' && <TensorDisplay gene={gene} />}
      {gene.type === 'timeseries' && <TimeSeriesDisplay gene={gene} />}
    </div>
  );
}
