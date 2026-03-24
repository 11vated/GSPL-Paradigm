import { describe, it, expect } from 'vitest';
import { ISCAAnalyzer, ConceptInterpreter, ConceptCompiler, ConceptToEntityPipeline, MorphologyGrammar, StyleResolver, ConstraintEngine, CanonicalDatabase, AgenticCoCreator } from './index.js';
import { DeterministicRNG } from '@paradigm/rng';

describe('ISCAAnalyzer', () => {
  const isca = new ISCAAnalyzer();

  describe('archetype detection', () => {
    it('detects warrior', () => {
      expect(isca.analyze('a fierce warrior with a sword').archetype).toBe('warrior');
    });
    it('detects mage', () => {
      expect(isca.analyze('powerful wizard casting spells').archetype).toBe('mage');
    });
    it('detects archer', () => {
      expect(isca.analyze('forest ranger with a longbow').archetype).toBe('archer');
    });
    it('detects rogue', () => {
      expect(isca.analyze('shadow assassin with daggers').archetype).toBe('rogue');
    });
    it('detects knight', () => {
      expect(isca.analyze('armored knight in plate armor').archetype).toBe('knight');
    });
    it('detects dragon', () => {
      expect(isca.analyze('fire-breathing dragon').archetype).toBe('dragon');
    });
    it('detects beast', () => {
      expect(isca.analyze('a wild wolf creature').archetype).toBe('beast');
    });
    it('detects undead', () => {
      expect(isca.analyze('skeleton warrior lich').archetype).toBe('undead');
    });
    it('detects demon', () => {
      expect(isca.analyze('dark demon with horns').archetype).toBe('demon');
    });
    it('detects golem', () => {
      expect(isca.analyze('stone golem construct').archetype).toBe('golem');
    });
    it('detects royalty', () => {
      expect(isca.analyze('the queen of the realm').archetype).toBe('royalty');
    });
    it('returns unknown for ambiguous input', () => {
      expect(isca.analyze('something abstract').archetype).toBe('unknown');
    });
  });

  describe('body structure detection', () => {
    it('detects humanoid', () => {
      expect(isca.analyze('human warrior').bodyStructure).toBe('humanoid');
    });
    it('detects quadruped', () => {
      expect(isca.analyze('a wolf running').bodyStructure).toBe('quadruped');
    });
    it('detects winged', () => {
      expect(isca.analyze('a dragon flying').bodyStructure).toBe('winged');
    });
    it('detects serpentine', () => {
      expect(isca.analyze('a giant serpent').bodyStructure).toBe('serpentine');
    });
    it('detects floating for ghost', () => {
      expect(isca.analyze('a floating ghost spirit').bodyStructure).toBe('floating');
    });
    it('detects mechanical', () => {
      expect(isca.analyze('a robot mech construct').bodyStructure).toBe('mechanical');
    });
    it('defaults beast to quadruped', () => {
      const result = isca.analyze('a wild beast creature');
      expect(result.bodyStructure).toBe('quadruped');
    });
    it('defaults dragon to winged', () => {
      const result = isca.analyze('ancient dragon');
      expect(result.bodyStructure).toBe('winged');
    });
  });

  describe('element detection', () => {
    it('detects fire', () => {
      expect(isca.analyze('fire breathing dragon').elements).toContain('fire');
    });
    it('detects lightning', () => {
      expect(isca.analyze('lightning bolt mage').elements).toContain('lightning');
    });
    it('detects multiple elements', () => {
      const result = isca.analyze('ice and fire elemental');
      expect(result.elements).toContain('fire');
      expect(result.elements).toContain('ice');
    });
  });

  describe('weapon detection', () => {
    it('detects sword', () => {
      expect(isca.analyze('knight with a sword').weapons).toContain('sword');
    });
    it('detects bow', () => {
      expect(isca.analyze('archer with longbow').weapons).toContain('bow');
    });
    it('detects staff', () => {
      expect(isca.analyze('wizard holding a staff').weapons).toContain('staff');
    });
  });

  describe('capabilities', () => {
    it('humanoid warrior can attack melee', () => {
      const result = isca.analyze('warrior fighter');
      expect(result.capabilities).toContain('can_attack_melee');
      expect(result.capabilities).toContain('can_walk');
    });
    it('dragon can fly', () => {
      const result = isca.analyze('flying dragon');
      expect(result.capabilities).toContain('can_fly');
    });
    it('mage can cast', () => {
      const result = isca.analyze('wizard mage');
      expect(result.capabilities).toContain('can_cast');
    });
  });

  describe('secondary actions', () => {
    it('detects cape', () => {
      expect(isca.analyze('hero with flowing cape').secondaryActionElements).toContain('cape');
    });
    it('detects tail', () => {
      expect(isca.analyze('fox with a fluffy tail').secondaryActionElements).toContain('tail');
    });
  });

  describe('suggested animations', () => {
    it('always includes idle', () => {
      expect(isca.analyze('warrior').suggestedAnimations).toContain('idle');
    });
    it('always includes hurt and death', () => {
      const anims = isca.analyze('warrior').suggestedAnimations;
      expect(anims).toContain('hurt');
      expect(anims).toContain('death');
    });
  });
});

describe('StyleResolver', () => {
  const resolver = new StyleResolver();

  it('detects anime', () => {
    expect(resolver.resolveStyle('anime warrior')).toBe('anime');
  });
  it('detects pixel', () => {
    expect(resolver.resolveStyle('pixel art character')).toBe('pixel');
  });
  it('detects chibi as cartoon', () => {
    expect(resolver.resolveStyle('chibi dragon')).toBe('cartoon');
  });
  it('detects isChibi', () => {
    expect(resolver.isChibi('chibi cute dragon')).toBe(true);
    expect(resolver.isChibi('anime warrior')).toBe(false);
  });
  it('returns default for unknown', () => {
    expect(resolver.resolveStyle('some character')).toBe('default');
  });
});

describe('MorphologyGrammar', () => {
  const grammar = new MorphologyGrammar();

  it('chibi has large head ratio', () => {
    const proportions = grammar.deriveProportions('cartoon', true, 0.9);
    expect(proportions.headToBodyRatio).toBeGreaterThan(0.4);
  });
  it('realistic has small head ratio', () => {
    const proportions = grammar.deriveProportions('realistic', false, 0.3);
    expect(proportions.headToBodyRatio).toBeLessThan(0.2);
  });
  it('derives morphology gene', () => {
    const gene = grammar.deriveMorphologyGene('humanoid', 'anime', false);
    expect(gene.bodyStructure).toBe('humanoid');
    expect(gene.symmetry).toBe('bilateral');
    expect(gene.exaggeration).toBe(0.5);
  });
});

describe('ConstraintEngine', () => {
  const engine = new ConstraintEngine();

  it('chibi has head proportion constraint', () => {
    const rules = engine.deriveConstraints('cartoon', 'humanoid', true);
    expect(rules.some((r) => r.id === 'chibi_head')).toBe(true);
  });
  it('always has symmetry constraint', () => {
    const rules = engine.deriveConstraints('default', 'humanoid', false);
    expect(rules.some((r) => r.id === 'sym_bilateral')).toBe(true);
  });
  it('winged has wing visibility constraint', () => {
    const rules = engine.deriveConstraints('fantasy', 'winged', false);
    expect(rules.some((r) => r.id === 'wing_visible')).toBe(true);
  });
});

describe('ConceptInterpreter', () => {
  const interpreter = new ConceptInterpreter();

  it('interprets chibi lightning dragon', () => {
    const concept = interpreter.interpret('chibi lightning dragon');
    expect(concept.archetype).toBe('dragon');
    expect(concept.bodyStructure).toBe('winged');
    expect(concept.elements).toContain('lightning');
    expect(concept.species).toBe('dragon');
    expect(concept.morphology.exaggeration).toBeGreaterThan(0.7);
    expect(concept.morphology.proportions.headToBodyRatio).toBeGreaterThan(0.3);
  });

  it('interprets warrior knight with sword', () => {
    const concept = interpreter.interpret('warrior knight with a fire sword');
    expect(concept.archetype).toBe('warrior');
    expect(concept.bodyStructure).toBe('humanoid');
    expect(concept.weapons).toContain('sword');
    expect(concept.elements).toContain('fire');
  });

  it('interprets fox beast', () => {
    const concept = interpreter.interpret('wild fox creature');
    expect(concept.archetype).toBe('beast');
    expect(concept.species).toBe('fox');
  });
});

describe('ConceptCompiler', () => {
  const interpreter = new ConceptInterpreter();
  const compiler = new ConceptCompiler();
  const rng = new DeterministicRNG('test-seed');

  it('compiles concept to seed', () => {
    const concept = interpreter.interpret('chibi lightning dragon');
    const seed = compiler.compile(concept, rng);

    expect(seed.$gst).toBe('4.0');
    expect(seed.$name).toBe('Chibi Lightning Dragon');
    expect(seed.genes['archetype']).toBeDefined();
    expect(seed.genes['bodyStructure']).toBeDefined();
    expect(seed.genes['proportions']).toBeDefined();
    expect(seed.genes['personality']).toBeDefined();
    expect(seed.genes['exaggeration']).toBeDefined();
    expect(seed.genes['palette']).toBeDefined();
  });

  it('produces different seeds for different concepts', () => {
    const c1 = interpreter.interpret('fire warrior');
    const c2 = interpreter.interpret('ice mage');
    const s1 = compiler.compile(c1, new DeterministicRNG('s1'));
    const s2 = compiler.compile(c2, new DeterministicRNG('s2'));
    expect(s1.$hash).not.toBe(s2.$hash);
  });
});

describe('CanonicalDatabase', () => {
  const db = new CanonicalDatabase();

  it('matches Goku', () => {
    const match = db.match('goku');
    expect(match).not.toBeNull();
    expect(match!.entry.overrides.archetype).toBe('warrior');
    expect(match!.entry.overrides.species).toBe('human');
    expect(match!.entry.overrides.style).toBe('anime');
  });

  it('matches Bugs Bunny', () => {
    const match = db.match('bugs bunny');
    expect(match).not.toBeNull();
    expect(match!.entry.overrides.species).toBe('rabbit');
    expect(match!.entry.overrides.style).toBe('cartoon');
  });

  it('matches dragon', () => {
    const match = db.match('fire dragon');
    expect(match).not.toBeNull();
    expect(match!.entry.overrides.archetype).toBe('dragon');
    expect(match!.entry.overrides.bodyStructure).toBe('winged');
  });

  it('matches vampire', () => {
    const match = db.match('dark vampire lord');
    expect(match).not.toBeNull();
    expect(match!.entry.overrides.archetype).toBe('undead');
  });

  it('matches ninja', () => {
    const match = db.match('shadow ninja warrior');
    expect(match).not.toBeNull();
    expect(match!.entry.overrides.archetype).toBe('rogue');
  });

  it('returns null for unknown input', () => {
    const match = db.match('qzxwvutsrp');
    expect(match).toBeNull();
  });
});

describe('ConceptToEntityPipeline', () => {
  const pipeline = new ConceptToEntityPipeline();
  const rng = new DeterministicRNG('pipeline-test');

  it('produces entity blueprint from text', () => {
    const blueprint = pipeline.execute('chibi lightning dragon', rng);

    expect(blueprint.concept.archetype).toBe('dragon');
    expect(blueprint.concept.bodyStructure).toBe('winged');
    expect(blueprint.seed.$name).toBeDefined();
    expect(blueprint.skeletonType).toBe('winged');
    expect(blueprint.spriteConfig.frameWidth).toBe(128);
    expect(blueprint.spriteConfig.frameHeight).toBe(128);
    expect(blueprint.spriteConfig.animations.length).toBeGreaterThan(0);
    expect(blueprint.spriteConfig.animations).toContain('idle');
  });

  it('uses correct frame size for humanoid', () => {
    const blueprint = pipeline.execute('warrior knight', rng);
    expect(blueprint.spriteConfig.frameWidth).toBe(64);
    expect(blueprint.spriteConfig.frameHeight).toBe(64);
  });

  it('applies canonical overrides for Goku', () => {
    const blueprint = pipeline.execute('goku', rng);
    expect(blueprint.concept.style).toBe('anime');
    expect(blueprint.concept.elements).toContain('energy');
    expect(blueprint.concept.abilities.length).toBeGreaterThan(0);
  });

  it('applies canonical overrides for dragon', () => {
    const blueprint = pipeline.execute('fire dragon', rng);
    expect(blueprint.concept.archetype).toBe('dragon');
    expect(blueprint.concept.bodyStructure).toBe('winged');
    expect(blueprint.spriteConfig.frameWidth).toBe(128);
  });

  it('can disable canonical mode', () => {
    const blueprint = pipeline.execute('goku', rng, { useCanonical: false });
    expect(blueprint.concept.archetype).toBe('unknown');
  });
});

describe('AgenticCoCreator', () => {
  const creator = new AgenticCoCreator();
  const pipeline = new ConceptToEntityPipeline();
  const rng = new DeterministicRNG('co-create-test');

  function makeEntitySeed() {
    return pipeline.execute('warrior knight', rng).seed;
  }

  it('makes entity bigger', () => {
    const seed = makeEntitySeed();
    const result = creator.process(seed, 'make it bigger');
    expect(result.appliedMutations.length).toBeGreaterThan(0);
    expect(result.matchedIntents).toContain('Scaled up body proportions');

    const widthChange = result.appliedMutations.find((m) => m.subKey === 'torsoWidth');
    expect(widthChange).toBeDefined();
    expect(widthChange!.newValue).toBeGreaterThan(widthChange!.oldValue);
  });

  it('adds wings', () => {
    const seed = makeEntitySeed();
    const result = creator.process(seed, 'give it wings');
    const wingMut = result.appliedMutations.find((m) => m.subKey === 'hasWings');
    expect(wingMut).toBeDefined();
    expect(wingMut!.newValue).toBe(1.0);
  });

  it('makes entity more intimidating', () => {
    const seed = makeEntitySeed();
    const result = creator.process(seed, 'make it more intimidating');
    expect(result.matchedIntents.length).toBeGreaterThan(0);
    const hornMut = result.appliedMutations.find((m) => m.subKey === 'hasHorns');
    expect(hornMut).toBeDefined();
  });

  it('returns helpful message for unknown input', () => {
    const seed = makeEntitySeed();
    const result = creator.process(seed, 'xyzzy quantum flux');
    expect(result.appliedMutations.length).toBe(0);
    expect(result.explanation).toContain("didn't understand");
  });

  it('respects gene bounds', () => {
    const seed = makeEntitySeed();
    // Apply many times to push toward bounds
    let currentSeed = seed;
    for (let i = 0; i < 20; i++) {
      const result = creator.process(currentSeed, 'make it much bigger and more massive');
      currentSeed = result.modifiedSeed;
    }
    // Check no gene exceeds max
    const bodyParams = currentSeed.genes['bodyParams'];
    if (bodyParams?.type === 'struct') {
      const tw = bodyParams.value['torsoWidth'];
      if (tw?.type === 'scalar') {
        expect(tw.value).toBeLessThanOrEqual(tw.max);
      }
    }
  });
});
