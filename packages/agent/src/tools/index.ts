/**
 * Tool registry for the GSPL agent.
 *
 * Aggregates all tool categories into a unified registry that the agent's
 * reasoning loop uses to determine available actions. All tools are created
 * via factory functions that receive a {@link ToolContext} for dependency
 * injection.
 *
 * @packageDocumentation
 */

export type { AgentTool, AgentToolResult, ToolParameterSchema } from './seed-tools.js';
export type { ToolContext } from './tool-context.js';

export { createSeedTools } from './seed-tools.js';
export { createEvolutionTools } from './evolution-tools.js';
export { createForgeTools } from './forge-tools.js';
export { createAnalysisTools } from './analysis-tools.js';
export { createWorldTools } from './world-tools.js';
export { createKnowledgeTools } from './knowledge-tools.js';

import type { AgentTool } from './seed-tools.js';
import type { ToolContext } from './tool-context.js';
import { createSeedTools } from './seed-tools.js';
import { createEvolutionTools } from './evolution-tools.js';
import { createForgeTools } from './forge-tools.js';
import { createAnalysisTools } from './analysis-tools.js';
import { createWorldTools } from './world-tools.js';
import { createKnowledgeTools } from './knowledge-tools.js';

/**
 * Create all 22 agent tools with injected context.
 *
 * @param ctx - Dependency-injection context providing seed store, RNG, and event bus.
 * @returns Array of all agent tools ready for execution.
 */
export function createAllTools(ctx: ToolContext): AgentTool[] {
  return [
    ...createSeedTools(ctx),
    ...createEvolutionTools(ctx),
    ...createForgeTools(ctx),
    ...createAnalysisTools(ctx),
    ...createWorldTools(ctx),
    ...createKnowledgeTools(ctx),
  ];
}

/**
 * Look up a tool by name from a pre-built tool array.
 *
 * @param tools - Array of tools to search.
 * @param name - Tool name to find.
 * @returns The matching tool, or undefined.
 */
export function findToolByName(tools: AgentTool[], name: string): AgentTool | undefined {
  return tools.find((tool) => tool.name === name);
}

/**
 * Get all tool names grouped by category.
 *
 * @param tools - Array of tools to categorize.
 * @returns Record mapping category names to arrays of tool names.
 */
export function getToolCategories(tools: AgentTool[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {};
  for (const tool of tools) {
    const category = tool.name.split('_')[0] ?? 'other';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(tool.name);
  }
  return categories;
}

// ═══════════════════════════════════════════════════════════════════
// v2: INTENT → TOOL DISPATCH with Complexity Detection
// ═══════════════════════════════════════════════════════════════════

import type { IntentType, ParsedIntent } from '@paradigm/types';

/**
 * Mapping from NLP intent types to default tool names.
 * For 'create' intent, complexity detection may override to a different tool.
 */
const INTENT_TO_TOOL: Record<IntentType, string> = {
  create: 'seed_create',       // overridden to create_entity for complex inputs
  breed: 'seed_breed',
  mutate: 'seed_mutate',
  evolve: 'evolution_start',
  inspect: 'seed_inspect',
  query: 'knowledge_search',
  explain: 'knowledge_explain',
  compare: 'seed_compare',
  optimize: 'evolution_recommend',
  simulate: 'world_simulate',
  export: 'forge_artifact',
  import: 'seed_create',
  help: 'knowledge_explain',
  status: 'world_status',
  undo: 'seed_list',
  redo: 'seed_list',
  meta: 'world_status',
  forge: 'forge_artifact',
  search: 'knowledge_search',
  configure: 'evolution_recommend',
};

/** Style/concept keywords that indicate a complex creation requiring full pipeline. */
const COMPLEXITY_INDICATORS = new Set([
  // Anime substyles
  'shonen', 'seinen', 'chibi', 'ghibli', 'ufotable', 'trigger', 'kyoani',
  // Western styles
  'cartoon', 'looney', 'disney', 'pixar', 'pixel',
  // Realism
  'realistic', 'photorealistic', 'pbr', 'cinematic',
  // Other styles
  'cyberpunk', 'noir', 'fantasy', 'minimal',
  // Power systems
  'ki', 'chakra', 'nen', 'mana', 'cursed', 'quirk', 'stand', 'bending', 'force',
  'kamehameha', 'rasengan', 'bankai', 'domain', 'expansion',
  // Ability indicators
  'beam', 'aura', 'transformation', 'super', 'saiyan', 'powers',
  // Personality/dimension indicators
  'personality', 'gentle', 'aggressive', 'stoic', 'trickster',
  // Complex species
  'dragon', 'phoenix', 'lich', 'celestial', 'eldritch', 'chimera',
]);

/**
 * Estimate the complexity of a creation request.
 * Higher score = more concept tokens detected = should use full pipeline.
 *
 * @param input - Raw user input text.
 * @returns Complexity score (0-1). >= 0.3 triggers full create_entity pipeline.
 */
export function estimateComplexity(input: string): number {
  const words = input.toLowerCase().split(/\s+/);
  let indicators = 0;
  for (const word of words) {
    if (COMPLEXITY_INDICATORS.has(word)) indicators++;
  }
  // Also count total concept-like words (> 2 chars, not common verbs/articles)
  const SKIP = new Set(['the', 'a', 'an', 'with', 'and', 'create', 'make', 'build', 'generate', 'design', 'entity', 'seed', 'new']);
  const conceptWords = words.filter(w => w.length > 2 && !SKIP.has(w)).length;

  // Score: explicit indicators weigh more, but word count matters too
  return Math.min(1.0, (indicators * 0.2) + (conceptWords > 3 ? 0.2 : 0));
}

/**
 * Dispatch an NLP intent to the best matching agent tool.
 *
 * For 'create' intents, uses complexity detection:
 * - Simple (< 3 concept words): seed_create (fast path)
 * - Complex (3+ concept words or style/power indicators): create_entity (full pipeline with 12 dimensions)
 *
 * @param intent - Parsed intent from NLPCompiler.
 * @param tools - Available agent tools.
 * @param rawInput - Original user input for complexity analysis.
 * @returns The best matching tool, or undefined if no match.
 */
export function dispatchIntent(
  intent: ParsedIntent,
  tools: AgentTool[],
  rawInput?: string,
): AgentTool | undefined {
  let toolName = INTENT_TO_TOOL[intent.type] ?? 'seed_create';

  // For create intents, check if input is complex enough for full pipeline
  if (intent.type === 'create' && rawInput) {
    const complexity = estimateComplexity(rawInput);
    if (complexity >= 0.3) {
      // Try to use create_entity (full pipeline) if available
      const entityTool = findToolByName(tools, 'create_entity');
      if (entityTool) return entityTool;
    }
  }

  return findToolByName(tools, toolName);
}

/** Get the dispatch table (for debugging/testing). */
export function getDispatchTable(): Record<string, string> {
  return { ...INTENT_TO_TOOL };
}
