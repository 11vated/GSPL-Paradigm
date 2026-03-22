import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SourceRegistry,
  TokenBucketLimiter,
  RateLimiterPool,
  CredibilityScorer,
  QueryCache,
  QueryRouter,
  HealthMonitor,
  type SourceEntry,
  type SourceType,
  type TokenBucketConfig,
} from './index.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeEntry(
  overrides: Partial<Omit<SourceEntry, 'successCount' | 'failureCount' | 'lastChecked'>> = {},
): Omit<SourceEntry, 'successCount' | 'failureCount' | 'lastChecked'> {
  return {
    id: 'src-1',
    name: 'Test Source',
    type: 'web_search',
    endpoint: 'https://example.com',
    credibility: 0.9,
    costPerQuery: 0,
    avgLatencyMs: 100,
    isActive: true,
    metadata: {},
    ...overrides,
  };
}

function registerSource(
  registry: SourceRegistry,
  overrides: Partial<Omit<SourceEntry, 'successCount' | 'failureCount' | 'lastChecked'>> = {},
): void {
  registry.register(makeEntry(overrides));
}

// ============================================================================
// SOURCE REGISTRY
// ============================================================================

describe('SourceRegistry', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  it('registers a source and retrieves it by id', () => {
    registerSource(registry);
    const entry = registry.get('src-1');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('src-1');
    expect(entry?.successCount).toBe(0);
    expect(entry?.failureCount).toBe(0);
    expect(entry?.lastChecked).toBeGreaterThan(0);
  });

  it('returns undefined for an unregistered source', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('unregisters a source and returns true', () => {
    registerSource(registry);
    expect(registry.unregister('src-1')).toBe(true);
    expect(registry.get('src-1')).toBeUndefined();
  });

  it('returns false when unregistering a non-existent source', () => {
    expect(registry.unregister('ghost')).toBe(false);
  });

  it('list() returns all sources when no type filter given', () => {
    registerSource(registry, { id: 'a', type: 'web_search' });
    registerSource(registry, { id: 'b', type: 'rss' });
    expect(registry.list()).toHaveLength(2);
  });

  it('list() filters by type', () => {
    registerSource(registry, { id: 'a', type: 'web_search' });
    registerSource(registry, { id: 'b', type: 'rss' });
    const webOnly = registry.list('web_search');
    expect(webOnly).toHaveLength(1);
    expect(webOnly[0]?.type).toBe('web_search');
  });

  it('list() returns empty array when no sources of that type exist', () => {
    registerSource(registry, { id: 'a', type: 'web_search' });
    expect(registry.list('api')).toHaveLength(0);
  });

  it('listActive() returns only active sources', () => {
    registerSource(registry, { id: 'active', isActive: true });
    registerSource(registry, { id: 'inactive', isActive: false });
    const active = registry.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe('active');
  });

  it('recordSuccess() increments successCount and updates latency (first time = exact latency)', () => {
    registerSource(registry);
    registry.recordSuccess('src-1', 200);
    const entry = registry.get('src-1');
    expect(entry?.successCount).toBe(1);
    expect(entry?.avgLatencyMs).toBe(200);
  });

  it('recordSuccess() uses EMA (α=0.2) for subsequent calls', () => {
    registerSource(registry, { avgLatencyMs: 100 });
    registry.recordSuccess('src-1', 200); // first: exact = 200
    registry.recordSuccess('src-1', 300); // second: 200 * 0.8 + 300 * 0.2 = 220
    const entry = registry.get('src-1');
    expect(entry?.successCount).toBe(2);
    expect(entry?.avgLatencyMs).toBeCloseTo(220, 5);
  });

  it('recordSuccess() resets consecutive failure counter', () => {
    registerSource(registry);
    registry.recordFailure('src-1');
    registry.recordFailure('src-1');
    registry.recordSuccess('src-1', 50);
    // After success, the source should remain active (consecutive failures reset)
    const entry = registry.get('src-1');
    expect(entry?.isActive).toBe(true);
  });

  it('recordSuccess() on unknown id is a no-op', () => {
    expect(() => registry.recordSuccess('ghost', 100)).not.toThrow();
  });

  it('recordFailure() increments failureCount', () => {
    registerSource(registry);
    registry.recordFailure('src-1');
    expect(registry.get('src-1')?.failureCount).toBe(1);
  });

  it('recordFailure() does not deactivate before 5 consecutive failures', () => {
    registerSource(registry);
    for (let i = 0; i < 4; i++) registry.recordFailure('src-1');
    expect(registry.get('src-1')?.isActive).toBe(true);
  });

  it('recordFailure() auto-deactivates after 5 consecutive failures', () => {
    registerSource(registry);
    for (let i = 0; i < 5; i++) registry.recordFailure('src-1');
    expect(registry.get('src-1')?.isActive).toBe(false);
  });

  it('recordFailure() on unknown id is a no-op', () => {
    expect(() => registry.recordFailure('ghost')).not.toThrow();
  });

  it('reactivate() restores an auto-deactivated source', () => {
    registerSource(registry);
    for (let i = 0; i < 5; i++) registry.recordFailure('src-1');
    expect(registry.get('src-1')?.isActive).toBe(false);
    registry.reactivate('src-1');
    expect(registry.get('src-1')?.isActive).toBe(true);
  });

  it('reactivate() resets consecutive failure counter so next 5 failures deactivate again', () => {
    registerSource(registry);
    for (let i = 0; i < 5; i++) registry.recordFailure('src-1');
    registry.reactivate('src-1');
    for (let i = 0; i < 4; i++) registry.recordFailure('src-1');
    expect(registry.get('src-1')?.isActive).toBe(true);
    registry.recordFailure('src-1');
    expect(registry.get('src-1')?.isActive).toBe(false);
  });

  it('reactivate() on unknown id is a no-op', () => {
    expect(() => registry.reactivate('ghost')).not.toThrow();
  });

  describe('getHealthReport()', () => {
    it('returns zeroed report when registry is empty', () => {
      const report = registry.getHealthReport();
      expect(report.totalSources).toBe(0);
      expect(report.activeSources).toBe(0);
      expect(report.avgCredibility).toBe(0);
      expect(report.totalQueries).toBe(0);
      expect(report.avgLatencyMs).toBe(0);
      expect(report.unhealthySources).toEqual([]);
    });

    it('counts total and active sources correctly', () => {
      registerSource(registry, { id: 'a', isActive: true });
      registerSource(registry, { id: 'b', isActive: false });
      const report = registry.getHealthReport();
      expect(report.totalSources).toBe(2);
      expect(report.activeSources).toBe(1);
    });

    it('computes average credibility', () => {
      registerSource(registry, { id: 'a', credibility: 0.8 });
      registerSource(registry, { id: 'b', credibility: 0.6 });
      const report = registry.getHealthReport();
      expect(report.avgCredibility).toBeCloseTo(0.7, 5);
    });

    it('counts total queries', () => {
      registerSource(registry);
      registry.recordSuccess('src-1', 100);
      registry.recordFailure('src-1');
      const report = registry.getHealthReport();
      expect(report.totalQueries).toBe(2);
    });

    it('reports unhealthy sources with failure rate > 20%', () => {
      registerSource(registry, { id: 'bad' });
      // 1 success + 4 failures = 80% failure rate → unhealthy
      registry.recordSuccess('bad', 100);
      for (let i = 0; i < 4; i++) registry.recordFailure('bad');
      const report = registry.getHealthReport();
      expect(report.unhealthySources).toContain('bad');
    });

    it('does not include sources with 0 queries in unhealthySources', () => {
      registerSource(registry, { id: 'new' });
      const report = registry.getHealthReport();
      expect(report.unhealthySources).not.toContain('new');
    });

    it('does not include sources with failure rate <= 20% as unhealthy', () => {
      registerSource(registry, { id: 'good' });
      registry.recordSuccess('good', 100);
      registry.recordSuccess('good', 100);
      registry.recordSuccess('good', 100);
      registry.recordSuccess('good', 100);
      registry.recordFailure('good'); // 1/5 = 20% — not > 20%
      const report = registry.getHealthReport();
      expect(report.unhealthySources).not.toContain('good');
    });

    it('computes avgLatencyMs from active sources only', () => {
      registerSource(registry, { id: 'a', isActive: true, avgLatencyMs: 100 });
      registerSource(registry, { id: 'b', isActive: false, avgLatencyMs: 9000 });
      const report = registry.getHealthReport();
      expect(report.avgLatencyMs).toBe(100);
    });
  });
});

// ============================================================================
// TOKEN BUCKET LIMITER
// ============================================================================

describe('TokenBucketLimiter', () => {
  const config: TokenBucketConfig = {
    maxTokens: 5,
    refillRate: 2,
    refillIntervalMs: 1000,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tryConsume() returns true when tokens are available', () => {
    const limiter = new TokenBucketLimiter(config);
    expect(limiter.tryConsume()).toBe(true);
  });

  it('tryConsume() returns false when bucket is exhausted', () => {
    const limiter = new TokenBucketLimiter(config);
    for (let i = 0; i < 5; i++) limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);
  });

  it('tryConsume() consumes multiple tokens at once', () => {
    const limiter = new TokenBucketLimiter(config);
    expect(limiter.tryConsume(3)).toBe(true);
    expect(limiter.getAvailable()).toBe(2);
  });

  it('tryConsume() returns false if requested tokens exceed available', () => {
    const limiter = new TokenBucketLimiter(config);
    expect(limiter.tryConsume(6)).toBe(false);
  });

  it('refills tokens after one interval elapses', () => {
    const limiter = new TokenBucketLimiter(config);
    for (let i = 0; i < 5; i++) limiter.tryConsume();
    expect(limiter.getAvailable()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(limiter.getAvailable()).toBe(2); // refillRate = 2
  });

  it('does not exceed maxTokens when refilling', () => {
    const limiter = new TokenBucketLimiter(config);
    limiter.tryConsume(1); // 4 remaining
    vi.advanceTimersByTime(5000); // would add 10, but cap at maxTokens=5
    expect(limiter.getAvailable()).toBe(5);
  });

  it('refills proportionally across multiple intervals', () => {
    const limiter = new TokenBucketLimiter(config);
    for (let i = 0; i < 5; i++) limiter.tryConsume();
    vi.advanceTimersByTime(2000); // 2 intervals × 2 tokens = 4
    expect(limiter.getAvailable()).toBe(4);
  });

  it('getAvailable() returns current token count', () => {
    const limiter = new TokenBucketLimiter(config);
    limiter.tryConsume(2);
    expect(limiter.getAvailable()).toBe(3);
  });

  it('reset() restores full token count', () => {
    const limiter = new TokenBucketLimiter(config);
    for (let i = 0; i < 5; i++) limiter.tryConsume();
    expect(limiter.getAvailable()).toBe(0);
    limiter.reset();
    expect(limiter.getAvailable()).toBe(5);
  });
});

// ============================================================================
// RATE LIMITER POOL
// ============================================================================

describe('RateLimiterPool', () => {
  let pool: RateLimiterPool;

  beforeEach(() => {
    vi.useFakeTimers();
    pool = new RateLimiterPool();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getLimiter() creates a default limiter on first access', () => {
    const limiter = pool.getLimiter('src-a');
    expect(limiter).toBeDefined();
    expect(limiter.getAvailable()).toBe(60); // DEFAULT_RATE_LIMIT_CONFIG.maxTokens
  });

  it('getLimiter() returns the same instance on subsequent calls', () => {
    const a = pool.getLimiter('src-a');
    const b = pool.getLimiter('src-a');
    expect(a).toBe(b);
  });

  it('setLimits() overrides config and replaces limiter', () => {
    const custom: TokenBucketConfig = { maxTokens: 10, refillRate: 1, refillIntervalMs: 500 };
    pool.setLimits('src-b', custom);
    const limiter = pool.getLimiter('src-b');
    expect(limiter.getAvailable()).toBe(10);
  });

  it('tryConsume() delegates to the source limiter and returns true when available', () => {
    expect(pool.tryConsume('src-c')).toBe(true);
  });

  it('tryConsume() returns false when source limiter is exhausted', () => {
    const tinyConfig: TokenBucketConfig = { maxTokens: 1, refillRate: 1, refillIntervalMs: 60000 };
    pool.setLimits('src-d', tinyConfig);
    pool.tryConsume('src-d'); // exhausts the 1 token
    expect(pool.tryConsume('src-d')).toBe(false);
  });

  it('getStatus() returns available and maxTokens for all known limiters', () => {
    pool.getLimiter('s1');
    const custom: TokenBucketConfig = { maxTokens: 20, refillRate: 1, refillIntervalMs: 1000 };
    pool.setLimits('s2', custom);
    const status = pool.getStatus();
    expect(status.has('s1')).toBe(true);
    expect(status.has('s2')).toBe(true);
    expect(status.get('s1')?.maxTokens).toBe(60);
    expect(status.get('s2')?.maxTokens).toBe(20);
    expect(status.get('s2')?.available).toBe(20);
  });

  it('getStatus() returns empty map when no limiters created', () => {
    expect(pool.getStatus().size).toBe(0);
  });
});

// ============================================================================
// CREDIBILITY SCORER
// ============================================================================

describe('CredibilityScorer', () => {
  let registry: SourceRegistry;
  let scorer: CredibilityScorer;

  beforeEach(() => {
    registry = new SourceRegistry();
    scorer = new CredibilityScorer();
  });

  it('returns 0 for unknown source', () => {
    expect(scorer.score('ghost', registry)).toBe(0);
  });

  it('scores a mature source with perfect success rate near 1', () => {
    registerSource(registry, { id: 'good', credibility: 1.0 });
    // Give it lots of successes so successRate is high
    for (let i = 0; i < 10; i++) registry.recordSuccess('good', 10);
    const score = scorer.score('good', registry);
    // successRate(1.0)*0.6 + credibility(1.0)*0.3 + ageFactor(close to 1)*0.1
    expect(score).toBeGreaterThan(0.8);
  });

  it('scores a source with low success rate below a high-credibility perfect source', () => {
    registerSource(registry, { id: 'good', credibility: 1.0 });
    registerSource(registry, { id: 'bad', credibility: 1.0 });
    for (let i = 0; i < 10; i++) registry.recordSuccess('good', 10);
    registry.recordSuccess('bad', 10);
    for (let i = 0; i < 9; i++) registry.recordFailure('bad');
    const goodScore = scorer.score('good', registry);
    const badScore = scorer.score('bad', registry);
    expect(goodScore).toBeGreaterThan(badScore);
  });

  it('scores a brand-new source lower due to age penalty (ageFactor close to 1 at creation)', () => {
    // A new source has lastChecked = Date.now() so ageFactor ≈ 1 — no heavy penalty at creation
    registerSource(registry, { id: 'new', credibility: 0.5 });
    const score = scorer.score('new', registry);
    // successRate = credibility = 0.5 (no queries), ageFactor ≈ 1
    // 0.5*0.6 + 0.5*0.3 + 1*0.1 = 0.55
    expect(score).toBeCloseTo(0.55, 1);
  });

  it('computeSuccessRate() returns credibility when no queries have been made', () => {
    const entry = registry.get('src-1') ?? {
      id: 'src-1', name: 'T', type: 'api' as SourceType, endpoint: '', credibility: 0.7,
      costPerQuery: 0, avgLatencyMs: 0, isActive: true, lastChecked: Date.now(),
      successCount: 0, failureCount: 0, metadata: {},
    };
    expect(scorer.computeSuccessRate(entry)).toBe(0.7);
  });

  it('computeSuccessRate() calculates correctly with queries', () => {
    registerSource(registry, { id: 'src-1', credibility: 0.9 });
    registry.recordSuccess('src-1', 50);
    registry.recordSuccess('src-1', 50);
    registry.recordFailure('src-1');
    const entry = registry.get('src-1')!;
    expect(scorer.computeSuccessRate(entry)).toBeCloseTo(2 / 3, 5);
  });

  it('adjustBase() increases credibility by delta, clamped to 1', () => {
    registerSource(registry, { id: 'src-1', credibility: 0.7 });
    scorer.adjustBase('src-1', 0.2, registry);
    expect(registry.get('src-1')?.credibility).toBeCloseTo(0.9, 5);
  });

  it('adjustBase() decreases credibility by delta, clamped to 0', () => {
    registerSource(registry, { id: 'src-1', credibility: 0.1 });
    scorer.adjustBase('src-1', -0.5, registry);
    expect(registry.get('src-1')?.credibility).toBe(0);
  });

  it('adjustBase() clamps credibility at 1 for large positive delta', () => {
    registerSource(registry, { id: 'src-1', credibility: 0.9 });
    scorer.adjustBase('src-1', 5.0, registry);
    expect(registry.get('src-1')?.credibility).toBe(1);
  });

  it('adjustBase() is a no-op for unknown source', () => {
    expect(() => scorer.adjustBase('ghost', 0.5, registry)).not.toThrow();
  });
});

// ============================================================================
// QUERY CACHE
// ============================================================================

describe('QueryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('set and get returns the stored value', () => {
    const cache = new QueryCache();
    cache.set('k1', { data: 42 });
    expect(cache.get<{ data: number }>('k1')).toEqual({ data: 42 });
  });

  it('get returns undefined for a cache miss', () => {
    const cache = new QueryCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('cache miss increments miss counter', () => {
    const cache = new QueryCache();
    cache.get('missing');
    expect(cache.stats.misses).toBe(1);
  });

  it('cache hit increments hit counter', () => {
    const cache = new QueryCache();
    cache.set('k', 'val');
    cache.get('k');
    expect(cache.stats.hits).toBe(1);
  });

  it('expired entries are not returned (TTL expiry)', () => {
    const cache = new QueryCache({ defaultTtlMs: 1000 });
    cache.set('k', 'value');
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeUndefined();
  });

  it('expired entry increments miss counter', () => {
    const cache = new QueryCache({ defaultTtlMs: 500 });
    cache.set('k', 'v');
    vi.advanceTimersByTime(600);
    cache.get('k');
    expect(cache.stats.misses).toBe(1);
  });

  it('custom TTL overrides default TTL per entry', () => {
    const cache = new QueryCache({ defaultTtlMs: 10000 });
    cache.set('short', 'val', 500);
    vi.advanceTimersByTime(600);
    expect(cache.get('short')).toBeUndefined();
  });

  it('has() returns true for a live entry', () => {
    const cache = new QueryCache();
    cache.set('k', 'v');
    expect(cache.has('k')).toBe(true);
  });

  it('has() returns false for missing entry', () => {
    const cache = new QueryCache();
    expect(cache.has('nope')).toBe(false);
  });

  it('has() returns false for expired entry', () => {
    const cache = new QueryCache({ defaultTtlMs: 100 });
    cache.set('k', 'v');
    vi.advanceTimersByTime(200);
    expect(cache.has('k')).toBe(false);
  });

  it('invalidate() removes the entry and returns true', () => {
    const cache = new QueryCache();
    cache.set('k', 'v');
    expect(cache.invalidate('k')).toBe(true);
    expect(cache.get('k')).toBeUndefined();
  });

  it('invalidate() returns false for non-existent key', () => {
    const cache = new QueryCache();
    expect(cache.invalidate('ghost')).toBe(false);
  });

  it('invalidateByPrefix() removes all matching keys and returns count', () => {
    const cache = new QueryCache();
    cache.set('ns:a', 1);
    cache.set('ns:b', 2);
    cache.set('other:c', 3);
    const removed = cache.invalidateByPrefix('ns:');
    expect(removed).toBe(2);
    expect(cache.size).toBe(1);
    expect(cache.get('other:c')).toBe(3);
  });

  it('invalidateByPrefix() returns 0 when nothing matches', () => {
    const cache = new QueryCache();
    cache.set('k', 'v');
    expect(cache.invalidateByPrefix('xyz:')).toBe(0);
  });

  it('clear() removes all entries', () => {
    const cache = new QueryCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('size property reflects current store size', () => {
    const cache = new QueryCache();
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });

  it('LRU eviction removes the least-recently-used entry when maxEntries is reached', () => {
    const cache = new QueryCache({ maxEntries: 3, defaultTtlMs: 60000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Access 'a' and 'b' to make 'c' the LRU... actually 'a' was set first — re-access 'b' and 'c'
    cache.get('a'); // refreshes 'a'
    cache.get('b'); // refreshes 'b'
    // 'c' is now LRU (set but never accessed after)
    cache.set('d', 4); // triggers eviction of 'c'
    expect(cache.get('c')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('d')).toBe(4);
  });

  it('LRU eviction increments eviction counter', () => {
    const cache = new QueryCache({ maxEntries: 2, defaultTtlMs: 60000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // evicts 'a'
    expect(cache.stats.evictions).toBe(1);
  });

  it('setting an existing key updates the value without eviction', () => {
    const cache = new QueryCache({ maxEntries: 2, defaultTtlMs: 60000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 99); // update, not insert
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(99);
    expect(cache.stats.evictions).toBe(0);
  });

  it('stats.hitRate is 0 when no accesses yet', () => {
    const cache = new QueryCache();
    expect(cache.stats.hitRate).toBe(0);
  });

  it('stats.hitRate calculates correctly', () => {
    const cache = new QueryCache();
    cache.set('k', 'v');
    cache.get('k'); // hit
    cache.get('miss1'); // miss
    cache.get('miss2'); // miss
    // 1 hit / 3 total = 0.333...
    expect(cache.stats.hitRate).toBeCloseTo(1 / 3, 5);
  });
});

// ============================================================================
// QUERY ROUTER
// ============================================================================

describe('QueryRouter', () => {
  let registry: SourceRegistry;
  let pool: RateLimiterPool;
  let cache: QueryCache;
  let router: QueryRouter;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new SourceRegistry();
    pool = new RateLimiterPool();
    cache = new QueryCache();
    router = new QueryRouter(registry, pool, cache);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function addSource(overrides: Partial<Omit<SourceEntry, 'successCount' | 'failureCount' | 'lastChecked'>> = {}): void {
    registry.register(makeEntry({ id: 'src-default', ...overrides }));
  }

  it('route() selects the only available source', () => {
    addSource({ id: 's1', credibility: 0.9, avgLatencyMs: 100, costPerQuery: 0 });
    const decision = router.route('test query');
    expect(decision.selectedSource.id).toBe('s1');
    expect(decision.cached).toBe(false);
  });

  it('route() selects the higher-scored source when multiple are available', () => {
    registry.register(makeEntry({ id: 'low', credibility: 0.2, avgLatencyMs: 500, costPerQuery: 10, isActive: true }));
    registry.register(makeEntry({ id: 'high', credibility: 0.9, avgLatencyMs: 50, costPerQuery: 0, isActive: true }));
    const decision = router.route('query');
    expect(decision.selectedSource.id).toBe('high');
  });

  it('route() with preferredType filters candidates to that type', () => {
    registry.register(makeEntry({ id: 'web', type: 'web_search', credibility: 0.8 }));
    registry.register(makeEntry({ id: 'rss', type: 'rss', credibility: 0.9 }));
    const decision = router.route('query', 'web_search');
    expect(decision.selectedSource.id).toBe('web');
  });

  it('route() reasoning includes preferred type when matched', () => {
    addSource({ id: 's1', type: 'api' });
    const decision = router.route('q', 'api');
    expect(decision.reasoning).toContain("Matched preferred type 'api'");
  });

  it('route() cached flag is true when cache has the key', () => {
    addSource({ id: 's1' });
    cache.set('any:query', { result: 'cached-value' });
    const decision = router.route('query');
    expect(decision.cached).toBe(true);
    expect(decision.reasoning).toContain('Result cached');
  });

  it('route() throws when no active sources exist', () => {
    expect(() => router.route('query')).toThrow(/no available sources/);
  });

  it('route() throws with type hint when preferredType specified and none found', () => {
    expect(() => router.route('query', 'rss')).toThrow(/of type 'rss'/);
  });

  it('route() throws when all sources are inactive', () => {
    addSource({ id: 's1', isActive: false });
    expect(() => router.route('query')).toThrow(/no available sources/);
  });

  it('route() populates alternativeSources with remaining candidates', () => {
    registry.register(makeEntry({ id: 'a', credibility: 0.9 }));
    registry.register(makeEntry({ id: 'b', credibility: 0.5 }));
    registry.register(makeEntry({ id: 'c', credibility: 0.3 }));
    const decision = router.route('query');
    expect(decision.alternativeSources).toHaveLength(2);
  });

  it('route() score is a positive number', () => {
    addSource({ id: 's1', credibility: 0.8 });
    const decision = router.route('query');
    expect(decision.score).toBeGreaterThan(0);
  });

  describe('routeWithFallback()', () => {
    it('returns preferred-type source when available', () => {
      registry.register(makeEntry({ id: 'web', type: 'web_search' }));
      registry.register(makeEntry({ id: 'rss', type: 'rss' }));
      const decision = router.routeWithFallback('query', 'web_search');
      expect(decision.selectedSource.id).toBe('web');
    });

    it('falls back to cross-type source when preferred type is exhausted', () => {
      // Register a web_search source but exhaust its rate limit
      registry.register(makeEntry({ id: 'web', type: 'web_search', credibility: 0.9 }));
      registry.register(makeEntry({ id: 'rss', type: 'rss', credibility: 0.7 }));
      const tinyConfig: TokenBucketConfig = { maxTokens: 0, refillRate: 0, refillIntervalMs: 60000 };
      pool.setLimits('web', tinyConfig);
      const decision = router.routeWithFallback('query', 'web_search');
      expect(decision.selectedSource.type).toBe('rss');
      expect(decision.reasoning).toContain('Fallback');
    });

    it('throws when no sources exist at all', () => {
      expect(() => router.routeWithFallback('query')).toThrow(/no available sources/);
    });

    it('routeWithFallback() without preferredType behaves like route()', () => {
      addSource({ id: 's1' });
      const decision = router.routeWithFallback('query');
      expect(decision.selectedSource.id).toBe('s1');
    });

    it('cached flag reflects cache state for routeWithFallback', () => {
      addSource({ id: 's1', type: 'api' });
      cache.set('api:q', 'cached');
      const decision = router.routeWithFallback('q', 'api');
      expect(decision.cached).toBe(true);
    });
  });

  describe('recordOutcome()', () => {
    it('recordOutcome success delegates to registry.recordSuccess', () => {
      addSource({ id: 's1' });
      router.recordOutcome('s1', true, 120);
      const entry = registry.get('s1');
      expect(entry?.successCount).toBe(1);
      expect(entry?.avgLatencyMs).toBe(120);
    });

    it('recordOutcome failure delegates to registry.recordFailure', () => {
      addSource({ id: 's1' });
      router.recordOutcome('s1', false, 0);
      const entry = registry.get('s1');
      expect(entry?.failureCount).toBe(1);
    });
  });
});

// ============================================================================
// HEALTH MONITOR
// ============================================================================

describe('HealthMonitor', () => {
  let registry: SourceRegistry;
  let monitor: HealthMonitor;

  beforeEach(() => {
    registry = new SourceRegistry();
    monitor = new HealthMonitor();
  });

  it('checkHealth() returns empty array when no sources registered', () => {
    expect(monitor.checkHealth(registry)).toEqual([]);
  });

  it('checkHealth() marks source with no queries as healthy (uptime=1)', () => {
    registerSource(registry, { id: 's1' });
    const results = monitor.checkHealth(registry);
    expect(results).toHaveLength(1);
    expect(results[0]?.healthy).toBe(true);
    expect(results[0]?.uptime).toBe(1);
    expect(results[0]?.recommendation).toBe('keep');
  });

  it('checkHealth() marks source with uptime >= 0.8 as healthy and "keep"', () => {
    registerSource(registry, { id: 's1' });
    for (let i = 0; i < 8; i++) registry.recordSuccess('s1', 100);
    for (let i = 0; i < 2; i++) registry.recordFailure('s1');
    const results = monitor.checkHealth(registry);
    expect(results[0]?.healthy).toBe(true);
    expect(results[0]?.recommendation).toBe('keep');
    expect(results[0]?.uptime).toBeCloseTo(0.8, 5);
  });

  it('checkHealth() marks source with uptime < 0.8 as unhealthy', () => {
    registerSource(registry, { id: 's1' });
    for (let i = 0; i < 3; i++) registry.recordSuccess('s1', 100);
    for (let i = 0; i < 7; i++) registry.recordFailure('s1');
    const results = monitor.checkHealth(registry);
    expect(results[0]?.healthy).toBe(false);
  });

  it('checkHealth() recommends "monitor" for uptime in [0.5, 0.8)', () => {
    registerSource(registry, { id: 's1' });
    for (let i = 0; i < 6; i++) registry.recordSuccess('s1', 100);
    for (let i = 0; i < 4; i++) registry.recordFailure('s1');
    // uptime = 0.6
    const results = monitor.checkHealth(registry);
    expect(results[0]?.recommendation).toBe('monitor');
  });

  it('checkHealth() recommends "deactivate" for uptime < 0.5', () => {
    registerSource(registry, { id: 's1' });
    registry.recordSuccess('s1', 100);
    for (let i = 0; i < 9; i++) registry.recordFailure('s1');
    // uptime = 0.1
    const results = monitor.checkHealth(registry);
    expect(results[0]?.recommendation).toBe('deactivate');
  });

  it('checkHealth() populates avgLatencyMs from the source entry', () => {
    registerSource(registry, { id: 's1', avgLatencyMs: 250 });
    const results = monitor.checkHealth(registry);
    expect(results[0]?.avgLatencyMs).toBe(250);
  });

  it('checkHealth() populates sourceId correctly', () => {
    registerSource(registry, { id: 'my-source' });
    const results = monitor.checkHealth(registry);
    expect(results[0]?.sourceId).toBe('my-source');
  });

  it('getUnhealthy() returns empty array when all sources are healthy', () => {
    registerSource(registry, { id: 's1' });
    for (let i = 0; i < 9; i++) registry.recordSuccess('s1', 50);
    registry.recordFailure('s1');
    expect(monitor.getUnhealthy(registry)).toHaveLength(0);
  });

  it('getUnhealthy() returns sources with success rate < 0.8', () => {
    registerSource(registry, { id: 'bad' });
    for (let i = 0; i < 3; i++) registry.recordSuccess('bad', 50);
    for (let i = 0; i < 7; i++) registry.recordFailure('bad');
    const unhealthy = monitor.getUnhealthy(registry);
    expect(unhealthy).toHaveLength(1);
    expect(unhealthy[0]?.id).toBe('bad');
  });

  it('getUnhealthy() excludes sources with 0 total queries', () => {
    registerSource(registry, { id: 'new' });
    expect(monitor.getUnhealthy(registry)).toHaveLength(0);
  });

  it('suggestDeactivation() returns source IDs with failure rate > 50%', () => {
    registerSource(registry, { id: 'doomed' });
    registry.recordSuccess('doomed', 100);
    for (let i = 0; i < 9; i++) registry.recordFailure('doomed');
    // failureRate = 0.9 > 0.5
    const suggestions = monitor.suggestDeactivation(registry);
    expect(suggestions).toContain('doomed');
  });

  it('suggestDeactivation() excludes sources with failure rate <= 50%', () => {
    registerSource(registry, { id: 'ok' });
    for (let i = 0; i < 6; i++) registry.recordSuccess('ok', 100);
    for (let i = 0; i < 4; i++) registry.recordFailure('ok');
    // failureRate = 0.4 — not > 0.5
    const suggestions = monitor.suggestDeactivation(registry);
    expect(suggestions).not.toContain('ok');
  });

  it('suggestDeactivation() excludes sources with 0 total queries', () => {
    registerSource(registry, { id: 'new' });
    expect(monitor.suggestDeactivation(registry)).not.toContain('new');
  });

  it('suggestDeactivation() returns empty array when registry is empty', () => {
    expect(monitor.suggestDeactivation(registry)).toEqual([]);
  });
});
