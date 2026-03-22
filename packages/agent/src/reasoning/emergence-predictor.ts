/**
 * EmergencePredictor — Predicts emergent behaviors from gene combinations.
 *
 * Applies a rule-based engine to detect behavioral archetypes (e.g.
 * "coordinated hunting", "skirmisher", "glass cannon") from gene
 * value patterns. Also finds inter-seed synergies for world-building.
 * Zero LLM calls; all intelligence is encoded in BEHAVIOR_RULES.
 *
 * @packageDocumentation
 */

import type {
  Gene,
  UniversalSeed,
} from '@paradigm/types';

// ─────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────

/** A predicted emergent behavior. */
export interface PredictedBehavior {
  readonly behavior: string;
  readonly description: string;
  /** Genes that triggered this prediction. */
  readonly triggerGenes: readonly string[];
  /** 0-1 confidence in this prediction based on how strongly genes match. */
  readonly confidence: number;
}

/** A synergy between two seeds when combined in a world. */
export interface Synergy {
  readonly seedAHash: string;
  readonly seedBHash: string;
  readonly seedAName: string;
  readonly seedBName: string;
  readonly synergyType: string;
  readonly description: string;
  /** 0-1 strength of this synergy. */
  readonly strength: number;
}

// ─────────────────────────────────────────────
// Behavior rule engine
// ─────────────────────────────────────────────

/**
 * A rule that matches gene patterns to predict emergent behavior.
 * The condition function receives a helper object for querying gene values.
 */
interface BehaviorRule {
  readonly behavior: string;
  readonly description: string;
  readonly triggerGenes: readonly string[];
  readonly condition: (ctx: GeneContext) => boolean;
  /** Base confidence if the condition matches. */
  readonly baseConfidence: number;
}

/**
 * Helper for querying gene values during rule evaluation.
 */
interface GeneContext {
  /** Get scalar gene value normalized to [0,1]. Returns undefined if gene missing or non-scalar. */
  scalar(name: string): number | undefined;
  /** Get categorical gene value. Returns undefined if missing or non-categorical. */
  categorical(name: string): string | undefined;
  /** Check if a gene exists. */
  has(name: string): boolean;
  /** Get the raw gene. */
  raw(name: string): Gene | undefined;
}

/**
 * Build a GeneContext from a seed's gene map.
 */
function buildContext(seed: UniversalSeed): GeneContext {
  return {
    scalar(name: string): number | undefined {
      const gene = seed.genes[name];
      if (gene?.type !== 'scalar') return undefined;
      const range = gene.max - gene.min;
      if (range === 0) return 1;
      return (gene.value - gene.min) / range;
    },
    categorical(name: string): string | undefined {
      const gene = seed.genes[name];
      if (gene?.type !== 'categorical') return undefined;
      return gene.value;
    },
    has(name: string): boolean {
      return name in seed.genes;
    },
    raw(name: string): Gene | undefined {
      return seed.genes[name];
    },
  };
}

/**
 * Master list of behavior rules. Each rule defines:
 * - A human-readable behavior name.
 * - Trigger genes that must be present.
 * - A condition function that evaluates gene values.
 * - A description of the predicted behavior.
 *
 * Rules are evaluated in order; multiple rules can match a single seed.
 */
const BEHAVIOR_RULES: readonly BehaviorRule[] = [
  // ─── Combat archetypes ───
  {
    behavior: 'glass_cannon',
    description: 'Extremely high attack with very low defense. Deals massive damage but dies quickly.',
    triggerGenes: ['attack', 'defense'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const atk = ctx.scalar('attack');
      const def = ctx.scalar('defense');
      return atk !== undefined && def !== undefined && atk > 0.75 && def < 0.25;
    },
  },
  {
    behavior: 'immovable_fortress',
    description: 'Extremely high defense with low speed. Nearly indestructible but slow to reposition.',
    triggerGenes: ['defense', 'speed', 'health'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const def = ctx.scalar('defense');
      const spd = ctx.scalar('speed');
      const hp = ctx.scalar('health');
      return def !== undefined && spd !== undefined
        && def > 0.75 && spd < 0.30
        && (hp === undefined || hp > 0.60);
    },
  },
  {
    behavior: 'skirmisher',
    description: 'High speed with moderate attack and low defense. Hit-and-run tactics.',
    triggerGenes: ['speed', 'attack', 'defense'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const spd = ctx.scalar('speed');
      const atk = ctx.scalar('attack');
      const def = ctx.scalar('defense');
      return spd !== undefined && atk !== undefined && def !== undefined
        && spd > 0.70 && atk > 0.30 && atk < 0.70 && def < 0.40;
    },
  },
  {
    behavior: 'berserker',
    description: 'High attack and speed with low defense. Aggressive all-in attacker.',
    triggerGenes: ['attack', 'speed', 'defense'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const atk = ctx.scalar('attack');
      const spd = ctx.scalar('speed');
      const def = ctx.scalar('defense');
      return atk !== undefined && spd !== undefined && def !== undefined
        && atk > 0.70 && spd > 0.60 && def < 0.30;
    },
  },
  {
    behavior: 'balanced_warrior',
    description: 'Well-rounded stats across attack, defense, and speed. Adapts to any situation.',
    triggerGenes: ['attack', 'defense', 'speed'],
    baseConfidence: 0.70,
    condition: (ctx) => {
      const atk = ctx.scalar('attack');
      const def = ctx.scalar('defense');
      const spd = ctx.scalar('speed');
      if (atk === undefined || def === undefined || spd === undefined) return false;
      const avg = (atk + def + spd) / 3;
      return Math.abs(atk - avg) < 0.15 && Math.abs(def - avg) < 0.15
        && Math.abs(spd - avg) < 0.15 && avg > 0.35;
    },
  },

  // ─── Ecological behaviors ───
  {
    behavior: 'apex_predator',
    description: 'Top-tier attack and speed with large size. Dominates the food chain.',
    triggerGenes: ['attack', 'speed', 'health'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const atk = ctx.scalar('attack');
      const spd = ctx.scalar('speed');
      const hp = ctx.scalar('health');
      return atk !== undefined && spd !== undefined && hp !== undefined
        && atk > 0.80 && spd > 0.50 && hp > 0.60;
    },
  },
  {
    behavior: 'ambush_hunter',
    description: 'High attack but low speed. Waits for prey to come close, then strikes.',
    triggerGenes: ['attack', 'speed'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const atk = ctx.scalar('attack');
      const spd = ctx.scalar('speed');
      return atk !== undefined && spd !== undefined
        && atk > 0.70 && spd < 0.30;
    },
  },
  {
    behavior: 'herd_animal',
    description: 'Moderate stats across the board with high defense. Safety in numbers.',
    triggerGenes: ['defense', 'health', 'speed'],
    baseConfidence: 0.70,
    condition: (ctx) => {
      const def = ctx.scalar('defense');
      const hp = ctx.scalar('health');
      const spd = ctx.scalar('speed');
      const atk = ctx.scalar('attack');
      return def !== undefined && hp !== undefined && spd !== undefined
        && def > 0.40 && hp > 0.40 && spd > 0.30
        && (atk === undefined || atk < 0.40);
    },
  },
  {
    behavior: 'parasite',
    description: 'Low stats but survives by leeching from others. Small, fast, hard to detect.',
    triggerGenes: ['health', 'speed'],
    baseConfidence: 0.70,
    condition: (ctx) => {
      const hp = ctx.scalar('health');
      const spd = ctx.scalar('speed');
      const atk = ctx.scalar('attack');
      const size = ctx.scalar('size');
      return hp !== undefined && spd !== undefined
        && hp < 0.20 && spd > 0.60
        && (atk === undefined || atk < 0.20)
        && (size === undefined || size < 0.15);
    },
  },

  // ─── Environmental adaptation ───
  {
    behavior: 'toxic_deterrent',
    description: 'Uses toxicity as primary defense mechanism. Predators learn to avoid.',
    triggerGenes: ['toxicity'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const tox = ctx.scalar('toxicity');
      return tox !== undefined && tox > 0.60;
    },
  },
  {
    behavior: 'deep_dweller',
    description: 'Adapted to extreme depths. Specialized for high-pressure environments.',
    triggerGenes: ['depth'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const depth = ctx.scalar('depth');
      return depth !== undefined && depth > 0.70;
    },
  },
  {
    behavior: 'high_altitude_flier',
    description: 'Specialized for extreme altitudes. Efficient at thin-air flight.',
    triggerGenes: ['altitude', 'speed'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const alt = ctx.scalar('altitude');
      const spd = ctx.scalar('speed');
      return alt !== undefined && spd !== undefined && alt > 0.70 && spd > 0.50;
    },
  },

  // ─── Mechanical archetypes ───
  {
    behavior: 'siege_engine',
    description: 'Extreme damage and range but very slow. Designed for breaking fortifications.',
    triggerGenes: ['damage', 'range', 'speed'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const dmg = ctx.scalar('damage');
      const rng = ctx.scalar('range');
      const spd = ctx.scalar('speed');
      return dmg !== undefined && rng !== undefined
        && dmg > 0.80 && rng > 0.60
        && (spd === undefined || spd < 0.25);
    },
  },
  {
    behavior: 'scout_drone',
    description: 'Extreme speed with minimal combat capability. Intelligence gathering role.',
    triggerGenes: ['speed', 'processing'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const spd = ctx.scalar('speed');
      const proc = ctx.scalar('processing');
      return spd !== undefined && proc !== undefined
        && spd > 0.80 && proc > 0.50;
    },
  },
  {
    behavior: 'resource_generator',
    description: 'High capacity and low mobility. Produces or stores resources for the group.',
    triggerGenes: ['capacity'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const cap = ctx.scalar('capacity');
      const spd = ctx.scalar('speed');
      return cap !== undefined && cap > 0.70
        && (spd === undefined || spd < 0.30);
    },
  },

  // ─── Swarm/collective behaviors ───
  {
    behavior: 'swarm_intelligence',
    description: 'Large swarm count with moderate individual stats. Collective behavior emerges.',
    triggerGenes: ['swarm', 'speed'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const swarm = ctx.scalar('swarm');
      return swarm !== undefined && swarm > 0.50;
    },
  },

  // ─── Elemental specialization ───
  {
    behavior: 'elemental_specialist',
    description: 'Weapon with strong elemental affinity. Damage is primarily elemental.',
    triggerGenes: ['element', 'damage'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const elem = ctx.categorical('element');
      const dmg = ctx.scalar('damage');
      return elem !== undefined && elem !== 'physical'
        && dmg !== undefined && dmg > 0.50;
    },
  },
];

// ─────────────────────────────────────────────
// Synergy rule engine
// ─────────────────────────────────────────────

interface SynergyRule {
  readonly synergyType: string;
  readonly description: string;
  readonly condition: (ctxA: GeneContext, ctxB: GeneContext, domainA: string, domainB: string) => boolean;
  readonly baseStrength: number;
}

const SYNERGY_RULES: readonly SynergyRule[] = [
  {
    synergyType: 'tank_dps_combo',
    description: 'One seed absorbs damage while the other deals it. Classic frontline/backline.',
    baseStrength: 0.85,
    condition: (a, b) => {
      const defA = a.scalar('defense');
      const atkA = a.scalar('attack');
      const defB = b.scalar('defense');
      const atkB = b.scalar('attack');
      return (defA !== undefined && atkB !== undefined && defA > 0.65 && atkB > 0.65)
        || (defB !== undefined && atkA !== undefined && defB > 0.65 && atkA > 0.65);
    },
  },
  {
    synergyType: 'scout_heavy_combo',
    description: 'Fast scout reveals targets for slow heavy hitter.',
    baseStrength: 0.80,
    condition: (a, b) => {
      const spdA = a.scalar('speed');
      const spdB = b.scalar('speed');
      const dmgA = a.scalar('damage') ?? a.scalar('attack');
      const dmgB = b.scalar('damage') ?? b.scalar('attack');
      return (spdA !== undefined && dmgB !== undefined && spdA > 0.75 && dmgB > 0.70 && (spdB ?? 0.5) < 0.35)
        || (spdB !== undefined && dmgA !== undefined && spdB > 0.75 && dmgA > 0.70 && (spdA ?? 0.5) < 0.35);
    },
  },
  {
    synergyType: 'bio_mech_hybrid',
    description: 'Biological and mechanical seeds combine for enhanced capabilities.',
    baseStrength: 0.75,
    condition: (_a, _b, domainA, domainB) => {
      const bioSet = new Set(['organism', 'mammal', 'bird', 'fish', 'insect', 'creature', 'plant']);
      const mechSet = new Set(['robot', 'vehicle', 'weapon']);
      return (bioSet.has(domainA) && mechSet.has(domainB))
        || (bioSet.has(domainB) && mechSet.has(domainA));
    },
  },
  {
    synergyType: 'ecosystem_balance',
    description: 'Predator-prey or producer-consumer relationship creates a balanced ecosystem.',
    baseStrength: 0.70,
    condition: (a, b, domainA, domainB) => {
      const lifeSet = new Set(['organism', 'mammal', 'bird', 'fish', 'insect', 'creature']);
      if (!lifeSet.has(domainA) || !lifeSet.has(domainB)) return false;
      const atkA = a.scalar('attack') ?? 0;
      const atkB = b.scalar('attack') ?? 0;
      // One is significantly more aggressive than the other
      return Math.abs(atkA - atkB) > 0.40;
    },
  },
  {
    synergyType: 'material_weapon_synergy',
    description: 'Material seed enhances weapon seed. Better materials = better weapons.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'material' && domainB === 'weapon')
        || (domainA === 'weapon' && domainB === 'material');
    },
  },
  {
    synergyType: 'terrain_building_synergy',
    description: 'Terrain and building seeds complement each other for world construction.',
    baseStrength: 0.75,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'terrain' && domainB === 'building')
        || (domainA === 'building' && domainB === 'terrain');
    },
  },
  {
    synergyType: 'swarm_coordinator',
    description: 'One seed acts as swarm and another as coordinator/leader.',
    baseStrength: 0.80,
    condition: (a, b) => {
      const swarmA = a.scalar('swarm');
      const swarmB = b.scalar('swarm');
      const procA = a.scalar('processing');
      const procB = b.scalar('processing');
      return (swarmA !== undefined && swarmA > 0.50 && procB !== undefined && procB > 0.60)
        || (swarmB !== undefined && swarmB > 0.50 && procA !== undefined && procA > 0.60);
    },
  },
];

// ─────────────────────────────────────────────
// EmergencePredictor
// ─────────────────────────────────────────────

/**
 * Predicts emergent behaviors from gene combinations and finds inter-seed
 * synergies.
 *
 * All predictions are deterministic and based on the BEHAVIOR_RULES and
 * SYNERGY_RULES knowledge bases. No LLM or external service calls.
 */
export class EmergencePredictor {
  /**
   * Analyze a seed's gene combinations to predict emergent behaviors.
   *
   * Each matching rule produces a PredictedBehavior. Multiple behaviors
   * can be predicted for a single seed (e.g., a fast, venomous creature
   * might be both a "skirmisher" and a "toxic_deterrent").
   *
   * @param seed - The seed to analyze.
   * @returns Array of predicted behaviors sorted by confidence descending.
   */
  predictBehaviors(seed: UniversalSeed): PredictedBehavior[] {
    const ctx = buildContext(seed);
    const predictions: PredictedBehavior[] = [];

    for (const rule of BEHAVIOR_RULES) {
      // Only evaluate if at least one trigger gene is present
      const presentTriggers = rule.triggerGenes.filter((g) => ctx.has(g));
      if (presentTriggers.length === 0) continue;

      if (rule.condition(ctx)) {
        // Confidence is base * (fraction of trigger genes present)
        const triggerCoverage = presentTriggers.length / rule.triggerGenes.length;
        const confidence = rule.baseConfidence * triggerCoverage;

        predictions.push({
          behavior: rule.behavior,
          description: rule.description,
          triggerGenes: presentTriggers,
          confidence: Math.round(confidence * 100) / 100,
        });
      }
    }

    predictions.sort((a, b) => b.confidence - a.confidence);
    return predictions;
  }

  /**
   * Find synergies between all seed pairs in a collection.
   *
   * Evaluates every pair against the SYNERGY_RULES engine. Only pairs
   * that match at least one rule are returned.
   *
   * @param seeds - Population to scan for synergies.
   * @returns Array of synergies sorted by strength descending.
   */
  findSynergies(seeds: readonly UniversalSeed[]): Synergy[] {
    const synergies: Synergy[] = [];

    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) {
        const seedA = seeds[i]!;
        const seedB = seeds[j]!;
        const ctxA = buildContext(seedA);
        const ctxB = buildContext(seedB);

        for (const rule of SYNERGY_RULES) {
          if (rule.condition(ctxA, ctxB, seedA.$domain, seedB.$domain)) {
            synergies.push({
              seedAHash: seedA.$hash,
              seedBHash: seedB.$hash,
              seedAName: seedA.$name,
              seedBName: seedB.$name,
              synergyType: rule.synergyType,
              description: rule.description,
              strength: rule.baseStrength,
            });
          }
        }
      }
    }

    synergies.sort((a, b) => b.strength - a.strength);
    return synergies;
  }
}
