/**
 * Analysis tools for the GSPL agent.
 *
 * These tools provide deep inspection and predictive capabilities — seed structure
 * analysis, population statistics, gap detection, and emergence prediction.
 *
 * @packageDocumentation
 */

import {
  SeedReasoner,
  FitnessStrategist,
  GapDetector,
  EmergencePredictor,
} from '../reasoning/index.js';
import type { AgentTool, AgentToolResult } from './seed-tools.js';
import type { ToolContext } from './tool-context.js';

// ─────────────────────────────────────────────
// Analysis tool factory
// ─────────────────────────────────────────────

/** Create all analysis-related tools with injected context. */
export function createAnalysisTools(ctx: ToolContext): AgentTool[] {
  const reasoner = new SeedReasoner();
  const strategist = new FitnessStrategist();
  const gapDetector = new GapDetector();
  const emergencePredictor = new EmergencePredictor();

  return [
    {
      name: 'analyze_seed',
      description:
        'Deep analysis of a seed\'s structure and completeness. Evaluates gene coverage, ' +
        'internal consistency, domain fitness, and identifies missing or weak genes.',
      parameters: {
        hash: {
          type: 'string',
          description: 'Hash of the seed to analyze',
          required: true,
        },
        aspects: {
          type: 'array',
          description:
            'Optional list of analysis aspects: "completeness" (gene coverage), ' +
            '"consistency" (inter-gene compatibility), "fitness" (multi-objective evaluation), ' +
            '"novelty" (uniqueness vs. population), "complexity" (structural depth). Default: all.',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const hash = args['hash'] as string | undefined;

        if (!hash) {
          return { success: false, error: '"hash" is required to analyze a seed.' };
        }

        const seed = ctx.getSeed(hash);
        if (!seed) {
          return {
            success: false,
            error: `Seed "${hash}" not found. Use seed_list to see available seeds.`,
          };
        }

        const analysis = reasoner.analyzeSeed(seed);
        const suggestions = reasoner.suggestImprovements(seed);
        const gaps = gapDetector.detectGaps(seed);
        const behaviors = emergencePredictor.predictBehaviors(seed);

        return {
          success: true,
          data: {
            hash: seed.$hash,
            name: seed.$name,
            domain: seed.$domain,
            analysis: {
              completeness: Math.round(analysis.completeness * 1000) / 1000,
              geneCount: analysis.geneCount,
              geneTypeDistribution: analysis.geneTypeDistribution,
              domainFitness: Math.round(analysis.domainFitness * 1000) / 1000,
              missingGenes: analysis.missingGenes,
              extraGenes: analysis.extraGenes,
            },
            gaps: gaps.map((g) => ({
              kind: g.kind,
              severity: g.severity,
              gene: g.gene,
              description: g.description,
            })),
            suggestions: suggestions.map((s) => ({
              type: s.type,
              gene: s.gene,
              reason: s.reason,
            })),
            predictedBehaviors: behaviors.map((b) => ({
              behavior: b.behavior,
              description: b.description,
              confidence: b.confidence,
              triggerGenes: b.triggerGenes,
            })),
          },
        };
      },
    },

    {
      name: 'analyze_population',
      description:
        'Analyze population diversity and fitness statistics. Returns distribution metrics, ' +
        'clustering analysis, gene frequency maps, and convergence indicators.',
      parameters: {
        runId: {
          type: 'string',
          description:
            'Evolution run ID to analyze. If omitted, analyzes all seeds in current session.',
          required: false,
        },
        metrics: {
          type: 'array',
          description:
            'Specific metrics to compute: "diversity" (genetic variance), "fitness_distribution" ' +
            '(histogram of fitness values), "gene_frequency" (allele frequencies per gene), ' +
            '"clustering" (natural groupings), "convergence" (generation-over-generation delta). Default: all.',
          required: false,
        },
      },
      execute: async (_args: Record<string, unknown>): Promise<AgentToolResult> => {
        const seeds = ctx.getSeeds();

        if (seeds.length === 0) {
          return {
            success: true,
            data: {
              populationSize: 0,
              message: 'No seeds in the store. Create seeds with seed_create first.',
            },
          };
        }

        const populationAnalysis = strategist.analyzePopulation(seeds);
        const populationGaps = gapDetector.detectPopulationGaps(seeds);
        const synergies = emergencePredictor.findSynergies(seeds);

        return {
          success: true,
          data: {
            populationSize: populationAnalysis.populationSize,
            shannonDiversity: Math.round(populationAnalysis.shannonDiversity * 1000) / 1000,
            fitnessDistribution: {
              mean: Math.round(populationAnalysis.fitnessDistribution.mean * 1000) / 1000,
              stdDev: Math.round(populationAnalysis.fitnessDistribution.standardDeviation * 1000) / 1000,
              min: Math.round(populationAnalysis.fitnessDistribution.min * 1000) / 1000,
              max: Math.round(populationAnalysis.fitnessDistribution.max * 1000) / 1000,
              median: Math.round(populationAnalysis.fitnessDistribution.median * 1000) / 1000,
            },
            isConverging: populationAnalysis.isConverging,
            isStagnating: populationAnalysis.isStagnating,
            domainCount: populationAnalysis.domainCount,
            populationGaps: populationGaps.slice(0, 10).map((g) => ({
              kind: g.kind,
              severity: g.severity,
              gene: g.gene,
              description: g.description,
            })),
            synergies: synergies.slice(0, 10).map((s) => ({
              seedA: s.seedAName,
              seedB: s.seedBName,
              type: s.synergyType,
              strength: s.strength,
              description: s.description,
            })),
          },
        };
      },
    },

    {
      name: 'analyze_gaps',
      description:
        'Find gaps in the seed collection — unexplored regions of the design space, ' +
        'missing domain coverage, underrepresented gene combinations, and opportunities ' +
        'for novel seed creation.',
      parameters: {
        domain: {
          type: 'string',
          description:
            'Optional domain to focus gap analysis on. If omitted, analyzes across all domains.',
          required: false,
        },
        referenceSet: {
          type: 'string',
          description:
            'What to compare against: "population" (current evolution run), "session" ' +
            '(all seeds in session), "archive" (full historical archive). Default: "session".',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const domain = args['domain'] as string | undefined;
        let seeds = ctx.getSeeds();

        if (domain) {
          seeds = seeds.filter((s) => s.$domain === domain);
        }

        if (seeds.length === 0) {
          return {
            success: true,
            data: {
              message: domain
                ? `No seeds found in domain "${domain}". Create seeds with seed_create.`
                : 'No seeds in the store. Create seeds with seed_create first.',
              gaps: [],
              fills: [],
            },
          };
        }

        const gaps = gapDetector.detectPopulationGaps(seeds);
        const fills = gapDetector.suggestFills(gaps);

        return {
          success: true,
          data: {
            seedCount: seeds.length,
            domain: domain ?? 'all',
            gaps: gaps.map((g) => ({
              kind: g.kind,
              severity: g.severity,
              gene: g.gene,
              description: g.description,
              context: g.context,
            })),
            fills: fills.map((f) => ({
              gap: { kind: f.gap.kind, gene: f.gap.gene, severity: f.gap.severity },
              suggestedGene: f.suggestedGene,
              rationale: f.rationale,
            })),
          },
        };
      },
    },

    {
      name: 'predict_emergence',
      description:
        'Predict emergent behaviors that may arise from specific gene combinations. ' +
        'Uses interaction matrices and historical data to forecast unexpected properties ' +
        'when genes are combined in novel ways.',
      parameters: {
        geneNames: {
          type: 'array',
          description: 'List of gene names to evaluate for emergent interactions',
          required: true,
        },
        seedHash: {
          type: 'string',
          description:
            'Optional seed hash to use as context. If provided, predictions account for ' +
            'the existing gene environment of that seed.',
          required: false,
        },
        confidence: {
          type: 'string',
          description:
            'Minimum confidence threshold for predictions: "low" (speculative), ' +
            '"medium" (pattern-supported), "high" (historically validated). Default: "medium".',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const geneNames = args['geneNames'] as string[] | undefined;

        if (!geneNames || geneNames.length === 0) {
          return {
            success: false,
            error: '"geneNames" array with at least one gene name is required for emergence prediction.',
          };
        }

        const seedHash = args['seedHash'] as string | undefined;
        const confidenceThreshold = args['confidence'] as string | undefined;
        const thresholdMap: Record<string, number> = { low: 0.3, medium: 0.5, high: 0.7 };
        const minConfidence = thresholdMap[confidenceThreshold ?? 'medium'] ?? 0.5;

        // If a seed hash is provided, analyze that specific seed
        if (seedHash) {
          const seed = ctx.getSeed(seedHash);
          if (!seed) {
            return {
              success: false,
              error: `Seed "${seedHash}" not found. Use seed_list to see available seeds.`,
            };
          }

          const behaviors = emergencePredictor.predictBehaviors(seed);
          const filtered = behaviors.filter((b) => b.confidence >= minConfidence);

          // Also find synergies with other seeds
          const allSeeds = ctx.getSeeds().filter((s) => s.$hash !== seedHash);
          const pairSeeds = [seed, ...allSeeds.slice(0, 20)];
          const synergies = emergencePredictor.findSynergies(pairSeeds)
            .filter((s) => s.seedAHash === seed.$hash || s.seedBHash === seed.$hash);

          return {
            success: true,
            data: {
              seedHash: seed.$hash,
              seedName: seed.$name,
              queriedGenes: geneNames,
              predictedBehaviors: filtered.map((b) => ({
                behavior: b.behavior,
                description: b.description,
                confidence: b.confidence,
                triggerGenes: b.triggerGenes,
              })),
              synergies: synergies.slice(0, 10).map((s) => ({
                partnerHash: s.seedAHash === seed.$hash ? s.seedBHash : s.seedAHash,
                partnerName: s.seedAHash === seed.$hash ? s.seedBName : s.seedAName,
                type: s.synergyType,
                strength: s.strength,
                description: s.description,
              })),
            },
          };
        }

        // Without a specific seed, analyze all seeds that have the requested genes
        const allSeeds = ctx.getSeeds();
        const matchingSeeds = allSeeds.filter((s) =>
          geneNames.some((g) => g in s.genes),
        );

        const allBehaviors: Array<{ seedHash: string; seedName: string; behavior: string; confidence: number; description: string }> = [];

        for (const seed of matchingSeeds) {
          const behaviors = emergencePredictor.predictBehaviors(seed);
          for (const b of behaviors) {
            if (b.confidence >= minConfidence) {
              allBehaviors.push({
                seedHash: seed.$hash,
                seedName: seed.$name,
                behavior: b.behavior,
                confidence: b.confidence,
                description: b.description,
              });
            }
          }
        }

        allBehaviors.sort((a, b) => b.confidence - a.confidence);

        return {
          success: true,
          data: {
            queriedGenes: geneNames,
            seedsWithGenes: matchingSeeds.length,
            predictions: allBehaviors.slice(0, 20),
          },
        };
      },
    },
  ];
}
