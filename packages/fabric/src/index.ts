/**
 * @paradigm/fabric — Internet connectivity, source management, and rate limiting.
 *
 * Infrastructure routing layer between search/knowledge packages and the raw
 * internet. Zero external dependencies. No network calls are made here.
 *
 * Exports:
 *   SourceRegistry    — Source catalog with health tracking and auto-deactivation
 *   TokenBucketLimiter — Per-source token bucket rate limiter
 *   RateLimiterPool   — Multi-source rate limiter coordination
 *   CredibilityScorer — Composite source reputation scoring with age decay
 *   QueryCache        — LRU + TTL result cache with prefix invalidation
 *   QueryRouter       — Multi-criteria scored routing to best available source
 *   HealthMonitor     — Uptime and failure-rate health monitoring
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export type SourceType = 'web_search' | 'rss' | 'api' | 'file' | 'manual' | 'image_search';

export interface SourceEntry {
  id: string;
  name: string;
  type: SourceType;
  endpoint: string;
  /** Credibility 0–1. Higher = more trustworthy. */
  credibility: number;
  /** Cost per query in arbitrary units; 0 = free. */
  costPerQuery: number;
  avgLatencyMs: number;
  isActive: boolean;
  lastChecked: number;
  successCount: number;
  failureCount: number;
  metadata: Record<string, unknown>;
}

export interface SourceHealthReport {
  totalSources: number;
  activeSources: number;
  avgCredibility: number;
  totalQueries: number;
  avgLatencyMs: number;
  unhealthySources: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

export interface RoutingDecision {
  selectedSource: SourceEntry;
  alternativeSources: SourceEntry[];
  reasoning: string;
  cached: boolean;
  score: number;
}

export interface HealthCheckResult {
  sourceId: string;
  healthy: boolean;
  uptime: number;
  avgLatencyMs: number;
  recommendation: 'keep' | 'monitor' | 'deactivate';
}

export interface TokenBucketConfig {
  maxTokens: number;
  refillRate: number;
  refillIntervalMs: number;
}

// ============================================================================
// SOURCE REGISTRY
// ============================================================================

export class SourceRegistry {
  private readonly sources = new Map<string, SourceEntry>();
  private readonly consecutiveFailures = new Map<string, number>();

  private static readonly AUTO_DEACTIVATE_THRESHOLD = 5;

  register(entry: Omit<SourceEntry, 'successCount' | 'failureCount' | 'lastChecked'>): void {
    const full: SourceEntry = { ...entry, successCount: 0, failureCount: 0, lastChecked: Date.now() };
    this.sources.set(full.id, full);
    this.consecutiveFailures.set(full.id, 0);
  }

  unregister(id: string): boolean {
    this.consecutiveFailures.delete(id);
    return this.sources.delete(id);
  }

  get(id: string): SourceEntry | undefined {
    return this.sources.get(id);
  }

  list(type?: SourceType): SourceEntry[] {
    const all = Array.from(this.sources.values());
    return type === undefined ? all : all.filter((s) => s.type === type);
  }

  listActive(): SourceEntry[] {
    return Array.from(this.sources.values()).filter((s) => s.isActive);
  }

  /** Update stats using exponential moving average (α = 0.2) for latency. */
  recordSuccess(id: string, latencyMs: number): void {
    const entry = this.sources.get(id);
    if (entry === undefined) return;
    const alpha = 0.2;
    const avgLatencyMs =
      entry.successCount === 0
        ? latencyMs
        : entry.avgLatencyMs * (1 - alpha) + latencyMs * alpha;
    this.sources.set(id, { ...entry, successCount: entry.successCount + 1, lastChecked: Date.now(), avgLatencyMs });
    this.consecutiveFailures.set(id, 0);
  }

  /** Deactivates source automatically after AUTO_DEACTIVATE_THRESHOLD consecutive failures. */
  recordFailure(id: string): void {
    const entry = this.sources.get(id);
    if (entry === undefined) return;
    const consecutive = (this.consecutiveFailures.get(id) ?? 0) + 1;
    this.consecutiveFailures.set(id, consecutive);
    const isActive = consecutive >= SourceRegistry.AUTO_DEACTIVATE_THRESHOLD ? false : entry.isActive;
    this.sources.set(id, { ...entry, failureCount: entry.failureCount + 1, lastChecked: Date.now(), isActive });
  }

  reactivate(id: string): void {
    const entry = this.sources.get(id);
    if (entry === undefined) return;
    this.sources.set(id, { ...entry, isActive: true });
    this.consecutiveFailures.set(id, 0);
  }

  getHealthReport(): SourceHealthReport {
    const all = Array.from(this.sources.values());
    const active = all.filter((s) => s.isActive);
    const totalQueries = all.reduce((sum, s) => sum + s.successCount + s.failureCount, 0);
    const avgCredibility = all.length === 0 ? 0 : all.reduce((sum, s) => sum + s.credibility, 0) / all.length;
    const avgLatencyMs = active.length === 0 ? 0 : active.reduce((sum, s) => sum + s.avgLatencyMs, 0) / active.length;
    const unhealthySources = all
      .filter((s) => {
        const total = s.successCount + s.failureCount;
        return total > 0 && s.failureCount / total > 0.2;
      })
      .map((s) => s.id);
    return { totalSources: all.length, activeSources: active.length, avgCredibility, totalQueries, avgLatencyMs, unhealthySources };
  }
}

// ============================================================================
// TOKEN BUCKET LIMITER
// ============================================================================

/**
 * Per-source token bucket rate limiter. Tokens are lazily refilled on access,
 * requiring no background timers or external dependencies.
 */
export class TokenBucketLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly config: TokenBucketConfig) {
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervals = Math.floor(elapsed / this.config.refillIntervalMs);
    if (intervals > 0) {
      this.tokens = Math.min(this.config.maxTokens, this.tokens + intervals * this.config.refillRate);
      this.lastRefill = now - (elapsed % this.config.refillIntervalMs);
    }
  }

  /** @returns `true` if tokens were available and consumed; `false` if rate limited. */
  tryConsume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  getAvailable(): number {
    this.refill();
    return this.tokens;
  }

  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
  }
}

// ============================================================================
// RATE LIMITER POOL
// ============================================================================

const DEFAULT_RATE_LIMIT_CONFIG: TokenBucketConfig = {
  maxTokens: 60,
  refillRate: 1,
  refillIntervalMs: 1000,
};

/** Pool of per-source limiters; creates limiters on demand with default 60 req/min. */
export class RateLimiterPool {
  private readonly limiters = new Map<string, TokenBucketLimiter>();
  private readonly configs = new Map<string, TokenBucketConfig>();

  getLimiter(sourceId: string): TokenBucketLimiter {
    let limiter = this.limiters.get(sourceId);
    if (limiter === undefined) {
      limiter = new TokenBucketLimiter(this.configs.get(sourceId) ?? DEFAULT_RATE_LIMIT_CONFIG);
      this.limiters.set(sourceId, limiter);
    }
    return limiter;
  }

  setLimits(sourceId: string, config: TokenBucketConfig): void {
    this.configs.set(sourceId, config);
    this.limiters.set(sourceId, new TokenBucketLimiter(config));
  }

  tryConsume(sourceId: string): boolean {
    return this.getLimiter(sourceId).tryConsume();
  }

  getStatus(): Map<string, { available: number; maxTokens: number }> {
    const status = new Map<string, { available: number; maxTokens: number }>();
    for (const [id, limiter] of this.limiters) {
      const config = this.configs.get(id) ?? DEFAULT_RATE_LIMIT_CONFIG;
      status.set(id, { available: limiter.getAvailable(), maxTokens: config.maxTokens });
    }
    return status;
  }
}

// ============================================================================
// CREDIBILITY SCORER
// ============================================================================

/** Sources are considered mature after 30 days; newer ones receive an age penalty. */
const CREDIBILITY_MATURITY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Composite credibility score:
 *   successRate * 0.6  + baseCredibility * 0.3 + ageFactor * 0.1
 *
 * Age factor penalises newly-registered sources that lack a track record.
 */
export class CredibilityScorer {
  score(sourceId: string, registry: SourceRegistry): number {
    const entry = registry.get(sourceId);
    if (entry === undefined) return 0;
    const successRate = this.computeSuccessRate(entry);
    const ageFactor = this.computeAgeFactor(entry);
    return successRate * 0.6 + entry.credibility * 0.3 + ageFactor * 0.1;
  }

  /** Nudge base credibility by `delta`, clamped to [0, 1]. */
  adjustBase(sourceId: string, delta: number, registry: SourceRegistry): void {
    const entry = registry.get(sourceId);
    if (entry === undefined) return;
    const credibility = Math.max(0, Math.min(1, entry.credibility + delta));
    registry.unregister(sourceId);
    registry.register({ ...entry, credibility });
  }

  computeSuccessRate(entry: SourceEntry): number {
    const total = entry.successCount + entry.failureCount;
    return total === 0 ? entry.credibility : entry.successCount / total;
  }

  private computeAgeFactor(entry: SourceEntry): number {
    const ageMs = Date.now() - entry.lastChecked;
    return 1 - Math.min(1, ageMs / CREDIBILITY_MATURITY_MS);
  }
}

// ============================================================================
// QUERY CACHE
// ============================================================================

export interface QueryCacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessOrder: number;
}

/**
 * LRU + TTL cache. Expired entries are lazily removed on access.
 * LRU eviction fires when `maxEntries` is reached.
 */
export class QueryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private accessCounter = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor({ maxEntries = 1000, defaultTtlMs = 5 * 60 * 1000 }: QueryCacheOptions = {}) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (entry === undefined) { this.misses++; return undefined; }
    if (Date.now() > entry.expiresAt) { this.store.delete(key); this.misses++; return undefined; }
    entry.accessOrder = ++this.accessCounter;
    this.hits++;
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    if (this.store.has(key)) {
      this.store.set(key, { value, expiresAt: Date.now() + ttl, accessOrder: ++this.accessCounter });
      return;
    }
    if (this.store.size >= this.maxEntries) this.evictLRU();
    this.store.set(key, { value, expiresAt: Date.now() + ttl, accessOrder: ++this.accessCounter });
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (entry === undefined) return false;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return false; }
    return true;
  }

  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  invalidateByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) { this.store.delete(key); removed++; }
    }
    return removed;
  }

  clear(): void { this.store.clear(); }

  get size(): number { return this.store.size; }

  get stats(): CacheStats {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, evictions: this.evictions, size: this.store.size, hitRate: total === 0 ? 0 : this.hits / total };
  }

  private evictLRU(): void {
    let lruKey: string | undefined;
    let lruOrder = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.accessOrder < lruOrder) { lruOrder = entry.accessOrder; lruKey = key; }
    }
    if (lruKey !== undefined) { this.store.delete(lruKey); this.evictions++; }
  }
}

// ============================================================================
// QUERY ROUTER
// ============================================================================

const SCORE_WEIGHTS = { credibility: 0.4, latency: 0.3, cost: 0.2, availability: 0.1 } as const;

interface ScoredSource { entry: SourceEntry; score: number; }

/**
 * Routes queries to the best available source via multi-criteria scoring:
 *   credibility * 0.4 + (1 − normalizedLatency) * 0.3 + (1 − normalizedCost) * 0.2 + availability * 0.1
 *
 * Inactive and rate-limited sources are excluded before scoring.
 */
export class QueryRouter {
  private readonly scorer = new CredibilityScorer();

  constructor(
    private readonly registry: SourceRegistry,
    private readonly limiterPool: RateLimiterPool,
    private readonly cache: QueryCache,
  ) {}

  route(query: string, preferredType?: SourceType): RoutingDecision {
    const cached = this.cache.has(this.cacheKey(query, preferredType));
    const candidates = this.scoredCandidates(preferredType);
    if (candidates.length === 0) {
      throw new Error(
        `QueryRouter: no available sources${preferredType !== undefined ? ` of type '${preferredType}'` : ''}. ` +
          `Ensure sources are registered, active, and not rate-limited.`,
      );
    }
    const best = candidates[0]!;
    const alternatives = candidates.slice(1);
    return { selectedSource: best.entry, alternativeSources: alternatives.map((c) => c.entry), reasoning: this.reasoning(best, preferredType, cached), cached, score: best.score };
  }

  routeWithFallback(query: string, preferredType?: SourceType): RoutingDecision {
    const preferred = this.scoredCandidates(preferredType);
    const fallback = preferredType !== undefined
      ? this.scoredCandidates(undefined).filter((c) => c.entry.type !== preferredType)
      : [];
    const combined = [...preferred, ...fallback];
    if (combined.length === 0) {
      throw new Error(`QueryRouter: no available sources for query. Register and activate at least one source.`);
    }
    const cached = this.cache.has(this.cacheKey(query, preferredType));
    const best = combined[0]!;
    const alternatives = combined.slice(1);
    const usedFallback = preferredType !== undefined && best.entry.type !== preferredType;
    return { selectedSource: best.entry, alternativeSources: alternatives.map((c) => c.entry), reasoning: this.reasoning(best, preferredType, cached, usedFallback), cached, score: best.score };
  }

  recordOutcome(sourceId: string, success: boolean, latencyMs: number): void {
    if (success) { this.registry.recordSuccess(sourceId, latencyMs); }
    else { this.registry.recordFailure(sourceId); }
  }

  private scoredCandidates(type?: SourceType): ScoredSource[] {
    const sources = type !== undefined ? this.registry.list(type) : this.registry.listActive();
    const eligible = sources.filter((s) => s.isActive && this.limiterPool.tryConsume(s.id));
    if (eligible.length === 0) return [];

    const maxLatency = Math.max(...eligible.map((s) => s.avgLatencyMs), 1);
    const maxCost = Math.max(...eligible.map((s) => s.costPerQuery), 1);

    return eligible
      .map((entry): ScoredSource => {
        const credibility = this.scorer.score(entry.id, this.registry);
        const score =
          credibility * SCORE_WEIGHTS.credibility +
          (1 - entry.avgLatencyMs / maxLatency) * SCORE_WEIGHTS.latency +
          (1 - entry.costPerQuery / maxCost) * SCORE_WEIGHTS.cost +
          SCORE_WEIGHTS.availability; // availability = 1 for all eligible sources
        return { entry, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  private cacheKey(query: string, type?: SourceType): string {
    return `${type ?? 'any'}:${query}`;
  }

  private reasoning(best: ScoredSource, preferredType: SourceType | undefined, cached: boolean, usedFallback = false): string {
    const parts = [
      `Selected '${best.entry.name}' (${best.entry.id}) score=${best.score.toFixed(3)} type=${best.entry.type}.`,
    ];
    if (preferredType !== undefined && !usedFallback) parts.push(`Matched preferred type '${preferredType}'.`);
    if (usedFallback) parts.push(`Fallback from '${preferredType ?? 'any'}' to '${best.entry.type}'.`);
    if (cached) parts.push('Result cached.');
    return parts.join(' ');
  }
}

// ============================================================================
// HEALTH MONITOR
// ============================================================================

export class HealthMonitor {
  private static readonly HEALTHY_THRESHOLD = 0.8;
  private static readonly DEACTIVATE_THRESHOLD = 0.5;

  checkHealth(registry: SourceRegistry): HealthCheckResult[] {
    return registry.list().map((entry) => {
      const total = entry.successCount + entry.failureCount;
      const uptime = total === 0 ? 1 : entry.successCount / total;
      const healthy = uptime >= HealthMonitor.HEALTHY_THRESHOLD;
      const recommendation: 'keep' | 'monitor' | 'deactivate' =
        uptime >= HealthMonitor.HEALTHY_THRESHOLD ? 'keep'
        : uptime >= 1 - HealthMonitor.DEACTIVATE_THRESHOLD ? 'monitor'
        : 'deactivate';
      return { sourceId: entry.id, healthy, uptime, avgLatencyMs: entry.avgLatencyMs, recommendation };
    });
  }

  getUnhealthy(registry: SourceRegistry): SourceEntry[] {
    return registry.list().filter((entry) => {
      const total = entry.successCount + entry.failureCount;
      return total > 0 && entry.successCount / total < HealthMonitor.HEALTHY_THRESHOLD;
    });
  }

  /** Returns source IDs with >50% failure rate, suggesting deactivation. */
  suggestDeactivation(registry: SourceRegistry): string[] {
    return registry
      .list()
      .filter((entry) => {
        const total = entry.successCount + entry.failureCount;
        return total > 0 && entry.failureCount / total > HealthMonitor.DEACTIVATE_THRESHOLD;
      })
      .map((entry) => entry.id);
  }
}
