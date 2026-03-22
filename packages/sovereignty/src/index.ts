/**
 * @paradigm/sovereignty — governance, consent, ethics, and provenance.
 * Zero external dependencies. All timestamps use Date.now().
 */

// FNV-1a 32-bit hash utility — used by AuditLog and CryptoSigning

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply with JS safe integer arithmetic
    hash = (Math.imul(hash, 0x01000193) >>> 0);
  }
  return hash.toString(16).padStart(8, '0');
}

/** Compute a longer hash by running FNV-1a over two 32-bit windows */
function computeHash(input: string): string {
  const a = fnv1a(input);
  const b = fnv1a(input.split('').reverse().join('') + a);
  return a + b;
}

// --- DataClassifier ---------------------------------------------------------

export type SensitivityLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export interface ClassificationResult {
  level: SensitivityLevel;
  reasons: string[];
  detectedPatterns: string[];
  confidence: number;
}

const RESTRICTED_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'credit_card', regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/ },
  { name: 'password', regex: /\b(?:password|passwd|secret|private[_\s]?key)\s*[:=]\s*\S+/i },
];

const CONFIDENTIAL_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'email', regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/ },
  { name: 'phone', regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { name: 'ip_address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { name: 'api_key', regex: /\b(?:api[_\s]?key|token)\s*[:=]\s*[A-Za-z0-9_\-]{16,}\b/i },
];

const INTERNAL_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'name_field', regex: /\bname\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/i },
  { name: 'address', regex: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Za-z]+)+\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Court|Ct)\b/i },
  { name: 'date_of_birth', regex: /\b(?:dob|date[_\s]of[_\s]birth|born)\s*[:=]\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i },
];

export class DataClassifier {
  classify(data: string): ClassificationResult {
    const reasons: string[] = [];
    const detectedPatterns: string[] = [];
    let matchCount = 0;
    let level: SensitivityLevel = 'public';

    for (const { name, regex } of RESTRICTED_PATTERNS) {
      if (regex.test(data)) {
        level = 'restricted';
        reasons.push(`Detected restricted pattern: ${name}`);
        detectedPatterns.push(name);
        matchCount++;
      }
    }

    if (level !== 'restricted') {
      for (const { name, regex } of CONFIDENTIAL_PATTERNS) {
        if (regex.test(data)) {
          level = 'confidential';
          reasons.push(`Detected confidential pattern: ${name}`);
          detectedPatterns.push(name);
          matchCount++;
        }
      }
    }

    if (level === 'public') {
      for (const { name, regex } of INTERNAL_PATTERNS) {
        if (regex.test(data)) {
          level = 'internal';
          reasons.push(`Detected internal pattern: ${name}`);
          detectedPatterns.push(name);
          matchCount++;
        }
      }
    }

    // Confidence: 0.5 base + 0.1 per match, capped at 1.0
    const confidence = Math.min(1.0, 0.5 + matchCount * 0.1);

    return { level, reasons, detectedPatterns, confidence };
  }
}

// --- ConsentTracker ---------------------------------------------------------

export type ConsentPurpose =
  | 'data_collection'
  | 'analytics'
  | 'sharing'
  | 'research'
  | 'marketing'
  | 'ai_training';

export interface ConsentDecision {
  id: string;
  userId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  timestamp: number;
  expiresAt?: number;
  conditions: string[];
  version: number;
}

export interface ConsentQuery {
  userId: string;
  purpose: ConsentPurpose;
}

function makeConsentId(): string {
  return `consent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ConsentTracker {
  /** Current active consent per userId+purpose */
  private readonly current = new Map<string, ConsentDecision>();
  /** Full history of all decisions */
  private readonly history: ConsentDecision[] = [];
  private version = 1;

  private key(userId: string, purpose: ConsentPurpose): string {
    return `${userId}::${purpose}`;
  }

  grant(
    userId: string,
    purpose: ConsentPurpose,
    options?: { expiresAt?: number; conditions?: string[] },
  ): ConsentDecision {
    const decision: ConsentDecision = {
      id: makeConsentId(),
      userId,
      purpose,
      granted: true,
      timestamp: Date.now(),
      expiresAt: options?.expiresAt,
      conditions: options?.conditions ?? [],
      version: this.version++,
    };
    this.current.set(this.key(userId, purpose), decision);
    this.history.push(decision);
    return decision;
  }

  revoke(userId: string, purpose: ConsentPurpose): ConsentDecision {
    const decision: ConsentDecision = {
      id: makeConsentId(),
      userId,
      purpose,
      granted: false,
      timestamp: Date.now(),
      conditions: [],
      version: this.version++,
    };
    this.current.delete(this.key(userId, purpose));
    this.history.push(decision);
    return decision;
  }

  check(query: ConsentQuery): { granted: boolean; decision: ConsentDecision | undefined; expired: boolean } {
    const decision = this.current.get(this.key(query.userId, query.purpose));
    if (!decision) {
      return { granted: false, decision: undefined, expired: false };
    }
    const expired = decision.expiresAt !== undefined && Date.now() > decision.expiresAt;
    return { granted: decision.granted && !expired, decision, expired };
  }

  getUserConsents(userId: string): ConsentDecision[] {
    return Array.from(this.current.values()).filter((d) => d.userId === userId);
  }

  getAuditTrail(userId: string): ConsentDecision[] {
    return this.history.filter((d) => d.userId === userId);
  }
}

// --- AuditLog ---------------------------------------------------------------

export interface AuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export class AuditLog {
  private readonly entries: AuditEntry[] = [];

  private computeEntryHash(
    previousHash: string,
    timestamp: number,
    actor: string,
    action: string,
    resource: string,
    details: Record<string, unknown>,
  ): string {
    const payload = `${previousHash}:${timestamp}:${actor}:${action}:${resource}:${JSON.stringify(details)}`;
    return computeHash(payload);
  }

  append(
    actor: string,
    action: string,
    resource: string,
    details: Record<string, unknown> = {},
  ): AuditEntry {
    const timestamp = Date.now();
    const previousHash = this.entries.length > 0
      ? (this.entries[this.entries.length - 1]?.hash ?? 'GENESIS')
      : 'GENESIS';
    const hash = this.computeEntryHash(previousHash, timestamp, actor, action, resource, details);
    const entry: AuditEntry = {
      id: `audit_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      actor,
      action,
      resource,
      details,
      previousHash,
      hash,
    };
    this.entries.push(entry);
    return entry;
  }

  verify(): { valid: boolean; brokenAt?: number } {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (!entry) continue;

      const expectedPreviousHash = i === 0 ? 'GENESIS' : (this.entries[i - 1]?.hash ?? 'GENESIS');
      if (entry.previousHash !== expectedPreviousHash) {
        return { valid: false, brokenAt: i };
      }
      const expectedHash = this.computeEntryHash(
        entry.previousHash,
        entry.timestamp,
        entry.actor,
        entry.action,
        entry.resource,
        entry.details,
      );
      if (entry.hash !== expectedHash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true };
  }

  getEntries(filter?: { actor?: string; action?: string; since?: number }): AuditEntry[] {
    return this.entries.filter((e) => {
      if (filter?.actor !== undefined && e.actor !== filter.actor) return false;
      if (filter?.action !== undefined && e.action !== filter.action) return false;
      if (filter?.since !== undefined && e.timestamp < filter.since) return false;
      return true;
    });
  }

  getEntry(id: string): AuditEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  get length(): number {
    return this.entries.length;
  }
}

// --- Anonymizer -------------------------------------------------------------

export interface AnonymizationDetection {
  type: string;
  original: string;
  replacement: string;
  position: number;
}

export interface AnonymizationResult {
  original: string;
  anonymized: string;
  detections: AnonymizationDetection[];
  detectionCount: number;
}

export interface PiiDetection {
  type: string;
  value: string;
  position: number;
}

interface AnonymizerPattern {
  type: string;
  regex: RegExp;
  replacement: string;
}

const ANONYMIZER_PATTERNS: AnonymizerPattern[] = [
  { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  { type: 'credit_card', regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, replacement: '[CC_REDACTED]' },
  { type: 'email', regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
  { type: 'phone', regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
  { type: 'ip_address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },
  {
    type: 'name',
    regex: /(?:name\s*:\s*|called\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
    replacement: '[NAME_REDACTED]',
  },
];

export class Anonymizer {
  anonymize(text: string): AnonymizationResult {
    const detections: AnonymizationDetection[] = [];
    let anonymized = text;

    // Process SSN before credit card to avoid partial overlap ambiguity
    for (const pattern of ANONYMIZER_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(anonymized)) !== null) {
        detections.push({
          type: pattern.type,
          original: match[0],
          replacement: pattern.replacement,
          position: match.index,
        });
      }
      anonymized = anonymized.replace(new RegExp(pattern.regex.source, pattern.regex.flags), pattern.replacement);
    }

    return {
      original: text,
      anonymized,
      detections,
      detectionCount: detections.length,
    };
  }

  detect(text: string): PiiDetection[] {
    const results: PiiDetection[] = [];
    for (const pattern of ANONYMIZER_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        results.push({ type: pattern.type, value: match[0], position: match.index });
      }
    }
    return results;
  }

  isClean(text: string): boolean {
    return this.detect(text).length === 0;
  }
}

// --- CryptoSigning ----------------------------------------------------------

export interface SignatureKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface SignedPayload {
  data: string;
  signature: string;
  publicKey: string;
  timestamp: number;
}

export class CryptoSigning {
  generateKeyPair(seed?: string): SignatureKeyPair {
    const base = seed ?? `key_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const privateKey = computeHash(`private::${base}`);
    const publicKey = computeHash(`public::${privateKey}`);
    return { publicKey, privateKey };
  }

  sign(data: string, privateKey: string): SignedPayload {
    const timestamp = Date.now();
    const publicKey = computeHash(`public::${privateKey}`);
    const signature = computeHash(`${data}::${privateKey}::${timestamp}`);
    return { data, signature, publicKey, timestamp };
  }

  verify(payload: SignedPayload): boolean {
    // HMAC-like tamper-evidence: derive a consistent private key from the public key
    // and confirm both the public key self-consistency and signature match.
    const derivedPrivateKey = computeHash(`private::reverse::${payload.publicKey}`);
    const expectedSig = computeHash(`${payload.data}::${derivedPrivateKey}::${payload.timestamp}`);
    const expectedPublic = computeHash(`public::${derivedPrivateKey}`);

    // Verify the public key is self-consistent and signature matches
    return payload.publicKey === expectedPublic && payload.signature === expectedSig;
  }

}

// --- PeaceTreatyEnforcer ----------------------------------------------------

export interface EthicalRule {
  id: string;
  name: string;
  description: string;
  severity: 'block' | 'warn' | 'log';
  check: (context: EnforcementContext) => boolean; // returns true if violation
}

export interface EnforcementContext {
  action: string;
  actor: string;
  resource: string;
  metadata: Record<string, unknown>;
}

export interface EnforcementViolation {
  ruleId: string;
  ruleName: string;
  severity: string;
  description: string;
}

export interface EnforcementResult {
  allowed: boolean;
  violations: EnforcementViolation[];
  warnings: string[];
}

const _anonymizerSingleton = new Anonymizer();

const DEFAULT_RULES: EthicalRule[] = [
  {
    id: 'no_mass_deletion',
    name: 'No Mass Deletion',
    description: 'Bulk deletion of more than 100 seeds in a single action is prohibited.',
    severity: 'block',
    check: (ctx) => {
      if (ctx.action !== 'delete') return false;
      const count = typeof ctx.metadata['count'] === 'number' ? ctx.metadata['count'] : 0;
      return count > 100;
    },
  },
  {
    id: 'no_unauthorized_export',
    name: 'No Unauthorized Export',
    description: 'Exporting seeds without owner consent triggers a warning.',
    severity: 'warn',
    check: (ctx) => {
      if (ctx.action !== 'export') return false;
      const hasConsent = ctx.metadata['ownerConsent'];
      return !hasConsent;
    },
  },
  {
    id: 'no_pii_in_seeds',
    name: 'No PII in Seeds',
    description: 'Seed creation containing PII is blocked to protect user privacy.',
    severity: 'block',
    check: (ctx) => {
      if (ctx.action !== 'create') return false;
      const content = typeof ctx.metadata['content'] === 'string' ? ctx.metadata['content'] : '';
      return !_anonymizerSingleton.isClean(content);
    },
  },
  {
    id: 'rate_limit_evolution',
    name: 'Rate Limit Evolution',
    description: 'More than 1000 generations in a single evolution run triggers a warning.',
    severity: 'warn',
    check: (ctx) => {
      if (ctx.action !== 'evolve') return false;
      const generations = typeof ctx.metadata['generations'] === 'number' ? ctx.metadata['generations'] : 0;
      return generations > 1000;
    },
  },
  {
    id: 'respect_lineage',
    name: 'Respect Lineage',
    description: 'Modifying seeds with more than 10 generations of lineage is logged.',
    severity: 'log',
    check: (ctx) => {
      if (ctx.action !== 'mutate' && ctx.action !== 'modify') return false;
      const lineageDepth = typeof ctx.metadata['lineageDepth'] === 'number' ? ctx.metadata['lineageDepth'] : 0;
      return lineageDepth > 10;
    },
  },
];

export class PeaceTreatyEnforcer {
  private readonly rules: Map<string, EthicalRule> = new Map();

  constructor() {
    for (const rule of DEFAULT_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  addRule(rule: EthicalRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  enforce(context: EnforcementContext): EnforcementResult {
    const violations: EnforcementViolation[] = [];
    const warnings: string[] = [];

    for (const rule of this.rules.values()) {
      if (rule.check(context)) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          description: rule.description,
        });
        if (rule.severity === 'warn') {
          warnings.push(`[WARN] ${rule.name}: ${rule.description}`);
        } else if (rule.severity === 'log') {
          warnings.push(`[LOG] ${rule.name}: ${rule.description}`);
        }
      }
    }

    const blocked = violations.some((v) => v.severity === 'block');
    return { allowed: !blocked, violations, warnings };
  }

  getRules(): readonly EthicalRule[] {
    return Array.from(this.rules.values());
  }
}

// --- CapabilitySystem -------------------------------------------------------

export type Capability =
  | 'seed:create'
  | 'seed:read'
  | 'seed:mutate'
  | 'seed:delete'
  | 'seed:export'
  | 'world:create'
  | 'world:modify'
  | 'world:delete'
  | 'evolution:run'
  | 'evolution:configure'
  | 'network:connect'
  | 'network:share'
  | 'marketplace:list'
  | 'marketplace:purchase'
  | 'admin:manage_users'
  | 'admin:system_config';

export interface CapabilityGrant {
  capability: Capability;
  grantedTo: string;
  grantedBy: string;
  grantedAt: number;
  expiresAt?: number;
  conditions: string[];
}

export class CapabilitySystem {
  /** Keyed by `${userId}::${capability}` */
  private readonly grants = new Map<string, CapabilityGrant>();

  private key(capability: Capability, userId: string): string {
    return `${userId}::${capability}`;
  }

  grant(
    capability: Capability,
    to: string,
    by: string,
    options?: { expiresAt?: number; conditions?: string[] },
  ): CapabilityGrant {
    const capGrant: CapabilityGrant = {
      capability,
      grantedTo: to,
      grantedBy: by,
      grantedAt: Date.now(),
      expiresAt: options?.expiresAt,
      conditions: options?.conditions ?? [],
    };
    this.grants.set(this.key(capability, to), capGrant);
    return capGrant;
  }

  revoke(capability: Capability, from: string): boolean {
    return this.grants.delete(this.key(capability, from));
  }

  check(
    capability: Capability,
    userId: string,
  ): { allowed: boolean; grant?: CapabilityGrant; expired: boolean } {
    const capGrant = this.grants.get(this.key(capability, userId));
    if (!capGrant) {
      return { allowed: false, grant: undefined, expired: false };
    }
    const expired = capGrant.expiresAt !== undefined && Date.now() > capGrant.expiresAt;
    return { allowed: !expired, grant: capGrant, expired };
  }

  getUserCapabilities(userId: string): CapabilityGrant[] {
    return Array.from(this.grants.values()).filter((g) => g.grantedTo === userId);
  }

  listAll(): CapabilityGrant[] {
    return Array.from(this.grants.values());
  }
}

// --- TermsOfSovereignty -----------------------------------------------------

export interface TermsSection {
  id: string;
  title: string;
  content: string;
  version: number;
  lastUpdated: number;
}

const DEFAULT_TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'data_ownership',
    title: 'Data Ownership',
    content:
      'All seeds, world states, and generated artifacts created by a user remain the sole property ' +
      'of that user. The platform acts as a steward, never claiming ownership over user-created content. ' +
      'Users may export, delete, or transfer their data at any time without restriction.',
    version: 1,
    lastUpdated: 0,
  },
  {
    id: 'seed_provenance',
    title: 'Seed Provenance',
    content:
      'Every seed carries a cryptographically-signed lineage record. The platform guarantees that ' +
      'provenance chains are immutable once written. Forks and derivatives are always traceable to ' +
      'their origin seeds. Users may inspect full lineage history for any seed they own or have read access to.',
    version: 1,
    lastUpdated: 0,
  },
  {
    id: 'community_standards',
    title: 'Community Standards',
    content:
      'Users agree not to use the platform to generate, store, or distribute content that is harmful, ' +
      'deceptive, or violates applicable law. Mass automated actions must comply with rate limits. ' +
      'PII must not be embedded in shared seeds. Violations may result in capability revocation.',
    version: 1,
    lastUpdated: 0,
  },
];

export class TermsOfSovereignty {
  private readonly sections = new Map<string, TermsSection>();

  constructor() {
    const now = Date.now();
    for (const section of DEFAULT_TERMS_SECTIONS) {
      this.sections.set(section.id, { ...section, lastUpdated: now });
    }
  }

  addSection(section: TermsSection): void {
    this.sections.set(section.id, section);
  }

  getSection(id: string): TermsSection | undefined {
    return this.sections.get(id);
  }

  getAllSections(): TermsSection[] {
    return Array.from(this.sections.values());
  }

  render(): string {
    const lines: string[] = ['TERMS OF SOVEREIGNTY', '====================', ''];
    for (const section of this.sections.values()) {
      lines.push(`## ${section.title} (v${section.version})`);
      lines.push('');
      lines.push(section.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  getVersion(): number {
    let max = 0;
    for (const section of this.sections.values()) {
      if (section.version > max) max = section.version;
    }
    return max;
  }
}
