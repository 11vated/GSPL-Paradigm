import { describe, it, expect, beforeEach } from 'vitest';
import {
  ANSI,
  ScreenBuffer,
  Sparkline,
  TableRenderer,
  TreeRenderer,
  PanelLayout,
  SeedRenderer,
  StatusBar,
  CommandLine,
  TUIEngine,
} from './index.js';
import type { TreeNode, StatusBarInfo } from './index.js';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import type { UniversalSeed, GeneMap, Gene } from '@paradigm/types';

// ── Helpers ──

function makeSeed(name: string, domain: string = 'organism', genes: GeneMap = {}, fitness?: number): UniversalSeed {
  const hash = computeQuickHash({ name, domain, t: name });
  const seed: UniversalSeed = {
    $gst: '4.0' as const,
    $name: name,
    $domain: domain as any,
    genes,
    $hash: hash,
    $lineage: { generation: 0, parents: [], ancestors: [] },
    $metadata: { createdAt: Date.now(), tags: [] },
  };
  if (fitness !== undefined) {
    return { ...seed, $fitness: { primary: fitness } } as UniversalSeed;
  }
  return seed;
}

// ── ANSI ──

describe('ANSI', () => {
  it('has reset escape', () => expect(ANSI.reset).toBe('\x1b[0m'));
  it('has bold escape', () => expect(ANSI.bold).toBe('\x1b[1m'));
  it('has dim escape', () => expect(ANSI.dim).toBe('\x1b[2m'));
  it('has underline escape', () => expect(ANSI.underline).toBe('\x1b[4m'));
  it('has clearScreen', () => expect(ANSI.clearScreen).toBe('\x1b[2J'));
  it('has clearLine', () => expect(ANSI.clearLine).toBe('\x1b[2K'));
  it('has named colors', () => {
    expect(ANSI.cyan).toContain('38;2;0;255;255');
    expect(ANSI.violet).toContain('38;2;138;43;226');
    expect(ANSI.amber).toContain('38;2;255;191;0');
    expect(ANSI.emerald).toContain('38;2;80;200;120');
    expect(ANSI.red).toContain('38;2;255;70;70');
    expect(ANSI.white).toContain('38;2;255;255;255');
    expect(ANSI.gray).toContain('38;2;128;128;128');
  });
  it('fg() produces 24-bit foreground', () => {
    expect(ANSI.fg(10, 20, 30)).toBe('\x1b[38;2;10;20;30m');
  });
  it('bg() produces 24-bit background', () => {
    expect(ANSI.bg(100, 200, 50)).toBe('\x1b[48;2;100;200;50m');
  });
  it('moveTo() produces cursor movement', () => {
    expect(ANSI.moveTo(5, 10)).toBe('\x1b[5;10H');
  });
});

// ── ScreenBuffer ──

describe('ScreenBuffer', () => {
  let buf: ScreenBuffer;

  beforeEach(() => {
    buf = new ScreenBuffer(40, 10);
  });

  it('has correct dimensions', () => {
    expect(buf.getWidth()).toBe(40);
    expect(buf.getHeight()).toBe(10);
  });

  it('cells default to space', () => {
    const cell = buf.getCell(0, 0);
    expect(cell?.char).toBe(' ');
    expect(cell?.color).toBe('');
  });

  it('write() places text at position', () => {
    buf.write(5, 3, 'hello');
    expect(buf.getCell(5, 3)?.char).toBe('h');
    expect(buf.getCell(6, 3)?.char).toBe('e');
    expect(buf.getCell(9, 3)?.char).toBe('o');
  });

  it('write() with color', () => {
    buf.write(0, 0, 'X', ANSI.red);
    expect(buf.getCell(0, 0)?.color).toBe(ANSI.red);
  });

  it('write() clips out-of-bounds x', () => {
    buf.write(38, 0, 'ABCDE');
    expect(buf.getCell(38, 0)?.char).toBe('A');
    expect(buf.getCell(39, 0)?.char).toBe('B');
    // 40+ should not crash
  });

  it('write() ignores negative y', () => {
    buf.write(0, -1, 'test');
    // Should not crash; cell at 0,0 unchanged
    expect(buf.getCell(0, 0)?.char).toBe(' ');
  });

  it('write() ignores y >= height', () => {
    buf.write(0, 10, 'test');
    expect(buf.getCell(0, 9)?.char).toBe(' ');
  });

  it('fillRect fills area', () => {
    buf.fillRect(2, 2, 3, 3, '#', ANSI.cyan);
    expect(buf.getCell(2, 2)?.char).toBe('#');
    expect(buf.getCell(4, 4)?.char).toBe('#');
    expect(buf.getCell(2, 2)?.color).toBe(ANSI.cyan);
    expect(buf.getCell(1, 1)?.char).toBe(' ');
  });

  it('fillRect clips to bounds', () => {
    buf.fillRect(38, 8, 10, 10, 'X');
    expect(buf.getCell(39, 9)?.char).toBe('X');
    // No crash from out-of-bounds writes
  });

  it('drawBox single style', () => {
    buf.drawBox(0, 0, 5, 3, 'single');
    expect(buf.getCell(0, 0)?.char).toBe('\u250c');
    expect(buf.getCell(4, 0)?.char).toBe('\u2510');
    expect(buf.getCell(0, 2)?.char).toBe('\u2514');
    expect(buf.getCell(4, 2)?.char).toBe('\u2518');
    expect(buf.getCell(1, 0)?.char).toBe('\u2500');
    expect(buf.getCell(0, 1)?.char).toBe('\u2502');
  });

  it('drawBox double style', () => {
    buf.drawBox(0, 0, 4, 3, 'double');
    expect(buf.getCell(0, 0)?.char).toBe('\u2554');
    expect(buf.getCell(3, 0)?.char).toBe('\u2557');
  });

  it('drawBox rounded style', () => {
    buf.drawBox(0, 0, 4, 3, 'rounded');
    expect(buf.getCell(0, 0)?.char).toBe('\u256d');
    expect(buf.getCell(3, 2)?.char).toBe('\u256f');
  });

  it('drawBox skips if too small', () => {
    buf.drawBox(0, 0, 1, 1);
    expect(buf.getCell(0, 0)?.char).toBe(' ');
  });

  it('clear() resets all cells', () => {
    buf.write(0, 0, 'data');
    buf.clear();
    expect(buf.getCell(0, 0)?.char).toBe(' ');
  });

  it('render() produces string', () => {
    buf.write(0, 0, 'AB');
    const output = buf.render();
    expect(output).toContain('AB');
    const lines = output.split('\n');
    expect(lines.length).toBe(10);
  });

  it('render() includes ANSI color codes', () => {
    buf.write(0, 0, 'R', ANSI.red);
    const output = buf.render();
    expect(output).toContain(ANSI.red);
    expect(output).toContain(ANSI.reset);
  });

  it('getCell returns undefined for out-of-bounds', () => {
    expect(buf.getCell(-1, 0)).toBeUndefined();
    expect(buf.getCell(0, -1)).toBeUndefined();
    expect(buf.getCell(40, 0)).toBeUndefined();
    expect(buf.getCell(0, 10)).toBeUndefined();
  });

  it('resize() changes dimensions', () => {
    buf.resize(20, 5);
    expect(buf.getWidth()).toBe(20);
    expect(buf.getHeight()).toBe(5);
  });

  it('resize() clears content', () => {
    buf.write(0, 0, 'X');
    buf.resize(10, 5);
    expect(buf.getCell(0, 0)?.char).toBe(' ');
  });
});

// ── Sparkline ──

describe('Sparkline', () => {
  it('renders values as unicode blocks', () => {
    const result = Sparkline.render([0, 0.5, 1], 3);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('\u2581');
    expect(result[2]).toBe('\u2588');
  });

  it('returns empty for empty values', () => {
    expect(Sparkline.render([], 10)).toBe('');
  });

  it('returns empty for zero width', () => {
    expect(Sparkline.render([1, 2], 0)).toBe('');
  });

  it('all same values use middle block', () => {
    const result = Sparkline.render([5, 5, 5], 3);
    expect(result[0]).toBe(result[1]);
    expect(result[1]).toBe(result[2]);
  });

  it('trims to width when more values', () => {
    const result = Sparkline.render([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(result.length).toBe(5);
  });

  it('renderWithLabel includes label', () => {
    const result = Sparkline.renderWithLabel('FIT', [0, 1], 20);
    expect(result.startsWith('FIT ')).toBe(true);
  });

  it('renderBar produces filled/empty blocks', () => {
    const bar = Sparkline.renderBar(5, 10, 10);
    expect(bar.length).toBe(10);
    expect(bar).toContain('\u2588');
    expect(bar).toContain('\u2591');
  });

  it('renderBar full value', () => {
    const bar = Sparkline.renderBar(10, 10, 5);
    expect(bar).toBe('\u2588'.repeat(5));
  });

  it('renderBar zero value', () => {
    const bar = Sparkline.renderBar(0, 10, 5);
    expect(bar).toBe('\u2591'.repeat(5));
  });

  it('renderBar handles max=0', () => {
    const bar = Sparkline.renderBar(5, 0, 5);
    expect(bar).toBe('\u2591'.repeat(5));
  });

  it('renderBar clamps value to max', () => {
    const bar = Sparkline.renderBar(20, 10, 5);
    expect(bar).toBe('\u2588'.repeat(5));
  });
});

// ── TableRenderer ──

describe('TableRenderer', () => {
  it('renders table with headers and rows', () => {
    const output = TableRenderer.render(['Name', 'Type'], [['hp', 'scalar'], ['elem', 'cat']]);
    expect(output).toContain('Name');
    expect(output).toContain('Type');
    expect(output).toContain('hp');
    expect(output).toContain('scalar');
    expect(output).toContain('\u2500'); // horizontal line
    expect(output).toContain('\u2502'); // vertical separator
  });

  it('returns empty string for empty headers', () => {
    expect(TableRenderer.render([], [])).toBe('');
  });

  it('renders with custom padding', () => {
    const output = TableRenderer.render(['A'], [['val']], { padding: 2 });
    expect(output).toContain('A');
  });

  it('truncates cells that exceed max width', () => {
    const output = TableRenderer.render(
      ['Col'],
      [['This is a very long cell that should be truncated']],
      { maxWidth: 20 },
    );
    expect(output).toContain('\u2026'); // ellipsis
  });

  it('has top, separator, and bottom borders', () => {
    const output = TableRenderer.render(['H'], [['R']]);
    const lines = output.split('\n');
    expect(lines[0]).toContain('\u250c'); // top-left
    expect(lines[lines.length - 1]).toContain('\u2518'); // bottom-right
  });

  it('handles empty rows', () => {
    const output = TableRenderer.render(['A', 'B'], []);
    expect(output).toContain('A');
    expect(output.split('\n').length).toBe(4); // top + header + separator + bottom
  });
});

// ── TreeRenderer ──

describe('TreeRenderer', () => {
  it('renders root only', () => {
    const output = TreeRenderer.render({ label: 'root' });
    expect(output).toBe('root');
  });

  it('renders tree with children', () => {
    const tree: TreeNode = {
      label: 'root',
      children: [
        { label: 'child1' },
        { label: 'child2' },
      ],
    };
    const output = TreeRenderer.render(tree);
    expect(output).toContain('\u251c\u2500\u2500 child1');
    expect(output).toContain('\u2514\u2500\u2500 child2');
  });

  it('renders nested tree', () => {
    const tree: TreeNode = {
      label: 'A',
      children: [
        {
          label: 'B',
          children: [{ label: 'C' }],
        },
      ],
    };
    const output = TreeRenderer.render(tree);
    const lines = output.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe('A');
    expect(lines[1]).toContain('B');
    expect(lines[2]).toContain('C');
  });

  it('uses correct connectors for last vs non-last', () => {
    const tree: TreeNode = {
      label: 'root',
      children: [
        { label: 'first', children: [{ label: 'sub' }] },
        { label: 'last' },
      ],
    };
    const output = TreeRenderer.render(tree);
    expect(output).toContain('\u251c\u2500\u2500 first');
    expect(output).toContain('\u2514\u2500\u2500 last');
  });
});

// ── PanelLayout ──

describe('PanelLayout', () => {
  let layout: PanelLayout;

  beforeEach(() => {
    layout = new PanelLayout();
  });

  it('adds and retrieves panels', () => {
    layout.addPanel('main', 'Main', 0, 0, 40, 20);
    const panel = layout.getPanel('main');
    expect(panel).toBeDefined();
    expect(panel!.title).toBe('Main');
    expect(panel!.width).toBe(40);
  });

  it('returns undefined for unknown panel', () => {
    expect(layout.getPanel('nope')).toBeUndefined();
  });

  it('updates panel content', () => {
    layout.addPanel('p', 'P', 0, 0, 20, 10);
    layout.updateContent('p', 'hello');
    expect(layout.getPanel('p')!.content).toBe('hello');
  });

  it('updateContent does nothing for unknown panel', () => {
    layout.updateContent('unknown', 'data');
    // No crash
  });

  it('removes panels', () => {
    layout.addPanel('x', 'X', 0, 0, 10, 10);
    layout.removePanel('x');
    expect(layout.getPanel('x')).toBeUndefined();
  });

  it('renders panels onto buffer', () => {
    const buf = new ScreenBuffer(30, 10);
    layout.addPanel('test', 'Test Panel', 0, 0, 20, 5);
    layout.updateContent('test', 'Line 1\nLine 2');
    layout.render(buf);
    // Should have box characters at corners
    expect(buf.getCell(0, 0)?.char).toBe('\u250c');
    expect(buf.getCell(19, 0)?.char).toBe('\u2510');
    // Content should be rendered inside
    expect(buf.getCell(1, 1)?.char).toBe('L');
  });

  it('renders title centered in border', () => {
    const buf = new ScreenBuffer(30, 10);
    layout.addPanel('t', 'Hi', 0, 0, 20, 5);
    layout.render(buf);
    // Title should be somewhere in row 0 between the box borders
    let found = false;
    for (let x = 0; x < 20; x++) {
      if (buf.getCell(x, 0)?.char === 'H') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('truncates content to fit panel dimensions', () => {
    const buf = new ScreenBuffer(20, 6);
    layout.addPanel('p', 'P', 0, 0, 10, 4);
    layout.updateContent('p', 'A very long line that exceeds panel width\nLine2\nLine3\nLine4\nLine5');
    layout.render(buf);
    // Should not crash; inner height is 2 (4-2), so only first 2 lines rendered
  });
});

// ── SeedRenderer ──

describe('SeedRenderer', () => {
  it('renderSeedCard produces bordered card', () => {
    const seed = makeSeed('Dragon', 'organism', {
      hp: { type: 'scalar', value: 50, min: 0, max: 100 } as Gene,
    }, 0.75);
    const lines = SeedRenderer.renderSeedCard(seed, 40);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines[0]).toContain('\u256d');
    expect(lines[lines.length - 1]).toContain('\u256f');
    const text = lines.join('\n');
    expect(text).toContain('Dragon');
    expect(text).toContain('organism');
  });

  it('renderSeedList with seeds', () => {
    const seeds = [
      makeSeed('A', 'organism', {}, 0.8),
      makeSeed('B', 'terrain', {}, 0.3),
    ];
    const output = SeedRenderer.renderSeedList(seeds, 60);
    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(output).toContain('Name');
    expect(output).toContain('Domain');
  });

  it('renderSeedList empty returns placeholder', () => {
    expect(SeedRenderer.renderSeedList([], 40)).toBe('(no seeds)');
  });

  it('renderGeneTable shows all gene types', () => {
    const seed = makeSeed('Multi', 'organism', {
      hp: { type: 'scalar', value: 50, min: 0, max: 100 } as Gene,
      kind: { type: 'categorical', value: 'fire', options: ['fire', 'ice'] } as Gene,
      pos: { type: 'vector', value: [1, 2, 3], dimensions: 3 } as Gene,
      code: { type: 'expression', source: 'x + 1', language: 'gspl' } as Gene,
      data: { type: 'struct', value: { a: 1, b: 2 }, schema: {} } as Gene,
      list: { type: 'array', value: [1, 2, 3], elementType: 'scalar' } as Gene,
      net: { type: 'graph', nodes: new Map([['a', { id: 'a', value: 1 }], ['b', { id: 'b', value: 2 }]]), edges: [{ from: 'a', to: 'b', weight: 1 }] } as Gene,
      shape: { type: 'tensor', shape: [2, 3], data: new Float32Array(6) } as Gene,
      anim: { type: 'timeseries', keyframes: [{ t: 0, v: 0 }, { t: 1, v: 1 }], interpolation: 'linear' } as Gene,
    });
    const output = SeedRenderer.renderGeneTable(seed);
    expect(output).toContain('hp');
    expect(output).toContain('scalar');
    expect(output).toContain('kind');
    expect(output).toContain('categorical');
    expect(output).toContain('pos');
    expect(output).toContain('vector');
    expect(output).toContain('code');
    expect(output).toContain('expression');
    expect(output).toContain('data');
    expect(output).toContain('struct');
    expect(output).toContain('list');
    expect(output).toContain('array');
    expect(output).toContain('net');
    expect(output).toContain('graph');
    expect(output).toContain('shape');
    expect(output).toContain('tensor');
    expect(output).toContain('anim');
    expect(output).toContain('timeseries');
  });

  it('renderGeneTable with no genes', () => {
    const seed = makeSeed('Empty', 'organism');
    expect(SeedRenderer.renderGeneTable(seed)).toBe('(no genes)');
  });

  it('renderSeedCard truncates hash', () => {
    const seed = makeSeed('Long');
    const lines = SeedRenderer.renderSeedCard(seed, 30);
    const text = lines.join('\n');
    expect(text).toContain('...');
  });
});

// ── StatusBar ──

describe('StatusBar', () => {
  it('renders basic info', () => {
    const info: StatusBarInfo = {
      worldName: 'Test World',
      generation: 42,
      seedCount: 10,
    };
    const output = StatusBar.render(info, 60);
    expect(output).toContain('Test World');
    expect(output).toContain('42');
    expect(output).toContain('10');
    expect(output).toContain('ready');
    expect(output.length).toBe(60);
  });

  it('includes fps when provided', () => {
    const info: StatusBarInfo = {
      worldName: 'W',
      generation: 1,
      seedCount: 5,
      fps: 60,
    };
    const output = StatusBar.render(info, 50);
    expect(output).toContain('60fps');
  });

  it('uses custom status', () => {
    const info: StatusBarInfo = {
      worldName: 'W',
      generation: 0,
      seedCount: 0,
      status: 'evolving',
    };
    const output = StatusBar.render(info, 40);
    expect(output).toContain('evolving');
  });

  it('pads to exact width', () => {
    const info: StatusBarInfo = { worldName: 'W', generation: 0, seedCount: 0 };
    expect(StatusBar.render(info, 80).length).toBe(80);
  });

  it('truncates when width is small', () => {
    const info: StatusBarInfo = { worldName: 'Very Long World Name', generation: 999, seedCount: 9999 };
    const output = StatusBar.render(info, 20);
    expect(output.length).toBe(20);
  });
});

// ── CommandLine ──

describe('CommandLine', () => {
  let cmd: CommandLine;

  beforeEach(() => {
    cmd = new CommandLine();
  });

  it('default prompt', () => {
    expect(cmd.getPrompt()).toBe('paradigm> ');
  });

  it('custom prompt', () => {
    const c = new CommandLine('$ ');
    expect(c.getPrompt()).toBe('$ ');
  });

  it('get/set input', () => {
    cmd.setInput('hello');
    expect(cmd.getInput()).toBe('hello');
  });

  it('render() shows prompt + input + cursor', () => {
    cmd.setInput('test');
    const output = cmd.render(30);
    expect(output).toContain('paradigm> ');
    expect(output).toContain('test');
    expect(output).toContain('\u2588');
    expect(output.length).toBe(30);
  });

  it('render() truncates from left when too long', () => {
    cmd.setInput('a'.repeat(50));
    const output = cmd.render(20);
    expect(output.length).toBe(20);
  });

  it('addToHistory and getHistory', () => {
    cmd.addToHistory('cmd1');
    cmd.addToHistory('cmd2');
    expect(cmd.getHistory()).toEqual(['cmd1', 'cmd2']);
  });

  it('addToHistory ignores empty', () => {
    cmd.addToHistory('');
    expect(cmd.getHistory()).toEqual([]);
  });

  it('getHistory returns copy', () => {
    cmd.addToHistory('a');
    const h1 = cmd.getHistory();
    const h2 = cmd.getHistory();
    expect(h1).toEqual(h2);
    expect(h1).not.toBe(h2);
  });
});

// ── TUIEngine ──

describe('TUIEngine', () => {
  let engine: TUIEngine;

  beforeEach(() => {
    engine = new TUIEngine(80, 24, new DeterministicRNG('test-tui'));
  });

  it('constructs with correct dimensions', () => {
    expect(engine.getWidth()).toBe(80);
    expect(engine.getHeight()).toBe(24);
  });

  it('has default panels', () => {
    expect(engine.layout.getPanel('main')).toBeDefined();
    expect(engine.layout.getPanel('info')).toBeDefined();
    expect(engine.layout.getPanel('log')).toBeDefined();
  });

  it('has buffer, commandLine, statusBar', () => {
    expect(engine.buffer).toBeInstanceOf(ScreenBuffer);
    expect(engine.commandLine).toBeInstanceOf(CommandLine);
    expect(engine.statusBar).toBe(StatusBar);
  });

  it('getRng returns deterministic RNG', () => {
    const r = engine.getRng();
    expect(r).toBeInstanceOf(DeterministicRNG);
  });

  it('renderFrame with empty world', () => {
    const output = engine.renderFrame({
      seeds: [],
      generation: 0,
      worldName: 'Empty',
    });
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Empty');
  });

  it('renderFrame with seeds shows seed list', () => {
    const seeds = [
      makeSeed('Alpha', 'organism', {}, 0.9),
      makeSeed('Beta', 'terrain', {}, 0.3),
    ];
    const output = engine.renderFrame({
      seeds,
      generation: 5,
      worldName: 'Test',
    });
    expect(output).toContain('Alpha');
    expect(output).toContain('Beta');
    expect(output).toContain('Test');
  });

  it('renderFrame shows status bar', () => {
    const output = engine.renderFrame({
      seeds: [makeSeed('S')],
      generation: 10,
      worldName: 'MyWorld',
    });
    expect(output).toContain('MyWorld');
    expect(output).toContain('10');
    expect(output).toContain('ready');
  });

  it('renderFrame shows command prompt', () => {
    engine.commandLine.setInput('create dragon');
    const output = engine.renderFrame({
      seeds: [],
      generation: 0,
      worldName: 'W',
    });
    expect(output).toContain('paradigm>');
    expect(output).toContain('create dragon');
  });

  it('renderFrame selects top seed for info panel', () => {
    const seeds = [
      makeSeed('Low', 'organism', {}, 0.1),
      makeSeed('High', 'organism', {}, 0.99),
      makeSeed('Mid', 'organism', {}, 0.5),
    ];
    const output = engine.renderFrame({
      seeds,
      generation: 1,
      worldName: 'W',
    });
    expect(output).toContain('High');
  });

  it('resize() changes dimensions and rebuilds layout', () => {
    engine.resize(120, 40);
    expect(engine.getWidth()).toBe(120);
    expect(engine.getHeight()).toBe(40);
    expect(engine.layout.getPanel('main')).toBeDefined();
    expect(engine.layout.getPanel('info')).toBeDefined();
    expect(engine.layout.getPanel('log')).toBeDefined();
  });

  it('default constructor without RNG', () => {
    const e = new TUIEngine(40, 12);
    expect(e.getWidth()).toBe(40);
    expect(e.getRng()).toBeInstanceOf(DeterministicRNG);
  });

  it('renderFrame handles single seed', () => {
    const output = engine.renderFrame({
      seeds: [makeSeed('Solo', 'organism', { hp: { type: 'scalar', value: 50, min: 0, max: 100 } as Gene }, 0.5)],
      generation: 1,
      worldName: 'Single',
    });
    expect(output).toContain('Solo');
  });
});
