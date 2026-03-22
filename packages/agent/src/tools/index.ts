/**
 * Tool registry for the GSPL agent.
 *
 * Aggregates all tool categories into a unified registry that the agent's
 * reasoning loop uses to determine available actions.
 *
 * @packageDocumentation
 */

export type { AgentTool, AgentToolResult, ToolParameterSchema } from './seed-tools.js';
export { seedTools } from './seed-tools.js';
export { evolutionTools } from './evolution-tools.js';
export { forgeTools } from './forge-tools.js';
export { analysisTools } from './analysis-tools.js';
export { worldTools } from './world-tools.js';
export { knowledgeTools } from './knowledge-tools.js';

import type { AgentTool } from './seed-tools.js';
import { seedTools } from './seed-tools.js';
import { evolutionTools } from './evolution-tools.js';
import { forgeTools } from './forge-tools.js';
import { analysisTools } from './analysis-tools.js';
import { worldTools } from './world-tools.js';
import { knowledgeTools } from './knowledge-tools.js';

/** All tools combined into a single registry. */
export function getAllTools(): AgentTool[] {
  return [
    ...seedTools,
    ...evolutionTools,
    ...forgeTools,
    ...analysisTools,
    ...worldTools,
    ...knowledgeTools,
  ];
}

/** Look up a tool by name. Returns undefined if not found. */
export function getToolByName(name: string): AgentTool | undefined {
  return getAllTools().find((tool) => tool.name === name);
}

/** Get all tool names grouped by category. */
export function getToolCategories(): Record<string, string[]> {
  return {
    seed: seedTools.map((t) => t.name),
    evolution: evolutionTools.map((t) => t.name),
    forge: forgeTools.map((t) => t.name),
    analysis: analysisTools.map((t) => t.name),
    world: worldTools.map((t) => t.name),
    knowledge: knowledgeTools.map((t) => t.name),
  };
}
