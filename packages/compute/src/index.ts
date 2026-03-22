/**
 * @paradigm/compute
 *
 * Neural computation and parallel processing for the GSPL Paradigm platform.
 * Provides tensor operations, neural networks, dual intelligence, symbolic
 * reasoning, and CPU/GPU compute backends. Zero external dependencies.
 */

// ---------------------------------------------------------------------------
// Tensor
// ---------------------------------------------------------------------------

export interface Tensor {
  readonly data: Float64Array;
  readonly shape: readonly number[];
}

/** Create a tensor filled with `fill` (default 0). */
export function createTensor(shape: readonly number[], fill = 0): Tensor {
  const size = shape.reduce((acc, d) => acc * d, 1);
  return { data: new Float64Array(size).fill(fill), shape };
}

function assertSameShape(a: Tensor, b: Tensor, op: string): void {
  if (a.data.length !== b.data.length) {
    throw new RangeError(
      `${op}: tensor shape mismatch — lengths ${a.data.length} vs ${b.data.length}`,
    );
  }
}

export function tensorAdd(a: Tensor, b: Tensor): Tensor {
  assertSameShape(a, b, 'tensorAdd');
  const out = new Float64Array(a.data.length);
  for (let i = 0; i < a.data.length; i++) out[i] = (a.data[i] ?? 0) + (b.data[i] ?? 0);
  return { data: out, shape: a.shape };
}

export function tensorMul(a: Tensor, b: Tensor): Tensor {
  assertSameShape(a, b, 'tensorMul');
  const out = new Float64Array(a.data.length);
  for (let i = 0; i < a.data.length; i++) out[i] = (a.data[i] ?? 0) * (b.data[i] ?? 0);
  return { data: out, shape: a.shape };
}

export function tensorScale(t: Tensor, scalar: number): Tensor {
  const out = new Float64Array(t.data.length);
  for (let i = 0; i < t.data.length; i++) out[i] = (t.data[i] ?? 0) * scalar;
  return { data: out, shape: t.shape };
}

export function tensorDot(a: Tensor, b: Tensor): number {
  assertSameShape(a, b, 'tensorDot');
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) sum += (a.data[i] ?? 0) * (b.data[i] ?? 0);
  return sum;
}

export function tensorSoftmax(t: Tensor): Tensor {
  const out = new Float64Array(t.data.length);
  let max = -Infinity;
  for (let i = 0; i < t.data.length; i++) {
    const v = t.data[i] ?? 0;
    if (v > max) max = v;
  }
  let sum = 0;
  for (let i = 0; i < t.data.length; i++) {
    out[i] = Math.exp((t.data[i] ?? 0) - max);
    sum += out[i] ?? 0;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / sum;
  return { data: out, shape: t.shape };
}

export function tensorReLU(t: Tensor): Tensor {
  const out = new Float64Array(t.data.length);
  for (let i = 0; i < t.data.length; i++) out[i] = Math.max(0, t.data[i] ?? 0);
  return { data: out, shape: t.shape };
}

export function tensorSigmoid(t: Tensor): Tensor {
  const out = new Float64Array(t.data.length);
  for (let i = 0; i < t.data.length; i++) out[i] = 1 / (1 + Math.exp(-(t.data[i] ?? 0)));
  return { data: out, shape: t.shape };
}

export function tensorTanh(t: Tensor): Tensor {
  const out = new Float64Array(t.data.length);
  for (let i = 0; i < t.data.length; i++) out[i] = Math.tanh(t.data[i] ?? 0);
  return { data: out, shape: t.shape };
}

/**
 * Matrix multiply: A (aRows × aCols) × B (aCols × bCols) → (aRows × bCols).
 * `a.data` must have length aRows*aCols; `b.data` must have length aCols*bCols.
 */
export function tensorMatMul(
  a: Tensor,
  b: Tensor,
  aRows: number,
  aCols: number,
  bCols: number,
): Tensor {
  if (a.data.length !== aRows * aCols) {
    throw new RangeError(
      `tensorMatMul: a.data.length ${a.data.length} != aRows*aCols ${aRows * aCols}`,
    );
  }
  if (b.data.length !== aCols * bCols) {
    throw new RangeError(
      `tensorMatMul: b.data.length ${b.data.length} != aCols*bCols ${aCols * bCols}`,
    );
  }
  const out = new Float64Array(aRows * bCols);
  for (let r = 0; r < aRows; r++) {
    for (let c = 0; c < bCols; c++) {
      let sum = 0;
      for (let k = 0; k < aCols; k++) {
        sum += (a.data[r * aCols + k] ?? 0) * (b.data[k * bCols + c] ?? 0);
      }
      out[r * bCols + c] = sum;
    }
  }
  return { data: out, shape: [aRows, bCols] };
}

// ---------------------------------------------------------------------------
// Xoshiro256** — parallel-safe deterministic RNG
// ---------------------------------------------------------------------------

/** Xoshiro256** PRNG. Pure state, safe for use in parallel/worker contexts. */
export class Xoshiro256 {
  private s0: bigint;
  private s1: bigint;
  private s2: bigint;
  private s3: bigint;

  /** Initialise with a 64-bit seed. */
  constructor(seed: bigint) {
    // SplitMix64 seeder — ensures good state from any seed
    const sm64 = (z: bigint): bigint => {
      z = BigInt.asUintN(64, z + 0x9e3779b97f4a7c15n);
      z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
      z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
      return BigInt.asUintN(64, z ^ (z >> 31n));
    };
    this.s0 = sm64(seed);
    this.s1 = sm64(this.s0);
    this.s2 = sm64(this.s1);
    this.s3 = sm64(this.s2);
  }

  private rotl(x: bigint, k: bigint): bigint {
    return BigInt.asUintN(64, (x << k) | (x >> (64n - k)));
  }

  /** Advance state and return the next raw uint64 output. */
  private nextBigInt(): bigint {
    const result = BigInt.asUintN(64, this.rotl(BigInt.asUintN(64, this.s1 * 5n), 7n) * 9n);
    const t = BigInt.asUintN(64, this.s1 << 17n);
    this.s2 = BigInt.asUintN(64, this.s2 ^ this.s0);
    this.s3 = BigInt.asUintN(64, this.s3 ^ this.s1);
    this.s1 = BigInt.asUintN(64, this.s1 ^ this.s2);
    this.s0 = BigInt.asUintN(64, this.s0 ^ this.s3);
    this.s2 = BigInt.asUintN(64, this.s2 ^ t);
    this.s3 = this.rotl(this.s3, 45n);
    return result;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    // Use top 53 bits for double precision
    return Number(this.nextBigInt() >> 11n) / 0x20000000000000; // 2^53
  }

  /** Returns a random integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number {
    if (min > max) throw new RangeError(`Xoshiro256.nextInt: min (${min}) > max (${max})`);
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Box-Muller transform: returns a normally-distributed sample.
   * @param mean    Distribution mean (default 0).
   * @param stdDev  Standard deviation (default 1).
   */
  gaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(this.next(), Number.EPSILON);
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z;
  }
}

// ---------------------------------------------------------------------------
// NeuralLayer
// ---------------------------------------------------------------------------

export type Activation = 'relu' | 'sigmoid' | 'tanh' | 'linear' | 'softmax';

export interface NeuralLayerConfig {
  inputSize: number;
  outputSize: number;
  activation: Activation;
}

function applyActivation(t: Tensor, activation: Activation): Tensor {
  switch (activation) {
    case 'relu':    return tensorReLU(t);
    case 'sigmoid': return tensorSigmoid(t);
    case 'tanh':    return tensorTanh(t);
    case 'softmax': return tensorSoftmax(t);
    case 'linear':  return t;
  }
}

/** Single fully-connected layer with Xavier weight initialisation. */
export class NeuralLayer {
  readonly weights: Tensor;
  readonly bias: Tensor;
  readonly config: NeuralLayerConfig;

  constructor(config: NeuralLayerConfig, rng?: Xoshiro256) {
    this.config = config;
    const { inputSize, outputSize } = config;
    const limit = Math.sqrt(6 / (inputSize + outputSize));
    const src = rng ?? new Xoshiro256(42n);
    const wData = new Float64Array(inputSize * outputSize);
    for (let i = 0; i < wData.length; i++) wData[i] = (src.next() * 2 - 1) * limit;
    this.weights = { data: wData, shape: [outputSize, inputSize] };
    this.bias = createTensor([outputSize], 0);
  }

  /** Forward pass: W·x + b → activation. Input must be a 1-D tensor of length inputSize. */
  forward(input: Tensor): Tensor {
    const { inputSize, outputSize } = this.config;
    if (input.data.length !== inputSize) {
      throw new RangeError(
        `NeuralLayer.forward: expected input length ${inputSize}, got ${input.data.length}`,
      );
    }
    // W (outputSize × inputSize) × input (inputSize × 1) → (outputSize × 1)
    const out = tensorMatMul(this.weights, input, outputSize, inputSize, 1);
    const withBias = tensorAdd(out, this.bias);
    return applyActivation(withBias, this.config.activation);
  }
}

// ---------------------------------------------------------------------------
// TransformerBlock — scaled dot-product self-attention
// ---------------------------------------------------------------------------

export interface TransformerBlockConfig {
  dims: number;
  heads: number;
  ffDim: number;
}

/** Minimal single-block transformer with multi-head self-attention + feedforward. */
export class TransformerBlock {
  private readonly cfg: TransformerBlockConfig;
  private readonly wQ: NeuralLayer;
  private readonly wK: NeuralLayer;
  private readonly wV: NeuralLayer;
  private readonly wO: NeuralLayer;
  private readonly ff1: NeuralLayer;
  private readonly ff2: NeuralLayer;

  constructor(cfg: TransformerBlockConfig, rng?: Xoshiro256) {
    this.cfg = cfg;
    const r = rng ?? new Xoshiro256(7n);
    const { dims, ffDim } = cfg;
    this.wQ  = new NeuralLayer({ inputSize: dims, outputSize: dims, activation: 'linear' }, r);
    this.wK  = new NeuralLayer({ inputSize: dims, outputSize: dims, activation: 'linear' }, r);
    this.wV  = new NeuralLayer({ inputSize: dims, outputSize: dims, activation: 'linear' }, r);
    this.wO  = new NeuralLayer({ inputSize: dims, outputSize: dims, activation: 'linear' }, r);
    this.ff1 = new NeuralLayer({ inputSize: dims, outputSize: ffDim, activation: 'relu' }, r);
    this.ff2 = new NeuralLayer({ inputSize: ffDim, outputSize: dims, activation: 'linear' }, r);
  }

  /**
   * Forward pass over a sequence.
   * @param input   Flat tensor of length seqLen * dims.
   * @param seqLen  Number of tokens in the sequence.
   */
  forward(input: Tensor, seqLen: number): Tensor {
    const { dims, heads } = this.cfg;
    const headDim = Math.floor(dims / heads);
    const scale = Math.sqrt(headDim);

    if (input.data.length !== seqLen * dims) {
      throw new RangeError(
        `TransformerBlock.forward: expected ${seqLen * dims} elements, got ${input.data.length}`,
      );
    }

    // Project each token to Q, K, V
    const Q: Float64Array[] = [];
    const K: Float64Array[] = [];
    const V: Float64Array[] = [];
    for (let t = 0; t < seqLen; t++) {
      const tok: Tensor = { data: input.data.slice(t * dims, (t + 1) * dims), shape: [dims] };
      Q.push(this.wQ.forward(tok).data);
      K.push(this.wK.forward(tok).data);
      V.push(this.wV.forward(tok).data);
    }

    // Scaled dot-product attention per head, then concatenate
    const attnOut = new Float64Array(seqLen * dims);
    for (let h = 0; h < heads; h++) {
      const hStart = h * headDim;
      // Compute attention scores seqLen × seqLen
      const scores = new Float64Array(seqLen * seqLen);
      for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j < seqLen; j++) {
          let dot = 0;
          for (let d = 0; d < headDim; d++) {
            dot += ((Q[i] ?? new Float64Array())[hStart + d] ?? 0) *
                   ((K[j] ?? new Float64Array())[hStart + d] ?? 0);
          }
          scores[i * seqLen + j] = dot / scale;
        }
      }
      // Softmax over each row
      for (let i = 0; i < seqLen; i++) {
        const row = scores.slice(i * seqLen, (i + 1) * seqLen);
        const sm = tensorSoftmax({ data: row, shape: [seqLen] });
        // Weighted sum of V
        for (let d = 0; d < headDim; d++) {
          let val = 0;
          for (let j = 0; j < seqLen; j++) {
            val += (sm.data[j] ?? 0) * ((V[j] ?? new Float64Array())[hStart + d] ?? 0);
          }
          attnOut[i * dims + hStart + d] = (attnOut[i * dims + hStart + d] ?? 0) + val;
        }
      }
    }

    // Output projection + feedforward per token with residual
    const outData = new Float64Array(seqLen * dims);
    for (let t = 0; t < seqLen; t++) {
      const slice: Tensor = { data: attnOut.slice(t * dims, (t + 1) * dims), shape: [dims] };
      const orig: Tensor  = { data: input.data.slice(t * dims, (t + 1) * dims), shape: [dims] };
      const proj  = this.wO.forward(slice);
      const res1  = tensorAdd(proj, orig);                  // residual 1
      const ff    = this.ff2.forward(this.ff1.forward(res1));
      const res2  = tensorAdd(ff, res1);                    // residual 2
      for (let d = 0; d < dims; d++) outData[t * dims + d] = res2.data[d] ?? 0;
    }
    return { data: outData, shape: [seqLen, dims] };
  }
}

// ---------------------------------------------------------------------------
// RecurrentCell — RNN / GRU
// ---------------------------------------------------------------------------

export type CellType = 'rnn' | 'gru';

export interface RecurrentCellConfig {
  inputSize: number;
  hiddenSize: number;
  cellType: CellType;
}

/** Single recurrent cell supporting plain RNN and GRU. */
export class RecurrentCell {
  private readonly cfg: RecurrentCellConfig;
  // RNN weights
  private readonly wIH: NeuralLayer;
  private readonly wHH: NeuralLayer;
  // GRU extra weights (update/reset gates)
  private readonly wIZ?: NeuralLayer;
  private readonly wHZ?: NeuralLayer;
  private readonly wIR?: NeuralLayer;
  private readonly wHR?: NeuralLayer;

  constructor(cfg: RecurrentCellConfig, rng?: Xoshiro256) {
    this.cfg = cfg;
    const { inputSize, hiddenSize } = cfg;
    const r = rng ?? new Xoshiro256(13n);
    this.wIH = new NeuralLayer({ inputSize, outputSize: hiddenSize, activation: 'linear' }, r);
    this.wHH = new NeuralLayer({ inputSize: hiddenSize, outputSize: hiddenSize, activation: 'linear' }, r);
    if (cfg.cellType === 'gru') {
      this.wIZ = new NeuralLayer({ inputSize, outputSize: hiddenSize, activation: 'linear' }, r);
      this.wHZ = new NeuralLayer({ inputSize: hiddenSize, outputSize: hiddenSize, activation: 'linear' }, r);
      this.wIR = new NeuralLayer({ inputSize, outputSize: hiddenSize, activation: 'linear' }, r);
      this.wHR = new NeuralLayer({ inputSize: hiddenSize, outputSize: hiddenSize, activation: 'linear' }, r);
    }
  }

  /** Single time step. Returns next hidden state. */
  step(input: Tensor, prevHidden: Tensor): Tensor {
    const { hiddenSize } = this.cfg;
    if (prevHidden.data.length !== hiddenSize) {
      throw new RangeError(
        `RecurrentCell.step: prevHidden length ${prevHidden.data.length} != hiddenSize ${hiddenSize}`,
      );
    }
    if (this.cfg.cellType === 'rnn') {
      // h = tanh(W_ih·x + W_hh·h_prev + b)
      const pre = tensorAdd(this.wIH.forward(input), this.wHH.forward(prevHidden));
      return tensorTanh(pre);
    }
    // GRU
    const z = tensorSigmoid(tensorAdd(this.wIZ!.forward(input), this.wHZ!.forward(prevHidden)));
    const r = tensorSigmoid(tensorAdd(this.wIR!.forward(input), this.wHR!.forward(prevHidden)));
    const hCandRaw = tensorAdd(this.wIH.forward(input), this.wHH.forward(tensorMul(r, prevHidden)));
    const hCand = tensorTanh(hCandRaw);
    // h = (1-z) * h_prev + z * h_cand
    const oneMinusZ = tensorAdd(createTensor([hiddenSize], 1), tensorScale(z, -1));
    return tensorAdd(tensorMul(oneMinusZ, prevHidden), tensorMul(z, hCand));
  }

  /** Process a full sequence. Returns hidden states for each step. */
  forward(sequence: Tensor[], initialHidden?: Tensor): Tensor[] {
    const { hiddenSize } = this.cfg;
    let h = initialHidden ?? createTensor([hiddenSize], 0);
    const outputs: Tensor[] = [];
    for (const x of sequence) {
      h = this.step(x, h);
      outputs.push(h);
    }
    return outputs;
  }
}

// ---------------------------------------------------------------------------
// NeuralNetwork — composable sequential network
// ---------------------------------------------------------------------------

export interface LayerSerialState {
  config: NeuralLayerConfig;
  weights: number[];
  bias: number[];
}

export interface NetworkConfig {
  layers: LayerSerialState[];
}

/** Composable sequential neural network. */
export class NeuralNetwork {
  protected readonly layers: NeuralLayer[] = [];

  /** Append a layer. Returns `this` for chaining. */
  addLayer(config: NeuralLayerConfig, rng?: Xoshiro256): this {
    this.layers.push(new NeuralLayer(config, rng));
    return this;
  }

  /** Sequential forward pass through all layers. */
  forward(input: Tensor): Tensor {
    if (this.layers.length === 0) throw new Error('NeuralNetwork.forward: no layers configured');
    let current = input;
    for (const layer of this.layers) current = layer.forward(current);
    return current;
  }

  /** Total trainable parameter count. */
  getParameterCount(): number {
    return this.layers.reduce(
      (sum, l) => sum + l.weights.data.length + l.bias.data.length,
      0,
    );
  }

  /** Serialise weights for persistence. */
  serialize(): NetworkConfig {
    return {
      layers: this.layers.map((l) => ({
        config: l.config,
        weights: Array.from(l.weights.data),
        bias: Array.from(l.bias.data),
      })),
    };
  }

  /** Restore a network from a serialised config. */
  static deserialize(config: NetworkConfig): NeuralNetwork {
    const net = new NeuralNetwork();
    for (const ls of config.layers) {
      const layer = new NeuralLayer(ls.config);
      (layer.weights as { data: Float64Array }).data.set(ls.weights);
      (layer.bias as { data: Float64Array }).data.set(ls.bias);
      net.layers.push(layer);
    }
    return net;
  }
}

// ---------------------------------------------------------------------------
// EvolvableNeuralNetwork — GA-based weight evolution
// ---------------------------------------------------------------------------

/** Neural network that supports mutation and crossover for evolutionary search. */
export class EvolvableNeuralNetwork extends NeuralNetwork {
  /**
   * Return a copy with each weight perturbed by Gaussian noise with
   * probability `rate`.
   */
  mutate(rate: number, rng: Xoshiro256): EvolvableNeuralNetwork {
    const cfg = this.serialize();
    for (const ls of cfg.layers) {
      ls.weights = ls.weights.map((w) => (rng.next() < rate ? w + rng.gaussian(0, 0.1) : w));
      ls.bias    = ls.bias.map((b) => (rng.next() < rate ? b + rng.gaussian(0, 0.1) : b));
    }
    return EvolvableNeuralNetwork.fromConfig(cfg);
  }

  /**
   * Uniform crossover: each weight taken from either parent with p=0.5.
   */
  crossover(other: EvolvableNeuralNetwork, rng: Xoshiro256): EvolvableNeuralNetwork {
    const cfgA = this.serialize();
    const cfgB = other.serialize();
    if (cfgA.layers.length !== cfgB.layers.length) {
      throw new Error('EvolvableNeuralNetwork.crossover: incompatible architectures');
    }
    const child: NetworkConfig = {
      layers: cfgA.layers.map((la, i) => {
        const lb = cfgB.layers[i]!;
        return {
          config:  la.config,
          weights: la.weights.map((w, j) => (rng.next() < 0.5 ? w : (lb.weights[j] ?? w))),
          bias:    la.bias.map((b, j)    => (rng.next() < 0.5 ? b : (lb.bias[j]    ?? b))),
        };
      }),
    };
    return EvolvableNeuralNetwork.fromConfig(child);
  }

  /**
   * Evaluate fitness as negative mean loss (lower loss → higher fitness).
   * @param lossType  'mse' (default) or 'mae'.
   */
  evaluate(inputs: Tensor[], targets: Tensor[], lossType: 'mse' | 'mae' = 'mse'): number {
    if (inputs.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < inputs.length; i++) {
      const input  = inputs[i]!;
      const target = targets[i]!;
      const pred   = this.forward(input);
      assertSameShape(pred, target, 'EvolvableNeuralNetwork.evaluate');
      for (let j = 0; j < pred.data.length; j++) {
        const diff = (pred.data[j] ?? 0) - (target.data[j] ?? 0);
        total += lossType === 'mse' ? diff * diff : Math.abs(diff);
      }
    }
    return total / (inputs.length * (targets[0]?.data.length ?? 1));
  }

  private static fromConfig(cfg: NetworkConfig): EvolvableNeuralNetwork {
    const net = new EvolvableNeuralNetwork();
    for (const ls of cfg.layers) {
      const layer = new NeuralLayer(ls.config);
      (layer.weights as { data: Float64Array }).data.set(ls.weights);
      (layer.bias    as { data: Float64Array }).data.set(ls.bias);
      net.layers.push(layer);
    }
    return net;
  }
}

// ---------------------------------------------------------------------------
// DualIntelligenceEngine
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  type: 'analytical' | 'synthetic';
  conclusion: string;
  confidence: number;
  reasoning: string[];
  evidence: string[];
}

function zScore(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance) || 1;
  return values.map((v) => (v - mean) / std);
}

/** Dual-mode intelligence engine combining analytical and synthetic reasoning. */
export class DualIntelligenceEngine {
  /**
   * Rule-based analytical path: statistics, outliers, correlations, trends.
   */
  analyzeAnalytical(data: Record<string, number>): AnalysisResult {
    const keys   = Object.keys(data);
    const values = keys.map((k) => data[k] ?? 0);
    const reasoning: string[] = [];
    const evidence: string[]  = [];

    if (values.length === 0) {
      return { type: 'analytical', conclusion: 'No data provided.', confidence: 0, reasoning: [], evidence: [] };
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min  = Math.min(...values);
    const max  = Math.max(...values);
    reasoning.push(`Mean value: ${mean.toFixed(4)}`);
    reasoning.push(`Range: [${min.toFixed(4)}, ${max.toFixed(4)}]`);

    // Outlier detection via z-score
    const zs      = zScore(values);
    const outliers = keys.filter((_, i) => Math.abs(zs[i] ?? 0) > 2);
    if (outliers.length > 0) {
      reasoning.push(`Outliers detected (|z| > 2): ${outliers.join(', ')}`);
      evidence.push(...outliers.map((k) => `${k}=${data[k]?.toFixed(4) ?? 'N/A'}`));
    }

    // Trend: check monotone direction
    let increasing = 0;
    let decreasing = 0;
    for (let i = 1; i < values.length; i++) {
      if ((values[i] ?? 0) > (values[i - 1] ?? 0)) increasing++;
      else if ((values[i] ?? 0) < (values[i - 1] ?? 0)) decreasing++;
    }
    const trend = increasing > decreasing ? 'upward' : decreasing > increasing ? 'downward' : 'stable';
    reasoning.push(`Trend: ${trend}`);
    evidence.push(`trend=${trend}`);

    const confidence = outliers.length > 0 ? 0.85 : 0.7;
    const conclusion = `Analytical summary: ${keys.length} metrics, mean=${mean.toFixed(3)}, ${trend} trend${outliers.length ? `, ${outliers.length} outlier(s)` : ''}.`;

    return { type: 'analytical', conclusion, confidence, reasoning, evidence };
  }

  /**
   * Creative synthetic path: concept blending, metaphors, lateral associations.
   */
  analyzeSynthetic(concepts: string[], context: string): AnalysisResult {
    const reasoning: string[] = [];
    const evidence: string[]  = [];

    if (concepts.length === 0) {
      return { type: 'synthetic', conclusion: 'No concepts to blend.', confidence: 0, reasoning: [], evidence: [] };
    }

    // Concept blending: combine pairs
    const blends: string[] = [];
    for (let i = 0; i < concepts.length - 1; i++) {
      blends.push(`${concepts[i] ?? ''}-${concepts[i + 1] ?? ''}`);
    }
    if (blends.length > 0) {
      reasoning.push(`Conceptual blends: ${blends.join(', ')}`);
      evidence.push(...blends);
    }

    // Metaphor scaffold
    const pivot = concepts[0] ?? 'unknown';
    reasoning.push(`Metaphor: "${pivot}" as lens for context "${context}"`);

    // Lateral associations: reverse concept order as divergent path
    const lateral = [...concepts].reverse().join(' → ');
    reasoning.push(`Lateral pathway: ${lateral}`);
    evidence.push(`lateral:${lateral}`);

    const confidence = Math.min(0.4 + concepts.length * 0.08, 0.9);
    const conclusion = `Synthetic insight: blending [${concepts.join(', ')}] in context "${context}" yields ${blends.length} novel combinations.`;

    return { type: 'synthetic', conclusion, confidence, reasoning, evidence };
  }

  /**
   * Amplify: merge analytical + synthetic results.
   * Confidence rises when both agree on high certainty.
   */
  amplify(analytical: AnalysisResult, synthetic: AnalysisResult): AnalysisResult {
    const agreement = Math.abs(analytical.confidence - synthetic.confidence) < 0.15;
    const amplifiedConfidence = agreement
      ? Math.min((analytical.confidence + synthetic.confidence) / 2 + 0.1, 1.0)
      : (analytical.confidence + synthetic.confidence) / 2;

    const reasoning = [
      `[Analytical] ${analytical.conclusion}`,
      `[Synthetic]  ${synthetic.conclusion}`,
      agreement ? 'Both modes converge — confidence amplified.' : 'Modes diverge — averaged confidence.',
      ...analytical.reasoning,
      ...synthetic.reasoning,
    ];
    const evidence = [...analytical.evidence, ...synthetic.evidence];
    const conclusion = `Amplified: analytical confidence=${analytical.confidence.toFixed(2)}, synthetic confidence=${synthetic.confidence.toFixed(2)}, merged confidence=${amplifiedConfidence.toFixed(2)}.`;

    return {
      type: agreement ? 'analytical' : 'synthetic',
      conclusion,
      confidence: amplifiedConfidence,
      reasoning,
      evidence,
    };
  }
}

// ---------------------------------------------------------------------------
// SymbolicReasoner — first-order forward-chaining inference
// ---------------------------------------------------------------------------

export interface LogicFact {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

export interface LogicRule {
  if: LogicFact[];
  then: LogicFact;
  name: string;
}

function factKey(f: LogicFact): string {
  return `${f.subject}|${f.predicate}|${f.object}`;
}

function factMatches(pattern: LogicFact, fact: LogicFact): boolean {
  return (
    (pattern.subject   === '*' || pattern.subject   === fact.subject)   &&
    (pattern.predicate === '*' || pattern.predicate === fact.predicate) &&
    (pattern.object    === '*' || pattern.object    === fact.object)
  );
}

/** Forward-chaining first-order logic reasoner. */
export class SymbolicReasoner {
  private readonly facts: Map<string, LogicFact> = new Map();
  private readonly rules: LogicRule[] = [];
  private readonly derivationTrace: Map<string, string[]> = new Map();

  addFact(fact: LogicFact): void {
    this.facts.set(factKey(fact), fact);
  }

  addRule(rule: LogicRule): void {
    this.rules.push(rule);
  }

  /** Direct lookup: return facts matching subject and predicate. */
  query(subject: string, predicate: string): LogicFact[] {
    const results: LogicFact[] = [];
    for (const f of this.facts.values()) {
      if (
        (subject   === '*' || f.subject   === subject) &&
        (predicate === '*' || f.predicate === predicate)
      ) {
        results.push(f);
      }
    }
    return results;
  }

  /**
   * Forward chaining: repeatedly apply all rules until no new facts are derived
   * or maxDepth is reached.
   */
  infer(maxDepth = 10): LogicFact[] {
    const derived: LogicFact[] = [];
    for (let depth = 0; depth < maxDepth; depth++) {
      let newFacts = false;
      for (const rule of this.rules) {
        const satisfied = rule.if.every((condition) =>
          [...this.facts.values()].some((f) => factMatches(condition, f)),
        );
        if (!satisfied) continue;
        const key = factKey(rule.then);
        if (!this.facts.has(key)) {
          this.facts.set(key, rule.then);
          this.derivationTrace.set(key, [rule.name]);
          derived.push(rule.then);
          newFacts = true;
        }
      }
      if (!newFacts) break;
    }
    return derived;
  }

  /** Return which rules produced a given derived fact. */
  explain(fact: LogicFact): string[] {
    return this.derivationTrace.get(factKey(fact)) ?? ['No derivation trace — base fact'];
  }

  getFacts(): readonly LogicFact[] {
    return [...this.facts.values()];
  }

  getRules(): readonly LogicRule[] {
    return [...this.rules];
  }
}

// ---------------------------------------------------------------------------
// ComputeBackend interfaces
// ---------------------------------------------------------------------------

export interface ComputeTask {
  id: string;
  type: 'fitness_eval' | 'mutation' | 'crossover' | 'neural_forward' | 'custom';
  data: Float64Array;
  params: Record<string, number>;
}

export interface ComputeResult {
  taskId: string;
  data: Float64Array;
  durationMs: number;
}

export interface ComputeStats {
  tasksCompleted: number;
  totalTimeMs: number;
  avgTaskMs: number;
  peakMemoryBytes: number;
}

export interface ComputeBackend {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  execute(task: ComputeTask): Promise<ComputeResult>;
  executeBatch(tasks: ComputeTask[]): Promise<ComputeResult[]>;
  getStats(): ComputeStats;
}

// ---------------------------------------------------------------------------
// CPUComputeBackend
// ---------------------------------------------------------------------------

function processTask(task: ComputeTask): Float64Array {
  switch (task.type) {
    case 'fitness_eval': {
      // Sum of squares (mock fitness signal)
      let sum = 0;
      for (let i = 0; i < task.data.length; i++) sum += (task.data[i] ?? 0) ** 2;
      return new Float64Array([sum / Math.max(task.data.length, 1)]);
    }
    case 'mutation': {
      const rate  = task.params['rate'] ?? 0.01;
      const scale = task.params['scale'] ?? 0.1;
      const rng   = new Xoshiro256(BigInt(Math.floor((task.params['seed'] ?? 42))));
      const out   = new Float64Array(task.data.length);
      for (let i = 0; i < task.data.length; i++) {
        out[i] = rng.next() < rate
          ? (task.data[i] ?? 0) + rng.gaussian(0, scale)
          : (task.data[i] ?? 0);
      }
      return out;
    }
    case 'crossover': {
      const rng = new Xoshiro256(BigInt(Math.floor((task.params['seed'] ?? 42))));
      const mid = Math.floor(task.data.length / 2);
      const out = new Float64Array(mid);
      for (let i = 0; i < mid; i++) {
        out[i] = rng.next() < 0.5 ? (task.data[i] ?? 0) : (task.data[mid + i] ?? 0);
      }
      return out;
    }
    case 'neural_forward':
    case 'custom':
      // Identity pass-through for extensibility
      return task.data.slice();
  }
}

/** Standard synchronous CPU backend wrapped in Promises. */
export class CPUComputeBackend implements ComputeBackend {
  readonly name = 'cpu';
  private stats: ComputeStats = { tasksCompleted: 0, totalTimeMs: 0, avgTaskMs: 0, peakMemoryBytes: 0 };

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async execute(task: ComputeTask): Promise<ComputeResult> {
    const start = performance.now();
    const data  = processTask(task);
    const durationMs = performance.now() - start;
    this.updateStats(durationMs, data.byteLength);
    return { taskId: task.id, data, durationMs };
  }

  async executeBatch(tasks: ComputeTask[]): Promise<ComputeResult[]> {
    const results: ComputeResult[] = [];
    for (const task of tasks) results.push(await this.execute(task));
    return results;
  }

  getStats(): ComputeStats {
    return { ...this.stats };
  }

  private updateStats(durationMs: number, bytes: number): void {
    this.stats.tasksCompleted++;
    this.stats.totalTimeMs += durationMs;
    this.stats.avgTaskMs    = this.stats.totalTimeMs / this.stats.tasksCompleted;
    if (bytes > this.stats.peakMemoryBytes) this.stats.peakMemoryBytes = bytes;
  }
}

// ---------------------------------------------------------------------------
// WebGPUComputeBackend — stub with CPU fallback
// ---------------------------------------------------------------------------

/** WebGPU backend stub. Falls back to CPU when WebGPU is unavailable (e.g. Node.js). */
export class WebGPUComputeBackend implements ComputeBackend {
  readonly name = 'webgpu';
  private readonly cpuFallback = new CPUComputeBackend();

  async isAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as unknown as Record<string, unknown>;
    return typeof nav['gpu'] !== 'undefined';
  }

  async execute(task: ComputeTask): Promise<ComputeResult> {
    if (await this.isAvailable()) {
      // Real compute-shader implementation would be dispatched here.
      // Falling through to CPU until shader compilation is wired up.
    }
    return this.cpuFallback.execute(task);
  }

  async executeBatch(tasks: ComputeTask[]): Promise<ComputeResult[]> {
    if (await this.isAvailable()) {
      // Batch GPU dispatch would be more efficient; fall through for now.
    }
    return this.cpuFallback.executeBatch(tasks);
  }

  getStats(): ComputeStats {
    return this.cpuFallback.getStats();
  }
}

// ---------------------------------------------------------------------------
// ComputeScheduler — priority queue with backend selection
// ---------------------------------------------------------------------------

interface QueueEntry {
  task: ComputeTask;
  priority: number;
  resolve: (result: ComputeResult) => void;
  reject: (err: unknown) => void;
}

/**
 * Task scheduler that routes to the best available backend.
 * Priority is a positive number — higher value is processed first.
 */
export class ComputeScheduler {
  private readonly backends: ComputeBackend[];
  private readonly queue: QueueEntry[] = [];
  private selectedBackend: ComputeBackend | null = null;
  private processing = false;

  constructor(backends?: ComputeBackend[]) {
    this.backends = backends ?? [new WebGPUComputeBackend(), new CPUComputeBackend()];
  }

  private async resolveBackend(): Promise<ComputeBackend> {
    if (this.selectedBackend !== null) return this.selectedBackend;
    for (const b of this.backends) {
      if (await b.isAvailable()) {
        this.selectedBackend = b;
        return b;
      }
    }
    // CPUComputeBackend is always available; create a fresh one as last resort
    this.selectedBackend = new CPUComputeBackend();
    return this.selectedBackend;
  }

  /** Submit a single task; higher priority values execute first. */
  submit(task: ComputeTask, priority = 0): Promise<ComputeResult> {
    return new Promise<ComputeResult>((resolve, reject) => {
      this.queue.push({ task, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
      void this.drain();
    });
  }

  /** Submit multiple tasks as a batch. */
  async submitBatch(tasks: ComputeTask[], priority = 0): Promise<ComputeResult[]> {
    return Promise.all(tasks.map((t) => this.submit(t, priority)));
  }

  /** Number of tasks currently waiting in the queue. */
  getQueueSize(): number {
    return this.queue.length;
  }

  getStats(): ComputeStats {
    return this.selectedBackend?.getStats() ?? {
      tasksCompleted: 0,
      totalTimeMs: 0,
      avgTaskMs: 0,
      peakMemoryBytes: 0,
    };
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    const backend = await this.resolveBackend();
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry === undefined) break;
      try {
        const result = await backend.execute(entry.task);
        entry.resolve(result);
      } catch (err: unknown) {
        entry.reject(err);
      }
    }
    this.processing = false;
  }
}
