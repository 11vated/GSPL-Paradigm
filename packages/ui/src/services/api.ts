import type { UniversalSeed } from '@paradigm/types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Seed Operations ─────────────────────────────────

export async function listSeeds(): Promise<UniversalSeed[]> {
  return request<{ seeds: UniversalSeed[]; count: number }>('/seeds').then(r => r.seeds);
}

export async function getSeed(hash: string): Promise<UniversalSeed> {
  return request<{ seed: UniversalSeed }>(`/seed/${hash}`).then(r => r.seed);
}

export async function createSeed(params: {
  name: string;
  domain: string;
  genes?: Record<string, unknown>;
}): Promise<UniversalSeed> {
  return request<{ seed: UniversalSeed }>('/seed/create', {
    method: 'POST',
    body: JSON.stringify(params),
  }).then(r => r.seed);
}

export async function mutateSeed(hash: string, intensity: number): Promise<UniversalSeed> {
  return request<{ mutated: UniversalSeed }>('/seed/mutate', {
    method: 'POST',
    body: JSON.stringify({ hash, rate: intensity }),
  }).then(r => r.mutated);
}

export async function breedSeeds(hashA: string, hashB: string): Promise<UniversalSeed> {
  return request<{ child: UniversalSeed }>('/seed/breed', {
    method: 'POST',
    body: JSON.stringify({ parent1: hashA, parent2: hashB }),
  }).then(r => r.child);
}

export async function deleteSeed(hash: string): Promise<void> {
  await request(`/seed/${hash}`, { method: 'DELETE' });
}

export async function updateFitness(hash: string, scores: Record<string, number>): Promise<UniversalSeed> {
  return request<{ seed: UniversalSeed }>('/seed/fitness', {
    method: 'POST',
    body: JSON.stringify({ hash, scores }),
  }).then(r => r.seed);
}

// ─── Evolution ───────────────────────────────────────

export interface EvolutionConfig {
  generations: number;
  populationSize: number;
  mutationRate: number;
}

export interface EvolutionResult {
  generations: number;
  finalPopulation: number;
  bestFitness: number;
  averageFitness: number;
}

export async function runEvolution(config: EvolutionConfig): Promise<EvolutionResult> {
  return request<EvolutionResult>('/evolve', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function getEvolutionStatus(): Promise<Record<string, unknown>> {
  return request('/evolution/status');
}

export async function simulate(steps: number): Promise<Record<string, unknown>> {
  return request('/simulate', {
    method: 'POST',
    body: JSON.stringify({ steps }),
  });
}

// ─── Forge ───────────────────────────────────────────

export interface ForgeRequest {
  seedHash: string;
  type: string;
  theme?: string;
}

export interface ForgeResult {
  id: string;
  seedHash: string;
  type: string;
  name: string;
  content: string;
  mimeType: string;
  size: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function forgeArtifact(req: ForgeRequest): Promise<ForgeResult> {
  return request<{ artifact: ForgeResult }>('/forge', {
    method: 'POST',
    body: JSON.stringify({ hash: req.seedHash, type: req.type, theme: req.theme }),
  }).then(r => r.artifact);
}

export async function getForgeTypes(): Promise<string[]> {
  return request<{ types: string[] }>('/forge/types').then(r => r.types);
}

// ─── Agent ───────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AgentResponse {
  reply: string;
  success: boolean;
  intent?: string;
  plan?: string[];
  toolsUsed?: string[];
  data?: unknown;
}

export async function chatWithAgent(message: string): Promise<AgentResponse> {
  return request<{
    reply: string;
    success: boolean;
    intent: string;
    plan: string[];
    toolsUsed: string[];
    data: unknown;
  }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  }).then(r => ({ reply: r.reply, success: r.success, intent: r.intent, plan: r.plan, toolsUsed: r.toolsUsed, data: r.data }));
}

export async function getAgentStatus(): Promise<Record<string, unknown>> {
  return request('/agent/status');
}

// ─── Export/Import ───────────────────────────────────

export async function exportSeeds(): Promise<{ seeds: UniversalSeed[] }> {
  return request('/export');
}

export async function importSeeds(seeds: UniversalSeed[]): Promise<{ imported: number }> {
  return request('/import', {
    method: 'POST',
    body: JSON.stringify({ seeds }),
  });
}

export async function getExportFormats(): Promise<{ formats: string[] }> {
  return request('/export/formats');
}

// ─── System ──────────────────────────────────────────

export async function getStatus(): Promise<{ seedCount: number; routeCount: number; uptime: number }> {
  return request('/status');
}

export async function getHealth(): Promise<{ status: string; uptime: number }> {
  return request('/health');
}

export async function clearWorld(): Promise<void> {
  await request('/world', { method: 'DELETE' });
}
