/**
 * @paradigm/renderer — Native GSPL SDF rendering engine.
 *
 * Generates GLSL fragment shaders from UniversalSeed gene values.
 * Every visual parameter is a gene. Mutation changes the geometry.
 * Breeding blends two entities' visual form. Evolution has visible results.
 *
 * @packageDocumentation
 */

import type { UniversalSeed } from '@paradigm/types';
import { extractRenderParams } from './gene-extractor.js';
import { compileShader, VERTEX_SHADER } from './compiler.js';

export { extractRenderParams } from './gene-extractor.js';
export { compileShader, VERTEX_SHADER } from './compiler.js';
export { getBodyPlan, getAvailableBodyPlans } from './body-plans/index.js';
export type { SDFParams, MaterialParams, MotionParams, RenderParams, BodyPlan, ElementEffect } from './types.js';

/**
 * Compile a GLSL fragment shader directly from a UniversalSeed.
 * This is the primary API — pass a seed, get a shader.
 *
 * The shader contains gene values as numeric literals. When the seed
 * is mutated via mutateSeed(), the new seed produces a different shader
 * with different geometry, colors, and animation.
 */
export function compileSeedShader(seed: UniversalSeed): string {
  const params = extractRenderParams(seed);
  return compileShader(params);
}

/**
 * Get the vertex shader for fullscreen quad rendering.
 * Pair with the fragment shader from compileSeedShader().
 */
export function getVertexShader(): string {
  return VERTEX_SHADER;
}
