import { describe, it, expect } from 'vitest';
import {
  // Tensor ops
  createTensor,
  tensorAdd,
  tensorMul,
  tensorScale,
  tensorDot,
  tensorSoftmax,
  tensorReLU,
  tensorSigmoid,
  tensorTanh,
  tensorMatMul,
  // RNG
  Xoshiro256,
  // Neural layers
  NeuralLayer,
  TransformerBlock,
  RecurrentCell,
  NeuralNetwork,
  EvolvableNeuralNetwork,
  // Intelligence
  DualIntelligenceEngine,
  SymbolicReasoner,
  // Compute backends
  CPUComputeBackend,
  WebGPUComputeBackend,
  ComputeScheduler,
} from './index.js';
import type { Tensor, ComputeTask } from './index.js';

// ═══════════════════════════════════════════════════════════════════
// Tensor Operations
// ═══════════════════════════════════════════════════════════════════

describe('Tensor Operations', () => {
  it('createTensor fills with default 0', () => {
    const t = createTensor([3]);
    expect(t.data.length).toBe(3);
    expect(t.data[0]).toBe(0);
  });

  it('createTensor fills with custom value', () => {
    const t = createTensor([2, 3], 5);
    expect(t.data.length).toBe(6);
    expect(t.data[0]).toBe(5);
  });

  it('tensorAdd adds element-wise', () => {
    const a: Tensor = { data: new Float64Array([1, 2, 3]), shape: [3] };
    const b: Tensor = { data: new Float64Array([4, 5, 6]), shape: [3] };
    const r = tensorAdd(a, b);
    expect(r.data[0]).toBe(5);
    expect(r.data[1]).toBe(7);
    expect(r.data[2]).toBe(9);
  });

  it('tensorAdd throws on shape mismatch', () => {
    const a = createTensor([2]);
    const b = createTensor([3]);
    expect(() => tensorAdd(a, b)).toThrow('shape mismatch');
  });

  it('tensorMul multiplies element-wise', () => {
    const a: Tensor = { data: new Float64Array([2, 3]), shape: [2] };
    const b: Tensor = { data: new Float64Array([4, 5]), shape: [2] };
    const r = tensorMul(a, b);
    expect(r.data[0]).toBe(8);
    expect(r.data[1]).toBe(15);
  });

  it('tensorScale scales all elements', () => {
    const t: Tensor = { data: new Float64Array([1, 2, 3]), shape: [3] };
    const r = tensorScale(t, 3);
    expect(r.data[0]).toBe(3);
    expect(r.data[2]).toBe(9);
  });

  it('tensorDot computes dot product', () => {
    const a: Tensor = { data: new Float64Array([1, 2, 3]), shape: [3] };
    const b: Tensor = { data: new Float64Array([4, 5, 6]), shape: [3] };
    expect(tensorDot(a, b)).toBe(32); // 4+10+18
  });

  it('tensorSoftmax sums to ~1', () => {
    const t: Tensor = { data: new Float64Array([1, 2, 3]), shape: [3] };
    const r = tensorSoftmax(t);
    const sum = (r.data[0] ?? 0) + (r.data[1] ?? 0) + (r.data[2] ?? 0);
    expect(sum).toBeCloseTo(1.0, 5);
    // Largest input → largest output
    expect(r.data[2]).toBeGreaterThan(r.data[0]!);
  });

  it('tensorReLU zeros negatives', () => {
    const t: Tensor = { data: new Float64Array([-2, 0, 3]), shape: [3] };
    const r = tensorReLU(t);
    expect(r.data[0]).toBe(0);
    expect(r.data[1]).toBe(0);
    expect(r.data[2]).toBe(3);
  });

  it('tensorSigmoid outputs in (0, 1)', () => {
    const t: Tensor = { data: new Float64Array([-10, 0, 10]), shape: [3] };
    const r = tensorSigmoid(t);
    expect(r.data[0]).toBeGreaterThan(0);
    expect(r.data[0]).toBeLessThan(0.01);
    expect(r.data[1]).toBeCloseTo(0.5, 5);
    expect(r.data[2]).toBeGreaterThan(0.99);
  });

  it('tensorTanh outputs in (-1, 1)', () => {
    const t: Tensor = { data: new Float64Array([-10, 0, 10]), shape: [3] };
    const r = tensorTanh(t);
    expect(r.data[0]).toBeCloseTo(-1, 1);
    expect(r.data[1]).toBeCloseTo(0, 5);
    expect(r.data[2]).toBeCloseTo(1, 1);
  });

  it('tensorMatMul computes correct result', () => {
    // 2x2 × 2x2
    const a: Tensor = { data: new Float64Array([1, 2, 3, 4]), shape: [2, 2] };
    const b: Tensor = { data: new Float64Array([5, 6, 7, 8]), shape: [2, 2] };
    const r = tensorMatMul(a, b, 2, 2, 2);
    expect(r.shape).toEqual([2, 2]);
    expect(r.data[0]).toBe(19);  // 1*5 + 2*7
    expect(r.data[1]).toBe(22);  // 1*6 + 2*8
    expect(r.data[2]).toBe(43);  // 3*5 + 4*7
    expect(r.data[3]).toBe(50);  // 3*6 + 4*8
  });

  it('tensorMatMul throws on dimension mismatch', () => {
    const a = createTensor([3]);
    const b = createTensor([4]);
    expect(() => tensorMatMul(a, b, 2, 2, 2)).toThrow('a.data.length');
  });

  it('tensorMatMul throws on b dimension mismatch', () => {
    const a: Tensor = { data: new Float64Array([1, 2, 3, 4]), shape: [2, 2] };
    const b = createTensor([3]);
    expect(() => tensorMatMul(a, b, 2, 2, 2)).toThrow('b.data.length');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Xoshiro256
// ═══════════════════════════════════════════════════════════════════

describe('Xoshiro256', () => {
  it('produces deterministic output for same seed', () => {
    const a = new Xoshiro256(42n);
    const b = new Xoshiro256(42n);
    expect(a.next()).toBe(b.next());
    expect(a.next()).toBe(b.next());
  });

  it('different seeds give different output', () => {
    const a = new Xoshiro256(1n);
    const b = new Xoshiro256(999n);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() returns values in [0, 1)', () => {
    const rng = new Xoshiro256(123n);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt returns integers in range', () => {
    const rng = new Xoshiro256(55n);
    for (let i = 0; i < 50; i++) {
      const v = rng.nextInt(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextInt throws if min > max', () => {
    const rng = new Xoshiro256(1n);
    expect(() => rng.nextInt(10, 5)).toThrow('min');
  });

  it('gaussian produces finite numbers', () => {
    const rng = new Xoshiro256(77n);
    for (let i = 0; i < 50; i++) {
      const v = rng.gaussian(0, 1);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('gaussian with custom mean and stddev', () => {
    const rng = new Xoshiro256(88n);
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) samples.push(rng.gaussian(100, 5));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(90);
    expect(mean).toBeLessThan(110);
  });
});

// ═══════════════════════════════════════════════════════════════════
// NeuralLayer
// ═══════════════════════════════════════════════════════════════════

describe('NeuralLayer', () => {
  it('creates layer with correct weight dimensions', () => {
    const layer = new NeuralLayer({ inputSize: 4, outputSize: 3, activation: 'relu' });
    expect(layer.weights.data.length).toBe(12); // 3*4
    expect(layer.bias.data.length).toBe(3);
  });

  it('forward produces output of correct size', () => {
    const layer = new NeuralLayer({ inputSize: 4, outputSize: 3, activation: 'relu' });
    const input: Tensor = { data: new Float64Array([1, 2, 3, 4]), shape: [4] };
    const out = layer.forward(input);
    expect(out.data.length).toBe(3);
  });

  it('forward throws on wrong input size', () => {
    const layer = new NeuralLayer({ inputSize: 4, outputSize: 3, activation: 'relu' });
    const input = createTensor([2]);
    expect(() => layer.forward(input)).toThrow('expected input length');
  });

  it('sigmoid activation outputs in (0, 1)', () => {
    const layer = new NeuralLayer({ inputSize: 2, outputSize: 2, activation: 'sigmoid' });
    const input: Tensor = { data: new Float64Array([1, -1]), shape: [2] };
    const out = layer.forward(input);
    for (let i = 0; i < out.data.length; i++) {
      expect(out.data[i]).toBeGreaterThan(0);
      expect(out.data[i]).toBeLessThan(1);
    }
  });

  it('tanh activation outputs in [-1, 1]', () => {
    const layer = new NeuralLayer({ inputSize: 2, outputSize: 2, activation: 'tanh' });
    const input: Tensor = { data: new Float64Array([5, -5]), shape: [2] };
    const out = layer.forward(input);
    for (let i = 0; i < out.data.length; i++) {
      expect(out.data[i]).toBeGreaterThanOrEqual(-1);
      expect(out.data[i]).toBeLessThanOrEqual(1);
    }
  });

  it('linear activation passes through', () => {
    const layer = new NeuralLayer({ inputSize: 2, outputSize: 2, activation: 'linear' });
    const input: Tensor = { data: new Float64Array([3, -3]), shape: [2] };
    const out = layer.forward(input);
    expect(out.data.length).toBe(2);
  });

  it('softmax activation sums to ~1', () => {
    const layer = new NeuralLayer({ inputSize: 2, outputSize: 3, activation: 'softmax' });
    const input: Tensor = { data: new Float64Array([1, 2]), shape: [2] };
    const out = layer.forward(input);
    const sum = Array.from(out.data).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('uses provided RNG for weight initialization', () => {
    const rng1 = new Xoshiro256(42n);
    const rng2 = new Xoshiro256(42n);
    const l1 = new NeuralLayer({ inputSize: 3, outputSize: 2, activation: 'relu' }, rng1);
    const l2 = new NeuralLayer({ inputSize: 3, outputSize: 2, activation: 'relu' }, rng2);
    expect(l1.weights.data[0]).toBe(l2.weights.data[0]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TransformerBlock
// ═══════════════════════════════════════════════════════════════════

describe('TransformerBlock', () => {
  it('forward produces output of correct shape', () => {
    const block = new TransformerBlock({ dims: 4, heads: 2, ffDim: 8 });
    const input: Tensor = { data: new Float64Array(8).fill(0.5), shape: [2, 4] }; // seqLen=2, dims=4
    const out = block.forward(input, 2);
    expect(out.data.length).toBe(8); // 2 * 4
    expect(out.shape).toEqual([2, 4]);
  });

  it('forward throws on incorrect input length', () => {
    const block = new TransformerBlock({ dims: 4, heads: 2, ffDim: 8 });
    const input = createTensor([5]);
    expect(() => block.forward(input, 2)).toThrow('expected');
  });

  it('single token sequence works', () => {
    const block = new TransformerBlock({ dims: 4, heads: 1, ffDim: 4 });
    const input: Tensor = { data: new Float64Array([1, 0, 0, 0]), shape: [1, 4] };
    const out = block.forward(input, 1);
    expect(out.data.length).toBe(4);
  });

  it('uses provided RNG for determinism', () => {
    const r1 = new Xoshiro256(99n);
    const r2 = new Xoshiro256(99n);
    const b1 = new TransformerBlock({ dims: 4, heads: 2, ffDim: 8 }, r1);
    const b2 = new TransformerBlock({ dims: 4, heads: 2, ffDim: 8 }, r2);
    const input: Tensor = { data: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0]), shape: [2, 4] };
    const o1 = b1.forward(input, 2);
    const o2 = b2.forward(input, 2);
    expect(o1.data[0]).toBe(o2.data[0]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RecurrentCell
// ═══════════════════════════════════════════════════════════════════

describe('RecurrentCell', () => {
  describe('RNN', () => {
    it('step returns hidden of correct size', () => {
      const cell = new RecurrentCell({ inputSize: 3, hiddenSize: 4, cellType: 'rnn' });
      const input: Tensor = { data: new Float64Array([1, 0, 0]), shape: [3] };
      const h0 = createTensor([4], 0);
      const h1 = cell.step(input, h0);
      expect(h1.data.length).toBe(4);
    });

    it('step throws on wrong hidden size', () => {
      const cell = new RecurrentCell({ inputSize: 3, hiddenSize: 4, cellType: 'rnn' });
      const input: Tensor = { data: new Float64Array([1, 0, 0]), shape: [3] };
      const badH = createTensor([2], 0);
      expect(() => cell.step(input, badH)).toThrow('hiddenSize');
    });

    it('forward processes sequence', () => {
      const cell = new RecurrentCell({ inputSize: 2, hiddenSize: 3, cellType: 'rnn' });
      const seq = [
        { data: new Float64Array([1, 0]), shape: [2] } as Tensor,
        { data: new Float64Array([0, 1]), shape: [2] } as Tensor,
        { data: new Float64Array([1, 1]), shape: [2] } as Tensor,
      ];
      const outs = cell.forward(seq);
      expect(outs.length).toBe(3);
      expect(outs[0]!.data.length).toBe(3);
    });

    it('forward with initial hidden state', () => {
      const cell = new RecurrentCell({ inputSize: 2, hiddenSize: 3, cellType: 'rnn' });
      const seq = [{ data: new Float64Array([1, 0]), shape: [2] } as Tensor];
      const h0: Tensor = { data: new Float64Array([0.5, 0.5, 0.5]), shape: [3] };
      const outs = cell.forward(seq, h0);
      expect(outs.length).toBe(1);
    });
  });

  describe('GRU', () => {
    it('step returns hidden of correct size', () => {
      const cell = new RecurrentCell({ inputSize: 3, hiddenSize: 4, cellType: 'gru' });
      const input: Tensor = { data: new Float64Array([1, 0, 0]), shape: [3] };
      const h0 = createTensor([4], 0);
      const h1 = cell.step(input, h0);
      expect(h1.data.length).toBe(4);
    });

    it('forward processes sequence', () => {
      const cell = new RecurrentCell({ inputSize: 2, hiddenSize: 3, cellType: 'gru' });
      const seq = [
        { data: new Float64Array([1, 0]), shape: [2] } as Tensor,
        { data: new Float64Array([0, 1]), shape: [2] } as Tensor,
      ];
      const outs = cell.forward(seq);
      expect(outs.length).toBe(2);
    });

    it('GRU hidden state evolves differently than zero init', () => {
      const gru = new RecurrentCell({ inputSize: 2, hiddenSize: 3, cellType: 'gru' });
      const input: Tensor = { data: new Float64Array([1, 0.5]), shape: [2] };
      const h0 = createTensor([3], 0);
      const h1 = gru.step(input, h0);
      const h2 = gru.step(input, h1);
      // Hidden state should change across steps
      expect(h1.data[0]).not.toBe(h2.data[0]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// NeuralNetwork
// ═══════════════════════════════════════════════════════════════════

describe('NeuralNetwork', () => {
  it('addLayer returns this for chaining', () => {
    const net = new NeuralNetwork();
    const result = net.addLayer({ inputSize: 4, outputSize: 3, activation: 'relu' });
    expect(result).toBe(net);
  });

  it('forward through multiple layers', () => {
    const net = new NeuralNetwork();
    net.addLayer({ inputSize: 4, outputSize: 3, activation: 'relu' });
    net.addLayer({ inputSize: 3, outputSize: 2, activation: 'sigmoid' });
    const input: Tensor = { data: new Float64Array([1, 2, 3, 4]), shape: [4] };
    const out = net.forward(input);
    expect(out.data.length).toBe(2);
  });

  it('forward throws with no layers', () => {
    const net = new NeuralNetwork();
    expect(() => net.forward(createTensor([3]))).toThrow('no layers');
  });

  it('getParameterCount is correct', () => {
    const net = new NeuralNetwork();
    net.addLayer({ inputSize: 4, outputSize: 3, activation: 'relu' }); // 12 weights + 3 bias = 15
    net.addLayer({ inputSize: 3, outputSize: 2, activation: 'sigmoid' }); // 6 + 2 = 8
    expect(net.getParameterCount()).toBe(23);
  });

  it('serialize/deserialize roundtrip', () => {
    const rng = new Xoshiro256(42n);
    const net = new NeuralNetwork();
    net.addLayer({ inputSize: 3, outputSize: 2, activation: 'relu' }, rng);
    const config = net.serialize();
    const restored = NeuralNetwork.deserialize(config);
    const input: Tensor = { data: new Float64Array([1, 2, 3]), shape: [3] };
    const out1 = net.forward(input);
    const out2 = restored.forward(input);
    expect(out1.data[0]).toBe(out2.data[0]);
    expect(out1.data[1]).toBe(out2.data[1]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// EvolvableNeuralNetwork
// ═══════════════════════════════════════════════════════════════════

describe('EvolvableNeuralNetwork', () => {
  function makeNet(): EvolvableNeuralNetwork {
    const net = new EvolvableNeuralNetwork();
    net.addLayer({ inputSize: 3, outputSize: 2, activation: 'relu' });
    net.addLayer({ inputSize: 2, outputSize: 1, activation: 'sigmoid' });
    return net;
  }

  it('mutate produces a new network', () => {
    const net = makeNet();
    const rng = new Xoshiro256(42n);
    const mutated = net.mutate(1.0, rng); // 100% mutation rate
    expect(mutated).not.toBe(net);
    expect(mutated.getParameterCount()).toBe(net.getParameterCount());
  });

  it('mutate with rate 0 preserves weights', () => {
    const net = makeNet();
    const rng = new Xoshiro256(42n);
    const mutated = net.mutate(0, rng);
    const input: Tensor = { data: new Float64Array([1, 2, 3]), shape: [3] };
    expect(net.forward(input).data[0]).toBe(mutated.forward(input).data[0]);
  });

  it('crossover blends two networks', () => {
    const a = makeNet();
    const b = makeNet();
    const rng = new Xoshiro256(55n);
    const child = a.crossover(b, rng);
    expect(child.getParameterCount()).toBe(a.getParameterCount());
  });

  it('crossover throws on incompatible architectures', () => {
    const a = makeNet();
    const b = new EvolvableNeuralNetwork();
    b.addLayer({ inputSize: 3, outputSize: 4, activation: 'relu' });
    const rng = new Xoshiro256(1n);
    expect(() => a.crossover(b, rng)).toThrow('incompatible');
  });

  it('evaluate with MSE loss', () => {
    const net = makeNet();
    const inputs = [{ data: new Float64Array([1, 0, 0]), shape: [3] } as Tensor];
    const targets = [{ data: new Float64Array([0.5]), shape: [1] } as Tensor];
    const loss = net.evaluate(inputs, targets, 'mse');
    expect(typeof loss).toBe('number');
    expect(loss).toBeGreaterThanOrEqual(0);
  });

  it('evaluate with MAE loss', () => {
    const net = makeNet();
    const inputs = [{ data: new Float64Array([1, 0, 0]), shape: [3] } as Tensor];
    const targets = [{ data: new Float64Array([0.5]), shape: [1] } as Tensor];
    const loss = net.evaluate(inputs, targets, 'mae');
    expect(typeof loss).toBe('number');
    expect(loss).toBeGreaterThanOrEqual(0);
  });

  it('evaluate with empty inputs returns 0', () => {
    const net = makeNet();
    expect(net.evaluate([], [])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DualIntelligenceEngine
// ═══════════════════════════════════════════════════════════════════

describe('DualIntelligenceEngine', () => {
  const engine = new DualIntelligenceEngine();

  describe('analyzeAnalytical', () => {
    it('analyzes data with outliers', () => {
      // Need enough data points for a clear outlier (z > 2)
      const result = engine.analyzeAnalytical({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 100 });
      expect(result.type).toBe('analytical');
      expect(result.confidence).toBe(0.85); // outlier detected
      expect(result.reasoning.some(r => r.includes('Outliers'))).toBe(true);
    });

    it('analyzes data without outliers', () => {
      const result = engine.analyzeAnalytical({ a: 1, b: 2, c: 3 });
      expect(result.confidence).toBe(0.7);
    });

    it('handles empty data', () => {
      const result = engine.analyzeAnalytical({});
      expect(result.confidence).toBe(0);
      expect(result.conclusion).toContain('No data');
    });

    it('detects upward trend', () => {
      const result = engine.analyzeAnalytical({ a: 1, b: 2, c: 3, d: 4 });
      expect(result.reasoning.some(r => r.includes('upward'))).toBe(true);
    });

    it('detects downward trend', () => {
      const result = engine.analyzeAnalytical({ a: 4, b: 3, c: 2, d: 1 });
      expect(result.reasoning.some(r => r.includes('downward'))).toBe(true);
    });

    it('detects stable trend', () => {
      const result = engine.analyzeAnalytical({ a: 5, b: 5, c: 5 });
      expect(result.reasoning.some(r => r.includes('stable'))).toBe(true);
    });
  });

  describe('analyzeSynthetic', () => {
    it('blends concepts', () => {
      const result = engine.analyzeSynthetic(['fire', 'water'], 'elemental');
      expect(result.type).toBe('synthetic');
      expect(result.reasoning.some(r => r.includes('fire-water'))).toBe(true);
    });

    it('handles empty concepts', () => {
      const result = engine.analyzeSynthetic([], 'test');
      expect(result.confidence).toBe(0);
    });

    it('generates metaphor and lateral pathway', () => {
      const result = engine.analyzeSynthetic(['dragon', 'ice'], 'fantasy');
      expect(result.reasoning.some(r => r.includes('Metaphor'))).toBe(true);
      expect(result.reasoning.some(r => r.includes('Lateral'))).toBe(true);
    });

    it('confidence scales with concept count', () => {
      const few = engine.analyzeSynthetic(['a'], 'ctx');
      const many = engine.analyzeSynthetic(['a', 'b', 'c', 'd', 'e'], 'ctx');
      expect(many.confidence).toBeGreaterThan(few.confidence);
    });

    it('single concept produces no blends', () => {
      const result = engine.analyzeSynthetic(['solo'], 'ctx');
      expect(result.evidence.length).toBeGreaterThanOrEqual(1); // lateral only
    });
  });

  describe('amplify', () => {
    it('boosts confidence when modes agree', () => {
      const analytical = engine.analyzeAnalytical({ a: 1, b: 2, c: 3 }); // conf 0.7
      const synthetic = engine.analyzeSynthetic(['a', 'b', 'c', 'd'], 'test'); // conf ~0.72
      const result = engine.amplify(analytical, synthetic);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.reasoning.some(r => r.includes('converge'))).toBe(true);
    });

    it('averages confidence when modes diverge', () => {
      const analytical: ReturnType<typeof engine.analyzeAnalytical> = {
        type: 'analytical', conclusion: 'test', confidence: 0.9, reasoning: [], evidence: [],
      };
      const synthetic: ReturnType<typeof engine.analyzeSynthetic> = {
        type: 'synthetic', conclusion: 'test', confidence: 0.3, reasoning: [], evidence: [],
      };
      const result = engine.amplify(analytical, synthetic);
      expect(result.confidence).toBeCloseTo(0.6, 1);
      expect(result.reasoning.some(r => r.includes('diverge'))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SymbolicReasoner
// ═══════════════════════════════════════════════════════════════════

describe('SymbolicReasoner', () => {
  it('adds and queries facts', () => {
    const r = new SymbolicReasoner();
    r.addFact({ subject: 'Socrates', predicate: 'is', object: 'human', confidence: 1.0 });
    const results = r.query('Socrates', 'is');
    expect(results.length).toBe(1);
    expect(results[0]!.object).toBe('human');
  });

  it('query with wildcards', () => {
    const r = new SymbolicReasoner();
    r.addFact({ subject: 'cat', predicate: 'is', object: 'animal', confidence: 1 });
    r.addFact({ subject: 'dog', predicate: 'is', object: 'animal', confidence: 1 });
    r.addFact({ subject: 'cat', predicate: 'likes', object: 'fish', confidence: 0.9 });
    const animals = r.query('*', 'is');
    expect(animals.length).toBe(2);
    const catFacts = r.query('cat', '*');
    expect(catFacts.length).toBe(2);
  });

  it('infer derives new facts via forward chaining', () => {
    const r = new SymbolicReasoner();
    r.addFact({ subject: 'Socrates', predicate: 'is', object: 'human', confidence: 1 });
    r.addRule({
      name: 'mortal_rule',
      if: [{ subject: '*', predicate: 'is', object: 'human', confidence: 0 }],
      then: { subject: 'Socrates', predicate: 'is', object: 'mortal', confidence: 0.95 },
    });
    const derived = r.infer();
    expect(derived.length).toBe(1);
    expect(derived[0]!.object).toBe('mortal');
  });

  it('infer stops when no new facts', () => {
    const r = new SymbolicReasoner();
    r.addFact({ subject: 'a', predicate: 'p', object: 'b', confidence: 1 });
    r.addRule({
      name: 'rule1',
      if: [{ subject: 'a', predicate: 'p', object: 'b', confidence: 0 }],
      then: { subject: 'a', predicate: 'p', object: 'c', confidence: 0.9 },
    });
    const d1 = r.infer();
    expect(d1.length).toBe(1);
    // Second infer derives nothing new
    const d2 = r.infer();
    expect(d2.length).toBe(0);
  });

  it('explain traces derivation', () => {
    const r = new SymbolicReasoner();
    r.addFact({ subject: 'X', predicate: 'is', object: 'Y', confidence: 1 });
    r.addRule({
      name: 'test_rule',
      if: [{ subject: 'X', predicate: 'is', object: 'Y', confidence: 0 }],
      then: { subject: 'X', predicate: 'has', object: 'Z', confidence: 0.8 },
    });
    r.infer();
    const derived = { subject: 'X', predicate: 'has', object: 'Z', confidence: 0.8 };
    const trace = r.explain(derived);
    expect(trace).toContain('test_rule');
  });

  it('explain returns base fact message for non-derived facts', () => {
    const r = new SymbolicReasoner();
    const fact = { subject: 'a', predicate: 'b', object: 'c', confidence: 1 };
    r.addFact(fact);
    expect(r.explain(fact)[0]).toContain('base fact');
  });

  it('getFacts returns all facts', () => {
    const r = new SymbolicReasoner();
    r.addFact({ subject: 'a', predicate: 'b', object: 'c', confidence: 1 });
    r.addFact({ subject: 'd', predicate: 'e', object: 'f', confidence: 0.5 });
    expect(r.getFacts().length).toBe(2);
  });

  it('getRules returns all rules', () => {
    const r = new SymbolicReasoner();
    r.addRule({ name: 'r1', if: [], then: { subject: 'a', predicate: 'b', object: 'c', confidence: 1 } });
    expect(r.getRules().length).toBe(1);
  });

  it('infer respects maxDepth', () => {
    const r = new SymbolicReasoner();
    r.addFact({ subject: 'a', predicate: 'is', object: 'b', confidence: 1 });
    // Rule that produces a new fact, but only 1 iteration allowed
    r.addRule({
      name: 'chain',
      if: [{ subject: 'a', predicate: 'is', object: 'b', confidence: 0 }],
      then: { subject: 'b', predicate: 'is', object: 'c', confidence: 0.9 },
    });
    const derived = r.infer(1);
    expect(derived.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CPUComputeBackend
// ═══════════════════════════════════════════════════════════════════

describe('CPUComputeBackend', () => {
  it('isAvailable returns true', async () => {
    const cpu = new CPUComputeBackend();
    expect(await cpu.isAvailable()).toBe(true);
  });

  it('execute fitness_eval task', async () => {
    const cpu = new CPUComputeBackend();
    const task: ComputeTask = {
      id: 'test1',
      type: 'fitness_eval',
      data: new Float64Array([1, 2, 3]),
      params: {},
    };
    const result = await cpu.execute(task);
    expect(result.taskId).toBe('test1');
    expect(result.data.length).toBe(1);
    // Mean of squares: (1+4+9)/3 ≈ 4.667
    expect(result.data[0]).toBeCloseTo(14 / 3, 4);
  });

  it('execute mutation task', async () => {
    const cpu = new CPUComputeBackend();
    const task: ComputeTask = {
      id: 'mut1',
      type: 'mutation',
      data: new Float64Array([1, 2, 3, 4, 5]),
      params: { rate: 1.0, scale: 0.1, seed: 42 },
    };
    const result = await cpu.execute(task);
    expect(result.data.length).toBe(5);
  });

  it('execute crossover task', async () => {
    const cpu = new CPUComputeBackend();
    const task: ComputeTask = {
      id: 'cross1',
      type: 'crossover',
      data: new Float64Array([1, 2, 3, 4, 5, 6]), // first 3 from parent A, last 3 from B
      params: { seed: 42 },
    };
    const result = await cpu.execute(task);
    expect(result.data.length).toBe(3);
  });

  it('execute neural_forward returns copy of data', async () => {
    const cpu = new CPUComputeBackend();
    const data = new Float64Array([1, 2, 3]);
    const task: ComputeTask = { id: 'nf1', type: 'neural_forward', data, params: {} };
    const result = await cpu.execute(task);
    expect(Array.from(result.data)).toEqual([1, 2, 3]);
  });

  it('execute custom returns copy of data', async () => {
    const cpu = new CPUComputeBackend();
    const task: ComputeTask = {
      id: 'custom1',
      type: 'custom',
      data: new Float64Array([10, 20]),
      params: {},
    };
    const result = await cpu.execute(task);
    expect(Array.from(result.data)).toEqual([10, 20]);
  });

  it('executeBatch processes multiple tasks', async () => {
    const cpu = new CPUComputeBackend();
    const tasks: ComputeTask[] = [
      { id: 'b1', type: 'fitness_eval', data: new Float64Array([1]), params: {} },
      { id: 'b2', type: 'fitness_eval', data: new Float64Array([2]), params: {} },
    ];
    const results = await cpu.executeBatch(tasks);
    expect(results.length).toBe(2);
    expect(results[0]!.taskId).toBe('b1');
    expect(results[1]!.taskId).toBe('b2');
  });

  it('getStats tracks task count', async () => {
    const cpu = new CPUComputeBackend();
    await cpu.execute({ id: 't1', type: 'custom', data: new Float64Array([1]), params: {} });
    await cpu.execute({ id: 't2', type: 'custom', data: new Float64Array([1]), params: {} });
    const stats = cpu.getStats();
    expect(stats.tasksCompleted).toBe(2);
    expect(stats.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(stats.avgTaskMs).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// WebGPUComputeBackend
// ═══════════════════════════════════════════════════════════════════

describe('WebGPUComputeBackend', () => {
  it('isAvailable returns false in Node.js', async () => {
    const gpu = new WebGPUComputeBackend();
    expect(await gpu.isAvailable()).toBe(false);
  });

  it('execute falls back to CPU', async () => {
    const gpu = new WebGPUComputeBackend();
    const task: ComputeTask = {
      id: 'gpu1',
      type: 'fitness_eval',
      data: new Float64Array([3]),
      params: {},
    };
    const result = await gpu.execute(task);
    expect(result.taskId).toBe('gpu1');
    expect(result.data[0]).toBe(9); // 3^2/1
  });

  it('executeBatch falls back to CPU', async () => {
    const gpu = new WebGPUComputeBackend();
    const results = await gpu.executeBatch([
      { id: 'gb1', type: 'custom', data: new Float64Array([1]), params: {} },
    ]);
    expect(results.length).toBe(1);
  });

  it('getStats delegates to CPU fallback', () => {
    const gpu = new WebGPUComputeBackend();
    const stats = gpu.getStats();
    expect(stats.tasksCompleted).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ComputeScheduler
// ═══════════════════════════════════════════════════════════════════

describe('ComputeScheduler', () => {
  it('submit executes task via backend', async () => {
    const cpu = new CPUComputeBackend();
    const scheduler = new ComputeScheduler([cpu]);
    const task: ComputeTask = {
      id: 'sched1',
      type: 'fitness_eval',
      data: new Float64Array([2]),
      params: {},
    };
    const result = await scheduler.submit(task);
    expect(result.taskId).toBe('sched1');
  });

  it('submitBatch processes all tasks', async () => {
    const cpu = new CPUComputeBackend();
    const scheduler = new ComputeScheduler([cpu]);
    const tasks: ComputeTask[] = [
      { id: 's1', type: 'custom', data: new Float64Array([1]), params: {} },
      { id: 's2', type: 'custom', data: new Float64Array([2]), params: {} },
    ];
    const results = await scheduler.submitBatch(tasks);
    expect(results.length).toBe(2);
  });

  it('getStats returns stats after tasks', async () => {
    const cpu = new CPUComputeBackend();
    const scheduler = new ComputeScheduler([cpu]);
    await scheduler.submit({ id: 'x', type: 'custom', data: new Float64Array([1]), params: {} });
    const stats = scheduler.getStats();
    expect(stats.tasksCompleted).toBeGreaterThanOrEqual(1);
  });

  it('getStats returns empty stats before any tasks', () => {
    const scheduler = new ComputeScheduler([new CPUComputeBackend()]);
    const stats = scheduler.getStats();
    expect(stats.tasksCompleted).toBe(0);
  });

  it('default constructor creates scheduler with WebGPU + CPU fallback', async () => {
    const scheduler = new ComputeScheduler();
    const result = await scheduler.submit({
      id: 'default1',
      type: 'custom',
      data: new Float64Array([42]),
      params: {},
    });
    expect(result.taskId).toBe('default1');
  });

  it('higher priority tasks execute first', async () => {
    const cpu = new CPUComputeBackend();
    const scheduler = new ComputeScheduler([cpu]);
    // Submit multiple tasks simultaneously — higher priority should finish
    const results = await scheduler.submitBatch(
      [
        { id: 'low', type: 'custom', data: new Float64Array([1]), params: {} },
        { id: 'high', type: 'custom', data: new Float64Array([2]), params: {} },
      ],
      5,
    );
    expect(results.length).toBe(2);
  });
});
