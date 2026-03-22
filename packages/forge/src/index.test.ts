/**
 * @paradigm/forge — Comprehensive test suite.
 *
 * Covers all 6 forgers, all artifact types, the Forge master router,
 * and all exported utility helpers.  Target: 80 %+ line coverage, 70 %+ branch.
 *
 * Seeds are constructed inline using @paradigm/rng (already a dep) plus the
 * UniversalSeed type from @paradigm/types, avoiding the need for @paradigm/seed
 * to be present in node_modules at test-time.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import type { UniversalSeed, GeneMap, SeedDomain } from '@paradigm/types';

import {
  // Forger classes
  WebForger,
  DesignForger,
  CodeForger,
  CreativeForger,
  AssetForger,
  AudioForger,
  Forge,
  ForgeError,
  // Utility exports
  getNumericGene,
  getStringGene,
  getVectorGene,
  collectScalars,
  collectVectors,
  collectCategoricals,
  getGeneValue,
} from './index.js';

import type { Artifact, ArtifactType, ForgeOptions, ForgerStrategy } from './index.js';

// ─────────────────────────────────────────────
// Inline seed factory (mirrors @paradigm/seed's createSeed)
// ─────────────────────────────────────────────

function makeTestSeed<T extends GeneMap>(
  name: string,
  domain: SeedDomain,
  genes: T,
): UniversalSeed<T> {
  const now = Date.now();
  const seed: UniversalSeed<T> = {
    $gst: '4.0',
    $domain: domain,
    $name: name,
    $hash: '',
    $lineage: { generation: 0, parents: [], timestamp: now },
    genes,
    $metadata: { created: now },
    $activation: { alive: true, active: true, energy: 100, age: 0 },
  };
  seed.$hash = computeQuickHash({ $gst: seed.$gst, $domain: seed.$domain, $name: seed.$name, genes: seed.genes });
  return seed;
}

// ─────────────────────────────────────────────
// Shared test fixtures
// ─────────────────────────────────────────────

/** Rich seed with every gene type that forge helpers use. */
const richSeed = makeTestSeed('TestEntity', 'organism', {
  health:  { type: 'scalar'      as const, value: 75,   min: 0,   max: 100 },
  speed:   { type: 'scalar'      as const, value: 40,   min: 0,   max: 100 },
  element: { type: 'categorical' as const, value: 'fire', options: ['fire', 'water', 'earth', 'air'] },
  color:   { type: 'vector'      as const, value: [0.9, 0.3, 0.1], dimensions: 3 },
  formula: { type: 'expression'  as const, source: 'health * 2 + speed', language: 'gspl' } as any,
  stats:   { type: 'struct'      as const, fields: { str: 10, dex: 15, con: 12 } } as any,
});

/** Minimal seed — scalar gene only — exercises fallback paths. */
const minimalSeed = makeTestSeed('Minimal', 'physics', {
  mass: { type: 'scalar' as const, value: 1.0, min: 0, max: 100 },
});

/** Seed with no genes at all — exercises empty-gene edge cases. */
const emptySeed = makeTestSeed('EmptySeed', 'security', {});

/** Helper: assert the core Artifact contract. */
function assertArtifact(
  artifact: Artifact,
  expectedType: ArtifactType,
  mimeContains: string,
): void {
  expect(artifact.type).toBe(expectedType);
  expect(typeof artifact.name).toBe('string');
  expect(artifact.name.length).toBeGreaterThan(0);
  expect(typeof artifact.content).toBe('string');
  expect(artifact.content.length).toBeGreaterThan(0);
  expect(artifact.mimeType).toContain(mimeContains);
  expect(artifact.size).toBeGreaterThan(0);
  expect(artifact.size).toBe(artifact.content.length);
  expect(typeof artifact.metadata).toBe('object');
}

// ─────────────────────────────────────────────
// WebForger
// ─────────────────────────────────────────────

describe('WebForger', () => {
  let forger: WebForger;

  beforeEach(() => { forger = new WebForger(); });

  it('has correct name and supportedTypes', () => {
    expect(forger.name).toBe('WebForger');
    expect(forger.supportedTypes).toEqual(
      expect.arrayContaining(['html_page', 'html_game', 'website', 'api_spec', 'documentation', 'presentation']),
    );
  });

  it('canForge returns true for every declared supported type', () => {
    for (const t of forger.supportedTypes) expect(forger.canForge(t)).toBe(true);
  });

  it('canForge returns false for unsupported type', () => {
    expect(forger.canForge('logo')).toBe(false);
  });

  // html_page
  it('forges html_page — passes Artifact contract', () => {
    assertArtifact(forger.forge(richSeed, { type: 'html_page' }), 'html_page', 'text/html');
  });

  it('html_page content is a complete HTML document', () => {
    const art = forger.forge(richSeed, { type: 'html_page' });
    expect(art.content).toContain('<!DOCTYPE html>');
    expect(art.content).toContain('TestEntity');
    expect(art.name).toMatch(/\.html$/);
  });

  it('html_page dark theme uses dark background', () => {
    const art = forger.forge(richSeed, { type: 'html_page', theme: 'dark' });
    expect(art.content).toContain('#0d0d0d');
  });

  it('html_page without categorical genes shows fallback text', () => {
    const art = forger.forge(minimalSeed, { type: 'html_page' });
    expect(art.content).toContain('No categorical genes');
  });

  it('html_page metadata includes domain, hash, generation, colors', () => {
    const art = forger.forge(richSeed, { type: 'html_page' });
    expect(art.metadata['domain']).toBe('organism');
    expect(typeof art.metadata['hash']).toBe('string');
    expect(typeof art.metadata['generation']).toBe('number');
    expect(art.metadata['colors']).toBeDefined();
  });

  // website
  it('forges website (routes to html_page internals)', () => {
    const art = forger.forge(richSeed, { type: 'website' });
    assertArtifact(art, 'html_page', 'text/html');
  });

  // html_game
  it('forges html_game with canvas and game loop', () => {
    const art = forger.forge(richSeed, { type: 'html_game' });
    assertArtifact(art, 'html_game', 'text/html');
    expect(art.content).toContain('<canvas');
    expect(art.content).toContain('requestAnimationFrame');
    expect(art.content).toContain('PLAYER_SPEED');
    expect(art.name).toMatch(/\.html$/);
  });

  it('html_game respects custom width/height', () => {
    const art = forger.forge(richSeed, { type: 'html_game', width: 800, height: 600 });
    expect(art.content).toContain('width="800"');
    expect(art.content).toContain('height="600"');
  });

  it('html_game from minimal seed still produces valid output', () => {
    assertArtifact(forger.forge(minimalSeed, { type: 'html_game' }), 'html_game', 'text/html');
  });

  it('html_game metadata contains playerSpeed, enemyRate, colors', () => {
    const art = forger.forge(richSeed, { type: 'html_game' });
    expect(typeof art.metadata['playerSpeed']).toBe('number');
    expect(typeof art.metadata['enemyRate']).toBe('number');
    expect(art.metadata['colors']).toBeDefined();
  });

  // api_spec
  it('forges api_spec as OpenAPI YAML', () => {
    const art = forger.forge(richSeed, { type: 'api_spec' });
    assertArtifact(art, 'api_spec', 'application/yaml');
    expect(art.content).toContain("openapi: '3.0.3'");
    expect(art.content).toContain('BearerAuth');
    expect(art.name).toMatch(/\.yaml$/);
  });

  it('api_spec metadata includes resourceCount and version', () => {
    const art = forger.forge(richSeed, { type: 'api_spec' });
    expect(typeof art.metadata['resourceCount']).toBe('number');
    expect(typeof art.metadata['version']).toBe('string');
  });

  it('api_spec from seed with no categoricals still produces valid YAML header', () => {
    const art = forger.forge(emptySeed, { type: 'api_spec' });
    expect(art.content).toContain("openapi: '3.0.3'");
  });

  // documentation
  it('forges documentation as markdown with gene table and lineage', () => {
    const art = forger.forge(richSeed, { type: 'documentation' });
    assertArtifact(art, 'documentation', 'text/markdown');
    expect(art.content).toContain('# TestEntity');
    expect(art.content).toContain('## Gene Map');
    expect(art.content).toContain('## Lineage');
    expect(art.content).toContain('## Fitness');
    expect(art.content).toContain('## Activation State');
    expect(art.name).toMatch(/\.md$/);
  });

  it('documentation metadata contains geneCount', () => {
    const art = forger.forge(richSeed, { type: 'documentation' });
    expect(typeof art.metadata['geneCount']).toBe('number');
    expect(art.metadata['geneCount'] as number).toBeGreaterThan(0);
  });

  // presentation
  it('forges presentation — artifact type is presentation', () => {
    const art = forger.forge(richSeed, { type: 'presentation' });
    assertArtifact(art, 'presentation', 'text/markdown');
    expect(art.content).toContain('# TestEntity');
  });
});

// ─────────────────────────────────────────────
// DesignForger
// ─────────────────────────────────────────────

describe('DesignForger', () => {
  let forger: DesignForger;

  beforeEach(() => { forger = new DesignForger(); });

  it('has correct name and supportedTypes', () => {
    expect(forger.name).toBe('DesignForger');
    expect(forger.supportedTypes).toEqual(expect.arrayContaining(['logo', 'color_palette', 'icon']));
  });

  it('canForge returns true for supported types', () => {
    for (const t of forger.supportedTypes) expect(forger.canForge(t)).toBe(true);
  });

  it('canForge returns false for html_page', () => {
    expect(forger.canForge('html_page')).toBe(false);
  });

  // logo
  it('forges logo as valid SVG', () => {
    const art = forger.forge(richSeed, { type: 'logo' });
    assertArtifact(art, 'logo', 'image/svg+xml');
    expect(art.content).toContain('<svg');
    expect(art.content).toContain('</svg>');
    expect(art.content).toContain('<polygon');
    expect(art.name).toMatch(/\.svg$/);
  });

  it('logo respects custom width/height', () => {
    const art = forger.forge(richSeed, { type: 'logo', width: 300, height: 300 });
    expect(art.content).toContain('width="300"');
    expect(art.content).toContain('height="300"');
  });

  it('logo metadata includes sides (polygon count) and colors', () => {
    const art = forger.forge(richSeed, { type: 'logo' });
    expect(typeof art.metadata['sides']).toBe('number');
    const sides = art.metadata['sides'] as number;
    expect(sides).toBeGreaterThanOrEqual(3);
    expect(sides).toBeLessThanOrEqual(8);
    expect(art.metadata['colors']).toBeDefined();
  });

  it('logo from empty seed still produces valid SVG', () => {
    const art = forger.forge(emptySeed, { type: 'logo' });
    expect(art.content).toContain('<svg');
  });

  // color_palette
  it('forges color_palette as JSON with all required color fields', () => {
    const art = forger.forge(richSeed, { type: 'color_palette' });
    assertArtifact(art, 'color_palette', 'application/json');
    const parsed = JSON.parse(art.content) as Record<string, unknown>;
    const colors = parsed['colors'] as Record<string, string>;
    for (const key of ['primary', 'secondary', 'accent', 'background', 'text', 'success', 'warning', 'error', 'info']) {
      expect(colors[key]).toBeDefined();
      expect(typeof colors[key]).toBe('string');
    }
    expect(art.name).toMatch(/\.json$/);
  });

  it('color_palette hex colors start with #', () => {
    const art = forger.forge(richSeed, { type: 'color_palette' });
    const parsed = JSON.parse(art.content) as { colors: Record<string, string> };
    expect(parsed.colors['primary']).toMatch(/^#[0-9a-f]{6}/i);
    expect(parsed.colors['accent']).toMatch(/^#[0-9a-f]{6}/i);
  });

  it('color_palette metadata includes colorCount > 5', () => {
    const art = forger.forge(richSeed, { type: 'color_palette' });
    expect(art.metadata['colorCount'] as number).toBeGreaterThan(5);
  });

  it('color_palette from empty-gene seed has empty scalars section', () => {
    const art = forger.forge(emptySeed, { type: 'color_palette' });
    const parsed = JSON.parse(art.content) as { scalars: Record<string, number> };
    expect(Object.keys(parsed.scalars).length).toBe(0);
  });

  // icon
  it('forges icon as valid SVG with star polygon and circle', () => {
    const art = forger.forge(richSeed, { type: 'icon' });
    assertArtifact(art, 'icon', 'image/svg+xml');
    expect(art.content).toContain('<svg');
    expect(art.content).toContain('<polygon');
    expect(art.content).toContain('<circle');
    expect(art.name).toMatch(/\.svg$/);
  });

  it('icon respects custom size via width option', () => {
    const art = forger.forge(richSeed, { type: 'icon', width: 128 });
    expect(art.content).toContain('width="128"');
  });

  it('icon metadata includes size and colors', () => {
    const art = forger.forge(richSeed, { type: 'icon', width: 32 });
    expect(art.metadata['size']).toBe(32);
    expect(art.metadata['colors']).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// CodeForger
// ─────────────────────────────────────────────

describe('CodeForger', () => {
  let forger: CodeForger;

  beforeEach(() => { forger = new CodeForger(); });

  it('has correct name and supportedTypes', () => {
    expect(forger.name).toBe('CodeForger');
    expect(forger.supportedTypes).toEqual(
      expect.arrayContaining(['source_code', 'shader', 'database_schema', 'test_suite']),
    );
  });

  it('canForge returns true for all declared types', () => {
    for (const t of forger.supportedTypes) expect(forger.canForge(t)).toBe(true);
  });

  it('canForge returns false for logo', () => {
    expect(forger.canForge('logo')).toBe(false);
  });

  // source_code
  it('forges source_code as TypeScript class', () => {
    const art = forger.forge(richSeed, { type: 'source_code' });
    assertArtifact(art, 'source_code', 'text/typescript');
    expect(art.content).toContain('export class');
    expect(art.content).toContain('export interface');
    expect(art.content).toContain('compareFitness');
    expect(art.content).toContain('toGenes');
    expect(art.name).toMatch(/\.ts$/);
  });

  it('source_code metadata includes className and geneCount', () => {
    const art = forger.forge(richSeed, { type: 'source_code' });
    expect(typeof art.metadata['className']).toBe('string');
    expect(art.metadata['geneCount'] as number).toBeGreaterThan(0);
  });

  it('source_code with no scalar genes uses 0 for selfFitness', () => {
    const art = forger.forge(emptySeed, { type: 'source_code' });
    expect(art.content).toContain('const selfFitness = 0');
  });

  it('source_code emits scalar readonly number property', () => {
    const art = forger.forge(richSeed, { type: 'source_code' });
    expect(art.content).toContain('readonly health: number');
  });

  it('source_code emits categorical readonly string property', () => {
    const art = forger.forge(richSeed, { type: 'source_code' });
    expect(art.content).toContain('readonly element: string');
  });

  it('source_code emits vector readonly number[] property', () => {
    const art = forger.forge(richSeed, { type: 'source_code' });
    expect(art.content).toContain('readonly color: readonly number[]');
  });

  // shader
  it('forges shader as GLSL fragment', () => {
    const art = forger.forge(richSeed, { type: 'shader' });
    assertArtifact(art, 'shader', 'text/plain');
    expect(art.content).toContain('precision highp float');
    expect(art.content).toContain('uniform float u_time');
    expect(art.content).toContain('void main()');
    expect(art.content).toContain('gl_FragColor');
    expect(art.content).toContain('const float FREQ');
    expect(art.name).toMatch(/\.frag$/);
  });

  it('shader metadata contains freq, amp and octaves', () => {
    const art = forger.forge(richSeed, { type: 'shader' });
    expect(art.metadata['freq']).toBeDefined();
    expect(art.metadata['amp']).toBeDefined();
    expect(typeof art.metadata['octaves']).toBe('number');
  });

  it('shader from empty seed still produces valid GLSL', () => {
    const art = forger.forge(emptySeed, { type: 'shader' });
    expect(art.content).toContain('void main()');
  });

  // database_schema
  it('forges database_schema as SQL', () => {
    const art = forger.forge(richSeed, { type: 'database_schema' });
    assertArtifact(art, 'database_schema', 'text/plain');
    expect(art.content).toContain('CREATE TABLE');
    expect(art.content).toContain('CREATE INDEX');
    expect(art.content).toContain('INSERT INTO');
    expect(art.content).toContain('pgcrypto');
    expect(art.name).toMatch(/\.sql$/);
  });

  it('database_schema metadata includes tableCount >= 1', () => {
    const art = forger.forge(richSeed, { type: 'database_schema' });
    expect(art.metadata['tableCount'] as number).toBeGreaterThanOrEqual(1);
  });

  it('database_schema from empty seed contains the seeds anchor table', () => {
    const art = forger.forge(emptySeed, { type: 'database_schema' });
    expect(art.content).toContain('_seeds');
  });

  // test_suite
  it('forges test_suite as a vitest-compatible TypeScript file', () => {
    const art = forger.forge(richSeed, { type: 'test_suite' });
    assertArtifact(art, 'test_suite', 'text/typescript');
    expect(art.content).toContain("import { describe, it, expect } from 'vitest'");
    expect(art.content).toContain('describe(');
    expect(art.content).toContain("it('");
    expect(art.name).toMatch(/\.test\.ts$/);
  });

  it('test_suite generates scalar-bounds test', () => {
    const art = forger.forge(richSeed, { type: 'test_suite' });
    expect(art.content).toContain('scalar bounds');
  });

  it('test_suite generates categorical test', () => {
    const art = forger.forge(richSeed, { type: 'test_suite' });
    expect(art.content).toContain('categorical');
  });

  it('test_suite generates vector-dimensions test', () => {
    const art = forger.forge(richSeed, { type: 'test_suite' });
    expect(art.content).toContain('dimensions');
  });
});

// ─────────────────────────────────────────────
// CreativeForger
// ─────────────────────────────────────────────

describe('CreativeForger', () => {
  let forger: CreativeForger;

  beforeEach(() => { forger = new CreativeForger(); });

  it('has correct name and supportedTypes', () => {
    expect(forger.name).toBe('CreativeForger');
    expect(forger.supportedTypes).toEqual(expect.arrayContaining(['character_sheet', 'world_map']));
  });

  it('canForge returns true for character_sheet and world_map', () => {
    expect(forger.canForge('character_sheet')).toBe(true);
    expect(forger.canForge('world_map')).toBe(true);
    expect(forger.canForge('shader')).toBe(false);
  });

  // character_sheet
  it('forges character_sheet as HTML with stat grid', () => {
    const art = forger.forge(richSeed, { type: 'character_sheet' });
    assertArtifact(art, 'character_sheet', 'text/html');
    expect(art.content).toContain('<!DOCTYPE html>');
    expect(art.content).toContain('Character Sheet');
    expect(art.content).toContain('Ability Scores');
    expect(art.name).toMatch(/\.html$/);
  });

  it('character_sheet dark theme applies dark background colour', () => {
    const art = forger.forge(richSeed, { type: 'character_sheet', theme: 'dark' });
    expect(art.content).toContain('#1a1a2e');
  });

  it('character_sheet with no categoricals shows fallback ability list', () => {
    const art = forger.forge(minimalSeed, { type: 'character_sheet' });
    expect(art.content).toContain('No special abilities');
  });

  it('character_sheet metadata includes stats with Strength in [1,20]', () => {
    const art = forger.forge(richSeed, { type: 'character_sheet' });
    const stats = art.metadata['stats'] as Record<string, number>;
    expect(typeof stats['Strength']).toBe('number');
    expect(stats['Strength']).toBeGreaterThanOrEqual(1);
    expect(stats['Strength']).toBeLessThanOrEqual(20);
  });

  // world_map
  it('forges world_map as valid SVG with terrain patches', () => {
    const art = forger.forge(richSeed, { type: 'world_map' });
    assertArtifact(art, 'world_map', 'image/svg+xml');
    expect(art.content).toContain('<svg');
    expect(art.content).toContain('World Map');
    expect(art.content).toContain('<ellipse');
    expect(art.name).toMatch(/\.svg$/);
  });

  it('world_map respects custom dimensions', () => {
    const art = forger.forge(richSeed, { type: 'world_map', width: 800, height: 500 });
    expect(art.content).toContain('width="800"');
    expect(art.content).toContain('height="500"');
  });

  it('world_map metadata includes terrainCount and locationCount', () => {
    const art = forger.forge(richSeed, { type: 'world_map' });
    expect(typeof art.metadata['terrainCount']).toBe('number');
    expect(typeof art.metadata['locationCount']).toBe('number');
    expect(art.metadata['terrainCount'] as number).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────
// AssetForger
// ─────────────────────────────────────────────

describe('AssetForger', () => {
  let forger: AssetForger;

  beforeEach(() => { forger = new AssetForger(); });

  it('has correct name and supportedTypes', () => {
    expect(forger.name).toBe('AssetForger');
    expect(forger.supportedTypes).toEqual(expect.arrayContaining(['sprite_sheet', 'particle_config']));
  });

  it('canForge returns true for supported types only', () => {
    expect(forger.canForge('sprite_sheet')).toBe(true);
    expect(forger.canForge('particle_config')).toBe(true);
    expect(forger.canForge('shader')).toBe(false);
  });

  // sprite_sheet
  it('forges sprite_sheet as valid JSON with meta, animations, frames', () => {
    const art = forger.forge(richSeed, { type: 'sprite_sheet' });
    assertArtifact(art, 'sprite_sheet', 'application/json');
    const parsed = JSON.parse(art.content) as {
      meta: { name: string; frameSize: { w: number; h: number } };
      animations: Array<{ name: string; fps: number; frameCount: number; loop: boolean }>;
      frames: unknown[];
    };
    expect(parsed.meta.name).toBe('TestEntity');
    expect(parsed.meta.frameSize.w).toBeGreaterThan(0);
    expect(parsed.meta.frameSize.h).toBeGreaterThan(0);
    expect(Array.isArray(parsed.animations)).toBe(true);
    expect(parsed.animations.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.frames)).toBe(true);
    expect(art.name).toMatch(/\.json$/);
  });

  it('sprite_sheet "die" animation has loop=false', () => {
    const seedWithDie = makeTestSeed('DieTest', 'organism', {
      e1: { type: 'categorical' as const, value: 'die', options: ['idle', 'die'] },
    });
    const art = forger.forge(seedWithDie, { type: 'sprite_sheet' });
    const parsed = JSON.parse(art.content) as { animations: Array<{ name: string; loop: boolean }> };
    const dieAnim = parsed.animations.find((a) => a.name === 'die');
    expect(dieAnim).toBeDefined();
    expect(dieAnim!.loop).toBe(false);
  });

  it('sprite_sheet uses categoricals as animation names', () => {
    const art = forger.forge(richSeed, { type: 'sprite_sheet' });
    const parsed = JSON.parse(art.content) as { animations: Array<{ name: string }> };
    const names = parsed.animations.map((a) => a.name);
    expect(names).toContain('fire');
  });

  it('sprite_sheet falls back to default animation names when no categoricals', () => {
    const art = forger.forge(minimalSeed, { type: 'sprite_sheet' });
    const parsed = JSON.parse(art.content) as { animations: Array<{ name: string }> };
    const names = parsed.animations.map((a) => a.name);
    expect(names).toContain('idle');
    expect(names).toContain('walk');
  });

  it('sprite_sheet metadata includes positive frameCount and animationCount', () => {
    const art = forger.forge(richSeed, { type: 'sprite_sheet' });
    expect(art.metadata['frameCount'] as number).toBeGreaterThan(0);
    expect(art.metadata['animationCount'] as number).toBeGreaterThan(0);
  });

  // particle_config
  it('forges particle_config as JSON with emitter and particle subsections', () => {
    const art = forger.forge(richSeed, { type: 'particle_config' });
    assertArtifact(art, 'particle_config', 'application/json');
    const parsed = JSON.parse(art.content) as {
      name: string;
      emitter: { type: string; rate: number };
      particle: { blendMode: string; color: { start: string; end: string } };
    };
    expect(typeof parsed.name).toBe('string');
    expect(['point', 'circle', 'rectangle', 'line']).toContain(parsed.emitter.type);
    expect(['normal', 'additive', 'multiply', 'screen']).toContain(parsed.particle.blendMode);
    expect(parsed.particle.color.start).toMatch(/^#[0-9a-f]{6}/i);
    expect(art.name).toMatch(/\.json$/);
  });

  it('particle_config metadata includes emitterType and blendMode', () => {
    const art = forger.forge(richSeed, { type: 'particle_config' });
    expect(typeof art.metadata['emitterType']).toBe('string');
    expect(typeof art.metadata['blendMode']).toBe('string');
  });

  it('particle_config categoricals[0] is used as color tween', () => {
    const art = forger.forge(richSeed, { type: 'particle_config' });
    const parsed = JSON.parse(art.content) as { particle: { color: { tween: string } } };
    // richSeed has 'fire' as first categorical value
    expect(parsed.particle.color.tween).toBe('fire');
  });

  it('particle_config from empty seed falls back to "linear" tween', () => {
    const art = forger.forge(emptySeed, { type: 'particle_config' });
    const parsed = JSON.parse(art.content) as { particle: { color: { tween: string } } };
    expect(parsed.particle.color.tween).toBe('linear');
  });
});

// ─────────────────────────────────────────────
// AudioForger
// ─────────────────────────────────────────────

describe('AudioForger', () => {
  let forger: AudioForger;

  beforeEach(() => { forger = new AudioForger(); });

  it('has correct name and supportedTypes', () => {
    expect(forger.name).toBe('AudioForger');
    expect(forger.supportedTypes).toEqual(expect.arrayContaining(['soundtrack', 'sound_effect']));
  });

  it('canForge returns true for soundtrack and sound_effect', () => {
    expect(forger.canForge('soundtrack')).toBe(true);
    expect(forger.canForge('sound_effect')).toBe(true);
    expect(forger.canForge('sprite_sheet')).toBe(false);
  });

  it('canForge returns false for physics_sim', () => {
    expect(forger.canForge('physics_sim')).toBe(false);
  });

  // soundtrack
  it('forges soundtrack as JSON with musical properties', () => {
    const art = forger.forge(richSeed, { type: 'soundtrack' });
    assertArtifact(art, 'soundtrack', 'application/json');
    const parsed = JSON.parse(art.content) as {
      bpm: number;
      key: string;
      mood: string;
      instruments: string[];
      structure: Array<{ name: string; bars: number; intensity: number }>;
      motifs: unknown[];
    };
    expect(parsed.bpm).toBeGreaterThanOrEqual(60);
    expect(parsed.bpm).toBeLessThanOrEqual(200);
    expect(typeof parsed.key).toBe('string');
    expect(typeof parsed.mood).toBe('string');
    expect(Array.isArray(parsed.instruments)).toBe(true);
    expect(parsed.instruments.length).toBeGreaterThan(0);
    expect(parsed.structure.length).toBe(5);
    expect(art.name).toMatch(/\.json$/);
  });

  it('soundtrack structure section names are the 5 standard sections', () => {
    const art = forger.forge(richSeed, { type: 'soundtrack' });
    const parsed = JSON.parse(art.content) as { structure: Array<{ name: string }> };
    const names = parsed.structure.map((s) => s.name);
    expect(names).toEqual(['intro', 'verse', 'chorus', 'bridge', 'outro']);
  });

  it('soundtrack metadata includes bpm, key, mood', () => {
    const art = forger.forge(richSeed, { type: 'soundtrack' });
    expect(typeof art.metadata['bpm']).toBe('number');
    expect(typeof art.metadata['key']).toBe('string');
    expect(typeof art.metadata['mood']).toBe('string');
  });

  it('soundtrack from minimal seed still produces valid JSON', () => {
    const art = forger.forge(minimalSeed, { type: 'soundtrack' });
    assertArtifact(art, 'soundtrack', 'application/json');
    const parsed = JSON.parse(art.content) as { bpm: number };
    expect(parsed.bpm).toBeGreaterThan(0);
  });

  // sound_effect
  it('forges sound_effect with type, synthesis and ADSR envelope', () => {
    const art = forger.forge(richSeed, { type: 'sound_effect' });
    assertArtifact(art, 'sound_effect', 'application/json');
    const parsed = JSON.parse(art.content) as {
      type: string;
      synthesis: string;
      duration: number;
      amplitude: { attack: number; decay: number; sustain: number; release: number };
      reverb: { enabled: boolean; decay: number; mix: number };
      pitch: { semitones: number; cents: number };
      layers: number;
    };
    expect(['impact','explosion','pickup','jump','shoot','ambient','ui_click','footstep','magic']).toContain(parsed.type);
    expect(['sine','square','sawtooth','triangle','noise']).toContain(parsed.synthesis);
    expect(parsed.duration).toBeGreaterThan(0);
    expect(typeof parsed.amplitude.attack).toBe('number');
    expect(typeof parsed.amplitude.decay).toBe('number');
    expect(typeof parsed.reverb.enabled).toBe('boolean');
    expect(typeof parsed.pitch.semitones).toBe('number');
    expect(parsed.layers).toBeGreaterThanOrEqual(1);
    expect(art.name).toMatch(/\.json$/);
  });

  it('sound_effect metadata includes sfxType and synthesis', () => {
    const art = forger.forge(richSeed, { type: 'sound_effect' });
    expect(typeof art.metadata['sfxType']).toBe('string');
    expect(typeof art.metadata['synthesis']).toBe('string');
  });
});

// ─────────────────────────────────────────────
// Forge — Master Router
// ─────────────────────────────────────────────

describe('Forge (master router)', () => {
  it('constructs with default RNG (no argument)', () => {
    const forge = new Forge();
    expect(forge).toBeDefined();
  });

  it('constructs with a provided DeterministicRNG', () => {
    const forge = new Forge(new DeterministicRNG('custom'));
    expect(forge.getSupportedTypes().length).toBeGreaterThan(0);
  });

  it('getSupportedTypes includes all 19 built-in artifact types', () => {
    const forge = new Forge();
    const types = forge.getSupportedTypes();
    const required: ArtifactType[] = [
      'html_page', 'html_game', 'website', 'api_spec', 'documentation', 'presentation',
      'logo', 'color_palette', 'icon',
      'source_code', 'shader', 'database_schema', 'test_suite',
      'character_sheet', 'world_map',
      'sprite_sheet', 'particle_config',
      'soundtrack', 'sound_effect',
    ];
    for (const t of required) expect(types).toContain(t);
  });

  it('canForge returns true for all built-in types', () => {
    const forge = new Forge();
    for (const t of forge.getSupportedTypes()) expect(forge.canForge(t)).toBe(true);
  });

  it('canForge returns false for physics_sim (no forger registered)', () => {
    const forge = new Forge();
    expect(forge.canForge('physics_sim')).toBe(false);
  });

  it('getForgerForType returns the correct forger for each domain', () => {
    const forge = new Forge();
    expect(forge.getForgerForType('html_page')?.name).toBe('WebForger');
    expect(forge.getForgerForType('logo')?.name).toBe('DesignForger');
    expect(forge.getForgerForType('source_code')?.name).toBe('CodeForger');
    expect(forge.getForgerForType('character_sheet')?.name).toBe('CreativeForger');
    expect(forge.getForgerForType('sprite_sheet')?.name).toBe('AssetForger');
    expect(forge.getForgerForType('soundtrack')?.name).toBe('AudioForger');
  });

  it('getForgerForType returns undefined for unknown type', () => {
    expect(new Forge().getForgerForType('physics_sim')).toBeUndefined();
  });

  it('forge routes html_page to WebForger', () => {
    assertArtifact(new Forge().forge(richSeed, { type: 'html_page' }), 'html_page', 'text/html');
  });

  it('forge routes logo to DesignForger', () => {
    assertArtifact(new Forge().forge(richSeed, { type: 'logo' }), 'logo', 'image/svg+xml');
  });

  it('forge routes source_code to CodeForger', () => {
    assertArtifact(new Forge().forge(richSeed, { type: 'source_code' }), 'source_code', 'text/typescript');
  });

  it('forge routes character_sheet to CreativeForger', () => {
    assertArtifact(new Forge().forge(richSeed, { type: 'character_sheet' }), 'character_sheet', 'text/html');
  });

  it('forge routes sprite_sheet to AssetForger', () => {
    assertArtifact(new Forge().forge(richSeed, { type: 'sprite_sheet' }), 'sprite_sheet', 'application/json');
  });

  it('forge routes soundtrack to AudioForger', () => {
    assertArtifact(new Forge().forge(richSeed, { type: 'soundtrack' }), 'soundtrack', 'application/json');
  });

  it('forge throws with descriptive message for unknown type', () => {
    expect(() => new Forge().forge(richSeed, { type: 'physics_sim' as ArtifactType })).toThrow(
      /No forger available for artifact type/,
    );
  });

  it('forge error message lists at least one supported type', () => {
    try {
      new Forge().forge(richSeed, { type: 'physics_sim' as ArtifactType });
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('html_page');
    }
  });

  it('forgeAll with no argument produces one artifact per supported type', () => {
    const forge = new Forge();
    const arts = forge.forgeAll(richSeed);
    expect(arts.length).toBe(forge.getSupportedTypes().length);
  });

  it('forgeAll with explicit type list produces matching artifacts in order', () => {
    const forge = new Forge();
    const arts = forge.forgeAll(richSeed, ['logo', 'soundtrack']);
    expect(arts.length).toBe(2);
    expect(arts[0]!.type).toBe('logo');
    expect(arts[1]!.type).toBe('soundtrack');
  });

  it('forgeAll silently skips unsupported types', () => {
    const forge = new Forge();
    const arts = forge.forgeAll(richSeed, ['physics_sim' as ArtifactType, 'logo']);
    expect(arts.length).toBe(1);
    expect(arts[0]!.type).toBe('logo');
  });

  it('registerForger adds a custom forger', () => {
    const forge = new Forge();
    const customForger: ForgerStrategy = {
      name: 'CustomForger',
      supportedTypes: ['physics_sim'],
      canForge: (t) => t === 'physics_sim',
      forge: (seed, _opts) => ({
        type: 'physics_sim',
        name: `${seed.$name}-sim`,
        content: JSON.stringify({ seed: seed.$hash }),
        mimeType: 'application/json',
        size: JSON.stringify({ seed: seed.$hash }).length,
        metadata: {},
      }),
    };
    forge.registerForger(customForger);

    expect(forge.canForge('physics_sim')).toBe(true);
    expect(forge.getSupportedTypes()).toContain('physics_sim');

    const art = forge.forge(richSeed, { type: 'physics_sim' });
    expect(art.type).toBe('physics_sim');
    expect(art.content).toContain(richSeed.$hash);
  });

  it('forgeAll uses registered custom forger', () => {
    const forge = new Forge();
    forge.registerForger({
      name: 'PhysicsForger',
      supportedTypes: ['physics_sim'],
      canForge: (t) => t === 'physics_sim',
      forge: () => ({
        type: 'physics_sim',
        name: 'physics.json',
        content: '{"sim":true}',
        mimeType: 'application/json',
        size: 12,
        metadata: {},
      }),
    });
    const arts = forge.forgeAll(richSeed, ['physics_sim']);
    expect(arts.length).toBe(1);
    expect(arts[0]!.type).toBe('physics_sim');
  });
});

// ─────────────────────────────────────────────
// ForgeError
// ─────────────────────────────────────────────

describe('ForgeError', () => {
  it('stores name, message, artifactType, seedHash', () => {
    const err = new ForgeError('generation failed', 'logo', 'abc123');
    expect(err.name).toBe('ForgeError');
    expect(err.message).toBe('generation failed');
    expect(err.artifactType).toBe('logo');
    expect(err.seedHash).toBe('abc123');
    expect(err.cause).toBeUndefined();
  });

  it('stores wrapped cause error', () => {
    const root = new Error('root');
    const err = new ForgeError('wrapped', 'shader', 'deadbeef', root);
    expect(err.cause).toBe(root);
  });

  it('is instanceof Error', () => {
    const err = new ForgeError('test', 'source_code', 'h1');
    expect(err instanceof Error).toBe(true);
  });

  it('prototype chain is intact for instanceof checks', () => {
    const err = new ForgeError('test', 'soundtrack', 'h2');
    expect(err instanceof ForgeError).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Utility helpers — getNumericGene
// ─────────────────────────────────────────────

describe('getNumericGene', () => {
  it('returns scalar gene value', () => {
    expect(getNumericGene(richSeed, 'health', 0)).toBe(75);
  });

  it('returns first element of vector gene', () => {
    expect(getNumericGene(richSeed, 'color', 0)).toBeCloseTo(0.9);
  });

  it('returns fallback for absent key', () => {
    expect(getNumericGene(richSeed, 'nonexistent', 42)).toBe(42);
  });

  it('returns fallback for categorical gene', () => {
    expect(getNumericGene(richSeed, 'element', 99)).toBe(99);
  });

  it('returns fallback for empty vector gene', () => {
    const s = makeTestSeed('EmptyVec', 'organism', {
      v: { type: 'vector' as const, value: [], dimensions: 0 },
    });
    expect(getNumericGene(s, 'v', -1)).toBe(-1);
  });
});

// ─────────────────────────────────────────────
// Utility helpers — getStringGene
// ─────────────────────────────────────────────

describe('getStringGene', () => {
  it('returns categorical value', () => {
    expect(getStringGene(richSeed, 'element', 'default')).toBe('fire');
  });

  it('returns expression source', () => {
    expect(getStringGene(richSeed, 'formula', '')).toBe('health * 2 + speed');
  });

  it('returns fallback for absent key', () => {
    expect(getStringGene(richSeed, 'missing', 'fallback')).toBe('fallback');
  });

  it('returns fallback for scalar gene', () => {
    expect(getStringGene(richSeed, 'health', 'fb')).toBe('fb');
  });
});

// ─────────────────────────────────────────────
// Utility helpers — getVectorGene
// ─────────────────────────────────────────────

describe('getVectorGene', () => {
  it('returns full vector array', () => {
    expect(getVectorGene(richSeed, 'color', [])).toEqual([0.9, 0.3, 0.1]);
  });

  it('wraps scalar value in single-element array', () => {
    expect(getVectorGene(richSeed, 'health', [])).toEqual([75]);
  });

  it('returns fallback for absent key', () => {
    expect(getVectorGene(richSeed, 'missing', [1, 2])).toEqual([1, 2]);
  });

  it('returns fallback for categorical gene', () => {
    expect(getVectorGene(richSeed, 'element', [0])).toEqual([0]);
  });
});

// ─────────────────────────────────────────────
// Utility helpers — collectScalars / collectVectors / collectCategoricals
// ─────────────────────────────────────────────

describe('collectScalars', () => {
  it('returns all scalar values in gene-definition order', () => {
    const result = collectScalars(richSeed);
    expect(result).toContain(75);
    expect(result).toContain(40);
    expect(result.length).toBe(2);
  });

  it('returns empty array for seed with no scalars', () => {
    expect(collectScalars(emptySeed)).toEqual([]);
  });
});

describe('collectVectors', () => {
  it('returns flattened vector values', () => {
    const result = collectVectors(richSeed);
    expect(result).toContain(0.9);
    expect(result).toContain(0.3);
    expect(result).toContain(0.1);
    expect(result.length).toBe(3);
  });

  it('returns empty array when no vector genes exist', () => {
    expect(collectVectors(minimalSeed)).toEqual([]);
  });
});

describe('collectCategoricals', () => {
  it('returns categorical string values', () => {
    const result = collectCategoricals(richSeed);
    expect(result).toContain('fire');
    expect(result.length).toBe(1);
  });

  it('returns empty array when no categorical genes exist', () => {
    expect(collectCategoricals(minimalSeed)).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// getGeneValue
// ─────────────────────────────────────────────

describe('getGeneValue', () => {
  it('returns scalar gene value', () => {
    expect(getGeneValue(richSeed, 'health', null)).toBe(75);
  });

  it('returns categorical gene value', () => {
    expect(getGeneValue(richSeed, 'element', null)).toBe('fire');
  });

  it('returns vector gene array', () => {
    expect(getGeneValue(richSeed, 'color', null)).toEqual([0.9, 0.3, 0.1]);
  });

  it('returns expression source string', () => {
    expect(getGeneValue(richSeed, 'formula', null)).toBe('health * 2 + speed');
  });

  it('returns struct value object', () => {
    const structSeed = makeTestSeed('StructTest', 'organism', {
      abilities: {
        type: 'struct' as const,
        value: {
          str: { type: 'scalar' as const, value: 10, min: 0, max: 20 },
          dex: { type: 'scalar' as const, value: 15, min: 0, max: 20 },
        },
      },
    });
    const v = getGeneValue(structSeed, 'abilities', null) as Record<string, unknown>;
    expect(v).toBeDefined();
    expect(typeof v).toBe('object');
    // struct value is a Record<string, Gene>
    const strGene = v['str'] as { type: string; value: number };
    expect(strGene.type).toBe('scalar');
    expect(strGene.value).toBe(10);
  });

  it('returns fallback for absent key', () => {
    expect(getGeneValue(richSeed, 'not_there', 'default')).toBe('default');
  });

  it('returns array gene value when gene type is array', () => {
    const s = makeTestSeed('ArraySeed', 'organism', {
      items: {
        type: 'array' as const,
        value: [{ type: 'scalar' as const, value: 1, min: 0, max: 10 }],
      },
    });
    const result = getGeneValue(s, 'items', 'fallback');
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns fallback for graph gene type', () => {
    const s = makeTestSeed('GraphSeed', 'organism', {
      g: { type: 'graph' as const, nodes: new Map(), edges: [] },
    });
    expect(getGeneValue(s, 'g', 'fallback')).toBe('fallback');
  });

  it('returns fallback for tensor gene type', () => {
    const s = makeTestSeed('TensorSeed', 'organism', {
      t: { type: 'tensor' as const, data: new Float64Array([1, 2, 3]), shape: [3] },
    });
    expect(getGeneValue(s, 't', 'fallback')).toBe('fallback');
  });

  it('returns fallback for timeseries gene type', () => {
    const s = makeTestSeed('TSSeed', 'organism', {
      ts: { type: 'timeseries' as const, keyframes: [{ t: 0, v: 1 }] },
    });
    expect(getGeneValue(s, 'ts', 'fallback')).toBe('fallback');
  });
});

// ─────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────

describe('Determinism', () => {
  it('forging the same seed twice produces identical html_page content', () => {
    const forge = new Forge();
    const opts: ForgeOptions = { type: 'html_page' };
    expect(forge.forge(richSeed, opts).content).toBe(forge.forge(richSeed, opts).content);
  });

  it('forging the same seed twice produces identical logo SVG', () => {
    const forge = new Forge();
    const a1 = forge.forge(richSeed, { type: 'logo' });
    const a2 = forge.forge(richSeed, { type: 'logo' });
    expect(a1.content).toBe(a2.content);
  });

  it('forging the same seed twice produces identical shader GLSL', () => {
    const forge = new Forge();
    expect(forge.forge(richSeed, { type: 'shader' }).content)
      .toBe(forge.forge(richSeed, { type: 'shader' }).content);
  });
});

// ─────────────────────────────────────────────
// forgeAll exhaustive smoke test
// ─────────────────────────────────────────────

describe('forgeAll exhaustive smoke test', () => {
  it('richSeed produces valid non-empty artifacts for every supported type', () => {
    const forge = new Forge();
    const arts = forge.forgeAll(richSeed);
    expect(arts.length).toBeGreaterThan(0);
    for (const art of arts) {
      expect(art.content.length).toBeGreaterThan(0);
      expect(art.size).toBe(art.content.length);
      expect(typeof art.name).toBe('string');
      expect(typeof art.mimeType).toBe('string');
    }
  });

  it('minimalSeed does not throw for any supported type', () => {
    expect(() => new Forge().forgeAll(minimalSeed)).not.toThrow();
  });

  it('emptySeed does not throw for any supported type', () => {
    expect(() => new Forge().forgeAll(emptySeed)).not.toThrow();
  });
});
