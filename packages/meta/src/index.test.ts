import { describe, it, expect } from 'vitest';
import { ExperimentLog, MutationAnalyzer, StrategyOptimizer, ConvergencePredictor, MetaLearningCoordinator } from './index.js';
import type { ExperimentRecord } from './index.js';

function makeExperiment(overrides?: Partial<ExperimentRecord>): ExperimentRecord {
  return {
    id: `exp_${Math.random().toString(36).slice(2)}`,
    domain: 'organism',
    strategy: 'tournament',
    populationSize: 20,
    mutationRate: 0.1,
    generations: 50,
    fitnessTrajectory: [0.1, 0.2, 0.3, 0.4, 0.5],
    finalFitness: 0.5,
    geneConfigs: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ExperimentLog', () => {
  it('records and queries by domain', () => {
    const log = new ExperimentLog();
    log.record(makeExperiment({ domain: 'organism' }));
    log.record(makeExperiment({ domain: 'weapon' }));
    expect(log.getByDomain('organism').length).toBe(1);
    expect(log.size).toBe(2);
  });

  it('queries by minimum fitness', () => {
    const log = new ExperimentLog();
    log.record(makeExperiment({ finalFitness: 0.3 }));
    log.record(makeExperiment({ finalFitness: 0.8 }));
    expect(log.getByMinFitness(0.5).length).toBe(1);
  });
});

describe('MutationAnalyzer', () => {
  it('computes success rate and CI', () => {
    const analyzer = new MutationAnalyzer();
    for (let i = 0; i < 100; i++) analyzer.recordMutation('headRadius', i < 70);

    const analysis = analyzer.analyze('headRadius');
    expect(analysis).not.toBeNull();
    expect(analysis!.successRate).toBeCloseTo(0.7, 1);
    expect(analysis!.confidenceLow).toBeGreaterThan(0.5);
    expect(analysis!.confidenceHigh).toBeLessThanOrEqual(1.0);
    expect(analysis!.classification).toBe('beneficial');
  });

  it('classifies low success as harmful', () => {
    const analyzer = new MutationAnalyzer();
    for (let i = 0; i < 100; i++) analyzer.recordMutation('bad_gene', i < 10);

    const analysis = analyzer.analyze('bad_gene');
    expect(analysis!.classification).toBe('harmful');
  });

  it('returns null for unknown gene', () => {
    const analyzer = new MutationAnalyzer();
    expect(analyzer.analyze('nonexistent')).toBeNull();
  });
});

describe('StrategyOptimizer', () => {
  it('explores untried arms first', () => {
    const opt = new StrategyOptimizer();
    opt.registerStrategies(['a', 'b', 'c']);
    opt.recordTrial('a', 0.5);

    const rec = opt.recommend();
    expect(rec).not.toBeNull();
    // Should recommend untried arm (b or c) with infinite score
    expect(rec!.score).toBe(Infinity);
  });

  it('exploits best arm after many trials', () => {
    const opt = new StrategyOptimizer();
    for (let i = 0; i < 50; i++) opt.recordTrial('good', 0.8);
    for (let i = 0; i < 50; i++) opt.recordTrial('bad', 0.2);

    const rec = opt.recommend();
    expect(rec!.strategyKey).toBe('good');
  });
});

describe('ConvergencePredictor', () => {
  it('detects plateau', () => {
    const predictor = new ConvergencePredictor();
    const trajectory = Array.from({ length: 20 }, () => 0.75); // flat
    const prediction = predictor.predict(trajectory);
    expect(prediction.plateauDetected).toBe(true);
  });

  it('does not detect plateau during improvement', () => {
    const predictor = new ConvergencePredictor();
    const trajectory = Array.from({ length: 20 }, (_, i) => 0.1 + i * 0.04);
    const prediction = predictor.predict(trajectory);
    expect(prediction.plateauDetected).toBe(false);
    expect(prediction.improvementRate).toBeGreaterThan(0);
  });
});

describe('MetaLearningCoordinator', () => {
  it('learn + recommend roundtrip', () => {
    const coord = new MetaLearningCoordinator();
    coord.learn(makeExperiment({ domain: 'organism', finalFitness: 0.8, mutationRate: 0.15 }));

    const rec = coord.recommend('organism');
    expect(rec.domain).toBe('organism');
    expect(rec.basedOnExperiments).toBe(1);
    expect(rec.confidence).toBeGreaterThan(0);
  });

  it('returns default for unknown domain', () => {
    const coord = new MetaLearningCoordinator();
    const rec = coord.recommend('unknown_domain');
    expect(rec.confidence).toBe(0);
    expect(rec.recommendedMutationRate).toBe(0.1);
  });
});
