/**
 * @paradigm/concept — Concept → Living Entity Compiler.
 *
 * Converts natural language descriptions into structured ConceptModels
 * and compiles them into UniversalSeeds with morphology, style, and
 * ability genes. Ports Sprite Forge's ISCA (Intelligent Sprite Concept
 * Analyzer) to TypeScript with full keyword-based analysis.
 *
 * @packageDocumentation
 */

import type {
  CharacterArchetype, BodyStructure, AnimationCapability,
  SecondaryActionElement, ISCAResult, ProportionRules, MorphologyGene,
  ConstraintRule, AbilityDefinition, ConceptModel, EntityBlueprint,
  StyleType, ConceptType, PersonalityVector, SymmetryType,
  UniversalSeed, GeneMap,
} from '@paradigm/types';
import { DeterministicRNG, generatePalette, srgbToHex } from '@paradigm/rng';
import { createSeed } from '@paradigm/seed';

// ═══════════════════════════════════════════════════════════════════
// ISCA Keyword Maps (Ported from Sprite Forge brain/isca.py)
// ═══════════════════════════════════════════════════════════════════

const ARCHETYPE_KEYWORDS: Record<CharacterArchetype, readonly string[]> = {
  warrior: ['warrior', 'fighter', 'soldier', 'barbarian', 'gladiator', 'samurai', 'viking', 'mercenary'],
  mage: ['mage', 'wizard', 'sorcerer', 'witch', 'warlock', 'magician', 'spellcaster', 'alchemist', 'enchanter', 'shaman', 'druid', 'sage', 'mystic'],
  archer: ['archer', 'ranger', 'bowman', 'hunter', 'marksman', 'sniper', 'scout'],
  rogue: ['rogue', 'thief', 'assassin', 'ninja', 'spy', 'shadow', 'dancer', 'acrobat', 'pirate'],
  knight: ['knight', 'crusader', 'templar', 'champion', 'armored'],
  berserker: ['berserker', 'rage', 'frenzy', 'brute'],
  paladin: ['paladin', 'holy knight', 'cleric knight', 'holy warrior'],
  healer: ['healer', 'cleric', 'priest', 'priestess', 'medic', 'monk', 'nun'],
  bard: ['bard', 'minstrel', 'musician', 'performer', 'troubadour'],
  summoner: ['summoner', 'necromancer', 'conjurer', 'invoker'],
  beast: ['beast', 'wolf', 'bear', 'lion', 'tiger', 'cat', 'dog', 'fox', 'creature', 'owl', 'bird', 'eagle', 'hawk', 'raven', 'crow', 'spider', 'scorpion', 'boar', 'stag', 'rabbit'],
  undead: ['undead', 'zombie', 'skeleton', 'lich', 'vampire', 'ghost', 'wraith', 'revenant'],
  elemental: ['elemental', 'spirit', 'wisp', 'djinn', 'genie'],
  dragon: ['dragon', 'drake', 'wyvern', 'wyrm', 'hydra', 'basilisk'],
  demon: ['demon', 'devil', 'imp', 'fiend', 'succubus', 'incubus'],
  golem: ['golem', 'construct', 'automaton', 'robot', 'clockwork', 'mechanical', 'mech', 'android', 'cyborg', 'puppet'],
  merchant: ['merchant', 'trader', 'shopkeeper', 'vendor', 'peddler'],
  villager: ['villager', 'farmer', 'peasant', 'civilian', 'npc', 'blacksmith', 'innkeeper'],
  royalty: ['king', 'queen', 'prince', 'princess', 'royal', 'emperor', 'empress', 'lord', 'lady'],
  guard: ['guard', 'sentinel', 'watchman', 'protector', 'captain'],
  unknown: [],
};

const BODY_KEYWORDS: Record<BodyStructure, readonly string[]> = {
  humanoid: ['human', 'elf', 'dwarf', 'orc', 'person', 'man', 'woman', 'boy', 'girl', 'knight', 'warrior', 'mage'],
  quadruped: ['wolf', 'bear', 'lion', 'horse', 'dog', 'cat', 'fox', 'deer', 'quadruped'],
  winged: ['dragon', 'griffin', 'phoenix', 'angel', 'fairy', 'bat', 'bird', 'winged'],
  serpentine: ['snake', 'serpent', 'worm', 'naga', 'lamia', 'wyrm'],
  amorphous: ['slime', 'blob', 'ooze', 'amorphous', 'jelly', 'pudding'],
  mechanical: ['robot', 'mech', 'automaton', 'machine', 'cyborg', 'android'],
  multi_limbed: ['spider', 'octopus', 'insect', 'centaur', 'multi-arm'],
  floating: ['ghost', 'wisp', 'spirit', 'specter', 'floating', 'wraith', 'phantom'],
};

const WEAPON_KEYWORDS: Record<string, readonly string[]> = {
  sword: ['sword', 'blade', 'katana', 'rapier', 'saber', 'scimitar', 'greatsword', 'claymore'],
  axe: ['axe', 'hatchet', 'battleaxe', 'cleaver'],
  bow: ['bow', 'longbow', 'shortbow', 'crossbow'],
  staff: ['staff', 'wand', 'scepter', 'rod', 'stave'],
  spear: ['spear', 'lance', 'pike', 'halberd', 'trident', 'javelin'],
  dagger: ['dagger', 'knife', 'stiletto', 'shiv'],
  hammer: ['hammer', 'mace', 'flail', 'club', 'warhammer', 'maul'],
  shield: ['shield', 'buckler', 'aegis'],
  gun: ['gun', 'pistol', 'rifle', 'musket', 'cannon'],
  scythe: ['scythe', 'sickle'],
};

const ARMOR_KEYWORDS: Record<string, readonly string[]> = {
  heavy_armor: ['plate', 'full armor', 'heavy armor', 'iron armor', 'steel armor'],
  light_armor: ['leather', 'light armor', 'hide', 'studded'],
  robes: ['robe', 'robes', 'cloak', 'cape', 'mantle', 'vestment'],
  cloth: ['cloth', 'tunic', 'dress', 'gown'],
  chain: ['chain', 'chainmail', 'chain mail', 'ring mail'],
};

const ELEMENT_KEYWORDS: Record<string, readonly string[]> = {
  fire: ['fire', 'flame', 'burning', 'inferno', 'ember', 'blaze', 'lava', 'magma'],
  ice: ['ice', 'frost', 'frozen', 'blizzard', 'snow', 'cold', 'glacial'],
  lightning: ['lightning', 'thunder', 'electric', 'shock', 'storm', 'volt'],
  water: ['water', 'aqua', 'ocean', 'sea', 'wave', 'rain', 'tide'],
  earth: ['earth', 'stone', 'rock', 'crystal', 'mineral', 'sand', 'terra'],
  wind: ['wind', 'air', 'gust', 'tornado', 'tempest', 'breeze'],
  light: ['light', 'holy', 'divine', 'radiant', 'luminous', 'celestial', 'sacred'],
  dark: ['dark', 'shadow', 'void', 'night', 'obsidian', 'death', 'necrotic'],
  nature: ['nature', 'plant', 'vine', 'leaf', 'forest', 'wood', 'tree', 'bloom'],
  poison: ['poison', 'toxic', 'venom', 'acid', 'plague'],
};

const COLOR_KEYWORDS = [
  'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black',
  'white', 'gold', 'silver', 'bronze', 'crimson', 'azure', 'emerald',
  'scarlet', 'violet', 'teal', 'cyan', 'magenta', 'brown', 'grey', 'gray',
] as const;

const SECONDARY_ACTION_KEYWORDS: Record<SecondaryActionElement, readonly string[]> = {
  hair: ['hair', 'long hair', 'ponytail', 'braid', 'pigtails', 'flowing hair'],
  cape: ['cape', 'cloak', 'mantle', 'flowing robe'],
  tail: ['tail', 'fox tail', 'cat tail', 'dragon tail'],
  cloth: ['dress', 'skirt', 'loincloth', 'sash', 'scarf', 'ribbon', 'banner'],
  chains: ['chain', 'chains', 'pendant', 'necklace', 'amulet'],
  wings: ['wings', 'wing', 'feathered wings', 'bat wings'],
};

const STYLE_KEYWORDS: Record<StyleType, readonly string[]> = {
  anime: ['anime', 'manga', 'japanese', 'shonen', 'shoujo'],
  realistic: ['realistic', 'photorealistic', 'lifelike', 'detailed'],
  pixel: ['pixel', 'pixel art', '8-bit', '16-bit', 'retro', 'pixelated'],
  cyberpunk: ['cyberpunk', 'neon', 'sci-fi', 'futuristic', 'techno'],
  fantasy: ['fantasy', 'medieval', 'magical', 'enchanted'],
  minimal: ['minimal', 'simple', 'flat', 'clean', 'minimalist'],
  cartoon: ['cartoon', 'toon', 'comic', 'western', 'looney'],
  noir: ['noir', 'dark', 'gothic', 'gritty', 'monochrome'],
  default: [],
};

const CHIBI_KEYWORDS = ['chibi', 'cute', 'kawaii', 'tiny', 'adorable', 'deformed', 'sd', 'super deformed'];

const SPECIES_KEYWORDS: Record<string, readonly string[]> = {
  human: ['human', 'person', 'man', 'woman', 'boy', 'girl'],
  elf: ['elf', 'elven', 'elvish'],
  dwarf: ['dwarf', 'dwarven'],
  orc: ['orc', 'orcish', 'goblin'],
  dragon: ['dragon', 'drake', 'wyvern', 'wyrm'],
  rabbit: ['rabbit', 'bunny', 'hare'],
  wolf: ['wolf', 'werewolf', 'wolfman'],
  cat: ['cat', 'feline', 'neko'],
  fox: ['fox', 'kitsune'],
  demon: ['demon', 'devil', 'fiend'],
  angel: ['angel', 'seraph', 'celestial'],
  undead: ['undead', 'zombie', 'skeleton', 'lich', 'vampire'],
  golem: ['golem', 'construct', 'robot'],
  slime: ['slime', 'blob', 'ooze'],
};

// ═══════════════════════════════════════════════════════════════════
// ISCAAnalyzer — Intelligent Sprite Concept Analyzer
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyzes natural language prompts to extract character archetype,
 * body structure, animation capabilities, weapons, armor, elements,
 * and more. Direct TypeScript port of Sprite Forge's ISCAAnalyzer.
 */
export class ISCAAnalyzer {
  analyze(prompt: string): ISCAResult {
    const lower = prompt.toLowerCase().trim();
    const words = new Set(lower.match(/\b\w+\b/g) ?? []);

    const archetype = this.detectArchetype(lower);
    const bodyStructure = this.detectBodyStructure(lower, archetype);
    const capabilities = this.detectCapabilities(bodyStructure, archetype);
    const weapons = this.detectMap(lower, WEAPON_KEYWORDS);
    const armor = this.detectMap(lower, ARMOR_KEYWORDS);
    const elements = this.detectMap(lower, ELEMENT_KEYWORDS);
    const colors = COLOR_KEYWORDS.filter((c) => words.has(c));
    const keywords = this.extractKeywords(lower);
    const suggestedAnimations = this.suggestAnimations(capabilities, archetype);
    const secondaryActionElements = this.detectSecondaryActions(lower);
    const smearFramesNeeded = this.detectSmearFrames(lower);
    const equipmentLayers = this.detectEquipmentLayers(lower, archetype, weapons, armor);

    return {
      archetype,
      bodyStructure,
      capabilities,
      weapons,
      armor,
      elements,
      colors: [...colors],
      keywords,
      suggestedAnimations,
      secondaryActionElements,
      secondaryActionDelayFrames: secondaryActionElements.length > 0 ? 2 : 0,
      requiresSeparateLayers: secondaryActionElements.length > 0 || equipmentLayers.length > 1,
      equipmentLayers,
      smearFramesNeeded,
    };
  }

  private detectArchetype(prompt: string): CharacterArchetype {
    const scores = new Map<CharacterArchetype, number>();
    for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS) as Array<[CharacterArchetype, readonly string[]]>) {
      const score = keywords.reduce((s, kw) => s + (prompt.includes(kw) ? 1 : 0), 0);
      if (score > 0) scores.set(archetype, score);
    }
    if (scores.size === 0) return 'unknown';
    return [...scores.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }

  private detectBodyStructure(prompt: string, archetype: CharacterArchetype): BodyStructure {
    const scores = new Map<BodyStructure, number>();
    for (const [body, keywords] of Object.entries(BODY_KEYWORDS) as Array<[BodyStructure, readonly string[]]>) {
      const score = keywords.reduce((s, kw) => s + (prompt.includes(kw) ? 1 : 0), 0);
      if (score > 0) scores.set(body, score);
    }
    if (scores.size > 0) {
      return [...scores.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    }
    // Default based on archetype
    if (archetype === 'beast') return 'quadruped';
    if (archetype === 'dragon') return 'winged';
    if (archetype === 'elemental') return 'floating';
    return 'humanoid';
  }

  private detectCapabilities(body: BodyStructure, archetype: CharacterArchetype): AnimationCapability[] {
    const caps: Set<AnimationCapability> = new Set(['can_walk']);

    const bodyCaps: Record<BodyStructure, AnimationCapability[]> = {
      humanoid: ['can_run', 'can_jump', 'can_crouch', 'can_climb', 'can_sprint', 'can_dash'],
      quadruped: ['can_run', 'can_jump', 'can_sprint'],
      winged: ['can_fly', 'can_run', 'can_dash'],
      serpentine: ['can_swim'],
      amorphous: ['can_dash'],
      mechanical: ['can_run', 'can_jump', 'can_sprint'],
      multi_limbed: ['can_run', 'can_climb', 'can_sprint'],
      floating: ['can_fly', 'can_dash'],
    };
    for (const cap of bodyCaps[body] ?? []) caps.add(cap);

    const meleeArchetypes: CharacterArchetype[] = ['warrior', 'knight', 'berserker', 'rogue', 'paladin', 'guard'];
    if (meleeArchetypes.includes(archetype)) { caps.add('can_attack_melee'); caps.add('can_block'); }
    if (archetype === 'archer') caps.add('can_attack_ranged');
    const casterArchetypes: CharacterArchetype[] = ['mage', 'healer', 'summoner', 'bard', 'elemental'];
    if (casterArchetypes.includes(archetype)) caps.add('can_cast');
    if (archetype === 'dragon') { caps.add('can_fly'); caps.add('can_attack_melee'); }

    return [...caps];
  }

  private detectMap(prompt: string, map: Record<string, readonly string[]>): string[] {
    const found: string[] = [];
    for (const [type, keywords] of Object.entries(map)) {
      if (keywords.some((kw) => prompt.includes(kw))) found.push(type);
    }
    return found;
  }

  private extractKeywords(prompt: string): string[] {
    const stopwords = new Set(['a', 'an', 'the', 'with', 'and', 'or', 'in', 'on', 'of', 'for', 'is', 'are', 'it', 'this', 'that']);
    return (prompt.match(/\b\w+\b/g) ?? []).filter((w) => !stopwords.has(w) && w.length > 2);
  }

  private suggestAnimations(caps: AnimationCapability[], archetype: CharacterArchetype): string[] {
    const anims: string[] = ['idle'];
    const capToAnim: Partial<Record<AnimationCapability, string>> = {
      can_walk: 'walk', can_run: 'run', can_jump: 'jump', can_fly: 'fly',
      can_attack_melee: 'attack', can_attack_ranged: 'attack', can_cast: 'cast_spell',
      can_crouch: 'crouch', can_climb: 'climb',
    };
    for (const cap of caps) {
      const anim = capToAnim[cap];
      if (anim && !anims.includes(anim)) anims.push(anim);
    }
    anims.push('hurt', 'death');
    return anims;
  }

  private detectSecondaryActions(prompt: string): SecondaryActionElement[] {
    const found: SecondaryActionElement[] = [];
    for (const [element, keywords] of Object.entries(SECONDARY_ACTION_KEYWORDS) as Array<[SecondaryActionElement, readonly string[]]>) {
      if (keywords.some((kw) => prompt.includes(kw))) found.push(element);
    }
    return found;
  }

  private detectSmearFrames(prompt: string): number {
    const fastKeywords = ['fast', 'speed', 'blur', 'quick', 'swift', 'dash', 'teleport', 'lightning fast', 'rapid', 'flash', 'blink'];
    const count = fastKeywords.reduce((s, kw) => s + (prompt.includes(kw) ? 1 : 0), 0);
    return count >= 2 ? 2 : count >= 1 ? 1 : 0;
  }

  private detectEquipmentLayers(prompt: string, archetype: CharacterArchetype, weapons: string[], armor: string[]): string[] {
    const layers: string[] = ['base'];
    if (weapons.length > 0) { layers.push('weapon_r'); if (weapons.includes('shield')) layers.push('shield'); }
    if (armor.some((a) => a === 'heavy_armor' || a === 'chain')) layers.push('body_armor');
    if (armor.some((a) => a === 'robes' || a === 'cloth')) layers.push('body_cloth');
    if (['helmet', 'crown', 'hood', 'hat', 'tiara', 'circlet', 'mask'].some((kw) => prompt.includes(kw))) layers.push('head');
    if (['cape', 'cloak', 'wings', 'backpack', 'quiver'].some((kw) => prompt.includes(kw))) layers.push('back');

    const defaults: Partial<Record<CharacterArchetype, string[]>> = {
      knight: ['body_armor', 'weapon_r', 'shield'],
      mage: ['body_cloth', 'weapon_r'],
      archer: ['weapon_r', 'back'],
      rogue: ['weapon_r'],
    };
    for (const layer of defaults[archetype] ?? []) {
      if (!layers.includes(layer)) layers.push(layer);
    }
    return layers;
  }
}

// ═══════════════════════════════════════════════════════════════════
// StyleResolver — Keyword to style detection
// ═══════════════════════════════════════════════════════════════════

export class StyleResolver {
  resolveStyle(prompt: string): StyleType {
    const lower = prompt.toLowerCase();
    // Check chibi first (special case — overrides other styles)
    if (CHIBI_KEYWORDS.some((kw) => lower.includes(kw))) return 'cartoon'; // chibi uses cartoon base with proportion override

    for (const [style, keywords] of Object.entries(STYLE_KEYWORDS) as Array<[StyleType, readonly string[]]>) {
      if (style === 'default') continue;
      if (keywords.some((kw) => lower.includes(kw))) return style;
    }
    return 'default';
  }

  isChibi(prompt: string): boolean {
    return CHIBI_KEYWORDS.some((kw) => prompt.toLowerCase().includes(kw));
  }
}

// ═══════════════════════════════════════════════════════════════════
// MorphologyGrammar — Style → Proportions → Skeleton
// ═══════════════════════════════════════════════════════════════════

const STYLE_PROPORTIONS: Record<StyleType, ProportionRules> = {
  anime:     { headToBodyRatio: 0.20, limbToBodyRatio: 0.65, shoulderToHipRatio: 1.3, eyeToHeadRatio: 0.25 },
  realistic: { headToBodyRatio: 0.13, limbToBodyRatio: 0.75, shoulderToHipRatio: 1.4, eyeToHeadRatio: 0.12 },
  pixel:     { headToBodyRatio: 0.28, limbToBodyRatio: 0.50, shoulderToHipRatio: 1.2, eyeToHeadRatio: 0.20 },
  cyberpunk: { headToBodyRatio: 0.18, limbToBodyRatio: 0.70, shoulderToHipRatio: 1.5, eyeToHeadRatio: 0.18 },
  fantasy:   { headToBodyRatio: 0.18, limbToBodyRatio: 0.70, shoulderToHipRatio: 1.4, eyeToHeadRatio: 0.20 },
  minimal:   { headToBodyRatio: 0.30, limbToBodyRatio: 0.45, shoulderToHipRatio: 1.0, eyeToHeadRatio: 0.15 },
  cartoon:   { headToBodyRatio: 0.35, limbToBodyRatio: 0.45, shoulderToHipRatio: 1.1, eyeToHeadRatio: 0.30 },
  noir:      { headToBodyRatio: 0.15, limbToBodyRatio: 0.72, shoulderToHipRatio: 1.3, eyeToHeadRatio: 0.15 },
  default:   { headToBodyRatio: 0.20, limbToBodyRatio: 0.60, shoulderToHipRatio: 1.2, eyeToHeadRatio: 0.20 },
};

const CHIBI_PROPORTIONS: ProportionRules = {
  headToBodyRatio: 0.55,
  limbToBodyRatio: 0.30,
  shoulderToHipRatio: 1.0,
  eyeToHeadRatio: 0.40,
};

export class MorphologyGrammar {
  deriveProportions(style: StyleType, isChibi: boolean, exaggeration: number): ProportionRules {
    const base = isChibi ? CHIBI_PROPORTIONS : (STYLE_PROPORTIONS[style] ?? STYLE_PROPORTIONS['default']);
    // Apply exaggeration: moves proportions further from realistic toward stylized
    const realistic = STYLE_PROPORTIONS['realistic'];
    const t = exaggeration;
    return {
      headToBodyRatio: realistic.headToBodyRatio + (base.headToBodyRatio - realistic.headToBodyRatio) * t,
      limbToBodyRatio: realistic.limbToBodyRatio + (base.limbToBodyRatio - realistic.limbToBodyRatio) * t,
      shoulderToHipRatio: realistic.shoulderToHipRatio + (base.shoulderToHipRatio - realistic.shoulderToHipRatio) * t,
      eyeToHeadRatio: realistic.eyeToHeadRatio + (base.eyeToHeadRatio - realistic.eyeToHeadRatio) * t,
    };
  }

  deriveMorphologyGene(bodyStructure: BodyStructure, style: StyleType, isChibi: boolean): MorphologyGene {
    const exaggeration = isChibi ? 0.9 : (style === 'cartoon' ? 0.7 : style === 'anime' ? 0.5 : 0.3);
    const proportions = this.deriveProportions(style, isChibi, exaggeration);

    const symmetry: SymmetryType = bodyStructure === 'amorphous' ? 'asymmetric' : 'bilateral';

    return {
      bodyStructure,
      proportions,
      symmetry,
      exaggeration,
      skeletonOverrides: {},
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ConstraintEngine — Enforce visual consistency
// ═══════════════════════════════════════════════════════════════════

export class ConstraintEngine {
  deriveConstraints(style: StyleType, body: BodyStructure, isChibi: boolean): ConstraintRule[] {
    const rules: ConstraintRule[] = [
      { id: 'sym_bilateral', category: 'symmetry', description: 'Body must be bilaterally symmetric', priority: 0, check: 'symmetry === bilateral' },
      { id: 'silhouette_readable', category: 'silhouette', description: 'Silhouette must be readable at 32x32', priority: 0, check: 'silhouetteScore >= 0.7' },
    ];

    if (isChibi) {
      rules.push(
        { id: 'chibi_head', category: 'proportion', description: 'Head must dominate body (>40% height)', priority: 0, check: 'headToBodyRatio >= 0.4' },
        { id: 'chibi_limbs', category: 'proportion', description: 'Limbs must be stubby (<40% body)', priority: 1, check: 'limbToBodyRatio <= 0.4' },
      );
    }

    if (style === 'anime') {
      rules.push(
        { id: 'anime_eyes', category: 'style', description: 'Eyes must be large and expressive', priority: 1, check: 'eyeToHeadRatio >= 0.2' },
      );
    }

    if (body === 'winged') {
      rules.push(
        { id: 'wing_visible', category: 'readability', description: 'Wings must be visible in silhouette', priority: 0, check: 'wingSpan > 0' },
      );
    }

    return rules;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ConceptInterpreter — NL → ConceptModel
// ═══════════════════════════════════════════════════════════════════

export class ConceptInterpreter {
  private readonly isca = new ISCAAnalyzer();
  private readonly styleResolver = new StyleResolver();
  private readonly morphGrammar = new MorphologyGrammar();
  private readonly constraintEngine = new ConstraintEngine();

  interpret(input: string, styleOverride?: StyleType): ConceptModel {
    const iscaResult = this.isca.analyze(input);
    const isChibi = this.styleResolver.isChibi(input);
    const style = styleOverride ?? (isChibi ? 'cartoon' : this.styleResolver.resolveStyle(input));
    const species = this.detectSpecies(input);
    const morphology = this.morphGrammar.deriveMorphologyGene(iscaResult.bodyStructure, style, isChibi);
    const constraints = this.constraintEngine.deriveConstraints(style, iscaResult.bodyStructure, isChibi);
    const abilities = this.deriveAbilities(iscaResult);
    const personality = this.defaultPersonality(iscaResult.archetype);
    const conceptType = this.inferConceptType(iscaResult.archetype);

    return {
      name: this.deriveName(input),
      conceptType,
      archetype: iscaResult.archetype,
      bodyStructure: iscaResult.bodyStructure,
      species,
      personality,
      style,
      abilities,
      elements: iscaResult.elements,
      weapons: iscaResult.weapons,
      armor: iscaResult.armor,
      colors: iscaResult.colors,
      suggestedAnimations: iscaResult.suggestedAnimations,
      secondaryActions: iscaResult.secondaryActionElements,
      equipmentLayers: iscaResult.equipmentLayers,
      morphology,
      constraints,
      isca: iscaResult,
    };
  }

  private detectSpecies(input: string): string {
    const lower = input.toLowerCase();
    for (const [species, keywords] of Object.entries(SPECIES_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) return species;
    }
    return 'unknown';
  }

  private deriveName(input: string): string {
    // Capitalize first letter of each word, max 30 chars
    return input.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 30);
  }

  private deriveAbilities(isca: ISCAResult): AbilityDefinition[] {
    const abilities: AbilityDefinition[] = [];
    for (const element of isca.elements) {
      abilities.push({
        name: `${element} attack`,
        element,
        type: isca.capabilities.includes('can_cast') ? 'magic' : 'melee',
        visualEffect: `${element}_burst`,
        intensity: 0.7,
      });
    }
    if (abilities.length === 0 && isca.capabilities.includes('can_attack_melee')) {
      abilities.push({ name: 'melee strike', element: 'physical', type: 'melee', visualEffect: 'slash', intensity: 0.5 });
    }
    return abilities;
  }

  private defaultPersonality(archetype: CharacterArchetype): PersonalityVector {
    const presets: Partial<Record<CharacterArchetype, Partial<PersonalityVector>>> = {
      warrior: { courage: 0.9, conscientiousness: 0.7, extraversion: 0.6 },
      mage: { openness: 0.9, wit: 0.8, conscientiousness: 0.6 },
      rogue: { cunning: 0.9, adaptability: 0.8, agreeableness: 0.3 },
      healer: { agreeableness: 0.9, loyalty: 0.8, neuroticism: 0.3 },
      dragon: { courage: 0.8, openness: 0.5, extraversion: 0.4 },
      beast: { courage: 0.6, adaptability: 0.7, conscientiousness: 0.3 },
    };
    const base: PersonalityVector = {
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
      wit: 0.5, cunning: 0.5, courage: 0.5, loyalty: 0.5, adaptability: 0.5,
    };
    return { ...base, ...(presets[archetype] ?? {}) };
  }

  private inferConceptType(archetype: CharacterArchetype): ConceptType {
    const creatureArchetypes: CharacterArchetype[] = ['beast', 'dragon', 'elemental', 'demon', 'undead', 'golem'];
    return creatureArchetypes.includes(archetype) ? 'creature' : 'character';
  }
}

// ═══════════════════════════════════════════════════════════════════
// ConceptCompiler — ConceptModel → UniversalSeed
// ═══════════════════════════════════════════════════════════════════

export class ConceptCompiler {
  compile(concept: ConceptModel, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {};

    // Archetype gene
    genes['archetype'] = {
      type: 'categorical',
      value: concept.archetype,
      options: Object.keys(ARCHETYPE_KEYWORDS),
    };

    // Body structure gene
    genes['bodyStructure'] = {
      type: 'categorical',
      value: concept.bodyStructure,
      options: Object.keys(BODY_KEYWORDS),
    };

    // Style gene
    genes['style'] = {
      type: 'categorical',
      value: concept.style,
      options: Object.keys(STYLE_KEYWORDS),
    };

    // Species gene
    genes['species'] = {
      type: 'categorical',
      value: concept.species,
      options: Object.keys(SPECIES_KEYWORDS),
    };

    // Morphology proportions as vector gene
    genes['proportions'] = {
      type: 'vector',
      value: [
        concept.morphology.proportions.headToBodyRatio,
        concept.morphology.proportions.limbToBodyRatio,
        concept.morphology.proportions.shoulderToHipRatio,
        concept.morphology.proportions.eyeToHeadRatio,
      ],
      dimensions: 4,
    };

    // Exaggeration gene
    genes['exaggeration'] = {
      type: 'scalar',
      value: concept.morphology.exaggeration,
      min: 0,
      max: 1,
    };

    // Personality as vector gene (10 dimensions)
    genes['personality'] = {
      type: 'vector',
      value: [
        concept.personality.openness,
        concept.personality.conscientiousness,
        concept.personality.extraversion,
        concept.personality.agreeableness,
        concept.personality.neuroticism,
        concept.personality.wit,
        concept.personality.cunning,
        concept.personality.courage,
        concept.personality.loyalty,
        concept.personality.adaptability,
      ],
      dimensions: 10,
    };

    // Elements as categorical genes
    if (concept.elements.length > 0) {
      genes['primaryElement'] = {
        type: 'categorical',
        value: concept.elements[0]!,
        options: Object.keys(ELEMENT_KEYWORDS),
      };
    }

    // Generate OKLab palette
    const palette = generatePalette(concept.name, 5);
    genes['palette'] = {
      type: 'vector',
      value: palette.flatMap((c) => [c.r, c.g, c.b]),
      dimensions: palette.length * 3,
    };

    // ─── Rendering-Level Genes ────────────────────────
    // These map 1:1 to SDF parameters. Evolution mutates them → visual form changes.

    const props = concept.morphology.proportions;
    const exag = concept.morphology.exaggeration;

    // bodyParams: direct SDF geometry control
    genes['bodyParams'] = {
      type: 'struct',
      value: {
        torsoWidth:    { type: 'scalar' as const, value: this.deriveTorsoWidth(concept), min: 0.1, max: 0.5 },
        torsoHeight:   { type: 'scalar' as const, value: this.deriveTorsoHeight(concept), min: 0.2, max: 0.8 },
        headRadius:    { type: 'scalar' as const, value: props.headToBodyRatio * 0.7 + 0.05, min: 0.08, max: 0.5 },
        limbThickness: { type: 'scalar' as const, value: 0.05 + props.limbToBodyRatio * 0.08, min: 0.03, max: 0.2 },
        limbLength:    { type: 'scalar' as const, value: props.limbToBodyRatio * 0.7 + 0.1, min: 0.15, max: 0.8 },
        neckLength:    { type: 'scalar' as const, value: exag > 0.7 ? 0.05 : 0.12, min: 0.03, max: 0.25 },
      },
    };

    // appendages: optional extra geometry driven by concept analysis
    const arch = concept.archetype;
    const wingArchetypes: CharacterArchetype[] = ['dragon', 'demon'];
    const tailArchetypes: CharacterArchetype[] = ['dragon', 'demon', 'beast'];
    const hornArchetypes: CharacterArchetype[] = ['demon', 'dragon', 'beast'];

    const hasWings = concept.bodyStructure === 'winged' || wingArchetypes.includes(arch);
    const hasTail = hasWings || concept.bodyStructure === 'quadruped' || tailArchetypes.includes(arch);
    const hasHorns = hornArchetypes.includes(arch);

    genes['appendages'] = {
      type: 'struct',
      value: {
        hasWings: { type: 'scalar' as const, value: hasWings ? 1.0 : 0.0, min: 0, max: 1 },
        wingSpan: { type: 'scalar' as const, value: hasWings ? 0.8 + rng.next() * 0.5 : 0.0, min: 0.0, max: 1.5 },
        hasTail:  { type: 'scalar' as const, value: hasTail ? 1.0 : 0.0, min: 0, max: 1 },
        tailLength: { type: 'scalar' as const, value: hasTail ? 0.3 + rng.next() * 0.4 : 0.0, min: 0.0, max: 1.0 },
        hasHorns: { type: 'scalar' as const, value: hasHorns ? 1.0 : 0.0, min: 0, max: 1 },
        hornSize: { type: 'scalar' as const, value: hasHorns ? 0.08 + rng.next() * 0.15 : 0.0, min: 0.0, max: 0.3 },
      },
    };

    // surface: material parameters for PBR rendering
    genes['surface'] = {
      type: 'struct',
      value: {
        roughness:        { type: 'scalar' as const, value: this.deriveRoughness(concept), min: 0.0, max: 1.0 },
        metallic:         { type: 'scalar' as const, value: this.deriveMetallic(concept), min: 0.0, max: 1.0 },
        emission:         { type: 'scalar' as const, value: this.deriveEmission(concept), min: 0.0, max: 3.0 },
        outlineThickness: { type: 'scalar' as const, value: this.deriveOutline(concept), min: 0.0, max: 0.3 },
        blendSmoothness:  { type: 'scalar' as const, value: exag > 0.5 ? 0.15 : 0.08, min: 0.01, max: 0.3 },
      },
    };

    // motion: animation parameters
    genes['motion'] = {
      type: 'struct',
      value: {
        idleSpeed:           { type: 'scalar' as const, value: this.deriveIdleSpeed(concept), min: 0.5, max: 5.0 },
        breathingAmplitude:  { type: 'scalar' as const, value: 0.02 + exag * 0.04, min: 0.01, max: 0.1 },
        swayAmount:          { type: 'scalar' as const, value: concept.bodyStructure === 'floating' ? 0.1 : 0.02, min: 0.0, max: 0.2 },
        bobHeight:           { type: 'scalar' as const, value: concept.bodyStructure === 'floating' ? 0.1 : 0.0, min: 0.0, max: 0.15 },
      },
    };

    const domain = concept.conceptType === 'creature' ? 'organism' as const : 'organism' as const;

    return createSeed(concept.name, domain, genes, rng);
  }

  // ─── Derived Gene Value Functions ────────────────────

  private deriveTorsoWidth(concept: ConceptModel): number {
    const base = concept.bodyStructure === 'quadruped' ? 0.25 : 0.22;
    const arch = concept.archetype;
    if (arch === 'golem' || arch === 'berserker') return base + 0.12;
    if (arch === 'rogue' || arch === 'bard') return base - 0.05;
    return base + concept.morphology.exaggeration * 0.05;
  }

  private deriveTorsoHeight(concept: ConceptModel): number {
    if (concept.morphology.exaggeration > 0.7) return 0.3; // chibi: short torso
    if (concept.bodyStructure === 'quadruped') return 0.35;
    if (concept.bodyStructure === 'serpentine') return 0.15;
    return 0.5;
  }

  private deriveRoughness(concept: ConceptModel): number {
    if (concept.archetype === 'golem') return 0.8;
    if (concept.archetype === 'knight') return 0.25;
    if (concept.bodyStructure === 'amorphous') return 0.1;
    if (concept.elements.includes('ice')) return 0.05;
    if (concept.style === 'cartoon') return 0.9;
    return 0.5;
  }

  private deriveMetallic(concept: ConceptModel): number {
    if (concept.archetype === 'knight' || concept.archetype === 'golem') return 0.85;
    if (concept.bodyStructure === 'mechanical') return 0.9;
    if (concept.elements.includes('ice') || concept.elements.includes('earth')) return 0.15;
    return 0.0;
  }

  private deriveEmission(concept: ConceptModel): number {
    let em = 0.0;
    if (concept.elements.includes('fire')) em += 1.0;
    if (concept.elements.includes('lightning')) em += 0.8;
    if (concept.elements.includes('light')) em += 1.2;
    if (concept.elements.includes('dark')) em += 0.4;
    if (concept.archetype === 'elemental') em += 1.5;
    if (concept.bodyStructure === 'floating') em += 0.5;
    return Math.min(em, 3.0);
  }

  private deriveOutline(concept: ConceptModel): number {
    if (concept.style === 'anime' || concept.style === 'cartoon') return 0.15;
    if (concept.morphology.exaggeration > 0.7) return 0.2;
    if (concept.style === 'pixel') return 0.1;
    return 0.0;
  }

  private deriveIdleSpeed(concept: ConceptModel): number {
    if (concept.bodyStructure === 'floating') return 1.5;
    if (concept.bodyStructure === 'amorphous') return 3.0;
    if (concept.archetype === 'berserker') return 2.5;
    if (concept.archetype === 'healer') return 1.0;
    return 2.0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CanonicalDatabase — Known character presets
// ═══════════════════════════════════════════════════════════════════

interface CanonicalEntry {
  readonly keywords: readonly string[];
  readonly overrides: Partial<Pick<ConceptModel, 'archetype' | 'bodyStructure' | 'species' | 'style' | 'elements' | 'weapons' | 'armor' | 'abilities'>>;
}

const CANONICAL_ENTRIES: readonly CanonicalEntry[] = [
  // Anime / Manga
  { keywords: ['goku', 'son goku', 'kakarot'], overrides: { archetype: 'warrior', bodyStructure: 'humanoid', species: 'human', style: 'anime', elements: ['energy'], abilities: [{ name: 'Kamehameha', element: 'energy', type: 'ranged', visualEffect: 'energy_beam', intensity: 0.9 }, { name: 'Super Saiyan', element: 'energy', type: 'transformation', visualEffect: 'golden_aura', intensity: 1.0 }] } },
  { keywords: ['naruto', 'uzumaki'], overrides: { archetype: 'warrior', bodyStructure: 'humanoid', species: 'human', style: 'anime', elements: ['wind'], abilities: [{ name: 'Rasengan', element: 'wind', type: 'melee', visualEffect: 'spiral_sphere', intensity: 0.8 }] } },
  { keywords: ['luffy', 'monkey d'], overrides: { archetype: 'warrior', bodyStructure: 'humanoid', species: 'human', style: 'anime', elements: ['nature'], abilities: [{ name: 'Gum Gum Pistol', element: 'physical', type: 'melee', visualEffect: 'stretch_punch', intensity: 0.7 }] } },
  { keywords: ['pikachu'], overrides: { archetype: 'beast', bodyStructure: 'quadruped', species: 'rabbit', style: 'anime', elements: ['lightning'], abilities: [{ name: 'Thunderbolt', element: 'lightning', type: 'ranged', visualEffect: 'lightning_bolt', intensity: 0.8 }] } },
  // Western Cartoon
  { keywords: ['bugs bunny', 'bugs'], overrides: { archetype: 'beast', bodyStructure: 'humanoid', species: 'rabbit', style: 'cartoon', elements: [], abilities: [{ name: 'Toon Force', element: 'physical', type: 'passive', visualEffect: 'cartoon_stars', intensity: 0.5 }] } },
  { keywords: ['mickey mouse', 'mickey'], overrides: { archetype: 'beast', bodyStructure: 'humanoid', species: 'human', style: 'cartoon', elements: [] } },
  { keywords: ['mario', 'super mario'], overrides: { archetype: 'warrior', bodyStructure: 'humanoid', species: 'human', style: 'cartoon', elements: ['fire'], abilities: [{ name: 'Fireball', element: 'fire', type: 'ranged', visualEffect: 'fireball', intensity: 0.5 }] } },
  { keywords: ['link', 'legend of zelda'], overrides: { archetype: 'knight', bodyStructure: 'humanoid', species: 'elf', style: 'anime', elements: ['light'], weapons: ['sword', 'shield'] } },
  // Fantasy creatures
  { keywords: ['dragon', 'fire dragon'], overrides: { archetype: 'dragon', bodyStructure: 'winged', species: 'dragon', elements: ['fire'], abilities: [{ name: 'Fire Breath', element: 'fire', type: 'ranged', visualEffect: 'flame_cone', intensity: 0.9 }] } },
  { keywords: ['ice dragon', 'frost dragon'], overrides: { archetype: 'dragon', bodyStructure: 'winged', species: 'dragon', elements: ['ice'], abilities: [{ name: 'Ice Breath', element: 'ice', type: 'ranged', visualEffect: 'frost_cone', intensity: 0.9 }] } },
  { keywords: ['phoenix'], overrides: { archetype: 'beast', bodyStructure: 'winged', species: 'phoenix', elements: ['fire'], abilities: [{ name: 'Rebirth', element: 'fire', type: 'transformation', visualEffect: 'flame_burst', intensity: 1.0 }] } },
  { keywords: ['vampire'], overrides: { archetype: 'undead', bodyStructure: 'humanoid', species: 'undead', elements: ['dark'], abilities: [{ name: 'Drain', element: 'dark', type: 'melee', visualEffect: 'dark_tendrils', intensity: 0.7 }] } },
  { keywords: ['werewolf'], overrides: { archetype: 'beast', bodyStructure: 'humanoid', species: 'wolf', elements: ['nature'], abilities: [{ name: 'Lunar Transform', element: 'nature', type: 'transformation', visualEffect: 'moon_glow', intensity: 0.8 }] } },
  // Classic game archetypes
  { keywords: ['dark knight', 'death knight'], overrides: { archetype: 'knight', bodyStructure: 'humanoid', species: 'undead', style: 'fantasy', elements: ['dark'], weapons: ['sword'], armor: ['heavy_armor'] } },
  { keywords: ['fire mage', 'pyromancer'], overrides: { archetype: 'mage', bodyStructure: 'humanoid', species: 'human', style: 'fantasy', elements: ['fire'], weapons: ['staff'] } },
  { keywords: ['ice mage', 'cryomancer'], overrides: { archetype: 'mage', bodyStructure: 'humanoid', species: 'human', style: 'fantasy', elements: ['ice'], weapons: ['staff'] } },
  { keywords: ['paladin'], overrides: { archetype: 'paladin', bodyStructure: 'humanoid', species: 'human', style: 'fantasy', elements: ['light'], weapons: ['sword', 'shield'], armor: ['heavy_armor'] } },
  { keywords: ['necromancer'], overrides: { archetype: 'summoner', bodyStructure: 'humanoid', species: 'human', style: 'fantasy', elements: ['dark'], weapons: ['staff'] } },
  { keywords: ['ninja'], overrides: { archetype: 'rogue', bodyStructure: 'humanoid', species: 'human', style: 'anime', elements: ['dark'], weapons: ['dagger'] } },
  { keywords: ['samurai'], overrides: { archetype: 'warrior', bodyStructure: 'humanoid', species: 'human', style: 'anime', elements: [], weapons: ['sword'], armor: ['light_armor'] } },
  // Creatures
  { keywords: ['slime'], overrides: { archetype: 'elemental', bodyStructure: 'amorphous', species: 'slime', elements: ['water'] } },
  { keywords: ['skeleton warrior'], overrides: { archetype: 'undead', bodyStructure: 'humanoid', species: 'undead', elements: ['dark'], weapons: ['sword'], armor: ['chain'] } },
  { keywords: ['goblin'], overrides: { archetype: 'rogue', bodyStructure: 'humanoid', species: 'orc', elements: [], weapons: ['dagger'] } },
  { keywords: ['golem', 'stone golem'], overrides: { archetype: 'golem', bodyStructure: 'humanoid', species: 'golem', elements: ['earth'] } },
  { keywords: ['treant', 'tree creature'], overrides: { archetype: 'elemental', bodyStructure: 'humanoid', species: 'treant', elements: ['nature'] } },
];

export class CanonicalDatabase {
  /** Find the best canonical match for an input string. Returns null if no match above threshold. */
  match(input: string): { entry: CanonicalEntry; confidence: number } | null {
    const lower = input.toLowerCase().trim();
    let bestMatch: { entry: CanonicalEntry; confidence: number } | null = null;

    for (const entry of CANONICAL_ENTRIES) {
      for (const keyword of entry.keywords) {
        // Exact substring match
        if (lower.includes(keyword)) {
          const confidence = keyword.length / Math.max(lower.length, 1);
          const adjustedConfidence = Math.min(1.0, confidence + 0.3); // boost for exact match
          if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
            bestMatch = { entry, confidence: adjustedConfidence };
          }
        }
        // Trigram similarity for fuzzy matching
        const sim = trigramSimilarity(lower, keyword);
        if (sim > 0.4) {
          if (!bestMatch || sim > bestMatch.confidence) {
            bestMatch = { entry, confidence: sim };
          }
        }
      }
    }

    return bestMatch && bestMatch.confidence >= 0.35 ? bestMatch : null;
  }
}

/** Trigram similarity: Jaccard index of character trigrams. */
function trigramSimilarity(a: string, b: string): number {
  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);
  if (trigramsA.size === 0 && trigramsB.size === 0) return 1;
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }
  const union = trigramsA.size + trigramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function getTrigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// ConceptToEntityPipeline — Full orchestrator with Canonical Mode
// ═══════════════════════════════════════════════════════════════════

export class ConceptToEntityPipeline {
  private readonly interpreter = new ConceptInterpreter();
  private readonly compiler = new ConceptCompiler();
  private readonly canonical = new CanonicalDatabase();

  execute(input: string, rng: DeterministicRNG, options?: { style?: StyleType; useCanonical?: boolean }): EntityBlueprint {
    // Step 1: Try canonical matching first (default: enabled)
    const useCanonical = options?.useCanonical !== false;
    let concept = this.interpreter.interpret(input, options?.style);

    if (useCanonical) {
      const match = this.canonical.match(input);
      if (match) {
        // Merge canonical overrides into the interpreted concept
        concept = {
          ...concept,
          ...match.entry.overrides,
          // Preserve computed fields that canonical doesn't override
          morphology: concept.morphology,
          constraints: concept.constraints,
          isca: concept.isca,
          suggestedAnimations: concept.suggestedAnimations,
          secondaryActions: concept.secondaryActions,
          equipmentLayers: concept.equipmentLayers,
          colors: concept.colors.length > 0 ? concept.colors : (match.entry.overrides as { colors?: string[] }).colors ?? concept.colors,
          personality: concept.personality,
          name: concept.name,
          conceptType: concept.conceptType,
        } as ConceptModel;

        // Re-derive morphology if body structure changed
        if (match.entry.overrides.bodyStructure && match.entry.overrides.bodyStructure !== concept.bodyStructure) {
          const mg = new MorphologyGrammar();
          const sr = new StyleResolver();
          const isChibi = sr.isChibi(input);
          const morphology = mg.deriveMorphologyGene(match.entry.overrides.bodyStructure, concept.style, isChibi);
          concept = { ...concept, morphology } as ConceptModel;
        }
      }
    }

    // Step 2: Compile concept to seed
    const seed = this.compiler.compile(concept, rng);

    // Step 3: Determine sprite config from body structure
    const frameSizes: Partial<Record<BodyStructure, { w: number; h: number }>> = {
      humanoid: { w: 64, h: 64 },
      quadruped: { w: 96, h: 64 },
      winged: { w: 128, h: 128 },
      serpentine: { w: 96, h: 48 },
      floating: { w: 64, h: 64 },
    };
    const frameSize = frameSizes[concept.bodyStructure] ?? { w: 64, h: 64 };

    return {
      concept,
      seed,
      skeletonType: concept.bodyStructure,
      spriteConfig: {
        frameWidth: frameSize.w,
        frameHeight: frameSize.h,
        animations: concept.suggestedAnimations,
        fps: 12,
      },
    };
  }
}

// Re-export Sprite Forge integration
export { SpriteForgeIntegration } from './sprite-forge.js';
export type { SpriteForgeResult, GenerationOptions } from './sprite-forge.js';
