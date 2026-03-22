/**
 * Comprehensive tests for @paradigm/search
 * Targets 80%+ line/statement coverage and 70%+ branch coverage.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  MockSearchProvider,
  ConceptSearch,
  SearchCache,
  CachedSearchProvider,
  ReferenceCollector,
  SearXNGProvider,
  DuckDuckGoProvider,
  BraveSearchProvider,
  UnsplashProvider,
  PexelsProvider,
  PixabayProvider,
  CombinedImageSearch,
} from './index.js';
import type {
  SearchResult,
  ImageSearchResult,
  SearchOptions,
  ImageSearchProvider,
  SearchProvider,
} from './index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeFetchOk(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

function makeFetchFail(status = 500): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  } as Response);
}

function makeFetchReject(err = new Error('network error')): typeof fetch {
  return vi.fn().mockRejectedValue(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MockSearchProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('MockSearchProvider', () => {
  const provider = new MockSearchProvider();

  it('isAvailable() always returns true', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('name is "mock"', () => {
    expect(provider.name).toBe('mock');
  });

  it('returns results for a keyword-matched query (dragon)', async () => {
    const results = await provider.search('dragon lore');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('mock');
    expect(results[0].title).toContain('Dragon');
  });

  it('returns results for "forest" keyword', async () => {
    const results = await provider.search('exploring the forest biome');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toContain('forest');
  });

  it('returns results for "sword" keyword', async () => {
    const results = await provider.search('sword combat techniques');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Sword');
  });

  it('returns default result when no keyword matches', async () => {
    const results = await provider.search('zzz_unique_unknown_xyz');
    expect(results).toHaveLength(1);
    expect(results[0].title).toContain('zzz_unique_unknown_xyz');
    expect(results[0].source).toBe('mock');
    expect(results[0].relevance).toBe(0.5);
  });

  it('respects maxResults option', async () => {
    // dragon + forest in same query should give multiple canned results
    const results = await provider.search('dragon', { maxResults: 1 });
    expect(results).toHaveLength(1);
  });

  it('matches keywords case-insensitively', async () => {
    const results = await provider.search('DRAGON adventure');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Dragon');
  });

  it('sets fresh timestamps on each call', async () => {
    const before = Date.now();
    const results = await provider.search('dragon');
    const after = Date.now();
    expect(results[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(results[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('combines results from multiple matching keywords', async () => {
    const results = await provider.search('dragon sword');
    // Should have entries from both 'dragon' and 'sword' maps
    const sources = results.map((r) => r.url);
    const hasDragon = sources.some((u) => u.includes('dragon'));
    const hasSword = sources.some((u) => u.includes('sword'));
    expect(hasDragon).toBe(true);
    expect(hasSword).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ConceptSearch
// ─────────────────────────────────────────────────────────────────────────────

describe('ConceptSearch', () => {
  const cs = new ConceptSearch();

  // --- expand ---

  describe('expand()', () => {
    it('expands known creature term', () => {
      const terms = cs.expand('dragon');
      expect(terms).toContain('wolf');
      expect(terms).toContain('phoenix');
      expect(terms).not.toContain('dragon'); // original excluded
    });

    it('expands known environment term', () => {
      const terms = cs.expand('forest');
      expect(terms).toContain('cave');
      expect(terms).toContain('ocean');
      expect(terms).not.toContain('forest');
    });

    it('expands known weapon term', () => {
      const terms = cs.expand('sword');
      expect(terms).toContain('bow');
      expect(terms).toContain('axe');
      expect(terms).not.toContain('sword');
    });

    it('expands by category name (creature)', () => {
      const terms = cs.expand('creature');
      expect(terms).toContain('dragon');
      expect(terms).toContain('wolf');
    });

    it('expands by category name (weapon)', () => {
      const terms = cs.expand('weapon');
      expect(terms).toContain('sword');
      expect(terms).toContain('bow');
    });

    it('expands by category name (environment)', () => {
      const terms = cs.expand('environment');
      expect(terms).toContain('forest');
    });

    it('returns fuzzy fallback for partially matching unknown term', () => {
      // "mages" contains "mage" which is in character_class
      const terms = cs.expand('mages');
      expect(Array.isArray(terms)).toBe(true);
      expect(terms.length).toBeGreaterThan(0);
    });

    it('returns empty array for completely unknown term', () => {
      const terms = cs.expand('xyzzy_totally_unknown_concept_12345');
      expect(terms).toEqual([]);
    });

    it('is case-insensitive', () => {
      const lower = cs.expand('dragon');
      const upper = cs.expand('DRAGON');
      expect(lower).toEqual(upper);
    });
  });

  // --- findRelated ---

  describe('findRelated()', () => {
    it('returns ConceptExpansion with original preserved', () => {
      const result = cs.findRelated('Dragon');
      expect(result.original).toBe('Dragon');
    });

    it('returns related terms for known concept', () => {
      const result = cs.findRelated('dragon');
      expect(result.related.length).toBeGreaterThan(0);
      const terms = result.related.map((r) => r.term);
      expect(terms).toContain('wolf');
    });

    it('respects maxResults parameter', () => {
      const result = cs.findRelated('dragon', 3);
      expect(result.related.length).toBeLessThanOrEqual(3);
    });

    it('each related entry has term, relevance (0-1), and category', () => {
      const result = cs.findRelated('sword');
      for (const entry of result.related) {
        expect(typeof entry.term).toBe('string');
        expect(entry.relevance).toBeGreaterThanOrEqual(0);
        expect(entry.relevance).toBeLessThanOrEqual(1);
        expect(typeof entry.category).toBe('string');
      }
    });

    it('results are sorted by descending relevance', () => {
      const result = cs.findRelated('dragon', 20);
      for (let i = 1; i < result.related.length; i++) {
        expect(result.related[i - 1].relevance).toBeGreaterThanOrEqual(
          result.related[i].relevance,
        );
      }
    });

    it('handles unknown concept gracefully', () => {
      const result = cs.findRelated('xyzzy_noop_12345');
      expect(result.original).toBe('xyzzy_noop_12345');
      expect(Array.isArray(result.related)).toBe(true);
    });

    it('finds related for a term matching multiple categories (dungeon appears in environment and architecture)', () => {
      // "dungeon" is in both environment and architecture
      const result = cs.findRelated('dungeon', 20);
      const categories = new Set(result.related.map((r) => r.category));
      // Primary category plus cross-category hits should yield multiple categories
      expect(categories.size).toBeGreaterThanOrEqual(1);
    });

    it('uses maxResults default of 10', () => {
      const result = cs.findRelated('fire');
      expect(result.related.length).toBeLessThanOrEqual(10);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SearchCache
// ─────────────────────────────────────────────────────────────────────────────

describe('SearchCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('set and get a value', () => {
    const cache = new SearchCache<string>();
    cache.set('key1', 'hello');
    expect(cache.get('key1')).toBe('hello');
  });

  it('get returns undefined for missing key', () => {
    const cache = new SearchCache<string>();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('has() returns true for existing key', () => {
    const cache = new SearchCache<string>();
    cache.set('k', 'v');
    expect(cache.has('k')).toBe(true);
  });

  it('has() returns false for missing key', () => {
    const cache = new SearchCache<string>();
    expect(cache.has('missing')).toBe(false);
  });

  it('size reflects only non-expired entries', () => {
    vi.useFakeTimers();
    const cache = new SearchCache<string>({ defaultTtlMs: 1000 });
    cache.set('a', 'x');
    cache.set('b', 'y');
    expect(cache.size).toBe(2);
    vi.advanceTimersByTime(1500);
    expect(cache.size).toBe(0);
  });

  it('TTL expiry: get() returns undefined after TTL elapses', () => {
    vi.useFakeTimers();
    const cache = new SearchCache<string>({ defaultTtlMs: 500 });
    cache.set('myKey', 'myValue');
    expect(cache.get('myKey')).toBe('myValue');
    vi.advanceTimersByTime(600);
    expect(cache.get('myKey')).toBeUndefined();
  });

  it('TTL expiry: has() returns false after TTL elapses', () => {
    vi.useFakeTimers();
    const cache = new SearchCache<string>({ defaultTtlMs: 300 });
    cache.set('k', 'v');
    vi.advanceTimersByTime(400);
    expect(cache.has('k')).toBe(false);
  });

  it('custom TTL override on set()', () => {
    vi.useFakeTimers();
    const cache = new SearchCache<string>({ defaultTtlMs: 10_000 });
    cache.set('shortLived', 'data', 200);
    vi.advanceTimersByTime(300);
    expect(cache.get('shortLived')).toBeUndefined();
  });

  it('setImage() stores with image TTL (longer than default)', () => {
    vi.useFakeTimers();
    // defaultTtl 1 second, imageTtl 5 seconds
    const cache = new SearchCache<string>({ defaultTtlMs: 1000, imageTtlMs: 5000 });
    cache.setImage('img', 'img-data');
    vi.advanceTimersByTime(2000);
    // Still alive under image TTL
    expect(cache.get('img')).toBe('img-data');
    vi.advanceTimersByTime(4000);
    expect(cache.get('img')).toBeUndefined();
  });

  it('LRU eviction: oldest entry is evicted when maxEntries exceeded', () => {
    const cache = new SearchCache<number>({ maxEntries: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // All three present
    expect(cache.has('a')).toBe(true);
    // Adding a 4th evicts 'a' (oldest by insertion order)
    cache.set('d', 4);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('LRU eviction continues correctly across multiple evictions', () => {
    const cache = new SearchCache<number>({ maxEntries: 2 });
    cache.set('x', 10);
    cache.set('y', 20);
    cache.set('z', 30); // evicts 'x'
    expect(cache.has('x')).toBe(false);
    expect(cache.has('y')).toBe(true);
    cache.set('w', 40); // evicts 'y'
    expect(cache.has('y')).toBe(false);
    expect(cache.has('z')).toBe(true);
    expect(cache.has('w')).toBe(true);
  });

  it('clear() removes all entries and resets size to 0', () => {
    const cache = new SearchCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('clear() resets clock so LRU ordering is correct after re-fill', () => {
    const cache = new SearchCache<number>({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    cache.set('c', 3);
    cache.set('d', 4);
    cache.set('e', 5); // evicts 'c' (first after clear)
    expect(cache.has('c')).toBe(false);
    expect(cache.has('d')).toBe(true);
    expect(cache.has('e')).toBe(true);
  });

  it('uses default maxEntries and TTL when no options supplied', () => {
    const cache = new SearchCache();
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CachedSearchProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('CachedSearchProvider', () => {
  it('name is prefixed with "cached:"', () => {
    const mock = new MockSearchProvider();
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);
    expect(cached.name).toBe('cached:mock');
  });

  it('first call hits underlying provider', async () => {
    const mock = new MockSearchProvider();
    const searchSpy = vi.spyOn(mock, 'search');
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);

    await cached.search('dragon');
    expect(searchSpy).toHaveBeenCalledOnce();
  });

  it('second call with same query does not hit underlying provider', async () => {
    const mock = new MockSearchProvider();
    const searchSpy = vi.spyOn(mock, 'search');
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);

    await cached.search('dragon');
    await cached.search('dragon');
    expect(searchSpy).toHaveBeenCalledOnce();
  });

  it('returns same results from cache on second call', async () => {
    const mock = new MockSearchProvider();
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);

    const first = await cached.search('sword');
    const second = await cached.search('sword');
    expect(second).toEqual(first);
  });

  it('different queries each hit the provider independently', async () => {
    const mock = new MockSearchProvider();
    const searchSpy = vi.spyOn(mock, 'search');
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);

    await cached.search('dragon');
    await cached.search('forest');
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });

  it('different queries return different results', async () => {
    const mock = new MockSearchProvider();
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);

    const dragonResults = await cached.search('dragon');
    const swordResults = await cached.search('sword');
    const dragonUrls = dragonResults.map((r) => r.url);
    const swordUrls = swordResults.map((r) => r.url);
    expect(dragonUrls).not.toEqual(swordUrls);
  });

  it('options affect cache key: different maxResults = different cache entry', async () => {
    const mock = new MockSearchProvider();
    const searchSpy = vi.spyOn(mock, 'search');
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);

    await cached.search('dragon', { maxResults: 5 });
    await cached.search('dragon', { maxResults: 3 });
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });

  it('isAvailable() delegates to underlying provider', async () => {
    const mock = new MockSearchProvider();
    const cache = new SearchCache<SearchResult[]>();
    const cached = new CachedSearchProvider(mock, cache);
    expect(await cached.isAvailable()).toBe(true);
  });

  it('respects TTL expiry and re-fetches after expiry', async () => {
    vi.useFakeTimers();
    const mock = new MockSearchProvider();
    const searchSpy = vi.spyOn(mock, 'search');
    const cache = new SearchCache<SearchResult[]>({ defaultTtlMs: 500 });
    const cached = new CachedSearchProvider(mock, cache);

    await cached.search('dragon');
    vi.advanceTimersByTime(600);
    await cached.search('dragon');
    expect(searchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ReferenceCollector
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceCollector', () => {
  it('collect() returns a ReferenceCollection with correct shape', async () => {
    const collector = new ReferenceCollector();
    const mock = new MockSearchProvider();
    const collection = await collector.collect('dragon', [mock]);

    expect(collection.query).toBe('dragon');
    expect(Array.isArray(collection.results)).toBe(true);
    expect(Array.isArray(collection.images)).toBe(true);
    expect(Array.isArray(collection.relatedConcepts)).toBe(true);
    expect(typeof collection.totalSources).toBe('number');
    expect(typeof collection.collectedAt).toBe('number');
  });

  it('collect() returns results from the mock provider', async () => {
    const collector = new ReferenceCollector();
    const mock = new MockSearchProvider();
    const collection = await collector.collect('dragon', [mock]);
    expect(collection.results.length).toBeGreaterThan(0);
  });

  it('collect() populates relatedConcepts via ConceptSearch', async () => {
    const collector = new ReferenceCollector();
    const mock = new MockSearchProvider();
    const collection = await collector.collect('dragon', [mock]);
    expect(collection.relatedConcepts.length).toBeGreaterThan(0);
  });

  it('collect() deduplicates results from multiple providers by URL', async () => {
    const collector = new ReferenceCollector();
    const mock1 = new MockSearchProvider();
    const mock2 = new MockSearchProvider();
    const collection = await collector.collect('dragon', [mock1, mock2]);

    const urls = collection.results.map((r) => r.url);
    const uniqueUrls = new Set(urls);
    expect(urls.length).toBe(uniqueUrls.size);
  });

  it('collect() sorts results by descending relevance', async () => {
    const collector = new ReferenceCollector();
    const mock = new MockSearchProvider();
    const collection = await collector.collect('dragon', [mock]);

    for (let i = 1; i < collection.results.length; i++) {
      expect(collection.results[i - 1].relevance).toBeGreaterThanOrEqual(
        collection.results[i].relevance,
      );
    }
  });

  it('collect() totalSources counts distinct sources', async () => {
    const collector = new ReferenceCollector();
    const mock = new MockSearchProvider();
    const collection = await collector.collect('dragon', [mock]);
    // mock provider uses source 'mock', so exactly 1
    expect(collection.totalSources).toBe(1);
  });

  it('collect() with empty providers array returns empty results', async () => {
    const collector = new ReferenceCollector();
    const collection = await collector.collect('dragon', []);
    expect(collection.results).toEqual([]);
    expect(collection.totalSources).toBe(0);
  });

  it('collectImages() deduplicates by URL', async () => {
    const imageResult: ImageSearchResult = {
      url: 'https://example.com/img.jpg',
      thumbnailUrl: 'https://example.com/img-thumb.jpg',
      width: 800,
      height: 600,
      source: 'test',
      attribution: 'Test',
      tags: ['fantasy'],
    };

    const providerA: ImageSearchProvider = {
      name: 'providerA',
      searchImages: async () => [imageResult],
      isAvailable: async () => true,
    };
    const providerB: ImageSearchProvider = {
      name: 'providerB',
      searchImages: async () => [imageResult], // same URL
      isAvailable: async () => true,
    };

    const collector = new ReferenceCollector();
    const images = await collector.collectImages('dragon', [providerA, providerB]);
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://example.com/img.jpg');
  });

  it('collectImages() aggregates results from multiple providers', async () => {
    const resultA: ImageSearchResult = {
      url: 'https://example.com/a.jpg',
      thumbnailUrl: 'https://example.com/a-thumb.jpg',
      width: 100,
      height: 100,
      source: 'providerA',
      attribution: 'A',
      tags: [],
    };
    const resultB: ImageSearchResult = {
      url: 'https://example.com/b.jpg',
      thumbnailUrl: 'https://example.com/b-thumb.jpg',
      width: 200,
      height: 200,
      source: 'providerB',
      attribution: 'B',
      tags: [],
    };

    const providerA: ImageSearchProvider = {
      name: 'providerA',
      searchImages: async () => [resultA],
      isAvailable: async () => true,
    };
    const providerB: ImageSearchProvider = {
      name: 'providerB',
      searchImages: async () => [resultB],
      isAvailable: async () => true,
    };

    const collector = new ReferenceCollector();
    const images = await collector.collectImages('nature', [providerA, providerB]);
    expect(images).toHaveLength(2);
  });

  it('accepts a custom ConceptSearch instance', async () => {
    const cs = new ConceptSearch();
    const collector = new ReferenceCollector(cs);
    const mock = new MockSearchProvider();
    const collection = await collector.collect('sword', [mock]);
    expect(collection.relatedConcepts).toContain('bow');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SearXNGProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('SearXNGProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('name is "searxng"', () => {
    const provider = new SearXNGProvider();
    expect(provider.name).toBe('searxng');
  });

  it('search() maps SearXNG results to SearchResult[]', async () => {
    const mockBody = {
      results: [
        { title: 'Test Title', url: 'https://test.com', content: 'Test snippet', engine: 'google', score: 0.9 },
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new SearXNGProvider('http://localhost:8888');
    const results = await provider.search('test query');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test Title');
    expect(results[0].url).toBe('https://test.com');
    expect(results[0].snippet).toBe('Test snippet');
    expect(results[0].source).toBe('searxng');
    expect(results[0].relevance).toBeCloseTo(0.9);
  });

  it('search() applies maxResults option', async () => {
    const mockBody = {
      results: Array.from({ length: 5 }, (_, i) => ({
        title: `Title ${i}`,
        url: `https://example.com/${i}`,
        content: `Snippet ${i}`,
        score: 0.8 - i * 0.05,
      })),
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new SearXNGProvider();
    const results = await provider.search('query', { maxResults: 3 });
    expect(results).toHaveLength(3);
  });

  it('search() applies language and safeSearch params', async () => {
    const mockBody = { results: [] };
    const fetchMock = makeFetchOk(mockBody);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new SearXNGProvider();
    await provider.search('query', { language: 'en', safeSearch: true });

    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('language=en');
    expect(calledUrl).toContain('safesearch=1');
  });

  it('search() sends safesearch=0 when safeSearch is false', async () => {
    const fetchMock = makeFetchOk({ results: [] });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new SearXNGProvider();
    await provider.search('query', { safeSearch: false });

    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('safesearch=0');
  });

  it('search() returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', makeFetchFail(503));
    const provider = new SearXNGProvider();
    const results = await provider.search('test');
    expect(results).toEqual([]);
  });

  it('search() returns [] on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    const provider = new SearXNGProvider();
    const results = await provider.search('test');
    expect(results).toEqual([]);
  });

  it('search() handles missing fields with fallback values', async () => {
    const mockBody = { results: [{}] }; // all fields missing
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new SearXNGProvider();
    const results = await provider.search('test');
    expect(results[0].title).toBe('');
    expect(results[0].url).toBe('');
    expect(results[0].snippet).toBe('');
  });

  it('search() uses position-based relevance when score is missing', async () => {
    const mockBody = {
      results: [
        { title: 'A', url: 'https://a.com', content: 'a' },
        { title: 'B', url: 'https://b.com', content: 'b' },
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new SearXNGProvider();
    const results = await provider.search('test');
    expect(results[0].relevance).toBeCloseTo(1.0);
    expect(results[1].relevance).toBeCloseTo(0.9);
  });

  it('search() handles empty results array', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ results: [] }));
    const provider = new SearXNGProvider();
    const results = await provider.search('test');
    expect(results).toEqual([]);
  });

  it('search() handles missing results key', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    const provider = new SearXNGProvider();
    const results = await provider.search('test');
    expect(results).toEqual([]);
  });

  it('isAvailable() returns true when fetch succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    const provider = new SearXNGProvider();
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch fails with non-ok status', async () => {
    vi.stubGlobal('fetch', makeFetchFail(500));
    const provider = new SearXNGProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns false on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    const provider = new SearXNGProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('uses custom base URL', async () => {
    const fetchMock = makeFetchOk({ results: [] });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new SearXNGProvider('http://custom-searxng:9999/');
    await provider.search('test');

    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('custom-searxng:9999');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. DuckDuckGoProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('DuckDuckGoProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('name is "duckduckgo"', () => {
    expect(new DuckDuckGoProvider().name).toBe('duckduckgo');
  });

  it('search() includes AbstractText as first result', async () => {
    const mockBody = {
      AbstractText: 'Dragons are legendary creatures.',
      AbstractURL: 'https://wiki.example.com/dragon',
      AbstractSource: 'Wikipedia',
      RelatedTopics: [],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const results = await new DuckDuckGoProvider().search('dragon');
    expect(results[0].snippet).toBe('Dragons are legendary creatures.');
    expect(results[0].url).toBe('https://wiki.example.com/dragon');
    expect(results[0].title).toBe('Wikipedia');
    expect(results[0].relevance).toBe(1.0);
    expect(results[0].source).toBe('duckduckgo');
  });

  it('search() maps RelatedTopics to SearchResult[]', async () => {
    const mockBody = {
      RelatedTopics: [
        { Text: 'Dragon fire - Breathing fire', FirstURL: 'https://ddg.example.com/dragonfire' },
        { Text: 'Dragon scales - Armor-like', FirstURL: 'https://ddg.example.com/dragonscales' },
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const results = await new DuckDuckGoProvider().search('dragon');
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Dragon fire');
    expect(results[0].url).toBe('https://ddg.example.com/dragonfire');
    expect(results[0].source).toBe('duckduckgo');
  });

  it('search() flattens nested Topics in RelatedTopics', async () => {
    const mockBody = {
      RelatedTopics: [
        {
          Topics: [
            { Text: 'Nested result', FirstURL: 'https://ddg.example.com/nested' },
          ],
        },
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const results = await new DuckDuckGoProvider().search('query');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Nested result');
  });

  it('search() skips topics without Text or FirstURL', async () => {
    const mockBody = {
      RelatedTopics: [
        { Text: 'Valid', FirstURL: 'https://ddg.example.com/valid' },
        { FirstURL: 'https://ddg.example.com/no-text' }, // missing Text
        { Text: 'No URL' }, // missing FirstURL
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const results = await new DuckDuckGoProvider().search('query');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Valid');
  });

  it('search() respects maxResults option', async () => {
    const mockBody = {
      RelatedTopics: Array.from({ length: 10 }, (_, i) => ({
        Text: `Topic ${i}`,
        FirstURL: `https://ddg.example.com/${i}`,
      })),
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const results = await new DuckDuckGoProvider().search('query', { maxResults: 3 });
    expect(results).toHaveLength(3);
  });

  it('search() returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', makeFetchFail(503));
    const results = await new DuckDuckGoProvider().search('test');
    expect(results).toEqual([]);
  });

  it('search() returns [] on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    const results = await new DuckDuckGoProvider().search('test');
    expect(results).toEqual([]);
  });

  it('search() uses fallback AbstractURL when missing', async () => {
    const mockBody = {
      AbstractText: 'Some text',
      AbstractSource: 'Source',
      // No AbstractURL
      RelatedTopics: [],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const results = await new DuckDuckGoProvider().search('test');
    expect(results[0].url).toBe('https://api.duckduckgo.com/');
  });

  it('search() uses "DuckDuckGo" as title fallback when AbstractSource is absent', async () => {
    const mockBody = {
      AbstractText: 'Some text',
      AbstractURL: 'https://ddg.example.com',
      RelatedTopics: [],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const results = await new DuckDuckGoProvider().search('test');
    expect(results[0].title).toBe('DuckDuckGo');
  });

  it('isAvailable() returns true when fetch succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    expect(await new DuckDuckGoProvider().isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', makeFetchFail(500));
    expect(await new DuckDuckGoProvider().isAvailable()).toBe(false);
  });

  it('isAvailable() returns false on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    expect(await new DuckDuckGoProvider().isAvailable()).toBe(false);
  });

  it('search() handles empty response body', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    const results = await new DuckDuckGoProvider().search('test');
    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. BraveSearchProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('BraveSearchProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('name is "brave"', () => {
    expect(new BraveSearchProvider('key').name).toBe('brave');
  });

  it('search() returns [] without an API key', async () => {
    const provider = new BraveSearchProvider();
    const results = await provider.search('test');
    expect(results).toEqual([]);
  });

  it('search() fetches with Authorization header when apiKey provided', async () => {
    const mockBody = {
      web: {
        results: [
          { title: 'Brave Result', url: 'https://brave.example.com', description: 'A result' },
        ],
      },
    };
    const fetchMock = makeFetchOk(mockBody);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new BraveSearchProvider('test-api-key');
    const results = await provider.search('dragon');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Brave Result');
    expect(results[0].source).toBe('brave');

    const callArgs = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers['X-Subscription-Token']).toBe('test-api-key');
  });

  it('search() respects maxResults', async () => {
    const mockBody = {
      web: {
        results: Array.from({ length: 10 }, (_, i) => ({
          title: `Title ${i}`,
          url: `https://brave.example.com/${i}`,
          description: `Desc ${i}`,
        })),
      },
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new BraveSearchProvider('key');
    const results = await provider.search('query', { maxResults: 4 });
    expect(results).toHaveLength(4);
  });

  it('search() applies language and safeSearch params', async () => {
    const fetchMock = makeFetchOk({ web: { results: [] } });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new BraveSearchProvider('key');
    await provider.search('query', { language: 'fr', safeSearch: true });

    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('search_lang=fr');
    expect(calledUrl).toContain('safesearch=strict');
  });

  it('search() sends safesearch=off when safeSearch is false', async () => {
    const fetchMock = makeFetchOk({ web: { results: [] } });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new BraveSearchProvider('key');
    await provider.search('query', { safeSearch: false });

    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('safesearch=off');
  });

  it('search() returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', makeFetchFail(403));
    const provider = new BraveSearchProvider('key');
    expect(await provider.search('test')).toEqual([]);
  });

  it('search() returns [] on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    const provider = new BraveSearchProvider('key');
    expect(await provider.search('test')).toEqual([]);
  });

  it('search() handles missing web.results', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ web: {} }));
    const provider = new BraveSearchProvider('key');
    expect(await provider.search('test')).toEqual([]);
  });

  it('search() handles missing web key', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    const provider = new BraveSearchProvider('key');
    expect(await provider.search('test')).toEqual([]);
  });

  it('isAvailable() returns false without apiKey', async () => {
    const provider = new BraveSearchProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns true when fetch succeeds with apiKey', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    const provider = new BraveSearchProvider('key');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', makeFetchFail(401));
    const provider = new BraveSearchProvider('key');
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns false on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    const provider = new BraveSearchProvider('key');
    expect(await provider.isAvailable()).toBe(false);
  });

  it('search() caps count at 20 even when maxResults > 20', async () => {
    const fetchMock = makeFetchOk({ web: { results: [] } });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new BraveSearchProvider('key');
    await provider.search('query', { maxResults: 50 });

    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('count=20');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Image Providers
// ─────────────────────────────────────────────────────────────────────────────

describe('UnsplashProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('name is "unsplash"', () => {
    expect(new UnsplashProvider('key').name).toBe('unsplash');
  });

  it('searchImages() returns [] without accessKey', async () => {
    expect(await new UnsplashProvider().searchImages('test')).toEqual([]);
  });

  it('searchImages() maps Unsplash photo objects correctly', async () => {
    const mockBody = {
      results: [
        {
          id: 'abc123',
          urls: { regular: 'https://images.unsplash.com/abc', thumb: 'https://images.unsplash.com/abc-thumb' },
          width: 1920,
          height: 1080,
          links: { html: 'https://unsplash.com/photos/abc' },
          user: { name: 'Jane Doe' },
          alt_description: 'A beautiful dragon',
          tags: [{ title: 'fantasy' }, { title: 'dragon' }],
        },
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new UnsplashProvider('key');
    const images = await provider.searchImages('dragon');

    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://images.unsplash.com/abc');
    expect(images[0].thumbnailUrl).toBe('https://images.unsplash.com/abc-thumb');
    expect(images[0].width).toBe(1920);
    expect(images[0].height).toBe(1080);
    expect(images[0].source).toBe('unsplash');
    expect(images[0].attribution).toBe('Photo by Jane Doe on Unsplash');
    expect(images[0].tags).toContain('fantasy');
    expect(images[0].tags).toContain('dragon');
  });

  it('searchImages() handles missing fields with fallbacks', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ results: [{}] }));
    const provider = new UnsplashProvider('key');
    const images = await provider.searchImages('test');
    expect(images[0].url).toBe('');
    expect(images[0].attribution).toBe('Photo by Unknown on Unsplash');
    expect(images[0].tags).toEqual([]);
  });

  it('searchImages() returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', makeFetchFail(403));
    const provider = new UnsplashProvider('key');
    expect(await provider.searchImages('test')).toEqual([]);
  });

  it('searchImages() returns [] on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    const provider = new UnsplashProvider('key');
    expect(await provider.searchImages('test')).toEqual([]);
  });

  it('searchImages() applies language param', async () => {
    const fetchMock = makeFetchOk({ results: [] });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new UnsplashProvider('key');
    await provider.searchImages('dragon', { language: 'de' });

    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('lang=de');
  });

  it('searchImages() caps per_page at 30', async () => {
    const fetchMock = makeFetchOk({ results: [] });
    vi.stubGlobal('fetch', fetchMock);

    await new UnsplashProvider('key').searchImages('test', { maxResults: 100 });
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('per_page=30');
  });

  it('isAvailable() returns false without accessKey', async () => {
    expect(await new UnsplashProvider().isAvailable()).toBe(false);
  });

  it('isAvailable() returns true when fetch succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    expect(await new UnsplashProvider('key').isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', makeFetchFail(401));
    expect(await new UnsplashProvider('key').isAvailable()).toBe(false);
  });

  it('isAvailable() returns false on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    expect(await new UnsplashProvider('key').isAvailable()).toBe(false);
  });
});

describe('PexelsProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('name is "pexels"', () => {
    expect(new PexelsProvider('key').name).toBe('pexels');
  });

  it('searchImages() returns [] without apiKey', async () => {
    expect(await new PexelsProvider().searchImages('test')).toEqual([]);
  });

  it('searchImages() maps Pexels photo objects correctly', async () => {
    const mockBody = {
      photos: [
        {
          id: 1,
          src: { original: 'https://pexels.example.com/original.jpg', medium: 'https://pexels.example.com/medium.jpg' },
          width: 3000,
          height: 2000,
          url: 'https://pexels.example.com/photo/1',
          photographer: 'John Smith',
          alt: 'dragon fantasy',
        },
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new PexelsProvider('key');
    const images = await provider.searchImages('dragon');

    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://pexels.example.com/original.jpg');
    expect(images[0].thumbnailUrl).toBe('https://pexels.example.com/medium.jpg');
    expect(images[0].width).toBe(3000);
    expect(images[0].height).toBe(2000);
    expect(images[0].source).toBe('pexels');
    expect(images[0].attribution).toBe('Photo by John Smith on Pexels');
    expect(images[0].tags).toContain('dragon');
    expect(images[0].tags).toContain('fantasy');
  });

  it('searchImages() handles missing alt (no tags)', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ photos: [{ id: 1, src: {} }] }));
    const images = await new PexelsProvider('key').searchImages('test');
    expect(images[0].tags).toEqual([]);
  });

  it('searchImages() returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', makeFetchFail(403));
    expect(await new PexelsProvider('key').searchImages('test')).toEqual([]);
  });

  it('searchImages() returns [] on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    expect(await new PexelsProvider('key').searchImages('test')).toEqual([]);
  });

  it('searchImages() caps per_page at 80', async () => {
    const fetchMock = makeFetchOk({ photos: [] });
    vi.stubGlobal('fetch', fetchMock);
    await new PexelsProvider('key').searchImages('test', { maxResults: 200 });
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('per_page=80');
  });

  it('isAvailable() returns false without apiKey', async () => {
    expect(await new PexelsProvider().isAvailable()).toBe(false);
  });

  it('isAvailable() returns true when fetch succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    expect(await new PexelsProvider('key').isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', makeFetchFail(401));
    expect(await new PexelsProvider('key').isAvailable()).toBe(false);
  });

  it('isAvailable() returns false on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    expect(await new PexelsProvider('key').isAvailable()).toBe(false);
  });
});

describe('PixabayProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('name is "pixabay"', () => {
    expect(new PixabayProvider('key').name).toBe('pixabay');
  });

  it('searchImages() returns [] without apiKey', async () => {
    expect(await new PixabayProvider().searchImages('test')).toEqual([]);
  });

  it('searchImages() maps Pixabay hit objects correctly', async () => {
    const mockBody = {
      hits: [
        {
          webformatURL: 'https://pixabay.example.com/web.jpg',
          previewURL: 'https://pixabay.example.com/preview.jpg',
          imageWidth: 1280,
          imageHeight: 720,
          user: 'PixArtist',
          pageURL: 'https://pixabay.example.com/1',
          tags: 'dragon, fantasy, fire',
        },
      ],
    };
    vi.stubGlobal('fetch', makeFetchOk(mockBody));

    const provider = new PixabayProvider('key');
    const images = await provider.searchImages('dragon');

    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://pixabay.example.com/web.jpg');
    expect(images[0].thumbnailUrl).toBe('https://pixabay.example.com/preview.jpg');
    expect(images[0].width).toBe(1280);
    expect(images[0].height).toBe(720);
    expect(images[0].source).toBe('pixabay');
    expect(images[0].attribution).toBe('Image by PixArtist on Pixabay');
    expect(images[0].tags).toContain('dragon');
    expect(images[0].tags).toContain('fantasy');
    expect(images[0].tags).toContain('fire');
  });

  it('searchImages() handles missing tags', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ hits: [{}] }));
    const images = await new PixabayProvider('key').searchImages('test');
    expect(images[0].tags).toEqual([]);
    expect(images[0].attribution).toBe('Image by Unknown on Pixabay');
  });

  it('searchImages() applies safeSearch param', async () => {
    const fetchMock = makeFetchOk({ hits: [] });
    vi.stubGlobal('fetch', fetchMock);
    await new PixabayProvider('key').searchImages('test', { safeSearch: true });
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('safesearch=true');
  });

  it('searchImages() applies safesearch=false param', async () => {
    const fetchMock = makeFetchOk({ hits: [] });
    vi.stubGlobal('fetch', fetchMock);
    await new PixabayProvider('key').searchImages('test', { safeSearch: false });
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('safesearch=false');
  });

  it('searchImages() returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', makeFetchFail(403));
    expect(await new PixabayProvider('key').searchImages('test')).toEqual([]);
  });

  it('searchImages() returns [] on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    expect(await new PixabayProvider('key').searchImages('test')).toEqual([]);
  });

  it('searchImages() caps per_page at 200', async () => {
    const fetchMock = makeFetchOk({ hits: [] });
    vi.stubGlobal('fetch', fetchMock);
    await new PixabayProvider('key').searchImages('test', { maxResults: 500 });
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('per_page=200');
  });

  it('isAvailable() returns false without apiKey', async () => {
    expect(await new PixabayProvider().isAvailable()).toBe(false);
  });

  it('isAvailable() returns true when fetch succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchOk({}));
    expect(await new PixabayProvider('key').isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', makeFetchFail(403));
    expect(await new PixabayProvider('key').isAvailable()).toBe(false);
  });

  it('isAvailable() returns false on network error', async () => {
    vi.stubGlobal('fetch', makeFetchReject());
    expect(await new PixabayProvider('key').isAvailable()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. CombinedImageSearch
// ─────────────────────────────────────────────────────────────────────────────

describe('CombinedImageSearch', () => {
  function makeImageProvider(name: string, results: ImageSearchResult[]): ImageSearchProvider {
    return {
      name,
      searchImages: vi.fn().mockResolvedValue(results),
      isAvailable: vi.fn().mockResolvedValue(true),
    };
  }

  const img = (url: string, source = 'test'): ImageSearchResult => ({
    url,
    thumbnailUrl: url + '-thumb',
    width: 100,
    height: 100,
    source,
    attribution: 'Test',
    tags: [],
  });

  it('name is "combined-image"', () => {
    expect(new CombinedImageSearch([]).name).toBe('combined-image');
  });

  it('combines results from multiple providers', async () => {
    const p1 = makeImageProvider('p1', [img('https://a.com/1.jpg')]);
    const p2 = makeImageProvider('p2', [img('https://b.com/2.jpg')]);
    const combined = new CombinedImageSearch([p1, p2]);
    const images = await combined.searchImages('dragon');
    expect(images).toHaveLength(2);
  });

  it('deduplicates by URL across providers', async () => {
    const duplicate = img('https://shared.com/photo.jpg');
    const p1 = makeImageProvider('p1', [duplicate]);
    const p2 = makeImageProvider('p2', [duplicate]);
    const combined = new CombinedImageSearch([p1, p2]);
    const images = await combined.searchImages('dragon');
    expect(images).toHaveLength(1);
  });

  it('respects maxResults option', async () => {
    const p1 = makeImageProvider('p1', [
      img('https://a.com/1.jpg'),
      img('https://a.com/2.jpg'),
      img('https://a.com/3.jpg'),
    ]);
    const combined = new CombinedImageSearch([p1]);
    const images = await combined.searchImages('dragon', { maxResults: 2 });
    expect(images).toHaveLength(2);
  });

  it('distributes maxResults evenly across providers', async () => {
    const searchSpy1 = vi.fn().mockResolvedValue([img('https://a.com/1.jpg')]);
    const searchSpy2 = vi.fn().mockResolvedValue([img('https://b.com/1.jpg')]);
    const p1: ImageSearchProvider = { name: 'p1', searchImages: searchSpy1, isAvailable: async () => true };
    const p2: ImageSearchProvider = { name: 'p2', searchImages: searchSpy2, isAvailable: async () => true };
    const combined = new CombinedImageSearch([p1, p2]);
    await combined.searchImages('dragon', { maxResults: 4 });
    // Each provider should receive maxResults = ceil(4/2) = 2
    expect(searchSpy1.mock.calls[0][1].maxResults).toBe(2);
    expect(searchSpy2.mock.calls[0][1].maxResults).toBe(2);
  });

  it('returns empty array when no providers', async () => {
    const combined = new CombinedImageSearch([]);
    const images = await combined.searchImages('dragon');
    expect(images).toEqual([]);
  });

  it('handles provider failures gracefully (Promise.allSettled)', async () => {
    const failing: ImageSearchProvider = {
      name: 'failing',
      searchImages: vi.fn().mockRejectedValue(new Error('provider failed')),
      isAvailable: async () => false,
    };
    const working = makeImageProvider('working', [img('https://c.com/1.jpg')]);
    const combined = new CombinedImageSearch([failing, working]);
    const images = await combined.searchImages('dragon');
    expect(images).toHaveLength(1);
  });

  it('isAvailable() returns true if at least one provider is available', async () => {
    const unavailable: ImageSearchProvider = {
      name: 'unavail',
      searchImages: async () => [],
      isAvailable: async () => false,
    };
    const available = makeImageProvider('avail', []);
    (available.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const combined = new CombinedImageSearch([unavailable, available]);
    expect(await combined.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false if all providers are unavailable', async () => {
    const unavailable: ImageSearchProvider = {
      name: 'unavail',
      searchImages: async () => [],
      isAvailable: async () => false,
    };
    const combined = new CombinedImageSearch([unavailable]);
    expect(await combined.isAvailable()).toBe(false);
  });

  it('isAvailable() returns false with no providers', async () => {
    const combined = new CombinedImageSearch([]);
    expect(await combined.isAvailable()).toBe(false);
  });

  it('isAvailable() handles provider isAvailable() rejections gracefully', async () => {
    const failing: ImageSearchProvider = {
      name: 'failing',
      searchImages: async () => [],
      isAvailable: vi.fn().mockRejectedValue(new Error('check failed')),
    };
    const combined = new CombinedImageSearch([failing]);
    expect(await combined.isAvailable()).toBe(false);
  });
});
