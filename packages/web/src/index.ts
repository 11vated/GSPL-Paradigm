/**
 * @paradigm/web — Pure TypeScript REST handler logic for GSPL Paradigm.
 *
 * Layer 8: Surfaces. Provides route handler logic, request/response types,
 * and server configuration that can be wired into any HTTP framework.
 * Zero external dependencies beyond @paradigm/types, @paradigm/rng,
 * @paradigm/events, and @paradigm/seed.
 *
 * @packageDocumentation
 */

import type {
  UniversalSeed,
  GeneMap,
  SeedDomain,
  FitnessVector,
} from '@paradigm/types';

import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import { createSeed, mutateSeed, breedSeeds } from '@paradigm/seed';
import { GSPLAgent } from '@paradigm/agent';
import type { AgentResponse } from '@paradigm/agent';
import { Forge } from '@paradigm/forge';
import type { ArtifactType as ForgeArtifactType, Artifact as ForgeArtifactResult } from '@paradigm/forge';

// ─────────────────────────────────────────────
// HTTP Types
// ─────────────────────────────────────────────

/** Supported HTTP methods for route matching. */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Framework-agnostic request representation. */
export interface Request {
  readonly method: HTTPMethod;
  readonly path: string;
  readonly params: Record<string, string>;
  readonly query: Record<string, string>;
  readonly body: unknown;
  readonly headers: Record<string, string>;
}

/** Framework-agnostic response representation. */
export interface Response {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Record<string, string>;
}

/** Route handler function signature. */
export type RouteHandler = (req: Request) => Response | Promise<Response>;

// ─────────────────────────────────────────────
// Response Helpers
// ─────────────────────────────────────────────

/** Create a JSON success response. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    body,
    headers: { 'content-type': 'application/json' },
  };
}

/** Create a 200 OK JSON response. */
function ok(body: unknown): Response {
  return jsonResponse(200, body);
}

/** Create a 201 Created JSON response. */
function created(body: unknown): Response {
  return jsonResponse(201, body);
}

/** Create a 400 Bad Request JSON response. */
function badRequest(message: string): Response {
  return jsonResponse(400, { error: 'bad_request', message });
}

/** Create a 404 Not Found JSON response. */
function notFound(message: string): Response {
  return jsonResponse(404, { error: 'not_found', message });
}

/** Create a 500 Internal Server Error JSON response. */
function serverError(message: string): Response {
  return jsonResponse(500, { error: 'internal_error', message });
}

// ─────────────────────────────────────────────
// Body Validation Helpers
// ─────────────────────────────────────────────

/** Type guard: checks that value is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract a string field from a record, returning undefined if missing or wrong type. */
function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === 'string' ? val : undefined;
}

/** Extract a number field from a record, returning undefined if missing or wrong type. */
function numberField(obj: Record<string, unknown>, key: string): number | undefined {
  const val = obj[key];
  return typeof val === 'number' && isFinite(val) ? val : undefined;
}

// ─────────────────────────────────────────────
// Router — Path-based request routing
// ─────────────────────────────────────────────

/** Internal route registration entry. */
interface RouteEntry {
  readonly method: HTTPMethod;
  readonly path: string;
  readonly segments: readonly string[];
  readonly handler: RouteHandler;
}

/**
 * Path-based request router with `:param` pattern extraction.
 *
 * Matches routes by method and path segments. Extracts named parameters
 * from `:param` patterns in the path template. Returns 404 for unmatched routes.
 */
export class Router {
  private readonly routes: RouteEntry[] = [];

  /** Register a route handler for the given method and path pattern. */
  addRoute(method: HTTPMethod, path: string, handler: RouteHandler): void {
    const segments = normalizePath(path).split('/').filter(Boolean);
    this.routes.push({ method, path, segments, handler });
  }

  /**
   * Match a request to a registered route and invoke the handler.
   * Extracts `:param` segments into `req.params`. Returns 404 if no match.
   */
  async handle(req: Request): Promise<Response> {
    const reqSegments = normalizePath(req.path).split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      if (route.segments.length !== reqSegments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;

      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i];
        const reqSeg = reqSegments[i];

        if (routeSeg === undefined || reqSeg === undefined) {
          matched = false;
          break;
        }

        if (routeSeg.startsWith(':')) {
          params[routeSeg.slice(1)] = reqSeg;
        } else if (routeSeg !== reqSeg) {
          matched = false;
          break;
        }
      }

      if (matched) {
        const enrichedReq: Request = {
          ...req,
          params: { ...req.params, ...params },
        };
        try {
          return await route.handler(enrichedReq);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown handler error';
          return serverError(`Handler error: ${message}`);
        }
      }
    }

    return notFound(`No route matches ${req.method} ${req.path}`);
  }

  /** List all registered routes (method + path). */
  getRoutes(): Array<{ method: HTTPMethod; path: string }> {
    return this.routes.map((r) => ({ method: r.method, path: r.path }));
  }
}

/** Normalize a path by trimming trailing slashes and lowercasing. */
function normalizePath(path: string): string {
  return path.replace(/\/+$/, '').toLowerCase();
}

// ─────────────────────────────────────────────
// SeedController — Seed CRUD handlers
// ─────────────────────────────────────────────

/**
 * Seed CRUD controller with in-memory storage.
 *
 * Provides handlers for creating, reading, deleting, breeding, mutating,
 * and scoring seeds. All mutations go through the deterministic @paradigm/seed
 * operators to maintain reproducibility.
 */
export class SeedController {
  private readonly seeds: Map<string, UniversalSeed> = new Map();
  private readonly rng: DeterministicRNG;
  private readonly eventBus: EventBus;

  constructor(rng: DeterministicRNG, eventBus: EventBus) {
    this.rng = rng;
    this.eventBus = eventBus;
  }

  /** Register all seed routes on the given router. */
  register(router: Router): void {
    router.addRoute('POST', '/api/seed/create', (req) => this.handleCreate(req));
    router.addRoute('GET', '/api/seed/:id', (req) => this.handleGetById(req));
    router.addRoute('GET', '/api/seeds', (req) => this.handleGetAll(req));
    router.addRoute('DELETE', '/api/seed/:id', (req) => this.handleDelete(req));
    router.addRoute('POST', '/api/seed/breed', (req) => this.handleBreed(req));
    router.addRoute('POST', '/api/seed/mutate', (req) => this.handleMutate(req));
    router.addRoute('POST', '/api/seed/fitness', (req) => this.handleFitness(req));
  }

  /** Get the internal seed store (for other controllers to access). */
  getStore(): Map<string, UniversalSeed> {
    return this.seeds;
  }

  /** Add a seed directly to the store (used by starter seeds and import). */
  addSeed(seed: UniversalSeed): void {
    this.seeds.set(seed.$hash, seed);
  }

  /** POST /api/seed/create — Create a new seed. */
  private handleCreate(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { name, domain, genes? }');
    }

    const name = stringField(req.body, 'name');
    const domain = stringField(req.body, 'domain') as SeedDomain | undefined;

    if (!name || name.trim().length === 0) {
      return badRequest('Field "name" is required and must be a non-empty string');
    }
    if (!domain) {
      return badRequest('Field "domain" is required and must be a valid SeedDomain string');
    }

    const genesRaw = req.body['genes'];
    const genes: GeneMap = isRecord(genesRaw) ? genesRaw as GeneMap : WebEngine.deriveGenes(name, domain, this.rng);

    const seed = createSeed(name, domain, genes, this.rng);
    this.seeds.set(seed.$hash, seed);

    this.eventBus.emit({
      type: 'seed.created',
      seed,
      timestamp: Date.now(),
    });

    return created({ seed });
  }

  /** GET /api/seed/:id — Return seed by hash. */
  private handleGetById(req: Request): Response {
    const id = req.params['id'];
    if (!id) {
      return badRequest('Missing seed id parameter');
    }

    const seed = this.seeds.get(id);
    if (!seed) {
      return notFound(`Seed not found: ${id}`);
    }

    return ok({ seed });
  }

  /** GET /api/seeds — Return all seeds, optional ?domain= filter. */
  private handleGetAll(req: Request): Response {
    const domainFilter = req.query['domain'];
    let seeds = Array.from(this.seeds.values());

    if (domainFilter && domainFilter.length > 0) {
      seeds = seeds.filter((s) => s.$domain === domainFilter);
    }

    return ok({ seeds, count: seeds.length });
  }

  /** DELETE /api/seed/:id — Remove seed by hash. */
  private handleDelete(req: Request): Response {
    const id = req.params['id'];
    if (!id) {
      return badRequest('Missing seed id parameter');
    }

    const seed = this.seeds.get(id);
    if (!seed) {
      return notFound(`Seed not found: ${id}`);
    }

    this.seeds.delete(id);

    this.eventBus.emit({
      type: 'seed.died',
      seed,
      cause: 'deleted',
      timestamp: Date.now(),
    });

    return ok({ deleted: id });
  }

  /** POST /api/seed/breed — Breed two seeds. */
  private handleBreed(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { parent1, parent2 }');
    }

    const parent1Hash = stringField(req.body, 'parent1');
    const parent2Hash = stringField(req.body, 'parent2');

    if (!parent1Hash || !parent2Hash) {
      return badRequest('Fields "parent1" and "parent2" are required (seed hashes)');
    }

    const parentA = this.seeds.get(parent1Hash);
    const parentB = this.seeds.get(parent2Hash);

    if (!parentA) {
      return notFound(`Parent seed not found: ${parent1Hash}`);
    }
    if (!parentB) {
      return notFound(`Parent seed not found: ${parent2Hash}`);
    }

    const child = breedSeeds(parentA, parentB, 'uniform', 0.5, this.rng);
    this.seeds.set(child.$hash, child);

    this.eventBus.emit({
      type: 'seed.bred',
      parentA,
      parentB,
      child,
      strategy: 'uniform',
      timestamp: Date.now(),
    });

    return created({ child });
  }

  /** POST /api/seed/mutate — Mutate a seed. */
  private handleMutate(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { hash, rate? }');
    }

    const hash = stringField(req.body, 'hash');
    if (!hash) {
      return badRequest('Field "hash" is required (seed hash to mutate)');
    }

    const original = this.seeds.get(hash);
    if (!original) {
      return notFound(`Seed not found: ${hash}`);
    }

    const rate = numberField(req.body, 'rate') ?? 0.1;
    const clampedRate = Math.max(0, Math.min(1, rate));
    const mutated = mutateSeed(original, clampedRate, this.rng);
    this.seeds.set(mutated.$hash, mutated);

    this.eventBus.emit({
      type: 'seed.mutated',
      original,
      mutated,
      intensity: clampedRate,
      timestamp: Date.now(),
    });

    return created({ mutated });
  }

  /** POST /api/seed/fitness — Update fitness scores. */
  private handleFitness(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { hash, scores }');
    }

    const hash = stringField(req.body, 'hash');
    if (!hash) {
      return badRequest('Field "hash" is required (seed hash to score)');
    }

    const seed = this.seeds.get(hash);
    if (!seed) {
      return notFound(`Seed not found: ${hash}`);
    }

    const scoresRaw = req.body['scores'];
    if (!isRecord(scoresRaw)) {
      return badRequest('Field "scores" must be an object mapping dimension names to numbers');
    }

    const fitness: FitnessVector = {};
    for (const [key, val] of Object.entries(scoresRaw)) {
      if (typeof val === 'number' && isFinite(val)) {
        fitness[key] = val;
      }
    }

    const updated: UniversalSeed = {
      ...seed,
      $fitness: fitness,
      $lineage: { ...seed.$lineage },
      $metadata: { ...seed.$metadata },
      genes: structuredClone(seed.genes),
    };
    this.seeds.set(updated.$hash, updated);

    return ok({ seed: updated });
  }
}

// ─────────────────────────────────────────────
// EvolutionController — Evolution run handlers
// ─────────────────────────────────────────────

/** Status of an evolution run. */
export interface EvolutionStatus {
  readonly running: boolean;
  readonly generation: number;
  readonly totalGenerations: number;
  readonly populationSize: number;
  readonly bestFitness: number;
  readonly averageFitness: number;
}

/**
 * Evolution controller managing generation-based evolution runs.
 *
 * Provides handlers for starting evolution, querying status, and
 * running simulation steps. Evolution uses tournament selection with
 * breed + mutate operators from @paradigm/seed.
 */
export class EvolutionController {
  private readonly seedStore: Map<string, UniversalSeed>;
  private readonly rng: DeterministicRNG;
  private readonly eventBus: EventBus;
  private status: EvolutionStatus;

  constructor(
    seedStore: Map<string, UniversalSeed>,
    rng: DeterministicRNG,
    eventBus: EventBus,
  ) {
    this.seedStore = seedStore;
    this.rng = rng;
    this.eventBus = eventBus;
    this.status = {
      running: false,
      generation: 0,
      totalGenerations: 0,
      populationSize: 0,
      bestFitness: 0,
      averageFitness: 0,
    };
  }

  /** Register evolution routes on the given router. */
  register(router: Router): void {
    router.addRoute('POST', '/api/evolve', (req) => this.handleEvolve(req));
    router.addRoute('GET', '/api/evolution/status', () => this.handleStatus());
    router.addRoute('POST', '/api/simulate', (req) => this.handleSimulate(req));
  }

  /** POST /api/evolve — Run evolution for N generations. */
  private handleEvolve(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest(
        'Request body must be a JSON object with { generations, populationSize, mutationRate? }',
      );
    }

    const generations = numberField(req.body, 'generations');
    const populationSize = numberField(req.body, 'populationSize');
    const mutationRate = numberField(req.body, 'mutationRate') ?? 0.1;

    if (!generations || generations < 1) {
      return badRequest('Field "generations" is required and must be a positive integer');
    }
    if (!populationSize || populationSize < 2) {
      return badRequest('Field "populationSize" is required and must be >= 2');
    }

    const clampedRate = Math.max(0, Math.min(1, mutationRate));
    const population = Array.from(this.seedStore.values()).slice(0, populationSize);

    if (population.length < 2) {
      return badRequest(
        `Need at least 2 seeds in the store to evolve, found ${population.length}`,
      );
    }

    this.status = {
      running: true,
      generation: 0,
      totalGenerations: Math.floor(generations),
      populationSize: population.length,
      bestFitness: 0,
      averageFitness: 0,
    };

    let currentPopulation = population;
    const totalGens = Math.floor(generations);

    for (let gen = 0; gen < totalGens; gen++) {
      const nextGen: UniversalSeed[] = [];

      // Elitism: keep the best seed
      const sorted = [...currentPopulation].sort((a, b) => {
        const fa = a.$fitness?.primary ?? 0;
        const fb = b.$fitness?.primary ?? 0;
        return fb - fa;
      });
      const elite = sorted[0];
      if (elite) {
        nextGen.push(elite);
      }

      // Fill remainder via tournament selection + breeding + mutation
      while (nextGen.length < currentPopulation.length) {
        const parentA = this.tournamentSelect(currentPopulation);
        const parentB = this.tournamentSelect(currentPopulation);

        if (!parentA || !parentB) break;

        const child = breedSeeds(parentA, parentB, 'uniform', 0.5, this.rng);
        const mutated = mutateSeed(child, clampedRate, this.rng);
        nextGen.push(mutated);
      }

      currentPopulation = nextGen;

      // Compute fitness stats
      const fitnessValues = currentPopulation.map((s) => s.$fitness?.primary ?? 0);
      const bestFitness = Math.max(...fitnessValues);
      const avgFitness =
        fitnessValues.length > 0
          ? fitnessValues.reduce((sum, f) => sum + f, 0) / fitnessValues.length
          : 0;

      this.status = {
        running: gen < totalGens - 1,
        generation: gen + 1,
        totalGenerations: totalGens,
        populationSize: currentPopulation.length,
        bestFitness,
        averageFitness: avgFitness,
      };

      this.eventBus.emit({
        type: 'evolution.tick',
        generation: gen + 1,
        populationSize: currentPopulation.length,
        bestFitness,
        avgFitness,
        diversity: this.computeDiversity(currentPopulation),
        timestamp: Date.now(),
      });
    }

    // Store evolved population
    for (const seed of currentPopulation) {
      this.seedStore.set(seed.$hash, seed);
    }

    this.status = { ...this.status, running: false };

    return ok({
      generations: totalGens,
      finalPopulation: currentPopulation.length,
      bestFitness: this.status.bestFitness,
      averageFitness: this.status.averageFitness,
    });
  }

  /** GET /api/evolution/status — Return current evolution run status. */
  private handleStatus(): Response {
    return ok({ status: this.status });
  }

  /** POST /api/simulate — Advance simulation by N steps. */
  private handleSimulate(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { steps }');
    }

    const steps = numberField(req.body, 'steps');
    if (!steps || steps < 1) {
      return badRequest('Field "steps" is required and must be a positive integer');
    }

    const totalSteps = Math.floor(steps);
    const seeds = Array.from(this.seedStore.values());

    for (let step = 0; step < totalSteps; step++) {
      // Age all seeds and drain energy
      for (const seed of seeds) {
        if (seed.$activation) {
          seed.$activation.age += 1;
          seed.$activation.energy = Math.max(0, seed.$activation.energy - 1);

          if (seed.$activation.energy <= 0) {
            seed.$activation.alive = false;
            seed.$activation.active = false;
          }
        }
      }

      this.eventBus.emit({
        type: 'simulation.step',
        tick: step + 1,
        seedCount: this.seedStore.size,
        timestamp: Date.now(),
      });
    }

    const aliveCount = seeds.filter((s) => s.$activation?.alive !== false).length;

    return ok({
      stepsCompleted: totalSteps,
      seedCount: this.seedStore.size,
      aliveCount,
    });
  }

  /** Tournament selection: pick 3 random seeds, return the fittest. */
  private tournamentSelect(population: UniversalSeed[]): UniversalSeed | undefined {
    if (population.length === 0) return undefined;

    const tournamentSize = Math.min(3, population.length);
    const candidates: UniversalSeed[] = [];

    for (let i = 0; i < tournamentSize; i++) {
      const idx = this.rng.nextInt(0, population.length);
      const candidate = population[idx];
      if (candidate) {
        candidates.push(candidate);
      }
    }

    if (candidates.length === 0) return population[0];

    return candidates.reduce((best, current) => {
      const bestFit = best.$fitness?.primary ?? 0;
      const currentFit = current.$fitness?.primary ?? 0;
      return currentFit > bestFit ? current : best;
    });
  }

  /** Compute population diversity as the ratio of unique hashes. */
  private computeDiversity(population: UniversalSeed[]): number {
    if (population.length === 0) return 0;
    const uniqueHashes = new Set(population.map((s) => s.$hash));
    return uniqueHashes.size / population.length;
  }
}

// ─────────────────────────────────────────────
// WorldController — World state handlers
// ─────────────────────────────────────────────

/**
 * World state controller for global status, health checks, and reset.
 */
export class WorldController {
  private readonly seedStore: Map<string, UniversalSeed>;
  private readonly eventBus: EventBus;
  private readonly startTime: number;

  constructor(seedStore: Map<string, UniversalSeed>, eventBus: EventBus) {
    this.seedStore = seedStore;
    this.eventBus = eventBus;
    this.startTime = Date.now();
  }

  /** Register world routes on the given router. */
  register(router: Router): void {
    router.addRoute('GET', '/api/status', () => this.handleStatus());
    router.addRoute('DELETE', '/api/world', () => this.handleClear());
    router.addRoute('GET', '/api/health', () => this.handleHealth());
  }

  /** GET /api/status — World summary: seed count, generation, names. */
  private handleStatus(): Response {
    const seeds = Array.from(this.seedStore.values());
    const maxGeneration = seeds.reduce(
      (max, s) => Math.max(max, s.$lineage.generation),
      0,
    );
    const domains = new Set(seeds.map((s) => s.$domain));
    const names = seeds.map((s) => s.$name);

    return ok({
      seedCount: seeds.length,
      generation: maxGeneration,
      domains: Array.from(domains),
      names,
      aliveCount: seeds.filter((s) => s.$activation?.alive !== false).length,
    });
  }

  /** DELETE /api/world — Clear all seeds. */
  private handleClear(): Response {
    const previousCount = this.seedStore.size;
    this.seedStore.clear();

    this.eventBus.emit({
      type: 'world.changed',
      action: 'clear',
      seedCount: 0,
      timestamp: Date.now(),
    });

    return ok({ cleared: previousCount, seedCount: 0 });
  }

  /** GET /api/health — Health check with uptime. */
  private handleHealth(): Response {
    return ok({
      status: 'ok',
      uptime: Date.now() - this.startTime,
      seedCount: this.seedStore.size,
    });
  }
}

// ─────────────────────────────────────────────
// ForgeController — Real artifact generation via Forge engine
// ─────────────────────────────────────────────

/** Artifact result with real content from the Forge engine. */
export interface ForgeArtifact {
  readonly id: string;
  readonly seedHash: string;
  readonly type: string;
  readonly name: string;
  readonly content: string;
  readonly mimeType: string;
  readonly size: number;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: number;
}

/**
 * Forge controller that delegates to the real Forge engine (6 forger strategies).
 * Produces actual artifact content — HTML pages, games, shaders, music, sprites, etc.
 */
export class ForgeController {
  private readonly seedStore: Map<string, UniversalSeed>;
  private readonly forge: Forge;
  private readonly artifacts: Map<string, ForgeArtifact> = new Map();
  private readonly eventBus: EventBus;

  constructor(seedStore: Map<string, UniversalSeed>, forge: Forge, eventBus: EventBus) {
    this.seedStore = seedStore;
    this.forge = forge;
    this.eventBus = eventBus;
  }

  /** Get the underlying Forge instance (used by tool bridge). */
  getForge(): Forge {
    return this.forge;
  }

  /** Register forge routes on the given router. */
  register(router: Router): void {
    router.addRoute('POST', '/api/forge', (req) => this.handleForge(req));
    router.addRoute('GET', '/api/forge/types', () => this.handleGetTypes());
  }

  /** POST /api/forge — Forge a real artifact from a seed using the Forge engine. */
  private handleForge(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { hash, type }');
    }

    const hash = stringField(req.body, 'hash');
    const artifactType = stringField(req.body, 'type');

    if (!hash) {
      return badRequest('Field "hash" is required (seed hash to forge from)');
    }
    if (!artifactType) {
      return badRequest('Field "type" is required (artifact type to generate)');
    }

    const seed = this.seedStore.get(hash);
    if (!seed) {
      return notFound(`Seed not found: ${hash}`);
    }

    if (!this.forge.canForge(artifactType as ForgeArtifactType)) {
      const supported = this.forge.getSupportedTypes().join(', ');
      return badRequest(
        `Invalid forge type "${artifactType}". Valid types: ${supported}`,
      );
    }

    const result: ForgeArtifactResult = this.forge.forge(seed, {
      type: artifactType as ForgeArtifactType,
    });

    const artifactId = computeQuickHash({ hash, type: artifactType, ts: Date.now() });
    const artifact: ForgeArtifact = {
      id: artifactId,
      seedHash: hash,
      type: result.type,
      name: result.name,
      content: result.content,
      mimeType: result.mimeType,
      size: result.size,
      metadata: result.metadata,
      createdAt: Date.now(),
    };

    this.artifacts.set(artifactId, artifact);

    this.eventBus.emit({
      type: 'forge.complete',
      seedHash: hash,
      artifactType,
      timestamp: Date.now(),
    });

    return created({ artifact });
  }

  /** GET /api/forge/types — Return supported types from the real Forge engine. */
  private handleGetTypes(): Response {
    return ok({ types: this.forge.getSupportedTypes() });
  }
}

// ─────────────────────────────────────────────
// AgentController — Conversation handlers
// ─────────────────────────────────────────────

/** Agent state summary. */
export interface AgentStatus {
  readonly active: boolean;
  readonly messageCount: number;
  readonly lastMessageAt: number | null;
  readonly interactions: number;
}

/**
 * Agent controller backed by the real GSPLAgent 10-stage intelligence pipeline.
 * Chat messages are processed through PERCEIVE → RECALL → RESEARCH → REASON →
 * PLAN → EXECUTE → VALIDATE → REFLECT → LEARN → EVOLVE.
 * When tools are registered on the agent's ToolRegistry, the EXECUTE stage
 * dispatches to real seed/evolution/forge operations.
 */
export class AgentController {
  private readonly agent: GSPLAgent;
  private messageCount: number = 0;
  private lastMessageAt: number | null = null;

  constructor(agent: GSPLAgent) {
    this.agent = agent;
  }

  /** Get the underlying GSPLAgent (used by tool bridge). */
  getAgent(): GSPLAgent {
    return this.agent;
  }

  /** Register agent routes on the given router. */
  register(router: Router): void {
    router.addRoute('POST', '/api/chat', (req) => this.handleChat(req));
    router.addRoute('GET', '/api/agent/status', () => this.handleStatus());
  }

  /** POST /api/chat — Process message through the 10-stage agent pipeline. */
  private async handleChat(req: Request): Promise<Response> {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { message }');
    }

    const message = stringField(req.body, 'message');
    if (!message || message.trim().length === 0) {
      return badRequest('Field "message" is required and must be a non-empty string');
    }

    this.messageCount += 1;
    this.lastMessageAt = Date.now();

    const result: AgentResponse = await this.agent.process(message);

    return ok({
      reply: result.message,
      success: result.success,
      intent: result.intent,
      plan: result.plan,
      toolsUsed: result.toolsUsed,
      data: result.data,
      reflections: result.reflections,
      messageId: this.messageCount,
      timestamp: this.lastMessageAt,
    });
  }

  /** GET /api/agent/status — Return agent state summary. */
  private handleStatus(): Response {
    const stats = this.agent.getStats();
    const status: AgentStatus = {
      active: true,
      messageCount: this.messageCount,
      lastMessageAt: this.lastMessageAt,
      interactions: stats.interactions,
    };
    return ok({ status });
  }
}

// ─────────────────────────────────────────────
// ExportController — Import/export handlers
// ─────────────────────────────────────────────

/** Supported export formats. */
const EXPORT_FORMATS = ['json', 'gspl', 'csv'] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Export controller for importing and exporting seed collections.
 */
export class ExportController {
  private readonly seedStore: Map<string, UniversalSeed>;
  private readonly eventBus: EventBus;

  constructor(seedStore: Map<string, UniversalSeed>, eventBus: EventBus) {
    this.seedStore = seedStore;
    this.eventBus = eventBus;
  }

  /** Register export routes on the given router. */
  register(router: Router): void {
    router.addRoute('GET', '/api/export', () => this.handleExport());
    router.addRoute('POST', '/api/import', (req) => this.handleImport(req));
    router.addRoute('GET', '/api/export/formats', () => this.handleGetFormats());
  }

  /** GET /api/export — Return all seeds as JSON. */
  private handleExport(): Response {
    const seeds = Array.from(this.seedStore.values());
    return ok({
      version: '4.0',
      exportedAt: Date.now(),
      count: seeds.length,
      seeds,
    });
  }

  /** POST /api/import — Import seeds from JSON payload. */
  private handleImport(req: Request): Response {
    if (!isRecord(req.body)) {
      return badRequest('Request body must be a JSON object with { seeds }');
    }

    const seedsRaw = req.body['seeds'];
    if (!Array.isArray(seedsRaw)) {
      return badRequest('Field "seeds" must be an array of UniversalSeed objects');
    }

    let imported = 0;
    let skipped = 0;

    for (const raw of seedsRaw) {
      if (!isRecord(raw)) {
        skipped += 1;
        continue;
      }

      const hash = stringField(raw, '$hash');
      const name = stringField(raw, '$name');
      const domain = stringField(raw, '$domain');
      const gst = stringField(raw, '$gst');

      if (!hash || !name || !domain || gst !== '4.0') {
        skipped += 1;
        continue;
      }

      // Accept the seed as-is (trusted import)
      this.seedStore.set(hash, raw as unknown as UniversalSeed);
      imported += 1;
    }

    this.eventBus.emit({
      type: 'world.changed',
      action: 'import',
      seedCount: this.seedStore.size,
      timestamp: Date.now(),
    });

    return ok({ imported, skipped, totalSeeds: this.seedStore.size });
  }

  /** GET /api/export/formats — Return available export formats. */
  private handleGetFormats(): Response {
    return ok({ formats: [...EXPORT_FORMATS] });
  }
}

// ─────────────────────────────────────────────
// SSEManager — Server-Sent Events
// ─────────────────────────────────────────────

/** SSE client registration. */
export interface SSEClient {
  readonly id: string;
  readonly filter?: string[];
}

/**
 * Server-Sent Events manager for broadcasting real-time updates.
 *
 * Maintains a registry of connected clients with optional event type filters.
 * Provides SSE wire format serialization and broadcast targeting.
 */
export class SSEManager {
  private readonly clients: Map<string, SSEClient> = new Map();

  /** Register a new SSE client. */
  addClient(id: string, filter?: string[]): void {
    this.clients.set(id, { id, filter });
  }

  /** Remove an SSE client by id. */
  removeClient(id: string): void {
    this.clients.delete(id);
  }

  /**
   * Broadcast an event to all matching clients.
   * Returns the list of client IDs that received the event.
   * A client receives the event if it has no filter or the event type is in its filter.
   */
  broadcast(eventType: string, data: unknown): string[] {
    const receivedIds: string[] = [];

    for (const [clientId, client] of this.clients) {
      if (!client.filter || client.filter.includes(eventType)) {
        receivedIds.push(clientId);
      }
    }

    return receivedIds;
  }

  /**
   * Format an event in SSE wire format.
   * Returns: `event: <type>\ndata: <json>\n\n`
   */
  formatEvent(type: string, data: unknown): string {
    const jsonData = JSON.stringify(data);
    return `event: ${type}\ndata: ${jsonData}\n\n`;
  }

  /** Get the number of connected clients. */
  getClientCount(): number {
    return this.clients.size;
  }

  /** Get all registered client IDs. */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }
}

// ─────────────────────────────────────────────
// ServerConfig — Server configuration
// ─────────────────────────────────────────────

/** Server configuration for the WebEngine. */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly corsOrigins: string[];
  readonly staticDir?: string;
  readonly autoSaveInterval: number;
}

/** Default server configuration. */
export const DEFAULT_CONFIG: ServerConfig = {
  port: 5001,
  host: '0.0.0.0',
  corsOrigins: ['*'],
  autoSaveInterval: 30000,
};

/** Pre-built starter seeds for first-time users. */
export function createStarterSeeds(rng: DeterministicRNG): UniversalSeed[] {
  const starterRng = rng.fork('starter-seeds');

  const seeds: UniversalSeed[] = [
    createSeed(
      'Forest Guardian',
      'organism',
      {
        health: { type: 'scalar', value: 80, min: 0, max: 100 },
        speed: { type: 'scalar', value: 5, min: 1, max: 20 },
        element: { type: 'categorical', value: 'earth', options: ['fire', 'water', 'earth', 'air'] },
        position: { type: 'vector', value: [0, 0, 0], dimensions: 3 },
      },
      starterRng,
    ),
    createSeed(
      'Sky Racer',
      'vehicle',
      {
        thrust: { type: 'scalar', value: 150, min: 50, max: 500 },
        weight: { type: 'scalar', value: 1200, min: 500, max: 3000 },
        fuel: { type: 'scalar', value: 100, min: 0, max: 100 },
        style: { type: 'categorical', value: 'sleek', options: ['sleek', 'bulky', 'organic', 'angular'] },
      },
      starterRng,
    ),
    createSeed(
      'Crystal Cavern',
      'terrain',
      {
        depth: { type: 'scalar', value: 50, min: 10, max: 200 },
        luminosity: { type: 'scalar', value: 0.6, min: 0, max: 1 },
        moisture: { type: 'scalar', value: 0.8, min: 0, max: 1 },
        biome: { type: 'categorical', value: 'cave', options: ['cave', 'forest', 'desert', 'ocean', 'mountain'] },
        color: { type: 'vector', value: [0.3, 0.5, 0.9], dimensions: 3 },
      },
      starterRng,
    ),
    createSeed(
      'Battle Hymn',
      'music',
      {
        tempo: { type: 'scalar', value: 140, min: 60, max: 200 },
        intensity: { type: 'scalar', value: 0.8, min: 0, max: 1 },
        key: { type: 'categorical', value: 'D minor', options: ['C major', 'D minor', 'E major', 'A minor', 'G major'] },
        dynamics: {
          type: 'timeseries',
          keyframes: [
            { t: 0, v: 0.3 },
            { t: 0.25, v: 0.6 },
            { t: 0.5, v: 1.0 },
            { t: 0.75, v: 0.7 },
            { t: 1.0, v: 0.9 },
          ],
          interpolation: 'cubic',
        },
      },
      starterRng,
    ),
    createSeed(
      'Nebula Shader',
      'shader',
      {
        complexity: { type: 'scalar', value: 0.7, min: 0, max: 1 },
        colorShift: { type: 'scalar', value: 0.5, min: 0, max: 1 },
        turbulence: { type: 'scalar', value: 0.4, min: 0, max: 1 },
        palette: { type: 'categorical', value: 'cosmic', options: ['cosmic', 'fire', 'ocean', 'neon', 'pastel'] },
      },
      starterRng,
    ),
  ];

  return seeds;
}

// ─────────────────────────────────────────────
// WebEngine — Top-level entry point
// ─────────────────────────────────────────────

/** Pick an element keyword based on name hints or RNG. */
function pickElement(name: string, rng: DeterministicRNG): string {
  const lower = name.toLowerCase();
  const elements = ['fire', 'water', 'earth', 'air', 'lightning', 'ice', 'shadow', 'light'];
  for (const el of elements) {
    if (lower.includes(el)) return el;
  }
  // Check related keywords
  if (lower.includes('flame') || lower.includes('burn') || lower.includes('lava')) return 'fire';
  if (lower.includes('storm') || lower.includes('thunder') || lower.includes('electric')) return 'lightning';
  if (lower.includes('frost') || lower.includes('cold') || lower.includes('snow')) return 'ice';
  if (lower.includes('dark') || lower.includes('night') || lower.includes('void')) return 'shadow';
  if (lower.includes('holy') || lower.includes('sun') || lower.includes('radiant')) return 'light';
  if (lower.includes('ocean') || lower.includes('sea') || lower.includes('aqua')) return 'water';
  if (lower.includes('wind') || lower.includes('sky') || lower.includes('cloud')) return 'air';
  if (lower.includes('stone') || lower.includes('rock') || lower.includes('mountain')) return 'earth';
  return elements[Math.floor(rng.next() * elements.length)]!;
}

/** Server status summary returned by WebEngine.getStatus(). */
export interface WebEngineStatus {
  readonly seedCount: number;
  readonly sseClients: number;
  readonly routeCount: number;
  readonly uptime: number;
  readonly config: ServerConfig;
}

/**
 * Top-level web engine that wires all controllers, router, and SSE together.
 *
 * Construct with optional config and RNG. All controllers are auto-registered
 * in the constructor. Use `handle(req)` as the main entry point for processing
 * requests from any HTTP framework adapter.
 */
export class WebEngine {
  readonly router: Router;
  readonly sse: SSEManager;
  readonly config: ServerConfig;
  readonly eventBus: EventBus;

  private readonly rng: DeterministicRNG;
  private readonly agent: GSPLAgent;
  private readonly forge: Forge;
  private readonly seedController: SeedController;
  private readonly evolutionController: EvolutionController;
  private readonly worldController: WorldController;
  private readonly forgeController: ForgeController;
  private readonly agentController: AgentController;
  private readonly exportController: ExportController;
  private readonly startTime: number;

  constructor(config?: Partial<ServerConfig>, rng?: DeterministicRNG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = rng ?? new DeterministicRNG('gspl-paradigm-web');
    this.router = new Router();
    this.sse = new SSEManager();
    this.eventBus = new EventBus({ maxReplaySize: 100 });
    this.startTime = Date.now();

    // Core engine instances
    this.agent = new GSPLAgent({ rngSeed: 42 });
    this.forge = new Forge(this.rng);

    // Initialize controllers
    this.seedController = new SeedController(this.rng, this.eventBus);
    this.evolutionController = new EvolutionController(
      this.seedController.getStore(),
      this.rng,
      this.eventBus,
    );
    this.worldController = new WorldController(
      this.seedController.getStore(),
      this.eventBus,
    );
    this.forgeController = new ForgeController(
      this.seedController.getStore(),
      this.forge,
      this.eventBus,
    );
    this.agentController = new AgentController(this.agent);
    this.exportController = new ExportController(
      this.seedController.getStore(),
      this.eventBus,
    );

    // Register agent tools so the 10-stage pipeline can dispatch to real operations
    this.registerAgentTools();

    // Register all routes
    this.seedController.register(this.router);
    this.evolutionController.register(this.router);
    this.worldController.register(this.router);
    this.forgeController.register(this.router);
    this.agentController.register(this.router);
    this.exportController.register(this.router);

    // Wire SSE broadcasting to event bus
    this.eventBus.onAny((event) => {
      this.sse.broadcast(event.type, event);
    });

    // Load starter seeds
    const starters = createStarterSeeds(this.rng);
    for (const seed of starters) {
      this.seedController.addSeed(seed);
    }
  }

  /**
   * Derive sensible default genes from a seed name and domain.
   * Uses deterministic RNG so identical names produce identical genes.
   */
  static deriveGenes(name: string, domain: string, rng: DeterministicRNG): GeneMap {
    const seedRng = rng.fork(name);
    const genes: GeneMap = {};

    // Domain-specific core stats
    switch (domain) {
      case 'organism':
        genes['health'] = { type: 'scalar', value: Math.round(40 + seedRng.next() * 60), min: 0, max: 100 };
        genes['strength'] = { type: 'scalar', value: Math.round(20 + seedRng.next() * 80), min: 0, max: 100 };
        genes['speed'] = { type: 'scalar', value: Math.round(1 + seedRng.next() * 19), min: 1, max: 20 };
        genes['element'] = { type: 'categorical', value: pickElement(name, seedRng), options: ['fire', 'water', 'earth', 'air', 'lightning', 'ice', 'shadow', 'light'] };
        break;
      case 'vehicle':
        genes['thrust'] = { type: 'scalar', value: Math.round(50 + seedRng.next() * 450), min: 50, max: 500 };
        genes['weight'] = { type: 'scalar', value: Math.round(500 + seedRng.next() * 2500), min: 500, max: 3000 };
        genes['fuel'] = { type: 'scalar', value: Math.round(30 + seedRng.next() * 70), min: 0, max: 100 };
        genes['style'] = { type: 'categorical', value: ['sleek', 'bulky', 'organic', 'angular'][Math.floor(seedRng.next() * 4)]!, options: ['sleek', 'bulky', 'organic', 'angular'] };
        break;
      case 'terrain':
        genes['depth'] = { type: 'scalar', value: Math.round(10 + seedRng.next() * 190), min: 10, max: 200 };
        genes['moisture'] = { type: 'scalar', value: +(seedRng.next()).toFixed(2), min: 0, max: 1 };
        genes['luminosity'] = { type: 'scalar', value: +(seedRng.next()).toFixed(2), min: 0, max: 1 };
        genes['biome'] = { type: 'categorical', value: ['cave', 'forest', 'desert', 'ocean', 'mountain'][Math.floor(seedRng.next() * 5)]!, options: ['cave', 'forest', 'desert', 'ocean', 'mountain'] };
        break;
      case 'music':
        genes['tempo'] = { type: 'scalar', value: Math.round(60 + seedRng.next() * 140), min: 60, max: 200 };
        genes['intensity'] = { type: 'scalar', value: +(seedRng.next()).toFixed(2), min: 0, max: 1 };
        genes['key'] = { type: 'categorical', value: ['C major', 'D minor', 'E major', 'A minor', 'G major'][Math.floor(seedRng.next() * 5)]!, options: ['C major', 'D minor', 'E major', 'A minor', 'G major'] };
        break;
      case 'shader':
        genes['complexity'] = { type: 'scalar', value: +(seedRng.next()).toFixed(2), min: 0, max: 1 };
        genes['turbulence'] = { type: 'scalar', value: +(seedRng.next()).toFixed(2), min: 0, max: 1 };
        genes['palette'] = { type: 'categorical', value: ['cosmic', 'fire', 'ocean', 'neon', 'pastel'][Math.floor(seedRng.next() * 5)]!, options: ['cosmic', 'fire', 'ocean', 'neon', 'pastel'] };
        break;
      default:
        genes['power'] = { type: 'scalar', value: Math.round(20 + seedRng.next() * 80), min: 0, max: 100 };
        genes['rarity'] = { type: 'scalar', value: +(seedRng.next()).toFixed(2), min: 0, max: 1 };
        genes['type'] = { type: 'categorical', value: domain, options: [domain, 'generic'] };
        break;
    }

    return genes;
  }

  /**
   * Register tool executors on the agent's ToolRegistry.
   * These bridge the agent's NLP intent classification to real controller operations.
   * When a user says "create a fire dragon", the agent classifies intent as "create",
   * searches the registry, finds "create_seed", and dispatches to createSeed().
   */
  private registerAgentTools(): void {
    const store = this.seedController.getStore();
    const rng = this.rng;
    const eventBus = this.eventBus;
    const forge = this.forge;

    // Tool: create_seed — matches intent.type "create"
    this.agent.toolRegistry.register(
      {
        id: 'create_seed',
        name: 'Create Seed',
        description: 'Create a new seed entity in the world',
        category: 'seed_management',
        parameters: [
          { name: 'name', type: 'string', description: 'Name of the seed', required: true },
          { name: 'domain', type: 'string', description: 'Domain (organism, vehicle, terrain, etc.)', required: false },
        ],
      },
      async (params: Record<string, unknown>) => {
        const name = String(params['name'] ?? 'Unnamed');
        const domain = String(params['domain'] ?? 'organism') as SeedDomain;
        const genes: GeneMap = (params['genes'] as GeneMap) ?? WebEngine.deriveGenes(name, domain, rng);
        const seed = createSeed(name, domain, genes, rng);
        store.set(seed.$hash, seed);
        eventBus.emit({ type: 'seed.created', seed, timestamp: Date.now() });
        return {
          success: true,
          message: `Created seed "${name}" (${domain}) with hash ${seed.$hash}`,
          data: seed,
          durationMs: 0,
        };
      },
    );

    // Tool: list_seeds — matches intent.type "list" and "query"
    this.agent.toolRegistry.register(
      {
        id: 'list_seeds',
        name: 'List Seeds',
        description: 'List and query all seeds in the world',
        category: 'seed_management',
        parameters: [],
      },
      async () => {
        const seeds = Array.from(store.values());
        return {
          success: true,
          message: `${seeds.length} seed(s) in world`,
          data: seeds,
          durationMs: 0,
        };
      },
    );

    // Tool: get_seed — matches intent.type "inspect"
    this.agent.toolRegistry.register(
      {
        id: 'get_seed',
        name: 'Inspect Seed',
        description: 'Get detailed information about a specific seed by hash or inspect it',
        category: 'seed_management',
        parameters: [
          { name: 'hash', type: 'string', description: 'Seed hash', required: true },
        ],
      },
      async (params: Record<string, unknown>) => {
        const hash = String(params['hash'] ?? params['target'] ?? '');
        const seed = store.get(hash);
        if (!seed) {
          return { success: false, message: `Seed not found: ${hash}`, durationMs: 0, error: 'not_found' };
        }
        return { success: true, message: `Seed "${seed.$name}" (${seed.$domain})`, data: seed, durationMs: 0 };
      },
    );

    // Tool: evolve — matches intent.type "evolve"
    this.agent.toolRegistry.register(
      {
        id: 'evolve_seeds',
        name: 'Evolve Seeds',
        description: 'Run evolution on seeds with tournament selection, breeding, and mutation',
        category: 'evolution',
        parameters: [
          { name: 'generations', type: 'number', description: 'Number of generations', required: false },
          { name: 'populationSize', type: 'number', description: 'Population size', required: false },
        ],
      },
      async (params: Record<string, unknown>) => {
        const generations = Number(params['generations'] ?? 5);
        const populationSize = Number(params['populationSize'] ?? 8);
        const seeds = Array.from(store.values());

        if (seeds.length < 2) {
          return { success: false, message: 'Need at least 2 seeds to evolve', durationMs: 0, error: 'insufficient_seeds' };
        }

        // Build initial population from existing seeds (cycle if needed)
        const population: UniversalSeed[] = [];
        for (let i = 0; i < populationSize; i++) {
          population.push(seeds[i % seeds.length]!);
        }

        let current = population;
        for (let gen = 0; gen < generations; gen++) {
          const next: UniversalSeed[] = [];
          // Keep top seed unchanged (elitism)
          next.push(current[0]!);
          // Breed + mutate remainder
          for (let i = 1; i < current.length; i++) {
            const parentA = current[Math.floor(rng.next() * current.length)]!;
            const parentB = current[Math.floor(rng.next() * current.length)]!;
            const child = breedSeeds(parentA, parentB, 'uniform', 0.5, rng);
            const mutated = mutateSeed(child, 0.3, rng);
            next.push(mutated);
          }
          current = next;
        }

        // Store evolved seeds
        for (const seed of current) {
          store.set(seed.$hash, seed);
        }

        eventBus.emit({
          type: 'world.changed',
          action: 'evolution',
          seedCount: store.size,
          timestamp: Date.now(),
        });

        return {
          success: true,
          message: `Evolved ${current.length} seeds over ${generations} generations`,
          data: current,
          durationMs: 0,
        };
      },
    );

    // Tool: forge_artifact — matches intent.type "forge" and "generate"
    this.agent.toolRegistry.register(
      {
        id: 'forge_artifact',
        name: 'Forge and Generate Artifact',
        description: 'Forge or generate a real artifact from a seed (HTML, game, sprite, music, etc.)',
        category: 'content_generation',
        parameters: [
          { name: 'hash', type: 'string', description: 'Seed hash', required: true },
          { name: 'type', type: 'string', description: 'Artifact type (html_page, html_game, etc.)', required: false },
        ],
      },
      async (params: Record<string, unknown>) => {
        const hash = String(params['hash'] ?? params['target'] ?? '');
        const artifactType = String(params['type'] ?? 'html_page') as ForgeArtifactType;
        const seed = store.get(hash);
        if (!seed) {
          return { success: false, message: `Seed not found: ${hash}`, durationMs: 0, error: 'not_found' };
        }
        const artifact = forge.forge(seed, { type: artifactType });
        return {
          success: true,
          message: `Forged ${artifactType} "${artifact.name}" (${artifact.size} bytes)`,
          data: artifact,
          durationMs: 0,
        };
      },
    );

    // Tool: get_status — matches intent.type "status"
    this.agent.toolRegistry.register(
      {
        id: 'get_world_status',
        name: 'World Status',
        description: 'Get the current status of the world, seeds, and system',
        category: 'world_building',
        parameters: [],
      },
      async () => {
        const seeds = Array.from(store.values());
        const domains = new Map<string, number>();
        for (const s of seeds) {
          domains.set(s.$domain, (domains.get(s.$domain) ?? 0) + 1);
        }
        return {
          success: true,
          message: `World has ${seeds.length} seed(s) across ${domains.size} domain(s)`,
          data: {
            seedCount: seeds.length,
            domains: Object.fromEntries(domains),
            forgeTypes: forge.getSupportedTypes(),
            agentStats: this.agent.getStats(),
          },
          durationMs: 0,
        };
      },
    );
  }

  /**
   * Main entry point for processing requests.
   * Delegates to the router which matches and dispatches to the appropriate controller.
   */
  async handle(req: Request): Promise<Response> {
    return this.router.handle(req);
  }

  /** Get a summary of the current engine status. */
  getStatus(): WebEngineStatus {
    return {
      seedCount: this.seedController.getStore().size,
      sseClients: this.sse.getClientCount(),
      routeCount: this.router.getRoutes().length,
      uptime: Date.now() - this.startTime,
      config: this.config,
    };
  }

  /** Access the seed store directly (for testing and integration). */
  getSeedStore(): Map<string, UniversalSeed> {
    return this.seedController.getStore();
  }
}
