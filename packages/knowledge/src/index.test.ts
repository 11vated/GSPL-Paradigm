import { describe, it, expect } from 'vitest';
import {
  // Archetype registry
  getArchetype,
  listArchetypes,
  registerArchetype,
  // Concept synthesis
  synthesize,
  // Concept decomposition
  decompose,
  formatDecomposition,
  // Domain manifestation
  manifest,
  manifestAll,
  // Concept classifier
  classifyIntent,
  // Gap detection
  detectGaps,
  fillGap,
  fillAllGaps,
  // Identity engine
  computeFingerprint,
  IdentityIngestor,
  CoherenceValidator,
  IdentityAwareMutator,
  BUGS_BUNNY_SOURCE,
} from './index.js';
import type {
  ConceptModel,
  ManifestationDomain,
  ConceptType,
  CharacterSourceData,
} from './index.js';
import type { UniversalSeed } from '@paradigm/types';

// ── helpers ──────────────────────────────────────────────────────

function makeSeed(overrides: Partial<UniversalSeed> = {}): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: 'test_hash',
    $name: 'TestSeed',
    $lineage: { generation: 0, parents: [], timestamp: Date.now() },
    genes: {
      health: { type: 'scalar', value: 80, min: 0, max: 100 },
      speed: { type: 'scalar', value: 50, min: 0, max: 100 },
      element: { type: 'categorical', value: 'fire', options: ['fire', 'ice', 'lightning'] },
      color: { type: 'vector', value: [0.9, 0.2, 0.1], dimensions: 3 },
    },
    $metadata: { created: Date.now() },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Archetype Registry
// ═══════════════════════════════════════════════════════════════════

describe('Archetype Registry', () => {
  it('lists all 12 archetypes as ConceptModel objects', () => {
    const archetypes = listArchetypes();
    expect(archetypes.length).toBe(12);
    const names = archetypes.map(a => a.archetypalCore.archetype);
    expect(names).toContain('hero');
    expect(names).toContain('trickster');
    expect(names).toContain('sage');
  });

  it('retrieves a known archetype by name', () => {
    const hero = getArchetype('hero');
    expect(hero).toBeDefined();
    expect(hero!.archetypalCore.archetype).toBe('hero');
    expect(hero!.name).toBeDefined();
  });

  it('returns undefined for unknown archetype', () => {
    expect(getArchetype('nonexistent' as never)).toBeUndefined();
  });

  it('allows registering a custom archetype', () => {
    const trickster = getArchetype('trickster')!;
    const custom: ConceptModel = {
      ...trickster,
      id: 'custom_test',
      name: 'CustomTest',
      archetypalCore: { ...trickster.archetypalCore, archetype: 'custom_test', psychologicalFunction: 'test' },
    };
    registerArchetype(custom);
    const retrieved = getArchetype('custom_test');
    expect(retrieved).toBeDefined();
    expect(retrieved!.archetypalCore.psychologicalFunction).toBe('test');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Concept Synthesis
// ═══════════════════════════════════════════════════════════════════

describe('Concept Synthesis', () => {
  it('synthesizes two concepts', () => {
    const hero = getArchetype('hero')!;
    const trickster = getArchetype('trickster')!;
    const result = synthesize([hero, trickster], 'clever hero');
    expect(result.result).toBeDefined();
    expect(result.result.name).toBeDefined();
    expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
  });

  it('handles single concept input', () => {
    const hero = getArchetype('hero')!;
    const result = synthesize([hero], 'pure hero');
    expect(result.result).toBeDefined();
    expect(result.reasoning).toContain('Single');
  });

  it('generates reasoning and resolution', () => {
    const a = getArchetype('sage')!;
    const b = getArchetype('creator')!;
    const result = synthesize([a, b], 'wise creator');
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.resolutions).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Concept Decomposition
// ═══════════════════════════════════════════════════════════════════

describe('Concept Decomposition', () => {
  it('decomposes a concept into sub-concepts', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 2);
    expect(result.root).toBeDefined();
    expect(result.root.name).toBe('hero');
    expect(result.depth).toBeGreaterThanOrEqual(1);
  });

  it('formats decomposition as ASCII tree', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 1);
    const formatted = formatDecomposition(result);
    expect(formatted).toContain('hero');
    expect(typeof formatted).toBe('string');
  });

  it('respects depth limit', () => {
    const hero = getArchetype('hero')!;
    const shallow = decompose(hero, 1);
    const deep = decompose(hero, 3);
    expect(deep.depth).toBeGreaterThanOrEqual(shallow.depth);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Domain Manifestation
// ═══════════════════════════════════════════════════════════════════

describe('Domain Manifestation', () => {
  it('manifests a concept for sprite2d domain', () => {
    const hero = getArchetype('hero')!;
    const result = manifest(hero, 'sprite2d');
    expect(result).toBeDefined();
    expect(result.domain).toBe('sprite2d');
  });

  it('manifests for all 6 domains', () => {
    const hero = getArchetype('hero')!;
    const results = manifestAll(hero);
    expect(Object.keys(results).length).toBe(6);
    expect(results['sprite2d']).toBeDefined();
    expect(results['model3d']).toBeDefined();
    expect(results['animation']).toBeDefined();
    expect(results['voice']).toBeDefined();
    expect(results['behavior']).toBeDefined();
    expect(results['narrative']).toBeDefined();
  });

  it('returns confidence and output', () => {
    const hero = getArchetype('hero')!;
    const sprite = manifest(hero, 'sprite2d');
    expect(sprite.output).toBeDefined();
    expect(sprite.confidence).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Concept Classifier
// ═══════════════════════════════════════════════════════════════════

describe('Concept Classifier', () => {
  it('classifies "fire dragon" as creature', () => {
    const result = classifyIntent('fire dragon');
    expect(result.type).toBe('creature');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies "dark forest" as environment', () => {
    const result = classifyIntent('dark forest');
    expect(result.type).toBe('environment');
  });

  it('classifies "magic sword" as object', () => {
    const result = classifyIntent('magic sword');
    expect(result.type).toBe('object');
  });

  it('returns style classification', () => {
    const result = classifyIntent('pixel art warrior');
    expect(result.style).toBeDefined();
  });

  it('returns complexity classification', () => {
    const result = classifyIntent('simple bird');
    expect(result.complexity).toBeDefined();
  });

  it('returns required engines', () => {
    const result = classifyIntent('robot mech');
    expect(result.requiredEngines).toBeDefined();
    expect(result.requiredEngines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Gap Detection
// ═══════════════════════════════════════════════════════════════════

describe('Gap Detection', () => {
  it('detects missing behavior genes', () => {
    const seed = makeSeed({
      genes: {
        color: { type: 'vector', value: [1, 0, 0], dimensions: 3 },
      },
    });
    const report = detectGaps(seed);
    expect(report.totalGaps).toBeGreaterThan(0);
    const hasBehaviorGap = report.gaps.some(g => g.type === 'missing_behavior');
    expect(hasBehaviorGap).toBe(true);
  });

  it('detects missing visual genes', () => {
    const seed = makeSeed({
      genes: {
        role: { type: 'categorical', value: 'warrior', options: ['warrior', 'mage'] },
      },
    });
    const report = detectGaps(seed);
    const hasVisualGap = report.gaps.some(g => g.type === 'missing_visual');
    expect(hasVisualGap).toBe(true);
  });

  it('detects missing structure (few genes)', () => {
    const seed = makeSeed({
      genes: {
        x: { type: 'scalar', value: 1, min: 0, max: 10 },
      },
    });
    const report = detectGaps(seed);
    const hasStructure = report.gaps.some(g => g.type === 'missing_structure');
    expect(hasStructure).toBe(true);
  });

  it('fills a gap that has fixGene+fixValue', () => {
    const seed = makeSeed({
      genes: {
        color: { type: 'vector', value: [1, 0, 0], dimensions: 3 },
      },
    });
    const report = detectGaps(seed);
    const fillableGap = report.gaps.find(g => g.fixGene && g.fixValue);
    if (fillableGap) {
      const filled = fillGap(seed, fillableGap);
      expect(Object.keys(filled.genes).length).toBeGreaterThanOrEqual(1);
    } else {
      // no auto-fillable gaps — just verify detection worked
      expect(report.totalGaps).toBeGreaterThan(0);
    }
  });

  it('fills all gaps', () => {
    const seed = makeSeed({
      genes: {
        x: { type: 'scalar', value: 1, min: 0, max: 10 },
      },
    });
    const result = fillAllGaps(seed);
    expect(result.seed).toBeDefined();
    expect(result.filled).toBeDefined();
  });

  it('reports severity counts', () => {
    const seed = makeSeed({ genes: {} });
    const report = detectGaps(seed);
    expect(typeof report.criticalCount).toBe('number');
    expect(typeof report.highCount).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Identity Engine
// ═══════════════════════════════════════════════════════════════════

describe('Identity Engine', () => {
  const ingestor = new IdentityIngestor();
  const validator = new CoherenceValidator();
  const mutator = new IdentityAwareMutator();

  describe('IdentityIngestor', () => {
    it('ingests character source data', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      expect(identity).toBeDefined();
      expect(identity.personality).toBeDefined();
      expect(identity.visual).toBeDefined();
      expect(identity.voice).toBeDefined();
      expect(identity.motion).toBeDefined();
      expect(identity.behavior).toBeDefined();
      expect(identity.dialogue).toBeDefined();
    });

    it('maps personality traits', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      expect(identity.personality.openness).toBeGreaterThan(0);
      expect(identity.personality.extraversion).toBeGreaterThan(0);
    });

    it('preserves visual DNA', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      expect(identity.visual.colorSignature.primaryColor).toBeDefined();
      expect(identity.visual.silhouetteSignature).toBeDefined();
    });
  });

  describe('computeFingerprint', () => {
    it('produces a stable fingerprint', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      const fp1 = computeFingerprint(identity);
      const fp2 = computeFingerprint(identity);
      expect(fp1.identityHash).toBe(fp2.identityHash);
      expect(fp1.visualHash).toBe(fp2.visualHash);
    });

    it('produces 4 independent hashes', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      const fp = computeFingerprint(identity);
      expect(fp.identityHash).toBeDefined();
      expect(fp.visualHash).toBeDefined();
      expect(fp.voiceHash).toBeDefined();
      expect(fp.behaviorHash).toBeDefined();
    });
  });

  describe('CoherenceValidator', () => {
    it('validates a coherent output', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      const output = {
        primaryColor: identity.visual.colorSignature.primaryColor,
        visualFeatures: [...identity.visual.immutableFeatures],
      };
      const result = validator.validate(output, identity);
      expect(result).toBeDefined();
      expect(typeof result.coherent).toBe('boolean');
      expect(typeof result.overallCoherence).toBe('number');
    });

    it('detects incoherent output', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      const badOutput = {
        primaryColor: 'completely_wrong_color',
        exhibitsBehavior: ['evil', 'stupid'],
      };
      const result = validator.validate(badOutput, identity);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('IdentityAwareMutator', () => {
    it('creates a mutation plan', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      const plan = mutator.createPlan('angry', identity);
      expect(plan).toBeDefined();
      expect(plan.intent).toBe('angry');
      expect(plan.expressionChanges).toBeDefined();
      expect(plan.identityPreservation).toBeDefined();
    });

    it('applies a mutation plan while preserving identity', () => {
      const identity = ingestor.ingest(BUGS_BUNNY_SOURCE);
      const plan = mutator.createPlan('happy', identity);
      const mutated = mutator.apply(plan, identity);
      expect(mutated).toBeDefined();
      // core archetype should be preserved
      expect(mutated.archetype).toBe(identity.archetype);
      expect(mutated.preservedFeatures.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Synthesis — additional branch coverage
// ═══════════════════════════════════════════════════════════════════

describe('Concept Synthesis — branch coverage', () => {
  it('throws when synthesizing from empty array', () => {
    expect(() => synthesize([], 'empty')).toThrow('Cannot synthesize from empty concept list');
  });

  it('detects opposing archetypes and records conflict', () => {
    // hero opposes destroyer per the archetype definitions
    const hero = getArchetype('hero')!;
    const destroyer = getArchetype('destroyer')!;
    const result = synthesize([hero, destroyer], 'hero-destroyer fusion');
    const hasArchetypeConflict = result.conflicts.some(c => c.rule === 'opposing_archetypes');
    expect(hasArchetypeConflict).toBe(true);
    expect(result.resolutions.some(r => r.includes('hero'))).toBe(true);
  });

  it('records morphology mismatch when base forms differ', () => {
    // hero is humanoid; build a synthetic concept with animal baseForm to force mismatch
    const hero = getArchetype('hero')!;
    const trickster = getArchetype('trickster')!;
    const animalVariant: ConceptModel = {
      ...trickster,
      morphology: {
        ...trickster.morphology,
        baseForm: 'animal',
      },
    };
    const result = synthesize([hero, animalVariant], 'humanoid-animal fusion');
    const hasMorphConflict = result.conflicts.some(c => c.rule === 'form_mismatch');
    expect(hasMorphConflict).toBe(true);
  });

  it('deduplicates behavior patterns by name', () => {
    const hero = getArchetype('hero')!;
    // Give a second concept the same pattern name as hero's "charge" pattern
    const samePatternConcept: ConceptModel = {
      ...getArchetype('sage')!,
      behavior: {
        ...getArchetype('sage')!.behavior,
        corePatterns: [{ name: 'charge', trigger: 'duplicate trigger', action: 'dup action', consequence: 'dup', energyCost: 0.1 }],
      },
    };
    const result = synthesize([hero, samePatternConcept], 'dedup test');
    const chargePatterns = result.result.behavior.corePatterns.filter(p => p.name === 'charge');
    expect(chargePatterns.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Decomposition — additional branch coverage
// ═══════════════════════════════════════════════════════════════════

describe('Concept Decomposition — branch coverage', () => {
  it('skips structural head/torso/limbs nodes for non-humanoid/animal baseForm', () => {
    const trickster = getArchetype('trickster')!;
    const abstractConcept: ConceptModel = {
      ...trickster,
      morphology: {
        ...trickster.morphology,
        baseForm: 'abstract',
      },
    };
    const result = decompose(abstractConcept, 1);
    const hasHead = result.root.children.some(c => c.name === 'Head');
    expect(hasHead).toBe(false);
  });

  it('reaches depth 3 and exercises generateSubComponents recursive path', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 3);
    expect(result.depth).toBe(3);
    // Should have grandchildren in the tree
    const hasGrandchildren = result.root.children.some(c => c.children.length > 0);
    expect(hasGrandchildren).toBe(true);
  });

  it('generateSubComponents produces head sub-nodes (skull/eyes/mouth/facial)', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 2);
    const headNode = result.root.children.find(c => c.name === 'Head');
    expect(headNode).toBeDefined();
    const childNames = headNode!.children.map(c => c.name);
    expect(childNames).toContain('Skull');
    expect(childNames).toContain('Eyes');
  });

  it('generateSubComponents produces torso sub-nodes (spine/ribcage/surface)', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 2);
    const torsoNode = result.root.children.find(c => c.name === 'Torso');
    expect(torsoNode).toBeDefined();
    const childNames = torsoNode!.children.map(c => c.name);
    expect(childNames).toContain('Spine');
    expect(childNames).toContain('Ribcage');
    expect(childNames).toContain('Surface');
  });

  it('generateSubComponents produces limbs sub-nodes (upper/lower/joints)', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 2);
    const limbsNode = result.root.children.find(c => c.name === 'Limbs');
    expect(limbsNode).toBeDefined();
    const childNames = limbsNode!.children.map(c => c.name);
    expect(childNames).toContain('Upper Limbs');
    expect(childNames).toContain('Lower Limbs');
    expect(childNames).toContain('Joints');
  });

  it('generateSubComponents produces default structural sub-nodes for non-head/torso/limbs', () => {
    // Requires a concept with a required feature that isn't head/torso/limbs
    const hero = getArchetype('hero')!;
    const withFeature: ConceptModel = {
      ...hero,
      morphology: {
        ...hero.morphology,
        constraints: {
          ...hero.morphology.constraints,
          requiredFeatures: ['wing'],
        },
      },
    };
    const result = decompose(withFeature, 2);
    const wingNode = result.root.children.find(c => c.name === 'Wing');
    expect(wingNode).toBeDefined();
    if (wingNode) {
      const childNames = wingNode.children.map(c => c.name);
      expect(childNames.some(n => n.includes('Core') || n.includes('Surface'))).toBe(true);
    }
  });

  it('generateSubComponents produces behavioral sub-nodes (trigger/execution/recovery)', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 2);
    const behaviorNode = result.root.children.find(c => c.category === 'behavioral');
    expect(behaviorNode).toBeDefined();
    if (behaviorNode) {
      const childNames = behaviorNode.children.map(c => c.name);
      expect(childNames.some(n => n.includes('Trigger'))).toBe(true);
      expect(childNames.some(n => n.includes('Execution'))).toBe(true);
      expect(childNames.some(n => n.includes('Recovery'))).toBe(true);
    }
  });

  it('generateSubComponents produces visual sub-nodes (color/shape)', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 2);
    const visualNode = result.root.children.find(c => c.category === 'visual');
    expect(visualNode).toBeDefined();
    if (visualNode) {
      const childNames = visualNode.children.map(c => c.name);
      expect(childNames.some(n => n.includes('Color'))).toBe(true);
      expect(childNames.some(n => n.includes('Shape'))).toBe(true);
    }
  });

  it('generateSubComponents produces audio sub-nodes (pitch/rhythm)', () => {
    const hero = getArchetype('hero')!;
    const result = decompose(hero, 2);
    const audioNode = result.root.children.find(c => c.category === 'audio');
    expect(audioNode).toBeDefined();
    if (audioNode) {
      const childNames = audioNode.children.map(c => c.name);
      expect(childNames.some(n => n.includes('Pitch'))).toBe(true);
      expect(childNames.some(n => n.includes('Rhythm'))).toBe(true);
    }
  });

  it('formatDecomposition exercises non-last child branch (├─ connector)', () => {
    const hero = getArchetype('hero')!;
    // depth 2 guarantees multiple children at level 1, so ├─ connectors are used
    const result = decompose(hero, 2);
    const formatted = formatDecomposition(result);
    expect(formatted).toContain('├─');
    expect(formatted).toContain('└─');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Manifestation — additional branch coverage
// ═══════════════════════════════════════════════════════════════════

describe('Domain Manifestation — branch coverage', () => {
  const domains: ManifestationDomain[] = ['sprite2d', 'model3d', 'animation', 'voice', 'behavior', 'narrative'];

  for (const domain of domains) {
    it(`manifests hero for ${domain}`, () => {
      const hero = getArchetype('hero')!;
      const result = manifest(hero, domain);
      expect(result.domain).toBe(domain);
      expect(result.output).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  }

  it('sprite2d: trickster returns mischievous eye shape', () => {
    const t = getArchetype('trickster')!;
    const r = manifest(t, 'sprite2d');
    expect((r.output as { eyeShape: string }).eyeShape).toBe('mischievous');
  });

  it('sprite2d: sage returns wise eye shape', () => {
    const s = getArchetype('sage')!;
    const r = manifest(s, 'sprite2d');
    expect((r.output as { eyeShape: string }).eyeShape).toBe('wise');
  });

  it('sprite2d: destroyer returns intense eye shape', () => {
    const d = getArchetype('destroyer')!;
    const r = manifest(d, 'sprite2d');
    expect((r.output as { eyeShape: string }).eyeShape).toBe('intense');
  });

  it('sprite2d: creator returns dreamy eye shape', () => {
    const c = getArchetype('creator')!;
    const r = manifest(c, 'sprite2d');
    expect((r.output as { eyeShape: string }).eyeShape).toBe('dreamy');
  });

  it('sprite2d: jester returns wide eye shape', () => {
    const j = getArchetype('jester')!;
    const r = manifest(j, 'sprite2d');
    expect((r.output as { eyeShape: string }).eyeShape).toBe('wide');
  });

  it('sprite2d: archetype not in lookup falls through to default neutral', () => {
    // ruler is not in the archetypeVisuals lookup, should fall back to default
    const ruler = getArchetype('ruler')!;
    const r = manifest(ruler, 'sprite2d');
    expect((r.output as { eyeShape: string }).eyeShape).toBe('neutral');
  });

  it('model3d: small size yields lean body type when highly flexible', () => {
    const trickster = getArchetype('trickster')!; // small + highly_flexible
    const r = manifest(trickster, 'model3d');
    const out = r.output as { bodyType: string; overallScale: number };
    expect(out.bodyType).toBe('lean');
    expect(out.overallScale).toBe(0.6);
  });

  it('model3d: large size yields stocky body type', () => {
    const destroyer = getArchetype('destroyer')!; // size=large
    const r = manifest(destroyer, 'model3d');
    expect((r.output as { bodyType: string }).bodyType).toBe('stocky');
  });

  it('model3d: massive size also yields stocky body type with scale 2.5', () => {
    const trickster = getArchetype('trickster')!;
    const massiveConcept: ConceptModel = {
      ...trickster,
      morphology: {
        ...trickster.morphology,
        specifics: { ...trickster.morphology.specifics, size: 'massive', flexibility: 'rigid' },
      },
    };
    const r = manifest(massiveConcept, 'model3d');
    const out = r.output as { bodyType: string; overallScale: number };
    expect(out.bodyType).toBe('stocky');
    expect(out.overallScale).toBe(2.5);
  });

  it('voice: small size gives higher pitch range', () => {
    const trickster = getArchetype('trickster')!; // size=small
    const r = manifest(trickster, 'voice');
    const out = r.output as { pitchRange: readonly [number, number] };
    expect(out.pitchRange[0]).toBe(200);
    expect(out.pitchRange[1]).toBe(400);
  });

  it('voice: large size gives lower pitch range', () => {
    const destroyer = getArchetype('destroyer')!; // size=large
    const r = manifest(destroyer, 'voice');
    const out = r.output as { pitchRange: readonly [number, number] };
    expect(out.pitchRange[0]).toBe(80);
    expect(out.pitchRange[1]).toBe(200);
  });

  it('voice: medium size (human) gives mid pitch range', () => {
    const hero = getArchetype('hero')!; // size=human
    const r = manifest(hero, 'voice');
    const out = r.output as { pitchRange: readonly [number, number] };
    expect(out.pitchRange[0]).toBe(120);
    expect(out.pitchRange[1]).toBe(300);
  });

  it('voice: jester archetype gives physical humor style', () => {
    const jester = getArchetype('jester')!;
    const r = manifest(jester, 'voice');
    expect((r.output as { humorStyle: string }).humorStyle).toBe('physical');
  });

  it('voice: trickster archetype gives timing humor style', () => {
    const trickster = getArchetype('trickster')!;
    const r = manifest(trickster, 'voice');
    expect((r.output as { humorStyle: string }).humorStyle).toBe('timing');
  });

  it('voice: other archetypes give none humor style', () => {
    const sage = getArchetype('sage')!;
    const r = manifest(sage, 'voice');
    expect((r.output as { humorStyle: string }).humorStyle).toBe('none');
  });

  it('narrative: chaotic dynamism returns wide emotional range', () => {
    const destroyer = getArchetype('destroyer')!; // dynamism=chaotic
    const r = manifest(destroyer, 'narrative');
    expect((r.output as { emotionalRange: string }).emotionalRange).toBe('wide');
  });

  it('narrative: steady dynamism returns narrow emotional range', () => {
    const sage = getArchetype('sage')!; // dynamism=steady
    const r = manifest(sage, 'narrative');
    expect((r.output as { emotionalRange: string }).emotionalRange).toBe('narrow');
  });

  it('narrative: other dynamism returns moderate emotional range', () => {
    const hero = getArchetype('hero')!; // dynamism=transformative
    const r = manifest(hero, 'narrative');
    expect((r.output as { emotionalRange: string }).emotionalRange).toBe('moderate');
  });

  it('emits warning note when naturalness is below 0.5', () => {
    // sage has sprite2d naturalness of 0.7 — override to 0.3 to trigger warning
    const sage = getArchetype('sage')!;
    const lowNatConcept: ConceptModel = {
      ...sage,
      relations: {
        ...sage.relations,
        domainNaturalness: { ...sage.relations.domainNaturalness, sprite2d: 0.3 },
      },
    };
    const r = manifest(lowNatConcept, 'sprite2d');
    expect(r.notes.some(n => n.includes('low naturalness'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Classifier — additional branch coverage
// ═══════════════════════════════════════════════════════════════════

describe('Concept Classifier — branch coverage', () => {
  const typeFixtures: Array<[string, ConceptType]> = [
    ['knight warrior hero', 'character'],
    ['wolf beast creature', 'creature'],
    ['magic sword weapon', 'object'],
    ['dungeon cave environment', 'environment'],
    ['crafting inventory system', 'system'],
    ['emotion concept melody', 'abstract'],
    ['fire explosion lightning phenomenon', 'phenomenon'],
    ['battle interaction puzzle', 'interaction'],
  ];

  for (const [input, expectedType] of typeFixtures) {
    it(`classifies "${input}" as ${expectedType}`, () => {
      const result = classifyIntent(input);
      expect(result.type).toBe(expectedType);
    });
  }

  const styleFixtures: Array<[string, string]> = [
    ['anime warrior', 'anime'],
    ['realistic knight', 'realistic'],
    ['pixel art hero', 'pixel'],
    ['cyberpunk assassin', 'cyberpunk'],
    ['fantasy elf', 'fantasy'],
    ['minimal flat icon', 'minimal'],
    ['cartoon animated bunny', 'cartoon'],
    ['noir dark detective', 'noir'],
  ];

  for (const [input, expectedStyle] of styleFixtures) {
    it(`detects style "${expectedStyle}" from "${input}"`, () => {
      const result = classifyIntent(input);
      expect(result.style).toBe(expectedStyle);
    });
  }

  it('complexity: simple keyword returns simple', () => {
    expect(classifyIntent('simple bird').complexity).toBe('simple');
  });

  it('complexity: moderate keyword returns moderate', () => {
    expect(classifyIntent('standard warrior').complexity).toBe('moderate');
  });

  it('complexity: complex keyword returns complex', () => {
    expect(classifyIntent('complex elaborate intricate knight').complexity).toBe('complex');
  });

  it('complexity: extreme keyword returns extreme', () => {
    expect(classifyIntent('legendary epic ultimate dragon').complexity).toBe('extreme');
  });

  it('complexity: >5 words with no complexity keyword returns moderate', () => {
    expect(classifyIntent('a big red fire breathing dragon').complexity).toBe('moderate');
  });

  it('complexity: >10 words with no complexity keyword returns complex', () => {
    const longIntent = 'a tall blue armored warrior with a big shield and a sword';
    const result = classifyIntent(longIntent);
    expect(result.complexity).toBe('complex');
  });

  it('detectRealismLevel: realistic style → photorealistic', () => {
    expect(classifyIntent('realistic portrait').realismLevel).toBe('photorealistic');
  });

  it('detectRealismLevel: pixel style → stylized', () => {
    expect(classifyIntent('pixel art hero').realismLevel).toBe('stylized');
  });

  it('detectRealismLevel: cartoon style → stylized', () => {
    expect(classifyIntent('cartoon toon character').realismLevel).toBe('stylized');
  });

  it('detectRealismLevel: anime style → stylized', () => {
    expect(classifyIntent('anime warrior').realismLevel).toBe('stylized');
  });

  it('detectRealismLevel: abstract keyword (no style) → abstract', () => {
    expect(classifyIntent('abstract concept pattern').realismLevel).toBe('abstract');
  });

  it('detectRealismLevel: default (no special style/keyword) → semi_realistic', () => {
    expect(classifyIntent('a knight').realismLevel).toBe('semi_realistic');
  });

  it('anime style adds anime_style_engine to requiredEngines', () => {
    const result = classifyIntent('anime mage');
    expect(result.requiredEngines).toContain('anime_style_engine');
  });

  it('pixel style adds pixel_art_engine to requiredEngines', () => {
    const result = classifyIntent('pixel hero');
    expect(result.requiredEngines).toContain('pixel_art_engine');
  });

  it('lightning keyword adds visual_effects_engine', () => {
    const result = classifyIntent('lightning mage');
    expect(result.requiredEngines).toContain('visual_effects_engine');
  });

  it('fire keyword adds visual_effects_engine', () => {
    const result = classifyIntent('fire dragon');
    expect(result.requiredEngines).toContain('visual_effects_engine');
  });

  it('magic keyword adds visual_effects_engine', () => {
    const result = classifyIntent('magic spell effect');
    expect(result.requiredEngines).toContain('visual_effects_engine');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Gap Detection — additional branch coverage
// ═══════════════════════════════════════════════════════════════════

describe('Gap Detection — branch coverage', () => {
  it('detectMissingBehavior: non-organism/game domain returns no behavior gaps', () => {
    const seed = makeSeed({ $domain: 'structure' as any });
    const report = detectGaps(seed);
    const hasBehavior = report.gaps.some(g => g.type === 'missing_behavior');
    expect(hasBehavior).toBe(false);
  });

  it('detectMissingBehavior: seed with categorical gene skips role gap', () => {
    const seed = makeSeed({
      $domain: 'organism',
      genes: {
        role: { type: 'categorical', value: 'warrior', options: ['warrior', 'mage'] },
      },
    });
    const report = detectGaps(seed);
    const hasRoleGap = report.gaps.some(g => g.id === 'gap_behavior_role');
    expect(hasRoleGap).toBe(false);
  });

  it('detectMissingVoice: organism without voice genes gets voice gap', () => {
    const seed = makeSeed({
      $domain: 'organism',
      genes: {
        health: { type: 'scalar', value: 80, min: 0, max: 100 },
        speed: { type: 'scalar', value: 50, min: 0, max: 100 },
        element: { type: 'categorical', value: 'fire', options: ['fire', 'ice'] },
      },
    });
    const report = detectGaps(seed);
    const hasVoiceGap = report.gaps.some(g => g.type === 'missing_voice');
    expect(hasVoiceGap).toBe(true);
  });

  it('detectMissingVoice: organism with voice gene has no voice gap', () => {
    const seed = makeSeed({
      $domain: 'organism',
      genes: {
        voice_pitch: { type: 'scalar', value: 200, min: 80, max: 400 },
      },
    });
    const report = detectGaps(seed);
    const hasVoiceGap = report.gaps.some(g => g.type === 'missing_voice');
    expect(hasVoiceGap).toBe(false);
  });

  it('detectMissingAnimation: organism with speed gene has no animation gap', () => {
    const seed = makeSeed({
      $domain: 'organism',
      genes: {
        speed: { type: 'scalar', value: 10, min: 0, max: 30 },
      },
    });
    const report = detectGaps(seed);
    const hasAnimationGap = report.gaps.some(g => g.type === 'missing_animation');
    expect(hasAnimationGap).toBe(false);
  });

  it('detectMissingAnimation: non-organism domain returns no animation gap', () => {
    const seed = makeSeed({ $domain: 'structure' as any });
    const report = detectGaps(seed);
    const hasAnimationGap = report.gaps.some(g => g.type === 'missing_animation');
    expect(hasAnimationGap).toBe(false);
  });

  it('detectMissingPhysics: organism domain without physics genes gets physics gap', () => {
    const seed = makeSeed({
      $domain: 'organism',
      genes: {
        health: { type: 'scalar', value: 80, min: 0, max: 100 },
        speed: { type: 'scalar', value: 5, min: 0, max: 30 },
        role: { type: 'categorical', value: 'balanced', options: ['predator', 'prey', 'balanced'] },
        voice_pitch: { type: 'scalar', value: 200, min: 80, max: 400 },
      },
    });
    const report = detectGaps(seed);
    const hasPhysicsGap = report.gaps.some(g => g.type === 'missing_physics');
    expect(hasPhysicsGap).toBe(true);
  });

  it('detectMissingPhysics: non-physics-relevant domain returns no physics gap', () => {
    const seed = makeSeed({ $domain: 'narrative' as any });
    const report = detectGaps(seed);
    const hasPhysicsGap = report.gaps.some(g => g.type === 'missing_physics');
    expect(hasPhysicsGap).toBe(false);
  });

  it('fillGap: gap with no fixGene returns seed unchanged', () => {
    const seed = makeSeed();
    const gapNoFix = {
      id: 'no_fix_gap',
      type: 'missing_structure' as const,
      domain: 'structure',
      severity: 'critical' as const,
      description: 'test gap without fixGene',
      priority: 10,
    };
    const result = fillGap(seed, gapNoFix);
    expect(result).toBe(seed);
  });

  it('fillAllGaps: seed already having the fix gene name does not double-add it', () => {
    const seed = makeSeed({
      $domain: 'organism',
      genes: {
        // pre-existing role gene so gap_behavior_role should not be filled again
        role: { type: 'categorical', value: 'balanced', options: ['predator', 'prey', 'balanced'] },
        // speed to avoid animation gap
        speed: { type: 'scalar', value: 5, min: 0, max: 30 },
        // voice gene
        voice_pitch: { type: 'scalar', value: 200, min: 80, max: 400 },
        // color gene
        color_hue: { type: 'scalar', value: 180, min: 0, max: 360 },
        // size gene
        size: { type: 'scalar', value: 1.0, min: 0.1, max: 5.0 },
        // intelligence gene
        intelligence: { type: 'scalar', value: 8, min: 0, max: 15 },
      },
    });
    const before = Object.keys(seed.genes).length;
    const result = fillAllGaps(seed);
    const after = Object.keys(result.seed.genes).length;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CoherenceValidator — additional branch coverage
// ═══════════════════════════════════════════════════════════════════

describe('CoherenceValidator — branch coverage', () => {
  const ingestor2 = new IdentityIngestor();
  const validator2 = new CoherenceValidator();

  it('validateVisual: reports violation for each missing immutable feature', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE);
    // Provide visualFeatures that omit some immutable features
    const output = {
      visualFeatures: ['long_ears'], // missing: buck_teeth, pink_nose, white_gloves
    };
    const result = validator2.validate(output, identity);
    const missingViolations = result.violations.filter(v => v.message.includes('Missing immutable feature'));
    expect(missingViolations.length).toBeGreaterThanOrEqual(1);
  });

  it('validateVisual: diverged headToBodyRatio emits info violation', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE); // headToBodyRatio = 0.4
    const output = { headToBodyRatio: 0.9 }; // delta > 0.2
    const result = validator2.validate(output, identity);
    const ratioViolation = result.violations.find(v => v.message.includes('Head-to-body ratio'));
    expect(ratioViolation).toBeDefined();
    expect(ratioViolation?.severity).toBe('info');
  });

  it('validateVisual: wrong primaryColor reduces visual score without separate violation', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE); // primaryColor='white'
    const output = {
      primaryColor: 'red',
      visualFeatures: [...identity.visual.immutableFeatures],
    };
    const result = validator2.validate(output, identity);
    // Score < 1 but no specific violation pushed for color mismatch in source
    expect(result.visualMatch).toBeLessThan(1);
  });

  it('validateVoice: dialogue containing catchphrase does NOT add catchphrase violation', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE);
    const output = {
      dialogue: ["Eh, what's up, Doc?", 'Some other line'],
    };
    const result = validator2.validate(output, identity);
    const catchphraseViolations = result.violations.filter(v => v.message.includes('catchphrase'));
    expect(catchphraseViolations.length).toBe(0);
  });

  it('validateVoice: dialogue missing catchphrases adds warning violation', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE);
    const output = {
      dialogue: ['Hello there.', 'I am generic.'],
    };
    const result = validator2.validate(output, identity);
    const catchphraseViolation = result.violations.find(v => v.message.includes('catchphrase'));
    expect(catchphraseViolation).toBeDefined();
    expect(catchphraseViolation?.severity).toBe('warning');
  });

  it('validateVoice: comedyTiming divergence (>0.3) reduces voice score', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE); // comedyTiming = 0.95
    const output = { comedyTiming: 0.1 }; // delta = 0.85 > 0.3
    const result = validator2.validate(output, identity);
    expect(result.voiceMatch).toBeLessThan(1);
  });

  it('validateBehavior: decisionPriorities missing some priorities reduces score', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE); // priorities: ['escape','trick','outsmart']
    const output = {
      decisionPriorities: ['escape'], // missing trick and outsmart
    };
    const result = validator2.validate(output, identity);
    expect(result.behaviorMatch).toBeLessThan(1);
  });

  it('validateBehavior: forbidden behavior triggers critical violation', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE); // forbidden: ['evil','stupid','weak','serious']
    const output = {
      exhibitsBehavior: ['evil'],
    };
    const result = validator2.validate(output, identity);
    const criticalViolation = result.violations.find(v => v.severity === 'critical');
    expect(criticalViolation).toBeDefined();
    expect(criticalViolation?.message).toContain('Forbidden behavior exhibited: evil');
  });

  it('validatePersonality: no personality in output returns 0.8', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE);
    const output = {};
    const result = validator2.validate(output, identity);
    expect(result.personalityMatch).toBe(0.8);
  });

  it('validatePersonality: diverged trait (> 0.4 delta) reduces score and adds warning', () => {
    const identity = ingestor2.ingest(BUGS_BUNNY_SOURCE); // wit = 0.9
    const output = {
      personality: { wit: 0.1 }, // delta = 0.8 > 0.4
    };
    const result = validator2.validate(output, identity);
    expect(result.personalityMatch).toBeLessThan(1);
    const personalityViolation = result.violations.find(v => v.domain === 'personality');
    expect(personalityViolation).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// IdentityAwareMutator — additional branch coverage
// ═══════════════════════════════════════════════════════════════════

describe('IdentityAwareMutator — additional mutation intents', () => {
  const ingestor3 = new IdentityIngestor();
  const mutator3 = new IdentityAwareMutator();

  const intents = [
    'cyberpunk gang leader',
    'medieval knight warrior',
    'space astronaut explorer',
    'pirate ship captain',
    'detective noir mystery',
    'scientist lab researcher',
    'ninja stealth assassin',
    'biker gang member',
  ];

  for (const intent of intents) {
    it(`creates and applies mutation plan for intent: "${intent}"`, () => {
      const identity = ingestor3.ingest(BUGS_BUNNY_SOURCE);
      const plan = mutator3.createPlan(intent, identity);
      expect(plan.intent).toBe(intent);
      const result = mutator3.apply(plan, identity);
      expect(result.archetype).toBe(identity.archetype);
      expect(result.abilities.length).toBeGreaterThan(0);
    });
  }

  it('intent with no keyword matches uses fallback environment and outfit', () => {
    const identity = ingestor3.ingest(BUGS_BUNNY_SOURCE);
    const plan = mutator3.createPlan('a completely unknown scenario', identity);
    expect(plan.expressionChanges.environment).toBe('contemporary');
    expect(plan.expressionChanges.outfit).toBe('context-appropriate outfit');
    expect(plan.expressionChanges.role).toBe('character');
  });

  it('intent with king keyword extracts ruler role', () => {
    const identity = ingestor3.ingest(BUGS_BUNNY_SOURCE);
    const plan = mutator3.createPlan('king of the realm', identity);
    expect(plan.expressionChanges.role).toBe('ruler');
  });

  it('intent with spy keyword extracts spy role', () => {
    const identity = ingestor3.ingest(BUGS_BUNNY_SOURCE);
    const plan = mutator3.createPlan('spy infiltration mission', identity);
    expect(plan.expressionChanges.role).toBe('spy');
  });
});
