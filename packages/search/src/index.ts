/**
 * @paradigm/search — 100% FREE web search and concept search for the GSPL Paradigm platform.
 *
 * Provides zero-API-key web search via SearXNG and DuckDuckGo, optional-key providers for
 * Brave/Unsplash/Pexels/Pixabay, offline semantic concept expansion, reference collection,
 * and an LRU+TTL cache. All network calls use the global `fetch`; no external dependencies.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════════
// Core Interfaces
// ═══════════════════════════════════════════════════════════════════

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  relevance: number;
  timestamp: number;
}

export interface ImageSearchResult {
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  source: string;
  attribution: string;
  tags: string[];
}

export interface SearchOptions {
  maxResults?: number;
  language?: string;
  safeSearch?: boolean;
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  isAvailable(): Promise<boolean>;
}

export interface ImageSearchProvider {
  readonly name: string;
  searchImages(query: string, options?: SearchOptions): Promise<ImageSearchResult[]>;
  isAvailable(): Promise<boolean>;
}

export interface ConceptExpansion {
  original: string;
  related: Array<{ term: string; relevance: number; category: string }>;
}

export interface ReferenceCollection {
  query: string;
  results: SearchResult[];
  images: ImageSearchResult[];
  relatedConcepts: string[];
  totalSources: number;
  collectedAt: number;
}

// ═══════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a URL with query parameters, safely encoding every value.
 */
function buildUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Clamp a number to [0, 1].
 */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Deduplicate an array of objects by a key extractor, keeping first occurrence.
 */
function deduplicateBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// SearXNG Provider
// ═══════════════════════════════════════════════════════════════════

/** Raw result shape from the SearXNG JSON API. */
interface SearXNGResult {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  score?: number;
}

interface SearXNGResponse {
  results?: SearXNGResult[];
}

/**
 * Searches a self-hosted SearXNG meta-search instance.
 * Requires no API key. Defaults to http://localhost:8888.
 */
export class SearXNGProvider implements SearchProvider {
  readonly name = 'searxng';
  readonly #baseUrl: string;

  constructor(baseUrl = 'http://localhost:8888') {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const params: Record<string, string> = {
      q: query,
      format: 'json',
      categories: 'general',
    };
    if (options.language) params['language'] = options.language;
    if (options.safeSearch !== undefined) params['safesearch'] = options.safeSearch ? '1' : '0';

    const url = buildUrl(`${this.#baseUrl}/search`, params);
    const now = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      let raw: SearXNGResponse;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return [];
        raw = (await response.json()) as SearXNGResponse;
      } finally {
        clearTimeout(timeoutId);
      }

      const results = raw.results ?? [];
      const limit = options.maxResults ?? 10;
      return results.slice(0, limit).map((r, i) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
        source: this.name,
        relevance: clamp01((r.score ?? (1 - i * 0.1))),
        timestamp: now,
      }));
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const url = buildUrl(`${this.#baseUrl}/search`, { q: 'test', format: 'json' });
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// DuckDuckGo Provider
// ═══════════════════════════════════════════════════════════════════

interface DDGRelatedTopic {
  Text?: string;
  FirstURL?: string;
  Topics?: DDGRelatedTopic[];
}

interface DDGResponse {
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  RelatedTopics?: DDGRelatedTopic[];
}

/**
 * Free DuckDuckGo Instant Answer API. No API key required.
 * Returns abstract text and related topics from DDG's knowledge graph.
 */
export class DuckDuckGoProvider implements SearchProvider {
  readonly name = 'duckduckgo';
  static readonly #ENDPOINT = 'https://api.duckduckgo.com/';

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const params: Record<string, string> = {
      q: query,
      format: 'json',
      no_html: '1',
      no_redirect: '1',
      skip_disambig: '1',
    };

    const url = buildUrl(DuckDuckGoProvider.#ENDPOINT, params);
    const now = Date.now();

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return [];
      const raw = (await response.json()) as DDGResponse;

      const results: SearchResult[] = [];
      const limit = options.maxResults ?? 10;

      if (raw.AbstractText) {
        results.push({
          title: raw.AbstractSource ?? 'DuckDuckGo',
          url: raw.AbstractURL ?? DuckDuckGoProvider.#ENDPOINT,
          snippet: raw.AbstractText,
          source: this.name,
          relevance: 1.0,
          timestamp: now,
        });
      }

      const flattenTopics = (topics: DDGRelatedTopic[]): DDGRelatedTopic[] => {
        const flat: DDGRelatedTopic[] = [];
        for (const t of topics) {
          if (t.Topics) flat.push(...flattenTopics(t.Topics));
          else flat.push(t);
        }
        return flat;
      };

      const topics = flattenTopics(raw.RelatedTopics ?? []);
      for (const topic of topics) {
        if (results.length >= limit) break;
        if (!topic.Text || !topic.FirstURL) continue;
        results.push({
          title: topic.Text.split(' - ')[0] ?? topic.Text,
          url: topic.FirstURL,
          snippet: topic.Text,
          source: this.name,
          relevance: clamp01(1 - results.length * 0.05),
          timestamp: now,
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const url = buildUrl(DuckDuckGoProvider.#ENDPOINT, { q: 'test', format: 'json' });
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Brave Search Provider
// ═══════════════════════════════════════════════════════════════════

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

/**
 * Brave Search API (free tier available). Requires an API key.
 * Pass `apiKey` or set BRAVE_SEARCH_API_KEY in the environment.
 */
export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';
  static readonly #ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
  readonly #apiKey: string;

  constructor(apiKey = '') {
    this.#apiKey = apiKey;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.#apiKey) return [];

    const params: Record<string, string> = { q: query };
    if (options.maxResults) params['count'] = String(Math.min(options.maxResults, 20));
    if (options.language) params['search_lang'] = options.language;
    if (options.safeSearch !== undefined) params['safesearch'] = options.safeSearch ? 'strict' : 'off';

    const url = buildUrl(BraveSearchProvider.#ENDPOINT, params);
    const now = Date.now();

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'X-Subscription-Token': this.#apiKey, Accept: 'application/json' },
      });
      if (!response.ok) return [];
      const raw = (await response.json()) as BraveResponse;

      const webResults = raw.web?.results ?? [];
      const limit = options.maxResults ?? 10;

      return webResults.slice(0, limit).map((r, i) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.description ?? '',
        source: this.name,
        relevance: clamp01(1 - i * 0.08),
        timestamp: now,
      }));
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.#apiKey) return false;
    try {
      const url = buildUrl(BraveSearchProvider.#ENDPOINT, { q: 'test', count: '1' });
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        headers: { 'X-Subscription-Token': this.#apiKey, Accept: 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Mock Search Provider (deterministic, for testing)
// ═══════════════════════════════════════════════════════════════════

const MOCK_KEYWORD_MAP: Record<string, SearchResult[]> = {
  dragon: [
    {
      title: 'Dragon — Fantasy Creatures Wiki',
      url: 'https://fantasy-wiki.example.com/dragon',
      snippet: 'Dragons are large, serpentine, legendary creatures that appear in world folklore.',
      source: 'mock',
      relevance: 0.95,
      timestamp: 0,
    },
    {
      title: 'Dragon Mythology — Encyclopedia',
      url: 'https://encyclopedia.example.com/dragon-mythology',
      snippet: 'Dragon mythology spans cultures from Ancient China to Medieval Europe.',
      source: 'mock',
      relevance: 0.88,
      timestamp: 0,
    },
  ],
  forest: [
    {
      title: 'Forest Biomes — Nature Database',
      url: 'https://nature.example.com/forest-biomes',
      snippet: 'Forests cover roughly 31% of the Earth\'s total land surface area.',
      source: 'mock',
      relevance: 0.92,
      timestamp: 0,
    },
  ],
  sword: [
    {
      title: 'Medieval Sword Types — Armoury',
      url: 'https://armoury.example.com/swords',
      snippet: 'Medieval swords ranged from short arming swords to massive two-handed greatswords.',
      source: 'mock',
      relevance: 0.90,
      timestamp: 0,
    },
  ],
};

/** Default result returned when no keyword matches. */
const MOCK_DEFAULT_RESULT = (query: string, now: number): SearchResult => ({
  title: `Mock result for "${query}"`,
  url: `https://mock.example.com/search?q=${encodeURIComponent(query)}`,
  snippet: `This is a deterministic mock search result for the query: ${query}`,
  source: 'mock',
  relevance: 0.5,
  timestamp: now,
});

/**
 * Deterministic mock provider. No network required.
 * Returns canned results based on query keywords; useful for tests.
 */
export class MockSearchProvider implements SearchProvider {
  readonly name = 'mock';

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const now = Date.now();
    const lq = query.toLowerCase();
    const limit = options.maxResults ?? 10;

    const matched: SearchResult[] = [];
    for (const [keyword, canned] of Object.entries(MOCK_KEYWORD_MAP)) {
      if (lq.includes(keyword)) {
        matched.push(...canned.map((r) => ({ ...r, timestamp: now })));
      }
    }

    if (matched.length === 0) matched.push(MOCK_DEFAULT_RESULT(query, now));
    return matched.slice(0, limit);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Unsplash Image Provider
// ═══════════════════════════════════════════════════════════════════

interface UnsplashPhoto {
  id?: string;
  urls?: { regular?: string; thumb?: string };
  width?: number;
  height?: number;
  links?: { html?: string };
  user?: { name?: string };
  alt_description?: string | null;
  tags?: Array<{ title?: string }>;
}

/**
 * Unsplash free-tier image search. Requires an access key.
 * Register at https://unsplash.com/developers for a free key.
 */
export class UnsplashProvider implements ImageSearchProvider {
  readonly name = 'unsplash';
  static readonly #ENDPOINT = 'https://api.unsplash.com/search/photos';
  readonly #accessKey: string;

  constructor(accessKey = '') {
    this.#accessKey = accessKey;
  }

  async searchImages(query: string, options: SearchOptions = {}): Promise<ImageSearchResult[]> {
    if (!this.#accessKey) return [];

    const params: Record<string, string> = {
      query,
      per_page: String(Math.min(options.maxResults ?? 10, 30)),
    };
    if (options.language) params['lang'] = options.language;

    const url = buildUrl(UnsplashProvider.#ENDPOINT, params);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Client-ID ${this.#accessKey}` },
      });
      if (!response.ok) return [];
      const raw = (await response.json()) as { results?: UnsplashPhoto[] };

      return (raw.results ?? []).map((photo) => ({
        url: photo.urls?.regular ?? '',
        thumbnailUrl: photo.urls?.thumb ?? '',
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        source: this.name,
        attribution: `Photo by ${photo.user?.name ?? 'Unknown'} on Unsplash`,
        tags: (photo.tags ?? []).map((t) => t.title ?? '').filter(Boolean),
      }));
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.#accessKey) return false;
    try {
      const url = buildUrl(UnsplashProvider.#ENDPOINT, { query: 'test', per_page: '1' });
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Client-ID ${this.#accessKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Pexels Image Provider
// ═══════════════════════════════════════════════════════════════════

interface PexelsPhoto {
  id?: number;
  src?: { original?: string; medium?: string };
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  alt?: string | null;
}

/**
 * Pexels free-tier image search. Requires an API key.
 * Register at https://www.pexels.com/api/ for a free key.
 */
export class PexelsProvider implements ImageSearchProvider {
  readonly name = 'pexels';
  static readonly #ENDPOINT = 'https://api.pexels.com/v1/search';
  readonly #apiKey: string;

  constructor(apiKey = '') {
    this.#apiKey = apiKey;
  }

  async searchImages(query: string, options: SearchOptions = {}): Promise<ImageSearchResult[]> {
    if (!this.#apiKey) return [];

    const params: Record<string, string> = {
      query,
      per_page: String(Math.min(options.maxResults ?? 10, 80)),
    };

    const url = buildUrl(PexelsProvider.#ENDPOINT, params);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: this.#apiKey },
      });
      if (!response.ok) return [];
      const raw = (await response.json()) as { photos?: PexelsPhoto[] };

      return (raw.photos ?? []).map((photo) => ({
        url: photo.src?.original ?? '',
        thumbnailUrl: photo.src?.medium ?? '',
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        source: this.name,
        attribution: `Photo by ${photo.photographer ?? 'Unknown'} on Pexels`,
        tags: photo.alt ? photo.alt.split(' ').filter(Boolean) : [],
      }));
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.#apiKey) return false;
    try {
      const url = buildUrl(PexelsProvider.#ENDPOINT, { query: 'test', per_page: '1' });
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        headers: { Authorization: this.#apiKey },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Pixabay Image Provider
// ═══════════════════════════════════════════════════════════════════

interface PixabayHit {
  webformatURL?: string;
  previewURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  user?: string;
  pageURL?: string;
  tags?: string;
}

/**
 * Pixabay free-tier image search. Requires an API key.
 * Register at https://pixabay.com/api/docs/ for a free key.
 */
export class PixabayProvider implements ImageSearchProvider {
  readonly name = 'pixabay';
  static readonly #ENDPOINT = 'https://pixabay.com/api/';
  readonly #apiKey: string;

  constructor(apiKey = '') {
    this.#apiKey = apiKey;
  }

  async searchImages(query: string, options: SearchOptions = {}): Promise<ImageSearchResult[]> {
    if (!this.#apiKey) return [];

    const params: Record<string, string> = {
      key: this.#apiKey,
      q: encodeURIComponent(query),
      per_page: String(Math.min(options.maxResults ?? 10, 200)),
      image_type: 'photo',
    };
    if (options.safeSearch !== undefined) params['safesearch'] = options.safeSearch ? 'true' : 'false';

    const url = buildUrl(PixabayProvider.#ENDPOINT, params);

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return [];
      const raw = (await response.json()) as { hits?: PixabayHit[] };

      return (raw.hits ?? []).map((hit) => ({
        url: hit.webformatURL ?? '',
        thumbnailUrl: hit.previewURL ?? '',
        width: hit.imageWidth ?? 0,
        height: hit.imageHeight ?? 0,
        source: this.name,
        attribution: `Image by ${hit.user ?? 'Unknown'} on Pixabay`,
        tags: hit.tags ? hit.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      }));
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.#apiKey) return false;
    try {
      const url = buildUrl(PixabayProvider.#ENDPOINT, {
        key: this.#apiKey,
        q: 'test',
        per_page: '3',
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Combined Image Search
// ═══════════════════════════════════════════════════════════════════

/**
 * Aggregates results from multiple ImageSearchProviders, deduplicates by URL,
 * and sorts by relevance (providers listed first are treated as more authoritative).
 */
export class CombinedImageSearch implements ImageSearchProvider {
  readonly name = 'combined-image';
  readonly #providers: ImageSearchProvider[];

  constructor(providers: ImageSearchProvider[]) {
    this.#providers = providers;
  }

  async searchImages(query: string, options: SearchOptions = {}): Promise<ImageSearchResult[]> {
    const perProvider = Math.ceil((options.maxResults ?? 10) / Math.max(this.#providers.length, 1));
    const perProviderOptions: SearchOptions = { ...options, maxResults: perProvider };

    const settled = await Promise.allSettled(
      this.#providers.map((p) => p.searchImages(query, perProviderOptions)),
    );

    const all: ImageSearchResult[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') all.push(...result.value);
    }

    const deduped = deduplicateBy(all, (r) => r.url);
    return deduped.slice(0, options.maxResults ?? 10);
  }

  async isAvailable(): Promise<boolean> {
    const checks = await Promise.allSettled(this.#providers.map((p) => p.isAvailable()));
    return checks.some((c) => c.status === 'fulfilled' && c.value);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Concept Search — 100% offline semantic expansion
// ═══════════════════════════════════════════════════════════════════

/** Each category entry: category name → list of related terms with weights. */
interface CategoryEntry {
  terms: string[];
  /** Base relevance for all terms in this category (0–1). */
  baseRelevance: number;
}

const SEMANTIC_MAP: Record<string, CategoryEntry> = {
  creature: {
    terms: ['dragon', 'wolf', 'phoenix', 'slime', 'golem', 'undead', 'demon', 'fairy'],
    baseRelevance: 0.85,
  },
  environment: {
    terms: ['forest', 'cave', 'ocean', 'desert', 'city', 'dungeon', 'tundra', 'volcano'],
    baseRelevance: 0.82,
  },
  weapon: {
    terms: ['sword', 'bow', 'staff', 'dagger', 'axe', 'spear', 'hammer', 'crossbow'],
    baseRelevance: 0.84,
  },
  magic: {
    terms: ['spell', 'enchantment', 'curse', 'ritual', 'arcane', 'runic', 'elemental', 'hex'],
    baseRelevance: 0.80,
  },
  character_class: {
    terms: ['warrior', 'mage', 'rogue', 'paladin', 'ranger', 'druid', 'bard', 'necromancer'],
    baseRelevance: 0.86,
  },
  emotion: {
    terms: ['fear', 'courage', 'despair', 'hope', 'rage', 'serenity', 'grief', 'joy'],
    baseRelevance: 0.70,
  },
  element: {
    terms: ['fire', 'water', 'earth', 'air', 'lightning', 'ice', 'shadow', 'light'],
    baseRelevance: 0.88,
  },
  architecture: {
    terms: ['castle', 'tower', 'dungeon', 'fortress', 'temple', 'ruins', 'bridge', 'gate'],
    baseRelevance: 0.78,
  },
  artifact: {
    terms: ['amulet', 'ring', 'tome', 'crystal', 'relic', 'orb', 'crown', 'shield'],
    baseRelevance: 0.79,
  },
  faction: {
    terms: ['guild', 'empire', 'tribe', 'cult', 'order', 'alliance', 'brotherhood', 'clan'],
    baseRelevance: 0.72,
  },
  biome: {
    terms: ['swamp', 'jungle', 'plains', 'mountains', 'coast', 'wasteland', 'sky', 'underground'],
    baseRelevance: 0.81,
  },
  npc_role: {
    terms: ['merchant', 'innkeeper', 'blacksmith', 'alchemist', 'farmer', 'guard', 'king', 'sage'],
    baseRelevance: 0.74,
  },
  event: {
    terms: ['battle', 'festival', 'invasion', 'eclipse', 'plague', 'tournament', 'prophecy', 'war'],
    baseRelevance: 0.76,
  },
  narrative: {
    terms: ['quest', 'mystery', 'betrayal', 'redemption', 'sacrifice', 'legend', 'prophecy', 'fate'],
    baseRelevance: 0.73,
  },
  stat: {
    terms: ['strength', 'agility', 'intelligence', 'endurance', 'luck', 'charisma', 'wisdom', 'speed'],
    baseRelevance: 0.75,
  },
};

/** Reverse index: term → category name. Built once at module load. */
const TERM_TO_CATEGORY: Map<string, string> = new Map();
for (const [category, entry] of Object.entries(SEMANTIC_MAP)) {
  for (const term of entry.terms) {
    TERM_TO_CATEGORY.set(term.toLowerCase(), category);
  }
  // Also map the category name itself.
  TERM_TO_CATEGORY.set(category.toLowerCase(), category);
}

/**
 * Offline semantic concept expansion engine.
 * No network, no external dependencies — pure in-memory lookup.
 */
export class ConceptSearch {
  /**
   * Expand a concept into semantically related terms.
   * Looks up the concept's category and returns all sibling terms.
   */
  expand(concept: string): string[] {
    const lc = concept.toLowerCase();
    const category = TERM_TO_CATEGORY.get(lc);
    if (!category) return this.#fuzzyExpand(lc);
    return SEMANTIC_MAP[category]?.terms.filter((t) => t.toLowerCase() !== lc) ?? [];
  }

  /**
   * Return related concepts with relevance scores for a concept.
   * @param concept - The seed concept.
   * @param maxResults - Maximum number of related terms to return (default 10).
   */
  findRelated(concept: string, maxResults = 10): ConceptExpansion {
    const lc = concept.toLowerCase();
    const primaryCategory = TERM_TO_CATEGORY.get(lc);
    const relatedMap = new Map<string, { relevance: number; category: string }>();

    if (primaryCategory) {
      const entry = SEMANTIC_MAP[primaryCategory];
      if (entry) {
        for (let i = 0; i < entry.terms.length; i++) {
          const term = entry.terms[i];
          if (term && term.toLowerCase() !== lc) {
            // Decay relevance by position in list.
            relatedMap.set(term, {
              relevance: clamp01(entry.baseRelevance - i * 0.02),
              category: primaryCategory,
            });
          }
        }
      }
    }

    // Cross-category: find terms in other categories that share a keyword root
    for (const [category, entry] of Object.entries(SEMANTIC_MAP)) {
      if (category === primaryCategory) continue;
      for (let i = 0; i < entry.terms.length; i++) {
        const term = entry.terms[i];
        if (!term) continue;
        if (term.toLowerCase().includes(lc) || lc.includes(term.toLowerCase())) {
          if (!relatedMap.has(term)) {
            relatedMap.set(term, {
              relevance: clamp01(entry.baseRelevance * 0.6 - i * 0.01),
              category,
            });
          }
        }
      }
    }

    const sorted = [...relatedMap.entries()]
      .sort((a, b) => b[1].relevance - a[1].relevance)
      .slice(0, maxResults);

    return {
      original: concept,
      related: sorted.map(([term, meta]) => ({ term, ...meta })),
    };
  }

  /** Fuzzy fallback: check for substring matches across all categories. */
  #fuzzyExpand(lc: string): string[] {
    for (const [category, entry] of Object.entries(SEMANTIC_MAP)) {
      if (lc.includes(category) || category.includes(lc)) {
        return entry.terms;
      }
      for (const term of entry.terms) {
        if (lc.includes(term) || term.includes(lc)) {
          return SEMANTIC_MAP[category]?.terms ?? [];
        }
      }
    }
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Reference Collector
// ═══════════════════════════════════════════════════════════════════

/**
 * Gathers web search results and images from multiple providers,
 * deduplicates by URL, and enriches with related concept expansion.
 */
export class ReferenceCollector {
  readonly #conceptSearch: ConceptSearch;

  constructor(conceptSearch?: ConceptSearch) {
    this.#conceptSearch = conceptSearch ?? new ConceptSearch();
  }

  /**
   * Collect web search results from multiple providers for a concept.
   * Results are deduplicated by URL and sorted by descending relevance.
   */
  async collect(concept: string, providers: SearchProvider[]): Promise<ReferenceCollection> {
    const [results, images] = await Promise.all([
      this.#gatherResults(concept, providers),
      Promise.resolve([] as ImageSearchResult[]),
    ]);

    const expansion = this.#conceptSearch.findRelated(concept);
    const relatedConcepts = expansion.related.map((r) => r.term);

    return {
      query: concept,
      results,
      images,
      relatedConcepts,
      totalSources: new Set(results.map((r) => r.source)).size,
      collectedAt: Date.now(),
    };
  }

  /**
   * Collect image search results from multiple image providers for a concept.
   * Results are deduplicated by URL.
   */
  async collectImages(concept: string, providers: ImageSearchProvider[]): Promise<ImageSearchResult[]> {
    const settled = await Promise.allSettled(
      providers.map((p) => p.searchImages(concept)),
    );

    const all: ImageSearchResult[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') all.push(...result.value);
    }

    return deduplicateBy(all, (r) => r.url);
  }

  async #gatherResults(concept: string, providers: SearchProvider[]): Promise<SearchResult[]> {
    const settled = await Promise.allSettled(
      providers.map((p) => p.search(concept)),
    );

    const all: SearchResult[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') all.push(...result.value);
    }

    return deduplicateBy(all, (r) => r.url).sort((a, b) => b.relevance - a.relevance);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Search Cache — LRU with TTL
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_TTL_MS = 3_600_000;      // 1 hour
const DEFAULT_IMAGE_TTL_MS = 86_400_000; // 24 hours

export interface SearchCacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
  imageTtlMs?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  /** Insertion order index for LRU eviction. */
  insertedAt: number;
}

/**
 * Generic LRU cache with per-entry TTL expiry.
 * Evicts the oldest entry (by insertion order) when maxEntries is exceeded.
 * Expired entries are lazily evicted on access.
 */
export class SearchCache<T = unknown> {
  readonly #maxEntries: number;
  readonly #defaultTtlMs: number;
  readonly #imageTtlMs: number;
  readonly #store: Map<string, CacheEntry<T>>;
  #clock = 0;

  constructor(options: SearchCacheOptions = {}) {
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.#imageTtlMs = options.imageTtlMs ?? DEFAULT_IMAGE_TTL_MS;
    this.#store = new Map();
  }

  /** Number of non-expired entries currently in the cache. */
  get size(): number {
    // Do not count expired entries.
    let count = 0;
    const now = Date.now();
    for (const entry of this.#store.values()) {
      if (entry.expiresAt > now) count++;
    }
    return count;
  }

  /** Retrieve a value. Returns `undefined` if missing or expired. */
  get(key: string): T | undefined {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Store a value with an optional TTL override (ms). */
  set(key: string, value: T, ttlMs?: number): void {
    if (this.#store.size >= this.#maxEntries) {
      this.#evictOldest();
    }
    this.#store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.#defaultTtlMs),
      insertedAt: this.#clock++,
    });
  }

  /** Store an image search result with the image-specific TTL. */
  setImage(key: string, value: T): void {
    this.set(key, value, this.#imageTtlMs);
  }

  /** Check whether a non-expired entry exists for the key. */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.#store.clear();
    this.#clock = 0;
  }

  /** Evict the single oldest entry by insertion order. */
  #evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestInsert = Infinity;
    for (const [key, entry] of this.#store.entries()) {
      if (entry.insertedAt < oldestInsert) {
        oldestInsert = entry.insertedAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) this.#store.delete(oldestKey);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Cached Search Provider
// ═══════════════════════════════════════════════════════════════════

/**
 * Wraps any SearchProvider with a SearchCache, transparently caching results.
 * Cache key is derived from the query and relevant options.
 */
export class CachedSearchProvider implements SearchProvider {
  readonly #provider: SearchProvider;
  readonly #cache: SearchCache<SearchResult[]>;

  constructor(provider: SearchProvider, cache: SearchCache<SearchResult[]>) {
    this.#provider = provider;
    this.#cache = cache;
  }

  get name(): string {
    return `cached:${this.#provider.name}`;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const cacheKey = this.#buildKey(query, options);
    const cached = this.#cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const results = await this.#provider.search(query, options);
    this.#cache.set(cacheKey, results);
    return results;
  }

  async isAvailable(): Promise<boolean> {
    return this.#provider.isAvailable();
  }

  #buildKey(query: string, options: SearchOptions): string {
    const parts = [
      this.#provider.name,
      query.toLowerCase().trim(),
      String(options.maxResults ?? ''),
      options.language ?? '',
      String(options.safeSearch ?? ''),
      options.timeRange ?? '',
    ];
    return parts.join('|');
  }
}
