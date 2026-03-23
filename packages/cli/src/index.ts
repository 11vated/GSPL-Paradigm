/**
 * @paradigm/cli — Command-line interface for GSPL Paradigm.
 *
 * Instantiates a WebEngine in-process and dispatches commands
 * via engine.handle(). No HTTP server needed.
 *
 * Usage:
 *   gspl seed create <name> [domain]
 *   gspl seed list
 *   gspl seed inspect <hash>
 *   gspl evolve [generations] [populationSize]
 *   gspl forge <hash> [type]
 *   gspl chat <message...>
 *   gspl status
 *   gspl help
 */

import { WebEngine } from '@paradigm/web';
import type { Request, Response } from '@paradigm/web';

// ─────────────────────────────────────────────
// Request Builders
// ─────────────────────────────────────────────

function buildRequest(method: string, path: string, body?: unknown): Request {
  return { method: method as Request['method'], path, params: {}, query: {}, body, headers: {} };
}

// ─────────────────────────────────────────────
// Output Formatting
// ─────────────────────────────────────────────

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printError(message: string): void {
  console.error(`Error: ${message}`);
}

// ─────────────────────────────────────────────
// Command Handlers
// ─────────────────────────────────────────────

async function handleSeedCreate(engine: WebEngine, args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    printError('Usage: gspl seed create <name> [domain]');
    process.exitCode = 1;
    return;
  }
  const domain = args[1] ?? 'organism';
  const res = await engine.handle(buildRequest('POST', '/api/seed/create', { name, domain }));
  printJson(res.body);
}

async function handleSeedList(engine: WebEngine): Promise<void> {
  const res = await engine.handle(buildRequest('GET', '/api/seeds'));
  printJson(res.body);
}

async function handleSeedInspect(engine: WebEngine, args: string[]): Promise<void> {
  const hash = args[0];
  if (!hash) {
    printError('Usage: gspl seed inspect <hash>');
    process.exitCode = 1;
    return;
  }
  const res = await engine.handle(buildRequest('GET', `/api/seed/${hash}`));
  printJson(res.body);
}

async function handleSeed(engine: WebEngine, args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'create': return handleSeedCreate(engine, rest);
    case 'list': return handleSeedList(engine);
    case 'inspect': return handleSeedInspect(engine, rest);
    default:
      printError(`Unknown seed subcommand: ${sub ?? '(none)'}. Use: create, list, inspect`);
      process.exitCode = 1;
  }
}

async function handleEvolve(engine: WebEngine, args: string[]): Promise<void> {
  const generations = Number(args[0] ?? 10);
  const populationSize = Number(args[1] ?? 8);
  const res = await engine.handle(buildRequest('POST', '/api/evolve', { generations, populationSize }));
  printJson(res.body);
}

async function handleForge(engine: WebEngine, args: string[]): Promise<void> {
  const hash = args[0];
  if (!hash) {
    printError('Usage: gspl forge <hash> [type]');
    process.exitCode = 1;
    return;
  }
  const type = args[1] ?? 'html_page';
  const res = await engine.handle(buildRequest('POST', '/api/forge', { hash, type }));
  printJson(res.body);
}

async function handleChat(engine: WebEngine, args: string[]): Promise<void> {
  const message = args.join(' ');
  if (!message.trim()) {
    printError('Usage: gspl chat <message...>');
    process.exitCode = 1;
    return;
  }
  const res = await engine.handle(buildRequest('POST', '/api/chat', { message }));
  printJson(res.body);
}

async function handleCreate(engine: WebEngine, args: string[]): Promise<void> {
  const description = args.join(' ');
  if (!description.trim()) {
    printError('Usage: gspl create <concept description>');
    printError('  Example: gspl create "chibi lightning dragon"');
    process.exitCode = 1;
    return;
  }

  // Use the v2 enhanced pipeline with ontology, power system, transforms
  const res = await engine.handle(buildRequest('POST', '/api/concept/enhanced', { description }));
  const result = res.body as Record<string, unknown>;

  if (res.status >= 400) {
    printError(String((result as Record<string, unknown>)['message'] ?? 'Compilation failed'));
    process.exitCode = 1;
    return;
  }

  const seed = result['seed'] as Record<string, unknown>;
  const dims = result['dimensions'] as Record<string, unknown> | undefined;
  const cg = result['conceptGraph'] as Record<string, unknown> | undefined;
  const validation = result['validation'] as Record<string, unknown> | undefined;
  const stats = result['ontologyStats'] as Record<string, number> | undefined;

  console.log(`\n  GSPL Entity Created (v2 Enhanced Pipeline)`);
  console.log(`  ${'='.repeat(50)}`);

  // Identity
  const identity = dims?.['identity'] as Record<string, unknown> | undefined;
  console.log(`  Name:       ${String(identity?.['name'] ?? seed['$name'] ?? description)}`);
  console.log(`  Hash:       ${String(seed['$hash'] ?? 'N/A')}`);

  // Morphology
  const morph = dims?.['morphology'] as Record<string, unknown> | undefined;
  if (morph) {
    console.log(`  Species:    ${String(morph['species'] ?? 'unknown')}`);
    console.log(`  Body:       ${String(morph['bodyStructure'] ?? 'unknown')}`);
    console.log(`  Body Type:  ${String(morph['bodyType'] ?? 'unknown')}`);
  }

  // Style
  const style = dims?.['visualStyle'] as Record<string, unknown> | undefined;
  if (style) {
    console.log(`  Style:      ${String(style['category'])} / ${String(style['substyle'])}`);
  }

  // Personality
  const pers = dims?.['personality'] as Record<string, unknown> | undefined;
  if (pers) {
    console.log(`  Archetype:  ${String(pers['archetypeRole'] ?? 'unknown')}`);
  }

  // Power System
  const power = cg?.['powerSystem'] as Record<string, unknown> | undefined;
  if (power) {
    const reservoir = power['reservoir'] as Record<string, unknown> | undefined;
    const expression = power['expression'] as Record<string, unknown> | undefined;
    const progression = power['progression'] as Record<string, unknown> | undefined;
    console.log(`  Power:      ${String(power['name'] ?? 'none')}`);
    console.log(`  Energy:     ${String(reservoir?.['type'] ?? '?')} (cap: ${String(reservoir?.['capacity'] ?? '?')})`);
    console.log(`  Expression: ${String(expression?.['manifestationType'] ?? '?')} / ${String(expression?.['range'] ?? '?')}`);
    const stages = progression?.['stages'] as unknown[] | undefined;
    if (stages && stages.length > 0) {
      console.log(`  Stages:     ${stages.map((s: unknown) => String((s as Record<string, unknown>)['name'])).join(' → ')}`);
    }
  }

  // Transformations
  const transforms = cg?.['transformations'] as unknown[] | undefined;
  if (transforms && transforms.length > 0) {
    console.log(`  Transforms: ${transforms.map((t: unknown) => String((t as Record<string, unknown>)['name'])).join(' → ')}`);
  }

  // Animation
  const anim = dims?.['animationComplexity'] as Record<string, unknown> | undefined;
  if (anim) {
    const techniques = anim['techniques'] as string[] | undefined;
    if (techniques && techniques.length > 0) {
      console.log(`  Anim Tech:  ${techniques.join(', ')}`);
    }
  }

  // Movement
  const movement = dims?.['movement'] as Record<string, unknown> | undefined;
  if (movement) {
    console.log(`  Movement:   ${String(movement['personality'])} (${String(movement['combatMovement'])})`);
  }

  // Validation
  if (validation) {
    console.log(`  Validation: ${String(validation['status'])}`);
    const errors = validation['errors'] as string[] | undefined;
    if (errors && errors.length > 0) {
      for (const err of errors) console.log(`    Warning: ${err}`);
    }
  }

  // Gene count
  const genes = seed['genes'] as Record<string, unknown> | undefined;
  if (genes) {
    console.log(`  Genes:      ${Object.keys(genes).length} gene keys`);
  }

  // Ontology stats
  if (stats) {
    console.log(`  Ontology:   ${stats['species']}sp ${stats['archetypes']}arch ${stats['elements']}elem ${stats['styles']}style ${stats['abilities']}ab ${stats['materials']}mat`);
  }

  console.log();
}

async function handleRender(engine: WebEngine, args: string[]): Promise<void> {
  const hash = args[0];
  if (!hash) {
    printError('Usage: gspl render <hash>');
    process.exitCode = 1;
    return;
  }
  const res = await engine.handle(buildRequest('GET', `/api/seed/${hash}/shader`));
  if (res.status >= 400) {
    printError(String((res.body as Record<string, unknown>)['message'] ?? 'Shader compilation failed'));
    process.exitCode = 1;
    return;
  }
  const body = res.body as Record<string, unknown>;
  console.log(`// GLSL Fragment Shader for seed: ${String(body['seedName'])} (${String(body['seedHash'])})`);
  console.log(String(body['fragmentShader']));
}

async function handleExport(engine: WebEngine, args: string[]): Promise<void> {
  const hash = args[0];
  if (!hash) {
    printError('Usage: gspl export <hash> [format]');
    printError('  Formats: json, html, markdown, python, rust, gdscript, glsl, csv, svg, gspl');
    process.exitCode = 1;
    return;
  }
  const format = args[1] ?? 'json';
  const res = await engine.handle(buildRequest('POST', '/api/forge', { hash, type: format === 'json' ? 'source_code' : format === 'html' ? 'html_page' : 'source_code' }));
  if (res.status >= 400) {
    printError(String((res.body as Record<string, unknown>)['message'] ?? 'Export failed'));
    process.exitCode = 1;
    return;
  }
  printJson(res.body);
}

async function handleWorld(engine: WebEngine, args: string[]): Promise<void> {
  const sub = args[0] ?? 'status';
  switch (sub) {
    case 'create': {
      const seedStr = args[1] ?? `world_${Date.now()}`;
      const res = await engine.handle(buildRequest('POST', '/api/chat', { message: `create world ${seedStr}` }));
      printJson(res.body);
      break;
    }
    case 'status': {
      const res = await engine.handle(buildRequest('GET', '/api/status'));
      printJson(res.body);
      break;
    }
    case 'tick': {
      const steps = args[1] ?? '1';
      const res = await engine.handle(buildRequest('POST', '/api/simulate', { steps: Number(steps) }));
      printJson(res.body);
      break;
    }
    default:
      printError('Usage: gspl world [create|status|tick] [args...]');
      process.exitCode = 1;
  }
}

async function handleGsplExec(engine: WebEngine, args: string[]): Promise<void> {
  const code = args.join(' ');
  if (!code.trim()) {
    printError('Usage: gspl exec <gspl code>');
    printError('  Example: gspl exec "const x = 2 + 3;"');
    process.exitCode = 1;
    return;
  }
  const res = await engine.handle(buildRequest('POST', '/api/gspl/execute', { code }));
  printJson(res.body);
}

async function handleOntology(engine: WebEngine, args: string[]): Promise<void> {
  const sub = args[0] ?? 'stats';
  switch (sub) {
    case 'stats': {
      const res = await engine.handle(buildRequest('GET', '/api/ontology/stats'));
      printJson(res.body);
      break;
    }
    case 'analyze': {
      const text = args.slice(1).join(' ');
      if (!text.trim()) {
        printError('Usage: gspl ontology analyze <concept text>');
        process.exitCode = 1;
        return;
      }
      const res = await engine.handle(buildRequest('POST', '/api/ontology/analyze', { text }));
      const body = res.body as Record<string, unknown>;
      const analysis = body['analysis'] as Record<string, unknown> | undefined;
      if (analysis) {
        console.log(`\n  Ontology Analysis`);
        console.log(`  ${'='.repeat(40)}`);
        if (analysis['species']) console.log(`  Species:    ${String(analysis['species'])}`);
        if (analysis['archetype']) console.log(`  Archetype:  ${String(analysis['archetype'])}`);
        const elems = analysis['elements'] as string[] | undefined;
        if (elems?.length) console.log(`  Elements:   ${elems.join(', ')}`);
        if (analysis['style']) console.log(`  Style:      ${String(analysis['style'])}`);
        const abilities = analysis['abilities'] as string[] | undefined;
        if (abilities?.length) console.log(`  Abilities:  ${abilities.join(', ')}`);
        const materials = analysis['materials'] as string[] | undefined;
        if (materials?.length) console.log(`  Materials:  ${materials.join(', ')}`);
        const emergent = analysis['emergentProperties'] as string[] | undefined;
        if (emergent?.length) console.log(`  Emergent:   ${emergent.join(', ')}`);
        console.log();
      } else {
        printJson(body);
      }
      break;
    }
    default:
      printError('Usage: gspl ontology [stats|analyze] [args...]');
      process.exitCode = 1;
  }
}

async function handleBehavior(engine: WebEngine, args: string[]): Promise<void> {
  const hash = args[0];
  if (!hash) {
    printError('Usage: gspl behavior <hash>');
    process.exitCode = 1;
    return;
  }
  const res = await engine.handle(buildRequest('GET', `/api/seed/${hash}/behavior`));
  printJson(res.body);
}

async function handleSprite(engine: WebEngine, args: string[]): Promise<void> {
  const hash = args[0];
  if (!hash) {
    printError('Usage: gspl sprite <hash> [format]');
    printError('  Formats: json, godot, css, html');
    process.exitCode = 1;
    return;
  }

  const format = args[1];
  if (format) {
    // Export in specific format
    const res = await engine.handle(buildRequest('POST', `/api/seed/${hash}/sprite/export`, { format }));
    if (res.status >= 400) {
      printError(String((res.body as Record<string, unknown>)['message'] ?? 'Export failed'));
      process.exitCode = 1;
      return;
    }
    const body = res.body as Record<string, unknown>;
    console.log(String(body['content'] ?? ''));
  } else {
    // Show sprite sheet info
    const res = await engine.handle(buildRequest('GET', `/api/seed/${hash}/sprite`));
    if (res.status >= 400) {
      printError(String((res.body as Record<string, unknown>)['message'] ?? 'Sprite generation failed'));
      process.exitCode = 1;
      return;
    }
    const body = res.body as Record<string, unknown>;
    const sheet = body['spriteSheet'] as Record<string, unknown> | undefined;
    const pa = body['pixelArt'] as Record<string, unknown> | undefined;
    const pal = body['palette'] as Record<string, unknown> | undefined;

    console.log(`\n  Sprite Sheet: ${String(body['seedName'])}`);
    console.log(`  ${'='.repeat(40)}`);
    if (sheet) {
      console.log(`  Size:       ${String(sheet['width'])} x ${String(sheet['height'])}`);
      const anims = sheet['animations'] as unknown[] | undefined;
      if (anims) {
        console.log(`  Animations: ${anims.length}`);
        for (const a of anims) {
          const anim = a as Record<string, unknown>;
          console.log(`    - ${String(anim['name'])} (${String(anim['frameCount'])} frames)`);
        }
      }
    }
    if (pa) console.log(`  Pixel Art:  ${String(pa['width'])}x${String(pa['height'])} (${String(pa['pixelCount'])} pixels)`);
    if (pal) console.log(`  Palette:    ${String((pal as Record<string, unknown>)['name'])}`);
    console.log(`  Formats:    json, godot, css, html`);
    console.log();
  }
}

async function handleEngines(engine: WebEngine, args: string[]): Promise<void> {
  const sub = args[0] ?? 'list';
  switch (sub) {
    case 'list': {
      const res = await engine.handle(buildRequest('GET', '/api/engines'));
      const body = res.body as Record<string, unknown>;
      const engines = body['engines'] as Array<Record<string, unknown>> | undefined;
      if (engines) {
        console.log(`\n  ${engines.length} Domain Engines`);
        console.log(`  ${'='.repeat(40)}`);
        for (const e of engines) {
          const domains = (e['domains'] as string[])?.join(', ') ?? '';
          console.log(`  ${String(e['name']).padEnd(25)} ${domains}`);
        }
        console.log();
      }
      break;
    }
    default:
      printError('Usage: gspl engines [list]');
      process.exitCode = 1;
  }
}

async function handleGenerate(engine: WebEngine, args: string[]): Promise<void> {
  const sub = args[0] ?? 'name';
  switch (sub) {
    case 'name': {
      const count = Number(args[1] ?? 8);
      const res = await engine.handle(buildRequest('POST', '/api/generate/name', { count }));
      const body = res.body as Record<string, unknown>;
      const names = body['names'] as string[] | undefined;
      if (names) {
        console.log(`Generated names: ${names.join(', ')}`);
      }
      break;
    }
    default:
      printError('Usage: gspl generate [name] [count]');
      process.exitCode = 1;
  }
}

async function handleStatus(engine: WebEngine): Promise<void> {
  const res = await engine.handle(buildRequest('GET', '/api/health'));
  const status = engine.getStatus();
  printJson({
    ...res.body as Record<string, unknown>,
    seedCount: status.seedCount,
    routes: status.routeCount,
    uptime: status.uptime,
  });
}

function printHelp(): void {
  console.log(`GSPL Paradigm CLI v2.0.0 — The Living World Compiler

Usage: gspl <command> [args...]

Entity Commands:
  create <description>              Create entity (v2 enhanced pipeline with ontology + power system)
  render <hash>                     Compile seed to GLSL shader
  sprite <hash> [format]            Generate sprite sheet (json/godot/css/html)
  behavior <hash>                   Show behavior tree for an entity
  export <hash> [format]            Export seed as artifact

Seed Commands:
  seed create <name> [domain]       Create a raw seed with derived genes
  seed list                         List all seeds
  seed inspect <hash>               Show seed details

Intelligence Commands:
  ontology stats                    Show ontology taxonomy sizes (178 nodes)
  ontology analyze <text>           Analyze concept through 6 taxonomies
  engines list                      List all 24 domain engines
  generate name [count]             Generate procedural names

World Commands:
  world create [seed]               Create procedural world
  world status                      Show world summary
  world tick [steps]                Advance simulation

Evolution Commands:
  evolve [generations] [popSize]    Run evolution on population
  forge <hash> [type]               Forge artifact from seed

Language Commands:
  exec <gspl code>                  Execute GSPL code
  chat <message...>                 Chat with the GSPL agent

Other:
  status                            Show engine status
  help                              Show this help

Examples:
  gspl create "Goku super saiyan blue kamehameha shonen"
  gspl create "looney tunes cartoon cat slapstick"
  gspl create "photorealistic medieval knight frost magic"
  gspl ontology analyze "cosmic undead ice dragon"
  gspl generate name 10
  gspl engines list
  gspl exec "const x = 2 + 3;"`);
}

// ─────────────────────────────────────────────
// CLI Dispatch
// ─────────────────────────────────────────────

export async function run(argv: string[]): Promise<void> {
  const command = argv[0];
  const args = argv.slice(1);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const engine = new WebEngine();

  switch (command) {
    case 'create': return handleCreate(engine, args);
    case 'render': return handleRender(engine, args);
    case 'behavior': return handleBehavior(engine, args);
    case 'sprite': return handleSprite(engine, args);
    case 'export': return handleExport(engine, args);
    case 'seed': return handleSeed(engine, args);
    case 'ontology': return handleOntology(engine, args);
    case 'engines': return handleEngines(engine, args);
    case 'generate': return handleGenerate(engine, args);
    case 'world': return handleWorld(engine, args);
    case 'evolve': return handleEvolve(engine, args);
    case 'forge': return handleForge(engine, args);
    case 'exec': return handleGsplExec(engine, args);
    case 'chat': return handleChat(engine, args);
    case 'status': return handleStatus(engine);
    default:
      printError(`Unknown command: ${command}. Run 'gspl help' for usage.`);
      process.exitCode = 1;
  }
}

// Export helpers for testing
export {
  buildRequest,
  handleCreate,
  handleRender,
  handleBehavior,
  handleSprite,
  handleExport,
  handleSeed,
  handleOntology,
  handleEngines,
  handleGenerate,
  handleWorld,
  handleGsplExec,
  handleEvolve,
  handleForge,
  handleChat,
  handleStatus,
  printHelp,
};

// Entry point when run directly (skip during test runs)
const isDirectRun =
  typeof (globalThis as Record<string, unknown>)['describe'] === 'undefined' &&
  (process.argv[1]?.endsWith('cli/src/index.ts') ||
   process.argv[1]?.endsWith('cli/dist/index.js'));
if (isDirectRun) {
  run(process.argv.slice(2));
}
