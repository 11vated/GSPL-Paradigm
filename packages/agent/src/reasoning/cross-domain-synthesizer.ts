/**
 * CrossDomainSynthesizer — Identifies breeding opportunities between seeds
 * of different domains.
 *
 * Computes domain compatibility scores, finds gene-type-compatible breeding
 * pairs, and predicts offspring trait inheritance. All logic is deterministic
 * and LLM-free.
 *
 * @packageDocumentation
 */

import type {
  Gene,
  GeneType,
  SeedDomain,
  UniversalSeed,
} from '@paradigm/types';

// ─────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────

/** A pair of seeds identified as breeding-compatible across domains. */
export interface BreedingOpportunity {
  /** First parent seed hash. */
  readonly parentAHash: string;
  /** Second parent seed hash. */
  readonly parentBHash: string;
  readonly parentAName: string;
  readonly parentBName: string;
  readonly domainA: string;
  readonly domainB: string;
  /** 0-1 compatibility between the two domains. */
  readonly domainCompatibility: number;
  /** Number of genes that share a compatible type between the two seeds. */
  readonly sharedGeneCount: number;
  /** Names of the compatible genes. */
  readonly sharedGenes: readonly string[];
  /** Overall breeding fitness: weighted combination of domain compatibility + gene overlap. */
  readonly breedingScore: number;
}

/** Predicted trait an offspring might inherit. */
export interface PredictedTrait {
  readonly gene: string;
  /** Which parent contributed this gene: 'parentA', 'parentB', or 'blended'. */
  readonly source: 'parentA' | 'parentB' | 'blended';
  /** Predicted gene type. */
  readonly predictedType: GeneType;
  /** Predicted gene value (scalar: number, categorical: string, vector: number[]). */
  readonly predictedValue: number | string | number[];
  /** Confidence in this prediction (0-1). */
  readonly confidence: number;
}

// ─────────────────────────────────────────────
// Domain compatibility matrix
// ─────────────────────────────────────────────

type DomainPairKey = `${string}|${string}`;

/**
 * Canonical compatibility scores between domain pairs (0-1).
 * Symmetric: (A,B) = (B,A). Self-pairing is always 1.0.
 * Unlisted pairs default to 0.2.
 */
const DOMAIN_COMPATIBILITY_ENTRIES: ReadonlyArray<readonly [string, string, number]> = [
  // High compatibility (biological affinity)
  ['organism', 'mammal', 0.95],
  ['organism', 'creature', 0.90],
  ['organism', 'insect', 0.80],
  ['organism', 'bird', 0.85],
  ['organism', 'fish', 0.80],
  ['organism', 'plant', 0.60],
  ['mammal', 'bird', 0.70],
  ['mammal', 'fish', 0.55],
  ['mammal', 'insect', 0.50],
  ['bird', 'fish', 0.45],
  ['bird', 'insect', 0.55],
  ['fish', 'insect', 0.40],
  ['plant', 'insect', 0.65],
  ['plant', 'terrain', 0.70],
  ['plant', 'material', 0.40],

  // Moderate compatibility (mechanical affinity)
  ['vehicle', 'robot', 0.85],
  ['weapon', 'robot', 0.70],
  ['weapon', 'vehicle', 0.50],
  ['building', 'terrain', 0.65],
  ['building', 'material', 0.75],
  ['robot', 'weapon', 0.70],

  // Cross-category (bio-mech hybrids)
  ['organism', 'robot', 0.45],
  ['organism', 'vehicle', 0.30],
  ['organism', 'weapon', 0.35],
  ['organism', 'building', 0.20],
  ['plant', 'building', 0.35],
  ['mammal', 'robot', 0.40],
  ['insect', 'robot', 0.50],
  ['bird', 'vehicle', 0.40],
  ['fish', 'vehicle', 0.35],

  // Material/terrain synergies
  ['material', 'weapon', 0.70],
  ['material', 'vehicle', 0.60],
  ['material', 'robot', 0.65],
  ['terrain', 'building', 0.65],
  ['terrain', 'organism', 0.40],
  ['crystal', 'material', 0.80],
  ['crystal', 'weapon', 0.55],

  // Abstract domains (original)
  ['strategy', 'game', 0.85],
  ['rule', 'game', 0.80],
  ['network', 'neural', 0.75],
  ['code', 'network', 0.65],
  ['simulation', 'game', 0.80],
  ['narrative', 'game', 0.75],
  ['ecosystem', 'terrain', 0.75],
  ['ecosystem', 'organism', 0.80],
  ['ecosystem', 'plant', 0.80],

  // ─── Digital/Creative compatibility ───
  ['code', 'ui', 0.80],
  ['code', 'game', 0.75],
  ['code', 'shader', 0.70],
  ['code', 'web', 0.85],
  ['code', 'infrastructure', 0.75],
  ['code', 'simulation', 0.70],
  ['code', 'neural', 0.65],
  ['code', 'compression', 0.60],
  ['code', 'render', 0.55],
  ['code', 'audio', 0.50],
  ['code', 'language', 0.60],
  ['code', 'rule', 0.70],
  ['code', 'security-threat', 0.55],
  ['code', 'memory-store', 0.70],
  ['shader', 'render', 0.95],
  ['shader', 'animation-visual', 0.80],
  ['shader', 'texture', 0.85],
  ['shader', 'game', 0.75],
  ['shader', 'aesthetic', 0.65],
  ['shader', 'particle', 0.60],
  ['shader', 'fluid', 0.55],
  ['shader', 'pattern', 0.60],
  ['texture', 'render', 0.85],
  ['texture', 'animation-visual', 0.70],
  ['texture', 'aesthetic', 0.75],
  ['texture', 'pattern', 0.80],
  ['texture', 'logo', 0.55],
  ['texture', 'game', 0.65],
  ['render', 'game', 0.80],
  ['render', 'cinematic', 0.85],
  ['render', 'animation-visual', 0.85],
  ['render', 'aesthetic', 0.70],
  ['animation-visual', 'game', 0.80],
  ['animation-visual', 'cinematic', 0.75],
  ['animation-visual', 'ui', 0.65],
  ['animation-visual', 'aesthetic', 0.60],

  // ─── Brand/Logo/Design compatibility ───
  ['logo', 'brand', 0.90],
  ['logo', 'ui', 0.65],
  ['logo', 'aesthetic', 0.75],
  ['logo', 'web', 0.50],
  ['brand', 'product', 0.80],
  ['brand', 'ui', 0.60],
  ['brand', 'web', 0.55],
  ['brand', 'aesthetic', 0.70],
  ['brand', 'narrative', 0.55],

  // ─── UI/UX compatibility ───
  ['ui', 'interaction', 0.90],
  ['ui', 'aesthetic', 0.80],
  ['ui', 'web', 0.85],
  ['ui', 'game', 0.65],
  ['ui', 'product', 0.70],
  ['ui', 'animation-visual', 0.65],
  ['interaction', 'game', 0.75],
  ['interaction', 'web', 0.65],
  ['interaction', 'perception', 0.70],
  ['interaction', 'emotion', 0.55],
  ['interaction', 'aesthetic', 0.50],
  ['aesthetic', 'cinematic', 0.75],
  ['aesthetic', 'music', 0.55],
  ['aesthetic', 'product', 0.50],

  // ─── Narrative/Experiential compatibility ───
  ['narrative', 'cinematic', 0.85],
  ['narrative', 'emotion', 0.80],
  ['narrative', 'perception', 0.60],
  ['narrative', 'music', 0.55],
  ['narrative', 'language', 0.75],
  ['narrative', 'strategy', 0.50],
  ['narrative', 'brand', 0.55],
  ['cinematic', 'emotion', 0.75],
  ['cinematic', 'music', 0.70],
  ['cinematic', 'sound', 0.65],
  ['cinematic', 'audio', 0.60],
  ['cinematic', 'perception', 0.55],
  ['cinematic', 'game', 0.70],
  ['emotion', 'music', 0.75],
  ['emotion', 'sound', 0.60],
  ['emotion', 'perception', 0.70],
  ['emotion', 'narrative', 0.80],
  ['emotion', 'game', 0.55],
  ['emotion', 'ui', 0.50],
  ['perception', 'simulation', 0.55],
  ['perception', 'neural', 0.60],
  ['perception', 'intelligence', 0.65],

  // ─── Audio/Music compatibility ───
  ['audio', 'music', 0.95],
  ['audio', 'sound', 0.90],
  ['audio', 'cinematic', 0.70],
  ['audio', 'game', 0.65],
  ['audio', 'compression', 0.60],
  ['audio', 'web', 0.40],
  ['music', 'emotion', 0.75],
  ['music', 'game', 0.65],
  ['music', 'cinematic', 0.70],
  ['music', 'pattern', 0.60],
  ['music', 'narrative', 0.55],
  ['sound', 'game', 0.70],
  ['sound', 'simulation', 0.50],
  ['sound', 'emotion', 0.60],
  ['sound', 'cinematic', 0.65],
  ['sound', 'interaction', 0.55],
  ['sound', 'particle', 0.40],
  ['sound', 'fluid', 0.45],

  // ─── Scientific/Abstract compatibility ───
  ['neural', 'intelligence', 0.90],
  ['neural', 'pattern', 0.75],
  ['neural', 'language', 0.70],
  ['neural', 'simulation', 0.65],
  ['neural', 'quantum', 0.45],
  ['neural', 'code', 0.65],
  ['intelligence', 'strategy', 0.75],
  ['intelligence', 'language', 0.70],
  ['intelligence', 'game', 0.60],
  ['intelligence', 'simulation', 0.60],
  ['intelligence', 'seed-intelligence', 0.85],
  ['quantum', 'molecular', 0.60],
  ['quantum', 'neural', 0.45],
  ['quantum', 'simulation', 0.55],
  ['quantum', 'particle', 0.70],
  ['quantum', 'pattern', 0.40],
  ['molecular', 'particle', 0.75],
  ['molecular', 'material', 0.80],
  ['molecular', 'crystal', 0.85],
  ['molecular', 'fluid', 0.65],
  ['molecular', 'simulation', 0.70],
  ['pattern', 'texture', 0.80],
  ['pattern', 'crystal', 0.70],
  ['pattern', 'aesthetic', 0.65],
  ['pattern', 'fractal', 0.85],
  ['pattern', 'network', 0.55],
  ['language', 'narrative', 0.75],
  ['language', 'code', 0.60],
  ['language', 'intelligence', 0.70],
  ['language', 'neural', 0.70],
  ['strategy', 'simulation', 0.70],
  ['strategy', 'network', 0.55],
  ['strategy', 'intelligence', 0.75],
  ['strategy', 'product', 0.60],

  // ─── Game/Simulation compatibility ───
  ['game', 'simulation', 0.80],
  ['game', 'render', 0.80],
  ['game', 'ui', 0.65],
  ['game', 'sound', 0.70],
  ['game', 'shader', 0.75],
  ['game', 'emotion', 0.55],
  ['simulation', 'ecosystem', 0.85],
  ['simulation', 'fluid', 0.75],
  ['simulation', 'particle', 0.70],
  ['simulation', 'network', 0.60],
  ['simulation', 'city', 0.70],

  // ─── Security compatibility ───
  ['security-threat', 'intrusion', 0.90],
  ['security-threat', 'forensics', 0.75],
  ['security-threat', 'network', 0.65],
  ['security-threat', 'code', 0.55],
  ['security-threat', 'infrastructure', 0.60],
  ['intrusion', 'forensics', 0.80],
  ['intrusion', 'network', 0.70],
  ['intrusion', 'code', 0.50],
  ['forensics', 'memory-store', 0.60],
  ['forensics', 'network', 0.55],

  // ─── Infrastructure/Systems compatibility ───
  ['network', 'infrastructure', 0.80],
  ['network', 'web', 0.70],
  ['network', 'code', 0.65],
  ['network', 'security-threat', 0.65],
  ['infrastructure', 'code', 0.75],
  ['infrastructure', 'web', 0.75],
  ['infrastructure', 'memory-store', 0.70],
  ['infrastructure', 'schedule', 0.60],
  ['infrastructure', 'product', 0.55],
  ['city', 'infrastructure', 0.85],
  ['city', 'ecosystem', 0.65],
  ['city', 'building', 0.80],
  ['city', 'terrain', 0.60],
  ['city', 'simulation', 0.70],
  ['city', 'product', 0.45],
  ['product', 'ui', 0.70],
  ['product', 'web', 0.65],
  ['product', 'code', 0.60],
  ['product', 'strategy', 0.60],
  ['schedule', 'code', 0.55],
  ['schedule', 'infrastructure', 0.60],
  ['schedule', 'simulation', 0.50],
  ['rule', 'code', 0.70],
  ['rule', 'security-threat', 0.65],
  ['rule', 'constraint', 0.80],
  ['rule', 'strategy', 0.60],
  ['constraint', 'simulation', 0.65],
  ['constraint', 'strategy', 0.55],
  ['constraint', 'schedule', 0.60],
  ['constraint', 'rule', 0.80],
  ['memory-store', 'code', 0.70],
  ['memory-store', 'infrastructure', 0.70],
  ['memory-store', 'neural', 0.55],
  ['memory-store', 'compression', 0.50],

  // ─── Physical/Natural compatibility ───
  ['particle', 'fluid', 0.65],
  ['particle', 'molecular', 0.75],
  ['particle', 'quantum', 0.70],
  ['particle', 'simulation', 0.70],
  ['particle', 'void', 0.55],
  ['fluid', 'simulation', 0.75],
  ['fluid', 'terrain', 0.55],
  ['fluid', 'ecosystem', 0.45],
  ['crystal', 'molecular', 0.85],
  ['crystal', 'pattern', 0.70],
  ['crystal', 'aesthetic', 0.50],
  ['void', 'quantum', 0.50],
  ['void', 'particle', 0.55],
  ['void', 'seed-intelligence', 0.45],
  ['seed-intelligence', 'intelligence', 0.85],
  ['seed-intelligence', 'neural', 0.60],
  ['seed-intelligence', 'ecosystem', 0.50],

  // ─── Compression/Web synergies ───
  ['compression', 'web', 0.65],
  ['compression', 'audio', 0.60],
  ['compression', 'texture', 0.55],
  ['compression', 'render', 0.45],
  ['web', 'ui', 0.85],
  ['web', 'product', 0.65],
  ['web', 'brand', 0.55],
] as const;

/** Pre-built lookup map for O(1) compatibility queries. */
const DOMAIN_COMPATIBILITY: ReadonlyMap<DomainPairKey, number> = (() => {
  const map = new Map<DomainPairKey, number>();
  for (const [a, b, score] of DOMAIN_COMPATIBILITY_ENTRIES) {
    map.set(`${a}|${b}`, score);
    map.set(`${b}|${a}`, score);
  }
  return map;
})();

const DEFAULT_COMPATIBILITY = 0.2;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Check if two gene types are compatible for crossover.
 * Same type is always compatible. Scalar and vector are partially compatible.
 */
function areGeneTypesCompatible(a: GeneType, b: GeneType): boolean {
  if (a === b) return true;
  const numericTypes: ReadonlySet<GeneType> = new Set(['scalar', 'vector', 'tensor', 'timeseries']);
  return numericTypes.has(a) && numericTypes.has(b);
}

/**
 * Blend two scalar values with a bias toward the fitter parent.
 */
function blendScalar(
  valA: number,
  valB: number,
  min: number,
  max: number,
  biasA: number = 0.5,
): number {
  const blended = valA * biasA + valB * (1 - biasA);
  return Math.min(max, Math.max(min, blended));
}

// ─────────────────────────────────────────────
// CrossDomainSynthesizer
// ─────────────────────────────────────────────

/**
 * Identifies and scores cross-domain breeding opportunities.
 *
 * Intelligence comes from the DOMAIN_COMPATIBILITY matrix and gene-type
 * matching algorithms. No LLM or network calls.
 */
export class CrossDomainSynthesizer {
  /**
   * Get the compatibility score between two domains.
   *
   * @param domainA - First domain.
   * @param domainB - Second domain.
   * @returns 0-1 compatibility score. Self-pairing returns 1.0.
   */
  getCompatibilityScore(domainA: string, domainB: string): number {
    if (domainA === domainB) return 1.0;
    const key: DomainPairKey = `${domainA}|${domainB}`;
    return DOMAIN_COMPATIBILITY.get(key) ?? DEFAULT_COMPATIBILITY;
  }

  /**
   * Find all viable breeding pairs from a collection of seeds.
   *
   * A pair is viable when:
   * 1. The seeds belong to different domains.
   * 2. Domain compatibility > 0.25.
   * 3. At least one gene name is shared or gene types overlap.
   *
   * Results are sorted by breedingScore descending.
   *
   * @param seeds - Population to scan.
   * @returns Breeding opportunities sorted by quality.
   */
  findBreedingPairs(seeds: readonly UniversalSeed[]): BreedingOpportunity[] {
    const opportunities: BreedingOpportunity[] = [];

    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) {
        const a = seeds[i]!;
        const b = seeds[j]!;

        if (a.$domain === b.$domain) continue;

        const domainCompat = this.getCompatibilityScore(a.$domain, b.$domain);
        if (domainCompat < 0.25) continue;

        // Find shared gene names where types are compatible
        const sharedGenes: string[] = [];
        const genesA = Object.entries(a.genes);
        const genesBMap = new Map(Object.entries(b.genes));

        for (const [name, geneA] of genesA) {
          const geneB = genesBMap.get(name);
          if (geneB && areGeneTypesCompatible(geneA.type, geneB.type)) {
            sharedGenes.push(name);
          }
        }

        // Even without name overlap, type-compatible genes count
        const totalGenesA = genesA.length;
        const totalGenesB = genesBMap.size;
        const maxGenes = Math.max(totalGenesA, totalGenesB, 1);
        const geneOverlapRatio = sharedGenes.length / maxGenes;

        // Combined breeding score
        const breedingScore = domainCompat * 0.6 + geneOverlapRatio * 0.4;

        if (breedingScore > 0.15) {
          opportunities.push({
            parentAHash: a.$hash,
            parentBHash: b.$hash,
            parentAName: a.$name,
            parentBName: b.$name,
            domainA: a.$domain,
            domainB: b.$domain,
            domainCompatibility: domainCompat,
            sharedGeneCount: sharedGenes.length,
            sharedGenes,
            breedingScore,
          });
        }
      }
    }

    opportunities.sort((a, b) => b.breedingScore - a.breedingScore);
    return opportunities;
  }

  /**
   * Predict what traits an offspring would inherit from two parent seeds.
   *
   * Inheritance rules:
   * - Shared scalar genes: blend values (biased toward fitter parent).
   * - Shared categorical genes: pick from the fitter parent.
   * - Shared vector genes: element-wise blend.
   * - Non-shared genes: inherited from whichever parent has them (lower confidence).
   *
   * @param parentA - First parent seed.
   * @param parentB - Second parent seed.
   * @returns Predicted traits for the offspring.
   */
  predictOffspringTraits(
    parentA: UniversalSeed,
    parentB: UniversalSeed,
  ): PredictedTrait[] {
    const predictions: PredictedTrait[] = [];
    const allGeneNames = new Set([
      ...Object.keys(parentA.genes),
      ...Object.keys(parentB.genes),
    ]);

    const fitnessA = this.extractFitness(parentA);
    const fitnessB = this.extractFitness(parentB);
    const biasA = fitnessA + fitnessB > 0
      ? fitnessA / (fitnessA + fitnessB)
      : 0.5;

    for (const name of allGeneNames) {
      const geneA = parentA.genes[name];
      const geneB = parentB.genes[name];

      if (geneA && geneB) {
        // Both parents have this gene
        const prediction = this.predictBlendedTrait(name, geneA, geneB, biasA);
        predictions.push(prediction);
      } else if (geneA) {
        predictions.push(this.predictSoloTrait(name, geneA, 'parentA'));
      } else if (geneB) {
        predictions.push(this.predictSoloTrait(name, geneB, 'parentB'));
      }
    }

    return predictions;
  }

  // ─── Private ─────────────────────────────────

  private extractFitness(seed: UniversalSeed): number {
    if (!seed.$fitness) return 0.5;
    const primary = seed.$fitness['primary'];
    if (typeof primary === 'number') return primary;
    const vals = Object.values(seed.$fitness).filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return 0.5;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  private predictBlendedTrait(
    name: string,
    geneA: Gene,
    geneB: Gene,
    biasA: number,
  ): PredictedTrait {
    // Same-type blending
    if (geneA.type === 'scalar' && geneB.type === 'scalar') {
      const min = Math.min(geneA.min, geneB.min);
      const max = Math.max(geneA.max, geneB.max);
      return {
        gene: name,
        source: 'blended',
        predictedType: 'scalar',
        predictedValue: blendScalar(geneA.value, geneB.value, min, max, biasA),
        confidence: 0.85,
      };
    }

    if (geneA.type === 'categorical' && geneB.type === 'categorical') {
      return {
        gene: name,
        source: biasA >= 0.5 ? 'parentA' : 'parentB',
        predictedType: 'categorical',
        predictedValue: biasA >= 0.5 ? geneA.value : geneB.value,
        confidence: 0.70,
      };
    }

    if (geneA.type === 'vector' && geneB.type === 'vector') {
      const maxDim = Math.max(geneA.dimensions, geneB.dimensions);
      const blended: number[] = [];
      for (let i = 0; i < maxDim; i++) {
        const va = geneA.value[i] ?? 0;
        const vb = geneB.value[i] ?? 0;
        blended.push(va * biasA + vb * (1 - biasA));
      }
      return {
        gene: name,
        source: 'blended',
        predictedType: 'vector',
        predictedValue: blended,
        confidence: 0.80,
      };
    }

    // Fallback: pick from fitter parent
    const winner = biasA >= 0.5 ? geneA : geneB;
    const source = biasA >= 0.5 ? 'parentA' as const : 'parentB' as const;
    return {
      gene: name,
      source,
      predictedType: winner.type,
      predictedValue: this.extractGeneValue(winner),
      confidence: 0.50,
    };
  }

  private predictSoloTrait(
    name: string,
    gene: Gene,
    source: 'parentA' | 'parentB',
  ): PredictedTrait {
    return {
      gene: name,
      source,
      predictedType: gene.type,
      predictedValue: this.extractGeneValue(gene),
      confidence: 0.60,
    };
  }

  private extractGeneValue(gene: Gene): number | string | number[] {
    switch (gene.type) {
      case 'scalar': return gene.value;
      case 'categorical': return gene.value;
      case 'vector': return [...gene.value];
      case 'timeseries': return gene.keyframes.length;
      case 'tensor': return Array.from(gene.data);
      case 'array': return gene.value.length;
      case 'graph': return gene.nodes.size;
      case 'struct': return Object.keys(gene.value).length;
      case 'expression': return gene.source;
    }
  }
}
