/**
 * Forge tools for the GSPL agent.
 *
 * These tools handle artifact generation from seeds — the materialization step
 * where abstract genetic blueprints become concrete code, assets, or configurations.
 *
 * @packageDocumentation
 */

import { Forge } from '@paradigm/forge';
import type { ArtifactType, ForgeOptions } from '@paradigm/forge';
import type { AgentTool, AgentToolResult } from './seed-tools.js';
import type { ToolContext } from './tool-context.js';

// ─────────────────────────────────────────────
// Artifact type mapping
// ─────────────────────────────────────────────

/**
 * Map user-facing type names to Forge ArtifactType values.
 * Supports both the original tool parameter names and the Forge-native names.
 */
const TYPE_ALIASES: Readonly<Record<string, ArtifactType>> = {
  code: 'source_code',
  sprite: 'sprite_sheet',
  config: 'database_schema',
  docs: 'documentation',
  scene: 'world_map',
  component: 'html_page',
  schema: 'database_schema',
  test: 'test_suite',
  // Direct Forge types also accepted
  html_page: 'html_page',
  html_game: 'html_game',
  website: 'website',
  api_spec: 'api_spec',
  documentation: 'documentation',
  presentation: 'presentation',
  logo: 'logo',
  color_palette: 'color_palette',
  icon: 'icon',
  source_code: 'source_code',
  shader: 'shader',
  database_schema: 'database_schema',
  test_suite: 'test_suite',
  character_sheet: 'character_sheet',
  world_map: 'world_map',
  sprite_sheet: 'sprite_sheet',
  particle_config: 'particle_config',
  soundtrack: 'soundtrack',
  sound_effect: 'sound_effect',
  physics_sim: 'physics_sim',
};

/** All user-facing type names for the help message. */
const USER_TYPES = [
  'code', 'sprite', 'config', 'docs', 'scene', 'component', 'schema', 'test',
  'html_page', 'html_game', 'website', 'api_spec', 'documentation', 'presentation',
  'logo', 'color_palette', 'icon', 'source_code', 'shader', 'database_schema',
  'test_suite', 'character_sheet', 'world_map', 'sprite_sheet', 'particle_config',
  'soundtrack', 'sound_effect', 'physics_sim',
];

// ─────────────────────────────────────────────
// Forge tool factory
// ─────────────────────────────────────────────

/** Create all forge-related tools with injected context. */
export function createForgeTools(ctx: ToolContext): AgentTool[] {
  return [
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
            '"component" (reusable UI component), "schema" (data schema), "test" (test suite). ' +
            'Also accepts direct Forge types: html_page, html_game, website, api_spec, logo, ' +
            'color_palette, icon, shader, character_sheet, world_map, particle_config, soundtrack, ' +
            'sound_effect, physics_sim.',
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
            'For scene: { engine, dimensions }. For web: { theme: "dark" | "light" }.',
          required: false,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const seedHash = args['seedHash'] as string | undefined;
        const typeArg = args['type'] as string | undefined;

        if (!seedHash || !typeArg) {
          return {
            success: false,
            error: 'Both "seedHash" and "type" are required to forge an artifact.',
          };
        }

        const artifactType = TYPE_ALIASES[typeArg];
        if (!artifactType) {
          return {
            success: false,
            error:
              `Unknown artifact type "${typeArg}". ` +
              `Valid types: ${USER_TYPES.join(', ')}.`,
          };
        }

        const seed = ctx.getSeed(seedHash);
        if (!seed) {
          return {
            success: false,
            error: `Seed "${seedHash}" not found. Use seed_list to see available seeds.`,
          };
        }

        const forge = new Forge(ctx.rng.fork(`forge-${seedHash}-${typeArg}`));

        if (!forge.canForge(artifactType)) {
          return {
            success: false,
            error:
              `Artifact type "${artifactType}" is not supported by any registered forger. ` +
              `Supported types: ${forge.getSupportedTypes().join(', ')}.`,
          };
        }

        const forgeOptions: ForgeOptions = {
          type: artifactType,
          format: args['format'] as string | undefined,
        };

        const extraOptions = args['options'] as Record<string, unknown> | undefined;
        if (extraOptions) {
          if (typeof extraOptions['width'] === 'number') forgeOptions.width = extraOptions['width'] as number;
          if (typeof extraOptions['height'] === 'number') forgeOptions.height = extraOptions['height'] as number;
          if (extraOptions['theme'] === 'dark' || extraOptions['theme'] === 'light') {
            forgeOptions.theme = extraOptions['theme'] as 'dark' | 'light';
          }
          if (extraOptions['quality'] === 'draft' || extraOptions['quality'] === 'standard' || extraOptions['quality'] === 'high') {
            forgeOptions.quality = extraOptions['quality'] as 'draft' | 'standard' | 'high';
          }
        }

        try {
          const artifact = forge.forge(seed, forgeOptions);

          ctx.eventBus.emit({
            type: 'forge.complete',
            seedHash: seed.$hash,
            artifactType: artifact.type,
            timestamp: Date.now(),
          });

          return {
            success: true,
            data: {
              type: artifact.type,
              name: artifact.name,
              mimeType: artifact.mimeType,
              size: artifact.size,
              metadata: artifact.metadata,
              contentPreview: artifact.content.length > 500
                ? artifact.content.slice(0, 500) + '... (truncated)'
                : artifact.content,
              fullContent: artifact.content,
            },
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            error: `Forge failed for seed "${seedHash}" with type "${artifactType}": ${message}`,
          };
        }
      },
    },

    {
      name: 'forge_preview',
      description:
        'Preview what an artifact would look like without actually generating it. ' +
        'Returns a structural outline, gene summary, domain info, and suggested types.',
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
            '"component", "schema", "test", or any direct Forge type.',
          required: true,
        },
      },
      execute: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        const seedHash = args['seedHash'] as string | undefined;
        const typeArg = args['type'] as string | undefined;

        if (!seedHash || !typeArg) {
          return {
            success: false,
            error: 'Both "seedHash" and "type" are required to preview an artifact.',
          };
        }

        const seed = ctx.getSeed(seedHash);
        if (!seed) {
          return {
            success: false,
            error: `Seed "${seedHash}" not found. Use seed_list to see available seeds.`,
          };
        }

        const artifactType = TYPE_ALIASES[typeArg];
        const forge = new Forge(ctx.rng.fork(`preview-${seedHash}`));

        // Gene summary
        const geneSummary: Record<string, string> = {};
        for (const [key, gene] of Object.entries(seed.genes)) {
          if (gene.type === 'scalar') {
            geneSummary[key] = `scalar: ${gene.value} [${gene.min}-${gene.max}]`;
          } else if (gene.type === 'categorical') {
            geneSummary[key] = `categorical: "${gene.value}" (from: ${gene.options.join(', ')})`;
          } else if (gene.type === 'vector') {
            geneSummary[key] = `vector[${gene.dimensions}]: [${gene.value.slice(0, 5).join(', ')}${gene.value.length > 5 ? '...' : ''}]`;
          } else {
            geneSummary[key] = gene.type;
          }
        }

        // Suggested artifact types based on domain
        const suggestedTypes: string[] = [];
        const supported = forge.getSupportedTypes();
        const domainSuggestions: Record<string, string[]> = {
          organism: ['character_sheet', 'sprite_sheet', 'html_page'],
          creature: ['character_sheet', 'sprite_sheet', 'html_page'],
          mammal: ['character_sheet', 'sprite_sheet'],
          weapon: ['character_sheet', 'icon', 'source_code'],
          vehicle: ['character_sheet', 'source_code'],
          building: ['world_map', 'source_code'],
          terrain: ['world_map', 'shader'],
          robot: ['character_sheet', 'source_code', 'sprite_sheet'],
          plant: ['sprite_sheet', 'color_palette'],
          material: ['shader', 'color_palette'],
        };
        const suggestions = domainSuggestions[seed.$domain] ?? ['html_page', 'source_code', 'documentation'];
        for (const s of suggestions) {
          if (supported.includes(s as ArtifactType)) {
            suggestedTypes.push(s);
          }
        }

        return {
          success: true,
          data: {
            seedHash: seed.$hash,
            seedName: seed.$name,
            domain: seed.$domain,
            geneCount: Object.keys(seed.genes).length,
            geneSummary,
            requestedType: typeArg,
            resolvedForgeType: artifactType ?? 'unknown',
            canForge: artifactType ? forge.canForge(artifactType) : false,
            suggestedTypes,
            fitness: seed.$fitness?.['primary'] ?? null,
            generation: seed.$lineage.generation,
          },
        };
      },
    },

    {
      name: 'forge_list_types',
      description:
        'List all available artifact types that can be forged, along with their supported ' +
        'formats and domain relevance.',
      parameters: {
        domain: {
          type: 'string',
          description:
            'Optional domain filter to show only artifact types relevant to a specific domain ' +
            '(e.g. "organism" shows character_sheet and sprite_sheet types).',
          required: false,
        },
      },
      execute: async (_args: Record<string, unknown>): Promise<AgentToolResult> => {
        const forge = new Forge(ctx.rng.fork('list-types'));
        const supportedTypes = forge.getSupportedTypes();

        return {
          success: true,
          data: {
            supportedTypes,
            count: supportedTypes.length,
            aliases: {
              code: 'source_code',
              sprite: 'sprite_sheet',
              config: 'database_schema',
              docs: 'documentation',
              scene: 'world_map',
              component: 'html_page',
              schema: 'database_schema',
              test: 'test_suite',
            },
          },
        };
      },
    },
  ];
}
