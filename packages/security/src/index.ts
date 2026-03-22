/**
 * @paradigm/security — Autonomous defense cycle (AICA pattern) for GSPL Paradigm.
 *
 * Layer 6: Infrastructure security. Provides threat detection, signature matching,
 * seed quarantine, hash-chained audit logging, canary tripwires, and a continuous
 * defense loop orchestrator. Zero external dependencies beyond the Paradigm core.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, GeneMap } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';

// ─────────────────────────────────────────────
// Threat Level
// ─────────────────────────────────────────────

/** Severity classification for security events. */
export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** Numeric weight for each threat level, used for comparisons and aggregation. */
const THREAT_WEIGHT: Readonly<Record<ThreatLevel, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Returns the higher of two threat levels.
 * Used to escalate severity across multiple detection checks.
 */
function maxThreat(a: ThreatLevel, b: ThreatLevel): ThreatLevel {
  return THREAT_WEIGHT[a] >= THREAT_WEIGHT[b] ? a : b;
}

// ─────────────────────────────────────────────
// Audit Entry
// ─────────────────────────────────────────────

/** Immutable record in the hash-chained audit trail. */
export interface AuditEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly action: string;
  readonly actor: string;
  readonly target: string;
  readonly details: string;
  readonly severity: ThreatLevel;
  readonly hash: string;
  readonly previousHash: string;
}

// ─────────────────────────────────────────────
// Threat Report
// ─────────────────────────────────────────────

/** Result of threat analysis on one or more seeds. */
export interface ThreatReport {
  readonly id: string;
  readonly timestamp: number;
  readonly threatLevel: ThreatLevel;
  readonly description: string;
  readonly source: string;
  readonly affectedSeeds: string[];
  readonly recommended: string;
}

// ─────────────────────────────────────────────
// Configurable Thresholds
// ─────────────────────────────────────────────

/** Tunable thresholds for anomaly detection. */
export interface ThreatDetectorConfig {
  /** Maximum allowed string length for a single gene value (default 10000). */
  maxGeneSize: number;
  /** Maximum allowed number of genes per seed (default 100). */
  maxGeneCount: number;
  /** Fitness spike multiplier considered abnormal (default 10). */
  fitnessSpikeFactor: number;
  /** Regex patterns considered dangerous in expression genes. */
  dangerousPatterns: RegExp[];
}

const DEFAULT_DETECTOR_CONFIG: ThreatDetectorConfig = {
  maxGeneSize: 10_000,
  maxGeneCount: 100,
  fitnessSpikeFactor: 10,
  dangerousPatterns: [
    /\beval\b/i,
    /\bexec\b/i,
    /\bFunction\b/,
    /\bimport\s*\(/,
    /\brequire\s*\(/,
    /\bprocess\b/,
    /\b__proto__\b/,
    /\bconstructor\b\s*\[/,
  ],
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Generate a unique ID using the RNG or a counter fallback. */
function generateId(rng: DeterministicRNG | undefined, prefix: string): string {
  if (rng) {
    return `${prefix}_${rng.nextInt(0, 0x7fffffff).toString(16).padStart(8, '0')}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Measure string-serialized size of a gene value.
 * Returns character count of the JSON representation.
 */
function geneStringSize(gene: unknown): number {
  try {
    return JSON.stringify(gene).length;
  } catch {
    return 0;
  }
}

/**
 * Count total genes in a GeneMap (including nested struct genes).
 */
function countGenes(genes: GeneMap): number {
  let count = 0;
  for (const key of Object.keys(genes)) {
    const gene = genes[key];
    if (gene === undefined) continue;
    count += 1;
    if (gene.type === 'struct' && 'fields' in gene) {
      const fields = (gene as { type: 'struct'; fields: GeneMap }).fields;
      count += countGenes(fields);
    }
  }
  return count;
}

/**
 * Collect all expression gene sources from a GeneMap.
 */
function collectExpressionSources(genes: GeneMap): string[] {
  const sources: string[] = [];
  for (const key of Object.keys(genes)) {
    const gene = genes[key];
    if (gene === undefined) continue;
    if (gene.type === 'expression') {
      sources.push((gene as { type: 'expression'; source: string }).source);
    }
    if (gene.type === 'struct' && 'fields' in gene) {
      const fields = (gene as { type: 'struct'; fields: GeneMap }).fields;
      sources.push(...collectExpressionSources(fields));
    }
  }
  return sources;
}

/**
 * Collect all scalar gene values from a GeneMap.
 */
function collectScalarValues(genes: GeneMap): number[] {
  const values: number[] = [];
  for (const key of Object.keys(genes)) {
    const gene = genes[key];
    if (gene === undefined) continue;
    if (gene.type === 'scalar') {
      values.push((gene as { type: 'scalar'; value: number }).value);
    }
    if (gene.type === 'struct' && 'fields' in gene) {
      const fields = (gene as { type: 'struct'; fields: GeneMap }).fields;
      values.push(...collectScalarValues(fields));
    }
  }
  return values;
}

// ─────────────────────────────────────────────
// ThreatDetector — Anomaly detection on seeds
// ─────────────────────────────────────────────

/**
 * Anomaly-based threat detector.
 *
 * Inspects individual seeds for behavioral anomalies:
 * oversized genes, suspicious expressions, abnormal fitness spikes,
 * and gene count explosions. Configurable thresholds allow tuning
 * sensitivity per deployment environment.
 */
export class ThreatDetector {
  private readonly config: ThreatDetectorConfig;
  private readonly rng: DeterministicRNG | undefined;
  private readonly fitnessHistory: Map<string, number[]> = new Map();

  constructor(config?: Partial<ThreatDetectorConfig>, rng?: DeterministicRNG) {
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
    this.rng = rng;
  }

  /**
   * Analyze a seed for anomalies.
   * Returns a ThreatReport if any anomaly is detected, or null if clean.
   */
  analyze(seed: UniversalSeed): ThreatReport | null {
    const issues: string[] = [];
    let level: ThreatLevel = 'none';

    // Check 1: Oversized genes
    for (const key of Object.keys(seed.genes)) {
      const gene = seed.genes[key];
      if (gene === undefined) continue;
      const size = geneStringSize(gene);
      if (size > this.config.maxGeneSize) {
        issues.push(`Gene "${key}" exceeds size limit (${size} > ${this.config.maxGeneSize} chars)`);
        level = maxThreat(level, 'high');
      }
    }

    // Check 2: Suspicious expression genes
    const sources = collectExpressionSources(seed.genes);
    for (const source of sources) {
      for (const pattern of this.config.dangerousPatterns) {
        if (pattern.test(source)) {
          issues.push(`Expression gene contains dangerous pattern: ${pattern.source}`);
          level = maxThreat(level, 'critical');
        }
      }
    }

    // Check 3: Abnormal fitness spike
    const currentFitness = seed.$fitness?.primary;
    if (currentFitness !== undefined) {
      const history = this.fitnessHistory.get(seed.$hash) ?? [];
      if (history.length > 0) {
        let sum = 0;
        for (const val of history) {
          sum += Math.abs(val);
        }
        const avg = sum / history.length;
        if (avg > 0 && Math.abs(currentFitness) > avg * this.config.fitnessSpikeFactor) {
          issues.push(
            `Fitness spike detected: ${currentFitness.toFixed(2)} is >${this.config.fitnessSpikeFactor}x average (${avg.toFixed(2)})`,
          );
          level = maxThreat(level, 'medium');
        }
      }
      history.push(currentFitness);
      this.fitnessHistory.set(seed.$hash, history);
    }

    // Check 4: Gene count explosion
    const geneCount = countGenes(seed.genes);
    if (geneCount > this.config.maxGeneCount) {
      issues.push(`Gene count explosion: ${geneCount} genes (limit: ${this.config.maxGeneCount})`);
      level = maxThreat(level, 'high');
    }

    if (issues.length === 0) {
      return null;
    }

    return {
      id: generateId(this.rng, 'threat'),
      timestamp: Date.now(),
      threatLevel: level,
      description: issues.join('; '),
      source: 'ThreatDetector',
      affectedSeeds: [seed.$hash],
      recommended: level === 'critical'
        ? 'Quarantine immediately and audit lineage'
        : level === 'high'
          ? 'Quarantine seed and review gene contents'
          : 'Flag for manual review',
    };
  }

  /** Reset fitness history tracking. */
  resetHistory(): void {
    this.fitnessHistory.clear();
  }
}

// ─────────────────────────────────────────────
// SignatureEngine — Known threat pattern matching
// ─────────────────────────────────────────────

/** Result of a signature scan. */
export interface SignatureScanResult {
  readonly matches: string[];
  readonly threatLevel: ThreatLevel;
}

/**
 * Signature-based threat scanner.
 *
 * Maintains a registry of named detection patterns (predicates over seeds).
 * Ships with built-in signatures for code injection, resource exhaustion,
 * and identity spoofing. Custom signatures can be added at runtime.
 */
export class SignatureEngine {
  private readonly signatures: Map<string, (seed: UniversalSeed) => boolean> = new Map();
  private readonly signatureSeverity: Map<string, ThreatLevel> = new Map();

  constructor() {
    this.registerBuiltins();
  }

  /** Register built-in threat signatures. */
  private registerBuiltins(): void {
    // Code injection: expression genes with dangerous keywords
    this.addSignature('code_injection', (seed: UniversalSeed): boolean => {
      const sources = collectExpressionSources(seed.genes);
      const dangerous = /\b(eval|exec|Function|import\s*\(|require\s*\(|__proto__|constructor\s*\[)\b/;
      return sources.some((s) => dangerous.test(s));
    }, 'critical');

    // Resource exhaustion: extreme scalar values
    this.addSignature('resource_exhaustion', (seed: UniversalSeed): boolean => {
      const values = collectScalarValues(seed.genes);
      return values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e15);
    }, 'high');

    // Identity spoofing: hash doesn't match computed hash
    this.addSignature('identity_spoofing', (seed: UniversalSeed): boolean => {
      const computed = computeQuickHash({
        $domain: seed.$domain,
        $name: seed.$name,
        genes: seed.genes,
        $lineage: seed.$lineage,
      });
      return computed !== seed.$hash;
    }, 'high');
  }

  /**
   * Add a named threat signature.
   *
   * @param name - Unique signature name.
   * @param pattern - Predicate returning true if the seed matches the threat.
   * @param severity - Threat level assigned when matched (default 'medium').
   */
  addSignature(
    name: string,
    pattern: (seed: UniversalSeed) => boolean,
    severity: ThreatLevel = 'medium',
  ): void {
    this.signatures.set(name, pattern);
    this.signatureSeverity.set(name, severity);
  }

  /**
   * Scan a seed against all registered signatures.
   * Returns matching signature names and the highest threat level found.
   */
  scan(seed: UniversalSeed): SignatureScanResult {
    const matches: string[] = [];
    let level: ThreatLevel = 'none';

    for (const [name, predicate] of this.signatures) {
      try {
        if (predicate(seed)) {
          matches.push(name);
          const severity = this.signatureSeverity.get(name) ?? 'medium';
          level = maxThreat(level, severity);
        }
      } catch {
        // A failing predicate should not crash the scan; skip silently.
      }
    }

    return { matches, threatLevel: level };
  }

  /** List all registered signature names. */
  getSignatureNames(): string[] {
    return Array.from(this.signatures.keys());
  }

  /** Remove a signature by name. Returns true if it existed. */
  removeSignature(name: string): boolean {
    this.signatureSeverity.delete(name);
    return this.signatures.delete(name);
  }
}

// ─────────────────────────────────────────────
// QuarantineManager — Isolate suspicious seeds
// ─────────────────────────────────────────────

/** A quarantined seed entry. */
export interface QuarantineEntry {
  readonly id: string;
  readonly seed: UniversalSeed;
  readonly reason: string;
  readonly timestamp: number;
}

/**
 * Manages quarantine of suspicious seeds.
 *
 * Quarantined seeds are stored in an isolated registry keyed by
 * a unique quarantine ID. Seeds can be released after review.
 */
export class QuarantineManager {
  private readonly entries: Map<string, QuarantineEntry> = new Map();
  private readonly hashIndex: Map<string, string> = new Map(); // seedHash → quarantine ID
  private readonly rng: DeterministicRNG | undefined;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng;
  }

  /**
   * Quarantine a seed with a stated reason.
   * Returns the quarantine ID.
   */
  quarantine(seed: UniversalSeed, reason: string): string {
    const id = generateId(this.rng, 'quar');
    const entry: QuarantineEntry = {
      id,
      seed: structuredClone(seed),
      reason,
      timestamp: Date.now(),
    };
    this.entries.set(id, entry);
    this.hashIndex.set(seed.$hash, id);
    return id;
  }

  /**
   * Release a seed from quarantine by quarantine ID.
   * Returns the seed if found, or undefined if the ID does not exist.
   */
  release(quarantineId: string): UniversalSeed | undefined {
    const entry = this.entries.get(quarantineId);
    if (entry === undefined) {
      return undefined;
    }
    this.entries.delete(quarantineId);
    this.hashIndex.delete(entry.seed.$hash);
    return entry.seed;
  }

  /** Get all quarantined entries. */
  getQuarantined(): QuarantineEntry[] {
    return Array.from(this.entries.values());
  }

  /** Check if a seed (by hash) is currently quarantined. */
  isQuarantined(seedHash: string): boolean {
    return this.hashIndex.has(seedHash);
  }

  /** Get quarantine count. */
  get size(): number {
    return this.entries.size;
  }
}

// ─────────────────────────────────────────────
// AuditLogger — Hash-chained immutable audit trail
// ─────────────────────────────────────────────

/** Filter criteria for querying audit entries. */
export interface AuditFilter {
  actor?: string;
  action?: string;
  severity?: ThreatLevel;
  since?: number;
  until?: number;
}

/**
 * Hash-chained audit logger.
 *
 * Every entry's `hash` is computed from its contents concatenated with
 * the `previousHash` of the preceding entry, forming an append-only
 * tamper-evident chain (similar to a blockchain ledger).
 *
 * Uses `computeQuickHash` from `@paradigm/rng` for deterministic hashing.
 */
export class AuditLogger {
  private readonly entries: AuditEntry[] = [];
  private lastHash: string = '00000000';
  private readonly rng: DeterministicRNG | undefined;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng;
  }

  /**
   * Append a new audit entry to the chain.
   * Returns the created entry with its computed hash.
   */
  log(
    action: string,
    actor: string,
    target: string,
    details: string,
    severity: ThreatLevel,
  ): AuditEntry {
    const id = generateId(this.rng, 'audit');
    const timestamp = Date.now();
    const previousHash = this.lastHash;

    const hash = computeQuickHash({
      id,
      timestamp,
      action,
      actor,
      target,
      details,
      severity,
      previousHash,
    });

    const entry: AuditEntry = {
      id,
      timestamp,
      action,
      actor,
      target,
      details,
      severity,
      hash,
      previousHash,
    };

    this.entries.push(entry);
    this.lastHash = hash;
    return entry;
  }

  /**
   * Query audit entries with optional filtering.
   * All filter fields are ANDed together.
   */
  getEntries(filter?: AuditFilter): AuditEntry[] {
    if (filter === undefined) {
      return [...this.entries];
    }

    return this.entries.filter((entry) => {
      if (filter.actor !== undefined && entry.actor !== filter.actor) return false;
      if (filter.action !== undefined && entry.action !== filter.action) return false;
      if (filter.severity !== undefined && entry.severity !== filter.severity) return false;
      if (filter.since !== undefined && entry.timestamp < filter.since) return false;
      if (filter.until !== undefined && entry.timestamp > filter.until) return false;
      return true;
    });
  }

  /**
   * Retrieve a single audit entry by ID.
   */
  getEntry(id: string): AuditEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /**
   * Verify the integrity of the entire audit chain.
   *
   * Recomputes each entry's hash from its contents + previousHash
   * and checks that the chain is unbroken.
   *
   * @returns An object with `valid: true` if intact, or `valid: false`
   *          with `brokenAt` indicating the first corrupted index.
   */
  verifyIntegrity(): { valid: boolean; brokenAt?: number } {
    let expectedPrevious = '00000000';

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]!;

      // Check chain linkage
      if (entry.previousHash !== expectedPrevious) {
        return { valid: false, brokenAt: i };
      }

      // Recompute hash
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

      if (recomputed !== entry.hash) {
        return { valid: false, brokenAt: i };
      }

      expectedPrevious = entry.hash;
    }

    return { valid: true };
  }

  /** Total number of audit entries. */
  get size(): number {
    return this.entries.length;
  }
}

// ─────────────────────────────────────────────
// CanarySeedSystem — Tripwire seeds
// ─────────────────────────────────────────────

/** Status of a deployed canary. */
export type CanaryStatus = 'intact' | 'triggered' | 'missing';

/** Canary check result. */
export interface CanaryCheckResult {
  readonly name: string;
  readonly status: CanaryStatus;
}

/** Internal canary record. */
interface CanaryRecord {
  readonly name: string;
  readonly domain: string;
  readonly seed: UniversalSeed;
  readonly deployedHash: string;
  readonly deployedTimestamp: number;
}

/**
 * Canary seed system — deploys tripwire seeds that detect unauthorized access.
 *
 * A canary seed is a known-good seed with a recorded hash at deployment time.
 * On each check cycle, the system recomputes the hash and compares it
 * to the deployment snapshot. A mismatch indicates the seed was tampered with.
 */
export class CanarySeedSystem {
  private readonly canaries: Map<string, CanaryRecord> = new Map();
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /**
   * Deploy a new canary seed in the given domain.
   *
   * Creates a minimal seed with a unique hash, records its deployment
   * state, and returns the seed for placement in the target environment.
   */
  deploy(name: string, domain: string): UniversalSeed {
    const seed: UniversalSeed = {
      $gst: '4.0',
      $domain: domain as UniversalSeed['$domain'],
      $hash: '',
      $name: `canary:${name}`,
      $lineage: {
        generation: 0,
        parents: [],
        breedingStrategy: 'cloning',
        timestamp: Date.now(),
      },
      genes: {
        canaryMarker: {
          type: 'scalar' as const,
          value: this.rng.next(),
          min: 0,
          max: 1,
        },
        canaryName: {
          type: 'categorical' as const,
          value: name,
          options: [name],
        },
      },
      $metadata: {
        created: Date.now(),
        creator: 'CanarySeedSystem',
        description: `Canary tripwire seed: ${name}`,
        tags: ['canary', 'security', 'tripwire'],
      },
    };

    // Compute and assign the canonical hash
    seed.$hash = computeQuickHash({
      $domain: seed.$domain,
      $name: seed.$name,
      genes: seed.genes,
      $lineage: seed.$lineage,
    });

    const record: CanaryRecord = {
      name,
      domain,
      seed,
      deployedHash: seed.$hash,
      deployedTimestamp: Date.now(),
    };

    this.canaries.set(name, record);
    return seed;
  }

  /**
   * Check all deployed canaries for tampering.
   *
   * Returns the status of each canary:
   * - `intact`: hash matches deployment snapshot
   * - `triggered`: hash differs from deployment snapshot
   * - `missing`: canary was removed (should not happen in normal flow)
   */
  check(): CanaryCheckResult[] {
    const results: CanaryCheckResult[] = [];

    for (const [, record] of this.canaries) {
      const currentHash = computeQuickHash({
        $domain: record.seed.$domain,
        $name: record.seed.$name,
        genes: record.seed.genes,
        $lineage: record.seed.$lineage,
      });

      const status: CanaryStatus = currentHash === record.deployedHash ? 'intact' : 'triggered';
      results.push({ name: record.name, status });
    }

    return results;
  }

  /** Get the list of all deployed canaries. */
  getCanaries(): Array<{ name: string; domain: string; deployedHash: string; deployedTimestamp: number }> {
    const list: Array<{ name: string; domain: string; deployedHash: string; deployedTimestamp: number }> = [];
    for (const [, record] of this.canaries) {
      list.push({
        name: record.name,
        domain: record.domain,
        deployedHash: record.deployedHash,
        deployedTimestamp: record.deployedTimestamp,
      });
    }
    return list;
  }

  /** Remove a canary by name. Returns true if it existed. */
  removeCanary(name: string): boolean {
    return this.canaries.delete(name);
  }

  /** Number of deployed canaries. */
  get size(): number {
    return this.canaries.size;
  }
}

// ─────────────────────────────────────────────
// DefenseLoopOrchestrator — Continuous monitoring
// ─────────────────────────────────────────────

/** Result of a single defense cycle. */
export interface DefenseCycleResult {
  readonly threats: ThreatReport[];
  readonly quarantined: string[];
  readonly auditEntries: AuditEntry[];
}

/** Status snapshot of the defense loop. */
export interface DefenseStatus {
  readonly cyclesRun: number;
  readonly threatsDetected: number;
  readonly seedsQuarantined: number;
  readonly lastCycleTime: number;
}

/**
 * Defense loop orchestrator — runs the full AICA cycle.
 *
 * Pipeline per cycle:
 * 1. Detect anomalies (ThreatDetector)
 * 2. Match known signatures (SignatureEngine)
 * 3. Quarantine threats at 'high' or 'critical' severity
 * 4. Log all findings to the audit trail
 * 5. Return aggregated report
 */
export class DefenseLoopOrchestrator {
  private readonly detector: ThreatDetector;
  private readonly signatures: SignatureEngine;
  private readonly quarantine: QuarantineManager;
  private readonly audit: AuditLogger;
  private readonly bus: EventBus;

  private cyclesRun: number = 0;
  private threatsDetected: number = 0;
  private seedsQuarantined: number = 0;
  private lastCycleTime: number = 0;

  constructor(
    detector: ThreatDetector,
    signatures: SignatureEngine,
    quarantine: QuarantineManager,
    audit: AuditLogger,
    bus: EventBus,
  ) {
    this.detector = detector;
    this.signatures = signatures;
    this.quarantine = quarantine;
    this.audit = audit;
    this.bus = bus;
  }

  /**
   * Run a full defense cycle over the provided seeds.
   *
   * Each seed is analyzed for anomalies and scanned against signatures.
   * Seeds with high/critical threats are quarantined. All findings are
   * logged to the audit trail.
   */
  runCycle(seeds: ReadonlyArray<UniversalSeed>): DefenseCycleResult {
    const startTime = Date.now();
    const threats: ThreatReport[] = [];
    const quarantined: string[] = [];
    const auditEntries: AuditEntry[] = [];

    for (const seed of seeds) {
      // Skip already-quarantined seeds
      if (this.quarantine.isQuarantined(seed.$hash)) {
        continue;
      }

      let combinedLevel: ThreatLevel = 'none';
      const descriptions: string[] = [];

      // Step 1: Anomaly detection
      const anomalyReport = this.detector.analyze(seed);
      if (anomalyReport !== null) {
        threats.push(anomalyReport);
        combinedLevel = maxThreat(combinedLevel, anomalyReport.threatLevel);
        descriptions.push(anomalyReport.description);
      }

      // Step 2: Signature matching
      const sigResult = this.signatures.scan(seed);
      if (sigResult.matches.length > 0) {
        const sigReport: ThreatReport = {
          id: generateId(undefined, 'sig'),
          timestamp: Date.now(),
          threatLevel: sigResult.threatLevel,
          description: `Signature matches: ${sigResult.matches.join(', ')}`,
          source: 'SignatureEngine',
          affectedSeeds: [seed.$hash],
          recommended: sigResult.threatLevel === 'critical'
            ? 'Quarantine immediately'
            : 'Review matched signatures',
        };
        threats.push(sigReport);
        combinedLevel = maxThreat(combinedLevel, sigResult.threatLevel);
        descriptions.push(sigReport.description);
      }

      // Step 3: Quarantine if severity is high or critical
      if (THREAT_WEIGHT[combinedLevel] >= THREAT_WEIGHT['high']) {
        const reason = descriptions.join(' | ');
        this.quarantine.quarantine(seed, reason);
        quarantined.push(seed.$hash);
        this.seedsQuarantined += 1;

        const qEntry = this.audit.log(
          'seed.quarantined',
          'DefenseLoop',
          seed.$hash,
          reason,
          combinedLevel,
        );
        auditEntries.push(qEntry);
      }

      // Step 4: Log detection events (even non-quarantined findings)
      if (combinedLevel !== 'none') {
        this.threatsDetected += 1;
        const dEntry = this.audit.log(
          'threat.detected',
          'DefenseLoop',
          seed.$hash,
          descriptions.join(' | '),
          combinedLevel,
        );
        auditEntries.push(dEntry);
      }
    }

    // Record cycle metadata
    this.cyclesRun += 1;
    this.lastCycleTime = Date.now() - startTime;

    const cycleEntry = this.audit.log(
      'defense.cycle_complete',
      'DefenseLoop',
      'system',
      `Cycle ${this.cyclesRun}: ${threats.length} threats, ${quarantined.length} quarantined, ${seeds.length} seeds scanned`,
      threats.length > 0 ? 'low' : 'none',
    );
    auditEntries.push(cycleEntry);

    return { threats, quarantined, auditEntries };
  }

  /** Get current defense loop status. */
  getStatus(): DefenseStatus {
    return {
      cyclesRun: this.cyclesRun,
      threatsDetected: this.threatsDetected,
      seedsQuarantined: this.seedsQuarantined,
      lastCycleTime: this.lastCycleTime,
    };
  }
}

// ─────────────────────────────────────────────
// SecurityEngine — Top-level entry point
// ─────────────────────────────────────────────

/** Combined result of scanning a single seed. */
export interface SeedScanResult {
  readonly anomaly: ThreatReport | null;
  readonly signatures: SignatureScanResult;
  readonly overallThreatLevel: ThreatLevel;
}

/**
 * SecurityEngine — top-level security entry point for GSPL Paradigm.
 *
 * Aggregates all security subsystems (threat detector, signature engine,
 * quarantine manager, audit logger, canary system, defense loop) into
 * a single facade. Accepts an optional `DeterministicRNG` for reproducible
 * security IDs and canary generation.
 *
 * Usage:
 * ```typescript
 * const engine = new SecurityEngine(rng);
 * const result = engine.scanSeed(seed);
 * const cycleResult = engine.runDefenseCycle(seeds);
 * ```
 */
export class SecurityEngine {
  /** Anomaly-based threat detector. */
  readonly threats: ThreatDetector;
  /** Known-signature scanner. */
  readonly signatures: SignatureEngine;
  /** Seed quarantine manager. */
  readonly quarantine: QuarantineManager;
  /** Hash-chained audit logger. */
  readonly audit: AuditLogger;
  /** Canary tripwire system. */
  readonly canaries: CanarySeedSystem;
  /** Defense loop orchestrator. */
  readonly defense: DefenseLoopOrchestrator;

  private readonly bus: EventBus;
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('paradigm-security-default');
    this.bus = new EventBus({ maxReplaySize: 100 });

    this.threats = new ThreatDetector(undefined, this.rng);
    this.signatures = new SignatureEngine();
    this.quarantine = new QuarantineManager(this.rng);
    this.audit = new AuditLogger(this.rng);
    this.canaries = new CanarySeedSystem(this.rng);
    this.defense = new DefenseLoopOrchestrator(
      this.threats,
      this.signatures,
      this.quarantine,
      this.audit,
      this.bus,
    );
  }

  /**
   * Scan a single seed for threats (anomalies + signatures).
   * Returns combined analysis without triggering quarantine.
   */
  scanSeed(seed: UniversalSeed): SeedScanResult {
    const anomaly = this.threats.analyze(seed);
    const sigResult = this.signatures.scan(seed);

    const anomalyLevel = anomaly?.threatLevel ?? 'none';
    const overallThreatLevel = maxThreat(anomalyLevel, sigResult.threatLevel);

    return {
      anomaly,
      signatures: sigResult,
      overallThreatLevel,
    };
  }

  /**
   * Run a full defense cycle over the provided seeds.
   * Delegates to the DefenseLoopOrchestrator.
   */
  runDefenseCycle(seeds: ReadonlyArray<UniversalSeed>): DefenseCycleResult {
    return this.defense.runCycle(seeds);
  }
}
