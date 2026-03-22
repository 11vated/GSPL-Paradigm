/**
 * @paradigm/tui — Raw terminal I/O layer.
 *
 * Manages raw mode, stdin keypress reading, stdout writing, resize events,
 * and cursor control. This is the lowest-level bridge between the pure
 * ScreenBuffer rendering in index.ts and the real terminal.
 *
 * @packageDocumentation
 */

import * as readline from 'node:readline';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Terminal dimensions in columns and rows. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

/** Parsed keypress event from readline. */
export interface KeyEvent {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly sequence: string;
}

/** Events emitted by the Terminal class. */
export interface TerminalEvents {
  keypress: [key: KeyEvent];
  resize: [size: TerminalSize];
}

// ─────────────────────────────────────────────
// Terminal
// ─────────────────────────────────────────────

/**
 * Raw terminal I/O layer.
 *
 * Enters raw mode on start(), emits 'keypress' and 'resize' events,
 * provides cursor movement and screen clearing primitives. Cleans up
 * gracefully on stop() — restores cursor visibility, exits raw mode,
 * and releases stdin.
 *
 * Usage:
 * ```ts
 * const term = new Terminal();
 * term.start();
 * term.on('keypress', (key) => { ... });
 * term.on('resize', (size) => { ... });
 * // later:
 * term.stop();
 * ```
 */
export class Terminal extends EventEmitter {
  private rl: readline.Interface | null = null;
  private started = false;

  /** Handler references for cleanup. */
  private readonly boundKeypress = (str: string | undefined, key: KeyEvent): void => {
    this.handleKeypress(str, key);
  };

  private readonly boundResize = (): void => {
    this.emit('resize', this.size);
  };

  /** Current terminal dimensions. Falls back to 80x24 if not a TTY. */
  get size(): TerminalSize {
    return {
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
    };
  }

  /** Whether the terminal is currently in raw mode and listening. */
  get isStarted(): boolean {
    return this.started;
  }

  /**
   * Enter raw mode and start listening for keypresses.
   *
   * Hides the cursor and clears the screen. Ctrl+C is intercepted
   * to call stop() and exit cleanly.
   *
   * @throws Error if already started.
   */
  start(): void {
    if (this.started) {
      throw new Error('Terminal.start() called but terminal is already started');
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    this.rl = readline.createInterface({ input: process.stdin, terminal: true });
    readline.emitKeypressEvents(process.stdin, this.rl);

    process.stdin.on('keypress', this.boundKeypress);
    process.stdout.on('resize', this.boundResize);

    this.started = true;

    // Hide cursor
    this.write('\x1b[?25l');
    // Clear screen and move to home
    this.write('\x1b[2J\x1b[H');
  }

  /**
   * Exit raw mode and clean up all listeners.
   *
   * Restores cursor visibility and moves to the bottom of the screen
   * so the shell prompt appears cleanly.
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    // Show cursor
    this.write('\x1b[?25h');
    // Move to bottom row so shell prompt is clean
    this.write(`\x1b[${this.size.rows};1H\n`);

    process.stdin.removeListener('keypress', this.boundKeypress);
    process.stdout.removeListener('resize', this.boundResize);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();

    this.rl?.close();
    this.rl = null;
    this.started = false;
  }

  /**
   * Write a string directly to stdout.
   *
   * @param data - Raw string (may include ANSI escape sequences).
   */
  write(data: string): void {
    process.stdout.write(data);
  }

  /**
   * Move the cursor to an absolute position.
   *
   * @param x - Column (0-based).
   * @param y - Row (0-based).
   */
  moveTo(x: number, y: number): void {
    this.write(`\x1b[${y + 1};${x + 1}H`);
  }

  /** Clear the entire screen and move cursor to home position. */
  clear(): void {
    this.write('\x1b[2J\x1b[H');
  }

  /** Hide the terminal cursor. */
  hideCursor(): void {
    this.write('\x1b[?25l');
  }

  /** Show the terminal cursor. */
  showCursor(): void {
    this.write('\x1b[?25h');
  }

  /**
   * Flush a pre-rendered frame string to the terminal.
   *
   * Moves to (0,0) and writes the entire frame. This is the primary
   * method for double-buffered rendering — build the frame in a
   * ScreenBuffer, call buffer.render(), then flush it here.
   *
   * @param frame - Complete screen content as a single string.
   */
  flush(frame: string): void {
    this.moveTo(0, 0);
    this.write(frame);
  }

  /**
   * Internal keypress handler.
   * Intercepts Ctrl+C for clean shutdown; emits all other keys.
   */
  private handleKeypress(_str: string | undefined, key: KeyEvent): void {
    if (key?.ctrl && key.name === 'c') {
      this.stop();
      process.exit(0);
    }
    this.emit('keypress', key);
  }
}

export default Terminal;
