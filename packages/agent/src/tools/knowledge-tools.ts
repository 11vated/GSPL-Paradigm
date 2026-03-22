/**
 * Knowledge tools for the GSPL agent.
 *
 * These tools provide semantic search, suggestion, and explanation capabilities
 * over the seed collection — the agent's way of understanding and navigating
 * the design space through natural language.
 *
 * @packageDocumentation
 */

import type { AgentTool, AgentToolResult } from './seed-tools.js';

/** All knowledge-related tools. */
export const knowledgeTools: AgentTool[] = [
  {
    name: 'knowledge_search',
    description:
      'Search for seeds matching natural-language criteria. Supports semantic search ' +
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

      return {
        success: true,
        data: {
          description:
            `Knowledge search for "${query}" requested. ` +
            'Pending WebEngine connection for semantic matching.',
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
    execute: async (_args: Record<string, unknown>): Promise<AgentToolResult> => {
      return {
        success: true,
        data: {
          description:
            'Suggestion generation requested. Pending WebEngine connection for context analysis.',
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

      return {
        success: true,
        data: {
          description:
            `Explanation of seed "${seedHash}" requested. ` +
            'Pending WebEngine connection for gene interpretation.',
        },
      };
    },
  },
];
