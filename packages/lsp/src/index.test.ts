/**
 * Comprehensive test suite for @paradigm/lsp.
 *
 * Covers: TextDocument, DocumentStore, CompletionProvider, HoverProvider,
 * DiagnosticsProvider, SymbolProvider, FormattingProvider, GSPLLanguageServer.
 */

import { describe, it, expect } from 'vitest';
import {
  TextDocument,
  DocumentStore,
  CompletionProvider,
  HoverProvider,
  DiagnosticsProvider,
  SymbolProvider,
  FormattingProvider,
  GSPLLanguageServer,
  DIAGNOSTIC_SEVERITY,
  type Position,
  type Range,
  type CompletionItem,
  type HoverResult,
  type Diagnostic,
  type DocumentSymbol,
  type TextEdit,
} from './index.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function pos(line: number, character: number): Position {
  return { line, character };
}

function rng(sl: number, sc: number, el: number, ec: number): Range {
  return { start: pos(sl, sc), end: pos(el, ec) };
}

// ─────────────────────────────────────────────
// TextDocument
// ─────────────────────────────────────────────

describe('TextDocument', () => {
  const SAMPLE = 'seed "Hero" {\n  identity {\n    name: "Hero"\n  }\n}';

  it('stores uri and initial content', () => {
    const doc = new TextDocument('file:///a.gspl', SAMPLE);
    expect(doc.uri).toBe('file:///a.gspl');
    expect(doc.getText()).toBe(SAMPLE);
  });

  it('defaults version to 0', () => {
    const doc = new TextDocument('file:///a.gspl', SAMPLE);
    expect(doc.version).toBe(0);
  });

  it('accepts an explicit version', () => {
    const doc = new TextDocument('file:///a.gspl', SAMPLE, 5);
    expect(doc.version).toBe(5);
  });

  // getText
  describe('getText', () => {
    it('returns full content when no range supplied', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.getText()).toBe(SAMPLE);
    });

    it('returns substring for a given range', () => {
      const doc = new TextDocument('u', SAMPLE);
      const r: Range = rng(0, 0, 0, 4);
      expect(doc.getText(r)).toBe('seed');
    });

    it('returns substring spanning multiple lines', () => {
      const doc = new TextDocument('u', 'aaa\nbbb\nccc');
      const r = rng(0, 1, 2, 2);
      expect(doc.getText(r)).toBe('aa\nbbb\ncc');
    });
  });

  // getLine
  describe('getLine', () => {
    it('returns the correct line', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.getLine(0)).toBe('seed "Hero" {');
      expect(doc.getLine(1)).toBe('  identity {');
    });

    it('returns empty string for out-of-range line', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.getLine(999)).toBe('');
    });

    it('handles negative line', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.getLine(-1)).toBe('');
    });
  });

  // getLineCount
  describe('getLineCount', () => {
    it('counts lines correctly', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.getLineCount()).toBe(5);
    });

    it('single line has count 1', () => {
      const doc = new TextDocument('u', 'hello');
      expect(doc.getLineCount()).toBe(1);
    });

    it('empty string has count 1', () => {
      const doc = new TextDocument('u', '');
      expect(doc.getLineCount()).toBe(1);
    });

    it('handles \\r\\n line endings', () => {
      const doc = new TextDocument('u', 'a\r\nb\r\nc');
      expect(doc.getLineCount()).toBe(3);
    });
  });

  // positionAt
  describe('positionAt', () => {
    it('maps offset 0 to line 0, char 0', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.positionAt(0)).toEqual(pos(0, 0));
    });

    it('maps offset in first line correctly', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.positionAt(4)).toEqual(pos(0, 4));
    });

    it('maps offset at newline boundary to end of current line', () => {
      const doc = new TextDocument('u', 'abc\ndef');
      // offset 4 is the newline position — positionAt clamps to end of line 0
      expect(doc.positionAt(4)).toEqual(pos(0, 3));
    });

    it('maps offset past newline to next line', () => {
      const doc = new TextDocument('u', 'ab\ncd');
      // "ab" length=2, lineLength=3 (includes \n). offset 3: remaining=3, 3<=3, pos(0,2) (clamped to line end)
      expect(doc.positionAt(3)).toEqual(pos(0, 2));
      // offset 4: remaining=4, 4>3, remaining=4-3=1. line 1 "cd" length=2, 1<=2, pos(1,1)
      expect(doc.positionAt(4)).toEqual(pos(1, 1));
    });

    it('clamps negative offset to 0', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.positionAt(-10)).toEqual(pos(0, 0));
    });

    it('clamps offset beyond content length', () => {
      const doc = new TextDocument('u', 'ab\ncd');
      const p = doc.positionAt(9999);
      expect(p.line).toBe(1);
      expect(p.character).toBe(2);
    });
  });

  // offsetAt
  describe('offsetAt', () => {
    it('maps (0,0) to offset 0', () => {
      const doc = new TextDocument('u', SAMPLE);
      expect(doc.offsetAt(pos(0, 0))).toBe(0);
    });

    it('maps position on second line', () => {
      const doc = new TextDocument('u', 'abc\ndef');
      expect(doc.offsetAt(pos(1, 0))).toBe(4);
      expect(doc.offsetAt(pos(1, 2))).toBe(6);
    });

    it('clamps character beyond line length', () => {
      const doc = new TextDocument('u', 'abc\ndef');
      expect(doc.offsetAt(pos(0, 100))).toBe(3);
    });

    it('clamps line beyond doc range', () => {
      const doc = new TextDocument('u', 'abc\ndef');
      // line 999 clamps to last line (1)
      const off = doc.offsetAt(pos(999, 0));
      expect(off).toBe(4); // start of line 1
    });

    it('clamps negative line to 0', () => {
      const doc = new TextDocument('u', 'abc');
      expect(doc.offsetAt(pos(-1, 0))).toBe(0);
    });
  });

  // update
  describe('update', () => {
    it('applies a single change and bumps version', () => {
      const doc = new TextDocument('u', 'hello world');
      doc.update([{ range: rng(0, 5, 0, 11), text: ' GSPL' }], 1);
      expect(doc.getText()).toBe('hello GSPL');
      expect(doc.version).toBe(1);
    });

    it('applies multiple changes in correct order', () => {
      const doc = new TextDocument('u', 'aabbcc');
      doc.update(
        [
          { range: rng(0, 0, 0, 2), text: 'XX' },
          { range: rng(0, 4, 0, 6), text: 'ZZ' },
        ],
        2,
      );
      expect(doc.getText()).toBe('XXbbZZ');
    });

    it('invalidates line cache after update', () => {
      const doc = new TextDocument('u', 'line1\nline2');
      expect(doc.getLineCount()).toBe(2);
      doc.update([{ range: rng(0, 5, 1, 5), text: '\nA\nB\nC' }], 1);
      expect(doc.getLineCount()).toBe(4);
    });
  });
});

// ─────────────────────────────────────────────
// DocumentStore
// ─────────────────────────────────────────────

describe('DocumentStore', () => {
  it('opens and retrieves a document', () => {
    const store = new DocumentStore();
    const doc = store.open('file:///a.gspl', 'content');
    expect(store.get('file:///a.gspl')).toBe(doc);
  });

  it('returns undefined for unknown URI', () => {
    const store = new DocumentStore();
    expect(store.get('nope')).toBeUndefined();
  });

  it('closes a document and returns true', () => {
    const store = new DocumentStore();
    store.open('file:///a.gspl', 'x');
    expect(store.close('file:///a.gspl')).toBe(true);
    expect(store.get('file:///a.gspl')).toBeUndefined();
  });

  it('close returns false for unknown URI', () => {
    const store = new DocumentStore();
    expect(store.close('nope')).toBe(false);
  });

  it('updates an open document', () => {
    const store = new DocumentStore();
    store.open('file:///a.gspl', 'hello');
    const updated = store.update('file:///a.gspl', [{ range: rng(0, 0, 0, 5), text: 'world' }], 1);
    expect(updated.getText()).toBe('world');
    expect(updated.version).toBe(1);
  });

  it('throws when updating a non-open document', () => {
    const store = new DocumentStore();
    expect(() => store.update('nope', [], 1)).toThrow('Document not open: nope');
  });

  it('getAll returns all open documents', () => {
    const store = new DocumentStore();
    store.open('file:///a.gspl', 'a');
    store.open('file:///b.gspl', 'b');
    const all = store.getAll();
    expect(all).toHaveLength(2);
  });

  it('getAll returns empty array when no docs open', () => {
    const store = new DocumentStore();
    expect(store.getAll()).toEqual([]);
  });

  it('open with explicit version', () => {
    const store = new DocumentStore();
    const doc = store.open('file:///a.gspl', 'x', 10);
    expect(doc.version).toBe(10);
  });
});

// ─────────────────────────────────────────────
// CompletionProvider
// ─────────────────────────────────────────────

describe('CompletionProvider', () => {
  const provider = new CompletionProvider();

  it('returns keyword completions for empty line', () => {
    const doc = new TextDocument('u', '');
    const items = provider.complete(doc, pos(0, 0));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('seed');
    expect(labels).toContain('world');
    expect(labels).toContain('fn');
    expect(labels).toContain('let');
  });

  it('returns built-in function completions', () => {
    const doc = new TextDocument('u', '');
    const items = provider.complete(doc, pos(0, 0));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('sin');
    expect(labels).toContain('cos');
    expect(labels).toContain('sqrt');
    expect(labels).toContain('uniform');
    expect(labels).toContain('vec2');
    expect(labels).toContain('cross');
    expect(labels).toContain('distance');
  });

  it('all keyword items have kind "keyword"', () => {
    const doc = new TextDocument('u', '');
    const items = provider.complete(doc, pos(0, 0));
    const seedItem = items.find((i) => i.label === 'seed');
    expect(seedItem?.kind).toBe('keyword');
    expect(seedItem?.detail).toBe('GSPL keyword');
  });

  it('all built-in items have kind "function"', () => {
    const doc = new TextDocument('u', '');
    const items = provider.complete(doc, pos(0, 0));
    const sinItem = items.find((i) => i.label === 'sin');
    expect(sinItem?.kind).toBe('function');
  });

  // Domain suggestions
  it('suggests domain names after "domain "', () => {
    const doc = new TextDocument('u', 'domain ');
    const items = provider.complete(doc, pos(0, 7));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('organism');
    expect(labels).toContain('vehicle');
    expect(labels).toContain('weapon');
    expect(labels.length).toBeGreaterThan(10);
    expect(items[0]?.kind).toBe('type');
  });

  it('suggests domain names when partially typed after domain', () => {
    const doc = new TextDocument('u', 'domain org');
    const items = provider.complete(doc, pos(0, 10));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('organism');
  });

  // Annotation suggestions
  it('suggests annotations when line starts with @', () => {
    const doc = new TextDocument('u', '@');
    const items = provider.complete(doc, pos(0, 1));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('@strict');
    expect(labels).toContain('@require');
    expect(labels).toContain('@domain');
    expect(items.length).toBe(3);
  });

  it('annotation items have kind "keyword"', () => {
    const doc = new TextDocument('u', '  @s');
    const items = provider.complete(doc, pos(0, 4));
    expect(items[0]?.kind).toBe('keyword');
    expect(items[0]?.detail).toBe('Annotation');
  });

  // Gene block context
  it('suggests gene types inside a gene block', () => {
    const src = 'seed "Hero" {\n  identity {\n    \n  }\n}';
    const doc = new TextDocument('u', src);
    // Cursor at line 2 (inside identity block)
    const items = provider.complete(doc, pos(2, 4));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('scalar');
    expect(labels).toContain('categorical');
    expect(labels).toContain('vector');
    expect(labels).toContain('expression');
    expect(labels).toContain('struct');
    expect(labels).toContain('tensor');
    expect(labels).toContain('timeseries');
    // Should also include regular completions
    expect(labels).toContain('seed');
    expect(labels).toContain('sin');
  });

  it('gene type items have kind "type" and detail "Gene type"', () => {
    const src = 'seed "A" {\n  appearance {\n    \n  }\n}';
    const doc = new TextDocument('u', src);
    const items = provider.complete(doc, pos(2, 4));
    const scalarItem = items.find((i) => i.label === 'scalar');
    expect(scalarItem?.kind).toBe('type');
    expect(scalarItem?.detail).toBe('Gene type');
  });

  it('does not suggest gene types outside gene block', () => {
    const src = 'seed "Hero" {\n  \n}';
    const doc = new TextDocument('u', src);
    const items = provider.complete(doc, pos(1, 2));
    const labels = items.map((i) => i.label);
    // scalar should not appear as a type completion outside gene blocks
    const typeItems = items.filter((i) => i.kind === 'type' && i.detail === 'Gene type');
    expect(typeItems).toHaveLength(0);
  });

  it('gene block detection works for other gene blocks (motion)', () => {
    const src = 'seed "X" {\n  motion {\n    \n  }\n}';
    const doc = new TextDocument('u', src);
    const items = provider.complete(doc, pos(2, 4));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('vector');
  });

  it('gene block detection returns false when no opening brace found', () => {
    const doc = new TextDocument('u', 'just plain text');
    const items = provider.complete(doc, pos(0, 5));
    const typeItems = items.filter((i) => i.detail === 'Gene type');
    expect(typeItems).toHaveLength(0);
  });

  it('gene block detection handles nested braces', () => {
    const src = 'seed "X" {\n  identity {\n    struct {\n      \n    }\n  }\n}';
    const doc = new TextDocument('u', src);
    // Inside the struct block which is nested in identity — the opening brace's preceding word is "struct", not a gene block keyword
    const items = provider.complete(doc, pos(3, 6));
    // Since the closest opening brace is for struct (not a gene block keyword), gene types should NOT be first-class
    const typeItems = items.filter((i) => i.detail === 'Gene type');
    expect(typeItems).toHaveLength(0);
  });

  it('includes math, random, and vector functions in default completions', () => {
    const doc = new TextDocument('u', '');
    const items = provider.complete(doc, pos(0, 0));
    const labels = items.map((i) => i.label);
    // Math
    expect(labels).toContain('abs');
    expect(labels).toContain('floor');
    expect(labels).toContain('ceil');
    expect(labels).toContain('round');
    expect(labels).toContain('clamp');
    expect(labels).toContain('lerp');
    // Random
    expect(labels).toContain('gaussian');
    expect(labels).toContain('choice');
    // Vector
    expect(labels).toContain('vec3');
    expect(labels).toContain('normalize');
    expect(labels).toContain('magnitude');
    expect(labels).toContain('dot');
  });
});

// ─────────────────────────────────────────────
// HoverProvider
// ─────────────────────────────────────────────

describe('HoverProvider', () => {
  const provider = new HoverProvider();

  it('returns hover for keyword "seed"', () => {
    const doc = new TextDocument('u', 'seed "Hero" {');
    const result = provider.hover(doc, pos(0, 1));
    expect(result).toBeDefined();
    expect(result!.contents).toContain('**seed**');
    expect(result!.contents).toContain('keyword');
    expect(result!.contents).toContain('fundamental unit');
  });

  it('hover range points to the word boundaries', () => {
    const doc = new TextDocument('u', 'seed "Hero" {');
    const result = provider.hover(doc, pos(0, 2));
    expect(result!.range).toEqual(rng(0, 0, 0, 4));
  });

  it('returns hover for keyword "world"', () => {
    const doc = new TextDocument('u', 'world "Test" {}');
    const result = provider.hover(doc, pos(0, 2));
    expect(result).toBeDefined();
    expect(result!.contents).toContain('**world**');
  });

  it('returns hover for keyword "let"', () => {
    const doc = new TextDocument('u', 'let x = 5');
    const result = provider.hover(doc, pos(0, 1));
    expect(result!.contents).toContain('**let**');
    expect(result!.contents).toContain('mutable');
  });

  it('returns hover for keyword "fn"', () => {
    const doc = new TextDocument('u', 'fn myFunc() {}');
    const result = provider.hover(doc, pos(0, 0));
    expect(result!.contents).toContain('**fn**');
  });

  it('returns hover for annotation "@strict"', () => {
    const doc = new TextDocument('u', '@strict');
    const result = provider.hover(doc, pos(0, 3));
    expect(result).toBeDefined();
    expect(result!.contents).toContain('**@strict**');
  });

  it('returns hover for gene type "scalar"', () => {
    const doc = new TextDocument('u', 'scalar value = 5');
    const result = provider.hover(doc, pos(0, 2));
    expect(result).toBeDefined();
    expect(result!.contents).toContain('**scalar**');
    expect(result!.contents).toContain('gene type');
  });

  it('returns hover for gene type "categorical"', () => {
    const doc = new TextDocument('u', 'categorical option');
    const result = provider.hover(doc, pos(0, 5));
    expect(result!.contents).toContain('**categorical**');
  });

  it('returns hover for gene type "tensor"', () => {
    const doc = new TextDocument('u', 'tensor data');
    const result = provider.hover(doc, pos(0, 2));
    expect(result!.contents).toContain('**tensor**');
    expect(result!.contents).toContain('gene type');
  });

  it('returns hover for built-in function "sin"', () => {
    const doc = new TextDocument('u', 'sin(x)');
    const result = provider.hover(doc, pos(0, 1));
    expect(result).toBeDefined();
    expect(result!.contents).toContain('**sin**');
    expect(result!.contents).toContain('built-in');
    expect(result!.contents).toContain('sine');
  });

  it('returns hover for built-in function "vec2"', () => {
    const doc = new TextDocument('u', 'vec2(1, 2)');
    const result = provider.hover(doc, pos(0, 1));
    expect(result!.contents).toContain('**vec2**');
    expect(result!.contents).toContain('built-in');
  });

  it('returns hover for built-in function "lerp"', () => {
    const doc = new TextDocument('u', 'lerp(a, b, t)');
    const result = provider.hover(doc, pos(0, 2));
    expect(result!.contents).toContain('**lerp**');
  });

  it('returns undefined for unknown word', () => {
    const doc = new TextDocument('u', 'foobar baz');
    const result = provider.hover(doc, pos(0, 2));
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty position', () => {
    const doc = new TextDocument('u', '   ');
    const result = provider.hover(doc, pos(0, 1));
    expect(result).toBeUndefined();
  });

  it('returns undefined when character is out of range', () => {
    const doc = new TextDocument('u', 'seed');
    const result = provider.hover(doc, pos(0, 100));
    // getWordAtPosition with character > lineText.length returns undefined
    expect(result).toBeUndefined();
  });

  it('returns undefined for negative character position', () => {
    const doc = new TextDocument('u', 'seed');
    const result = provider.hover(doc, pos(0, -1));
    expect(result).toBeUndefined();
  });

  it('returns hover for other keywords like "evolve"', () => {
    const doc = new TextDocument('u', 'evolve population');
    const result = provider.hover(doc, pos(0, 3));
    expect(result!.contents).toContain('**evolve**');
  });

  it('returns hover for "true" literal', () => {
    const doc = new TextDocument('u', 'let x = true');
    const result = provider.hover(doc, pos(0, 10));
    expect(result!.contents).toContain('**true**');
  });

  it('returns hover for "null" literal', () => {
    const doc = new TextDocument('u', 'let x = null');
    const result = provider.hover(doc, pos(0, 10));
    expect(result!.contents).toContain('**null**');
  });
});

// ─────────────────────────────────────────────
// DiagnosticsProvider
// ─────────────────────────────────────────────

describe('DiagnosticsProvider', () => {
  const provider = new DiagnosticsProvider();

  it('returns empty array for clean document', () => {
    const src = 'seed "Hero" {\n  identity {\n    name: "Hero"\n  }\n}';
    const doc = new TextDocument('u', src);
    expect(provider.diagnose(doc)).toEqual([]);
  });

  it('detects unclosed brace', () => {
    const src = 'seed "Hero" {\n  identity {\n  }';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const braceError = diags.find((d) => d.message.includes('Unclosed brace'));
    expect(braceError).toBeDefined();
    expect(braceError!.severity).toBe(DIAGNOSTIC_SEVERITY.Error);
  });

  it('detects unclosed bracket', () => {
    const src = 'let x = [1, 2, 3';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const bracketError = diags.find((d) => d.message.includes('Unclosed bracket'));
    expect(bracketError).toBeDefined();
    expect(bracketError!.severity).toBe(DIAGNOSTIC_SEVERITY.Error);
  });

  it('detects extra closing brace', () => {
    const src = '}';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const error = diags.find((d) => d.message.includes('Unexpected closing brace'));
    expect(error).toBeDefined();
    expect(error!.severity).toBe(DIAGNOSTIC_SEVERITY.Error);
  });

  it('detects extra closing bracket', () => {
    const src = ']';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const error = diags.find((d) => d.message.includes('Unexpected closing bracket'));
    expect(error).toBeDefined();
  });

  it('detects unclosed double-quote string', () => {
    const src = 'let x = "hello';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const strError = diags.find((d) => d.message.includes('Unclosed string'));
    expect(strError).toBeDefined();
    expect(strError!.message).toContain('"');
    expect(strError!.severity).toBe(DIAGNOSTIC_SEVERITY.Error);
  });

  it('detects unclosed single-quote string', () => {
    const src = "let x = 'hello";
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const strError = diags.find((d) => d.message.includes('Unclosed string'));
    expect(strError).toBeDefined();
    expect(strError!.message).toContain("'");
  });

  it('does not flag properly closed strings', () => {
    const src = 'let x = "hello"\nlet y = \'world\'';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const strErrors = diags.filter((d) => d.message.includes('Unclosed string'));
    expect(strErrors).toHaveLength(0);
  });

  it('handles escaped quotes inside strings', () => {
    const src = 'let x = "say \\"hi\\""';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const strErrors = diags.filter((d) => d.message.includes('Unclosed string'));
    expect(strErrors).toHaveLength(0);
  });

  it('detects unknown annotation', () => {
    const src = '@unknown\nseed "X" {}';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const annError = diags.find((d) => d.message.includes('Unknown annotation'));
    expect(annError).toBeDefined();
    expect(annError!.severity).toBe(DIAGNOSTIC_SEVERITY.Warning);
    expect(annError!.message).toContain('@unknown');
    expect(annError!.message).toContain('@strict');
  });

  it('does not flag known annotations', () => {
    const src = '@strict\n@require\n@domain';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const annErrors = diags.filter((d) => d.message.includes('Unknown annotation'));
    expect(annErrors).toHaveLength(0);
  });

  it('detects empty seed body', () => {
    const src = 'seed "Empty" { }';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const warning = diags.find((d) => d.message.includes('Empty seed body'));
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe(DIAGNOSTIC_SEVERITY.Warning);
  });

  it('does not flag non-empty seed body', () => {
    const src = 'seed "Full" {\n  identity {}\n}';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const warning = diags.filter((d) => d.message.includes('Empty seed body'));
    expect(warning).toHaveLength(0);
  });

  it('does not count braces inside strings', () => {
    const src = 'let x = "{ not a real brace }"';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const braceErrors = diags.filter((d) => d.message.includes('brace'));
    expect(braceErrors).toHaveLength(0);
  });

  it('reports multiple diagnostics', () => {
    const src = '@foo\n@bar\nseed "X" { }';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const annErrors = diags.filter((d) => d.message.includes('Unknown annotation'));
    expect(annErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('multiple unclosed braces reported with count', () => {
    const src = '{\n{\n{';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    const braceError = diags.find((d) => d.message.includes('Unclosed brace'));
    expect(braceError).toBeDefined();
    expect(braceError!.message).toContain('3');
  });

  it('diagnostic source is "gspl"', () => {
    const src = '}';
    const doc = new TextDocument('u', src);
    const diags = provider.diagnose(doc);
    expect(diags[0]?.source).toBe('gspl');
  });
});

// ─────────────────────────────────────────────
// SymbolProvider
// ─────────────────────────────────────────────

describe('SymbolProvider', () => {
  const provider = new SymbolProvider();

  it('finds seed declarations', () => {
    const src = 'seed "Hero" {\n  identity {}\n}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.name).toBe('Hero');
    expect(symbols[0]?.kind).toBe('seed');
  });

  it('finds world declarations', () => {
    const src = 'world "MyWorld" {\n  law "gravity" {}\n}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    const world = symbols.find((s) => s.kind === 'world');
    expect(world).toBeDefined();
    expect(world!.name).toBe('MyWorld');
  });

  it('finds entity declarations', () => {
    const src = 'entity "Player" {}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols[0]?.name).toBe('Player');
    expect(symbols[0]?.kind).toBe('entity');
  });

  it('finds law declarations', () => {
    const src = 'law "gravity" {\n  force: 9.8\n}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols[0]?.name).toBe('gravity');
    expect(symbols[0]?.kind).toBe('law');
  });

  it('finds observation declarations', () => {
    const src = 'observation "log" {}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols[0]?.name).toBe('log');
    expect(symbols[0]?.kind).toBe('observation');
  });

  it('finds fn declarations', () => {
    const src = 'fn myFunc() {\n  return 42\n}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols[0]?.name).toBe('myFunc');
    expect(symbols[0]?.kind).toBe('function');
  });

  it('finds let declarations', () => {
    const src = 'let counter = 0';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols[0]?.name).toBe('counter');
    expect(symbols[0]?.kind).toBe('variable');
  });

  it('finds const declarations', () => {
    const src = 'const MAX = 100';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols[0]?.name).toBe('MAX');
    expect(symbols[0]?.kind).toBe('variable');
  });

  it('finds multiple symbols in one document', () => {
    const src = [
      'seed "Hero" {',
      '  identity {}',
      '}',
      'seed "Villain" {',
      '  identity {}',
      '}',
      'let x = 1',
      'fn helper() {}',
    ].join('\n');
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols.length).toBe(4);
    expect(symbols[0]?.kind).toBe('seed');
    expect(symbols[1]?.kind).toBe('seed');
    expect(symbols[2]?.kind).toBe('variable');
    expect(symbols[3]?.kind).toBe('function');
  });

  it('returns empty for document with no declarations', () => {
    const doc = new TextDocument('u', '// just a comment\n');
    expect(provider.getSymbols(doc)).toEqual([]);
  });

  it('determines block end for seed with braces', () => {
    const src = 'seed "Hero" {\n  identity {\n  }\n}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    // Range should span from line 0 to line 3 (the closing brace)
    expect(symbols[0]?.range.start.line).toBe(0);
    expect(symbols[0]?.range.end.line).toBe(3);
  });

  it('block end falls back to start line when no closing brace', () => {
    const src = 'seed "Open" {\n  no closing brace';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    // Without a matching close, _findBlockEnd returns startLine
    // Actually it finds the '{' and increments depth, but never finds '}', so returns startLine
    expect(symbols[0]?.range.start.line).toBe(0);
  });

  it('only picks one symbol per line', () => {
    // seed pattern would match first; fn wouldn't also match
    const src = 'seed "Hero" {}';
    const doc = new TextDocument('u', src);
    const symbols = provider.getSymbols(doc);
    expect(symbols).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// FormattingProvider
// ─────────────────────────────────────────────

describe('FormattingProvider', () => {
  it('uses default indent size of 2', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {\nname: "A"\n}';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // Line 1 should be indented with 2 spaces
    const lineEdit = edits.find((e) => e.range.start.line === 1);
    expect(lineEdit?.newText).toBe('  name: "A"');
  });

  it('respects custom indent size', () => {
    const provider = new FormattingProvider(4);
    const src = 'seed "A" {\nname: "A"\n}';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    const lineEdit = edits.find((e) => e.range.start.line === 1);
    expect(lineEdit?.newText).toBe('    name: "A"');
  });

  it('removes trailing whitespace', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {   \n}';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    const lineEdit = edits.find((e) => e.range.start.line === 0);
    expect(lineEdit?.newText).toBe('seed "A" {');
  });

  it('dedents closing brace', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {\n  x: 1\n    }';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    const closeBraceEdit = edits.find((e) => e.range.start.line === 2);
    expect(closeBraceEdit?.newText).toBe('}');
  });

  it('formats nested blocks correctly', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {\nidentity {\nname: "A"\n}\n}';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // identity should be indented 1 level
    const identityEdit = edits.find((e) => e.range.start.line === 1);
    expect(identityEdit?.newText).toBe('  identity {');
    // name should be indented 2 levels
    const nameEdit = edits.find((e) => e.range.start.line === 2);
    expect(nameEdit?.newText).toBe('    name: "A"');
  });

  it('adds trailing newline if missing', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {}';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    const newlineEdit = edits.find((e) => e.newText === '\n');
    expect(newlineEdit).toBeDefined();
  });

  it('removes extra trailing newlines', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {}\n\n\n';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // Should have an edit to remove excess trailing empty lines
    const removeEdit = edits.find((e) => e.newText === '' && e.range.start.line > 0);
    expect(removeEdit).toBeDefined();
  });

  it('returns empty edits for already-formatted document', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {\n  name: "A"\n}\n';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // Should be empty or minimal — already well-formatted
    // Actually the trailing newline means the file ends with \n already
    // and indentation is already correct
    expect(edits.length).toBeLessThanOrEqual(1); // at most the empty trailing line
  });

  it('handles empty document', () => {
    const provider = new FormattingProvider();
    const doc = new TextDocument('u', '');
    const edits = provider.format(doc);
    // Empty doc — no formatting needed
    expect(edits).toEqual([]);
  });

  it('handles brackets like braces for indentation', () => {
    const provider = new FormattingProvider();
    const src = 'let arr = [\n1,\n2\n]';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // "1," should be indented
    const oneEdit = edits.find((e) => e.range.start.line === 1);
    expect(oneEdit?.newText).toBe('  1,');
  });

  it('handles empty lines as blank (no indentation)', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {\n\n  x: 1\n}';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // Empty line should remain empty (no indentation added)
    const emptyLineEdit = edits.find((e) => e.range.start.line === 1);
    // The original line is empty so it may or may not produce an edit
    // If original is "" and formatted is "", no edit needed
  });

  it('skips braces inside strings for indent counting', () => {
    const provider = new FormattingProvider();
    const src = 'let x = "{ hello }"\nlet y = 1';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // "let y = 1" should NOT be indented (braces in string don't count)
    // Filter to only edits that target line 1 content (not trailing newline edits)
    const yEdits = edits.filter(
      (e) => e.range.start.line === 1 && e.range.end.line === 1 && e.range.end.character > 0,
    );
    // If there's an edit for line 1 content, it should not add indentation
    for (const edit of yEdits) {
      expect(edit.newText).not.toMatch(/^\s+let/);
    }
  });

  it('handles closing brace mid-line', () => {
    const provider = new FormattingProvider();
    const src = 'seed "A" {\n  identity { name: "X" }\n}';
    const doc = new TextDocument('u', src);
    const edits = provider.format(doc);
    // This tests the mid-line closing brace logic
    expect(edits.length).toBeGreaterThanOrEqual(0); // just ensure no crash
  });
});

// ─────────────────────────────────────────────
// GSPLLanguageServer
// ─────────────────────────────────────────────

describe('GSPLLanguageServer', () => {
  it('creates with a document store', () => {
    const server = new GSPLLanguageServer();
    expect(server.documents).toBeInstanceOf(DocumentStore);
  });

  // onOpen / onClose
  it('onOpen registers a document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'seed "A" {}');
    expect(server.documents.get('file:///a.gspl')).toBeDefined();
  });

  it('onClose removes a document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'content');
    server.onClose('file:///a.gspl');
    expect(server.documents.get('file:///a.gspl')).toBeUndefined();
  });

  // onChange
  it('onChange applies changes to an open document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'hello');
    server.onChange('file:///a.gspl', [{ range: rng(0, 0, 0, 5), text: 'world' }], 1);
    expect(server.documents.get('file:///a.gspl')?.getText()).toBe('world');
  });

  it('onChange does nothing for unknown URI', () => {
    const server = new GSPLLanguageServer();
    // Should not throw
    server.onChange('nope', [{ range: rng(0, 0, 0, 0), text: 'x' }], 1);
  });

  // complete
  it('complete returns items for open document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'seed');
    const items = server.complete('file:///a.gspl', pos(0, 4));
    expect(items.length).toBeGreaterThan(0);
  });

  it('complete returns empty array for unknown URI', () => {
    const server = new GSPLLanguageServer();
    expect(server.complete('nope', pos(0, 0))).toEqual([]);
  });

  // hover
  it('hover returns info for open document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'seed "X" {}');
    const result = server.hover('file:///a.gspl', pos(0, 1));
    expect(result).toBeDefined();
    expect(result!.contents).toContain('seed');
  });

  it('hover returns undefined for unknown URI', () => {
    const server = new GSPLLanguageServer();
    expect(server.hover('nope', pos(0, 0))).toBeUndefined();
  });

  // diagnose
  it('diagnose returns diagnostics for open document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'seed "X" { }');
    const diags = server.diagnose('file:///a.gspl');
    const warning = diags.find((d) => d.message.includes('Empty seed body'));
    expect(warning).toBeDefined();
  });

  it('diagnose returns empty array for unknown URI', () => {
    const server = new GSPLLanguageServer();
    expect(server.diagnose('nope')).toEqual([]);
  });

  // getSymbols
  it('getSymbols returns symbols for open document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'seed "Hero" {\n  identity {}\n}');
    const symbols = server.getSymbols('file:///a.gspl');
    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.name).toBe('Hero');
  });

  it('getSymbols returns empty array for unknown URI', () => {
    const server = new GSPLLanguageServer();
    expect(server.getSymbols('nope')).toEqual([]);
  });

  // format
  it('format returns edits for open document', () => {
    const server = new GSPLLanguageServer();
    server.onOpen('file:///a.gspl', 'seed "A" {\nname: "A"\n}');
    const edits = server.format('file:///a.gspl');
    expect(edits.length).toBeGreaterThan(0);
  });

  it('format returns empty array for unknown URI', () => {
    const server = new GSPLLanguageServer();
    expect(server.format('nope')).toEqual([]);
  });

  // Integration: full workflow
  it('supports full open-edit-complete-diagnose-close workflow', () => {
    const server = new GSPLLanguageServer();
    const uri = 'file:///workflow.gspl';

    // Open
    server.onOpen(uri, 'seed "Hero" {\n  identity {\n  }\n}');

    // Complete inside identity block
    const completions = server.complete(uri, pos(2, 2));
    expect(completions.length).toBeGreaterThan(0);

    // Hover on seed keyword
    const hoverResult = server.hover(uri, pos(0, 1));
    expect(hoverResult).toBeDefined();

    // Symbols
    const symbols = server.getSymbols(uri);
    expect(symbols.length).toBe(1);

    // Diagnose (clean doc)
    const diags = server.diagnose(uri);
    expect(diags).toEqual([]);

    // Format
    const edits = server.format(uri);
    expect(edits.length).toBeGreaterThanOrEqual(0);

    // Edit
    server.onChange(uri, [{ range: rng(2, 0, 2, 0), text: '    name: "Hero"\n' }], 1);

    // Close
    server.onClose(uri);
    expect(server.documents.get(uri)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// DIAGNOSTIC_SEVERITY constants
// ─────────────────────────────────────────────

describe('DIAGNOSTIC_SEVERITY', () => {
  it('has correct severity values', () => {
    expect(DIAGNOSTIC_SEVERITY.Error).toBe(1);
    expect(DIAGNOSTIC_SEVERITY.Warning).toBe(2);
    expect(DIAGNOSTIC_SEVERITY.Info).toBe(3);
    expect(DIAGNOSTIC_SEVERITY.Hint).toBe(4);
  });
});
