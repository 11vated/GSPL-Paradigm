/**
 * SeedReasoner — Pure algorithmic analysis of UniversalSeed structure.
 *
 * Computes completeness scores, compares seeds trait-by-trait, and suggests
 * domain-aware improvements. Zero LLM calls; all intelligence is encoded in
 * the DOMAIN_GENE_TEMPLATES map and deterministic scoring functions.
 *
 * @packageDocumentation
 */

import type {
  Gene,
  GeneMap,
  GeneType,
  SeedDomain,
  UniversalSeed,
} from '@paradigm/types';

// ─────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────

/** Full structural analysis of a single seed. */
export interface SeedAnalysis {
  /** 0-1 ratio of present domain genes to expected domain genes. */
  readonly completeness: number;
  /** Total number of genes in the seed. */
  readonly geneCount: number;
  /** Distribution of gene types (e.g. { scalar: 3, categorical: 1 }). */
  readonly geneTypeDistribution: Readonly<Record<string, number>>;
  /** 0-1 score reflecting how well the seed's fitness matches the domain average. */
  readonly domainFitness: number;
  /** Gene names expected for this domain that are absent from the seed. */
  readonly missingGenes: readonly string[];
  /** Gene names present in the seed that are not part of the domain template. */
  readonly extraGenes: readonly string[];
}

/** Trait-level comparison between two seeds. */
export interface TraitComparison {
  readonly gene: string;
  /** Which seed is stronger for this gene: 'a', 'b', or 'tie'. */
  readonly winner: 'a' | 'b' | 'tie';
  /** Numeric strength of seed A (0-1 normalized). */
  readonly strengthA: number;
  /** Numeric strength of seed B (0-1 normalized). */
  readonly strengthB: number;
  /** Absolute delta between the two strengths. */
  readonly delta: number;
}

/** Actionable suggestion for improving a seed. */
export interface Suggestion {
  readonly type: 'add_gene' | 'adjust_value' | 'balance_stats';
  readonly gene: string;
  readonly reason: string;
  readonly suggestedGene?: Gene;
  readonly suggestedValue?: number;
}

// ─────────────────────────────────────────────
// Domain gene templates
// ─────────────────────────────────────────────

/** Specification for a gene expected in a particular domain. */
interface GeneTemplate {
  readonly type: GeneType;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly string[];
  readonly dimensions?: number;
  readonly defaultValue?: number | string | number[];
}

/**
 * Canonical set of genes expected per domain.
 * Used to calculate completeness and generate improvement suggestions.
 */
const DOMAIN_GENE_TEMPLATES: Readonly<Record<string, Readonly<Record<string, GeneTemplate>>>> = {
  organism: {
    health:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    attack:    { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    defense:   { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    speed:     { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    role:      { type: 'categorical', options: ['tank', 'dps', 'healer', 'support', 'scout'] },
    position:  { type: 'vector', dimensions: 3, defaultValue: [0, 0, 0] },
    color:     { type: 'vector', dimensions: 3, defaultValue: [128, 128, 128] },
  },
  vehicle: {
    speed:        { type: 'scalar', min: 0, max: 200, defaultValue: 60 },
    durability:   { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    fuel:         { type: 'scalar', min: 0, max: 100, defaultValue: 80 },
    capacity:     { type: 'scalar', min: 1, max: 50, defaultValue: 4 },
    terrain_type: { type: 'categorical', options: ['road', 'offroad', 'water', 'air', 'space'] },
  },
  weapon: {
    damage:  { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    range:   { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    speed:   { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    weight:  { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    element: { type: 'categorical', options: ['fire', 'ice', 'lightning', 'poison', 'physical', 'dark', 'light'] },
  },
  building: {
    health:   { type: 'scalar', min: 0, max: 500, defaultValue: 200 },
    capacity: { type: 'scalar', min: 1, max: 100, defaultValue: 10 },
    cost:     { type: 'scalar', min: 0, max: 1000, defaultValue: 100 },
    style:    { type: 'categorical', options: ['medieval', 'modern', 'futuristic', 'organic', 'industrial'] },
  },
  terrain: {
    height:      { type: 'scalar', min: -100, max: 500, defaultValue: 0 },
    moisture:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    temperature: { type: 'scalar', min: -50, max: 60, defaultValue: 20 },
    biome:       { type: 'categorical', options: ['forest', 'desert', 'tundra', 'ocean', 'plains', 'mountain', 'swamp', 'volcanic'] },
  },
  plant: {
    growth_rate: { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    height:      { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    toxicity:    { type: 'scalar', min: 0, max: 100, defaultValue: 0 },
    edible:      { type: 'categorical', options: ['yes', 'no', 'partial'] },
    biome:       { type: 'categorical', options: ['forest', 'desert', 'tundra', 'ocean', 'plains', 'mountain', 'swamp'] },
    color:       { type: 'vector', dimensions: 3, defaultValue: [34, 139, 34] },
  },
  robot: {
    processing:  { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    durability:  { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    energy:      { type: 'scalar', min: 0, max: 100, defaultValue: 80 },
    speed:       { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    role:        { type: 'categorical', options: ['combat', 'utility', 'recon', 'medical', 'construction'] },
    sensors:     { type: 'vector', dimensions: 5, defaultValue: [50, 50, 50, 50, 50] },
  },
  creature: {
    health:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    attack:    { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    defense:   { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    speed:     { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    habitat:   { type: 'categorical', options: ['land', 'water', 'air', 'underground', 'amphibious'] },
    size:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
  },
  material: {
    hardness:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    conductivity:  { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    density:       { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    transparency:  { type: 'scalar', min: 0, max: 100, defaultValue: 0 },
    color:         { type: 'vector', dimensions: 3, defaultValue: [128, 128, 128] },
  },
  insect: {
    health:    { type: 'scalar', min: 0, max: 20, defaultValue: 5 },
    speed:     { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    venom:     { type: 'scalar', min: 0, max: 100, defaultValue: 0 },
    swarm:     { type: 'scalar', min: 1, max: 1000, defaultValue: 50 },
    flight:    { type: 'categorical', options: ['yes', 'no'] },
    color:     { type: 'vector', dimensions: 3, defaultValue: [30, 30, 30] },
  },
  fish: {
    health:    { type: 'scalar', min: 0, max: 50, defaultValue: 15 },
    speed:     { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    depth:     { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    size:      { type: 'scalar', min: 0, max: 100, defaultValue: 20 },
    habitat:   { type: 'categorical', options: ['freshwater', 'saltwater', 'brackish', 'deep_sea'] },
    color:     { type: 'vector', dimensions: 3, defaultValue: [60, 120, 180] },
  },
  bird: {
    health:    { type: 'scalar', min: 0, max: 40, defaultValue: 12 },
    speed:     { type: 'scalar', min: 0, max: 200, defaultValue: 80 },
    altitude:  { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    wingspan:  { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    call:      { type: 'categorical', options: ['song', 'screech', 'chirp', 'coo', 'silent'] },
    color:     { type: 'vector', dimensions: 3, defaultValue: [100, 80, 60] },
  },
  mammal: {
    health:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    attack:    { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    defense:   { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    speed:     { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    size:      { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    habitat:   { type: 'categorical', options: ['forest', 'plains', 'mountain', 'arctic', 'desert', 'urban'] },
  },
} as const;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Returns the domain gene template for a domain, falling back to 'organism'
 * if the domain has no explicit template defined.
 */
function getTemplate(domain: string): Readonly<Record<string, GeneTemplate>> {
  return DOMAIN_GENE_TEMPLATES[domain] ?? DOMAIN_GENE_TEMPLATES['organism']!;
}

/**
 * Normalize a scalar gene value to [0, 1] given its range.
 * Non-scalar genes return 0.5 as a neutral score.
 */
function normalizeGeneValue(gene: Gene): number {
  if (gene.type === 'scalar') {
    const range = gene.max - gene.min;
    if (range === 0) return 1;
    return (gene.value - gene.min) / range;
  }
  if (gene.type === 'vector') {
    const dims = gene.value.length;
    if (dims === 0) return 0;
    const sum = gene.value.reduce((acc, v) => acc + v, 0);
    return Math.min(1, Math.max(0, sum / (dims * 255)));
  }
  return 0.5;
}

/**
 * Build a gene from a template specification.
 */
function geneFromTemplate(name: string, template: GeneTemplate): Gene {
  switch (template.type) {
    case 'scalar':
      return {
        type: 'scalar',
        value: (template.defaultValue as number | undefined) ?? ((template.min ?? 0) + (template.max ?? 100)) / 2,
        min: template.min ?? 0,
        max: template.max ?? 100,
      };
    case 'categorical':
      return {
        type: 'categorical',
        value: (template.defaultValue as string | undefined) ?? template.options?.[0] ?? name,
        options: [...(template.options ?? [name])],
      };
    case 'vector':
      return {
        type: 'vector',
        value: (template.defaultValue as number[] | undefined) ??
          Array.from({ length: template.dimensions ?? 3 }, () => 0),
        dimensions: template.dimensions ?? 3,
      };
    default:
      return {
        type: 'scalar',
        value: 50,
        min: 0,
        max: 100,
      };
  }
}

// ─────────────────────────────────────────────
// SeedReasoner
// ─────────────────────────────────────────────

/**
 * Pure algorithmic reasoner that analyzes UniversalSeed structures.
 *
 * All methods are deterministic, synchronous, and require zero external
 * services. The intelligence comes from the DOMAIN_GENE_TEMPLATES knowledge
 * base and well-defined scoring heuristics.
 */
export class SeedReasoner {
  /**
   * Produce a structural analysis of a single seed.
   *
   * @param seed - The seed to analyze.
   * @returns A complete SeedAnalysis with completeness, distribution, and gap info.
   */
  analyzeSeed(seed: UniversalSeed): SeedAnalysis {
    const template = getTemplate(seed.$domain);
    const templateKeys = Object.keys(template);
    const geneKeys = Object.keys(seed.genes);

    const presentTemplateGenes = templateKeys.filter((k) => k in seed.genes);
    const missingGenes = templateKeys.filter((k) => !(k in seed.genes));
    const extraGenes = geneKeys.filter((k) => !(k in template));

    const completeness = templateKeys.length > 0
      ? presentTemplateGenes.length / templateKeys.length
      : geneKeys.length > 0 ? 1 : 0;

    // Gene type distribution
    const distribution: Record<string, number> = {};
    for (const gene of Object.values(seed.genes)) {
      const t = gene.type;
      distribution[t] = (distribution[t] ?? 0) + 1;
    }

    // Domain fitness: average primary fitness vs. a baseline of 0.5
    let domainFitness = 0.5;
    if (seed.$fitness) {
      const primaryVal = seed.$fitness['primary'];
      if (primaryVal !== undefined) {
        domainFitness = Math.min(1, Math.max(0, primaryVal));
      } else {
        const values = Object.values(seed.$fitness).filter(
          (v): v is number => typeof v === 'number',
        );
        if (values.length > 0) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          domainFitness = Math.min(1, Math.max(0, avg));
        }
      }
    }

    return {
      completeness,
      geneCount: geneKeys.length,
      geneTypeDistribution: distribution,
      domainFitness,
      missingGenes,
      extraGenes,
    };
  }

  /**
   * Compare two seeds gene-by-gene.
   *
   * For every gene that appears in either seed, produces a TraitComparison
   * indicating which seed is stronger in that trait.
   *
   * @param a - First seed.
   * @param b - Second seed.
   * @returns Array of per-gene comparisons.
   */
  compareSeedsTrait(a: UniversalSeed, b: UniversalSeed): TraitComparison[] {
    const allGeneNames = new Set<string>([
      ...Object.keys(a.genes),
      ...Object.keys(b.genes),
    ]);

    const results: TraitComparison[] = [];

    for (const gene of allGeneNames) {
      const geneA = a.genes[gene];
      const geneB = b.genes[gene];

      const strengthA = geneA ? normalizeGeneValue(geneA) : 0;
      const strengthB = geneB ? normalizeGeneValue(geneB) : 0;
      const delta = Math.abs(strengthA - strengthB);

      let winner: 'a' | 'b' | 'tie';
      if (delta < 0.01) {
        winner = 'tie';
      } else if (strengthA > strengthB) {
        winner = 'a';
      } else {
        winner = 'b';
      }

      results.push({ gene, winner, strengthA, strengthB, delta });
    }

    // Sort by largest delta first for most meaningful differences
    results.sort((x, y) => y.delta - x.delta);
    return results;
  }

  /**
   * Suggest improvements for a seed based on its domain template.
   *
   * Three suggestion categories:
   * 1. add_gene — the domain expects a gene that is missing.
   * 2. adjust_value — a scalar gene is at an extreme or unlikely value.
   * 3. balance_stats — offensive and defensive stats are highly imbalanced.
   *
   * @param seed - The seed to evaluate.
   * @returns Ordered list of suggestions (highest priority first).
   */
  suggestImprovements(seed: UniversalSeed): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const template = getTemplate(seed.$domain);

    // 1. Missing genes
    for (const [name, spec] of Object.entries(template)) {
      if (!(name in seed.genes)) {
        suggestions.push({
          type: 'add_gene',
          gene: name,
          reason: `Domain '${seed.$domain}' expects a '${name}' gene (${spec.type}) but it is missing.`,
          suggestedGene: geneFromTemplate(name, spec),
        });
      }
    }

    // 2. Extreme values on scalar genes
    for (const [name, gene] of Object.entries(seed.genes)) {
      if (gene.type === 'scalar') {
        const normalized = normalizeGeneValue(gene);
        if (normalized < 0.05) {
          suggestions.push({
            type: 'adjust_value',
            gene: name,
            reason: `'${name}' is near its minimum (${gene.value}/${gene.max}). Consider increasing for viability.`,
            suggestedValue: gene.min + (gene.max - gene.min) * 0.25,
          });
        } else if (normalized > 0.95) {
          suggestions.push({
            type: 'adjust_value',
            gene: name,
            reason: `'${name}' is near its maximum (${gene.value}/${gene.max}). This may indicate over-specialization.`,
            suggestedValue: gene.min + (gene.max - gene.min) * 0.75,
          });
        }
      }
    }

    // 3. Balance check: if seed has both attack and defense, check imbalance
    const attackGene = seed.genes['attack'];
    const defenseGene = seed.genes['defense'];
    if (attackGene?.type === 'scalar' && defenseGene?.type === 'scalar') {
      const atkNorm = normalizeGeneValue(attackGene);
      const defNorm = normalizeGeneValue(defenseGene);
      const imbalance = Math.abs(atkNorm - defNorm);
      if (imbalance > 0.6) {
        const weaker = atkNorm < defNorm ? 'attack' : 'defense';
        suggestions.push({
          type: 'balance_stats',
          gene: weaker,
          reason: `Attack/defense imbalance is ${(imbalance * 100).toFixed(0)}%. Consider raising '${weaker}' for survivability.`,
        });
      }
    }

    return suggestions;
  }
}
