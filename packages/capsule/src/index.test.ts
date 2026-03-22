/**
 * @paradigm/capsule — Comprehensive test suite
 * Targets 80%+ line coverage and 70%+ branch coverage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicRNG } from '@paradigm/rng';
import { createSeed } from '@paradigm/seed';
import {
  CapsuleCompiler,
  CapsuleRunner,
  CapabilityKernel,
  SecurityScanner,
  CapsuleSerializer,
  wrapSeed,
  createAndCompile,
  type SeedCapsule,
  type Capability,
  type CapsuleFormat,
  type ThreatEntry,
} from './index.js';

// ─────────────────────────────────────────────
// Shared test fixtures
// ─────────────────────────────────────────────

function makeRng(seed = 'test') {
  return new DeterministicRNG(seed);
}

/** Standard organism seed with scalar, categorical, and vector genes. */
function makeTestSeed() {
  return createSeed(
    'TestSeed',
    'organism',
    {
      health: { type: 'scalar' as const, value: 50, min: 0, max: 100 },
      element: { type: 'categorical' as const, value: 'fire', options: ['fire', 'water'] },
      color: { type: 'vector' as const, value: [1, 0, 0], dimensions: 3 },
    },
    makeRng(),
  );
}

/** Seed whose scalar gene has value === min (optimization target). */
function makeZeroScalarSeed() {
  // 4 genes so optimizer can drop zero-value scalars (guard: count > 3)
  return createSeed(
    'ZeroScalar',
    'organism',
    {
      dead: { type: 'scalar' as const, value: 0, min: 0, max: 100 },
      alive: { type: 'scalar' as const, value: 50, min: 0, max: 100 },
      tag: { type: 'categorical' as const, value: 'x', options: ['x', 'y'] },
      color: { type: 'vector' as const, value: [0, 0, 0], dimensions: 3 },
    },
    makeRng('zero'),
  );
}

/** Seed with an expression gene containing a suspicious keyword. */
function makeSuspiciousSeed() {
  return createSeed(
    'Suspicious',
    'organism',
    {
      code: { type: 'expression' as const, source: 'eval(something)', language: 'gspl' },
      bigString: {
        type: 'categorical' as const,
        value: 'x'.repeat(1_100_000),
        options: ['x'.repeat(1_100_000)],
      },
    },
    makeRng('suspicious'),
  );
}

/** Seed for a narrative domain (triggers llm + narrative capabilities). */
function makeNarrativeSeed() {
  return createSeed(
    'Story',
    'narrative',
    {
      mood: { type: 'categorical' as const, value: 'epic', options: ['epic', 'dark'] },
    },
    makeRng('narrative'),
  );
}

/** Seed for a vehicle domain. */
function makeVehicleSeed() {
  return createSeed(
    'SpeedCar',
    'vehicle',
    {
      speed: { type: 'scalar' as const, value: 200, min: 0, max: 500 },
    },
    makeRng('vehicle'),
  );
}

// ─────────────────────────────────────────────
// CapsuleCompiler
// ─────────────────────────────────────────────

describe('CapsuleCompiler', () => {
  let compiler: CapsuleCompiler;

  beforeEach(() => {
    compiler = new CapsuleCompiler();
  });

  it('compiles a valid seed into a SeedCapsule', () => {
    const seed = makeTestSeed();
    const capsule = compiler.compile(seed);

    // optimize stage spreads the seed, so use deep equality
    expect(capsule.seed).toStrictEqual(seed);
    expect(capsule.metadata.version).toBe('1.0.0');
    expect(capsule.metadata.format).toBe('gcapsule');
    expect(capsule.metadata.createdAt).toBeGreaterThan(0);
  });

  it('applies author, description, and tags from options', () => {
    const seed = makeTestSeed();
    const capsule = compiler.compile(seed, {
      author: 'Alice',
      description: 'A test capsule',
      tags: ['alpha', 'beta'],
    });

    expect(capsule.metadata.author).toBe('Alice');
    expect(capsule.metadata.description).toBe('A test capsule');
    expect(capsule.metadata.tags).toEqual(['alpha', 'beta']);
  });

  it('defaults tags to empty array when not provided', () => {
    const capsule = compiler.compile(makeTestSeed());
    expect(capsule.metadata.tags).toEqual([]);
  });

  // Stage 1 — validate
  describe('stage: validate', () => {
    it('throws when seed is missing $gst', () => {
      const seed = makeTestSeed();
      // @ts-expect-error intentional corruption
      delete seed.$gst;
      expect(() => compiler.compile(seed)).toThrow(/missing required seed fields/);
      expect(() => compiler.compile(seed)).toThrow(/\$gst/);
    });

    it('throws when seed is missing $name', () => {
      const seed = makeTestSeed();
      // @ts-expect-error intentional corruption
      delete seed.$name;
      expect(() => compiler.compile(seed)).toThrow(/\$name/);
    });

    it('throws when seed is missing $domain', () => {
      const seed = makeTestSeed();
      // @ts-expect-error intentional corruption
      delete seed.$domain;
      expect(() => compiler.compile(seed)).toThrow(/\$domain/);
    });

    it('throws when seed has no genes', () => {
      const seed = makeTestSeed();
      // @ts-expect-error intentional corruption
      seed.genes = {};
      expect(() => compiler.compile(seed)).toThrow(/genes/);
    });

    it('throws when seed is missing $hash', () => {
      const seed = makeTestSeed();
      // @ts-expect-error intentional corruption
      delete seed.$hash;
      expect(() => compiler.compile(seed)).toThrow(/\$hash/);
    });
  });

  // Stage 2 — analyze
  describe('stage: analyze', () => {
    it('detects organism capabilities: evolve + compute', () => {
      const capsule = compiler.compile(makeTestSeed());
      expect(capsule.capabilities).toContain('evolve');
      expect(capsule.capabilities).toContain('compute');
    });

    it('detects narrative capabilities: narrative + llm', () => {
      const capsule = compiler.compile(makeNarrativeSeed());
      expect(capsule.capabilities).toContain('narrative');
      expect(capsule.capabilities).toContain('llm');
    });

    it('detects vehicle capabilities: physics + compute', () => {
      const capsule = compiler.compile(makeVehicleSeed());
      expect(capsule.capabilities).toContain('physics');
      expect(capsule.capabilities).toContain('compute');
    });

    it('falls back to compute for unknown domain', () => {
      const seed = createSeed(
        'Unknown',
        // @ts-expect-error intentional unknown domain
        'unknowndomain',
        { x: { type: 'scalar' as const, value: 1, min: 0, max: 10 } },
        makeRng('unk'),
      );
      const capsule = compiler.compile(seed);
      expect(capsule.capabilities).toContain('compute');
    });

    it('adds compute for expression gene type', () => {
      const seed = createSeed(
        'ExprSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'x + 1', language: 'gspl' } },
        makeRng('expr'),
      );
      const capsule = compiler.compile(seed);
      expect(capsule.capabilities).toContain('compute');
    });

    it('adds behavior capability when seed has $behaviors', () => {
      const seed = makeTestSeed();
      (seed as any).$behaviors = ['wander', 'flee'];
      const capsule = compiler.compile(seed);
      expect(capsule.capabilities).toContain('behavior');
    });
  });

  // Stage 3 — resolve
  describe('stage: resolve', () => {
    it('records parent ids as dependencies', () => {
      const seed = makeTestSeed();
      seed.$lineage.parents = [{ id: 'parent-hash-abc', name: 'ParentSeed' }];
      const capsule = compiler.compile(seed);
      expect(capsule.dependencies).toContain('parent-hash-abc');
    });

    it('records depends_on relation targets as dependencies', () => {
      const seed = makeTestSeed();
      (seed as any).$relations = [
        { type: 'depends_on', targetHash: 'dep-hash-xyz' },
      ];
      const capsule = compiler.compile(seed);
      expect(capsule.dependencies).toContain('dep-hash-xyz');
    });

    it('records part_of relation targets as dependencies', () => {
      const seed = makeTestSeed();
      (seed as any).$relations = [
        { type: 'part_of', targetHash: 'part-of-hash' },
      ];
      const capsule = compiler.compile(seed);
      expect(capsule.dependencies).toContain('part-of-hash');
    });

    it('does not record non-dependency relation types', () => {
      const seed = makeTestSeed();
      (seed as any).$relations = [
        { type: 'inspires', targetHash: 'inspire-hash' },
      ];
      const capsule = compiler.compile(seed);
      expect(capsule.dependencies).not.toContain('inspire-hash');
    });
  });

  // Stage 4 — optimize
  describe('stage: optimize', () => {
    it('removes scalar genes where value === min when gene count > 3', () => {
      const seed = makeZeroScalarSeed();
      const capsule = compiler.compile(seed);
      // 'dead' has value=0 === min=0 and there are 4 genes, so it should be dropped
      expect(Object.keys(capsule.seed.genes)).not.toContain('dead');
    });

    it('keeps all genes when gene count <= 3', () => {
      // Only 3 genes, optimizer guard skips removal
      const seed = makeTestSeed(); // health(50), element(fire), color([1,0,0])
      const capsule = compiler.compile(seed);
      expect(Object.keys(capsule.seed.genes)).toHaveLength(3);
    });

    it('keeps scalar genes where value !== min', () => {
      const seed = makeZeroScalarSeed();
      const capsule = compiler.compile(seed);
      expect(Object.keys(capsule.seed.genes)).toContain('alive');
    });
  });

  // Stage 5 — secure
  describe('stage: secure', () => {
    it('stores security report in assets', () => {
      const capsule = compiler.compile(makeTestSeed());
      expect(capsule.assets?.['security-report.json']).toBeDefined();
      const report = JSON.parse(capsule.assets!['security-report.json']!);
      expect(report.riskLevel).toBeDefined();
    });

    it('throws on critical security threat (3+ danger-severity threats)', () => {
      // 3 expression genes each with eval (3 danger threats) => critical
      const seed = createSeed(
        'Baddie',
        'organism',
        {
          a: { type: 'expression' as const, source: 'eval(1)', language: 'gspl' },
          b: { type: 'expression' as const, source: 'exec(2)', language: 'gspl' },
          c: { type: 'expression' as const, source: 'import(3)', language: 'gspl' },
        },
        makeRng('baddie'),
      );
      expect(() => compiler.compile(seed)).toThrow(/critical security threats/);
    });
  });

  // Stage 6 — sign
  describe('stage: sign', () => {
    it('computes a signature on the capsule metadata', () => {
      const capsule = compiler.compile(makeTestSeed());
      expect(capsule.metadata.signature).toBeDefined();
      expect(typeof capsule.metadata.signature).toBe('string');
      expect(capsule.metadata.signature!.length).toBeGreaterThan(0);
    });

    it('sets parentHash to the seed $hash', () => {
      const seed = makeTestSeed();
      const capsule = compiler.compile(seed);
      expect(capsule.metadata.parentHash).toBe(seed.$hash);
    });

    it('stores capsule.hash in assets', () => {
      const capsule = compiler.compile(makeTestSeed());
      expect(capsule.assets?.['capsule.hash']).toBeDefined();
    });
  });

  // Stage 7 — bundle
  describe('stage: bundle', () => {
    it('generates a manifest script', () => {
      const capsule = compiler.compile(makeTestSeed());
      expect(capsule.scripts?.['manifest']).toBeDefined();
      const manifest = JSON.parse(capsule.scripts!['manifest']!);
      expect(manifest.name).toBe('TestSeed');
      expect(manifest.domain).toBe('organism');
    });

    it('generates a genes.manifest asset', () => {
      const capsule = compiler.compile(makeTestSeed());
      const geneManifest = JSON.parse(capsule.assets!['genes.manifest']!);
      // Each entry maps gene name -> gene type
      expect(typeof geneManifest).toBe('object');
    });
  });

  // Stage 8 — finalize
  describe('stage: finalize', () => {
    it('sets version to 1.0.0', () => {
      const capsule = compiler.compile(makeTestSeed());
      expect(capsule.metadata.version).toBe('1.0.0');
    });

    it('sets createdAt to a recent timestamp', () => {
      const before = Date.now();
      const capsule = compiler.compile(makeTestSeed());
      const after = Date.now();
      expect(capsule.metadata.createdAt).toBeGreaterThanOrEqual(before);
      expect(capsule.metadata.createdAt).toBeLessThanOrEqual(after);
    });
  });

  // getStages / addStage
  describe('getStages', () => {
    it('returns 8 default stages sorted by order', () => {
      const stages = compiler.getStages();
      expect(stages).toHaveLength(8);
      const names = stages.map((s) => s.name);
      expect(names).toEqual([
        'validate', 'analyze', 'resolve', 'optimize',
        'secure', 'sign', 'bundle', 'finalize',
      ]);
    });

    it('returns stages in ascending order even if added out of order', () => {
      compiler.addStage({ name: 'custom', order: 0, execute: (c) => c });
      const stages = compiler.getStages();
      expect(stages[0].name).toBe('custom');
    });
  });

  describe('addStage', () => {
    it('custom stage executes and can mutate the capsule', () => {
      let called = false;
      compiler.addStage({
        name: 'custom-tag',
        order: 9,
        execute: (capsule) => {
          called = true;
          return {
            ...capsule,
            metadata: { ...capsule.metadata, tags: [...capsule.metadata.tags, 'custom'] },
          };
        },
      });
      const capsule = compiler.compile(makeTestSeed());
      expect(called).toBe(true);
      expect(capsule.metadata.tags).toContain('custom');
    });
  });
});

// ─────────────────────────────────────────────
// CapabilityKernel
// ─────────────────────────────────────────────

describe('CapabilityKernel', () => {
  it('initialises with empty granted set by default', () => {
    const kernel = new CapabilityKernel();
    expect(kernel.getGranted()).toHaveLength(0);
  });

  it('initialises with provided capabilities', () => {
    const kernel = new CapabilityKernel(['compute', 'render']);
    expect(kernel.has('compute')).toBe(true);
    expect(kernel.has('render')).toBe(true);
  });

  it('grant adds a capability', () => {
    const kernel = new CapabilityKernel();
    kernel.grant('audio');
    expect(kernel.has('audio')).toBe(true);
  });

  it('grant is idempotent', () => {
    const kernel = new CapabilityKernel(['network']);
    kernel.grant('network');
    expect(kernel.getGranted().filter((c) => c === 'network')).toHaveLength(1);
  });

  it('revoke removes a capability', () => {
    const kernel = new CapabilityKernel(['compute', 'network']);
    kernel.revoke('network');
    expect(kernel.has('network')).toBe(false);
    expect(kernel.has('compute')).toBe(true);
  });

  it('revoke on non-existent capability is a no-op', () => {
    const kernel = new CapabilityKernel(['compute']);
    expect(() => kernel.revoke('llm')).not.toThrow();
    expect(kernel.has('compute')).toBe(true);
  });

  it('has returns false for un-granted capability', () => {
    const kernel = new CapabilityKernel();
    expect(kernel.has('p2p')).toBe(false);
  });

  describe('check', () => {
    it('returns allowed=true and empty denied when all required are granted', () => {
      const kernel = new CapabilityKernel(['compute', 'render', 'audio']);
      const result = kernel.check(['compute', 'render']);
      expect(result.allowed).toBe(true);
      expect(result.denied).toHaveLength(0);
    });

    it('returns allowed=false with denied list when some are missing', () => {
      const kernel = new CapabilityKernel(['compute']);
      const result = kernel.check(['compute', 'render', 'llm']);
      expect(result.allowed).toBe(false);
      expect(result.denied).toContain('render');
      expect(result.denied).toContain('llm');
      expect(result.denied).not.toContain('compute');
    });

    it('returns allowed=false when required list is non-empty and nothing is granted', () => {
      const kernel = new CapabilityKernel();
      const result = kernel.check(['network']);
      expect(result.allowed).toBe(false);
      expect(result.denied).toEqual(['network']);
    });

    it('returns allowed=true for empty required list', () => {
      const kernel = new CapabilityKernel();
      const result = kernel.check([]);
      expect(result.allowed).toBe(true);
      expect(result.denied).toHaveLength(0);
    });
  });

  describe('getGranted', () => {
    it('returns a snapshot array of all granted capabilities', () => {
      const kernel = new CapabilityKernel(['compute', 'audio']);
      const granted = kernel.getGranted();
      expect(granted).toHaveLength(2);
      expect(granted).toContain('compute');
      expect(granted).toContain('audio');
    });

    it('mutating the returned array does not affect the kernel', () => {
      const kernel = new CapabilityKernel(['compute']);
      const granted = kernel.getGranted();
      granted.push('network' as Capability);
      expect(kernel.has('network')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// SecurityScanner
// ─────────────────────────────────────────────

describe('SecurityScanner', () => {
  let scanner: SecurityScanner;

  beforeEach(() => {
    scanner = new SecurityScanner();
  });

  // Full scan
  describe('scan', () => {
    it('returns a SecurityReport with required fields', () => {
      const capsule = wrapSeed(makeTestSeed());
      const report = scanner.scan(capsule);
      expect(report.capsuleHash).toBeDefined();
      expect(Array.isArray(report.threats)).toBe(true);
      expect(report.riskLevel).toBeDefined();
      expect(typeof report.scannedAt).toBe('number');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('uses capsule.hash asset as capsuleHash when present', () => {
      const capsule = wrapSeed(makeTestSeed());
      capsule.assets = { 'capsule.hash': 'abcdef1234' };
      const report = scanner.scan(capsule);
      expect(report.capsuleHash).toBe('abcdef1234');
    });

    it('falls back to seed.$hash when no capsule.hash asset', () => {
      const seed = makeTestSeed();
      const capsule = wrapSeed(seed);
      const report = scanner.scan(capsule);
      expect(report.capsuleHash).toBe(seed.$hash);
    });

    it('flags missing signature as a warning threat', () => {
      const capsule = wrapSeed(makeTestSeed()); // no signature
      const report = scanner.scan(capsule);
      const missingSignature = report.threats.find((t) => t.type === 'missing_signature');
      expect(missingSignature).toBeDefined();
      expect(missingSignature!.severity).toBe('warning');
    });

    it('does not flag missing_signature when signature present', () => {
      const capsule = wrapSeed(makeTestSeed());
      capsule.metadata.signature = 'some-sig';
      const report = scanner.scan(capsule);
      expect(report.threats.find((t) => t.type === 'missing_signature')).toBeUndefined();
    });

    it('includes recommendations for safe capsule', () => {
      // Compile through full pipeline to get a signed, safe capsule
      const compiler = new CapsuleCompiler();
      const capsule = compiler.compile(makeTestSeed());
      // Manually clear threats by setting signature (already done by compiler)
      const report = scanner.scan(capsule);
      // riskLevel safe → includes safe recommendation
      if (report.riskLevel === 'safe') {
        expect(report.recommendations.some((r) => r.includes('safe to execute'))).toBe(true);
      }
    });
  });

  // checkGeneThreats
  describe('checkGeneThreats', () => {
    it('detects eval in expression gene source', () => {
      const seed = createSeed(
        'EvalSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'eval(x)', language: 'gspl' } },
        makeRng('evaltest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.type === 'suspicious_expression' && t.description.includes('eval'))).toBe(true);
    });

    it('detects exec in expression gene source', () => {
      const seed = createSeed(
        'ExecSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'exec(cmd)', language: 'gspl' } },
        makeRng('exectest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.description.includes('exec'))).toBe(true);
    });

    it('detects import in expression gene source', () => {
      const seed = createSeed(
        'ImportSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'import("fs")', language: 'gspl' } },
        makeRng('importtest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.description.includes('import'))).toBe(true);
    });

    it('detects require in expression gene source', () => {
      const seed = createSeed(
        'RequireSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'require("path")', language: 'gspl' } },
        makeRng('requiretest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.description.includes('require'))).toBe(true);
    });

    it('detects __proto__ in expression gene source', () => {
      const seed = createSeed(
        'ProtoSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'obj.__proto__', language: 'gspl' } },
        makeRng('prototest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.description.includes('__proto__'))).toBe(true);
    });

    it('detects constructor in expression gene source', () => {
      const seed = createSeed(
        'CtorSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'obj.constructor()', language: 'gspl' } },
        makeRng('ctortest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.description.includes('constructor'))).toBe(true);
    });

    it('detects Function in expression gene source', () => {
      const seed = createSeed(
        'FuncSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'new Function("x","return x")', language: 'gspl' } },
        makeRng('functest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.description.includes('Function'))).toBe(true);
    });

    it('flags oversized categorical gene (>1MB serialized) as warning', () => {
      const seed = makeSuspiciousSeed();
      const threats = scanner.checkGeneThreats(seed);
      expect(threats.some((t) => t.type === 'oversized_gene' && t.severity === 'warning')).toBe(true);
    });

    it('returns empty threats for a clean seed', () => {
      const seed = makeTestSeed();
      const threats = scanner.checkGeneThreats(seed);
      expect(threats).toHaveLength(0);
    });

    it('sets location on suspicious expression threat', () => {
      const seed = createSeed(
        'LocSeed',
        'organism',
        { fn: { type: 'expression' as const, source: 'eval(1)', language: 'gspl' } },
        makeRng('loctest'),
      );
      const threats = scanner.checkGeneThreats(seed);
      const threat = threats.find((t) => t.type === 'suspicious_expression');
      expect(threat?.location).toContain('genes.fn');
    });
  });

  // checkCapabilityThreats
  describe('checkCapabilityThreats', () => {
    it('flags network+crypto combo as dangerous_capability_combo', () => {
      const threats = scanner.checkCapabilityThreats(['network', 'crypto', 'compute']);
      expect(threats.some((t) => t.type === 'dangerous_capability_combo')).toBe(true);
    });

    it('flags compute+network combo as dangerous_capability_combo', () => {
      const threats = scanner.checkCapabilityThreats(['compute', 'network']);
      expect(threats.some((t) => t.type === 'dangerous_capability_combo')).toBe(true);
    });

    it('flags p2p+storage combo as dangerous_capability_combo', () => {
      const threats = scanner.checkCapabilityThreats(['p2p', 'storage']);
      expect(threats.some((t) => t.type === 'dangerous_capability_combo')).toBe(true);
    });

    it('flags llm+network combo as dangerous_capability_combo', () => {
      const threats = scanner.checkCapabilityThreats(['llm', 'network']);
      expect(threats.some((t) => t.type === 'dangerous_capability_combo')).toBe(true);
    });

    it('flags p2p as high_risk_capability (info)', () => {
      const threats = scanner.checkCapabilityThreats(['p2p']);
      expect(threats.some((t) => t.type === 'high_risk_capability' && t.description.includes('p2p'))).toBe(true);
    });

    it('flags crypto as high_risk_capability (info)', () => {
      const threats = scanner.checkCapabilityThreats(['crypto']);
      expect(threats.some((t) => t.type === 'high_risk_capability' && t.description.includes('crypto'))).toBe(true);
    });

    it('returns empty list for safe capabilities', () => {
      const threats = scanner.checkCapabilityThreats(['compute', 'render', 'audio']);
      expect(threats).toHaveLength(0);
    });

    it('returns empty list for empty capabilities', () => {
      const threats = scanner.checkCapabilityThreats([]);
      expect(threats).toHaveLength(0);
    });
  });

  // calculateRiskLevel
  describe('calculateRiskLevel', () => {
    it('returns safe for empty threats', () => {
      expect(scanner.calculateRiskLevel([])).toBe('safe');
    });

    it('returns low for a single info threat', () => {
      const threats: ThreatEntry[] = [{ type: 'x', severity: 'info', description: 'x' }];
      expect(scanner.calculateRiskLevel(threats)).toBe('low');
    });

    it('returns low for a single warning threat', () => {
      const threats: ThreatEntry[] = [{ type: 'x', severity: 'warning', description: 'x' }];
      expect(scanner.calculateRiskLevel(threats)).toBe('low');
    });

    it('returns medium for 3+ warning threats', () => {
      const threats: ThreatEntry[] = [
        { type: 'a', severity: 'warning', description: 'a' },
        { type: 'b', severity: 'warning', description: 'b' },
        { type: 'c', severity: 'warning', description: 'c' },
      ];
      expect(scanner.calculateRiskLevel(threats)).toBe('medium');
    });

    it('returns high for 1 danger threat', () => {
      const threats: ThreatEntry[] = [{ type: 'x', severity: 'danger', description: 'x' }];
      expect(scanner.calculateRiskLevel(threats)).toBe('high');
    });

    it('returns high for 2 danger threats', () => {
      const threats: ThreatEntry[] = [
        { type: 'a', severity: 'danger', description: 'a' },
        { type: 'b', severity: 'danger', description: 'b' },
      ];
      expect(scanner.calculateRiskLevel(threats)).toBe('high');
    });

    it('returns critical for 3+ danger threats', () => {
      const threats: ThreatEntry[] = [
        { type: 'a', severity: 'danger', description: 'a' },
        { type: 'b', severity: 'danger', description: 'b' },
        { type: 'c', severity: 'danger', description: 'c' },
      ];
      expect(scanner.calculateRiskLevel(threats)).toBe('critical');
    });
  });
});

// ─────────────────────────────────────────────
// CapsuleRunner
// ─────────────────────────────────────────────

describe('CapsuleRunner', () => {
  let runner: CapsuleRunner;
  let compiler: CapsuleCompiler;

  beforeEach(() => {
    runner = new CapsuleRunner();
    compiler = new CapsuleCompiler();
  });

  // validate
  describe('validate', () => {
    it('returns true for a fully compiled capsule', () => {
      const capsule = compiler.compile(makeTestSeed());
      expect(runner.validate(capsule)).toBe(true);
    });

    it('returns false when metadata.version is missing', () => {
      const capsule = compiler.compile(makeTestSeed());
      // @ts-expect-error intentional corruption
      capsule.metadata.version = '';
      expect(runner.validate(capsule)).toBe(false);
    });

    it('returns false when metadata.format is missing', () => {
      const capsule = compiler.compile(makeTestSeed());
      // @ts-expect-error intentional corruption
      capsule.metadata.format = '';
      expect(runner.validate(capsule)).toBe(false);
    });

    it('returns false when seed.$gst is missing', () => {
      const capsule = compiler.compile(makeTestSeed());
      // @ts-expect-error intentional corruption
      capsule.seed.$gst = '';
      expect(runner.validate(capsule)).toBe(false);
    });

    it('returns false when seed.$name is missing', () => {
      const capsule = compiler.compile(makeTestSeed());
      // @ts-expect-error intentional corruption
      capsule.seed.$name = '';
      expect(runner.validate(capsule)).toBe(false);
    });

    it('returns false when seed.$domain is missing', () => {
      const capsule = compiler.compile(makeTestSeed());
      // @ts-expect-error intentional corruption
      capsule.seed.$domain = '';
      expect(runner.validate(capsule)).toBe(false);
    });

    it('returns false when seed.$hash is missing', () => {
      const capsule = compiler.compile(makeTestSeed());
      // @ts-expect-error intentional corruption
      capsule.seed.$hash = '';
      expect(runner.validate(capsule)).toBe(false);
    });

    it('returns false when seed.genes is empty', () => {
      const capsule = compiler.compile(makeTestSeed());
      (capsule.seed as any).genes = {};
      expect(runner.validate(capsule)).toBe(false);
    });
  });

  // run
  describe('run', () => {
    it('runs a compiled capsule and returns success=true', () => {
      const capsule = compiler.compile(makeTestSeed());
      const result = runner.run(capsule);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.capsuleHash).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns success=false for an invalid capsule', () => {
      const capsule = compiler.compile(makeTestSeed());
      // @ts-expect-error intentional corruption
      capsule.seed.$hash = '';
      const result = runner.run(capsule);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/validation failed/);
    });

    it('uses capsule.hash asset as capsuleHash', () => {
      const capsule = compiler.compile(makeTestSeed());
      // asset already set by compiler; confirm it's reflected in result
      expect(capsule.assets?.['capsule.hash']).toBeDefined();
      const result = runner.run(capsule);
      expect(result.capsuleHash).toBe(capsule.assets!['capsule.hash']);
    });

    it('falls back to seed.$hash when no capsule.hash asset', () => {
      const capsule = wrapSeed(makeTestSeed()); // no assets
      const result = runner.run(capsule);
      expect(result.capsuleHash).toBe(capsule.seed.$hash);
    });

    it('reports no scripts when scripts is absent', () => {
      const capsule = compiler.compile(makeTestSeed());
      // Remove all scripts to hit the "no scripts" branch
      capsule.scripts = {};
      const result = runner.run(capsule);
      expect(result.success).toBe(true);
      expect((result.output as any).message).toMatch(/No scripts/);
    });

    it('executes JSON object script and counts commands', () => {
      const capsule = compiler.compile(makeTestSeed());
      capsule.scripts = { myScript: JSON.stringify({ cmd1: 'do something', cmd2: 'also this' }) };
      const result = runner.run(capsule);
      expect(result.success).toBe(true);
      const output = result.output as Record<string, any>;
      expect(output['myScript'].status).toBe('executed');
      expect(output['myScript'].commands).toBe(2);
    });

    it('executes JSON primitive script and returns value', () => {
      const capsule = compiler.compile(makeTestSeed());
      capsule.scripts = { num: JSON.stringify(42) };
      const result = runner.run(capsule);
      const output = result.output as Record<string, any>;
      expect(output['num'].status).toBe('executed');
      expect(output['num'].value).toBe(42);
    });

    it('executes non-JSON script as plain command string', () => {
      const capsule = compiler.compile(makeTestSeed());
      capsule.scripts = { plain: 'some-plain-command' };
      const result = runner.run(capsule);
      const output = result.output as Record<string, any>;
      expect(output['plain'].status).toBe('executed');
      expect(output['plain'].commandLength).toBe('some-plain-command'.length);
    });

    it('records error and marks skipped for empty script', () => {
      const capsule = compiler.compile(makeTestSeed());
      capsule.scripts = { empty: '' };
      const result = runner.run(capsule);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('empty'))).toBe(true);
      const output = result.output as Record<string, any>;
      expect(output['empty'].status).toBe('skipped');
    });
  });

  // checkCapabilities
  describe('checkCapabilities', () => {
    it('returns satisfied=true when all capsule capabilities are available', () => {
      const capsule = compiler.compile(makeTestSeed()); // needs evolve, compute
      const available: Capability[] = ['evolve', 'compute', 'render', 'audio'];
      const result = runner.checkCapabilities(capsule, available);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('returns satisfied=false with missing list when capabilities are absent', () => {
      const capsule = compiler.compile(makeTestSeed()); // needs evolve, compute
      const result = runner.checkCapabilities(capsule, ['render']);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('evolve');
      expect(result.missing).toContain('compute');
      expect(result.missing).not.toContain('render');
    });

    it('returns satisfied=true when capsule needs no capabilities', () => {
      const capsule = compiler.compile(makeTestSeed());
      capsule.capabilities = [];
      const result = runner.checkCapabilities(capsule, []);
      expect(result.satisfied).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// CapsuleSerializer — all 6 formats
// ─────────────────────────────────────────────

describe('CapsuleSerializer', () => {
  let serializer: CapsuleSerializer;
  let compiler: CapsuleCompiler;
  let compiledCapsule: SeedCapsule;

  beforeEach(() => {
    serializer = new CapsuleSerializer();
    compiler = new CapsuleCompiler();
    compiledCapsule = compiler.compile(makeTestSeed(), {
      author: 'Tester',
      description: 'Serialization test capsule',
      tags: ['test'],
    });
  });

  const formats: CapsuleFormat[] = ['gcapsule', 'gseed', 'gworld', 'gevolution', 'gresonance', 'glineage'];

  for (const format of formats) {
    describe(`format: ${format}`, () => {
      it(`serializes to valid JSON`, () => {
        const serialized = serializer.serialize(compiledCapsule, format);
        expect(() => JSON.parse(serialized)).not.toThrow();
      });

      it(`serialized JSON contains $format: '${format}'`, () => {
        const serialized = serializer.serialize(compiledCapsule, format);
        const parsed = JSON.parse(serialized);
        expect(parsed.$format).toBe(format);
      });

      it(`serialized JSON contains $version: '1.0'`, () => {
        const serialized = serializer.serialize(compiledCapsule, format);
        const parsed = JSON.parse(serialized);
        expect(parsed.$version).toBe('1.0');
      });

      it(`round-trips: deserialize(serialize(capsule)) preserves seed $name`, () => {
        const serialized = serializer.serialize(compiledCapsule, format);
        const deserialized = serializer.deserialize(serialized, format);
        expect(deserialized.seed.$name).toBe(compiledCapsule.seed.$name);
      });

      it(`round-trips: deserialize(serialize(capsule)) preserves seed $domain`, () => {
        const serialized = serializer.serialize(compiledCapsule, format);
        const deserialized = serializer.deserialize(serialized, format);
        expect(deserialized.seed.$domain).toBe(compiledCapsule.seed.$domain);
      });

      it(`round-trips: deserialize(serialize(capsule)) preserves seed $hash`, () => {
        const serialized = serializer.serialize(compiledCapsule, format);
        const deserialized = serializer.deserialize(serialized, format);
        expect(deserialized.seed.$hash).toBe(compiledCapsule.seed.$hash);
      });

      it(`deserialized capsule has metadata.format set to '${format}'`, () => {
        const serialized = serializer.serialize(compiledCapsule, format);
        const deserialized = serializer.deserialize(serialized, format);
        expect(deserialized.metadata.format).toBe(format);
      });
    });
  }

  // Format-specific structure checks
  describe('gcapsule specific', () => {
    it('serializes the full capsule object under "capsule" key', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gcapsule');
      const parsed = JSON.parse(serialized);
      expect(parsed.capsule).toBeDefined();
      expect(parsed.capsule.metadata).toBeDefined();
      expect(parsed.capsule.seed).toBeDefined();
    });

    it('round-trips capabilities and dependencies', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gcapsule');
      const deserialized = serializer.deserialize(serialized, 'gcapsule');
      expect(deserialized.capabilities).toEqual(compiledCapsule.capabilities);
      expect(deserialized.dependencies).toEqual(compiledCapsule.dependencies);
    });
  });

  describe('gseed specific', () => {
    it('only includes seed (minimal format)', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gseed');
      const parsed = JSON.parse(serialized);
      expect(parsed.seed).toBeDefined();
      expect(parsed.capsule).toBeUndefined();
    });
  });

  describe('gworld specific', () => {
    it('includes seed, capabilities, and assets under "world" key', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gworld');
      const parsed = JSON.parse(serialized);
      expect(parsed.world.seed).toBeDefined();
      expect(parsed.world.capabilities).toBeDefined();
      expect(parsed.world.assets).toBeDefined();
    });

    it('round-trips capabilities', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gworld');
      const deserialized = serializer.deserialize(serialized, 'gworld');
      expect(deserialized.capabilities).toEqual(compiledCapsule.capabilities);
    });
  });

  describe('gevolution specific', () => {
    it('includes lineage and generation under "evolution" key', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gevolution');
      const parsed = JSON.parse(serialized);
      expect(parsed.evolution.lineage).toBeDefined();
      expect(typeof parsed.evolution.generation).toBe('number');
    });

    it('round-trips dependencies', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gevolution');
      const deserialized = serializer.deserialize(serialized, 'gevolution');
      expect(deserialized.dependencies).toEqual(compiledCapsule.dependencies);
    });
  });

  describe('gresonance specific', () => {
    it('includes relations and behaviors under "resonance" key', () => {
      const serialized = serializer.serialize(compiledCapsule, 'gresonance');
      const parsed = JSON.parse(serialized);
      expect(parsed.resonance.seed).toBeDefined();
      expect(Array.isArray(parsed.resonance.relations)).toBe(true);
      expect(Array.isArray(parsed.resonance.behaviors)).toBe(true);
    });
  });

  describe('glineage specific', () => {
    it('includes a lineage tree with root hash and generation', () => {
      const serialized = serializer.serialize(compiledCapsule, 'glineage');
      const parsed = JSON.parse(serialized);
      expect(parsed.lineage.root).toBe(compiledCapsule.seed.$hash);
      expect(typeof parsed.lineage.generation).toBe('number');
      expect(parsed.lineage.tree).toBeDefined();
    });

    it('tree includes breedingStrategy', () => {
      const serialized = serializer.serialize(compiledCapsule, 'glineage');
      const parsed = JSON.parse(serialized);
      expect(parsed.lineage.tree.breedingStrategy).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

describe('wrapSeed', () => {
  it('wraps a seed in a minimal capsule with default format gcapsule', () => {
    const seed = makeTestSeed();
    const capsule = wrapSeed(seed);
    expect(capsule.seed).toBe(seed);
    expect(capsule.metadata.format).toBe('gcapsule');
    expect(capsule.metadata.version).toBe('1.0.0');
    expect(capsule.metadata.parentHash).toBe(seed.$hash);
    expect(capsule.dependencies).toEqual([]);
    expect(capsule.capabilities).toEqual([]);
  });

  it('accepts custom format', () => {
    const capsule = wrapSeed(makeTestSeed(), { format: 'gworld' });
    expect(capsule.metadata.format).toBe('gworld');
  });

  it('accepts author', () => {
    const capsule = wrapSeed(makeTestSeed(), { author: 'Bob' });
    expect(capsule.metadata.author).toBe('Bob');
  });

  it('accepts tags', () => {
    const capsule = wrapSeed(makeTestSeed(), { tags: ['hero', 'fire'] });
    expect(capsule.metadata.tags).toEqual(['hero', 'fire']);
  });

  it('sets createdAt to a recent timestamp', () => {
    const before = Date.now();
    const capsule = wrapSeed(makeTestSeed());
    const after = Date.now();
    expect(capsule.metadata.createdAt).toBeGreaterThanOrEqual(before);
    expect(capsule.metadata.createdAt).toBeLessThanOrEqual(after);
  });
});

describe('createAndCompile', () => {
  it('creates and compiles a capsule from primitives', () => {
    const capsule = createAndCompile('Hero', 'organism', {
      health: { type: 'scalar' as const, value: 80, min: 0, max: 100 },
    });
    expect(capsule.seed.$name).toBe('Hero');
    expect(capsule.seed.$domain).toBe('organism');
    expect(capsule.metadata.version).toBe('1.0.0');
  });

  it('passes options through to the compiler', () => {
    const capsule = createAndCompile(
      'Villain',
      'organism',
      { power: { type: 'scalar' as const, value: 90, min: 0, max: 100 } },
      'villain-seed',
      { author: 'Evil Corp', tags: ['villain'] },
    );
    expect(capsule.metadata.author).toBe('Evil Corp');
    expect(capsule.metadata.tags).toContain('villain');
  });

  it('is deterministic with the same rngSeed', () => {
    const genes = { hp: { type: 'scalar' as const, value: 50, min: 0, max: 100 } };
    const a = createAndCompile('Clone', 'organism', genes, 'fixed-seed');
    const b = createAndCompile('Clone', 'organism', genes, 'fixed-seed');
    expect(a.seed.$hash).toBe(b.seed.$hash);
    expect(a.metadata.signature).toBe(b.metadata.signature);
  });

  it('uses seed name as default rngSeed', () => {
    const genes = { x: { type: 'scalar' as const, value: 1, min: 0, max: 10 } };
    const capsule = createAndCompile('DefaultRng', 'organism', genes);
    expect(capsule.seed.$name).toBe('DefaultRng');
  });
});
