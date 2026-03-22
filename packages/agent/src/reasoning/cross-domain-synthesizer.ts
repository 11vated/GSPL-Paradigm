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

  // Abstract domains
  ['strategy', 'game', 0.85],
  ['rule', 'game', 0.80],
  ['network', 'neural', 0.75],
  ['code', 'network', 0.60],
  ['simulation', 'game', 0.70],
  ['narrative', 'game', 0.65],
  ['ecosystem', 'terrain', 0.75],
  ['ecosystem', 'organism', 0.80],
  ['ecosystem', 'plant', 0.80],
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
