import { describe, it, expect } from 'vitest';
import {
  TokenType,
  KEYWORDS,
  Lexer,
  Parser,
  serializeExpr,
  parseGSPL,
} from './index.js';
import type {
  Token,
  Expr,
  BinaryExpr,
  LiteralExpr,
  IdentifierExpr,
  Program,
  SeedDeclStmt,
  WorldDeclStmt,
  EntityDeclStmt,
  LawDeclStmt,
  ObservationDeclStmt,
  VarDeclStmt,
  FnDeclStmt,
  IfStmt,
  ForStmt,
  WhileStmt,
  CompositionStmt,
  ImportStmt,
} from './index.js';

// ─────────────────────────────────────────────
// Helper: lex + parse convenience
// ─────────────────────────────────────────────

function lex(source: string): Token[] {
  return new Lexer(source).tokenize();
}

function parse(source: string): Program {
  const tokens = lex(source);
  const result = new Parser(tokens).parse();
  if (result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join('\n'));
  }
  return result.program!;
}

// ─────────────────────────────────────────────
// LEXER TESTS
// ─────────────────────────────────────────────

describe('Lexer', () => {
  it('tokenizes single-character tokens', () => {
    const tokens = lex('( ) { } [ ] , ; @ ~');
    const types = tokens.map((t) => t.type).filter((t) => t !== TokenType.EOF);
    expect(types).toEqual([
      TokenType.LParen,
      TokenType.RParen,
      TokenType.LBrace,
      TokenType.RBrace,
      TokenType.LBracket,
      TokenType.RBracket,
      TokenType.Comma,
      TokenType.Semicolon,
      TokenType.At,
      TokenType.Tilde,
    ]);
  });

  it('tokenizes multi-character operators', () => {
    const tokens = lex('== != <= >= && || ** .. ... += -= *= /= => ->');
    const types = tokens.map((t) => t.type).filter((t) => t !== TokenType.EOF);
    expect(types).toEqual([
      TokenType.EqEq,
      TokenType.BangEq,
      TokenType.LtEq,
      TokenType.GtEq,
      TokenType.And,
      TokenType.Or,
      TokenType.StarStar,
      TokenType.DotDot,
      TokenType.DotDotDot,
      TokenType.PlusEq,
      TokenType.MinusEq,
      TokenType.StarEq,
      TokenType.SlashEq,
      TokenType.FatArrow,
      TokenType.Arrow,
    ]);
  });

  it('tokenizes basic operators', () => {
    const tokens = lex('+ - * / % < > = ! & | ^ << >>');
    const types = tokens.map((t) => t.type).filter((t) => t !== TokenType.EOF);
    expect(types).toEqual([
      TokenType.Plus,
      TokenType.Minus,
      TokenType.Star,
      TokenType.Slash,
      TokenType.Percent,
      TokenType.Lt,
      TokenType.Gt,
      TokenType.Eq,
      TokenType.Bang,
      TokenType.Ampersand,
      TokenType.Pipe,
      TokenType.Caret,
      TokenType.LtLt,
      TokenType.GtGt,
    ]);
  });

  it('tokenizes integer literals', () => {
    const tokens = lex('42 0 100');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.map((t) => t.literal)).toEqual([42, 0, 100]);
  });

  it('tokenizes float literals', () => {
    const tokens = lex('3.14 0.5 1.0');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.map((t) => t.literal)).toEqual([3.14, 0.5, 1.0]);
  });

  it('tokenizes hex, binary, and octal literals', () => {
    const tokens = lex('0xFF 0b1010 0o77');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.map((t) => t.literal)).toEqual([255, 10, 63]);
  });

  it('tokenizes exponent literals', () => {
    const tokens = lex('1e10 2.5E-3 3e+2');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.map((t) => t.literal)).toEqual([1e10, 2.5e-3, 3e2]);
  });

  it('tokenizes numbers with unit suffixes', () => {
    const tokens = lex('2.0s 30deg');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums[0]!.literal).toEqual({ value: 2.0, unit: 's' });
    expect(nums[1]!.literal).toEqual({ value: 30, unit: 'deg' });
  });

  it('tokenizes string literals with escapes', () => {
    const tokens = lex('"hello\\nworld"');
    const str = tokens.find((t) => t.type === TokenType.String);
    expect(str!.literal).toBe('hello\nworld');
  });

  it('tokenizes single-quoted strings', () => {
    const tokens = lex("'hello'");
    const str = tokens.find((t) => t.type === TokenType.String);
    expect(str!.literal).toBe('hello');
  });

  it('tokenizes string interpolation', () => {
    const tokens = lex('"hello ${name}!"');
    const str = tokens.find((t) => t.type === TokenType.String);
    expect((str!.literal as { interpolated: boolean }).interpolated).toBe(true);
  });

  it('tokenizes all 42 keywords', () => {
    expect(Object.keys(KEYWORDS).length).toBe(42);
    const keywordTokens = lex('seed world entity law if else for while fn return let const');
    const types = keywordTokens.map((t) => t.type).filter((t) => t !== TokenType.EOF);
    expect(types).toContain(TokenType.Seed);
    expect(types).toContain(TokenType.World);
    expect(types).toContain(TokenType.If);
    expect(types).toContain(TokenType.Fn);
  });

  it('tokenizes identifiers', () => {
    const tokens = lex('myVar _private camelCase');
    const ids = tokens.filter((t) => t.type === TokenType.Identifier);
    expect(ids.map((t) => t.lexeme)).toEqual(['myVar', '_private', 'camelCase']);
  });

  it('skips line comments', () => {
    const tokens = lex('42 // this is a comment\n43');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.length).toBe(2);
  });

  it('skips hash comments', () => {
    const tokens = lex('42 # hash comment\n43');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.length).toBe(2);
  });

  it('skips block comments', () => {
    const tokens = lex('42 /* block */ 43');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.length).toBe(2);
  });

  it('skips nested block comments', () => {
    const tokens = lex('42 /* outer /* inner */ still outer */ 43');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums.length).toBe(2);
  });

  it('tokenizes colon-equals as Eq', () => {
    const tokens = lex(':=');
    expect(tokens[0]!.type).toBe(TokenType.Eq);
  });

  it('tokenizes dot followed by digit as number', () => {
    const tokens = lex('.5');
    const nums = tokens.filter((t) => t.type === TokenType.Number);
    expect(nums[0]!.literal).toBe(0.5);
  });

  it('tokenizes QuestionDot', () => {
    const tokens = lex('.?');
    expect(tokens[0]!.type).toBe(TokenType.QuestionDot);
  });

  it('throws on unexpected characters', () => {
    expect(() => lex('`')).toThrow('Unexpected character');
  });

  it('throws on unterminated strings', () => {
    expect(() => lex('"unterminated')).toThrow('Unterminated string');
  });

  it('tracks line and column numbers', () => {
    const tokens = lex('x\ny');
    const x = tokens.find((t) => t.lexeme === 'x');
    const y = tokens.find((t) => t.lexeme === 'y');
    expect(x!.line).toBe(1);
    expect(y!.line).toBe(2);
  });

  it('handles boolean literals via keywords', () => {
    const tokens = lex('true false');
    expect(tokens[0]!.type).toBe(TokenType.True);
    expect(tokens[1]!.type).toBe(TokenType.False);
  });

  it('handles null literal via keyword', () => {
    const tokens = lex('null');
    expect(tokens[0]!.type).toBe(TokenType.Null);
  });

  it('tokenizes escape sequences in strings', () => {
    const tokens = lex('"\\t\\r\\\\"');
    const str = tokens.find((t) => t.type === TokenType.String);
    expect(str!.literal).toBe('\t\r\\');
  });

  it('tokenizes escaped quotes in strings', () => {
    const tokens = lex('"say \\"hello\\""');
    const str = tokens.find((t) => t.type === TokenType.String);
    expect(str!.literal).toBe('say "hello"');
  });
});

// ─────────────────────────────────────────────
// PARSER TESTS
// ─────────────────────────────────────────────

describe('Parser', () => {
  describe('expressions', () => {
    it('parses number literals', () => {
      const prog = parse('42;');
      const stmt = prog.declarations[0]!;
      expect(stmt.kind).toBe('expressionStmt');
      const expr = (stmt as { expression: Expr }).expression as LiteralExpr;
      expect(expr.kind).toBe('literal');
      expect(expr.value).toBe(42);
    });

    it('parses string literals', () => {
      const prog = parse('"hello";');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as LiteralExpr;
      expect(expr.value).toBe('hello');
    });

    it('parses boolean literals', () => {
      const prog = parse('true;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as LiteralExpr;
      expect(expr.value).toBe(true);
    });

    it('parses null literal', () => {
      const prog = parse('null;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as LiteralExpr;
      expect(expr.value).toBe(null);
    });

    it('parses binary expressions', () => {
      const prog = parse('1 + 2;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as BinaryExpr;
      expect(expr.kind).toBe('binary');
      expect(expr.operator).toBe(TokenType.Plus);
    });

    it('parses operator precedence: * before +', () => {
      const prog = parse('1 + 2 * 3;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as BinaryExpr;
      expect(expr.operator).toBe(TokenType.Plus);
      expect((expr.right as BinaryExpr).operator).toBe(TokenType.Star);
    });

    it('parses exponentiation as right-associative', () => {
      const prog = parse('2 ** 3 ** 4;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as BinaryExpr;
      expect(expr.operator).toBe(TokenType.StarStar);
      expect((expr.right as BinaryExpr).operator).toBe(TokenType.StarStar);
    });

    it('parses unary expressions', () => {
      const prog = parse('-x;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression;
      expect(expr.kind).toBe('unary');
    });

    it('parses call expressions', () => {
      const prog = parse('foo(1, 2);');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression;
      expect(expr.kind).toBe('call');
    });

    it('parses member access', () => {
      const prog = parse('obj.prop;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression;
      expect(expr.kind).toBe('member');
    });

    it('parses index access', () => {
      const prog = parse('arr[0];');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression;
      expect(expr.kind).toBe('index');
    });

    it('parses array literals', () => {
      const prog = parse('[1, 2, 3];');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression;
      expect(expr.kind).toBe('array');
    });

    it('parses empty arrays', () => {
      const prog = parse('[];');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      expect(stmt.expression.kind).toBe('array');
    });

    it('parses object literals', () => {
      const prog = parse('{x: 1, y: 2};');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression;
      expect(expr.kind).toBe('object');
    });

    it('parses parenthesized expressions', () => {
      const prog = parse('(1 + 2) * 3;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as BinaryExpr;
      expect(expr.operator).toBe(TokenType.Star);
      expect((expr.left as BinaryExpr).operator).toBe(TokenType.Plus);
    });

    it('parses function expressions in assignment', () => {
      const prog = parse('let callback = fn(x, y) { return x; };');
      const decl = prog.declarations[0]! as VarDeclStmt;
      expect(decl.initializer!.kind).toBe('function');
    });

    it('parses assignment expressions', () => {
      const prog = parse('x = 5;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      expect(stmt.expression.kind).toBe('assignment');
    });

    it('parses compound assignment (+=)', () => {
      const prog = parse('x += 1;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      expect(stmt.expression.kind).toBe('update');
    });

    it('parses compound assignment (-=, *=, /=)', () => {
      for (const op of ['-=', '*=', '/=']) {
        const prog = parse(`x ${op} 2;`);
        const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
        expect(stmt.expression.kind).toBe('update');
      }
    });

    it('parses logical operators', () => {
      const prog = parse('a && b || c;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as BinaryExpr;
      expect(expr.operator).toBe(TokenType.Or);
    });

    it('parses comparison operators', () => {
      const prog = parse('a < b;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as BinaryExpr;
      expect(expr.operator).toBe(TokenType.Lt);
    });

    it('parses equality operators', () => {
      const prog = parse('a == b;');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      const expr = stmt.expression as BinaryExpr;
      expect(expr.operator).toBe(TokenType.EqEq);
    });

    it('parses chained member access and calls', () => {
      const prog = parse('a.b.c(1);');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      expect(stmt.expression.kind).toBe('call');
    });

    it('parses trailing comma in arrays', () => {
      const prog = parse('[1, 2,];');
      const stmt = prog.declarations[0]! as { expression: Expr; kind: string };
      expect(stmt.expression.kind).toBe('array');
    });
  });

  describe('statements', () => {
    it('parses const declaration', () => {
      const prog = parse('const x = 5;');
      const decl = prog.declarations[0]! as VarDeclStmt;
      expect(decl.kind).toBe('varDecl');
      expect(decl.mutable).toBe(false);
      expect(decl.name).toBe('x');
    });

    it('parses let declaration', () => {
      const prog = parse('let y = 10;');
      const decl = prog.declarations[0]! as VarDeclStmt;
      expect(decl.kind).toBe('varDecl');
      expect(decl.mutable).toBe(true);
    });

    it('parses typed variable declaration', () => {
      const prog = parse('let x: Number = 5;');
      const decl = prog.declarations[0]! as VarDeclStmt;
      expect(decl.type!.name).toBe('Number');
    });

    it('parses function declaration', () => {
      const prog = parse('fn add(a, b) { return a + b; }');
      const decl = prog.declarations[0]! as FnDeclStmt;
      expect(decl.kind).toBe('fnDecl');
      expect(decl.name).toBe('add');
      expect(decl.parameters.length).toBe(2);
    });

    it('parses function with return type', () => {
      const prog = parse('fn foo() -> Number { return 1; }');
      const decl = prog.declarations[0]! as FnDeclStmt;
      expect(decl.returnType!.name).toBe('Number');
    });

    it('parses function with typed parameters', () => {
      const prog = parse('fn foo(x: Number, y: String) { return x; }');
      const decl = prog.declarations[0]! as FnDeclStmt;
      expect(decl.parameters[0]!.type!.name).toBe('Number');
      expect(decl.parameters[1]!.type!.name).toBe('String');
    });

    it('parses if statement', () => {
      const prog = parse('if (x) { y; }');
      const stmt = prog.declarations[0]! as IfStmt;
      expect(stmt.kind).toBe('if');
      expect(stmt.consequent.length).toBe(1);
    });

    it('parses if-else', () => {
      const prog = parse('if (x) { y; } else { z; }');
      const stmt = prog.declarations[0]! as IfStmt;
      expect(stmt.alternate!.length).toBe(1);
    });

    it('parses else-if chains', () => {
      const prog = parse('if (a) { b; } else if (c) { d; }');
      const stmt = prog.declarations[0]! as IfStmt;
      expect(stmt.alternate!.length).toBe(1);
      expect(stmt.alternate![0]!.kind).toBe('if');
    });

    it('parses while loop', () => {
      const prog = parse('while (x) { y; }');
      const stmt = prog.declarations[0]! as WhileStmt;
      expect(stmt.kind).toBe('while');
    });

    it('parses for-in loop', () => {
      const prog = parse('for (item in list) { item; }');
      const stmt = prog.declarations[0]! as ForStmt;
      expect(stmt.kind).toBe('for');
      expect(stmt.variable).toBe('item');
    });

    it('parses return statement', () => {
      const prog = parse('fn foo() { return 42; }');
      const fn = prog.declarations[0]! as FnDeclStmt;
      expect(fn.body[0]!.kind).toBe('return');
    });

    it('parses break and continue', () => {
      const prog = parse('while (true) { break; continue; }');
      const wh = prog.declarations[0]! as WhileStmt;
      expect(wh.body[0]!.kind).toBe('break');
      expect(wh.body[1]!.kind).toBe('continue');
    });

    it('parses import statement', () => {
      const prog = parse('import foo from "bar";');
      expect(prog.imports.length).toBe(1);
      expect(prog.imports[0]!.names).toEqual(['foo']);
    });

    it('parses multi-name imports', () => {
      const prog = parse('import a, b, c from "lib";');
      expect(prog.imports[0]!.names).toEqual(['a', 'b', 'c']);
    });
  });

  describe('seed declarations', () => {
    it('parses basic seed', () => {
      const prog = parse('seed Warrior { health = 100 }');
      const seed = prog.declarations[0]! as SeedDeclStmt;
      expect(seed.kind).toBe('seedDecl');
      expect(seed.name).toBe('Warrior');
      expect(seed.blocks.length).toBe(1);
    });

    it('parses seed with domain', () => {
      const prog = parse('seed Dragon: organism { health = 200 }');
      const seed = prog.declarations[0]! as SeedDeclStmt;
      expect(seed.domain).toBe('organism');
    });

    it('parses seed with extends', () => {
      const prog = parse('seed FireDragon: organism extends Dragon { fire = true }');
      const seed = prog.declarations[0]! as SeedDeclStmt;
      expect(seed.parent).toBe('Dragon');
    });

    it('parses seed with named blocks', () => {
      const prog = parse(`seed Knight {
        identity {
          name = "Sir Lancelot"
        }
        fields {
          health = 100
        }
      }`);
      const seed = prog.declarations[0]! as SeedDeclStmt;
      expect(seed.blocks.length).toBe(2);
      expect(seed.blocks[0]!.kind).toBe('identity');
      expect(seed.blocks[1]!.kind).toBe('fields');
    });

    it('parses seed with colon-separated values', () => {
      const prog = parse('seed Test { x: 1, y: 2 }');
      const seed = prog.declarations[0]! as SeedDeclStmt;
      expect(seed.blocks[0]!.entries.length).toBe(2);
    });
  });

  describe('GSPL 5.0: Living World syntax', () => {
    it('parses world declaration', () => {
      const prog = parse(`world Forest {
        biome = "temperate"
      }`);
      const world = prog.declarations[0]! as WorldDeclStmt;
      expect(world.kind).toBe('worldDecl');
      expect(world.name).toBe('Forest');
      expect(world.properties.length).toBe(1);
    });

    it('parses world with embedded seeds', () => {
      const prog = parse(`world Cave {
        seed Bat { wings = 2 }
      }`);
      const world = prog.declarations[0]! as WorldDeclStmt;
      expect(world.embeddedSeeds.length).toBe(1);
    });

    it('parses world with extends', () => {
      const prog = parse(`world DarkForest extends Forest {
        light = 0
      }`);
      const world = prog.declarations[0]! as WorldDeclStmt;
      expect(world.parent).toBe('Forest');
    });

    it('parses entity declaration', () => {
      const prog = parse(`entity Wolf {
        stats {
          speed: 8
          strength: 6
        }
      }`);
      const entity = prog.declarations[0]! as EntityDeclStmt;
      expect(entity.kind).toBe('entityDecl');
      expect(entity.name).toBe('Wolf');
      expect(entity.components.length).toBe(1);
    });

    it('parses entity with instincts', () => {
      const prog = parse(`entity Wolf {
        instinct hunt {
          trigger = "hungry"
          action = "chase"
        }
      }`);
      const entity = prog.declarations[0]! as EntityDeclStmt;
      expect(entity.instincts.length).toBe(1);
      expect(entity.instincts[0]!.name).toBe('hunt');
    });

    it('parses entity with affinities', () => {
      const prog = parse(`entity Wolf {
        affinity pack {
          strength = 2
        }
      }`);
      const entity = prog.declarations[0]! as EntityDeclStmt;
      expect(entity.affinities.length).toBe(1);
      expect(entity.affinities[0]!.name).toBe('pack');
    });

    it('parses entity with extends', () => {
      const prog = parse(`entity AlphaWolf extends Wolf {
        stats {
          leadership: 10
        }
      }`);
      const entity = prog.declarations[0]! as EntityDeclStmt;
      expect(entity.parent).toBe('Wolf');
    });

    it('parses entity with colon parent', () => {
      const prog = parse(`entity AlphaWolf: Wolf {
        stats {
          leadership: 10
        }
      }`);
      const entity = prog.declarations[0]! as EntityDeclStmt;
      expect(entity.parent).toBe('Wolf');
    });

    it('parses law declaration', () => {
      const prog = parse(`law Gravity {
        affects = [Wolf, Bat]
        every = frame
        force = 9.8
      }`);
      const law = prog.declarations[0]! as LawDeclStmt;
      expect(law.kind).toBe('lawDecl');
      expect(law.name).toBe('Gravity');
      expect(law.affects).toContain('Wolf');
      expect(law.affects).toContain('Bat');
      expect(law.body.length).toBe(1);
    });

    it('parses law with single affects', () => {
      const prog = parse(`law Wind {
        affects = all
        on = tick
      }`);
      const law = prog.declarations[0]! as LawDeclStmt;
      expect(law.affects).toContain('all');
      expect(law.event).toBe('tick');
    });

    it('parses observation declaration', () => {
      const prog = parse(`observation Weather {
        temperature = 20
        humidity = 0.7
      }`);
      const obs = prog.declarations[0]! as ObservationDeclStmt;
      expect(obs.kind).toBe('observationDecl');
      expect(obs.name).toBe('Weather');
      expect(obs.entries.length).toBe(2);
    });
  });

  describe('composition statements', () => {
    it('parses breed', () => {
      const prog = parse('breed child = (parent1, parent2);');
      const comp = prog.declarations[0]! as CompositionStmt;
      expect(comp.kind).toBe('composition');
      expect(comp.operation).toBe('breed');
      expect(comp.name).toBe('child');
    });

    it('parses mutate', () => {
      const prog = parse('mutate evolved = (original);');
      const comp = prog.declarations[0]! as CompositionStmt;
      expect(comp.operation).toBe('mutate');
    });

    it('parses evolve', () => {
      const prog = parse('evolve result = (seed1);');
      const comp = prog.declarations[0]! as CompositionStmt;
      expect(comp.operation).toBe('evolve');
    });

    it('parses compose', () => {
      const prog = parse('compose merged = (a, b);');
      const comp = prog.declarations[0]! as CompositionStmt;
      expect(comp.operation).toBe('compose');
    });

    it('parses graft', () => {
      const prog = parse('graft hybrid = (base, donor);');
      const comp = prog.declarations[0]! as CompositionStmt;
      expect(comp.operation).toBe('graft');
    });
  });

  describe('directives', () => {
    it('parses @ directives', () => {
      const prog = parse('@strict\nseed Test { x = 1 }');
      expect(prog.directives.length).toBe(1);
      expect(prog.directives[0]!.name).toBe('strict');
    });

    it('parses directive with arguments', () => {
      const prog = parse('@domain organism\nseed Test { x = 1 }');
      expect(prog.directives[0]!.name).toBe('domain');
      expect(prog.directives[0]!.arguments).toContain('organism');
    });

    it('parses evolve config block as directive', () => {
      const tokens = lex('evolve { generations = 100 }');
      const result = new Parser(tokens).parse();
      expect(result.program!.directives.length).toBe(1);
    });
  });

  describe('error handling', () => {
    it('returns errors for invalid syntax', () => {
      const tokens = lex('seed { }');
      const result = new Parser(tokens).parse();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('synchronizes after errors', () => {
      const tokens = lex('let = 5; let y = 10;');
      const result = new Parser(tokens).parse();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('generic type annotations', () => {
    it('parses generic types', () => {
      const prog = parse('let x: Array<Number> = [];');
      const decl = prog.declarations[0]! as VarDeclStmt;
      expect(decl.type!.generic![0]!.name).toBe('Number');
    });

    it('parses nullable types', () => {
      const prog = parse('let x: Number! = null;');
      const decl = prog.declarations[0]! as VarDeclStmt;
      expect(decl.type!.nullable).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// SERIALIZER TESTS
// ─────────────────────────────────────────────

describe('serializeExpr', () => {
  const loc = { line: 1, column: 0, offset: 0, length: 1 };

  it('serializes number literals', () => {
    expect(serializeExpr({ kind: 'literal', value: 42, location: loc })).toBe('42');
  });

  it('serializes string literals', () => {
    expect(serializeExpr({ kind: 'literal', value: 'hello', location: loc })).toBe('"hello"');
  });

  it('serializes boolean literals', () => {
    expect(serializeExpr({ kind: 'literal', value: true, location: loc })).toBe('true');
    expect(serializeExpr({ kind: 'literal', value: false, location: loc })).toBe('false');
  });

  it('serializes null', () => {
    expect(serializeExpr({ kind: 'literal', value: null, location: loc })).toBe('null');
  });

  it('serializes identifiers', () => {
    expect(serializeExpr({ kind: 'identifier', name: 'x', location: loc })).toBe('x');
  });

  it('serializes binary with precedence', () => {
    const expr: Expr = {
      kind: 'binary',
      operator: TokenType.Plus,
      left: {
        kind: 'binary',
        operator: TokenType.Star,
        left: { kind: 'literal', value: 2, location: loc },
        right: { kind: 'literal', value: 3, location: loc },
        location: loc,
      },
      right: { kind: 'literal', value: 1, location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('2 * 3 + 1');
  });

  it('adds parens when child has lower precedence', () => {
    const expr: Expr = {
      kind: 'binary',
      operator: TokenType.Star,
      left: {
        kind: 'binary',
        operator: TokenType.Plus,
        left: { kind: 'literal', value: 1, location: loc },
        right: { kind: 'literal', value: 2, location: loc },
        location: loc,
      },
      right: { kind: 'literal', value: 3, location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('(1 + 2) * 3');
  });

  it('serializes unary expressions', () => {
    const expr: Expr = {
      kind: 'unary',
      operator: TokenType.Minus,
      operand: { kind: 'identifier', name: 'x', location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('-x');
  });

  it('wraps binary operand in unary with parens', () => {
    const expr: Expr = {
      kind: 'unary',
      operator: TokenType.Bang,
      operand: {
        kind: 'binary',
        operator: TokenType.And,
        left: { kind: 'identifier', name: 'a', location: loc },
        right: { kind: 'identifier', name: 'b', location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('!(a && b)');
  });

  it('serializes member access', () => {
    const expr: Expr = {
      kind: 'member',
      object: { kind: 'identifier', name: 'obj', location: loc },
      property: 'x',
      computed: false,
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('obj.x');
  });

  it('serializes computed member access', () => {
    const expr: Expr = {
      kind: 'member',
      object: { kind: 'identifier', name: 'obj', location: loc },
      property: 'key',
      computed: true,
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('obj["key"]');
  });

  it('serializes index access', () => {
    const expr: Expr = {
      kind: 'index',
      object: { kind: 'identifier', name: 'arr', location: loc },
      index: { kind: 'literal', value: 0, location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('arr[0]');
  });

  it('serializes call expressions', () => {
    const expr: Expr = {
      kind: 'call',
      callee: { kind: 'identifier', name: 'foo', location: loc },
      arguments: [
        { kind: 'literal', value: 1, location: loc },
        { kind: 'literal', value: 2, location: loc },
      ],
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('foo(1, 2)');
  });

  it('serializes array expressions', () => {
    const expr: Expr = {
      kind: 'array',
      elements: [
        { kind: 'literal', value: 1, location: loc },
        { kind: 'literal', value: 2, location: loc },
      ],
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('[1, 2]');
  });

  it('serializes object expressions', () => {
    const expr: Expr = {
      kind: 'object',
      properties: [{ key: 'x', value: { kind: 'literal', value: 1, location: loc } }],
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('{x: 1}');
  });

  it('serializes template strings', () => {
    const expr: Expr = {
      kind: 'templateString',
      parts: [
        { isExpr: false, value: 'hello ' },
        { isExpr: true, expr: { kind: 'identifier', name: 'name', location: loc } },
      ],
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('"hello ${name}"');
  });

  it('serializes range expressions', () => {
    const expr: Expr = {
      kind: 'range',
      start: { kind: 'literal', value: 1, location: loc },
      end: { kind: 'literal', value: 10, location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('1..10');
  });

  it('serializes spread expressions', () => {
    const expr: Expr = {
      kind: 'spread',
      expr: { kind: 'identifier', name: 'items', location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('...items');
  });

  it('serializes assignment', () => {
    const expr: Expr = {
      kind: 'assignment',
      target: { kind: 'identifier', name: 'x', location: loc },
      operator: TokenType.Eq,
      value: { kind: 'literal', value: 5, location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('x = 5');
  });

  it('serializes update expressions', () => {
    const expr: Expr = {
      kind: 'update',
      target: { kind: 'identifier', name: 'x', location: loc },
      operator: '+=',
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('x +=');
  });

  it('serializes function expressions', () => {
    const expr: Expr = {
      kind: 'function',
      parameters: [{ name: 'x' }, { name: 'y', type: { name: 'Number' } }],
      body: [],
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('fn(x, y: Number) { /* body */ }');
  });

  it('serializes seedRef', () => {
    const expr: Expr = { kind: 'seedRef', name: 'Dragon', location: loc };
    expect(serializeExpr(expr)).toBe('Dragon');
  });

  it('serializes geneAccess', () => {
    const expr: Expr = {
      kind: 'geneAccess',
      seed: { kind: 'identifier', name: 'dragon', location: loc },
      genePath: ['stats', 'health'],
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('dragon.stats.health');
  });

  it('serializes ternary expressions', () => {
    const expr: Expr = {
      kind: 'ternary',
      condition: { kind: 'identifier', name: 'x', location: loc },
      consequent: { kind: 'literal', value: 1, location: loc },
      alternate: { kind: 'literal', value: 2, location: loc },
      location: loc,
    };
    expect(serializeExpr(expr)).toBe('x ? 1 : 2');
  });

  it('serializes strings with special characters', () => {
    expect(serializeExpr({ kind: 'literal', value: 'say "hi"', location: loc })).toBe('"say \\"hi\\""');
  });

  it('serializes all binary operators', () => {
    const ops: [TokenType, string][] = [
      [TokenType.Plus, '+'],
      [TokenType.Minus, '-'],
      [TokenType.Star, '*'],
      [TokenType.Slash, '/'],
      [TokenType.Percent, '%'],
      [TokenType.StarStar, '**'],
      [TokenType.Lt, '<'],
      [TokenType.Gt, '>'],
      [TokenType.LtEq, '<='],
      [TokenType.GtEq, '>='],
      [TokenType.EqEq, '=='],
      [TokenType.BangEq, '!='],
      [TokenType.And, '&&'],
      [TokenType.Or, '||'],
    ];
    for (const [op, str] of ops) {
      const expr: BinaryExpr = {
        kind: 'binary',
        operator: op,
        left: { kind: 'identifier', name: 'a', location: loc },
        right: { kind: 'identifier', name: 'b', location: loc },
        location: loc,
      };
      expect(serializeExpr(expr)).toContain(str);
    }
  });

  it('serializes all unary operators', () => {
    const ops: [TokenType, string][] = [
      [TokenType.Bang, '!'],
      [TokenType.Minus, '-'],
      [TokenType.Plus, '+'],
      [TokenType.Tilde, '~'],
    ];
    for (const [op, str] of ops) {
      const expr: Expr = {
        kind: 'unary',
        operator: op,
        operand: { kind: 'identifier', name: 'x', location: loc },
        location: loc,
      };
      expect(serializeExpr(expr)).toContain(str);
    }
  });
});

// ─────────────────────────────────────────────
// parseGSPL (.gspl format) TESTS
// ─────────────────────────────────────────────

describe('parseGSPL', () => {
  it('parses directives and seeds', () => {
    const result = parseGSPL(`
@gseed 4.0
@domain organism

seed Dragon {
  health = 200
  fire = true
}
`);
    expect(result.version).toBe('4.0');
    expect(result.domain).toBe('organism');
    expect(result.seeds.length).toBe(1);
    expect(result.seeds[0]!.name).toBe('Dragon');
    expect(result.seeds[0]!.genes.health).toBe(200);
    expect(result.seeds[0]!.genes.fire).toBe(true);
  });

  it('parses evolution config', () => {
    const result = parseGSPL(`
evolve {
  generations = 100
  mutation_rate = 0.05
}
`);
    expect(result.evolution!.generations).toBe(100);
    expect(result.evolution!.mutationRate).toBe(0.05);
  });

  it('parses metadata prefixed keys', () => {
    const result = parseGSPL(`
@domain game

seed Item {
  damage = 10
  meta_author = "system"
}
`);
    expect(result.seeds[0]!.genes.damage).toBe(10);
    expect(result.seeds[0]!.metadata.author).toBe('system');
  });

  it('parses ecosystem directive', () => {
    const result = parseGSPL('@ecosystem forest');
    expect(result.ecosystem).toBe('forest');
  });

  it('parses string values in seeds', () => {
    const result = parseGSPL(`
@domain organism

seed Cat {
  name = "Whiskers"
  sound = 'meow'
}
`);
    expect(result.seeds[0]!.genes.name).toBe('Whiskers');
    expect(result.seeds[0]!.genes.sound).toBe('meow');
  });

  it('returns empty for empty input', () => {
    const result = parseGSPL('');
    expect(result.seeds.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('parses multiple seeds', () => {
    const result = parseGSPL(`
@domain organism

seed Cat {
  speed = 7
}

seed Dog {
  speed = 8
}
`);
    expect(result.seeds.length).toBe(2);
  });
});
