/**
 * @paradigm/desktop — Electron desktop application configuration and logic.
 *
 * Pure TypeScript implementation providing window configuration, menu definitions,
 * IPC handler registry, and app lifecycle types that the real Electron main process
 * would consume. Zero Electron or Node.js APIs — only pure config and logic.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, SeedDomain } from '@paradigm/types';
import { computeQuickHash } from '@paradigm/rng';

// ─────────────────────────────────────────────
// WindowConfig — Window configuration
// ─────────────────────────────────────────────

/** Configuration for an Electron BrowserWindow. */
export interface WindowConfig {
  readonly width: number;
  readonly height: number;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly title: string;
  readonly backgroundColor: string;
  readonly show: boolean;
  readonly frame: boolean;
  readonly transparent: boolean;
  readonly vibrancy?: string;
}

/** Main application window: 1400x900, deep space dark theme. */
export const MAIN_WINDOW_CONFIG: WindowConfig = {
  width: 1400,
  height: 900,
  minWidth: 1024,
  minHeight: 600,
  title: 'GSPL Paradigm — The Living World Compiler',
  backgroundColor: '#0a0e1a',
  show: true,
  frame: true,
  transparent: false,
} as const;

/** Splash screen: 500x400, transparent, frameless. */
export const SPLASH_WINDOW_CONFIG: WindowConfig = {
  width: 500,
  height: 400,
  minWidth: 500,
  minHeight: 400,
  title: 'GSPL Paradigm — Loading',
  backgroundColor: '#00000000',
  show: true,
  frame: false,
  transparent: true,
  vibrancy: 'under-window',
} as const;

/** Demo viewer window: 1200x800. */
export const DEMO_WINDOW_CONFIG: WindowConfig = {
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 500,
  title: 'GSPL Paradigm — Demo',
  backgroundColor: '#0a0e1a',
  show: true,
  frame: true,
  transparent: false,
} as const;

// ─────────────────────────────────────────────
// SecurityConfig — Electron security settings
// ─────────────────────────────────────────────

/** Security settings for Electron webPreferences. */
export interface SecurityConfig {
  readonly nodeIntegration: boolean;
  readonly contextIsolation: boolean;
  readonly sandbox: boolean;
  readonly webSecurity: boolean;
}

/** Default security configuration: locked-down, context-isolated, sandboxed. */
export const DEFAULT_SECURITY: SecurityConfig = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
} as const;

/**
 * Content Security Policy header for Electron.
 * Restricts scripts to self, styles to self + unsafe-inline (for CSS-in-JS),
 * images to self + data URIs, fonts to self, and blocks all other sources.
 */
export const CSP_HEADER: string =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  "connect-src 'self' http://localhost:11420 ws://localhost:11420; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'";

// ─────────────────────────────────────────────
// MenuTemplate — Application menu definitions
// ─────────────────────────────────────────────

/** A menu item definition consumable by Electron's Menu.buildFromTemplate(). */
export interface MenuItem {
  readonly label: string;
  readonly accelerator?: string;
  readonly role?: string;
  readonly submenu?: readonly MenuItem[];
  readonly click?: string;
  readonly separator?: boolean;
}

/** Separator sentinel for use inside menu arrays. */
const SEP: MenuItem = { label: '', separator: true } as const;

/**
 * Build the full application menu template.
 * Returns a tree of MenuItem definitions for File, Edit, View, Seeds,
 * Evolution, Tools, and Help menus.
 */
export function buildMenuTemplate(): readonly MenuItem[] {
  return [
    {
      label: 'File',
      submenu: [
        { label: 'New Session', accelerator: 'CmdOrCtrl+N', click: 'file:new-session' },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: 'file:open' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: 'file:save' },
        { label: 'Export...', accelerator: 'CmdOrCtrl+Shift+E', click: 'file:export' },
        { label: 'Import...', accelerator: 'CmdOrCtrl+Shift+I', click: 'file:import' },
        SEP,
        { label: 'Recent Files', click: 'file:recent-files' },
        SEP,
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        SEP,
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        SEP,
        { label: 'Duplicate Seed', accelerator: 'CmdOrCtrl+D', click: 'edit:duplicate-seed' },
        { label: 'Merge Seeds', accelerator: 'CmdOrCtrl+M', click: 'edit:merge-seeds' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+J', role: 'toggleDevTools' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        SEP,
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        SEP,
        { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Seeds',
      submenu: [
        { label: 'Create Seed...', accelerator: 'CmdOrCtrl+Shift+N', click: 'seeds:create' },
        { label: 'Browse Marketplace', click: 'seeds:marketplace' },
        { label: 'My Collection', click: 'seeds:collection' },
      ],
    },
    {
      label: 'Evolution',
      submenu: [
        { label: 'Start Evolution', accelerator: 'F5', click: 'evolution:start' },
        { label: 'Stop Evolution', accelerator: 'Shift+F5', click: 'evolution:stop' },
        { label: 'Step Forward', accelerator: 'F10', click: 'evolution:step' },
        SEP,
        { label: 'Configure...', click: 'evolution:configure' },
        { label: 'Breed Selected', accelerator: 'CmdOrCtrl+B', click: 'evolution:breed' },
        { label: 'Mutate Selected', accelerator: 'CmdOrCtrl+Shift+M', click: 'evolution:mutate' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Genome Registry', click: 'tools:genome-registry' },
        { label: 'Domain Explorer', click: 'tools:domain-explorer' },
        { label: 'Network Analyzer', click: 'tools:network-analyzer' },
        { label: 'Security Audit', click: 'tools:security-audit' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About GSPL Paradigm', click: 'help:about' },
        { label: 'Documentation', accelerator: 'F1', click: 'help:documentation' },
        { label: 'System Info', click: 'help:system-info' },
        { label: 'Report Bug', click: 'help:report-bug' },
        { label: 'Community', click: 'help:community' },
      ],
    },
  ];
}

// ─────────────────────────────────────────────
// IPCHandlerRegistry — IPC channel definitions
// ─────────────────────────────────────────────

/** Definition of an Electron IPC channel. */
export interface IPCHandler {
  readonly channel: string;
  readonly description: string;
  readonly requiresAuth: boolean;
}

/** All registered IPC channels between renderer and main process. */
export const IPC_HANDLERS: readonly IPCHandler[] = [
  { channel: 'system-info', description: 'Get application and platform information', requiresAuth: false },
  { channel: 'open-demo', description: 'Open a demo by ID in a new window', requiresAuth: false },
  { channel: 'launch-cli', description: 'Launch CLI subprocess with arguments', requiresAuth: true },
  { channel: 'send-command', description: 'Send GSPL command string to the runtime', requiresAuth: false },
  { channel: 'seed-create', description: 'Create a new universal seed', requiresAuth: false },
  { channel: 'seed-evolve', description: 'Trigger evolution on a seed population', requiresAuth: false },
  { channel: 'seed-inspect', description: 'Inspect a seed by ID and return its genome', requiresAuth: false },
  { channel: 'seed-delete', description: 'Delete a seed from the local store', requiresAuth: true },
  { channel: 'file-save', description: 'Save current session to disk', requiresAuth: false },
  { channel: 'file-open', description: 'Open a session file from disk', requiresAuth: false },
  { channel: 'dialog-save', description: 'Show native save dialog and return chosen path', requiresAuth: false },
  { channel: 'dialog-open', description: 'Show native open dialog and return chosen path', requiresAuth: false },
  { channel: 'open-external', description: 'Open a URL in the default system browser', requiresAuth: false },
  { channel: 'check-updates', description: 'Check for application updates', requiresAuth: false },
  { channel: 'get-preferences', description: 'Read user preferences from disk', requiresAuth: false },
  { channel: 'set-preferences', description: 'Write user preferences to disk', requiresAuth: false },
  { channel: 'marketplace-browse', description: 'Browse seed marketplace listings', requiresAuth: false },
  { channel: 'marketplace-purchase', description: 'Purchase a seed from the marketplace', requiresAuth: true },
  { channel: 'renderer-log', description: 'Forward a renderer log entry to the main process logger', requiresAuth: false },
  { channel: 'export-data', description: 'Export seeds or session data in a chosen format', requiresAuth: false },
  { channel: 'import-data', description: 'Import seeds or session data from a file', requiresAuth: false },
  { channel: 'get-recent-files', description: 'Retrieve the list of recently opened files', requiresAuth: false },
  { channel: 'clear-recent-files', description: 'Clear the recent files list', requiresAuth: false },
] as const;

/** Index of IPC handlers by channel name for O(1) lookup. */
const handlerIndex: ReadonlyMap<string, IPCHandler> = new Map(
  IPC_HANDLERS.map((h) => [h.channel, h]),
);

/**
 * Look up an IPC handler by channel name.
 * @returns The handler definition, or undefined if the channel is not registered.
 */
export function getHandler(channel: string): IPCHandler | undefined {
  return handlerIndex.get(channel);
}

/**
 * Validate whether a channel name is registered.
 * @returns true if the channel exists in the handler registry.
 */
export function validateChannel(channel: string): boolean {
  return handlerIndex.has(channel);
}

// ─────────────────────────────────────────────
// AppLifecycle — Application state machine
// ─────────────────────────────────────────────

/** All possible application states. */
export type AppState = 'initializing' | 'splash' | 'loading' | 'ready' | 'error' | 'quitting';

/** Callback type for state change listeners. */
export type StateChangeHandler = (from: AppState, to: AppState) => void;

/**
 * Valid state transitions.
 * - initializing -> splash -> loading -> ready -> quitting
 * - ready -> error, error -> quitting
 * - any -> quitting (universal exit)
 */
const VALID_TRANSITIONS: ReadonlyMap<AppState, ReadonlySet<AppState>> = new Map<AppState, ReadonlySet<AppState>>([
  ['initializing', new Set<AppState>(['splash', 'quitting'])],
  ['splash', new Set<AppState>(['loading', 'quitting'])],
  ['loading', new Set<AppState>(['ready', 'error', 'quitting'])],
  ['ready', new Set<AppState>(['error', 'quitting'])],
  ['error', new Set<AppState>(['quitting'])],
  ['quitting', new Set<AppState>()],
]);

/**
 * Application lifecycle state machine.
 * Manages valid state transitions and notifies listeners of state changes.
 */
export class AppLifecycle {
  private state: AppState = 'initializing';
  private readonly listeners: Set<StateChangeHandler> = new Set();
  private readonly createdAt: number;

  constructor() {
    this.createdAt = Date.now();
  }

  /** Get the current application state. */
  getState(): AppState {
    return this.state;
  }

  /**
   * Attempt to transition to a new state.
   * @returns true if the transition was valid and applied, false otherwise.
   */
  transition(to: AppState): boolean {
    const allowed = VALID_TRANSITIONS.get(this.state);
    if (!allowed || !allowed.has(to)) {
      return false;
    }
    const from = this.state;
    this.state = to;
    for (const handler of this.listeners) {
      handler(from, to);
    }
    return true;
  }

  /**
   * Register a callback invoked on every state change.
   * @returns An unsubscribe function.
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  /** Get the time in milliseconds since this lifecycle was created. */
  getUptime(): number {
    return Date.now() - this.createdAt;
  }
}

// ─────────────────────────────────────────────
// ChildProcessConfig — Web server process management
// ─────────────────────────────────────────────

/** Configuration for a managed child process (e.g., the web server). */
export interface ChildProcessConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly port: number;
  readonly healthCheckUrl: string;
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly shutdownTimeout: number;
}

/** Default child process config: local web server on port 11420. */
export const DEFAULT_CHILD_CONFIG: ChildProcessConfig = {
  command: 'node',
  args: ['dist/server.js'],
  port: 11420,
  healthCheckUrl: 'http://localhost:11420/health',
  maxRetries: 15,
  retryDelay: 2000,
  shutdownTimeout: 5000,
} as const;

/** Result of a health check attempt. */
export interface HealthCheckResult {
  readonly healthy: boolean;
  readonly latency: number;
  readonly error?: string;
}

/**
 * Simulated health checker for child process readiness.
 * Pure protocol definition — no actual HTTP requests are made.
 * The `check` method returns a simulated result based on internal state.
 */
export class HealthChecker {
  private healthy: boolean = false;
  private checkCount: number = 0;
  private becomeHealthyAfter: number;

  /**
   * @param becomeHealthyAfter Number of checks before the simulated service
   *   reports healthy. Defaults to 3 (simulating startup time).
   */
  constructor(becomeHealthyAfter: number = 3) {
    this.becomeHealthyAfter = becomeHealthyAfter;
  }

  /**
   * Simulate a health check against the given URL.
   * After `becomeHealthyAfter` invocations, the check returns healthy.
   *
   * @param url The health endpoint URL (used for validation, not actual HTTP).
   * @param timeout Optional timeout in ms (default 5000). Used to simulate latency bounds.
   * @returns A simulated health check result.
   */
  check(url: string, timeout: number = 5000): HealthCheckResult {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { healthy: false, latency: 0, error: `Invalid URL scheme: ${url}` };
    }

    this.checkCount++;

    if (this.checkCount >= this.becomeHealthyAfter) {
      this.healthy = true;
    }

    if (this.healthy) {
      // Simulate a deterministic latency based on the check count
      const latency = Math.min(10 + this.checkCount * 2, timeout);
      return { healthy: true, latency };
    }

    const simulatedLatency = Math.min(timeout, 500 + this.checkCount * 100);
    return {
      healthy: false,
      latency: simulatedLatency,
      error: `Service not ready (attempt ${String(this.checkCount)}/${String(this.becomeHealthyAfter)})`,
    };
  }

  /** Reset the checker to its initial unhealthy state. */
  reset(): void {
    this.healthy = false;
    this.checkCount = 0;
  }

  /** Get the current health status without performing a check. */
  isHealthy(): boolean {
    return this.healthy;
  }
}

// ─────────────────────────────────────────────
// PreferencesManager — User preferences
// ─────────────────────────────────────────────

/** Window bounds for restoring position on relaunch. */
export interface WindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** User-configurable application preferences. */
export interface AppPreferences {
  theme: 'dark' | 'light';
  fontSize: number;
  autoSave: boolean;
  autoSaveInterval: number;
  recentFiles: string[];
  maxRecentFiles: number;
  windowBounds?: WindowBounds;
  showSplash: boolean;
  checkUpdates: boolean;
}

/** Sensible default preferences for a new installation. */
export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  fontSize: 14,
  autoSave: true,
  autoSaveInterval: 30_000,
  recentFiles: [],
  maxRecentFiles: 10,
  showSplash: true,
  checkUpdates: true,
};

/**
 * In-memory preferences manager.
 * Holds current preferences and provides methods to get, set, reset, and
 * manage the recent files list. Persistence is the consumer's responsibility.
 */
export class PreferencesManager {
  private prefs: AppPreferences;

  constructor(initial?: Partial<AppPreferences>) {
    this.prefs = { ...DEFAULT_PREFERENCES, recentFiles: [...DEFAULT_PREFERENCES.recentFiles] };
    if (initial) {
      this.set(initial);
    }
  }

  /** Get a deep copy of the current preferences. */
  get(): AppPreferences {
    return {
      ...this.prefs,
      recentFiles: [...this.prefs.recentFiles],
      windowBounds: this.prefs.windowBounds ? { ...this.prefs.windowBounds } : undefined,
    };
  }

  /**
   * Merge partial preferences into the current state.
   * Only provided keys are overwritten; the rest are preserved.
   */
  set(partial: Partial<AppPreferences>): void {
    if (partial.theme !== undefined) {
      this.prefs.theme = partial.theme;
    }
    if (partial.fontSize !== undefined) {
      this.prefs.fontSize = partial.fontSize;
    }
    if (partial.autoSave !== undefined) {
      this.prefs.autoSave = partial.autoSave;
    }
    if (partial.autoSaveInterval !== undefined) {
      this.prefs.autoSaveInterval = partial.autoSaveInterval;
    }
    if (partial.recentFiles !== undefined) {
      this.prefs.recentFiles = [...partial.recentFiles];
    }
    if (partial.maxRecentFiles !== undefined) {
      this.prefs.maxRecentFiles = partial.maxRecentFiles;
    }
    if (partial.windowBounds !== undefined) {
      this.prefs.windowBounds = partial.windowBounds ? { ...partial.windowBounds } : undefined;
    }
    if (partial.showSplash !== undefined) {
      this.prefs.showSplash = partial.showSplash;
    }
    if (partial.checkUpdates !== undefined) {
      this.prefs.checkUpdates = partial.checkUpdates;
    }
  }

  /** Reset all preferences to defaults. */
  reset(): void {
    this.prefs = { ...DEFAULT_PREFERENCES, recentFiles: [...DEFAULT_PREFERENCES.recentFiles] };
  }

  /**
   * Add a file path to the recent files list.
   * Moves existing entries to the front (MRU order).
   * Trims the list to `maxRecentFiles`.
   */
  addRecentFile(filePath: string): void {
    const idx = this.prefs.recentFiles.indexOf(filePath);
    if (idx !== -1) {
      this.prefs.recentFiles.splice(idx, 1);
    }
    this.prefs.recentFiles.unshift(filePath);
    if (this.prefs.recentFiles.length > this.prefs.maxRecentFiles) {
      this.prefs.recentFiles.length = this.prefs.maxRecentFiles;
    }
  }

  /** Get a copy of the recent files list in MRU order. */
  getRecentFiles(): readonly string[] {
    return [...this.prefs.recentFiles];
  }
}

// ─────────────────────────────────────────────
// DemoRegistry — Demo launcher definitions
// ─────────────────────────────────────────────

/** A registered demo available in the launcher. */
export interface DemoEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly domain: string;
  readonly seedCount: number;
}

/** Built-in demo entries. */
export const DEMOS: readonly DemoEntry[] = [
  {
    id: 'dragons-lair',
    name: "Dragon's Lair",
    description: 'A fire-breathing dragon ecosystem with evolving behavior, terrain, and prey dynamics.',
    domain: 'organism',
    seedCount: 24,
  },
  {
    id: 'ocean-ecosystem',
    name: 'Ocean Ecosystem',
    description: 'Deep-sea biodiversity simulation with bioluminescent creatures and coral networks.',
    domain: 'ecosystem',
    seedCount: 48,
  },
  {
    id: 'cyberpunk-city',
    name: 'Cyberpunk City',
    description: 'Procedurally generated neon-lit metropolis with AI-driven traffic and citizen agents.',
    domain: 'city',
    seedCount: 120,
  },
  {
    id: 'enchanted-forest',
    name: 'Enchanted Forest',
    description: 'Magical woodland with evolving plant species, enchanted wildlife, and seasonal cycles.',
    domain: 'plant',
    seedCount: 64,
  },
  {
    id: 'space-station',
    name: 'Space Station',
    description: 'Orbital habitat with life-support ecosystems, crew scheduling, and structural integrity.',
    domain: 'simulation',
    seedCount: 36,
  },
] as const;

/** Index of demos by ID for O(1) lookup. */
const demoIndex: ReadonlyMap<string, DemoEntry> = new Map(
  DEMOS.map((d) => [d.id, d]),
);

/**
 * Look up a demo by its unique ID.
 * @returns The demo entry, or undefined if not found.
 */
export function getDemoById(id: string): DemoEntry | undefined {
  return demoIndex.get(id);
}

// ─────────────────────────────────────────────
// SystemInfo — Platform information
// ─────────────────────────────────────────────

/** Supported Electron target platforms. */
export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

/** Application and platform information. */
export interface SystemInfo {
  readonly appVersion: string;
  readonly platform: DesktopPlatform;
  readonly nodeVersion?: string;
}

/** Current application version. */
const APP_VERSION = '1.0.0';

// ─────────────────────────────────────────────
// DesktopEngine — Top-level entry point
// ─────────────────────────────────────────────

/**
 * Top-level desktop engine that aggregates all configuration, lifecycle,
 * preferences, and demo registry into a single facade.
 *
 * Consumers (the real Electron main process) instantiate this to access
 * all desktop-layer logic without importing individual pieces.
 */
export class DesktopEngine {
  /** Application lifecycle state machine. */
  readonly lifecycle: AppLifecycle;

  /** User preferences manager. */
  readonly preferences: PreferencesManager;

  /** Full application menu template. */
  readonly menuTemplate: readonly MenuItem[];

  /** Registered IPC handlers. */
  readonly handlers: readonly IPCHandler[];

  /** Available demo entries. */
  readonly demos: readonly DemoEntry[];

  constructor(initialPreferences?: Partial<AppPreferences>) {
    this.lifecycle = new AppLifecycle();
    this.preferences = new PreferencesManager(initialPreferences);
    this.menuTemplate = buildMenuTemplate();
    this.handlers = IPC_HANDLERS;
    this.demos = DEMOS;
  }

  /** Get the main application window configuration. */
  getMainWindowConfig(): WindowConfig {
    return MAIN_WINDOW_CONFIG;
  }

  /** Get the splash screen window configuration. */
  getSplashConfig(): WindowConfig {
    return SPLASH_WINDOW_CONFIG;
  }

  /** Get the default Electron security configuration. */
  getSecurityConfig(): SecurityConfig {
    return DEFAULT_SECURITY;
  }

  /**
   * Get system information.
   * Platform is detected from the `navigator` or defaults to 'linux'.
   * In a real Electron environment, `process.platform` would be used instead.
   */
  getSystemInfo(): SystemInfo {
    return {
      appVersion: APP_VERSION,
      platform: detectPlatform(),
      nodeVersion: undefined,
    };
  }

  /**
   * Look up an IPC handler by channel name.
   * Delegates to the module-level getHandler function.
   */
  getHandler(channel: string): IPCHandler | undefined {
    return getHandler(channel);
  }

  /**
   * Validate whether a channel name is registered.
   * Delegates to the module-level validateChannel function.
   */
  validateChannel(channel: string): boolean {
    return validateChannel(channel);
  }

  /**
   * Look up a demo by ID.
   * Delegates to the module-level getDemoById function.
   */
  getDemoById(id: string): DemoEntry | undefined {
    return getDemoById(id);
  }

  /**
   * Compute a deterministic hash for the current engine configuration.
   * Useful for cache-busting or configuration fingerprinting.
   */
  getConfigHash(): string {
    return computeQuickHash({
      version: APP_VERSION,
      security: DEFAULT_SECURITY,
      mainWindow: MAIN_WINDOW_CONFIG,
      handlerCount: IPC_HANDLERS.length,
      demoCount: DEMOS.length,
    });
  }
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Detect the current platform without relying on Node.js APIs.
 * Returns 'win32', 'darwin', or 'linux'. Defaults to 'linux' if
 * platform detection is unavailable (pure TypeScript environment).
 */
function detectPlatform(): DesktopPlatform {
  // In a real Electron environment this would use process.platform.
  // Here we return a safe default since this is a pure-TS config module.
  return 'linux';
}
