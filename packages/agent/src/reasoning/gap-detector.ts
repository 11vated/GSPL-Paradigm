/**
 * GapDetector — Analyzes seeds and populations for missing capabilities.
 *
 * Detects missing genes, dangerously low values, role coverage holes,
 * and statistical imbalances. Suggests concrete gene values to fill
 * each gap. Zero LLM calls; all logic is deterministic.
 *
 * @packageDocumentation
 */

import type {
  Gene,
  SeedDomain,
  UniversalSeed,
} from '@paradigm/types';

// ─────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────

/** Classification of gap severity. */
export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Classification of gap kind. */
export type GapKind = 'missing_gene' | 'low_value' | 'no_coverage' | 'imbalanced';

/** A single detected gap in a seed or population. */
export interface Gap {
  readonly kind: GapKind;
  readonly severity: GapSeverity;
  readonly gene: string;
  readonly description: string;
  /** Context: the seed hash this gap was detected in, or 'population' for aggregate gaps. */
  readonly context: string;
}

/** Suggested fix for a detected gap. */
export interface GapFill {
  readonly gap: Gap;
  readonly suggestedGene: Gene;
  readonly rationale: string;
}

// ─────────────────────────────────────────────
// Domain expectations
// ─────────────────────────────────────────────

/**
 * Critical genes per domain: genes that MUST exist for a seed to be
 * functional in its domain.
 */
const CRITICAL_GENES: Readonly<Record<string, readonly string[]>> = {
  organism: ['health', 'speed'],
  mammal:   ['health', 'speed'],
  bird:     ['health', 'speed'],
  fish:     ['health', 'speed'],
  insect:   ['health', 'speed'],
  creature: ['health', 'speed'],
  vehicle:  ['speed', 'durability', 'fuel'],
  weapon:   ['damage', 'range'],
  building: ['health', 'capacity'],
  terrain:  ['height', 'biome'],
  plant:    ['growth_rate', 'height'],
  robot:    ['processing', 'energy', 'durability'],
  material: ['hardness', 'density'],

  // Digital/Creative
  code:              ['maintainability', 'test_coverage'],
  shader:            ['performance', 'visual_quality'],
  render:            ['quality', 'fps_target'],
  'animation-visual': ['frame_count', 'fps'],
  texture:           ['resolution', 'format'],
  logo:              ['scalability', 'memorability'],
  brand:             ['consistency', 'differentiation'],
  ui:                ['usability', 'accessibility'],
  interaction:       ['latency', 'feedback_quality'],
  aesthetic:         ['harmony', 'contrast'],
  web:               ['lighthouse_score', 'load_time'],
  compression:       ['ratio', 'speed'],

  // Narrative/Experiential
  narrative:         ['coherence', 'pacing'],
  cinematic:         ['visual_storytelling', 'pacing'],
  emotion:           ['valence', 'arousal'],
  perception:        ['visual_acuity', 'attention'],
  game:              ['fun_factor', 'difficulty'],
  simulation:        ['accuracy', 'timestep'],

  // Audio/Music
  sound:             ['frequency', 'amplitude'],
  music:             ['tempo', 'complexity'],
  audio:             ['sample_rate', 'bit_depth'],

  // Scientific/Abstract
  neural:            ['layers', 'learning_rate'],
  intelligence:      ['reasoning', 'adaptability'],
  quantum:           ['qubits', 'gate_fidelity'],
  molecular:         ['atoms', 'stability'],
  pattern:           ['regularity', 'complexity'],
  network:           ['nodes', 'topology'],
  language:          ['vocabulary_size', 'grammar_complexity'],
  strategy:          ['risk', 'reward'],

  // Infrastructure/Systems
  schedule:          ['duration', 'priority'],
  rule:              ['strictness', 'enforcement'],
  constraint:        ['weight', 'type'],
  ecosystem:         ['biodiversity', 'stability'],
  infrastructure:    ['reliability', 'scalability'],
  product:           ['market_fit', 'usability'],
  city:              ['infrastructure', 'livability'],

  // Data/Security
  'security-threat': ['severity', 'impact'],
  intrusion:         ['stealth', 'technique'],
  forensics:         ['evidence_quality', 'timeline_coverage'],
  'memory-store':    ['capacity', 'durability'],

  // Physical/Natural
  particle:          ['mass', 'interaction'],
  fluid:             ['viscosity', 'density'],
  crystal:           ['hardness', 'symmetry'],
  'seed-intelligence': ['awareness', 'reasoning'],
  void:              ['entropy', 'stability'],
};

/**
 * Role archetypes per domain and the genes expected for each role.
 * Used for population-level coverage analysis.
 */
interface RoleCoverage {
  readonly role: string;
  readonly requiredGenes: Readonly<Record<string, { min: number; max: number }>>;
}

const ORGANISM_ROLES: readonly RoleCoverage[] = [
  {
    role: 'tank',
    requiredGenes: { health: { min: 60, max: 100 }, defense: { min: 60, max: 100 } },
  },
  {
    role: 'dps',
    requiredGenes: { attack: { min: 60, max: 100 }, speed: { min: 40, max: 100 } },
  },
  {
    role: 'healer',
    requiredGenes: { health: { min: 30, max: 100 } },
  },
  {
    role: 'scout',
    requiredGenes: { speed: { min: 70, max: 100 } },
  },
  {
    role: 'ranged',
    requiredGenes: { attack: { min: 30, max: 100 } },
  },
];

const DOMAIN_ROLES: Readonly<Record<string, readonly RoleCoverage[]>> = {
  organism: ORGANISM_ROLES,
  mammal: ORGANISM_ROLES,
  creature: ORGANISM_ROLES,
  vehicle: [
    { role: 'transport', requiredGenes: { capacity: { min: 4, max: 50 }, speed: { min: 30, max: 200 } } },
    { role: 'combat', requiredGenes: { durability: { min: 60, max: 100 }, speed: { min: 50, max: 200 } } },
    { role: 'recon', requiredGenes: { speed: { min: 80, max: 200 } } },
  ],
  weapon: [
    { role: 'melee', requiredGenes: { damage: { min: 40, max: 100 }, range: { min: 0, max: 20 } } },
    { role: 'ranged', requiredGenes: { range: { min: 50, max: 100 }, damage: { min: 20, max: 100 } } },
    { role: 'heavy', requiredGenes: { damage: { min: 70, max: 100 }, weight: { min: 60, max: 100 } } },
  ],

  // Code archetypes
  code: [
    { role: 'architect', requiredGenes: { maintainability: { min: 70, max: 100 }, complexity: { min: 40, max: 100 } } },
    { role: 'optimizer', requiredGenes: { performance: { min: 80, max: 100 } } },
    { role: 'debugger', requiredGenes: { test_coverage: { min: 60, max: 100 }, maintainability: { min: 50, max: 100 } } },
    { role: 'prototyper', requiredGenes: { performance: { min: 40, max: 100 } } },
    { role: 'documenter', requiredGenes: { maintainability: { min: 80, max: 100 } } },
    { role: 'tester', requiredGenes: { test_coverage: { min: 80, max: 100 } } },
  ],

  // Narrative archetypes
  narrative: [
    { role: 'worldbuilder', requiredGenes: { coherence: { min: 60, max: 100 }, word_count: { min: 50000, max: 200000 } } },
    { role: 'character_writer', requiredGenes: { character_depth: { min: 70, max: 100 } } },
    { role: 'plotter', requiredGenes: { tension: { min: 60, max: 100 }, pacing: { min: 50, max: 100 } } },
    { role: 'dialogue_master', requiredGenes: { character_depth: { min: 50, max: 100 }, pacing: { min: 60, max: 100 } } },
    { role: 'editor', requiredGenes: { coherence: { min: 70, max: 100 } } },
  ],

  // Game archetypes
  game: [
    { role: 'level_designer', requiredGenes: { fun_factor: { min: 50, max: 100 }, difficulty: { min: 30, max: 70 } } },
    { role: 'balance_tuner', requiredGenes: { fun_factor: { min: 60, max: 100 }, difficulty: { min: 40, max: 60 } } },
    { role: 'narrative_designer', requiredGenes: { fun_factor: { min: 40, max: 100 } } },
    { role: 'systems_designer', requiredGenes: { replayability: { min: 60, max: 100 } } },
    { role: 'ui_artist', requiredGenes: { fun_factor: { min: 50, max: 100 } } },
  ],

  // UI archetypes
  ui: [
    { role: 'designer', requiredGenes: { usability: { min: 60, max: 100 } } },
    { role: 'accessibility_expert', requiredGenes: { accessibility: { min: 80, max: 100 } } },
    { role: 'animator', requiredGenes: { responsiveness: { min: 60, max: 100 } } },
    { role: 'responsive_specialist', requiredGenes: { responsiveness: { min: 80, max: 100 } } },
  ],

  // Audio archetypes
  audio: [
    { role: 'composer', requiredGenes: { dynamic_range: { min: 50, max: 100 } } },
    { role: 'sound_designer', requiredGenes: { sample_rate: { min: 44100, max: 192000 } } },
    { role: 'mixer', requiredGenes: { channels: { min: 2, max: 8 }, dynamic_range: { min: 60, max: 100 } } },
    { role: 'foley_artist', requiredGenes: { sample_rate: { min: 44100, max: 192000 } } },
  ],

  // Shader archetypes
  shader: [
    { role: 'vfx_artist', requiredGenes: { visual_quality: { min: 70, max: 100 } } },
    { role: 'lighting_specialist', requiredGenes: { visual_quality: { min: 60, max: 100 }, performance: { min: 40, max: 100 } } },
    { role: 'material_designer', requiredGenes: { visual_quality: { min: 50, max: 100 } } },
  ],

  // Network archetypes
  network: [
    { role: 'architect', requiredGenes: { nodes: { min: 100, max: 1000000 } } },
    { role: 'security_analyst', requiredGenes: { latency: { min: 0, max: 100 } } },
    { role: 'performance_engineer', requiredGenes: { latency: { min: 0, max: 50 } } },
  ],

  // Simulation archetypes
  simulation: [
    { role: 'modeler', requiredGenes: { accuracy: { min: 70, max: 100 } } },
    { role: 'validator', requiredGenes: { accuracy: { min: 80, max: 100 } } },
    { role: 'optimizer', requiredGenes: { entity_count: { min: 1000, max: 100000 } } },
  ],
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Get the scalar value of a gene if it is scalar, else undefined.
 */
function scalarValue(gene: Gene | undefined): number | undefined {
  if (gene?.type === 'scalar') return gene.value;
  return undefined;
}

/**
 * Check if a seed satisfies a role's required gene ranges.
 */
function seedSatisfiesRole(seed: UniversalSeed, role: RoleCoverage): boolean {
  for (const [geneName, range] of Object.entries(role.requiredGenes)) {
    const val = scalarValue(seed.genes[geneName]);
    if (val === undefined) return false;
    if (val < range.min || val > range.max) return false;
  }
  return true;
}

/**
 * Build a default gene for filling a gap.
 */
function defaultScalarGene(value: number, min: number = 0, max: number = 100): Gene {
  return { type: 'scalar' as const, value, min, max };
}

// ─────────────────────────────────────────────
// GapDetector
// ─────────────────────────────────────────────

/**
 * Detects missing capabilities in individual seeds and across populations.
 *
 * Gap categories:
 * - **missing_gene**: A gene critical for the domain is absent.
 * - **low_value**: A gene exists but is dangerously low for viability.
 * - **no_coverage**: The population has no seed fulfilling a role archetype.
 * - **imbalanced**: Offensive/defensive stats are heavily skewed.
 */
export class GapDetector {
  /**
   * Detect gaps in a single seed.
   *
   * Checks:
   * 1. Missing critical genes for the domain.
   * 2. Scalar genes below 10% of their range.
   * 3. Offensive/defensive imbalance > 60%.
   *
   * @param seed - The seed to analyze.
   * @returns Array of detected gaps, sorted by severity.
   */
  detectGaps(seed: UniversalSeed): Gap[] {
    const gaps: Gap[] = [];
    const domain = seed.$domain as string;
    const context = seed.$hash;

    // 1. Missing critical genes
    const criticals = CRITICAL_GENES[domain] ?? [];
    for (const geneName of criticals) {
      if (!(geneName in seed.genes)) {
        gaps.push({
          kind: 'missing_gene',
          severity: 'critical',
          gene: geneName,
          description: `Critical gene '${geneName}' is missing for domain '${domain}'.`,
          context,
        });
      }
    }

    // 2. Low scalar values
    for (const [name, gene] of Object.entries(seed.genes)) {
      if (gene.type === 'scalar') {
        const range = gene.max - gene.min;
        if (range > 0) {
          const normalized = (gene.value - gene.min) / range;
          if (normalized < 0.10) {
            const severity: GapSeverity = criticals.includes(name) ? 'high' : 'medium';
            gaps.push({
              kind: 'low_value',
              severity,
              gene: name,
              description: `'${name}' is at ${(normalized * 100).toFixed(1)}% of its range (${gene.value}/${gene.max}). This may compromise viability.`,
              context,
            });
          }
        }
      }
    }

    // 3. Imbalance detection
    const attackVal = scalarValue(seed.genes['attack']);
    const defenseVal = scalarValue(seed.genes['defense']);
    if (attackVal !== undefined && defenseVal !== undefined) {
      const sum = attackVal + defenseVal;
      if (sum > 0) {
        const ratio = Math.abs(attackVal - defenseVal) / sum;
        if (ratio > 0.6) {
          const weaker = attackVal < defenseVal ? 'attack' : 'defense';
          gaps.push({
            kind: 'imbalanced',
            severity: 'medium',
            gene: weaker,
            description: `Attack/defense ratio is ${(ratio * 100).toFixed(0)}% imbalanced. '${weaker}' is significantly weaker.`,
            context,
          });
        }
      }
    }

    return this.sortBySeverity(gaps);
  }

  /**
   * Detect gaps across an entire population.
   *
   * Checks:
   * 1. Per-seed gaps (aggregated).
   * 2. Role coverage: which role archetypes have zero representation.
   * 3. Domain coverage: warns if all seeds are from the same domain.
   *
   * @param seeds - The population to analyze.
   * @returns Array of detected gaps.
   */
  detectPopulationGaps(seeds: readonly UniversalSeed[]): Gap[] {
    const gaps: Gap[] = [];

    if (seeds.length === 0) {
      gaps.push({
        kind: 'no_coverage',
        severity: 'critical',
        gene: '*',
        description: 'Population is empty. No seeds to analyze.',
        context: 'population',
      });
      return gaps;
    }

    // Aggregate per-seed gaps: count recurring issues
    const gapCounts = new Map<string, number>();
    for (const seed of seeds) {
      const seedGaps = this.detectGaps(seed);
      for (const g of seedGaps) {
        const key = `${g.kind}:${g.gene}`;
        gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1);
      }
    }

    // Gaps present in >50% of seeds are population-level issues
    for (const [key, count] of gapCounts) {
      if (count > seeds.length * 0.5) {
        const [kind, gene] = key.split(':') as [GapKind, string];
        gaps.push({
          kind,
          severity: 'high',
          gene,
          description: `${count}/${seeds.length} seeds (${((count / seeds.length) * 100).toFixed(0)}%) have '${kind}' on gene '${gene}'.`,
          context: 'population',
        });
      }
    }

    // Role coverage analysis
    const domainCounts = new Map<string, number>();
    for (const seed of seeds) {
      domainCounts.set(seed.$domain, (domainCounts.get(seed.$domain) ?? 0) + 1);
    }

    for (const [domain, _count] of domainCounts) {
      const roles = DOMAIN_ROLES[domain];
      if (!roles) continue;

      const domainSeeds = seeds.filter((s) => s.$domain === domain);
      for (const role of roles) {
        const hasCoverage = domainSeeds.some((s) => seedSatisfiesRole(s, role));
        if (!hasCoverage) {
          gaps.push({
            kind: 'no_coverage',
            severity: 'medium',
            gene: role.role,
            description: `No '${domain}' seed fulfills the '${role.role}' archetype. Consider breeding or creating one.`,
            context: 'population',
          });
        }
      }
    }

    // Domain diversity
    if (domainCounts.size === 1 && seeds.length > 3) {
      const singleDomain = [...domainCounts.keys()][0]!;
      gaps.push({
        kind: 'no_coverage',
        severity: 'low',
        gene: 'domain_diversity',
        description: `All ${seeds.length} seeds are in domain '${singleDomain}'. Cross-domain diversity may unlock new capabilities.`,
        context: 'population',
      });
    }

    return this.sortBySeverity(gaps);
  }

  /**
   * Suggest concrete gene values to fill each detected gap.
   *
   * @param gaps - Gaps to generate fills for.
   * @returns Array of GapFill suggestions.
   */
  suggestFills(gaps: readonly Gap[]): GapFill[] {
    const fills: GapFill[] = [];

    for (const gap of gaps) {
      switch (gap.kind) {
        case 'missing_gene': {
          const suggestedGene = this.buildFillGene(gap.gene);
          fills.push({
            gap,
            suggestedGene,
            rationale: `Add '${gap.gene}' gene with a balanced default value to satisfy domain requirements.`,
          });
          break;
        }

        case 'low_value': {
          // Suggest raising to 25% of range
          fills.push({
            gap,
            suggestedGene: defaultScalarGene(25, 0, 100),
            rationale: `Raise '${gap.gene}' to at least 25% of its range for basic viability.`,
          });
          break;
        }

        case 'imbalanced': {
          fills.push({
            gap,
            suggestedGene: defaultScalarGene(40, 0, 100),
            rationale: `Increase '${gap.gene}' to ~40 to reduce stat imbalance and improve survivability.`,
          });
          break;
        }

        case 'no_coverage': {
          // For role coverage gaps, suggest a role gene
          if (gap.gene === '*' || gap.gene === 'domain_diversity') {
            // Abstract gap, no specific gene to suggest
            fills.push({
              gap,
              suggestedGene: { type: 'categorical', value: 'generic', options: ['generic'] },
              rationale: gap.gene === '*'
                ? 'Add seeds to the population.'
                : 'Introduce seeds from other domains for cross-domain synergies.',
            });
          } else {
            fills.push({
              gap,
              suggestedGene: { type: 'categorical', value: gap.gene, options: [gap.gene] },
              rationale: `Create or breed a seed with the '${gap.gene}' archetype to fill population role gap.`,
            });
          }
          break;
        }
      }
    }

    return fills;
  }

  // ─── Private ─────────────────────────────────

  private buildFillGene(geneName: string): Gene {
    // Heuristic: certain gene names map to known types
    const scalarDefaults: Readonly<Record<string, { value: number; min: number; max: number }>> = {
      health:      { value: 50, min: 0, max: 100 },
      attack:      { value: 30, min: 0, max: 100 },
      defense:     { value: 30, min: 0, max: 100 },
      speed:       { value: 40, min: 0, max: 100 },
      damage:      { value: 50, min: 0, max: 100 },
      range:       { value: 30, min: 0, max: 100 },
      weight:      { value: 30, min: 0, max: 100 },
      durability:  { value: 60, min: 0, max: 100 },
      fuel:        { value: 80, min: 0, max: 100 },
      capacity:    { value: 10, min: 1, max: 100 },
      cost:        { value: 100, min: 0, max: 1000 },
      height:      { value: 0, min: -100, max: 500 },
      moisture:    { value: 50, min: 0, max: 100 },
      temperature: { value: 20, min: -50, max: 60 },
      processing:  { value: 50, min: 0, max: 100 },
      energy:      { value: 80, min: 0, max: 100 },
      hardness:    { value: 50, min: 0, max: 100 },
      density:     { value: 50, min: 0, max: 100 },
      growth_rate: { value: 50, min: 0, max: 100 },
    };

    const categorical: Readonly<Record<string, string[]>> = {
      role:         ['tank', 'dps', 'healer', 'support', 'scout'],
      biome:        ['forest', 'desert', 'tundra', 'ocean', 'plains'],
      terrain_type: ['road', 'offroad', 'water', 'air', 'space'],
      element:      ['fire', 'ice', 'lightning', 'poison', 'physical'],
      style:        ['medieval', 'modern', 'futuristic', 'organic', 'industrial'],
      habitat:      ['land', 'water', 'air', 'underground', 'amphibious'],
      flight:       ['yes', 'no'],
      edible:       ['yes', 'no', 'partial'],
    };

    const scalarDef = scalarDefaults[geneName];
    if (scalarDef) {
      return { type: 'scalar', value: scalarDef.value, min: scalarDef.min, max: scalarDef.max };
    }

    const catDef = categorical[geneName];
    if (catDef) {
      return { type: 'categorical', value: catDef[0]!, options: [...catDef] };
    }

    if (geneName === 'position' || geneName === 'color' || geneName === 'sensors') {
      const dims = geneName === 'sensors' ? 5 : 3;
      return {
        type: 'vector',
        value: Array.from({ length: dims }, () => 0),
        dimensions: dims,
      };
    }

    // Fallback: generic scalar
    return defaultScalarGene(50, 0, 100);
  }

  private sortBySeverity(gaps: Gap[]): Gap[] {
    const order: Readonly<Record<GapSeverity, number>> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    return gaps.sort((a, b) => order[a.severity] - order[b.severity]);
  }
}
