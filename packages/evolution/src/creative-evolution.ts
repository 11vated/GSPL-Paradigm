/**
 * Creative Evolution Engine — evolves visual genomes toward aesthetic fitness.
 *
 * Tournament selection on composite aesthetic fitness.
 * Produces a population of SpriteGenomes that improve over generations.
 */

import { DeterministicRNG } from '@paradigm/rng';
import { SpriteGenome } from './creative-genomes.js';
import { compositeAestheticFitness } from './creative-fitness.js';

export interface CreativeEvolutionConfig {
  readonly populationSize: number;
  readonly generations: number;
  readonly mutationRate: number;
  readonly tournamentSize: number;
  readonly elitismCount: number;
}

export interface CreativeEvolutionResult {
  readonly bestGenome: SpriteGenome;
  readonly bestFitness: number;
  readonly fitnessHistory: readonly number[];
  readonly finalPopulation: readonly SpriteGenome[];
  readonly generationsRun: number;
}

const DEFAULT_CONFIG: CreativeEvolutionConfig = {
  populationSize: 16,
  generations: 20,
  mutationRate: 0.15,
  tournamentSize: 3,
  elitismCount: 2,
};

/**
 * Evolve a population of SpriteGenomes toward aesthetic fitness.
 * Uses tournament selection, blend crossover, Gaussian mutation.
 */
export class CreativeEvolutionEngine {
  private readonly config: CreativeEvolutionConfig;

  constructor(config?: Partial<CreativeEvolutionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run evolution for N generations.
   * Returns the best genome, fitness history, and final population.
   */
  evolve(rng: DeterministicRNG): CreativeEvolutionResult {
    const { populationSize, generations, mutationRate, tournamentSize, elitismCount } = this.config;

    // Initialize random population
    let population: SpriteGenome[] = [];
    for (let i = 0; i < populationSize; i++) {
      population.push(SpriteGenome.random(rng));
    }

    const fitnessHistory: number[] = [];

    for (let gen = 0; gen < generations; gen++) {
      // Evaluate fitness
      const scored = population.map((genome) => {
        const pixels = genome.renderToGrid(32, 32);
        const fitness = compositeAestheticFitness(genome, pixels);
        return { genome, fitness };
      });

      // Sort by fitness descending
      scored.sort((a, b) => b.fitness - a.fitness);
      fitnessHistory.push(scored[0]?.fitness ?? 0);

      // Build next generation
      const nextGen: SpriteGenome[] = [];

      // Elitism: keep top genomes unchanged
      for (let i = 0; i < Math.min(elitismCount, scored.length); i++) {
        nextGen.push(scored[i]!.genome);
      }

      // Fill rest with tournament selection + crossover + mutation
      while (nextGen.length < populationSize) {
        const parentA = this.tournamentSelect(scored, tournamentSize, rng);
        const parentB = this.tournamentSelect(scored, tournamentSize, rng);

        let child = parentA.crossover(parentB, 0.5, rng);
        child = child.mutate(mutationRate, rng);
        nextGen.push(child);
      }

      population = nextGen;
    }

    // Final evaluation
    const finalScored = population.map((genome) => {
      const pixels = genome.renderToGrid(32, 32);
      return { genome, fitness: compositeAestheticFitness(genome, pixels) };
    });
    finalScored.sort((a, b) => b.fitness - a.fitness);

    return {
      bestGenome: finalScored[0]!.genome,
      bestFitness: finalScored[0]!.fitness,
      fitnessHistory,
      finalPopulation: population,
      generationsRun: generations,
    };
  }

  private tournamentSelect(
    scored: Array<{ genome: SpriteGenome; fitness: number }>,
    size: number,
    rng: DeterministicRNG,
  ): SpriteGenome {
    let best = scored[Math.floor(rng.next() * scored.length)]!;
    for (let i = 1; i < size; i++) {
      const candidate = scored[Math.floor(rng.next() * scored.length)]!;
      if (candidate.fitness > best.fitness) best = candidate;
    }
    return best.genome;
  }
}
