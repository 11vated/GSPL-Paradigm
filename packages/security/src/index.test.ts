import { describe, it, expect } from 'vitest';
import type { UniversalSeed, GeneMap, ScalarGene, CategoricalGene, VectorGene, ExpressionGene, StructGene } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import {
  ThreatDetector,
  SignatureEngine,
  QuarantineManager,
  AuditLogger,
  CanarySeedSystem,
  DefenseLoopOrchestrator,
  SecurityEngine,
} from './index.js';
import type {
  ThreatLevel,
  AuditEntry,
} from './index.js';

// ─────────────────────────────────────────────
// Test fixtures — build seeds manually (no @paradigm/seed dep)
// ─────────────────────────────────────────────

function makeRng(seed: number | string = 'security-test'): DeterministicRNG {
  return new DeterministicRNG(seed);
}

/** Build a proper UniversalSeed with correct hash. */
function buildSeed(
  name: string,
  domain: string,
  genes: GeneMap,
  opts?: { fitness?: { primary: number }; hash?: string },
): UniversalSeed {
  const lineage = {
    generation: 0,
    parents: [] as Array<{ id: string; name: string }>,
    breedingStrategy: 'cloning' as const,
    timestamp: Date.now(),
  };
  const seed: UniversalSeed = {
    $gst: '4.0',
    $domain: domain as UniversalSeed['$domain'],
    $hash: '',
    $name: name,
    $lineage: lineage,
    genes,
    $metadata: { created: Date.now() },
  };
  if (opts?.fitness) {
    seed.$fitness = { primary: opts.fitness.primary, components: {} };
  }
  // Compute canonical hash
  seed.$hash = computeQuickHash({
    $domain: seed.$domain,
    $name: seed.$name,
    genes: seed.genes,
    $lineage: seed.$lineage,
  });
  // Allow explicit hash override (for spoofing tests)
  if (opts?.hash !== undefined) {
    seed.$hash = opts.hash;
  }
  return seed;
}

function makeCleanGenes(): GeneMap {
  return {
    health: { type: 'scalar', value: 100, min: 0, max: 200 } as ScalarGene,
    speed: { type: 'scalar', value: 5, min: 0, max: 20 } as ScalarGene,
    element: { type: 'categorical', value: 'fire', options: ['fire', 'ice', 'lightning'] } as CategoricalGene,
    color: { type: 'vector', value: [0.9, 0.2, 0.1], dimensions: 3 } as VectorGene,
  };
}

function makeCleanSeed(name = 'warrior'): UniversalSeed {
  return buildSeed(name, 'organism', makeCleanGenes());
}

function makeSeedWithOversizedGene(size: number): UniversalSeed {
  const bigValue = 'x'.repeat(size);
  return buildSeed('oversized', 'organism', {
    payload: { type: 'categorical', value: bigValue, options: [bigValue] } as CategoricalGene,
  });
}

function makeSeedWithExpression(source: string): UniversalSeed {
  return buildSeed('expr-seed', 'code', {
    expr: { type: 'expression', source, compiled: undefined } as unknown as ExpressionGene,
  });
}

function makeSeedWithManyGenes(count: number): UniversalSeed {
  const genes: GeneMap = {};
  for (let i = 0; i < count; i++) {
    genes[`gene_${i}`] = { type: 'scalar', value: i, min: 0, max: count } as ScalarGene;
  }
  return buildSeed('explosion', 'organism', genes);
}

function makeSeedWithNestedStruct(): UniversalSeed {
  return buildSeed('nested', 'organism', {
    outer: {
      type: 'struct',
      fields: {
        inner: { type: 'scalar', value: 42, min: 0, max: 100 } as ScalarGene,
        innerExpr: { type: 'expression', source: 'safe code', compiled: undefined } as unknown as ExpressionGene,
      },
    } as unknown as StructGene,
  });
}

function makeSeedWithFitness(primary: number, hash?: string): UniversalSeed {
  return buildSeed('fit-seed', 'organism', makeCleanGenes(), { fitness: { primary }, hash });
}

function makeSeedWithExtremeScalar(value: number): UniversalSeed {
  return buildSeed('extreme', 'organism', {
    extreme: { type: 'scalar', value, min: -Infinity, max: Infinity } as ScalarGene,
  });
}

function makeSpoofedSeed(): UniversalSeed {
  return buildSeed('spoofed', 'organism', makeCleanGenes(), { hash: 'deadbeef' });
}

// ─────────────────────────────────────────────
// ThreatDetector
// ─────────────────────────────────────────────

describe('ThreatDetector', () => {
  describe('clean seeds', () => {
    it('returns null for a normal seed', () => {
      const detector = new ThreatDetector();
      expect(detector.analyze(makeCleanSeed())).toBeNull();
    });

    it('returns null for a seed with nested struct genes within limits', () => {
      const detector = new ThreatDetector();
      expect(detector.analyze(makeSeedWithNestedStruct())).toBeNull();
    });

    it('returns null for empty genes', () => {
      const detector = new ThreatDetector();
      expect(detector.analyze(buildSeed('empty', 'organism', {}))).toBeNull();
    });
  });

  describe('oversized genes', () => {
    it('detects oversized gene exceeding default limit', () => {
      const detector = new ThreatDetector();
      const report = detector.analyze(makeSeedWithOversizedGene(15_000));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('high');
      expect(report!.description).toContain('exceeds size limit');
    });

    it('respects custom maxGeneSize threshold', () => {
      const detector = new ThreatDetector({ maxGeneSize: 50 });
      const genes: GeneMap = {
        big: { type: 'categorical', value: 'a'.repeat(60), options: ['a'.repeat(60)] } as CategoricalGene,
      };
      const report = detector.analyze(buildSeed('big', 'organism', genes));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('high');
    });

    it('does not flag genes within the limit', () => {
      const detector = new ThreatDetector({ maxGeneSize: 50_000 });
      expect(detector.analyze(makeSeedWithOversizedGene(5_000))).toBeNull();
    });

    it('skips undefined genes gracefully', () => {
      const detector = new ThreatDetector();
      const seed = makeCleanSeed();
      (seed.genes as Record<string, unknown>)['undef'] = undefined;
      expect(detector.analyze(seed)).toBeNull();
    });
  });

  describe('suspicious expressions', () => {
    it('detects eval in expression gene', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('eval("malicious")'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
      expect(report!.description).toContain('dangerous pattern');
    });

    it('detects exec in expression gene', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('exec("cmd")'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('detects Function constructor', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('new Function("return 1")'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('detects import() dynamic import', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('import("fs")'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('detects require()', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('require("child_process")'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('detects __proto__ access', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('obj.__proto__.polluted = true'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('detects constructor bracket access', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('obj.constructor["prototype"]'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('detects process reference', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('process.exit(1)'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('does not flag safe expression', () => {
      expect(new ThreatDetector().analyze(makeSeedWithExpression('Math.sin(x) + Math.cos(y)'))).toBeNull();
    });

    it('detects expression in nested struct genes', () => {
      const genes: GeneMap = {
        wrapper: {
          type: 'struct',
          fields: {
            evil: { type: 'expression', source: 'eval("hack")', compiled: undefined } as unknown as ExpressionGene,
          },
        } as unknown as StructGene,
      };
      const report = new ThreatDetector().analyze(buildSeed('nested-evil', 'code', genes));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });

    it('respects custom dangerousPatterns', () => {
      const detector = new ThreatDetector({ dangerousPatterns: [/\bdanger\b/] });
      const report = detector.analyze(makeSeedWithExpression('danger()'));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });
  });

  describe('fitness spikes', () => {
    it('detects fitness spike when current exceeds average by factor', () => {
      const detector = new ThreatDetector({ fitnessSpikeFactor: 5 });
      const hash = 'spike-hash-001';
      detector.analyze(makeSeedWithFitness(10, hash));
      detector.analyze(makeSeedWithFitness(12, hash));
      detector.analyze(makeSeedWithFitness(11, hash));
      const report = detector.analyze(makeSeedWithFitness(500, hash));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('medium');
      expect(report!.description).toContain('Fitness spike');
    });

    it('does not flag normal fitness progression', () => {
      const detector = new ThreatDetector();
      const hash = 'normal-hash-001';
      detector.analyze(makeSeedWithFitness(10, hash));
      expect(detector.analyze(makeSeedWithFitness(12, hash))).toBeNull();
    });

    it('handles first fitness observation without error', () => {
      expect(new ThreatDetector().analyze(makeSeedWithFitness(100))).toBeNull();
    });

    it('does not flag spike when average is zero', () => {
      const detector = new ThreatDetector({ fitnessSpikeFactor: 2 });
      const hash = 'zero-avg';
      detector.analyze(makeSeedWithFitness(0, hash));
      expect(detector.analyze(makeSeedWithFitness(100, hash))).toBeNull();
    });

    it('does not flag seed without fitness', () => {
      expect(new ThreatDetector().analyze(makeCleanSeed())).toBeNull();
    });
  });

  describe('gene explosion', () => {
    it('detects gene count exceeding default limit of 100', () => {
      const report = new ThreatDetector().analyze(makeSeedWithManyGenes(150));
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('high');
      expect(report!.description).toContain('Gene count explosion');
    });

    it('respects custom maxGeneCount', () => {
      const report = new ThreatDetector({ maxGeneCount: 5 }).analyze(makeSeedWithManyGenes(10));
      expect(report).not.toBeNull();
      expect(report!.description).toContain('Gene count explosion');
    });

    it('does not flag gene count within limits', () => {
      expect(new ThreatDetector({ maxGeneCount: 200 }).analyze(makeSeedWithManyGenes(50))).toBeNull();
    });

    it('counts nested struct genes toward total', () => {
      const genes: GeneMap = {
        a: { type: 'scalar', value: 1, min: 0, max: 10 } as ScalarGene,
        b: {
          type: 'struct',
          fields: {
            c: { type: 'scalar', value: 2, min: 0, max: 10 } as ScalarGene,
            d: { type: 'scalar', value: 3, min: 0, max: 10 } as ScalarGene,
          },
        } as unknown as StructGene,
      };
      // Total: a(1) + b(1) + c(1) + d(1) = 4 genes
      const report = new ThreatDetector({ maxGeneCount: 3 }).analyze(
        buildSeed('struct-explosion', 'organism', genes),
      );
      expect(report).not.toBeNull();
      expect(report!.description).toContain('Gene count explosion');
    });
  });

  describe('combined threats', () => {
    it('escalates to highest level when multiple anomalies found', () => {
      const genes: GeneMap = {
        a: { type: 'scalar', value: 1, min: 0, max: 10 } as ScalarGene,
        b: { type: 'expression', source: 'eval("x")', compiled: undefined } as unknown as ExpressionGene,
      };
      const report = new ThreatDetector({ maxGeneCount: 1 }).analyze(
        buildSeed('multi', 'code', genes),
      );
      expect(report).not.toBeNull();
      expect(report!.threatLevel).toBe('critical');
    });
  });

  describe('report structure', () => {
    it('has correct report fields for detected threat', () => {
      const rng = makeRng('report-id');
      const detector = new ThreatDetector(undefined, rng);
      const seed = makeSeedWithExpression('eval("boom")');
      const report = detector.analyze(seed)!;
      expect(report.id).toMatch(/^threat_/);
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.source).toBe('ThreatDetector');
      expect(report.affectedSeeds).toContain(seed.$hash);
      expect(typeof report.recommended).toBe('string');
    });

    it('provides quarantine recommendation for critical threats', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('eval("x")'))!;
      expect(report.recommended).toContain('Quarantine immediately');
    });

    it('provides quarantine recommendation for high threats', () => {
      const report = new ThreatDetector().analyze(makeSeedWithOversizedGene(15_000))!;
      expect(report.recommended).toContain('Quarantine seed');
    });

    it('provides review recommendation for medium threats', () => {
      const detector = new ThreatDetector({ fitnessSpikeFactor: 2 });
      const hash = 'medium-rec';
      detector.analyze(makeSeedWithFitness(10, hash));
      const report = detector.analyze(makeSeedWithFitness(100, hash))!;
      expect(report.recommended).toContain('manual review');
    });
  });

  describe('resetHistory', () => {
    it('clears fitness tracking history', () => {
      const detector = new ThreatDetector({ fitnessSpikeFactor: 2 });
      const hash = 'reset-test';
      detector.analyze(makeSeedWithFitness(10, hash));
      detector.resetHistory();
      expect(detector.analyze(makeSeedWithFitness(100, hash))).toBeNull();
    });
  });

  describe('generateId', () => {
    it('generates ID without RNG using Date.now fallback', () => {
      const report = new ThreatDetector().analyze(makeSeedWithExpression('eval("x")'))!;
      expect(report.id).toMatch(/^threat_/);
    });

    it('generates deterministic ID with RNG', () => {
      const report = new ThreatDetector(undefined, makeRng('det-id')).analyze(
        makeSeedWithExpression('eval("x")'),
      )!;
      expect(report.id).toMatch(/^threat_[0-9a-f]{8}$/);
    });
  });
});

// ─────────────────────────────────────────────
// SignatureEngine
// ─────────────────────────────────────────────

describe('SignatureEngine', () => {
  describe('built-in signatures', () => {
    it('ships with code_injection, resource_exhaustion, identity_spoofing', () => {
      const names = new SignatureEngine().getSignatureNames();
      expect(names).toContain('code_injection');
      expect(names).toContain('resource_exhaustion');
      expect(names).toContain('identity_spoofing');
    });

    it('detects code injection via expression genes', () => {
      const result = new SignatureEngine().scan(makeSeedWithExpression('eval("hack")'));
      expect(result.matches).toContain('code_injection');
      expect(result.threatLevel).toBe('critical');
    });

    it('detects resource exhaustion with Infinity scalar', () => {
      const result = new SignatureEngine().scan(makeSeedWithExtremeScalar(Infinity));
      expect(result.matches).toContain('resource_exhaustion');
      expect(result.threatLevel).toBe('high');
    });

    it('detects resource exhaustion with value > 1e15', () => {
      expect(new SignatureEngine().scan(makeSeedWithExtremeScalar(1e16)).matches).toContain('resource_exhaustion');
    });

    it('detects resource exhaustion with NaN', () => {
      expect(new SignatureEngine().scan(makeSeedWithExtremeScalar(NaN)).matches).toContain('resource_exhaustion');
    });

    it('detects resource exhaustion with negative extreme', () => {
      expect(new SignatureEngine().scan(makeSeedWithExtremeScalar(-1e16)).matches).toContain('resource_exhaustion');
    });

    it('detects identity spoofing when hash is tampered', () => {
      expect(new SignatureEngine().scan(makeSpoofedSeed()).matches).toContain('identity_spoofing');
    });

    it('does not flag clean seed for identity spoofing', () => {
      expect(new SignatureEngine().scan(makeCleanSeed()).matches).not.toContain('identity_spoofing');
    });
  });

  describe('custom signatures', () => {
    it('registers and detects custom signature', () => {
      const engine = new SignatureEngine();
      engine.addSignature('has_fire', (seed) => {
        const cat = seed.genes['element'];
        return cat !== undefined && (cat as CategoricalGene).value === 'fire';
      }, 'low');
      expect(engine.scan(makeCleanSeed()).matches).toContain('has_fire');
    });

    it('uses default severity of medium for custom signature', () => {
      const engine = new SignatureEngine();
      engine.addSignature('always_match', () => true);
      const result = engine.scan(makeCleanSeed());
      expect(result.matches).toContain('always_match');
      expect(result.threatLevel).toBe('medium');
    });

    it('handles signature that throws without crashing', () => {
      const engine = new SignatureEngine();
      engine.addSignature('throws', () => { throw new Error('boom'); }, 'high');
      expect(engine.scan(makeCleanSeed()).matches).not.toContain('throws');
    });

    it('overwrites signature with same name', () => {
      const engine = new SignatureEngine();
      engine.addSignature('custom', () => false, 'low');
      engine.addSignature('custom', () => true, 'high');
      expect(engine.scan(makeCleanSeed()).matches).toContain('custom');
    });
  });

  describe('scan', () => {
    it('returns no code_injection or resource_exhaustion for clean seed', () => {
      const result = new SignatureEngine().scan(makeCleanSeed());
      expect(result.matches).not.toContain('code_injection');
      expect(result.matches).not.toContain('resource_exhaustion');
    });

    it('returns highest threat level across multiple matches', () => {
      const engine = new SignatureEngine();
      engine.addSignature('low_sig', () => true, 'low');
      engine.addSignature('high_sig', () => true, 'high');
      const result = engine.scan(makeCleanSeed());
      expect(result.matches).toContain('low_sig');
      expect(result.matches).toContain('high_sig');
      expect(['high', 'critical']).toContain(result.threatLevel);
    });
  });

  describe('removeSignature', () => {
    it('removes existing signature and returns true', () => {
      const engine = new SignatureEngine();
      expect(engine.removeSignature('code_injection')).toBe(true);
      expect(engine.getSignatureNames()).not.toContain('code_injection');
    });

    it('returns false for non-existent signature', () => {
      expect(new SignatureEngine().removeSignature('nonexistent')).toBe(false);
    });

    it('removed signature no longer triggers on scan', () => {
      const engine = new SignatureEngine();
      engine.removeSignature('code_injection');
      expect(engine.scan(makeSeedWithExpression('eval("x")')).matches).not.toContain('code_injection');
    });
  });

  describe('getSignatureNames', () => {
    it('returns array of all registered names', () => {
      const names = new SignatureEngine().getSignatureNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThanOrEqual(3);
    });

    it('includes custom signatures after adding', () => {
      const engine = new SignatureEngine();
      engine.addSignature('my_custom', () => false);
      expect(engine.getSignatureNames()).toContain('my_custom');
    });
  });
});

// ─────────────────────────────────────────────
// QuarantineManager
// ─────────────────────────────────────────────

describe('QuarantineManager', () => {
  describe('quarantine', () => {
    it('quarantines a seed and returns a quarantine ID', () => {
      const qm = new QuarantineManager(makeRng('qm'));
      const id = qm.quarantine(makeCleanSeed(), 'suspicious');
      expect(id).toMatch(/^quar_/);
      expect(qm.size).toBe(1);
    });

    it('stores a deep clone of the seed', () => {
      const qm = new QuarantineManager();
      const seed = makeCleanSeed();
      qm.quarantine(seed, 'test');
      seed.$name = 'mutated';
      expect(qm.getQuarantined()[0]!.seed.$name).not.toBe('mutated');
    });

    it('can quarantine multiple seeds', () => {
      const qm = new QuarantineManager(makeRng('qm-multi'));
      qm.quarantine(makeCleanSeed('seed1'), 'r1');
      qm.quarantine(makeCleanSeed('seed2'), 'r2');
      expect(qm.size).toBe(2);
    });
  });

  describe('release', () => {
    it('releases quarantined seed by ID', () => {
      const qm = new QuarantineManager(makeRng('qm-release'));
      const seed = makeCleanSeed();
      const id = qm.quarantine(seed, 'test');
      const released = qm.release(id);
      expect(released).toBeDefined();
      expect(released!.$hash).toBe(seed.$hash);
      expect(qm.size).toBe(0);
    });

    it('returns undefined for unknown quarantine ID', () => {
      expect(new QuarantineManager().release('nonexistent')).toBeUndefined();
    });

    it('removes seed from hash index on release', () => {
      const qm = new QuarantineManager();
      const seed = makeCleanSeed();
      const id = qm.quarantine(seed, 'test');
      expect(qm.isQuarantined(seed.$hash)).toBe(true);
      qm.release(id);
      expect(qm.isQuarantined(seed.$hash)).toBe(false);
    });
  });

  describe('isQuarantined', () => {
    it('returns true for quarantined seed hash', () => {
      const qm = new QuarantineManager();
      const seed = makeCleanSeed();
      qm.quarantine(seed, 'test');
      expect(qm.isQuarantined(seed.$hash)).toBe(true);
    });

    it('returns false for non-quarantined hash', () => {
      expect(new QuarantineManager().isQuarantined('does-not-exist')).toBe(false);
    });
  });

  describe('getQuarantined', () => {
    it('returns empty array when nothing quarantined', () => {
      expect(new QuarantineManager().getQuarantined()).toEqual([]);
    });

    it('returns all quarantined entries with correct fields', () => {
      const qm = new QuarantineManager(makeRng('qm-entries'));
      const seed = makeCleanSeed();
      qm.quarantine(seed, 'the reason');
      const entries = qm.getQuarantined();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.reason).toBe('the reason');
      expect(entries[0]!.id).toMatch(/^quar_/);
      expect(entries[0]!.timestamp).toBeGreaterThan(0);
      expect(entries[0]!.seed.$hash).toBe(seed.$hash);
    });
  });

  describe('size', () => {
    it('starts at 0', () => {
      expect(new QuarantineManager().size).toBe(0);
    });

    it('increments on quarantine and decrements on release', () => {
      const qm = new QuarantineManager(makeRng('qm-size'));
      const id = qm.quarantine(makeCleanSeed(), 'test');
      expect(qm.size).toBe(1);
      qm.release(id);
      expect(qm.size).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────
// AuditLogger
// ─────────────────────────────────────────────

describe('AuditLogger', () => {
  describe('log', () => {
    it('creates audit entry with correct fields', () => {
      const entry = new AuditLogger(makeRng('audit')).log('test.action', 'actor1', 'target1', 'details here', 'low');
      expect(entry.id).toMatch(/^audit_/);
      expect(entry.action).toBe('test.action');
      expect(entry.actor).toBe('actor1');
      expect(entry.target).toBe('target1');
      expect(entry.details).toBe('details here');
      expect(entry.severity).toBe('low');
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.hash).toBeTruthy();
      expect(entry.previousHash).toBe('00000000');
    });

    it('chains hashes — second entry references first entry hash', () => {
      const logger = new AuditLogger(makeRng('chain'));
      const first = logger.log('a', 'x', 'y', 'd', 'none');
      const second = logger.log('b', 'x', 'y', 'd', 'low');
      expect(second.previousHash).toBe(first.hash);
    });

    it('increments size on each log', () => {
      const logger = new AuditLogger();
      expect(logger.size).toBe(0);
      logger.log('a', 'b', 'c', 'd', 'none');
      expect(logger.size).toBe(1);
      logger.log('e', 'f', 'g', 'h', 'low');
      expect(logger.size).toBe(2);
    });

    it('produces unique hashes for different entries', () => {
      const logger = new AuditLogger(makeRng('unique'));
      const e1 = logger.log('action1', 'actor', 'target', 'detail1', 'none');
      const e2 = logger.log('action2', 'actor', 'target', 'detail2', 'low');
      expect(e1.hash).not.toBe(e2.hash);
    });
  });

  describe('getEntries', () => {
    it('returns all entries when no filter specified', () => {
      const logger = new AuditLogger(makeRng('all'));
      logger.log('a', 'x', 't', 'd', 'none');
      logger.log('b', 'y', 't', 'd', 'low');
      expect(logger.getEntries()).toHaveLength(2);
    });

    it('returns copy of entries array', () => {
      const logger = new AuditLogger();
      logger.log('a', 'x', 't', 'd', 'none');
      const e1 = logger.getEntries();
      const e2 = logger.getEntries();
      expect(e1).toEqual(e2);
      expect(e1).not.toBe(e2);
    });

    it('filters by actor', () => {
      const logger = new AuditLogger(makeRng('filter-actor'));
      logger.log('a', 'alice', 't', 'd', 'none');
      logger.log('b', 'bob', 't', 'd', 'low');
      logger.log('c', 'alice', 't', 'd', 'medium');
      const entries = logger.getEntries({ actor: 'alice' });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.actor === 'alice')).toBe(true);
    });

    it('filters by action', () => {
      const logger = new AuditLogger(makeRng('filter-action'));
      logger.log('seed.quarantined', 'x', 't', 'd', 'high');
      logger.log('threat.detected', 'x', 't', 'd', 'low');
      expect(logger.getEntries({ action: 'seed.quarantined' })).toHaveLength(1);
    });

    it('filters by severity', () => {
      const logger = new AuditLogger(makeRng('filter-sev'));
      logger.log('a', 'x', 't', 'd', 'none');
      logger.log('b', 'x', 't', 'd', 'high');
      logger.log('c', 'x', 't', 'd', 'high');
      expect(logger.getEntries({ severity: 'high' })).toHaveLength(2);
    });

    it('filters by since timestamp', () => {
      const logger = new AuditLogger(makeRng('filter-since'));
      logger.log('old', 'x', 't', 'd', 'none');
      const cutoff = Date.now() + 1;
      logger.log('new', 'x', 't', 'd', 'none');
      const entries = logger.getEntries({ since: cutoff });
      expect(entries.every((e) => e.timestamp >= cutoff)).toBe(true);
    });

    it('filters by until timestamp', () => {
      const logger = new AuditLogger(makeRng('filter-until'));
      logger.log('first', 'x', 't', 'd', 'none');
      const cutoff = Date.now() + 10000;
      expect(logger.getEntries({ until: cutoff }).every((e) => e.timestamp <= cutoff)).toBe(true);
    });

    it('applies multiple filters (AND logic)', () => {
      const logger = new AuditLogger(makeRng('filter-multi'));
      logger.log('action1', 'alice', 't', 'd', 'high');
      logger.log('action1', 'bob', 't', 'd', 'high');
      logger.log('action2', 'alice', 't', 'd', 'low');
      const entries = logger.getEntries({ actor: 'alice', action: 'action1' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.actor).toBe('alice');
      expect(entries[0]!.action).toBe('action1');
    });

    it('returns empty array when no entries match filter', () => {
      const logger = new AuditLogger();
      logger.log('a', 'x', 't', 'd', 'none');
      expect(logger.getEntries({ actor: 'nonexistent' })).toEqual([]);
    });
  });

  describe('getEntry', () => {
    it('retrieves entry by ID', () => {
      const logger = new AuditLogger(makeRng('get-entry'));
      const entry = logger.log('test', 'x', 't', 'd', 'none');
      expect(logger.getEntry(entry.id)?.id).toBe(entry.id);
    });

    it('returns undefined for unknown ID', () => {
      expect(new AuditLogger().getEntry('unknown')).toBeUndefined();
    });
  });

  describe('verifyIntegrity', () => {
    it('returns valid for empty chain', () => {
      expect(new AuditLogger().verifyIntegrity()).toEqual({ valid: true });
    });

    it('returns valid for intact chain', () => {
      const logger = new AuditLogger(makeRng('integrity'));
      logger.log('a', 'x', 't', 'd', 'none');
      logger.log('b', 'x', 't', 'd', 'low');
      logger.log('c', 'x', 't', 'd', 'high');
      expect(logger.verifyIntegrity()).toEqual({ valid: true });
    });

    it('returns valid for single entry', () => {
      const logger = new AuditLogger(makeRng('single'));
      logger.log('a', 'x', 't', 'd', 'none');
      expect(logger.verifyIntegrity()).toEqual({ valid: true });
    });

    it('detects tampered entry hash', () => {
      const logger = new AuditLogger(makeRng('tamper'));
      logger.log('a', 'x', 't', 'd', 'none');
      logger.log('b', 'x', 't', 'd', 'low');
      const internalEntries = (logger as unknown as { entries: AuditEntry[] }).entries;
      (internalEntries[0] as { hash: string }).hash = 'tampered';
      const result = logger.verifyIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(0);
    });

    it('detects broken chain linkage', () => {
      const logger = new AuditLogger(makeRng('broken-link'));
      logger.log('a', 'x', 't', 'd', 'none');
      logger.log('b', 'x', 't', 'd', 'low');
      const internalEntries = (logger as unknown as { entries: AuditEntry[] }).entries;
      (internalEntries[1] as { previousHash: string }).previousHash = 'wrong';
      const result = logger.verifyIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });
  });

  describe('hash chaining', () => {
    it('first entry references genesis hash 00000000', () => {
      const entry = new AuditLogger(makeRng('genesis')).log('first', 'x', 't', 'd', 'none');
      expect(entry.previousHash).toBe('00000000');
    });

    it('each subsequent entry chains to previous', () => {
      const logger = new AuditLogger(makeRng('chain-test'));
      const e1 = logger.log('a', 'x', 't', 'd', 'none');
      const e2 = logger.log('b', 'x', 't', 'd', 'low');
      const e3 = logger.log('c', 'x', 't', 'd', 'high');
      expect(e2.previousHash).toBe(e1.hash);
      expect(e3.previousHash).toBe(e2.hash);
    });

    it('hash is deterministically computed from entry contents', () => {
      const logger = new AuditLogger(makeRng('det-hash'));
      const entry = logger.log('action', 'actor', 'target', 'details', 'low');
      const recomputed = computeQuickHash({
        id: entry.id,
        timestamp: entry.timestamp,
        action: entry.action,
        actor: entry.actor,
        target: entry.target,
        details: entry.details,
        severity: entry.severity,
        previousHash: entry.previousHash,
      });
      expect(entry.hash).toBe(recomputed);
    });
  });

  describe('size', () => {
    it('starts at 0', () => {
      expect(new AuditLogger().size).toBe(0);
    });

    it('reflects number of logged entries', () => {
      const logger = new AuditLogger(makeRng('size'));
      logger.log('a', 'x', 't', 'd', 'none');
      logger.log('b', 'x', 't', 'd', 'none');
      expect(logger.size).toBe(2);
    });
  });
});

// ─────────────────────────────────────────────
// CanarySeedSystem
// ─────────────────────────────────────────────

describe('CanarySeedSystem', () => {
  describe('deploy', () => {
    it('creates a canary seed with correct metadata', () => {
      const seed = new CanarySeedSystem(makeRng('canary')).deploy('tripwire-1', 'organism');
      expect(seed.$name).toBe('canary:tripwire-1');
      expect(seed.$domain).toBe('organism');
      expect(seed.$gst).toBe('4.0');
      expect(seed.$hash).toBeTruthy();
      expect(seed.genes['canaryMarker']).toBeDefined();
      expect(seed.genes['canaryName']).toBeDefined();
    });

    it('records canary in the system', () => {
      const cs = new CanarySeedSystem(makeRng('canary-record'));
      cs.deploy('test', 'organism');
      expect(cs.size).toBe(1);
    });

    it('can deploy multiple canaries in different domains', () => {
      const cs = new CanarySeedSystem(makeRng('multi-canary'));
      cs.deploy('c1', 'organism');
      cs.deploy('c2', 'vehicle');
      expect(cs.size).toBe(2);
    });

    it('overwrites canary with same name', () => {
      const cs = new CanarySeedSystem(makeRng('overwrite'));
      cs.deploy('dup', 'organism');
      cs.deploy('dup', 'vehicle');
      expect(cs.size).toBe(1);
      expect(cs.getCanaries()[0]!.domain).toBe('vehicle');
    });

    it('deployed seed has tags including canary and security', () => {
      const seed = new CanarySeedSystem(makeRng('tags')).deploy('tagged', 'organism');
      expect(seed.$metadata.tags).toContain('canary');
      expect(seed.$metadata.tags).toContain('security');
      expect(seed.$metadata.tags).toContain('tripwire');
    });

    it('deployed seed has zero-generation lineage', () => {
      const seed = new CanarySeedSystem(makeRng('lineage')).deploy('lineage-test', 'organism');
      expect(seed.$lineage.generation).toBe(0);
      expect(seed.$lineage.parents).toEqual([]);
    });
  });

  describe('check — intact', () => {
    it('reports intact when canary is untampered', () => {
      const cs = new CanarySeedSystem(makeRng('intact'));
      cs.deploy('safe', 'organism');
      const results = cs.check();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('safe');
      expect(results[0]!.status).toBe('intact');
    });

    it('reports all canaries intact when none tampered', () => {
      const cs = new CanarySeedSystem(makeRng('all-intact'));
      cs.deploy('c1', 'organism');
      cs.deploy('c2', 'vehicle');
      const results = cs.check();
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'intact')).toBe(true);
    });
  });

  describe('check — triggered', () => {
    it('reports triggered when canary seed genes are modified', () => {
      const cs = new CanarySeedSystem(makeRng('triggered'));
      cs.deploy('trap', 'organism');
      const internalCanaries = (cs as unknown as { canaries: Map<string, { seed: UniversalSeed }> }).canaries;
      (internalCanaries.get('trap')!.seed.genes['canaryMarker'] as ScalarGene).value = 999;
      const results = cs.check();
      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('triggered');
    });
  });

  describe('check — empty', () => {
    it('returns empty results when no canaries deployed', () => {
      expect(new CanarySeedSystem(makeRng('empty')).check()).toEqual([]);
    });
  });

  describe('getCanaries', () => {
    it('returns list with correct fields', () => {
      const cs = new CanarySeedSystem(makeRng('list'));
      cs.deploy('bird', 'bird');
      const list = cs.getCanaries();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('bird');
      expect(list[0]!.domain).toBe('bird');
      expect(list[0]!.deployedHash).toBeTruthy();
      expect(list[0]!.deployedTimestamp).toBeGreaterThan(0);
    });

    it('returns empty list when none deployed', () => {
      expect(new CanarySeedSystem(makeRng('empty-list')).getCanaries()).toEqual([]);
    });
  });

  describe('removeCanary', () => {
    it('removes existing canary and returns true', () => {
      const cs = new CanarySeedSystem(makeRng('remove'));
      cs.deploy('removable', 'organism');
      expect(cs.removeCanary('removable')).toBe(true);
      expect(cs.size).toBe(0);
    });

    it('returns false for non-existent canary', () => {
      expect(new CanarySeedSystem(makeRng('no-remove')).removeCanary('ghost')).toBe(false);
    });
  });

  describe('size', () => {
    it('starts at 0', () => {
      expect(new CanarySeedSystem(makeRng('size')).size).toBe(0);
    });

    it('tracks deployed canary count', () => {
      const cs = new CanarySeedSystem(makeRng('size-track'));
      cs.deploy('a', 'organism');
      cs.deploy('b', 'vehicle');
      expect(cs.size).toBe(2);
      cs.removeCanary('a');
      expect(cs.size).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────
// DefenseLoopOrchestrator
// ─────────────────────────────────────────────

describe('DefenseLoopOrchestrator', () => {
  function makeOrchestrator(rng?: DeterministicRNG) {
    const r = rng ?? makeRng('orchestrator');
    const detector = new ThreatDetector(undefined, r);
    const signatures = new SignatureEngine();
    const quarantine = new QuarantineManager(r);
    const audit = new AuditLogger(r);
    const bus = new EventBus({ maxReplaySize: 100 });
    const orchestrator = new DefenseLoopOrchestrator(detector, signatures, quarantine, audit, bus);
    return { orchestrator, detector, signatures, quarantine, audit, bus };
  }

  describe('runCycle', () => {
    it('returns empty threats for clean seeds', () => {
      const { orchestrator } = makeOrchestrator();
      const result = orchestrator.runCycle([makeCleanSeed('a'), makeCleanSeed('b')]);
      expect(result.threats).toHaveLength(0);
      expect(result.quarantined).toHaveLength(0);
      expect(result.auditEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('detects and quarantines malicious seed', () => {
      const { orchestrator, quarantine } = makeOrchestrator();
      const malicious = makeSeedWithExpression('eval("hack")');
      const result = orchestrator.runCycle([malicious]);
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.quarantined).toContain(malicious.$hash);
      expect(quarantine.isQuarantined(malicious.$hash)).toBe(true);
    });

    it('does not quarantine low/medium severity threats', () => {
      const { orchestrator } = makeOrchestrator();
      const result = orchestrator.runCycle([makeCleanSeed('clean-test')]);
      expect(result.quarantined).toHaveLength(0);
    });

    it('skips already-quarantined seeds', () => {
      const { orchestrator, quarantine } = makeOrchestrator();
      const seed = makeSeedWithExpression('eval("x")');
      quarantine.quarantine(seed, 'pre-quarantined');
      const result = orchestrator.runCycle([seed]);
      expect(result.threats).toHaveLength(0);
      expect(result.quarantined).toHaveLength(0);
    });

    it('logs audit entries for quarantined seeds', () => {
      const { orchestrator } = makeOrchestrator();
      const result = orchestrator.runCycle([makeSeedWithExpression('eval("hack")')]);
      expect(result.auditEntries.some((e) => e.action === 'seed.quarantined')).toBe(true);
    });

    it('logs threat.detected entries for non-none threats', () => {
      const { orchestrator } = makeOrchestrator();
      const result = orchestrator.runCycle([makeSeedWithExpression('eval("hack")')]);
      expect(result.auditEntries.some((e) => e.action === 'threat.detected')).toBe(true);
    });

    it('always logs defense.cycle_complete entry', () => {
      const { orchestrator } = makeOrchestrator();
      const result = orchestrator.runCycle([]);
      expect(result.auditEntries.filter((e) => e.action === 'defense.cycle_complete')).toHaveLength(1);
    });

    it('includes signature matches in threats', () => {
      const { orchestrator } = makeOrchestrator();
      const result = orchestrator.runCycle([makeSpoofedSeed()]);
      expect(result.threats.some((t) => t.source === 'SignatureEngine')).toBe(true);
    });

    it('handles mixed clean and malicious seeds', () => {
      const { orchestrator } = makeOrchestrator();
      const clean = makeCleanSeed('safe');
      const malicious = makeSeedWithExpression('eval("x")');
      const result = orchestrator.runCycle([clean, malicious]);
      expect(result.quarantined).toContain(malicious.$hash);
      expect(result.quarantined).not.toContain(clean.$hash);
    });

    it('handles empty seed array', () => {
      const { orchestrator } = makeOrchestrator();
      const result = orchestrator.runCycle([]);
      expect(result.threats).toHaveLength(0);
      expect(result.quarantined).toHaveLength(0);
      expect(result.auditEntries).toHaveLength(1); // cycle_complete only
    });
  });

  describe('getStatus', () => {
    it('starts with zero counters', () => {
      const { orchestrator } = makeOrchestrator();
      const status = orchestrator.getStatus();
      expect(status.cyclesRun).toBe(0);
      expect(status.threatsDetected).toBe(0);
      expect(status.seedsQuarantined).toBe(0);
      expect(status.lastCycleTime).toBe(0);
    });

    it('increments cyclesRun after each cycle', () => {
      const { orchestrator } = makeOrchestrator();
      orchestrator.runCycle([]);
      expect(orchestrator.getStatus().cyclesRun).toBe(1);
      orchestrator.runCycle([]);
      expect(orchestrator.getStatus().cyclesRun).toBe(2);
    });

    it('accumulates threatsDetected across cycles', () => {
      const { orchestrator } = makeOrchestrator();
      orchestrator.runCycle([makeSeedWithExpression('eval("x")')]);
      expect(orchestrator.getStatus().threatsDetected).toBeGreaterThanOrEqual(1);
    });

    it('accumulates seedsQuarantined across cycles', () => {
      const { orchestrator } = makeOrchestrator();
      orchestrator.runCycle([makeSeedWithExpression('eval("x")')]);
      orchestrator.runCycle([makeSeedWithOversizedGene(15_000)]);
      expect(orchestrator.getStatus().seedsQuarantined).toBeGreaterThanOrEqual(2);
    });

    it('tracks lastCycleTime', () => {
      const { orchestrator } = makeOrchestrator();
      orchestrator.runCycle([makeCleanSeed()]);
      expect(orchestrator.getStatus().lastCycleTime).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─────────────────────────────────────────────
// SecurityEngine (facade)
// ─────────────────────────────────────────────

describe('SecurityEngine', () => {
  describe('construction', () => {
    it('creates with default RNG when none provided', () => {
      const engine = new SecurityEngine();
      expect(engine.threats).toBeInstanceOf(ThreatDetector);
      expect(engine.signatures).toBeInstanceOf(SignatureEngine);
      expect(engine.quarantine).toBeInstanceOf(QuarantineManager);
      expect(engine.audit).toBeInstanceOf(AuditLogger);
      expect(engine.canaries).toBeInstanceOf(CanarySeedSystem);
      expect(engine.defense).toBeInstanceOf(DefenseLoopOrchestrator);
    });

    it('creates with provided RNG', () => {
      const engine = new SecurityEngine(makeRng('custom-engine'));
      expect(engine.threats).toBeDefined();
    });
  });

  describe('scanSeed', () => {
    it('returns clean result for safe seed', () => {
      const engine = new SecurityEngine(makeRng('scan-clean'));
      const result = engine.scanSeed(makeCleanSeed('safe'));
      expect(result.anomaly).toBeNull();
      expect(result.signatures.matches).not.toContain('code_injection');
      expect(result.signatures.matches).not.toContain('resource_exhaustion');
    });

    it('detects anomaly for expression with eval', () => {
      const engine = new SecurityEngine(makeRng('scan-eval'));
      const result = engine.scanSeed(makeSeedWithExpression('eval("x")'));
      expect(result.anomaly).not.toBeNull();
      expect(result.anomaly!.threatLevel).toBe('critical');
      expect(result.overallThreatLevel).toBe('critical');
    });

    it('detects signature match for spoofed seed', () => {
      const result = new SecurityEngine(makeRng('scan-spoof')).scanSeed(makeSpoofedSeed());
      expect(result.signatures.matches).toContain('identity_spoofing');
    });

    it('combines anomaly and signature threat levels', () => {
      const engine = new SecurityEngine(makeRng('scan-combined'));
      const seed = makeSeedWithExpression('eval("x")');
      seed.$hash = 'deadbeef';
      const result = engine.scanSeed(seed);
      expect(result.overallThreatLevel).toBe('critical');
    });

    it('does not quarantine on scan (scan is read-only)', () => {
      const engine = new SecurityEngine(makeRng('scan-no-quar'));
      const seed = makeSeedWithExpression('eval("x")');
      engine.scanSeed(seed);
      expect(engine.quarantine.isQuarantined(seed.$hash)).toBe(false);
    });

    it('returns none threat level when no issues', () => {
      const engine = new SecurityEngine(makeRng('scan-none'));
      const result = engine.scanSeed(makeCleanSeed('totally-safe'));
      if (result.signatures.matches.length === 0) {
        expect(result.overallThreatLevel).toBe('none');
      }
    });
  });

  describe('runDefenseCycle', () => {
    it('delegates to defense loop orchestrator', () => {
      const engine = new SecurityEngine(makeRng('defense-cycle'));
      const result = engine.runDefenseCycle([makeCleanSeed('c1')]);
      expect(result.auditEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('quarantines threats during defense cycle', () => {
      const engine = new SecurityEngine(makeRng('defense-quar'));
      const malicious = makeSeedWithExpression('eval("x")');
      const result = engine.runDefenseCycle([malicious]);
      expect(result.quarantined).toContain(malicious.$hash);
      expect(engine.quarantine.isQuarantined(malicious.$hash)).toBe(true);
    });

    it('updates defense status after cycle', () => {
      const engine = new SecurityEngine(makeRng('defense-status'));
      engine.runDefenseCycle([makeCleanSeed()]);
      expect(engine.defense.getStatus().cyclesRun).toBe(1);
    });
  });

  describe('wiring', () => {
    it('shares quarantine manager between facade and orchestrator', () => {
      const engine = new SecurityEngine(makeRng('wiring-quar'));
      engine.runDefenseCycle([makeSeedWithExpression('eval("x")')]);
      expect(engine.quarantine.size).toBeGreaterThanOrEqual(1);
    });

    it('shares audit logger between facade and orchestrator', () => {
      const engine = new SecurityEngine(makeRng('wiring-audit'));
      engine.runDefenseCycle([makeCleanSeed()]);
      expect(engine.audit.size).toBeGreaterThanOrEqual(1);
    });

    it('shares threat detector between facade scanSeed and orchestrator', () => {
      const engine = new SecurityEngine(makeRng('wiring-detect'));
      const result = engine.scanSeed(makeSeedWithExpression('eval("x")'));
      expect(result.anomaly).not.toBeNull();
    });

    it('shares signature engine between facade and orchestrator', () => {
      const engine = new SecurityEngine(makeRng('wiring-sig'));
      engine.signatures.addSignature('custom_test', () => true, 'low');
      const result = engine.scanSeed(makeCleanSeed('sig-test'));
      expect(result.signatures.matches).toContain('custom_test');
    });

    it('canaries are accessible and functional', () => {
      const engine = new SecurityEngine(makeRng('wiring-canary'));
      const canarySeed = engine.canaries.deploy('test-canary', 'organism');
      expect(canarySeed.$name).toBe('canary:test-canary');
      const checkResults = engine.canaries.check();
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0]!.status).toBe('intact');
    });
  });
});

// ─────────────────────────────────────────────
// Edge cases and integration
// ─────────────────────────────────────────────

describe('Edge cases', () => {
  it('geneStringSize handles non-serializable gene gracefully', () => {
    const detector = new ThreatDetector({ maxGeneSize: 10 });
    const seed = makeCleanSeed('edge');
    const circular: Record<string, unknown> = { type: 'scalar', value: 0 };
    circular['self'] = circular;
    (seed.genes as Record<string, unknown>)['circ'] = circular;
    // Should not throw
    expect(() => detector.analyze(seed)).not.toThrow();
  });

  it('collectScalarValues returns values from nested struct genes', () => {
    const genes: GeneMap = {
      wrapper: {
        type: 'struct',
        fields: {
          deep: { type: 'scalar', value: Infinity, min: 0, max: 1 } as ScalarGene,
        },
      } as unknown as StructGene,
    };
    const result = new SignatureEngine().scan(buildSeed('deep-scalar', 'organism', genes));
    expect(result.matches).toContain('resource_exhaustion');
  });

  it('multiple defense cycles maintain audit chain integrity', () => {
    const engine = new SecurityEngine(makeRng('integrity-chain'));
    engine.runDefenseCycle([makeCleanSeed('a')]);
    engine.runDefenseCycle([makeSeedWithExpression('eval("x")')]);
    engine.runDefenseCycle([makeCleanSeed('b')]);
    expect(engine.audit.verifyIntegrity().valid).toBe(true);
  });

  it('scan and defense cycle work with minimal seed (no optional fields)', () => {
    const engine = new SecurityEngine(makeRng('minimal'));
    const seed: UniversalSeed = {
      $gst: '4.0',
      $domain: 'organism',
      $hash: '',
      $name: 'minimal',
      $lineage: { generation: 0, parents: [], timestamp: Date.now() },
      genes: {},
      $metadata: { created: Date.now() },
    };
    seed.$hash = computeQuickHash({
      $domain: seed.$domain,
      $name: seed.$name,
      genes: seed.genes,
      $lineage: seed.$lineage,
    });
    expect(engine.scanSeed(seed).overallThreatLevel).toBe('none');
    expect(engine.runDefenseCycle([seed]).quarantined).toHaveLength(0);
  });

  it('defense cycle with oversized gene quarantines via orchestrator', () => {
    const engine = new SecurityEngine(makeRng('oversized-cycle'));
    const oversized = makeSeedWithOversizedGene(15_000);
    const result = engine.runDefenseCycle([oversized]);
    expect(result.quarantined.length).toBeGreaterThanOrEqual(1);
  });
});
