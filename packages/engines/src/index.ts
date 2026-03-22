/**
 * @paradigm/engines — Domain engine registry for the GSPL Paradigm system.
 *
 * Provides 24 concrete domain engines that create and evaluate UniversalSeeds
 * for every supported SeedDomain. All engines extend DomainEngine and are
 * auto-registered in EngineRegistry for domain-based routing.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, SeedDomain, GeneMap } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';
import { createSeed } from '@paradigm/seed';

// ─────────────────────────────────────────────
// Core Interfaces
// ─────────────────────────────────────────────

/** Describes a single capability exposed by a domain engine. */
export interface EngineCapability {
  /** Human-readable name of the capability. */
  name: string;
  /** What this capability does. */
  description: string;
  /** Accepted input types (gene keys or semantic labels). */
  inputTypes: string[];
  /** Produced output types (gene keys or semantic labels). */
  outputTypes: string[];
}

/** Result returned by engine evaluation and routing methods. */
export interface EngineResult {
  /** Whether the seed passed all evaluation checks. */
  success: boolean;
  /** Structured output data extracted from the seed's genes. */
  output: Record<string, unknown>;
  /** Improvement suggestions derived from gene analysis. */
  suggestions: string[];
  /** Non-fatal warnings about gene values or configuration. */
  warnings: string[];
}

// ─────────────────────────────────────────────
// Abstract DomainEngine
// ─────────────────────────────────────────────

/**
 * Abstract base class for all domain engines.
 *
 * Subclasses implement seed creation, evaluation, and suggestion strategies
 * for a specific set of SeedDomains. The registry routes creation and
 * evaluation calls to the appropriate engine by domain.
 */
export abstract class DomainEngine {
  /** Unique engine identifier used as the seed name prefix. */
  abstract readonly name: string;
  /** Domains this engine handles. */
  abstract readonly domains: SeedDomain[];
  /** Capabilities this engine provides. */
  abstract readonly capabilities: EngineCapability[];

  /**
   * Create a new UniversalSeed appropriate for this engine's domain.
   * @param params - Caller-supplied overrides for gene values.
   * @param rng - Deterministic RNG for reproducible gene initialisation.
   */
  abstract create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed;

  /**
   * Evaluate an existing seed and return a structured result.
   * @param seed - The seed to evaluate.
   */
  abstract evaluate(seed: UniversalSeed): EngineResult;

  /**
   * Return domain-specific improvement suggestions for a seed.
   * @param seed - The seed to analyse.
   */
  abstract suggest(seed: UniversalSeed): string[];

  /** Returns true when this engine handles the given domain. */
  matches(domain: SeedDomain): boolean {
    return this.domains.includes(domain);
  }

  /** Returns the full capability list for this engine. */
  getCapabilities(): EngineCapability[] {
    return this.capabilities;
  }
}

// ─────────────────────────────────────────────
// Gene helpers
// ─────────────────────────────────────────────

/** Build a ScalarGene with optional value override from params. */
function scalar(
  params: Record<string, unknown>,
  key: string,
  defaultVal: number,
  min: number,
  max: number,
): GeneMap[string] {
  const raw = params[key];
  const value = typeof raw === 'number' ? Math.max(min, Math.min(max, raw)) : defaultVal;
  return { type: 'scalar' as const, value, min, max };
}

/** Build a CategoricalGene with optional value override from params. */
function categorical(
  params: Record<string, unknown>,
  key: string,
  defaultVal: string,
  options: string[],
): GeneMap[string] {
  const raw = params[key];
  const value = typeof raw === 'string' && options.includes(raw) ? raw : defaultVal;
  return { type: 'categorical' as const, value, options };
}

/** Build a VectorGene with optional value override from params. */
function vector(
  params: Record<string, unknown>,
  key: string,
  defaultVal: number[],
): GeneMap[string] {
  const raw = params[key];
  const value = Array.isArray(raw) && raw.every((v) => typeof v === 'number') ? raw : defaultVal;
  return { type: 'vector' as const, value: value as number[], dimensions: (value as number[]).length };
}

/** Extract a scalar gene value safely from a seed. */
function scalarVal(seed: UniversalSeed, key: string): number | undefined {
  const gene = seed.genes[key];
  if (gene?.type === 'scalar') return gene.value;
  return undefined;
}

/** Extract a categorical gene value safely from a seed. */
function categoricalVal(seed: UniversalSeed, key: string): string | undefined {
  const gene = seed.genes[key];
  if (gene?.type === 'categorical') return gene.value;
  return undefined;
}

// ─────────────────────────────────────────────
// 1. OrganismEngine
// ─────────────────────────────────────────────

/** Creates and evaluates organism seeds (creatures, lifeforms). */
export class OrganismEngine extends DomainEngine {
  readonly name = 'OrganismEngine';
  readonly domains: SeedDomain[] = ['organism'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'organism-creation',
      description: 'Generate viable organism seeds with physiological traits',
      inputTypes: ['health', 'speed', 'size', 'diet', 'habitat'],
      outputTypes: ['organism-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      health: scalar(params, 'health', rng.next() * 100, 0, 100),
      speed: scalar(params, 'speed', rng.next() * 10, 0, 10),
      size: scalar(params, 'size', rng.next() * 5 + 0.5, 0.1, 100),
      diet: categorical(params, 'diet', 'omnivore', ['herbivore', 'carnivore', 'omnivore', 'detritivore']),
      habitat: categorical(params, 'habitat', 'terrestrial', ['terrestrial', 'aquatic', 'aerial', 'subterranean']),
    };
    return createSeed('organism', 'organism', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const health = scalarVal(seed, 'health') ?? 0;
    const speed = scalarVal(seed, 'speed') ?? 0;
    const warnings: string[] = [];
    if (health < 10) warnings.push('Critically low health — organism unlikely to survive');
    if (speed === 0) warnings.push('Zero speed gene — organism cannot move');
    return {
      success: health > 0,
      output: { health, speed, diet: categoricalVal(seed, 'diet'), habitat: categoricalVal(seed, 'habitat') },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const health = scalarVal(seed, 'health') ?? 0;
    const speed = scalarVal(seed, 'speed') ?? 0;
    if (health < 50) suggestions.push('Increase health gene above 50 for a robust organism');
    if (speed < 2) suggestions.push('Raise speed gene to at least 2 for effective locomotion');
    suggestions.push('Consider pairing habitat and diet genes for ecological coherence');
    suggestions.push('Evolve multiple generations to find balanced phenotypes');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 2. FloraEngine
// ─────────────────────────────────────────────

/** Creates and evaluates plant / flora seeds using the organism domain. */
export class FloraEngine extends DomainEngine {
  readonly name = 'FloraEngine';
  readonly domains: SeedDomain[] = ['organism', 'plant'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'flora-creation',
      description: 'Generate plant seeds with growth and structural traits',
      inputTypes: ['growth_rate', 'height', 'leaf_type', 'root_depth'],
      outputTypes: ['plant-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      growth_rate: scalar(params, 'growth_rate', rng.next() * 5, 0, 20),
      height: scalar(params, 'height', rng.next() * 10 + 0.1, 0.01, 100),
      leaf_type: categorical(params, 'leaf_type', 'broad', ['broad', 'needle', 'scale', 'compound', 'none']),
      root_depth: scalar(params, 'root_depth', rng.next() * 3 + 0.1, 0.01, 30),
    };
    return createSeed('flora', 'plant', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const growthRate = scalarVal(seed, 'growth_rate') ?? 0;
    const height = scalarVal(seed, 'height') ?? 0;
    const warnings: string[] = [];
    if (growthRate === 0) warnings.push('Zero growth rate — plant will never mature');
    if (height > 80) warnings.push('Extreme height may cause structural instability');
    return {
      success: growthRate > 0 && height > 0,
      output: { growth_rate: growthRate, height, leaf_type: categoricalVal(seed, 'leaf_type'), root_depth: scalarVal(seed, 'root_depth') },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const rootDepth = scalarVal(seed, 'root_depth') ?? 0;
    const height = scalarVal(seed, 'height') ?? 0;
    if (rootDepth < height * 0.2) suggestions.push('Root depth should be at least 20% of height for stability');
    suggestions.push('Pair leaf_type with biome data for realistic flora');
    suggestions.push('Introduce seasonal growth_rate variation via timeseries genes');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 3. EcosystemEngine
// ─────────────────────────────────────────────

/** Creates and evaluates ecosystem seeds (biomes, ecological niches). */
export class EcosystemEngine extends DomainEngine {
  readonly name = 'EcosystemEngine';
  readonly domains: SeedDomain[] = ['ecosystem'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'ecosystem-creation',
      description: 'Generate ecosystem seeds with biodiversity and climate traits',
      inputTypes: ['biodiversity', 'carrying_capacity', 'climate'],
      outputTypes: ['ecosystem-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      biodiversity: scalar(params, 'biodiversity', rng.next() * 100, 0, 100),
      carrying_capacity: scalar(params, 'carrying_capacity', rng.next() * 10000 + 100, 100, 1_000_000),
      climate: categorical(params, 'climate', 'temperate', ['tropical', 'temperate', 'arctic', 'arid', 'oceanic']),
    };
    return createSeed('ecosystem', 'ecosystem', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const biodiversity = scalarVal(seed, 'biodiversity') ?? 0;
    const capacity = scalarVal(seed, 'carrying_capacity') ?? 0;
    const warnings: string[] = [];
    if (biodiversity < 10) warnings.push('Very low biodiversity — ecosystem is fragile');
    if (capacity < 500) warnings.push('Low carrying capacity limits population viability');
    return {
      success: biodiversity > 0 && capacity > 0,
      output: { biodiversity, carrying_capacity: capacity, climate: categoricalVal(seed, 'climate') },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const biodiversity = scalarVal(seed, 'biodiversity') ?? 0;
    if (biodiversity < 30) suggestions.push('Increase biodiversity above 30 for a stable ecosystem');
    suggestions.push('Link ecosystem seeds to organism seeds via $relations for food-web modelling');
    suggestions.push('Use climate gene to drive seasonal variation in carrying_capacity');
    suggestions.push('Evolve competing ecosystem seeds to find resilient configurations');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 4. GameEngine
// ─────────────────────────────────────────────

/** Creates and evaluates game design seeds. */
export class GameEngine extends DomainEngine {
  readonly name = 'GameEngine';
  readonly domains: SeedDomain[] = ['game'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'game-design',
      description: 'Generate game design seeds with genre, difficulty and mechanics',
      inputTypes: ['genre', 'difficulty', 'player_count', 'mechanics'],
      outputTypes: ['game-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      genre: categorical(params, 'genre', 'rpg', ['rpg', 'platformer', 'strategy', 'shooter', 'puzzle', 'simulation', 'roguelike']),
      difficulty: scalar(params, 'difficulty', rng.next() * 10, 1, 10),
      player_count: scalar(params, 'player_count', Math.floor(rng.next() * 4) + 1, 1, 64),
      mechanics: vector(params, 'mechanics', [rng.next(), rng.next(), rng.next(), rng.next()]),
    };
    return createSeed('game', 'game', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const difficulty = scalarVal(seed, 'difficulty') ?? 0;
    const playerCount = scalarVal(seed, 'player_count') ?? 0;
    const warnings: string[] = [];
    if (difficulty > 9) warnings.push('Extreme difficulty may harm player retention');
    if (playerCount > 32) warnings.push('High player count requires network architecture planning');
    return {
      success: difficulty >= 1 && playerCount >= 1,
      output: { genre: categoricalVal(seed, 'genre'), difficulty, player_count: playerCount },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const difficulty = scalarVal(seed, 'difficulty') ?? 5;
    const genre = categoricalVal(seed, 'genre') ?? 'rpg';
    if (difficulty < 3) suggestions.push(`Consider raising difficulty for the ${genre} genre to increase engagement`);
    suggestions.push('Evolve mechanics vector to discover novel gameplay loops');
    suggestions.push('Cross-breed with a narrative seed for story-driven game design');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 5. NarrativeEngine
// ─────────────────────────────────────────────

/** Creates and evaluates narrative / story seeds. */
export class NarrativeEngine extends DomainEngine {
  readonly name = 'NarrativeEngine';
  readonly domains: SeedDomain[] = ['narrative'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'narrative-creation',
      description: 'Generate story seeds with genre, tone, protagonist and conflict',
      inputTypes: ['genre', 'tone', 'protagonist', 'conflict'],
      outputTypes: ['narrative-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      genre: categorical(params, 'genre', 'fantasy', ['fantasy', 'sci-fi', 'mystery', 'horror', 'romance', 'thriller', 'literary']),
      tone: categorical(params, 'tone', 'heroic', ['heroic', 'dark', 'comedic', 'tragic', 'satirical', 'nostalgic']),
      protagonist: categorical(params, 'protagonist', 'hero', ['hero', 'antihero', 'reluctant-hero', 'villain', 'everyman']),
      conflict: categorical(params, 'conflict', 'man-vs-nature', ['man-vs-nature', 'man-vs-man', 'man-vs-self', 'man-vs-society', 'man-vs-technology']),
    };
    return createSeed('narrative', 'narrative', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const genre = categoricalVal(seed, 'genre');
    const tone = categoricalVal(seed, 'tone');
    const warnings: string[] = [];
    if (genre === 'horror' && tone === 'comedic') warnings.push('Horror/comedic pairing is unconventional — verify intent');
    return {
      success: genre !== undefined && tone !== undefined,
      output: {
        genre,
        tone,
        protagonist: categoricalVal(seed, 'protagonist'),
        conflict: categoricalVal(seed, 'conflict'),
      },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const genre = categoricalVal(seed, 'genre') ?? 'fantasy';
    suggestions.push(`Add a secondary conflict gene to deepen the ${genre} narrative arc`);
    suggestions.push('Breed narrative seeds together to produce hybrid genre stories');
    suggestions.push('Link to an organism seed to define the protagonist\'s traits');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 6. AudioEngine
// ─────────────────────────────────────────────

/** Creates and evaluates audio / music seeds. */
export class AudioEngine extends DomainEngine {
  readonly name = 'AudioEngine';
  readonly domains: SeedDomain[] = ['audio', 'sound', 'music'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'audio-creation',
      description: 'Generate audio seeds with tempo, key, instrumentation and mood',
      inputTypes: ['bpm', 'key', 'instruments', 'mood'],
      outputTypes: ['audio-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      bpm: scalar(params, 'bpm', 60 + rng.next() * 140, 40, 240),
      key: categorical(params, 'key', 'C', ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'Db', 'Eb', 'F#', 'Gb', 'Ab', 'Bb']),
      instruments: vector(params, 'instruments', [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]),
      mood: categorical(params, 'mood', 'neutral', ['joyful', 'melancholic', 'tense', 'triumphant', 'mysterious', 'neutral', 'aggressive']),
    };
    return createSeed('audio', 'audio', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const bpm = scalarVal(seed, 'bpm') ?? 0;
    const mood = categoricalVal(seed, 'mood');
    const warnings: string[] = [];
    if (bpm < 50) warnings.push('Very low BPM — track may feel excessively slow');
    if (bpm > 220) warnings.push('Extreme BPM may exceed perceptual rhythm threshold');
    return {
      success: bpm > 0 && mood !== undefined,
      output: { bpm, key: categoricalVal(seed, 'key'), mood },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const bpm = scalarVal(seed, 'bpm') ?? 120;
    const mood = categoricalVal(seed, 'mood') ?? 'neutral';
    if (mood === 'neutral') suggestions.push('Define a specific mood to guide instrument selection and BPM');
    if (bpm > 160) suggestions.push('High BPM suits electronic/dance genres — pair with matching instruments vector');
    suggestions.push('Evolve instruments vector to discover novel timbral palettes');
    suggestions.push('Link audio seed to a narrative seed for contextual soundtrack generation');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 7. UIEngine
// ─────────────────────────────────────────────

/** Creates and evaluates UI design seeds. */
export class UIEngine extends DomainEngine {
  readonly name = 'UIEngine';
  readonly domains: SeedDomain[] = ['ui'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'ui-design',
      description: 'Generate UI seeds with layout, colour scheme and typography',
      inputTypes: ['layout', 'color_scheme', 'typography'],
      outputTypes: ['ui-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      layout: categorical(params, 'layout', 'grid', ['grid', 'flex', 'masonry', 'sidebar', 'dashboard', 'card']),
      color_scheme: categorical(params, 'color_scheme', 'neutral', ['light', 'dark', 'high-contrast', 'pastel', 'vibrant', 'neutral', 'monochrome']),
      typography: categorical(params, 'typography', 'sans-serif', ['serif', 'sans-serif', 'monospace', 'display', 'handwriting']),
    };
    return createSeed('ui', 'ui', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const layout = categoricalVal(seed, 'layout');
    const colorScheme = categoricalVal(seed, 'color_scheme');
    const warnings: string[] = [];
    if (colorScheme === 'high-contrast' && layout === 'masonry') {
      warnings.push('High-contrast masonry layouts may create visual noise');
    }
    return {
      success: layout !== undefined && colorScheme !== undefined,
      output: { layout, color_scheme: colorScheme, typography: categoricalVal(seed, 'typography') },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const colorScheme = categoricalVal(seed, 'color_scheme') ?? 'neutral';
    if (colorScheme === 'neutral') suggestions.push('Choose a specific colour scheme to strengthen visual identity');
    suggestions.push('Pair typography gene with brand guidelines for consistency');
    suggestions.push('Evolve colour_scheme gene against accessibility contrast ratios');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 8. TerrainEngine
// ─────────────────────────────────────────────

/** Creates and evaluates terrain / landscape seeds. */
export class TerrainEngine extends DomainEngine {
  readonly name = 'TerrainEngine';
  readonly domains: SeedDomain[] = ['terrain'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'terrain-generation',
      description: 'Generate terrain seeds with elevation, biome, water level and erosion',
      inputTypes: ['elevation', 'biome', 'water_level', 'erosion'],
      outputTypes: ['terrain-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      elevation: scalar(params, 'elevation', rng.next() * 4000, -500, 8849),
      biome: categorical(params, 'biome', 'grassland', ['tundra', 'taiga', 'grassland', 'desert', 'rainforest', 'wetland', 'alpine']),
      water_level: scalar(params, 'water_level', rng.next() * 100, 0, 100),
      erosion: scalar(params, 'erosion', rng.next(), 0, 1),
    };
    return createSeed('terrain', 'terrain', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const elevation = scalarVal(seed, 'elevation') ?? 0;
    const waterLevel = scalarVal(seed, 'water_level') ?? 0;
    const biome = categoricalVal(seed, 'biome');
    const warnings: string[] = [];
    if (elevation < 0 && waterLevel < 50) warnings.push('Sub-sea-level terrain with low water — consider adjusting water_level');
    if (biome === 'desert' && waterLevel > 70) warnings.push('High water level inconsistent with desert biome');
    return {
      success: true,
      output: { elevation, biome, water_level: waterLevel, erosion: scalarVal(seed, 'erosion') },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const biome = categoricalVal(seed, 'biome') ?? 'grassland';
    const erosion = scalarVal(seed, 'erosion') ?? 0;
    if (erosion > 0.8) suggestions.push(`High erosion in ${biome} biome will create dramatic formations — model water flow`);
    suggestions.push('Pair terrain with ecosystem seed for biome-consistent flora and fauna');
    suggestions.push('Use elevation vector gene to encode heightmap data for procedural generation');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 9. ArchitectureEngine
// ─────────────────────────────────────────────

/** Creates and evaluates architectural structure seeds (uses 'building' domain). */
export class ArchitectureEngine extends DomainEngine {
  readonly name = 'ArchitectureEngine';
  readonly domains: SeedDomain[] = ['building'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'architecture-design',
      description: 'Generate building and structural design seeds',
      inputTypes: ['style', 'floors', 'materials'],
      outputTypes: ['architecture-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      style: categorical(params, 'style', 'modern', ['gothic', 'modern', 'brutalist', 'classical', 'art-deco', 'minimalist', 'baroque']),
      floors: scalar(params, 'floors', Math.floor(rng.next() * 20) + 1, 1, 200),
      materials: vector(params, 'materials', [rng.next(), rng.next(), rng.next(), rng.next()]),
    };
    return createSeed('architecture', 'building', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const floors = scalarVal(seed, 'floors') ?? 1;
    const style = categoricalVal(seed, 'style');
    const warnings: string[] = [];
    if (floors > 100) warnings.push('Super-tall building — requires structural engineering review');
    if (style === 'gothic' && floors > 20) warnings.push('Gothic style rarely exceeds 20 floors historically');
    return {
      success: floors >= 1 && style !== undefined,
      output: { style, floors },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const style = categoricalVal(seed, 'style') ?? 'modern';
    suggestions.push(`Evolve materials vector to find the optimal composition for ${style} style`);
    suggestions.push('Link building seed to a city seed for urban context modelling');
    suggestions.push('Breed contrasting styles to generate hybrid architectural vocabularies');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 10. CityEngine
// ─────────────────────────────────────────────

/** Creates and evaluates city / urban planning seeds. */
export class CityEngine extends DomainEngine {
  readonly name = 'CityEngine';
  readonly domains: SeedDomain[] = ['city'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'city-planning',
      description: 'Generate city seeds with population, district and transit configuration',
      inputTypes: ['population', 'districts', 'transit'],
      outputTypes: ['city-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      population: scalar(params, 'population', rng.next() * 1_000_000 + 1000, 100, 50_000_000),
      districts: scalar(params, 'districts', Math.floor(rng.next() * 20) + 1, 1, 100),
      transit: categorical(params, 'transit', 'mixed', ['car-centric', 'transit-oriented', 'walkable', 'mixed', 'cycling-first']),
    };
    return createSeed('city', 'city', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const population = scalarVal(seed, 'population') ?? 0;
    const districts = scalarVal(seed, 'districts') ?? 1;
    const transit = categoricalVal(seed, 'transit');
    const warnings: string[] = [];
    if (population > 10_000_000 && transit === 'car-centric') {
      warnings.push('Megacity with car-centric transit will face severe congestion');
    }
    const densityPerDistrict = population / districts;
    if (densityPerDistrict > 500_000) warnings.push('Extremely high district density — infrastructure may be insufficient');
    return {
      success: population > 0 && districts >= 1,
      output: { population, districts, transit },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const transit = categoricalVal(seed, 'transit') ?? 'mixed';
    suggestions.push(`Optimise district count and zoning for ${transit} transit model`);
    suggestions.push('Link city seed to infrastructure seed for utility planning');
    suggestions.push('Evolve population and district genes together to find sustainable density');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 11. MaterialEngine
// ─────────────────────────────────────────────

/** Creates and evaluates material / substance seeds. */
export class MaterialEngine extends DomainEngine {
  readonly name = 'MaterialEngine';
  readonly domains: SeedDomain[] = ['material'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'material-synthesis',
      description: 'Generate material seeds with physical and electrical properties',
      inputTypes: ['density', 'hardness', 'conductivity'],
      outputTypes: ['material-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      density: scalar(params, 'density', rng.next() * 20 + 0.1, 0.001, 22.59),
      hardness: scalar(params, 'hardness', rng.next() * 10, 0, 10),
      conductivity: scalar(params, 'conductivity', rng.next() * 100, 0, 100),
    };
    return createSeed('material', 'material', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const density = scalarVal(seed, 'density') ?? 0;
    const hardness = scalarVal(seed, 'hardness') ?? 0;
    const conductivity = scalarVal(seed, 'conductivity') ?? 0;
    const warnings: string[] = [];
    if (density > 20) warnings.push('Density exceeds osmium — likely non-physical material');
    if (hardness === 10 && conductivity > 80) warnings.push('Maximum hardness with high conductivity is rare in natural materials');
    return {
      success: density > 0,
      output: { density, hardness, conductivity },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const conductivity = scalarVal(seed, 'conductivity') ?? 0;
    if (conductivity > 50) suggestions.push('High conductivity material — suitable for electronic component generation');
    suggestions.push('Breed material seeds to discover composite alloys with novel properties');
    suggestions.push('Link material seed to architecture seed for structure-appropriate material selection');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 12. SimulationEngine
// ─────────────────────────────────────────────

/** Creates and evaluates physical/logical simulation seeds. */
export class SimulationEngine extends DomainEngine {
  readonly name = 'SimulationEngine';
  readonly domains: SeedDomain[] = ['simulation'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'simulation-setup',
      description: 'Generate simulation seeds with timestep, entity count and rule set',
      inputTypes: ['timestep', 'entities', 'rules'],
      outputTypes: ['simulation-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      timestep: scalar(params, 'timestep', 0.016 + rng.next() * 0.1, 0.001, 1.0),
      entities: scalar(params, 'entities', Math.floor(rng.next() * 1000) + 10, 1, 1_000_000),
      rules: vector(params, 'rules', [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]),
    };
    return createSeed('simulation', 'simulation', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const timestep = scalarVal(seed, 'timestep') ?? 0;
    const entities = scalarVal(seed, 'entities') ?? 0;
    const warnings: string[] = [];
    if (timestep > 0.1) warnings.push('Large timestep may cause simulation instability (tunnelling artifacts)');
    if (entities > 100_000) warnings.push('Very high entity count — ensure O(n log n) spatial partitioning');
    return {
      success: timestep > 0 && entities > 0,
      output: { timestep, entities },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const entities = scalarVal(seed, 'entities') ?? 100;
    if (entities > 10_000) suggestions.push('Consider spatial hashing or BVH tree for entity queries at this scale');
    suggestions.push('Evolve rules vector to discover emergent simulation behaviours');
    suggestions.push('Breed simulation seeds with different timesteps to benchmark stability tradeoffs');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 13. NetworkEngine
// ─────────────────────────────────────────────

/** Creates and evaluates network topology seeds. */
export class NetworkEngine extends DomainEngine {
  readonly name = 'NetworkEngine';
  readonly domains: SeedDomain[] = ['network'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'network-topology',
      description: 'Generate network seeds with node count, bandwidth and protocol',
      inputTypes: ['nodes', 'bandwidth', 'protocol'],
      outputTypes: ['network-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      nodes: scalar(params, 'nodes', Math.floor(rng.next() * 500) + 2, 2, 100_000),
      bandwidth: scalar(params, 'bandwidth', rng.next() * 10_000, 1, 1_000_000),
      protocol: categorical(params, 'protocol', 'tcp', ['tcp', 'udp', 'quic', 'websocket', 'grpc', 'mqtt']),
    };
    return createSeed('network', 'network', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const nodes = scalarVal(seed, 'nodes') ?? 0;
    const bandwidth = scalarVal(seed, 'bandwidth') ?? 0;
    const protocol = categoricalVal(seed, 'protocol');
    const warnings: string[] = [];
    if (nodes > 10_000 && protocol === 'tcp') {
      warnings.push('Massive TCP network — consider QUIC for reduced handshake overhead');
    }
    if (bandwidth < 10) warnings.push('Very low bandwidth — high latency expected for multi-node coordination');
    return {
      success: nodes >= 2 && bandwidth > 0,
      output: { nodes, bandwidth, protocol },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const protocol = categoricalVal(seed, 'protocol') ?? 'tcp';
    suggestions.push(`Optimise routing topology for ${protocol} protocol characteristics`);
    suggestions.push('Evolve bandwidth gene against latency fitness function');
    suggestions.push('Use graph gene to encode explicit adjacency for custom topology evolution');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 14. NeuralEngine
// ─────────────────────────────────────────────

/** Creates and evaluates neural network architecture seeds. */
export class NeuralEngine extends DomainEngine {
  readonly name = 'NeuralEngine';
  readonly domains: SeedDomain[] = ['neural'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'neural-architecture',
      description: 'Generate neural network seeds with layer configuration and learning rate',
      inputTypes: ['layers', 'activation', 'learning_rate'],
      outputTypes: ['neural-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      layers: vector(params, 'layers', [64, 128, 64, 32].map((v) => v * (0.5 + rng.next()))),
      activation: categorical(params, 'activation', 'relu', ['relu', 'tanh', 'sigmoid', 'gelu', 'swish', 'mish']),
      learning_rate: scalar(params, 'learning_rate', 0.001 + rng.next() * 0.009, 1e-6, 1.0),
    };
    return createSeed('neural', 'neural', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const lr = scalarVal(seed, 'learning_rate') ?? 0;
    const activation = categoricalVal(seed, 'activation');
    const warnings: string[] = [];
    if (lr > 0.1) warnings.push('High learning rate may cause training divergence');
    if (lr < 1e-5) warnings.push('Very low learning rate — training will converge slowly');
    return {
      success: lr > 0 && activation !== undefined,
      output: { activation, learning_rate: lr },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const activation = categoricalVal(seed, 'activation') ?? 'relu';
    suggestions.push(`Use cosine annealing scheduler with ${activation} activation for stable convergence`);
    suggestions.push('Evolve layers vector using neuroevolution (NEAT) fitness landscape');
    suggestions.push('Breed neural seeds from different activation families to find hybrid architectures');
    suggestions.push('Link to simulation seed to validate architecture in a specific task environment');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 15. QuantumEngine
// ─────────────────────────────────────────────

/** Creates and evaluates quantum circuit seeds. */
export class QuantumEngine extends DomainEngine {
  readonly name = 'QuantumEngine';
  readonly domains: SeedDomain[] = ['quantum'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'quantum-circuit',
      description: 'Generate quantum circuit seeds with qubit count, gate set and entanglement',
      inputTypes: ['qubits', 'gates', 'entanglement'],
      outputTypes: ['quantum-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      qubits: scalar(params, 'qubits', Math.floor(rng.next() * 50) + 2, 1, 1000),
      gates: vector(params, 'gates', [rng.next(), rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]),
      entanglement: scalar(params, 'entanglement', rng.next(), 0, 1),
    };
    return createSeed('quantum', 'quantum', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const qubits = scalarVal(seed, 'qubits') ?? 0;
    const entanglement = scalarVal(seed, 'entanglement') ?? 0;
    const warnings: string[] = [];
    if (qubits > 100) warnings.push('More than 100 logical qubits — beyond current NISQ hardware capacity');
    if (entanglement === 0) warnings.push('Zero entanglement — circuit provides no quantum advantage over classical');
    return {
      success: qubits >= 1,
      output: { qubits, entanglement },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const qubits = scalarVal(seed, 'qubits') ?? 5;
    if (qubits <= 10) suggestions.push('Small qubit count is suitable for classical simulation — validate circuit correctness first');
    suggestions.push('Evolve gates vector using variational quantum eigensolver fitness function');
    suggestions.push('Breed circuits from different entanglement regimes to explore quantum phase space');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 16. IntelligenceEngine
// ─────────────────────────────────────────────

/** Creates and evaluates artificial intelligence agent seeds. */
export class IntelligenceEngine extends DomainEngine {
  readonly name = 'IntelligenceEngine';
  readonly domains: SeedDomain[] = ['intelligence'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'agent-design',
      description: 'Generate AI agent seeds with reasoning, memory and perception traits',
      inputTypes: ['reasoning', 'memory', 'perception'],
      outputTypes: ['intelligence-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      reasoning: scalar(params, 'reasoning', rng.next() * 10, 0, 10),
      memory: scalar(params, 'memory', rng.next() * 10, 0, 10),
      perception: scalar(params, 'perception', rng.next() * 10, 0, 10),
    };
    return createSeed('intelligence', 'intelligence', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const reasoning = scalarVal(seed, 'reasoning') ?? 0;
    const memory = scalarVal(seed, 'memory') ?? 0;
    const perception = scalarVal(seed, 'perception') ?? 0;
    const warnings: string[] = [];
    if (reasoning < 2) warnings.push('Low reasoning score — agent will exhibit reactive rather than deliberate behaviour');
    if (memory < 2 && reasoning > 7) warnings.push('High reasoning with low memory — agent cannot maintain context');
    return {
      success: reasoning > 0 || memory > 0 || perception > 0,
      output: { reasoning, memory, perception },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const reasoning = scalarVal(seed, 'reasoning') ?? 0;
    const perception = scalarVal(seed, 'perception') ?? 0;
    if (reasoning > perception) suggestions.push('Reasoning exceeds perception — consider adding sensor genes to ground the agent');
    suggestions.push('Evolve intelligence seeds using reinforcement-learning fitness functions');
    suggestions.push('Link intelligence seed to neural seed for hybrid neuro-symbolic architectures');
    suggestions.push('Breed with simulation seed to evaluate agent behaviour in complex environments');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 17. RoboticsEngine
// ─────────────────────────────────────────────

/** Creates and evaluates robotic system seeds (uses 'robot' domain). */
export class RoboticsEngine extends DomainEngine {
  readonly name = 'RoboticsEngine';
  readonly domains: SeedDomain[] = ['robot'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'robot-design',
      description: 'Generate robotic system seeds with actuator, sensor and control genes',
      inputTypes: ['actuators', 'sensors', 'control'],
      outputTypes: ['robot-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      actuators: scalar(params, 'actuators', Math.floor(rng.next() * 12) + 1, 1, 100),
      sensors: scalar(params, 'sensors', Math.floor(rng.next() * 10) + 1, 1, 200),
      control: categorical(params, 'control', 'pid', ['pid', 'model-predictive', 'reinforcement-learning', 'fuzzy', 'adaptive']),
    };
    return createSeed('robot', 'robot', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const actuators = scalarVal(seed, 'actuators') ?? 0;
    const sensors = scalarVal(seed, 'sensors') ?? 0;
    const control = categoricalVal(seed, 'control');
    const warnings: string[] = [];
    if (actuators > sensors * 3) warnings.push('More actuators than sensors — under-sensed system risks instability');
    if (control === 'pid' && actuators > 20) warnings.push('PID control poorly scales to high degree-of-freedom systems — consider MPC');
    return {
      success: actuators >= 1 && sensors >= 1,
      output: { actuators, sensors, control },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const control = categoricalVal(seed, 'control') ?? 'pid';
    suggestions.push(`Evolve actuator/sensor ratio for optimal ${control} control authority`);
    suggestions.push('Link robotics seed to simulation seed for kinematics validation');
    suggestions.push('Breed robots with different control strategies to evolve adaptive locomotion');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 18. MolecularEngine
// ─────────────────────────────────────────────

/** Creates and evaluates molecular structure seeds. */
export class MolecularEngine extends DomainEngine {
  readonly name = 'MolecularEngine';
  readonly domains: SeedDomain[] = ['molecular'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'molecular-design',
      description: 'Generate molecular seeds with element composition, bond type and structure',
      inputTypes: ['elements', 'bonds', 'structure'],
      outputTypes: ['molecular-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      elements: vector(params, 'elements', [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]),
      bonds: scalar(params, 'bonds', Math.floor(rng.next() * 20) + 1, 1, 500),
      structure: categorical(params, 'structure', 'linear', ['linear', 'branched', 'cyclic', 'aromatic', 'polymer', 'dendrimer']),
    };
    return createSeed('molecular', 'molecular', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const bonds = scalarVal(seed, 'bonds') ?? 0;
    const structure = categoricalVal(seed, 'structure');
    const warnings: string[] = [];
    if (bonds > 200 && structure === 'linear') warnings.push('Linear structure with many bonds may represent an unrealistically long chain');
    return {
      success: bonds >= 1 && structure !== undefined,
      output: { bonds, structure },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const structure = categoricalVal(seed, 'structure') ?? 'linear';
    suggestions.push(`Evolve elements vector to optimise energy configuration for ${structure} structure`);
    suggestions.push('Link molecular seed to material seed for bulk property derivation');
    suggestions.push('Breed molecular seeds to discover drug-like scaffolds with desired properties');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 19. EducationEngine
// ─────────────────────────────────────────────

/** Creates and evaluates educational curriculum seeds. */
export class EducationEngine extends DomainEngine {
  readonly name = 'EducationEngine';
  readonly domains: SeedDomain[] = ['education'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'curriculum-design',
      description: 'Generate education seeds with subject, difficulty and pedagogical approach',
      inputTypes: ['subject', 'difficulty', 'pedagogy'],
      outputTypes: ['education-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      subject: categorical(params, 'subject', 'mathematics', ['mathematics', 'science', 'history', 'language', 'arts', 'programming', 'philosophy']),
      difficulty: scalar(params, 'difficulty', rng.next() * 10, 1, 10),
      pedagogy: categorical(params, 'pedagogy', 'inquiry-based', ['direct-instruction', 'inquiry-based', 'project-based', 'flipped', 'collaborative', 'gamified']),
    };
    return createSeed('education', 'education', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const difficulty = scalarVal(seed, 'difficulty') ?? 0;
    const subject = categoricalVal(seed, 'subject');
    const pedagogy = categoricalVal(seed, 'pedagogy');
    const warnings: string[] = [];
    if (difficulty > 8 && pedagogy === 'gamified') warnings.push('High difficulty with gamified approach may overwhelm learners — consider scaffolding');
    return {
      success: difficulty >= 1 && subject !== undefined,
      output: { subject, difficulty, pedagogy },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const pedagogy = categoricalVal(seed, 'pedagogy') ?? 'inquiry-based';
    suggestions.push(`Pair ${pedagogy} pedagogy with formative assessment gene for adaptive learning paths`);
    suggestions.push('Evolve difficulty gene with learner progress feedback as fitness signal');
    suggestions.push('Breed education seeds across subjects to design cross-disciplinary curricula');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 20. FinanceEngine
// ─────────────────────────────────────────────

/** Creates and evaluates financial instrument seeds. */
export class FinanceEngine extends DomainEngine {
  readonly name = 'FinanceEngine';
  readonly domains: SeedDomain[] = ['finance'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'instrument-design',
      description: 'Generate financial instrument seeds with asset class, risk and return profile',
      inputTypes: ['asset_class', 'risk', 'return_rate'],
      outputTypes: ['finance-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      asset_class: categorical(params, 'asset_class', 'equity', ['equity', 'bond', 'commodity', 'real-estate', 'crypto', 'derivative', 'cash']),
      risk: scalar(params, 'risk', rng.next() * 10, 0, 10),
      return_rate: scalar(params, 'return_rate', rng.next() * 0.5 - 0.1, -1.0, 10.0),
    };
    return createSeed('finance', 'finance', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const risk = scalarVal(seed, 'risk') ?? 0;
    const returnRate = scalarVal(seed, 'return_rate') ?? 0;
    const assetClass = categoricalVal(seed, 'asset_class');
    const warnings: string[] = [];
    if (risk > 8 && returnRate < 0.05) warnings.push('High risk with low return — poor risk-adjusted profile');
    if (assetClass === 'cash' && risk > 2) warnings.push('Cash instruments should have near-zero risk');
    return {
      success: true,
      output: { asset_class: assetClass, risk, return_rate: returnRate },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const assetClass = categoricalVal(seed, 'asset_class') ?? 'equity';
    const risk = scalarVal(seed, 'risk') ?? 5;
    suggestions.push(`Optimise risk/return_rate ratio for ${assetClass} instrument using Sharpe ratio fitness`);
    if (risk > 6) suggestions.push('Consider breeding with lower-risk instruments to construct a diversified portfolio seed');
    suggestions.push('Evolve return_rate under Monte Carlo simulation for realistic stress testing');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 21. InfrastructureEngine
// ─────────────────────────────────────────────

/** Creates and evaluates infrastructure system seeds. */
export class InfrastructureEngine extends DomainEngine {
  readonly name = 'InfrastructureEngine';
  readonly domains: SeedDomain[] = ['infrastructure'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'infrastructure-planning',
      description: 'Generate infrastructure seeds with capacity, reliability and cost genes',
      inputTypes: ['capacity', 'reliability', 'cost'],
      outputTypes: ['infrastructure-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      capacity: scalar(params, 'capacity', rng.next() * 10_000 + 100, 1, 10_000_000),
      reliability: scalar(params, 'reliability', 0.9 + rng.next() * 0.099, 0, 1),
      cost: scalar(params, 'cost', rng.next() * 1_000_000, 0, 1_000_000_000),
    };
    return createSeed('infrastructure', 'infrastructure', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const reliability = scalarVal(seed, 'reliability') ?? 0;
    const capacity = scalarVal(seed, 'capacity') ?? 0;
    const cost = scalarVal(seed, 'cost') ?? 0;
    const warnings: string[] = [];
    if (reliability < 0.8) warnings.push('Reliability below 80% — infrastructure will experience frequent outages');
    if (cost === 0) warnings.push('Zero cost gene — check if cost modelling is intentionally excluded');
    return {
      success: reliability > 0 && capacity > 0,
      output: { capacity, reliability, cost },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const reliability = scalarVal(seed, 'reliability') ?? 0.9;
    if (reliability < 0.99) suggestions.push('Target 99%+ reliability by evolving redundancy gene alongside capacity');
    suggestions.push('Link infrastructure seed to city seed for urban utility planning');
    suggestions.push('Breed high-capacity and low-cost seeds to find efficient infrastructure configurations');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 22. ProductEngine
// ─────────────────────────────────────────────

/** Creates and evaluates product design seeds. */
export class ProductEngine extends DomainEngine {
  readonly name = 'ProductEngine';
  readonly domains: SeedDomain[] = ['product'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'product-design',
      description: 'Generate product seeds with feature set, market and pricing strategy',
      inputTypes: ['features', 'market', 'pricing'],
      outputTypes: ['product-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      features: vector(params, 'features', Array.from({ length: 6 }, () => rng.next())),
      market: categorical(params, 'market', 'b2c', ['b2b', 'b2c', 'b2b2c', 'marketplace', 'platform', 'developer-tools']),
      pricing: categorical(params, 'pricing', 'subscription', ['free', 'freemium', 'subscription', 'one-time', 'usage-based', 'enterprise']),
    };
    return createSeed('product', 'product', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const market = categoricalVal(seed, 'market');
    const pricing = categoricalVal(seed, 'pricing');
    const warnings: string[] = [];
    if (market === 'b2b' && pricing === 'free') warnings.push('B2B with free pricing rarely sustains — consider freemium or enterprise tiers');
    if (market === 'b2c' && pricing === 'enterprise') warnings.push('Enterprise pricing is misaligned with consumer market');
    return {
      success: market !== undefined && pricing !== undefined,
      output: { market, pricing },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const pricing = categoricalVal(seed, 'pricing') ?? 'subscription';
    const market = categoricalVal(seed, 'market') ?? 'b2c';
    suggestions.push(`Optimise features vector for ${market} segment using cohort retention as fitness`);
    suggestions.push(`Evolve pricing gene from ${pricing} to adjacent models to find revenue-maximising configuration`);
    suggestions.push('Breed product seeds across markets to identify cross-segment opportunities');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 23. VoidEngine
// ─────────────────────────────────────────────

/** Creates and evaluates abstract / metaphysical void seeds. */
export class VoidEngine extends DomainEngine {
  readonly name = 'VoidEngine';
  readonly domains: SeedDomain[] = ['void'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'void-synthesis',
      description: 'Generate void seeds with entropy, dimensionality, recursion and symmetry traits',
      inputTypes: ['entropy', 'dimensions', 'recursion', 'symmetry'],
      outputTypes: ['void-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      entropy: scalar(params, 'entropy', rng.next(), 0, 1),
      dimensions: scalar(params, 'dimensions', Math.floor(rng.next() * 10) + 1, 1, 26),
      recursion: scalar(params, 'recursion', Math.floor(rng.next() * 8) + 1, 0, 64),
      symmetry: categorical(params, 'symmetry', 'rotational', ['none', 'bilateral', 'rotational', 'translational', 'fractal', 'hyperbolic']),
    };
    return createSeed('void', 'void', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const entropy = scalarVal(seed, 'entropy') ?? 0;
    const dimensions = scalarVal(seed, 'dimensions') ?? 1;
    const recursion = scalarVal(seed, 'recursion') ?? 0;
    const symmetry = categoricalVal(seed, 'symmetry');
    const warnings: string[] = [];
    if (entropy > 0.95) warnings.push('Near-maximum entropy — void approaches formless chaos');
    if (recursion > 32) warnings.push('Deep recursion depth may exceed rendering or simulation stack limits');
    return {
      success: true,
      output: { entropy, dimensions, recursion, symmetry },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const entropy = scalarVal(seed, 'entropy') ?? 0.5;
    const symmetry = categoricalVal(seed, 'symmetry') ?? 'rotational';
    if (entropy < 0.1) suggestions.push('Low entropy void — consider increasing recursion for emergent structural complexity');
    suggestions.push(`Evolve ${symmetry} symmetry gene against aesthetic fitness for generative art`);
    suggestions.push('Breed void seeds with dimension extremes to explore non-Euclidean geometries');
    suggestions.push('Link void seed to a quantum seed for physics-inspired procedural generation');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// 24. WebEngine
// ─────────────────────────────────────────────

/** Creates and evaluates web application architecture seeds. */
export class WebEngine extends DomainEngine {
  readonly name = 'WebEngine';
  readonly domains: SeedDomain[] = ['web'];
  readonly capabilities: EngineCapability[] = [
    {
      name: 'web-architecture',
      description: 'Generate web application seeds with framework, API style and database choices',
      inputTypes: ['framework', 'api_style', 'database'],
      outputTypes: ['web-seed'],
    },
  ];

  create(params: Record<string, unknown>, rng: DeterministicRNG): UniversalSeed {
    const genes: GeneMap = {
      framework: categorical(params, 'framework', 'react', ['react', 'vue', 'svelte', 'solid', 'angular', 'next', 'nuxt', 'remix']),
      api_style: categorical(params, 'api_style', 'rest', ['rest', 'graphql', 'grpc', 'trpc', 'websocket', 'sse']),
      database: categorical(params, 'database', 'postgresql', ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'firestore', 'supabase', 'planetscale']),
    };
    return createSeed('web', 'web', genes, rng);
  }

  evaluate(seed: UniversalSeed): EngineResult {
    const framework = categoricalVal(seed, 'framework');
    const apiStyle = categoricalVal(seed, 'api_style');
    const database = categoricalVal(seed, 'database');
    const warnings: string[] = [];
    if (apiStyle === 'grpc' && framework !== 'angular') {
      warnings.push('gRPC in browser contexts requires grpc-web proxy — verify transport layer');
    }
    if (database === 'redis' && apiStyle === 'graphql') {
      warnings.push('Redis as primary store with GraphQL requires careful schema-to-key mapping');
    }
    return {
      success: framework !== undefined && apiStyle !== undefined && database !== undefined,
      output: { framework, api_style: apiStyle, database },
      suggestions: this.suggest(seed),
      warnings,
    };
  }

  suggest(seed: UniversalSeed): string[] {
    const suggestions: string[] = [];
    const framework = categoricalVal(seed, 'framework') ?? 'react';
    const apiStyle = categoricalVal(seed, 'api_style') ?? 'rest';
    suggestions.push(`Pair ${framework} with a matching meta-framework (e.g. Next/Nuxt) for SSR/SSG capabilities`);
    suggestions.push(`Evolve database gene against ${apiStyle} query complexity fitness to find the optimal store`);
    suggestions.push('Breed web seeds across framework families to discover full-stack alignment patterns');
    return suggestions;
  }
}

// ─────────────────────────────────────────────
// EngineRegistry
// ─────────────────────────────────────────────

/** Describes an engine entry in registry listing output. */
export interface EngineEntry {
  name: string;
  domains: SeedDomain[];
  capabilities: EngineCapability[];
}

/**
 * Central registry that manages all domain engines.
 *
 * Auto-registers all 24 built-in engines on construction. Provides
 * domain-based routing for seed creation and evaluation so callers
 * do not need to select engines manually.
 */
export class EngineRegistry {
  private readonly engines: Map<string, DomainEngine> = new Map();
  private readonly rng: DeterministicRNG;

  /**
   * Construct registry and auto-register all 24 built-in engines.
   * @param rng - Optional RNG; defaults to a deterministic instance seeded with 'paradigm-engines'.
   */
  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('paradigm-engines');
    this.registerBuiltins();
  }

  /** Register all 24 built-in engines. */
  private registerBuiltins(): void {
    const builtins: DomainEngine[] = [
      new OrganismEngine(),
      new FloraEngine(),
      new EcosystemEngine(),
      new GameEngine(),
      new NarrativeEngine(),
      new AudioEngine(),
      new UIEngine(),
      new TerrainEngine(),
      new ArchitectureEngine(),
      new CityEngine(),
      new MaterialEngine(),
      new SimulationEngine(),
      new NetworkEngine(),
      new NeuralEngine(),
      new QuantumEngine(),
      new IntelligenceEngine(),
      new RoboticsEngine(),
      new MolecularEngine(),
      new EducationEngine(),
      new FinanceEngine(),
      new InfrastructureEngine(),
      new ProductEngine(),
      new VoidEngine(),
      new WebEngine(),
    ];
    for (const engine of builtins) {
      this.register(engine);
    }
  }

  /**
   * Register an engine. Overwrites any existing engine with the same name.
   * @param engine - The domain engine to register.
   */
  register(engine: DomainEngine): void {
    this.engines.set(engine.name, engine);
  }

  /**
   * Remove an engine by name. No-op if not present.
   * @param name - The engine name to remove.
   */
  unregister(name: string): void {
    this.engines.delete(name);
  }

  /**
   * Retrieve an engine by exact name.
   * @param name - The engine name.
   * @returns The engine or undefined if not registered.
   */
  getEngine(name: string): DomainEngine | undefined {
    return this.engines.get(name);
  }

  /**
   * Find all engines that handle the given domain.
   * @param domain - The SeedDomain to match.
   */
  findByDomain(domain: SeedDomain): DomainEngine[] {
    return Array.from(this.engines.values()).filter((e) => e.matches(domain));
  }

  /**
   * Return the first engine that handles the given domain.
   * @param domain - The SeedDomain to match.
   */
  getBestEngine(domain: SeedDomain): DomainEngine | undefined {
    return this.findByDomain(domain)[0];
  }

  /**
   * List all registered engines with their names, domains and capabilities.
   */
  listEngines(): EngineEntry[] {
    return Array.from(this.engines.values()).map((e) => ({
      name: e.name,
      domains: e.domains,
      capabilities: e.capabilities,
    }));
  }

  /**
   * Create a seed for the given domain using the best matching engine.
   * @param domain - Target SeedDomain.
   * @param params - Optional gene overrides forwarded to the engine.
   * @throws {Error} When no engine is registered for the domain.
   */
  createForDomain(domain: SeedDomain, params: Record<string, unknown> = {}): UniversalSeed {
    const engine = this.getBestEngine(domain);
    if (engine === undefined) {
      throw new Error(
        `No engine registered for domain "${domain}". ` +
        `Registered domains: ${this.listEngines().flatMap((e) => e.domains).join(', ')}`,
      );
    }
    return engine.create(params, this.rng.fork(domain));
  }

  /**
   * Evaluate a seed by routing to the best engine for its domain.
   * Returns a failed EngineResult with a warning when no engine matches.
   * @param seed - The seed to evaluate.
   */
  evaluateSeed(seed: UniversalSeed): EngineResult {
    const engine = this.getBestEngine(seed.$domain);
    if (engine === undefined) {
      return {
        success: false,
        output: { domain: seed.$domain },
        suggestions: ['Register a domain engine for this seed to enable evaluation'],
        warnings: [`No engine found for domain "${seed.$domain}" — evaluation skipped`],
      };
    }
    return engine.evaluate(seed);
  }
}
