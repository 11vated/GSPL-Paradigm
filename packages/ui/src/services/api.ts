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

// Seed operations
export async function listSeeds(): Promise<UniversalSeed[]> {
  return request<{ seeds: UniversalSeed[] }>('/seeds').then(r => r.seeds);
}

export async function getSeed(hash: string): Promise<UniversalSeed> {
  return request<{ seed: UniversalSeed }>(`/seeds/${hash}`).then(r => r.seed);
}

export async function createSeed(params: {
  name: string;
  domain: string;
  genes?: Record<string, unknown>;
}): Promise<UniversalSeed> {
  return request<{ seed: UniversalSeed }>('/seeds', {
    method: 'POST',
    body: JSON.stringify(params),
  }).then(r => r.seed);
}

export async function mutateSeed(hash: string, intensity: number): Promise<UniversalSeed> {
  return request<{ seed: UniversalSeed }>(`/seeds/${hash}/mutate`, {
    method: 'POST',
    body: JSON.stringify({ intensity }),
  }).then(r => r.seed);
}

export async function breedSeeds(hashA: string, hashB: string): Promise<UniversalSeed> {
  return request<{ seed: UniversalSeed }>('/seeds/breed', {
    method: 'POST',
    body: JSON.stringify({ parentA: hashA, parentB: hashB }),
  }).then(r => r.seed);
}

export async function deleteSeed(hash: string): Promise<void> {
  await request(`/seeds/${hash}`, { method: 'DELETE' });
}

// Evolution
export interface EvolutionConfig {
  generations: number;
  populationSize: number;
  mutationRate: number;
  selectionStrategy: string;
  templateHash: string;
}

export interface EvolutionResult {
  population: UniversalSeed[];
  stats: Array<{
    generation: number;
    bestFitness: number;
    avgFitness: number;
    populationSize: number;
  }>;
  best: UniversalSeed;
}

export async function runEvolution(config: EvolutionConfig): Promise<EvolutionResult> {
  return request<EvolutionResult>('/evolution', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

// Forge
export interface ForgeRequest {
  seedHash: string;
  type: string;
  theme?: string;
}

export interface ForgeResult {
  type: string;
  name: string;
  content: string;
  mimeType: string;
  size: number;
}

export async function forgeArtifact(req: ForgeRequest): Promise<ForgeResult> {
  return request<ForgeResult>('/forge', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// Agent
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export async function chatWithAgent(message: string): Promise<{ reply: string }> {
  return request<{ reply: string }>('/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

// System
export async function getStatus(): Promise<{ seedCount: number; uptime: number }> {
  return request('/status');
}
