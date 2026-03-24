/**
 * @paradigm/ontology — The deepest concept knowledge graph ever built.
 *
 * 6 taxonomies with hierarchical inheritance, trie-based O(n) concept parsing,
 * concept composition with conflict detection and emergent property discovery,
 * and a knowledge accumulator that gets smarter with every entity created.
 *
 * Zero external dependencies beyond @paradigm/types.
 *
 * @packageDocumentation
 */

import type {
  BodyStructure,
  PersonalityVector,
  TaxonomyNode,
  SpeciesDefaults,
  ArchetypeDefaults,
  ElementDefaults,
  StyleDefaults,
  MaterialDefaults,
} from '@paradigm/types';

// ═══════════════════════════════════════════════════════════════════
// TAXONOMY ENGINE — Generic hierarchical taxonomy with inheritance
// ═══════════════════════════════════════════════════════════════════

export class Taxonomy<TDefaults = Record<string, unknown>> {
  readonly name: string;
  private readonly nodes: Map<string, TaxonomyNode<TDefaults>> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  add(node: TaxonomyNode<TDefaults>): void {
    this.nodes.set(node.id, node);
  }

  get(id: string): TaxonomyNode<TDefaults> | undefined {
    return this.nodes.get(id);
  }

  /** Get node with inherited defaults (walks up parent chain, child overrides parent). */
  resolve(id: string): TDefaults | undefined {
    const node = this.nodes.get(id);
    if (!node) return undefined;

    const chain: TDefaults[] = [];
    let current: TaxonomyNode<TDefaults> | undefined = node;
    while (current) {
      chain.unshift(current.defaults);
      current = current.parent ? this.nodes.get(current.parent) : undefined;
    }

    return chain.reduce((acc, d) => ({ ...acc, ...d }), {} as TDefaults);
  }

  /** Find all nodes whose keywords match any of the given tokens. */
  matchKeywords(tokens: readonly string[]): Array<{ node: TaxonomyNode<TDefaults>; matchedKeywords: string[]; score: number }> {
    const tokenSet = new Set(tokens.map(t => t.toLowerCase()));
    const results: Array<{ node: TaxonomyNode<TDefaults>; matchedKeywords: string[]; score: number }> = [];

    for (const node of this.nodes.values()) {
      const matched = node.keywords.filter(kw => tokenSet.has(kw.toLowerCase()));
      if (matched.length > 0) {
        results.push({
          node,
          matchedKeywords: matched,
          score: matched.length / node.keywords.length,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /** Get all children of a node (direct). */
  childrenOf(id: string): TaxonomyNode<TDefaults>[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return node.children.map(cid => this.nodes.get(cid)).filter((n): n is TaxonomyNode<TDefaults> => n !== undefined);
  }

  /** Get all nodes. */
  all(): TaxonomyNode<TDefaults>[] {
    return Array.from(this.nodes.values());
  }

  get size(): number {
    return this.nodes.size;
  }
}

// ═══════════════════════════════════════════════════════════════════
// TRIE-BASED CONCEPT PARSER — O(n) simultaneous matching
// ═══════════════════════════════════════════════════════════════════

interface TrieNode {
  children: Map<string, TrieNode>;
  matches: Array<{ taxonomy: string; nodeId: string; confidence: number }>;
}

export class TrieConceptParser {
  private readonly root: TrieNode = { children: new Map(), matches: [] };

  /** Insert a keyword that maps to a taxonomy node. */
  insert(keyword: string, taxonomy: string, nodeId: string, confidence: number = 1.0): void {
    const word = keyword.toLowerCase();
    let current = this.root;
    for (const char of word) {
      if (!current.children.has(char)) {
        current.children.set(char, { children: new Map(), matches: [] });
      }
      current = current.children.get(char)!;
    }
    current.matches.push({ taxonomy, nodeId, confidence });
  }

  /** Parse input text and return all concept matches across all taxonomies. */
  parse(input: string): ConceptMatch[] {
    const words = input.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const matches: ConceptMatch[] = [];

    // Single words
    for (const word of words) {
      const found = this.lookup(word);
      for (const m of found) {
        matches.push({ ...m, matchedText: word });
      }
    }

    // Bigrams (compound concepts like "ice dragon", "fire knight")
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      const found = this.lookup(bigram);
      for (const m of found) {
        matches.push({ ...m, matchedText: bigram, confidence: m.confidence * 1.2 });
      }
    }

    // Trigrams
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const found = this.lookup(trigram);
      for (const m of found) {
        matches.push({ ...m, matchedText: trigram, confidence: m.confidence * 1.5 });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private lookup(word: string): Array<{ taxonomy: string; nodeId: string; confidence: number }> {
    let current = this.root;
    for (const char of word) {
      const next = current.children.get(char);
      if (!next) return [];
      current = next;
    }
    return current.matches;
  }
}

export interface ConceptMatch {
  readonly taxonomy: string;
  readonly nodeId: string;
  readonly confidence: number;
  readonly matchedText: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONCEPT COMPOSER — Merges parsed concepts into unified entity
// ═══════════════════════════════════════════════════════════════════

export interface ComposedConcept {
  readonly species: string | null;
  readonly archetype: string | null;
  readonly elements: readonly string[];
  readonly style: string | null;
  readonly substyle: string | null;
  readonly abilities: readonly string[];
  readonly materials: readonly string[];
  readonly emergentProperties: readonly string[];
  readonly conflicts: readonly ConceptConflict[];
  readonly allMatches: readonly ConceptMatch[];
}

export interface ConceptConflict {
  readonly type: 'style' | 'element' | 'species' | 'anatomy';
  readonly description: string;
  readonly resolution: string;
}

export class ConceptComposer {
  private readonly speciesTax: Taxonomy<SpeciesDefaults>;
  private readonly archetypeTax: Taxonomy<ArchetypeDefaults>;
  private readonly elementTax: Taxonomy<ElementDefaults>;
  private readonly styleTax: Taxonomy<StyleDefaults>;

  constructor(
    species: Taxonomy<SpeciesDefaults>,
    archetypes: Taxonomy<ArchetypeDefaults>,
    elements: Taxonomy<ElementDefaults>,
    styles: Taxonomy<StyleDefaults>,
  ) {
    this.speciesTax = species;
    this.archetypeTax = archetypes;
    this.elementTax = elements;
    this.styleTax = styles;
  }

  compose(matches: readonly ConceptMatch[]): ComposedConcept {
    const speciesMatches = matches.filter(m => m.taxonomy === 'species');
    const archetypeMatches = matches.filter(m => m.taxonomy === 'archetype');
    const elementMatches = matches.filter(m => m.taxonomy === 'element');
    const styleMatches = matches.filter(m => m.taxonomy === 'style');
    const abilityMatches = matches.filter(m => m.taxonomy === 'ability');
    const materialMatches = matches.filter(m => m.taxonomy === 'material');

    const species = speciesMatches[0]?.nodeId ?? null;
    const archetype = archetypeMatches[0]?.nodeId ?? null;
    const elements = [...new Set(elementMatches.map(m => m.nodeId))];
    const style = styleMatches[0]?.nodeId ?? null;
    const substyle = styleMatches.length > 1 ? styleMatches[1]?.nodeId ?? null : null;
    const abilities = [...new Set(abilityMatches.map(m => m.nodeId))];
    const materials = [...new Set(materialMatches.map(m => m.nodeId))];

    const conflicts = this.detectConflicts(species, elements, style);
    const emergentProperties = this.discoverEmergent(species, elements, archetype);

    return {
      species, archetype, elements, style, substyle,
      abilities, materials, emergentProperties, conflicts,
      allMatches: matches,
    };
  }

  private detectConflicts(species: string | null, elements: readonly string[], style: string | null): ConceptConflict[] {
    const conflicts: ConceptConflict[] = [];

    // Style conflicts
    if (style === 'chibi' && elements.includes('photorealism')) {
      conflicts.push({ type: 'style', description: 'Chibi style conflicts with photorealistic rendering', resolution: 'Defaulting to chibi proportions with enhanced detail' });
    }
    if (style === 'pixel' && elements.includes('realistic')) {
      conflicts.push({ type: 'style', description: 'Pixel art conflicts with film VFX rendering', resolution: 'Using HD pixel with rich palette' });
    }

    // Element weakness chain conflicts
    const weaknessMap: Record<string, string[]> = {
      fire: ['water'], water: ['lightning'], earth: ['wind'], wind: ['fire'],
      lightning: ['earth'], light: ['dark'], dark: ['light'], ice: ['fire'],
      nature: ['fire'], poison: ['earth'], void: ['cosmic'], cosmic: ['void'],
    };
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i]!;
        const b = elements[j]!;
        if (weaknessMap[a]?.includes(b) || weaknessMap[b]?.includes(a)) {
          conflicts.push({ type: 'element', description: `Elements ${a} and ${b} have a weakness relationship — one counters the other`, resolution: `Dominant element determined by archetype affinity. Tension creates unique hybrid effects.` });
        }
      }
    }

    return conflicts;
  }

  private discoverEmergent(species: string | null, elements: readonly string[], archetype: string | null): string[] {
    const emergent: string[] = [];

    // Ice + undead + dragon = Frostlich Wyrm
    if (species === 'dragon' && elements.includes('ice') && (archetype === 'undead' || archetype === 'undead_archetype' || elements.includes('dark'))) {
      emergent.push('frost_breath_necrotic');
      emergent.push('skeletal_wings');
      emergent.push('ice_crystal_bones');
    }

    // Fire + undead = necrotic flame
    if (elements.includes('fire') && (archetype === 'undead' || archetype === 'undead_archetype' || species === 'skeleton' || species === 'lich')) {
      emergent.push('necrotic_fire');
      emergent.push('soul_flame');
    }

    // Lightning + water = electrified
    if (elements.includes('lightning') && elements.includes('water')) {
      emergent.push('electrified_water');
      emergent.push('chain_lightning_aoe');
    }

    // Cosmic + any species = cosmic variant
    if (elements.includes('cosmic') && species) {
      emergent.push(`cosmic_${species}`);
      emergent.push('reality_warping');
    }

    // Void + any = entropy variant
    if (elements.includes('void') && species) {
      emergent.push(`void_${species}`);
      emergent.push('existence_erasure');
    }

    // Fire + ice = steam/thermal shock
    if (elements.includes('fire') && elements.includes('ice')) {
      emergent.push('thermal_shock');
      emergent.push('steam_veil');
    }

    // Light + dark = twilight/balance
    if (elements.includes('light') && elements.includes('dark')) {
      emergent.push('twilight_balance');
      emergent.push('duality_mastery');
    }

    // Nature + poison = toxic bloom
    if (elements.includes('nature') && elements.includes('poison')) {
      emergent.push('toxic_bloom');
      emergent.push('venomous_thorns');
    }

    // Dragon + cosmic = elder dragon
    if (species === 'dragon' && elements.includes('cosmic')) {
      emergent.push('elder_dragon');
      emergent.push('constellation_breath');
    }

    // Construct + lightning = overcharged
    if ((species === 'robot' || species === 'golem' || species === 'mech' || archetype === 'golem_archetype') && elements.includes('lightning')) {
      emergent.push('overcharged_construct');
      emergent.push('emp_burst');
    }

    // Phoenix + any undead element = spectral phoenix
    if (species === 'phoenix' && (elements.includes('dark') || archetype === 'undead_archetype')) {
      emergent.push('spectral_phoenix');
      emergent.push('shadow_rebirth');
    }

    return emergent;
  }
}

// ═══════════════════════════════════════════════════════════════════
// KNOWLEDGE ACCUMULATOR — Gets smarter with every entity
// ═══════════════════════════════════════════════════════════════════

export interface ConceptRecipe {
  readonly input: string;
  readonly species: string | null;
  readonly archetype: string | null;
  readonly elements: readonly string[];
  readonly style: string | null;
  readonly emergentProperties: readonly string[];
  readonly useCount: number;
  readonly lastUsed: number;
}

export class KnowledgeAccumulator {
  private readonly recipes: Map<string, ConceptRecipe> = new Map();

  /** Record a successful concept composition for future reuse. */
  record(input: string, composed: ComposedConcept): void {
    const key = this.normalize(input);
    const existing = this.recipes.get(key);

    this.recipes.set(key, {
      input: key,
      species: composed.species,
      archetype: composed.archetype,
      elements: composed.elements,
      style: composed.style,
      emergentProperties: composed.emergentProperties,
      useCount: (existing?.useCount ?? 0) + 1,
      lastUsed: Date.now(),
    });
  }

  /** Look up a previously recorded recipe. */
  lookup(input: string): ConceptRecipe | undefined {
    return this.recipes.get(this.normalize(input));
  }

  /** Get most popular recipes. */
  popular(limit: number = 10): ConceptRecipe[] {
    return Array.from(this.recipes.values())
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  get size(): number {
    return this.recipes.size;
  }

  private normalize(input: string): string {
    return input.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}

// ═══════════════════════════════════════════════════════════════════
// TAXONOMY DATA — The actual knowledge
// ═══════════════════════════════════════════════════════════════════

function buildSpeciesTaxonomy(): Taxonomy<SpeciesDefaults> {
  const tax = new Taxonomy<SpeciesDefaults>('species');

  const defaults = (bodyStructure: BodyStructure, anims: string[], elements: string[] = [], materials: string[] = ['flesh']): SpeciesDefaults => ({
    bodyStructure,
    defaultProportions: { headToBody: bodyStructure === 'humanoid' ? 0.13 : 0.15 },
    defaultAnimations: anims,
    compatibleElements: elements,
    materialComposition: materials,
  });

  const node = (id: string, name: string, parent: string | null, children: string[], keywords: string[], d: SpeciesDefaults): TaxonomyNode<SpeciesDefaults> =>
    ({ id, name, parent, children, keywords, defaults: d });

  // Root categories
  tax.add(node('humanoid', 'Humanoid', null, ['human', 'elf', 'dwarf', 'orc', 'giant', 'fairy', 'demon', 'angel'],
    ['human', 'person', 'man', 'woman', 'boy', 'girl', 'humanoid'],
    defaults('humanoid', ['idle', 'walk', 'run', 'attack', 'hurt', 'death'], ['all'], ['flesh', 'bone'])));

  tax.add(node('human', 'Human', 'humanoid', [], ['human', 'person', 'man', 'woman', 'boy', 'girl'],
    defaults('humanoid', ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'death'], ['all'], ['flesh'])));
  tax.add(node('elf', 'Elf', 'humanoid', [], ['elf', 'elven', 'elvish'],
    defaults('humanoid', ['idle', 'walk', 'run', 'attack', 'cast', 'hurt', 'death'], ['nature', 'light', 'wind'], ['flesh', 'leaf'])));
  tax.add(node('dwarf', 'Dwarf', 'humanoid', [], ['dwarf', 'dwarven'],
    defaults('humanoid', ['idle', 'walk', 'run', 'attack', 'mine', 'hurt', 'death'], ['earth', 'fire', 'metal'], ['flesh', 'stone'])));
  tax.add(node('orc', 'Orc', 'humanoid', [], ['orc', 'orcish'],
    defaults('humanoid', ['idle', 'walk', 'run', 'attack', 'rage', 'hurt', 'death'], ['fire', 'earth', 'beast'], ['flesh', 'bone'])));
  tax.add(node('giant', 'Giant', 'humanoid', [], ['giant', 'titan', 'colossus'],
    defaults('humanoid', ['idle', 'walk', 'stomp', 'attack', 'hurt', 'death'], ['earth', 'wind'], ['flesh', 'stone'])));
  tax.add(node('fairy', 'Fairy', 'humanoid', [], ['fairy', 'fae', 'pixie', 'sprite'],
    defaults('winged', ['idle', 'fly', 'cast', 'hover', 'hurt', 'death'], ['nature', 'light', 'wind'], ['flesh', 'silk'])));
  tax.add(node('demon', 'Demon', 'humanoid', [], ['demon', 'devil', 'imp', 'fiend', 'succubus', 'incubus'],
    defaults('humanoid', ['idle', 'walk', 'fly', 'attack', 'cast', 'hurt', 'death'], ['fire', 'dark', 'void'], ['flesh', 'bone', 'chitin'])));
  tax.add(node('angel', 'Angel', 'humanoid', [], ['angel', 'seraph', 'cherub', 'archangel', 'celestial'],
    defaults('winged', ['idle', 'walk', 'fly', 'cast', 'hover', 'hurt', 'death'], ['light', 'wind', 'cosmic'], ['flesh', 'silk', 'starlight'])));

  // Beasts
  tax.add(node('beast', 'Beast', null, ['canine', 'feline', 'ursine', 'equine', 'reptile', 'avian', 'aquatic', 'insect', 'amphibian'],
    ['beast', 'animal', 'creature'],
    defaults('quadruped', ['idle', 'walk', 'run', 'attack', 'hurt', 'death'], ['nature', 'beast'], ['flesh', 'fur'])));

  tax.add(node('canine', 'Canine', 'beast', [], ['wolf', 'fox', 'dog', 'canine', 'hound', 'jackal', 'coyote'],
    defaults('quadruped', ['idle', 'walk', 'run', 'attack', 'howl', 'hurt', 'death'], ['nature', 'beast', 'ice'], ['fur', 'flesh'])));
  tax.add(node('feline', 'Feline', 'beast', [], ['lion', 'tiger', 'cat', 'feline', 'panther', 'leopard', 'jaguar', 'lynx'],
    defaults('quadruped', ['idle', 'walk', 'run', 'pounce', 'attack', 'hurt', 'death'], ['nature', 'beast', 'shadow'], ['fur', 'flesh'])));
  tax.add(node('ursine', 'Ursine', 'beast', [], ['bear', 'ursine', 'grizzly', 'polar bear'],
    defaults('quadruped', ['idle', 'walk', 'charge', 'attack', 'roar', 'hurt', 'death'], ['nature', 'earth', 'ice'], ['fur', 'flesh'])));
  tax.add(node('equine', 'Equine', 'beast', [], ['horse', 'stallion', 'mare', 'pony', 'equine', 'steed'],
    defaults('quadruped', ['idle', 'walk', 'trot', 'gallop', 'rear', 'hurt', 'death'], ['nature', 'wind'], ['fur', 'flesh'])));
  tax.add(node('reptile', 'Reptile', 'beast', [], ['lizard', 'crocodile', 'turtle', 'reptile', 'gecko', 'chameleon', 'iguana'],
    defaults('quadruped', ['idle', 'walk', 'attack', 'tail_whip', 'hurt', 'death'], ['earth', 'poison', 'water'], ['scale', 'flesh'])));
  tax.add(node('avian', 'Avian', 'beast', [], ['eagle', 'raven', 'crow', 'hawk', 'owl', 'falcon', 'bird', 'avian'],
    defaults('winged', ['idle', 'fly', 'dive', 'attack', 'land', 'hurt', 'death'], ['wind', 'nature'], ['feather', 'flesh'])));
  tax.add(node('aquatic', 'Aquatic', 'beast', [], ['shark', 'whale', 'fish', 'octopus', 'squid', 'aquatic', 'jellyfish'],
    defaults('serpentine', ['idle', 'swim', 'attack', 'dive', 'hurt', 'death'], ['water'], ['scale', 'flesh'])));
  tax.add(node('insect', 'Insect', 'beast', [], ['spider', 'scorpion', 'beetle', 'ant', 'wasp', 'mantis', 'insect', 'bug'],
    defaults('multi_limbed', ['idle', 'walk', 'attack', 'burrow', 'hurt', 'death'], ['poison', 'nature', 'earth'], ['chitin'])));
  tax.add(node('amphibian', 'Amphibian', 'beast', [], ['frog', 'toad', 'salamander', 'newt', 'amphibian'],
    defaults('quadruped', ['idle', 'walk', 'jump', 'swim', 'attack', 'hurt', 'death'], ['water', 'poison', 'nature'], ['flesh'])));

  // Mythical
  tax.add(node('mythical', 'Mythical', null, ['dragon', 'griffin', 'unicorn', 'basilisk', 'hydra', 'chimera', 'cerberus', 'phoenix', 'minotaur', 'centaur'],
    ['mythical', 'legendary', 'mythological'],
    defaults('winged', ['idle', 'walk', 'fly', 'attack', 'hurt', 'death'], ['fire', 'cosmic'], ['scale', 'flesh'])));

  tax.add(node('dragon', 'Dragon', 'mythical', [], ['dragon', 'drake', 'wyvern', 'wyrm'],
    defaults('winged', ['idle', 'walk', 'fly', 'attack', 'breath', 'roar', 'hurt', 'death'], ['fire', 'ice', 'lightning', 'cosmic'], ['scale', 'bone'])));
  tax.add(node('griffin', 'Griffin', 'mythical', [], ['griffin', 'griffon', 'gryphon'],
    defaults('winged', ['idle', 'walk', 'fly', 'dive', 'attack', 'hurt', 'death'], ['wind', 'light'], ['feather', 'fur'])));
  tax.add(node('unicorn', 'Unicorn', 'mythical', [], ['unicorn'],
    defaults('quadruped', ['idle', 'walk', 'gallop', 'cast', 'rear', 'hurt', 'death'], ['light', 'nature', 'cosmic'], ['fur', 'starlight'])));
  tax.add(node('phoenix', 'Phoenix', 'mythical', [], ['phoenix'],
    defaults('winged', ['idle', 'fly', 'attack', 'rebirth', 'hurt', 'death'], ['fire', 'light', 'cosmic'], ['feather', 'pure_energy'])));
  tax.add(node('hydra', 'Hydra', 'mythical', [], ['hydra'],
    defaults('serpentine', ['idle', 'walk', 'attack', 'bite', 'regenerate', 'hurt', 'death'], ['poison', 'water', 'nature'], ['scale', 'flesh'])));
  tax.add(node('chimera', 'Chimera', 'mythical', [], ['chimera'],
    defaults('quadruped', ['idle', 'walk', 'attack', 'breath', 'hurt', 'death'], ['fire', 'poison'], ['scale', 'fur', 'flesh'])));
  tax.add(node('basilisk', 'Basilisk', 'mythical', [], ['basilisk'],
    defaults('serpentine', ['idle', 'slither', 'attack', 'gaze', 'hurt', 'death'], ['poison', 'earth', 'dark'], ['scale'])));
  tax.add(node('cerberus', 'Cerberus', 'mythical', [], ['cerberus'],
    defaults('quadruped', ['idle', 'walk', 'attack', 'howl', 'hurt', 'death'], ['fire', 'dark'], ['fur', 'flesh'])));
  tax.add(node('minotaur', 'Minotaur', 'mythical', [], ['minotaur'],
    defaults('humanoid', ['idle', 'walk', 'charge', 'attack', 'roar', 'hurt', 'death'], ['earth', 'beast'], ['fur', 'flesh', 'bone'])));
  tax.add(node('centaur', 'Centaur', 'mythical', [], ['centaur'],
    defaults('quadruped', ['idle', 'walk', 'gallop', 'attack', 'hurt', 'death'], ['nature', 'beast'], ['fur', 'flesh'])));

  // Undead
  tax.add(node('undead', 'Undead', null, ['skeleton', 'zombie', 'lich', 'vampire', 'ghost', 'wraith', 'revenant'],
    ['undead', 'undying', 'risen'],
    defaults('humanoid', ['idle', 'walk', 'attack', 'hurt', 'death'], ['dark', 'poison'], ['bone', 'ectoplasm'])));

  tax.add(node('skeleton', 'Skeleton', 'undead', [], ['skeleton', 'skeletal'],
    defaults('humanoid', ['idle', 'walk', 'attack', 'rattle', 'hurt', 'death'], ['dark', 'earth'], ['bone'])));
  tax.add(node('zombie', 'Zombie', 'undead', [], ['zombie', 'zombified'],
    defaults('humanoid', ['idle', 'shamble', 'attack', 'bite', 'hurt', 'death'], ['dark', 'poison'], ['flesh', 'bone'])));
  tax.add(node('lich', 'Lich', 'undead', [], ['lich'],
    defaults('humanoid', ['idle', 'float', 'cast', 'attack', 'hurt', 'death'], ['dark', 'ice', 'void'], ['bone', 'ectoplasm', 'gem'])));
  tax.add(node('vampire', 'Vampire', 'undead', [], ['vampire', 'vampiric', 'nosferatu'],
    defaults('humanoid', ['idle', 'walk', 'attack', 'bite', 'transform', 'hurt', 'death'], ['dark', 'blood'], ['flesh'])));
  tax.add(node('ghost', 'Ghost', 'undead', [], ['ghost', 'specter', 'phantom', 'apparition'],
    defaults('floating', ['idle', 'float', 'phase', 'attack', 'haunt', 'hurt', 'death'], ['dark', 'ice', 'void'], ['ectoplasm'])));
  tax.add(node('wraith', 'Wraith', 'undead', [], ['wraith', 'shade'],
    defaults('floating', ['idle', 'float', 'attack', 'drain', 'hurt', 'death'], ['dark', 'void'], ['ectoplasm', 'void_matter'])));
  tax.add(node('revenant', 'Revenant', 'undead', [], ['revenant'],
    defaults('humanoid', ['idle', 'walk', 'attack', 'pursue', 'hurt', 'death'], ['dark', 'fire'], ['flesh', 'bone'])));

  // Constructs
  tax.add(node('construct', 'Construct', null, ['golem', 'robot', 'automaton', 'mech', 'ai_entity'],
    ['construct', 'artificial', 'built'],
    defaults('mechanical', ['idle', 'walk', 'attack', 'hurt', 'shutdown'], ['lightning', 'earth'], ['iron', 'stone'])));

  tax.add(node('golem', 'Golem', 'construct', [], ['golem'],
    defaults('humanoid', ['idle', 'walk', 'stomp', 'attack', 'hurt', 'shutdown'], ['earth'], ['stone', 'iron', 'crystal'])));
  tax.add(node('robot', 'Robot', 'construct', [], ['robot', 'android', 'cyborg', 'droid'],
    defaults('mechanical', ['idle', 'walk', 'attack', 'scan', 'hurt', 'shutdown'], ['lightning'], ['steel', 'copper'])));
  tax.add(node('automaton', 'Automaton', 'construct', [], ['automaton', 'clockwork'],
    defaults('mechanical', ['idle', 'walk', 'attack', 'wind_up', 'hurt', 'shutdown'], ['lightning', 'earth'], ['copper', 'iron'])));
  tax.add(node('mech', 'Mech', 'construct', [], ['mech', 'mecha', 'mechanical'],
    defaults('mechanical', ['idle', 'walk', 'attack', 'launch', 'hurt', 'shutdown'], ['lightning', 'fire'], ['steel', 'adamantine'])));
  tax.add(node('ai_entity', 'AI Entity', 'construct', [], ['ai', 'digital', 'hologram', 'program'],
    defaults('floating', ['idle', 'float', 'scan', 'attack', 'hurt', 'shutdown'], ['lightning', 'void'], ['pure_energy'])));

  // Elementals
  tax.add(node('elemental', 'Elemental', null, ['fire_elemental', 'water_elemental', 'earth_elemental', 'air_elemental', 'lightning_elemental', 'ice_elemental', 'shadow_elemental', 'light_elemental'],
    ['elemental', 'spirit', 'wisp', 'djinn', 'genie'],
    defaults('amorphous', ['idle', 'float', 'attack', 'absorb', 'hurt', 'death'], ['all'], ['pure_energy'])));

  tax.add(node('fire_elemental', 'Fire Elemental', 'elemental', [], ['fire elemental', 'flame spirit', 'ifrit'],
    defaults('amorphous', ['idle', 'float', 'attack', 'ignite', 'hurt', 'death'], ['fire'], ['pure_energy'])));
  tax.add(node('water_elemental', 'Water Elemental', 'elemental', [], ['water elemental', 'water spirit', 'undine'],
    defaults('amorphous', ['idle', 'float', 'attack', 'splash', 'hurt', 'death'], ['water'], ['water'])));
  tax.add(node('earth_elemental', 'Earth Elemental', 'elemental', [], ['earth elemental', 'stone spirit'],
    defaults('humanoid', ['idle', 'walk', 'attack', 'quake', 'hurt', 'death'], ['earth'], ['stone'])));
  tax.add(node('air_elemental', 'Air Elemental', 'elemental', [], ['air elemental', 'wind spirit', 'sylph'],
    defaults('amorphous', ['idle', 'float', 'attack', 'gust', 'hurt', 'death'], ['wind'], ['pure_energy'])));
  tax.add(node('lightning_elemental', 'Lightning Elemental', 'elemental', [], ['lightning elemental', 'storm spirit'],
    defaults('amorphous', ['idle', 'float', 'attack', 'discharge', 'hurt', 'death'], ['lightning'], ['pure_energy'])));
  tax.add(node('ice_elemental', 'Ice Elemental', 'elemental', [], ['ice elemental', 'frost spirit'],
    defaults('humanoid', ['idle', 'walk', 'attack', 'freeze', 'hurt', 'death'], ['ice'], ['crystal', 'water'])));
  tax.add(node('shadow_elemental', 'Shadow Elemental', 'elemental', [], ['shadow elemental', 'dark spirit'],
    defaults('amorphous', ['idle', 'float', 'attack', 'engulf', 'hurt', 'death'], ['dark', 'shadow'], ['void_matter'])));
  tax.add(node('light_elemental', 'Light Elemental', 'elemental', [], ['light elemental', 'radiant spirit'],
    defaults('amorphous', ['idle', 'float', 'attack', 'radiate', 'hurt', 'death'], ['light'], ['starlight'])));

  // Cosmic
  tax.add(node('cosmic_being', 'Cosmic', null, ['celestial_being', 'astral_being', 'void_walker', 'eldritch'],
    ['cosmic', 'celestial', 'astral', 'star-born'],
    defaults('floating', ['idle', 'float', 'attack', 'warp', 'hurt', 'death'], ['cosmic', 'void', 'light'], ['starlight', 'void_matter'])));

  tax.add(node('celestial_being', 'Celestial', 'cosmic_being', [], ['celestial', 'divine', 'god', 'deity'],
    defaults('humanoid', ['idle', 'float', 'cast', 'smite', 'hurt', 'death'], ['cosmic', 'light'], ['starlight', 'pure_energy'])));
  tax.add(node('astral_being', 'Astral', 'cosmic_being', [], ['astral', 'star-born', 'stellar'],
    defaults('floating', ['idle', 'float', 'attack', 'warp', 'hurt', 'death'], ['cosmic'], ['starlight'])));
  tax.add(node('void_walker', 'Void Walker', 'cosmic_being', [], ['void walker', 'void', 'entropy'],
    defaults('floating', ['idle', 'float', 'phase', 'attack', 'hurt', 'death'], ['void'], ['void_matter'])));
  tax.add(node('eldritch', 'Eldritch', 'cosmic_being', [], ['eldritch', 'lovecraftian', 'elder', 'abomination'],
    defaults('amorphous', ['idle', 'float', 'attack', 'madness', 'hurt', 'death'], ['void', 'cosmic', 'dark'], ['flesh', 'void_matter'])));

  // Plant
  tax.add(node('plant', 'Plant', null, ['treant', 'myconid', 'vine_creature', 'flower_spirit'],
    ['plant', 'flora', 'botanical'],
    defaults('humanoid', ['idle', 'sway', 'attack', 'grow', 'hurt', 'death'], ['nature', 'earth', 'poison'], ['wood', 'leaf'])));

  tax.add(node('treant', 'Treant', 'plant', [], ['treant', 'tree', 'ent'],
    defaults('humanoid', ['idle', 'walk', 'attack', 'root', 'hurt', 'death'], ['nature', 'earth'], ['wood', 'leaf'])));
  tax.add(node('myconid', 'Myconid', 'plant', [], ['myconid', 'mushroom', 'fungus'],
    defaults('humanoid', ['idle', 'walk', 'spore', 'attack', 'hurt', 'death'], ['nature', 'poison'], ['flesh', 'chitin'])));
  tax.add(node('vine_creature', 'Vine Creature', 'plant', [], ['vine', 'tendril', 'ivy'],
    defaults('amorphous', ['idle', 'slither', 'attack', 'constrict', 'hurt', 'death'], ['nature', 'poison'], ['wood', 'leaf'])));
  tax.add(node('flower_spirit', 'Flower Spirit', 'plant', [], ['flower spirit', 'dryad', 'nymph'],
    defaults('humanoid', ['idle', 'float', 'cast', 'heal', 'hurt', 'death'], ['nature', 'light'], ['leaf', 'silk'])));

  return tax;
}

function buildArchetypeTaxonomy(): Taxonomy<ArchetypeDefaults> {
  const tax = new Taxonomy<ArchetypeDefaults>('archetype');

  const node = (id: string, name: string, parent: string | null, children: string[], keywords: string[], d: ArchetypeDefaults): TaxonomyNode<ArchetypeDefaults> =>
    ({ id, name, parent, children, keywords, defaults: d });

  const defaults = (personality: Partial<PersonalityVector>, abilities: string[], equipment: string[], patterns: string[], visual: string): ArchetypeDefaults => ({
    personalityBias: personality,
    abilityAffinities: abilities,
    equipmentPreferences: equipment,
    behavioralPatterns: patterns,
    visualDesignLanguage: visual,
  });

  // Combat
  tax.add(node('warrior', 'Warrior', null, [], ['warrior', 'fighter', 'soldier', 'barbarian', 'gladiator', 'samurai', 'viking', 'mercenary'],
    defaults({ courage: 0.9, conscientiousness: 0.6 }, ['melee_slash', 'melee_crush', 'charge'], ['sword', 'axe', 'heavy_armor'], ['aggressive', 'direct'], 'bold_powerful')));
  tax.add(node('mage', 'Mage', null, [], ['mage', 'wizard', 'sorcerer', 'witch', 'warlock', 'magician', 'spellcaster', 'alchemist', 'enchanter', 'shaman', 'druid', 'sage', 'mystic'],
    defaults({ openness: 0.9, wit: 0.8 }, ['ranged_magic', 'elemental_cast', 'buff', 'debuff'], ['staff', 'wand', 'robes'], ['analytical', 'cautious'], 'ethereal_mystical')));
  tax.add(node('archer', 'Archer', null, [], ['archer', 'ranger', 'bowman', 'hunter', 'marksman', 'sniper', 'scout'],
    defaults({ conscientiousness: 0.8, adaptability: 0.8 }, ['ranged_physical', 'aimed_shot', 'volley'], ['bow', 'crossbow', 'light_armor'], ['calculated', 'patient'], 'lean_precise')));
  tax.add(node('rogue', 'Rogue', null, [], ['rogue', 'thief', 'assassin', 'ninja', 'spy', 'shadow', 'dancer', 'acrobat', 'pirate'],
    defaults({ cunning: 0.9, adaptability: 0.9 }, ['stealth', 'backstab', 'poison', 'evade'], ['dagger', 'light_armor'], ['stealthy', 'opportunistic'], 'sleek_shadowy')));
  tax.add(node('knight', 'Knight', null, [], ['knight', 'crusader', 'templar', 'champion', 'armored'],
    defaults({ courage: 0.9, loyalty: 0.9, conscientiousness: 0.9 }, ['melee_slash', 'shield_bash', 'charge'], ['sword', 'shield', 'heavy_armor'], ['honorable', 'protective'], 'noble_armored')));
  tax.add(node('berserker', 'Berserker', null, [], ['berserker', 'rage', 'frenzy', 'brute'],
    defaults({ courage: 1.0, neuroticism: 0.8 }, ['melee_crush', 'rage_mode', 'cleave'], ['axe', 'hammer', 'no_armor'], ['reckless', 'aggressive'], 'savage_primal')));
  tax.add(node('paladin', 'Paladin', null, [], ['paladin', 'holy knight', 'cleric knight', 'holy warrior', 'crusader'],
    defaults({ courage: 0.9, loyalty: 1.0 }, ['melee_slash', 'heal', 'smite', 'shield'], ['mace', 'sword', 'heavy_armor'], ['righteous', 'protective'], 'radiant_armored')));
  tax.add(node('monk', 'Monk', null, [], ['monk', 'martial artist', 'brawler', 'pugilist'],
    defaults({ conscientiousness: 0.9, adaptability: 0.8 }, ['unarmed_strike', 'combo', 'dodge', 'meditate'], ['fists', 'cloth'], ['disciplined', 'centered'], 'fluid_minimal')));

  // Support
  tax.add(node('healer', 'Healer', null, [], ['healer', 'cleric', 'priest', 'priestess', 'medic'],
    defaults({ agreeableness: 1.0, conscientiousness: 0.8 }, ['heal', 'buff', 'purify', 'resurrect'], ['staff', 'robes'], ['compassionate', 'cautious'], 'soft_radiant')));
  tax.add(node('bard', 'Bard', null, [], ['bard', 'minstrel', 'musician', 'performer', 'troubadour'],
    defaults({ extraversion: 1.0, wit: 0.9, openness: 0.9 }, ['buff_song', 'debuff_song', 'inspire', 'charm'], ['instrument', 'light_armor'], ['charismatic', 'creative'], 'flamboyant_artistic')));
  tax.add(node('summoner', 'Summoner', null, [], ['summoner', 'necromancer', 'conjurer', 'invoker'],
    defaults({ openness: 0.8, cunning: 0.7 }, ['summon_entity', 'command', 'bind', 'banish'], ['staff', 'grimoire', 'robes'], ['commanding', 'calculated'], 'dark_mystical')));

  // Authority
  tax.add(node('royalty', 'Royalty', null, [], ['king', 'queen', 'prince', 'princess', 'royal', 'emperor', 'empress', 'lord', 'lady'],
    defaults({ conscientiousness: 0.8, extraversion: 0.7 }, ['command', 'inspire', 'decree'], ['scepter', 'crown', 'finery'], ['authoritative', 'regal'], 'ornate_regal')));
  tax.add(node('guard', 'Guard', null, [], ['guard', 'sentinel', 'watchman', 'protector', 'captain'],
    defaults({ loyalty: 1.0, conscientiousness: 0.9 }, ['shield_bash', 'defend', 'alert'], ['spear', 'shield', 'medium_armor'], ['vigilant', 'dutiful'], 'utilitarian_sturdy')));

  // Civilian
  tax.add(node('merchant', 'Merchant', null, [], ['merchant', 'trader', 'shopkeeper', 'vendor', 'peddler'],
    defaults({ cunning: 0.7, extraversion: 0.8 }, ['trade', 'appraise', 'haggle'], ['coins', 'scales'], ['opportunistic', 'friendly'], 'colorful_practical')));
  tax.add(node('villager', 'Villager', null, [], ['villager', 'farmer', 'peasant', 'civilian', 'npc', 'blacksmith', 'innkeeper'],
    defaults({ agreeableness: 0.7, conscientiousness: 0.6 }, ['work', 'flee', 'gather'], ['tools'], ['hardworking', 'cautious'], 'simple_practical')));
  tax.add(node('scholar', 'Scholar', null, [], ['scholar', 'academic', 'professor', 'researcher', 'sage'],
    defaults({ openness: 1.0, conscientiousness: 0.9 }, ['research', 'teach', 'analyze'], ['books', 'glasses', 'robes'], ['curious', 'methodical'], 'refined_intellectual')));

  // Monster
  tax.add(node('beast_monster', 'Beast', null, [], ['beast', 'monster', 'wild'],
    defaults({ courage: 0.6, neuroticism: 0.5 }, ['bite', 'claw', 'roar'], ['natural_weapons'], ['territorial', 'instinctive'], 'primal_wild')));
  tax.add(node('boss_monster', 'Boss', null, [], ['boss', 'boss monster', 'raid boss'],
    defaults({ courage: 1.0 }, ['special_attack', 'enrage', 'summon_minions'], ['unique_weapon'], ['territorial', 'aggressive', 'phased'], 'imposing_unique')));
  tax.add(node('dragon_archetype', 'Dragon', null, [], ['dragon', 'drake', 'wyvern', 'wyrm', 'hydra', 'basilisk'],
    defaults({ courage: 0.9, cunning: 0.8 }, ['breath_attack', 'claw', 'tail_sweep', 'fly'], ['natural_weapons'], ['territorial', 'hoarding', 'ancient'], 'majestic_draconic')));
  tax.add(node('demon_archetype', 'Demon', null, [], ['demon', 'devil', 'imp', 'fiend'],
    defaults({ cunning: 0.9, neuroticism: 0.7 }, ['dark_magic', 'tempt', 'corrupt', 'summon'], ['dark_weapon'], ['deceptive', 'cruel'], 'sinister_menacing')));
  tax.add(node('golem_archetype', 'Golem', null, [], ['golem', 'construct', 'automaton', 'robot', 'clockwork', 'mechanical', 'mech', 'android', 'cyborg', 'puppet'],
    defaults({ loyalty: 1.0, conscientiousness: 1.0 }, ['stomp', 'slam', 'absorb'], ['built_in_weapons'], ['obedient', 'relentless'], 'massive_geometric')));
  tax.add(node('undead_archetype', 'Undead', null, [], ['undead', 'zombie', 'skeleton', 'lich', 'vampire', 'ghost', 'wraith', 'revenant'],
    defaults({ neuroticism: 0.3, agreeableness: 0.1 }, ['life_drain', 'raise_dead', 'fear_aura'], ['bone_weapon'], ['relentless', 'hunger'], 'decayed_ethereal')));
  tax.add(node('elemental_archetype', 'Elemental', null, [], ['elemental', 'spirit', 'wisp', 'djinn', 'genie'],
    defaults({ openness: 0.7 }, ['elemental_blast', 'absorb_element', 'aura'], ['none'], ['territorial', 'reactive'], 'fluid_glowing')));

  return tax;
}

function buildElementTaxonomy(): Taxonomy<ElementDefaults> {
  const tax = new Taxonomy<ElementDefaults>('element');

  const node = (id: string, name: string, keywords: string[], colors: string[], effects: string[], weakness: string[], strong: string[], matInteractions: string[] = []): TaxonomyNode<ElementDefaults> =>
    ({ id, name, parent: null, children: [], keywords, defaults: { colorAssociation: colors, visualEffects: effects, weakness, strongAgainst: strong, materialInteractions: matInteractions } });

  // Classical
  tax.add(node('fire', 'Fire', ['fire', 'flame', 'burning', 'inferno', 'ember', 'blaze', 'lava', 'magma', 'pyro'],
    ['red', 'orange', 'yellow'], ['burning', 'ember_particles', 'heat_haze'], ['water'], ['nature', 'ice'], ['melts_metal', 'burns_wood']));
  tax.add(node('water', 'Water', ['water', 'aqua', 'ocean', 'sea', 'wave', 'rain', 'tide', 'hydro'],
    ['blue', 'cyan', 'teal'], ['flowing', 'splash', 'mist'], ['lightning'], ['fire', 'earth'], ['erodes_stone', 'rusts_metal']));
  tax.add(node('earth', 'Earth', ['earth', 'stone', 'rock', 'crystal', 'mineral', 'sand', 'terra', 'geo'],
    ['brown', 'green', 'gray'], ['rumble', 'dust_cloud', 'cracks'], ['wind'], ['lightning', 'poison'], ['absorbs_poison']));
  tax.add(node('wind', 'Wind', ['wind', 'air', 'gust', 'tornado', 'tempest', 'breeze', 'aero'],
    ['white', 'silver', 'light_blue'], ['swirl', 'cutting_lines', 'pressure_wave'], ['fire'], ['earth', 'nature'], ['erodes_stone']));

  // Energy
  tax.add(node('lightning', 'Lightning', ['lightning', 'thunder', 'electric', 'shock', 'storm', 'volt', 'electro'],
    ['yellow', 'electric_blue', 'white'], ['arc', 'chain_spark', 'flash'], ['earth'], ['water', 'metal'], ['conducts_metal']));
  tax.add(node('light', 'Light', ['light', 'holy', 'divine', 'radiant', 'luminous', 'celestial', 'sacred', 'solar'],
    ['gold', 'white', 'soft_yellow'], ['radiance', 'beam', 'halo'], ['shadow'], ['undead', 'shadow'], ['purifies']));
  tax.add(node('dark', 'Shadow', ['dark', 'shadow', 'void', 'night', 'obsidian', 'death', 'necrotic', 'umbra'],
    ['purple', 'black', 'dark_blue'], ['tendrils', 'mist', 'fade'], ['light'], ['light_weak', 'psychic'], ['corrupts']));
  tax.add(node('void', 'Void', ['void', 'entropy', 'null', 'nothingness', 'antimatter'],
    ['black', 'deep_purple'], ['erasure', 'distortion', 'rift'], ['cosmic'], ['all'], ['erases_matter']));

  // Nature
  tax.add(node('nature', 'Nature', ['nature', 'plant', 'vine', 'leaf', 'forest', 'wood', 'tree', 'bloom', 'flora'],
    ['green', 'brown', 'forest_green'], ['growth', 'vine_wrap', 'pollen'], ['fire'], ['water', 'earth'], ['regrows']));
  tax.add(node('poison', 'Poison', ['poison', 'toxic', 'venom', 'acid', 'plague', 'miasma'],
    ['purple', 'green', 'sickly_yellow'], ['bubbles', 'drip', 'cloud'], ['earth'], ['nature', 'beast'], ['corrodes']));
  tax.add(node('ice', 'Ice', ['ice', 'frost', 'frozen', 'blizzard', 'snow', 'cold', 'glacial', 'cryo'],
    ['light_blue', 'white', 'cyan'], ['crystallize', 'snowflake', 'mist'], ['fire'], ['water', 'wind', 'nature'], ['freezes']));
  tax.add(node('beast_element', 'Beast', ['beast', 'primal', 'feral', 'wild', 'instinct'],
    ['amber', 'brown', 'red'], ['claw_marks', 'roar_wave'], ['poison'], ['civilian'], []));

  // Cosmic
  tax.add(node('cosmic', 'Cosmic', ['cosmic', 'galaxy', 'star', 'nebula', 'universal'],
    ['rainbow', 'starfield', 'iridescent'], ['star_particles', 'reality_ripple', 'aurora'], ['void'], ['all_mundane'], ['reality_warping']));
  tax.add(node('time', 'Time', ['time', 'temporal', 'chrono', 'clock'],
    ['gold', 'teal', 'shimmer'], ['clock_gears', 'slow_motion', 'rewind'], ['void'], ['all'], ['aging', 'reversal']));
  tax.add(node('space', 'Space', ['space', 'dimensional', 'spatial', 'warp', 'teleport'],
    ['indigo', 'warp_purple'], ['portal', 'distortion', 'fold'], ['time'], ['physical'], ['teleportation']));
  tax.add(node('gravity', 'Gravity', ['gravity', 'gravitational', 'mass', 'weight'],
    ['dark_purple', 'black'], ['crush_field', 'float_objects', 'singularity'], ['space'], ['physical', 'flight'], ['force_manipulation']));

  // Material
  tax.add(node('crystal', 'Crystal', ['crystal', 'prism', 'gem', 'jewel', 'diamond'],
    ['prismatic', 'clear', 'refracted'], ['refraction', 'resonance', 'facets'], ['sound'], ['energy', 'light'], ['stores_energy']));
  tax.add(node('metal', 'Metal', ['metal', 'iron', 'steel', 'alloy', 'forge'],
    ['silver', 'iron_gray'], ['clang', 'sparks', 'magnetism'], ['lightning'], ['physical', 'wind'], ['conducts']));
  tax.add(node('blood', 'Blood', ['blood', 'hemomancy', 'sanguine', 'crimson'],
    ['crimson', 'dark_red'], ['drip', 'pulse', 'corruption_spread'], ['light'], ['living'], ['life_linked']));

  return tax;
}

function buildStyleTaxonomy(): Taxonomy<StyleDefaults> {
  const tax = new Taxonomy<StyleDefaults>('style');

  const node = (id: string, name: string, parent: string | null, children: string[], keywords: string[], d: StyleDefaults): TaxonomyNode<StyleDefaults> =>
    ({ id, name, parent, children, keywords, defaults: d });

  const defaults = (proportions: Record<string, number>, shading: string, line: { thickness: number; smoothness: number }, detail: number, color: string, fps: number, exag: number, studio?: string): StyleDefaults => ({
    proportionRules: proportions,
    shadingMethod: shading,
    lineQuality: line,
    detailLevel: detail,
    colorLogic: color,
    animationFrameRate: fps,
    exaggerationScale: exag,
    studioReference: studio,
  });

  // Anime substyles
  tax.add(node('anime', 'Anime', null, ['shonen', 'seinen', 'chibi', 'ghibli', 'ufotable', 'trigger', 'kyoani'],
    ['anime', 'japanese animation'],
    defaults({ headToBody: 0.17 }, 'cel', { thickness: 2, smoothness: 0.8 }, 0.7, 'saturated', 24, 1.3)));
  tax.add(node('shonen', 'Shonen', 'anime', [], ['shonen', 'shounen', 'action anime', 'battle anime'],
    defaults({ headToBody: 0.17, muscleExaggeration: 0.3 }, 'cel_hard', { thickness: 2.5, smoothness: 0.7 }, 0.7, 'bold_saturated', 24, 1.5, 'Bones/Toei/MAPPA')));
  tax.add(node('seinen', 'Seinen', 'anime', [], ['seinen', 'mature anime', 'dark anime'],
    defaults({ headToBody: 0.13 }, 'gradient', { thickness: 1.5, smoothness: 0.9 }, 0.85, 'muted_realistic', 24, 1.1, 'MAPPA/WIT/Madhouse')));
  tax.add(node('chibi', 'Chibi', 'anime', [], ['chibi', 'sd', 'super deformed', 'cute'],
    defaults({ headToBody: 0.5 }, 'flat', { thickness: 3, smoothness: 0.6 }, 0.3, 'bright_pastel', 12, 2.0)));
  tax.add(node('ghibli', 'Ghibli', 'anime', [], ['ghibli', 'watercolor anime', 'miyazaki'],
    defaults({ headToBody: 0.15 }, 'watercolor_gradient', { thickness: 1.5, smoothness: 1.0 }, 0.8, 'natural_soft', 24, 1.1, 'Studio Ghibli')));
  tax.add(node('ufotable', 'Ufotable', 'anime', [], ['ufotable', 'demon slayer style', 'cinematic anime'],
    defaults({ headToBody: 0.15 }, 'dynamic_lit', { thickness: 2, smoothness: 0.85 }, 0.9, 'vibrant_bloom', 24, 1.3, 'Ufotable')));
  tax.add(node('trigger', 'Trigger', 'anime', [], ['trigger', 'kill la kill style', 'kinetic anime'],
    defaults({ headToBody: 0.18 }, 'bold_contrast', { thickness: 3, smoothness: 0.5 }, 0.6, 'vivid_saturated', 24, 1.8, 'Studio Trigger')));
  tax.add(node('kyoani', 'KyoAni', 'anime', [], ['kyoani', 'kyoto animation', 'moe', 'slice of life'],
    defaults({ headToBody: 0.16 }, 'diffuse_soft', { thickness: 1.5, smoothness: 1.0 }, 0.85, 'soft_natural', 24, 1.0, 'Kyoto Animation')));

  // Western animation
  tax.add(node('cartoon', 'Cartoon', null, ['disney_2d', 'cn_flat', 'adult_swim', 'stop_motion'],
    ['cartoon', 'western animation', 'toon'],
    defaults({ headToBody: 0.25 }, 'flat', { thickness: 3, smoothness: 0.5 }, 0.4, 'bold_primary', 24, 1.5)));
  tax.add(node('disney_2d', 'Disney 2D', 'cartoon', [], ['disney', 'disney 2d', 'classic disney'],
    defaults({ headToBody: 0.2 }, 'gradient_subtle', { thickness: 2, smoothness: 0.9 }, 0.7, 'warm_rich', 24, 1.3, 'Walt Disney Animation')));
  tax.add(node('cn_flat', 'Cartoon Network', 'cartoon', [], ['cartoon network', 'cn', 'adventure time', 'powerpuff'],
    defaults({ headToBody: 0.3 }, 'flat_bold', { thickness: 4, smoothness: 0.3 }, 0.2, 'bold_flat', 24, 1.8)));
  tax.add(node('adult_swim', 'Adult Swim', 'cartoon', [], ['adult swim', 'rick and morty', 'crude'],
    defaults({ headToBody: 0.22 }, 'flat_minimal', { thickness: 2, smoothness: 0.4 }, 0.3, 'muted_crude', 12, 1.0)));
  tax.add(node('looney_tunes', 'Looney Tunes', 'cartoon', [], ['looney tunes', 'looney', 'bugs bunny', 'slapstick cartoon', 'wb cartoon'],
    defaults({ headToBody: 0.3 }, 'flat_bold', { thickness: 3, smoothness: 0.5 }, 0.3, 'bold_primary', 24, 2.0, 'Warner Bros')));

  // Game art
  tax.add(node('pixel', 'Pixel Art', null, ['pixel_8bit', 'pixel_16bit', 'hd_pixel'],
    ['pixel', 'pixel art', 'retro', '8-bit', '16-bit', 'sprites'],
    defaults({ headToBody: 0.2 }, 'indexed_palette', { thickness: 1, smoothness: 0 }, 0.3, 'limited_palette', 12, 1.0)));
  tax.add(node('pixel_8bit', '8-bit', 'pixel', [], ['8-bit', '8bit', 'nes', 'gameboy'],
    defaults({ headToBody: 0.25 }, 'indexed_4color', { thickness: 1, smoothness: 0 }, 0.1, '4_color_palette', 8, 1.0)));
  tax.add(node('pixel_16bit', '16-bit', 'pixel', [], ['16-bit', '16bit', 'snes', 'genesis'],
    defaults({ headToBody: 0.2 }, 'indexed_16color', { thickness: 1, smoothness: 0 }, 0.4, '16_color_palette', 12, 1.0)));
  tax.add(node('hd_pixel', 'HD Pixel', 'pixel', [], ['hd pixel', 'modern pixel', 'indie pixel'],
    defaults({ headToBody: 0.18 }, 'indexed_rich', { thickness: 1, smoothness: 0 }, 0.6, 'rich_limited', 15, 1.0)));

  // Photorealism
  tax.add(node('realistic', 'Realistic', null, ['game_realism', 'film_vfx', 'hyperrealism'],
    ['realistic', 'photorealistic', 'real'],
    defaults({ headToBody: 0.13 }, 'pbr', { thickness: 0, smoothness: 1 }, 1.0, 'natural', 60, 1.0)));
  tax.add(node('game_realism', 'Game Realism', 'realistic', [], ['unreal', 'game realistic', 'triple a', 'aaa'],
    defaults({ headToBody: 0.13 }, 'pbr_ray_traced', { thickness: 0, smoothness: 1 }, 0.95, 'natural_vibrant', 60, 1.02)));
  tax.add(node('film_vfx', 'Film VFX', 'realistic', [], ['film', 'vfx', 'cinema', 'movie quality', 'weta', 'ilm'],
    defaults({ headToBody: 0.13 }, 'pbr_subsurface', { thickness: 0, smoothness: 1 }, 1.0, 'cinematic', 24, 1.0)));
  tax.add(node('hyperrealism', 'Hyperrealism', 'realistic', [], ['hyperrealistic', 'hyperreal', 'photographic'],
    defaults({ headToBody: 0.13 }, 'pbr_micro_detail', { thickness: 0, smoothness: 1 }, 1.0, 'photographic', 60, 1.0)));

  // Fantasy & cyberpunk
  tax.add(node('fantasy', 'Fantasy', null, [], ['fantasy', 'high fantasy', 'medieval fantasy'],
    defaults({ headToBody: 0.14 }, 'painterly', { thickness: 1.5, smoothness: 0.8 }, 0.8, 'rich_warm', 24, 1.1)));
  tax.add(node('cyberpunk', 'Cyberpunk', null, [], ['cyberpunk', 'neon', 'sci-fi', 'futuristic'],
    defaults({ headToBody: 0.14 }, 'neon_lit', { thickness: 1, smoothness: 0.8 }, 0.85, 'neon_dark', 30, 1.1)));
  tax.add(node('minimal', 'Minimal', null, [], ['minimal', 'minimalist', 'geometric', 'abstract'],
    defaults({ headToBody: 0.15 }, 'flat_minimal', { thickness: 2, smoothness: 1 }, 0.1, 'monochrome_accent', 24, 1.0)));
  tax.add(node('noir', 'Noir', null, [], ['noir', 'black and white', 'detective', 'sin city'],
    defaults({ headToBody: 0.14 }, 'high_contrast_bw', { thickness: 3, smoothness: 0.7 }, 0.7, 'monochrome_shadow', 24, 1.0)));

  // Default
  tax.add(node('default', 'Default', null, [], ['default'],
    defaults({ headToBody: 0.15 }, 'cel', { thickness: 2, smoothness: 0.7 }, 0.5, 'balanced', 24, 1.2)));

  return tax;
}

function buildAbilityTaxonomy(): Taxonomy<Record<string, unknown>> {
  const tax = new Taxonomy<Record<string, unknown>>('ability');

  const node = (id: string, name: string, keywords: string[], d: Record<string, unknown>): TaxonomyNode<Record<string, unknown>> =>
    ({ id, name, parent: null, children: [], keywords, defaults: d });

  // Expression mechanisms
  tax.add(node('beam', 'Beam', ['beam', 'laser', 'ray', 'kamehameha', 'hadouken', 'energy wave'],
    { manifestationType: 'beam', range: 'ranged', visualSignature: 'continuous_energy_stream', animationRequirement: 'charge_then_release' }));
  tax.add(node('projectile', 'Projectile', ['projectile', 'fireball', 'bolt', 'arrow', 'missile', 'rasengan', 'spirit bomb'],
    { manifestationType: 'projectile', range: 'ranged', visualSignature: 'discrete_energy_packet', animationRequirement: 'throw_motion' }));
  tax.add(node('aura', 'Aura', ['aura', 'glow', 'field', 'energy field', 'ki aura', 'super saiyan'],
    { manifestationType: 'aura', range: 'self', visualSignature: 'surrounding_energy_field', animationRequirement: 'power_up_pose' }));
  tax.add(node('construct', 'Construct', ['construct', 'barrier', 'shield', 'wall', 'summon platform', 'green lantern'],
    { manifestationType: 'construct', range: 'ranged', visualSignature: 'materialized_shape', animationRequirement: 'formation_gesture' }));
  tax.add(node('summon', 'Summon', ['summon', 'conjure', 'call', 'invoke', 'stand', 'persona', 'familiar'],
    { manifestationType: 'summon', range: 'ranged', visualSignature: 'conjured_entity', animationRequirement: 'summoning_ritual' }));
  tax.add(node('domain', 'Domain', ['domain', 'expansion', 'field', 'reality marble', 'world', 'bounded field'],
    { manifestationType: 'field', range: 'area', visualSignature: 'altered_reality_zone', animationRequirement: 'dramatic_activation' }));
  tax.add(node('transform', 'Transform', ['transform', 'transformation', 'morph', 'evolve', 'power up', 'shapeshift', 'super saiyan', 'bankai'],
    { manifestationType: 'transformation', range: 'self', visualSignature: 'self_modification', animationRequirement: 'transformation_sequence' }));
  tax.add(node('manipulation', 'Manipulation', ['manipulation', 'control', 'telekinesis', 'bending', 'force', 'psychic'],
    { manifestationType: 'manipulation', range: 'ranged', visualSignature: 'invisible_force_on_target', animationRequirement: 'directing_gesture' }));

  // ── Full Power System Definitions ──────────────────────────
  // Each carries: reservoir, conversion, expression, weakness, signature techniques, transformations

  tax.add(node('ki', 'Ki', ['ki', 'chi', 'qi', 'spirit energy', 'power level', 'saiyan', 'kaioken', 'genki'],
    { energySource: 'internal', universe: 'Dragon Ball', system: 'direct_will',
      reservoir: { type: 'internal', capacity: 'scaling', regen: 'training', depletion: 'stamina' },
      conversion: 'direct_will', types: ['offensive', 'defensive', 'sensing', 'flight'],
      expressions: ['beam', 'projectile', 'aura', 'construct'],
      signatureTechniques: ['Kamehameha', 'Spirit Bomb', 'Galick Gun', 'Final Flash', 'Special Beam Cannon'],
      transformations: ['Kaioken', 'SSJ', 'SSJ2', 'SSJ3', 'SSJ_God', 'SSJ_Blue', 'Ultra_Instinct'],
      weakness: ['magic', 'virus', 'energy_drain'] }));

  tax.add(node('chakra', 'Chakra', ['chakra', 'jutsu', 'ninjutsu', 'genjutsu', 'taijutsu', 'hand seals', 'rasengan', 'chidori'],
    { energySource: 'internal', universe: 'Naruto', system: 'nature_typing',
      reservoir: { type: 'internal', capacity: 'finite', regen: 'rest', depletion: 'stamina' },
      conversion: 'nature_typing', types: ['fire', 'water', 'earth', 'wind', 'lightning'],
      expressions: ['projectile', 'construct', 'manipulation', 'summon', 'transformation'],
      signatureTechniques: ['Rasengan', 'Chidori', 'Shadow Clone', 'Fireball Jutsu', 'Amaterasu'],
      transformations: ['Sage_Mode', 'Bijuu_Mode', 'Kurama_Chakra_Mode', 'Baryon_Mode'],
      weakness: ['genjutsu', 'sealing', 'chakra_absorption'] }));

  tax.add(node('nen', 'Nen', ['nen', 'hatsu', 'ren', 'gyo', 'ko', 'en', 'shu', 'in', 'vow'],
    { energySource: 'internal', universe: 'Hunter x Hunter', system: 'category',
      reservoir: { type: 'internal', capacity: 'finite', regen: 'meditation', depletion: 'health' },
      conversion: 'category', types: ['enhancement', 'emission', 'transmutation', 'conjuration', 'manipulation', 'specialization'],
      expressions: ['aura', 'construct', 'manipulation', 'projectile'],
      signatureTechniques: ['Jajanken', 'Bungee Gum', 'Chain Jail', 'Emperor Time'],
      transformations: [],
      weakness: ['vow_violation', 'nen_removal', 'stronger_nen_user'] }));

  tax.add(node('cursed_energy', 'Cursed Energy', ['cursed energy', 'curse', 'domain expansion', 'jujutsu', 'reversed cursed', 'sukuna', 'gojo'],
    { energySource: 'internal', universe: 'Jujutsu Kaisen', system: 'direct_will',
      reservoir: { type: 'internal', capacity: 'finite', regen: 'negative_emotion', depletion: 'stamina' },
      conversion: 'direct_will', types: ['cursed_technique', 'domain_expansion', 'reversed_cursed'],
      expressions: ['domain', 'projectile', 'manipulation', 'construct'],
      signatureTechniques: ['Domain Expansion', 'Infinity', 'Malevolent Shrine', 'Black Flash'],
      transformations: [],
      weakness: ['domain_expansion_counter', 'reversed_cursed', 'binding_vow'] }));

  tax.add(node('reiatsu', 'Reiatsu', ['reiatsu', 'zanpakuto', 'shikai', 'bankai', 'bleach', 'shinigami', 'hollow', 'arrancar'],
    { energySource: 'internal', universe: 'Bleach', system: 'staged_release',
      reservoir: { type: 'internal', capacity: 'scaling', regen: 'spiritual_growth', depletion: 'stamina' },
      conversion: 'zanpakuto_spirit', types: ['melee', 'ranged', 'elemental', 'conceptual'],
      expressions: ['transform', 'beam', 'aura', 'manipulation'],
      signatureTechniques: ['Getsuga Tensho', 'Bankai', 'Cero', 'Senbonzakura', 'Hyorinmaru'],
      transformations: ['Shikai', 'Bankai', 'Hollow_Mask', 'Vasto_Lorde', 'Final_Getsuga'],
      weakness: ['sealing', 'spiritual_pressure_overwhelm', 'zanpakuto_break'] }));

  tax.add(node('quirk', 'Quirk', ['quirk', 'superpower', 'one for all', 'all for one', 'hero', 'villain', 'my hero'],
    { energySource: 'mutation', universe: 'My Hero Academia', system: 'mutation',
      reservoir: { type: 'mutation', capacity: 'fixed', regen: 'none', depletion: 'health' },
      conversion: 'genetic', types: ['emitter', 'transformation', 'mutant'],
      expressions: ['projectile', 'transform', 'manipulation', 'construct'],
      signatureTechniques: ['One For All', 'Explosion', 'Half-Cold Half-Hot', 'Erasure', 'Decay'],
      transformations: ['Full_Cowl', 'Gear_Shift', 'Awakened_Quirk'],
      weakness: ['quirk_erasure', 'body_limit', 'specific_counter'] }));

  tax.add(node('devil_fruit', 'Devil Fruit', ['devil fruit', 'gomu gomu', 'logia', 'paramecia', 'zoan', 'haki', 'gear', 'luffy'],
    { energySource: 'mutation', universe: 'One Piece', system: 'fruit_classification',
      reservoir: { type: 'mutation', capacity: 'infinite', regen: 'none', depletion: 'stamina' },
      conversion: 'fruit_type', types: ['paramecia', 'zoan', 'logia'],
      expressions: ['transform', 'manipulation', 'projectile', 'construct'],
      signatureTechniques: ['Gear Second', 'Gear Third', 'Gear Fourth', 'Gear Fifth', 'Gomu Gomu no Bajrang Gun'],
      transformations: ['Gear_2', 'Gear_3', 'Gear_4_Boundman', 'Gear_4_Snakeman', 'Gear_5_Nika'],
      weakness: ['sea_water', 'seastone', 'haki', 'cant_swim'] }));

  tax.add(node('stand', 'Stand', ['stand', 'stand user', 'jojo', 'stand power', 'ora', 'muda', 'star platinum'],
    { energySource: 'mutation', universe: 'JoJo', system: 'manifestation',
      reservoir: { type: 'mutation', capacity: 'fixed', regen: 'willpower', depletion: 'none' },
      conversion: 'manifestation', types: ['close_range', 'long_range', 'automatic', 'bound', 'colony'],
      expressions: ['summon', 'manipulation', 'construct', 'domain'],
      signatureTechniques: ['Star Platinum: The World', 'Gold Experience Requiem', 'Killer Queen', 'The World'],
      transformations: ['Requiem', 'Over_Heaven', 'Act_Evolution'],
      weakness: ['user_damage', 'range_limit', 'stand_arrow'] }));

  tax.add(node('bending', 'Bending', ['bending', 'waterbending', 'firebending', 'earthbending', 'airbending', 'avatar', 'metalbending', 'bloodbending', 'lightning generation'],
    { energySource: 'external', universe: 'Avatar', system: 'bending_type',
      reservoir: { type: 'external', capacity: 'environmental', regen: 'environmental', depletion: 'stamina' },
      conversion: 'bending_type', types: ['water', 'earth', 'fire', 'air'],
      expressions: ['manipulation', 'projectile', 'construct', 'aura'],
      signatureTechniques: ['Lightning Generation', 'Metalbending', 'Bloodbending', 'Combustionbending', 'Lavabending'],
      transformations: ['Avatar_State'],
      weakness: ['element_removal', 'chi_blocking', 'eclipse_fire', 'full_moon_water'] }));

  tax.add(node('force', 'The Force', ['the force', 'jedi', 'sith', 'lightsaber', 'force push', 'force lightning', 'mind trick'],
    { energySource: 'external', universe: 'Star Wars', system: 'direct_will',
      reservoir: { type: 'external', capacity: 'universal', regen: 'meditation', depletion: 'none' },
      conversion: 'light_dark', types: ['telekinesis', 'telepathy', 'precognition', 'lightning', 'healing'],
      expressions: ['manipulation', 'beam', 'construct', 'aura'],
      signatureTechniques: ['Force Push', 'Force Lightning', 'Mind Trick', 'Force Choke', 'Battle Meditation'],
      transformations: ['Dark_Side', 'Force_Ghost'],
      weakness: ['ysalamiri', 'cortosis', 'dark_side_corruption'] }));

  tax.add(node('mana', 'Mana', ['mana', 'magic', 'spell', 'arcane', 'sorcery', 'magicka', 'wizard', 'enchantment'],
    { energySource: 'internal', universe: 'Fantasy', system: 'school',
      reservoir: { type: 'internal', capacity: 'finite', regen: 'rest', depletion: 'stamina' },
      conversion: 'school', types: ['evocation', 'conjuration', 'transmutation', 'necromancy', 'illusion', 'divination', 'abjuration', 'enchantment'],
      expressions: ['beam', 'projectile', 'construct', 'manipulation', 'summon', 'domain'],
      signatureTechniques: ['Fireball', 'Lightning Bolt', 'Teleport', 'Shield', 'Heal'],
      transformations: ['Lich_Form', 'Archmage_Ascension'],
      weakness: ['antimagic_field', 'silence', 'mana_drain', 'counterspell'] }));

  // Additional: Toon Force
  tax.add(node('toon_force', 'Toon Force', ['toon force', 'cartoon logic', 'hammerspace', 'fourth wall', 'slapstick'],
    { energySource: 'external', universe: 'Cartoon', system: 'comedy',
      reservoir: { type: 'external', capacity: 'infinite', regen: 'humor', depletion: 'none' },
      conversion: 'comedy', types: ['reality_warp', 'hammerspace', 'regeneration', 'physics_defiance'],
      expressions: ['manipulation', 'construct', 'transform'],
      signatureTechniques: ['Hammerspace Pull', 'Gravity Delay', 'Elastic Recovery', 'Fourth Wall Break'],
      transformations: [],
      weakness: ['serious_tone', 'reality_anchor'] }));

  // Additional: Haki (One Piece)
  tax.add(node('haki', 'Haki', ['haki', 'observation haki', 'armament haki', 'conquerors haki', 'ryou'],
    { energySource: 'internal', universe: 'One Piece', system: 'willpower',
      reservoir: { type: 'internal', capacity: 'scaling', regen: 'training', depletion: 'stamina' },
      conversion: 'willpower', types: ['observation', 'armament', 'conquerors'],
      expressions: ['aura', 'construct', 'manipulation'],
      signatureTechniques: ['Armament Hardening', 'Future Sight', 'Conquerors Coating', 'Advanced Ryou'],
      transformations: [],
      weakness: ['stamina_drain', 'stronger_haki'] }));

  return tax;
}

function buildMaterialTaxonomy(): Taxonomy<MaterialDefaults> {
  const tax = new Taxonomy<MaterialDefaults>('material');

  const node = (id: string, name: string, keywords: string[], d: MaterialDefaults): TaxonomyNode<MaterialDefaults> =>
    ({ id, name, parent: null, children: [], keywords, defaults: d });

  // Organic
  tax.add(node('flesh', 'Flesh', ['flesh', 'skin', 'muscle'],
    { rigidity: 0.3, elasticity: 0.7, glow: 0, energyDensity: 0.1, decayRate: 0.01, shaderHints: { subsurface: 0.8, roughness: 0.6, metallic: 0 }, soundProperties: 'soft_impact' }));
  tax.add(node('bone', 'Bone', ['bone', 'skeletal', 'ivory'],
    { rigidity: 0.9, elasticity: 0.1, glow: 0, energyDensity: 0, decayRate: 0.001, shaderHints: { subsurface: 0.2, roughness: 0.7, metallic: 0 }, soundProperties: 'clatter' }));
  tax.add(node('wood', 'Wood', ['wood', 'bark', 'timber', 'lumber'],
    { rigidity: 0.7, elasticity: 0.2, glow: 0, energyDensity: 0.05, decayRate: 0.005, shaderHints: { subsurface: 0.1, roughness: 0.8, metallic: 0 }, soundProperties: 'knock' }));
  tax.add(node('leaf', 'Leaf', ['leaf', 'leaves', 'foliage'],
    { rigidity: 0.1, elasticity: 0.8, glow: 0, energyDensity: 0.02, decayRate: 0.02, shaderHints: { subsurface: 0.9, roughness: 0.4, metallic: 0 }, soundProperties: 'rustle' }));
  tax.add(node('silk', 'Silk', ['silk', 'satin', 'fabric'],
    { rigidity: 0.05, elasticity: 0.9, glow: 0.1, energyDensity: 0, decayRate: 0.002, shaderHints: { subsurface: 0.3, roughness: 0.2, metallic: 0.3 }, soundProperties: 'swish' }));
  tax.add(node('chitin', 'Chitin', ['chitin', 'carapace', 'exoskeleton', 'shell'],
    { rigidity: 0.85, elasticity: 0.15, glow: 0.05, energyDensity: 0, decayRate: 0.001, shaderHints: { subsurface: 0.1, roughness: 0.3, metallic: 0.4 }, soundProperties: 'click' }));
  tax.add(node('scale', 'Scale', ['scale', 'scales', 'reptilian'],
    { rigidity: 0.8, elasticity: 0.2, glow: 0.1, energyDensity: 0, decayRate: 0.001, shaderHints: { subsurface: 0.2, roughness: 0.3, metallic: 0.5 }, soundProperties: 'scrape' }));
  tax.add(node('fur', 'Fur', ['fur', 'hair', 'pelt', 'mane'],
    { rigidity: 0.1, elasticity: 0.85, glow: 0, energyDensity: 0, decayRate: 0.003, shaderHints: { subsurface: 0.4, roughness: 0.9, metallic: 0 }, soundProperties: 'soft' }));
  tax.add(node('feather', 'Feather', ['feather', 'plume', 'plumage'],
    { rigidity: 0.2, elasticity: 0.7, glow: 0.05, energyDensity: 0, decayRate: 0.002, shaderHints: { subsurface: 0.3, roughness: 0.4, metallic: 0.1 }, soundProperties: 'flutter' }));

  // Mineral
  tax.add(node('stone', 'Stone', ['stone', 'rock', 'granite', 'marble'],
    { rigidity: 0.95, elasticity: 0.02, glow: 0, energyDensity: 0, decayRate: 0, shaderHints: { subsurface: 0, roughness: 0.85, metallic: 0 }, soundProperties: 'thud' }));
  tax.add(node('crystal_mat', 'Crystal', ['crystal', 'quartz', 'gem', 'diamond', 'prism'],
    { rigidity: 0.9, elasticity: 0.05, glow: 0.3, energyDensity: 0.3, decayRate: 0, shaderHints: { subsurface: 0.5, roughness: 0.05, metallic: 0.2 }, soundProperties: 'chime' }));
  tax.add(node('obsidian', 'Obsidian', ['obsidian', 'volcanic glass'],
    { rigidity: 0.95, elasticity: 0.01, glow: 0.05, energyDensity: 0, decayRate: 0, shaderHints: { subsurface: 0, roughness: 0.1, metallic: 0.3 }, soundProperties: 'shatter' }));
  tax.add(node('sand', 'Sand', ['sand', 'dust', 'grit'],
    { rigidity: 0.1, elasticity: 0.1, glow: 0, energyDensity: 0, decayRate: 0, shaderHints: { subsurface: 0.1, roughness: 1.0, metallic: 0 }, soundProperties: 'whoosh' }));

  // Metal
  tax.add(node('iron', 'Iron', ['iron', 'ferrous'],
    { rigidity: 0.9, elasticity: 0.1, glow: 0, energyDensity: 0, decayRate: 0.01, shaderHints: { subsurface: 0, roughness: 0.6, metallic: 0.9 }, soundProperties: 'clang' }));
  tax.add(node('steel', 'Steel', ['steel', 'stainless'],
    { rigidity: 0.95, elasticity: 0.08, glow: 0.02, energyDensity: 0, decayRate: 0.001, shaderHints: { subsurface: 0, roughness: 0.3, metallic: 0.95 }, soundProperties: 'ring' }));
  tax.add(node('gold', 'Gold', ['gold', 'golden', 'gilded'],
    { rigidity: 0.4, elasticity: 0.3, glow: 0.15, energyDensity: 0, decayRate: 0, shaderHints: { subsurface: 0, roughness: 0.2, metallic: 1.0 }, soundProperties: 'soft_ring' }));
  tax.add(node('silver', 'Silver', ['silver', 'argent'],
    { rigidity: 0.6, elasticity: 0.2, glow: 0.1, energyDensity: 0.1, decayRate: 0.005, shaderHints: { subsurface: 0, roughness: 0.15, metallic: 0.98 }, soundProperties: 'chime' }));
  tax.add(node('mythril', 'Mythril', ['mythril', 'mithril', 'elven steel'],
    { rigidity: 0.95, elasticity: 0.3, glow: 0.2, energyDensity: 0.3, decayRate: 0, shaderHints: { subsurface: 0.1, roughness: 0.1, metallic: 1.0 }, soundProperties: 'harmonic_ring' }));
  tax.add(node('adamantine', 'Adamantine', ['adamantine', 'adamantium', 'indestructible'],
    { rigidity: 1.0, elasticity: 0.01, glow: 0.05, energyDensity: 0, decayRate: 0, shaderHints: { subsurface: 0, roughness: 0.2, metallic: 1.0 }, soundProperties: 'deep_resonance' }));

  // Ethereal
  tax.add(node('ectoplasm', 'Ectoplasm', ['ectoplasm', 'ghostly residue', 'spectral'],
    { rigidity: 0.05, elasticity: 0.95, glow: 0.4, energyDensity: 0.2, decayRate: 0.05, shaderHints: { subsurface: 0.8, roughness: 0, metallic: 0 }, soundProperties: 'whoosh' }));
  tax.add(node('pure_energy', 'Pure Energy', ['pure energy', 'raw energy', 'radiant energy', 'plasma'],
    { rigidity: 0, elasticity: 1.0, glow: 1.0, energyDensity: 1.0, decayRate: 0.1, shaderHints: { subsurface: 0, roughness: 0, metallic: 0 }, soundProperties: 'hum' }));
  tax.add(node('void_matter', 'Void Matter', ['void matter', 'anti-matter', 'dark matter'],
    { rigidity: 0.5, elasticity: 0.5, glow: 0.3, energyDensity: 0.8, decayRate: 0.02, shaderHints: { subsurface: 0, roughness: 0, metallic: 0 }, soundProperties: 'rumble' }));
  tax.add(node('starlight', 'Starlight', ['starlight', 'stellar', 'cosmic energy', 'stardust'],
    { rigidity: 0.2, elasticity: 0.8, glow: 0.9, energyDensity: 0.7, decayRate: 0.01, shaderHints: { subsurface: 0.5, roughness: 0, metallic: 0.3 }, soundProperties: 'shimmer' }));
  tax.add(node('soul_fabric', 'Soul Fabric', ['soul fabric', 'spirit weave', 'soul cloth'],
    { rigidity: 0.1, elasticity: 0.9, glow: 0.5, energyDensity: 0.5, decayRate: 0.03, shaderHints: { subsurface: 0.6, roughness: 0.1, metallic: 0 }, soundProperties: 'whisper' }));

  // Fluid
  tax.add(node('water_mat', 'Water', ['water', 'liquid', 'aqua'],
    { rigidity: 0, elasticity: 1.0, glow: 0.05, energyDensity: 0, decayRate: 0, shaderHints: { subsurface: 0.3, roughness: 0, metallic: 0.2 }, soundProperties: 'splash' }));
  tax.add(node('lava_mat', 'Lava', ['lava', 'magma', 'molten'],
    { rigidity: 0.3, elasticity: 0.6, glow: 0.9, energyDensity: 0.7, decayRate: 0.001, shaderHints: { subsurface: 0, roughness: 0.8, metallic: 0 }, soundProperties: 'bubble' }));
  tax.add(node('blood_mat', 'Blood', ['blood', 'ichor'],
    { rigidity: 0, elasticity: 0.9, glow: 0.1, energyDensity: 0.3, decayRate: 0.02, shaderHints: { subsurface: 0.7, roughness: 0.3, metallic: 0 }, soundProperties: 'drip' }));
  tax.add(node('slime_mat', 'Slime', ['slime', 'ooze', 'gel', 'jelly'],
    { rigidity: 0.05, elasticity: 0.95, glow: 0.2, energyDensity: 0.1, decayRate: 0.01, shaderHints: { subsurface: 0.6, roughness: 0, metallic: 0 }, soundProperties: 'squelch' }));

  return tax;
}

// ═══════════════════════════════════════════════════════════════════
// ONTOLOGY ENGINE — The unified entry point
// ═══════════════════════════════════════════════════════════════════

export class OntologyEngine {
  readonly species: Taxonomy<SpeciesDefaults>;
  readonly archetypes: Taxonomy<ArchetypeDefaults>;
  readonly elements: Taxonomy<ElementDefaults>;
  readonly styles: Taxonomy<StyleDefaults>;
  readonly abilities: Taxonomy<Record<string, unknown>>;
  readonly materials: Taxonomy<MaterialDefaults>;
  readonly parser: TrieConceptParser;
  readonly composer: ConceptComposer;
  readonly accumulator: KnowledgeAccumulator;

  constructor() {
    this.species = buildSpeciesTaxonomy();
    this.archetypes = buildArchetypeTaxonomy();
    this.elements = buildElementTaxonomy();
    this.styles = buildStyleTaxonomy();
    this.abilities = buildAbilityTaxonomy();
    this.materials = buildMaterialTaxonomy();

    this.parser = new TrieConceptParser();
    this.composer = new ConceptComposer(this.species, this.archetypes, this.elements, this.styles);
    this.accumulator = new KnowledgeAccumulator();

    this.indexTaxonomies();
  }

  /** Register all taxonomy keywords into the trie parser. */
  private indexTaxonomies(): void {
    for (const node of this.species.all()) {
      for (const kw of node.keywords) {
        this.parser.insert(kw, 'species', node.id);
      }
    }
    for (const node of this.archetypes.all()) {
      for (const kw of node.keywords) {
        this.parser.insert(kw, 'archetype', node.id);
      }
    }
    for (const node of this.elements.all()) {
      for (const kw of node.keywords) {
        this.parser.insert(kw, 'element', node.id);
      }
    }
    for (const node of this.styles.all()) {
      for (const kw of node.keywords) {
        this.parser.insert(kw, 'style', node.id);
      }
    }
    for (const node of this.abilities.all()) {
      for (const kw of node.keywords) {
        this.parser.insert(kw, 'ability', node.id);
      }
    }
    for (const node of this.materials.all()) {
      for (const kw of node.keywords) {
        this.parser.insert(kw, 'material', node.id);
      }
    }
  }

  /** Full concept analysis: parse text → compose → record → return. */
  analyze(input: string): ComposedConcept {
    const matches = this.parser.parse(input);
    const composed = this.composer.compose(matches);
    this.accumulator.record(input, composed);
    return composed;
  }

  /** Get taxonomy stats. */
  stats(): Record<string, number> {
    return {
      species: this.species.size,
      archetypes: this.archetypes.size,
      elements: this.elements.size,
      styles: this.styles.size,
      abilities: this.abilities.size,
      materials: this.materials.size,
      recipes: this.accumulator.size,
    };
  }
}
