/**
 * Agentic Co-Creation — entities modify their own DNA.
 *
 * Takes a user command ("make it more intimidating") and translates
 * it into targeted gene mutations. Works without LLM via pattern
 * matching on common intent phrases.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, Gene } from '@paradigm/types';

// ═══════════════════════════════════════════════════════════════════
// Intent Patterns — what the user wants to change
// ═══════════════════════════════════════════════════════════════════

interface MutationDirective {
  readonly geneKey: string;
  readonly subKey?: string;
  readonly operation: 'increase' | 'decrease' | 'set';
  readonly value: number;
}

interface IntentMapping {
  readonly keywords: readonly string[];
  readonly mutations: readonly MutationDirective[];
  readonly description: string;
}

const INTENT_MAPPINGS: readonly IntentMapping[] = [
  // Size changes
  {
    keywords: ['bigger', 'larger', 'grow', 'huge', 'massive', 'giant'],
    mutations: [
      { geneKey: 'bodyParams', subKey: 'torsoWidth', operation: 'increase', value: 0.08 },
      { geneKey: 'bodyParams', subKey: 'torsoHeight', operation: 'increase', value: 0.1 },
      { geneKey: 'bodyParams', subKey: 'headRadius', operation: 'increase', value: 0.05 },
      { geneKey: 'bodyParams', subKey: 'limbThickness', operation: 'increase', value: 0.03 },
    ],
    description: 'Scaled up body proportions',
  },
  {
    keywords: ['smaller', 'tiny', 'shrink', 'miniature', 'compact'],
    mutations: [
      { geneKey: 'bodyParams', subKey: 'torsoWidth', operation: 'decrease', value: 0.05 },
      { geneKey: 'bodyParams', subKey: 'torsoHeight', operation: 'decrease', value: 0.08 },
      { geneKey: 'bodyParams', subKey: 'limbLength', operation: 'decrease', value: 0.05 },
    ],
    description: 'Scaled down body proportions',
  },

  // Style changes
  {
    keywords: ['cuter', 'cute', 'kawaii', 'adorable', 'chibi', 'friendly'],
    mutations: [
      { geneKey: 'bodyParams', subKey: 'headRadius', operation: 'increase', value: 0.12 },
      { geneKey: 'bodyParams', subKey: 'limbLength', operation: 'decrease', value: 0.08 },
      { geneKey: 'exaggeration', operation: 'increase', value: 0.2 },
      { geneKey: 'surface', subKey: 'outlineThickness', operation: 'increase', value: 0.05 },
    ],
    description: 'Chibi-fied: larger head, shorter limbs, more exaggerated',
  },
  {
    keywords: ['intimidating', 'scary', 'menacing', 'fierce', 'terrifying', 'powerful'],
    mutations: [
      { geneKey: 'appendages', subKey: 'hasHorns', operation: 'set', value: 1.0 },
      { geneKey: 'appendages', subKey: 'hornSize', operation: 'increase', value: 0.1 },
      { geneKey: 'surface', subKey: 'emission', operation: 'increase', value: 0.5 },
      { geneKey: 'bodyParams', subKey: 'torsoWidth', operation: 'increase', value: 0.05 },
    ],
    description: 'Added horns, increased glow, broader build',
  },

  // Speed/agility
  {
    keywords: ['faster', 'quick', 'agile', 'swift', 'nimble', 'speedy'],
    mutations: [
      { geneKey: 'motion', subKey: 'idleSpeed', operation: 'increase', value: 0.5 },
      { geneKey: 'bodyParams', subKey: 'limbLength', operation: 'increase', value: 0.05 },
      { geneKey: 'bodyParams', subKey: 'torsoWidth', operation: 'decrease', value: 0.03 },
    ],
    description: 'Faster animation, longer limbs, slimmer build',
  },

  // Armor/defense
  {
    keywords: ['armored', 'tough', 'defensive', 'protected', 'fortified', 'tanky'],
    mutations: [
      { geneKey: 'surface', subKey: 'metallic', operation: 'increase', value: 0.3 },
      { geneKey: 'surface', subKey: 'roughness', operation: 'decrease', value: 0.15 },
      { geneKey: 'bodyParams', subKey: 'torsoWidth', operation: 'increase', value: 0.04 },
      { geneKey: 'bodyParams', subKey: 'limbThickness', operation: 'increase', value: 0.02 },
    ],
    description: 'More metallic, smoother surface, thicker build',
  },

  // Wings
  {
    keywords: ['wings', 'flying', 'winged', 'airborne'],
    mutations: [
      { geneKey: 'appendages', subKey: 'hasWings', operation: 'set', value: 1.0 },
      { geneKey: 'appendages', subKey: 'wingSpan', operation: 'set', value: 1.0 },
    ],
    description: 'Added wings',
  },

  // Tail
  {
    keywords: ['tail', 'tailed'],
    mutations: [
      { geneKey: 'appendages', subKey: 'hasTail', operation: 'set', value: 1.0 },
      { geneKey: 'appendages', subKey: 'tailLength', operation: 'set', value: 0.5 },
    ],
    description: 'Added tail',
  },

  // Glowing/magical
  {
    keywords: ['glowing', 'luminous', 'radiant', 'magical', 'enchanted', 'ethereal'],
    mutations: [
      { geneKey: 'surface', subKey: 'emission', operation: 'increase', value: 0.8 },
      { geneKey: 'surface', subKey: 'roughness', operation: 'decrease', value: 0.2 },
    ],
    description: 'Increased glow and ethereal appearance',
  },

  // Dark/shadow
  {
    keywords: ['darker', 'shadowy', 'sinister', 'evil', 'corrupted', 'void'],
    mutations: [
      { geneKey: 'surface', subKey: 'emission', operation: 'increase', value: 0.3 },
      { geneKey: 'surface', subKey: 'roughness', operation: 'increase', value: 0.2 },
    ],
    description: 'Darker, more ominous appearance',
  },
];

// ═══════════════════════════════════════════════════════════════════
// Co-Creation Result
// ═══════════════════════════════════════════════════════════════════

export interface CoCreationResult {
  readonly originalSeed: UniversalSeed;
  readonly modifiedSeed: UniversalSeed;
  readonly appliedMutations: readonly { geneKey: string; subKey?: string; oldValue: number; newValue: number }[];
  readonly explanation: string;
  readonly matchedIntents: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════
// AgenticCoCreator
// ═══════════════════════════════════════════════════════════════════

/**
 * Entities modify their own DNA in response to user commands.
 *
 * Pattern-based: matches user message against intent keywords,
 * then applies targeted gene mutations. No LLM required.
 *
 * Example: "make it more intimidating" → hasHorns=1, emission↑, torsoWidth↑
 */
export class AgenticCoCreator {
  /**
   * Process a co-creation command.
   * @param seed - The entity's current seed
   * @param message - User's natural language command
   * @returns Modified seed with explanation of changes
   */
  process(seed: UniversalSeed, message: string): CoCreationResult {
    const lower = message.toLowerCase();
    const matchedIntents: string[] = [];
    const allMutations: MutationDirective[] = [];

    // Match intents from message
    for (const mapping of INTENT_MAPPINGS) {
      if (mapping.keywords.some((kw) => lower.includes(kw))) {
        matchedIntents.push(mapping.description);
        allMutations.push(...mapping.mutations);
      }
    }

    if (allMutations.length === 0) {
      return {
        originalSeed: seed,
        modifiedSeed: seed,
        appliedMutations: [],
        explanation: `I didn't understand what to change. Try phrases like "make it bigger", "add wings", "more intimidating", or "cuter".`,
        matchedIntents: [],
      };
    }

    // Apply mutations to a deep copy of genes
    const newGenes = JSON.parse(JSON.stringify(seed.genes)) as Record<string, Gene>;
    const applied: Array<{ geneKey: string; subKey?: string; oldValue: number; newValue: number }> = [];

    for (const directive of allMutations) {
      const gene = newGenes[directive.geneKey];
      if (!gene) continue;

      if (directive.subKey && gene.type === 'struct') {
        const subGene = gene.value[directive.subKey];
        if (subGene?.type === 'scalar') {
          const oldValue = subGene.value;
          let newValue: number;
          if (directive.operation === 'set') newValue = directive.value;
          else if (directive.operation === 'increase') newValue = oldValue + directive.value;
          else newValue = oldValue - directive.value;
          newValue = Math.max(subGene.min, Math.min(subGene.max, newValue));

          subGene.value = newValue;
          applied.push({ geneKey: directive.geneKey, subKey: directive.subKey, oldValue, newValue });
        }
      } else if (!directive.subKey && gene.type === 'scalar') {
        const oldValue = gene.value;
        let newValue: number;
        if (directive.operation === 'set') newValue = directive.value;
        else if (directive.operation === 'increase') newValue = oldValue + directive.value;
        else newValue = oldValue - directive.value;
        newValue = Math.max(gene.min, Math.min(gene.max, newValue));

        gene.value = newValue;
        applied.push({ geneKey: directive.geneKey, oldValue, newValue });
      }
    }

    const modifiedSeed: UniversalSeed = {
      ...seed,
      genes: newGenes,
      $hash: seed.$hash + '_co',
      $lineage: {
        ...seed.$lineage,
        generation: seed.$lineage.generation + 1,
        timestamp: Date.now(),
      },
    };

    const explanation = matchedIntents.length > 0
      ? `Applied ${applied.length} gene changes: ${matchedIntents.join('; ')}.`
      : 'No changes applied.';

    return {
      originalSeed: seed,
      modifiedSeed,
      appliedMutations: applied,
      explanation,
      matchedIntents,
    };
  }
}
