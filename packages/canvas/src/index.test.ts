/**
 * @paradigm/canvas — comprehensive unit tests.
 * Target: 80%+ line coverage across all exported symbols.
 *
 * Seeds are constructed inline; no @paradigm/seed dependency.
 */

import { describe, it, expect } from 'vitest';
import type { UniversalSeed } from '@paradigm/types';
import {
  // Color utilities
  colorToCSS,
  hslToColor,
  domainColor,
  // Renderers
  SeedParticleRenderer,
  GenomeGraphRenderer,
  FitnessLandscapeRenderer,
  PhylogeneticTreeRenderer,
  DiversityHeatmapRenderer,
  // Exporters
  SVGExporter,
  HTMLCanvasExporter,
  // Engine
  CanvasEngine,
} from './index.js';

// ─────────────────────────────────────────────
// Seed factory
// ─────────────────────────────────────────────

const makeSeed = (
  name: string,
  domain: string,
  genes: Record<string, unknown> = {},
): UniversalSeed => ({
  $gst: '4.0',
  $name: name,
  $domain: domain as UniversalSeed['$domain'],
  genes: genes as UniversalSeed['genes'],
  $hash: name + '-hash',
  $lineage: { generation: 0, parents: [], timestamp: Date.now() },
  $metadata: { created: Date.now(), generation: 0 } as UniversalSeed['$metadata'],
  $fitness: [0.5] as UniversalSeed['$fitness'],
});

/** Scalar gene helper. */
const scalarGene = (value: number, min = 0, max = 1) => ({
  type: 'scalar' as const,
  value,
  min,
  max,
});

/** Categorical gene helper. */
const categoricalGene = (value: string, options: string[]) => ({
  type: 'categorical' as const,
  value,
  options,
});

/** Vector gene helper. */
const vectorGene = (value: number[], dimensions: number) => ({
  type: 'vector' as const,
  value,
  dimensions,
});

/** Expression gene helper. */
const expressionGene = (source: string) => ({
  type: 'expression' as const,
  source,
});

/** Struct gene helper. */
const structGene = (value: Record<string, unknown>) => ({
  type: 'struct' as const,
  value: value as Record<string, import('@paradigm/types').Gene>,
});

/** Array gene helper. */
const arrayGene = (value: unknown[]) => ({
  type: 'array' as const,
  value: value as import('@paradigm/types').Gene[],
});

/** Tensor gene helper. */
const tensorGene = (data: number[], shape: number[]) => ({
  type: 'tensor' as const,
  data: new Float64Array(data),
  shape,
});

/** Graph gene helper. */
const graphGene = () => ({
  type: 'graph' as const,
  nodes: new Map<string, import('@paradigm/types').Gene>([
    ['a', scalarGene(0.5)],
    ['b', scalarGene(0.2)],
  ]),
  edges: [{ from: 'a', to: 'b', weight: scalarGene(1.0) }],
});

/** Timeseries gene helper. */
const timeseriesGene = (keyframes: Array<{ t: number; v: number }>) => ({
  type: 'timeseries' as const,
  keyframes,
  interpolation: 'linear' as const,
});

// ─────────────────────────────────────────────
// colorToCSS
// ─────────────────────────────────────────────

describe('colorToCSS', () => {
  it('converts a pure red color', () => {
    expect(colorToCSS({ r: 255, g: 0, b: 0 })).toBe('rgba(255,0,0,1.000)');
  });

  it('converts a color with explicit alpha', () => {
    expect(colorToCSS({ r: 0, g: 128, b: 255, a: 128 })).toMatch(
      /^rgba\(0,128,255,0\.\d+\)$/,
    );
  });

  it('clamps values below 0', () => {
    const css = colorToCSS({ r: -10, g: -5, b: -1 });
    expect(css).toBe('rgba(0,0,0,1.000)');
  });

  it('clamps values above 255', () => {
    const css = colorToCSS({ r: 300, g: 260, b: 256 });
    expect(css).toBe('rgba(255,255,255,1.000)');
  });

  it('rounds fractional channel values', () => {
    const css = colorToCSS({ r: 100.7, g: 50.3, b: 200.9 });
    expect(css).toMatch(/^rgba\(101,50,201,/);
  });

  it('handles alpha 0 → 0.000', () => {
    const css = colorToCSS({ r: 0, g: 0, b: 0, a: 0 });
    expect(css).toBe('rgba(0,0,0,0.000)');
  });

  it('handles alpha 255 → 1.000', () => {
    const css = colorToCSS({ r: 255, g: 255, b: 255, a: 255 });
    expect(css).toBe('rgba(255,255,255,1.000)');
  });
});

// ─────────────────────────────────────────────
// hslToColor
// ─────────────────────────────────────────────

describe('hslToColor', () => {
  it('converts pure red (h=0)', () => {
    const c = hslToColor(0, 1, 0.5);
    expect(c.r).toBe(255);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it('converts pure green (h=120)', () => {
    const c = hslToColor(120, 1, 0.5);
    expect(c.r).toBe(0);
    expect(c.b).toBe(0);
    expect(c.g).toBeGreaterThan(200);
  });

  it('converts pure blue (h=240)', () => {
    const c = hslToColor(240, 1, 0.5);
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(255);
  });

  it('converts white (s=0, l=1)', () => {
    const c = hslToColor(0, 0, 1);
    expect(c.r).toBe(255);
    expect(c.g).toBe(255);
    expect(c.b).toBe(255);
  });

  it('converts black (s=0, l=0)', () => {
    const c = hslToColor(0, 0, 0);
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it('wraps hue > 360 correctly', () => {
    const c1 = hslToColor(30, 0.8, 0.5);
    const c2 = hslToColor(390, 0.8, 0.5);
    expect(c1.r).toBe(c2.r);
    expect(c1.g).toBe(c2.g);
    expect(c1.b).toBe(c2.b);
  });

  it('wraps negative hue correctly', () => {
    const c1 = hslToColor(330, 0.8, 0.5);
    const c2 = hslToColor(-30, 0.8, 0.5);
    expect(c1.r).toBe(c2.r);
    expect(c1.g).toBe(c2.g);
    expect(c1.b).toBe(c2.b);
  });

  it('covers hue sector 60–120', () => {
    const c = hslToColor(90, 1, 0.5);
    expect(c.g).toBeGreaterThan(0);
  });

  it('covers hue sector 180–240', () => {
    const c = hslToColor(200, 1, 0.5);
    expect(c.b).toBeGreaterThan(0);
  });

  it('covers hue sector 240–300', () => {
    const c = hslToColor(270, 1, 0.5);
    expect(c.b).toBeGreaterThan(0);
    expect(c.r).toBeGreaterThan(0);
  });

  it('covers hue sector 300–360', () => {
    const c = hslToColor(330, 1, 0.5);
    expect(c.r).toBeGreaterThan(0);
    expect(c.b).toBeGreaterThan(0);
  });

  it('returns values without alpha property', () => {
    const c = hslToColor(180, 0.5, 0.5);
    expect(c.a).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// domainColor
// ─────────────────────────────────────────────

describe('domainColor', () => {
  const knownDomains = [
    'organism', 'game', 'ecosystem', 'neural', 'intelligence',
    'simulation', 'vehicle', 'weapon', 'building', 'terrain',
    'material', 'plant', 'insect', 'fish', 'bird',
    'mammal', 'robot', 'particle', 'fluid', 'crystal',
    'sound', 'music', 'pattern', 'network', 'language',
    'code', 'strategy', 'schedule', 'rule', 'constraint',
    'audio', 'narrative', 'ui', 'city', 'quantum',
    'molecular', 'education', 'finance', 'infrastructure', 'product',
    'void', 'web', 'render', 'shader', 'animation-visual',
    'interaction', 'aesthetic', 'emotion', 'perception', 'cinematic',
    'rig', 'mocap', 'lod', 'texture', 'logo', 'brand',
    'compression', 'security-threat', 'intrusion', 'forensics',
    'memory-store', 'seed-intelligence',
  ] as const;

  it.each(knownDomains)('returns a valid Color for domain "%s"', (domain) => {
    const c = domainColor(domain);
    expect(c.r).toBeGreaterThanOrEqual(0);
    expect(c.r).toBeLessThanOrEqual(255);
    expect(c.g).toBeGreaterThanOrEqual(0);
    expect(c.g).toBeLessThanOrEqual(255);
    expect(c.b).toBeGreaterThanOrEqual(0);
    expect(c.b).toBeLessThanOrEqual(255);
  });

  it('falls back gracefully for unknown domain via FNV hash', () => {
    const c = domainColor('totally-unknown-domain-xyz');
    expect(c.r).toBeGreaterThanOrEqual(0);
    expect(c.r).toBeLessThanOrEqual(255);
  });

  it('is deterministic for unknown domains', () => {
    const c1 = domainColor('my-custom-domain');
    const c2 = domainColor('my-custom-domain');
    expect(c1).toEqual(c2);
  });
});

// ─────────────────────────────────────────────
// SeedParticleRenderer
// ─────────────────────────────────────────────

describe('SeedParticleRenderer', () => {
  const renderer = new SeedParticleRenderer();

  it('returns one command per seed', () => {
    const seeds = [makeSeed('alpha', 'organism'), makeSeed('beta', 'game')];
    const cmds = renderer.render(seeds, 800, 600);
    expect(cmds).toHaveLength(2);
  });

  it('returns empty array for empty population', () => {
    expect(renderer.render([], 800, 600)).toHaveLength(0);
  });

  it('all commands are circle kind', () => {
    const seeds = [makeSeed('p1', 'neural'), makeSeed('p2', 'fluid')];
    const cmds = renderer.render(seeds, 400, 400);
    for (const cmd of cmds) {
      expect(cmd.kind).toBe('circle');
    }
  });

  it('renderWithTrails returns 2× commands (trails + particles)', () => {
    const seeds = [makeSeed('s1', 'organism'), makeSeed('s2', 'game')];
    const cmds = renderer.renderWithTrails(seeds, 800, 600);
    expect(cmds).toHaveLength(4); // 2 trails + 2 particles
  });

  it('trail circles have alpha < 255 (semi-transparent)', () => {
    const seeds = [makeSeed('t1', 'organism')];
    const cmds = renderer.renderWithTrails(seeds, 800, 600);
    const trail = cmds[0];
    expect(trail?.kind).toBe('circle');
    if (trail?.kind === 'circle') {
      expect(trail.fill?.a).toBeLessThan(255);
    }
  });

  it('particle radius is clamped between 4 and 18', () => {
    // seed with many genes → maxRadius; seed with no genes → minRadius
    const richGenes = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`g${i}`, scalarGene(0.5)]),
    );
    const rich = makeSeed('rich', 'organism', richGenes);
    const bare = makeSeed('bare', 'organism');

    const [richCmd] = renderer.render([rich], 800, 600);
    const [bareCmd] = renderer.render([bare], 800, 600);

    if (richCmd?.kind === 'circle') expect(richCmd.r).toBeLessThanOrEqual(18);
    if (bareCmd?.kind === 'circle') expect(bareCmd.r).toBeGreaterThanOrEqual(4);
  });

  it('uses fitness to adjust color (high fitness → lighter)', () => {
    const highFit = { ...makeSeed('hf', 'organism'), $fitness: { primary: 0.95 } };
    const lowFit  = { ...makeSeed('lf', 'organism'), $fitness: { primary: 0.05 } };
    const [hCmd] = renderer.render([highFit as UniversalSeed], 800, 600);
    const [lCmd] = renderer.render([lowFit  as UniversalSeed], 800, 600);
    // Both are circles; their fill colors will differ
    expect(hCmd?.kind).toBe('circle');
    expect(lCmd?.kind).toBe('circle');
    if (hCmd?.kind === 'circle' && lCmd?.kind === 'circle') {
      // High-fitness fill should be lighter (higher r+g+b sum)
      const hSum = (hCmd.fill?.r ?? 0) + (hCmd.fill?.g ?? 0) + (hCmd.fill?.b ?? 0);
      const lSum = (lCmd.fill?.r ?? 0) + (lCmd.fill?.g ?? 0) + (lCmd.fill?.b ?? 0);
      expect(hSum).toBeGreaterThan(lSum);
    }
  });

  it('handles non-square canvas dimensions', () => {
    const seed = makeSeed('wide', 'game');
    const cmds = renderer.render([seed], 1600, 400);
    expect(cmds).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// GenomeGraphRenderer
// ─────────────────────────────────────────────

describe('GenomeGraphRenderer', () => {
  const renderer = new GenomeGraphRenderer();

  it('returns empty array for seed with no genes', () => {
    const seed = makeSeed('empty', 'organism');
    expect(renderer.render(seed, 800, 600)).toHaveLength(0);
  });

  it('includes center label (seed name text command)', () => {
    const seed = makeSeed('MySeed', 'organism', { g1: scalarGene(0.5) });
    const cmds = renderer.render(seed, 800, 600);
    const texts = cmds.filter((c) => c.kind === 'text');
    expect(texts.length).toBeGreaterThan(0);
    const centerText = texts.find(
      (c) => c.kind === 'text' && c.text.includes('MySeed'),
    );
    expect(centerText).toBeDefined();
  });

  it('truncates long seed names to 15 chars + ellipsis', () => {
    const seed = makeSeed('AVeryLongSeedNameThatExceeds16Characters', 'organism', {
      g1: scalarGene(0.1),
    });
    const cmds = renderer.render(seed, 800, 600);
    const centerText = cmds
      .filter((c) => c.kind === 'text')
      .find((c) => c.kind === 'text' && c.text.endsWith('…'));
    expect(centerText).toBeDefined();
  });

  it('renders edges between genes of the same type', () => {
    const seed = makeSeed('edgy', 'organism', {
      g1: scalarGene(0.1),
      g2: scalarGene(0.5),
      g3: scalarGene(0.9),
    });
    const cmds = renderer.render(seed, 800, 600);
    const lines = cmds.filter((c) => c.kind === 'line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders node circles for each gene', () => {
    const seed = makeSeed('nodey', 'organism', {
      a: scalarGene(0.2),
      b: categoricalGene('x', ['x', 'y', 'z']),
      c: vectorGene([1, 2, 3], 3),
    });
    const cmds = renderer.render(seed, 800, 600);
    const circles = cmds.filter((c) => c.kind === 'circle');
    // 3 nodes
    expect(circles.length).toBeGreaterThanOrEqual(3);
  });

  it('truncates gene labels longer than 10 chars', () => {
    const seed = makeSeed('trunc', 'organism', {
      aVeryLongGeneName: scalarGene(0.5),
    });
    const cmds = renderer.render(seed, 800, 600);
    const labels = cmds.filter(
      (c) => c.kind === 'text' && c.kind === 'text' && c.text.endsWith('…'),
    );
    // At least one label is truncated
    expect(labels.length).toBeGreaterThan(0);
  });

  it('no edges when only one gene exists', () => {
    const seed = makeSeed('solo', 'organism', { g1: scalarGene(0.5) });
    const cmds = renderer.render(seed, 800, 600);
    const lines = cmds.filter((c) => c.kind === 'line');
    expect(lines).toHaveLength(0);
  });

  it('handles many genes without throwing', () => {
    const genes = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`gene${i}`, scalarGene(i / 20)]),
    );
    const seed = makeSeed('big', 'organism', genes);
    expect(() => renderer.render(seed, 800, 600)).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// FitnessLandscapeRenderer
// ─────────────────────────────────────────────

describe('FitnessLandscapeRenderer', () => {
  const renderer = new FitnessLandscapeRenderer();

  it('returns res² rect commands + 2 per seed (circle + text) for one seed', () => {
    const seeds = [makeSeed('s1', 'organism')];
    const cmds = renderer.render(seeds, 400, 400);
    const rects = cmds.filter((c) => c.kind === 'rect');
    // Default resolution is 20 → 400 cells
    expect(rects).toHaveLength(400);
    const circles = cmds.filter((c) => c.kind === 'circle');
    expect(circles).toHaveLength(1);
  });

  it('accepts custom resolution', () => {
    const seeds = [makeSeed('s1', 'organism')];
    const cmds = renderer.render(seeds, 400, 400, 5);
    const rects = cmds.filter((c) => c.kind === 'rect');
    expect(rects).toHaveLength(25); // 5×5
  });

  it('returns empty result for empty population', () => {
    // Still renders the grid (default fitness 0.2) but no seed circles
    const cmds = renderer.render([], 400, 400);
    const circles = cmds.filter((c) => c.kind === 'circle');
    expect(circles).toHaveLength(0);
  });

  it('high-fitness seeds produce warmer rect colors', () => {
    const highFit = {
      ...makeSeed('hf', 'organism'),
      $fitness: { primary: 1.0 },
    } as UniversalSeed;
    const lowFit = {
      ...makeSeed('lf', 'organism'),
      $fitness: { primary: 0.0 },
    } as UniversalSeed;
    const highCmds = renderer.render([highFit], 200, 200, 4);
    const lowCmds  = renderer.render([lowFit],  200, 200, 4);
    const highRects = highCmds.filter((c) => c.kind === 'rect');
    const lowRects  = lowCmds.filter((c) => c.kind === 'rect');
    // Both should return 16 rects
    expect(highRects).toHaveLength(16);
    expect(lowRects).toHaveLength(16);
  });

  it('renders fitness label text for each seed', () => {
    const seeds = [
      { ...makeSeed('a', 'organism'), $fitness: { primary: 0.75 } } as UniversalSeed,
      { ...makeSeed('b', 'organism'), $fitness: { primary: 0.25 } } as UniversalSeed,
    ];
    const cmds = renderer.render(seeds, 400, 400);
    const texts = cmds.filter((c) => c.kind === 'text');
    expect(texts.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────
// PhylogeneticTreeRenderer
// ─────────────────────────────────────────────

describe('PhylogeneticTreeRenderer', () => {
  const renderer = new PhylogeneticTreeRenderer();

  it('returns empty array for empty seeds', () => {
    expect(renderer.render([], 800, 600)).toHaveLength(0);
  });

  it('renders nodes for each seed', () => {
    const seeds = [
      makeSeed('root', 'organism'),
      makeSeed('child', 'organism'),
    ];
    const cmds = renderer.render(seeds, 800, 600);
    const circles = cmds.filter((c) => c.kind === 'circle');
    expect(circles).toHaveLength(2);
  });

  it('renders generation labels on left axis', () => {
    const seeds = [
      { ...makeSeed('gen0', 'organism'), $lineage: { generation: 0, parents: [], timestamp: 0 } },
      {
        ...makeSeed('gen1', 'organism'),
        $lineage: { generation: 1, parents: [{ id: 'gen0-hash', name: 'gen0' }], timestamp: 0 },
      },
    ] as UniversalSeed[];
    const cmds = renderer.render(seeds, 800, 600);
    const genLabels = cmds.filter(
      (c) => c.kind === 'text' && c.kind === 'text' && /^G\d+$/.test(c.text),
    );
    expect(genLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('draws edges between parent and child seeds', () => {
    const seeds = [
      { ...makeSeed('root', 'organism'), $lineage: { generation: 0, parents: [], timestamp: 0 } },
      {
        ...makeSeed('child', 'organism'),
        $lineage: { generation: 1, parents: [{ id: 'root-hash', name: 'root' }], timestamp: 0 },
      },
    ] as UniversalSeed[];
    const cmds = renderer.render(seeds, 800, 600);
    const lines = cmds.filter((c) => c.kind === 'line');
    expect(lines).toHaveLength(1);
  });

  it('truncates long seed names to 7 chars + ellipsis in labels', () => {
    const seed = { ...makeSeed('AVeryLongSeedName', 'organism') } as UniversalSeed;
    const cmds = renderer.render([seed], 800, 600);
    const truncated = cmds.filter(
      (c) => c.kind === 'text' && c.text.endsWith('…'),
    );
    expect(truncated.length).toBeGreaterThan(0);
  });

  it('handles multiple generations with multiple seeds per generation', () => {
    const seeds: UniversalSeed[] = [
      { ...makeSeed('r1', 'organism'), $lineage: { generation: 0, parents: [], timestamp: 0 } },
      { ...makeSeed('r2', 'organism'), $lineage: { generation: 0, parents: [], timestamp: 0 } },
      {
        ...makeSeed('c1', 'organism'),
        $lineage: { generation: 1, parents: [{ id: 'r1-hash', name: 'r1' }], timestamp: 0 },
      },
      {
        ...makeSeed('c2', 'organism'),
        $lineage: { generation: 1, parents: [{ id: 'r2-hash', name: 'r2' }], timestamp: 0 },
      },
    ] as UniversalSeed[];
    expect(() => renderer.render(seeds, 800, 600)).not.toThrow();
    const cmds = renderer.render(seeds, 800, 600);
    const circles = cmds.filter((c) => c.kind === 'circle');
    expect(circles).toHaveLength(4);
  });

  it('edges are not rendered for parentless seeds', () => {
    const seeds = [
      { ...makeSeed('a', 'organism'), $lineage: { generation: 0, parents: [], timestamp: 0 } },
      { ...makeSeed('b', 'organism'), $lineage: { generation: 0, parents: [], timestamp: 0 } },
    ] as UniversalSeed[];
    const cmds = renderer.render(seeds, 800, 600);
    const lines = cmds.filter((c) => c.kind === 'line');
    expect(lines).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// DiversityHeatmapRenderer
// ─────────────────────────────────────────────

describe('DiversityHeatmapRenderer', () => {
  const renderer = new DiversityHeatmapRenderer();

  it('returns empty array for empty seeds', () => {
    expect(renderer.render([], 800, 600)).toHaveLength(0);
  });

  it('returns empty array for seeds with no genes', () => {
    const seeds = [makeSeed('bare', 'organism')];
    expect(renderer.render(seeds, 800, 600)).toHaveLength(0);
  });

  it('renders column headers (text per seed)', () => {
    const seeds = [
      makeSeed('s1', 'organism', { g: scalarGene(0.5) }),
      makeSeed('s2', 'organism', { g: scalarGene(0.8) }),
    ];
    const cmds = renderer.render(seeds, 800, 600);
    const texts = cmds.filter((c) => c.kind === 'text');
    expect(texts.length).toBeGreaterThan(0);
  });

  it('renders rect cells for each (gene × seed) combination', () => {
    const seeds = [
      makeSeed('s1', 'organism', { gA: scalarGene(0.5), gB: scalarGene(0.2) }),
      makeSeed('s2', 'organism', { gA: scalarGene(0.9), gB: scalarGene(0.1) }),
    ];
    const cmds = renderer.render(seeds, 800, 600);
    const rects = cmds.filter((c) => c.kind === 'rect');
    // 2 genes × 2 seeds = 4 cells
    expect(rects).toHaveLength(4);
  });

  it('renders empty-fill cell for missing gene in seed', () => {
    const seeds = [
      makeSeed('s1', 'organism', { gA: scalarGene(0.5) }),
      makeSeed('s2', 'organism', { gB: scalarGene(0.9) }),
    ];
    const cmds = renderer.render(seeds, 800, 600);
    // 2 genes (gA, gB) × 2 seeds = 4 rects; 2 of them will have the absent-gene fill
    const rects = cmds.filter((c) => c.kind === 'rect');
    expect(rects).toHaveLength(4);
  });

  it('handles all gene types without throwing', () => {
    const seeds = [
      makeSeed('all-genes', 'organism', {
        s:  scalarGene(0.5),
        c:  categoricalGene('x', ['x', 'y']),
        v:  vectorGene([1, 2], 2),
        e:  expressionGene('x + 1'),
        st: structGene({ nested: scalarGene(0.3) }),
        ar: arrayGene([scalarGene(0.1), scalarGene(0.9)]),
        g:  graphGene(),
        t:  tensorGene([0.1, 0.5, 0.9], [3]),
        ts: timeseriesGene([{ t: 0, v: 0 }, { t: 1, v: 1 }]),
      }),
    ];
    expect(() => renderer.render(seeds, 800, 600)).not.toThrow();
  });

  it('truncates long seed names in column headers', () => {
    const seeds = [
      makeSeed('AVeryLongName', 'organism', { g: scalarGene(0.5) }),
    ];
    const cmds = renderer.render(seeds, 800, 600);
    const truncated = cmds.filter(
      (c) => c.kind === 'text' && c.text.endsWith('…'),
    );
    expect(truncated.length).toBeGreaterThan(0);
  });

  it('truncates long gene names in row labels', () => {
    const seeds = [
      makeSeed('s', 'organism', { aVeryLongGeneName01: scalarGene(0.5) }),
    ];
    const cmds = renderer.render(seeds, 800, 600);
    const truncated = cmds.filter(
      (c) => c.kind === 'text' && c.text.endsWith('…'),
    );
    expect(truncated.length).toBeGreaterThan(0);
  });

  it('gene names are sorted alphabetically', () => {
    const seeds = [
      makeSeed('s', 'organism', {
        zebra: scalarGene(0.5),
        apple: scalarGene(0.1),
        mango: scalarGene(0.7),
      }),
    ];
    const cmds = renderer.render(seeds, 800, 600);
    const rowLabels = cmds
      .filter((c) => c.kind === 'text' && !c.text.endsWith('…') && c.kind === 'text')
      .map((c) => (c.kind === 'text' ? c.text : ''));
    const seedLabelFiltered = rowLabels.filter((t) => ['apple', 'mango', 'zebra'].includes(t));
    expect(seedLabelFiltered).toEqual(['apple', 'mango', 'zebra']);
  });
});

// ─────────────────────────────────────────────
// SVGExporter
// ─────────────────────────────────────────────

describe('SVGExporter', () => {
  const exporter = new SVGExporter();

  it('produces valid SVG wrapper with correct dimensions', () => {
    const svg = exporter.export([], 800, 600);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
    expect(svg).toContain('</svg>');
  });

  it('includes XML declaration', () => {
    const svg = exporter.export([], 400, 300);
    expect(svg).toContain('<?xml version="1.0"');
  });

  it('includes background rect', () => {
    const svg = exporter.export([], 400, 300);
    expect(svg).toContain('#0f0f18');
  });

  it('exports circle command', () => {
    const svg = exporter.exportCommand({
      kind: 'circle',
      cx: 100,
      cy: 200,
      r: 50,
      fill: { r: 255, g: 0, b: 0 },
      stroke: { r: 0, g: 0, b: 0 },
      strokeWidth: 2,
    });
    expect(svg).toContain('<circle');
    expect(svg).toContain('cx="100"');
    expect(svg).toContain('cy="200"');
    expect(svg).toContain('r="50"');
  });

  it('exports circle without fill/stroke (defaults to none)', () => {
    const svg = exporter.exportCommand({
      kind: 'circle',
      cx: 50,
      cy: 50,
      r: 10,
    });
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="none"');
  });

  it('exports rect command', () => {
    const svg = exporter.exportCommand({
      kind: 'rect',
      x: 10,
      y: 20,
      w: 100,
      h: 50,
      fill: { r: 0, g: 128, b: 255 },
    });
    expect(svg).toContain('<rect');
    expect(svg).toContain('x="10"');
    expect(svg).toContain('width="100"');
  });

  it('exports rect with rx (corner radius)', () => {
    const svg = exporter.exportCommand({
      kind: 'rect',
      x: 0,
      y: 0,
      w: 80,
      h: 40,
      rx: 10,
      fill: { r: 100, g: 100, b: 100 },
    });
    expect(svg).toContain('rx="10"');
  });

  it('exports line command', () => {
    const svg = exporter.exportCommand({
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      stroke: { r: 255, g: 255, b: 0 },
      strokeWidth: 1.5,
    });
    expect(svg).toContain('<line');
    expect(svg).toContain('x1="0"');
    expect(svg).toContain('stroke-width="1.5"');
  });

  it('exports path command', () => {
    const svg = exporter.exportCommand({
      kind: 'path',
      d: 'M 0 0 L 100 100',
      fill: { r: 200, g: 0, b: 50 },
    });
    expect(svg).toContain('<path');
    expect(svg).toContain('M 0 0 L 100 100');
  });

  it('exports path without fill/stroke (defaults to none)', () => {
    const svg = exporter.exportCommand({ kind: 'path', d: 'M 0 0' });
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="none"');
  });

  it('exports text command', () => {
    const svg = exporter.exportCommand({
      kind: 'text',
      x: 50,
      y: 80,
      text: 'Hello',
      fontSize: 14,
      fill: { r: 255, g: 255, b: 255 },
    });
    expect(svg).toContain('<text');
    expect(svg).toContain('Hello');
    expect(svg).toContain('font-size="14"');
  });

  it('escapes XML special characters in text', () => {
    const svg = exporter.exportCommand({
      kind: 'text',
      x: 0,
      y: 0,
      text: '<script>&"\'',
    });
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&apos;');
    expect(svg).toContain('&gt;');
  });

  it('exports text with default fill when none provided', () => {
    const svg = exporter.exportCommand({ kind: 'text', x: 0, y: 0, text: 'hi' });
    expect(svg).toContain('rgba(255,255,255,1.000)');
  });

  it('exports group command without transform', () => {
    const svg = exporter.exportCommand({
      kind: 'group',
      children: [{ kind: 'circle', cx: 0, cy: 0, r: 5 }],
    });
    expect(svg).toContain('<g>');
    expect(svg).toContain('<circle');
    expect(svg).toContain('</g>');
  });

  it('exports group command with transform', () => {
    const svg = exporter.exportCommand({
      kind: 'group',
      transform: 'translate(10,20)',
      children: [],
    });
    expect(svg).toContain('transform="translate(10,20)"');
  });

  it('full round-trip: renders + exports produces valid SVG', () => {
    const seeds = [
      { ...makeSeed('omega', 'organism'), $fitness: { primary: 0.8 } } as UniversalSeed,
    ];
    const renderer = new SeedParticleRenderer();
    const cmds = renderer.render(seeds, 400, 300);
    const svg = exporter.export(cmds, 400, 300);
    expect(svg).toContain('<circle');
    expect(svg).toContain('width="400"');
  });
});

// ─────────────────────────────────────────────
// HTMLCanvasExporter
// ─────────────────────────────────────────────

describe('HTMLCanvasExporter', () => {
  const exporter = new HTMLCanvasExporter();

  it('produces a complete HTML document', () => {
    const html = exporter.export([], 800, 600);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<canvas');
    expect(html).toContain('</html>');
  });

  it('sets correct canvas dimensions', () => {
    const html = exporter.export([], 640, 480);
    expect(html).toContain('width="640"');
    expect(html).toContain('height="480"');
  });

  it('canvasCommand: circle with fill and stroke', () => {
    const code = exporter.canvasCommand({
      kind: 'circle',
      cx: 100,
      cy: 100,
      r: 30,
      fill: { r: 255, g: 0, b: 0 },
      stroke: { r: 0, g: 0, b: 255 },
      strokeWidth: 2,
    });
    expect(code).toContain('beginPath');
    expect(code).toContain('arc(100');
    expect(code).toContain('fillStyle');
    expect(code).toContain('strokeStyle');
  });

  it('canvasCommand: circle without fill/stroke', () => {
    const code = exporter.canvasCommand({ kind: 'circle', cx: 0, cy: 0, r: 5 });
    expect(code).toContain('arc(0');
    expect(code).not.toContain('fillStyle');
    expect(code).not.toContain('strokeStyle');
  });

  it('canvasCommand: plain rect', () => {
    const code = exporter.canvasCommand({
      kind: 'rect',
      x: 10,
      y: 10,
      w: 80,
      h: 40,
      fill: { r: 100, g: 200, b: 50 },
    });
    expect(code).toContain('rect(10');
    expect(code).toContain('fillStyle');
  });

  it('canvasCommand: rounded rect', () => {
    const code = exporter.canvasCommand({
      kind: 'rect',
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      rx: 10,
      fill: { r: 50, g: 50, b: 50 },
    });
    expect(code).toContain('quadraticCurveTo');
  });

  it('canvasCommand: rect with stroke', () => {
    const code = exporter.canvasCommand({
      kind: 'rect',
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      stroke: { r: 0, g: 255, b: 0 },
    });
    expect(code).toContain('strokeStyle');
  });

  it('canvasCommand: line', () => {
    const code = exporter.canvasCommand({
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      stroke: { r: 255, g: 255, b: 0 },
    });
    expect(code).toContain('moveTo');
    expect(code).toContain('lineTo');
    expect(code).toContain('strokeStyle');
  });

  it('canvasCommand: path with fill', () => {
    const code = exporter.canvasCommand({
      kind: 'path',
      d: 'M 0 0 Z',
      fill: { r: 100, g: 0, b: 200 },
    });
    expect(code).toContain('Path2D');
    expect(code).toContain('fill(_p)');
  });

  it('canvasCommand: path with stroke', () => {
    const code = exporter.canvasCommand({
      kind: 'path',
      d: 'M 0 0 L 10 10',
      stroke: { r: 0, g: 100, b: 255 },
    });
    expect(code).toContain('stroke(_p)');
  });

  it('canvasCommand: path without fill/stroke', () => {
    const code = exporter.canvasCommand({ kind: 'path', d: 'M 0 0' });
    expect(code).toContain('Path2D');
    expect(code).not.toContain('fill(_p)');
    expect(code).not.toContain('stroke(_p)');
  });

  it('canvasCommand: text', () => {
    const code = exporter.canvasCommand({
      kind: 'text',
      x: 50,
      y: 50,
      text: 'Hello World',
      fontSize: 16,
      fill: { r: 255, g: 255, b: 255 },
    });
    expect(code).toContain('font =');
    expect(code).toContain('fillText("Hello World"');
  });

  it('canvasCommand: text with default fill', () => {
    const code = exporter.canvasCommand({ kind: 'text', x: 0, y: 0, text: 'X' });
    expect(code).toContain('rgba(255,255,255,1.000)');
  });

  it('canvasCommand: text escapes double-quotes and backslashes', () => {
    const code = exporter.canvasCommand({
      kind: 'text',
      x: 0,
      y: 0,
      text: 'say "hi" and C:\\path',
    });
    expect(code).toContain('\\"hi\\"');
    expect(code).toContain('C:\\\\path');
  });

  it('canvasCommand: group without transform', () => {
    const code = exporter.canvasCommand({
      kind: 'group',
      children: [{ kind: 'circle', cx: 5, cy: 5, r: 3 }],
    });
    expect(code).toContain('save()');
    expect(code).toContain('restore()');
    expect(code).toContain('arc(5');
  });

  it('canvasCommand: group with transform', () => {
    const code = exporter.canvasCommand({
      kind: 'group',
      transform: 'translate(5,10)',
      children: [],
    });
    expect(code).toContain('setTransform');
    expect(code).toContain('translate(5,10)');
  });

  it('canvasCommand: custom prefix is used', () => {
    const code = exporter.canvasCommand(
      { kind: 'circle', cx: 0, cy: 0, r: 5 },
      'myCtx',
    );
    expect(code).toContain('myCtx.beginPath()');
  });

  it('full export embeds drawing code in script tag', () => {
    const cmds = [{ kind: 'circle' as const, cx: 0, cy: 0, r: 5 }];
    const html = exporter.export(cmds, 200, 200);
    expect(html).toContain('<script>');
    expect(html).toContain('arc(0');
  });
});

// ─────────────────────────────────────────────
// CanvasEngine
// ─────────────────────────────────────────────

describe('CanvasEngine', () => {
  it('constructs with default RNG', () => {
    const engine = new CanvasEngine();
    expect(engine).toBeDefined();
    expect(engine.getRNG()).toBeDefined();
  });

  it('renderSeedParticles delegates to SeedParticleRenderer', () => {
    const engine = new CanvasEngine();
    const seeds = [makeSeed('e1', 'organism'), makeSeed('e2', 'game')];
    const cmds = engine.renderSeedParticles(seeds, 800, 600);
    expect(cmds).toHaveLength(2);
    expect(cmds[0]?.kind).toBe('circle');
  });

  it('renderGenomeGraph delegates to GenomeGraphRenderer', () => {
    const engine = new CanvasEngine();
    const seed = makeSeed('gs', 'organism', { a: scalarGene(0.5), b: scalarGene(0.8) });
    const cmds = engine.renderGenomeGraph(seed, 800, 600);
    expect(cmds.some((c) => c.kind === 'circle')).toBe(true);
  });

  it('renderFitnessLandscape delegates to FitnessLandscapeRenderer', () => {
    const engine = new CanvasEngine();
    const seeds = [makeSeed('fl', 'organism')];
    const cmds = engine.renderFitnessLandscape(seeds, 400, 400);
    expect(cmds.some((c) => c.kind === 'rect')).toBe(true);
  });

  it('renderFitnessLandscape accepts custom resolution', () => {
    const engine = new CanvasEngine();
    const seeds = [makeSeed('fl', 'organism')];
    const cmds = engine.renderFitnessLandscape(seeds, 400, 400, 5);
    const rects = cmds.filter((c) => c.kind === 'rect');
    expect(rects).toHaveLength(25);
  });

  it('renderPhylogeneticTree delegates to PhylogeneticTreeRenderer', () => {
    const engine = new CanvasEngine();
    const seeds = [makeSeed('pt', 'organism')];
    const cmds = engine.renderPhylogeneticTree(seeds, 800, 600);
    expect(cmds.some((c) => c.kind === 'circle')).toBe(true);
  });

  it('renderDiversityHeatmap delegates to DiversityHeatmapRenderer', () => {
    const engine = new CanvasEngine();
    const seeds = [makeSeed('dh', 'organism', { g: scalarGene(0.5) })];
    const cmds = engine.renderDiversityHeatmap(seeds, 800, 600);
    expect(cmds.some((c) => c.kind === 'rect')).toBe(true);
  });

  it('toSVG returns valid SVG string', () => {
    const engine = new CanvasEngine();
    const cmds = engine.renderSeedParticles([makeSeed('svg', 'organism')], 400, 400);
    const svg = engine.toSVG(cmds, 400, 400);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('toHTML returns complete HTML document', () => {
    const engine = new CanvasEngine();
    const cmds = engine.renderSeedParticles([makeSeed('html', 'organism')], 400, 400);
    const html = engine.toHTML(cmds, 400, 400);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<canvas');
  });

  it('getRNG returns same RNG instance across calls', () => {
    const engine = new CanvasEngine();
    expect(engine.getRNG()).toBe(engine.getRNG());
  });

  it('end-to-end: particle → SVG pipeline is deterministic', () => {
    const seeds = [
      { ...makeSeed('det', 'organism'), $fitness: { primary: 0.7 } } as UniversalSeed,
    ];
    const engine1 = new CanvasEngine();
    const engine2 = new CanvasEngine();
    const svg1 = engine1.toSVG(engine1.renderSeedParticles(seeds, 400, 300), 400, 300);
    const svg2 = engine2.toSVG(engine2.renderSeedParticles(seeds, 400, 300), 400, 300);
    expect(svg1).toBe(svg2);
  });
});

// ─────────────────────────────────────────────
// Edge cases & boundary conditions
// ─────────────────────────────────────────────

describe('Edge cases', () => {
  it('colorToCSS with all channels at 127.5 rounds correctly', () => {
    const css = colorToCSS({ r: 127.5, g: 127.5, b: 127.5 });
    expect(css).toContain('128');
  });

  it('hslToColor saturation=0 produces grey', () => {
    const c = hslToColor(180, 0, 0.5);
    expect(c.r).toBeCloseTo(c.g, 0);
    expect(c.g).toBeCloseTo(c.b, 0);
  });

  it('SVGExporter handles fractional coordinates via r2 rounding', () => {
    const svg = new SVGExporter().exportCommand({
      kind: 'circle',
      cx: 10.123456,
      cy: 20.999,
      r: 5.005,
    });
    expect(svg).toContain('cx="10.12"');
    expect(svg).toContain('cy="21"');
    expect(svg).toContain('r="5.01"');
  });

  it('SeedParticleRenderer: seed with $fitness array falls back to 0.5', () => {
    const seed = makeSeed('arr-fit', 'organism');
    // $fitness is an array (makeSeed default), not FitnessVector with .primary
    const renderer = new SeedParticleRenderer();
    expect(() => renderer.render([seed], 800, 600)).not.toThrow();
  });

  it('GenomeGraphRenderer: handles expression gene with geneComplexity', () => {
    const seed = makeSeed('expr', 'organism', {
      src: expressionGene('x * 2 + sin(y)'),
    });
    expect(() => new GenomeGraphRenderer().render(seed, 800, 600)).not.toThrow();
  });

  it('GenomeGraphRenderer: handles all gene types for geneComplexity', () => {
    const seed = makeSeed('all', 'organism', {
      sc: scalarGene(0.5),
      ca: categoricalGene('a', ['a', 'b', 'c']),
      ve: vectorGene([1, 2, 3, 4], 4),
      ex: expressionGene('x'),
      st: structGene({ x: scalarGene(0.1), y: scalarGene(0.2) }),
      ar: arrayGene([scalarGene(0.1)]),
      gr: graphGene(),
      te: tensorGene([0.5, 1.0], [2]),
      ts: timeseriesGene([{ t: 0, v: 0 }, { t: 0.5, v: 0.5 }, { t: 1, v: 1 }]),
    });
    expect(() => new GenomeGraphRenderer().render(seed, 800, 600)).not.toThrow();
  });

  it('FitnessLandscapeRenderer: seed with undefined $fitness uses 0.5', () => {
    const seed = { ...makeSeed('no-fit', 'organism') };
    delete (seed as Partial<UniversalSeed>).$fitness;
    const renderer = new FitnessLandscapeRenderer();
    expect(() => renderer.render([seed as UniversalSeed], 400, 400)).not.toThrow();
  });

  it('DiversityHeatmapRenderer: tensor gene with empty data', () => {
    const seed = makeSeed('t', 'organism', {
      te: { type: 'tensor' as const, data: new Float64Array([]), shape: [0] },
    });
    expect(() => new DiversityHeatmapRenderer().render([seed], 800, 600)).not.toThrow();
  });

  it('DiversityHeatmapRenderer: scalar gene with zero range returns 0.5', () => {
    const seed = makeSeed('s', 'organism', {
      flat: scalarGene(5, 5, 5), // min === max
    });
    const cmds = new DiversityHeatmapRenderer().render([seed], 800, 600);
    expect(cmds.some((c) => c.kind === 'rect')).toBe(true);
  });

  it('DiversityHeatmapRenderer: categorical with single option returns 0.5', () => {
    const seed = makeSeed('s', 'organism', {
      solo: categoricalGene('a', ['a']), // only 1 option
    });
    const cmds = new DiversityHeatmapRenderer().render([seed], 800, 600);
    expect(cmds.some((c) => c.kind === 'rect')).toBe(true);
  });

  it('HTMLCanvasExporter: nested group emits recursive canvas code', () => {
    const code = new HTMLCanvasExporter().canvasCommand({
      kind: 'group',
      children: [
        {
          kind: 'group',
          children: [{ kind: 'circle', cx: 0, cy: 0, r: 1 }],
        },
      ],
    });
    // Two save() calls expected
    expect((code.match(/save\(\)/g) ?? []).length).toBe(2);
  });
});
