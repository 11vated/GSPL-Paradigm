/**
 * SeedPreview — renders a UniversalSeed as a real-time 3D entity.
 *
 * Takes a seed, extracts its rendering genes, compiles a GLSL shader
 * via @paradigm/renderer, and displays it in a WebGL canvas.
 *
 * The preview is gene-driven: mutating the seed's genes produces a
 * visually different entity. Breeding two seeds produces a child
 * whose geometry blends both parents' proportions.
 */

import { useMemo } from 'react';
import type { UniversalSeed } from '@paradigm/types';
import { compileSeedShader, getVertexShader } from '@paradigm/renderer';
import { WebGLRenderer } from '../../engine/WebGLRenderer';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface SeedPreviewProps {
  /** The seed to render. Its genes control all visual parameters. */
  seed: UniversalSeed;
  /** Additional CSS classes for the container. */
  className?: string;
}

/**
 * Real-time 3D preview of a seed's visual form.
 *
 * The shader is memoized by seed hash — recompiles only when the seed
 * changes (mutation, breeding, or new creation). The vertex shader is
 * static and shared across all previews.
 */
export function SeedPreview({ seed, className = '' }: SeedPreviewProps) {
  // Compile shader from seed genes — memoized by hash
  const fragmentShader = useMemo(() => {
    try {
      return compileSeedShader(seed);
    } catch (err) {
      console.error('[SeedPreview] Shader compilation failed:', err);
      return null;
    }
  }, [seed.$hash]);

  const vertexShader = useMemo(() => getVertexShader(), []);

  if (!fragmentShader) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-[var(--color-bg)] text-xs text-[var(--color-text-dim)] ${className}`}>
        <div className="p-6 text-center">
          <div className="mb-2 text-lg opacity-30">&#x26A0;</div>
          <div>Unable to compile shader from this seed's genes.</div>
          <div className="mt-1 opacity-60">Try creating an entity with the concept pipeline.</div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className={`flex items-center justify-center rounded-lg bg-[var(--color-bg)] p-6 text-xs text-red-400 ${className}`}>
          WebGL rendering failed. Your browser may not support WebGL2.
        </div>
      }
    >
      <WebGLRenderer
        fragmentSource={fragmentShader}
        vertexSource={vertexShader}
        className={className}
      />
    </ErrorBoundary>
  );
}
