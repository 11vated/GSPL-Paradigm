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

  // ─── Digital/Creative domains ───

  code: {
    complexity:      { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    maintainability: { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    test_coverage:   { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    language:        { type: 'categorical', options: ['typescript', 'python', 'rust', 'go', 'java', 'csharp'] },
    paradigm:        { type: 'categorical', options: ['functional', 'oop', 'procedural', 'reactive'] },
    loc_estimate:    { type: 'scalar', min: 10, max: 100000, defaultValue: 500 },
    performance:     { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    security_score:  { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
  },
  shader: {
    complexity:      { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    performance:     { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    visual_quality:  { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    target:          { type: 'categorical', options: ['vertex', 'fragment', 'compute', 'geometry'] },
    api:             { type: 'categorical', options: ['glsl', 'hlsl', 'wgsl', 'metal'] },
    input_count:     { type: 'scalar', min: 1, max: 20, defaultValue: 4 },
    output_count:    { type: 'scalar', min: 1, max: 8, defaultValue: 1 },
  },
  render: {
    resolution:      { type: 'vector', dimensions: 2, defaultValue: [1920, 1080] },
    quality:         { type: 'scalar', min: 0, max: 100, defaultValue: 75 },
    fps_target:      { type: 'scalar', min: 24, max: 144, defaultValue: 60 },
    pipeline:        { type: 'categorical', options: ['forward', 'deferred', 'raytraced'] },
    anti_aliasing:   { type: 'categorical', options: ['none', 'msaa', 'taa', 'fxaa'] },
  },
  'animation-visual': {
    frame_count:     { type: 'scalar', min: 1, max: 1000, defaultValue: 24 },
    fps:             { type: 'scalar', min: 12, max: 60, defaultValue: 24 },
    loop:            { type: 'categorical', options: ['once', 'loop', 'pingpong'] },
    easing:          { type: 'categorical', options: ['linear', 'ease_in', 'ease_out', 'spring'] },
    duration:        { type: 'scalar', min: 0.1, max: 30, defaultValue: 1.0 },
  },
  texture: {
    resolution:      { type: 'scalar', min: 64, max: 8192, defaultValue: 1024 },
    channels:        { type: 'scalar', min: 1, max: 4, defaultValue: 4 },
    format:          { type: 'categorical', options: ['png', 'jpg', 'webp', 'basis'] },
    tiling:          { type: 'categorical', options: ['none', 'repeat', 'mirror'] },
    filtering:       { type: 'categorical', options: ['nearest', 'linear', 'anisotropic'] },
  },
  logo: {
    complexity:      { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    scalability:     { type: 'scalar', min: 0, max: 100, defaultValue: 90 },
    memorability:    { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    style:           { type: 'categorical', options: ['minimal', 'geometric', 'organic', 'typographic'] },
    color_count:     { type: 'scalar', min: 1, max: 6, defaultValue: 2 },
    color:           { type: 'vector', dimensions: 3, defaultValue: [0, 120, 255] },
  },
  brand: {
    recognition:     { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    consistency:     { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    differentiation: { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    tone:            { type: 'categorical', options: ['professional', 'playful', 'bold', 'elegant', 'technical'] },
    target_audience: { type: 'categorical', options: ['consumer', 'enterprise', 'developer', 'creative'] },
  },
  ui: {
    usability:       { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    accessibility:   { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    responsiveness:  { type: 'scalar', min: 0, max: 100, defaultValue: 80 },
    framework:       { type: 'categorical', options: ['react', 'vue', 'svelte', 'native', 'flutter'] },
    style:           { type: 'categorical', options: ['material', 'fluent', 'custom'] },
    color_scheme:    { type: 'vector', dimensions: 3, defaultValue: [33, 150, 243] },
  },
  interaction: {
    latency:         { type: 'scalar', min: 0, max: 1000, defaultValue: 50 },
    feedback_quality: { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    gesture_count:   { type: 'scalar', min: 1, max: 20, defaultValue: 5 },
    modality:        { type: 'categorical', options: ['touch', 'mouse', 'keyboard', 'voice', 'eye'] },
  },
  aesthetic: {
    harmony:         { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    contrast:        { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    rhythm:          { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    style:           { type: 'categorical', options: ['minimalist', 'maximalist', 'brutalist', 'organic', 'geometric'] },
  },
  web: {
    load_time:          { type: 'scalar', min: 0.1, max: 30, defaultValue: 2.0 },
    lighthouse_score:   { type: 'scalar', min: 0, max: 100, defaultValue: 80 },
    accessibility_score: { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    framework:          { type: 'categorical', options: ['nextjs', 'remix', 'astro', 'sveltekit'] },
    bundle_size:        { type: 'scalar', min: 10, max: 10000, defaultValue: 200 },
  },
  compression: {
    ratio:           { type: 'scalar', min: 1, max: 1000, defaultValue: 10 },
    quality_loss:    { type: 'scalar', min: 0, max: 100, defaultValue: 5 },
    speed:           { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    algorithm:       { type: 'categorical', options: ['gzip', 'brotli', 'zstd', 'lz4'] },
  },

  // ─── Narrative/Experiential domains ───

  narrative: {
    tension:         { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    pacing:          { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    coherence:       { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    genre:           { type: 'categorical', options: ['fantasy', 'scifi', 'horror', 'romance', 'mystery', 'thriller'] },
    perspective:     { type: 'categorical', options: ['first', 'second', 'third_limited', 'third_omniscient'] },
    word_count:      { type: 'scalar', min: 100, max: 200000, defaultValue: 5000 },
    character_depth: { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
  },
  cinematic: {
    shot_complexity:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    pacing:             { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    visual_storytelling: { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    aspect_ratio:       { type: 'categorical', options: ['16:9', '21:9', '4:3', '1:1'] },
    color_grade:        { type: 'categorical', options: ['warm', 'cool', 'neutral', 'stylized'] },
  },
  emotion: {
    valence:         { type: 'scalar', min: -1, max: 1, defaultValue: 0 },
    arousal:         { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    dominance:       { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    category:        { type: 'categorical', options: ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'trust', 'anticipation'] },
  },
  perception: {
    visual_acuity:   { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    range:           { type: 'scalar', min: 1, max: 1000, defaultValue: 100 },
    modality:        { type: 'categorical', options: ['visual', 'auditory', 'tactile', 'olfactory'] },
    attention:       { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
  },
  game: {
    fun_factor:      { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    replayability:   { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    difficulty:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    genre:           { type: 'categorical', options: ['rpg', 'fps', 'rts', 'puzzle', 'platformer', 'roguelike', 'simulation'] },
    engine:          { type: 'categorical', options: ['godot', 'unity', 'unreal', 'custom', 'browser'] },
    player_count:    { type: 'scalar', min: 1, max: 1000, defaultValue: 1 },
  },
  simulation: {
    accuracy:        { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    timestep:        { type: 'scalar', min: 0.001, max: 1, defaultValue: 0.016 },
    entity_count:    { type: 'scalar', min: 1, max: 100000, defaultValue: 100 },
    deterministic:   { type: 'categorical', options: ['yes', 'no'] },
    domain:          { type: 'categorical', options: ['physics', 'biology', 'economics', 'social', 'weather'] },
  },

  // ─── Audio/Music domains ───

  sound: {
    frequency:       { type: 'scalar', min: 20, max: 20000, defaultValue: 440 },
    amplitude:       { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    duration:        { type: 'scalar', min: 0.01, max: 300, defaultValue: 1.0 },
    waveform:        { type: 'categorical', options: ['sine', 'square', 'triangle', 'sawtooth', 'noise'] },
    spatial:         { type: 'categorical', options: ['mono', 'stereo', 'surround', 'binaural'] },
  },
  music: {
    tempo:           { type: 'scalar', min: 40, max: 220, defaultValue: 120 },
    key:             { type: 'categorical', options: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
    scale:           { type: 'categorical', options: ['major', 'minor', 'pentatonic', 'blues', 'chromatic'] },
    time_signature:  { type: 'categorical', options: ['4/4', '3/4', '6/8', '5/4'] },
    complexity:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    energy:          { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
  },
  audio: {
    sample_rate:     { type: 'scalar', min: 8000, max: 192000, defaultValue: 44100 },
    bit_depth:       { type: 'scalar', min: 8, max: 32, defaultValue: 16 },
    channels:        { type: 'scalar', min: 1, max: 8, defaultValue: 2 },
    format:          { type: 'categorical', options: ['wav', 'mp3', 'ogg', 'flac', 'opus'] },
    dynamic_range:   { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
  },

  // ─── Scientific/Abstract domains ───

  neural: {
    layers:          { type: 'scalar', min: 1, max: 1000, defaultValue: 6 },
    neurons_per_layer: { type: 'scalar', min: 1, max: 10000, defaultValue: 256 },
    activation:      { type: 'categorical', options: ['relu', 'sigmoid', 'tanh', 'gelu', 'swish'] },
    architecture:    { type: 'categorical', options: ['mlp', 'cnn', 'rnn', 'transformer', 'gan'] },
    learning_rate:   { type: 'scalar', min: 0.0001, max: 1, defaultValue: 0.001 },
  },
  intelligence: {
    reasoning:       { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    creativity:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    memory:          { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    adaptability:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    specialization:  { type: 'categorical', options: ['general', 'analytical', 'creative', 'social', 'strategic'] },
  },
  quantum: {
    qubits:          { type: 'scalar', min: 1, max: 1000, defaultValue: 50 },
    coherence_time:  { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    gate_fidelity:   { type: 'scalar', min: 0, max: 100, defaultValue: 95 },
    algorithm:       { type: 'categorical', options: ['grover', 'shor', 'vqe', 'qaoa'] },
  },
  molecular: {
    atoms:           { type: 'scalar', min: 1, max: 10000, defaultValue: 20 },
    bonds:           { type: 'scalar', min: 0, max: 50000, defaultValue: 25 },
    energy:          { type: 'scalar', min: -1000, max: 1000, defaultValue: 0 },
    symmetry:        { type: 'categorical', options: ['c1', 'c2', 'c3', 'd2', 'd3', 'td', 'oh'] },
    stability:       { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
  },
  pattern: {
    regularity:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    complexity:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    symmetry:        { type: 'categorical', options: ['none', 'rotational', 'reflective', 'translational', 'fractal'] },
    scale:           { type: 'scalar', min: 0.01, max: 1000, defaultValue: 1.0 },
  },
  network: {
    nodes:           { type: 'scalar', min: 1, max: 1000000, defaultValue: 100 },
    edges:           { type: 'scalar', min: 0, max: 10000000, defaultValue: 500 },
    density:         { type: 'scalar', min: 0, max: 1, defaultValue: 0.1 },
    topology:        { type: 'categorical', options: ['mesh', 'star', 'ring', 'tree', 'random', 'scale_free'] },
    latency:         { type: 'scalar', min: 0, max: 10000, defaultValue: 50 },
  },
  language: {
    vocabulary_size:     { type: 'scalar', min: 100, max: 1000000, defaultValue: 50000 },
    grammar_complexity:  { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    ambiguity:           { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    type:                { type: 'categorical', options: ['natural', 'formal', 'programming', 'constructed'] },
  },
  strategy: {
    risk:            { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    reward:          { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    time_horizon:    { type: 'scalar', min: 1, max: 10000, defaultValue: 100 },
    complexity:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    type:            { type: 'categorical', options: ['offensive', 'defensive', 'balanced', 'adaptive'] },
  },

  // ─── Infrastructure/Systems domains ───

  schedule: {
    duration:        { type: 'scalar', min: 0.1, max: 10000, defaultValue: 60 },
    priority:        { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    dependencies:    { type: 'scalar', min: 0, max: 100, defaultValue: 10 },
    type:            { type: 'categorical', options: ['sequential', 'parallel', 'cron', 'event_driven'] },
  },
  rule: {
    strictness:      { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    scope:           { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    enforcement:     { type: 'categorical', options: ['advisory', 'warning', 'blocking', 'fatal'] },
    domain:          { type: 'categorical', options: ['security', 'style', 'performance', 'accessibility'] },
  },
  constraint: {
    weight:          { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    flexibility:     { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    type:            { type: 'categorical', options: ['equality', 'inequality', 'bound', 'logical'] },
    scope:           { type: 'categorical', options: ['local', 'global', 'temporal'] },
  },
  ecosystem: {
    biodiversity:    { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    stability:       { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    energy_flow:     { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    trophic_levels:  { type: 'scalar', min: 1, max: 10, defaultValue: 4 },
    carrying_capacity: { type: 'scalar', min: 1, max: 1000000, defaultValue: 10000 },
  },
  infrastructure: {
    reliability:     { type: 'scalar', min: 0, max: 100, defaultValue: 90 },
    scalability:     { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    cost:            { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    type:            { type: 'categorical', options: ['compute', 'storage', 'network', 'edge'] },
    redundancy:      { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
  },
  product: {
    market_fit:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    usability:       { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    monetization:    { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    stage:           { type: 'categorical', options: ['idea', 'mvp', 'growth', 'mature', 'decline'] },
    target:          { type: 'categorical', options: ['b2b', 'b2c', 'b2b2c', 'internal'] },
  },
  city: {
    population:      { type: 'scalar', min: 100, max: 50000000, defaultValue: 100000 },
    density:         { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    infrastructure:  { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    livability:      { type: 'scalar', min: 0, max: 100, defaultValue: 70 },
    sustainability:  { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
  },

  // ─── Data/Security domains ───

  'security-threat': {
    severity:        { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    likelihood:      { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    impact:          { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    vector:          { type: 'categorical', options: ['network', 'physical', 'social', 'supply_chain'] },
    category:        { type: 'categorical', options: ['malware', 'phishing', 'ddos', 'injection', 'xss'] },
  },
  intrusion: {
    stealth:         { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    persistence:     { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    privilege_level: { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    technique:       { type: 'categorical', options: ['exploit', 'social', 'bruteforce', 'supply_chain'] },
  },
  forensics: {
    evidence_quality:       { type: 'scalar', min: 0, max: 100, defaultValue: 60 },
    timeline_coverage:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    attribution_confidence: { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    type:                   { type: 'categorical', options: ['disk', 'memory', 'network', 'cloud'] },
  },
  'memory-store': {
    capacity:        { type: 'scalar', min: 1, max: 1000000, defaultValue: 1000 },
    latency:         { type: 'scalar', min: 0, max: 1000, defaultValue: 10 },
    durability:      { type: 'scalar', min: 0, max: 100, defaultValue: 90 },
    type:            { type: 'categorical', options: ['volatile', 'persistent', 'distributed', 'hierarchical'] },
  },

  // ─── Physical/Natural domains ───

  particle: {
    mass:            { type: 'scalar', min: 0, max: 1000, defaultValue: 1 },
    charge:          { type: 'scalar', min: -100, max: 100, defaultValue: 0 },
    spin:            { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    lifetime:        { type: 'scalar', min: 0, max: 1000, defaultValue: 100 },
    interaction:     { type: 'categorical', options: ['strong', 'weak', 'electromagnetic', 'gravitational'] },
  },
  fluid: {
    viscosity:       { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
    density:         { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    temperature:     { type: 'scalar', min: -273, max: 10000, defaultValue: 20 },
    flow_rate:       { type: 'scalar', min: 0, max: 100, defaultValue: 40 },
    turbulence:      { type: 'scalar', min: 0, max: 100, defaultValue: 20 },
  },
  crystal: {
    hardness:        { type: 'scalar', min: 0, max: 10, defaultValue: 5 },
    symmetry:        { type: 'categorical', options: ['cubic', 'hexagonal', 'tetragonal', 'orthorhombic', 'monoclinic'] },
    transparency:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    color:           { type: 'vector', dimensions: 3, defaultValue: [200, 200, 255] },
  },
  'seed-intelligence': {
    awareness:       { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    adaptability:    { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    memory:          { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    reasoning:       { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    creativity:      { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
  },
  void: {
    entropy:         { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    stability:       { type: 'scalar', min: 0, max: 100, defaultValue: 50 },
    dimensionality:  { type: 'scalar', min: 1, max: 11, defaultValue: 4 },
    energy_density:  { type: 'scalar', min: 0, max: 100, defaultValue: 30 },
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
