/**
 * @paradigm/lang — GSPL Language Implementation
 *
 * Complete lexer, parser, AST, and serializer for the GSPL (Generative Seed
 * Programming Language). Handles 42 keywords, GSPL 5.0 Living World syntax
 * (world, entity, law, observation, instinct, affinity), string interpolation,
 * nested block comments, and Pratt precedence expression parsing.
 *
 * Zero external dependencies.
 */

// ============================================================================
// TOKENS
// ============================================================================

export enum TokenType {
  // Literals
  Number = 'Number',
  String = 'String',
  Boolean = 'Boolean',
  Null = 'Null',

  // Identifiers
  Identifier = 'Identifier',

  // Keywords (42 total)
  Seed = 'Seed',
  World = 'World',
  Entity = 'Entity',
  Law = 'Law',
  Observation = 'Observation',
  Instinct = 'Instinct',
  Affinity = 'Affinity',
  Extends = 'Extends',
  Breed = 'Breed',
  Mutate = 'Mutate',
  Evolve = 'Evolve',
  Compose = 'Compose',
  Graft = 'Graft',
  Import = 'Import',
  From = 'From',
  Const = 'Const',
  Let = 'Let',
  Fn = 'Fn',
  Return = 'Return',
  If = 'If',
  Else = 'Else',
  For = 'For',
  While = 'While',
  Break = 'Break',
  Continue = 'Continue',
  Match = 'Match',
  Domain = 'Domain',
  Identity = 'Identity',
  Structure = 'Structure',
  Appearance = 'Appearance',
  Motion = 'Motion',
  Ability = 'Ability',
  Behavior = 'Behavior',
  Evolution = 'Evolution',
  Fields = 'Fields',
  Interaction = 'Interaction',
  Metadata = 'Metadata',
  True = 'True',
  False = 'False',
  As = 'As',
  In = 'In',

  // Operators
  Plus = 'Plus',
  Minus = 'Minus',
  Star = 'Star',
  Slash = 'Slash',
  Percent = 'Percent',
  StarStar = 'StarStar',
  Lt = 'Lt',
  Gt = 'Gt',
  LtEq = 'LtEq',
  GtEq = 'GtEq',
  EqEq = 'EqEq',
  BangEq = 'BangEq',
  And = 'And',
  Or = 'Or',
  Bang = 'Bang',
  Ampersand = 'Ampersand',
  Pipe = 'Pipe',
  Caret = 'Caret',
  Tilde = 'Tilde',
  LtLt = 'LtLt',
  GtGt = 'GtGt',
  Eq = 'Eq',
  PlusEq = 'PlusEq',
  MinusEq = 'MinusEq',
  StarEq = 'StarEq',
  SlashEq = 'SlashEq',
  Dot = 'Dot',
  QuestionDot = 'QuestionDot',
  DotDot = 'DotDot',
  DotDotDot = 'DotDotDot',

  // Delimiters
  LParen = 'LParen',
  RParen = 'RParen',
  LBrace = 'LBrace',
  RBrace = 'RBrace',
  LBracket = 'LBracket',
  RBracket = 'RBracket',
  Comma = 'Comma',
  Colon = 'Colon',
  Semicolon = 'Semicolon',
  Arrow = 'Arrow',
  FatArrow = 'FatArrow',

  // Special
  At = 'At',
  Hash = 'Hash',

  // Meta
  EOF = 'EOF',
  Newline = 'Newline',
  Comment = 'Comment',
}

export interface Token {
  type: TokenType;
  lexeme: string;
  literal: unknown;
  line: number;
  column: number;
  offset: number;
}

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
  length: number;
}

export const KEYWORDS: Record<string, TokenType> = {
  seed: TokenType.Seed,
  world: TokenType.World,
  entity: TokenType.Entity,
  law: TokenType.Law,
  observation: TokenType.Observation,
  instinct: TokenType.Instinct,
  affinity: TokenType.Affinity,
  extends: TokenType.Extends,
  breed: TokenType.Breed,
  mutate: TokenType.Mutate,
  evolve: TokenType.Evolve,
  compose: TokenType.Compose,
  graft: TokenType.Graft,
  import: TokenType.Import,
  from: TokenType.From,
  const: TokenType.Const,
  let: TokenType.Let,
  fn: TokenType.Fn,
  return: TokenType.Return,
  if: TokenType.If,
  else: TokenType.Else,
  for: TokenType.For,
  while: TokenType.While,
  break: TokenType.Break,
  continue: TokenType.Continue,
  match: TokenType.Match,
  domain: TokenType.Domain,
  identity: TokenType.Identity,
  structure: TokenType.Structure,
  appearance: TokenType.Appearance,
  motion: TokenType.Motion,
  ability: TokenType.Ability,
  behavior: TokenType.Behavior,
  evolution: TokenType.Evolution,
  fields: TokenType.Fields,
  interaction: TokenType.Interaction,
  metadata: TokenType.Metadata,
  true: TokenType.True,
  false: TokenType.False,
  as: TokenType.As,
  in: TokenType.In,
  null: TokenType.Null,
};

// ============================================================================
// AST NODES
// ============================================================================

export interface TypeAnnotation {
  name: string;
  generic?: TypeAnnotation[];
  nullable?: boolean;
}

export interface Parameter {
  name: string;
  type?: TypeAnnotation;
  defaultValue?: Expr;
}

export interface Directive {
  name: string;
  arguments?: unknown[];
  location: SourceLocation;
}

// -- Expression nodes (18 types) --

export interface LiteralExpr {
  kind: 'literal';
  value: number | string | boolean | null;
  location: SourceLocation;
}

export interface IdentifierExpr {
  kind: 'identifier';
  name: string;
  location: SourceLocation;
}

export interface BinaryExpr {
  kind: 'binary';
  left: Expr;
  operator: TokenType;
  right: Expr;
  location: SourceLocation;
}

export interface UnaryExpr {
  kind: 'unary';
  operator: TokenType;
  operand: Expr;
  location: SourceLocation;
}

export interface MemberExpr {
  kind: 'member';
  object: Expr;
  property: string;
  computed: boolean;
  location: SourceLocation;
}

export interface IndexExpr {
  kind: 'index';
  object: Expr;
  index: Expr;
  location: SourceLocation;
}

export interface CallExpr {
  kind: 'call';
  callee: Expr;
  arguments: Expr[];
  location: SourceLocation;
}

export interface TernaryExpr {
  kind: 'ternary';
  condition: Expr;
  consequent: Expr;
  alternate: Expr;
  location: SourceLocation;
}

export interface ArrayExpr {
  kind: 'array';
  elements: Expr[];
  location: SourceLocation;
}

export interface ObjectExpr {
  kind: 'object';
  properties: Array<{ key: string; value: Expr }>;
  location: SourceLocation;
}

export interface FunctionExpr {
  kind: 'function';
  parameters: Parameter[];
  body: Stmt[];
  returnType?: TypeAnnotation;
  location: SourceLocation;
}

export interface SeedRefExpr {
  kind: 'seedRef';
  name: string;
  location: SourceLocation;
}

export interface GeneAccessExpr {
  kind: 'geneAccess';
  seed: Expr;
  genePath: string[];
  location: SourceLocation;
}

export interface TemplateStringExpr {
  kind: 'templateString';
  parts: Array<{ isExpr: false; value: string } | { isExpr: true; expr: Expr }>;
  location: SourceLocation;
}

export interface RangeExpr {
  kind: 'range';
  start: Expr;
  end: Expr;
  location: SourceLocation;
}

export interface SpreadExpr {
  kind: 'spread';
  expr: Expr;
  location: SourceLocation;
}

export interface AssignmentExpr {
  kind: 'assignment';
  target: Expr;
  operator: TokenType;
  value: Expr;
  location: SourceLocation;
}

export interface UpdateExpr {
  kind: 'update';
  target: Expr;
  operator: '+=' | '-=' | '*=' | '/=';
  location: SourceLocation;
}

export type Expr =
  | LiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr
  | MemberExpr
  | IndexExpr
  | CallExpr
  | TernaryExpr
  | ArrayExpr
  | ObjectExpr
  | FunctionExpr
  | SeedRefExpr
  | GeneAccessExpr
  | TemplateStringExpr
  | RangeExpr
  | SpreadExpr
  | AssignmentExpr
  | UpdateExpr;

// -- Statement nodes --

export interface ExpressionStmt {
  kind: 'expressionStmt';
  expression: Expr;
  location: SourceLocation;
}

export interface VarDeclStmt {
  kind: 'varDecl';
  name: string;
  mutable: boolean;
  type?: TypeAnnotation;
  initializer?: Expr;
  location: SourceLocation;
}

export interface FnDeclStmt {
  kind: 'fnDecl';
  name: string;
  parameters: Parameter[];
  returnType?: TypeAnnotation;
  body: Stmt[];
  location: SourceLocation;
}

export interface IfStmt {
  kind: 'if';
  condition: Expr;
  consequent: Stmt[];
  alternate?: Stmt[];
  location: SourceLocation;
}

export interface ForStmt {
  kind: 'for';
  variable: string;
  iterable: Expr;
  body: Stmt[];
  location: SourceLocation;
}

export interface WhileStmt {
  kind: 'while';
  condition: Expr;
  body: Stmt[];
  location: SourceLocation;
}

export interface ReturnStmt {
  kind: 'return';
  value?: Expr;
  location: SourceLocation;
}

export interface BreakStmt {
  kind: 'break';
  location: SourceLocation;
}

export interface ContinueStmt {
  kind: 'continue';
  location: SourceLocation;
}

export interface ImportStmt {
  kind: 'import';
  names: string[];
  source: string;
  location: SourceLocation;
}

export interface SeedBlock {
  kind:
    | 'identity'
    | 'structure'
    | 'appearance'
    | 'motion'
    | 'ability'
    | 'behavior'
    | 'evolution'
    | 'fields'
    | 'interaction'
    | 'metadata';
  entries: Array<{ key: string; value: Expr }>;
}

export interface SeedDeclStmt {
  kind: 'seedDecl';
  name: string;
  domain?: string;
  parent?: string;
  blocks: SeedBlock[];
  location: SourceLocation;
}

export interface CompositionStmt {
  kind: 'composition';
  name: string;
  operation: 'breed' | 'mutate' | 'compose' | 'evolve' | 'graft';
  arguments: Expr[];
  location: SourceLocation;
}

// -- GSPL 5.0: Living World Declarations --

export interface WorldDeclStmt {
  kind: 'worldDecl';
  name: string;
  parent?: string;
  properties: Array<{ key: string; value: Expr }>;
  embeddedSeeds: SeedDeclStmt[];
  embeddedEntities: EntityDeclStmt[];
  location: SourceLocation;
}

export interface EntityDeclStmt {
  kind: 'entityDecl';
  name: string;
  parent?: string;
  components: SeedBlock[];
  instincts: InstinctBlock[];
  affinities: AffinityBlock[];
  location: SourceLocation;
}

export interface LawDeclStmt {
  kind: 'lawDecl';
  name: string;
  affects: string[];
  event: string;
  body: Array<{ key: string; value: Expr }>;
  location: SourceLocation;
}

export interface ObservationDeclStmt {
  kind: 'observationDecl';
  name: string;
  entries: Array<{ key: string; value: Expr }>;
  location: SourceLocation;
}

export interface InstinctBlock {
  kind: 'instinct';
  name: string;
  entries: Array<{ key: string; value: Expr }>;
}

export interface AffinityBlock {
  kind: 'affinity';
  name: string;
  entries: Array<{ key: string; value: Expr }>;
}

export type Stmt =
  | ExpressionStmt
  | VarDeclStmt
  | FnDeclStmt
  | IfStmt
  | ForStmt
  | WhileStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | ImportStmt
  | SeedDeclStmt
  | CompositionStmt
  | WorldDeclStmt
  | EntityDeclStmt
  | LawDeclStmt
  | ObservationDeclStmt;

export interface Program {
  kind: 'program';
  directives: Directive[];
  imports: ImportStmt[];
  declarations: (Stmt | SeedDeclStmt)[];
}

// ============================================================================
// LEXER
// ============================================================================

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;
  private column: number = 0;
  private startColumn: number = 0;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    return this.scanTokens();
  }

  scanTokens(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.startColumn = this.column;
      this.scanToken();
    }

    this.tokens.push(this.makeToken(TokenType.EOF, ''));
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();

    switch (c) {
      case '(':
        this.addToken(TokenType.LParen);
        break;
      case ')':
        this.addToken(TokenType.RParen);
        break;
      case '{':
        this.addToken(TokenType.LBrace);
        break;
      case '}':
        this.addToken(TokenType.RBrace);
        break;
      case '[':
        this.addToken(TokenType.LBracket);
        break;
      case ']':
        this.addToken(TokenType.RBracket);
        break;
      case ',':
        this.addToken(TokenType.Comma);
        break;
      case ';':
        this.addToken(TokenType.Semicolon);
        break;
      case '@':
        this.addToken(TokenType.At);
        break;
      case '~':
        this.addToken(TokenType.Tilde);
        break;

      case ':':
        if (this.match('=')) {
          this.addToken(TokenType.Eq);
        } else {
          this.addToken(TokenType.Colon);
        }
        break;

      case '+':
        if (this.match('=')) {
          this.addToken(TokenType.PlusEq);
        } else {
          this.addToken(TokenType.Plus);
        }
        break;

      case '-':
        if (this.match('>')) {
          this.addToken(TokenType.Arrow);
        } else if (this.match('=')) {
          this.addToken(TokenType.MinusEq);
        } else {
          this.addToken(TokenType.Minus);
        }
        break;

      case '*':
        if (this.match('*')) {
          this.addToken(TokenType.StarStar);
        } else if (this.match('=')) {
          this.addToken(TokenType.StarEq);
        } else {
          this.addToken(TokenType.Star);
        }
        break;

      case '/':
        if (this.match('/')) {
          while (this.peek() !== '\n' && !this.isAtEnd()) {
            this.advance();
          }
        } else if (this.match('*')) {
          this.blockComment();
        } else if (this.match('=')) {
          this.addToken(TokenType.SlashEq);
        } else {
          this.addToken(TokenType.Slash);
        }
        break;

      case '%':
        this.addToken(TokenType.Percent);
        break;

      case '<':
        if (this.match('<')) {
          this.addToken(TokenType.LtLt);
        } else if (this.match('=')) {
          this.addToken(TokenType.LtEq);
        } else {
          this.addToken(TokenType.Lt);
        }
        break;

      case '>':
        if (this.match('>')) {
          this.addToken(TokenType.GtGt);
        } else if (this.match('=')) {
          this.addToken(TokenType.GtEq);
        } else {
          this.addToken(TokenType.Gt);
        }
        break;

      case '=':
        if (this.match('=')) {
          this.addToken(TokenType.EqEq);
        } else if (this.match('>')) {
          this.addToken(TokenType.FatArrow);
        } else {
          this.addToken(TokenType.Eq);
        }
        break;

      case '!':
        if (this.match('=')) {
          this.addToken(TokenType.BangEq);
        } else {
          this.addToken(TokenType.Bang);
        }
        break;

      case '&':
        if (this.match('&')) {
          this.addToken(TokenType.And);
        } else {
          this.addToken(TokenType.Ampersand);
        }
        break;

      case '|':
        if (this.match('|')) {
          this.addToken(TokenType.Or);
        } else {
          this.addToken(TokenType.Pipe);
        }
        break;

      case '^':
        this.addToken(TokenType.Caret);
        break;

      case '.':
        if (this.match('.')) {
          if (this.match('.')) {
            this.addToken(TokenType.DotDotDot);
          } else {
            this.addToken(TokenType.DotDot);
          }
        } else if (this.match('?')) {
          this.addToken(TokenType.QuestionDot);
        } else if (this.isDigit(this.peek())) {
          this.number();
        } else {
          this.addToken(TokenType.Dot);
        }
        break;

      case '#':
        while (this.peek() !== '\n' && !this.isAtEnd()) {
          this.advance();
        }
        break;

      case '"':
        this.stringLiteral('"');
        break;

      case "'":
        this.stringLiteral("'");
        break;

      case ' ':
      case '\r':
      case '\t':
        break;

      case '\n':
        this.line += 1;
        this.column = 0;
        break;

      default:
        if (this.isDigit(c)) {
          this.current -= 1;
          this.column -= 1;
          this.number();
        } else if (this.isAlpha(c)) {
          this.current -= 1;
          this.column -= 1;
          this.identifier();
        } else {
          throw new Error(
            `Unexpected character '${c}' at line ${this.line}:${this.column}`,
          );
        }
    }
  }

  private stringLiteral(quote: string): void {
    const startLine = this.line;
    const startCol = this.startColumn;
    let hasInterpolation = false;
    const parts: Array<string | { isExpr: true; value: string }> = [];
    let currentPart = '';

    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === '\n') {
        this.line += 1;
        this.column = 0;
      }

      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n':
            currentPart += '\n';
            break;
          case 't':
            currentPart += '\t';
            break;
          case 'r':
            currentPart += '\r';
            break;
          case '\\':
            currentPart += '\\';
            break;
          case '"':
            currentPart += '"';
            break;
          case "'":
            currentPart += "'";
            break;
          default:
            currentPart += escaped;
        }
      } else if (this.peek() === '$' && this.peekNext() === '{') {
        hasInterpolation = true;
        if (currentPart.length > 0) {
          parts.push(currentPart);
          currentPart = '';
        }
        this.advance(); // $
        this.advance(); // {
        let exprSource = '';
        let braceDepth = 1;
        while (braceDepth > 0 && !this.isAtEnd()) {
          if (this.peek() === '{') {
            braceDepth += 1;
          } else if (this.peek() === '}') {
            braceDepth -= 1;
            if (braceDepth === 0) break;
          }
          exprSource += this.advance();
        }
        if (this.peek() === '}') {
          this.advance();
        }
        parts.push({ isExpr: true, value: exprSource });
      } else {
        currentPart += this.advance();
      }
    }

    if (currentPart.length > 0) {
      parts.push(currentPart);
    }

    if (this.isAtEnd()) {
      throw new Error(
        `Unterminated string starting at line ${startLine}:${startCol}`,
      );
    }

    this.advance(); // closing quote

    if (hasInterpolation) {
      this.tokens.push({
        type: TokenType.String,
        lexeme: this.source.substring(this.start, this.current),
        literal: { interpolated: true, parts },
        line: startLine,
        column: startCol,
        offset: this.start,
      });
    } else {
      const stringValue = typeof parts[0] === 'string' ? parts[0] : '';
      this.addToken(TokenType.String, stringValue);
    }
  }

  private number(): void {
    if (this.peek() === '0') {
      const next = this.peekNext();
      if (next === 'x' || next === 'X') {
        this.advance();
        this.advance();
        while (this.isHexDigit(this.peek())) {
          this.advance();
        }
        const hex = this.source.substring(this.start, this.current);
        this.addToken(TokenType.Number, parseInt(hex, 16));
        return;
      } else if (next === 'b' || next === 'B') {
        this.advance();
        this.advance();
        const binStart = this.current;
        while (this.peek() === '0' || this.peek() === '1') {
          this.advance();
        }
        const binDigits = this.source.substring(binStart, this.current);
        this.addToken(TokenType.Number, parseInt(binDigits, 2));
        return;
      } else if (next === 'o' || next === 'O') {
        this.advance();
        this.advance();
        const octStart = this.current;
        while (this.peek() >= '0' && this.peek() <= '7') {
          this.advance();
        }
        const octDigits = this.source.substring(octStart, this.current);
        this.addToken(TokenType.Number, parseInt(octDigits, 8));
        return;
      }
    }

    while (this.isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance();
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    if (this.peek() === 'e' || this.peek() === 'E') {
      const nextChar = this.peekNext();
      if (
        this.isDigit(nextChar) ||
        ((nextChar === '+' || nextChar === '-') &&
          this.isDigit(this.peekChar(2)))
      ) {
        this.advance();
        if (this.peek() === '+' || this.peek() === '-') {
          this.advance();
        }
        while (this.isDigit(this.peek())) {
          this.advance();
        }
      }
    }

    // Unit suffix (e.g., 2.0s, 30deg, 100xp)
    const unitStart = this.current;
    while (this.isAlpha(this.peek())) {
      this.advance();
    }

    const numStr = this.source.substring(this.start, unitStart);
    const unit = this.source.substring(unitStart, this.current);
    const value = parseFloat(numStr);

    if (unit) {
      this.tokens.push({
        type: TokenType.Number,
        lexeme: this.source.substring(this.start, this.current),
        literal: { value, unit },
        line: this.line,
        column: this.startColumn,
        offset: this.start,
      });
    } else {
      this.addToken(TokenType.Number, value);
    }
  }

  private identifier(): void {
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const text = this.source.substring(this.start, this.current);
    const type = KEYWORDS[text] ?? TokenType.Identifier;
    this.addToken(type, type === TokenType.Identifier ? text : null);
  }

  private blockComment(): void {
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      if (this.peek() === '/' && this.peekNext() === '*') {
        this.advance();
        this.advance();
        depth += 1;
      } else if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance();
        this.advance();
        depth -= 1;
      } else {
        if (this.peek() === '\n') {
          this.line += 1;
          this.column = 0;
        }
        this.advance();
      }
    }
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.current) !== expected) return false;
    this.current += 1;
    this.column += 1;
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source.charAt(this.current);
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return '\0';
    return this.source.charAt(this.current + 1);
  }

  private peekChar(offset: number): string {
    if (this.current + offset >= this.source.length) return '\0';
    return this.source.charAt(this.current + offset);
  }

  private advance(): string {
    const c = this.source.charAt(this.current);
    this.current += 1;
    this.column += 1;
    return c;
  }

  private addToken(type: TokenType, literal: unknown = null): void {
    const text = this.source.substring(this.start, this.current);
    this.tokens.push({
      type,
      lexeme: text,
      literal,
      line: this.line,
      column: this.startColumn,
      offset: this.start,
    });
  }

  private makeToken(type: TokenType, literal: unknown): Token {
    return {
      type,
      lexeme: this.source.substring(this.start, this.current),
      literal,
      line: this.line,
      column: this.startColumn,
      offset: this.start,
    };
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isHexDigit(c: string): boolean {
    return (
      this.isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
    );
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }
}

// ============================================================================
// PARSER
// ============================================================================

function isObjectWithValue(
  v: unknown,
): v is { value: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'value' in v &&
    typeof (v as { value: unknown }).value === 'number'
  );
}

function isInterpolatedLiteral(
  v: unknown,
): v is { interpolated: true; parts: Array<string | { value: string }> } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'interpolated' in v &&
    'parts' in v &&
    Array.isArray((v as { parts: unknown[] }).parts)
  );
}

export interface ParseError {
  message: string;
  location: SourceLocation;
}

export interface ParseResult {
  program: Program | null;
  errors: ParseError[];
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private errors: ParseError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ParseResult {
    const directives: Directive[] = [];
    const imports: ImportStmt[] = [];
    const declarations: (Stmt | SeedDeclStmt)[] = [];

    while (!this.isAtEnd()) {
      try {
        if (this.check(TokenType.At)) {
          this.advance();
          const nameTok = this.peek();
          let directiveName: string;
          if (
            nameTok.type === TokenType.Identifier ||
            nameTok.type === TokenType.Domain ||
            nameTok.type === TokenType.Evolution ||
            nameTok.type === TokenType.Import
          ) {
            directiveName = nameTok.lexeme;
            this.advance();
          } else {
            directiveName = this.consume(
              TokenType.Identifier,
              'Expected directive name',
            ).lexeme;
          }
          const args: unknown[] = [];
          while (
            !this.isAtEnd() &&
            !this.check(TokenType.Newline) &&
            !this.check(TokenType.EOF) &&
            (this.check(TokenType.Number) ||
              this.check(TokenType.String) ||
              this.check(TokenType.Identifier) ||
              this.check(TokenType.Boolean) ||
              this.check(TokenType.True) ||
              this.check(TokenType.False))
          ) {
            args.push(this.peek().literal ?? this.peek().lexeme);
            this.advance();
          }
          directives.push({
            name: directiveName,
            arguments: args.length > 0 ? args : undefined,
            location: this.makeLocation(this.previous().offset),
          });
        } else if (this.check(TokenType.Import)) {
          imports.push(this.importStatement());
        } else if (this.check(TokenType.Seed)) {
          declarations.push(this.seedDeclaration());
        } else if (this.check(TokenType.World)) {
          declarations.push(this.worldDeclaration());
        } else if (this.check(TokenType.Entity)) {
          declarations.push(this.entityDeclaration());
        } else if (this.check(TokenType.Law)) {
          declarations.push(this.lawDeclaration());
        } else if (this.check(TokenType.Observation)) {
          declarations.push(this.observationDeclaration());
        } else if (
          (this.check(TokenType.Evolve) ||
            this.check(TokenType.Compose) ||
            this.check(TokenType.Breed) ||
            this.check(TokenType.Mutate)) &&
          this.peekNext()?.type === TokenType.LBrace
        ) {
          const keyword = this.peek().lexeme;
          this.advance();
          this.consume(TokenType.LBrace, 'Expected {');
          const configEntries: Record<string, unknown> = {};
          while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
            const key = this.consume(
              TokenType.Identifier,
              'Expected key',
            ).lexeme;
            if (!this.match(TokenType.Eq) && !this.match(TokenType.Colon)) {
              this.errors.push({
                message: `Expected = or : after '${key}'`,
                location: this.makeLocation(this.peek().offset),
              });
              this.synchronize();
              continue;
            }
            const valTok = this.peek();
            let val: unknown;
            if (valTok.type === TokenType.Number) {
              val = valTok.literal;
              this.advance();
            } else if (valTok.type === TokenType.String) {
              val = valTok.literal;
              this.advance();
            } else if (valTok.type === TokenType.True) {
              val = true;
              this.advance();
            } else if (valTok.type === TokenType.False) {
              val = false;
              this.advance();
            } else {
              val = valTok.lexeme;
              this.advance();
            }
            configEntries[key] = val;
          }
          this.consume(TokenType.RBrace, 'Expected }');
          directives.push({
            name: keyword,
            arguments: [configEntries],
            location: this.makeLocation(this.previous().offset),
          });
        } else if (!this.isAtEnd()) {
          declarations.push(this.statement());
        }
      } catch (e) {
        const tok = this.peek();
        this.errors.push({
          message: e instanceof Error ? e.message : 'Unknown error',
          location:
            tok.offset > 0
              ? {
                  line: tok.line,
                  column: tok.column,
                  offset: tok.offset,
                  length: 1,
                }
              : { line: 0, column: 0, offset: 0, length: 0 },
        });
        this.synchronize();
      }
    }

    if (this.errors.length > 0) {
      return { program: null, errors: this.errors };
    }

    return {
      program: { kind: 'program', directives, imports, declarations },
      errors: [],
    };
  }

  private importStatement(): ImportStmt {
    const start = this.peek().offset;
    this.consume(TokenType.Import, 'Expected import');
    const names: string[] = [];

    names.push(this.consume(TokenType.Identifier, 'Expected identifier').lexeme);
    while (this.match(TokenType.Comma)) {
      names.push(
        this.consume(TokenType.Identifier, 'Expected identifier').lexeme,
      );
    }

    this.consume(TokenType.From, 'Expected from');
    const source = this.consume(TokenType.String, 'Expected string').lexeme;

    this.consumeOptional(TokenType.Semicolon);

    return { kind: 'import', names, source, location: this.makeLocation(start) };
  }

  private seedDeclaration(): SeedDeclStmt {
    const start = this.peek().offset;
    this.consume(TokenType.Seed, 'Expected seed');
    const name = this.consume(TokenType.Identifier, 'Expected seed name').lexeme;

    let domain: string | undefined;
    let parent: string | undefined;

    if (this.match(TokenType.Colon)) {
      domain = this.consume(TokenType.Identifier, 'Expected domain').lexeme;
    }

    if (this.match(TokenType.Extends)) {
      parent = this.consume(
        TokenType.Identifier,
        'Expected parent seed name',
      ).lexeme;
    }

    this.consume(TokenType.LBrace, 'Expected {');

    const blocks: SeedBlock[] = [];
    const BLOCK_TYPES = [
      'identity',
      'structure',
      'appearance',
      'motion',
      'ability',
      'behavior',
      'evolution',
      'fields',
      'interaction',
      'metadata',
    ];

    const flatEntries: Array<{ key: string; value: Expr }> = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const blockType = this.peek().lexeme as SeedBlock['kind'];
      if (
        BLOCK_TYPES.includes(blockType) &&
        this.peekNext()?.type === TokenType.LBrace
      ) {
        this.advance();
        this.consume(TokenType.LBrace, 'Expected {');

        const entries: Array<{ key: string; value: Expr }> = [];

        while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
          const key = this.consume(TokenType.Identifier, 'Expected key').lexeme;
          if (!this.match(TokenType.Colon)) {
            this.consume(TokenType.Eq, 'Expected : or =');
          }
          const value = this.expression();
          entries.push({ key, value });
          this.match(TokenType.Comma);
        }

        this.consume(TokenType.RBrace, 'Expected }');
        blocks.push({ kind: blockType, entries });
      } else if (this.check(TokenType.Identifier)) {
        const key = this.consume(TokenType.Identifier, 'Expected key').lexeme;
        if (!this.match(TokenType.Colon) && !this.match(TokenType.Eq)) {
          this.errors.push({
            message: `Expected : or = after key '${key}'`,
            location: this.makeLocation(this.peek().offset),
          });
          this.synchronize();
          continue;
        }
        const value = this.expression();
        flatEntries.push({ key, value });
        this.match(TokenType.Comma);
      } else {
        break;
      }
    }

    if (flatEntries.length > 0) {
      blocks.push({ kind: 'fields', entries: flatEntries });
    }

    this.consume(TokenType.RBrace, 'Expected }');

    return {
      kind: 'seedDecl',
      name,
      domain,
      parent,
      blocks,
      location: this.makeLocation(start),
    };
  }

  private statement(): Stmt {
    if (this.match(TokenType.Const)) {
      return this.variableDeclaration(false);
    }

    if (this.match(TokenType.Let)) {
      return this.variableDeclaration(true);
    }

    if (this.match(TokenType.Fn)) {
      return this.functionDeclaration();
    }

    if (this.match(TokenType.If)) {
      return this.ifStatement();
    }

    if (this.match(TokenType.While)) {
      return this.whileStatement();
    }

    if (this.match(TokenType.For)) {
      return this.forStatement();
    }

    if (this.match(TokenType.Return)) {
      return this.returnStatement();
    }

    if (this.match(TokenType.Break)) {
      const start = this.previous().offset;
      this.consumeOptional(TokenType.Semicolon);
      return { kind: 'break', location: this.makeLocation(start) };
    }

    if (this.match(TokenType.Continue)) {
      const start = this.previous().offset;
      this.consumeOptional(TokenType.Semicolon);
      return { kind: 'continue', location: this.makeLocation(start) };
    }

    if (
      this.check(TokenType.Breed) ||
      this.check(TokenType.Mutate) ||
      this.check(TokenType.Evolve) ||
      this.check(TokenType.Compose) ||
      this.check(TokenType.Graft)
    ) {
      return this.compositionStatement();
    }

    return this.expressionStatement();
  }

  private variableDeclaration(mutable: boolean): VarDeclStmt {
    const start = this.previous().offset;
    const name = this.consume(
      TokenType.Identifier,
      'Expected variable name',
    ).lexeme;

    let type: TypeAnnotation | undefined;
    if (this.match(TokenType.Colon)) {
      type = this.typeAnnotation();
    }

    let initializer: Expr | undefined;
    if (this.match(TokenType.Eq)) {
      initializer = this.expression();
    }

    this.consumeOptional(TokenType.Semicolon);

    return {
      kind: 'varDecl',
      name,
      mutable,
      type,
      initializer,
      location: this.makeLocation(start),
    };
  }

  private functionDeclaration(): FnDeclStmt {
    const start = this.previous().offset;
    const name = this.consume(
      TokenType.Identifier,
      'Expected function name',
    ).lexeme;

    this.consume(TokenType.LParen, 'Expected (');
    const parameters = this.parameterList();
    this.consume(TokenType.RParen, 'Expected )');

    let returnType: TypeAnnotation | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.typeAnnotation();
    }

    this.consume(TokenType.LBrace, 'Expected {');
    const body = this.block();
    this.consume(TokenType.RBrace, 'Expected }');

    return {
      kind: 'fnDecl',
      name,
      parameters,
      returnType,
      body,
      location: this.makeLocation(start),
    };
  }

  private ifStatement(): IfStmt {
    const start = this.previous().offset;
    this.consume(TokenType.LParen, 'Expected (');
    const condition = this.expression();
    this.consume(TokenType.RParen, 'Expected )');

    this.consume(TokenType.LBrace, 'Expected {');
    const consequent = this.block();
    this.consume(TokenType.RBrace, 'Expected }');

    let alternate: Stmt[] | undefined;
    if (this.match(TokenType.Else)) {
      if (this.match(TokenType.If)) {
        alternate = [this.ifStatement()];
      } else {
        this.consume(TokenType.LBrace, 'Expected {');
        alternate = this.block();
        this.consume(TokenType.RBrace, 'Expected }');
      }
    }

    return {
      kind: 'if',
      condition,
      consequent,
      alternate,
      location: this.makeLocation(start),
    };
  }

  private whileStatement(): WhileStmt {
    const start = this.previous().offset;
    this.consume(TokenType.LParen, 'Expected (');
    const condition = this.expression();
    this.consume(TokenType.RParen, 'Expected )');

    this.consume(TokenType.LBrace, 'Expected {');
    const body = this.block();
    this.consume(TokenType.RBrace, 'Expected }');

    return { kind: 'while', condition, body, location: this.makeLocation(start) };
  }

  private forStatement(): ForStmt {
    const start = this.previous().offset;
    this.consume(TokenType.LParen, 'Expected (');
    const variable = this.consume(
      TokenType.Identifier,
      'Expected variable',
    ).lexeme;
    this.consume(TokenType.In, 'Expected in');
    const iterable = this.expression();
    this.consume(TokenType.RParen, 'Expected )');

    this.consume(TokenType.LBrace, 'Expected {');
    const body = this.block();
    this.consume(TokenType.RBrace, 'Expected }');

    return {
      kind: 'for',
      variable,
      iterable,
      body,
      location: this.makeLocation(start),
    };
  }

  private returnStatement(): ReturnStmt {
    const start = this.previous().offset;
    let value: Expr | undefined;

    if (
      !this.check(TokenType.Semicolon) &&
      !this.check(TokenType.RBrace) &&
      !this.isAtEnd()
    ) {
      value = this.expression();
    }

    this.consumeOptional(TokenType.Semicolon);

    return { kind: 'return', value, location: this.makeLocation(start) };
  }

  // -- GSPL 5.0: Living World Parsers --

  private worldDeclaration(): WorldDeclStmt {
    const start = this.peek().offset;
    this.consume(TokenType.World, 'Expected world');

    const name =
      this.peek().type === TokenType.String
        ? (this.advance().literal as string)
        : this.consume(TokenType.Identifier, 'Expected world name').lexeme;

    let parent: string | undefined;
    if (this.match(TokenType.Extends)) {
      parent = this.consume(TokenType.Identifier, 'Expected parent name').lexeme;
    }

    this.consume(TokenType.LBrace, 'Expected {');

    const properties: Array<{ key: string; value: Expr }> = [];
    const embeddedSeeds: SeedDeclStmt[] = [];
    const embeddedEntities: EntityDeclStmt[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.Seed)) {
        embeddedSeeds.push(this.seedDeclaration());
      } else if (this.check(TokenType.Entity)) {
        embeddedEntities.push(this.entityDeclaration());
      } else {
        const key = this.consume(
          TokenType.Identifier,
          'Expected property name',
        ).lexeme;
        if (this.match(TokenType.Colon) || this.match(TokenType.Eq)) {
          const value = this.expression();
          properties.push({ key, value });
        }
        this.match(TokenType.Comma) || this.match(TokenType.Semicolon);
      }
    }

    this.consume(TokenType.RBrace, 'Expected }');

    return {
      kind: 'worldDecl',
      name,
      parent,
      properties,
      embeddedSeeds,
      embeddedEntities,
      location: this.makeLocation(start),
    };
  }

  private entityDeclaration(): EntityDeclStmt {
    const start = this.peek().offset;
    this.consume(TokenType.Entity, 'Expected entity');

    const name =
      this.peek().type === TokenType.String
        ? (this.advance().literal as string)
        : this.consume(TokenType.Identifier, 'Expected entity name').lexeme;

    let parent: string | undefined;
    if (this.match(TokenType.Colon) || this.match(TokenType.Extends)) {
      parent =
        this.peek().type === TokenType.String
          ? (this.advance().literal as string)
          : this.consume(TokenType.Identifier, 'Expected parent').lexeme;
    }

    this.consume(TokenType.LBrace, 'Expected {');

    const components: SeedBlock[] = [];
    const instincts: InstinctBlock[] = [];
    const affinities: AffinityBlock[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.Instinct)) {
        this.advance();
        const instName =
          this.peek().type === TokenType.String
            ? (this.advance().literal as string)
            : this.consume(TokenType.Identifier, 'Expected instinct name')
                .lexeme;
        this.consume(TokenType.LBrace, 'Expected {');
        const entries: Array<{ key: string; value: Expr }> = [];
        while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
          const key = this.consume(TokenType.Identifier, 'Expected key').lexeme;
          if (this.match(TokenType.Colon) || this.match(TokenType.Eq)) {
            entries.push({ key, value: this.expression() });
          }
          this.match(TokenType.Comma) || this.match(TokenType.Semicolon);
        }
        this.consume(TokenType.RBrace, 'Expected }');
        instincts.push({ kind: 'instinct', name: instName, entries });
      } else if (this.check(TokenType.Affinity)) {
        this.advance();
        const affName =
          this.peek().type === TokenType.String
            ? (this.advance().literal as string)
            : this.consume(TokenType.Identifier, 'Expected affinity name')
                .lexeme;
        this.consume(TokenType.LBrace, 'Expected {');
        const entries: Array<{ key: string; value: Expr }> = [];
        while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
          const key = this.consume(TokenType.Identifier, 'Expected key').lexeme;
          if (this.match(TokenType.Colon) || this.match(TokenType.Eq)) {
            entries.push({ key, value: this.expression() });
          }
          this.match(TokenType.Comma) || this.match(TokenType.Semicolon);
        }
        this.consume(TokenType.RBrace, 'Expected }');
        affinities.push({ kind: 'affinity', name: affName, entries });
      } else {
        const blockName = this.consume(
          TokenType.Identifier,
          'Expected component name',
        ).lexeme;
        this.consume(TokenType.LBrace, 'Expected {');
        const entries: Array<{ key: string; value: Expr }> = [];
        while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
          const key = this.consume(TokenType.Identifier, 'Expected key').lexeme;
          if (this.match(TokenType.Colon) || this.match(TokenType.Eq)) {
            entries.push({ key, value: this.expression() });
          }
          this.match(TokenType.Comma) || this.match(TokenType.Semicolon);
        }
        this.consume(TokenType.RBrace, 'Expected }');
        components.push({
          kind: blockName as SeedBlock['kind'],
          entries,
        });
      }
    }

    this.consume(TokenType.RBrace, 'Expected }');

    return {
      kind: 'entityDecl',
      name,
      parent,
      components,
      instincts,
      affinities,
      location: this.makeLocation(start),
    };
  }

  private lawDeclaration(): LawDeclStmt {
    const start = this.peek().offset;
    this.consume(TokenType.Law, 'Expected law');

    const name =
      this.peek().type === TokenType.String
        ? (this.advance().literal as string)
        : this.consume(TokenType.Identifier, 'Expected law name').lexeme;

    this.consume(TokenType.LBrace, 'Expected {');

    const affects: string[] = [];
    let event = 'frame';
    const body: Array<{ key: string; value: Expr }> = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const key = this.consume(TokenType.Identifier, 'Expected key').lexeme;
      if (this.match(TokenType.Colon) || this.match(TokenType.Eq)) {
        if (key === 'affects') {
          if (this.match(TokenType.LBracket)) {
            while (!this.check(TokenType.RBracket) && !this.isAtEnd()) {
              const target =
                this.peek().type === TokenType.String
                  ? (this.advance().literal as string)
                  : this.advance().lexeme;
              affects.push(target);
              this.match(TokenType.Comma);
            }
            this.consume(TokenType.RBracket, 'Expected ]');
          } else {
            affects.push(this.advance().lexeme);
          }
        } else if (key === 'every' || key === 'on') {
          event = this.advance().lexeme;
        } else {
          body.push({ key, value: this.expression() });
        }
      }
      this.match(TokenType.Comma) || this.match(TokenType.Semicolon);
    }

    this.consume(TokenType.RBrace, 'Expected }');

    return {
      kind: 'lawDecl',
      name,
      affects,
      event,
      body,
      location: this.makeLocation(start),
    };
  }

  private observationDeclaration(): ObservationDeclStmt {
    const start = this.peek().offset;
    this.consume(TokenType.Observation, 'Expected observation');

    const name =
      this.peek().type === TokenType.String
        ? (this.advance().literal as string)
        : this.consume(TokenType.Identifier, 'Expected observation name')
            .lexeme;

    this.consume(TokenType.LBrace, 'Expected {');

    const entries: Array<{ key: string; value: Expr }> = [];
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const key = this.consume(TokenType.Identifier, 'Expected key').lexeme;
      if (this.match(TokenType.Colon) || this.match(TokenType.Eq)) {
        entries.push({ key, value: this.expression() });
      }
      this.match(TokenType.Comma) || this.match(TokenType.Semicolon);
    }

    this.consume(TokenType.RBrace, 'Expected }');

    return {
      kind: 'observationDecl',
      name,
      entries,
      location: this.makeLocation(start),
    };
  }

  private compositionStatement(): CompositionStmt {
    const start = this.peek().offset;
    let operation: CompositionStmt['operation'] = 'breed';

    if (this.match(TokenType.Breed)) operation = 'breed';
    else if (this.match(TokenType.Mutate)) operation = 'mutate';
    else if (this.match(TokenType.Evolve)) operation = 'evolve';
    else if (this.match(TokenType.Compose)) operation = 'compose';
    else if (this.match(TokenType.Graft)) operation = 'graft';

    const name = this.consume(TokenType.Identifier, 'Expected name').lexeme;
    this.consume(TokenType.Eq, 'Expected =');

    this.consume(TokenType.LParen, 'Expected (');
    const args: Expr[] = [];
    if (!this.check(TokenType.RParen)) {
      args.push(this.expression());
      while (this.match(TokenType.Comma)) {
        args.push(this.expression());
      }
    }
    this.consume(TokenType.RParen, 'Expected )');

    this.consumeOptional(TokenType.Semicolon);

    return {
      kind: 'composition',
      name,
      operation,
      arguments: args,
      location: this.makeLocation(start),
    };
  }

  private expressionStatement(): ExpressionStmt {
    const start = this.peek().offset;
    const expr = this.expression();
    this.consumeOptional(TokenType.Semicolon);

    return {
      kind: 'expressionStmt',
      expression: expr,
      location: this.makeLocation(start),
    };
  }

  // -- Expression parsing (Pratt precedence climbing) --

  expression(): Expr {
    return this.assignment();
  }

  private assignment(): Expr {
    const expr = this.ternary();

    if (
      this.match(
        TokenType.Eq,
        TokenType.PlusEq,
        TokenType.MinusEq,
        TokenType.StarEq,
        TokenType.SlashEq,
      )
    ) {
      const operator = this.previous().type;
      const value = this.assignment();

      if (operator === TokenType.Eq) {
        return {
          kind: 'assignment',
          target: expr,
          operator,
          value,
          location: this.getExprLocation(expr),
        };
      } else {
        const OP_MAP: Record<string, '+=' | '-=' | '*=' | '/='> = {
          [TokenType.PlusEq]: '+=',
          [TokenType.MinusEq]: '-=',
          [TokenType.StarEq]: '*=',
          [TokenType.SlashEq]: '/=',
        };
        const operatorStr = OP_MAP[operator];
        if (!operatorStr) {
          throw new Error(
            `Unknown assignment operator at line ${this.peek().line}`,
          );
        }
        return {
          kind: 'update',
          target: expr,
          operator: operatorStr,
          location: this.getExprLocation(expr),
        };
      }
    }

    return expr;
  }

  private ternary(): Expr {
    return this.logicalOr();
  }

  private logicalOr(): Expr {
    let expr = this.logicalAnd();

    while (this.match(TokenType.Or)) {
      const operator = this.previous().type;
      const right = this.logicalAnd();
      expr = {
        kind: 'binary',
        left: expr,
        operator,
        right,
        location: this.getExprLocation(expr),
      };
    }

    return expr;
  }

  private logicalAnd(): Expr {
    let expr = this.equality();

    while (this.match(TokenType.And)) {
      const operator = this.previous().type;
      const right = this.equality();
      expr = {
        kind: 'binary',
        left: expr,
        operator,
        right,
        location: this.getExprLocation(expr),
      };
    }

    return expr;
  }

  private equality(): Expr {
    let expr = this.comparison();

    while (this.match(TokenType.EqEq, TokenType.BangEq)) {
      const operator = this.previous().type;
      const right = this.comparison();
      expr = {
        kind: 'binary',
        left: expr,
        operator,
        right,
        location: this.getExprLocation(expr),
      };
    }

    return expr;
  }

  private comparison(): Expr {
    let expr = this.additive();

    while (
      this.match(TokenType.Lt, TokenType.Gt, TokenType.LtEq, TokenType.GtEq)
    ) {
      const operator = this.previous().type;
      const right = this.additive();
      expr = {
        kind: 'binary',
        left: expr,
        operator,
        right,
        location: this.getExprLocation(expr),
      };
    }

    return expr;
  }

  private additive(): Expr {
    let expr = this.multiplicative();

    while (this.match(TokenType.Plus, TokenType.Minus)) {
      const operator = this.previous().type;
      const right = this.multiplicative();
      expr = {
        kind: 'binary',
        left: expr,
        operator,
        right,
        location: this.getExprLocation(expr),
      };
    }

    return expr;
  }

  private multiplicative(): Expr {
    let expr = this.exponential();

    while (this.match(TokenType.Star, TokenType.Slash, TokenType.Percent)) {
      const operator = this.previous().type;
      const right = this.exponential();
      expr = {
        kind: 'binary',
        left: expr,
        operator,
        right,
        location: this.getExprLocation(expr),
      };
    }

    return expr;
  }

  private exponential(): Expr {
    let expr = this.unary();

    if (this.match(TokenType.StarStar)) {
      const right = this.exponential(); // Right-associative
      expr = {
        kind: 'binary',
        left: expr,
        operator: TokenType.StarStar,
        right,
        location: this.getExprLocation(expr),
      };
    }

    return expr;
  }

  private unary(): Expr {
    if (
      this.match(
        TokenType.Bang,
        TokenType.Minus,
        TokenType.Plus,
        TokenType.Tilde,
      )
    ) {
      const operator = this.previous().type;
      const expr = this.unary();
      return {
        kind: 'unary',
        operator,
        operand: expr,
        location: {
          line: this.previous().line,
          column: this.previous().column,
          offset: this.previous().offset,
          length: 1,
        },
      };
    }

    return this.postfix();
  }

  private postfix(): Expr {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.LParen)) {
        const args: Expr[] = [];
        if (!this.check(TokenType.RParen)) {
          args.push(this.expression());
          while (this.match(TokenType.Comma)) {
            args.push(this.expression());
          }
        }
        this.consume(TokenType.RParen, 'Expected )');

        expr = {
          kind: 'call',
          callee: expr,
          arguments: args,
          location: this.getExprLocation(expr),
        };
      } else if (this.match(TokenType.Dot)) {
        const property = this.consume(
          TokenType.Identifier,
          'Expected property',
        ).lexeme;
        expr = {
          kind: 'member',
          object: expr,
          property,
          computed: false,
          location: this.getExprLocation(expr),
        };
      } else if (this.match(TokenType.LBracket)) {
        const index = this.expression();
        this.consume(TokenType.RBracket, 'Expected ]');

        expr = {
          kind: 'index',
          object: expr,
          index,
          location: this.getExprLocation(expr),
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private primary(): Expr {
    const start = this.peek().offset;

    if (this.match(TokenType.True)) {
      return { kind: 'literal', value: true, location: this.makeLocation(start) };
    }

    if (this.match(TokenType.False)) {
      return {
        kind: 'literal',
        value: false,
        location: this.makeLocation(start),
      };
    }

    if (this.match(TokenType.Null)) {
      return {
        kind: 'literal',
        value: null,
        location: this.makeLocation(start),
      };
    }

    if (this.match(TokenType.Number)) {
      const literal = this.previous().literal;
      const value = isObjectWithValue(literal) ? literal.value : Number(literal);
      return { kind: 'literal', value, location: this.makeLocation(start) };
    }

    if (this.match(TokenType.String)) {
      const token = this.previous();
      const literal = token.literal;
      if (isInterpolatedLiteral(literal)) {
        const parts: Array<
          { isExpr: false; value: string } | { isExpr: true; expr: Expr }
        > = [];
        const items = literal.parts;
        for (const item of items) {
          if (typeof item === 'string') {
            parts.push({ isExpr: false as const, value: item });
          } else {
            // Parse the interpolated expression inline (no require())
            const lexer = new Lexer(item.value);
            const tokens = lexer.scanTokens();
            const parser = new Parser(tokens);
            const expr = parser.expression();
            parts.push({ isExpr: true as const, expr });
          }
        }
        return {
          kind: 'templateString',
          parts,
          location: this.makeLocation(start),
        };
      }
      return {
        kind: 'literal',
        value: String(literal || token.lexeme.slice(1, -1)),
        location: this.makeLocation(start),
      };
    }

    // Array literal
    if (this.match(TokenType.LBracket)) {
      const elements: Expr[] = [];
      if (!this.check(TokenType.RBracket)) {
        elements.push(this.expression());
        while (this.match(TokenType.Comma)) {
          if (this.check(TokenType.RBracket)) break;
          elements.push(this.expression());
        }
      }
      this.consume(TokenType.RBracket, 'Expected ]');

      return { kind: 'array', elements, location: this.makeLocation(start) };
    }

    // Object literal
    if (this.match(TokenType.LBrace)) {
      const properties: Array<{ key: string; value: Expr }> = [];
      if (!this.check(TokenType.RBrace)) {
        do {
          const key = this.consume(
            TokenType.Identifier,
            'Expected key',
          ).lexeme;
          this.consume(TokenType.Colon, 'Expected :');
          const value = this.expression();
          properties.push({ key, value });
        } while (this.match(TokenType.Comma) && !this.check(TokenType.RBrace));
      }
      this.consume(TokenType.RBrace, 'Expected }');

      return { kind: 'object', properties, location: this.makeLocation(start) };
    }

    // Function expression
    if (this.match(TokenType.Fn)) {
      this.consume(TokenType.LParen, 'Expected (');
      const parameters = this.parameterList();
      this.consume(TokenType.RParen, 'Expected )');

      let returnType: TypeAnnotation | undefined;
      if (this.match(TokenType.Arrow)) {
        returnType = this.typeAnnotation();
      }

      this.consume(TokenType.LBrace, 'Expected {');
      const body = this.block();
      this.consume(TokenType.RBrace, 'Expected }');

      return {
        kind: 'function',
        parameters,
        body,
        returnType,
        location: this.makeLocation(start),
      };
    }

    // Parenthesized expression
    if (this.match(TokenType.LParen)) {
      const expr = this.expression();
      this.consume(TokenType.RParen, 'Expected )');
      return expr;
    }

    // Identifier
    if (this.match(TokenType.Identifier)) {
      const name = this.previous().lexeme;
      return { kind: 'identifier', name, location: this.makeLocation(start) };
    }

    throw new Error(`Unexpected token: ${this.peek().lexeme}`);
  }

  private block(): Stmt[] {
    const statements: Stmt[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      statements.push(this.statement());
    }

    return statements;
  }

  private parameterList(): Parameter[] {
    const parameters: Parameter[] = [];

    if (!this.check(TokenType.RParen)) {
      do {
        const name = this.consume(
          TokenType.Identifier,
          'Expected parameter name',
        ).lexeme;
        let type: TypeAnnotation | undefined;
        if (this.match(TokenType.Colon)) {
          type = this.typeAnnotation();
        }
        parameters.push({ name, type });
      } while (this.match(TokenType.Comma));
    }

    return parameters;
  }

  private typeAnnotation(): TypeAnnotation {
    const name = this.consume(
      TokenType.Identifier,
      'Expected type name',
    ).lexeme;
    const generic: TypeAnnotation[] = [];

    if (this.match(TokenType.Lt)) {
      generic.push(this.typeAnnotation());
      while (this.match(TokenType.Comma)) {
        generic.push(this.typeAnnotation());
      }
      this.consume(TokenType.Gt, 'Expected >');
    }

    const nullable = this.match(TokenType.Bang);

    return {
      name,
      generic: generic.length > 0 ? generic : undefined,
      nullable,
    };
  }

  // -- Helpers --

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current += 1;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    const token = this.tokens[this.current];
    if (!token) {
      const lastToken = this.tokens[this.tokens.length - 1];
      if (!lastToken) {
        throw new Error('No tokens available');
      }
      return lastToken;
    }
    return token;
  }

  private peekNext(): Token | undefined {
    return this.tokens[this.current + 1];
  }

  private previous(): Token {
    const token = this.tokens[this.current - 1];
    if (!token) {
      const firstToken = this.tokens[0];
      if (!firstToken) {
        throw new Error('No tokens available');
      }
      return firstToken;
    }
    return token;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(
      `${message} at line ${this.peek().line}:${this.peek().column}`,
    );
  }

  private consumeOptional(type: TokenType): void {
    if (this.check(type)) {
      this.advance();
    }
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.Semicolon) return;

      if (
        [
          TokenType.Seed,
          TokenType.Fn,
          TokenType.Let,
          TokenType.Const,
          TokenType.If,
          TokenType.For,
          TokenType.While,
          TokenType.Return,
        ].includes(this.peek().type)
      ) {
        return;
      }

      this.advance();
    }
  }

  private makeLocation(start: number): SourceLocation {
    const current = this.previous();
    return {
      line: current.line,
      column: current.column,
      offset: start,
      length: current.offset + current.lexeme.length - start,
    };
  }

  private getExprLocation(expr: Expr): SourceLocation {
    return expr.location;
  }
}

// ============================================================================
// SERIALIZER
// ============================================================================

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  [TokenType.Or]: 1,
  [TokenType.And]: 2,
  [TokenType.EqEq]: 3,
  [TokenType.BangEq]: 3,
  [TokenType.Lt]: 4,
  [TokenType.Gt]: 4,
  [TokenType.LtEq]: 4,
  [TokenType.GtEq]: 4,
  [TokenType.Plus]: 5,
  [TokenType.Minus]: 5,
  [TokenType.Star]: 6,
  [TokenType.Slash]: 6,
  [TokenType.Percent]: 6,
  [TokenType.StarStar]: 7,
};

function binaryOpToString(op: TokenType): string {
  switch (op) {
    case TokenType.Plus:
      return '+';
    case TokenType.Minus:
      return '-';
    case TokenType.Star:
      return '*';
    case TokenType.Slash:
      return '/';
    case TokenType.Percent:
      return '%';
    case TokenType.StarStar:
      return '**';
    case TokenType.Lt:
      return '<';
    case TokenType.Gt:
      return '>';
    case TokenType.LtEq:
      return '<=';
    case TokenType.GtEq:
      return '>=';
    case TokenType.EqEq:
      return '==';
    case TokenType.BangEq:
      return '!=';
    case TokenType.And:
      return '&&';
    case TokenType.Or:
      return '||';
    default:
      return String(op);
  }
}

function unaryOpToString(op: TokenType): string {
  switch (op) {
    case TokenType.Bang:
      return '!';
    case TokenType.Minus:
      return '-';
    case TokenType.Plus:
      return '+';
    case TokenType.Tilde:
      return '~';
    default:
      return String(op);
  }
}

function getSerializerPrecedence(op: TokenType): number {
  return BINARY_PRECEDENCE[op] ?? 0;
}

function serializeChildWithPrecedence(
  child: Expr,
  parentPrecedence: number,
  isRight: boolean,
): string {
  if (child.kind === 'binary') {
    const childPrec = getSerializerPrecedence(child.operator);
    const needsParens =
      childPrec < parentPrecedence ||
      (childPrec === parentPrecedence && isRight);
    if (needsParens) {
      return `(${serializeExpr(child)})`;
    }
  }
  return serializeExpr(child);
}

export function serializeExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'literal': {
      if (expr.value === null) return 'null';
      if (typeof expr.value === 'boolean') return expr.value ? 'true' : 'false';
      if (typeof expr.value === 'string')
        return `"${expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      if (typeof expr.value === 'number') return String(expr.value);
      return String(expr.value);
    }

    case 'identifier':
      return expr.name;

    case 'binary': {
      const prec = getSerializerPrecedence(expr.operator);
      const leftStr = serializeChildWithPrecedence(expr.left, prec, false);
      const rightStr = serializeChildWithPrecedence(expr.right, prec, true);
      const opStr = binaryOpToString(expr.operator);
      return `${leftStr} ${opStr} ${rightStr}`;
    }

    case 'unary': {
      const operandStr = serializeExpr(expr.operand);
      const opStr = unaryOpToString(expr.operator);
      if (expr.operand.kind === 'binary') {
        return `${opStr}(${operandStr})`;
      }
      return `${opStr}${operandStr}`;
    }

    case 'member': {
      const objStr = serializeExpr(expr.object);
      if (expr.computed) {
        return `${objStr}["${expr.property}"]`;
      }
      return `${objStr}.${expr.property}`;
    }

    case 'index': {
      const objStr = serializeExpr(expr.object);
      const idxStr = serializeExpr(expr.index);
      return `${objStr}[${idxStr}]`;
    }

    case 'call': {
      const calleeStr = serializeExpr(expr.callee);
      const argsStr = expr.arguments.map((a) => serializeExpr(a)).join(', ');
      return `${calleeStr}(${argsStr})`;
    }

    case 'ternary': {
      const condStr = serializeExpr(expr.condition);
      const consStr = serializeExpr(expr.consequent);
      const altStr = serializeExpr(expr.alternate);
      return `${condStr} ? ${consStr} : ${altStr}`;
    }

    case 'array': {
      const elemStr = expr.elements.map((e) => serializeExpr(e)).join(', ');
      return `[${elemStr}]`;
    }

    case 'object': {
      const propsStr = expr.properties
        .map((p) => `${p.key}: ${serializeExpr(p.value)}`)
        .join(', ');
      return `{${propsStr}}`;
    }

    case 'templateString': {
      let result = '"';
      for (const part of expr.parts) {
        if (part.isExpr) {
          result += `\${${serializeExpr(part.expr)}}`;
        } else {
          result += part.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        }
      }
      result += '"';
      return result;
    }

    case 'range': {
      const startStr = serializeExpr(expr.start);
      const endStr = serializeExpr(expr.end);
      return `${startStr}..${endStr}`;
    }

    case 'spread':
      return `...${serializeExpr(expr.expr)}`;

    case 'assignment': {
      const targetStr = serializeExpr(expr.target);
      const valueStr = serializeExpr(expr.value);
      return `${targetStr} = ${valueStr}`;
    }

    case 'update': {
      const targetStr = serializeExpr(expr.target);
      return `${targetStr} ${expr.operator}`;
    }

    case 'function': {
      const paramsStr = expr.parameters
        .map((p) => {
          if (p.type) {
            return `${p.name}: ${p.type.name}`;
          }
          return p.name;
        })
        .join(', ');
      return `fn(${paramsStr}) { /* body */ }`;
    }

    case 'seedRef':
      return expr.name;

    case 'geneAccess': {
      const seedStr = serializeExpr(expr.seed);
      return `${seedStr}.${expr.genePath.join('.')}`;
    }

    default: {
      return String((expr as { kind: string }).kind);
    }
  }
}

// ============================================================================
// CONVENIENCE: parseGSPL (.gspl file format)
// ============================================================================

export interface GSPLSeed {
  name: string;
  domain: string;
  genes: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface GSPLProgram {
  errors: string[];
  version?: string;
  domain?: string;
  ecosystem?: string;
  evolution?: {
    generations?: number;
    mutationRate?: number;
    [key: string]: unknown;
  };
  seeds: GSPLSeed[];
}

export function parseGSPL(source: string): GSPLProgram {
  const errors: string[] = [];
  let version: string | undefined;
  let domain: string | undefined;
  let ecosystem: string | undefined;
  let evolution: GSPLProgram['evolution'] | undefined;
  const seeds: GSPLSeed[] = [];

  const lines = source.split('\n');
  let i = 0;

  const skipWhitespace = (): void => {
    while (i < lines.length && lines[i]!.trim() === '') {
      i++;
    }
  };

  const parseBraceBlock = (): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    i++;
    while (i < lines.length) {
      const line = lines[i]!.trim();
      if (line === '}') {
        i++;
        return result;
      }
      const m = line.match(/^(\w+)\s*[:=]\s*(.+)$/);
      if (m) {
        const key = m[1]!;
        let val: unknown = m[2]!.trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val))
          val = parseFloat(val);
        else if (
          typeof val === 'string' &&
          val.startsWith('"') &&
          val.endsWith('"')
        )
          val = val.slice(1, -1);
        else if (
          typeof val === 'string' &&
          val.startsWith("'") &&
          val.endsWith("'")
        )
          val = val.slice(1, -1);
        result[key] = val;
      }
      i++;
    }
    return result;
  };

  while (i < lines.length) {
    skipWhitespace();
    if (i >= lines.length) break;
    const line = lines[i]!.trim();

    if (line.startsWith('@gseed')) {
      version = line.replace('@gseed', '').trim();
      i++;
    } else if (line.startsWith('@domain')) {
      domain = line.replace('@domain', '').trim();
      i++;
    } else if (line.startsWith('@ecosystem')) {
      ecosystem = line.replace('@ecosystem', '').trim();
      i++;
    } else if (line.startsWith('evolve')) {
      const raw = parseBraceBlock();
      evolution = {};
      for (const [key, val] of Object.entries(raw)) {
        if (key === 'mutation_rate') {
          evolution.mutationRate = val as number;
        } else if (key === 'generations') {
          evolution.generations = val as number;
        } else {
          evolution[key] = val;
        }
      }
    } else if (line.startsWith('seed ')) {
      const nameMatch = line.match(/^seed\s+(\w+)/);
      const seedName = nameMatch ? nameMatch[1]! : 'unknown';
      const raw = parseBraceBlock();
      const genes: Record<string, unknown> = {};
      const metadata: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(raw)) {
        if (key.startsWith('meta_')) {
          metadata[key.replace('meta_', '')] = val;
        } else {
          genes[key] = val;
        }
      }
      seeds.push({
        name: seedName,
        domain: domain ?? 'unknown',
        genes,
        metadata,
      });
    } else {
      i++;
    }
  }

  return { errors, version, domain, ecosystem, evolution, seeds };
}
