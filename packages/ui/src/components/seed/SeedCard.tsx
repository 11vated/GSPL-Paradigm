import type { UniversalSeed } from '@paradigm/types';
import { DomainBadge } from '../common/DomainBadge';

interface SeedCardProps {
  seed: UniversalSeed;
  isSelected: boolean;
  onClick: () => void;
}

export function SeedCard({ seed, isSelected, onClick }: SeedCardProps) {
  const truncatedHash =
    seed.$hash.length > 8 ? `${seed.$hash.slice(0, 8)}...` : seed.$hash;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-all ${
        isSelected
          ? 'border-green-500/50 bg-zinc-800 ring-1 ring-green-500/30'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-100 truncate">
          {seed.$name}
        </span>
        <DomainBadge domain={seed.$domain} />
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="font-mono" title={seed.$hash}>
          {truncatedHash}
        </span>
        <span>Gen {seed.$lineage.generation}</span>
      </div>
    </button>
  );
}
