/**
 * Types for the native GSPL SDF renderer.
 * Every parameter maps to a seed gene value.
 */

/** Parameters extracted from seed genes that control SDF geometry. */
export interface SDFParams {
  // Body geometry (from bodyParams struct gene)
  readonly torsoWidth: number;
  readonly torsoHeight: number;
  readonly headRadius: number;
  readonly limbThickness: number;
  readonly limbLength: number;
  readonly neckLength: number;

  // Appendages (from appendages struct gene)
  readonly hasWings: boolean;
  readonly wingSpan: number;
  readonly hasTail: boolean;
  readonly tailLength: number;
  readonly hasHorns: boolean;
  readonly hornSize: number;

  // Surface (from surface struct gene)
  readonly blendSmoothness: number;
}

/** Material parameters extracted from seed genes. */
export interface MaterialParams {
  readonly roughness: number;
  readonly metallic: number;
  readonly emission: number;
  readonly outlineThickness: number;
  readonly primaryColor: readonly [number, number, number];
  readonly secondaryColor: readonly [number, number, number];
  readonly accentColor: readonly [number, number, number];
  readonly limbColor: readonly [number, number, number];
  readonly effectColor: readonly [number, number, number];
}

/** Animation parameters extracted from seed genes. */
export interface MotionParams {
  readonly idleSpeed: number;
  readonly breathingAmplitude: number;
  readonly swayAmount: number;
  readonly bobHeight: number;
}

/** Element effect to apply in shader. */
export type ElementEffect = 'fire' | 'ice' | 'lightning' | 'light' | 'dark' | 'nature' | 'poison' | 'water' | 'earth' | 'wind' | 'none';

/** Complete set of parameters for shader compilation. */
export interface RenderParams {
  readonly bodyStructure: string;
  readonly sdf: SDFParams;
  readonly material: MaterialParams;
  readonly motion: MotionParams;
  readonly element: ElementEffect;
  readonly style: string;
}

/** A body plan compiles SDFParams into a GLSL SDF function body. */
export interface BodyPlan {
  readonly name: string;
  compile(params: SDFParams): string;
}
