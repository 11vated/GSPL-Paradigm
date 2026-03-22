import { useState, useCallback } from 'react';
import type { UniversalSeed } from '@paradigm/types';

const ARTIFACT_TYPES = [
  'html_page',
  'html_game',
  'character_sheet',
  'source_code',
  'logo',
  'sprite_sheet',
  'config_file',
  'api_spec',
  'shader',
  'narrative',
] as const;

type ArtifactType = (typeof ARTIFACT_TYPES)[number];

interface ForgeResult {
  type: ArtifactType;
  content: string;
  mimeType?: string;
}

interface ForgeApiError {
  message?: string;
}

interface ForgePanelProps {
  seed: UniversalSeed | null;
}

function ArtifactPreview({ result }: { result: ForgeResult }) {
  const isHtml =
    result.type === 'html_page' ||
    result.type === 'html_game' ||
    result.mimeType === 'text/html';

  const isCode =
    result.type === 'source_code' ||
    result.type === 'config_file' ||
    result.type === 'api_spec' ||
    result.type === 'shader';

  if (isHtml) {
    return (
      <iframe
        srcDoc={result.content}
        title="Forged artifact preview"
        className="h-full w-full rounded-md border border-zinc-800 bg-white"
        sandbox="allow-scripts"
      />
    );
  }

  if (isCode) {
    return (
      <pre className="h-full overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-4 font-mono text-xs text-zinc-300">
        <code>{result.content}</code>
      </pre>
    );
  }

  // Fallback: attempt JSON parse for structured data
  let formatted: string;
  try {
    const parsed: unknown = JSON.parse(result.content);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    formatted = result.content;
  }

  return (
    <pre className="h-full overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-4 font-mono text-xs text-zinc-400">
      <code>{formatted}</code>
    </pre>
  );
}

export function ForgePanel({ seed }: ForgePanelProps) {
  const [artifactType, setArtifactType] = useState<ArtifactType>('html_page');
  const [isForging, setIsForging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForgeResult | null>(null);

  const handleForge = useCallback(async () => {
    if (seed === null) return;

    setIsForging(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: seed.$hash, type: artifactType }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ForgeApiError | null;
        throw new Error(
          body?.message ?? `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as { artifact: ForgeResult };
      setResult(data.artifact);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Forge failed. Is the API server running?';
      setError(message);
    } finally {
      setIsForging(false);
    }
  }, [seed, artifactType]);

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Artifact Forge
      </h2>

      {/* Controls */}
      <div className="mb-4 flex items-end gap-3">
        <label className="block flex-1">
          <span className="mb-1 block text-xs text-zinc-500">Artifact Type</span>
          <select
            value={artifactType}
            onChange={(e) => setArtifactType(e.target.value as ArtifactType)}
            disabled={isForging}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
          >
            {ARTIFACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void handleForge()}
          disabled={seed === null || isForging}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isForging ? 'Forging...' : 'Forge'}
        </button>
      </div>

      {/* Seed context */}
      {seed === null && (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
          Select a seed to forge artifacts from
        </div>
      )}

      {seed !== null && !isForging && result === null && error === null && (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
          Choose an artifact type and click Forge to transmute{' '}
          <span className="ml-1 font-medium text-zinc-400">{seed.$name}</span>
        </div>
      )}

      {/* Error */}
      {error !== null && (
        <div className="mb-4 rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Preview */}
      {result !== null && (
        <div className="flex-1 overflow-hidden">
          <ArtifactPreview result={result} />
        </div>
      )}
    </div>
  );
}
