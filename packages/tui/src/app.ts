/**
 * @paradigm/tui — Main TUI application.
 *
 * Runs the interactive event loop: read keypresses, update state, render.
 * Composes the Terminal (I/O layer) with the rendering primitives from
 * index.ts to produce a full-screen terminal UI.
 *
 * @packageDocumentation
 */

import { Terminal } from './terminal.js';
import type { KeyEvent, TerminalSize } from './terminal.js';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Available top-level views. */
export type ViewId = 'dashboard' | 'seed' | 'evolution' | 'chat' | 'forge';

/** Internal application state. */
interface AppState {
  activeView: ViewId;
  seedCount: number;
  lastMessage: string;
  scrollOffset: number;
}

/** View metadata for the tab bar. */
interface ViewMeta {
  readonly id: ViewId;
  readonly label: string;
  readonly key: string;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Ordered list of views and their hotkeys. */
const VIEWS: readonly ViewMeta[] = [
  { id: 'dashboard', label: 'Dashboard', key: '1' },
  { id: 'seed', label: 'Seeds', key: '2' },
  { id: 'evolution', label: 'Evolution', key: '3' },
  { id: 'forge', label: 'Forge', key: '4' },
  { id: 'chat', label: 'Chat', key: '5' },
] as const;

/** Unicode box-drawing horizontal rule. */
const HORIZONTAL_RULE = '\u2500';

// ─────────────────────────────────────────────
// TUIApp
// ─────────────────────────────────────────────

/**
 * Main TUI application.
 *
 * Manages the full-screen terminal UI lifecycle:
 * 1. Enters raw mode via Terminal.
 * 2. Listens for keypress and resize events.
 * 3. Routes keypresses to view switching or view-specific handlers.
 * 4. Re-renders the entire screen on every state change.
 *
 * Usage:
 * ```ts
 * const app = new TUIApp();
 * app.start();
 * ```
 */
export class TUIApp {
  private readonly terminal: Terminal;
  private state: AppState;
  private running = false;

  constructor() {
    this.terminal = new Terminal();
    this.state = {
      activeView: 'dashboard',
      seedCount: 0,
      lastMessage: 'Welcome to GSPL Paradigm TUI',
      scrollOffset: 0,
    };
  }

  /** Start the TUI — enters raw mode and begins the render loop. */
  start(): void {
    this.running = true;
    this.terminal.start();

    this.terminal.on('keypress', (key: KeyEvent) => {
      this.handleKeypress(key);
    });

    this.terminal.on('resize', (_size: TerminalSize) => {
      this.render();
    });

    this.render();
  }

  /** Stop the TUI — exits raw mode and restores the terminal. */
  stop(): void {
    this.running = false;
    this.terminal.stop();
  }

  /** Whether the app is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  // ─────────────────────────────────────────────
  // Input handling
  // ─────────────────────────────────────────────

  /** Route a keypress to the appropriate handler. */
  private handleKeypress(key: KeyEvent): void {
    if (!this.running) return;

    // Global hotkeys: number keys switch views
    switch (key.name) {
      case '1':
        this.state.activeView = 'dashboard';
        this.state.scrollOffset = 0;
        break;
      case '2':
        this.state.activeView = 'seed';
        this.state.scrollOffset = 0;
        break;
      case '3':
        this.state.activeView = 'evolution';
        this.state.scrollOffset = 0;
        break;
      case '4':
        this.state.activeView = 'forge';
        this.state.scrollOffset = 0;
        break;
      case '5':
        this.state.activeView = 'chat';
        this.state.scrollOffset = 0;
        break;
      case 'q':
        this.stop();
        process.exit(0);
        return;
      case 'tab':
        this.cycleView(key.shift ? -1 : 1);
        break;
      case 'up':
        this.state.scrollOffset = Math.max(0, this.state.scrollOffset - 1);
        break;
      case 'down':
        this.state.scrollOffset += 1;
        break;
      default:
        // View-specific key handling could be added here
        break;
    }

    this.render();
  }

  /** Cycle to the next or previous view. */
  private cycleView(direction: number): void {
    const idx = VIEWS.findIndex((v) => v.id === this.state.activeView);
    const nextIdx = (idx + direction + VIEWS.length) % VIEWS.length;
    const nextView = VIEWS[nextIdx];
    if (nextView !== undefined) {
      this.state.activeView = nextView.id;
      this.state.scrollOffset = 0;
    }
  }

  // ─────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────

  /** Full-screen render pass. */
  private render(): void {
    if (!this.running) return;

    const { columns, rows } = this.terminal.size;
    const lines: string[] = [];

    // 1. Header bar (green background, black text)
    const headerText = ' GSPL Paradigm \u2014 The Living World Compiler ';
    const headerPadded = headerText.padEnd(columns);
    lines.push(`\x1b[42;30m${headerPadded}\x1b[0m`);

    // 2. Tab bar
    lines.push(this.renderTabBar(columns));

    // 3. Horizontal separator
    lines.push(`\x1b[90m${HORIZONTAL_RULE.repeat(columns)}\x1b[0m`);

    // 4. View content (fills remaining space minus status bar)
    const reservedLines = 4; // header + tabs + separator + status
    const contentHeight = Math.max(1, rows - reservedLines);
    const contentLines = this.renderView(this.state.activeView, columns, contentHeight);
    for (const line of contentLines) {
      lines.push(line);
    }

    // 5. Pad to fill screen above status bar
    while (lines.length < rows - 1) {
      lines.push('');
    }

    // 6. Status bar (gray background)
    const statusText =
      ` Seeds: ${this.state.seedCount}` +
      ` \u2502 View: ${this.state.activeView}` +
      ` \u2502 [Tab] Switch` +
      ` \u2502 [Q] Quit `;
    const statusPadded = statusText.padEnd(columns);
    lines.push(`\x1b[100m${statusPadded}\x1b[0m`);

    // Flush to terminal
    this.terminal.flush(lines.join('\n'));
  }

  /** Render the tab bar with active view highlighted. */
  private renderTabBar(width: number): string {
    let tabLine = '';
    for (const view of VIEWS) {
      if (view.id === this.state.activeView) {
        tabLine += `\x1b[32;1m [${view.key}] ${view.label} \x1b[0m`;
      } else {
        tabLine += `\x1b[90m [${view.key}] ${view.label} \x1b[0m`;
      }
    }
    return tabLine;
  }

  /** Render the content area for a specific view. */
  private renderView(view: ViewId, width: number, height: number): string[] {
    switch (view) {
      case 'dashboard':
        return this.renderDashboard(width, height);
      case 'seed':
        return this.renderSeedView(width, height);
      case 'evolution':
        return this.renderEvolutionView(width, height);
      case 'forge':
        return this.renderForgeView(width, height);
      case 'chat':
        return this.renderChatView(width, height);
    }
  }

  // ─────────────────────────────────────────────
  // View renderers
  // ─────────────────────────────────────────────

  /** Center a piece of text within a given width. */
  private centerText(text: string, width: number): string {
    const visibleLength = text.replace(/\x1b\[[^m]*m/g, '').length;
    const pad = Math.max(0, Math.floor((width - visibleLength) / 2));
    return ' '.repeat(pad) + text;
  }

  /** Dashboard: overview of the system state. */
  private renderDashboard(width: number, _height: number): string[] {
    const lines: string[] = [];
    lines.push('');
    lines.push(this.centerText('\x1b[32;1mGSPL Paradigm Dashboard\x1b[0m', width));
    lines.push('');
    lines.push(this.centerText(`Seeds in garden: ${this.state.seedCount}`, width));
    lines.push(this.centerText('Status: Ready', width));
    lines.push('');
    lines.push(this.centerText('\x1b[90mPress [2] to create seeds, [3] to evolve\x1b[0m', width));
    lines.push('');
    lines.push(this.centerText('\x1b[90mUse arrow keys to scroll, Tab to switch views\x1b[0m', width));
    return lines;
  }

  /** Seed creator view. */
  private renderSeedView(_width: number, _height: number): string[] {
    const lines: string[] = [];
    lines.push('');
    lines.push('  \x1b[1mSeed Creator\x1b[0m');
    lines.push('  \x1b[90m(API integration pending \u2014 use web UI for full seed creation)\x1b[0m');
    lines.push('');
    lines.push('  Seeds will appear here as they are created via the API.');
    lines.push('');
    lines.push('  \x1b[90mEndpoints:\x1b[0m');
    lines.push('    POST /api/seeds       \x1b[90m\u2014 Create a new seed\x1b[0m');
    lines.push('    GET  /api/seeds       \x1b[90m\u2014 List all seeds\x1b[0m');
    lines.push('    GET  /api/seeds/:id   \x1b[90m\u2014 Get seed details\x1b[0m');
    return lines;
  }

  /** Evolution lab view. */
  private renderEvolutionView(_width: number, _height: number): string[] {
    const lines: string[] = [];
    lines.push('');
    lines.push('  \x1b[1mEvolution Lab\x1b[0m');
    lines.push('  \x1b[90mConfigure and run evolution campaigns\x1b[0m');
    lines.push('');
    lines.push('  Fitness: \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588 (sparkline preview)');
    lines.push('  \x1b[90mConnect to API for live evolution tracking\x1b[0m');
    lines.push('');
    lines.push('  \x1b[90mControls:\x1b[0m');
    lines.push('    [Enter]  Start/pause evolution');
    lines.push('    [R]      Reset population');
    lines.push('    [\u2191/\u2193]    Scroll through generations');
    return lines;
  }

  /** Forge workshop view. */
  private renderForgeView(_width: number, _height: number): string[] {
    const lines: string[] = [];
    lines.push('');
    lines.push('  \x1b[1mForge Workshop\x1b[0m');
    lines.push('  \x1b[90mGenerate artifacts from evolved seeds\x1b[0m');
    lines.push('');
    lines.push('  Available artifact types:');
    lines.push('    \x1b[32m\u25cf\x1b[0m html_game        \x1b[90m\u2014 Playable HTML5 game\x1b[0m');
    lines.push('    \x1b[32m\u25cf\x1b[0m character_sheet  \x1b[90m\u2014 RPG character sheet\x1b[0m');
    lines.push('    \x1b[32m\u25cf\x1b[0m source_code      \x1b[90m\u2014 Generated source files\x1b[0m');
    lines.push('    \x1b[32m\u25cf\x1b[0m logo             \x1b[90m\u2014 SVG/PNG logo from seed DNA\x1b[0m');
    return lines;
  }

  /** Chat view for GSPL agent interaction. */
  private renderChatView(_width: number, _height: number): string[] {
    const lines: string[] = [];
    lines.push('');
    lines.push('  \x1b[1mGSPL Agent Chat\x1b[0m');
    lines.push('  \x1b[90mConverse with the seed-native AI\x1b[0m');
    lines.push('');
    lines.push(`  \x1b[32m>\x1b[0m ${this.state.lastMessage}`);
    lines.push('');
    lines.push('  \x1b[90mType a message and press Enter to send.\x1b[0m');
    lines.push('  \x1b[90mThe agent interprets commands in seed-native GSPL.\x1b[0m');
    return lines;
  }
}

export default TUIApp;
