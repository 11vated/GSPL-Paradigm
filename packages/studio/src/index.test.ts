import { describe, it, expect, vi } from 'vitest';
import {
  DARK_THEME, DOMAIN_COLORS, getDomainColor, Store, WorldStore, UIStore,
  EvolutionStore, AgentStore, APIClient, API_ROUTES, parseSSE, formatSSE,
  SSE_EVENTS, ElectronBridge, PANELS, getPanelById, StudioEngine,
} from './index.js';
import type { UniversalSeed } from '@paradigm/types';

function makeSeed(name: string, hash: string, domain = 'organism'): UniversalSeed {
  return {
    $gst: '4.0', $name: name, $domain: domain as UniversalSeed['$domain'], $hash: hash,
    $lineage: { generation: 1, parents: [], ancestry: [] },
    $metadata: { createdAt: Date.now(), version: 1 }, genes: {},
  } as UniversalSeed;
}

describe('DARK_THEME', () => {
  it('has deep space background', () => expect(DARK_THEME.background).toBe('#0a0e1a'));
  it('has bioluminescent accent', () => expect(DARK_THEME.accent).toBe('#00f0ff'));
  it('has all keys', () => {
    for (const k of ['background', 'surface', 'surfaceHover', 'text', 'textMuted', 'accent',
      'accentHover', 'success', 'warning', 'error', 'border', 'shadow', 'fontMono', 'fontSans',
      'fontSerif', 'radiusSm', 'radiusMd', 'radiusLg', 'spacingSm', 'spacingMd', 'spacingLg'])
      expect(DARK_THEME).toHaveProperty(k);
  });
});

describe('getDomainColor', () => {
  it('returns mapped for known', () => {
    expect(getDomainColor('organism')).toBe('#10b981');
    expect(getDomainColor('weapon')).toBe('#ef4444');
  });
  it('returns hsl for unknown', () => expect(getDomainColor('zzz-unknown')).toMatch(/^hsl\(\d+, 70%, 55%\)$/));
  it('is deterministic', () => expect(getDomainColor('xyz')).toBe(getDomainColor('xyz')));
  it('differs for different unknowns', () => expect(getDomainColor('aaa')).not.toBe(getDomainColor('bbb')));
  it('covers all DOMAIN_COLORS', () => {
    for (const [d, e] of Object.entries(DOMAIN_COLORS)) expect(getDomainColor(d)).toBe(e);
  });
});

describe('Store', () => {
  it('returns initial state', () => expect(new Store({ count: 0 }).getState()).toEqual({ count: 0 }));
  it('setState partial', () => { const s = new Store({ a: 1, b: 2 }); s.setState({ a: 10 }); expect(s.getState()).toEqual({ a: 10, b: 2 }); });
  it('setState updater', () => { const s = new Store({ x: 5 }); s.setState(p => ({ x: p.x + 1 })); expect(s.getState().x).toBe(6); });
  it('notifies listeners', () => { const s = new Store({ v: 0 }); const c: number[] = []; s.subscribe(st => c.push(st.v)); s.setState({ v: 42 }); expect(c).toEqual([42]); });
  it('unsubscribe', () => { const s = new Store({ v: 0 }); const c: number[] = []; const u = s.subscribe(st => c.push(st.v)); s.setState({ v: 1 }); u(); s.setState({ v: 2 }); expect(c).toEqual([1]); });
  it('reset', () => { const s = new Store({ x: 0 }); s.setState({ x: 99 }); s.reset(); expect(s.getState().x).toBe(0); });
  it('reset notifies', () => { const s = new Store({ x: 0 }); let c = false; s.subscribe(() => { c = true; }); s.reset(); expect(c).toBe(true); });
  it('listenerCount', () => { const s = new Store({ x: 0 }); const u = s.subscribe(() => {}); expect(s.listenerCount).toBe(1); u(); expect(s.listenerCount).toBe(0); });
  it('getState copy', () => { const s = new Store({ x: 1 }); expect(s.getState()).not.toBe(s.getState()); });
  it('listener error setState', () => { const s = new Store({ x: 0 }); const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); s.subscribe(() => { throw new Error('x'); }); s.setState({ x: 1 }); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
  it('listener error reset', () => { const s = new Store({ x: 0 }); const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); s.subscribe(() => { throw new Error('x'); }); s.reset(); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
});

describe('WorldStore', () => {
  it('starts empty', () => { const ws = new WorldStore(); expect(ws.getSeedCount()).toBe(0); expect(ws.getState().selectedSeedHash).toBeNull(); expect(ws.getState().worldName).toBe('Untitled World'); });
  it('addSeed', () => { const ws = new WorldStore(); ws.addSeed(makeSeed('A', 'h1')); expect(ws.getSeedCount()).toBe(1); });
  it('removeSeed deselects', () => { const ws = new WorldStore(); ws.addSeed(makeSeed('A', 'h1')); ws.selectSeed('h1'); ws.removeSeed('h1'); expect(ws.getState().selectedSeedHash).toBeNull(); });
  it('selectSeed + getSelectedSeed', () => { const ws = new WorldStore(); const s = makeSeed('A', 'h1'); ws.addSeed(s); ws.selectSeed('h1'); expect(ws.getSelectedSeed()).toBe(s); });
  it('getSelectedSeed undefined', () => expect(new WorldStore().getSelectedSeed()).toBeUndefined());
  it('setWorldName', () => { const ws = new WorldStore(); ws.setWorldName('X'); expect(ws.getState().worldName).toBe('X'); });
  it('incrementGeneration', () => { const ws = new WorldStore(); ws.incrementGeneration(); ws.incrementGeneration(); expect(ws.getState().generation).toBe(2); });
  it('clearWorld', () => { const ws = new WorldStore(); ws.addSeed(makeSeed('A', 'h1')); ws.selectSeed('h1'); ws.incrementGeneration(); ws.clearWorld(); expect(ws.getSeedCount()).toBe(0); expect(ws.getState().generation).toBe(0); });
  it('reset', () => { const ws = new WorldStore(); ws.setWorldName('C'); ws.addSeed(makeSeed('A', 'h1')); ws.reset(); expect(ws.getState().worldName).toBe('Untitled World'); });
  it('subscribe/unsub', () => { const ws = new WorldStore(); let c = 0; const u = ws.subscribe(() => c++); ws.addSeed(makeSeed('A', 'h1')); u(); ws.addSeed(makeSeed('B', 'h2')); expect(c).toBe(1); });
  it('listener error', () => { const ws = new WorldStore(); const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); ws.subscribe(() => { throw new Error('x'); }); ws.addSeed(makeSeed('A', 'h1')); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
  it('removeSeed keeps other selection', () => { const ws = new WorldStore(); ws.addSeed(makeSeed('A', 'h1')); ws.addSeed(makeSeed('B', 'h2')); ws.selectSeed('h2'); ws.removeSeed('h1'); expect(ws.getState().selectedSeedHash).toBe('h2'); });
});

describe('UIStore', () => {
  it('defaults', () => { const ui = new UIStore(); expect(ui.getState().activePanel).toBe('overview'); expect(ui.getState().sidebarOpen).toBe(true); });
  it('setActivePanel', () => { const ui = new UIStore(); ui.setActivePanel('forge'); expect(ui.getState().activePanel).toBe('forge'); });
  it('toggleSidebar', () => { const ui = new UIStore(); ui.toggleSidebar(); expect(ui.getState().sidebarOpen).toBe(false); ui.toggleSidebar(); expect(ui.getState().sidebarOpen).toBe(true); });
  it('addNotification', () => { const ui = new UIStore(); const id = ui.addNotification('Hi', 'info'); expect(typeof id).toBe('string'); expect(ui.getState().notifications.length).toBe(1); });
  it('removeNotification', () => { const ui = new UIStore(); const id = ui.addNotification('X', 'info'); ui.removeNotification(id); expect(ui.getState().notifications.length).toBe(0); });
  it('clearNotifications', () => { const ui = new UIStore(); ui.addNotification('A', 'info'); ui.addNotification('B', 'warning'); ui.clearNotifications(); expect(ui.getState().notifications.length).toBe(0); });
  it('reset', () => { const ui = new UIStore(); ui.setActivePanel('forge'); ui.toggleSidebar(); ui.addNotification('X', 'error'); ui.reset(); expect(ui.getState().activePanel).toBe('overview'); expect(ui.getState().sidebarOpen).toBe(true); });
  it('subscribe/unsub', () => { const ui = new UIStore(); let c = 0; const u = ui.subscribe(() => c++); ui.setActivePanel('x'); u(); ui.setActivePanel('y'); expect(c).toBe(1); });
  it('listener error', () => { const ui = new UIStore(); const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); ui.subscribe(() => { throw new Error('x'); }); ui.setActivePanel('x'); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
  it('custom theme', () => expect(new UIStore({ ...DARK_THEME, background: '#fff' }).getState().theme.background).toBe('#fff'));
});

describe('EvolutionStore', () => {
  it('defaults', () => { const es = new EvolutionStore(); expect(es.getState().running).toBe(false); expect(es.getState().config.selectionStrategy).toBe('tournament'); });
  it('start/stop', () => { const es = new EvolutionStore(); es.start({ mutationRate: 0.1 }); expect(es.getState().running).toBe(true); es.stop(); expect(es.getState().running).toBe(false); });
  it('recordGeneration', () => { const es = new EvolutionStore(); es.recordGeneration(1, 0.8, 0.4); es.recordGeneration(2, 0.9, 0.5); expect(es.getState().generation).toBe(2); expect(es.getState().fitnessHistory.length).toBe(2); });
  it('reset', () => { const es = new EvolutionStore(); es.start({ eliteCount: 5 }); es.recordGeneration(1, 1, 1); es.reset(); expect(es.getState().config.eliteCount).toBe(2); });
  it('updateConfig', () => { const es = new EvolutionStore(); es.updateConfig({ crossoverRate: 0.9 }); expect(es.getState().config.crossoverRate).toBe(0.9); });
  it('subscribe/unsub', () => { const es = new EvolutionStore(); let c = 0; const u = es.subscribe(() => c++); es.start({}); u(); es.stop(); expect(c).toBe(1); });
  it('listener error', () => { const es = new EvolutionStore(); const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); es.subscribe(() => { throw new Error('x'); }); es.start({}); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
});

describe('AgentStore', () => {
  it('starts empty', () => { const a = new AgentStore(); expect(a.getState().messages).toEqual([]); expect(a.getState().thinking).toBe(false); });
  it('addMessage', () => { const a = new AgentStore(); const id = a.addMessage('user', 'hi'); expect(typeof id).toBe('string'); expect(a.getState().messages.length).toBe(1); });
  it('setThinking', () => { const a = new AgentStore(); a.setThinking(true); expect(a.getState().thinking).toBe(true); });
  it('addPendingAction/remove', () => { const a = new AgentStore(); a.addPendingAction('x'); a.addPendingAction('y'); a.removePendingAction('x'); expect(a.getState().pendingActions).toEqual(['y']); });
  it('removePendingAction first only', () => { const a = new AgentStore(); a.addPendingAction('x'); a.addPendingAction('x'); a.removePendingAction('x'); expect(a.getState().pendingActions).toEqual(['x']); });
  it('removePendingAction no-op', () => { const a = new AgentStore(); a.addPendingAction('a'); a.removePendingAction('b'); expect(a.getState().pendingActions).toEqual(['a']); });
  it('clearHistory/reset', () => { const a = new AgentStore(); a.addMessage('user', 'hi'); a.setThinking(true); a.clearHistory(); expect(a.getState().messages).toEqual([]); a.addMessage('a', 'r'); a.reset(); expect(a.getState().messages).toEqual([]); });
  it('subscribe/unsub', () => { const a = new AgentStore(); let c = 0; const u = a.subscribe(() => c++); a.addMessage('user', 'hi'); u(); a.addMessage('user', 'bye'); expect(c).toBe(1); });
  it('listener error', () => { const a = new AgentStore(); const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); a.subscribe(() => { throw new Error('x'); }); a.addMessage('user', 't'); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
});

describe('APIClient', () => {
  it('builds request', () => { const c = new APIClient('http://localhost:5001'); const r = c.buildRequest('GET', '/api/seeds'); expect(r.path).toBe('http://localhost:5001/api/seeds'); });
  it('builds with body', () => expect(new APIClient().buildRequest('POST', '/c', { n: 1 }).body).toEqual({ n: 1 }));
  it('normalizes baseUrl slash', () => expect(new APIClient('http://h/').buildRequest('GET', '/p').path).toBe('http://h/p'));
  it('normalizes path', () => expect(new APIClient('http://h').buildRequest('GET', 'p').path).toBe('http://h/p'));
  it('parseResponse ok', () => { const r = new APIClient().parseResponse(200, { ok: true }); expect(r.error).toBeUndefined(); });
  it('parseResponse error', () => expect(new APIClient().parseResponse(400, { error: 'bad' }).error).toBe('bad'));
  it('parseResponse error no field', () => expect(new APIClient().parseResponse(500, 'x').error).toContain('500'));
  it('setHeader/removeHeader', () => { const c = new APIClient(); c.setHeader('X', 'v'); expect(c.buildRequest('GET', '/').headers!['X']).toBe('v'); c.removeHeader('X'); expect(c.buildRequest('GET', '/').headers!['X']).toBeUndefined(); });
  it('API_ROUTES', () => expect(API_ROUTES.SEEDS_LIST).toBe('/api/seeds'));
});

describe('parseSSE', () => {
  it('simple', () => { const e = parseSSE('event: seed.created\ndata: {"id":1}\n\n'); expect(e[0]!.type).toBe('seed.created'); });
  it('multiple', () => expect(parseSSE('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n').length).toBe(2));
  it('id/retry', () => { const e = parseSSE('event: t\ndata: x\nid: 42\nretry: 3000\n\n'); expect(e[0]!.id).toBe('42'); expect(e[0]!.retry).toBe(3000); });
  it('comments', () => expect(parseSSE(':c\nevent: t\ndata: v\n\n')[0]!.type).toBe('t'));
  it('default message', () => expect(parseSSE('data: hi\n\n')[0]!.type).toBe('message'));
  it('empty', () => expect(parseSSE('')).toEqual([]));
  it('multi-line', () => expect(parseSSE('event: x\ndata: a\ndata: b\n\n')[0]!.data).toBe('a\nb'));
  it('invalid retry', () => expect(parseSSE('event: x\ndata: y\nretry: abc\n\n')[0]!.retry).toBeUndefined());
});

describe('formatSSE', () => {
  it('with type', () => { const r = formatSSE({ type: 'seed.created', data: '{}' }); expect(r).toContain('event: seed.created'); expect(r.endsWith('\n\n')).toBe(true); });
  it('message omits event', () => expect(formatSSE({ type: 'message', data: 'hi' })).not.toContain('event:'));
  it('id/retry', () => { const r = formatSSE({ type: 'x', data: 'y', id: '1', retry: 5000 }); expect(r).toContain('id: 1'); expect(r).toContain('retry: 5000'); });
  it('multi-line', () => expect(formatSSE({ type: 'x', data: 'a\nb' })).toContain('data: a\ndata: b'));
});

describe('SSE_EVENTS', () => {
  it('types', () => { expect(SSE_EVENTS.SEED_CREATED).toBe('seed.created'); expect(SSE_EVENTS.EVOLUTION_TICK).toBe('evolution.tick'); });
});

describe('ElectronBridge', () => {
  it('isElectron false', () => expect(new ElectronBridge().isElectron()).toBe(false));
  it('createRequest with payload', () => { const r = new ElectronBridge().createRequest('seed-create', { n: 1 }); expect(r.channel).toBe('seed-create'); expect(r.payload).toEqual({ n: 1 }); });
  it('createRequest without payload', () => expect(new ElectronBridge().createRequest('system-info').payload).toBeUndefined());
  it('parseResponse success', () => expect(new ElectronBridge().parseResponse({ success: true, data: 'ok' }).success).toBe(true));
  it('parseResponse error', () => { const r = new ElectronBridge().parseResponse({ success: false, error: 'x' }); expect(r.error).toBe('x'); });
  it('parseResponse null', () => expect(new ElectronBridge().parseResponse(null).success).toBe(false));
  it('parseResponse non-object', () => expect(new ElectronBridge().parseResponse('str').success).toBe(false));
  it('parseResponse missing success', () => expect(new ElectronBridge().parseResponse({ data: 1 }).error).toContain('missing success'));
});

describe('PANELS', () => {
  it('has 12', () => expect(PANELS.length).toBe(12));
  it('all valid', () => { for (const p of PANELS) { expect(p.id).toBeTruthy(); expect(p.name).toBeTruthy(); expect(p.icon).toBeTruthy(); } });
  it('unique IDs', () => expect(new Set(PANELS.map(p => p.id)).size).toBe(12));
});

describe('getPanelById', () => {
  it('finds', () => expect(getPanelById('overview')!.name).toBe('Overview'));
  it('undefined', () => expect(getPanelById('nope')).toBeUndefined());
});

describe('StudioEngine', () => {
  it('defaults', () => { const e = new StudioEngine(); expect(e.theme).toBe(DARK_THEME); expect(e.panels.length).toBe(12); });
  it('custom baseUrl', () => expect(new StudioEngine({ baseUrl: 'http://t:3000' }).api.baseUrl).toBe('http://t:3000'));
  it('getSnapshot', () => { const s = new StudioEngine().getSnapshot(); expect(s.worldName).toBe('Untitled World'); expect(s.isElectron).toBe(false); });
  it('snapshot changes', () => {
    const e = new StudioEngine(); e.world.addSeed(makeSeed('A', 'h1')); e.ui.setActivePanel('forge');
    e.evolution.start({}); e.agent.addMessage('user', 'hi'); e.agent.setThinking(true);
    const s = e.getSnapshot(); expect(s.seedCount).toBe(1); expect(s.activePanel).toBe('forge');
    expect(s.evolutionRunning).toBe(true); expect(s.agentThinking).toBe(true);
  });
  it('all stores', () => {
    const e = new StudioEngine(); expect(e.world).toBeInstanceOf(WorldStore);
    expect(e.ui).toBeInstanceOf(UIStore); expect(e.evolution).toBeInstanceOf(EvolutionStore);
    expect(e.agent).toBeInstanceOf(AgentStore); expect(e.api).toBeInstanceOf(APIClient);
    expect(e.bridge).toBeInstanceOf(ElectronBridge);
  });
});
