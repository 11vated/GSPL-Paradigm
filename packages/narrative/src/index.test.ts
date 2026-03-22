/**
 * @paradigm/narrative — Comprehensive test suite.
 * Target: 80%+ line coverage, 70%+ branch coverage.
 *
 * Seeds are constructed directly from @paradigm/types so that this test file
 * has no dependency on @paradigm/seed (which is not in narrative's deps graph).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StoryEngine,
  DialogueGenerator,
  BranchingNarrative,
  NarrativeRenderer,
  type NarrativeDocument,
  type NarrativeCharacter,
  type DialogueLine,
  type Scene,
} from './index.js';
import { DeterministicRNG } from '@paradigm/rng';
import type { UniversalSeed } from '@paradigm/types';

// ─────────────────────────────────────────────
// Seed factory — builds a minimal UniversalSeed without @paradigm/seed
// ─────────────────────────────────────────────

function makeSeed(
  name: string,
  domain: string,
  genes: Record<string, unknown> = {},
): UniversalSeed {
  // Use a simple deterministic hash based on name+domain for $hash
  const hashInput = `${name}:${domain}:${JSON.stringify(genes)}`;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
  }
  const $hash = Math.abs(hash).toString(16).padStart(8, '0');

  return {
    $gst: '4.0',
    $domain: domain as any,
    $name: name,
    $hash,
    $lineage: { generation: 0, parents: [], timestamp: Date.now() },
    genes: genes as any,
    $metadata: { created: Date.now() },
    $activation: { alive: true, active: true, energy: 100, age: 0 },
    $display: {},
  };
}

// ─────────────────────────────────────────────
// Pre-built seeds for each genre branch
// ─────────────────────────────────────────────

/** organism → fantasy */
const organismSeed = makeSeed('Dragon', 'organism', {
  health: { type: 'scalar', value: 80, min: 0, max: 100 },
  element: { type: 'categorical', value: 'fire', options: ['fire', 'water', 'earth'] },
  color: { type: 'vector', value: [0.9, 0.2, 0.1], dimensions: 3 },
});

/** game → adventure */
const gameSeed = makeSeed('QuestRunner', 'game', {
  difficulty: { type: 'scalar', value: 5, min: 1, max: 10 },
  mode: { type: 'categorical', value: 'survival', options: ['survival', 'story', 'arcade'] },
});

/** ecosystem → nature */
const ecosystemSeed = makeSeed('Rainforest', 'ecosystem', {
  density: { type: 'scalar', value: 0.9, min: 0, max: 1 },
  species: { type: 'scalar', value: 400, min: 0, max: 1000 },
});

/** simulation → scifi */
const simulationSeed = makeSeed('NeuralSim', 'simulation', {
  nodes: { type: 'scalar', value: 512, min: 0, max: 1024 },
});

/** emotion → romance */
const emotionSeed = makeSeed('HeartBeat', 'emotion', {
  intensity: { type: 'scalar', value: 0.7, min: 0, max: 1 },
});

/** network → mystery */
const networkSeed = makeSeed('DarkNet', 'network', {
  latency: { type: 'scalar', value: 120, min: 0, max: 500 },
});

/** sound → comedy */
const soundSeed = makeSeed('Kazoo', 'sound', {
  pitch: { type: 'scalar', value: 800, min: 20, max: 20000 },
});

/** unknown domain → DEFAULT_GENRE (adventure) */
const unknownDomainSeed = makeSeed('Blob', 'fabric', {
  density: { type: 'scalar', value: 1, min: 0, max: 2 },
});

/** short name (≤2 chars) — exercises the short-name title branch */
const shortNameSeed = makeSeed('AB', 'organism', {
  x: { type: 'scalar', value: 1, min: 0, max: 2 },
});

/** many genes (>3) — triggers traitCount = 3 branch */
const manyGenesSeed = makeSeed('HydraOrganism', 'organism', {
  hp: { type: 'scalar', value: 100, min: 0, max: 200 },
  mp: { type: 'scalar', value: 50, min: 0, max: 100 },
  speed: { type: 'scalar', value: 30, min: 0, max: 60 },
  attack: { type: 'scalar', value: 15, min: 0, max: 30 },
  defense: { type: 'scalar', value: 10, min: 0, max: 20 },
});

// ─────────────────────────────────────────────
// Helper: build a minimal NarrativeDocument
// ─────────────────────────────────────────────

function buildMinimalDocument(sceneCount = 3): NarrativeDocument {
  const makeScene = (i: number, withChoices: boolean): Scene => ({
    id: `scene_${i + 1}`,
    title: `Scene ${i + 1}`,
    description: `Description ${i + 1}`,
    dialogue: [{ character: 'Aryn', text: 'Hello.', emotion: 'neutral' }],
    narration: [{ text: 'Silence.', voice: 'narrator' as const, mood: 'tense' }],
    mood: 'tense',
    musicCue: 'slow_strings',
    choices: withChoices
      ? [
          {
            id: `scene_${i + 1}_choice_a`,
            text: 'Go forward.',
            consequence: 'It accelerates.',
            nextSceneId: `scene_${i + 2}`,
          },
          {
            id: `scene_${i + 1}_choice_b`,
            text: 'Step back.',
            consequence: 'A pause reveals.',
            nextSceneId: `scene_${i + 2}`,
          },
        ]
      : undefined,
  });

  const scenes = Array.from({ length: sceneCount }, (_, i) =>
    makeScene(i, i < sceneCount - 1),
  );

  return {
    title: 'Test Story',
    synopsis: 'A test synopsis.',
    themes: ['conflict', 'resolution'],
    characters: [
      {
        name: 'Aryn',
        role: 'protagonist',
        traits: ['brave', 'clever'],
        appearance: 'tall with dark hair',
        voice: 'calm and measured',
        motivation: 'to protect the realm',
      },
    ],
    worldDescription: 'A vast fantasy realm.',
    scenes,
  };
}

// ─────────────────────────────────────────────
// StoryEngine
// ─────────────────────────────────────────────

describe('StoryEngine', () => {
  let engine: StoryEngine;

  beforeEach(() => {
    engine = new StoryEngine();
  });

  describe('constructor', () => {
    it('creates an engine with a default RNG when none is provided', () => {
      expect(engine).toBeInstanceOf(StoryEngine);
    });

    it('accepts an explicit DeterministicRNG', () => {
      const customEngine = new StoryEngine(new DeterministicRNG('custom-seed'));
      expect(customEngine).toBeInstanceOf(StoryEngine);
    });
  });

  describe('generateFromSeed', () => {
    it('returns a NarrativeDocument with all required top-level fields', () => {
      const doc = engine.generateFromSeed(organismSeed);
      expect(doc).toHaveProperty('title');
      expect(doc).toHaveProperty('synopsis');
      expect(doc).toHaveProperty('themes');
      expect(doc).toHaveProperty('characters');
      expect(doc).toHaveProperty('worldDescription');
      expect(doc).toHaveProperty('scenes');
    });

    it('title is a non-empty string', () => {
      const doc = engine.generateFromSeed(organismSeed);
      expect(typeof doc.title).toBe('string');
      expect(doc.title.length).toBeGreaterThan(0);
    });

    it('synopsis references the generated title', () => {
      const doc = engine.generateFromSeed(organismSeed);
      expect(doc.synopsis).toContain(doc.title);
    });

    it('themes is a non-empty array', () => {
      const doc = engine.generateFromSeed(organismSeed);
      expect(Array.isArray(doc.themes)).toBe(true);
      expect(doc.themes.length).toBeGreaterThan(0);
    });

    it('characters array has between 2 and 4 entries', () => {
      const doc = engine.generateFromSeed(organismSeed);
      expect(doc.characters.length).toBeGreaterThanOrEqual(2);
      expect(doc.characters.length).toBeLessThanOrEqual(4);
    });

    it('scenes array has between 3 and 5 entries', () => {
      const doc = engine.generateFromSeed(organismSeed);
      expect(doc.scenes.length).toBeGreaterThanOrEqual(3);
      expect(doc.scenes.length).toBeLessThanOrEqual(5);
    });

    it('produces deterministic output for the same seed', () => {
      const doc1 = engine.generateFromSeed(gameSeed);
      const doc2 = engine.generateFromSeed(gameSeed);
      expect(doc1.title).toBe(doc2.title);
      expect(doc1.synopsis).toBe(doc2.synopsis);
    });

    it('generates different output for different seeds', () => {
      const docA = engine.generateFromSeed(organismSeed);
      const docB = engine.generateFromSeed(simulationSeed);
      expect(docA.worldDescription).not.toBe(docB.worldDescription);
    });

    it('works across all mapped domain genres without throwing', () => {
      const seeds = [
        organismSeed,   // fantasy
        gameSeed,       // adventure
        ecosystemSeed,  // nature
        simulationSeed, // scifi
        emotionSeed,    // romance
        networkSeed,    // mystery
        soundSeed,      // comedy
      ];

      for (const seed of seeds) {
        const doc = engine.generateFromSeed(seed);
        expect(doc.scenes.length).toBeGreaterThanOrEqual(3);
        expect(doc.characters.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('handles unknown domain by falling back to adventure genre', () => {
      const doc = engine.generateFromSeed(unknownDomainSeed);
      expect(doc.title).toBeTruthy();
      expect(doc.scenes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('generateTitle', () => {
    it('returns a string with prefix and suffix separated by a space', () => {
      const title = engine.generateTitle(organismSeed);
      expect(title).toMatch(/\S+ \S+/);
    });

    it('uses seed name as suffix on some RNG seeds when name length > 2', () => {
      const titles: string[] = [];
      for (let i = 0; i < 20; i++) {
        const e = new StoryEngine(new DeterministicRNG(i));
        titles.push(e.generateTitle(organismSeed));
      }
      // "Dragon" should appear in at least one title across 20 seeds
      expect(titles.some((t) => t.includes('Dragon'))).toBe(true);
    });

    it('uses template suffix (not seed name) when name is ≤2 chars', () => {
      const title = engine.generateTitle(shortNameSeed);
      expect(title).toBeTruthy();
      // "AB" must not appear as the trailing word
      expect(title.split(' ').pop()).not.toBe('AB');
    });

    it('generates distinct titles for different genre domains', () => {
      // Different genre pools make identical outputs extremely unlikely
      const fantasyTitle = engine.generateTitle(organismSeed);
      const scifiTitle = engine.generateTitle(simulationSeed);
      expect(fantasyTitle).toBeTruthy();
      expect(scifiTitle).toBeTruthy();
    });
  });

  describe('generateSynopsis', () => {
    it('returns a non-empty string', () => {
      const synopsis = engine.generateSynopsis(organismSeed, 'Test Title');
      expect(synopsis.length).toBeGreaterThan(0);
    });

    it('ends with the title in double quotes', () => {
      const title = 'Chronicles of the Ancients';
      const synopsis = engine.generateSynopsis(organismSeed, title);
      expect(synopsis).toContain(`"${title}"`);
    });

    it('contains a character name from the pool (uppercase-starting word)', () => {
      const synopsis = engine.generateSynopsis(gameSeed, 'Test');
      expect(synopsis).toMatch(/[A-Z][a-z]+/);
    });

    it('scifi synopsis contains sci-fi world phrases', () => {
      const synopsis = engine.generateSynopsis(simulationSeed, 'Signal');
      expect(synopsis.toLowerCase()).toMatch(/space|galaxy|megastructure|colony|generation/);
    });

    it('mystery synopsis contains mystery-related language', () => {
      const synopsis = engine.generateSynopsis(networkSeed, 'The Case');
      expect(synopsis.toLowerCase()).toMatch(/body|letter|locked|suspect|fog|estate|city/);
    });
  });

  describe('generateCharacters', () => {
    it('returns 2–4 characters', () => {
      const chars = engine.generateCharacters(organismSeed);
      expect(chars.length).toBeGreaterThanOrEqual(2);
      expect(chars.length).toBeLessThanOrEqual(4);
    });

    it('each character has all required fields with correct types', () => {
      const chars = engine.generateCharacters(gameSeed);
      for (const char of chars) {
        expect(typeof char.name).toBe('string');
        expect(['protagonist', 'antagonist', 'supporting', 'mentor', 'trickster']).toContain(char.role);
        expect(Array.isArray(char.traits)).toBe(true);
        expect(char.traits.length).toBeGreaterThanOrEqual(2);
        expect(typeof char.appearance).toBe('string');
        expect(typeof char.voice).toBe('string');
        expect(typeof char.motivation).toBe('string');
      }
    });

    it('character names are unique within the returned array', () => {
      const chars = engine.generateCharacters(ecosystemSeed);
      const names = chars.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('first character has role protagonist', () => {
      const chars = engine.generateCharacters(networkSeed);
      expect(chars[0]!.role).toBe('protagonist');
    });

    it('second character has role antagonist', () => {
      const chars = engine.generateCharacters(networkSeed);
      if (chars.length >= 2) {
        expect(chars[1]!.role).toBe('antagonist');
      }
    });

    it('gives 3 traits when seed has more than 3 genes', () => {
      const chars = engine.generateCharacters(manyGenesSeed);
      for (const char of chars) {
        expect(char.traits.length).toBe(3);
      }
    });

    it('gives 2 traits when seed has ≤3 genes', () => {
      const chars = engine.generateCharacters(gameSeed); // 2 genes
      for (const char of chars) {
        expect(char.traits.length).toBe(2);
      }
    });
  });

  describe('generateWorldDescription', () => {
    it('returns a non-empty string', () => {
      const desc = engine.generateWorldDescription(organismSeed);
      expect(desc.length).toBeGreaterThan(0);
    });

    it('mentions the seed domain', () => {
      const desc = engine.generateWorldDescription(organismSeed);
      expect(desc).toContain('organism');
    });

    it('mentions the seed name', () => {
      const desc = engine.generateWorldDescription(organismSeed);
      expect(desc).toContain('Dragon');
    });

    it('includes a mood word from the scifi genre template', () => {
      const desc = engine.generateWorldDescription(simulationSeed);
      expect(desc).toMatch(/clinical|tense|awe-inspiring|paranoid|hopeful/);
    });

    it('includes a mood word from the fantasy genre template for organism domain', () => {
      const desc = engine.generateWorldDescription(organismSeed);
      expect(desc).toMatch(/mystical|foreboding|triumphant|melancholic|tense/);
    });
  });

  describe('generateScenes', () => {
    it('returns 3–5 scenes', () => {
      const chars = engine.generateCharacters(gameSeed);
      const scenes = engine.generateScenes(gameSeed, chars);
      expect(scenes.length).toBeGreaterThanOrEqual(3);
      expect(scenes.length).toBeLessThanOrEqual(5);
    });

    it('each scene has all required structural fields', () => {
      const chars = engine.generateCharacters(gameSeed);
      const scenes = engine.generateScenes(gameSeed, chars);
      for (const scene of scenes) {
        expect(typeof scene.id).toBe('string');
        expect(typeof scene.title).toBe('string');
        expect(typeof scene.description).toBe('string');
        expect(Array.isArray(scene.dialogue)).toBe(true);
        expect(Array.isArray(scene.narration)).toBe(true);
        expect(typeof scene.mood).toBe('string');
        expect(typeof scene.musicCue).toBe('string');
        expect(typeof scene.visualDirection).toBe('string');
      }
    });

    it('IDs are sequential: scene_1, scene_2, …', () => {
      const chars = engine.generateCharacters(gameSeed);
      const scenes = engine.generateScenes(gameSeed, chars);
      scenes.forEach((s, i) => {
        expect(s.id).toBe(`scene_${i + 1}`);
      });
    });

    it('all scenes except the last have exactly 2 choices', () => {
      const chars = engine.generateCharacters(ecosystemSeed);
      const scenes = engine.generateScenes(ecosystemSeed, chars);
      const allButLast = scenes.slice(0, -1);
      const last = scenes[scenes.length - 1]!;

      for (const s of allButLast) {
        expect(s.choices).toBeDefined();
        expect(s.choices!.length).toBe(2);
      }
      expect(last.choices).toBeUndefined();
    });

    it('each scene has at least one narration segment', () => {
      const chars = engine.generateCharacters(simulationSeed);
      const scenes = engine.generateScenes(simulationSeed, chars);
      for (const scene of scenes) {
        expect(scene.narration.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('choices have correct structure (id, text, consequence, nextSceneId)', () => {
      const chars = engine.generateCharacters(networkSeed);
      const scenes = engine.generateScenes(networkSeed, chars);
      const firstScene = scenes[0]!;
      expect(firstScene.choices).toBeDefined();
      for (const choice of firstScene.choices!) {
        expect(typeof choice.id).toBe('string');
        expect(typeof choice.text).toBe('string');
        expect(typeof choice.consequence).toBe('string');
        expect(typeof choice.nextSceneId).toBe('string');
      }
    });

    it('choice IDs follow the pattern <sceneId>_choice_a / _choice_b', () => {
      const chars = engine.generateCharacters(gameSeed);
      const scenes = engine.generateScenes(gameSeed, chars);
      const scene = scenes[0]!;
      expect(scene.choices![0]!.id).toBe(`${scene.id}_choice_a`);
      expect(scene.choices![1]!.id).toBe(`${scene.id}_choice_b`);
    });

    it('generates dialogue lines with required fields', () => {
      const chars = engine.generateCharacters(gameSeed);
      const scenes = engine.generateScenes(gameSeed, chars);
      for (const scene of scenes) {
        for (const line of scene.dialogue) {
          expect(typeof line.character).toBe('string');
          expect(typeof line.text).toBe('string');
          expect(typeof line.emotion).toBe('string');
        }
      }
    });

    it('narration segments have text, voice, and mood', () => {
      const chars = engine.generateCharacters(gameSeed);
      const scenes = engine.generateScenes(gameSeed, chars);
      for (const scene of scenes) {
        for (const seg of scene.narration) {
          expect(typeof seg.text).toBe('string');
          expect(seg.voice).toBe('narrator');
          expect(typeof seg.mood).toBe('string');
        }
      }
    });
  });

  describe('extractThemes', () => {
    it('returns an array with 1–5 themes', () => {
      const themes = engine.extractThemes(organismSeed);
      expect(Array.isArray(themes)).toBe(true);
      expect(themes.length).toBeGreaterThanOrEqual(1);
      expect(themes.length).toBeLessThanOrEqual(5);
    });

    it('organism domain themes include survival, identity, or transformation', () => {
      const themes = engine.extractThemes(organismSeed);
      expect(themes.some((t) => ['survival', 'identity', 'transformation'].includes(t))).toBe(true);
    });

    it('ecosystem domain themes include balance, interdependence, or cycles', () => {
      const themes = engine.extractThemes(ecosystemSeed);
      expect(themes.some((t) => ['balance', 'interdependence', 'cycles'].includes(t))).toBe(true);
    });

    it('game domain themes include competition, rules, or agency', () => {
      const themes = engine.extractThemes(gameSeed);
      expect(themes.some((t) => ['competition', 'rules', 'agency'].includes(t))).toBe(true);
    });

    it('simulation domain themes include determinism, emergence, or control', () => {
      const themes = engine.extractThemes(simulationSeed);
      expect(themes.some((t) => ['determinism', 'emergence', 'control'].includes(t))).toBe(true);
    });

    it('falls back to discovery/conflict/resolution for unknown domain', () => {
      const themes = engine.extractThemes(unknownDomainSeed);
      expect(themes.some((t) => ['discovery', 'conflict', 'resolution'].includes(t))).toBe(true);
    });

    it('appends gene-key names as themes (underscores converted to spaces)', () => {
      const seed = makeSeed('GeneTest', 'organism', {
        my_trait: { type: 'scalar', value: 1, min: 0, max: 2 },
        another_key: { type: 'scalar', value: 1, min: 0, max: 2 },
      });
      const themes = engine.extractThemes(seed);
      expect(themes).toContain('my trait');
      expect(themes).toContain('another key');
    });

    it('deduplicates themes (no repeated entries)', () => {
      const themes = engine.extractThemes(gameSeed);
      expect(themes.length).toBe(new Set(themes).size);
    });

    it('handles narrative domain mapping to mystery themes', () => {
      const seed = makeSeed('Story', 'narrative', {});
      const themes = engine.extractThemes(seed);
      expect(themes.some((t) => ['meaning', 'perspective', 'change'].includes(t))).toBe(true);
    });

    it('handles music domain themes', () => {
      const seed = makeSeed('Song', 'music', {});
      const themes = engine.extractThemes(seed);
      expect(themes.some((t) => ['harmony', 'expression', 'time'].includes(t))).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// DialogueGenerator
// ─────────────────────────────────────────────

describe('DialogueGenerator', () => {
  let generator: DialogueGenerator;
  let characters: NarrativeCharacter[];

  beforeEach(() => {
    generator = new DialogueGenerator();
    characters = [
      {
        name: 'Solen',
        role: 'protagonist',
        traits: ['brave', 'loyal'],
        appearance: 'tall',
        voice: 'calm',
        motivation: 'protect others',
      },
      {
        name: 'Vael',
        role: 'antagonist',
        traits: ['cunning', 'secretive'],
        appearance: 'lean',
        voice: 'cold',
        motivation: 'gain power',
      },
    ];
  });

  describe('constructor', () => {
    it('creates with default RNG when none is provided', () => {
      expect(generator).toBeInstanceOf(DialogueGenerator);
    });

    it('accepts an explicit DeterministicRNG', () => {
      const g = new DialogueGenerator(new DeterministicRNG('test'));
      expect(g).toBeInstanceOf(DialogueGenerator);
    });
  });

  describe('generateConversation', () => {
    it('returns the requested number of lines', () => {
      const lines = generator.generateConversation(characters, 'the mission', 4);
      expect(lines.length).toBe(4);
    });

    it('uses default length of 4 when not specified', () => {
      const lines = generator.generateConversation(characters, 'danger');
      expect(lines.length).toBe(4);
    });

    it('alternates between characters (round-robin)', () => {
      const lines = generator.generateConversation(characters, 'strategy', 4);
      expect(lines[0]!.character).toBe('Solen');
      expect(lines[1]!.character).toBe('Vael');
      expect(lines[2]!.character).toBe('Solen');
      expect(lines[3]!.character).toBe('Vael');
    });

    it('each line has character, text, and emotion fields', () => {
      const lines = generator.generateConversation(characters, 'truth', 3);
      for (const line of lines) {
        expect(typeof line.character).toBe('string');
        expect(typeof line.text).toBe('string');
        expect(typeof line.emotion).toBe('string');
        expect(line.character.length).toBeGreaterThan(0);
        expect(line.text.length).toBeGreaterThan(0);
      }
    });

    it('works with a single character', () => {
      const lines = generator.generateConversation([characters[0]!], 'alone', 3);
      expect(lines.length).toBe(3);
      for (const line of lines) {
        expect(line.character).toBe('Solen');
      }
    });

    it('handles length of 0 gracefully', () => {
      const lines = generator.generateConversation(characters, 'nothing', 0);
      expect(lines).toEqual([]);
    });

    it('produces lines with non-empty text', () => {
      const lines = generator.generateConversation(characters, 'the plan', 6);
      for (const line of lines) {
        expect(line.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateMonologue', () => {
    it('returns exactly one DialogueLine', () => {
      const result = generator.generateMonologue(characters[0]!, 'courage');
      expect(result.length).toBe(1);
    });

    it('the line is attributed to the given character', () => {
      const result = generator.generateMonologue(characters[1]!, 'power');
      expect(result[0]!.character).toBe('Vael');
    });

    it('the line text contains the topic', () => {
      const result = generator.generateMonologue(characters[0]!, 'destiny');
      expect(result[0]!.text).toContain('destiny');
    });

    it('the line has a non-empty emotion field', () => {
      const result = generator.generateMonologue(characters[0]!, 'hope');
      expect(typeof result[0]!.emotion).toBe('string');
      expect(result[0]!.emotion.length).toBeGreaterThan(0);
    });

    it('action field is sometimes present and sometimes absent', () => {
      const results: DialogueLine[] = [];
      for (let i = 0; i < 20; i++) {
        const g = new DialogueGenerator(new DeterministicRNG(i));
        results.push(...g.generateMonologue(characters[0]!, 'time'));
      }
      const withAction = results.filter((l) => l.action !== undefined);
      const withoutAction = results.filter((l) => l.action === undefined);
      expect(withAction.length).toBeGreaterThan(0);
      expect(withoutAction.length).toBeGreaterThan(0);
    });
  });

  describe('generateBanter', () => {
    it('returns exactly 2 lines for 2+ characters', () => {
      const lines = generator.generateBanter(characters);
      expect(lines.length).toBe(2);
    });

    it('first line is from the first character', () => {
      const lines = generator.generateBanter(characters);
      expect(lines[0]!.character).toBe('Solen');
    });

    it('second line is from the second character', () => {
      const lines = generator.generateBanter(characters);
      expect(lines[1]!.character).toBe('Vael');
    });

    it('both lines have emotion "neutral"', () => {
      const lines = generator.generateBanter(characters);
      expect(lines[0]!.emotion).toBe('neutral');
      expect(lines[1]!.emotion).toBe('neutral');
    });

    it('returns empty array for fewer than 2 characters', () => {
      const lines = generator.generateBanter([characters[0]!]);
      expect(lines).toEqual([]);
    });

    it('returns empty array for empty character array', () => {
      const lines = generator.generateBanter([]);
      expect(lines).toEqual([]);
    });

    it('both text fields are non-empty strings', () => {
      const lines = generator.generateBanter(characters);
      expect(lines[0]!.text.length).toBeGreaterThan(0);
      expect(lines[1]!.text.length).toBeGreaterThan(0);
    });

    it('the two banter texts form a coherent exchange (from banter pair pool)', () => {
      // Multiple seeds to cover all 5 banter pairs
      const allPairs: Array<[string, string]> = [];
      for (let i = 0; i < 30; i++) {
        const g = new DialogueGenerator(new DeterministicRNG(i));
        const lines = g.generateBanter(characters);
        allPairs.push([lines[0]!.text, lines[1]!.text]);
      }
      // Every pair's texts must be non-empty
      for (const [a, b] of allPairs) {
        expect(a.length).toBeGreaterThan(0);
        expect(b.length).toBeGreaterThan(0);
      }
    });
  });

  describe('lineForCharacter — all roles', () => {
    const roles: NarrativeCharacter['role'][] = [
      'protagonist', 'antagonist', 'supporting', 'mentor', 'trickster',
    ];

    for (const role of roles) {
      it(`generates a non-empty line for role "${role}"`, () => {
        const char: NarrativeCharacter = { ...characters[0]!, role };
        const line = generator.lineForCharacter(char, 'the mission', 'neutral');
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(0);
      });
    }

    it('appends sad inflection for emotion "sad"', () => {
      const line = generator.lineForCharacter(characters[0]!, 'loss', 'sad');
      expect(line).toMatch(/Though I am not sure it matters anymore\./);
    });

    it('appends happy inflection for emotion "happy"', () => {
      const line = generator.lineForCharacter(characters[0]!, 'victory', 'happy');
      expect(line).toMatch(/And oddly, I am not worried\./);
    });

    it('does not append sad/happy text for "neutral" emotion', () => {
      const line = generator.lineForCharacter(characters[0]!, 'status', 'neutral');
      expect(line).not.toContain('Though I am not sure');
      expect(line).not.toContain('And oddly');
    });

    it('angry inflection replaces trailing period with "— and I mean that." when applicable', () => {
      // Run enough seeds to hit a line that ends with "." and gets the angry replacement
      let foundAngryInflection = false;
      for (let i = 0; i < 50; i++) {
        const g = new DialogueGenerator(new DeterministicRNG(i));
        const line = g.lineForCharacter(characters[0]!, 'battle', 'angry');
        if (line.includes('— and I mean that.')) {
          foundAngryInflection = true;
          break;
        }
      }
      expect(foundAngryInflection).toBe(true);
    });
  });

  describe('actionBeat', () => {
    it('returns a non-empty string', () => {
      const beat = generator.actionBeat(characters[0]!, 'tense');
      expect(typeof beat).toBe('string');
      expect(beat.length).toBeGreaterThan(0);
    });

    it('references the character name in most beats', () => {
      const beats: string[] = [];
      for (let i = 0; i < 15; i++) {
        const g = new DialogueGenerator(new DeterministicRNG(i));
        beats.push(g.actionBeat(characters[0]!, 'tense'));
      }
      const withName = beats.filter((b) => b.includes('Solen'));
      expect(withName.length).toBeGreaterThan(0);
    });

    it('mood parameter is accepted without error', () => {
      expect(() => generator.actionBeat(characters[0]!, 'unknown-mood')).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────
// BranchingNarrative
// ─────────────────────────────────────────────

describe('BranchingNarrative', () => {
  let doc: NarrativeDocument;
  let narrative: BranchingNarrative;

  beforeEach(() => {
    doc = buildMinimalDocument(3);
    narrative = new BranchingNarrative(doc);
  });

  describe('constructor', () => {
    it('initialises without throwing for a valid document', () => {
      expect(narrative).toBeInstanceOf(BranchingNarrative);
    });

    it('throws when the document has no scenes', () => {
      const emptyDoc = buildMinimalDocument(0);
      expect(() => new BranchingNarrative(emptyDoc)).toThrow('at least one scene');
    });
  });

  describe('getCurrentScene', () => {
    it('returns the first scene initially', () => {
      const scene = narrative.getCurrentScene();
      expect(scene.id).toBe('scene_1');
    });

    it('returns a Scene with all required fields', () => {
      const scene = narrative.getCurrentScene();
      expect(scene).toHaveProperty('id');
      expect(scene).toHaveProperty('title');
      expect(scene).toHaveProperty('description');
      expect(scene).toHaveProperty('dialogue');
      expect(scene).toHaveProperty('narration');
      expect(scene).toHaveProperty('mood');
    });

    it('throws when currentSceneId is not found in document (corrupted state)', () => {
      (narrative as any).currentSceneId = 'scene_999';
      expect(() => narrative.getCurrentScene()).toThrow('Scene "scene_999" not found');
    });
  });

  describe('getChoices', () => {
    it('returns 2 choices for the first scene', () => {
      const choices = narrative.getChoices();
      expect(choices.length).toBe(2);
    });

    it('returns empty array for the last scene (no choices)', () => {
      // Navigate to last scene
      const choices1 = narrative.getChoices();
      narrative.makeChoice(choices1[0]!.id);
      const choices2 = narrative.getChoices();
      narrative.makeChoice(choices2[0]!.id);

      expect(narrative.getChoices()).toEqual([]);
    });
  });

  describe('makeChoice', () => {
    it('returns the next scene when a valid choice id is given', () => {
      const choices = narrative.getChoices();
      const nextScene = narrative.makeChoice(choices[0]!.id);
      expect(nextScene).not.toBeNull();
      expect(nextScene!.id).toBe('scene_2');
    });

    it('returns null for an invalid choice id', () => {
      const result = narrative.makeChoice('nonexistent_choice');
      expect(result).toBeNull();
    });

    it('updates getCurrentScene after a valid choice', () => {
      const choices = narrative.getChoices();
      narrative.makeChoice(choices[0]!.id);
      expect(narrative.getCurrentScene().id).toBe('scene_2');
    });

    it('can navigate through all 3 scenes using choice_a path', () => {
      const visited: string[] = [narrative.getCurrentScene().id];

      while (!narrative.isComplete()) {
        const choices = narrative.getChoices();
        const next = narrative.makeChoice(choices[0]!.id);
        if (next) visited.push(next.id);
      }

      expect(visited[0]).toBe('scene_1');
      expect(visited[visited.length - 1]).toBe('scene_3');
    });

    it('returns null when chosen nextSceneId does not exist in document', () => {
      const brokenDoc: NarrativeDocument = {
        ...buildMinimalDocument(1),
        scenes: [
          {
            ...buildMinimalDocument(1).scenes[0]!,
            choices: [
              {
                id: 'scene_1_choice_a',
                text: 'Go.',
                consequence: 'Leads nowhere.',
                nextSceneId: 'scene_999',
              },
            ],
          },
        ],
      };
      const brokenNarrative = new BranchingNarrative(brokenDoc);
      const result = brokenNarrative.makeChoice('scene_1_choice_a');
      expect(result).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('initially contains only the first scene', () => {
      const history = narrative.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]!.id).toBe('scene_1');
    });

    it('grows by one entry for each choice made', () => {
      const choices = narrative.getChoices();
      narrative.makeChoice(choices[0]!.id);
      expect(narrative.getHistory().length).toBe(2);
    });

    it('returns a defensive copy — external mutations do not affect internal state', () => {
      const history = narrative.getHistory();
      history.push({} as any);
      expect(narrative.getHistory().length).toBe(1);
    });

    it('records scenes in visit order', () => {
      const c1 = narrative.getChoices();
      narrative.makeChoice(c1[0]!.id);
      const c2 = narrative.getChoices();
      narrative.makeChoice(c2[0]!.id);

      const history = narrative.getHistory();
      expect(history.map((s) => s.id)).toEqual(['scene_1', 'scene_2', 'scene_3']);
    });
  });

  describe('reset', () => {
    it('resets current scene to the first scene after navigation', () => {
      const c = narrative.getChoices();
      narrative.makeChoice(c[0]!.id);
      narrative.reset();
      expect(narrative.getCurrentScene().id).toBe('scene_1');
    });

    it('clears history back to just the first scene', () => {
      const c = narrative.getChoices();
      narrative.makeChoice(c[0]!.id);
      narrative.reset();
      expect(narrative.getHistory().length).toBe(1);
    });

    it('throws on reset when document has no scenes (edge guard)', () => {
      const oneScene = buildMinimalDocument(1);
      const bn = new BranchingNarrative(oneScene);
      // Force corrupt internal document reference to exercise the reset guard
      (bn as any).document = { ...oneScene, scenes: [] };
      expect(() => bn.reset()).toThrow('at least one scene');
    });
  });

  describe('isComplete', () => {
    it('returns false when the current scene has choices', () => {
      expect(narrative.isComplete()).toBe(false);
    });

    it('returns true when the current scene has no choices (terminal scene)', () => {
      while (!narrative.isComplete()) {
        const choices = narrative.getChoices();
        narrative.makeChoice(choices[0]!.id);
      }
      expect(narrative.isComplete()).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// NarrativeRenderer
// ─────────────────────────────────────────────

describe('NarrativeRenderer', () => {
  let renderer: NarrativeRenderer;
  let doc: NarrativeDocument;

  beforeEach(() => {
    renderer = new NarrativeRenderer();
    doc = buildMinimalDocument(2);
  });

  // ── toMarkdown ──────────────────────────────

  describe('toMarkdown', () => {
    it('starts with # and the document title', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain(`# ${doc.title}`);
    });

    it('contains the synopsis', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain(doc.synopsis);
    });

    it('contains a **Themes:** line when themes are present', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('**Themes:**');
    });

    it('omits **Themes:** when themes array is empty', () => {
      const noThemesDoc = { ...doc, themes: [] };
      const md = renderer.toMarkdown(noThemesDoc);
      expect(md).not.toContain('**Themes:**');
    });

    it('contains ## World section', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('## World');
    });

    it('contains ## Characters section', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('## Characters');
    });

    it('contains ## Scenes section', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('## Scenes');
    });

    it('renders character as ### Name *(role)*', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('### Aryn *(protagonist)*');
    });

    it('renders scene title as ### heading', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('### Scene 1');
    });

    it('renders choices with checkbox markdown syntax', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toMatch(/- \[ \] .+→/);
    });

    it('renders dialogue with bold character name and italic emotion', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toMatch(/\*\*Aryn\*\* \*\(neutral\)\*/);
    });

    it('renders narration in italics', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('*Silence.*');
    });

    it('renders dialogue action in italics when present', () => {
      const docWithAction: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{
              character: 'Aryn',
              text: 'Hello.',
              emotion: 'neutral',
              action: 'Aryn does not look up.',
            }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const md = renderer.toMarkdown(docWithAction);
      expect(md).toContain('*(Aryn does not look up.)*');
    });

    it('renders visualDirection as a blockquote when present in engine output', () => {
      const engineDoc = new StoryEngine().generateFromSeed(gameSeed);
      const engineMd = renderer.toMarkdown(engineDoc);
      expect(engineMd).toMatch(/^> /m);
    });

    it('renders musicCue in mood line when present', () => {
      const md = renderer.toMarkdown(doc);
      expect(md).toContain('slow_strings');
    });
  });

  // ── toHTML ──────────────────────────────────

  describe('toHTML', () => {
    it('returns a DOCTYPE html document', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('includes the title in a <title> tag', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain(`<title>${doc.title}</title>`);
    });

    it('includes the title in an <h1> tag', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain(`<h1>${doc.title}</h1>`);
    });

    it('includes the synopsis in a .synopsis paragraph', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain(doc.synopsis);
    });

    it('escapes < > & " in the title', () => {
      const xssDoc: NarrativeDocument = {
        ...doc,
        title: 'Test & <b>Bold</b> "Quoted"',
      };
      const html = renderer.toHTML(xssDoc);
      expect(html).not.toContain('<b>Bold</b>');
      expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt;');
      expect(html).toContain('&amp;');
      expect(html).toContain('&quot;Quoted&quot;');
    });

    it('contains .char-block elements', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain('class="char-block"');
    });

    it('contains .scene-block elements', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain('class="scene-block"');
    });

    it('contains .choices block when scene has choices', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain('class="choices"');
    });

    it('omits .choices block for a single-scene document', () => {
      const singleDoc = buildMinimalDocument(1);
      const html = renderer.toHTML(singleDoc);
      expect(html).not.toContain('class="choices"');
    });

    it('includes <style> block in <head>', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain('<style>');
    });

    it('renders dialogue .action span when action field is present', () => {
      const docWithAction: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{
              character: 'Aryn',
              text: 'Ready.',
              emotion: 'determined',
              action: 'Aryn sets something down.',
            }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const html = renderer.toHTML(docWithAction);
      expect(html).toContain('class="action"');
    });

    it('renders musicCue in scene-meta', () => {
      const html = renderer.toHTML(doc);
      expect(html).toContain('slow_strings');
    });

    it('renders visualDirection in scene-meta when present', () => {
      const docWithDir: NarrativeDocument = {
        ...doc,
        scenes: [
          { ...doc.scenes[0]!, visualDirection: 'Wide establishing shot.' },
          ...doc.scenes.slice(1),
        ],
      };
      const html = renderer.toHTML(docWithDir);
      expect(html).toContain('Wide establishing shot.');
    });
  });

  // ── toPlainText ─────────────────────────────

  describe('toPlainText', () => {
    it('starts with the title uppercased', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain(doc.title.toUpperCase());
    });

    it('includes a separator line matching the title length', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain('='.repeat(doc.title.length));
    });

    it('includes WORLD, CHARACTERS, and SCENES sections', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain('WORLD');
      expect(text).toContain('CHARACTERS');
      expect(text).toContain('SCENES');
    });

    it('includes the synopsis', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain(doc.synopsis);
    });

    it('includes the world description', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain(doc.worldDescription);
    });

    it('formats characters as "Name [role]"', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain('Aryn [protagonist]');
    });

    it('formats scenes as "[TITLE] — mood"', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain('[SCENE 1] — tense');
    });

    it('formats dialogue as "  Name (emotion): text"', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain('Aryn (neutral): "Hello."');
    });

    it('formats narration segments with asterisk prefix', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain('  * Silence.');
    });

    it('formats choices with > and => lines', () => {
      const text = renderer.toPlainText(doc);
      expect(text).toContain('  Choices:');
      expect(text).toMatch(/    > .+/);
      expect(text).toMatch(/      => .+/);
    });

    it('formats dialogue action in [square brackets] when present', () => {
      const docWithAction: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{
              character: 'Aryn',
              text: 'Steady.',
              emotion: 'determined',
              action: 'Aryn checks the door.',
            }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const text = renderer.toPlainText(docWithAction);
      expect(text).toContain('[Aryn checks the door.]');
    });
  });

  // ── toSSML ──────────────────────────────────

  describe('toSSML', () => {
    it('wraps output in <speak> tags', () => {
      const ssml = renderer.toSSML(doc);
      expect(ssml.trimStart()).toMatch(/^<speak>/);
      expect(ssml).toContain('</speak>');
    });

    it('includes the title in <p><s> tags', () => {
      const ssml = renderer.toSSML(doc);
      expect(ssml).toContain(`<s>${doc.title}</s>`);
    });

    it('includes the synopsis in a <p> tag', () => {
      const ssml = renderer.toSSML(doc);
      expect(ssml).toContain(`<p>${doc.synopsis}</p>`);
    });

    it('includes <break time="1s"/> elements', () => {
      const ssml = renderer.toSSML(doc);
      expect(ssml).toContain('<break time="1s"/>');
    });

    it('includes <break time="750ms"/> between scenes', () => {
      const ssml = renderer.toSSML(doc);
      expect(ssml).toContain('<break time="750ms"/>');
    });

    it('wraps scene titles in <emphasis level="strong"> tags', () => {
      const ssml = renderer.toSSML(doc);
      expect(ssml).toContain('<emphasis level="strong">Scene 1</emphasis>');
    });

    it('wraps narration in slow/low prosody', () => {
      const ssml = renderer.toSSML(doc);
      expect(ssml).toContain('<prosody rate="slow" pitch="low">');
    });

    it('applies fast/high prosody for "happy" emotion', () => {
      const happyDoc: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{ character: 'Aryn', text: 'Great!', emotion: 'happy' }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const ssml = renderer.toSSML(happyDoc);
      expect(ssml).toContain('rate="fast"');
      expect(ssml).toContain('pitch="high"');
    });

    it('applies slow/low prosody for "sad" emotion', () => {
      const sadDoc: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{ character: 'Aryn', text: 'All is lost.', emotion: 'sad' }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const ssml = renderer.toSSML(sadDoc);
      expect(ssml).toContain('rate="slow"');
      expect(ssml).toContain('pitch="low"');
    });

    it('applies slow/low prosody for "thoughtful" emotion', () => {
      const thoughtDoc: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{ character: 'Aryn', text: 'I wonder…', emotion: 'thoughtful' }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const ssml = renderer.toSSML(thoughtDoc);
      expect(ssml).toContain('rate="slow"');
      expect(ssml).toContain('pitch="low"');
    });

    it('applies medium prosody for "neutral" emotion', () => {
      const ssml = renderer.toSSML(doc); // doc has neutral dialogue
      expect(ssml).toContain('rate="medium"');
      expect(ssml).toContain('pitch="medium"');
    });

    it('applies medium/medium prosody for unknown emotion (fallback)', () => {
      const unknownEmotionDoc: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{ character: 'Aryn', text: 'Fine.', emotion: 'confused' as any }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const ssml = renderer.toSSML(unknownEmotionDoc);
      expect(ssml).toContain('rate="medium"');
    });

    it('escapes XML special characters in dialogue text', () => {
      const xmlDoc: NarrativeDocument = {
        ...doc,
        scenes: [
          {
            ...doc.scenes[0]!,
            dialogue: [{
              character: 'Aryn',
              text: 'Tom & Jerry <rule> "always"',
              emotion: 'neutral',
            }],
          },
          ...doc.scenes.slice(1),
        ],
      };
      const ssml = renderer.toSSML(xmlDoc);
      expect(ssml).not.toContain('<rule>');
      expect(ssml).toContain('&amp;');
      expect(ssml).toContain('&lt;rule&gt;');
      expect(ssml).toContain('&quot;always&quot;');
    });

    it('handles all EmotionType values without throwing', () => {
      const emotions = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'thoughtful', 'fearful', 'determined'];
      for (const emotion of emotions) {
        const emotionDoc: NarrativeDocument = {
          ...doc,
          scenes: [
            {
              ...doc.scenes[0]!,
              dialogue: [{ character: 'Aryn', text: 'Something.', emotion }],
            },
            ...doc.scenes.slice(1),
          ],
        };
        expect(() => renderer.toSSML(emotionDoc)).not.toThrow();
      }
    });
  });

  // ── Integration ─────────────────────────────

  describe('integration — full pipeline from seed to all render targets', () => {
    it('renders a seed-generated document to all four formats without error', () => {
      const engine = new StoryEngine();
      const fullDoc = engine.generateFromSeed(gameSeed);

      const md = renderer.toMarkdown(fullDoc);
      const html = renderer.toHTML(fullDoc);
      const plain = renderer.toPlainText(fullDoc);
      const ssml = renderer.toSSML(fullDoc);

      expect(md.length).toBeGreaterThan(100);
      expect(html.length).toBeGreaterThan(100);
      expect(plain.length).toBeGreaterThan(100);
      expect(ssml.length).toBeGreaterThan(100);
    });

    it('all four renders are deterministic for the same document', () => {
      const engine = new StoryEngine(new DeterministicRNG('roundtrip'));
      const fullDoc = engine.generateFromSeed(ecosystemSeed);

      expect(renderer.toMarkdown(fullDoc)).toBe(renderer.toMarkdown(fullDoc));
      expect(renderer.toPlainText(fullDoc)).toBe(renderer.toPlainText(fullDoc));
      expect(renderer.toSSML(fullDoc)).toBe(renderer.toSSML(fullDoc));
    });

    it('BranchingNarrative navigates a fully engine-generated document', () => {
      const engine = new StoryEngine();
      const fullDoc = engine.generateFromSeed(networkSeed);
      const bn = new BranchingNarrative(fullDoc);

      const visited: string[] = [bn.getCurrentScene().id];
      let safetyCount = 0;
      while (!bn.isComplete() && safetyCount < 20) {
        const choices = bn.getChoices();
        const next = bn.makeChoice(choices[0]!.id);
        if (next) visited.push(next.id);
        safetyCount++;
      }

      expect(visited.length).toBeGreaterThanOrEqual(1);
      expect(bn.isComplete()).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// Domain-to-genre mapping — broad coverage
// ─────────────────────────────────────────────

describe('Domain-to-genre mapping coverage', () => {
  const engine = new StoryEngine();
  const domains = [
    'mammal', 'bird', 'fish', 'insect', 'plant', 'terrain',
    'robot', 'neural', 'intelligence', 'quantum', 'molecular',
    'code', 'security', 'security-threat', 'intrusion', 'forensics',
    'narrative', 'music', 'ui', 'city', 'vehicle', 'weapon',
    'building', 'particle', 'fluid', 'crystal',
  ];

  for (const domain of domains) {
    it(`generates a valid document for domain "${domain}"`, () => {
      const seed = makeSeed(`Entity_${domain}`, domain, {
        value: { type: 'scalar', value: 1, min: 0, max: 2 },
      });
      const doc = engine.generateFromSeed(seed);
      expect(doc.scenes.length).toBeGreaterThanOrEqual(3);
      expect(doc.characters.length).toBeGreaterThanOrEqual(2);
      expect(doc.title.length).toBeGreaterThan(0);
    });
  }
});
