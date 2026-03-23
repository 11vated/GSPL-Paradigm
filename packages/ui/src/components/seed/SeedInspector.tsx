import { useCallback } from 'react';
import type { UniversalSeed } from '@paradigm/types';
import { DomainBadge } from '../common/DomainBadge';
import { Panel } from '../common/Panel';
import { Tabs } from '../common/Tabs';
import { GeneEditor } from './GeneEditor';
import { useSeedStore } from '../../stores/seedStore';
import { useToast } from '../common/Toast';

interface SeedInspectorProps {
  seed: UniversalSeed;
}

export function SeedInspector({ seed }: SeedInspectorProps) {
  const mutateSeed = useSeedStore((s) => s.mutateSeed);
  const deleteSeed = useSeedStore((s) => s.deleteSeed);
  const toast = useToast();

  const geneEntries = Object.entries(seed.genes);

  const handleCopyHash = useCallback(() => {
    navigator.clipboard.writeText(seed.$hash).then(
      () => toast.success('Hash copied to clipboard'),
      () => toast.error('Failed to copy hash'),
    );
  }, [seed.$hash, toast]);

  const handleMutate = useCallback(async () => {
    const result = await mutateSeed(seed.$hash, 0.1);
    if (result) toast.success(`Mutated: ${result.$name}`);
  }, [seed.$hash, mutateSeed, toast]);

  const handleDelete = useCallback(async () => {
    await deleteSeed(seed.$hash);
    toast.info('Seed deleted');
  }, [seed.$hash, deleteSeed, toast]);

  const fitnessEntries = seed.$fitness ? Object.entries(seed.$fitness) : [];

  const tabs = [
    { id: 'genes', label: 'Genes', icon: '\u{1F9EC}' },
    { id: 'metadata', label: 'Metadata', icon: '\u{1F4CB}' },
    { id: 'lineage', label: 'Lineage', icon: '\u{1F333}' },
  ];

  return (
    <div className="flex h-full flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{seed.$name}</h2>
          <DomainBadge domain={seed.$domain} />
          {seed.$fitness?.primary !== undefined && (
            <span className="ml-auto rounded-full bg-[var(--color-primary-glow)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]">
              fitness: {seed.$fitness.primary.toFixed(3)}
            </span>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[var(--color-text-muted)]">Hash</span>
            <button
              type="button"
              onClick={handleCopyHash}
              className="mt-0.5 block truncate font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              title={`Click to copy: ${seed.$hash}`}
            >
              {seed.$hash.slice(0, 8)}...
            </button>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">Generation</span>
            <p className="mt-0.5 font-mono text-[var(--color-text-secondary)]">{seed.$lineage.generation}</p>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">Genes</span>
            <p className="mt-0.5 font-mono text-[var(--color-text-secondary)]">{geneEntries.length}</p>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">Parents</span>
            <p className="mt-0.5 font-mono text-[var(--color-text-secondary)]">{seed.$lineage.parents.length}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void handleMutate()}
            className="rounded-md bg-[var(--color-surface-raised)] px-3 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
          >
            Mutate
          </button>
          <button
            type="button"
            onClick={handleCopyHash}
            className="rounded-md bg-[var(--color-surface-raised)] px-3 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
          >
            Copy Hash
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="ml-auto rounded-md bg-[var(--color-surface-raised)] px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/30"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs tabs={tabs} className="flex-1 overflow-hidden">
        {(activeTab) => (
          <div className="h-full overflow-y-auto p-4">
            {activeTab === 'genes' && (
              <div className="flex flex-col gap-2">
                {geneEntries.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-dim)]">No genes defined.</p>
                ) : (
                  geneEntries.map(([geneName, gene]) => (
                    <GeneEditor key={geneName} name={geneName} gene={gene} />
                  ))
                )}
              </div>
            )}

            {activeTab === 'metadata' && (
              <div className="flex flex-col gap-4">
                {/* Fitness */}
                {fitnessEntries.length > 0 && (
                  <Panel title="Fitness Scores">
                    <div className="grid grid-cols-2 gap-2">
                      {fitnessEntries.map(([key, value]) => (
                        <div key={key} className="rounded-md bg-[var(--color-bg)] p-2">
                          <span className="block text-[10px] text-[var(--color-text-muted)]">{key}</span>
                          <span className="font-mono text-sm text-[var(--color-primary)]">
                            {typeof value === 'number' ? value.toFixed(4) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {/* Display hints */}
                {seed.$display && (
                  <Panel title="Display">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {seed.$display.icon && <div><span className="text-[var(--color-text-muted)]">Icon:</span> {seed.$display.icon}</div>}
                      {seed.$display.color && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--color-text-muted)]">Color:</span>
                          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: seed.$display.color }} />
                          <span className="font-mono">{seed.$display.color}</span>
                        </div>
                      )}
                      {seed.$display.category && <div><span className="text-[var(--color-text-muted)]">Category:</span> {seed.$display.category}</div>}
                    </div>
                    {seed.$display.tags && seed.$display.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {seed.$display.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">{tag}</span>
                        ))}
                      </div>
                    )}
                  </Panel>
                )}

                {/* Relations */}
                {seed.$relations && seed.$relations.length > 0 && (
                  <Panel title={`Relations (${seed.$relations.length})`}>
                    <div className="flex flex-col gap-1">
                      {seed.$relations.map((rel, i) => (
                        <div key={i} className="flex items-center gap-2 rounded bg-[var(--color-bg)] px-2 py-1 text-xs">
                          <span className="rounded bg-[var(--color-violet-glow)] px-1.5 py-0.5 text-[10px] text-[var(--color-violet)]">
                            {rel.type}
                          </span>
                          <span className="truncate font-mono text-[var(--color-text-secondary)]">
                            {rel.targetHash.slice(0, 8)}...
                          </span>
                          {rel.label && <span className="text-[var(--color-text-muted)]">{rel.label}</span>}
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {/* Raw metadata */}
                <Panel title="Metadata">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[var(--color-text-muted)]">Created</span>
                      <p className="font-mono text-[var(--color-text-secondary)]">
                        {new Date(seed.$metadata.created).toLocaleString()}
                      </p>
                    </div>
                    {seed.$metadata.creator && (
                      <div>
                        <span className="text-[var(--color-text-muted)]">Creator</span>
                        <p className="text-[var(--color-text-secondary)]">{seed.$metadata.creator}</p>
                      </div>
                    )}
                    {seed.$metadata.description && (
                      <div className="col-span-2">
                        <span className="text-[var(--color-text-muted)]">Description</span>
                        <p className="text-[var(--color-text-secondary)]">{seed.$metadata.description}</p>
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            )}

            {activeTab === 'lineage' && (
              <div className="flex flex-col gap-4">
                <Panel title="Ancestry">
                  <div className="text-xs">
                    <p className="mb-2 text-[var(--color-text-secondary)]">
                      Generation <span className="font-mono font-semibold text-[var(--color-primary)]">{seed.$lineage.generation}</span>
                    </p>
                    {seed.$lineage.parents.length === 0 ? (
                      <p className="text-[var(--color-text-dim)]">Original seed (no parents)</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {seed.$lineage.parents.map((parent, i) => (
                          <div key={i} className="flex items-center gap-2 rounded bg-[var(--color-bg)] px-3 py-2">
                            <span className="text-[var(--color-text-secondary)]">{parent.name}</span>
                            <span className="font-mono text-[var(--color-text-dim)]">{parent.id.slice(0, 8)}...</span>
                            {parent.fitness?.primary !== undefined && (
                              <span className="ml-auto text-[var(--color-primary)]">
                                f={parent.fitness.primary.toFixed(3)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {seed.$lineage.breedingStrategy && (
                      <p className="mt-2 text-[var(--color-text-dim)]">
                        Strategy: {seed.$lineage.breedingStrategy}
                        {seed.$lineage.mutationIntensity !== undefined && ` (intensity: ${seed.$lineage.mutationIntensity.toFixed(2)})`}
                      </p>
                    )}
                  </div>
                </Panel>

                {/* Behaviors */}
                {seed.$behaviors && seed.$behaviors.length > 0 && (
                  <Panel title={`Behaviors (${seed.$behaviors.length})`}>
                    <div className="flex flex-col gap-1">
                      {seed.$behaviors.map((beh) => (
                        <div key={beh.scriptId} className="rounded bg-[var(--color-bg)] px-3 py-2 text-xs">
                          <span className="font-medium text-[var(--color-text-secondary)]">{beh.name}</span>
                          <span className="ml-2 font-mono text-[var(--color-text-dim)]">{beh.scriptId}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}
              </div>
            )}
          </div>
        )}
      </Tabs>
    </div>
  );
}
