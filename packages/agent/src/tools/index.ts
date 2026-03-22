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
