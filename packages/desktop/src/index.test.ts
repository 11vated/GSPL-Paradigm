import { describe, it, expect } from 'vitest';
import {
  MAIN_WINDOW_CONFIG, SPLASH_WINDOW_CONFIG, DEMO_WINDOW_CONFIG,
  DEFAULT_SECURITY, CSP_HEADER, buildMenuTemplate,
  IPC_HANDLERS, getHandler, validateChannel,
  AppLifecycle, DEFAULT_CHILD_CONFIG, HealthChecker,
  DEFAULT_PREFERENCES, PreferencesManager,
  DEMOS, getDemoById, DesktopEngine,
} from './index.js';

describe('MAIN_WINDOW_CONFIG', () => {
  it('dimensions', () => { expect(MAIN_WINDOW_CONFIG.width).toBe(1400); expect(MAIN_WINDOW_CONFIG.height).toBe(900); expect(MAIN_WINDOW_CONFIG.minWidth).toBe(1024); });
  it('dark bg', () => expect(MAIN_WINDOW_CONFIG.backgroundColor).toBe('#0a0e1a'));
  it('frame', () => { expect(MAIN_WINDOW_CONFIG.frame).toBe(true); expect(MAIN_WINDOW_CONFIG.transparent).toBe(false); });
  it('title', () => expect(MAIN_WINDOW_CONFIG.title).toContain('GSPL Paradigm'));
});

describe('SPLASH_WINDOW_CONFIG', () => {
  it('dims', () => { expect(SPLASH_WINDOW_CONFIG.width).toBe(500); expect(SPLASH_WINDOW_CONFIG.height).toBe(400); });
  it('frameless/transparent', () => { expect(SPLASH_WINDOW_CONFIG.frame).toBe(false); expect(SPLASH_WINDOW_CONFIG.transparent).toBe(true); });
  it('vibrancy', () => expect(SPLASH_WINDOW_CONFIG.vibrancy).toBe('under-window'));
});

describe('DEMO_WINDOW_CONFIG', () => {
  it('dims', () => { expect(DEMO_WINDOW_CONFIG.width).toBe(1200); expect(DEMO_WINDOW_CONFIG.height).toBe(800); });
  it('frame', () => expect(DEMO_WINDOW_CONFIG.frame).toBe(true));
});

describe('DEFAULT_SECURITY', () => {
  it('nodeIntegration off', () => expect(DEFAULT_SECURITY.nodeIntegration).toBe(false));
  it('contextIsolation on', () => expect(DEFAULT_SECURITY.contextIsolation).toBe(true));
  it('sandbox on', () => expect(DEFAULT_SECURITY.sandbox).toBe(true));
  it('webSecurity on', () => expect(DEFAULT_SECURITY.webSecurity).toBe(true));
});

describe('CSP_HEADER', () => {
  it('default-src self', () => expect(CSP_HEADER).toContain("default-src 'self'"));
  it('script-src self', () => expect(CSP_HEADER).toContain("script-src 'self'"));
  it('unsafe-inline', () => expect(CSP_HEADER).toContain("'unsafe-inline'"));
  it('data URIs', () => expect(CSP_HEADER).toContain('data:'));
  it('object-src none', () => expect(CSP_HEADER).toContain("object-src 'none'"));
  it('frame-ancestors none', () => expect(CSP_HEADER).toContain("frame-ancestors 'none'"));
  it('localhost connect', () => expect(CSP_HEADER).toContain('localhost:11420'));
});

describe('buildMenuTemplate', () => {
  it('7 menus', () => expect(buildMenuTemplate().length).toBe(7));
  it('fresh copy', () => expect(buildMenuTemplate()).not.toBe(buildMenuTemplate()));
  it('labels', () => expect(buildMenuTemplate().map(m => m.label)).toEqual(['File', 'Edit', 'View', 'Seeds', 'Evolution', 'Tools', 'Help']));
  it('File has items', () => expect(buildMenuTemplate()[0]!.submenu!.length).toBeGreaterThan(5));
  it('Quit', () => { const q = buildMenuTemplate()[0]!.submenu!.find(i => i.label === 'Quit'); expect(q!.role).toBe('quit'); });
  it('Undo role', () => expect(buildMenuTemplate()[1]!.submenu!.find(i => i.label === 'Undo')!.role).toBe('undo'));
  it('Evolution items', () => { const labels = buildMenuTemplate()[4]!.submenu!.map(i => i.label); expect(labels).toContain('Start Evolution'); });
  it('separators', () => expect(buildMenuTemplate()[0]!.submenu!.filter(i => i.separator).length).toBeGreaterThan(0));
  it('Help About', () => expect(buildMenuTemplate()[6]!.submenu!.some(i => i.label === 'About GSPL Paradigm')).toBe(true));
  it('Seeds Create', () => expect(buildMenuTemplate()[3]!.submenu!.some(i => i.label === 'Create Seed...')).toBe(true));
});

describe('IPC_HANDLERS', () => {
  it('count', () => expect(IPC_HANDLERS.length).toBe(23));
  it('shape', () => { for (const h of IPC_HANDLERS) { expect(typeof h.channel).toBe('string'); expect(typeof h.requiresAuth).toBe('boolean'); } });
  it('unique channels', () => expect(new Set(IPC_HANDLERS.map(h => h.channel)).size).toBe(23));
  it('auth channels', () => expect(IPC_HANDLERS.filter(h => h.requiresAuth).some(h => h.channel === 'launch-cli')).toBe(true));
});

describe('getHandler', () => {
  it('finds', () => expect(getHandler('system-info')!.channel).toBe('system-info'));
  it('undefined', () => expect(getHandler('nope')).toBeUndefined());
});

describe('validateChannel', () => {
  it('valid', () => expect(validateChannel('seed-create')).toBe(true));
  it('invalid', () => expect(validateChannel('nope')).toBe(false));
  it('case-sensitive', () => expect(validateChannel('System-Info')).toBe(false));
});

describe('AppLifecycle', () => {
  it('starts initializing', () => expect(new AppLifecycle().getState()).toBe('initializing'));
  it('valid path', () => {
    const lc = new AppLifecycle();
    expect(lc.transition('splash')).toBe(true);
    expect(lc.transition('loading')).toBe(true);
    expect(lc.transition('ready')).toBe(true);
    expect(lc.transition('quitting')).toBe(true);
  });
  it('rejects invalid', () => { const lc = new AppLifecycle(); expect(lc.transition('ready')).toBe(false); });
  it('quitting from any', () => {
    const states = [['splash'], ['splash', 'loading'], ['splash', 'loading', 'ready'], ['splash', 'loading', 'error']] as const;
    for (const path of states) { const lc = new AppLifecycle(); for (const s of path) lc.transition(s as 'splash'|'loading'|'ready'|'error'); expect(lc.transition('quitting')).toBe(true); }
    expect(new AppLifecycle().transition('quitting')).toBe(true);
  });
  it('quitting is terminal', () => { const lc = new AppLifecycle(); lc.transition('quitting'); expect(lc.transition('initializing')).toBe(false); });
  it('loading->error', () => { const lc = new AppLifecycle(); lc.transition('splash'); lc.transition('loading'); expect(lc.transition('error')).toBe(true); });
  it('ready->error', () => { const lc = new AppLifecycle(); lc.transition('splash'); lc.transition('loading'); lc.transition('ready'); expect(lc.transition('error')).toBe(true); });
  it('error->quitting only', () => { const lc = new AppLifecycle(); lc.transition('splash'); lc.transition('loading'); lc.transition('error'); expect(lc.transition('ready')).toBe(false); expect(lc.transition('quitting')).toBe(true); });
  it('notifies', () => { const lc = new AppLifecycle(); const t: string[] = []; lc.onStateChange((f, to) => t.push(`${f}->${to}`)); lc.transition('splash'); expect(t).toEqual(['initializing->splash']); });
  it('unsub', () => { const lc = new AppLifecycle(); let c = 0; const u = lc.onStateChange(() => c++); lc.transition('splash'); u(); lc.transition('loading'); expect(c).toBe(1); });
  it('getUptime', () => expect(new AppLifecycle().getUptime()).toBeGreaterThanOrEqual(0));
});

describe('DEFAULT_CHILD_CONFIG', () => {
  it('port', () => expect(DEFAULT_CHILD_CONFIG.port).toBe(11420));
  it('command', () => expect(DEFAULT_CHILD_CONFIG.command).toBe('node'));
  it('retries', () => expect(DEFAULT_CHILD_CONFIG.maxRetries).toBe(15));
});

describe('HealthChecker', () => {
  it('starts unhealthy', () => expect(new HealthChecker().isHealthy()).toBe(false));
  it('healthy after 3', () => { const hc = new HealthChecker(); hc.check('http://l/h'); hc.check('http://l/h'); expect(hc.check('http://l/h').healthy).toBe(true); });
  it('custom threshold', () => expect(new HealthChecker(1).check('http://l/h').healthy).toBe(true));
  it('invalid URL', () => expect(new HealthChecker(1).check('ftp://x').error).toContain('Invalid URL'));
  it('latency', () => expect(new HealthChecker(1).check('http://l/h').latency).toBeGreaterThan(0));
  it('unhealthy error msg', () => expect(new HealthChecker(5).check('http://l/h').error).toContain('not ready'));
  it('reset', () => { const hc = new HealthChecker(1); hc.check('http://l/h'); hc.reset(); expect(hc.isHealthy()).toBe(false); });
  it('latency capped', () => expect(new HealthChecker(1).check('http://l/h', 5).latency).toBeLessThanOrEqual(5));
  it('stays healthy', () => { const hc = new HealthChecker(1); hc.check('http://l/h'); hc.check('http://l/h'); hc.check('http://l/h'); expect(hc.isHealthy()).toBe(true); });
});

describe('DEFAULT_PREFERENCES', () => {
  it('theme', () => expect(DEFAULT_PREFERENCES.theme).toBe('dark'));
  it('fontSize', () => expect(DEFAULT_PREFERENCES.fontSize).toBe(14));
  it('autoSave', () => expect(DEFAULT_PREFERENCES.autoSave).toBe(true));
  it('empty recent', () => expect(DEFAULT_PREFERENCES.recentFiles).toEqual([]));
});

describe('PreferencesManager', () => {
  it('defaults', () => expect(new PreferencesManager().get().theme).toBe('dark'));
  it('initial override', () => expect(new PreferencesManager({ theme: 'light' }).get().theme).toBe('light'));
  it('deep copy', () => { const pm = new PreferencesManager(); expect(pm.get()).not.toBe(pm.get()); });
  it('set partial', () => { const pm = new PreferencesManager(); pm.set({ theme: 'light' }); expect(pm.get().theme).toBe('light'); expect(pm.get().fontSize).toBe(14); });
  it('set all fields', () => {
    const pm = new PreferencesManager();
    pm.set({ theme: 'light', fontSize: 18, autoSave: false, autoSaveInterval: 60000, recentFiles: ['a'], maxRecentFiles: 5, showSplash: false, checkUpdates: false, windowBounds: { x: 0, y: 0, width: 800, height: 600 } });
    const p = pm.get(); expect(p.theme).toBe('light'); expect(p.fontSize).toBe(18); expect(p.windowBounds!.width).toBe(800);
  });
  it('set windowBounds keeps value when set to undefined (no-op)', () => { const pm = new PreferencesManager({ windowBounds: { x: 0, y: 0, width: 1, height: 1 } }); pm.set({ windowBounds: undefined }); expect(pm.get().windowBounds).toBeDefined(); });
  it('reset', () => { const pm = new PreferencesManager(); pm.set({ theme: 'light' }); pm.reset(); expect(pm.get().theme).toBe('dark'); });
  it('addRecentFile MRU', () => { const pm = new PreferencesManager(); pm.addRecentFile('a'); pm.addRecentFile('b'); expect(pm.getRecentFiles()).toEqual(['b', 'a']); });
  it('addRecentFile dedup', () => { const pm = new PreferencesManager(); pm.addRecentFile('a'); pm.addRecentFile('b'); pm.addRecentFile('a'); expect(pm.getRecentFiles()).toEqual(['a', 'b']); });
  it('addRecentFile trims', () => { const pm = new PreferencesManager({ maxRecentFiles: 3 }); for (let i = 0; i < 5; i++) pm.addRecentFile(`f${i}`); expect(pm.getRecentFiles().length).toBe(3); });
  it('getRecentFiles copy', () => { const pm = new PreferencesManager(); pm.addRecentFile('x'); expect(pm.getRecentFiles()).not.toBe(pm.getRecentFiles()); });
});

describe('DEMOS', () => {
  it('5 demos', () => expect(DEMOS.length).toBe(5));
  it('fields', () => { for (const d of DEMOS) { expect(d.id).toBeTruthy(); expect(d.seedCount).toBeGreaterThan(0); } });
  it('unique IDs', () => expect(new Set(DEMOS.map(d => d.id)).size).toBe(5));
});

describe('getDemoById', () => {
  it('finds', () => expect(getDemoById('dragons-lair')!.name).toBe("Dragon's Lair"));
  it('undefined', () => expect(getDemoById('nope')).toBeUndefined());
  it('case-sensitive', () => expect(getDemoById('Dragons-Lair')).toBeUndefined());
});

describe('DesktopEngine', () => {
  it('constructs', () => { const e = new DesktopEngine(); expect(e.lifecycle.getState()).toBe('initializing'); expect(e.handlers.length).toBe(23); expect(e.demos.length).toBe(5); });
  it('initial prefs', () => expect(new DesktopEngine({ theme: 'light' }).preferences.get().theme).toBe('light'));
  it('getMainWindowConfig', () => expect(new DesktopEngine().getMainWindowConfig()).toBe(MAIN_WINDOW_CONFIG));
  it('getSplashConfig', () => expect(new DesktopEngine().getSplashConfig()).toBe(SPLASH_WINDOW_CONFIG));
  it('getSecurityConfig', () => expect(new DesktopEngine().getSecurityConfig()).toBe(DEFAULT_SECURITY));
  it('getSystemInfo', () => { const i = new DesktopEngine().getSystemInfo(); expect(i.appVersion).toBe('1.0.0'); expect(['win32', 'darwin', 'linux']).toContain(i.platform); });
  it('getHandler delegate', () => { expect(new DesktopEngine().getHandler('system-info')).toBeDefined(); expect(new DesktopEngine().getHandler('x')).toBeUndefined(); });
  it('validateChannel delegate', () => { expect(new DesktopEngine().validateChannel('seed-create')).toBe(true); expect(new DesktopEngine().validateChannel('x')).toBe(false); });
  it('getDemoById delegate', () => { expect(new DesktopEngine().getDemoById('ocean-ecosystem')).toBeDefined(); expect(new DesktopEngine().getDemoById('x')).toBeUndefined(); });
  it('getConfigHash deterministic', () => expect(new DesktopEngine().getConfigHash()).toBe(new DesktopEngine().getConfigHash()));
  it('getConfigHash string', () => expect(typeof new DesktopEngine().getConfigHash()).toBe('string'));
});
