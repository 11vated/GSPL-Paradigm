import { describe, it, expect } from 'vitest';
import { compileSeedShader, extractRenderParams, getAvailableBodyPlans } from './index.js';
import { compileShader } from './compiler.js';
import { getBodyPlan } from './body-plans/index.js';
import type { UniversalSeed } from '@paradigm/types';

/** Create a minimal seed with rendering genes for testing. */
function makeSeed(overrides?: Record<string, unknown>): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: 'test_hash_' + Math.random().toString(36).slice(2),
    $name: 'Test Entity',
    $lineage: { generation: 0, parents: [], timestamp: Date.now() },
    $metadata: { created: Date.now() },
    genes: {
      bodyStructure: { type: 'categorical', value: 'humanoid', options: ['humanoid', 'quadruped', 'winged'] },
      style: { type: 'categorical', value: 'default', options: ['default', 'anime', 'cartoon'] },
      primaryElement: { type: 'categorical', value: 'none', options: ['none', 'fire', 'ice'] },
      exaggeration: { type: 'scalar', value: 0.5, min: 0, max: 1 },
      proportions: { type: 'vector', value: [0.2, 0.6, 1.2, 0.2], dimensions: 4 },
      palette: { type: 'vector', value: [0.4, 0.6, 0.8, 0.8, 0.5, 0.3, 0.3, 0.8, 0.6, 0.5, 0.5, 0.5, 0.9, 0.7, 0.2], dimensions: 15 },
      bodyParams: {
        type: 'struct',
        value: {
          torsoWidth: { type: 'scalar', value: 0.22, min: 0.1, max: 0.5 },
          torsoHeight: { type: 'scalar', value: 0.5, min: 0.2, max: 0.8 },
          headRadius: { type: 'scalar', value: 0.2, min: 0.08, max: 0.5 },
          limbThickness: { type: 'scalar', value: 0.08, min: 0.03, max: 0.2 },
          limbLength: { type: 'scalar', value: 0.4, min: 0.15, max: 0.8 },
          neckLength: { type: 'scalar', value: 0.1, min: 0.03, max: 0.25 },
        },
      },
      appendages: {
        type: 'struct',
        value: {
          hasWings: { type: 'scalar', value: 0.0, min: 0, max: 1 },
          wingSpan: { type: 'scalar', value: 0.0, min: 0, max: 1.5 },
          hasTail: { type: 'scalar', value: 0.0, min: 0, max: 1 },
          tailLength: { type: 'scalar', value: 0.0, min: 0, max: 1 },
          hasHorns: { type: 'scalar', value: 0.0, min: 0, max: 1 },
          hornSize: { type: 'scalar', value: 0.0, min: 0, max: 0.3 },
        },
      },
      surface: {
        type: 'struct',
        value: {
          roughness: { type: 'scalar', value: 0.5, min: 0, max: 1 },
          metallic: { type: 'scalar', value: 0.0, min: 0, max: 1 },
          emission: { type: 'scalar', value: 0.0, min: 0, max: 3 },
          outlineThickness: { type: 'scalar', value: 0.0, min: 0, max: 0.3 },
          blendSmoothness: { type: 'scalar', value: 0.1, min: 0.01, max: 0.3 },
        },
      },
      motion: {
        type: 'struct',
        value: {
          idleSpeed: { type: 'scalar', value: 2.0, min: 0.5, max: 5 },
          breathingAmplitude: { type: 'scalar', value: 0.03, min: 0.01, max: 0.1 },
          swayAmount: { type: 'scalar', value: 0.02, min: 0, max: 0.2 },
          bobHeight: { type: 'scalar', value: 0.0, min: 0, max: 0.15 },
        },
      },
      ...overrides,
    },
  } as UniversalSeed;
}

describe('extractRenderParams', () => {
  it('extracts body params from seed genes', () => {
    const seed = makeSeed();
    const params = extractRenderParams(seed);
    expect(params.sdf.torsoWidth).toBeCloseTo(0.22);
    expect(params.sdf.headRadius).toBeCloseTo(0.2);
    expect(params.sdf.hasWings).toBe(false);
    expect(params.material.roughness).toBeCloseTo(0.5);
    expect(params.motion.idleSpeed).toBeCloseTo(2.0);
  });

  it('detects wings from appendage genes', () => {
    const seed = makeSeed({
      appendages: {
        type: 'struct',
        value: {
          hasWings: { type: 'scalar', value: 1.0, min: 0, max: 1 },
          wingSpan: { type: 'scalar', value: 1.0, min: 0, max: 1.5 },
          hasTail: { type: 'scalar', value: 0, min: 0, max: 1 },
          tailLength: { type: 'scalar', value: 0, min: 0, max: 1 },
          hasHorns: { type: 'scalar', value: 0, min: 0, max: 1 },
          hornSize: { type: 'scalar', value: 0, min: 0, max: 0.3 },
        },
      },
    });
    const params = extractRenderParams(seed);
    expect(params.sdf.hasWings).toBe(true);
    expect(params.sdf.wingSpan).toBeCloseTo(1.0);
  });

  it('extracts palette colors', () => {
    const seed = makeSeed();
    const params = extractRenderParams(seed);
    expect(params.material.primaryColor[0]).toBeCloseTo(0.4);
    expect(params.material.primaryColor[1]).toBeCloseTo(0.6);
    expect(params.material.primaryColor[2]).toBeCloseTo(0.8);
  });
});

describe('compileShader', () => {
  it('produces valid GLSL with version header', () => {
    const seed = makeSeed();
    const shader = compileSeedShader(seed);
    expect(shader).toContain('#version 300 es');
    expect(shader).toContain('void main()');
    expect(shader).toContain('fragColor');
  });

  it('includes body plan SDF geometry', () => {
    const seed = makeSeed();
    const shader = compileSeedShader(seed);
    expect(shader).toContain('mapEntity');
    expect(shader).toContain('sdCapsule');
    expect(shader).toContain('sdSphere');
  });

  it('includes gene-derived numeric values', () => {
    const seed = makeSeed();
    const shader = compileSeedShader(seed);
    // Head radius gene value should appear in shader
    expect(shader).toContain('0.2000');
    // Torso width
    expect(shader).toContain('0.2200');
  });

  it('includes element effect when present', () => {
    const seed = makeSeed({
      primaryElement: { type: 'categorical', value: 'fire', options: ['none', 'fire'] },
    });
    const shader = compileSeedShader(seed);
    expect(shader).toContain('emission += 1.0');
  });

  it('includes outline when style gene specifies it', () => {
    const seed = makeSeed({
      surface: {
        type: 'struct',
        value: {
          roughness: { type: 'scalar', value: 0.5, min: 0, max: 1 },
          metallic: { type: 'scalar', value: 0, min: 0, max: 1 },
          emission: { type: 'scalar', value: 0, min: 0, max: 3 },
          outlineThickness: { type: 'scalar', value: 0.15, min: 0, max: 0.3 },
          blendSmoothness: { type: 'scalar', value: 0.1, min: 0.01, max: 0.3 },
        },
      },
    });
    const shader = compileSeedShader(seed);
    expect(shader).toContain('dot(n, viewDir)');
  });
});

describe('body plans', () => {
  it('has 8 registered body plans', () => {
    expect(getAvailableBodyPlans().length).toBe(8);
  });

  it('humanoid plan produces valid GLSL', () => {
    const plan = getBodyPlan('humanoid');
    const glsl = plan.compile({
      torsoWidth: 0.22, torsoHeight: 0.5, headRadius: 0.2,
      limbThickness: 0.08, limbLength: 0.4, neckLength: 0.1,
      blendSmoothness: 0.1,
      hasWings: false, wingSpan: 0, hasTail: false, tailLength: 0,
      hasHorns: false, hornSize: 0,
    });
    expect(glsl).toContain('torso');
    expect(glsl).toContain('head');
    expect(glsl).toContain('return body');
  });

  it('winged humanoid includes wing geometry', () => {
    const plan = getBodyPlan('winged');
    const glsl = plan.compile({
      torsoWidth: 0.22, torsoHeight: 0.5, headRadius: 0.3,
      limbThickness: 0.08, limbLength: 0.3, neckLength: 0.05,
      blendSmoothness: 0.15,
      hasWings: true, wingSpan: 1.0, hasTail: true, tailLength: 0.5,
      hasHorns: true, hornSize: 0.15,
    });
    expect(glsl).toContain('Wings');
    expect(glsl).toContain('Tail');
    expect(glsl).toContain('Horns');
  });

  it('quadruped produces legs without arms', () => {
    const plan = getBodyPlan('quadruped');
    const glsl = plan.compile({
      torsoWidth: 0.25, torsoHeight: 0.4, headRadius: 0.2,
      limbThickness: 0.08, limbLength: 0.4, neckLength: 0.1,
      blendSmoothness: 0.1,
      hasWings: false, wingSpan: 0, hasTail: true, tailLength: 0.4,
      hasHorns: false, hornSize: 0,
    });
    expect(glsl).toContain('frontLegs');
    expect(glsl).toContain('backLegs');
    expect(glsl).toContain('Tail');
  });
});

describe('evolution produces visual change', () => {
  it('different gene values produce different shaders', () => {
    const seed1 = makeSeed();
    const seed2 = makeSeed({
      bodyParams: {
        type: 'struct',
        value: {
          torsoWidth: { type: 'scalar', value: 0.4, min: 0.1, max: 0.5 },
          torsoHeight: { type: 'scalar', value: 0.3, min: 0.2, max: 0.8 },
          headRadius: { type: 'scalar', value: 0.45, min: 0.08, max: 0.5 },
          limbThickness: { type: 'scalar', value: 0.05, min: 0.03, max: 0.2 },
          limbLength: { type: 'scalar', value: 0.2, min: 0.15, max: 0.8 },
          neckLength: { type: 'scalar', value: 0.05, min: 0.03, max: 0.25 },
        },
      },
    });

    const shader1 = compileSeedShader(seed1);
    const shader2 = compileSeedShader(seed2);

    expect(shader1).not.toBe(shader2);
    // Chibi-like seed2 should have larger head radius in shader
    expect(shader2).toContain('0.4500'); // headRadius
    expect(shader1).toContain('0.2000'); // original headRadius
  });

  it('different body structures produce structurally different shaders', () => {
    const humanoidSeed = makeSeed();
    const serpentineSeed = makeSeed({
      bodyStructure: { type: 'categorical', value: 'serpentine', options: ['humanoid', 'serpentine'] },
    });

    const s1 = compileSeedShader(humanoidSeed);
    const s2 = compileSeedShader(serpentineSeed);

    expect(s1).toContain('Arms');
    expect(s2).not.toContain('Arms');
    expect(s2).toContain('for (int i');
  });
});
