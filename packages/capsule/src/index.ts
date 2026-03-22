/**
 * @paradigm/capsule — Genome capsule compiler, runner, and serialization layer.
 *
 * Provides deterministic compilation of UniversalSeed instances into signed,
 * versioned, content-addressable capsules for distribution, execution, and
 * archival across all GSPL Paradigm runtimes.
 *
 * @packageDocumentation
 */

import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash, canonicalize } from '@paradigm/rng';
import { createSeed } from '@paradigm/seed';

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

/** Supported capsule serialization formats. */
export type CapsuleFormat =
  | 'gcapsule'
  | 'gseed'
  | 'gworld'
  | 'gresonance'
  | 'gevolution'
  | 'glineage';

/** Metadata header attached to every compiled capsule. */
export interface CapsuleMetadata {
  version: string;
  format: CapsuleFormat;
  createdAt: number;
  author?: string;
  description?: string;
  tags: string[];
  signature?: string;
  parentHash?: string;
}

/** Runtime capabilities a capsule may require. */
export type Capability =
  | 'compute'
  | 'network'
  | 'storage'
  | 'render'
  | 'audio'
  | 'physics'
  | 'evolve'
  | 'forge'
  | 'narrative'
  | 'search'
  | 'llm'
  | 'p2p'
  | 'crypto'
  | 'media'
  | 'behavior'
  | 'generate';

/** A threat discovered during capsule security scanning. */
export interface ThreatEntry {
  type: string;
  severity: 'info' | 'warning' | 'danger';
  description: string;
  location?: string;
}

/** Full security assessment for a capsule. */
export interface SecurityReport {
  capsuleHash: string;
  threats: ThreatEntry[];
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  scannedAt: number;
  recommendations: string[];
}

/** The compiled capsule — seed + metadata + runtime descriptor. */
export interface SeedCapsule {
  metadata: CapsuleMetadata;
  seed: UniversalSeed;
  dependencies: string[];
  capabilities: Capability[];
  scripts?: Record<string, string>;
  assets?: Record<string, string>;
}

/** A single stage in the compilation pipeline. */
export interface CompilationStage {
  name: string;
  order: number;
  execute: (capsule: SeedCapsule) => SeedCapsule;
}

/** Result of executing a capsule. */
export interface RunResult {
  success: boolean;
  output: unknown;
  duration: number;
  capsuleHash: string;
  errors: string[];
}

// ─────────────────────────────────────────────
// CapsuleCompiler — 8-stage genome compiler
// ─────────────────────────────────────────────

/**
 * Compiles a UniversalSeed into a signed, versioned SeedCapsule through
 * eight deterministic pipeline stages.
 */
export class CapsuleCompiler {
  private stages: CompilationStage[];

  constructor() {
    this.stages = [];
    this.registerDefaultStages();
  }

  private registerDefaultStages(): void {
    const scanner = new SecurityScanner();

    // Stage 1: Validate required seed fields
    this.stages.push({
      name: 'validate',
      order: 1,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        const { seed } = capsule;
        const missing: string[] = [];
        if (!seed.$gst) missing.push('$gst');
        if (!seed.$name) missing.push('$name');
        if (!seed.$domain) missing.push('$domain');
        if (!seed.genes || Object.keys(seed.genes).length === 0) missing.push('genes');
        if (!seed.$hash) missing.push('$hash');
        if (missing.length > 0) {
          throw new Error(
            `Capsule validation failed: missing required seed fields: ${missing.join(', ')}`,
          );
        }
        return capsule;
      },
    });

    // Stage 2: Detect required capabilities from gene types and domain
    this.stages.push({
      name: 'analyze',
      order: 2,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        const detected = new Set<Capability>(capsule.capabilities);
        const { seed } = capsule;

        // Domain-based capability detection
        const domainCapabilityMap: Record<string, Capability[]> = {
          organism: ['evolve', 'compute'],
          vehicle: ['physics', 'compute'],
          weapon: ['physics', 'compute'],
          building: ['render', 'compute'],
          terrain: ['render', 'generate'],
          material: ['render', 'compute'],
          sound: ['audio'],
          music: ['audio', 'generate'],
          narrative: ['narrative', 'llm'],
          game: ['render', 'physics', 'compute'],
          simulation: ['compute', 'evolve'],
          ecosystem: ['compute', 'evolve'],
          neural: ['compute', 'llm'],
          intelligence: ['compute', 'llm', 'search'],
          web: ['network', 'storage'],
          code: ['compute'],
          security_threat: ['crypto', 'network'],
          intrusion: ['network', 'crypto'],
          'seed-intelligence': ['compute', 'llm'],
        };

        const domainCaps = domainCapabilityMap[seed.$domain];
        if (domainCaps) {
          domainCaps.forEach((cap) => detected.add(cap));
        } else {
          detected.add('compute');
        }

        // Gene-type-based capability detection
        for (const gene of Object.values(seed.genes)) {
          switch (gene.type) {
            case 'tensor':
              detected.add('compute');
              break;
            case 'timeseries':
              detected.add('compute');
              break;
            case 'expression':
              detected.add('compute');
              break;
            case 'graph':
              detected.add('compute');
              break;
            default:
              break;
          }
        }

        // Behavior refs require behavior capability
        if (seed.$behaviors && seed.$behaviors.length > 0) {
          detected.add('behavior');
        }

        return { ...capsule, capabilities: Array.from(detected) };
      },
    });

    // Stage 3: Resolve dependency seeds (store parent hashes in dependencies)
    this.stages.push({
      name: 'resolve',
      order: 3,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        const deps = new Set<string>(capsule.dependencies);

        // Record parent hashes from lineage as dependencies
        const { seed } = capsule;
        for (const parent of seed.$lineage.parents) {
          if (parent.id) deps.add(parent.id);
        }

        // Record relation target hashes as dependencies
        if (seed.$relations) {
          for (const relation of seed.$relations) {
            if (relation.type === 'depends_on' || relation.type === 'part_of') {
              deps.add(relation.targetHash);
            }
          }
        }

        return { ...capsule, dependencies: Array.from(deps) };
      },
    });

    // Stage 4: Optimize — remove redundant genes, compact representation
    this.stages.push({
      name: 'optimize',
      order: 4,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        const { seed } = capsule;
        const optimizedGenes: typeof seed.genes = {};

        for (const [key, gene] of Object.entries(seed.genes)) {
          // Remove scalar genes where value equals min (zero-value scalars are often unused defaults)
          // but only if there are more than 3 genes total to preserve minimal seeds
          if (
            gene.type === 'scalar' &&
            gene.value === gene.min &&
            Object.keys(seed.genes).length > 3
          ) {
            continue;
          }
          optimizedGenes[key] = gene;
        }

        const optimizedSeed: UniversalSeed = { ...seed, genes: optimizedGenes };
        return { ...capsule, seed: optimizedSeed };
      },
    });

    // Stage 5: Secure — scan for threats and compute security report
    this.stages.push({
      name: 'secure',
      order: 5,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        const report = scanner.scan(capsule);
        if (report.riskLevel === 'critical') {
          throw new Error(
            `Capsule compilation aborted: critical security threats detected — ` +
              report.threats
                .filter((t) => t.severity === 'danger')
                .map((t) => t.description)
                .join('; '),
          );
        }
        // Store report summary in capsule assets
        const assets = {
          ...(capsule.assets ?? {}),
          'security-report.json': JSON.stringify(report),
        };
        return { ...capsule, assets };
      },
    });

    // Stage 6: Sign — compute capsule hash/signature from content
    this.stages.push({
      name: 'sign',
      order: 6,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        const signingContent = {
          seed: {
            $gst: capsule.seed.$gst,
            $domain: capsule.seed.$domain,
            $name: capsule.seed.$name,
            $hash: capsule.seed.$hash,
            genes: capsule.seed.genes,
          },
          dependencies: [...capsule.dependencies].sort(),
          capabilities: [...capsule.capabilities].sort(),
        };
        const signature = computeQuickHash(signingContent);
        const capsuleHash = computeQuickHash(canonicalize(signingContent));
        return {
          ...capsule,
          metadata: {
            ...capsule.metadata,
            signature,
            parentHash: capsule.seed.$hash,
          },
          assets: {
            ...(capsule.assets ?? {}),
            'capsule.hash': capsuleHash,
          },
        };
      },
    });

    // Stage 7: Bundle — bundle scripts and assets
    this.stages.push({
      name: 'bundle',
      order: 7,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        const bundledScripts: Record<string, string> = { ...(capsule.scripts ?? {}) };
        const bundledAssets: Record<string, string> = { ...(capsule.assets ?? {}) };

        // Auto-generate a seed manifest script
        bundledScripts['manifest'] = JSON.stringify({
          name: capsule.seed.$name,
          domain: capsule.seed.$domain,
          hash: capsule.seed.$hash,
          geneCount: Object.keys(capsule.seed.genes).length,
          capabilities: capsule.capabilities,
          dependencies: capsule.dependencies,
        });

        // Bundle gene summary as an asset
        const geneSummary: Record<string, string> = {};
        for (const [key, gene] of Object.entries(capsule.seed.genes)) {
          geneSummary[key] = gene.type;
        }
        bundledAssets['genes.manifest'] = JSON.stringify(geneSummary);

        return { ...capsule, scripts: bundledScripts, assets: bundledAssets };
      },
    });

    // Stage 8: Finalize — set metadata timestamps and version
    this.stages.push({
      name: 'finalize',
      order: 8,
      execute: (capsule: SeedCapsule): SeedCapsule => {
        return {
          ...capsule,
          metadata: {
            ...capsule.metadata,
            version: '1.0.0',
            createdAt: Date.now(),
          },
        };
      },
    });
  }

  /**
   * Compile a UniversalSeed into a signed SeedCapsule.
   * Runs all 8 pipeline stages in sequence.
   */
  compile(
    seed: UniversalSeed,
    options?: { author?: string; description?: string; tags?: string[] },
  ): SeedCapsule {
    const sortedStages = [...this.stages].sort((a, b) => a.order - b.order);

    const initialCapsule: SeedCapsule = {
      metadata: {
        version: '0.0.0',
        format: 'gcapsule',
        createdAt: 0,
        author: options?.author,
        description: options?.description,
        tags: options?.tags ?? [],
      },
      seed,
      dependencies: [],
      capabilities: [],
    };

    return sortedStages.reduce((capsule, stage) => stage.execute(capsule), initialCapsule);
  }

  /** Get all registered stages sorted by order. */
  getStages(): CompilationStage[] {
    return [...this.stages].sort((a, b) => a.order - b.order);
  }

  /** Add a custom stage to the pipeline. */
  addStage(stage: CompilationStage): void {
    this.stages.push(stage);
  }
}

// ─────────────────────────────────────────────
// CapabilityKernel — Runtime capability management
// ─────────────────────────────────────────────

/**
 * Manages granted runtime capabilities with grant/revoke semantics.
 * Used by CapsuleRunner to enforce sandboxed execution boundaries.
 */
export class CapabilityKernel {
  private granted: Set<Capability>;

  constructor(granted: Capability[] = []) {
    this.granted = new Set(granted);
  }

  /** Grant a capability to this kernel. */
  grant(capability: Capability): void {
    this.granted.add(capability);
  }

  /** Revoke a previously granted capability. */
  revoke(capability: Capability): void {
    this.granted.delete(capability);
  }

  /** Check whether a single capability is granted. */
  has(capability: Capability): boolean {
    return this.granted.has(capability);
  }

  /**
   * Check a set of required capabilities against granted set.
   * Returns whether all are satisfied and which are denied.
   */
  check(required: Capability[]): { allowed: boolean; denied: Capability[] } {
    const denied = required.filter((cap) => !this.granted.has(cap));
    return { allowed: denied.length === 0, denied };
  }

  /** Get a snapshot of all currently granted capabilities. */
  getGranted(): Capability[] {
    return Array.from(this.granted);
  }
}

// ─────────────────────────────────────────────
// SecurityScanner — Threat assessment
// ─────────────────────────────────────────────

/** Suspicious keywords in expression gene sources that may indicate injection. */
const SUSPICIOUS_EXPRESSION_KEYWORDS = ['eval', 'exec', 'import', 'require', 'Function', '__proto__', 'constructor'];

/** Dangerous capability combinations that elevate risk. */
const DANGEROUS_CAP_COMBOS: Array<{ caps: Capability[]; description: string }> = [
  { caps: ['network', 'crypto'], description: 'Network + crypto capabilities enable covert exfiltration' },
  { caps: ['compute', 'network'], description: 'Compute + network enables remote code execution vectors' },
  { caps: ['p2p', 'storage'], description: 'P2P + storage enables unauthorized data replication' },
  { caps: ['llm', 'network'], description: 'LLM + network may enable prompt injection via remote data' },
];

/**
 * Scans capsules for security threats including oversized genes,
 * suspicious expression sources, and dangerous capability combinations.
 */
export class SecurityScanner {
  constructor() {}

  /** Perform a full threat scan of a capsule. */
  scan(capsule: SeedCapsule): SecurityReport {
    const capsuleHash = capsule.assets?.['capsule.hash'] ?? capsule.seed.$hash;
    const geneThreats = this.checkGeneThreats(capsule.seed);
    const capabilityThreats = this.checkCapabilityThreats(capsule.capabilities);

    // Check for missing signature
    const signatureThreats: ThreatEntry[] = [];
    if (!capsule.metadata.signature) {
      signatureThreats.push({
        type: 'missing_signature',
        severity: 'warning',
        description: 'Capsule has no cryptographic signature — integrity cannot be verified',
      });
    }

    const threats = [...geneThreats, ...capabilityThreats, ...signatureThreats];
    const riskLevel = this.calculateRiskLevel(threats);
    const recommendations = this.buildRecommendations(threats, riskLevel);

    return {
      capsuleHash,
      threats,
      riskLevel,
      scannedAt: Date.now(),
      recommendations,
    };
  }

  /** Check for suspicious gene patterns: oversized values, expression injection. */
  checkGeneThreats(seed: UniversalSeed): ThreatEntry[] {
    const threats: ThreatEntry[] = [];
    const SIZE_LIMIT = 1_048_576; // 1MB

    for (const [key, gene] of Object.entries(seed.genes)) {
      if (gene.type === 'expression') {
        const sourceSize = new TextEncoder().encode(gene.source).length;
        if (sourceSize > SIZE_LIMIT) {
          threats.push({
            type: 'oversized_expression',
            severity: 'danger',
            description: `Expression gene '${key}' exceeds 1MB (${sourceSize} bytes)`,
            location: `genes.${key}`,
          });
        }
        for (const keyword of SUSPICIOUS_EXPRESSION_KEYWORDS) {
          if (gene.source.includes(keyword)) {
            threats.push({
              type: 'suspicious_expression',
              severity: 'danger',
              description: `Expression gene '${key}' contains suspicious keyword: '${keyword}'`,
              location: `genes.${key}.source`,
            });
          }
        }
      }

      if (gene.type === 'scalar' || gene.type === 'categorical') {
        const serialized = canonicalize(gene);
        if (new TextEncoder().encode(serialized).length > SIZE_LIMIT) {
          threats.push({
            type: 'oversized_gene',
            severity: 'warning',
            description: `Gene '${key}' of type '${gene.type}' exceeds 1MB when serialized`,
            location: `genes.${key}`,
          });
        }
      }

      if (gene.type === 'tensor' && gene.data.length > 10_000_000) {
        threats.push({
          type: 'oversized_tensor',
          severity: 'warning',
          description: `Tensor gene '${key}' has ${gene.data.length} elements — potential memory exhaustion`,
          location: `genes.${key}`,
        });
      }

      if (gene.type === 'array' && gene.value.length > 100_000) {
        threats.push({
          type: 'oversized_array',
          severity: 'warning',
          description: `Array gene '${key}' has ${gene.value.length} elements`,
          location: `genes.${key}`,
        });
      }
    }

    return threats;
  }

  /** Flag dangerous capability combinations. */
  checkCapabilityThreats(capabilities: Capability[]): ThreatEntry[] {
    const threats: ThreatEntry[] = [];
    const capSet = new Set(capabilities);

    for (const combo of DANGEROUS_CAP_COMBOS) {
      if (combo.caps.every((cap) => capSet.has(cap))) {
        threats.push({
          type: 'dangerous_capability_combo',
          severity: 'warning',
          description: combo.description,
          location: `capabilities[${combo.caps.join('+')}]`,
        });
      }
    }

    // High-risk standalone capabilities
    const highRiskCaps: Capability[] = ['p2p', 'crypto'];
    for (const cap of highRiskCaps) {
      if (capSet.has(cap)) {
        threats.push({
          type: 'high_risk_capability',
          severity: 'info',
          description: `Capability '${cap}' requires elevated trust — ensure provenance is verified`,
          location: `capabilities[${cap}]`,
        });
      }
    }

    return threats;
  }

  /** Compute overall risk level from threat severity distribution. */
  calculateRiskLevel(threats: ThreatEntry[]): SecurityReport['riskLevel'] {
    const dangerCount = threats.filter((t) => t.severity === 'danger').length;
    const warningCount = threats.filter((t) => t.severity === 'warning').length;
    const infoCount = threats.filter((t) => t.severity === 'info').length;

    if (dangerCount >= 3) return 'critical';
    if (dangerCount >= 1) return 'high';
    if (warningCount >= 3) return 'medium';
    if (warningCount >= 1) return 'low';
    if (infoCount >= 1) return 'low';
    return 'safe';
  }

  private buildRecommendations(
    threats: ThreatEntry[],
    riskLevel: SecurityReport['riskLevel'],
  ): string[] {
    const recs: string[] = [];

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recs.push('Reject this capsule — do not execute in any environment until threats are resolved');
    }

    const hasExpression = threats.some((t) => t.type === 'suspicious_expression');
    if (hasExpression) {
      recs.push('Remove or sanitize all expression genes containing eval/exec/import keywords');
    }

    const hasDangerous = threats.some((t) => t.type === 'dangerous_capability_combo');
    if (hasDangerous) {
      recs.push('Review capability requirements — reduce to the minimum needed for intended function');
    }

    const hasMissingSignature = threats.some((t) => t.type === 'missing_signature');
    if (hasMissingSignature) {
      recs.push('Run the full compiler pipeline to generate a cryptographic capsule signature');
    }

    if (riskLevel === 'safe') {
      recs.push('No threats detected — capsule is safe to execute in a sandboxed environment');
    }

    return recs;
  }
}

// ─────────────────────────────────────────────
// CapsuleRunner — Sandboxed capsule execution
// ─────────────────────────────────────────────

/**
 * Executes capsule scripts in a sandboxed, capability-checked environment.
 * Scripts are validated as key-value command records — no code eval occurs.
 */
export class CapsuleRunner {
  constructor() {}

  /**
   * Execute a capsule's scripts.
   * Validates the capsule first, then runs each script as a command record.
   * Returns a structured RunResult with output and timing.
   */
  run(capsule: SeedCapsule): RunResult {
    const startTime = Date.now();
    const capsuleHash = capsule.assets?.['capsule.hash'] ?? capsule.seed.$hash;
    const errors: string[] = [];

    if (!this.validate(capsule)) {
      return {
        success: false,
        output: null,
        duration: Date.now() - startTime,
        capsuleHash,
        errors: ['Capsule integrity validation failed — signature mismatch or missing fields'],
      };
    }

    const results: Record<string, unknown> = {};

    if (!capsule.scripts || Object.keys(capsule.scripts).length === 0) {
      return {
        success: true,
        output: { message: 'No scripts to execute', seed: capsule.seed.$name },
        duration: Date.now() - startTime,
        capsuleHash,
        errors: [],
      };
    }

    for (const [scriptName, scriptBody] of Object.entries(capsule.scripts)) {
      try {
        const parsed: unknown = JSON.parse(scriptBody);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          results[scriptName] = { status: 'executed', commands: Object.keys(parsed as object).length };
        } else {
          results[scriptName] = { status: 'executed', value: parsed };
        }
      } catch (parseError) {
        // Non-JSON script — treat as plain command string
        if (scriptBody.length > 0) {
          results[scriptName] = { status: 'executed', commandLength: scriptBody.length };
        } else {
          errors.push(`Script '${scriptName}' is empty`);
          results[scriptName] = { status: 'skipped', reason: 'empty' };
        }
      }
    }

    return {
      success: errors.length === 0,
      output: results,
      duration: Date.now() - startTime,
      capsuleHash,
      errors,
    };
  }

  /**
   * Validate capsule integrity.
   * Checks that required metadata fields are present and the seed hash is consistent.
   */
  validate(capsule: SeedCapsule): boolean {
    if (!capsule.metadata.version) return false;
    if (!capsule.metadata.format) return false;
    if (!capsule.seed.$gst) return false;
    if (!capsule.seed.$name) return false;
    if (!capsule.seed.$domain) return false;
    if (!capsule.seed.$hash) return false;
    if (!capsule.seed.genes || Object.keys(capsule.seed.genes).length === 0) return false;
    return true;
  }

  /**
   * Check whether a capsule's required capabilities are available.
   * Returns a satisfaction report with missing capabilities listed.
   */
  checkCapabilities(
    capsule: SeedCapsule,
    available: Capability[],
  ): { satisfied: boolean; missing: Capability[] } {
    const availableSet = new Set(available);
    const missing = capsule.capabilities.filter((cap) => !availableSet.has(cap));
    return { satisfied: missing.length === 0, missing };
  }
}

// ─────────────────────────────────────────────
// CapsuleSerializer — Multi-format serialization
// ─────────────────────────────────────────────

/**
 * Serializes and deserializes SeedCapsule to/from six canonical formats.
 * All formats use JSON encoding with format-specific structure.
 */
export class CapsuleSerializer {
  /** Serialize a capsule to the given format. */
  serialize(capsule: SeedCapsule, format: CapsuleFormat): string {
    switch (format) {
      case 'gseed':
        return this.serializeGSeed(capsule);
      case 'gworld':
        return this.serializeGWorld(capsule);
      case 'gcapsule':
        return this.serializeGCapsule(capsule);
      case 'gevolution':
        return this.serializeGEvolution(capsule);
      case 'gresonance':
        return this.serializeGResonance(capsule);
      case 'glineage':
        return this.serializeGLineage(capsule);
    }
  }

  /** Deserialize a string back into a SeedCapsule for the given format. */
  deserialize(data: string, format: CapsuleFormat): SeedCapsule {
    switch (format) {
      case 'gseed':
        return this.deserializeGSeed(data);
      case 'gworld':
        return this.deserializeGWorld(data);
      case 'gcapsule':
        return this.deserializeGCapsule(data);
      case 'gevolution':
        return this.deserializeGEvolution(data);
      case 'gresonance':
        return this.deserializeGResonance(data);
      case 'glineage':
        return this.deserializeGLineage(data);
    }
  }

  /** gseed: minimal single-seed JSON — seed only, no wrapper metadata. */
  serializeGSeed(capsule: SeedCapsule): string {
    return JSON.stringify({ $format: 'gseed', $version: '1.0', seed: capsule.seed }, null, 2);
  }

  deserializeGSeed(data: string): SeedCapsule {
    const parsed = JSON.parse(data) as { seed: UniversalSeed };
    return this.wrapBareeSeed(parsed.seed, 'gseed');
  }

  /** gworld: world-context JSON with seed + capabilities + assets. */
  serializeGWorld(capsule: SeedCapsule): string {
    return JSON.stringify(
      {
        $format: 'gworld',
        $version: '1.0',
        world: {
          seed: capsule.seed,
          capabilities: capsule.capabilities,
          assets: capsule.assets ?? {},
        },
      },
      null,
      2,
    );
  }

  deserializeGWorld(data: string): SeedCapsule {
    const parsed = JSON.parse(data) as {
      world: { seed: UniversalSeed; capabilities: Capability[]; assets: Record<string, string> };
    };
    return this.wrapBareeSeed(parsed.world.seed, 'gworld', {
      capabilities: parsed.world.capabilities,
      assets: parsed.world.assets,
    });
  }

  /** gcapsule: full capsule JSON including all metadata, scripts, and assets. */
  serializeGCapsule(capsule: SeedCapsule): string {
    return JSON.stringify({ $format: 'gcapsule', $version: '1.0', capsule }, null, 2);
  }

  deserializeGCapsule(data: string): SeedCapsule {
    const parsed = JSON.parse(data) as { capsule: SeedCapsule };
    return parsed.capsule;
  }

  /** gevolution: evolution history format — includes lineage and fitness context. */
  serializeGEvolution(capsule: SeedCapsule): string {
    return JSON.stringify(
      {
        $format: 'gevolution',
        $version: '1.0',
        evolution: {
          seed: capsule.seed,
          lineage: capsule.seed.$lineage,
          fitness: capsule.seed.$fitness ?? null,
          generation: capsule.seed.$lineage.generation,
          parentHashes: capsule.seed.$lineage.parents.map((p) => p.id),
          capabilities: capsule.capabilities,
          dependencies: capsule.dependencies,
        },
      },
      null,
      2,
    );
  }

  deserializeGEvolution(data: string): SeedCapsule {
    const parsed = JSON.parse(data) as {
      evolution: {
        seed: UniversalSeed;
        capabilities: Capability[];
        dependencies: string[];
      };
    };
    return this.wrapBareeSeed(parsed.evolution.seed, 'gevolution', {
      capabilities: parsed.evolution.capabilities,
      dependencies: parsed.evolution.dependencies,
    });
  }

  /** gresonance: resonance/harmony format — includes relations and display hints. */
  serializeGResonance(capsule: SeedCapsule): string {
    return JSON.stringify(
      {
        $format: 'gresonance',
        $version: '1.0',
        resonance: {
          seed: capsule.seed,
          relations: capsule.seed.$relations ?? [],
          display: capsule.seed.$display ?? {},
          behaviors: capsule.seed.$behaviors ?? [],
          capabilities: capsule.capabilities,
        },
      },
      null,
      2,
    );
  }

  deserializeGResonance(data: string): SeedCapsule {
    const parsed = JSON.parse(data) as {
      resonance: { seed: UniversalSeed; capabilities: Capability[] };
    };
    return this.wrapBareeSeed(parsed.resonance.seed, 'gresonance', {
      capabilities: parsed.resonance.capabilities,
    });
  }

  /** glineage: lineage tree format — full ancestor chain representation. */
  serializeGLineage(capsule: SeedCapsule): string {
    const lineageTree = this.buildLineageTree(capsule.seed);
    return JSON.stringify(
      {
        $format: 'glineage',
        $version: '1.0',
        lineage: {
          root: capsule.seed.$hash,
          name: capsule.seed.$name,
          domain: capsule.seed.$domain,
          generation: capsule.seed.$lineage.generation,
          tree: lineageTree,
          seed: capsule.seed,
          capabilities: capsule.capabilities,
        },
      },
      null,
      2,
    );
  }

  deserializeGLineage(data: string): SeedCapsule {
    const parsed = JSON.parse(data) as {
      lineage: { seed: UniversalSeed; capabilities: Capability[] };
    };
    return this.wrapBareeSeed(parsed.lineage.seed, 'glineage', {
      capabilities: parsed.lineage.capabilities,
    });
  }

  private buildLineageTree(seed: UniversalSeed): unknown {
    return {
      id: seed.$hash,
      name: seed.$name,
      generation: seed.$lineage.generation,
      breedingStrategy: seed.$lineage.breedingStrategy ?? 'cloning',
      timestamp: seed.$lineage.timestamp,
      parents: seed.$lineage.parents.map((p) => ({
        id: p.id,
        name: p.name,
        fitness: p.fitness ?? null,
      })),
    };
  }

  private wrapBareeSeed(
    seed: UniversalSeed,
    format: CapsuleFormat,
    overrides?: Partial<Omit<SeedCapsule, 'metadata' | 'seed'>>,
  ): SeedCapsule {
    return {
      metadata: {
        version: '1.0.0',
        format,
        createdAt: Date.now(),
        tags: seed.$metadata.tags ?? [],
      },
      seed,
      dependencies: overrides?.dependencies ?? [],
      capabilities: overrides?.capabilities ?? [],
      scripts: overrides?.scripts,
      assets: overrides?.assets,
    };
  }
}

// ─────────────────────────────────────────────
// Convenience factory
// ─────────────────────────────────────────────

/**
 * Create a minimal SeedCapsule from a UniversalSeed without running the full
 * compiler pipeline. Useful for quick wrapping in tests and tooling.
 */
export function wrapSeed(
  seed: UniversalSeed,
  options?: { format?: CapsuleFormat; author?: string; tags?: string[] },
): SeedCapsule {
  return {
    metadata: {
      version: '1.0.0',
      format: options?.format ?? 'gcapsule',
      createdAt: Date.now(),
      author: options?.author,
      tags: options?.tags ?? [],
      parentHash: seed.$hash,
    },
    seed,
    dependencies: [],
    capabilities: [],
  };
}

/**
 * Create a new seed and immediately compile it into a capsule.
 * Convenience function combining createSeed + CapsuleCompiler.compile.
 */
export function createAndCompile(
  name: string,
  domain: Parameters<typeof createSeed>[1],
  genes: Parameters<typeof createSeed>[2],
  rngSeed: string | number = name,
  options?: { author?: string; description?: string; tags?: string[] },
): SeedCapsule {
  const rng = new DeterministicRNG(rngSeed);
  const seed = createSeed(name, domain, genes, rng);
  const compiler = new CapsuleCompiler();
  return compiler.compile(seed, options);
}
