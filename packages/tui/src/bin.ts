#!/usr/bin/env node
/**
 * @paradigm/tui — CLI entry point.
 *
 * Launches the full-screen GSPL Paradigm terminal UI.
 * Run directly: `npx gspl-tui` or `node dist/bin.js`
 *
 * @packageDocumentation
 */

import { TUIApp } from './app.js';

const app = new TUIApp();

// Ensure clean shutdown on uncaught errors
process.on('uncaughtException', (err: Error) => {
  app.stop();
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.stderr.write(`${err.stack ?? ''}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  app.stop();
  const message = reason instanceof Error ? reason.message : String(reason);
  process.stderr.write(`Unhandled rejection: ${message}\n`);
  process.exit(1);
});

// Handle SIGTERM/SIGINT for graceful shutdown
process.on('SIGTERM', () => {
  app.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  app.stop();
  process.exit(0);
});

app.start();
