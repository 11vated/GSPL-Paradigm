/**
 * @paradigm/canvas — Creative visualization layer for GSPL Paradigm.
 *
 * Renders seeds, genomes, fitness landscapes, phylogenetic trees, and diversity
 * heatmaps as deterministic, framework-agnostic render command trees.
 * Outputs to SVG strings or standalone HTML Canvas pages.
 *
 * Dependencies: @paradigm/types (Layer 0), @paradigm/rng (Layer 0).
 * No external npm packages. No DOM API at module level.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, Gene, SeedDomain } from '@paradigm/types';
import { DeterministicRNG, fnv1aHash } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Primitive geometry interfaces
// ─────────────────────────────────────────────

/** RGBA color value. All channels are [0, 255]; alpha defaults to 255. */
export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** 2-D Cartesian point. */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned rectangle. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─────────────────────────────────────────────
// RenderCommand — discriminated union
// ─────────────────────────────────────────────

/** Circle render command. */
export interface CircleCommand {
  readonly kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill?: Color;
  stroke?: Color;
  strokeWidth?: number;
}

/** Rectangle render command with optional corner radius. */
export interface RectCommand {
  readonly kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: Color;
  stroke?: Color;
  rx?: number;
}

/** Line segment render command. */
export interface LineCommand {
  readonly kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: Color;
  strokeWidth?: number;
}

/** SVG path render command. */
export interface PathCommand {
  readonly kind: 'path';
  d: string;
  fill?: Color;
  stroke?: Color;
}

/** Text label render command. */
export interface TextCommand {
  readonly kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fill?: Color;
}

/** Group of child commands with optional CSS/SVG transform. */
export interface GroupCommand {
  readonly kind: 'group';
  children: RenderCommand[];
  transform?: string;
}

/** All render command variants. */
export type RenderCommand =
  | CircleCommand
  | RectCommand
  | LineCommand
  | PathCommand
  | TextCommand
  | GroupCommand;

// ─────────────────────────────────────────────
// Color utilities
// ─────────────────────────────────────────────

/**
 * Serialize a Color to a CSS rgba() string.
 * Alpha is normalized from [0,255] to [0,1].
 */
export function colorToCSS(c: Color): string {
  const r = Math.round(Math.max(0, Math.min(255, c.r)));
  const g = Math.round(Math.max(0, Math.min(255, c.g)));
  const b = Math.round(Math.max(0, Math.min(255, c.b)));
  const a = c.a !== undefined ? c.a / 255 : 1;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/**
 * Convert HSL color values to an RGB Color.
 *
 * @param h - Hue in degrees [0, 360).
 * @param s - Saturation as a fraction [0, 1].
 * @param l - Lightness as a fraction [0, 1].
 */
export function hslToColor(h: number, s: number, l: number): Color {
  const hNorm = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = l - c / 2;

  let r0 = 0;
  let g0 = 0;
  let b0 = 0;

  if (hNorm < 60) { r0 = c; g0 = x; b0 = 0; }
  else if (hNorm < 120) { r0 = x; g0 = c; b0 = 0; }
  else if (hNorm < 180) { r0 = 0; g0 = c; b0 = x; }
  else if (hNorm < 240) { r0 = 0; g0 = x; b0 = c; }
  else if (hNorm < 300) { r0 = x; g0 = 0; b0 = c; }
  else { r0 = c; g0 = 0; b0 = x; }

  return {
    r: Math.round((r0 + m) * 255),
    g: Math.round((g0 + m) * 255),
    b: Math.round((b0 + m) * 255),
  };
}

/**
 * Map a seed domain to a visually distinct Color.
 * Uses a fixed palette for predictable cross-render consistency.
 */
export function domainColor(domain: SeedDomain | string): Color {
  const palette: Record<string, Color> = {
    organism:        hslToColor(120, 0.65, 0.45), // green
    game:            hslToColor(270, 0.65, 0.50), // purple
    ecosystem:       hslToColor(175, 0.60, 0.40), // teal
    neural:          hslToColor(210, 0.75, 0.55), // blue
    intelligence:    hslToColor(230, 0.70, 0.50), // indigo
    simulation:      hslToColor(195, 0.60, 0.48), // cyan
    vehicle:         hslToColor(30,  0.80, 0.50), // orange
    weapon:          hslToColor(0,   0.70, 0.45), // red
    building:        hslToColor(40,  0.55, 0.50), // amber
    terrain:         hslToColor(100, 0.45, 0.40), // olive
    material:        hslToColor(50,  0.60, 0.55), // yellow
    plant:           hslToColor(90,  0.70, 0.42), // lime green
    insect:          hslToColor(75,  0.65, 0.40), // yellow-green
    fish:            hslToColor(185, 0.65, 0.45), // sea blue
    bird:            hslToColor(160, 0.60, 0.50), // mint
    mammal:          hslToColor(15,  0.55, 0.50), // brown-orange
    robot:           hslToColor(200, 0.40, 0.55), // steel blue
    particle:        hslToColor(55,  0.90, 0.60), // bright yellow
    fluid:           hslToColor(205, 0.80, 0.60), // sky blue
    crystal:         hslToColor(285, 0.55, 0.65), // lavender
    sound:           hslToColor(330, 0.60, 0.55), // pink
    music:           hslToColor(315, 0.65, 0.50), // magenta-pink
    pattern:         hslToColor(250, 0.55, 0.60), // periwinkle
    network:         hslToColor(215, 0.70, 0.55), // cornflower blue
    language:        hslToColor(20,  0.65, 0.55), // peach
    code:            hslToColor(140, 0.50, 0.45), // medium green
    strategy:        hslToColor(345, 0.55, 0.50), // rose
    schedule:        hslToColor(60,  0.50, 0.55), // light yellow
    rule:            hslToColor(240, 0.45, 0.55), // medium blue
    constraint:      hslToColor(255, 0.45, 0.50), // blue-purple
    audio:           hslToColor(325, 0.60, 0.55), // hot pink
    narrative:       hslToColor(35,  0.70, 0.50), // golden
    ui:              hslToColor(190, 0.60, 0.55), // sky
    city:            hslToColor(220, 0.45, 0.50), // slate blue
    quantum:         hslToColor(300, 0.70, 0.55), // orchid
    molecular:       hslToColor(170, 0.55, 0.50), // medium aquamarine
    education:       hslToColor(45,  0.75, 0.55), // gold
    finance:         hslToColor(155, 0.55, 0.45), // medium sea green
    infrastructure:  hslToColor(200, 0.35, 0.50), // cadet blue
    product:         hslToColor(25,  0.60, 0.55), // light orange
    void:            hslToColor(240, 0.10, 0.20), // near-black
    web:             hslToColor(200, 0.75, 0.50), // dodger blue
    render:          hslToColor(280, 0.60, 0.55), // medium purple
    shader:          hslToColor(260, 0.70, 0.60), // violet
    'animation-visual': hslToColor(340, 0.65, 0.55), // light crimson
    interaction:     hslToColor(165, 0.55, 0.50), // medium turquoise
    aesthetic:       hslToColor(310, 0.65, 0.60), // plum
    emotion:         hslToColor(355, 0.70, 0.55), // crimson
    perception:      hslToColor(185, 0.60, 0.55), // light teal
    cinematic:       hslToColor(20,  0.50, 0.40), // sienna
    rig:             hslToColor(30,  0.45, 0.50), // peru
    mocap:           hslToColor(10,  0.50, 0.50), // brown-red
    lod:             hslToColor(180, 0.40, 0.50), // cadet teal
    texture:         hslToColor(50,  0.65, 0.60), // light golden
    logo:            hslToColor(0,   0.80, 0.55), // red
    brand:           hslToColor(345, 0.75, 0.50), // crimson-rose
    compression:     hslToColor(220, 0.30, 0.55), // light slate
    'security-threat': hslToColor(0, 0.90, 0.40), // dark red
    intrusion:       hslToColor(5,  0.85, 0.45), // fire red
    forensics:       hslToColor(15, 0.50, 0.40), // dark orange
    'memory-store':  hslToColor(240, 0.55, 0.60), // medium slate blue
    'seed-intelligence': hslToColor(145, 0.65, 0.50), // medium green
  };

  const found = palette[domain];
  if (found !== undefined) {
    return found;
  }
  // Fallback: derive a stable color from FNV-1a hash
  const hash = fnv1aHash(domain);
  return hslToColor((hash % 360 + 360) % 360, 0.55, 0.50);
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/** Clamp a number to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Blend two colors linearly by t in [0, 1]. */
function lerpColor(a: Color, b: Color, t: number): Color {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: Math.round((a.a ?? 255) + ((b.a ?? 255) - (a.a ?? 255)) * t),
  };
}

/** Lighten a color by a fraction [0, 1] towards white. */
function lighten(c: Color, amount: number): Color {
  return lerpColor(c, { r: 255, g: 255, b: 255 }, amount);
}

/** Darken a color by a fraction [0, 1] towards black. */
function darken(c: Color, amount: number): Color {
  return lerpColor(c, { r: 0, g: 0, b: 0 }, amount);
}

/**
 * Derive a stable 2-D position from a seed hash.
 * Returns (x, y) in [padding, dimension - padding].
 */
function positionFromHash(hash: string, dimension: number, padding: number): Point {
  const h = fnv1aHash(hash);
  const h2 = fnv1aHash(hash + '_y');
  const range = dimension - padding * 2;
  return {
    x: padding + (h % 10000) / 10000 * range,
    y: padding + (h2 % 10000) / 10000 * range,
  };
}

/** Count genes in a GeneMap (handles nested structure only 1 level). */
function geneCount(seed: UniversalSeed): number {
  return Object.keys(seed.genes).length;
}

/**
 * Compute a scalar "complexity" value for a single Gene.
 * Larger/richer genes return larger values.
 */
function geneComplexity(gene: Gene): number {
  switch (gene.type) {
    case 'scalar':      return 1;
    case 'categorical': return gene.options.length;
    case 'vector':      return gene.dimensions;
    case 'expression':  return gene.source.length / 10;
    case 'struct':      return Object.keys(gene.value).length * 2;
    case 'array':       return gene.value.length * 2;
    case 'graph':       return gene.nodes.size + gene.edges.length;
    case 'tensor':      return gene.shape.reduce((a: number, b: number) => a * b, 1) / 100;
    case 'timeseries':  return gene.keyframes.length * 2;
    default:            return 1;
  }
}

/** Extract primary fitness score from a seed, defaulting to 0.5. */
function primaryFitness(seed: UniversalSeed): number {
  if (seed.$fitness === undefined) return 0.5;
  const primary = seed.$fitness['primary'];
  return primary !== undefined ? clamp(primary, 0, 1) : 0.5;
}

// ─────────────────────────────────────────────
// SeedParticleRenderer
// ─────────────────────────────────────────────

/**
 * Renders a population of seeds as a particle cloud.
 * Each particle is positioned deterministically from its hash,
 * sized by gene count, and colored by domain + fitness.
 */
export class SeedParticleRenderer {
  private readonly padding: number = 20;
  private readonly minRadius: number = 4;
  private readonly maxRadius: number = 18;

  /**
   * Render seeds as circles on a width×height canvas.
   *
   * @param seeds  - Population to render.
   * @param width  - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   * @returns Flat array of RenderCommands.
   */
  render(seeds: UniversalSeed[], width: number, height: number): RenderCommand[] {
    const commands: RenderCommand[] = [];
    for (const seed of seeds) {
      commands.push(this.renderParticle(seed, width, height));
    }
    return commands;
  }

  /**
   * Render seeds with motion trails — a dimmed ring behind each particle.
   *
   * @param seeds  - Population to render.
   * @param width  - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   * @returns Array of RenderCommands (trails first, then particles).
   */
  renderWithTrails(seeds: UniversalSeed[], width: number, height: number): RenderCommand[] {
    const commands: RenderCommand[] = [];
    for (const seed of seeds) {
      commands.push(this.renderTrail(seed, width, height));
    }
    for (const seed of seeds) {
      commands.push(this.renderParticle(seed, width, height));
    }
    return commands;
  }

  private renderParticle(seed: UniversalSeed, width: number, height: number): CircleCommand {
    const pos = positionFromHash(seed.$hash, Math.min(width, height), this.padding);
    const pos2 = {
      x: this.padding + (pos.x - this.padding) / Math.min(width, height) * width,
      y: this.padding + (pos.y - this.padding) / Math.min(width, height) * height,
    };
    const genes = geneCount(seed);
    const radius = clamp(
      this.minRadius + (genes / 20) * (this.maxRadius - this.minRadius),
      this.minRadius,
      this.maxRadius,
    );
    const baseColor = domainColor(seed.$domain);
    const fitness = primaryFitness(seed);
    const fill = fitness >= 0.5
      ? lighten(baseColor, (fitness - 0.5) * 0.5)
      : darken(baseColor, (0.5 - fitness) * 0.4);
    const stroke = darken(fill, 0.3);

    return {
      kind: 'circle',
      cx: pos2.x,
      cy: pos2.y,
      r: radius,
      fill,
      stroke,
      strokeWidth: 1.5,
    };
  }

  private renderTrail(seed: UniversalSeed, width: number, height: number): CircleCommand {
    const pos = positionFromHash(seed.$hash, Math.min(width, height), this.padding);
    const pos2 = {
      x: this.padding + (pos.x - this.padding) / Math.min(width, height) * width,
      y: this.padding + (pos.y - this.padding) / Math.min(width, height) * height,
    };
    const genes = geneCount(seed);
    const radius = clamp(
      this.minRadius + (genes / 20) * (this.maxRadius - this.minRadius),
      this.minRadius,
      this.maxRadius,
    );
    const baseColor = domainColor(seed.$domain);
    const trailColor: Color = { ...lighten(baseColor, 0.5), a: 60 };
    return {
      kind: 'circle',
      cx: pos2.x,
      cy: pos2.y,
      r: radius * 2.5,
      fill: trailColor,
      strokeWidth: 0,
    };
  }
}

// ─────────────────────────────────────────────
// GenomeGraphRenderer
// ─────────────────────────────────────────────

/**
 * Renders a single seed's genes as a connected node graph.
 * Nodes are positioned in a circular layout; edges connect genes of the same type.
 */
export class GenomeGraphRenderer {
  private readonly nodeMinR: number = 8;
  private readonly nodeMaxR: number = 24;
  private readonly labelFontSize: number = 10;

  /**
   * Render a single seed's genome as a node–edge graph.
   *
   * @param seed   - Seed whose genes will be visualized.
   * @param width  - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   * @returns Array of RenderCommands (edges first, then nodes and labels).
   */
  render(seed: UniversalSeed, width: number, height: number): RenderCommand[] {
    const commands: RenderCommand[] = [];
    const entries = Object.entries(seed.genes);
    if (entries.length === 0) return commands;

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 40;

    // Compute node positions on a circle
    const positions: Map<string, Point> = new Map();
    entries.forEach(([name], idx) => {
      const angle = (idx / entries.length) * 2 * Math.PI - Math.PI / 2;
      positions.set(name, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });

    // Edges between genes sharing the same type
    const typeMap: Map<string, string[]> = new Map();
    for (const [name, gene] of entries as [string, Gene][]) {
      const t = gene.type;
      const existing = typeMap.get(t);
      if (existing !== undefined) {
        existing.push(name);
      } else {
        typeMap.set(t, [name]);
      }
    }
    const edgeColor: Color = { r: 160, g: 160, b: 180, a: 120 };
    for (const siblings of typeMap.values()) {
      for (let i = 0; i < siblings.length - 1; i++) {
        const aName = siblings[i];
        const bName = siblings[i + 1];
        if (aName === undefined || bName === undefined) continue;
        const aPos = positions.get(aName);
        const bPos = positions.get(bName);
        if (aPos === undefined || bPos === undefined) continue;
        commands.push({
          kind: 'line',
          x1: aPos.x, y1: aPos.y,
          x2: bPos.x, y2: bPos.y,
          stroke: edgeColor,
          strokeWidth: 1,
        });
      }
    }

    // Nodes
    for (const [name, gene] of entries) {
      const pos = positions.get(name);
      if (pos === undefined) continue;
      const complexity = geneComplexity(gene);
      const nodeR = clamp(
        this.nodeMinR + Math.log1p(complexity) * 3,
        this.nodeMinR,
        this.nodeMaxR,
      );
      const fill = domainColor(seed.$domain);
      const stroke = darken(fill, 0.35);
      commands.push({
        kind: 'circle',
        cx: pos.x,
        cy: pos.y,
        r: nodeR,
        fill,
        stroke,
        strokeWidth: 1.5,
      });
      commands.push({
        kind: 'text',
        x: pos.x,
        y: pos.y + nodeR + this.labelFontSize + 2,
        text: name.length > 10 ? name.slice(0, 9) + '…' : name,
        fontSize: this.labelFontSize,
        fill: { r: 220, g: 220, b: 230 },
      });
    }

    // Center label — seed name
    commands.push({
      kind: 'text',
      x: cx,
      y: cy,
      text: seed.$name.length > 16 ? seed.$name.slice(0, 15) + '…' : seed.$name,
      fontSize: 12,
      fill: { r: 255, g: 255, b: 255 },
    });

    return commands;
  }
}

// ─────────────────────────────────────────────
// FitnessLandscapeRenderer
// ─────────────────────────────────────────────

/**
 * Renders a 2-D fitness landscape as a colored grid of cells,
 * with seeds plotted as points on top.
 */
export class FitnessLandscapeRenderer {
  private readonly defaultResolution: number = 20;

  /**
   * Render a fitness landscape heatmap.
   *
   * @param seeds      - Population used to compute fitness field.
   * @param width      - Canvas width in pixels.
   * @param height     - Canvas height in pixels.
   * @param resolution - Grid resolution (cells per axis). Default 20.
   * @returns Array of RenderCommands.
   */
  render(
    seeds: UniversalSeed[],
    width: number,
    height: number,
    resolution?: number,
  ): RenderCommand[] {
    const res = resolution ?? this.defaultResolution;
    const commands: RenderCommand[] = [];
    const cellW = width / res;
    const cellH = height / res;

    // Build a fitness grid interpolated from seed positions and fitness values
    const grid = this.buildFitnessGrid(seeds, res, width, height);

    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const gridRow = grid[row];
        if (gridRow === undefined) continue;
        const fitness = gridRow[col] ?? 0;
        const fill = this.fitnessColor(fitness);
        commands.push({
          kind: 'rect',
          x: col * cellW,
          y: row * cellH,
          w: cellW,
          h: cellH,
          fill,
        });
      }
    }

    // Plot seeds as points
    for (const seed of seeds) {
      const pos = this.seedPosition(seed, width, height);
      const fitness = primaryFitness(seed);
      const baseColor = domainColor(seed.$domain);
      commands.push({
        kind: 'circle',
        cx: pos.x,
        cy: pos.y,
        r: 4,
        fill: baseColor,
        stroke: darken(baseColor, 0.4),
        strokeWidth: 1,
      });
      // Fitness label
      commands.push({
        kind: 'text',
        x: pos.x + 5,
        y: pos.y - 5,
        text: fitness.toFixed(2),
        fontSize: 8,
        fill: { r: 230, g: 230, b: 230 },
      });
    }

    return commands;
  }

  private seedPosition(seed: UniversalSeed, width: number, height: number): Point {
    const h = fnv1aHash(seed.$hash);
    const h2 = fnv1aHash(seed.$hash + '_y');
    return {
      x: 10 + (h % 10000) / 10000 * (width - 20),
      y: 10 + (h2 % 10000) / 10000 * (height - 20),
    };
  }

  private buildFitnessGrid(
    seeds: UniversalSeed[],
    res: number,
    width: number,
    height: number,
  ): number[][] {
    const grid: number[][] = Array.from({ length: res }, () =>
      Array.from({ length: res }, () => 0),
    );
    const weightGrid: number[][] = Array.from({ length: res }, () =>
      Array.from({ length: res }, () => 0),
    );

    for (const seed of seeds) {
      const pos = this.seedPosition(seed, width, height);
      const fitness = primaryFitness(seed);
      const col = clamp(Math.floor((pos.x / width) * res), 0, res - 1);
      const row = clamp(Math.floor((pos.y / height) * res), 0, res - 1);

      // Gaussian splat into surrounding cells
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= res || c < 0 || c >= res) continue;
          const dist2 = dr * dr + dc * dc;
          const w = Math.exp(-dist2 / 2);
          const gridRow = grid[r];
          const weightRow = weightGrid[r];
          if (gridRow !== undefined && weightRow !== undefined) {
            gridRow[c] = (gridRow[c] ?? 0) + fitness * w;
            weightRow[c] = (weightRow[c] ?? 0) + w;
          }
        }
      }
    }

    // Normalize
    for (let r = 0; r < res; r++) {
      const gridRow = grid[r];
      const weightRow = weightGrid[r];
      if (gridRow === undefined || weightRow === undefined) continue;
      for (let c = 0; c < res; c++) {
        const w = weightRow[c] ?? 0;
        gridRow[c] = w > 0 ? (gridRow[c] ?? 0) / w : 0.2;
      }
    }

    return grid;
  }

  private fitnessColor(fitness: number): Color {
    // Cool (blue) → warm (red) gradient through green
    if (fitness < 0.5) {
      return lerpColor(
        hslToColor(240, 0.80, 0.30),  // deep blue (low)
        hslToColor(120, 0.70, 0.40),  // green (mid)
        fitness * 2,
      );
    }
    return lerpColor(
      hslToColor(120, 0.70, 0.40),    // green (mid)
      hslToColor(0,   0.85, 0.50),    // red (high)
      (fitness - 0.5) * 2,
    );
  }
}

// ─────────────────────────────────────────────
// PhylogeneticTreeRenderer
// ─────────────────────────────────────────────

/**
 * Renders a lineage tree with generations as horizontal rows.
 * Parent → child edges are drawn; nodes are colored by domain.
 */
export class PhylogeneticTreeRenderer {
  private readonly nodeRadius: number = 8;
  private readonly labelFontSize: number = 9;

  /**
   * Render a phylogenetic tree for a population.
   *
   * @param seeds  - Population (may have lineage data).
   * @param width  - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   * @returns Array of RenderCommands.
   */
  render(seeds: UniversalSeed[], width: number, height: number): RenderCommand[] {
    if (seeds.length === 0) return [];

    const commands: RenderCommand[] = [];
    const { generationMap, maxGen } = this.groupByGeneration(seeds);
    const generations = maxGen + 1;
    const rowHeight = height / Math.max(generations, 1);

    // Compute node screen positions
    const positions: Map<string, Point> = new Map();
    for (let gen = 0; gen <= maxGen; gen++) {
      const genSeeds = generationMap.get(gen) ?? [];
      const count = Math.max(genSeeds.length, 1);
      genSeeds.forEach((seed, idx) => {
        positions.set(seed.$hash, {
          x: ((idx + 0.5) / count) * width,
          y: (gen + 0.5) * rowHeight,
        });
      });
    }

    // Draw edges (parent → child)
    for (const seed of seeds) {
      const childPos = positions.get(seed.$hash);
      if (childPos === undefined) continue;
      for (const parent of seed.$lineage.parents) {
        const parentPos = positions.get(parent.id);
        if (parentPos === undefined) continue;
        commands.push({
          kind: 'line',
          x1: parentPos.x, y1: parentPos.y,
          x2: childPos.x,  y2: childPos.y,
          stroke: { r: 120, g: 120, b: 140, a: 160 },
          strokeWidth: 1,
        });
      }
    }

    // Draw nodes
    for (const seed of seeds) {
      const pos = positions.get(seed.$hash);
      if (pos === undefined) continue;
      const fill = domainColor(seed.$domain);
      const stroke = darken(fill, 0.35);
      commands.push({
        kind: 'circle',
        cx: pos.x,
        cy: pos.y,
        r: this.nodeRadius,
        fill,
        stroke,
        strokeWidth: 1.5,
      });
      // Short name label
      commands.push({
        kind: 'text',
        x: pos.x,
        y: pos.y + this.nodeRadius + this.labelFontSize + 1,
        text: seed.$name.length > 8 ? seed.$name.slice(0, 7) + '…' : seed.$name,
        fontSize: this.labelFontSize,
        fill: { r: 210, g: 210, b: 220 },
      });
    }

    // Generation labels on left axis
    for (let gen = 0; gen <= maxGen; gen++) {
      commands.push({
        kind: 'text',
        x: 4,
        y: (gen + 0.5) * rowHeight + 4,
        text: `G${gen}`,
        fontSize: 9,
        fill: { r: 140, g: 140, b: 155 },
      });
    }

    return commands;
  }

  private groupByGeneration(
    seeds: UniversalSeed[],
  ): { generationMap: Map<number, UniversalSeed[]>; maxGen: number } {
    const generationMap: Map<number, UniversalSeed[]> = new Map();
    let maxGen = 0;
    for (const seed of seeds) {
      const gen = seed.$lineage.generation;
      if (gen > maxGen) maxGen = gen;
      const existing = generationMap.get(gen);
      if (existing !== undefined) {
        existing.push(seed);
      } else {
        generationMap.set(gen, [seed]);
      }
    }
    return { generationMap, maxGen };
  }
}

// ─────────────────────────────────────────────
// DiversityHeatmapRenderer
// ─────────────────────────────────────────────

/**
 * Renders a diversity heatmap where each cell represents a (gene × seed) pair.
 * Cell color encodes the scalar value of the gene for that seed.
 */
export class DiversityHeatmapRenderer {
  private readonly cellMinSize: number = 4;
  private readonly labelFontSize: number = 9;

  /**
   * Render a gene-diversity heatmap for a population.
   *
   * @param seeds  - Population to analyze.
   * @param width  - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   * @returns Array of RenderCommands.
   */
  render(seeds: UniversalSeed[], width: number, height: number): RenderCommand[] {
    if (seeds.length === 0) return [];

    const commands: RenderCommand[] = [];

    // Collect union of gene names
    const allGeneNames = this.collectGeneNames(seeds);
    if (allGeneNames.length === 0) return commands;

    const cols = seeds.length;
    const rows = allGeneNames.length;
    const cellW = Math.max(this.cellMinSize, Math.floor((width - 80) / cols));
    const cellH = Math.max(this.cellMinSize, Math.floor((height - 30) / rows));
    const offsetX = 80;
    const offsetY = 20;

    // Column headers (seed names)
    for (let s = 0; s < seeds.length; s++) {
      const seed = seeds[s];
      if (seed === undefined) continue;
      commands.push({
        kind: 'text',
        x: offsetX + s * cellW + cellW / 2,
        y: offsetY - 4,
        text: seed.$name.length > 6 ? seed.$name.slice(0, 5) + '…' : seed.$name,
        fontSize: 7,
        fill: { r: 180, g: 180, b: 190 },
      });
    }

    // Rows: one per gene name
    for (let g = 0; g < allGeneNames.length; g++) {
      const geneName = allGeneNames[g];
      if (geneName === undefined) continue;

      // Row label
      commands.push({
        kind: 'text',
        x: 4,
        y: offsetY + g * cellH + cellH / 2 + 3,
        text: geneName.length > 10 ? geneName.slice(0, 9) + '…' : geneName,
        fontSize: this.labelFontSize,
        fill: { r: 180, g: 180, b: 195 },
      });

      // Cells
      for (let s = 0; s < seeds.length; s++) {
        const seed = seeds[s];
        if (seed === undefined) continue;
        const gene = seed.genes[geneName];
        const value = gene !== undefined ? this.geneScalarValue(gene) : undefined;
        const fill = value !== undefined ? this.valueColor(value) : { r: 40, g: 40, b: 50 };
        commands.push({
          kind: 'rect',
          x: offsetX + s * cellW,
          y: offsetY + g * cellH,
          w: cellW - 1,
          h: cellH - 1,
          fill,
        });
      }
    }

    return commands;
  }

  private collectGeneNames(seeds: UniversalSeed[]): string[] {
    const nameSet: Set<string> = new Set();
    for (const seed of seeds) {
      for (const key of Object.keys(seed.genes)) {
        nameSet.add(key);
      }
    }
    return Array.from(nameSet).sort();
  }

  /**
   * Collapse a Gene to a scalar in [0, 1] for color mapping.
   * Non-scalar types use a hash of their canonical form.
   */
  private geneScalarValue(gene: Gene): number {
    switch (gene.type) {
      case 'scalar': {
        const range = gene.max - gene.min;
        return range > 0 ? clamp((gene.value - gene.min) / range, 0, 1) : 0.5;
      }
      case 'categorical': {
        const idx = gene.options.indexOf(gene.value);
        return gene.options.length > 1 ? idx / (gene.options.length - 1) : 0.5;
      }
      case 'vector': {
        const sum = gene.value.reduce((a: number, b: number) => a + Math.abs(b), 0);
        return clamp(sum / (gene.dimensions * 10), 0, 1);
      }
      case 'expression': {
        const h = fnv1aHash(gene.source);
        return (h % 10000) / 10000;
      }
      case 'struct': {
        const count = Object.keys(gene.value).length;
        return clamp(count / 10, 0, 1);
      }
      case 'array': {
        return clamp(gene.value.length / 20, 0, 1);
      }
      case 'graph': {
        return clamp((gene.nodes.size + gene.edges.length) / 30, 0, 1);
      }
      case 'tensor': {
        const avg = gene.data.length > 0
          ? Array.from(gene.data).reduce((a: number, b: number) => a + b, 0) / gene.data.length
          : 0;
        return clamp((avg + 1) / 2, 0, 1);
      }
      case 'timeseries': {
        return clamp(gene.keyframes.length / 20, 0, 1);
      }
      default:
        return 0.5;
    }
  }

  /** Map a normalized [0, 1] value to a hue-shifted color. */
  private valueColor(value: number): Color {
    // Navy → teal → lime → yellow
    return hslToColor(200 + value * 120, 0.75, 0.35 + value * 0.2);
  }
}

// ─────────────────────────────────────────────
// SVGExporter
// ─────────────────────────────────────────────

/**
 * Converts a RenderCommand tree to a valid, self-contained SVG string.
 */
export class SVGExporter {
  /**
   * Export an array of render commands as an SVG document.
   *
   * @param commands - Commands to render.
   * @param width    - Viewport width.
   * @param height   - Viewport height.
   * @returns Valid SVG string with XML declaration.
   */
  export(commands: RenderCommand[], width: number, height: number): string {
    const body = commands.map((cmd) => this.exportCommand(cmd)).join('\n  ');
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `  <rect width="${width}" height="${height}" fill="#0f0f18"/>`,
      `  ${body}`,
      `</svg>`,
    ].join('\n');
  }

  /**
   * Convert a single RenderCommand to an SVG element string.
   *
   * @param cmd - Command to convert.
   * @returns SVG element markup string.
   */
  exportCommand(cmd: RenderCommand): string {
    switch (cmd.kind) {
      case 'circle':
        return this.svgCircle(cmd);
      case 'rect':
        return this.svgRect(cmd);
      case 'line':
        return this.svgLine(cmd);
      case 'path':
        return this.svgPath(cmd);
      case 'text':
        return this.svgText(cmd);
      case 'group':
        return this.svgGroup(cmd);
      default: {
        const _exhaustive: never = cmd;
        return `<!-- unknown command: ${JSON.stringify(_exhaustive)} -->`;
      }
    }
  }

  private svgCircle(cmd: CircleCommand): string {
    const fill   = cmd.fill   ? colorToCSS(cmd.fill)   : 'none';
    const stroke = cmd.stroke ? colorToCSS(cmd.stroke) : 'none';
    const sw     = cmd.strokeWidth ?? 0;
    return `<circle cx="${r2(cmd.cx)}" cy="${r2(cmd.cy)}" r="${r2(cmd.r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  private svgRect(cmd: RectCommand): string {
    const fill   = cmd.fill   ? colorToCSS(cmd.fill)   : 'none';
    const stroke = cmd.stroke ? colorToCSS(cmd.stroke) : 'none';
    const sw     = 0;
    const rx     = cmd.rx !== undefined ? ` rx="${cmd.rx}"` : '';
    return `<rect x="${r2(cmd.x)}" y="${r2(cmd.y)}" width="${r2(cmd.w)}" height="${r2(cmd.h)}"${rx} fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  private svgLine(cmd: LineCommand): string {
    const stroke = colorToCSS(cmd.stroke);
    const sw     = cmd.strokeWidth ?? 1;
    return `<line x1="${r2(cmd.x1)}" y1="${r2(cmd.y1)}" x2="${r2(cmd.x2)}" y2="${r2(cmd.y2)}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  private svgPath(cmd: PathCommand): string {
    const fill   = cmd.fill   ? colorToCSS(cmd.fill)   : 'none';
    const stroke = cmd.stroke ? colorToCSS(cmd.stroke) : 'none';
    return `<path d="${cmd.d}" fill="${fill}" stroke="${stroke}"/>`;
  }

  private svgText(cmd: TextCommand): string {
    const fill     = cmd.fill ? colorToCSS(cmd.fill) : 'rgba(255,255,255,1.000)';
    const fontSize = cmd.fontSize ?? 12;
    const escaped  = escapeXml(cmd.text);
    return `<text x="${r2(cmd.x)}" y="${r2(cmd.y)}" font-size="${fontSize}" fill="${fill}" text-anchor="middle" font-family="monospace">${escaped}</text>`;
  }

  private svgGroup(cmd: GroupCommand): string {
    const transform = cmd.transform ? ` transform="${cmd.transform}"` : '';
    const children  = cmd.children.map((c) => '    ' + this.exportCommand(c)).join('\n');
    return `<g${transform}>\n${children}\n  </g>`;
  }
}

// ─────────────────────────────────────────────
// HTMLCanvasExporter
// ─────────────────────────────────────────────

/**
 * Generates a standalone HTML page that draws render commands using Canvas 2D API.
 */
export class HTMLCanvasExporter {
  /**
   * Generate a standalone HTML page with an embedded Canvas 2D drawing.
   *
   * @param commands - Commands to render.
   * @param width    - Canvas width in pixels.
   * @param height   - Canvas height in pixels.
   * @returns Complete HTML document string.
   */
  export(commands: RenderCommand[], width: number, height: number): string {
    const drawCode = commands.map((cmd) => this.canvasCommand(cmd, '  ctx')).join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>GSPL Paradigm Canvas</title>
  <style>
    body { margin: 0; background: #0f0f18; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    canvas { border: 1px solid #333; }
  </style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
(function() {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f0f18';
  ctx.fillRect(0, 0, ${width}, ${height});
${drawCode}
})();
</script>
</body>
</html>`;
  }

  /**
   * Emit Canvas 2D drawing code for a single RenderCommand.
   *
   * @param cmd    - Command to convert.
   * @param prefix - Variable prefix for the Canvas context identifier.
   * @returns JS statement(s) string.
   */
  canvasCommand(cmd: RenderCommand, prefix: string = 'ctx'): string {
    switch (cmd.kind) {
      case 'circle':   return this.canvasCircle(cmd, prefix);
      case 'rect':     return this.canvasRect(cmd, prefix);
      case 'line':     return this.canvasLine(cmd, prefix);
      case 'path':     return this.canvasPath(cmd, prefix);
      case 'text':     return this.canvasText(cmd, prefix);
      case 'group':    return this.canvasGroup(cmd, prefix);
      default: {
        const _exhaustive: never = cmd;
        return `// unknown: ${JSON.stringify(_exhaustive)}`;
      }
    }
  }

  private canvasCircle(cmd: CircleCommand, p: string): string {
    const lines: string[] = [];
    lines.push(`${p}.beginPath();`);
    lines.push(`${p}.arc(${r2(cmd.cx)}, ${r2(cmd.cy)}, ${r2(cmd.r)}, 0, Math.PI * 2);`);
    if (cmd.fill) {
      lines.push(`${p}.fillStyle = "${colorToCSS(cmd.fill)}";`);
      lines.push(`${p}.fill();`);
    }
    if (cmd.stroke) {
      lines.push(`${p}.strokeStyle = "${colorToCSS(cmd.stroke)}";`);
      lines.push(`${p}.lineWidth = ${cmd.strokeWidth ?? 1};`);
      lines.push(`${p}.stroke();`);
    }
    return lines.join('\n');
  }

  private canvasRect(cmd: RectCommand, p: string): string {
    const lines: string[] = [];
    if (cmd.rx !== undefined && cmd.rx > 0) {
      // Rounded rect via path
      const { x, y, w, h, rx } = cmd;
      const r = Math.min(rx, w / 2, h / 2);
      lines.push(`${p}.beginPath();`);
      lines.push(`${p}.moveTo(${r2(x + r)}, ${r2(y)});`);
      lines.push(`${p}.lineTo(${r2(x + w - r)}, ${r2(y)});`);
      lines.push(`${p}.quadraticCurveTo(${r2(x + w)}, ${r2(y)}, ${r2(x + w)}, ${r2(y + r)});`);
      lines.push(`${p}.lineTo(${r2(x + w)}, ${r2(y + h - r)});`);
      lines.push(`${p}.quadraticCurveTo(${r2(x + w)}, ${r2(y + h)}, ${r2(x + w - r)}, ${r2(y + h)});`);
      lines.push(`${p}.lineTo(${r2(x + r)}, ${r2(y + h)});`);
      lines.push(`${p}.quadraticCurveTo(${r2(x)}, ${r2(y + h)}, ${r2(x)}, ${r2(y + h - r)});`);
      lines.push(`${p}.lineTo(${r2(x)}, ${r2(y + r)});`);
      lines.push(`${p}.quadraticCurveTo(${r2(x)}, ${r2(y)}, ${r2(x + r)}, ${r2(y)});`);
      lines.push(`${p}.closePath();`);
    } else {
      lines.push(`${p}.beginPath();`);
      lines.push(`${p}.rect(${r2(cmd.x)}, ${r2(cmd.y)}, ${r2(cmd.w)}, ${r2(cmd.h)});`);
    }
    if (cmd.fill) {
      lines.push(`${p}.fillStyle = "${colorToCSS(cmd.fill)}";`);
      lines.push(`${p}.fill();`);
    }
    if (cmd.stroke) {
      lines.push(`${p}.strokeStyle = "${colorToCSS(cmd.stroke)}";`);
      lines.push(`${p}.stroke();`);
    }
    return lines.join('\n');
  }

  private canvasLine(cmd: LineCommand, p: string): string {
    return [
      `${p}.beginPath();`,
      `${p}.moveTo(${r2(cmd.x1)}, ${r2(cmd.y1)});`,
      `${p}.lineTo(${r2(cmd.x2)}, ${r2(cmd.y2)});`,
      `${p}.strokeStyle = "${colorToCSS(cmd.stroke)}";`,
      `${p}.lineWidth = ${cmd.strokeWidth ?? 1};`,
      `${p}.stroke();`,
    ].join('\n');
  }

  private canvasPath(cmd: PathCommand, p: string): string {
    const lines: string[] = [];
    lines.push(`{ const _p = new Path2D("${cmd.d}");`);
    if (cmd.fill) {
      lines.push(`  ${p}.fillStyle = "${colorToCSS(cmd.fill)}";`);
      lines.push(`  ${p}.fill(_p);`);
    }
    if (cmd.stroke) {
      lines.push(`  ${p}.strokeStyle = "${colorToCSS(cmd.stroke)}";`);
      lines.push(`  ${p}.stroke(_p);`);
    }
    lines.push(`}`);
    return lines.join('\n');
  }

  private canvasText(cmd: TextCommand, p: string): string {
    const fill     = cmd.fill ? colorToCSS(cmd.fill) : 'rgba(255,255,255,1.000)';
    const fontSize = cmd.fontSize ?? 12;
    const escaped  = cmd.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return [
      `${p}.font = "${fontSize}px monospace";`,
      `${p}.fillStyle = "${fill}";`,
      `${p}.textAlign = "center";`,
      `${p}.fillText("${escaped}", ${r2(cmd.x)}, ${r2(cmd.y)});`,
    ].join('\n');
  }

  private canvasGroup(cmd: GroupCommand, p: string): string {
    const lines: string[] = [];
    lines.push(`${p}.save();`);
    if (cmd.transform) {
      lines.push(`${p}.setTransform(...parseTransform("${cmd.transform}"));`);
    }
    for (const child of cmd.children) {
      lines.push(this.canvasCommand(child, p));
    }
    lines.push(`${p}.restore();`);
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────
// Internal SVG/text helpers
// ─────────────────────────────────────────────

/** Round to 2 decimal places for compact SVG/JS output. */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Escape XML special characters for SVG text content. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─────────────────────────────────────────────
// CanvasEngine — Main entry point
// ─────────────────────────────────────────────

/**
 * CanvasEngine — unified facade for all visualization renderers and exporters.
 *
 * Provides deterministic, seed-driven render pipelines and both SVG and
 * HTML Canvas 2D export targets.
 *
 * @example
 * ```typescript
 * const engine = new CanvasEngine();
 * const commands = engine.renderSeedParticles(seeds, 800, 600);
 * const svg = engine.toSVG(commands, 800, 600);
 * ```
 */
export class CanvasEngine {
  private readonly rng: DeterministicRNG;
  private readonly particleRenderer: SeedParticleRenderer;
  private readonly genomeRenderer: GenomeGraphRenderer;
  private readonly fitnessRenderer: FitnessLandscapeRenderer;
  private readonly phyloRenderer: PhylogeneticTreeRenderer;
  private readonly diversityRenderer: DiversityHeatmapRenderer;
  private readonly svgExporter: SVGExporter;
  private readonly htmlExporter: HTMLCanvasExporter;

  /**
   * Construct a CanvasEngine.
   *
   * @param rng - Optional deterministic RNG. Defaults to seed "canvas-default".
   */
  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('canvas-default');
    this.particleRenderer  = new SeedParticleRenderer();
    this.genomeRenderer    = new GenomeGraphRenderer();
    this.fitnessRenderer   = new FitnessLandscapeRenderer();
    this.phyloRenderer     = new PhylogeneticTreeRenderer();
    this.diversityRenderer = new DiversityHeatmapRenderer();
    this.svgExporter       = new SVGExporter();
    this.htmlExporter      = new HTMLCanvasExporter();
  }

  /**
   * Render a population as a particle cloud.
   *
   * @param seeds  - Seed population.
   * @param width  - Canvas width.
   * @param height - Canvas height.
   * @returns RenderCommand array.
   */
  renderSeedParticles(
    seeds: UniversalSeed[],
    width: number,
    height: number,
  ): RenderCommand[] {
    return this.particleRenderer.render(seeds, width, height);
  }

  /**
   * Render a seed's genome as a node–edge graph.
   *
   * @param seed   - Seed to visualize.
   * @param width  - Canvas width.
   * @param height - Canvas height.
   * @returns RenderCommand array.
   */
  renderGenomeGraph(
    seed: UniversalSeed,
    width: number,
    height: number,
  ): RenderCommand[] {
    return this.genomeRenderer.render(seed, width, height);
  }

  /**
   * Render a 2-D fitness landscape heatmap.
   *
   * @param seeds      - Seed population.
   * @param width      - Canvas width.
   * @param height     - Canvas height.
   * @param resolution - Grid resolution (default 20).
   * @returns RenderCommand array.
   */
  renderFitnessLandscape(
    seeds: UniversalSeed[],
    width: number,
    height: number,
    resolution?: number,
  ): RenderCommand[] {
    return this.fitnessRenderer.render(seeds, width, height, resolution);
  }

  /**
   * Render a phylogenetic lineage tree.
   *
   * @param seeds  - Seed population with lineage data.
   * @param width  - Canvas width.
   * @param height - Canvas height.
   * @returns RenderCommand array.
   */
  renderPhylogeneticTree(
    seeds: UniversalSeed[],
    width: number,
    height: number,
  ): RenderCommand[] {
    return this.phyloRenderer.render(seeds, width, height);
  }

  /**
   * Render a gene diversity heatmap across the population.
   *
   * @param seeds  - Seed population.
   * @param width  - Canvas width.
   * @param height - Canvas height.
   * @returns RenderCommand array.
   */
  renderDiversityHeatmap(
    seeds: UniversalSeed[],
    width: number,
    height: number,
  ): RenderCommand[] {
    return this.diversityRenderer.render(seeds, width, height);
  }

  /**
   * Convert a command array to an SVG document string.
   *
   * @param commands - Commands to export.
   * @param width    - Viewport width.
   * @param height   - Viewport height.
   * @returns SVG string.
   */
  toSVG(commands: RenderCommand[], width: number, height: number): string {
    return this.svgExporter.export(commands, width, height);
  }

  /**
   * Convert a command array to a standalone HTML Canvas page.
   *
   * @param commands - Commands to export.
   * @param width    - Canvas width.
   * @param height   - Canvas height.
   * @returns HTML document string.
   */
  toHTML(commands: RenderCommand[], width: number, height: number): string {
    return this.htmlExporter.export(commands, width, height);
  }

  /**
   * Expose the underlying DeterministicRNG for external use or forking.
   */
  getRNG(): DeterministicRNG {
    return this.rng;
  }
}
