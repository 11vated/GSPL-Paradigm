/**
 * @paradigm/lsp — Language Server Protocol implementation for GSPL.
 *
 * Layer 6: Infrastructure. Provides LSP data structures, document management,
 * completion, hover, diagnostics, symbols, and formatting for the GSPL language.
 * Pure protocol logic — no transport (WebSocket/stdio) included.
 *
 * @packageDocumentation
 */

import type { GeneType, SeedDomain } from '@paradigm/types';

// ─────────────────────────────────────────────
// LSP Types
// ─────────────────────────────────────────────

/** Zero-based line/character position within a text document. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** A range within a text document, defined by start and end positions. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

/** A location in a specific document. */
export interface Location {
  readonly uri: string;
  readonly range: Range;
}

/** Diagnostic severity levels mirroring LSP spec. */
export type DiagnosticSeverity = 1 | 2 | 3 | 4;

/** Severity constants for readability. */
export const DIAGNOSTIC_SEVERITY = {
  Error: 1 as DiagnosticSeverity,
  Warning: 2 as DiagnosticSeverity,
  Info: 3 as DiagnosticSeverity,
  Hint: 4 as DiagnosticSeverity,
} as const;

/** A diagnostic message (error, warning, etc.) tied to a document range. */
export interface Diagnostic {
  readonly range: Range;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly source?: string;
}

/** Completion item kinds. */
export type CompletionKind = 'keyword' | 'function' | 'variable' | 'type' | 'snippet';

/** A single auto-complete suggestion. */
export interface CompletionItem {
  readonly label: string;
  readonly kind: CompletionKind;
  readonly detail?: string;
  readonly documentation?: string;
  readonly insertText?: string;
}

/** Result of a hover request. */
export interface HoverResult {
  readonly contents: string;
  readonly range?: Range;
}

/** A text edit to apply to a document. */
export interface TextEdit {
  readonly range: Range;
  readonly newText: string;
}

/** Symbol kinds found in GSPL documents. */
export type SymbolKind = 'seed' | 'world' | 'entity' | 'law' | 'function' | 'variable' | 'observation';

/** A symbol found in a document, potentially with children. */
export interface DocumentSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly range: Range;
  readonly children?: DocumentSymbol[];
}

// ─────────────────────────────────────────────
// Keyword & Built-in Databases
// ─────────────────────────────────────────────

/** All 42 GSPL language keywords. */
const GSPL_KEYWORDS: readonly string[] = [
  'seed', 'world', 'entity', 'law', 'observation', 'instinct', 'affinity',
  'breed', 'mutate', 'evolve', 'compose', 'graft',
  'if', 'else', 'for', 'while', 'break', 'continue', 'return', 'match',
  'let', 'const', 'fn', 'import', 'from',
  'domain', 'identity', 'structure', 'appearance', 'motion', 'ability',
  'behavior', 'evolution', 'fields', 'interaction', 'metadata',
  '@strict', '@require', '@domain',
  'true', 'false', 'null',
] as const;

/** Keyword descriptions for hover information. */
const KEYWORD_DOCS: Readonly<Record<string, string>> = {
  seed: 'Declares a new seed — the fundamental unit of GSPL. A seed encapsulates genes, behaviors, and evolution rules.',
  world: 'Declares a world container that holds seeds, laws, and environmental parameters.',
  entity: 'Declares a named entity within a world — a concrete instance derived from a seed.',
  law: 'Declares a world law — a rule that governs seed behavior and evolution.',
  observation: 'Declares an observation block for monitoring and logging seed/world state.',
  instinct: 'Defines an innate behavior pattern for a seed that cannot be overridden by evolution.',
  affinity: 'Defines attraction/repulsion relationships between seeds or gene types.',
  breed: 'Combines two parent seeds to produce offspring using crossover strategies.',
  mutate: 'Applies random variation to a seed\'s genes within defined bounds.',
  evolve: 'Runs multi-generation evolution on a seed population with selection pressure.',
  compose: 'Combines multiple seeds into a composite using union/intersection operators.',
  graft: 'Transplants specific genes or gene groups from one seed to another.',
  if: 'Conditional branching — executes a block only when the condition is truthy.',
  else: 'Alternative branch executed when the preceding if-condition is falsy.',
  for: 'Iterates over a collection or range, binding each element to a variable.',
  while: 'Repeats a block while the condition remains truthy.',
  break: 'Exits the innermost loop immediately.',
  continue: 'Skips to the next iteration of the innermost loop.',
  return: 'Returns a value from the current function.',
  match: 'Pattern matching — selects a branch based on value shape or type.',
  let: 'Declares a mutable local variable.',
  const: 'Declares an immutable local binding.',
  fn: 'Declares a named function.',
  import: 'Imports symbols from another GSPL module.',
  from: 'Specifies the source module for an import statement.',
  domain: 'Specifies the semantic domain of a seed (e.g., organism, vehicle, weapon).',
  identity: 'Gene block defining core identity traits (name, archetype, personality).',
  structure: 'Gene block defining structural properties (skeleton, morphology, topology).',
  appearance: 'Gene block defining visual properties (color, texture, shape).',
  motion: 'Gene block defining movement properties (speed, gait, physics).',
  ability: 'Gene block defining capabilities and skills.',
  behavior: 'Gene block defining behavioral rules and state machines.',
  evolution: 'Gene block defining evolution parameters (mutation rate, fitness function).',
  fields: 'Gene block defining custom data fields.',
  interaction: 'Gene block defining how seeds interact with each other and the world.',
  metadata: 'Gene block for descriptive metadata (tags, description, author).',
  '@strict': 'Annotation enabling strict type checking for the seed or block.',
  '@require': 'Annotation declaring a required dependency or gene.',
  '@domain': 'Annotation specifying the domain constraint for a seed.',
  true: 'Boolean literal true.',
  false: 'Boolean literal false.',
  null: 'Null literal — represents absence of a value.',
};

/** Built-in math functions. */
const MATH_FUNCTIONS: readonly CompletionItem[] = [
  { label: 'sin', kind: 'function', detail: '(x: number) => number', documentation: 'Returns the sine of x (radians).' },
  { label: 'cos', kind: 'function', detail: '(x: number) => number', documentation: 'Returns the cosine of x (radians).' },
  { label: 'sqrt', kind: 'function', detail: '(x: number) => number', documentation: 'Returns the square root of x.' },
  { label: 'abs', kind: 'function', detail: '(x: number) => number', documentation: 'Returns the absolute value of x.' },
  { label: 'floor', kind: 'function', detail: '(x: number) => number', documentation: 'Returns the largest integer <= x.' },
  { label: 'ceil', kind: 'function', detail: '(x: number) => number', documentation: 'Returns the smallest integer >= x.' },
  { label: 'round', kind: 'function', detail: '(x: number) => number', documentation: 'Returns x rounded to the nearest integer.' },
  { label: 'clamp', kind: 'function', detail: '(x: number, min: number, max: number) => number', documentation: 'Clamps x between min and max.' },
  { label: 'lerp', kind: 'function', detail: '(a: number, b: number, t: number) => number', documentation: 'Linear interpolation between a and b by factor t.' },
] as const;

/** Built-in random functions. */
const RANDOM_FUNCTIONS: readonly CompletionItem[] = [
  { label: 'uniform', kind: 'function', detail: '(min: number, max: number) => number', documentation: 'Returns a uniform random value in [min, max).' },
  { label: 'gaussian', kind: 'function', detail: '(mean: number, stddev: number) => number', documentation: 'Returns a Gaussian-distributed random value.' },
  { label: 'choice', kind: 'function', detail: '(items: T[]) => T', documentation: 'Returns a random element from the array.' },
] as const;

/** Built-in vector functions. */
const VECTOR_FUNCTIONS: readonly CompletionItem[] = [
  { label: 'vec2', kind: 'function', detail: '(x: number, y: number) => Vec2', documentation: 'Creates a 2D vector.' },
  { label: 'vec3', kind: 'function', detail: '(x: number, y: number, z: number) => Vec3', documentation: 'Creates a 3D vector.' },
  { label: 'normalize', kind: 'function', detail: '(v: Vec) => Vec', documentation: 'Returns the unit vector in the direction of v.' },
  { label: 'magnitude', kind: 'function', detail: '(v: Vec) => number', documentation: 'Returns the length (magnitude) of vector v.' },
  { label: 'dot', kind: 'function', detail: '(a: Vec, b: Vec) => number', documentation: 'Returns the dot product of a and b.' },
  { label: 'cross', kind: 'function', detail: '(a: Vec3, b: Vec3) => Vec3', documentation: 'Returns the cross product of 3D vectors a and b.' },
  { label: 'distance', kind: 'function', detail: '(a: Vec, b: Vec) => number', documentation: 'Returns the Euclidean distance between a and b.' },
] as const;

/** All built-in functions combined. */
const ALL_BUILTINS: readonly CompletionItem[] = [
  ...MATH_FUNCTIONS,
  ...RANDOM_FUNCTIONS,
  ...VECTOR_FUNCTIONS,
];

/** Gene type names for context-aware completion. */
const GENE_TYPE_NAMES: readonly GeneType[] = [
  'scalar', 'categorical', 'vector', 'expression',
  'struct', 'array', 'graph', 'tensor', 'timeseries',
];

/** Gene type descriptions for hover. */
const GENE_TYPE_DOCS: Readonly<Record<string, string>> = {
  scalar: 'A numeric gene with min/max bounds and optional step.',
  categorical: 'A gene that selects from a set of named options with optional weights.',
  vector: 'A multi-dimensional numeric gene with per-dimension bounds.',
  expression: 'A gene defined by a mathematical expression string.',
  struct: 'A composite gene containing named sub-genes.',
  array: 'A variable-length ordered collection of genes.',
  graph: 'A gene representing a node-edge graph structure.',
  tensor: 'A multi-dimensional numeric array gene.',
  timeseries: 'A gene defined by keyframe values over time.',
};

/** Known domain names for domain-context completion. */
const DOMAIN_NAMES: readonly string[] = [
  'organism', 'vehicle', 'weapon', 'building', 'terrain',
  'material', 'plant', 'insect', 'fish', 'bird',
  'mammal', 'robot', 'particle', 'fluid', 'crystal',
  'sound', 'music', 'pattern', 'network', 'language',
  'code', 'strategy', 'schedule', 'rule', 'constraint',
  'ecosystem', 'game', 'simulation', 'audio', 'narrative',
  'ui', 'city', 'neural', 'intelligence', 'quantum',
  'molecular', 'education', 'finance', 'infrastructure',
  'product', 'seed-intelligence', 'void', 'web',
  'render', 'shader', 'animation-visual', 'interaction',
  'aesthetic', 'emotion', 'perception', 'cinematic',
  'rig', 'mocap', 'lod', 'texture', 'logo', 'brand', 'compression',
  'security-threat', 'intrusion', 'forensics',
  'memory-store',
] satisfies readonly SeedDomain[];

/** Gene block keywords that indicate we are inside a gene context. */
const GENE_BLOCK_KEYWORDS: ReadonlySet<string> = new Set([
  'identity', 'structure', 'appearance', 'motion', 'ability',
  'behavior', 'evolution', 'fields', 'interaction', 'metadata',
]);

/** Known decorator annotations. */
const KNOWN_ANNOTATIONS: ReadonlySet<string> = new Set([
  '@strict', '@require', '@domain',
]);

// ─────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────

/** Creates a Position. */
function pos(line: number, character: number): Position {
  return { line, character };
}

/** Creates a Range. */
function range(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return { start: pos(startLine, startChar), end: pos(endLine, endChar) };
}

/** Extracts the word at a given position from a line of text. */
function getWordAtPosition(lineText: string, character: number): { word: string; start: number; end: number } | undefined {
  if (character < 0 || character > lineText.length) {
    return undefined;
  }

  let start = character;
  let end = character;

  // Expand left — include @ for annotations
  while (start > 0) {
    const ch = lineText[start - 1];
    if (ch === undefined || (!/[\w@-]/.test(ch))) {
      break;
    }
    start--;
  }

  // Expand right
  while (end < lineText.length) {
    const ch = lineText[end];
    if (ch === undefined || (!/[\w-]/.test(ch))) {
      break;
    }
    end++;
  }

  if (start === end) {
    return undefined;
  }

  return { word: lineText.slice(start, end), start, end };
}

/** Splits text content into lines. Handles \r\n and \n. */
function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

// ─────────────────────────────────────────────
// TextDocument
// ─────────────────────────────────────────────

/** Represents an open text document with line-based access and incremental updates. */
export class TextDocument {
  readonly uri: string;
  private _content: string;
  private _lines: string[] | null;
  private _version: number;

  constructor(uri: string, content: string, version?: number) {
    this.uri = uri;
    this._content = content;
    this._lines = null;
    this._version = version ?? 0;
  }

  /** Current document version. */
  get version(): number {
    return this._version;
  }

  /** Full document text, or text within a range. */
  getText(r?: Range): string {
    if (r === undefined) {
      return this._content;
    }
    const startOffset = this.offsetAt(r.start);
    const endOffset = this.offsetAt(r.end);
    return this._content.slice(startOffset, endOffset);
  }

  /** Returns the text of a single line (without line ending). */
  getLine(line: number): string {
    const lines = this._getLines();
    return lines[line] ?? '';
  }

  /** Returns the total number of lines. */
  getLineCount(): number {
    return this._getLines().length;
  }

  /** Converts a zero-based offset to a Position. */
  positionAt(offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, this._content.length));
    const lines = this._getLines();
    let remaining = clamped;

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i]!;
      // +1 for the newline character, except for the last line
      const lineLength = i < lines.length - 1 ? lineContent.length + 1 : lineContent.length;
      if (remaining <= lineLength) {
        return pos(i, Math.min(remaining, lineContent.length));
      }
      remaining -= lineLength;
    }

    // Fallback: end of document
    const lastLine = lines.length - 1;
    return pos(lastLine, (lines[lastLine] ?? '').length);
  }

  /** Converts a Position to a zero-based offset. */
  offsetAt(position: Position): number {
    const lines = this._getLines();
    const line = Math.max(0, Math.min(position.line, lines.length - 1));
    let offset = 0;

    for (let i = 0; i < line; i++) {
      offset += (lines[i] ?? '').length + 1; // +1 for newline
    }

    const lineContent = lines[line] ?? '';
    offset += Math.max(0, Math.min(position.character, lineContent.length));
    return offset;
  }

  /** Applies incremental changes and bumps the version. */
  update(changes: Array<{ range: Range; text: string }>, version: number): void {
    // Apply changes in reverse offset order to preserve positions
    const sorted = [...changes].sort((a, b) => {
      const offA = this.offsetAt(a.range.start);
      const offB = this.offsetAt(b.range.start);
      return offB - offA; // descending so later offsets applied first
    });

    let content = this._content;
    for (const change of sorted) {
      const startOff = this.offsetAt(change.range.start);
      const endOff = this.offsetAt(change.range.end);
      content = content.slice(0, startOff) + change.text + content.slice(endOff);
    }

    this._content = content;
    this._lines = null; // invalidate cache
    this._version = version;
  }

  /** Lazily computed line array. */
  private _getLines(): string[] {
    if (this._lines === null) {
      this._lines = splitLines(this._content);
    }
    return this._lines;
  }
}

// ─────────────────────────────────────────────
// DocumentStore
// ─────────────────────────────────────────────

/** Manages the set of currently open text documents. */
export class DocumentStore {
  private readonly _documents: Map<string, TextDocument> = new Map();

  /** Opens a document and adds it to the store. */
  open(uri: string, content: string, version?: number): TextDocument {
    const doc = new TextDocument(uri, content, version);
    this._documents.set(uri, doc);
    return doc;
  }

  /** Closes and removes a document from the store. */
  close(uri: string): boolean {
    return this._documents.delete(uri);
  }

  /** Retrieves a document by URI. */
  get(uri: string): TextDocument | undefined {
    return this._documents.get(uri);
  }

  /** Applies incremental changes to an open document. */
  update(uri: string, changes: Array<{ range: Range; text: string }>, version: number): TextDocument {
    const doc = this._documents.get(uri);
    if (doc === undefined) {
      throw new Error(`Document not open: ${uri}`);
    }
    doc.update(changes, version);
    return doc;
  }

  /** Returns all open documents. */
  getAll(): TextDocument[] {
    return [...this._documents.values()];
  }
}

// ─────────────────────────────────────────────
// CompletionProvider
// ─────────────────────────────────────────────

/** Provides context-aware auto-complete suggestions for GSPL documents. */
export class CompletionProvider {
  /** Returns completion items relevant to the cursor position. */
  complete(doc: TextDocument, position: Position): CompletionItem[] {
    const lineText = doc.getLine(position.line);
    const textBefore = lineText.slice(0, position.character);
    const trimmed = textBefore.trimStart();

    // Context: after 'domain' keyword, suggest domain names
    if (/\bdomain\s+$/.test(textBefore) || /\bdomain\s+[\w-]*$/.test(textBefore)) {
      return DOMAIN_NAMES.map((d) => ({
        label: d,
        kind: 'type' as CompletionKind,
        detail: 'Seed domain',
        documentation: `Domain: ${d}`,
        insertText: d,
      }));
    }

    // Context: inside a gene block, suggest gene types
    if (this._isInGeneBlock(doc, position)) {
      const geneItems: CompletionItem[] = GENE_TYPE_NAMES.map((gt) => ({
        label: gt,
        kind: 'type' as CompletionKind,
        detail: 'Gene type',
        documentation: GENE_TYPE_DOCS[gt] ?? gt,
        insertText: gt,
      }));
      return [...geneItems, ...this._allCompletions()];
    }

    // Context: starts with @ — suggest annotations
    if (trimmed.startsWith('@')) {
      return [...KNOWN_ANNOTATIONS].map((a) => ({
        label: a,
        kind: 'keyword' as CompletionKind,
        detail: 'Annotation',
        documentation: KEYWORD_DOCS[a] ?? a,
        insertText: a,
      }));
    }

    // Default: all keywords + built-ins
    return this._allCompletions();
  }

  /** Checks if the position is inside a gene block by scanning upward. */
  private _isInGeneBlock(doc: TextDocument, position: Position): boolean {
    let braceDepth = 0;
    for (let line = position.line; line >= 0; line--) {
      const text = doc.getLine(line);
      const end = line === position.line ? position.character : text.length;
      for (let i = end - 1; i >= 0; i--) {
        const ch = text[i];
        if (ch === '}') braceDepth++;
        if (ch === '{') {
          braceDepth--;
          if (braceDepth < 0) {
            // Found the opening brace — check if preceded by a gene block keyword
            const beforeBrace = text.slice(0, i).trim();
            const lastWord = beforeBrace.split(/\s+/).pop() ?? '';
            return GENE_BLOCK_KEYWORDS.has(lastWord);
          }
        }
      }
    }
    return false;
  }

  /** Returns all standard completion items (keywords + built-ins). */
  private _allCompletions(): CompletionItem[] {
    const keywordItems: CompletionItem[] = GSPL_KEYWORDS.map((kw) => ({
      label: kw,
      kind: 'keyword' as CompletionKind,
      detail: 'GSPL keyword',
      documentation: KEYWORD_DOCS[kw] ?? kw,
      insertText: kw,
    }));

    const builtinItems: CompletionItem[] = ALL_BUILTINS.map((fn) => ({
      ...fn,
    }));

    return [...keywordItems, ...builtinItems];
  }
}

// ─────────────────────────────────────────────
// HoverProvider
// ─────────────────────────────────────────────

/** Provides hover information for GSPL keywords, gene types, and built-in functions. */
export class HoverProvider {
  /** Returns hover info for the word at the given position, or undefined. */
  hover(doc: TextDocument, position: Position): HoverResult | undefined {
    const lineText = doc.getLine(position.line);
    const wordInfo = getWordAtPosition(lineText, position.character);
    if (wordInfo === undefined) {
      return undefined;
    }

    const { word, start, end } = wordInfo;
    const wordRange = range(position.line, start, position.line, end);

    // Check keywords
    const kwDoc = KEYWORD_DOCS[word];
    if (kwDoc !== undefined) {
      return { contents: `**${word}** (keyword)\n\n${kwDoc}`, range: wordRange };
    }

    // Check gene types
    const geneDoc = GENE_TYPE_DOCS[word];
    if (geneDoc !== undefined) {
      return { contents: `**${word}** (gene type)\n\n${geneDoc}`, range: wordRange };
    }

    // Check built-in functions
    const builtin = ALL_BUILTINS.find((fn) => fn.label === word);
    if (builtin !== undefined) {
      const sig = builtin.detail ?? '';
      const doc = builtin.documentation ?? '';
      return { contents: `**${word}** (built-in)\n\n\`${sig}\`\n\n${doc}`, range: wordRange };
    }

    return undefined;
  }
}

// ─────────────────────────────────────────────
// DiagnosticsProvider
// ─────────────────────────────────────────────

/** Provides basic diagnostic analysis for GSPL documents. */
export class DiagnosticsProvider {
  /** Analyzes a document and returns diagnostics. */
  diagnose(doc: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lineCount = doc.getLineCount();

    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < lineCount; i++) {
      const line = doc.getLine(i);

      // Check for unclosed strings within a single line
      let lineInString = false;
      let lineStringChar = '';
      for (let c = 0; c < line.length; c++) {
        const ch = line[c]!;
        const prevCh = c > 0 ? line[c - 1] : '';

        if (lineInString) {
          if (ch === lineStringChar && prevCh !== '\\') {
            lineInString = false;
          }
        } else {
          if (ch === '"' || ch === "'") {
            lineInString = true;
            lineStringChar = ch;
          }
        }
      }
      if (lineInString) {
        diagnostics.push({
          range: range(i, 0, i, line.length),
          severity: DIAGNOSTIC_SEVERITY.Error,
          message: `Unclosed string literal (missing closing ${lineStringChar}).`,
          source: 'gspl',
        });
      }

      // Track braces/brackets (skip string content)
      inString = false;
      stringChar = '';
      for (let c = 0; c < line.length; c++) {
        const ch = line[c]!;
        const prevCh = c > 0 ? line[c - 1] : '';

        if (inString) {
          if (ch === stringChar && prevCh !== '\\') {
            inString = false;
          }
          continue;
        }

        if (ch === '"' || ch === "'") {
          inString = true;
          stringChar = ch;
          continue;
        }

        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
        if (ch === '[') bracketCount++;
        if (ch === ']') bracketCount--;

        if (braceCount < 0) {
          diagnostics.push({
            range: range(i, c, i, c + 1),
            severity: DIAGNOSTIC_SEVERITY.Error,
            message: 'Unexpected closing brace "}" without matching opening brace.',
            source: 'gspl',
          });
          braceCount = 0;
        }

        if (bracketCount < 0) {
          diagnostics.push({
            range: range(i, c, i, c + 1),
            severity: DIAGNOSTIC_SEVERITY.Error,
            message: 'Unexpected closing bracket "]" without matching opening bracket.',
            source: 'gspl',
          });
          bracketCount = 0;
        }
      }

      // Check for unknown annotations
      const annotationMatches = line.matchAll(/@[\w]+/g);
      for (const m of annotationMatches) {
        const annotation = m[0]!;
        if (!KNOWN_ANNOTATIONS.has(annotation)) {
          const col = m.index ?? 0;
          diagnostics.push({
            range: range(i, col, i, col + annotation.length),
            severity: DIAGNOSTIC_SEVERITY.Warning,
            message: `Unknown annotation "${annotation}". Known annotations: ${[...KNOWN_ANNOTATIONS].join(', ')}.`,
            source: 'gspl',
          });
        }
      }

      // Check for empty seed bodies: seed "name" { }
      const emptySeedMatch = /\bseed\s+"[^"]*"\s*\{\s*\}/.exec(line);
      if (emptySeedMatch !== null) {
        const col = emptySeedMatch.index ?? 0;
        diagnostics.push({
          range: range(i, col, i, col + emptySeedMatch[0].length),
          severity: DIAGNOSTIC_SEVERITY.Warning,
          message: 'Empty seed body. A seed should contain at least one gene block or behavior.',
          source: 'gspl',
        });
      }
    }

    // End-of-document brace/bracket balance
    if (braceCount > 0) {
      diagnostics.push({
        range: range(lineCount - 1, 0, lineCount - 1, doc.getLine(lineCount - 1).length),
        severity: DIAGNOSTIC_SEVERITY.Error,
        message: `Unclosed brace: ${braceCount} opening brace(s) without matching closing brace(s).`,
        source: 'gspl',
      });
    }
    if (bracketCount > 0) {
      diagnostics.push({
        range: range(lineCount - 1, 0, lineCount - 1, doc.getLine(lineCount - 1).length),
        severity: DIAGNOSTIC_SEVERITY.Error,
        message: `Unclosed bracket: ${bracketCount} opening bracket(s) without matching closing bracket(s).`,
        source: 'gspl',
      });
    }

    return diagnostics;
  }
}

// ─────────────────────────────────────────────
// SymbolProvider
// ─────────────────────────────────────────────

/** Symbol declaration pattern: keyword followed by a quoted name or bare identifier. */
const SYMBOL_PATTERNS: ReadonlyArray<{ regex: RegExp; kind: SymbolKind }> = [
  { regex: /\bseed\s+"([^"]+)"/, kind: 'seed' },
  { regex: /\bworld\s+"([^"]+)"/, kind: 'world' },
  { regex: /\bentity\s+"([^"]+)"/, kind: 'entity' },
  { regex: /\blaw\s+"([^"]+)"/, kind: 'law' },
  { regex: /\bobservation\s+"([^"]+)"/, kind: 'observation' },
  { regex: /\bfn\s+([\w]+)/, kind: 'function' },
  { regex: /\blet\s+([\w]+)/, kind: 'variable' },
  { regex: /\bconst\s+([\w]+)/, kind: 'variable' },
];

/** Provides document symbol (outline) information for GSPL documents. */
export class SymbolProvider {
  /** Scans a document for symbol declarations. */
  getSymbols(doc: TextDocument): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];
    const lineCount = doc.getLineCount();

    for (let i = 0; i < lineCount; i++) {
      const line = doc.getLine(i);

      for (const pattern of SYMBOL_PATTERNS) {
        const match = pattern.regex.exec(line);
        if (match !== null) {
          const name = match[1] ?? 'unknown';
          const col = match.index ?? 0;
          const endCol = col + match[0].length;

          // For block-level symbols (seed, world, entity, law, observation),
          // try to find the closing brace to determine the full range
          const endLine = this._findBlockEnd(doc, i, lineCount);

          symbols.push({
            name,
            kind: pattern.kind,
            range: range(i, col, endLine, doc.getLine(endLine).length),
          });
          break; // One symbol per line
        }
      }
    }

    return symbols;
  }

  /** Attempts to find the end of a block starting from a line containing '{'. */
  private _findBlockEnd(doc: TextDocument, startLine: number, lineCount: number): number {
    let depth = 0;
    let foundOpen = false;

    for (let i = startLine; i < lineCount; i++) {
      const line = doc.getLine(i);
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === '{') {
          depth++;
          foundOpen = true;
        } else if (ch === '}') {
          depth--;
          if (foundOpen && depth === 0) {
            return i;
          }
        }
      }
    }

    // No matching close found — return start line
    return startLine;
  }
}

// ─────────────────────────────────────────────
// FormattingProvider
// ─────────────────────────────────────────────

/** Provides auto-formatting for GSPL documents. */
export class FormattingProvider {
  private readonly _indentSize: number;

  constructor(indentSize: number = 2) {
    this._indentSize = indentSize;
  }

  /** Returns text edits to format the entire document. */
  format(doc: TextDocument): TextEdit[] {
    const edits: TextEdit[] = [];
    const lineCount = doc.getLineCount();
    const indent = ' '.repeat(this._indentSize);
    let depth = 0;

    for (let i = 0; i < lineCount; i++) {
      const originalLine = doc.getLine(i);
      let trimmed = originalLine.trimEnd();

      // Trim trailing whitespace (but keep line if it had content)
      if (originalLine !== trimmed && trimmed.length > 0) {
        // Will be handled by re-indentation below
      }

      // Count braces on this line to determine indent
      // A line with a closing brace should be dedented first
      const startsWithClose = /^\s*[}\]]/.test(trimmed);
      if (startsWithClose) {
        depth = Math.max(0, depth - 1);
      }

      // Build the expected indentation
      const stripped = trimmed.trimStart();
      const expectedIndent = stripped.length === 0 ? '' : indent.repeat(depth);
      const formatted = stripped.length === 0 ? '' : expectedIndent + stripped;

      if (formatted !== originalLine) {
        edits.push({
          range: range(i, 0, i, originalLine.length),
          newText: formatted,
        });
      }

      // Count opening/closing braces to adjust depth for next line
      // (skip braces inside strings for basic correctness)
      let inStr = false;
      let strCh = '';
      for (let c = 0; c < stripped.length; c++) {
        const ch = stripped[c]!;
        const prev = c > 0 ? stripped[c - 1] : '';
        if (inStr) {
          if (ch === strCh && prev !== '\\') inStr = false;
          continue;
        }
        if (ch === '"' || ch === "'") {
          inStr = true;
          strCh = ch;
          continue;
        }
        if (ch === '{' || ch === '[') depth++;
        if (ch === '}' || ch === ']') {
          if (!startsWithClose || c > 0) {
            // Only decrement if this isn't the leading close we already handled
            // Actually, re-check: we need to decrement for ALL closing braces
            // except the one we already decremented for at the start
          }
          // For closing braces that appear mid-line or are additional ones
          if (startsWithClose) {
            // The first closing brace was already handled above
            // Check if this is beyond the first closing brace
            const firstCloseIdx = stripped.search(/[}\]]/);
            if (c > firstCloseIdx) {
              depth = Math.max(0, depth - 1);
            }
          } else {
            depth = Math.max(0, depth - 1);
          }
        }
      }
    }

    // Ensure file ends with exactly one newline
    const fullText = doc.getText();
    if (fullText.length > 0 && !fullText.endsWith('\n')) {
      const lastLine = lineCount - 1;
      const lastLineText = doc.getLine(lastLine);
      edits.push({
        range: range(lastLine, lastLineText.length, lastLine, lastLineText.length),
        newText: '\n',
      });
    } else if (fullText.endsWith('\n\n')) {
      // Remove extra trailing newlines — find where the trailing empties start
      let trailingStart = lineCount - 1;
      while (trailingStart > 0 && doc.getLine(trailingStart).length === 0) {
        trailingStart--;
      }
      // Keep one empty line (which represents the trailing newline)
      if (trailingStart + 2 < lineCount) {
        edits.push({
          range: range(trailingStart + 1, 0, lineCount - 1, doc.getLine(lineCount - 1).length),
          newText: '',
        });
      }
    }

    return edits;
  }
}

// ─────────────────────────────────────────────
// GSPLLanguageServer
// ─────────────────────────────────────────────

/** Top-level coordinator for all GSPL language services. */
export class GSPLLanguageServer {
  readonly documents: DocumentStore;
  private readonly _completion: CompletionProvider;
  private readonly _hover: HoverProvider;
  private readonly _diagnostics: DiagnosticsProvider;
  private readonly _symbols: SymbolProvider;
  private readonly _formatting: FormattingProvider;

  constructor() {
    this.documents = new DocumentStore();
    this._completion = new CompletionProvider();
    this._hover = new HoverProvider();
    this._diagnostics = new DiagnosticsProvider();
    this._symbols = new SymbolProvider();
    this._formatting = new FormattingProvider();
  }

  /** Notifies the server that a document was opened. */
  onOpen(uri: string, content: string): void {
    this.documents.open(uri, content);
  }

  /** Notifies the server that a document was closed. */
  onClose(uri: string): void {
    this.documents.close(uri);
  }

  /** Notifies the server of incremental document changes. */
  onChange(uri: string, changes: Array<{ range: Range; text: string }>, version: number): void {
    const doc = this.documents.get(uri);
    if (doc === undefined) {
      return;
    }
    doc.update(changes, version);
  }

  /** Returns completion items at the given position. */
  complete(uri: string, position: Position): CompletionItem[] {
    const doc = this.documents.get(uri);
    if (doc === undefined) {
      return [];
    }
    return this._completion.complete(doc, position);
  }

  /** Returns hover information at the given position. */
  hover(uri: string, position: Position): HoverResult | undefined {
    const doc = this.documents.get(uri);
    if (doc === undefined) {
      return undefined;
    }
    return this._hover.hover(doc, position);
  }

  /** Returns diagnostics for the given document. */
  diagnose(uri: string): Diagnostic[] {
    const doc = this.documents.get(uri);
    if (doc === undefined) {
      return [];
    }
    return this._diagnostics.diagnose(doc);
  }

  /** Returns document symbols (outline) for the given document. */
  getSymbols(uri: string): DocumentSymbol[] {
    const doc = this.documents.get(uri);
    if (doc === undefined) {
      return [];
    }
    return this._symbols.getSymbols(doc);
  }

  /** Returns formatting edits for the given document. */
  format(uri: string): TextEdit[] {
    const doc = this.documents.get(uri);
    if (doc === undefined) {
      return [];
    }
    return this._formatting.format(doc);
  }
}
