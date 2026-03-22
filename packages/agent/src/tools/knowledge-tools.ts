/**
 * Knowledge tools for the GSPL agent.
 *
 * These tools provide semantic search, suggestion, and explanation capabilities
 * over the seed collection — the agent's way of understanding and navigating
 * the design space through natural language.
 *
 * @packageDocumentation
 */

import type { Gene } from '@paradigm/types';
import { SeedReasoner } from '../reasoning/index.js';
import type { AgentTool, AgentToolResult } from './seed-tools.js';
import type { ToolContext } from './tool-context.js';

// ─────────────────────────────────────────────
// Knowledge tool factory
// ─────────────────────────────────────────────

/** Create all knowledge-related tools with injected context. */
export function createKnowledgeTools(ctx: ToolContext): AgentTool[] {
  const reasoner = new SeedReasoner();

  return [
    {
      name: 'knowledge_search',
      description:
        'Search for seeds matching natural-language criteria. Supports search ' +
        'across names, descriptions, gene values, domains, and fitness scores.',
      parameters: {
        query: {
          type: 'string',
          description:
            'Natural-language search query (e.g. "fast creatures with high defense", ' +
            '"UI components for inventory screens", "seeds with fire-related genes")',
          required: true,
        },
        domain: {
          type: 'string',
          description: 'Optional domain filter to narrow search scope',
          required: false,
        },
        minFitness: {
          type: 'number',
          description:
            'Optional minimum overall fitness threshold (0.0-1.0). Only return seeds ' +
            'meeting this quality bar.',
          required: false,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const query = args['query'] as string | undefined;

        if (!query) {
          return { success: false, error: '"query" is required to search the knowledge base.' };
        }

        const domain = args['domain'] as string | undefined;
        const minFitness = (args['minFitness'] as number | undefined) ?? 0;
        const limit = (args['limit'] as number | undefined) ?? 10;

        let seeds = ctx.getSeeds();

        // Domain filter
        if (domain) {
          seeds = seeds.filter((s) => s.$domain === domain);
        }

        // Fitness filter
        if (minFitness > 0) {
          seeds = seeds.filter((s) => (s.$fitness?.['primary'] ?? 0) >= minFitness);
        }

        // Score seeds by relevance to query
        const queryLower = query.toLowerCase();
        const queryTokens = queryLower.split(/\s+/).filter((t) => t.length > 1);

        const scored = seeds.map((seed) => {
          let score = 0;

          // Name matching
          const nameLower = seed.$name.toLowerCase();
          if (nameLower.includes(queryLower)) score += 10;
          for (const token of queryTokens) {
            if (nameLower.includes(token)) score += 3;
          }

          // Domain matching
          if (queryTokens.includes(seed.$domain)) score += 5;

          // Description matching
          const descLower = (seed.$metadata.description ?? '').toLowerCase();
          if (descLower.includes(queryLower)) score += 8;
          for (const token of queryTokens) {
            if (descLower.includes(token)) score += 2;
          }

          // Gene name matching
          for (const geneName of Object.keys(seed.genes)) {
            const geneNameLower = geneName.toLowerCase();
            for (const token of queryTokens) {
              if (geneNameLower.includes(token)) score += 2;
            }
          }

          // Categorical gene value matching
          for (const gene of Object.values(seed.genes)) {
            if (gene.type === 'categorical') {
              const valLower = gene.value.toLowerCase();
              for (const token of queryTokens) {
                if (valLower.includes(token)) score += 3;
              }
            }
          }

          // Keyword-to-gene heuristics: "fast" -> speed, "strong" -> attack, "tough" -> defense
          const geneKeywords: Record<string, string[]> = {
            speed: ['fast', 'quick', 'swift', 'agile', 'speedy'],
            attack: ['strong', 'powerful', 'aggressive', 'offensive'],
            defense: ['tough', 'defensive', 'durable', 'resilient', 'armored'],
            health: ['healthy', 'vital', 'robust', 'sturdy'],
            damage: ['deadly', 'lethal', 'destructive'],
          };

          for (const [geneName, keywords] of Object.entries(geneKeywords)) {
            const gene = seed.genes[geneName];
            if (gene?.type === 'scalar') {
              for (const keyword of keywords) {
                if (queryTokens.includes(keyword)) {
                  const normalized = (gene.value - gene.min) / (gene.max - gene.min || 1);
                  if (normalized > 0.5) score += 4;
                  if (normalized > 0.75) score += 3;
                }
              }
            }
          }

          return { seed, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const results = scored.filter((s) => s.score > 0).slice(0, limit);

        return {
          success: true,
          data: {
            query,
            resultCount: results.length,
            totalSearched: seeds.length,
            results: results.map((r) => ({
              hash: r.seed.$hash,
              name: r.seed.$name,
              domain: r.seed.$domain,
              relevance: r.score,
              fitness: r.seed.$fitness?.['primary'] ?? null,
              geneCount: Object.keys(r.seed.genes).length,
              description: r.seed.$metadata.description ?? null,
            })),
          },
        };
      },
    },

    {
      name: 'knowledge_suggest',
      description:
        'Suggest related seeds, improvements, or next steps based on a seed or the current ' +
        'working context. Provides actionable recommendations for seed development.',
      parameters: {
        seedHash: {
          type: 'string',
          description:
            'Hash of the seed to base suggestions on. If omitted, suggests based on ' +
            'overall session context and recent activity.',
          required: false,
        },
        suggestionType: {
          type: 'string',
          description:
            'Type of suggestion: "related" (similar seeds to explore), "improvements" ' +
            '(gene modifications to boost fitness), "complements" (seeds that would pair well), ' +
            '"next_steps" (recommended actions). Default: "next_steps".',
          required: false,
        },
        count: {
          type: 'number',
          description: 'Number of suggestions to generate (1-20, default: 5)',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const seedHash = args['seedHash'] as string | undefined;
        const suggestionType = (args['suggestionType'] as string | undefined) ?? 'next_steps';
        const count = Math.min(20, Math.max(1, (args['count'] as number | undefined) ?? 5));

        const allSeeds = ctx.getSeeds();

        // If a specific seed is provided, generate seed-specific suggestions
        if (seedHash) {
          const seed = ctx.getSeed(seedHash);
          if (!seed) {
            return {
              success: false,
              error: `Seed "${seedHash}" not found. Use seed_list to see available seeds.`,
            };
          }

          switch (suggestionType) {
            case 'improvements': {
              const suggestions = reasoner.suggestImprovements(seed);
              return {
                success: true,
                data: {
                  seedHash: seed.$hash,
                  seedName: seed.$name,
                  type: 'improvements',
                  suggestions: suggestions.slice(0, count).map((s) => ({
                    type: s.type,
                    gene: s.gene,
                    reason: s.reason,
                    suggestedValue: s.suggestedValue ?? null,
                  })),
                },
              };
            }

            case 'related': {
              // Find seeds with the most gene overlap
              const others = allSeeds.filter((s) => s.$hash !== seed.$hash);
              const scored = others.map((other) => {
                const sharedGenes = Object.keys(seed.genes).filter((k) => k in other.genes);
                const domainBonus = other.$domain === seed.$domain ? 3 : 0;
                return { seed: other, score: sharedGenes.length + domainBonus };
              });
              scored.sort((a, b) => b.score - a.score);

              return {
                success: true,
                data: {
                  seedHash: seed.$hash,
                  seedName: seed.$name,
                  type: 'related',
                  suggestions: scored.slice(0, count).map((s) => ({
                    hash: s.seed.$hash,
                    name: s.seed.$name,
                    domain: s.seed.$domain,
                    similarity: s.score,
                  })),
                },
              };
            }

            case 'complements': {
              // Find seeds with complementary genes (different genes, same/compatible domain)
              const others = allSeeds.filter((s) => s.$hash !== seed.$hash);
              const scored = others.map((other) => {
                const uniqueToOther = Object.keys(other.genes).filter((k) => !(k in seed.genes));
                const domainBonus = other.$domain === seed.$domain ? 2 : 0;
                return { seed: other, score: uniqueToOther.length + domainBonus, uniqueGenes: uniqueToOther };
              });
              scored.sort((a, b) => b.score - a.score);

              return {
                success: true,
                data: {
                  seedHash: seed.$hash,
                  seedName: seed.$name,
                  type: 'complements',
                  suggestions: scored.slice(0, count).map((s) => ({
                    hash: s.seed.$hash,
                    name: s.seed.$name,
                    domain: s.seed.$domain,
                    complementScore: s.score,
                    uniqueGenes: s.uniqueGenes.slice(0, 5),
                  })),
                },
              };
            }

            case 'next_steps':
            default: {
              const analysis = reasoner.analyzeSeed(seed);
              const improvements = reasoner.suggestImprovements(seed);
              const suggestions: Array<{ action: string; description: string; priority: string }> = [];

              if (analysis.completeness < 0.7) {
                suggestions.push({
                  action: 'seed_mutate',
                  description: `Seed has ${(analysis.completeness * 100).toFixed(0)}% completeness. Add missing genes: ${analysis.missingGenes.slice(0, 3).join(', ')}.`,
                  priority: 'high',
                });
              }

              if (improvements.length > 0) {
                suggestions.push({
                  action: 'seed_mutate',
                  description: `${improvements.length} improvement(s) available: ${improvements[0]!.reason}`,
                  priority: improvements[0]!.type === 'add_gene' ? 'high' : 'medium',
                });
              }

              if (allSeeds.filter((s) => s.$domain === seed.$domain).length > 1) {
                suggestions.push({
                  action: 'seed_breed',
                  description: `Breed with other ${seed.$domain} seeds to combine strengths.`,
                  priority: 'medium',
                });
              }

              if (!seed.$fitness) {
                suggestions.push({
                  action: 'evolution_start',
                  description: 'Run evolution to evaluate and optimize this seed.',
                  priority: 'medium',
                });
              }

              suggestions.push({
                action: 'forge_artifact',
                description: 'Generate an artifact from this seed to see it materialized.',
                priority: 'low',
              });

              return {
                success: true,
                data: {
                  seedHash: seed.$hash,
                  seedName: seed.$name,
                  type: 'next_steps',
                  suggestions: suggestions.slice(0, count),
                },
              };
            }
          }
        }

        // No specific seed: session-wide suggestions
        const suggestions: Array<{ action: string; description: string; priority: string }> = [];

        if (allSeeds.length === 0) {
          suggestions.push({
            action: 'seed_create',
            description: 'No seeds exist yet. Create your first seed to begin.',
            priority: 'high',
          });
        } else {
          const domains = new Set(allSeeds.map((s) => s.$domain));
          if (domains.size === 1) {
            suggestions.push({
              action: 'seed_create',
              description: `All ${allSeeds.length} seeds are in domain "${[...domains][0]}". Create seeds in other domains for cross-domain synergies.`,
              priority: 'medium',
            });
          }

          if (allSeeds.length >= 4) {
            suggestions.push({
              action: 'evolution_start',
              description: `With ${allSeeds.length} seeds, you can run evolution to discover optimal configurations.`,
              priority: 'medium',
            });
          }

          if (allSeeds.length >= 2) {
            suggestions.push({
              action: 'seed_breed',
              description: 'Breed your best seeds together to combine their strengths.',
              priority: 'medium',
            });
            suggestions.push({
              action: 'analyze_population',
              description: 'Analyze the population to understand diversity and gaps.',
              priority: 'low',
            });
          }
        }

        return {
          success: true,
          data: {
            type: suggestionType,
            seedCount: allSeeds.length,
            suggestions: suggestions.slice(0, count),
          },
        };
      },
    },

    {
      name: 'knowledge_explain',
      description:
        'Explain a seed\'s properties, genes, fitness, and behaviors in clear natural language. ' +
        'Translates the genetic representation into human-understandable descriptions.',
      parameters: {
        seedHash: {
          type: 'string',
          description: 'Hash of the seed to explain',
          required: true,
        },
        depth: {
          type: 'string',
          description:
            'Explanation depth: "brief" (one-paragraph summary), "standard" (section-by-section ' +
            'breakdown), "detailed" (exhaustive gene-by-gene explanation with context). Default: "standard".',
          required: false,
        },
        audience: {
          type: 'string',
          description:
            'Target audience: "technical" (assumes GSPL knowledge), "general" (plain language), ' +
            '"developer" (code-oriented with implementation hints). Default: "general".',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const seedHash = args['seedHash'] as string | undefined;

        if (!seedHash) {
          return { success: false, error: '"seedHash" is required to explain a seed.' };
        }

        const seed = ctx.getSeed(seedHash);
        if (!seed) {
          return {
            success: false,
            error: `Seed "${seedHash}" not found. Use seed_list to see available seeds.`,
          };
        }

        const depth = (args['depth'] as string | undefined) ?? 'standard';
        const analysis = reasoner.analyzeSeed(seed);

        // Generate natural-language explanation
        const geneDescriptions: string[] = [];
        for (const [name, gene] of Object.entries(seed.genes)) {
          geneDescriptions.push(describeGene(name, gene));
        }

        // Brief summary
        const summary = `"${seed.$name}" is a ${seed.$domain}-domain seed with ${Object.keys(seed.genes).length} genes. ` +
          `It has ${(analysis.completeness * 100).toFixed(0)}% completeness for its domain` +
          (seed.$fitness?.['primary'] !== undefined ? ` and a fitness score of ${(seed.$fitness['primary']! * 100).toFixed(0)}%` : '') +
          '.';

        if (depth === 'brief') {
          return {
            success: true,
            data: {
              seedHash: seed.$hash,
              seedName: seed.$name,
              depth: 'brief',
              explanation: summary,
            },
          };
        }

        // Standard: include gene descriptions and analysis
        const sections: Record<string, string> = {
          overview: summary,
          domain: `This seed belongs to the "${seed.$domain}" domain. ` +
            (analysis.missingGenes.length > 0
              ? `It is missing expected genes: ${analysis.missingGenes.join(', ')}.`
              : 'It has all expected genes for its domain.'),
          genes: geneDescriptions.join('\n'),
          lineage: `Generation ${seed.$lineage.generation}` +
            (seed.$lineage.parents.length > 0
              ? `, bred from: ${seed.$lineage.parents.map((p) => p.name).join(' and ')}`
              : ', a first-generation seed') + '.',
        };

        if (depth === 'detailed') {
          const suggestions = reasoner.suggestImprovements(seed);
          sections['improvements'] = suggestions.length > 0
            ? suggestions.map((s) => `- [${s.type}] ${s.gene}: ${s.reason}`).join('\n')
            : 'No improvements needed. Seed is well-balanced.';
          sections['geneTypeDistribution'] = Object.entries(analysis.geneTypeDistribution)
            .map(([type, count]) => `${type}: ${count}`)
            .join(', ');
        }

        return {
          success: true,
          data: {
            seedHash: seed.$hash,
            seedName: seed.$name,
            depth,
            sections,
          },
        };
      },
    },
  ];
}

// ─────────────────────────────────────────────
// Gene description helper
// ─────────────────────────────────────────────

function describeGene(name: string, gene: Gene): string {
  switch (gene.type) {
    case 'scalar': {
      const range = gene.max - gene.min;
      const normalized = range > 0 ? (gene.value - gene.min) / range : 1;
      const level = normalized > 0.8 ? 'very high' : normalized > 0.6 ? 'high' : normalized > 0.4 ? 'moderate' : normalized > 0.2 ? 'low' : 'very low';
      return `${name}: ${gene.value} (${level}, range ${gene.min}-${gene.max})`;
    }
    case 'categorical':
      return `${name}: "${gene.value}" (from: ${gene.options.join(', ')})`;
    case 'vector':
      return `${name}: [${gene.value.slice(0, 5).join(', ')}${gene.value.length > 5 ? '...' : ''}] (${gene.dimensions}D vector)`;
    default:
      return `${name}: (${gene.type})`;
  }
}
