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

  // ─── Code archetypes ───
  {
    behavior: 'clean_architecture',
    description: 'High maintainability and test coverage. Code that passes every review.',
    triggerGenes: ['maintainability', 'test_coverage'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const maint = ctx.scalar('maintainability');
      const tests = ctx.scalar('test_coverage');
      return maint !== undefined && tests !== undefined && maint > 0.70 && tests > 0.70;
    },
  },
  {
    behavior: 'tech_debt',
    description: 'Low maintainability with high complexity. A codebase heading for trouble.',
    triggerGenes: ['maintainability', 'complexity'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const maint = ctx.scalar('maintainability');
      const comp = ctx.scalar('complexity');
      return maint !== undefined && comp !== undefined && maint < 0.30 && comp > 0.70;
    },
  },
  {
    behavior: 'rapid_prototyper',
    description: 'Moves fast with low test coverage. Ships quick but brittle.',
    triggerGenes: ['performance', 'test_coverage'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const perf = ctx.scalar('performance');
      const tests = ctx.scalar('test_coverage');
      return perf !== undefined && tests !== undefined && perf > 0.60 && tests < 0.25;
    },
  },
  {
    behavior: 'over_engineer',
    description: 'High complexity paired with high maintainability. Abstractions everywhere.',
    triggerGenes: ['complexity', 'maintainability'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const comp = ctx.scalar('complexity');
      const maint = ctx.scalar('maintainability');
      return comp !== undefined && maint !== undefined && comp > 0.75 && maint > 0.75;
    },
  },
  {
    behavior: 'test_obsessed',
    description: 'Extremely high test coverage. Every edge case is covered, sometimes at the expense of velocity.',
    triggerGenes: ['test_coverage'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const tests = ctx.scalar('test_coverage');
      return tests !== undefined && tests > 0.90;
    },
  },
  {
    behavior: 'performance_zealot',
    description: 'Optimizes every microsecond at the cost of readability and maintainability.',
    triggerGenes: ['performance', 'maintainability'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const perf = ctx.scalar('performance');
      const maint = ctx.scalar('maintainability');
      return perf !== undefined && maint !== undefined && perf > 0.85 && maint < 0.35;
    },
  },
  {
    behavior: 'documentation_hermit',
    description: 'Complex code with poor maintainability. Knowledge locked in one person\'s head.',
    triggerGenes: ['maintainability', 'complexity'],
    baseConfidence: 0.70,
    condition: (ctx) => {
      const maint = ctx.scalar('maintainability');
      const comp = ctx.scalar('complexity');
      return maint !== undefined && comp !== undefined && maint < 0.25 && comp > 0.60;
    },
  },

  // ─── Narrative archetypes ───
  {
    behavior: 'slow_burn',
    description: 'High coherence with deliberate pacing. Rewards patient readers.',
    triggerGenes: ['coherence', 'pacing'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const coh = ctx.scalar('coherence');
      const pac = ctx.scalar('pacing');
      return coh !== undefined && pac !== undefined && coh > 0.70 && pac < 0.35;
    },
  },
  {
    behavior: 'plot_twist_master',
    description: 'High tension with moderate coherence. Surprises around every corner.',
    triggerGenes: ['tension', 'coherence'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const tens = ctx.scalar('tension');
      const coh = ctx.scalar('coherence');
      return tens !== undefined && coh !== undefined && tens > 0.75 && coh > 0.35 && coh < 0.70;
    },
  },
  {
    behavior: 'character_driven',
    description: 'Deep character development prioritized over fast pacing.',
    triggerGenes: ['character_depth', 'pacing'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const depth = ctx.scalar('character_depth');
      const pac = ctx.scalar('pacing');
      return depth !== undefined && pac !== undefined && depth > 0.70 && pac < 0.45;
    },
  },
  {
    behavior: 'world_builder',
    description: 'Expansive word count with strong coherence. Immersive fictional universes.',
    triggerGenes: ['word_count', 'coherence'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const wc = ctx.scalar('word_count');
      const coh = ctx.scalar('coherence');
      return wc !== undefined && coh !== undefined && wc > 0.50 && coh > 0.65;
    },
  },
  {
    behavior: 'unreliable_narrator',
    description: 'Low coherence paired with high tension. Reader questions everything.',
    triggerGenes: ['coherence', 'tension'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const coh = ctx.scalar('coherence');
      const tens = ctx.scalar('tension');
      return coh !== undefined && tens !== undefined && coh < 0.30 && tens > 0.65;
    },
  },

  // ─── Game design archetypes ───
  {
    behavior: 'balanced_designer',
    description: 'Moderate difficulty with high fun factor. Accessible and enjoyable.',
    triggerGenes: ['difficulty', 'fun_factor'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const diff = ctx.scalar('difficulty');
      const fun = ctx.scalar('fun_factor');
      return diff !== undefined && fun !== undefined
        && diff > 0.30 && diff < 0.65 && fun > 0.65;
    },
  },
  {
    behavior: 'difficulty_spiker',
    description: 'Punishingly difficult with low fun factor. Drives players away.',
    triggerGenes: ['difficulty', 'fun_factor'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const diff = ctx.scalar('difficulty');
      const fun = ctx.scalar('fun_factor');
      return diff !== undefined && fun !== undefined && diff > 0.80 && fun < 0.30;
    },
  },
  {
    behavior: 'roguelike_purist',
    description: 'High replayability paired with high difficulty. Each run is a fresh challenge.',
    triggerGenes: ['replayability', 'difficulty'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const rep = ctx.scalar('replayability');
      const diff = ctx.scalar('difficulty');
      return rep !== undefined && diff !== undefined && rep > 0.70 && diff > 0.65;
    },
  },
  {
    behavior: 'accessibility_champion',
    description: 'Low difficulty with high fun factor. Inclusive game design that welcomes everyone.',
    triggerGenes: ['difficulty', 'fun_factor'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const diff = ctx.scalar('difficulty');
      const fun = ctx.scalar('fun_factor');
      return diff !== undefined && fun !== undefined && diff < 0.25 && fun > 0.65;
    },
  },

  // ─── UI/UX archetypes ───
  {
    behavior: 'minimalist_ui',
    description: 'Low complexity with high usability. Every element earns its place.',
    triggerGenes: ['usability'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const usab = ctx.scalar('usability');
      return usab !== undefined && usab > 0.80;
    },
  },
  {
    behavior: 'feature_creep',
    description: 'High complexity with declining usability. Too many features, too little focus.',
    triggerGenes: ['usability', 'accessibility'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const usab = ctx.scalar('usability');
      const acc = ctx.scalar('accessibility');
      return usab !== undefined && acc !== undefined && usab < 0.35 && acc < 0.35;
    },
  },
  {
    behavior: 'accessibility_first',
    description: 'High accessibility score with solid usability. Designed for everyone.',
    triggerGenes: ['accessibility', 'usability'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const acc = ctx.scalar('accessibility');
      const usab = ctx.scalar('usability');
      return acc !== undefined && usab !== undefined && acc > 0.75 && usab > 0.50;
    },
  },
  {
    behavior: 'mobile_first',
    description: 'High responsiveness. Designed from small screens up.',
    triggerGenes: ['responsiveness'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const resp = ctx.scalar('responsiveness');
      return resp !== undefined && resp > 0.85;
    },
  },

  // ─── Audio/Music archetypes ───
  {
    behavior: 'ambient_sculptor',
    description: 'Low tempo with high harmony. Creates atmospheric soundscapes.',
    triggerGenes: ['tempo', 'complexity'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const tempo = ctx.scalar('tempo');
      const energy = ctx.scalar('energy');
      return tempo !== undefined && energy !== undefined && tempo < 0.30 && energy < 0.35;
    },
  },
  {
    behavior: 'beat_dropper',
    description: 'High tempo with high energy. Drives the crowd wild.',
    triggerGenes: ['tempo', 'energy'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const tempo = ctx.scalar('tempo');
      const energy = ctx.scalar('energy');
      return tempo !== undefined && energy !== undefined && tempo > 0.70 && energy > 0.75;
    },
  },
  {
    behavior: 'leitmotif_weaver',
    description: 'High musical complexity with strong coherence. Recurring themes bind the composition.',
    triggerGenes: ['complexity', 'energy'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const comp = ctx.scalar('complexity');
      return comp !== undefined && comp > 0.75;
    },
  },

  // ─── Shader archetypes ───
  {
    behavior: 'raymarcher',
    description: 'Extreme visual quality at the expense of performance. Signed distance fields for days.',
    triggerGenes: ['visual_quality', 'performance'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const vq = ctx.scalar('visual_quality');
      const perf = ctx.scalar('performance');
      return vq !== undefined && perf !== undefined && vq > 0.80 && perf < 0.35;
    },
  },
  {
    behavior: 'performance_shader',
    description: 'High performance with modest visual complexity. Optimized for real-time rendering.',
    triggerGenes: ['performance', 'complexity'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const perf = ctx.scalar('performance');
      const comp = ctx.scalar('complexity');
      return perf !== undefined && comp !== undefined && perf > 0.75 && comp < 0.35;
    },
  },

  // ─── Network archetypes ───
  {
    behavior: 'scale_free_hub',
    description: 'Massive node count with low density. A few hubs dominate connectivity.',
    triggerGenes: ['nodes', 'density'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const nodes = ctx.scalar('nodes');
      const dens = ctx.scalar('density');
      return nodes !== undefined && dens !== undefined && nodes > 0.60 && dens < 0.20;
    },
  },
  {
    behavior: 'mesh_warrior',
    description: 'High density with high redundancy. Every node connects to every other.',
    triggerGenes: ['density', 'nodes'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const dens = ctx.scalar('density');
      return dens !== undefined && dens > 0.70;
    },
  },

  // ─── Security archetypes ───
  {
    behavior: 'zero_day_hunter',
    description: 'High stealth with devastating impact. An advanced persistent threat.',
    triggerGenes: ['stealth', 'persistence'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const stealth = ctx.scalar('stealth');
      const persist = ctx.scalar('persistence');
      return stealth !== undefined && persist !== undefined && stealth > 0.80 && persist > 0.60;
    },
  },
  {
    behavior: 'script_kiddie',
    description: 'Low stealth and low persistence. Noisy, unsophisticated attacks.',
    triggerGenes: ['stealth', 'persistence'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const stealth = ctx.scalar('stealth');
      const persist = ctx.scalar('persistence');
      return stealth !== undefined && persist !== undefined && stealth < 0.25 && persist < 0.25;
    },
  },

  // ─── Simulation archetypes ───
  {
    behavior: 'high_fidelity_sim',
    description: 'Extremely accurate simulation with tiny timesteps. Research-grade precision.',
    triggerGenes: ['accuracy', 'timestep'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const acc = ctx.scalar('accuracy');
      const ts = ctx.scalar('timestep');
      return acc !== undefined && ts !== undefined && acc > 0.85 && ts < 0.10;
    },
  },
  {
    behavior: 'massive_simulation',
    description: 'Huge entity count. Agent-based modeling at scale.',
    triggerGenes: ['entity_count'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const ec = ctx.scalar('entity_count');
      return ec !== undefined && ec > 0.70;
    },
  },

  // ─── Intelligence/Neural archetypes ───
  {
    behavior: 'deep_learner',
    description: 'Many layers with large neuron count. Learns complex representations.',
    triggerGenes: ['layers', 'neurons_per_layer'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const layers = ctx.scalar('layers');
      const neurons = ctx.scalar('neurons_per_layer');
      return layers !== undefined && neurons !== undefined && layers > 0.50 && neurons > 0.50;
    },
  },
  {
    behavior: 'creative_intelligence',
    description: 'High creativity and adaptability. Generates novel solutions.',
    triggerGenes: ['creativity', 'adaptability'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const crea = ctx.scalar('creativity');
      const adapt = ctx.scalar('adaptability');
      return crea !== undefined && adapt !== undefined && crea > 0.70 && adapt > 0.60;
    },
  },

  // ─── Ecosystem archetypes ───
  {
    behavior: 'biodiversity_hotspot',
    description: 'Extremely high biodiversity with stable energy flow. A thriving ecosystem.',
    triggerGenes: ['biodiversity', 'stability'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const bio = ctx.scalar('biodiversity');
      const stab = ctx.scalar('stability');
      return bio !== undefined && stab !== undefined && bio > 0.75 && stab > 0.60;
    },
  },
  {
    behavior: 'collapsing_ecosystem',
    description: 'Low biodiversity with low stability. On the brink of extinction cascade.',
    triggerGenes: ['biodiversity', 'stability'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const bio = ctx.scalar('biodiversity');
      const stab = ctx.scalar('stability');
      return bio !== undefined && stab !== undefined && bio < 0.20 && stab < 0.25;
    },
  },

  // ─── Product archetypes ───
  {
    behavior: 'product_market_fit',
    description: 'High market fit and usability. The product people actually want.',
    triggerGenes: ['market_fit', 'usability'],
    baseConfidence: 0.85,
    condition: (ctx) => {
      const mf = ctx.scalar('market_fit');
      const usab = ctx.scalar('usability');
      return mf !== undefined && usab !== undefined && mf > 0.75 && usab > 0.65;
    },
  },
  {
    behavior: 'zombie_product',
    description: 'Low market fit and low monetization. Alive but not thriving.',
    triggerGenes: ['market_fit', 'monetization'],
    baseConfidence: 0.75,
    condition: (ctx) => {
      const mf = ctx.scalar('market_fit');
      const mon = ctx.scalar('monetization');
      return mf !== undefined && mon !== undefined && mf < 0.25 && mon < 0.25;
    },
  },

  // ─── Physical domain archetypes ───
  {
    behavior: 'stable_crystal',
    description: 'High hardness with ordered symmetry. A gem-quality crystal.',
    triggerGenes: ['hardness', 'transparency'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const hard = ctx.scalar('hardness');
      const trans = ctx.scalar('transparency');
      return hard !== undefined && trans !== undefined && hard > 0.70 && trans > 0.50;
    },
  },
  {
    behavior: 'turbulent_flow',
    description: 'High turbulence with high flow rate. Chaotic fluid dynamics.',
    triggerGenes: ['turbulence', 'flow_rate'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const turb = ctx.scalar('turbulence');
      const flow = ctx.scalar('flow_rate');
      return turb !== undefined && flow !== undefined && turb > 0.70 && flow > 0.60;
    },
  },
  {
    behavior: 'void_collapse',
    description: 'High entropy with low stability. The void is consuming itself.',
    triggerGenes: ['entropy', 'stability'],
    baseConfidence: 0.80,
    condition: (ctx) => {
      const ent = ctx.scalar('entropy');
      const stab = ctx.scalar('stability');
      return ent !== undefined && stab !== undefined && ent > 0.80 && stab < 0.20;
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

  // ─── Code synergies ───
  {
    synergyType: 'code_ui_integration',
    description: 'Code backend powers UI frontend. Full-stack synergy.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'code' && domainB === 'ui')
        || (domainA === 'ui' && domainB === 'code');
    },
  },
  {
    synergyType: 'code_test_quality',
    description: 'High-coverage code combined with well-tested components creates bulletproof systems.',
    baseStrength: 0.85,
    condition: (a, b) => {
      const testsA = a.scalar('test_coverage');
      const testsB = b.scalar('test_coverage');
      const maintA = a.scalar('maintainability');
      const maintB = b.scalar('maintainability');
      return (testsA !== undefined && testsA > 0.70 && maintB !== undefined && maintB > 0.70)
        || (testsB !== undefined && testsB > 0.70 && maintA !== undefined && maintA > 0.70);
    },
  },

  // ─── Narrative synergies ───
  {
    synergyType: 'narrative_music_score',
    description: 'Story and music seed combine to create emotionally scored narrative.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'narrative' && domainB === 'music')
        || (domainA === 'music' && domainB === 'narrative');
    },
  },
  {
    synergyType: 'narrative_cinematic_adaptation',
    description: 'Narrative adapted to cinematic format. Story meets visual storytelling.',
    baseStrength: 0.85,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'narrative' && domainB === 'cinematic')
        || (domainA === 'cinematic' && domainB === 'narrative');
    },
  },

  // ─── Game synergies ───
  {
    synergyType: 'game_audio_immersion',
    description: 'Game and audio seeds combine for immersive soundscaped gameplay.',
    baseStrength: 0.75,
    condition: (_a, _b, domainA, domainB) => {
      const gameDomains = new Set(['game', 'simulation']);
      const audioDomains = new Set(['audio', 'music', 'sound']);
      return (gameDomains.has(domainA) && audioDomains.has(domainB))
        || (gameDomains.has(domainB) && audioDomains.has(domainA));
    },
  },
  {
    synergyType: 'game_shader_visual',
    description: 'Game enhanced with custom shaders for unique visual identity.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'game' && (domainB === 'shader' || domainB === 'render'))
        || (domainB === 'game' && (domainA === 'shader' || domainA === 'render'));
    },
  },

  // ─── Security synergies ───
  {
    synergyType: 'threat_forensics_loop',
    description: 'Threat detection feeds forensic analysis. Attack-response feedback loop.',
    baseStrength: 0.85,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'security-threat' && domainB === 'forensics')
        || (domainA === 'forensics' && domainB === 'security-threat');
    },
  },
  {
    synergyType: 'intrusion_network_defense',
    description: 'Intrusion knowledge combined with network topology for defense in depth.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'intrusion' && domainB === 'network')
        || (domainA === 'network' && domainB === 'intrusion');
    },
  },

  // ─── Infrastructure synergies ───
  {
    synergyType: 'city_ecosystem_sustainability',
    description: 'Urban planning meets ecological balance. Sustainable city design.',
    baseStrength: 0.75,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'city' && domainB === 'ecosystem')
        || (domainA === 'ecosystem' && domainB === 'city');
    },
  },
  {
    synergyType: 'infrastructure_code_devops',
    description: 'Infrastructure and code combine for infrastructure-as-code automation.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'infrastructure' && domainB === 'code')
        || (domainA === 'code' && domainB === 'infrastructure');
    },
  },

  // ─── Science synergies ───
  {
    synergyType: 'neural_simulation_training',
    description: 'Neural architecture trained in simulation environment. Digital evolution.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'neural' && domainB === 'simulation')
        || (domainA === 'simulation' && domainB === 'neural');
    },
  },
  {
    synergyType: 'molecular_crystal_formation',
    description: 'Molecular properties determine crystal structure. Chemistry meets mineralogy.',
    baseStrength: 0.85,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'molecular' && domainB === 'crystal')
        || (domainA === 'crystal' && domainB === 'molecular');
    },
  },
  {
    synergyType: 'quantum_neural_computing',
    description: 'Quantum computing accelerates neural network training. Exponential speedup.',
    baseStrength: 0.70,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'quantum' && domainB === 'neural')
        || (domainA === 'neural' && domainB === 'quantum');
    },
  },

  // ─── Creative synergies ───
  {
    synergyType: 'brand_ui_consistency',
    description: 'Brand guidelines enforced through UI components. Cohesive user experience.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'brand' && domainB === 'ui')
        || (domainA === 'ui' && domainB === 'brand');
    },
  },
  {
    synergyType: 'logo_brand_identity',
    description: 'Logo and brand seed unite for complete visual identity system.',
    baseStrength: 0.90,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'logo' && domainB === 'brand')
        || (domainA === 'brand' && domainB === 'logo');
    },
  },
  {
    synergyType: 'shader_texture_material',
    description: 'Shader and texture combine for photorealistic or stylized material rendering.',
    baseStrength: 0.85,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'shader' && domainB === 'texture')
        || (domainA === 'texture' && domainB === 'shader');
    },
  },

  // ─── Physical synergies ───
  {
    synergyType: 'particle_fluid_dynamics',
    description: 'Particle physics applied to fluid simulation. SPH or Eulerian methods.',
    baseStrength: 0.75,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'particle' && domainB === 'fluid')
        || (domainA === 'fluid' && domainB === 'particle');
    },
  },
  {
    synergyType: 'intelligence_strategy_planning',
    description: 'Intelligence evaluates options while strategy executes the plan.',
    baseStrength: 0.80,
    condition: (_a, _b, domainA, domainB) => {
      return (domainA === 'intelligence' && domainB === 'strategy')
        || (domainA === 'strategy' && domainB === 'intelligence');
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
