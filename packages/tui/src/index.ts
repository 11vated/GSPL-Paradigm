/**
 * @paradigm/tui — Rich terminal UI for GSPL Paradigm (Layer 8: Surfaces).
 *
 * Pure TypeScript implementation: no actual terminal I/O, no process.stdout,
 * no readline. Provides screen buffer, ANSI rendering, panel layout,
 * sparklines, and visualization logic that can be connected to a real terminal.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, GeneMap, Gene } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ─────────────────────────────────────────────
// 1. ANSI — Escape code constants and helpers
// ─────────────────────────────────────────────

/** ANSI escape code constants and 24-bit color helpers. */
export const ANSI = {
  /** Reset all formatting. */
  reset: '\x1b[0m',
  /** Bold text. */
  bold: '\x1b[1m',
  /** Dim text. */
  dim: '\x1b[2m',
  /** Underlined text. */
  underline: '\x1b[4m',
  /** Clear entire screen. */
  clearScreen: '\x1b[2J',
  /** Clear current line. */
  clearLine: '\x1b[2K',

  // Named colors (24-bit foreground)
  /** Cyan foreground. */
  cyan: '\x1b[38;2;0;255;255m',
  /** Violet foreground. */
  violet: '\x1b[38;2;138;43;226m',
  /** Amber foreground. */
  amber: '\x1b[38;2;255;191;0m',
  /** Emerald foreground. */
  emerald: '\x1b[38;2;80;200;120m',
  /** Red foreground. */
  red: '\x1b[38;2;255;70;70m',
  /** White foreground. */
  white: '\x1b[38;2;255;255;255m',
  /** Gray foreground. */
  gray: '\x1b[38;2;128;128;128m',

  /** 24-bit foreground color. */
  fg(r: number, g: number, b: number): string {
    return `\x1b[38;2;${r};${g};${b}m`;
  },

  /** 24-bit background color. */
  bg(r: number, g: number, b: number): string {
    return `\x1b[48;2;${r};${g};${b}m`;
  },

  /** Move cursor to (row, col) — 1-based. */
  moveTo(row: number, col: number): string {
    return `\x1b[${row};${col}H`;
  },
} as const;

// ─────────────────────────────────────────────
// 2. ScreenBuffer — Virtual double-buffered screen
// ─────────────────────────────────────────────

/** A single cell in the screen buffer. */
export interface ScreenCell {
  readonly char: string;
  readonly color: string;
}

/** Box-drawing style for drawBox. */
export type BoxStyle = 'single' | 'double' | 'rounded';

interface BoxChars {
  readonly tl: string;
  readonly tr: string;
  readonly bl: string;
  readonly br: string;
  readonly h: string;
  readonly v: string;
}

const BOX_CHARS: Record<BoxStyle, BoxChars> = {
  single: { tl: '\u250c', tr: '\u2510', bl: '\u2514', br: '\u2518', h: '\u2500', v: '\u2502' },
  double: { tl: '\u2554', tr: '\u2557', bl: '\u255a', br: '\u255d', h: '\u2550', v: '\u2551' },
  rounded: { tl: '\u256d', tr: '\u256e', bl: '\u2570', br: '\u256f', h: '\u2500', v: '\u2502' },
};

/** Virtual screen buffer for double-buffered terminal rendering. */
export class ScreenBuffer {
  private width: number;
  private height: number;
  private cells: ScreenCell[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = this.createGrid(width, height);
  }

  /** Create a blank grid of cells. */
  private createGrid(w: number, h: number): ScreenCell[][] {
    const grid: ScreenCell[][] = [];
    for (let row = 0; row < h; row++) {
      const line: ScreenCell[] = [];
      for (let col = 0; col < w; col++) {
        line.push({ char: ' ', color: '' });
      }
      grid.push(line);
    }
    return grid;
  }

  /** Write text at position with optional ANSI color prefix. */
  write(x: number, y: number, text: string, color?: string): void {
    if (y < 0 || y >= this.height) return;
    const clr = color ?? '';
    for (let i = 0; i < text.length; i++) {
      const col = x + i;
      if (col < 0 || col >= this.width) continue;
      const ch = text[i];
      if (ch === undefined) continue;
      const row = this.cells[y];
      if (row === undefined) continue;
      row[col] = { char: ch, color: clr };
    }
  }

  /** Fill a rectangle with a character and optional color. */
  fillRect(x: number, y: number, w: number, h: number, char: string, color?: string): void {
    const fillChar = char[0] ?? ' ';
    const clr = color ?? '';
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        if (row < 0 || row >= this.height || col < 0 || col >= this.width) continue;
        const line = this.cells[row];
        if (line === undefined) continue;
        line[col] = { char: fillChar, color: clr };
      }
    }
  }

  /** Draw a box with Unicode box-drawing characters. */
  drawBox(x: number, y: number, w: number, h: number, style: BoxStyle = 'single'): void {
    if (w < 2 || h < 2) return;
    const chars = BOX_CHARS[style];

    // Corners
    this.write(x, y, chars.tl);
    this.write(x + w - 1, y, chars.tr);
    this.write(x, y + h - 1, chars.bl);
    this.write(x + w - 1, y + h - 1, chars.br);

    // Horizontal edges
    const hLine = chars.h.repeat(w - 2);
    this.write(x + 1, y, hLine);
    this.write(x + 1, y + h - 1, hLine);

    // Vertical edges
    for (let row = y + 1; row < y + h - 1; row++) {
      this.write(x, row, chars.v);
      this.write(x + w - 1, row, chars.v);
    }
  }

  /** Clear the entire buffer (fill with spaces). */
  clear(): void {
    this.cells = this.createGrid(this.width, this.height);
  }

  /** Render the buffer to a single string (rows joined by newlines). */
  render(): string {
    const lines: string[] = [];
    for (let row = 0; row < this.height; row++) {
      const line = this.cells[row];
      if (line === undefined) {
        lines.push('');
        continue;
      }
      let result = '';
      let currentColor = '';
      for (let col = 0; col < this.width; col++) {
        const cell = line[col];
        if (cell === undefined) {
          result += ' ';
          continue;
        }
        if (cell.color !== currentColor) {
          if (currentColor !== '') {
            result += ANSI.reset;
          }
          if (cell.color !== '') {
            result += cell.color;
          }
          currentColor = cell.color;
        }
        result += cell.char;
      }
      if (currentColor !== '') {
        result += ANSI.reset;
      }
      lines.push(result);
    }
    return lines.join('\n');
  }

  /** Get cell at position, or undefined if out of bounds. */
  getCell(x: number, y: number): ScreenCell | undefined {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return undefined;
    const row = this.cells[y];
    if (row === undefined) return undefined;
    return row[x];
  }

  /** Resize the buffer, clearing contents. */
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.cells = this.createGrid(w, h);
  }

  /** Get current width. */
  getWidth(): number {
    return this.width;
  }

  /** Get current height. */
  getHeight(): number {
    return this.height;
  }
}

// ─────────────────────────────────────────────
// 3. Sparkline — Unicode sparkline charts
// ─────────────────────────────────────────────

const SPARK_CHARS = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';

/** Unicode sparkline chart renderer. */
export const Sparkline = {
  /**
   * Render values as a sparkline string of the given width.
   * If values exceed width, only the last `width` values are shown.
   */
  render(values: number[], width: number): string {
    if (values.length === 0 || width <= 0) return '';

    // Take the last `width` values if there are more
    const slice = values.length > width ? values.slice(values.length - width) : values;
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    const range = max - min;

    let result = '';
    for (let i = 0; i < slice.length && i < width; i++) {
      const val = slice[i];
      if (val === undefined) continue;
      if (range === 0) {
        result += SPARK_CHARS[3] ?? '\u2584';
      } else {
        const normalized = (val - min) / range;
        const idx = Math.min(Math.floor(normalized * 7), 7);
        result += SPARK_CHARS[idx] ?? '\u2581';
      }
    }

    // Pad to width if fewer values
    while (result.length < width && result.length < slice.length) {
      result += ' ';
    }

    return result;
  },

  /** Render a sparkline with a leading label. */
  renderWithLabel(label: string, values: number[], width: number): string {
    const prefix = `${label} `;
    const sparkWidth = Math.max(1, width - prefix.length);
    return prefix + Sparkline.render(values, sparkWidth);
  },

  /** Render a horizontal bar: filled portion with block chars, remainder with light shade. */
  renderBar(value: number, max: number, width: number): string {
    if (max <= 0 || width <= 0) return '\u2591'.repeat(width);
    const clamped = Math.max(0, Math.min(value, max));
    const filled = Math.round((clamped / max) * width);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  },
} as const;

// ─────────────────────────────────────────────
// 4. TableRenderer — ASCII table rendering
// ─────────────────────────────────────────────

/** Options for table rendering. */
export interface TableOptions {
  readonly maxWidth?: number;
  readonly padding?: number;
}

/** ASCII table renderer with auto column widths. */
export const TableRenderer = {
  /** Render a table with headers and rows. */
  render(headers: string[], rows: string[][], options?: TableOptions): string {
    const padding = options?.padding ?? 1;
    const maxWidth = options?.maxWidth ?? 120;
    const colCount = headers.length;

    if (colCount === 0) return '';

    // Calculate column widths from headers and data
    const colWidths: number[] = headers.map((h) => h.length);
    for (const row of rows) {
      for (let i = 0; i < colCount; i++) {
        const cell = row[i] ?? '';
        const existing = colWidths[i] ?? 0;
        colWidths[i] = Math.max(existing, cell.length);
      }
    }

    // Clamp total width
    const totalPadding = padding * 2 * colCount + (colCount + 1);
    const totalContentWidth = colWidths.reduce((sum, w) => sum + (w ?? 0), 0);
    if (totalContentWidth + totalPadding > maxWidth && colCount > 0) {
      const available = maxWidth - totalPadding;
      const perCol = Math.max(3, Math.floor(available / colCount));
      for (let i = 0; i < colWidths.length; i++) {
        const w = colWidths[i];
        if (w !== undefined && w > perCol) {
          colWidths[i] = perCol;
        }
      }
    }

    const pad = ' '.repeat(padding);

    /** Format a single row of cells. */
    const formatRow = (cells: string[]): string => {
      const parts: string[] = [];
      for (let i = 0; i < colCount; i++) {
        const cellText = cells[i] ?? '';
        const w = colWidths[i] ?? 0;
        const truncated = cellText.length > w ? cellText.slice(0, w - 1) + '\u2026' : cellText;
        parts.push(pad + truncated.padEnd(w) + pad);
      }
      return '\u2502' + parts.join('\u2502') + '\u2502';
    };

    // Separator line
    const separatorParts: string[] = [];
    for (let i = 0; i < colCount; i++) {
      const w = colWidths[i] ?? 0;
      separatorParts.push('\u2500'.repeat(w + padding * 2));
    }
    const separator = '\u251c' + separatorParts.join('\u253c') + '\u2524';
    const topBorder = '\u250c' + separatorParts.join('\u252c') + '\u2510';
    const bottomBorder = '\u2514' + separatorParts.join('\u2534') + '\u2518';

    const lines: string[] = [];
    lines.push(topBorder);
    lines.push(formatRow(headers));
    lines.push(separator);
    for (const row of rows) {
      lines.push(formatRow(row));
    }
    lines.push(bottomBorder);

    return lines.join('\n');
  },
} as const;

// ─────────────────────────────────────────────
// 5. TreeRenderer — Phylogenetic/lineage tree
// ─────────────────────────────────────────────

/** A node in a renderable tree. */
export interface TreeNode {
  readonly label: string;
  readonly children?: readonly TreeNode[];
}

/** Renders a tree structure using box-drawing characters. */
export const TreeRenderer = {
  /** Render a tree from the root node. */
  render(root: TreeNode): string {
    const lines: string[] = [];
    lines.push(root.label);
    TreeRenderer.renderChildren(root.children ?? [], '', lines);
    return lines.join('\n');
  },

  /** Recursively render children with proper indentation. */
  renderChildren(children: readonly TreeNode[], prefix: string, lines: string[]): void {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === undefined) continue;
      const isLast = i === children.length - 1;
      const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';
      const extension = isLast ? '    ' : '\u2502   ';
      lines.push(prefix + connector + child.label);
      TreeRenderer.renderChildren(child.children ?? [], prefix + extension, lines);
    }
  },
} as const;

// ─────────────────────────────────────────────
// 6. PanelLayout — Split-pane terminal layout
// ─────────────────────────────────────────────

/** A panel in the terminal layout. */
export interface Panel {
  readonly id: string;
  title: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Split-pane terminal layout manager. */
export class PanelLayout {
  private panels: Map<string, Panel> = new Map();

  /** Add a panel to the layout. */
  addPanel(id: string, title: string, x: number, y: number, w: number, h: number): void {
    this.panels.set(id, { id, title, content: '', x, y, width: w, height: h });
  }

  /** Update the content of an existing panel. */
  updateContent(id: string, content: string): void {
    const panel = this.panels.get(id);
    if (panel !== undefined) {
      panel.content = content;
    }
  }

  /** Remove a panel by ID. */
  removePanel(id: string): void {
    this.panels.delete(id);
  }

  /** Get a panel by ID. */
  getPanel(id: string): Panel | undefined {
    return this.panels.get(id);
  }

  /** Render all panels onto a ScreenBuffer. */
  render(buffer: ScreenBuffer): void {
    for (const panel of this.panels.values()) {
      this.renderPanel(panel, buffer);
    }
  }

  /** Render a single panel with border and title onto the buffer. */
  private renderPanel(panel: Panel, buffer: ScreenBuffer): void {
    // Draw border
    buffer.drawBox(panel.x, panel.y, panel.width, panel.height, 'single');

    // Draw title centered in top border
    if (panel.title.length > 0 && panel.width > 4) {
      const maxTitleLen = panel.width - 4;
      const displayTitle = panel.title.length > maxTitleLen
        ? panel.title.slice(0, maxTitleLen - 1) + '\u2026'
        : panel.title;
      const titleStr = ` ${displayTitle} `;
      const titleX = panel.x + Math.max(1, Math.floor((panel.width - titleStr.length) / 2));
      buffer.write(titleX, panel.y, titleStr, ANSI.bold + ANSI.cyan);
    }

    // Draw content inside the panel
    const contentLines = panel.content.split('\n');
    const innerWidth = panel.width - 2;
    const innerHeight = panel.height - 2;
    for (let i = 0; i < innerHeight && i < contentLines.length; i++) {
      const line = contentLines[i];
      if (line === undefined) continue;
      const truncated = line.length > innerWidth ? line.slice(0, innerWidth) : line;
      buffer.write(panel.x + 1, panel.y + 1 + i, truncated);
    }
  }
}

// ─────────────────────────────────────────────
// 7. SeedRenderer — Render seed summaries
// ─────────────────────────────────────────────

/** Format a gene value as a display string. */
function formatGeneValue(gene: Gene): string {
  switch (gene.type) {
    case 'scalar':
      return gene.value.toFixed(3);
    case 'categorical':
      return gene.value;
    case 'vector':
      return `[${gene.value.slice(0, 3).map((v) => v.toFixed(2)).join(', ')}${gene.value.length > 3 ? ', ...' : ''}]`;
    case 'expression':
      return gene.source.length > 20 ? gene.source.slice(0, 17) + '...' : gene.source;
    case 'struct': {
      const keys = Object.keys(gene.value);
      return `{${keys.length} fields}`;
    }
    case 'array':
      return `[${gene.value.length} items]`;
    case 'graph':
      return `graph(${gene.nodes.size}n, ${gene.edges.length}e)`;
    case 'tensor':
      return `tensor(${gene.shape.join('x')})`;
    case 'timeseries':
      return `ts(${gene.keyframes.length}kf, ${gene.interpolation})`;
  }
}

/** Render seed information for terminal display. */
export const SeedRenderer = {
  /** Render a formatted seed card as an array of lines. */
  renderSeedCard(seed: UniversalSeed, width: number): string[] {
    const lines: string[] = [];
    const innerW = Math.max(10, width - 4);
    const border = '\u2500'.repeat(innerW + 2);

    lines.push('\u256d' + border + '\u256e');

    const addLine = (text: string): void => {
      const truncated = text.length > innerW ? text.slice(0, innerW - 1) + '\u2026' : text;
      lines.push('\u2502 ' + truncated.padEnd(innerW) + ' \u2502');
    };

    addLine(`Name:   ${seed.$name}`);
    addLine(`Domain: ${seed.$domain}`);
    addLine(`Hash:   ${seed.$hash.slice(0, 16)}...`);
    addLine(`Gen:    ${seed.$lineage.generation}`);

    const geneCount = Object.keys(seed.genes).length;
    addLine(`Genes:  ${geneCount}`);

    // Fitness bar
    const fitness = seed.$fitness?.primary ?? 0;
    const barWidth = Math.max(5, innerW - 12);
    const bar = Sparkline.renderBar(fitness, 1, barWidth);
    addLine(`Fitness ${bar} ${(fitness * 100).toFixed(0)}%`);

    lines.push('\u2570' + border + '\u256f');
    return lines;
  },

  /** Render a compact list of seeds with fitness sparklines. */
  renderSeedList(seeds: readonly UniversalSeed[], width: number): string {
    if (seeds.length === 0) return '(no seeds)';

    const lines: string[] = [];
    const nameWidth = Math.min(20, Math.floor(width * 0.3));
    const sparkWidth = Math.min(20, Math.floor(width * 0.25));

    // Header
    lines.push(
      'Name'.padEnd(nameWidth) + ' ' +
      'Domain'.padEnd(12) + ' ' +
      'Gen'.padStart(4) + ' ' +
      'Fitness'.padEnd(sparkWidth + 5),
    );
    lines.push('\u2500'.repeat(Math.min(width, nameWidth + 12 + 4 + sparkWidth + 8)));

    // Collect fitness values per seed for sparklines
    for (const seed of seeds) {
      const name = seed.$name.length > nameWidth
        ? seed.$name.slice(0, nameWidth - 1) + '\u2026'
        : seed.$name.padEnd(nameWidth);
      const domain = seed.$domain.padEnd(12);
      const gen = seed.$lineage.generation.toString().padStart(4);
      const fitness = seed.$fitness?.primary ?? 0;
      const bar = Sparkline.renderBar(fitness, 1, sparkWidth);
      const pct = (fitness * 100).toFixed(0).padStart(3) + '%';
      lines.push(`${name} ${domain} ${gen} ${bar} ${pct}`);
    }

    return lines.join('\n');
  },

  /** Render a gene table using TableRenderer. */
  renderGeneTable(seed: UniversalSeed): string {
    const headers = ['Gene', 'Type', 'Value'];
    const rows: string[][] = [];

    for (const [name, gene] of Object.entries(seed.genes)) {
      rows.push([name, gene.type, formatGeneValue(gene)]);
    }

    if (rows.length === 0) {
      return '(no genes)';
    }

    return TableRenderer.render(headers, rows, { maxWidth: 80, padding: 1 });
  },
} as const;

// ─────────────────────────────────────────────
// 8. StatusBar — Bottom status bar
// ─────────────────────────────────────────────

/** Information for the status bar display. */
export interface StatusBarInfo {
  readonly worldName: string;
  readonly generation: number;
  readonly seedCount: number;
  readonly fps?: number;
  readonly status?: string;
}

/** Bottom status bar renderer. */
export const StatusBar = {
  /** Render a status bar line of the given width. */
  render(info: StatusBarInfo, width: number): string {
    const left = ` ${info.worldName} | Gen: ${info.generation} | Seeds: ${info.seedCount}`;
    const fpsStr = info.fps !== undefined ? `${info.fps}fps ` : '';
    const statusStr = info.status ?? 'ready';
    const right = `${fpsStr}${statusStr} `;

    const gap = Math.max(0, width - left.length - right.length);
    const line = left + ' '.repeat(gap) + right;

    // Clamp or pad to exact width
    if (line.length > width) {
      return line.slice(0, width);
    }
    return line.padEnd(width);
  },
} as const;

// ─────────────────────────────────────────────
// 9. CommandLine — Input prompt area
// ─────────────────────────────────────────────

/** Command line input with history. */
export class CommandLine {
  private input: string = '';
  private history: string[] = [];
  private prompt: string;

  constructor(prompt?: string) {
    this.prompt = prompt ?? 'paradigm> ';
  }

  /** Get the prompt string. */
  getPrompt(): string {
    return this.prompt;
  }

  /** Set the current input text. */
  setInput(text: string): void {
    this.input = text;
  }

  /** Get the current input text. */
  getInput(): string {
    return this.input;
  }

  /** Render the command line to a string of the given width. */
  render(width: number): string {
    const full = this.prompt + this.input + '\u2588'; // block cursor indicator
    if (full.length > width) {
      return full.slice(full.length - width);
    }
    return full.padEnd(width);
  }

  /** Add a command to the history. */
  addToHistory(cmd: string): void {
    if (cmd.length > 0) {
      this.history.push(cmd);
    }
  }

  /** Get the command history. */
  getHistory(): string[] {
    return [...this.history];
  }
}

// ─────────────────────────────────────────────
// 10. TUIEngine — Top-level entry point
// ─────────────────────────────────────────────

/** World state passed to the TUI engine for rendering. */
export interface TUIWorldState {
  readonly seeds: readonly UniversalSeed[];
  readonly generation: number;
  readonly worldName: string;
}

/** Top-level TUI engine that composes all rendering components. */
export class TUIEngine {
  /** The virtual screen buffer. */
  readonly buffer: ScreenBuffer;
  /** The panel layout manager. */
  readonly layout: PanelLayout;
  /** The status bar renderer reference (use StatusBar.render directly). */
  readonly statusBar: typeof StatusBar;
  /** The command line input. */
  readonly commandLine: CommandLine;

  private rng: DeterministicRNG;
  private width: number;
  private height: number;

  constructor(width: number, height: number, rng?: DeterministicRNG) {
    this.width = width;
    this.height = height;
    this.rng = rng ?? new DeterministicRNG('tui-default');
    this.buffer = new ScreenBuffer(width, height);
    this.layout = new PanelLayout();
    this.statusBar = StatusBar;
    this.commandLine = new CommandLine();

    // Set up default panels
    this.setupDefaultLayout();
  }

  /** Create default panel layout. */
  private setupDefaultLayout(): void {
    const mainWidth = Math.floor(this.width * 0.6);
    const sideWidth = this.width - mainWidth;
    const contentHeight = this.height - 3; // reserve 1 for status, 1 for command, 1 padding

    this.layout.addPanel('main', 'World', 0, 0, mainWidth, contentHeight);
    this.layout.addPanel('info', 'Info', mainWidth, 0, sideWidth, Math.floor(contentHeight / 2));
    this.layout.addPanel(
      'log',
      'Log',
      mainWidth,
      Math.floor(contentHeight / 2),
      sideWidth,
      contentHeight - Math.floor(contentHeight / 2),
    );
  }

  /**
   * Render a complete terminal frame from world state.
   * Returns the full screen as a single string.
   */
  renderFrame(worldState: TUIWorldState): string {
    this.buffer.clear();

    // Build main panel content: seed list
    const mainPanel = this.layout.getPanel('main');
    const mainInnerW = mainPanel !== undefined ? mainPanel.width - 2 : this.width - 2;
    const seedListContent = SeedRenderer.renderSeedList(worldState.seeds, mainInnerW);
    this.layout.updateContent('main', seedListContent);

    // Build info panel: top seed card (if any)
    if (worldState.seeds.length > 0) {
      const topSeed = this.findTopSeed(worldState.seeds);
      if (topSeed !== undefined) {
        const infoPanel = this.layout.getPanel('info');
        const infoW = infoPanel !== undefined ? infoPanel.width - 2 : 30;
        const cardLines = SeedRenderer.renderSeedCard(topSeed, infoW);
        this.layout.updateContent('info', cardLines.join('\n'));
      }
    } else {
      this.layout.updateContent('info', '(no seeds)');
    }

    // Render panels onto buffer
    this.layout.render(this.buffer);

    // Render status bar on second-to-last row
    const statusRow = this.height - 2;
    const statusStr = StatusBar.render(
      {
        worldName: worldState.worldName,
        generation: worldState.generation,
        seedCount: worldState.seeds.length,
        status: 'ready',
      },
      this.width,
    );
    this.buffer.write(0, statusRow, statusStr, ANSI.bg(30, 30, 60) + ANSI.white);

    // Render command line on last row
    const cmdRow = this.height - 1;
    const cmdStr = this.commandLine.render(this.width);
    this.buffer.write(0, cmdRow, cmdStr, ANSI.emerald);

    return this.buffer.render();
  }

  /** Find the seed with the highest primary fitness. */
  private findTopSeed(seeds: readonly UniversalSeed[]): UniversalSeed | undefined {
    let best: UniversalSeed | undefined;
    let bestFitness = -Infinity;
    for (const seed of seeds) {
      const fitness = seed.$fitness?.primary ?? 0;
      if (fitness > bestFitness) {
        bestFitness = fitness;
        best = seed;
      }
    }
    return best;
  }

  /** Resize the engine and all components. */
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.buffer.resize(w, h);

    // Rebuild layout with new dimensions
    this.layout.removePanel('main');
    this.layout.removePanel('info');
    this.layout.removePanel('log');
    this.setupDefaultLayout();
  }

  /** Get the RNG instance (for deterministic testing). */
  getRng(): DeterministicRNG {
    return this.rng;
  }

  /** Get current width. */
  getWidth(): number {
    return this.width;
  }

  /** Get current height. */
  getHeight(): number {
    return this.height;
  }
}
