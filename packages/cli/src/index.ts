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
  console.log(`GSPL Paradigm CLI v1.0.0

Usage: gspl <command> [args...]

Commands:
  seed create <name> [domain]       Create a new seed
  seed list                         List all seeds
  seed inspect <hash>               Show seed details
  evolve [generations] [popSize]    Run evolution
  forge <hash> [type]               Forge artifact from seed
  chat <message...>                 Chat with the GSPL agent
  status                            Show world status
  help                              Show this help

Domains: organism, vehicle, terrain, music, shader, structure, item, spell, npc
Forge types: html_page, html_game, logo, source_code, character_sheet, sprite_sheet, soundtrack, ...

Examples:
  gspl seed create "Fire Dragon" organism
  gspl chat create a storm warrior with lightning powers
  gspl evolve 10 8
  gspl forge abc123 html_game`);
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
    case 'seed': return handleSeed(engine, args);
    case 'evolve': return handleEvolve(engine, args);
    case 'forge': return handleForge(engine, args);
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
  handleSeed,
  handleEvolve,
  handleForge,
  handleChat,
  handleStatus,
  printHelp,
};

// Entry point when run directly
const isMainModule = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMainModule) {
  run(process.argv.slice(2));
}
