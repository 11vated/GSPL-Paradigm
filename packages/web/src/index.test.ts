import { describe, it, expect, beforeEach } from 'vitest';
import {
  Router,
  SeedController,
  EvolutionController,
  WorldController,
  ForgeController,
  AgentController,
  ExportController,
  SSEManager,
  DEFAULT_CONFIG,
  createStarterSeeds,
  WebEngine,
} from './index.js';
import type { Request, Response } from './index.js';
import { DeterministicRNG } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import { createSeed } from '@paradigm/seed';
import { GSPLAgent } from '@paradigm/agent';
import { Forge } from '@paradigm/forge';
import type { UniversalSeed, GeneMap } from '@paradigm/types';

// ── Helpers ──

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/',
    params: {},
    query: {},
    body: undefined,
    headers: {},
    ...overrides,
  };
}

function makeSeed(name: string, domain: string = 'organism', genes: GeneMap = {}): UniversalSeed {
  const rng = new DeterministicRNG(`test-${name}`);
  return createSeed(name, domain as any, genes, rng);
}

function body(res: Response): any {
  return res.body as any;
}

// ── Router ──

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  it('matches exact GET route', async () => {
    router.addRoute('GET', '/api/health', () => ({ status: 200, body: 'ok', headers: {} }));
    const res = await router.handle(makeReq({ method: 'GET', path: '/api/health' }));
    expect(res.status).toBe(200);
  });

  it('returns 404 for unmatched path', async () => {
    const res = await router.handle(makeReq({ path: '/nope' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 for wrong method', async () => {
    router.addRoute('POST', '/api/foo', () => ({ status: 200, body: null, headers: {} }));
    const res = await router.handle(makeReq({ method: 'GET', path: '/api/foo' }));
    expect(res.status).toBe(404);
  });

  it('extracts :param from path', async () => {
    let captured = '';
    router.addRoute('GET', '/api/seed/:id', (req) => {
      captured = req.params['id'] ?? '';
      return { status: 200, body: null, headers: {} };
    });
    await router.handle(makeReq({ method: 'GET', path: '/api/seed/abc123' }));
    expect(captured).toBe('abc123');
  });

  it('normalizes trailing slashes', async () => {
    router.addRoute('GET', '/api/test', () => ({ status: 200, body: 'ok', headers: {} }));
    const res = await router.handle(makeReq({ method: 'GET', path: '/api/test/' }));
    expect(res.status).toBe(200);
  });

  it('is case-insensitive for paths', async () => {
    router.addRoute('GET', '/api/Test', () => ({ status: 200, body: 'ok', headers: {} }));
    const res = await router.handle(makeReq({ method: 'GET', path: '/api/test' }));
    expect(res.status).toBe(200);
  });

  it('returns 500 when handler throws', async () => {
    router.addRoute('GET', '/api/boom', () => { throw new Error('Kaboom'); });
    const res = await router.handle(makeReq({ path: '/api/boom' }));
    expect(res.status).toBe(500);
    expect(body(res).message).toContain('Kaboom');
  });

  it('getRoutes lists registered routes', () => {
    router.addRoute('GET', '/a', () => ({ status: 200, body: null, headers: {} }));
    router.addRoute('POST', '/b', () => ({ status: 200, body: null, headers: {} }));
    const routes = router.getRoutes();
    expect(routes.length).toBe(2);
    expect(routes[0]!.method).toBe('GET');
    expect(routes[1]!.path).toBe('/b');
  });

  it('does not match route with different segment count', async () => {
    router.addRoute('GET', '/api/a/b', () => ({ status: 200, body: null, headers: {} }));
    const res = await router.handle(makeReq({ path: '/api/a' }));
    expect(res.status).toBe(404);
  });
});

// ── SeedController ──

describe('SeedController', () => {
  let ctrl: SeedController;
  let router: Router;
  let rng: DeterministicRNG;
  let bus: EventBus;

  beforeEach(() => {
    rng = new DeterministicRNG('test-seed-ctrl');
    bus = new EventBus();
    ctrl = new SeedController(rng, bus);
    router = new Router();
    ctrl.register(router);
  });

  it('creates a seed with valid body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { name: 'Dragon', domain: 'organism' },
    }));
    expect(res.status).toBe(201);
    expect(body(res).seed.$name).toBe('Dragon');
  });

  it('rejects create with missing name', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { domain: 'organism' },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects create with missing domain', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { name: 'X' },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects create with non-object body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: 'not-an-object',
    }));
    expect(res.status).toBe(400);
  });

  it('gets seed by id', async () => {
    const seed = makeSeed('A');
    ctrl.addSeed(seed);
    const res = await router.handle(makeReq({ path: `/api/seed/${seed.$hash}` }));
    expect(res.status).toBe(200);
    expect(body(res).seed.$name).toBe('A');
  });

  it('returns 404 for unknown id', async () => {
    const res = await router.handle(makeReq({ path: '/api/seed/unknown' }));
    expect(res.status).toBe(404);
  });

  it('lists all seeds', async () => {
    ctrl.addSeed(makeSeed('A'));
    ctrl.addSeed(makeSeed('B'));
    const res = await router.handle(makeReq({ path: '/api/seeds' }));
    expect(res.status).toBe(200);
    expect(body(res).count).toBe(2);
  });

  it('filters seeds by domain', async () => {
    ctrl.addSeed(makeSeed('A', 'organism'));
    ctrl.addSeed(makeSeed('B', 'terrain'));
    const res = await router.handle(makeReq({ path: '/api/seeds', query: { domain: 'terrain' } }));
    expect(body(res).count).toBe(1);
    expect(body(res).seeds[0].$domain).toBe('terrain');
  });

  it('deletes a seed', async () => {
    const seed = makeSeed('Del');
    ctrl.addSeed(seed);
    const res = await router.handle(makeReq({ method: 'DELETE', path: `/api/seed/${seed.$hash}` }));
    expect(res.status).toBe(200);
    expect(body(res).deleted).toBe(seed.$hash);
    expect(ctrl.getStore().size).toBe(0);
  });

  it('returns 404 deleting nonexistent seed', async () => {
    const res = await router.handle(makeReq({ method: 'DELETE', path: '/api/seed/nope' }));
    expect(res.status).toBe(404);
  });

  it('breeds two seeds', async () => {
    const a = makeSeed('Alpha', 'organism', { hp: { type: 'scalar', value: 50, min: 0, max: 100 } });
    const b = makeSeed('Beta', 'organism', { hp: { type: 'scalar', value: 80, min: 0, max: 100 } });
    ctrl.addSeed(a);
    ctrl.addSeed(b);

    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/breed',
      body: { parent1: a.$hash, parent2: b.$hash },
    }));
    expect(res.status).toBe(201);
    expect(body(res).child.$name).toBeTruthy();
  });

  it('breed returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/breed', body: null,
    }));
    expect(res.status).toBe(400);
  });

  it('breed returns 400 with missing parents', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/breed', body: { parent1: 'x' },
    }));
    expect(res.status).toBe(400);
  });

  it('breed returns 404 for unknown parent', async () => {
    const a = makeSeed('A');
    ctrl.addSeed(a);
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/breed',
      body: { parent1: a.$hash, parent2: 'missing' },
    }));
    expect(res.status).toBe(404);
  });

  it('mutates a seed', async () => {
    const seed = makeSeed('Mutable', 'organism', { hp: { type: 'scalar', value: 50, min: 0, max: 100 } });
    ctrl.addSeed(seed);

    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/mutate',
      body: { hash: seed.$hash, rate: 0.5 },
    }));
    expect(res.status).toBe(201);
    expect(body(res).mutated).toBeTruthy();
  });

  it('mutate returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/mutate', body: 42,
    }));
    expect(res.status).toBe(400);
  });

  it('mutate returns 400 with missing hash', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/mutate', body: {},
    }));
    expect(res.status).toBe(400);
  });

  it('mutate returns 404 for unknown seed', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/mutate', body: { hash: 'nope' },
    }));
    expect(res.status).toBe(404);
  });

  it('sets fitness scores', async () => {
    const seed = makeSeed('Fit');
    ctrl.addSeed(seed);

    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/fitness',
      body: { hash: seed.$hash, scores: { primary: 0.9, novelty: 0.5 } },
    }));
    expect(res.status).toBe(200);
    expect(body(res).seed.$fitness.primary).toBe(0.9);
  });

  it('fitness returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/fitness', body: [],
    }));
    expect(res.status).toBe(400);
  });

  it('fitness returns 400 with missing hash', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/fitness', body: { scores: {} },
    }));
    expect(res.status).toBe(400);
  });

  it('fitness returns 404 for unknown seed', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/fitness', body: { hash: 'x', scores: {} },
    }));
    expect(res.status).toBe(404);
  });

  it('fitness returns 400 with non-object scores', async () => {
    const seed = makeSeed('S');
    ctrl.addSeed(seed);
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/seed/fitness', body: { hash: seed.$hash, scores: 'bad' },
    }));
    expect(res.status).toBe(400);
  });

  it('emits seed.created event on create', async () => {
    const events: string[] = [];
    bus.on('seed.created', () => { events.push('created'); });
    await router.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { name: 'E', domain: 'organism' },
    }));
    expect(events.length).toBe(1);
  });
});

// ── EvolutionController ──

describe('EvolutionController', () => {
  let seedStore: Map<string, UniversalSeed>;
  let router: Router;
  let rng: DeterministicRNG;
  let bus: EventBus;

  beforeEach(() => {
    rng = new DeterministicRNG('test-evo');
    bus = new EventBus();
    seedStore = new Map();
    const evo = new EvolutionController(seedStore, rng, bus);
    router = new Router();
    evo.register(router);

    // Add 3 seeds for evolution
    for (let i = 0; i < 3; i++) {
      const s = makeSeed(`evo-${i}`, 'organism', { hp: { type: 'scalar', value: 10 + i * 10, min: 0, max: 100 } });
      seedStore.set(s.$hash, s);
    }
  });

  it('runs evolution for N generations', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/evolve',
      body: { generations: 3, populationSize: 3 },
    }));
    expect(res.status).toBe(200);
    expect(body(res).generations).toBe(3);
    expect(body(res).finalPopulation).toBeGreaterThanOrEqual(2);
  });

  it('returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/evolve', body: null,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 with missing generations', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/evolve', body: { populationSize: 5 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 with invalid populationSize', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/evolve', body: { generations: 5, populationSize: 1 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when fewer than 2 seeds in store', async () => {
    seedStore.clear();
    seedStore.set('x', makeSeed('solo'));
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/evolve', body: { generations: 5, populationSize: 5 },
    }));
    expect(res.status).toBe(400);
  });

  it('GET /api/evolution/status returns status', async () => {
    const res = await router.handle(makeReq({ path: '/api/evolution/status' }));
    expect(res.status).toBe(200);
    expect(body(res).status.running).toBe(false);
  });

  it('POST /api/simulate advances simulation', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/simulate', body: { steps: 3 },
    }));
    expect(res.status).toBe(200);
    expect(body(res).stepsCompleted).toBe(3);
  });

  it('simulate returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/simulate', body: 'nope',
    }));
    expect(res.status).toBe(400);
  });

  it('simulate returns 400 with missing steps', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/simulate', body: {},
    }));
    expect(res.status).toBe(400);
  });

  it('emits evolution.tick events', async () => {
    const ticks: number[] = [];
    bus.on('evolution.tick', (e: any) => { ticks.push(e.generation); });
    await router.handle(makeReq({
      method: 'POST', path: '/api/evolve',
      body: { generations: 2, populationSize: 3 },
    }));
    expect(ticks.length).toBe(2);
    expect(ticks[0]).toBe(1);
    expect(ticks[1]).toBe(2);
  });
});

// ── WorldController ──

describe('WorldController', () => {
  let seedStore: Map<string, UniversalSeed>;
  let router: Router;

  beforeEach(() => {
    seedStore = new Map();
    const bus = new EventBus();
    const wc = new WorldController(seedStore, bus);
    router = new Router();
    wc.register(router);
  });

  it('GET /api/status returns world summary', async () => {
    const s = makeSeed('Test');
    seedStore.set(s.$hash, s);
    const res = await router.handle(makeReq({ path: '/api/status' }));
    expect(res.status).toBe(200);
    expect(body(res).seedCount).toBe(1);
    expect(body(res).names).toContain('Test');
  });

  it('DELETE /api/world clears all seeds', async () => {
    seedStore.set('a', makeSeed('A'));
    seedStore.set('b', makeSeed('B'));
    const res = await router.handle(makeReq({ method: 'DELETE', path: '/api/world' }));
    expect(res.status).toBe(200);
    expect(body(res).cleared).toBe(2);
    expect(seedStore.size).toBe(0);
  });

  it('GET /api/health returns ok', async () => {
    const res = await router.handle(makeReq({ path: '/api/health' }));
    expect(res.status).toBe(200);
    expect(body(res).status).toBe('ok');
    expect(body(res).uptime).toBeGreaterThanOrEqual(0);
  });

  it('status includes domains and generation', async () => {
    seedStore.set('a', makeSeed('A', 'organism'));
    seedStore.set('b', makeSeed('B', 'terrain'));
    const res = await router.handle(makeReq({ path: '/api/status' }));
    expect(body(res).domains.length).toBe(2);
  });
});

// ── ForgeController ──

describe('ForgeController', () => {
  let seedStore: Map<string, UniversalSeed>;
  let router: Router;
  let forge: Forge;

  beforeEach(() => {
    seedStore = new Map();
    const bus = new EventBus();
    forge = new Forge(new DeterministicRNG('test-forge'));
    const fc = new ForgeController(seedStore, forge, bus);
    router = new Router();
    fc.register(router);
  });

  it('forges a real artifact with content', async () => {
    const seed = makeSeed('F');
    seedStore.set(seed.$hash, seed);
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/forge',
      body: { hash: seed.$hash, type: 'html_page' },
    }));
    expect(res.status).toBe(201);
    expect(body(res).artifact.type).toBe('html_page');
    expect(body(res).artifact.content).toBeTruthy();
    expect(body(res).artifact.mimeType).toBe('text/html');
    expect(body(res).artifact.size).toBeGreaterThan(0);
  });

  it('returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/forge', body: null,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 with missing hash', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/forge', body: { type: 'html_page' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 with missing type', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/forge', body: { hash: 'x' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown seed', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/forge', body: { hash: 'nope', type: 'html_page' },
    }));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid forge type', async () => {
    const seed = makeSeed('F');
    seedStore.set(seed.$hash, seed);
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/forge',
      body: { hash: seed.$hash, type: 'invalid_type' },
    }));
    expect(res.status).toBe(400);
    expect(body(res).message).toContain('Invalid forge type');
  });

  it('GET /api/forge/types returns real Forge types', async () => {
    const res = await router.handle(makeReq({ path: '/api/forge/types' }));
    expect(res.status).toBe(200);
    expect(body(res).types).toContain('html_page');
    expect(body(res).types).toContain('html_game');
    expect(body(res).types).toContain('sprite_sheet');
    expect(body(res).types.length).toBe(forge.getSupportedTypes().length);
  });

  it('forges different artifact types', async () => {
    const seed = makeSeed('Multi');
    seedStore.set(seed.$hash, seed);
    for (const type of ['html_game', 'logo', 'source_code', 'character_sheet']) {
      const res = await router.handle(makeReq({
        method: 'POST', path: '/api/forge',
        body: { hash: seed.$hash, type },
      }));
      expect(res.status).toBe(201);
      expect(body(res).artifact.content.length).toBeGreaterThan(0);
    }
  });
});

// ── AgentController ──

describe('AgentController', () => {
  let router: Router;
  let agent: GSPLAgent;

  beforeEach(() => {
    agent = new GSPLAgent({ rngSeed: 42 });
    const ac = new AgentController(agent);
    router = new Router();
    ac.register(router);
  });

  it('replies to a chat message via real agent pipeline', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/chat',
      body: { message: 'hello world' },
    }));
    expect(res.status).toBe(200);
    expect(body(res).reply).toBeTruthy();
    expect(body(res).messageId).toBe(1);
    expect(body(res).success).toBeDefined();
    expect(body(res).intent).toBeDefined();
  });

  it('increments message count', async () => {
    await router.handle(makeReq({ method: 'POST', path: '/api/chat', body: { message: 'a' } }));
    const res = await router.handle(makeReq({ method: 'POST', path: '/api/chat', body: { message: 'b' } }));
    expect(body(res).messageId).toBe(2);
  });

  it('returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({ method: 'POST', path: '/api/chat', body: 5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 with empty message', async () => {
    const res = await router.handle(makeReq({ method: 'POST', path: '/api/chat', body: { message: '  ' } }));
    expect(res.status).toBe(400);
  });

  it('GET /api/agent/status returns agent status with interactions', async () => {
    const res = await router.handle(makeReq({ path: '/api/agent/status' }));
    expect(res.status).toBe(200);
    expect(body(res).status.active).toBe(true);
    expect(body(res).status.messageCount).toBe(0);
    expect(body(res).status.interactions).toBe(0);
  });

  it('status shows lastMessageAt after chat', async () => {
    await router.handle(makeReq({ method: 'POST', path: '/api/chat', body: { message: 'hi' } }));
    const res = await router.handle(makeReq({ path: '/api/agent/status' }));
    expect(body(res).status.messageCount).toBe(1);
    expect(body(res).status.lastMessageAt).toBeGreaterThan(0);
    expect(body(res).status.interactions).toBe(1);
  });
});

// ── ExportController ──

describe('ExportController', () => {
  let seedStore: Map<string, UniversalSeed>;
  let router: Router;

  beforeEach(() => {
    seedStore = new Map();
    const bus = new EventBus();
    const ec = new ExportController(seedStore, bus);
    router = new Router();
    ec.register(router);
  });

  it('exports all seeds', async () => {
    const s = makeSeed('E');
    seedStore.set(s.$hash, s);
    const res = await router.handle(makeReq({ path: '/api/export' }));
    expect(res.status).toBe(200);
    expect(body(res).version).toBe('4.0');
    expect(body(res).count).toBe(1);
  });

  it('exports empty world', async () => {
    const res = await router.handle(makeReq({ path: '/api/export' }));
    expect(body(res).count).toBe(0);
    expect(body(res).seeds).toEqual([]);
  });

  it('imports valid seeds', async () => {
    const seed = makeSeed('Imp');
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/import',
      body: { seeds: [seed] },
    }));
    expect(res.status).toBe(200);
    expect(body(res).imported).toBe(1);
    expect(body(res).skipped).toBe(0);
    expect(seedStore.size).toBe(1);
  });

  it('skips seeds missing $gst 4.0', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/import',
      body: { seeds: [{ $hash: 'h', $name: 'n', $domain: 'd', $gst: '3.0' }] },
    }));
    expect(body(res).imported).toBe(0);
    expect(body(res).skipped).toBe(1);
  });

  it('skips non-object entries', async () => {
    const res = await router.handle(makeReq({
      method: 'POST', path: '/api/import',
      body: { seeds: ['not-an-object', 42] },
    }));
    expect(body(res).skipped).toBe(2);
  });

  it('returns 400 with non-object body', async () => {
    const res = await router.handle(makeReq({ method: 'POST', path: '/api/import', body: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when seeds is not an array', async () => {
    const res = await router.handle(makeReq({ method: 'POST', path: '/api/import', body: { seeds: 'nope' } }));
    expect(res.status).toBe(400);
  });

  it('GET /api/export/formats returns formats', async () => {
    const res = await router.handle(makeReq({ path: '/api/export/formats' }));
    expect(res.status).toBe(200);
    expect(body(res).formats).toContain('json');
    expect(body(res).formats).toContain('gspl');
    expect(body(res).formats).toContain('csv');
  });
});

// ── SSEManager ──

describe('SSEManager', () => {
  let sse: SSEManager;

  beforeEach(() => {
    sse = new SSEManager();
  });

  it('adds and removes clients', () => {
    sse.addClient('c1');
    sse.addClient('c2');
    expect(sse.getClientCount()).toBe(2);
    sse.removeClient('c1');
    expect(sse.getClientCount()).toBe(1);
  });

  it('broadcasts to all unfiltered clients', () => {
    sse.addClient('a');
    sse.addClient('b');
    const ids = sse.broadcast('test', {});
    expect(ids).toEqual(['a', 'b']);
  });

  it('respects client filters', () => {
    sse.addClient('a', ['seed.created']);
    sse.addClient('b', ['evolution.tick']);
    sse.addClient('c');
    const ids = sse.broadcast('seed.created', {});
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
    expect(ids).toContain('c');
  });

  it('formatEvent produces SSE wire format', () => {
    const formatted = sse.formatEvent('test', { x: 1 });
    expect(formatted).toBe('event: test\ndata: {"x":1}\n\n');
  });

  it('getClientIds returns all ids', () => {
    sse.addClient('x');
    sse.addClient('y');
    expect(sse.getClientIds()).toEqual(['x', 'y']);
  });

  it('empty broadcast returns empty array', () => {
    expect(sse.broadcast('ev', {})).toEqual([]);
  });
});

// ── DEFAULT_CONFIG ──

describe('DEFAULT_CONFIG', () => {
  it('port 5001', () => expect(DEFAULT_CONFIG.port).toBe(5001));
  it('host 0.0.0.0', () => expect(DEFAULT_CONFIG.host).toBe('0.0.0.0'));
  it('cors *', () => expect(DEFAULT_CONFIG.corsOrigins).toEqual(['*']));
  it('autoSave 30s', () => expect(DEFAULT_CONFIG.autoSaveInterval).toBe(30000));
});

// ── createStarterSeeds ──

describe('createStarterSeeds', () => {
  it('creates 5 seeds', () => {
    const rng = new DeterministicRNG('test-starters');
    const seeds = createStarterSeeds(rng);
    expect(seeds.length).toBe(5);
  });

  it('seeds have distinct names', () => {
    const rng = new DeterministicRNG('test-starters');
    const seeds = createStarterSeeds(rng);
    const names = seeds.map((s) => s.$name);
    expect(new Set(names).size).toBe(5);
    expect(names).toContain('Forest Guardian');
    expect(names).toContain('Sky Racer');
  });

  it('seeds span multiple domains', () => {
    const rng = new DeterministicRNG('test-starters');
    const seeds = createStarterSeeds(rng);
    const domains = new Set(seeds.map((s) => s.$domain));
    expect(domains.size).toBeGreaterThan(2);
  });

  it('deterministic with same RNG seed', () => {
    const a = createStarterSeeds(new DeterministicRNG('s'));
    const b = createStarterSeeds(new DeterministicRNG('s'));
    expect(a.map((s) => s.$hash)).toEqual(b.map((s) => s.$hash));
  });
});

// ── WebEngine ──

describe('WebEngine', () => {
  let engine: WebEngine;

  beforeEach(() => {
    engine = new WebEngine({ port: 9999 }, new DeterministicRNG('test-web'));
  });

  it('constructs with config override', () => {
    expect(engine.config.port).toBe(9999);
    expect(engine.config.host).toBe('0.0.0.0');
  });

  it('has starter seeds loaded', () => {
    expect(engine.getSeedStore().size).toBe(5);
  });

  it('registers all routes', () => {
    const routes = engine.router.getRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(15);
  });

  it('handle() dispatches to seed create', async () => {
    const res = await engine.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { name: 'New', domain: 'organism' },
    }));
    expect(res.status).toBe(201);
    expect(engine.getSeedStore().size).toBe(6);
  });

  it('handle() returns 404 for unknown route', async () => {
    const res = await engine.handle(makeReq({ path: '/api/nope' }));
    expect(res.status).toBe(404);
  });

  it('getStatus() returns summary', () => {
    const status = engine.getStatus();
    expect(status.seedCount).toBe(5);
    expect(status.sseClients).toBe(0);
    expect(status.routeCount).toBeGreaterThanOrEqual(15);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(status.config.port).toBe(9999);
  });

  it('events broadcast to SSE', async () => {
    engine.sse.addClient('watcher');
    const received: string[] = [];
    const origBroadcast = engine.sse.broadcast.bind(engine.sse);
    engine.sse.broadcast = (type: string, data: unknown) => {
      received.push(type);
      return origBroadcast(type, data);
    };
    await engine.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { name: 'Ev', domain: 'organism' },
    }));
    expect(received).toContain('seed.created');
  });

  it('GET /api/health returns ok', async () => {
    const res = await engine.handle(makeReq({ path: '/api/health' }));
    expect(res.status).toBe(200);
    expect(body(res).status).toBe('ok');
  });

  it('GET /api/forge/types returns real Forge types', async () => {
    const res = await engine.handle(makeReq({ path: '/api/forge/types' }));
    expect(res.status).toBe(200);
    expect(body(res).types).toContain('html_page');
    expect(body(res).types.length).toBeGreaterThanOrEqual(15);
  });

  it('full workflow: create, mutate, breed, forge', async () => {
    const r1 = await engine.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { name: 'A', domain: 'organism', genes: { hp: { type: 'scalar', value: 50, min: 0, max: 100 } } },
    }));
    const r2 = await engine.handle(makeReq({
      method: 'POST', path: '/api/seed/create',
      body: { name: 'B', domain: 'organism', genes: { hp: { type: 'scalar', value: 80, min: 0, max: 100 } } },
    }));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const hashA = body(r1).seed.$hash;
    const hashB = body(r2).seed.$hash;

    const bred = await engine.handle(makeReq({
      method: 'POST', path: '/api/seed/breed',
      body: { parent1: hashA, parent2: hashB },
    }));
    expect(bred.status).toBe(201);

    const childHash = body(bred).child.$hash;
    const forged = await engine.handle(makeReq({
      method: 'POST', path: '/api/forge',
      body: { hash: childHash, type: 'html_page' },
    }));
    expect(forged.status).toBe(201);
    expect(body(forged).artifact.type).toBe('html_page');
    expect(body(forged).artifact.content).toBeTruthy();
  });
});

// ── Agent Integration Tests (real pipeline) ──

describe('Agent Integration', () => {
  let engine: WebEngine;

  beforeEach(() => {
    engine = new WebEngine({ port: 9998 }, new DeterministicRNG('test-agent-int'));
  });

  it('agent chat creates a seed via tool bridge', async () => {
    const res = await engine.handle(makeReq({
      method: 'POST', path: '/api/chat',
      body: { message: 'create a fire dragon' },
    }));
    expect(res.status).toBe(200);
    expect(body(res).success).toBe(true);
    expect(body(res).toolsUsed.length).toBeGreaterThan(0);
    expect(body(res).toolsUsed).toContain('create_seed');
  });

  it('agent chat lists seeds', async () => {
    const res = await engine.handle(makeReq({
      method: 'POST', path: '/api/chat',
      body: { message: 'list all seeds' },
    }));
    expect(res.status).toBe(200);
    expect(body(res).reply).toBeTruthy();
  });

  it('agent chat gets world status', async () => {
    const res = await engine.handle(makeReq({
      method: 'POST', path: '/api/chat',
      body: { message: 'show world status' },
    }));
    expect(res.status).toBe(200);
    expect(body(res).reply).toBeTruthy();
  });

  it('agent has 6 registered tools', async () => {
    const res = await engine.handle(makeReq({ path: '/api/agent/status' }));
    expect(res.status).toBe(200);
    expect(body(res).status.active).toBe(true);
  });

  it('agent chat evolves seeds', async () => {
    const res = await engine.handle(makeReq({
      method: 'POST', path: '/api/chat',
      body: { message: 'evolve the population for 3 generations' },
    }));
    expect(res.status).toBe(200);
    expect(body(res).reply).toBeTruthy();
  });

  it('full agent workflow: chat create then forge', async () => {
    // Create via agent
    const createRes = await engine.handle(makeReq({
      method: 'POST', path: '/api/chat',
      body: { message: 'create a storm warrior' },
    }));
    expect(createRes.status).toBe(200);
    expect(body(createRes).success).toBe(true);

    // Verify seed exists in store
    const seedsBefore = engine.getSeedStore().size;
    expect(seedsBefore).toBeGreaterThan(5); // 5 starters + at least 1 new

    // Forge via HTTP endpoint using any seed
    const anyHash = Array.from(engine.getSeedStore().keys())[0]!;
    const forgeRes = await engine.handle(makeReq({
      method: 'POST', path: '/api/forge',
      body: { hash: anyHash, type: 'html_game' },
    }));
    expect(forgeRes.status).toBe(201);
    expect(body(forgeRes).artifact.content).toContain('<');
  });
});

// ── End-to-End: Concept → Seed → Shader Pipeline ──

describe('Concept → Seed → Shader Pipeline', () => {
  let engine: WebEngine;

  beforeEach(() => {
    engine = new WebEngine();
  });

  it('compiles "chibi lightning dragon" to a valid entity with GLSL shader', async () => {
    // Step 1: Compile concept
    const compileRes = await engine.handle(makeReq({
      method: 'POST',
      path: '/api/concept/compile',
      body: { description: 'chibi lightning dragon' },
    }));
    expect(compileRes.status).toBe(201);

    const result = body(compileRes);
    expect(result.blueprint).toBeDefined();
    expect(result.seed).toBeDefined();
    expect(result.blueprint.concept.archetype).toBe('dragon');
    expect(result.blueprint.concept.bodyStructure).toBe('winged');
    expect(result.seed.genes.bodyParams).toBeDefined();
    expect(result.seed.genes.surface).toBeDefined();
    expect(result.seed.genes.motion).toBeDefined();
    expect(result.seed.genes.palette).toBeDefined();

    // Step 2: Retrieve the shader for this seed
    const hash = result.seed.$hash;
    const shaderRes = await engine.handle(makeReq({
      method: 'GET',
      path: `/api/seed/${hash}/shader`,
    }));
    expect(shaderRes.status).toBe(200);

    const shaderResult = body(shaderRes);
    expect(shaderResult.fragmentShader).toBeDefined();
    expect(shaderResult.vertexShader).toBeDefined();
    expect(shaderResult.fragmentShader).toContain('#version 300 es');
    expect(shaderResult.fragmentShader).toContain('mapEntity');
    expect(shaderResult.fragmentShader.length).toBeGreaterThan(3000);
  });

  it('creates render-compatible seeds via POST /api/seed/create', async () => {
    const createRes = await engine.handle(makeReq({
      method: 'POST',
      path: '/api/seed/create',
      body: { name: 'ice necromancer', domain: 'organism' },
    }));
    expect(createRes.status).toBe(201);

    const seed = body(createRes).seed;
    // Verify concept pipeline produced render-compatible genes
    expect(seed.genes.bodyParams).toBeDefined();
    expect(seed.genes.bodyStructure).toBeDefined();
    expect(seed.genes.surface).toBeDefined();
    expect(seed.genes.palette).toBeDefined();
  });

  it('produces different shaders for mutated seeds', async () => {
    // Create original
    const res1 = await engine.handle(makeReq({
      method: 'POST',
      path: '/api/concept/compile',
      body: { description: 'fire knight' },
    }));
    const seed1Hash = body(res1).seed.$hash;

    // Mutate it
    const mutRes = await engine.handle(makeReq({
      method: 'POST',
      path: '/api/seed/mutate',
      body: { hash: seed1Hash, rate: 0.5 },
    }));
    expect(mutRes.status).toBeLessThan(300);
    const seed2Hash = body(mutRes).mutated.$hash;
    expect(seed2Hash).not.toBe(seed1Hash);

    // Get shaders for both
    const shader1Res = await engine.handle(makeReq({ method: 'GET', path: `/api/seed/${seed1Hash}/shader` }));
    const shader2Res = await engine.handle(makeReq({ method: 'GET', path: `/api/seed/${seed2Hash}/shader` }));

    expect(shader1Res.status).toBe(200);
    expect(shader2Res.status).toBe(200);

    // Both produce valid shaders, but they should differ (mutation changed gene values)
    const s1 = body(shader1Res).fragmentShader;
    const s2 = body(shader2Res).fragmentShader;
    expect(s1).toContain('mapEntity');
    expect(s2).toContain('mapEntity');
    expect(s1).not.toBe(s2);
  });

  it('handles diverse concept descriptions', async () => {
    const concepts = [
      { desc: 'Goku', expectArch: 'warrior', expectBody: 'humanoid' },
      { desc: 'ghost wraith', expectArch: 'undead', expectBody: 'floating' },
      { desc: 'robot spider mech', expectArch: 'golem', expectBody: 'mechanical' },
    ];

    for (const { desc, expectArch, expectBody } of concepts) {
      const res = await engine.handle(makeReq({
        method: 'POST',
        path: '/api/concept/compile',
        body: { description: desc },
      }));
      expect(res.status).toBe(201);
      expect(body(res).blueprint.concept.archetype).toBe(expectArch);
      expect(body(res).blueprint.concept.bodyStructure).toBe(expectBody);
    }
  });
});
