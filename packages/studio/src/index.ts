/**
 * @paradigm/studio -- Shared cinematic component library for GSPL Paradigm.
 *
 * Layer 7: Studio. Pure TypeScript implementation providing state management,
 * theme system, API client abstraction, SSE protocol, Electron IPC bridge,
 * and panel registry. Zero DOM/browser dependencies -- all logic is
 * framework-agnostic and consumed by React or any other renderer.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, SeedDomain } from '@paradigm/types';
import { computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';

// ─────────────────────────────────────────────
// 1. Theme System
// ─────────────────────────────────────────────

/** Flat design-token set for the GSPL Paradigm cinematic UI. */
export interface ThemeTokens {
  readonly background: string;
  readonly surface: string;
  readonly surfaceHover: string;
  readonly text: string;
  readonly textMuted: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly border: string;
  readonly shadow: string;
  readonly fontMono: string;
  readonly fontSans: string;
  readonly fontSerif: string;
  readonly radiusSm: string;
  readonly radiusMd: string;
  readonly radiusLg: string;
  readonly spacingSm: string;
  readonly spacingMd: string;
  readonly spacingLg: string;
}

/** Deep space dark theme with bioluminescent accents. */
export const DARK_THEME: ThemeTokens = {
  background: '#0a0e1a',
  surface: '#0d1117',
  surfaceHover: '#161b22',
  text: '#e6edf3',
  textMuted: '#8b949e',
  accent: '#00f0ff',
  accentHover: '#33f3ff',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  border: '#30363d',
  shadow: 'rgba(0, 0, 0, 0.4)',
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  fontSans: "'Inter', 'Segoe UI', system-ui, sans-serif",
  fontSerif: "'Merriweather', 'Georgia', serif",
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '16px',
  spacingSm: '4px',
  spacingMd: '8px',
  spacingLg: '16px',
} as const;

/** Per-domain accent colors for visual distinction across seed domains. */
export const DOMAIN_COLORS: Record<string, string> = {
  organism: '#10b981',
  vehicle: '#6366f1',
  weapon: '#ef4444',
  building: '#a78bfa',
  terrain: '#84cc16',
  material: '#f97316',
  plant: '#22c55e',
  insect: '#eab308',
  fish: '#06b6d4',
  bird: '#38bdf8',
  mammal: '#fb923c',
  robot: '#94a3b8',
  particle: '#f472b6',
  fluid: '#22d3ee',
  crystal: '#c084fc',
  sound: '#fbbf24',
  music: '#e879f9',
  pattern: '#a3e635',
  network: '#818cf8',
  language: '#fb7185',
  code: '#34d399',
  strategy: '#fca5a5',
  schedule: '#d8b4fe',
  rule: '#bef264',
  constraint: '#fda4af',
  ecosystem: '#4ade80',
  game: '#f59e0b',
  simulation: '#7c3aed',
  audio: '#facc15',
  narrative: '#e11d48',
  ui: '#0ea5e9',
  city: '#a8a29e',
  neural: '#c084fc',
  intelligence: '#7c3aed',
  quantum: '#2dd4bf',
  molecular: '#f43f5e',
  education: '#60a5fa',
  finance: '#fde047',
  infrastructure: '#78716c',
  product: '#fb923c',
  'seed-intelligence': '#a855f7',
  void: '#1e1b4b',
  web: '#3b82f6',
  render: '#14b8a6',
  shader: '#8b5cf6',
  'animation-visual': '#ec4899',
  interaction: '#06b6d4',
  aesthetic: '#d946ef',
  emotion: '#f43f5e',
  perception: '#8b5cf6',
  cinematic: '#7c3aed',
  rig: '#9ca3af',
  mocap: '#a3a3a3',
  lod: '#737373',
  texture: '#d97706',
  logo: '#e11d48',
  brand: '#be185d',
  compression: '#525252',
  'security-threat': '#dc2626',
  intrusion: '#b91c1c',
  forensics: '#92400e',
  'memory-store': '#6d28d9',
};

/**
 * FNV-1a hash for deterministic fallback color generation.
 * Local copy to avoid depending on unexported internals of @paradigm/rng.
 */
function fnv1aLocal(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h;
}

/**
 * Get the accent color for a seed domain.
 * Falls back to FNV-1a hash-derived HSL color for unknown domains.
 */
export function getDomainColor(domain: string): string {
  const mapped = DOMAIN_COLORS[domain];
  if (mapped !== undefined) {
    return mapped;
  }
  const hue = fnv1aLocal(domain) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

// ─────────────────────────────────────────────
// 2. Store System (Zustand-like, pure TS)
// ─────────────────────────────────────────────

/** Listener callback for store subscriptions. */
export type StoreListener<T> = (state: T, prevState: T) => void;

/** Partial state or updater function accepted by setState. */
export type StateUpdater<T> = Partial<T> | ((prev: T) => Partial<T>);

/**
 * Generic reactive store with immutable updates via spread.
 * Inspired by Zustand's minimal API surface -- zero dependencies.
 */
export class Store<T extends Record<string, unknown>> {
  private state: T;
  private readonly initialState: T;
  private readonly listeners: Set<StoreListener<T>> = new Set();

  constructor(initialState: T) {
    this.state = { ...initialState };
    this.initialState = { ...initialState };
  }

  /** Return a shallow copy of the current state. */
  getState(): T {
    return { ...this.state };
  }

  /**
   * Merge partial state or apply an updater function.
   * Immutable via spread; notifies all subscribers.
   */
  setState(updater: StateUpdater<T>): void {
    const prev = this.state;
    const partial = typeof updater === 'function' ? updater(prev) : updater;
    this.state = { ...prev, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state, prev);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Store] Listener error: ${msg}`);
      }
    }
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StoreListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Reset state to the initial value provided at construction. */
  reset(): void {
    const prev = this.state;
    this.state = { ...this.initialState };
    for (const listener of this.listeners) {
      try {
        listener(this.state, prev);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Store] Listener error on reset: ${msg}`);
      }
    }
  }

  /** Current number of active subscribers. */
  get listenerCount(): number {
    return this.listeners.size;
  }
}

// ─────────────────────────────────────────────
// 3. WorldStore -- Seed Population State
// ─────────────────────────────────────────────

/** WorldStore state snapshot. */
export interface WorldStoreState {
  readonly seeds: ReadonlyMap<string, UniversalSeed>;
  readonly selectedSeedHash: string | null;
  readonly worldName: string;
  readonly generation: number;
}

/** Manages the world's seed population with add/remove/select operations. */
export class WorldStore {
  private seeds: Map<string, UniversalSeed> = new Map();
  private selectedSeedHash: string | null = null;
  private worldName: string = 'Untitled World';
  private generation: number = 0;
  private readonly listeners: Set<() => void> = new Set();

  /** Return a snapshot of the current world state. */
  getState(): WorldStoreState {
    return {
      seeds: new Map(this.seeds),
      selectedSeedHash: this.selectedSeedHash,
      worldName: this.worldName,
      generation: this.generation,
    };
  }

  /** Subscribe to any state change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[WorldStore] Listener error: ${msg}`);
      }
    }
  }

  /** Add a seed to the world by its $hash. */
  addSeed(seed: UniversalSeed): void {
    this.seeds.set(seed.$hash, seed);
    this.notify();
  }

  /** Remove a seed by hash. Deselects if it was the selected seed. */
  removeSeed(hash: string): void {
    this.seeds.delete(hash);
    if (this.selectedSeedHash === hash) {
      this.selectedSeedHash = null;
    }
    this.notify();
  }

  /** Select a seed by hash. Pass null to deselect. */
  selectSeed(hash: string | null): void {
    this.selectedSeedHash = hash;
    this.notify();
  }

  /** Set the world name. */
  setWorldName(name: string): void {
    this.worldName = name;
    this.notify();
  }

  /** Increment the world generation counter by 1. */
  incrementGeneration(): void {
    this.generation += 1;
    this.notify();
  }

  /** Clear all seeds, reset selection and generation. */
  clearWorld(): void {
    this.seeds.clear();
    this.selectedSeedHash = null;
    this.generation = 0;
    this.notify();
  }

  /** Get the currently selected seed, or undefined if none selected. */
  getSelectedSeed(): UniversalSeed | undefined {
    if (this.selectedSeedHash === null) return undefined;
    return this.seeds.get(this.selectedSeedHash);
  }

  /** Get the total number of seeds in the world. */
  getSeedCount(): number {
    return this.seeds.size;
  }

  /** Reset to initial empty state. */
  reset(): void {
    this.seeds.clear();
    this.selectedSeedHash = null;
    this.worldName = 'Untitled World';
    this.generation = 0;
    this.notify();
  }
}

// ─────────────────────────────────────────────
// 4. UIStore -- UI State
// ─────────────────────────────────────────────

/** Notification displayed in the studio UI. */
export interface Notification {
  readonly id: string;
  readonly message: string;
  readonly type: 'info' | 'success' | 'warning' | 'error';
  readonly timestamp: number;
}

/** UI store state shape. */
export interface UIStoreState {
  readonly activePanel: string;
  readonly sidebarOpen: boolean;
  readonly theme: ThemeTokens;
  readonly notifications: readonly Notification[];
}

/** Counter for deterministic notification IDs within a session. */
let notificationCounter = 0;

/** Manages global UI state: active panel, sidebar, theme, notifications. */
export class UIStore {
  private activePanel: string = 'overview';
  private sidebarOpen: boolean = true;
  private theme: ThemeTokens;
  private notifications: Notification[] = [];
  private readonly listeners: Set<() => void> = new Set();

  constructor(theme: ThemeTokens = DARK_THEME) {
    this.theme = theme;
  }

  /** Return the current UI state snapshot. */
  getState(): UIStoreState {
    return {
      activePanel: this.activePanel,
      sidebarOpen: this.sidebarOpen,
      theme: this.theme,
      notifications: [...this.notifications],
    };
  }

  /** Subscribe to UI state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[UIStore] Listener error: ${msg}`);
      }
    }
  }

  /** Switch the active panel by ID. */
  setActivePanel(panel: string): void {
    this.activePanel = panel;
    this.notify();
  }

  /** Toggle the sidebar open/closed. */
  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.notify();
  }

  /** Add a notification. Returns the generated notification ID. */
  addNotification(message: string, type: Notification['type']): string {
    notificationCounter += 1;
    const id = `notif-${notificationCounter}-${computeQuickHash(message)}`;
    this.notifications = [
      ...this.notifications,
      { id, message, type, timestamp: Date.now() },
    ];
    this.notify();
    return id;
  }

  /** Remove a notification by ID. */
  removeNotification(id: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
  }

  /** Clear all notifications. */
  clearNotifications(): void {
    this.notifications = [];
    this.notify();
  }

  /** Reset UI to initial state. */
  reset(theme: ThemeTokens = DARK_THEME): void {
    this.activePanel = 'overview';
    this.sidebarOpen = true;
    this.theme = theme;
    this.notifications = [];
    this.notify();
  }
}

// ─────────────────────────────────────────────
// 5. EvolutionStore -- Evolution Run State
// ─────────────────────────────────────────────

/** A single generation's fitness record. */
export interface FitnessRecord {
  readonly gen: number;
  readonly best: number;
  readonly avg: number;
}

/** Configuration for an evolution run. */
export interface EvolutionRunConfig {
  mutationRate: number;
  crossoverRate: number;
  selectionStrategy: string;
  eliteCount: number;
}

/** Evolution store state shape. */
export interface EvolutionStoreState {
  readonly running: boolean;
  readonly generation: number;
  readonly populationSize: number;
  readonly bestFitness: number;
  readonly avgFitness: number;
  readonly fitnessHistory: readonly FitnessRecord[];
  readonly config: Readonly<EvolutionRunConfig>;
}

const DEFAULT_EVOLUTION_CONFIG: EvolutionRunConfig = {
  mutationRate: 0.05,
  crossoverRate: 0.7,
  selectionStrategy: 'tournament',
  eliteCount: 2,
};

/** Manages the state of an evolution run including fitness tracking. */
export class EvolutionStore {
  private running: boolean = false;
  private generation: number = 0;
  private populationSize: number = 0;
  private bestFitness: number = 0;
  private avgFitness: number = 0;
  private fitnessHistory: FitnessRecord[] = [];
  private config: EvolutionRunConfig = { ...DEFAULT_EVOLUTION_CONFIG };
  private readonly listeners: Set<() => void> = new Set();

  /** Return the current evolution state snapshot. */
  getState(): EvolutionStoreState {
    return {
      running: this.running,
      generation: this.generation,
      populationSize: this.populationSize,
      bestFitness: this.bestFitness,
      avgFitness: this.avgFitness,
      fitnessHistory: [...this.fitnessHistory],
      config: { ...this.config },
    };
  }

  /** Subscribe to evolution state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[EvolutionStore] Listener error: ${msg}`);
      }
    }
  }

  /** Start an evolution run with partial config override. */
  start(config: Partial<EvolutionRunConfig>): void {
    this.running = true;
    this.generation = 0;
    this.bestFitness = 0;
    this.avgFitness = 0;
    this.fitnessHistory = [];
    this.config = { ...this.config, ...config };
    this.notify();
  }

  /** Stop the current evolution run. */
  stop(): void {
    this.running = false;
    this.notify();
  }

  /** Record fitness data for a completed generation. */
  recordGeneration(gen: number, best: number, avg: number): void {
    this.generation = gen;
    this.bestFitness = best;
    this.avgFitness = avg;
    this.fitnessHistory = [...this.fitnessHistory, { gen, best, avg }];
    this.notify();
  }

  /** Reset evolution state to defaults. */
  reset(): void {
    this.running = false;
    this.generation = 0;
    this.populationSize = 0;
    this.bestFitness = 0;
    this.avgFitness = 0;
    this.fitnessHistory = [];
    this.config = { ...DEFAULT_EVOLUTION_CONFIG };
    this.notify();
  }

  /** Update evolution config (partial merge). */
  updateConfig(partial: Partial<EvolutionRunConfig>): void {
    this.config = { ...this.config, ...partial };
    this.notify();
  }
}

// ─────────────────────────────────────────────
// 6. AgentStore -- Conversation State
// ─────────────────────────────────────────────

/** A single message in the agent conversation. */
export interface AgentMessage {
  readonly id: string;
  readonly role: 'user' | 'agent' | 'system';
  readonly content: string;
  readonly timestamp: number;
}

/** Agent conversation state shape. */
export interface AgentStoreState {
  readonly messages: readonly AgentMessage[];
  readonly thinking: boolean;
  readonly pendingActions: readonly string[];
}

/** Counter for deterministic message IDs within a session. */
let messageCounter = 0;

/** Manages agent conversation state including messages and pending actions. */
export class AgentStore {
  private messages: AgentMessage[] = [];
  private thinking: boolean = false;
  private pendingActions: string[] = [];
  private readonly listeners: Set<() => void> = new Set();

  /** Return the current agent state snapshot. */
  getState(): AgentStoreState {
    return {
      messages: [...this.messages],
      thinking: this.thinking,
      pendingActions: [...this.pendingActions],
    };
  }

  /** Subscribe to agent state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[AgentStore] Listener error: ${msg}`);
      }
    }
  }

  /** Add a message to the conversation. Returns the message ID. */
  addMessage(role: AgentMessage['role'], content: string): string {
    messageCounter += 1;
    const id = `msg-${messageCounter}-${computeQuickHash(content)}`;
    this.messages = [
      ...this.messages,
      { id, role, content, timestamp: Date.now() },
    ];
    this.notify();
    return id;
  }

  /** Set whether the agent is currently thinking. */
  setThinking(value: boolean): void {
    this.thinking = value;
    this.notify();
  }

  /** Add a pending action label (e.g. 'evolving', 'forging'). */
  addPendingAction(action: string): void {
    this.pendingActions = [...this.pendingActions, action];
    this.notify();
  }

  /** Remove a pending action by label. Removes only the first occurrence. */
  removePendingAction(action: string): void {
    const idx = this.pendingActions.indexOf(action);
    if (idx >= 0) {
      this.pendingActions = [
        ...this.pendingActions.slice(0, idx),
        ...this.pendingActions.slice(idx + 1),
      ];
      this.notify();
    }
  }

  /** Clear all messages, pending actions, and thinking state. */
  clearHistory(): void {
    this.messages = [];
    this.thinking = false;
    this.pendingActions = [];
    this.notify();
  }

  /** Reset to initial state (alias for clearHistory). */
  reset(): void {
    this.clearHistory();
  }
}

// ─────────────────────────────────────────────
// 7. APIClient -- HTTP Client Abstraction
// ─────────────────────────────────────────────

/** HTTP method type. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Describes an outbound API request. */
export interface APIRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Typed API response envelope. */
export interface APIResponse<T> {
  readonly status: number;
  readonly data: T;
  readonly error?: string;
}

/** All API route paths used by the Paradigm backend. */
export const API_ROUTES = {
  // Seeds
  SEEDS_LIST: '/api/seeds',
  SEEDS_CREATE: '/api/seeds',
  SEEDS_GET: '/api/seeds/:hash',
  SEEDS_DELETE: '/api/seeds/:hash',
  SEEDS_MUTATE: '/api/seeds/:hash/mutate',
  SEEDS_BREED: '/api/seeds/breed',
  // Evolution
  EVOLUTION_START: '/api/evolution/start',
  EVOLUTION_STOP: '/api/evolution/stop',
  EVOLUTION_STATUS: '/api/evolution/status',
  EVOLUTION_HISTORY: '/api/evolution/history',
  // World
  WORLD_STATE: '/api/world',
  WORLD_CLEAR: '/api/world/clear',
  WORLD_SNAPSHOT: '/api/world/snapshot',
  WORLD_RESTORE: '/api/world/restore',
  // Forge
  FORGE_GENERATE: '/api/forge/generate',
  FORGE_STATUS: '/api/forge/status',
  FORGE_ARTIFACTS: '/api/forge/artifacts',
  // Agent
  AGENT_CHAT: '/api/agent/chat',
  AGENT_HISTORY: '/api/agent/history',
  AGENT_TOOLS: '/api/agent/tools',
  // Export
  EXPORT_JSON: '/api/export/json',
  EXPORT_HTML: '/api/export/html',
  EXPORT_BINARY: '/api/export/binary',
  // Marketplace
  MARKETPLACE_LISTINGS: '/api/marketplace/listings',
  MARKETPLACE_LISTING: '/api/marketplace/listings/:id',
  MARKETPLACE_PUBLISH: '/api/marketplace/publish',
  MARKETPLACE_REVIEWS: '/api/marketplace/listings/:id/reviews',
  // Search
  SEARCH_SEEDS: '/api/search/seeds',
  SEARCH_MARKETPLACE: '/api/search/marketplace',
  // SSE stream
  SSE_STREAM: '/api/events/stream',
} as const;

/**
 * HTTP client abstraction that builds request/response objects without
 * performing actual network I/O. Consumers supply the transport layer
 * (fetch, XMLHttpRequest, Electron IPC, etc.).
 */
export class APIClient {
  readonly baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string = '', headers?: Record<string, string>) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    };
  }

  /** Build an APIRequest for the given method, path, and optional body. */
  buildRequest(method: HttpMethod, path: string, body?: unknown): APIRequest {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const fullPath = `${this.baseUrl}${normalizedPath}`;
    return {
      method,
      path: fullPath,
      body: body !== undefined ? body : undefined,
      headers: { ...this.defaultHeaders },
    };
  }

  /**
   * Parse a raw response status and body into a typed APIResponse.
   * Status codes >= 400 populate the error field.
   */
  parseResponse<T>(status: number, body: unknown): APIResponse<T> {
    if (status >= 400) {
      const errorMessage =
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as Record<string, unknown>)['error'])
          : `Request failed with status ${status}`;
      return { status, data: body as T, error: errorMessage };
    }
    return { status, data: body as T };
  }

  /** Set a default header for all future requests. */
  setHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }

  /** Remove a default header. */
  removeHeader(key: string): void {
    const { [key]: _, ...rest } = this.defaultHeaders;
    this.defaultHeaders = rest;
  }
}

// ─────────────────────────────────────────────
// 8. SSEProtocol -- Server-Sent Events Protocol
// ─────────────────────────────────────────────

/** A parsed SSE event. */
export interface SSEEvent {
  readonly type: string;
  readonly data: string;
  readonly id?: string;
  readonly retry?: number;
}

/** Well-known SSE event type constants for the Paradigm event stream. */
export const SSE_EVENTS = {
  SEED_CREATED: 'seed.created',
  SEED_BRED: 'seed.bred',
  SEED_MUTATED: 'seed.mutated',
  EVOLUTION_TICK: 'evolution.tick',
  EVOLUTION_COMPLETE: 'evolution.complete',
  WORLD_CLEARED: 'world.cleared',
  AGENT_THINKING: 'agent.thinking',
  AGENT_RESPONSE: 'agent.response',
  FORGE_PROGRESS: 'forge.progress',
} as const;

/**
 * Parse a raw SSE text block into an array of SSEEvent objects.
 * Handles the standard SSE wire format: event:, data:, id:, retry: fields
 * separated by double newlines.
 */
export function parseSSE(raw: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = raw.split(/\n\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length === 0) continue;

    let eventType = 'message';
    const dataLines: string[] = [];
    let id: string | undefined;
    let retry: number | undefined;

    const lines = trimmed.split('\n');
    for (const line of lines) {
      if (line.startsWith(':')) continue; // comment
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      } else if (line.startsWith('retry:')) {
        const parsed = parseInt(line.slice(6).trim(), 10);
        if (!isNaN(parsed)) {
          retry = parsed;
        }
      }
    }

    if (dataLines.length > 0 || eventType !== 'message') {
      const result: { type: string; data: string; id?: string; retry?: number } = {
        type: eventType,
        data: dataLines.join('\n'),
      };
      if (id !== undefined) result.id = id;
      if (retry !== undefined) result.retry = retry;
      events.push(result);
    }
  }

  return events;
}

/**
 * Serialize an SSEEvent to the SSE wire format string.
 * Produces a string ending with double newline (event boundary).
 */
export function formatSSE(event: SSEEvent): string {
  const lines: string[] = [];

  if (event.type !== 'message') {
    lines.push(`event: ${event.type}`);
  }

  const dataLines = event.data.split('\n');
  for (const dl of dataLines) {
    lines.push(`data: ${dl}`);
  }

  if (event.id !== undefined) {
    lines.push(`id: ${event.id}`);
  }
  if (event.retry !== undefined) {
    lines.push(`retry: ${event.retry}`);
  }

  return lines.join('\n') + '\n\n';
}

// ─────────────────────────────────────────────
// 9. ElectronBridge -- IPC Protocol Types
// ─────────────────────────────────────────────

/** All supported Electron IPC channel names. */
export type IPCChannel =
  | 'system-info'
  | 'open-demo'
  | 'seed-create'
  | 'seed-evolve'
  | 'file-save'
  | 'file-open'
  | 'dialog-save'
  | 'get-preferences'
  | 'set-preferences';

/** An IPC request to be sent over an Electron channel. */
export interface IPCRequest {
  readonly channel: IPCChannel;
  readonly payload?: unknown;
}

/** Typed IPC response from the Electron main process. */
export interface IPCResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * Electron IPC bridge abstraction. Pure TypeScript -- does not import Electron.
 * Provides request/response building and parsing for IPC communication.
 */
export class ElectronBridge {
  /**
   * Check if running inside Electron.
   * Always returns false in pure TS context; override in an Electron preload script.
   */
  isElectron(): boolean {
    return false;
  }

  /** Build an IPC request for the given channel and optional payload. */
  createRequest(channel: IPCChannel, payload?: unknown): IPCRequest {
    return payload !== undefined ? { channel, payload } : { channel };
  }

  /**
   * Parse a raw IPC response into a typed IPCResponse.
   * Validates shape and extracts success/data/error fields.
   */
  parseResponse<T>(raw: unknown): IPCResponse<T> {
    if (typeof raw !== 'object' || raw === null) {
      return { success: false, error: 'Invalid IPC response: not an object' };
    }

    const obj = raw as Record<string, unknown>;
    if (typeof obj['success'] !== 'boolean') {
      return { success: false, error: 'Invalid IPC response: missing success field' };
    }

    const result: { success: boolean; data?: T; error?: string } = {
      success: obj['success'],
    };

    if ('data' in obj) {
      result.data = obj['data'] as T;
    }
    if ('error' in obj && typeof obj['error'] === 'string') {
      result.error = obj['error'];
    }

    return result;
  }
}

// ─────────────────────────────────────────────
// 10. PanelDefinition -- Panel Registry
// ─────────────────────────────────────────────

/** Describes a single panel in the studio layout. */
export interface PanelDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly shortcut?: string;
  readonly description: string;
}

/** All 12 available panels in the GSPL Paradigm studio. */
export const PANELS: readonly PanelDefinition[] = [
  {
    id: 'overview',
    name: 'Overview',
    icon: 'layout-dashboard',
    shortcut: 'Ctrl+1',
    description: 'World overview with seed population summary and key metrics.',
  },
  {
    id: 'node-canvas',
    name: 'Node Canvas',
    icon: 'git-branch',
    shortcut: 'Ctrl+2',
    description: 'Visual node graph for seed relationships and composition operators.',
  },
  {
    id: 'seed-inspector',
    name: 'Seed Inspector',
    icon: 'search',
    shortcut: 'Ctrl+3',
    description: 'Deep inspection of individual seed genes, lineage, and fitness vectors.',
  },
  {
    id: 'evolution',
    name: 'Evolution',
    icon: 'trending-up',
    shortcut: 'Ctrl+4',
    description: 'Evolution run control, fitness charts, and population diversity tracking.',
  },
  {
    id: 'three-viewer',
    name: '3D Viewer',
    icon: 'box',
    shortcut: 'Ctrl+5',
    description: 'Three.js-based 3D visualization of seed phenotypes and world geometry.',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    icon: 'clock',
    shortcut: 'Ctrl+6',
    description: 'Chronological event timeline with generation markers and seed births.',
  },
  {
    id: 'narrative',
    name: 'Narrative',
    icon: 'book-open',
    shortcut: 'Ctrl+7',
    description: 'Story and lore generation from seed lineage and world events.',
  },
  {
    id: 'forge',
    name: 'Forge',
    icon: 'hammer',
    shortcut: 'Ctrl+8',
    description: 'Asset generation pipeline: sprites, audio, code, and export formats.',
  },
  {
    id: 'conversation',
    name: 'Conversation',
    icon: 'message-circle',
    shortcut: 'Ctrl+9',
    description: 'Natural language interface to the Garden Mind agent.',
  },
  {
    id: 'marketplace',
    name: 'Marketplace',
    icon: 'shopping-bag',
    description: 'Browse, publish, and trade seeds with the GSPL community.',
  },
  {
    id: 'threats',
    name: 'Threats',
    icon: 'shield-alert',
    description: 'Security threat monitor, audit log, and sovereignty controls.',
  },
  {
    id: 'global-dashboard',
    name: 'Global Dashboard',
    icon: 'globe',
    description: 'Cross-world analytics, federated seed metrics, and network health.',
  },
] as const;

/**
 * Look up a panel definition by its ID.
 * Returns undefined if no panel matches.
 */
export function getPanelById(id: string): PanelDefinition | undefined {
  return PANELS.find((p) => p.id === id);
}

// ─────────────────────────────────────────────
// 11. StudioEngine -- Top-Level Entry Point
// ─────────────────────────────────────────────

/** Configuration for the StudioEngine constructor. */
export interface StudioConfig {
  readonly baseUrl?: string;
  readonly theme?: ThemeTokens;
}

/** Serializable state snapshot from the studio engine. */
export interface StudioSnapshot {
  readonly worldName: string;
  readonly seedCount: number;
  readonly selectedSeedHash: string | null;
  readonly worldGeneration: number;
  readonly activePanel: string;
  readonly sidebarOpen: boolean;
  readonly evolutionRunning: boolean;
  readonly evolutionGeneration: number;
  readonly bestFitness: number;
  readonly avgFitness: number;
  readonly messageCount: number;
  readonly agentThinking: boolean;
  readonly pendingActionCount: number;
  readonly notificationCount: number;
  readonly isElectron: boolean;
}

/**
 * Top-level orchestrator for the GSPL Paradigm studio.
 * Aggregates all stores, API client, Electron bridge, theme,
 * and panel registry into a single coherent entry point.
 */
export class StudioEngine {
  readonly world: WorldStore;
  readonly ui: UIStore;
  readonly evolution: EvolutionStore;
  readonly agent: AgentStore;
  readonly api: APIClient;
  readonly bridge: ElectronBridge;
  readonly theme: ThemeTokens;
  readonly panels: readonly PanelDefinition[];

  constructor(config?: StudioConfig) {
    this.theme = config?.theme ?? DARK_THEME;
    this.world = new WorldStore();
    this.ui = new UIStore(this.theme);
    this.evolution = new EvolutionStore();
    this.agent = new AgentStore();
    this.api = new APIClient(config?.baseUrl ?? '');
    this.bridge = new ElectronBridge();
    this.panels = PANELS;
  }

  /**
   * Produce a serializable snapshot of the entire studio state.
   * Useful for persistence, debugging, and state transfer.
   */
  getSnapshot(): StudioSnapshot {
    const ws = this.world.getState();
    const us = this.ui.getState();
    const es = this.evolution.getState();
    const as_ = this.agent.getState();

    return {
      worldName: ws.worldName,
      seedCount: this.world.getSeedCount(),
      selectedSeedHash: ws.selectedSeedHash,
      worldGeneration: ws.generation,
      activePanel: us.activePanel,
      sidebarOpen: us.sidebarOpen,
      evolutionRunning: es.running,
      evolutionGeneration: es.generation,
      bestFitness: es.bestFitness,
      avgFitness: es.avgFitness,
      messageCount: as_.messages.length,
      agentThinking: as_.thinking,
      pendingActionCount: as_.pendingActions.length,
      notificationCount: us.notifications.length,
      isElectron: this.bridge.isElectron(),
    };
  }
}
