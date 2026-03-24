import { useCallback } from 'react';
import type { UniversalSeed } from '@paradigm/types';
import { useForgeStore } from '../../stores/forgeStore';
import { Panel } from '../common/Panel';
import { Tabs } from '../common/Tabs';
import { useToast } from '../common/Toast';

const ARTIFACT_TYPES = [
  'html_page', 'html_game', 'website', 'character_sheet', 'world_map',
  'source_code', 'shader', 'database_schema', 'test_suite',
  'logo', 'color_palette', 'icon', 'sprite_sheet',
  'soundtrack', 'sound_effect', 'particle_config', 'physics_sim',
  'api_spec', 'documentation', 'presentation',
] as const;

type ArtifactType = (typeof ARTIFACT_TYPES)[number];

interface ForgePanelProps {
  seed: UniversalSeed | null;
}

function ArtifactPreview({ content, type, mimeType }: { content: string; type: string; mimeType?: string }) {
  const isHtml = type === 'html_page' || type === 'html_game' || type === 'website' || mimeType === 'text/html';
  const isCode = ['source_code', 'shader', 'database_schema', 'test_suite', 'api_spec'].includes(type);
  const isSvg = mimeType === 'image/svg+xml' || content.trim().startsWith('<svg');

  if (isHtml) {
    return (
      <iframe
        srcDoc={content}
        title="Forged artifact"
        className="h-full w-full rounded-md border border-[var(--color-border)]"
        sandbox="allow-scripts"
      />
    );
  }

  if (isSvg) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-md bg-white p-4"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  if (isCode) {
    return (
      <pre className="h-full overflow-auto rounded-md bg-[var(--color-bg)] p-4 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">
        <code>{content}</code>
      </pre>
    );
  }

  // Fallback: try JSON format
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    formatted = content;
  }

  return (
    <pre className="h-full overflow-auto rounded-md bg-[var(--color-bg)] p-4 font-mono text-xs text-[var(--color-text-muted)]">
      <code>{formatted}</code>
    </pre>
  );
}

export function ForgePanel({ seed }: ForgePanelProps) {
  const forgeArtifact = useForgeStore((s) => s.forgeArtifact);
  const artifacts = useForgeStore((s) => s.artifacts);
  const currentArtifact = useForgeStore((s) => s.currentArtifact);
  const selectArtifact = useForgeStore((s) => s.selectArtifact);
  const forging = useForgeStore((s) => s.forging);
  const error = useForgeStore((s) => s.error);
  const toast = useToast();

  const handleForge = useCallback(async (type: ArtifactType) => {
    if (!seed) return;
    const result = await forgeArtifact({ seedHash: seed.$hash, type });
    if (result) toast.success(`Forged: ${result.name}`);
  }, [seed, forgeArtifact, toast]);

  const handleDownload = useCallback(() => {
    if (!currentArtifact) return;
    const blob = new Blob([currentArtifact.content], { type: currentArtifact.mimeType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentArtifact.name}.${getExtension(currentArtifact.type)}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentArtifact]);

  if (!seed) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-dim)]">
        Select a seed to forge artifacts from
      </div>
    );
  }

  const tabs = [
    { id: 'forge', label: 'Forge' },
    { id: 'gallery', label: `Gallery (${artifacts.length})` },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Artifact Forge
          </h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            from <span className="font-medium text-[var(--color-primary)]">{seed.$name}</span>
          </span>
        </div>
      </div>

      <Tabs tabs={tabs} className="flex-1 overflow-hidden">
        {(activeTab) => (
          <>
            {activeTab === 'forge' && (
              <div className="flex h-full flex-col gap-4 p-4">
                {/* Type selector grid */}
                <Panel title="Artifact Type">
                  <div className="flex flex-wrap gap-1.5">
                    {ARTIFACT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => void handleForge(type)}
                        disabled={forging}
                        className="rounded-md bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-50"
                      >
                        {type.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </Panel>

                {/* Error */}
                {error && (
                  <div className="rounded-md border border-red-800/50 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-red-400">
                    {error}
                  </div>
                )}

                {/* Forging indicator */}
                {forging && (
                  <div className="flex items-center gap-2 rounded-md bg-[var(--color-primary-glow)] px-4 py-3 text-sm text-[var(--color-primary)]">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
                    Forging artifact...
                  </div>
                )}

                {/* Preview */}
                {currentArtifact && !forging && (
                  <div className="flex flex-1 flex-col gap-2 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text)]">{currentArtifact.name}</span>
                        <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                          {currentArtifact.type}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-dim)]">
                          {(currentArtifact.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="rounded-md bg-[var(--color-surface-raised)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                      >
                        Download
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ArtifactPreview
                        content={currentArtifact.content}
                        type={currentArtifact.type}
                        mimeType={currentArtifact.mimeType}
                      />
                    </div>
                  </div>
                )}

                {!currentArtifact && !forging && !error && (
                  <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-dim)]">
                    Click an artifact type to forge
                  </div>
                )}
              </div>
            )}

            {activeTab === 'gallery' && (
              <div className="h-full overflow-y-auto p-4">
                {artifacts.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
                    No artifacts forged yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {artifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        type="button"
                        onClick={() => selectArtifact(artifact)}
                        className={`flex items-center justify-between rounded-md border p-3 text-left transition-colors ${
                          currentArtifact?.id === artifact.id
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary-glow)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-bright)]'
                        }`}
                      >
                        <div>
                          <span className="text-sm font-medium text-[var(--color-text)]">{artifact.name}</span>
                          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                            <span>{artifact.type}</span>
                            <span>{(artifact.size / 1024).toFixed(1)} KB</span>
                            <span>{new Date(artifact.createdAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}

function getExtension(type: string): string {
  const map: Record<string, string> = {
    html_page: 'html', html_game: 'html', website: 'html',
    source_code: 'ts', shader: 'glsl', database_schema: 'sql',
    test_suite: 'test.ts', api_spec: 'json', documentation: 'md',
    logo: 'svg', color_palette: 'json', icon: 'svg',
    sprite_sheet: 'png', soundtrack: 'json', sound_effect: 'json',
    character_sheet: 'html', world_map: 'html', presentation: 'html',
    particle_config: 'json', physics_sim: 'json',
  };
  return map[type] ?? 'txt';
}
