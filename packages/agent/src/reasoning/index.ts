/**
 * Reasoning modules — Pure algorithmic seed intelligence.
 *
 * Five reasoning engines that analyze UniversalSeed data structures without
 * any LLM dependency. Each module encodes domain knowledge into deterministic
 * scoring functions, rule engines, and compatibility matrices.
 *
 * @packageDocumentation
 */

export { SeedReasoner } from './seed-reasoner.js';
export type { SeedAnalysis, TraitComparison, Suggestion } from './seed-reasoner.js';

export { FitnessStrategist } from './fitness-strategist.js';
export type {
  FitnessDistribution,
  PopulationAnalysis,
  EvolutionStats,
  StrategyRecommendation,
} from './fitness-strategist.js';

export { CrossDomainSynthesizer } from './cross-domain-synthesizer.js';
export type { BreedingOpportunity, PredictedTrait } from './cross-domain-synthesizer.js';

export { GapDetector } from './gap-detector.js';
export type { Gap, GapFill, GapSeverity, GapKind } from './gap-detector.js';

export { EmergencePredictor } from './emergence-predictor.js';
export type { PredictedBehavior, Synergy } from './emergence-predictor.js';
