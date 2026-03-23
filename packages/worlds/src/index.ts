/**
 * @paradigm/worlds — Procedural world generation.
 *
 * Seed-driven worlds with concentric zones, NPC entities,
 * and narrative structure. One seed → entire explorable ecosystem.
 * Every world parameter is a gene — worlds are evolvable.
 *
 * @packageDocumentation
 */

import { DeterministicRNG } from '@paradigm/rng';
import type { UniversalSeed, SeedDomain, GeneMap, PersonalityVector } from '@paradigm/types';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type BiomeType = 'forest' | 'desert' | 'tundra' | 'volcanic' | 'oceanic' | 'crystal' | 'void' | 'celestial';

export type NPCRole = 'observer' | 'merchant' | 'guardian' | 'exile' | 'sage' | 'stranger';

export interface Zone {
  readonly index: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly biome: BiomeType;
  readonly difficulty: number;
  readonly entityDensity: number;
  readonly resourceAvailability: number;
  readonly atmosphere: string;
}

export interface WorldNPC {
  readonly id: string;
  readonly name: string;
  readonly role: NPCRole;
  readonly personality: PersonalityVector;
  readonly zoneIndex: number;
  readonly secret: string;
  readonly greeting: string;
}

export interface NarrativeStructure {
  readonly worldName: string;
  readonly mysteryName: string;
  readonly acts: readonly string[];
  readonly clues: readonly { text: string; zoneIndex: number }[];
}

export interface WorldBlueprint {
  readonly seed: UniversalSeed;
  readonly biome: BiomeType;
  readonly zones: readonly Zone[];
  readonly npcs: readonly WorldNPC[];
  readonly narrative: NarrativeStructure;
  readonly fieldConfig: { dominantField: string; intensity: number };
}

// ═══════════════════════════════════════════════════════════════════
// Name Generators — Deterministic procedural naming
// ═══════════════════════════════════════════════════════════════════

const ADJECTIVES = ['Whispering', 'Shattered', 'Eternal', 'Forgotten', 'Crimson', 'Silent', 'Radiant', 'Cursed', 'Ancient', 'Burning', 'Frozen', 'Twilight', 'Hidden', 'Fallen', 'Mystic'];
const NOUNS = ['Spire', 'Valley', 'Citadel', 'Depths', 'Throne', 'Gardens', 'Sanctum', 'Wastes', 'Archives', 'Forge', 'Hollow', 'Crown', 'Abyss', 'Bastion', 'Nexus'];
const NAMES = ['Aldoria', 'Kael', 'Morvath', 'Seraphine', 'Zephyris', 'Thalindra', 'Oberon', 'Vexandra', 'Corinth', 'Lysander', 'Nyx', 'Drakken', 'Elara', 'Grimshaw', 'Volantis'];
const MYSTERIES = ['Disappearance', 'Betrayal', 'Awakening', 'Convergence', 'Eclipse', 'Prophecy', 'Inheritance', 'Transformation', 'Corruption', 'Ascension'];
const NPC_NAMES = ['Ash', 'Flint', 'Coral', 'Sage', 'Ember', 'Frost', 'Thorn', 'Pearl', 'Raven', 'Storm', 'Cypress', 'Onyx', 'Ivy', 'Basalt', 'Glimmer', 'Shade'];
const SECRETS = ['knows the truth about the vanishing', 'saw something in the outer zone', 'carries a fragment of the key', 'is not who they claim to be', 'guards the last passage', 'remembers the time before'];
const GREETINGS = ['You look like you could use some answers.', 'Be careful around here.', 'I have been expecting someone.', 'The zones are not safe anymore.', 'I can trade information for trust.', 'You should not have come here.'];
const ATMOSPHERES = ['warm and inviting, golden light', 'tense and watchful, flickering shadows', 'oppressive and dark, strange whispers', 'serene and cold, crystal echoes', 'chaotic and unstable, reality bends'];

const NPC_ROLES: readonly NPCRole[] = ['observer', 'merchant', 'guardian', 'exile', 'sage', 'stranger'];

// ═══════════════════════════════════════════════════════════════════
// ZoneGenerator — Concentric zones from world seed
// ═══════════════════════════════════════════════════════════════════

export class ZoneGenerator {
  generate(zoneCount: number, biome: BiomeType, rng: DeterministicRNG): Zone[] {
    const zones: Zone[] = [];
    let innerRadius = 0;

    for (let i = 0; i < zoneCount; i++) {
      const outerRadius = innerRadius + 8 + rng.next() * 12;
      const t = i / Math.max(1, zoneCount - 1); // 0 = center, 1 = outer

      zones.push({
        index: i,
        innerRadius,
        outerRadius,
        biome,
        difficulty: 0.1 + t * 0.8 + rng.next() * 0.1,
        entityDensity: 0.8 - t * 0.5 + rng.next() * 0.2,
        resourceAvailability: 0.7 - t * 0.4 + rng.next() * 0.2,
        atmosphere: ATMOSPHERES[Math.min(i, ATMOSPHERES.length - 1)]!,
      });

      innerRadius = outerRadius;
    }

    return zones;
  }
}

// ═══════════════════════════════════════════════════════════════════
// NPCGenerator — Generate NPC entities as evolvable seeds
// ═══════════════════════════════════════════════════════════════════

export class NPCGenerator {
  generate(count: number, zones: readonly Zone[], rng: DeterministicRNG): WorldNPC[] {
    const npcs: WorldNPC[] = [];

    for (let i = 0; i < count; i++) {
      const zoneIndex = Math.min(Math.floor(rng.next() * zones.length), zones.length - 1);
      const role = NPC_ROLES[Math.floor(rng.next() * NPC_ROLES.length)]!;

      const personality: PersonalityVector = {
        openness: 0.3 + rng.next() * 0.5,
        conscientiousness: 0.3 + rng.next() * 0.5,
        extraversion: 0.2 + rng.next() * 0.6,
        agreeableness: 0.2 + rng.next() * 0.6,
        neuroticism: 0.1 + rng.next() * 0.5,
        wit: 0.3 + rng.next() * 0.5,
        cunning: 0.2 + rng.next() * 0.6,
        courage: 0.3 + rng.next() * 0.5,
        loyalty: 0.3 + rng.next() * 0.5,
        adaptability: 0.3 + rng.next() * 0.5,
      };

      npcs.push({
        id: `npc_${i}`,
        name: NPC_NAMES[i % NPC_NAMES.length]!,
        role,
        personality,
        zoneIndex,
        secret: SECRETS[Math.floor(rng.next() * SECRETS.length)]!,
        greeting: GREETINGS[Math.floor(rng.next() * GREETINGS.length)]!,
      });
    }

    return npcs;
  }
}

// ═══════════════════════════════════════════════════════════════════
// NarrativeScaffold — Procedural story structure
// ═══════════════════════════════════════════════════════════════════

export class NarrativeScaffold {
  generate(biome: BiomeType, zones: readonly Zone[], rng: DeterministicRNG): NarrativeStructure {
    const adj = ADJECTIVES[Math.floor(rng.next() * ADJECTIVES.length)]!;
    const noun = NOUNS[Math.floor(rng.next() * NOUNS.length)]!;
    const name = NAMES[Math.floor(rng.next() * NAMES.length)]!;
    const mystery = MYSTERIES[Math.floor(rng.next() * MYSTERIES.length)]!;

    const worldName = `The ${adj} ${noun} of ${name}`;
    const mysteryName = `The ${mystery} of the ${adj} ${noun}`;

    const acts = [
      `Act I: Arrival in the ${adj} ${noun}`,
      `Act II: Discovery of the ${mystery}`,
      `Act III: Journey through the zones`,
      `Act IV: Confrontation in the outer reach`,
      `Act V: Resolution of the ${mystery}`,
    ];

    const clueCount = 3 + Math.floor(rng.next() * 3);
    const clues: { text: string; zoneIndex: number }[] = [];
    for (let i = 0; i < clueCount; i++) {
      clues.push({
        text: `A fragment of the ${mystery.toLowerCase()} lies here...`,
        zoneIndex: Math.min(Math.floor(rng.next() * zones.length), zones.length - 1),
      });
    }

    return { worldName, mysteryName, acts, clues };
  }
}

// ═══════════════════════════════════════════════════════════════════
// WorldGenerator — Main orchestrator
// ═══════════════════════════════════════════════════════════════════

const BIOMES: readonly BiomeType[] = ['forest', 'desert', 'tundra', 'volcanic', 'oceanic', 'crystal', 'void', 'celestial'];
const FIELD_FOR_BIOME: Record<BiomeType, { field: string; intensity: number }> = {
  forest: { field: 'nature', intensity: 0.6 },
  desert: { field: 'heat', intensity: 0.7 },
  tundra: { field: 'cold', intensity: 0.8 },
  volcanic: { field: 'heat', intensity: 0.9 },
  oceanic: { field: 'gravity', intensity: 0.4 },
  crystal: { field: 'magic', intensity: 0.7 },
  void: { field: 'void', intensity: 0.9 },
  celestial: { field: 'light', intensity: 0.8 },
};

/**
 * Generates a complete WorldBlueprint from a seed string.
 * Deterministic — same seed → identical world.
 */
export class WorldGenerator {
  private readonly zones = new ZoneGenerator();
  private readonly npcs = new NPCGenerator();
  private readonly narrative = new NarrativeScaffold();

  generate(seedString: string): WorldBlueprint {
    const rng = new DeterministicRNG(seedString);

    const biome = BIOMES[Math.floor(rng.next() * BIOMES.length)]!;
    const zoneCount = 2 + Math.floor(rng.next() * 4); // 2-5 zones
    const npcCount = 3 + Math.floor(rng.next() * 6);  // 3-8 NPCs

    const generatedZones = this.zones.generate(zoneCount, biome, rng);
    const generatedNPCs = this.npcs.generate(npcCount, generatedZones, rng);
    const generatedNarrative = this.narrative.generate(biome, generatedZones, rng);

    const fieldConfig = FIELD_FOR_BIOME[biome];

    // Create world seed with genes
    const genes: GeneMap = {
      biome: { type: 'categorical', value: biome, options: [...BIOMES] },
      zoneCount: { type: 'scalar', value: zoneCount, min: 1, max: 7 },
      npcCount: { type: 'scalar', value: npcCount, min: 0, max: 15 },
      difficulty: { type: 'scalar', value: 0.5, min: 0, max: 1 },
    };

    const worldSeed: UniversalSeed = {
      $gst: '4.0',
      $domain: 'ecosystem' as SeedDomain,
      $hash: `world_${rng.next().toString(36).slice(2, 10)}`,
      $name: generatedNarrative.worldName,
      $lineage: { generation: 0, parents: [], timestamp: Date.now() },
      $metadata: { created: Date.now(), description: generatedNarrative.mysteryName },
      genes,
    };

    return {
      seed: worldSeed,
      biome,
      zones: generatedZones,
      npcs: generatedNPCs,
      narrative: generatedNarrative,
      fieldConfig: { dominantField: fieldConfig.field, intensity: fieldConfig.intensity },
    };
  }
}
