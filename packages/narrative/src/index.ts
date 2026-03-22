/**
 * @paradigm/narrative — Story, dialogue, and branching-narrative engine.
 *
 * Converts a UniversalSeed into a fully-realised NarrativeDocument with
 * typed characters, multi-scene arcs, branching choices, and four render
 * targets (Markdown, HTML, plain text, SSML).
 *
 * All randomness flows through DeterministicRNG so output is reproducible
 * for any given seed hash.
 *
 * @packageDocumentation
 */

import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Public Interfaces
// ─────────────────────────────────────────────

/** A character that participates in the narrative. */
export interface NarrativeCharacter {
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'mentor' | 'trickster';
  traits: string[];
  appearance: string;
  voice: string;
  motivation: string;
}

/** One line of spoken dialogue attributed to a character. */
export interface DialogueLine {
  character: string;
  text: string;
  emotion: string;
  action?: string;
}

/** A paragraph of narration with mood context. */
export interface NarrationSegment {
  text: string;
  voice: 'narrator' | 'character';
  mood: string;
}

/** A choice the reader can make at the end of a scene. */
export interface StoryChoice {
  id: string;
  text: string;
  consequence: string;
  nextSceneId: string;
}

/** A self-contained scene with dialogue, narration, and optional choices. */
export interface Scene {
  id: string;
  title: string;
  description: string;
  dialogue: DialogueLine[];
  narration: NarrationSegment[];
  mood: string;
  musicCue?: string;
  visualDirection?: string;
  choices?: StoryChoice[];
}

/** The top-level story document generated from a seed. */
export interface NarrativeDocument {
  title: string;
  synopsis: string;
  themes: string[];
  characters: NarrativeCharacter[];
  worldDescription: string;
  scenes: Scene[];
}

// ─────────────────────────────────────────────
// Internal Genre Templates
// ─────────────────────────────────────────────

interface GenreTemplate {
  titlePrefixes: readonly string[];
  titleSuffixes: readonly string[];
  sceneTitles: readonly string[];
  moods: readonly string[];
  musicCues: readonly string[];
  synopsisTemplates: readonly string[];
  worldPhrases: readonly string[];
}

const GENRE_TEMPLATES: Record<string, GenreTemplate> = {
  fantasy: {
    titlePrefixes: ['The Shadow of', 'Chronicles of', 'Heir to', 'The Last', 'Curse of'],
    titleSuffixes: ['the Ancients', 'a Broken Crown', 'the Hollow Throne', 'Ember Keep', 'Ashveil'],
    sceneTitles: ['The Awakening', 'Into the Wilds', 'A Gathering Storm', 'The Precipice', 'Reckoning'],
    moods: ['mystical', 'foreboding', 'triumphant', 'melancholic', 'tense'],
    musicCues: ['slow_strings', 'brass_fanfare', 'solo_lute', 'choir_swell', 'ominous_drone'],
    synopsisTemplates: [
      'A reluctant {role} discovers {name} holds the key to an ancient prophecy that will reshape the {world}.',
      'When the {world} is threatened by a forgotten darkness, {name} must unite old enemies to survive.',
      '{name} inherits a cursed legacy and must decide whether to embrace or destroy the power within.',
    ],
    worldPhrases: [
      'a realm where magic flows through ancient ley lines',
      'a world scarred by wars between mortal kingdoms and immortal courts',
      'a land where the veil between the living and the dead has grown dangerously thin',
    ],
  },
  scifi: {
    titlePrefixes: ['Signal from', 'Beyond the', 'Event Horizon:', 'Protocol', 'Zero-Day'],
    titleSuffixes: ['Sector Nine', 'the Void Gate', 'Threshold', 'Omega Station', 'Deep Meridian'],
    sceneTitles: ['Boot Sequence', 'Anomaly Detected', 'System Breach', 'The Long Jump', 'Final Transmission'],
    moods: ['clinical', 'tense', 'awe-inspiring', 'paranoid', 'hopeful'],
    musicCues: ['ambient_synth', 'electronic_pulse', 'tension_drone', 'choral_synth', 'radio_static'],
    synopsisTemplates: [
      'When {name} intercepts an alien signal, the crew of {world} must race against a hostile fleet to decode its meaning.',
      '{name} wakes from cryo-sleep with no memory aboard {world} — and the AI will not say how long they have been travelling.',
      'A rogue algorithm rewrites the laws of physics inside {world}, and only {name} understands its intent.',
    ],
    worldPhrases: [
      'a generation ship adrift in the dark between galaxies',
      'a frontier colony on the edge of explored space',
      'a megastructure built by a civilisation that vanished ten thousand years ago',
    ],
  },
  mystery: {
    titlePrefixes: ['The Vanishing of', 'Death at', 'Secrets of', 'No Witness for', 'The Case of'],
    titleSuffixes: ['Harrow Hall', 'Midnight Tide', 'the Silver Key', 'the Fourth Door', 'Mosscliff Manor'],
    sceneTitles: ['The Discovery', 'False Leads', 'Shadows and Lies', 'The Trap', 'Unveiled'],
    moods: ['suspicious', 'tense', 'unsettling', 'curious', 'resigned'],
    musicCues: ['jazz_piano', 'pizzicato_strings', 'organ_motif', 'rain_ambience', 'clock_ticking'],
    synopsisTemplates: [
      '{name} is drawn into a web of deceit when a body is found inside {world} with no apparent cause of death.',
      'A letter arrives for {name} containing a single photograph — and the person in it has been missing for thirty years.',
      'Three suspects. One locked room. And {name} has forty-eight hours before the real killer escapes {world}.',
    ],
    worldPhrases: [
      'a fog-shrouded coastal town where everyone has something to hide',
      'a grand estate sealed off since a scandal twenty years ago',
      'a bustling city precinct where corruption runs deeper than the river',
    ],
  },
  romance: {
    titlePrefixes: ['A Heart Like', 'When', 'Letters to', 'The Space Between', 'Under'],
    titleSuffixes: ['Autumn Glass', 'Storms Subside', 'No One', 'Us', 'the Same Stars'],
    sceneTitles: ['First Encounter', 'Complications', 'Confession', 'The Distance', 'Coming Home'],
    moods: ['warm', 'longing', 'playful', 'bittersweet', 'tender'],
    musicCues: ['acoustic_guitar', 'soft_piano', 'string_quartet', 'vocal_ballad', 'ambient_warmth'],
    synopsisTemplates: [
      '{name} swore never to fall in love again — then {world} brought someone unexpected into their orbit.',
      'Rival strangers stranded together by circumstance in {world}, {name} discovers that first impressions rarely tell the whole truth.',
      '{name} receives a stack of unsent letters and follows them across {world} to find the person who wrote them.',
    ],
    worldPhrases: [
      "a quiet seaside town where everyone knows everyone's name",
      'a city alive with festivals, food, and forgotten promises',
      'the slow rhythm of a countryside summer that seems to last forever',
    ],
  },
  horror: {
    titlePrefixes: ['Do Not', 'Something', 'The Last Night of', 'Beneath', 'Hollow'],
    titleSuffixes: ['Open the Door', 'Watches from the Dark', 'Millhaven Creek', 'the Old Ground', 'Roots'],
    sceneTitles: ['First Signs', 'Into the Dark', 'No Escape', 'The Truth is Worse', 'What Remains'],
    moods: ['dread', 'oppressive', 'frantic', 'desolate', 'nightmarish'],
    musicCues: ['low_drone', 'dissonant_strings', 'silence', 'heartbeat_pulse', 'whispered_choir'],
    synopsisTemplates: [
      '{name} accepts a caretaker role at {world} — and by the first night understands why no one ever leaves willingly.',
      'The children of {world} have begun drawing the same thing. {name} recognises it from a dream they cannot remember having.',
      '{name} survives the first night. The rules they were given only apply to the hours before midnight.',
    ],
    worldPhrases: [
      'an isolated research station where the last team stopped responding six months ago',
      'a small town that does not appear on any map made after 1987',
      'a derelict hospital standing at the edge of a forest that locals refuse to enter',
    ],
  },
  adventure: {
    titlePrefixes: ['Race to', 'Expedition:', 'Beyond the', 'Vanguard of', 'The Hunt for'],
    titleSuffixes: ['the Sunken Citadel', 'Forgotten Shores', 'the Iron Compass', 'Stormbreak', 'the Red Meridian'],
    sceneTitles: ['The Call', 'Uncharted', 'Ambush', 'Against the Odds', 'Victory at a Price'],
    moods: ['exciting', 'breathless', 'triumphant', 'desperate', 'exhilarating'],
    musicCues: ['adventure_brass', 'percussion_drive', 'triumphant_horns', 'chase_strings', 'epic_swell'],
    synopsisTemplates: [
      '{name} follows an ancient map into {world} — and every step forward confirms the legends were an understatement.',
      'A simple retrieval mission dumps {name} into the centre of a conflict that has been simmering in {world} for a century.',
      '{name} has seventy-two hours to cross {world} and return what was stolen before the window closes forever.',
    ],
    worldPhrases: [
      'a vast wilderness of uncharted islands and treacherous straits',
      'the contested borderlands between two powers who have never truly been at peace',
      'a mountain range hiding ruins that pre-date every known civilisation',
    ],
  },
  nature: {
    titlePrefixes: ['The Season of', 'Root and', 'At the Edge of', 'Song of the', 'A Year in'],
    titleSuffixes: ['the Long Thaw', 'Branch', 'the Watershed', 'Migration', 'the Canopy'],
    sceneTitles: ['First Light', 'The Migration', 'The Storm Season', 'Dormancy', 'Renewal'],
    moods: ['serene', 'cyclical', 'awe-inspiring', 'melancholic', 'hopeful'],
    musicCues: ['field_recording', 'woodwind_ensemble', 'minimalist_piano', 'ambient_forest', 'dawn_chorus'],
    synopsisTemplates: [
      '{name} documents the final season of an ecosystem on the edge of {world}, finding unexpected resilience.',
      'When the ancient patterns of {world} shift without warning, {name} must understand why before the next winter.',
      '{name} follows a single organism across {world}, uncovering an intelligence that science has never measured.',
    ],
    worldPhrases: [
      'a living forest that has maintained its own balance for ten thousand years',
      'a tidal wetland where the boundary between land and sea shifts with every moon',
      'a high plateau where a community of species has evolved in total isolation',
    ],
  },
  comedy: {
    titlePrefixes: ['Absolutely Nobody\'s Guide to', 'How Not to', 'The Slightly Ridiculous', 'Chaos at', 'Every Disaster in'],
    titleSuffixes: ['Saving the World', 'Run a Kingdom', 'Chronicles', 'Briarwood Towers', 'One Weekend'],
    sceneTitles: ['A Plan Forms', 'Everything Goes Sideways', 'Digging Deeper', 'Peak Disaster', 'Somehow, It Works'],
    moods: ['absurd', 'farcical', 'warm', 'chaotic', 'gleeful'],
    musicCues: ['tuba_comedy', 'upbeat_strings', 'ragtime_piano', 'kazoo_fanfare', 'cheerful_whistling'],
    synopsisTemplates: [
      '{name} is wildly unqualified to handle the situation in {world} — and yet here they are, absolutely handling it.',
      'A single minor misunderstanding in {world} cascades into a crisis that only {name} can reverse. Probably.',
      '{name} agrees to one small favour in {world}. Six hours later, three things are on fire and everyone is blaming them.',
    ],
    worldPhrases: [
      'a provincial town where the annual festival has never once gone according to plan',
      'a bureaucratic organisation held together entirely by post-it notes and misplaced optimism',
      'a household in which every member has a completely different idea of what is happening',
    ],
  },
};

const DEFAULT_GENRE = 'adventure';

const DOMAIN_TO_GENRE: Record<string, string> = {
  organism: 'fantasy',
  mammal: 'fantasy',
  bird: 'nature',
  fish: 'nature',
  insect: 'nature',
  plant: 'nature',
  ecosystem: 'nature',
  terrain: 'adventure',
  game: 'adventure',
  simulation: 'scifi',
  robot: 'scifi',
  neural: 'scifi',
  intelligence: 'scifi',
  quantum: 'scifi',
  molecular: 'scifi',
  network: 'mystery',
  code: 'mystery',
  security: 'mystery',
  'security-threat': 'mystery',
  intrusion: 'mystery',
  forensics: 'mystery',
  narrative: 'mystery',
  emotion: 'romance',
  music: 'romance',
  sound: 'comedy',
  ui: 'comedy',
  city: 'adventure',
  vehicle: 'adventure',
  weapon: 'adventure',
  building: 'mystery',
  particle: 'scifi',
  fluid: 'nature',
  crystal: 'fantasy',
};

type EmotionType = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'thoughtful' | 'fearful' | 'determined';
const EMOTIONS: readonly EmotionType[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'thoughtful', 'fearful', 'determined'];

const CHARACTER_NAMES: readonly string[] = [
  'Aryn', 'Solen', 'Mira', 'Talek', 'Cress', 'Vael', 'Oryn', 'Lithe',
  'Davan', 'Keth', 'Sura', 'Bryn', 'Faen', 'Tirel', 'Nox', 'Elva',
];

const TRAIT_POOL: readonly string[] = [
  'resourceful', 'impulsive', 'empathetic', 'cunning', 'stubborn', 'loyal',
  'suspicious', 'courageous', 'methodical', 'reckless', 'perceptive', 'reserved',
  'charismatic', 'principled', 'adaptable', 'idealistic', 'pragmatic', 'secretive',
];

const APPEARANCE_TEMPLATES: readonly string[] = [
  'sharp eyes that miss nothing, a lean build, and a habit of standing too close to exits',
  'broad shoulders, a worn travelling coat, and a scar across the left brow that they never explain',
  'an unhurried way of moving that somehow always gets them where they need to be first',
  'dark hair kept short, ink-stained fingers, and an expression that gives nothing away',
  'pale features, unsettling stillness, and a voice that always sounds as if it belongs to a larger room',
  'warm skin weathered by seasons outdoors, hands built for work, eyes built for reading people',
  'meticulously kept appearance disrupted only by a persistent exhaustion behind the eyes',
  'long limbs, a quick smile, and the kind of laugh that makes other people check whether they should be worried',
];

const VOICE_TEMPLATES: readonly string[] = [
  'speaks in precise, economical sentences; pauses carry more weight than the words',
  'warm and unhurried, the sort of voice that makes difficult information sound almost reasonable',
  'low and controlled, with an edge that only surfaces when patience has run out',
  'quick and layered, thoughts arriving faster than most people can follow',
  'dry and flat, every statement delivered with the same tone regardless of stakes',
  'rich and deliberate, calibrated to command a room without seeming to try',
  'soft with an undercurrent of steel; polite until the precise moment it is not necessary',
  'blunt, economical, accurate; the social graces treated as optional equipment',
];

const MOTIVATION_TEMPLATES: readonly string[] = [
  'seeking answers to a question they have carried since childhood',
  'trying to undo a mistake that cost someone else more than it cost them',
  'protecting something the rest of the world would prefer to forget exists',
  'proving a theory that every authority has dismissed as impossible',
  'collecting debts — and paying the ones owed in equal measure',
  'running from a past that keeps sending representatives to negotiate',
  'building something that will outlast every person who said it could not be done',
  'simply trying to get through this without making things worse — a goal proving difficult',
];

// ─────────────────────────────────────────────
// StoryEngine
// ─────────────────────────────────────────────

/**
 * Primary narrative generation engine.
 * Derives a complete NarrativeDocument deterministically from a UniversalSeed.
 */
export class StoryEngine {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG(42);
  }

  /** Generate a complete story document from a seed. */
  generateFromSeed(seed: UniversalSeed): NarrativeDocument {
    const seedRng = this.rng.fork(seed.$hash);
    const engine = new StoryEngine(seedRng);

    const title = engine.generateTitle(seed);
    const themes = engine.extractThemes(seed);
    const characters = engine.generateCharacters(seed);
    const synopsis = engine.generateSynopsis(seed, title);
    const worldDescription = engine.generateWorldDescription(seed);
    const scenes = engine.generateScenes(seed, characters);

    return { title, synopsis, themes, characters, worldDescription, scenes };
  }

  /** Derive a title from seed domain and gene values. */
  generateTitle(seed: UniversalSeed): string {
    const genre = DOMAIN_TO_GENRE[seed.$domain] ?? DEFAULT_GENRE;
    const template = GENRE_TEMPLATES[genre] ?? GENRE_TEMPLATES[DEFAULT_GENRE]!;
    const rng = this.rng.fork(`${seed.$hash}:title`);

    // Use seed name as a potential suffix substitute when genes are present
    const prefix = rng.choice(template.titlePrefixes);
    const suffix = seed.$name && seed.$name.length > 2
      ? (rng.next() > 0.5 ? seed.$name : rng.choice(template.titleSuffixes))
      : rng.choice(template.titleSuffixes);

    return `${prefix} ${suffix}`;
  }

  /** Generate a synopsis using domain genre templates. */
  generateSynopsis(seed: UniversalSeed, title: string): string {
    const genre = DOMAIN_TO_GENRE[seed.$domain] ?? DEFAULT_GENRE;
    const template = GENRE_TEMPLATES[genre] ?? GENRE_TEMPLATES[DEFAULT_GENRE]!;
    const rng = this.rng.fork(`${seed.$hash}:synopsis`);

    const worldPhrase = rng.choice(template.worldPhrases);
    const synopsisTemplate = rng.choice(template.synopsisTemplates);
    const characterName = rng.choice(CHARACTER_NAMES);

    return synopsisTemplate
      .replace('{name}', characterName)
      .replace('{world}', worldPhrase)
      .replace('{role}', 'chosen one')
      + ` This is the story that "${title}" tells.`;
  }

  /** Generate characters drawn from seed gene data. */
  generateCharacters(seed: UniversalSeed): NarrativeCharacter[] {
    const rng = this.rng.fork(`${seed.$hash}:characters`);
    const geneKeys = Object.keys(seed.genes);
    const count = Math.min(2 + Math.floor(rng.next() * 2), 4); // 2–4 characters

    const roles: Array<NarrativeCharacter['role']> = [
      'protagonist', 'antagonist', 'supporting', 'mentor', 'trickster',
    ];

    const usedNames = new Set<string>();
    const characters: NarrativeCharacter[] = [];

    for (let i = 0; i < count; i++) {
      let name = rng.choice(CHARACTER_NAMES);
      while (usedNames.has(name)) {
        name = rng.choice(CHARACTER_NAMES);
      }
      usedNames.add(name);

      const role = roles[i % roles.length] ?? 'supporting';

      // Derive 2–3 traits; skew selection using gene key names as entropy
      const traitCount = 2 + (geneKeys.length > 3 ? 1 : 0);
      const traits = rng.sample(TRAIT_POOL, Math.min(traitCount, TRAIT_POOL.length));

      const appearance = rng.choice(APPEARANCE_TEMPLATES);
      const voice = rng.choice(VOICE_TEMPLATES);
      const motivation = rng.choice(MOTIVATION_TEMPLATES);

      characters.push({ name, role, traits, appearance, voice, motivation });
    }

    return characters;
  }

  /** Describe the world based on seed domain. */
  generateWorldDescription(seed: UniversalSeed): string {
    const genre = DOMAIN_TO_GENRE[seed.$domain] ?? DEFAULT_GENRE;
    const template = GENRE_TEMPLATES[genre] ?? GENRE_TEMPLATES[DEFAULT_GENRE]!;
    const rng = this.rng.fork(`${seed.$hash}:world`);

    const worldPhrase = rng.choice(template.worldPhrases);
    const mood = rng.choice(template.moods);

    return `The story unfolds in ${worldPhrase}. The prevailing tone is ${mood}, `
      + `shaped by the domain of "${seed.$domain}" and the particular pressures encoded within seed ${seed.$name}.`;
  }

  /** Generate 3–5 scenes with dialogue and narration. */
  generateScenes(seed: UniversalSeed, characters: NarrativeCharacter[]): Scene[] {
    const genre = DOMAIN_TO_GENRE[seed.$domain] ?? DEFAULT_GENRE;
    const template = GENRE_TEMPLATES[genre] ?? GENRE_TEMPLATES[DEFAULT_GENRE]!;
    const rng = this.rng.fork(`${seed.$hash}:scenes`);

    const sceneCount = 3 + Math.floor(rng.next() * 3); // 3–5
    const scenes: Scene[] = [];

    for (let i = 0; i < sceneCount; i++) {
      const id = `scene_${i + 1}`;
      const title = template.sceneTitles[i % template.sceneTitles.length] ?? `Scene ${i + 1}`;
      const mood = rng.choice(template.moods);
      const musicCue = rng.choice(template.musicCues);

      const dialogueRng = rng.fork(`${id}:dialogue`);
      const narrationRng = rng.fork(`${id}:narration`);

      const dialogue = this.buildSceneDialogue(characters, mood, dialogueRng, 2 + Math.floor(rng.next() * 3));
      const narration = this.buildSceneNarration(mood, narrationRng);

      const description = `${title}: ${this.buildSceneDescription(seed, mood, rng)}`;
      const visualDirection = `${mood.charAt(0).toUpperCase() + mood.slice(1)} lighting; ${rng.choice(['wide establishing shot', 'tight close-up', 'tracking shot', 'static long take'])}.`;

      // Last scene has no choices; earlier scenes offer branching options
      const choices: StoryChoice[] | undefined = i < sceneCount - 1
        ? this.buildChoices(id, scenes, sceneCount, i, rng)
        : undefined;

      scenes.push({ id, title, description, dialogue, narration, mood, musicCue, visualDirection, choices });
    }

    return scenes;
  }

  /** Extract thematic keywords from seed domain and gene names. */
  extractThemes(seed: UniversalSeed): string[] {
    const domainThemes: Record<string, string[]> = {
      organism: ['survival', 'identity', 'transformation'],
      ecosystem: ['balance', 'interdependence', 'cycles'],
      game: ['competition', 'rules', 'agency'],
      simulation: ['determinism', 'emergence', 'control'],
      robot: ['purpose', 'autonomy', 'consciousness'],
      neural: ['pattern', 'learning', 'memory'],
      intelligence: ['reasoning', 'deception', 'truth'],
      narrative: ['meaning', 'perspective', 'change'],
      music: ['harmony', 'expression', 'time'],
      emotion: ['vulnerability', 'connection', 'loss'],
      weapon: ['power', 'consequence', 'responsibility'],
      city: ['society', 'ambition', 'isolation'],
    };

    const base: string[] = domainThemes[seed.$domain] ?? ['discovery', 'conflict', 'resolution'];

    // Add gene-derived themes (first two gene names, sanitised)
    const geneThemes = Object.keys(seed.genes)
      .slice(0, 2)
      .map((k) => k.replace(/_/g, ' ').toLowerCase());

    return Array.from(new Set([...base, ...geneThemes])).slice(0, 5);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildSceneDialogue(
    characters: NarrativeCharacter[],
    mood: string,
    rng: DeterministicRNG,
    count: number,
  ): DialogueLine[] {
    const lines: DialogueLine[] = [];
    const dialogueGen = new DialogueGenerator(rng);

    for (let i = 0; i < count; i++) {
      const speaker = characters[i % characters.length];
      if (!speaker) continue;

      const emotion = this.moodToEmotion(mood, rng);
      const text = dialogueGen.lineForCharacter(speaker, mood, emotion);
      const action = rng.next() > 0.6 ? dialogueGen.actionBeat(speaker, mood) : undefined;

      lines.push({ character: speaker.name, text, emotion, action });
    }

    return lines;
  }

  private buildSceneNarration(mood: string, rng: DeterministicRNG): NarrationSegment[] {
    const narrationTexts: readonly string[] = [
      `The air carried the weight of things left unsaid.`,
      `Time, here, had its own opinions about direction.`,
      `Something had changed, though no one had yet named it.`,
      `The silence between the words was the loudest thing in the room.`,
      `Outside, the world continued its indifferent work.`,
      `In any other story, this would have been the moment to turn back.`,
    ];

    const count = 1 + Math.floor(rng.next() * 2);
    const segments: NarrationSegment[] = [];

    for (let i = 0; i < count; i++) {
      segments.push({
        text: rng.choice(narrationTexts),
        voice: 'narrator',
        mood,
      });
    }

    return segments;
  }

  private buildSceneDescription(seed: UniversalSeed, mood: string, rng: DeterministicRNG): string {
    const settings: readonly string[] = [
      `tensions surface that have been building since before anyone thought to count`,
      `choices narrow and the cost of inaction becomes clear`,
      `the world reveals a new face — not reassuring`,
      `alliances are tested by a truth no one wanted delivered`,
      `the next step becomes undeniable regardless of what it costs`,
    ];

    return `a ${mood} episode in which ${rng.choice(settings)}. Seed: ${seed.$name}.`;
  }

  private buildChoices(
    currentId: string,
    scenes: Scene[],
    totalScenes: number,
    index: number,
    rng: DeterministicRNG,
  ): StoryChoice[] {
    const nextId = `scene_${index + 2}`;
    const alternateId = index + 3 <= totalScenes ? `scene_${index + 3}` : nextId;

    const choiceTexts: readonly string[] = [
      'Press forward — there is no safe ground behind you.',
      'Step back and reassess before committing.',
      'Confront what you have been avoiding.',
      'Trust the person you are least certain about.',
      'Accept the cost and move on.',
      'Look for the third option that no one has mentioned yet.',
    ];

    const consequenceTexts: readonly string[] = [
      'The path ahead narrows but accelerates.',
      'A brief pause reveals something that changes the calculation.',
      'The confrontation is messier than anticipated, but necessary.',
      'Trust is extended; whether wisely will become apparent.',
      'Something is lost. Something else, unexpectedly, is found.',
      'The third option exists, though it costs more than either of the first two.',
    ];

    void currentId; // used for scene context; not needed in text
    void scenes;

    return [
      {
        id: `${currentId}_choice_a`,
        text: rng.choice(choiceTexts),
        consequence: rng.choice(consequenceTexts),
        nextSceneId: nextId,
      },
      {
        id: `${currentId}_choice_b`,
        text: rng.choice(choiceTexts),
        consequence: rng.choice(consequenceTexts),
        nextSceneId: alternateId,
      },
    ];
  }

  private moodToEmotion(mood: string, rng: DeterministicRNG): EmotionType {
    const moodMap: Record<string, EmotionType[]> = {
      tense: ['fearful', 'determined', 'angry'],
      mystical: ['thoughtful', 'surprised', 'neutral'],
      foreboding: ['fearful', 'thoughtful', 'sad'],
      triumphant: ['happy', 'determined', 'surprised'],
      melancholic: ['sad', 'thoughtful', 'neutral'],
      clinical: ['neutral', 'thoughtful', 'determined'],
      dread: ['fearful', 'sad', 'angry'],
      warm: ['happy', 'neutral', 'thoughtful'],
      absurd: ['surprised', 'happy', 'neutral'],
      exciting: ['happy', 'determined', 'surprised'],
      serene: ['neutral', 'happy', 'thoughtful'],
    };

    const options = moodMap[mood] ?? EMOTIONS;
    return rng.choice(options);
  }
}

// ─────────────────────────────────────────────
// DialogueGenerator
// ─────────────────────────────────────────────

/**
 * Generates contextual dialogue lines, monologues, and banter.
 * Text is flavoured by character role and personality traits.
 */
export class DialogueGenerator {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG(42);
  }

  /** Generate a back-and-forth conversation on a topic. */
  generateConversation(
    characters: NarrativeCharacter[],
    topic: string,
    length: number = 4,
  ): DialogueLine[] {
    const lines: DialogueLine[] = [];

    for (let i = 0; i < length; i++) {
      const speaker = characters[i % characters.length];
      if (!speaker) continue;

      const emotion = this.rng.choice(EMOTIONS);
      const text = this.lineForCharacter(speaker, topic, emotion);

      lines.push({ character: speaker.name, text, emotion });
    }

    return lines;
  }

  /** Generate a solo monologue. */
  generateMonologue(character: NarrativeCharacter, topic: string): DialogueLine[] {
    const templates: readonly string[] = [
      `There is something about ${topic} that most people choose not to look at directly.`,
      `I have spent longer than I care to admit thinking about ${topic}. Here is what I have.`,
      `${topic} — people think they understand it. They do not. Let me show you why.`,
      `If you want the honest answer on ${topic}: it is not simple, and anyone who tells you otherwise is selling something.`,
      `${topic}. I remember when that word meant something different to me.`,
    ];

    const emotion = this.rng.choice(EMOTIONS);
    const text = this.rng.choice(templates);
    const action: string | undefined = this.rng.next() > 0.5
      ? this.actionBeat(character, 'reflective')
      : undefined;

    return [{ character: character.name, text, emotion, action }];
  }

  /** Generate informal banter between characters. */
  generateBanter(characters: NarrativeCharacter[]): DialogueLine[] {
    if (characters.length < 2) return [];

    const banterPairs: ReadonlyArray<readonly [string, string]> = [
      ['You have done worse.', 'That is not the reassurance you think it is.'],
      ['This was your plan.', 'I said it was a plan. I did not say it was a good one.'],
      ['Are you always like this?', 'Only when things are going poorly. So: yes.'],
      ['Tell me that gets easier.', 'It gets different. That is the best I can offer.'],
      ['You are enjoying this.', 'I am finding silver linings. It is a skill.'],
    ];

    const pair = this.rng.choice(banterPairs);
    const speakerA = characters[0]!;
    const speakerB = characters[1]!;

    return [
      { character: speakerA.name, text: pair[0], emotion: 'neutral' },
      { character: speakerB.name, text: pair[1], emotion: 'neutral' },
    ];
  }

  /** Produce a single line of dialogue for a character given context. */
  lineForCharacter(character: NarrativeCharacter, context: string, emotion: EmotionType): string {
    const roleLines: Record<NarrativeCharacter['role'], readonly string[]> = {
      protagonist: [
        `We cannot stop here — not while ${context} is still unresolved.`,
        `I know what this looks like. I also know what it actually is. Those are not the same thing.`,
        `If there is another way through ${context}, I have not found it yet.`,
        `Then we go forward. Whatever that costs.`,
      ],
      antagonist: [
        `You think your understanding of ${context} protects you. It does not.`,
        `I have already accounted for you. The only question is whether you have accounted for me.`,
        `${context} is not a problem. It is a variable. I control the variables.`,
        `Do not mistake patience for uncertainty.`,
      ],
      supporting: [
        `For what it is worth — and I know that is not much right now — I am still here.`,
        `Someone should probably say something practical about ${context}. That is apparently me.`,
        `I have seen this go wrong before. This is earlier than it usually starts.`,
        `Right. What do you actually need from me?`,
      ],
      mentor: [
        `${context} is not the question you should be asking. The question underneath it is.`,
        `I am not going to tell you what to do. I am going to tell you what I know. Then it is yours.`,
        `Every version of this I have seen — the ones that ended well started the same way.`,
        `You already know the answer. You are waiting for permission. You have it.`,
      ],
      trickster: [
        `What if ${context} is only a problem from one particular angle?`,
        `I am not saying I have done this before. I am also not not saying that.`,
        `There is a third option. Everyone always forgets about the third option.`,
        `Technically, nothing I have said is false. I want that on record.`,
      ],
    };

    const candidates = roleLines[character.role];
    let line = this.rng.choice(candidates);

    // Layer emotion inflection
    if (emotion === 'angry') line = line.replace('?', '.').replace(/\.$/, ' — and I mean that.');
    if (emotion === 'sad') line = `${line} Though I am not sure it matters anymore.`;
    if (emotion === 'happy') line = `${line} And oddly, I am not worried.`;

    return line;
  }

  /** Generate a short stage-direction action beat. */
  actionBeat(character: NarrativeCharacter, mood: string): string {
    const beats: readonly string[] = [
      `${character.name} does not look up.`,
      `${character.name} lets the silence settle before continuing.`,
      `${character.name} moves to the window, back to the room.`,
      `${character.name} checks the door without appearing to.`,
      `${character.name} sets something down carefully.`,
      `Something crosses ${character.name}'s face and is gone.`,
    ];

    void mood; // mood can weight beats in a future version
    return this.rng.choice(beats);
  }
}

// ─────────────────────────────────────────────
// BranchingNarrative
// ─────────────────────────────────────────────

/**
 * Runtime for navigating a NarrativeDocument's choice-based structure.
 * Maintains visit history and current position.
 */
export class BranchingNarrative {
  private readonly document: NarrativeDocument;
  private currentSceneId: string;
  private readonly history: Scene[];

  constructor(document: NarrativeDocument) {
    this.document = document;
    const first = document.scenes[0];
    if (!first) throw new Error('NarrativeDocument must contain at least one scene.');
    this.currentSceneId = first.id;
    this.history = [first];
  }

  /** Return the scene currently being experienced. */
  getCurrentScene(): Scene {
    const scene = this.document.scenes.find((s) => s.id === this.currentSceneId);
    if (!scene) throw new Error(`Scene "${this.currentSceneId}" not found in document.`);
    return scene;
  }

  /** Return available choices for the current scene. */
  getChoices(): StoryChoice[] {
    return this.getCurrentScene().choices ?? [];
  }

  /**
   * Navigate to the scene designated by the chosen option.
   * Returns the new scene, or null if the choice id is invalid.
   */
  makeChoice(choiceId: string): Scene | null {
    const choice = this.getChoices().find((c) => c.id === choiceId);
    if (!choice) return null;

    const nextScene = this.document.scenes.find((s) => s.id === choice.nextSceneId);
    if (!nextScene) return null;

    this.currentSceneId = nextScene.id;
    this.history.push(nextScene);
    return nextScene;
  }

  /** All scenes visited so far, in order. */
  getHistory(): Scene[] {
    return [...this.history];
  }

  /** Reset to the first scene and clear history. */
  reset(): void {
    const first = this.document.scenes[0];
    if (!first) throw new Error('NarrativeDocument must contain at least one scene.');
    this.currentSceneId = first.id;
    this.history.length = 0;
    this.history.push(first);
  }

  /** True when the current scene has no choices (end of branch). */
  isComplete(): boolean {
    return this.getChoices().length === 0;
  }
}

// ─────────────────────────────────────────────
// NarrativeRenderer
// ─────────────────────────────────────────────

/**
 * Renders a NarrativeDocument to four output formats.
 * All methods are pure — no side effects, no mutation.
 */
export class NarrativeRenderer {
  /** Render to Markdown suitable for editors and documentation. */
  toMarkdown(document: NarrativeDocument): string {
    const lines: string[] = [];

    lines.push(`# ${document.title}`, '');
    lines.push(`**Synopsis:** ${document.synopsis}`, '');

    if (document.themes.length > 0) {
      lines.push(`**Themes:** ${document.themes.join(' · ')}`, '');
    }

    lines.push('## World', '', document.worldDescription, '');
    lines.push('## Characters', '');

    for (const char of document.characters) {
      lines.push(`### ${char.name} *(${char.role})*`);
      lines.push(`- **Traits:** ${char.traits.join(', ')}`);
      lines.push(`- **Appearance:** ${char.appearance}`);
      lines.push(`- **Voice:** ${char.voice}`);
      lines.push(`- **Motivation:** ${char.motivation}`, '');
    }

    lines.push('## Scenes', '');

    for (const scene of document.scenes) {
      lines.push(`### ${scene.title}`, '');
      lines.push(`*Mood: ${scene.mood}*${scene.musicCue ? ` | *Music: ${scene.musicCue}*` : ''}`, '');
      lines.push(scene.description, '');

      if (scene.visualDirection) {
        lines.push(`> ${scene.visualDirection}`, '');
      }

      for (const seg of scene.narration) {
        lines.push(`*${seg.text}*`, '');
      }

      for (const line of scene.dialogue) {
        const action = line.action ? ` *(${line.action})*` : '';
        lines.push(`**${line.character}** *(${line.emotion})*:${action} "${line.text}"`, '');
      }

      if (scene.choices && scene.choices.length > 0) {
        lines.push('**Choices:**');
        for (const choice of scene.choices) {
          lines.push(`- [ ] ${choice.text} → *${choice.consequence}*`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /** Render to styled HTML with dark theme. */
  toHTML(document: NarrativeDocument): string {
    const css = `
      body{font-family:Georgia,serif;background:#1a1a2e;color:#e0e0e0;max-width:780px;margin:0 auto;padding:2rem;}
      h1{color:#c9a96e;font-size:2rem;margin-bottom:.25rem;}
      h2{color:#8899aa;font-size:1.3rem;border-bottom:1px solid #334;padding-bottom:.25rem;margin-top:2rem;}
      h3{color:#c9a96e;font-size:1.1rem;margin-top:1.5rem;}
      .synopsis{font-style:italic;color:#aabbcc;margin-bottom:1rem;}
      .themes{color:#778899;font-size:.9rem;margin-bottom:1.5rem;}
      .char-block{background:#252540;border-left:3px solid #c9a96e;padding:.75rem 1rem;margin:.5rem 0;}
      .char-role{color:#778899;font-size:.85rem;}
      .scene-block{border:1px solid #334;border-radius:6px;padding:1rem;margin-top:1.5rem;}
      .scene-meta{color:#778899;font-size:.85rem;margin-bottom:.75rem;}
      .narration{font-style:italic;color:#aabbcc;margin:.5rem 0;}
      .dialogue{margin:.5rem 0;}
      .speaker{color:#c9a96e;font-weight:bold;}
      .emotion{color:#778899;font-size:.8rem;}
      .action{color:#aaaacc;font-style:italic;font-size:.9rem;}
      .choices{margin-top:1rem;padding:.75rem;background:#1e1e3a;border-radius:4px;}
      .choice{display:flex;gap:.5rem;align-items:flex-start;margin:.35rem 0;color:#aabbcc;}
      .consequence{color:#556677;font-size:.85rem;font-style:italic;}
    `;

    const escapeHtml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const charBlocks = document.characters.map((c) => `
      <div class="char-block">
        <strong>${escapeHtml(c.name)}</strong> <span class="char-role">${escapeHtml(c.role)}</span><br/>
        <em>${escapeHtml(c.traits.join(', '))}</em><br/>
        ${escapeHtml(c.appearance)}<br/>
        <span style="color:#667788">${escapeHtml(c.motivation)}</span>
      </div>`).join('');

    const sceneBlocks = document.scenes.map((scene) => {
      const narHtml = scene.narration.map((n) =>
        `<p class="narration">${escapeHtml(n.text)}</p>`).join('');

      const diaHtml = scene.dialogue.map((d) =>
        `<div class="dialogue">
          <span class="speaker">${escapeHtml(d.character)}</span>
          <span class="emotion">(${escapeHtml(d.emotion)})</span>
          ${d.action ? `<span class="action">${escapeHtml(d.action)}</span>` : ''}
          <span>: &ldquo;${escapeHtml(d.text)}&rdquo;</span>
        </div>`).join('');

      const choiceHtml = scene.choices && scene.choices.length > 0
        ? `<div class="choices"><strong>Choices:</strong>${scene.choices.map((ch) =>
            `<div class="choice">&#9658; ${escapeHtml(ch.text)}
              <span class="consequence">&mdash; ${escapeHtml(ch.consequence)}</span>
            </div>`).join('')}</div>`
        : '';

      return `
        <div class="scene-block">
          <h3>${escapeHtml(scene.title)}</h3>
          <div class="scene-meta">Mood: ${escapeHtml(scene.mood)}
            ${scene.musicCue ? ` &bull; Music: ${escapeHtml(scene.musicCue)}` : ''}
            ${scene.visualDirection ? ` &bull; ${escapeHtml(scene.visualDirection)}` : ''}
          </div>
          <p>${escapeHtml(scene.description)}</p>
          ${narHtml}${diaHtml}${choiceHtml}
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(document.title)}</title>
<style>${css}</style>
</head>
<body>
<h1>${escapeHtml(document.title)}</h1>
<p class="synopsis">${escapeHtml(document.synopsis)}</p>
<p class="themes">Themes: ${escapeHtml(document.themes.join(' · '))}</p>
<h2>World</h2><p>${escapeHtml(document.worldDescription)}</p>
<h2>Characters</h2>${charBlocks}
<h2>Scenes</h2>${sceneBlocks}
</body></html>`;
  }

  /** Render to plain text for terminal or plain-text pipelines. */
  toPlainText(document: NarrativeDocument): string {
    const lines: string[] = [];

    lines.push(document.title.toUpperCase(), '='.repeat(document.title.length), '');
    lines.push(document.synopsis, '');
    lines.push(`Themes: ${document.themes.join(', ')}`, '');
    lines.push('WORLD', '-----', document.worldDescription, '');
    lines.push('CHARACTERS', '----------');

    for (const char of document.characters) {
      lines.push(`${char.name} [${char.role}]`);
      lines.push(`  Traits: ${char.traits.join(', ')}`);
      lines.push(`  ${char.appearance}`);
      lines.push(`  ${char.motivation}`, '');
    }

    lines.push('SCENES', '------');

    for (const scene of document.scenes) {
      lines.push(`[${scene.title.toUpperCase()}] — ${scene.mood}`);
      lines.push(scene.description, '');

      for (const seg of scene.narration) {
        lines.push(`  * ${seg.text}`);
      }

      lines.push('');

      for (const d of scene.dialogue) {
        const action = d.action ? ` [${d.action}]` : '';
        lines.push(`  ${d.character} (${d.emotion})${action}: "${d.text}"`);
      }

      if (scene.choices && scene.choices.length > 0) {
        lines.push('', '  Choices:');
        for (const ch of scene.choices) {
          lines.push(`    > ${ch.text}`);
          lines.push(`      => ${ch.consequence}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /** Render to SSML for text-to-speech synthesis. */
  toSSML(document: NarrativeDocument): string {
    const emotionToRate: Record<EmotionType, string> = {
      neutral: 'medium',
      happy: 'fast',
      sad: 'slow',
      angry: 'fast',
      surprised: 'fast',
      thoughtful: 'slow',
      fearful: 'medium',
      determined: 'medium',
    };

    const emotionToPitch: Record<EmotionType, string> = {
      neutral: 'medium',
      happy: 'high',
      sad: 'low',
      angry: 'high',
      surprised: 'high',
      thoughtful: 'low',
      fearful: 'medium',
      determined: 'medium',
    };

    const escXml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const lines: string[] = [];
    lines.push('<speak>');
    lines.push(`  <p><s>${escXml(document.title)}</s></p>`);
    lines.push(`  <break time="1s"/>`);
    lines.push(`  <p>${escXml(document.synopsis)}</p>`);
    lines.push(`  <break time="1s"/>`);

    for (const scene of document.scenes) {
      lines.push(`  <p><emphasis level="strong">${escXml(scene.title)}</emphasis></p>`);
      lines.push(`  <break time="500ms"/>`);

      for (const seg of scene.narration) {
        lines.push(`  <p><prosody rate="slow" pitch="low">${escXml(seg.text)}</prosody></p>`);
      }

      for (const d of scene.dialogue) {
        const emotion = d.emotion as EmotionType;
        const rate = emotionToRate[emotion] ?? 'medium';
        const pitch = emotionToPitch[emotion] ?? 'medium';
        lines.push(
          `  <p><prosody rate="${rate}" pitch="${pitch}">`
          + `<s>${escXml(d.character)}: ${escXml(d.text)}</s>`
          + `</prosody></p>`,
        );
      }

      lines.push(`  <break time="750ms"/>`);
    }

    lines.push('</speak>');
    return lines.join('\n');
  }
}
