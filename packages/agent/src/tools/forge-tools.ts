/**
 * Forge tools for the GSPL agent.
 *
 * These tools handle artifact generation from seeds — the materialization step
 * where abstract genetic blueprints become concrete code, assets, or configurations.
 *
 * @packageDocumentation
 */

import type { AgentTool, AgentToolResult } from './seed-tools.js';

/** All forge-related tools. */
export const forgeTools: AgentTool[] = [
  {
    name: 'forge_artifact',
    description:
      'Generate a concrete artifact from a seed. The artifact type determines what is produced — ' +
      'code files, sprite assets, configuration, documentation, or game objects.',
    parameters: {
      seedHash: {
        type: 'string',
        description: 'Hash of the seed to forge into an artifact',
        required: true,
      },
      type: {
        type: 'string',
        description:
          'Artifact type to generate: "code" (source files), "sprite" (visual asset), ' +
          '"config" (configuration files), "docs" (documentation), "scene" (game scene/level), ' +
          '"component" (reusable UI component), "schema" (data schema), "test" (test suite)',
        required: true,
      },
      format: {
        type: 'string',
        description:
          'Output format within the artifact type. For code: "typescript", "python", "gdscript", "csharp". ' +
          'For sprite: "png", "svg", "aseprite". For config: "json", "yaml", "toml". Default varies by type.',
        required: false,
      },
      options: {
        type: 'object',
        description:
          'Type-specific options. For code: { framework, patterns }. For sprite: { width, height, style }. ' +
          'For scene: { engine, dimensions }.',
        required: false,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const seedHash = args['seedHash'] as string | undefined;
      const type = args['type'] as string | undefined;

      if (!seedHash || !type) {
        return {
          success: false,
          error: 'Both "seedHash" and "type" are required to forge an artifact.',
        };
      }

      const validTypes = [
        'code', 'sprite', 'config', 'docs', 'scene', 'component', 'schema', 'test',
      ];

      if (!validTypes.includes(type)) {
        return {
          success: false,
          error:
            `Invalid artifact type "${type}". ` +
            `Valid types: ${validTypes.join(', ')}.`,
        };
      }

      return {
        success: true,
        data: {
          description:
            `Forging "${type}" artifact from seed "${seedHash}". ` +
            'Pending WebEngine connection for generation.',
        },
      };
    },
  },

  {
    name: 'forge_preview',
    description:
      'Preview what an artifact would look like without actually generating it. ' +
      'Returns a structural outline, estimated complexity, and dependency list.',
    parameters: {
      seedHash: {
        type: 'string',
        description: 'Hash of the seed to preview',
        required: true,
      },
      type: {
        type: 'string',
        description:
          'Artifact type to preview: "code", "sprite", "config", "docs", "scene", ' +
          '"component", "schema", "test"',
        required: true,
      },
    },
    execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
      const seedHash = args['seedHash'] as string | undefined;
      const type = args['type'] as string | undefined;

      if (!seedHash || !type) {
        return {
          success: false,
          error: 'Both "seedHash" and "type" are required to preview an artifact.',
        };
      }

      return {
        success: true,
        data: {
          description:
            `Preview of "${type}" artifact from seed "${seedHash}" requested. ` +
            'Pending WebEngine connection for analysis.',
        },
      };
    },
  },

  {
    name: 'forge_list_types',
    description:
      'List all available artifact types that can be forged, along with their supported ' +
      'formats, required gene types, and configuration options.',
    parameters: {
      domain: {
        type: 'string',
        description:
          'Optional domain filter to show only artifact types relevant to a specific domain ' +
          '(e.g. "character" shows sprite and code types, "system" shows config and schema types).',
        required: false,
      },
    },
    execute: async (_args: Record<string, unknown>): Promise<AgentToolResult> => {
      return {
        success: true,
        data: {
          description:
            'Artifact type listing requested. Pending WebEngine connection for registry query.',
          types: [
            'code', 'sprite', 'config', 'docs', 'scene', 'component', 'schema', 'test',
          ],
        },
      };
    },
  },
];
