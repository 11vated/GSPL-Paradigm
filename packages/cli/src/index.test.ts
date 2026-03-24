import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebEngine } from '@paradigm/web';
import { buildRequest, run } from './index.js';

// ── buildRequest ──

describe('buildRequest', () => {
  it('builds a GET request', () => {
    const req = buildRequest('GET', '/api/seeds');
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/seeds');
    expect(req.body).toBeUndefined();
  });

  it('builds a POST request with body', () => {
    const req = buildRequest('POST', '/api/seed/create', { name: 'X' });
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ name: 'X' });
  });

  it('includes empty params/query/headers', () => {
    const req = buildRequest('GET', '/test');
    expect(req.params).toEqual({});
    expect(req.query).toEqual({});
    expect(req.headers).toEqual({});
  });
});

// ── Engine-backed integration tests ──

describe('CLI commands via WebEngine', () => {
  let engine: WebEngine;

  beforeEach(() => {
    engine = new WebEngine();
  });

  it('seed create produces a seed', async () => {
    const res = await engine.handle(buildRequest('POST', '/api/seed/create', {
      name: 'CLI Dragon', domain: 'organism',
    }));
    expect(res.status).toBe(201);
    const b = res.body as any;
    expect(b.seed.$name).toBe('CLI Dragon');
    expect(b.seed.$domain).toBe('organism');
    expect(b.seed.$hash).toBeTruthy();
  });

  it('seed list returns starter seeds', async () => {
    const res = await engine.handle(buildRequest('GET', '/api/seeds'));
    expect(res.status).toBe(200);
    const b = res.body as any;
    expect(b.seeds.length).toBe(5);
  });

  it('seed inspect returns seed details', async () => {
    const hash = Array.from(engine.getSeedStore().keys())[0]!;
    const res = await engine.handle(buildRequest('GET', `/api/seed/${hash}`));
    expect(res.status).toBe(200);
    const b = res.body as any;
    expect(b.seed.$hash).toBe(hash);
  });

  it('evolve runs evolution', async () => {
    const res = await engine.handle(buildRequest('POST', '/api/evolve', {
      generations: 2, populationSize: 4,
    }));
    expect(res.status).toBe(200);
    const b = res.body as any;
    expect(b.generations).toBe(2);
    expect(b.finalPopulation).toBeGreaterThanOrEqual(2);
  });

  it('forge produces real artifact content', async () => {
    // Create a seed first to ensure one exists
    const createRes = await engine.handle(buildRequest('POST', '/api/seed/create', {
      name: 'ForgeTest', domain: 'organism',
    }));
    expect(createRes.status).toBe(201);
    const hash = (createRes.body as any).seed.$hash;
    expect(hash).toBeTruthy();
    // Verify the seed is in the store
    expect(engine.getSeedStore().has(hash)).toBe(true);
    const res = await engine.handle(buildRequest('POST', '/api/forge', {
      hash, type: 'html_page',
    }));
    expect(res.status).toBe(201);
    const b = res.body as any;
    expect(b.artifact.content).toBeTruthy();
    expect(b.artifact.mimeType).toBe('text/html');
  });

  it('chat processes through agent pipeline', async () => {
    const res = await engine.handle(buildRequest('POST', '/api/chat', {
      message: 'create a fire warrior',
    }));
    expect(res.status).toBe(200);
    const b = res.body as any;
    expect(b.reply).toBeTruthy();
    // The agent processes the message; tool dispatch depends on NLP classification
    expect(typeof b.reply).toBe('string');
  });

  it('chat list via agent', async () => {
    const res = await engine.handle(buildRequest('POST', '/api/chat', {
      message: 'list all seeds',
    }));
    expect(res.status).toBe(200);
    const b = res.body as any;
    expect(b.reply).toBeTruthy();
  });

  it('status returns health', async () => {
    const res = await engine.handle(buildRequest('GET', '/api/health'));
    expect(res.status).toBe(200);
    const b = res.body as any;
    expect(b.status).toBe('ok');
  });

  it('forge invalid type returns 400', async () => {
    const hash = Array.from(engine.getSeedStore().keys())[0]!;
    const res = await engine.handle(buildRequest('POST', '/api/forge', {
      hash, type: 'not_real',
    }));
    expect(res.status).toBe(400);
  });

  it('forge missing seed returns 404', async () => {
    const res = await engine.handle(buildRequest('POST', '/api/forge', {
      hash: 'nonexistent', type: 'html_page',
    }));
    expect(res.status).toBe(404);
  });
});

// ── run() function tests ──

describe('run()', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  it('help prints usage', async () => {
    await run(['help']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('GSPL Paradigm CLI');
    expect(output).toContain('seed create');
  });

  it('--help prints usage', async () => {
    await run(['--help']);
    expect(logSpy).toHaveBeenCalled();
  });

  it('no args prints help', async () => {
    await run([]);
    expect(logSpy).toHaveBeenCalled();
  });

  it('unknown command sets exitCode', async () => {
    await run(['bogus']);
    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('seed create with no name sets exitCode', async () => {
    await run(['seed', 'create']);
    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('seed unknown subcommand sets exitCode', async () => {
    await run(['seed', 'bogus']);
    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('forge with no hash sets exitCode', async () => {
    await run(['forge']);
    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('chat with no message sets exitCode', async () => {
    await run(['chat']);
    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('seed create outputs JSON', async () => {
    await run(['seed', 'create', 'TestDragon', 'organism']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.seed.$name).toBe('TestDragon');
  });

  it('seed list outputs JSON', async () => {
    await run(['seed', 'list']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.seeds.length).toBe(5);
  });

  it('status outputs JSON', async () => {
    await run(['status']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('ok');
    expect(parsed.seedCount).toBe(5);
  });

  it('chat outputs agent response', async () => {
    await run(['chat', 'create', 'a', 'warrior']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.reply).toBeTruthy();
    expect(typeof parsed.reply).toBe('string');
  });

  it('evolve outputs result', async () => {
    await run(['evolve', '2', '4']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.generations).toBe(2);
    expect(parsed.finalPopulation).toBeGreaterThanOrEqual(2);
  });
});
