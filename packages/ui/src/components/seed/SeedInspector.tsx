import type { UniversalSeed } from '@paradigm/types';
import { DomainBadge } from '../common/DomainBadge';
import { GeneEditor } from './GeneEditor';

interface SeedInspectorProps {
  seed: UniversalSeed;
}

export function SeedInspector({ seed }: SeedInspectorProps) {
  const geneEntries = Object.entries(seed.genes);
  const truncatedHash =
    seed.$hash.length > 12 ? `${seed.$hash.slice(0, 12)}...` : seed.$hash;

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">{seed.$name}</h2>
          <DomainBadge domain={seed.$domain} />
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-zinc-500">Hash</span>
            <p className="mt-0.5 font-mono text-zinc-300" title={seed.$hash}>
              {truncatedHash}
            </p>
          </div>
          <div>
            <span className="text-zinc-500">Generation</span>
            <p className="mt-0.5 text-zinc-300">{seed.$lineage.generation}</p>
          </div>
          <div>
            <span className="text-zinc-500">Parents</span>
            <p className="mt-0.5 text-zinc-300">{seed.$lineage.parents.length}</p>
          </div>
        </div>
      </div>

      {/* Genes */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Genes ({geneEntries.length})
        </h3>

        {geneEntries.length === 0 && (
          <p className="text-sm text-zinc-600">No genes defined yet.</p>
        )}

        <div className="flex flex-col gap-2">
          {geneEntries.map(([geneName, gene]) => (
            <GeneEditor key={geneName} name={geneName} gene={gene} />
          ))}
        </div>
      </div>
    </div>
  );
}
