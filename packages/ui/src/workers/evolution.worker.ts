/**
 * Web Worker for running evolution computation off the main thread.
 *
 * Receives evolution configuration and seed population, runs generations
 * in a tight loop, and posts progress updates back to the main thread.
 * This prevents the UI from freezing during long evolution runs.
 */

interface EvolutionWorkerMessage {
  type: 'start';
  config: {
    generations: number;
    populationSize: number;
    mutationRate: number;
  };
  seeds: Array<{
    hash: string;
    name: string;
    fitness: number;
    genes: Record<string, unknown>;
  }>;
}

interface ProgressMessage {
  type: 'progress';
  generation: number;
  bestFitness: number;
  avgFitness: number;
  worstFitness: number;
  populationSize: number;
  diversity: number;
}

interface CompleteMessage {
  type: 'complete';
  totalGenerations: number;
  bestFitness: number;
  avgFitness: number;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

type WorkerOutMessage = ProgressMessage | CompleteMessage | ErrorMessage;

self.addEventListener('message', (event: MessageEvent<EvolutionWorkerMessage>) => {
  const { config, seeds } = event.data;

  try {
    if (seeds.length < 2) {
      const error: ErrorMessage = { type: 'error', message: 'Need at least 2 seeds to evolve' };
      self.postMessage(error);
      return;
    }

    let population = seeds.map((s) => ({ ...s, fitness: s.fitness || Math.random() }));

    for (let gen = 0; gen < config.generations; gen++) {
      // Sort by fitness (descending)
      population.sort((a, b) => b.fitness - a.fitness);

      const nextGen = [];

      // Elitism: keep top seed
      if (population[0]) nextGen.push(population[0]);

      // Fill via tournament selection + mutation
      while (nextGen.length < population.length) {
        const parent = tournamentSelect(population);
        const mutated = mutate(parent, config.mutationRate);
        nextGen.push(mutated);
      }

      population = nextGen;

      // Compute stats
      const fitnesses = population.map((s) => s.fitness);
      const best = Math.max(...fitnesses);
      const worst = Math.min(...fitnesses);
      const avg = fitnesses.reduce((s, f) => s + f, 0) / fitnesses.length;
      const uniqueHashes = new Set(population.map((s) => s.hash));

      const progress: ProgressMessage = {
        type: 'progress',
        generation: gen + 1,
        bestFitness: best,
        avgFitness: avg,
        worstFitness: worst,
        populationSize: population.length,
        diversity: uniqueHashes.size / population.length,
      };
      self.postMessage(progress);
    }

    const fitnesses = population.map((s) => s.fitness);
    const complete: CompleteMessage = {
      type: 'complete',
      totalGenerations: config.generations,
      bestFitness: Math.max(...fitnesses),
      avgFitness: fitnesses.reduce((s, f) => s + f, 0) / fitnesses.length,
    };
    self.postMessage(complete);
  } catch (err) {
    const error: ErrorMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Evolution worker error',
    };
    self.postMessage(error);
  }
});

function tournamentSelect<T extends { fitness: number }>(population: T[]): T {
  const size = Math.min(3, population.length);
  let best = population[Math.floor(Math.random() * population.length)]!;
  for (let i = 1; i < size; i++) {
    const candidate = population[Math.floor(Math.random() * population.length)]!;
    if (candidate.fitness > best.fitness) best = candidate;
  }
  return best;
}

function mutate<T extends { fitness: number; hash: string }>(seed: T, rate: number): T {
  const newFitness = seed.fitness + (Math.random() - 0.5) * rate * 0.5;
  return {
    ...seed,
    fitness: Math.max(0, Math.min(1, newFitness)),
    hash: seed.hash + '_' + Math.random().toString(36).slice(2, 6),
  };
}

export {};
