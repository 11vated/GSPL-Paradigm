/**
 * @paradigm/knowledge — Concept Intelligence, Identity Preservation, Gap Detection
 *
 * The semantic brain of GSPL. Provides:
 * 1. Concept Engine — 5-layer semantic model with 12 archetypes
 * 2. Identity Engine — 6-dimensional character DNA with coherence validation
 * 3. Concept Classifier — Intent → structured classification
 * 4. Gap Detection — Self-aware gap analysis with auto-fill
 */

import type { UniversalSeed, Gene, GeneMap, SeedDomain } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ============================================================================
// CONCEPT ENGINE — Layer 1: Archetypal Identity
// ============================================================================

export type ArchetypeName = 'trickster' | 'hero' | 'sage' | 'lover' | 'creator' | 'destroyer' | 'ruler' | 'everyman' | 'rebel' | 'caregiver' | 'explorer' | 'jester';
export type Dynamism = 'adaptive' | 'transformative' | 'chaotic' | 'evolutionary' | 'steady' | 'cyclical';

export interface ArchetypalCore {
  readonly archetype: ArchetypeName;
  readonly psychologicalFunction: string;
  readonly narrativeRoles: readonly string[];
  readonly oppositions: readonly string[];
  readonly dynamism: Dynamism;
  readonly coreMotivation: string;
}

// ============================================================================
// CONCEPT ENGINE — Layer 2: Morphological Structure
// ============================================================================

export type BaseForm = 'humanoid' | 'animal' | 'abstract' | 'hybrid' | 'composite' | 'mechanical' | 'amorphous';
export type Locomotion = 'walk' | 'run' | 'swim' | 'fly' | 'hop' | 'crawl' | 'slither' | 'float' | 'teleport';
export type SizeClass = 'tiny' | 'small' | 'human' | 'large' | 'massive' | 'colossal';
export type Flexibility = 'rigid' | 'moderate' | 'highly_flexible' | 'liquid';

export interface MorphologyModel {
  readonly baseForm: BaseForm;
  readonly specifics: {
    readonly bipedalism: boolean;
    readonly limbs: number;
    readonly primaryLocomotion: Locomotion;
    readonly size: SizeClass;
    readonly flexibility: Flexibility;
  };
  readonly invariants: {
    readonly canEscape: boolean;
    readonly hasHandedness: boolean;
    readonly hasVocalization: boolean;
    readonly hasExpressiveFace: boolean;
  };
  readonly constraints: {
    readonly maxWeight: number;
    readonly minAgility: number;
    readonly requiredFeatures: readonly string[];
  };
}

// ============================================================================
// CONCEPT ENGINE — Layer 3: Behavioral Semantics
// ============================================================================

export interface BehaviorPattern {
  readonly name: string;
  readonly trigger: string;
  readonly action: string;
  readonly consequence: string;
  readonly energyCost: number;
}

export interface BehaviorModelConcept {
  readonly corePatterns: readonly BehaviorPattern[];
  readonly decisionLogic: {
    readonly priorities: readonly string[];
    readonly riskTolerance: number;
    readonly adaptationRate: number;
    readonly responseLatency: number;
  };
  readonly causality: ReadonlyMap<string, string>;
  readonly dynamics: {
    readonly shortTerm: string;
    readonly mediumTerm: string;
    readonly longTerm: string;
  };
}

// ============================================================================
// CONCEPT ENGINE — Layer 4: Style & Aesthetics
// ============================================================================

export type TimingStyle = 'snappy' | 'flowing' | 'staccato' | 'natural' | 'bouncy';
export type SilhouetteStyle = 'bold' | 'delicate' | 'complex' | 'simple' | 'dynamic';

export interface StyleModelConcept {
  readonly principles: {
    readonly exaggeration: number;
    readonly timing: TimingStyle;
    readonly silhouette: SilhouetteStyle;
    readonly contrast: number;
  };
  readonly applications: {
    readonly visual2d: {
      readonly lineWeight: 'variable' | 'consistent' | 'bold';
      readonly colorDensity: number;
      readonly speedLines: boolean;
    };
    readonly visual3d: {
      readonly detailLevel: number;
      readonly surfaceFinish: 'glossy' | 'matte' | 'weathered' | 'organic';
      readonly deformationAmount: number;
    };
    readonly motion: {
      readonly anticipation: number;
      readonly overshoot: number;
      readonly easeProfile: 'sharp' | 'smooth' | 'bouncy';
    };
  };
  readonly consistency: {
    readonly colorPalette: readonly string[];
    readonly materialFamily: 'organic' | 'mechanical' | 'abstract' | 'mixed';
    readonly motionLanguage: 'cartoony' | 'realistic' | 'stylized' | 'minimal';
  };
}

// ============================================================================
// CONCEPT ENGINE — Layer 5: Relational Ontology
// ============================================================================

export interface RelationalModel {
  readonly archetypeRelations: {
    readonly opposing: readonly ArchetypeName[];
    readonly complementary: readonly ArchetypeName[];
    readonly transformsInto: readonly ArchetypeName[];
  };
  readonly morphologyMixins: {
    readonly excellent: readonly BaseForm[];
    readonly acceptable: readonly BaseForm[];
    readonly impossible: readonly BaseForm[];
  };
  readonly behaviorMixins: {
    readonly reinforcing: readonly string[];
    readonly conflicting: readonly string[];
  };
  readonly domainNaturalness: Readonly<Record<string, number>>;
}

// ============================================================================
// CONCEPT ENGINE — Unified Model
// ============================================================================

export interface ConceptModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly archetypalCore: ArchetypalCore;
  readonly morphology: MorphologyModel;
  readonly behavior: BehaviorModelConcept;
  readonly style: StyleModelConcept;
  readonly relations: RelationalModel;
  readonly version: number;
  readonly createdAt: number;
}

export interface ConceptConstraintViolation {
  readonly layer: 'archetype' | 'morphology' | 'behavior' | 'style' | 'relations';
  readonly rule: string;
  readonly severity: 'critical' | 'warning' | 'info';
  readonly message: string;
  readonly fix: string;
}

export interface ConceptValidationResult {
  readonly valid: boolean;
  readonly violations: readonly ConceptConstraintViolation[];
  readonly coherenceScore: number;
}

// ============================================================================
// ARCHETYPE REGISTRY
// ============================================================================

function makeArchetype(
  name: ArchetypeName,
  core: ArchetypalCore,
  defaultMorphology: Partial<MorphologyModel>,
  defaultBehavior: Partial<BehaviorModelConcept>,
  defaultStyle: Partial<StyleModelConcept>,
  relations: RelationalModel,
): ConceptModel {
  return {
    id: `archetype-${name}`,
    name,
    description: core.psychologicalFunction,
    archetypalCore: core,
    morphology: {
      baseForm: 'humanoid',
      specifics: { bipedalism: true, limbs: 4, primaryLocomotion: 'walk', size: 'human', flexibility: 'moderate' },
      invariants: { canEscape: true, hasHandedness: true, hasVocalization: true, hasExpressiveFace: true },
      constraints: { maxWeight: 100, minAgility: 0.3, requiredFeatures: [] },
      ...defaultMorphology,
    } as MorphologyModel,
    behavior: {
      corePatterns: [],
      decisionLogic: { priorities: [], riskTolerance: 0.5, adaptationRate: 0.5, responseLatency: 200 },
      causality: new Map(),
      dynamics: { shortTerm: 'reactive', mediumTerm: 'adaptive', longTerm: 'stable' },
      ...defaultBehavior,
    } as BehaviorModelConcept,
    style: {
      principles: { exaggeration: 0.5, timing: 'natural', silhouette: 'simple', contrast: 0.5 },
      applications: {
        visual2d: { lineWeight: 'consistent', colorDensity: 0.5, speedLines: false },
        visual3d: { detailLevel: 0.5, surfaceFinish: 'matte', deformationAmount: 0.1 },
        motion: { anticipation: 0.3, overshoot: 0.2, easeProfile: 'smooth' },
      },
      consistency: { colorPalette: [], materialFamily: 'organic', motionLanguage: 'realistic' },
      ...defaultStyle,
    } as StyleModelConcept,
    relations,
    version: 1,
    createdAt: 0,
  };
}

const ARCHETYPES = new Map<ArchetypeName, ConceptModel>();

// Full archetypes: trickster, hero, sage, creator, destroyer
ARCHETYPES.set('trickster', makeArchetype('trickster',
  { archetype: 'trickster', psychologicalFunction: 'Adaptive response to power imbalances through cleverness', narrativeRoles: ['subverter', 'challenger', 'transformer', 'liberator'], oppositions: ['order', 'authority', 'predictability', 'hierarchy'], dynamism: 'adaptive', coreMotivation: 'Outsmart, not overpower' },
  { specifics: { bipedalism: true, limbs: 4, primaryLocomotion: 'hop', size: 'small', flexibility: 'highly_flexible' }, invariants: { canEscape: true, hasHandedness: true, hasVocalization: true, hasExpressiveFace: true } },
  { decisionLogic: { priorities: ['escape', 'trick', 'confuse', 'exploit'], riskTolerance: 0.8, adaptationRate: 0.95, responseLatency: 100 }, corePatterns: [{ name: 'dodge', trigger: 'threat', action: 'evasive misdirection', consequence: 'safety + humiliation of threat', energyCost: 0.2 }, { name: 'trick', trigger: 'opportunity', action: 'elaborate ruse', consequence: 'advantage gained', energyCost: 0.3 }] },
  { principles: { exaggeration: 0.8, timing: 'snappy', silhouette: 'dynamic', contrast: 0.7 }, applications: { visual2d: { lineWeight: 'variable', colorDensity: 0.6, speedLines: true }, visual3d: { detailLevel: 0.6, surfaceFinish: 'organic', deformationAmount: 0.4 }, motion: { anticipation: 0.4, overshoot: 0.5, easeProfile: 'bouncy' } }, consistency: { colorPalette: [], materialFamily: 'organic', motionLanguage: 'cartoony' } },
  { archetypeRelations: { opposing: ['ruler', 'sage'], complementary: ['jester', 'rebel'], transformsInto: ['sage', 'creator'] }, morphologyMixins: { excellent: ['animal', 'humanoid'], acceptable: ['hybrid'], impossible: ['mechanical'] }, behaviorMixins: { reinforcing: ['adaptability', 'cunning', 'humor'], conflicting: ['honesty', 'directness', 'obedience'] }, domainNaturalness: { sprite2d: 0.95, model3d: 0.85, animation: 0.95, voice: 0.9, behavior: 0.95, narrative: 0.9 } },
));

ARCHETYPES.set('hero', makeArchetype('hero',
  { archetype: 'hero', psychologicalFunction: 'Proving worth through courageous action and sacrifice', narrativeRoles: ['protector', 'champion', 'leader', 'martyr'], oppositions: ['tyranny', 'injustice', 'cowardice', 'apathy'], dynamism: 'transformative', coreMotivation: 'Protect the weak, defeat the threat' },
  { specifics: { bipedalism: true, limbs: 4, primaryLocomotion: 'run', size: 'human', flexibility: 'moderate' }, constraints: { maxWeight: 120, minAgility: 0.5, requiredFeatures: [] } },
  { decisionLogic: { priorities: ['protect', 'fight', 'sacrifice', 'lead'], riskTolerance: 0.9, adaptationRate: 0.6, responseLatency: 150 }, corePatterns: [{ name: 'charge', trigger: 'ally in danger', action: 'rush to defend', consequence: 'threat confronted', energyCost: 0.4 }] },
  { principles: { exaggeration: 0.4, timing: 'natural', silhouette: 'bold', contrast: 0.8 }, consistency: { colorPalette: [], materialFamily: 'mixed', motionLanguage: 'realistic' } },
  { archetypeRelations: { opposing: ['destroyer', 'trickster'], complementary: ['sage', 'caregiver'], transformsInto: ['ruler', 'sage'] }, morphologyMixins: { excellent: ['humanoid'], acceptable: ['hybrid', 'mechanical'], impossible: ['amorphous'] }, behaviorMixins: { reinforcing: ['courage', 'justice', 'strength'], conflicting: ['cowardice', 'selfishness'] }, domainNaturalness: { sprite2d: 0.9, model3d: 0.95, animation: 0.9, voice: 0.85, behavior: 0.9, narrative: 0.95 } },
));

ARCHETYPES.set('sage', makeArchetype('sage',
  { archetype: 'sage', psychologicalFunction: 'Understanding the world through knowledge and wisdom', narrativeRoles: ['advisor', 'mentor', 'oracle', 'teacher'], oppositions: ['ignorance', 'deception', 'chaos', 'impulsiveness'], dynamism: 'steady', coreMotivation: 'Seek truth, share wisdom' },
  { specifics: { bipedalism: true, limbs: 4, primaryLocomotion: 'walk', size: 'human', flexibility: 'moderate' } },
  { decisionLogic: { priorities: ['observe', 'analyze', 'teach', 'guide'], riskTolerance: 0.3, adaptationRate: 0.4, responseLatency: 500 } },
  { principles: { exaggeration: 0.2, timing: 'flowing', silhouette: 'simple', contrast: 0.3 }, consistency: { colorPalette: [], materialFamily: 'organic', motionLanguage: 'minimal' } },
  { archetypeRelations: { opposing: ['destroyer', 'jester'], complementary: ['hero', 'creator'], transformsInto: ['creator'] }, morphologyMixins: { excellent: ['humanoid'], acceptable: ['abstract'], impossible: [] }, behaviorMixins: { reinforcing: ['patience', 'knowledge', 'foresight'], conflicting: ['impulsiveness', 'recklessness'] }, domainNaturalness: { sprite2d: 0.7, model3d: 0.8, animation: 0.6, voice: 0.95, behavior: 0.85, narrative: 0.95 } },
));

ARCHETYPES.set('creator', makeArchetype('creator',
  { archetype: 'creator', psychologicalFunction: 'Bringing new things into existence through imagination', narrativeRoles: ['inventor', 'artist', 'builder', 'visionary'], oppositions: ['stagnation', 'destruction', 'conformity'], dynamism: 'evolutionary', coreMotivation: 'Build something that outlasts me' },
  {},
  { decisionLogic: { priorities: ['create', 'innovate', 'refine', 'inspire'], riskTolerance: 0.6, adaptationRate: 0.8, responseLatency: 300 } },
  { principles: { exaggeration: 0.5, timing: 'flowing', silhouette: 'complex', contrast: 0.6 } },
  { archetypeRelations: { opposing: ['destroyer'], complementary: ['sage', 'explorer'], transformsInto: ['ruler'] }, morphologyMixins: { excellent: ['humanoid', 'abstract'], acceptable: ['hybrid'], impossible: [] }, behaviorMixins: { reinforcing: ['imagination', 'persistence', 'vision'], conflicting: ['apathy', 'conformity'] }, domainNaturalness: { sprite2d: 0.85, model3d: 0.9, animation: 0.8, voice: 0.75, behavior: 0.8, narrative: 0.9 } },
));

ARCHETYPES.set('destroyer', makeArchetype('destroyer',
  { archetype: 'destroyer', psychologicalFunction: 'Clearing the old to make way for the new', narrativeRoles: ['antagonist', 'catalyst', 'force-of-nature', 'purifier'], oppositions: ['creation', 'preservation', 'stability'], dynamism: 'chaotic', coreMotivation: 'Tear down what no longer serves' },
  { specifics: { bipedalism: true, limbs: 4, primaryLocomotion: 'run', size: 'large', flexibility: 'rigid' } },
  { decisionLogic: { priorities: ['destroy', 'dominate', 'purify', 'consume'], riskTolerance: 0.95, adaptationRate: 0.3, responseLatency: 50 } },
  { principles: { exaggeration: 0.7, timing: 'staccato', silhouette: 'bold', contrast: 0.9 } },
  { archetypeRelations: { opposing: ['creator', 'caregiver'], complementary: ['rebel'], transformsInto: ['creator'] }, morphologyMixins: { excellent: ['humanoid', 'mechanical', 'composite'], acceptable: ['animal'], impossible: ['abstract'] }, behaviorMixins: { reinforcing: ['power', 'ferocity', 'determination'], conflicting: ['mercy', 'patience'] }, domainNaturalness: { sprite2d: 0.9, model3d: 0.95, animation: 0.9, voice: 0.8, behavior: 0.9, narrative: 0.85 } },
));

// Abbreviated archetypes: ruler, rebel, caregiver, explorer, jester, lover, everyman
for (const [name, psych, roles, opp, dyn, mot] of [
  ['ruler', 'Maintaining order through control and responsibility', ['king', 'leader', 'judge'], ['chaos', 'rebellion'], 'steady', 'Create prosperity through order'] as const,
  ['rebel', 'Breaking rules to create change and freedom', ['revolutionary', 'outlaw', 'provocateur'], ['conformity', 'oppression'], 'chaotic', 'Overthrow what isn\'t working'] as const,
  ['caregiver', 'Protecting and nurturing others selflessly', ['healer', 'parent', 'guardian'], ['neglect', 'cruelty'], 'steady', 'Help those who cannot help themselves'] as const,
  ['explorer', 'Discovering new worlds and possibilities', ['pioneer', 'wanderer', 'seeker'], ['confinement', 'boredom'], 'adaptive', 'Find freedom through discovery'] as const,
  ['jester', 'Finding joy and lightness in all situations', ['comedian', 'entertainer', 'fool'], ['seriousness', 'boredom'], 'chaotic', 'Live in the moment with joy'] as const,
  ['lover', 'Connecting deeply with people and experiences', ['romantic', 'sensualist', 'devotee'], ['isolation', 'rejection'], 'transformative', 'Achieve intimacy and connection'] as const,
  ['everyman', 'Belonging and connecting with the common experience', ['citizen', 'neighbor', 'friend'], ['alienation', 'elitism'], 'steady', 'Fit in and find belonging'] as const,
] as const) {
  ARCHETYPES.set(name, makeArchetype(name,
    { archetype: name, psychologicalFunction: psych, narrativeRoles: [...roles], oppositions: [...opp], dynamism: dyn, coreMotivation: mot },
    {}, {}, {},
    { archetypeRelations: { opposing: [], complementary: [], transformsInto: [] }, morphologyMixins: { excellent: ['humanoid'], acceptable: ['animal', 'hybrid'], impossible: [] }, behaviorMixins: { reinforcing: [], conflicting: [] }, domainNaturalness: { sprite2d: 0.8, model3d: 0.8, animation: 0.8, voice: 0.8, behavior: 0.8, narrative: 0.8 } },
  ));
}

export function getArchetype(name: ArchetypeName): ConceptModel | undefined {
  return ARCHETYPES.get(name);
}

export function listArchetypes(): ConceptModel[] {
  return Array.from(ARCHETYPES.values());
}

export function registerArchetype(archetype: ConceptModel): void {
  ARCHETYPES.set(archetype.archetypalCore.archetype, archetype);
}

// ============================================================================
// CONCEPT SYNTHESIS
// ============================================================================

export interface SynthesisResult {
  readonly result: ConceptModel;
  readonly reasoning: string;
  readonly conflicts: readonly ConceptConstraintViolation[];
  readonly resolutions: readonly string[];
}

export function synthesize(concepts: ConceptModel[], intent: string): SynthesisResult {
  if (concepts.length === 0) throw new Error('Cannot synthesize from empty concept list');
  if (concepts.length === 1) return { result: concepts[0]!, reasoning: 'Single concept, no synthesis needed', conflicts: [], resolutions: [] };

  const conflicts: ConceptConstraintViolation[] = [];
  const resolutions: string[] = [];
  const primary = concepts[0]!;
  const others = concepts.slice(1);

  const archetypalCore = primary.archetypalCore;
  for (const other of others) {
    if (other.archetypalCore.archetype !== primary.archetypalCore.archetype) {
      const opposing = primary.relations.archetypeRelations.opposing;
      if (opposing.includes(other.archetypalCore.archetype)) {
        conflicts.push({ layer: 'archetype', rule: 'opposing_archetypes', severity: 'warning', message: `${primary.archetypalCore.archetype} opposes ${other.archetypalCore.archetype}`, fix: 'Primary archetype takes precedence; secondary traits adapted' });
        resolutions.push(`Resolved: ${primary.archetypalCore.archetype} dominates, ${other.archetypalCore.archetype} traits adapted as secondary`);
      }
    }
  }

  // Merge morphology
  const allFeatures = new Set<string>([...primary.morphology.constraints.requiredFeatures]);
  for (const other of others) {
    for (const f of other.morphology.constraints.requiredFeatures) allFeatures.add(f);
    if (other.morphology.baseForm !== primary.morphology.baseForm) {
      conflicts.push({ layer: 'morphology', rule: 'form_mismatch', severity: 'info', message: `Base form ${primary.morphology.baseForm} vs ${other.morphology.baseForm}`, fix: 'Primary form retained' });
      resolutions.push(`Morphology: retained ${primary.morphology.baseForm}, adapted features from ${other.morphology.baseForm}`);
    }
  }
  const morphology: MorphologyModel = { ...primary.morphology, constraints: { ...primary.morphology.constraints, requiredFeatures: Array.from(allFeatures) } };

  // Merge behavior patterns
  const allPatterns = [...primary.behavior.corePatterns];
  for (const other of others) {
    for (const pattern of other.behavior.corePatterns) {
      if (!allPatterns.some(p => p.name === pattern.name)) allPatterns.push(pattern);
    }
  }
  resolutions.push(`Behavior: merged ${allPatterns.length} patterns from ${others.length + 1} concepts`);
  const behavior: BehaviorModelConcept = { ...primary.behavior, corePatterns: allPatterns };

  // Merge style — average numerical principles
  const allPrinciples = [primary, ...others].map(s => s.style.principles);
  const avgExagg = allPrinciples.reduce((s, p) => s + p.exaggeration, 0) / allPrinciples.length;
  const avgContrast = allPrinciples.reduce((s, p) => s + p.contrast, 0) / allPrinciples.length;
  const style: StyleModelConcept = { ...primary.style, principles: { ...primary.style.principles, exaggeration: avgExagg, contrast: avgContrast } };

  // Merge relations — union all
  const allOpposing = new Set([...primary.relations.archetypeRelations.opposing]);
  const allComplementary = new Set([...primary.relations.archetypeRelations.complementary]);
  for (const other of others) {
    for (const o of other.relations.archetypeRelations.opposing) allOpposing.add(o);
    for (const c of other.relations.archetypeRelations.complementary) allComplementary.add(c);
  }
  const relations: RelationalModel = { ...primary.relations, archetypeRelations: { ...primary.relations.archetypeRelations, opposing: Array.from(allOpposing), complementary: Array.from(allComplementary) } };

  const result: ConceptModel = {
    id: `synth-${Date.now()}`,
    name: intent || `${concepts.map(c => c.name).join('+')}`,
    description: `Synthesized from ${concepts.map(c => c.name).join(', ')}: ${intent}`,
    archetypalCore, morphology, behavior, style, relations,
    version: 1, createdAt: 0,
  };

  return { result, reasoning: `Synthesized ${concepts.length} concepts. Primary: ${primary.name}. ${resolutions.length} conflicts resolved.`, conflicts, resolutions };
}

// ============================================================================
// CONCEPT DECOMPOSITION
// ============================================================================

export interface DecompositionNode {
  readonly name: string;
  readonly level: number;
  readonly description: string;
  readonly category: 'structural' | 'behavioral' | 'visual' | 'audio' | 'interactive';
  readonly children: DecompositionNode[];
  readonly constraints: readonly string[];
}

export interface DecompositionResult {
  readonly root: DecompositionNode;
  readonly depth: number;
  readonly totalNodes: number;
}

export function decompose(concept: ConceptModel, targetDepth: number = 3): DecompositionResult {
  const root: DecompositionNode = { name: concept.name, level: 0, description: concept.description, category: 'structural', children: [], constraints: [] };

  const l1Children = generateLevel1(concept);
  (root as { children: DecompositionNode[] }).children = l1Children;

  if (targetDepth > 1) {
    for (const child of l1Children) decomposeRecursive(child, concept, 2, targetDepth);
  }

  return { root, depth: targetDepth, totalNodes: countNodes(root) };
}

function generateLevel1(concept: ConceptModel): DecompositionNode[] {
  const nodes: DecompositionNode[] = [];

  if (concept.morphology.baseForm === 'humanoid' || concept.morphology.baseForm === 'animal') {
    nodes.push(makeDecompNode('Head', 1, 'Cranial structure and face', 'structural', ['proportional to body', 'expressive']));
    nodes.push(makeDecompNode('Torso', 1, 'Core body mass', 'structural', ['supports locomotion']));
    nodes.push(makeDecompNode('Limbs', 1, 'Appendages for interaction', 'structural', [`${concept.morphology.specifics.limbs} total`]));

    for (const feature of concept.morphology.constraints.requiredFeatures) {
      if (!nodes.some(n => n.name.toLowerCase() === feature)) {
        nodes.push(makeDecompNode(capitalize(feature), 1, `Required feature: ${feature}`, 'structural', ['immutable']));
      }
    }
  }

  for (const pattern of concept.behavior.corePatterns) {
    nodes.push(makeDecompNode(`Behavior: ${pattern.name}`, 1, pattern.action, 'behavioral', [pattern.trigger]));
  }

  nodes.push(makeDecompNode('Visual Style', 1, `${concept.style.consistency.motionLanguage} aesthetic`, 'visual',
    [`exaggeration: ${concept.style.principles.exaggeration}`, `timing: ${concept.style.principles.timing}`]));

  if (concept.morphology.invariants.hasVocalization) {
    nodes.push(makeDecompNode('Vocalization', 1, 'Auditory expression system', 'audio', ['personality-matched']));
  }

  return nodes;
}

function decomposeRecursive(node: DecompositionNode, concept: ConceptModel, currentDepth: number, maxDepth: number): void {
  if (currentDepth > maxDepth) return;
  const children = generateSubComponents(node, currentDepth);
  (node as { children: DecompositionNode[] }).children = children;
  for (const child of children) decomposeRecursive(child, concept, currentDepth + 1, maxDepth);
}

function generateSubComponents(node: DecompositionNode, level: number): DecompositionNode[] {
  const nodes: DecompositionNode[] = [];

  if (node.category === 'structural') {
    switch (node.name.toLowerCase()) {
      case 'head':
        nodes.push(makeDecompNode('Skull', level, 'Cranial structure', 'structural', []));
        nodes.push(makeDecompNode('Eyes', level, 'Visual organs and expression', 'visual', ['expressive']));
        nodes.push(makeDecompNode('Mouth', level, 'Oral structure and expression', 'visual', []));
        nodes.push(makeDecompNode('Facial Musculature', level, 'Expression control', 'structural', []));
        break;
      case 'torso':
        nodes.push(makeDecompNode('Spine', level, 'Central support structure', 'structural', []));
        nodes.push(makeDecompNode('Ribcage', level, 'Protective structure', 'structural', []));
        nodes.push(makeDecompNode('Surface', level, 'Exterior covering', 'visual', []));
        break;
      case 'limbs':
        nodes.push(makeDecompNode('Upper Limbs', level, 'Arms/wings/forelimbs', 'structural', []));
        nodes.push(makeDecompNode('Lower Limbs', level, 'Legs/hindlimbs', 'structural', []));
        nodes.push(makeDecompNode('Joints', level, 'Articulation points', 'structural', []));
        break;
      default:
        nodes.push(makeDecompNode(`${node.name} Core`, level, 'Primary structure', 'structural', []));
        nodes.push(makeDecompNode(`${node.name} Surface`, level, 'Exterior presentation', 'visual', []));
        break;
    }
  } else if (node.category === 'behavioral') {
    nodes.push(makeDecompNode(`${node.name} Trigger`, level, 'Activation condition', 'behavioral', []));
    nodes.push(makeDecompNode(`${node.name} Execution`, level, 'Action sequence', 'behavioral', []));
    nodes.push(makeDecompNode(`${node.name} Recovery`, level, 'Post-action state', 'behavioral', []));
  } else if (node.category === 'visual') {
    nodes.push(makeDecompNode(`${node.name} Color`, level, 'Color properties', 'visual', []));
    nodes.push(makeDecompNode(`${node.name} Shape`, level, 'Form properties', 'visual', []));
  } else if (node.category === 'audio') {
    nodes.push(makeDecompNode(`${node.name} Pitch`, level, 'Frequency characteristics', 'audio', []));
    nodes.push(makeDecompNode(`${node.name} Rhythm`, level, 'Temporal pattern', 'audio', []));
  }

  return nodes;
}

function makeDecompNode(name: string, level: number, description: string, category: DecompositionNode['category'], constraints: string[]): DecompositionNode {
  return { name, level, description, category, children: [], constraints };
}

function countNodes(node: DecompositionNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function formatDecomposition(result: DecompositionResult): string {
  const lines: string[] = [`Concept Decomposition: ${result.root.name} (depth: ${result.depth}, nodes: ${result.totalNodes})`, ''];
  formatNode(result.root, '', true, lines);
  return lines.join('\n');
}

function formatNode(node: DecompositionNode, prefix: string, isLast: boolean, lines: string[]): void {
  const connector = isLast ? '└─' : '├─';
  const tag = node.category === 'structural' ? 'S' : node.category === 'behavioral' ? 'B' : node.category === 'visual' ? 'V' : node.category === 'audio' ? 'A' : 'I';
  lines.push(`${prefix}${connector} [${tag}] ${node.name}`);
  const childPrefix = prefix + (isLast ? '   ' : '│  ');
  for (let i = 0; i < node.children.length; i++) formatNode(node.children[i]!, childPrefix, i === node.children.length - 1, lines);
}

// ============================================================================
// DOMAIN MANIFESTATION
// ============================================================================

export type ManifestationDomain = 'sprite2d' | 'model3d' | 'animation' | 'voice' | 'behavior' | 'narrative';

export interface VisualSignature { readonly eyeShape: string; readonly mouthExpression: string; readonly silhouetteType: string; readonly lineWeight: string; readonly primaryGesture: string; }
export interface GeometrySpec { readonly headToBodyRatio: number; readonly limbLengthRatio: number; readonly earLength: number; readonly tailPresence: boolean; readonly overallScale: number; readonly bodyType: 'lean' | 'stocky' | 'average' | 'massive'; }
export interface MotionSpec { readonly primaryGait: string; readonly anticipation: number; readonly overshoot: number; readonly timing: string; readonly energyLevel: number; readonly exaggeration: number; }
export interface VoiceSpec { readonly pitchRange: readonly [number, number]; readonly speed: string; readonly rhythm: string; readonly humorStyle: string; readonly confidence: number; }
export interface BehaviorSpec { readonly priorities: readonly string[]; readonly riskTolerance: number; readonly adaptability: number; readonly responsePatterns: ReadonlyMap<string, string>; }
export interface NarrativeSpec { readonly role: string; readonly arcType: string; readonly emotionalRange: string; readonly storyFunction: string; }

export type ManifestationOutput = VisualSignature | GeometrySpec | MotionSpec | VoiceSpec | BehaviorSpec | NarrativeSpec;

export interface ManifestationResult {
  readonly domain: ManifestationDomain;
  readonly output: ManifestationOutput;
  readonly confidence: number;
  readonly notes: readonly string[];
}

export function manifest(concept: ConceptModel, domain: ManifestationDomain): ManifestationResult {
  const naturalness = concept.relations.domainNaturalness[domain] ?? 0.5;
  const notes: string[] = [];
  if (naturalness < 0.5) notes.push(`Warning: ${concept.name} has low naturalness (${(naturalness * 100).toFixed(0)}%) in ${domain} domain`);

  let output: ManifestationOutput;
  switch (domain) {
    case 'sprite2d': {
      const archetypeVisuals: Record<string, VisualSignature> = {
        trickster: { eyeShape: 'mischievous', mouthExpression: 'grin', silhouetteType: 'asymmetric', lineWeight: 'variable', primaryGesture: 'shrug' },
        hero: { eyeShape: 'determined', mouthExpression: 'firm', silhouetteType: 'broad', lineWeight: 'bold', primaryGesture: 'point forward' },
        sage: { eyeShape: 'wise', mouthExpression: 'neutral', silhouetteType: 'simple', lineWeight: 'thin', primaryGesture: 'stroking chin' },
        destroyer: { eyeShape: 'intense', mouthExpression: 'snarl', silhouetteType: 'angular', lineWeight: 'bold', primaryGesture: 'clench fist' },
        creator: { eyeShape: 'dreamy', mouthExpression: 'slight smile', silhouetteType: 'flowing', lineWeight: 'variable', primaryGesture: 'open hands' },
        jester: { eyeShape: 'wide', mouthExpression: 'laugh', silhouetteType: 'exaggerated', lineWeight: 'variable', primaryGesture: 'theatrical bow' },
      };
      output = archetypeVisuals[concept.archetypalCore.archetype] ?? { eyeShape: 'neutral', mouthExpression: 'neutral', silhouetteType: 'balanced', lineWeight: 'consistent', primaryGesture: 'standing' };
      break;
    }
    case 'model3d': {
      const sizeScale: Record<string, number> = { tiny: 0.3, small: 0.6, human: 1.0, large: 1.5, massive: 2.5, colossal: 5.0 };
      const m = concept.morphology;
      const hasTail = m.constraints.requiredFeatures.some(f => f.includes('tail'));
      const hasEars = m.constraints.requiredFeatures.some(f => f.includes('ear'));
      const bodyType = m.specifics.size === 'large' || m.specifics.size === 'massive' ? 'stocky' as const : m.specifics.flexibility === 'highly_flexible' ? 'lean' as const : 'average' as const;
      output = { headToBodyRatio: m.baseForm === 'animal' ? 0.35 : 0.25, limbLengthRatio: m.specifics.bipedalism ? 0.8 : 0.6, earLength: hasEars ? 2.0 : 0, tailPresence: hasTail, overallScale: sizeScale[m.specifics.size] ?? 1.0, bodyType };
      break;
    }
    case 'animation':
      output = { primaryGait: concept.morphology.specifics.primaryLocomotion, anticipation: concept.style.applications.motion.anticipation, overshoot: concept.style.applications.motion.overshoot, timing: concept.style.principles.timing, energyLevel: concept.behavior.decisionLogic.riskTolerance, exaggeration: concept.style.principles.exaggeration };
      break;
    case 'voice': {
      const speedMap: Record<string, string> = { snappy: 'fast', flowing: 'moderate', staccato: 'varied', natural: 'natural', bouncy: 'varied' };
      output = { pitchRange: concept.morphology.specifics.size === 'small' ? [200, 400] as const : concept.morphology.specifics.size === 'large' ? [80, 200] as const : [120, 300] as const, speed: speedMap[concept.style.principles.timing] ?? 'natural', rhythm: concept.style.principles.timing, humorStyle: concept.archetypalCore.archetype === 'trickster' ? 'timing' : concept.archetypalCore.archetype === 'jester' ? 'physical' : 'none', confidence: concept.behavior.decisionLogic.riskTolerance };
      break;
    }
    case 'behavior': {
      const responsePatterns = new Map<string, string>();
      for (const p of concept.behavior.corePatterns) responsePatterns.set(p.trigger, p.action);
      output = { priorities: concept.behavior.decisionLogic.priorities, riskTolerance: concept.behavior.decisionLogic.riskTolerance, adaptability: concept.behavior.decisionLogic.adaptationRate, responsePatterns };
      break;
    }
    case 'narrative':
      output = { role: concept.archetypalCore.narrativeRoles[0] ?? 'character', arcType: concept.archetypalCore.archetype, emotionalRange: concept.archetypalCore.dynamism === 'chaotic' ? 'wide' : concept.archetypalCore.dynamism === 'steady' ? 'narrow' : 'moderate', storyFunction: concept.archetypalCore.psychologicalFunction };
      break;
    default:
      throw new Error(`Unknown manifestation domain: ${domain}`);
  }

  return { domain, output, confidence: naturalness, notes };
}

export function manifestAll(concept: ConceptModel): Record<ManifestationDomain, ManifestationResult> {
  const domains: ManifestationDomain[] = ['sprite2d', 'model3d', 'animation', 'voice', 'behavior', 'narrative'];
  const results: Record<string, ManifestationResult> = {};
  for (const d of domains) results[d] = manifest(concept, d);
  return results as Record<ManifestationDomain, ManifestationResult>;
}

// ============================================================================
// CONCEPT CLASSIFIER
// ============================================================================

export type ConceptType = 'character' | 'creature' | 'object' | 'environment' | 'system' | 'abstract' | 'phenomenon' | 'interaction';
export type StyleType = 'default' | 'anime' | 'realistic' | 'pixel' | 'cyberpunk' | 'fantasy' | 'minimal' | 'cartoon' | 'noir';
export type RealismLevel = 'stylized' | 'semi_realistic' | 'photorealistic' | 'abstract';
export type ConceptComplexity = 'simple' | 'moderate' | 'complex' | 'extreme';

export interface ConceptClassification {
  readonly type: ConceptType;
  readonly domain: string;
  readonly style: StyleType;
  readonly realismLevel: RealismLevel;
  readonly complexity: ConceptComplexity;
  readonly requiredEngines: readonly string[];
  readonly confidence: number;
  readonly keywords: readonly string[];
}

const TYPE_KEYWORDS: Record<ConceptType, readonly string[]> = {
  character: ['character', 'person', 'hero', 'villain', 'npc', 'warrior', 'mage', 'swordsman', 'knight', 'rogue', 'archer', 'wizard', 'assassin', 'human', 'elf', 'dwarf'],
  creature: ['creature', 'monster', 'beast', 'dragon', 'slime', 'demon', 'animal', 'wolf', 'cat', 'dog', 'bird', 'insect', 'fish', 'bug', 'bunny', 'rabbit'],
  object: ['object', 'weapon', 'sword', 'shield', 'potion', 'item', 'artifact', 'tool', 'armor', 'staff', 'wand', 'bow', 'gun'],
  environment: ['environment', 'world', 'level', 'dungeon', 'forest', 'city', 'castle', 'cave', 'ocean', 'mountain', 'desert', 'space', 'planet', 'room', 'landscape'],
  system: ['system', 'mechanic', 'combat', 'inventory', 'skill', 'crafting', 'dialogue', 'quest', 'trading', 'economy'],
  abstract: ['concept', 'emotion', 'feeling', 'idea', 'pattern', 'algorithm', 'music', 'sound', 'melody'],
  phenomenon: ['weather', 'explosion', 'fire', 'lightning', 'storm', 'earthquake', 'magic', 'spell', 'effect', 'particle'],
  interaction: ['interaction', 'conversation', 'trade', 'battle', 'cooperation', 'competition', 'puzzle'],
};

const STYLE_KEYWORDS: Record<StyleType, readonly string[]> = {
  anime: ['anime', 'manga', 'japanese', 'cel-shaded', 'shonen', 'shoujo'],
  realistic: ['realistic', 'photorealistic', 'lifelike', 'real', 'natural'],
  pixel: ['pixel', 'pixel-art', '8bit', '16bit', 'retro', 'chiptune'],
  cyberpunk: ['cyberpunk', 'neon', 'cyber', 'dystopian', 'tech-noir', 'futuristic'],
  fantasy: ['fantasy', 'medieval', 'magical', 'enchanted', 'mythical', 'fairy'],
  minimal: ['minimal', 'simple', 'clean', 'modern', 'flat'],
  cartoon: ['cartoon', 'toon', 'looney', 'animated', 'comic'],
  noir: ['noir', 'dark', 'gothic', 'shadow', 'gritty'],
  default: [],
};

const COMPLEXITY_KEYWORDS: Record<ConceptComplexity, readonly string[]> = {
  simple: ['simple', 'basic', 'easy', 'quick', 'minimal'],
  moderate: ['moderate', 'standard', 'normal', 'regular'],
  complex: ['complex', 'detailed', 'advanced', 'elaborate', 'intricate'],
  extreme: ['extreme', 'ultimate', 'legendary', 'impossible', 'massive', 'epic'],
};

const ENGINE_MAP: Record<ConceptType, readonly string[]> = {
  character: ['character_engine', 'animation_engine', 'ability_system', 'voice_engine', 'behavior_engine'],
  creature: ['character_engine', 'animation_engine', 'behavior_engine', 'physics_engine'],
  object: ['mesh_engine', 'material_engine', 'physics_engine'],
  environment: ['terrain_engine', 'level_engine', 'lighting_engine', 'atmosphere_engine'],
  system: ['logic_engine', 'balance_engine', 'simulation_engine'],
  abstract: ['generative_engine', 'audio_engine', 'pattern_engine'],
  phenomenon: ['particle_engine', 'physics_engine', 'visual_effects_engine'],
  interaction: ['behavior_engine', 'dialogue_engine', 'narrative_engine'],
};

export function classifyIntent(intent: string): ConceptClassification {
  const lower = intent.toLowerCase();
  const words = lower.split(/\s+/);

  const type = detectConceptType(lower);
  const style = detectStyleType(lower);
  const complexity = detectComplexityLevel(lower, words);
  const realismLevel = detectRealismLevel(style, lower);
  const engines = ENGINE_MAP[type] ?? ['generative_engine'];

  const allEngines = [...engines];
  if (style === 'anime') allEngines.push('anime_style_engine');
  if (style === 'pixel') allEngines.push('pixel_art_engine');
  if (lower.includes('lightning') || lower.includes('fire') || lower.includes('magic')) allEngines.push('visual_effects_engine');

  const matchCount = Object.values(TYPE_KEYWORDS).flat().filter(k => lower.includes(k)).length;
  const confidence = Math.min(1, 0.3 + matchCount * 0.15);

  return { type, domain: `${type}_design`, style, realismLevel, complexity, requiredEngines: [...new Set(allEngines)], confidence, keywords: words.filter(w => w.length > 3) };
}

function detectConceptType(lower: string): ConceptType {
  let bestType: ConceptType = 'abstract';
  let bestScore = 0;
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS) as Array<[ConceptType, readonly string[]]>) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; bestType = type; }
  }
  return bestType;
}

function detectStyleType(lower: string): StyleType {
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS) as Array<[StyleType, readonly string[]]>) {
    if (keywords.some(k => lower.includes(k))) return style;
  }
  return 'default';
}

function detectComplexityLevel(lower: string, words: string[]): ConceptComplexity {
  for (const [level, keywords] of Object.entries(COMPLEXITY_KEYWORDS) as Array<[ConceptComplexity, readonly string[]]>) {
    if (keywords.some(k => lower.includes(k))) return level;
  }
  if (words.length > 10) return 'complex';
  if (words.length > 5) return 'moderate';
  return 'simple';
}

function detectRealismLevel(style: StyleType, lower: string): RealismLevel {
  if (style === 'realistic') return 'photorealistic';
  if (style === 'pixel' || style === 'cartoon' || style === 'anime') return 'stylized';
  if (lower.includes('abstract')) return 'abstract';
  return 'semi_realistic';
}

// ============================================================================
// GAP DETECTION
// ============================================================================

export type GapType =
  | 'missing_ability' | 'missing_animation' | 'missing_voice' | 'missing_detail'
  | 'missing_behavior' | 'missing_consistency' | 'missing_visual' | 'missing_physics'
  | 'missing_structure' | 'missing_relationship';

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface DetectedGap {
  readonly id: string;
  readonly type: GapType;
  readonly domain: string;
  readonly severity: GapSeverity;
  readonly description: string;
  readonly priority: number;
  readonly fixGene?: string;
  readonly fixValue?: Gene;
}

export interface GapReport {
  readonly gaps: readonly DetectedGap[];
  readonly totalGaps: number;
  readonly criticalCount: number;
  readonly highCount: number;
  readonly topPriority: DetectedGap | null;
}

export interface GapFillResult {
  readonly seed: UniversalSeed;
  readonly filled: readonly string[];
  readonly remaining: readonly string[];
}

function hasGeneType(seed: UniversalSeed, ...types: string[]): boolean {
  return Object.keys(seed.genes).some(name => types.some(t => name.toLowerCase().includes(t)));
}

function geneCount(seed: UniversalSeed): number {
  return Object.keys(seed.genes).length;
}

function detectMissingBehavior(seed: UniversalSeed): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  if (seed.$domain !== 'organism' && seed.$domain !== 'game') return gaps;

  const hasRole = Object.values(seed.genes).some(g => g.type === 'categorical');
  if (!hasRole) {
    gaps.push({ id: 'gap_behavior_role', type: 'missing_behavior', domain: 'behavior', severity: 'high', description: 'No role/class categorical gene for behavioral archetype', priority: 8, fixGene: 'role', fixValue: { type: 'categorical', value: 'balanced', options: ['predator', 'prey', 'balanced', 'support'] } });
  }
  if (!hasGeneType(seed, 'aggression', 'strategy', 'intelligence', 'cunning')) {
    gaps.push({ id: 'gap_behavior_intelligence', type: 'missing_behavior', domain: 'behavior', severity: 'medium', description: 'No intelligence/strategy gene for decision-making', priority: 6, fixGene: 'intelligence', fixValue: { type: 'scalar', value: 5, min: 0, max: 15 } });
  }
  return gaps;
}

function detectMissingVisual(seed: UniversalSeed): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  if (!hasGeneType(seed, 'color', 'hue', 'palette', 'material', 'texture')) {
    gaps.push({ id: 'gap_visual_color', type: 'missing_visual', domain: 'visual', severity: 'medium', description: 'No color/material genes for visual output', priority: 5, fixGene: 'color_hue', fixValue: { type: 'scalar', value: 180, min: 0, max: 360 } });
  }
  if (!hasGeneType(seed, 'size', 'scale', 'height', 'width')) {
    gaps.push({ id: 'gap_visual_size', type: 'missing_visual', domain: 'visual', severity: 'low', description: 'No size/scale gene for proportions', priority: 4, fixGene: 'size', fixValue: { type: 'scalar', value: 1.0, min: 0.1, max: 5.0 } });
  }
  return gaps;
}

function detectMissingVoice(seed: UniversalSeed): DetectedGap[] {
  if ((seed.$domain !== 'organism' && seed.$domain !== 'narrative') || hasGeneType(seed, 'frequency', 'pitch', 'voice', 'audio', 'amplitude', 'waveform')) return [];
  return [{ id: 'gap_voice', type: 'missing_voice', domain: 'audio', severity: 'medium', description: 'Character has no voice/audio genes', priority: 5, fixGene: 'voice_pitch', fixValue: { type: 'scalar', value: 200, min: 80, max: 400 } }];
}

function detectMissingAnimation(seed: UniversalSeed): DetectedGap[] {
  if ((seed.$domain !== 'organism' && seed.$domain !== 'game') || hasGeneType(seed, 'speed', 'agility', 'movement', 'locomotion')) return [];
  return [{ id: 'gap_animation_movement', type: 'missing_animation', domain: 'animation', severity: 'high', description: 'No movement/speed genes for animation generation', priority: 7, fixGene: 'speed', fixValue: { type: 'scalar', value: 5, min: 0, max: 30 } }];
}

function detectMissingPhysics(seed: UniversalSeed): DetectedGap[] {
  if (hasGeneType(seed, 'mass', 'weight', 'density', 'friction')) return [];
  if (seed.$domain === 'organism' || seed.$domain === 'vehicle' || seed.$domain === 'weapon') {
    return [{ id: 'gap_physics_mass', type: 'missing_physics', domain: 'physics', severity: 'low', description: 'No mass/weight gene for physics simulation', priority: 3 }];
  }
  return [];
}

function detectStructureGaps(seed: UniversalSeed): DetectedGap[] {
  if (geneCount(seed) >= 3) return [];
  return [{ id: 'gap_structure_sparse', type: 'missing_structure', domain: 'structure', severity: 'critical', description: `Seed has only ${geneCount(seed)} genes — insufficient for meaningful generation`, priority: 10 }];
}

export function detectGaps(seed: UniversalSeed): GapReport {
  const allGaps: DetectedGap[] = [
    ...detectMissingBehavior(seed),
    ...detectMissingVisual(seed),
    ...detectMissingVoice(seed),
    ...detectMissingAnimation(seed),
    ...detectMissingPhysics(seed),
    ...detectStructureGaps(seed),
  ];

  const sorted = allGaps.sort((a, b) => b.priority - a.priority);
  return {
    gaps: sorted,
    totalGaps: sorted.length,
    criticalCount: sorted.filter(g => g.severity === 'critical').length,
    highCount: sorted.filter(g => g.severity === 'high').length,
    topPriority: sorted[0] ?? null,
  };
}

export function fillGap(seed: UniversalSeed, gap: DetectedGap): UniversalSeed {
  if (!gap.fixGene || !gap.fixValue) return seed;
  const genes = { ...seed.genes };
  if (!genes[gap.fixGene]) genes[gap.fixGene] = gap.fixValue;
  return { ...seed, genes } as UniversalSeed;
}

export function fillAllGaps(seed: UniversalSeed): GapFillResult {
  let current = seed;
  const filled: string[] = [];
  const report = detectGaps(current);

  for (const gap of report.gaps) {
    if (gap.fixGene && gap.fixValue) {
      current = fillGap(current, gap);
      filled.push(gap.id);
    }
  }

  const afterReport = detectGaps(current);
  return { seed: current, filled, remaining: afterReport.gaps.map(g => g.id) };
}

// ============================================================================
// IDENTITY ENGINE — Character DNA
// ============================================================================

export interface PersonalityVector {
  readonly openness: number;
  readonly conscientiousness: number;
  readonly extraversion: number;
  readonly agreeableness: number;
  readonly neuroticism: number;
  readonly wit: number;
  readonly cunning: number;
  readonly courage: number;
  readonly loyalty: number;
  readonly adaptability: number;
}

export interface VisualDNA {
  readonly silhouetteSignature: { readonly headToBodyRatio: number; readonly limbLengthRatio: number; readonly asymmetries: readonly string[]; };
  readonly colorSignature: { readonly primaryColor: string; readonly secondaryColors: readonly string[]; readonly colorMeaning: Readonly<Record<string, string>>; };
  readonly expressionSignature: { readonly eyeShape: string; readonly mouthDefault: string; readonly facialAsymmetry: number; };
  readonly motionStyle: { readonly exaggerationLevel: number; readonly anticipationAmount: number; readonly overshootAmount: number; readonly easingProfile: 'snappy' | 'smooth' | 'bouncy'; };
  readonly immutableFeatures: readonly string[];
}

export interface VoiceDNA {
  readonly prosody: { readonly pitchRange: readonly [number, number]; readonly speedRange: readonly [number, number]; readonly rhythmPattern: string; };
  readonly linguistics: { readonly vocabularyLevel: string; readonly dialectMarkers: readonly string[]; readonly speechPatterns: readonly string[]; readonly humorStyle: string; };
  readonly personality: { readonly formality: number; readonly confidenceLevel: number; readonly chattiness: number; readonly wittiness: number; };
}

export interface MotionDNA {
  readonly locomotion: { readonly primaryGait: string; readonly timing: { readonly anticipation: number; readonly hold: number; readonly ease: number; }; readonly characteristic: string; };
  readonly gestures: { readonly common: ReadonlyArray<{ readonly name: string; readonly meaning: string; readonly timing: number; readonly exaggeration: number; }>; };
  readonly reactions: { readonly toThreat: string; readonly toOpportunity: string; readonly toDefeat: string; };
  readonly energyLevel: number;
}

export interface BehaviorDNA {
  readonly decisionPatterns: { readonly priorities: readonly string[]; readonly riskTolerance: number; readonly adaptationRate: number; };
  readonly responseTemplates: ReadonlyArray<{ readonly stimulus: string; readonly characteristicResponse: string; readonly invariantBehavior: readonly string[]; }>;
  readonly relationships: { readonly toAuthority: string; readonly toAlly: string; readonly toEnemy: string; };
}

export interface DialogueDNA {
  readonly catchphrases: readonly string[];
  readonly sentenceStructure: { readonly averageLength: number; readonly subordinateClauseFrequency: number; readonly interrogativeFrequency: number; };
  readonly topics: readonly string[];
  readonly humor: { readonly primaryStyle: string; readonly targetFrequency: number; readonly comedyTiming: number; };
  readonly emotionalExpression: { readonly canShowVulnerability: boolean; readonly emotionalReserve: number; readonly dramatics: number; };
}

export interface IdentityCore {
  readonly characterId: string;
  readonly name: string;
  readonly sourceIP: string;
  readonly archetype: string;
  readonly personality: PersonalityVector;
  readonly visual: VisualDNA;
  readonly voice: VoiceDNA;
  readonly motion: MotionDNA;
  readonly behavior: BehaviorDNA;
  readonly dialogue: DialogueDNA;
  readonly invariants: { readonly rules: readonly string[]; readonly visualFeatures: readonly string[]; readonly behavioral: readonly string[]; readonly emotional: readonly string[]; };
  readonly constraints: { readonly forbidden: readonly string[]; readonly required: readonly string[]; readonly preferential: readonly string[]; };
  readonly version: number;
  readonly source: 'builtin' | 'ingested' | 'synthesized';
}

export interface CharacterFingerprint {
  readonly identityHash: string;
  readonly visualHash: string;
  readonly voiceHash: string;
  readonly behaviorHash: string;
}

export function computeFingerprint(identity: IdentityCore): CharacterFingerprint {
  const hash = (s: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return {
    identityHash: hash(JSON.stringify(identity.personality) + identity.archetype),
    visualHash: hash(JSON.stringify(identity.visual)),
    voiceHash: hash(JSON.stringify(identity.voice)),
    behaviorHash: hash(JSON.stringify(identity.behavior)),
  };
}

// ============================================================================
// IDENTITY INGESTOR
// ============================================================================

export interface CharacterSourceData {
  readonly name: string;
  readonly sourceIP: string;
  readonly traits: readonly string[];
  readonly proportions?: { readonly headToBodyRatio: number; readonly limbLengthRatio: number };
  readonly asymmetries?: readonly string[];
  readonly colors?: readonly string[];
  readonly facialAsymmetry?: number;
  readonly exaggeration?: number;
  readonly anticipation?: number;
  readonly overshoot?: number;
  readonly easingProfile?: 'snappy' | 'smooth' | 'bouncy';
  readonly immutableFeatures?: readonly string[];
  readonly voice?: { readonly pitchRange: readonly [number, number]; readonly speedRange: readonly [number, number]; readonly rhythmPattern: string; readonly vocabulary: string; readonly dialect: readonly string[]; readonly patterns: readonly string[]; readonly humorStyle: string; readonly formality: number; readonly confidence: number; readonly chattiness: number; readonly wittiness: number; };
  readonly movement?: { readonly gait: string; readonly anticipation: number; readonly hold: number; readonly ease: number; readonly characteristic: string; readonly gestures: ReadonlyArray<{ readonly name: string; readonly meaning: string; readonly timing: number; readonly exaggeration: number }>; readonly energyLevel: number; };
  readonly reactions?: { readonly toThreat: string; readonly toOpportunity: string; readonly toDefeat: string; };
  readonly behavior?: { readonly priorities: readonly string[]; readonly riskTolerance: number; readonly adaptationRate: number; readonly responses: ReadonlyArray<{ readonly stimulus: string; readonly characteristicResponse: string; readonly invariantBehavior: readonly string[] }>; readonly toAuthority: string; readonly toAlly: string; readonly toEnemy: string; };
  readonly dialogue?: { readonly catchphrases: readonly string[]; readonly sentenceLength: number; readonly subordinateFrequency: number; readonly questionFrequency: number; readonly topics: readonly string[]; readonly humorStyle: string; readonly jokeFrequency: number; readonly comedyTiming: number; readonly vulnerability: boolean; readonly emotionalReserve: number; readonly dramatics: number; };
  readonly invariants?: { readonly rules: readonly string[]; readonly visualFeatures: readonly string[]; readonly behavioral: readonly string[]; readonly emotional: readonly string[]; };
  readonly constraints?: { readonly forbidden: readonly string[]; readonly required: readonly string[]; readonly preferential: readonly string[]; };
}

export class IdentityIngestor {
  ingest(data: CharacterSourceData): IdentityCore {
    const archetype = this.extractArchetype(data.traits);
    const personality = this.encodePersonality(data.traits);
    const visual = this.extractVisualDNA(data);
    const voice = this.extractVoiceDNA(data);
    const motion = this.extractMotionDNA(data);
    const behaviorDna = this.extractBehaviorDNA(data);
    const dialogue = this.extractDialogueDNA(data);
    const invariants = data.invariants ?? { rules: [], visualFeatures: [], behavioral: [], emotional: [] };
    const constraints = data.constraints ?? { forbidden: [], required: [], preferential: [] };

    const partial: IdentityCore = {
      characterId: `char-${data.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: data.name, sourceIP: data.sourceIP, archetype, personality, visual, voice, motion,
      behavior: behaviorDna, dialogue, invariants, constraints, version: 1, source: 'ingested',
    };
    const fp = computeFingerprint(partial);

    return { ...partial, characterId: `${partial.characterId}-${fp.identityHash.substring(0, 6)}` };
  }

  private extractArchetype(traits: readonly string[]): string {
    if (traits.includes('clever') && traits.includes('irreverent')) return 'trickster';
    if (traits.includes('courageous') && traits.includes('just')) return 'hero';
    if (traits.includes('wise') && traits.includes('patient')) return 'sage';
    if (traits.includes('passionate') && traits.includes('emotional')) return 'lover';
    if (traits.includes('creative') && traits.includes('visionary')) return 'creator';
    if (traits.includes('powerful') && traits.includes('destructive')) return 'destroyer';
    if (traits.includes('authoritative') && traits.includes('responsible')) return 'ruler';
    if (traits.includes('rebellious')) return 'rebel';
    if (traits.includes('nurturing')) return 'caregiver';
    if (traits.includes('curious') && traits.includes('adventurous')) return 'explorer';
    if (traits.includes('funny') && traits.includes('playful')) return 'jester';
    return 'everyman';
  }

  private encodePersonality(traits: readonly string[]): PersonalityVector {
    const has = (t: string) => traits.includes(t);
    return {
      openness: has('creative') || has('curious') ? 0.8 : 0.5,
      conscientiousness: has('organized') || has('disciplined') ? 0.7 : 0.4,
      extraversion: has('social') || has('outgoing') ? 0.8 : has('introverted') ? 0.2 : 0.5,
      agreeableness: has('cooperative') || has('kind') ? 0.7 : has('confrontational') ? 0.2 : 0.4,
      neuroticism: has('anxious') || has('emotional') ? 0.7 : has('calm') ? 0.2 : 0.3,
      wit: has('funny') || has('witty') ? 0.9 : 0.4,
      cunning: has('clever') || has('strategic') ? 0.8 : 0.3,
      courage: has('brave') || has('courageous') ? 0.8 : 0.5,
      loyalty: has('loyal') || has('devoted') ? 0.8 : 0.4,
      adaptability: has('adaptive') || has('adaptable') || has('flexible') ? 0.9 : 0.5,
    };
  }

  private extractVisualDNA(data: CharacterSourceData): VisualDNA {
    return {
      silhouetteSignature: { headToBodyRatio: data.proportions?.headToBodyRatio ?? 0.3, limbLengthRatio: data.proportions?.limbLengthRatio ?? 0.8, asymmetries: data.asymmetries ?? [] },
      colorSignature: { primaryColor: data.colors?.[0] ?? '#000000', secondaryColors: data.colors?.slice(1) ?? [], colorMeaning: {} },
      expressionSignature: { eyeShape: 'neutral', mouthDefault: 'neutral', facialAsymmetry: data.facialAsymmetry ?? 0.1 },
      motionStyle: { exaggerationLevel: data.exaggeration ?? 0.5, anticipationAmount: data.anticipation ?? 0.3, overshootAmount: data.overshoot ?? 0.2, easingProfile: data.easingProfile ?? 'smooth' },
      immutableFeatures: data.immutableFeatures ?? [],
    };
  }

  private extractVoiceDNA(data: CharacterSourceData): VoiceDNA {
    return {
      prosody: { pitchRange: data.voice?.pitchRange ?? [100, 300], speedRange: data.voice?.speedRange ?? [120, 180], rhythmPattern: data.voice?.rhythmPattern ?? 'natural' },
      linguistics: { vocabularyLevel: data.voice?.vocabulary ?? 'simple', dialectMarkers: data.voice?.dialect ?? [], speechPatterns: data.voice?.patterns ?? [], humorStyle: data.voice?.humorStyle ?? 'none' },
      personality: { formality: data.voice?.formality ?? 0.5, confidenceLevel: data.voice?.confidence ?? 0.5, chattiness: data.voice?.chattiness ?? 0.5, wittiness: data.voice?.wittiness ?? 0.5 },
    };
  }

  private extractMotionDNA(data: CharacterSourceData): MotionDNA {
    return {
      locomotion: { primaryGait: data.movement?.gait ?? 'walk', timing: { anticipation: data.movement?.anticipation ?? 0.3, hold: data.movement?.hold ?? 0.1, ease: data.movement?.ease ?? 0.3 }, characteristic: data.movement?.characteristic ?? 'standard' },
      gestures: { common: data.movement?.gestures ?? [] },
      reactions: { toThreat: data.reactions?.toThreat ?? 'defend', toOpportunity: data.reactions?.toOpportunity ?? 'assess', toDefeat: data.reactions?.toDefeat ?? 'recover' },
      energyLevel: data.movement?.energyLevel ?? 0.5,
    };
  }

  private extractBehaviorDNA(data: CharacterSourceData): BehaviorDNA {
    return {
      decisionPatterns: { priorities: data.behavior?.priorities ?? [], riskTolerance: data.behavior?.riskTolerance ?? 0.5, adaptationRate: data.behavior?.adaptationRate ?? 0.5 },
      responseTemplates: data.behavior?.responses ?? [],
      relationships: { toAuthority: data.behavior?.toAuthority ?? 'respectful', toAlly: data.behavior?.toAlly ?? 'loyal', toEnemy: data.behavior?.toEnemy ?? 'tactical' },
    };
  }

  private extractDialogueDNA(data: CharacterSourceData): DialogueDNA {
    return {
      catchphrases: data.dialogue?.catchphrases ?? [],
      sentenceStructure: { averageLength: data.dialogue?.sentenceLength ?? 12, subordinateClauseFrequency: data.dialogue?.subordinateFrequency ?? 0.3, interrogativeFrequency: data.dialogue?.questionFrequency ?? 0.2 },
      topics: data.dialogue?.topics ?? [],
      humor: { primaryStyle: data.dialogue?.humorStyle ?? 'none', targetFrequency: data.dialogue?.jokeFrequency ?? 0.2, comedyTiming: data.dialogue?.comedyTiming ?? 0.5 },
      emotionalExpression: { canShowVulnerability: data.dialogue?.vulnerability ?? true, emotionalReserve: data.dialogue?.emotionalReserve ?? 0.5, dramatics: data.dialogue?.dramatics ?? 0.3 },
    };
  }
}

// ============================================================================
// COHERENCE VALIDATOR
// ============================================================================

export interface CoherenceCheckResult {
  readonly coherent: boolean;
  readonly visualMatch: number;
  readonly voiceMatch: number;
  readonly behaviorMatch: number;
  readonly personalityMatch: number;
  readonly overallCoherence: number;
  readonly violations: readonly CoherenceViolation[];
  readonly suggestions: readonly string[];
}

export interface CoherenceViolation {
  readonly domain: 'visual' | 'voice' | 'behavior' | 'personality' | 'dialogue';
  readonly severity: 'critical' | 'warning' | 'info';
  readonly message: string;
  readonly fix: string;
}

export interface TransformedOutput {
  readonly visualFeatures?: readonly string[];
  readonly headToBodyRatio?: number;
  readonly primaryColor?: string;
  readonly dialogue?: readonly string[];
  readonly speechPattern?: string;
  readonly comedyTiming?: number;
  readonly decisionPriorities?: readonly string[];
  readonly responses?: Readonly<Record<string, string>>;
  readonly exhibitsBehavior?: readonly string[];
  readonly personality?: Partial<Record<string, number>>;
}

export class CoherenceValidator {
  validate(output: TransformedOutput, identity: IdentityCore): CoherenceCheckResult {
    const violations: CoherenceViolation[] = [];
    const visualMatch = this.validateVisual(output, identity, violations);
    const voiceMatch = this.validateVoice(output, identity, violations);
    const behaviorMatch = this.validateBehavior(output, identity, violations);
    const personalityMatch = this.validatePersonality(output, identity, violations);
    const overallCoherence = (visualMatch + voiceMatch + behaviorMatch + personalityMatch) / 4;
    const coherent = violations.filter(v => v.severity === 'critical').length === 0 && overallCoherence >= 0.6;
    return { coherent, visualMatch, voiceMatch, behaviorMatch, personalityMatch, overallCoherence, violations, suggestions: violations.map(v => v.fix) };
  }

  private validateVisual(output: TransformedOutput, identity: IdentityCore, violations: CoherenceViolation[]): number {
    let score = 1.0;
    for (const feature of identity.visual.immutableFeatures) {
      if (output.visualFeatures && !output.visualFeatures.includes(feature)) {
        score -= 0.15;
        violations.push({ domain: 'visual', severity: 'warning', message: `Missing immutable feature: ${feature}`, fix: `Restore visual feature: ${feature}` });
      }
    }
    if (output.headToBodyRatio !== undefined && Math.abs(output.headToBodyRatio - identity.visual.silhouetteSignature.headToBodyRatio) > 0.2) {
      score -= 0.1;
      violations.push({ domain: 'visual', severity: 'info', message: 'Head-to-body ratio diverged from canonical proportions', fix: 'Adjust proportions to match character silhouette' });
    }
    if (output.primaryColor && output.primaryColor !== identity.visual.colorSignature.primaryColor) score -= 0.1;
    return Math.max(0, Math.min(1, score));
  }

  private validateVoice(output: TransformedOutput, identity: IdentityCore, violations: CoherenceViolation[]): number {
    let score = 1.0;
    if (output.dialogue && identity.dialogue.catchphrases.length > 0) {
      const catchphraseFound = output.dialogue.some(line => identity.dialogue.catchphrases.some(cp => line.includes(cp)));
      if (!catchphraseFound) {
        score -= 0.2;
        violations.push({ domain: 'voice', severity: 'warning', message: 'No catchphrases found in dialogue', fix: `Include at least one catchphrase: ${identity.dialogue.catchphrases[0]}` });
      }
    }
    if (output.comedyTiming !== undefined && Math.abs(output.comedyTiming - identity.dialogue.humor.comedyTiming) > 0.3) score -= 0.15;
    return Math.max(0, Math.min(1, score));
  }

  private validateBehavior(output: TransformedOutput, identity: IdentityCore, violations: CoherenceViolation[]): number {
    let score = 1.0;
    if (output.decisionPriorities) {
      for (const priority of identity.behavior.decisionPatterns.priorities) {
        if (!output.decisionPriorities.includes(priority)) score -= 0.1;
      }
    }
    if (output.exhibitsBehavior) {
      for (const forbidden of identity.constraints.forbidden) {
        if (output.exhibitsBehavior.includes(forbidden)) {
          score -= 0.3;
          violations.push({ domain: 'behavior', severity: 'critical', message: `Forbidden behavior exhibited: ${forbidden}`, fix: `Remove ${forbidden} behavior — violates character constraints` });
        }
      }
    }
    return Math.max(0, Math.min(1, score));
  }

  private validatePersonality(output: TransformedOutput, identity: IdentityCore, violations: CoherenceViolation[]): number {
    if (!output.personality) return 0.8;
    let score = 1.0;
    const traits: Array<keyof PersonalityVector> = ['wit', 'cunning', 'courage', 'loyalty', 'adaptability'];
    for (const trait of traits) {
      const identityValue = identity.personality[trait];
      const outputValue = output.personality[trait];
      if (outputValue !== undefined && Math.abs(outputValue - identityValue) > 0.4) {
        score -= 0.1;
        violations.push({ domain: 'personality', severity: 'warning', message: `Personality trait ${trait} diverged: ${identityValue.toFixed(1)} → ${outputValue.toFixed(1)}`, fix: `Restore ${trait} toward ${identityValue.toFixed(1)}` });
      }
    }
    return Math.max(0, Math.min(1, score));
  }
}

// ============================================================================
// IDENTITY-AWARE MUTATOR
// ============================================================================

export interface ExpressionLayer {
  readonly environment: string;
  readonly outfit: string;
  readonly role: string;
  readonly abilities: readonly string[];
  readonly animationStyle: string;
  readonly renderingStyle: string;
}

export interface MutationPlan {
  readonly intent: string;
  readonly expressionChanges: ExpressionLayer;
  readonly identityPreservation: { readonly preserved: readonly string[]; readonly adapted: readonly string[]; };
}

export interface MutationResult {
  readonly identity: string;
  readonly intent: string;
  readonly environment: string;
  readonly outfit: string;
  readonly role: string;
  readonly abilities: readonly string[];
  readonly preservedFeatures: readonly string[];
  readonly behaviors: readonly string[];
  readonly catchphrases: readonly string[];
  readonly archetype: string;
  readonly personalitySnapshot: Readonly<Record<string, number>>;
}

export class IdentityAwareMutator {
  createPlan(intent: string, identity: IdentityCore): MutationPlan {
    return {
      intent,
      expressionChanges: this.planExpressionChanges(intent, identity),
      identityPreservation: this.planIdentityPreservation(identity),
    };
  }

  apply(plan: MutationPlan, identity: IdentityCore): MutationResult {
    return {
      identity: identity.characterId, intent: plan.intent,
      environment: plan.expressionChanges.environment, outfit: plan.expressionChanges.outfit,
      role: plan.expressionChanges.role, abilities: plan.expressionChanges.abilities,
      preservedFeatures: plan.identityPreservation.preserved,
      behaviors: identity.behavior.decisionPatterns.priorities,
      catchphrases: [...identity.dialogue.catchphrases],
      archetype: identity.archetype,
      personalitySnapshot: { wit: identity.personality.wit, cunning: identity.personality.cunning, courage: identity.personality.courage, adaptability: identity.personality.adaptability, confidence: identity.voice.personality.confidenceLevel },
    };
  }

  private planExpressionChanges(intent: string, identity: IdentityCore): ExpressionLayer {
    const lower = intent.toLowerCase();
    return {
      environment: this.extractEnvironment(lower),
      outfit: this.generateOutfit(lower),
      role: this.extractRole(lower),
      abilities: this.deriveAbilities(lower, identity),
      animationStyle: 'preserve_canonical',
      renderingStyle: 'adapt_to_environment',
    };
  }

  private planIdentityPreservation(identity: IdentityCore): MutationPlan['identityPreservation'] {
    return {
      preserved: [...identity.visual.immutableFeatures, ...identity.invariants.rules, ...identity.dialogue.catchphrases, ...identity.constraints.required],
      adapted: ['color_palette', 'environment_context', 'outfit', 'rendering_style', 'background'],
    };
  }

  private extractEnvironment(intent: string): string {
    const envs: Array<[string, string]> = [
      ['cyberpunk', 'cyberpunk'], ['futuristic', 'sci-fi'], ['space', 'sci-fi'], ['medieval', 'medieval'],
      ['fantasy', 'fantasy'], ['western', 'western'], ['noir', 'noir'], ['steampunk', 'steampunk'],
      ['underwater', 'aquatic'], ['jungle', 'jungle'], ['desert', 'desert'], ['arctic', 'arctic'], ['urban', 'urban'],
    ];
    for (const [keyword, env] of envs) { if (intent.includes(keyword)) return env; }
    return 'contemporary';
  }

  private generateOutfit(intent: string): string {
    const outfits: Array<[string, string]> = [
      ['biker', 'leather jacket, chrome accents, combat boots'], ['pirate', 'cutlass, tricorn hat, naval coat'],
      ['knight', 'plate armor, sword, heraldic shield'], ['ninja', 'black gi, shuriken, stealth gear'],
      ['astronaut', 'space suit, helmet, mission patches'], ['detective', 'trench coat, fedora, magnifying glass'],
      ['warrior', 'battle armor, weapon of choice'], ['scientist', 'lab coat, goggles, tools'],
    ];
    for (const [keyword, outfit] of outfits) { if (intent.includes(keyword)) return outfit; }
    return 'context-appropriate outfit';
  }

  private extractRole(intent: string): string {
    const roles: Array<[string, string]> = [
      ['gang', 'gang member'], ['leader', 'leader'], ['hero', 'hero'], ['villain', 'antihero'],
      ['spy', 'spy'], ['king', 'ruler'], ['soldier', 'soldier'], ['merchant', 'merchant'],
    ];
    for (const [keyword, role] of roles) { if (intent.includes(keyword)) return role; }
    return 'character';
  }

  private deriveAbilities(intent: string, identity: IdentityCore): string[] {
    const coreAbilities = identity.behavior.decisionPatterns.priorities.map(p => `core: ${p}`);
    const contextAbilities: string[] = [];
    if (intent.includes('cyberpunk')) contextAbilities.push('hacking', 'neon_camo');
    if (intent.includes('medieval')) contextAbilities.push('swordplay', 'heraldry');
    if (intent.includes('space')) contextAbilities.push('zero_g_movement', 'tech_interface');
    if (intent.includes('pirate')) contextAbilities.push('sailing', 'treasure_sense');
    return [...coreAbilities, ...contextAbilities];
  }
}

// ============================================================================
// BUILT-IN CHARACTER: Bugs Bunny
// ============================================================================

export const BUGS_BUNNY_SOURCE: CharacterSourceData = {
  name: 'Bugs Bunny', sourceIP: 'Looney Tunes',
  traits: ['clever', 'funny', 'adaptive', 'irreverent'],
  proportions: { headToBodyRatio: 0.4, limbLengthRatio: 0.8 },
  colors: ['white', 'beige', 'red'],
  immutableFeatures: ['long_ears', 'buck_teeth', 'pink_nose', 'white_gloves'],
  exaggeration: 0.7, anticipation: 0.4, overshoot: 0.3, easingProfile: 'snappy',
  voice: { pitchRange: [150, 250], speedRange: [120, 160], rhythmPattern: 'snappy', vocabulary: 'simple', dialect: ['Brooklyn accent'], patterns: ["Eh, what's up, Doc?", "Ain't I a stinker?"], humorStyle: 'timing', formality: 0.1, confidence: 0.95, chattiness: 0.8, wittiness: 0.95 },
  movement: { gait: 'hop', anticipation: 0.2, hold: 0.1, ease: 0.3, characteristic: 'confident bouncy hopping', gestures: [{ name: 'carrot nibble', meaning: 'thinking', timing: 0.3, exaggeration: 0.7 }, { name: 'disguise change', meaning: 'trickery', timing: 0.5, exaggeration: 0.9 }], energyLevel: 0.85 },
  reactions: { toThreat: 'dodge with comedic exaggeration', toOpportunity: 'exploit with wit', toDefeat: 'bounce back immediately' },
  behavior: { priorities: ['escape', 'trick', 'outsmart'], riskTolerance: 0.8, adaptationRate: 0.95, responses: [{ stimulus: 'threat', characteristicResponse: 'dodge with humor', invariantBehavior: ['stay cool', 'find escape', 'make joke'] }], toAuthority: 'subversive', toAlly: 'teasing', toEnemy: 'clever' },
  dialogue: { catchphrases: ["Eh, what's up, Doc?", "Ain't I a stinker?"], sentenceLength: 8, subordinateFrequency: 0.3, questionFrequency: 0.25, topics: ['carrots', 'escaping', 'outsmarting'], humorStyle: 'timing', jokeFrequency: 0.6, comedyTiming: 0.95, vulnerability: false, emotionalReserve: 0.8, dramatics: 0.6 },
  invariants: { rules: ['must preserve comedic timing', 'always has escape route', 'stays cool under pressure'], visualFeatures: ['long_ears', 'buck_teeth', 'white_gloves'], behavioral: ['adaptive', 'clever', 'irreverent'], emotional: ['confident', 'playful', 'never serious'] },
  constraints: { forbidden: ['evil', 'stupid', 'weak', 'serious'], required: ['witty', 'adaptable', 'confident'], preferential: ['cunning over strength', 'humor over violence'] },
};
