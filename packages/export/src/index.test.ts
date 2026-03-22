/**
 * Comprehensive test suite for @paradigm/export.
 *
 * Covers all 10 exporters (HTML, Markdown, JSON, Python, Rust, C#, GDScript,
 * GLSL, CSV, SVG) and the ExportEngine router. Targets 80%+ line coverage,
 * 70%+ branch coverage, 80%+ function coverage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HTMLExporter,
  MarkdownExporter,
  JSONExporter,
  PythonExporter,
  RustExporter,
  CSharpExporter,
  GDScriptExporter,
  GLSLExporter,
  CSVExporter,
  SVGExporter,
  ExportEngine,
  type ExportFormat,
  type ExportResult,
} from './index.js';
import type {
  UniversalSeed,
  ScalarGene,
  CategoricalGene,
  VectorGene,
  ExpressionGene,
  StructGene,
  ArrayGene,
  GraphGene,
  TensorGene,
  TimeSeriesGene,
  GeneMap,
  Gene,
} from '@paradigm/types';

// ─────────────────────────────────────────────
// Test Fixtures — manually constructed seeds
// ─────────────────────────────────────────────

function makeScalarGene(value: number, min = 0, max = 1): ScalarGene {
  return { type: 'scalar', value, min, max };
}

function makeCategoricalGene(value: string, options: string[]): CategoricalGene {
  return { type: 'categorical', value, options };
}

function makeVectorGene(value: number[], dimensions: number): VectorGene {
  return { type: 'vector', value, dimensions };
}

function makeExpressionGene(source: string): ExpressionGene {
  return { type: 'expression', source };
}

function makeStructGene(): StructGene {
  return {
    type: 'struct',
    value: {
      inner: makeScalarGene(0.5),
    },
  };
}

function makeArrayGene(): ArrayGene {
  return {
    type: 'array',
    value: [makeScalarGene(0.1), makeScalarGene(0.2)],
  };
}

function makeGraphGene(): GraphGene {
  const nodes = new Map<string, Gene>();
  nodes.set('a', makeScalarGene(1.0));
  nodes.set('b', makeScalarGene(2.0));
  return {
    type: 'graph',
    nodes,
    edges: [{ from: 'a', to: 'b', weight: makeScalarGene(0.5) }],
  };
}

function makeTensorGene(): TensorGene {
  return {
    type: 'tensor',
    data: new Float64Array([1.0, 2.0, 3.0, 4.0]),
    shape: [2, 2],
  };
}

function makeTimeSeriesGene(): TimeSeriesGene {
  return {
    type: 'timeseries',
    keyframes: [
      { t: 0, v: 0 },
      { t: 1, v: 1 },
      { t: 2, v: 0.5 },
    ],
    interpolation: 'linear',
  };
}

/** Build a minimal UniversalSeed by hand, avoiding the @paradigm/seed dependency. */
function buildSeed(
  name: string,
  domain: string,
  genes: GeneMap,
  overrides?: Partial<UniversalSeed>,
): UniversalSeed {
  const now = Date.now();
  const base: UniversalSeed = {
    $gst: '4.0',
    $domain: domain as UniversalSeed['$domain'],
    $name: name,
    $hash: 'abcdef0123456789',
    $lineage: {
      generation: 0,
      parents: [],
      timestamp: now,
    },
    genes,
    $metadata: {
      created: now,
    },
    $activation: {
      alive: true,
      active: true,
      energy: 100,
      age: 0,
    },
    $display: {},
  } as UniversalSeed;
  return { ...base, ...overrides } as UniversalSeed;
}

/** Creates a basic seed with scalar, categorical, vector, and expression genes. */
function makeBasicSeed(): UniversalSeed {
  return buildSeed('Test Warrior', 'organism', {
    health: makeScalarGene(0.85, 0, 1),
    species: makeCategoricalGene('dragon', ['dragon', 'wolf', 'eagle']),
    color: makeVectorGene([0.8, 0.2, 0.1], 3),
    behavior: makeExpressionGene('sin(t) * health'),
  });
}

/** Creates a seed with all 9 gene types. */
function makeFullSeed(): UniversalSeed {
  return buildSeed('Full Entity', 'creature', {
    strength: makeScalarGene(0.75, 0, 1),
    class: makeCategoricalGene('warrior', ['warrior', 'mage', 'rogue']),
    position: makeVectorGene([1.0, 2.0, 3.0], 3),
    formula: makeExpressionGene('x * 2 + y'),
    stats: makeStructGene(),
    layers: makeArrayGene(),
    network: makeGraphGene(),
    weights: makeTensorGene(),
    animation: makeTimeSeriesGene(),
  });
}

/** Creates a seed with fitness, metadata, and lineage populated. */
function makeDetailedSeed(): UniversalSeed {
  return buildSeed(
    'Test Warrior',
    'organism',
    {
      health: makeScalarGene(0.85, 0, 1),
      species: makeCategoricalGene('dragon', ['dragon', 'wolf', 'eagle']),
      color: makeVectorGene([0.8, 0.2, 0.1], 3),
      behavior: makeExpressionGene('sin(t) * health'),
    },
    {
      $fitness: { primary: 0.92, speed: 0.8, resilience: 0.95 },
      $metadata: {
        created: Date.now(),
        creator: 'unit-test',
        description: 'A detailed test seed',
        tags: ['test', 'warrior', 'v2'],
      },
      $lineage: {
        generation: 3,
        parents: [
          { id: 'parent-hash-1', name: 'Ancestor Alpha' },
          { id: 'parent-hash-2', name: 'Ancestor Beta' },
        ],
        breedingStrategy: 'uniform_crossover',
        mutationIntensity: 0.1234,
        timestamp: Date.now(),
      },
    },
  );
}

/** Creates a minimal seed with no genes. */
function makeEmptySeed(): UniversalSeed {
  return buildSeed('Empty Seed', 'simulation', {});
}

/** Creates a seed with a 4-component vector (for GLSL vec4 branch). */
function makeVec4Seed(): UniversalSeed {
  return buildSeed('Shader Seed', 'shader', {
    baseColor: makeVectorGene([1.0, 0.5, 0.2, 1.0], 4),
    intensity: makeScalarGene(0.7, 0, 1),
  });
}

/** Creates a seed with a 2-component vector (for GLSL vec2 branch). */
function makeVec2Seed(): UniversalSeed {
  return buildSeed('UV Seed', 'material', {
    offset: makeVectorGene([0.5, 0.3], 2),
    scale: makeScalarGene(1.5, 0, 10),
  });
}

/** Creates a seed whose name has HTML special characters. */
function makeSpecialCharSeed(): UniversalSeed {
  return buildSeed('Test <Seed> & "Quotes"', 'organism', {
    hp: makeScalarGene(0.5, 0, 1),
  });
}

/** Creates a seed with gene names that need sanitization. */
function makeUnsafeNameSeed(): UniversalSeed {
  return buildSeed('123 numeric start!', 'vehicle', {
    'my-gene': makeScalarGene(0.5, 0, 1),
    '3rd_value': makeScalarGene(0.3, 0, 1),
  });
}

// ─────────────────────────────────────────────
// HTMLExporter Tests
// ─────────────────────────────────────────────

describe('HTMLExporter', () => {
  let exporter: HTMLExporter;

  beforeEach(() => {
    exporter = new HTMLExporter();
  });

  it('should return ExportResult with format html', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('html');
    expect(result.mimeType).toBe('text/html');
    expect(result.filename).toMatch(/\.html$/);
  });

  it('should contain the seed name in the output', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('Test Warrior');
  });

  it('should contain DOCTYPE and html tags', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('<!DOCTYPE html>');
    expect(result.content).toContain('<html');
    expect(result.content).toContain('</html>');
  });

  it('should include gene names and types in table rows', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('health');
    expect(result.content).toContain('scalar');
    expect(result.content).toContain('species');
    expect(result.content).toContain('categorical');
  });

  it('should include gene values', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('0.8500');
    expect(result.content).toContain('dragon');
  });

  it('should render CSS styles', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('<style>');
    expect(result.content).toContain('</style>');
  });

  it('should include domain color from organism domain', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('#4caf50');
  });

  it('should include fitness percentage', () => {
    const result = exporter.export(makeDetailedSeed());
    expect(result.content).toContain('92%');
    expect(result.content).toContain('0.9200');
  });

  it('should render lineage section when present', () => {
    const result = exporter.export(makeDetailedSeed());
    expect(result.content).toContain('Lineage');
    expect(result.content).toContain('Generation');
    expect(result.content).toContain('Ancestor Alpha');
    expect(result.content).toContain('uniform_crossover');
    expect(result.content).toContain('0.1234');
  });

  it('should render metadata section when present', () => {
    const result = exporter.export(makeDetailedSeed());
    expect(result.content).toContain('Metadata');
    expect(result.content).toContain('unit-test');
    expect(result.content).toContain('A detailed test seed');
    expect(result.content).toContain('warrior');
  });

  it('should show "None (origin)" when no parents', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('None (origin)');
  });

  it('should escape HTML special characters', () => {
    const result = exporter.export(makeSpecialCharSeed());
    expect(result.content).toContain('&lt;Seed&gt;');
    expect(result.content).toContain('&amp;');
    expect(result.content).toContain('&quot;Quotes&quot;');
  });

  it('should produce safe filename', () => {
    const result = exporter.export(makeSpecialCharSeed());
    expect(result.filename).not.toContain('<');
    expect(result.filename).not.toContain('>');
    expect(result.filename).toMatch(/\.html$/);
  });

  it('should handle seed with no genes', () => {
    const result = exporter.export(makeEmptySeed());
    expect(result.content).toContain('Genes (0)');
  });

  it('should include GST version in footer', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('GST');
    expect(result.content).toContain('4.0');
  });

  it('should include fitness bar markup', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('fitness-bar');
    expect(result.content).toContain('Primary Fitness');
  });
});

// ─────────────────────────────────────────────
// MarkdownExporter Tests
// ─────────────────────────────────────────────

describe('MarkdownExporter', () => {
  let exporter: MarkdownExporter;

  beforeEach(() => {
    exporter = new MarkdownExporter();
  });

  it('should return ExportResult with format markdown', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('markdown');
    expect(result.mimeType).toBe('text/markdown');
    expect(result.filename).toMatch(/\.md$/);
  });

  it('should start with a heading containing seed name', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toMatch(/^# Test Warrior/);
  });

  it('should contain domain, hash, and GST version', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('**Domain:** organism');
    expect(result.content).toContain('**GST Version:** 4.0');
    expect(result.content).toContain('**Hash:**');
  });

  it('should include gene table with header row', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('## Genes');
    expect(result.content).toContain('| Name | Type | Value |');
    expect(result.content).toContain('|------|------|-------|');
  });

  it('should include gene rows', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('| health |');
    expect(result.content).toContain('`scalar`');
    expect(result.content).toContain('| species |');
    expect(result.content).toContain('`categorical`');
  });

  it('should include fitness section with keyed values', () => {
    const result = exporter.export(makeDetailedSeed());
    expect(result.content).toContain('## Fitness');
    expect(result.content).toContain('**primary:**');
    expect(result.content).toContain('**speed:**');
  });

  it('should include lineage section with parents', () => {
    const result = exporter.export(makeDetailedSeed());
    expect(result.content).toContain('## Lineage');
    expect(result.content).toContain('**Generation:** 3');
    expect(result.content).toContain('Ancestor Alpha');
    expect(result.content).toContain('**Breeding Strategy:** uniform_crossover');
    expect(result.content).toContain('**Mutation Intensity:** 0.1234');
  });

  it('should show "None (origin seed)" when no parents', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('None (origin seed)');
  });

  it('should include metadata section with creator and tags', () => {
    const result = exporter.export(makeDetailedSeed());
    expect(result.content).toContain('## Metadata');
    expect(result.content).toContain('**Creator:** unit-test');
    expect(result.content).toContain('**Tags:**');
  });

  it('should include description as blockquote', () => {
    const result = exporter.export(makeDetailedSeed());
    expect(result.content).toContain('> A detailed test seed');
  });

  it('should end with generated-by notice', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('*Generated by GSPL Paradigm*');
  });

  it('should handle empty genes', () => {
    const result = exporter.export(makeEmptySeed());
    expect(result.content).toContain('## Genes');
    expect(result.content).toContain('| Name | Type | Value |');
  });

  it('should include lineage timestamp', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('**Timestamp:**');
  });
});

// ─────────────────────────────────────────────
// JSONExporter Tests
// ─────────────────────────────────────────────

describe('JSONExporter', () => {
  let exporter: JSONExporter;

  beforeEach(() => {
    exporter = new JSONExporter();
  });

  it('should return ExportResult with format json', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('json');
    expect(result.mimeType).toBe('application/json');
    expect(result.filename).toMatch(/\.json$/);
  });

  it('should produce valid JSON', () => {
    const result = exporter.export(makeBasicSeed());
    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('should preserve seed fields', () => {
    const seed = makeBasicSeed();
    const result = exporter.export(seed);
    const parsed = JSON.parse(result.content);
    expect(parsed.$name).toBe('Test Warrior');
    expect(parsed.$domain).toBe('organism');
    expect(parsed.$gst).toBe('4.0');
  });

  it('should preserve gene data', () => {
    const result = exporter.export(makeBasicSeed());
    const parsed = JSON.parse(result.content);
    expect(parsed.genes.health.type).toBe('scalar');
    expect(parsed.genes.health.value).toBe(0.85);
    expect(parsed.genes.species.value).toBe('dragon');
  });

  it('should handle Map via custom replacer', () => {
    const seed = makeFullSeed();
    const result = exporter.export(seed);
    const parsed = JSON.parse(result.content);
    const network = parsed.genes.network;
    expect(network.nodes.__type).toBe('Map');
    expect(Array.isArray(network.nodes.entries)).toBe(true);
  });

  it('should handle Float64Array via custom replacer', () => {
    const seed = makeFullSeed();
    const result = exporter.export(seed);
    const parsed = JSON.parse(result.content);
    const weights = parsed.genes.weights;
    expect(weights.data.__type).toBe('Float64Array');
    expect(weights.data.data).toEqual([1, 2, 3, 4]);
  });

  it('should handle Set via custom replacer', () => {
    // Manually inject a Set into a seed to test Set serialization
    const seed = makeBasicSeed();
    (seed as Record<string, unknown>)['_testSet'] = new Set([1, 2, 3]);
    const result = exporter.export(seed);
    const parsed = JSON.parse(result.content);
    expect(parsed._testSet.__type).toBe('Set');
    expect(parsed._testSet.values).toEqual([1, 2, 3]);
  });

  it('should handle Float32Array via custom replacer', () => {
    const seed = makeBasicSeed();
    (seed as Record<string, unknown>)['_testF32'] = new Float32Array([1.5, 2.5]);
    const result = exporter.export(seed);
    const parsed = JSON.parse(result.content);
    expect(parsed._testF32.__type).toBe('Float32Array');
  });

  it('should handle Uint8Array via custom replacer', () => {
    const seed = makeBasicSeed();
    (seed as Record<string, unknown>)['_testU8'] = new Uint8Array([10, 20, 30]);
    const result = exporter.export(seed);
    const parsed = JSON.parse(result.content);
    expect(parsed._testU8.__type).toBe('Uint8Array');
    expect(parsed._testU8.data).toEqual([10, 20, 30]);
  });

  it('should produce valid JSON for batch export', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = exporter.exportBatch(seeds);
    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('should set batch filename', () => {
    const result = exporter.exportBatch([makeBasicSeed()]);
    expect(result.filename).toBe('seeds-batch.json');
  });

  it('should handle empty batch', () => {
    const result = exporter.exportBatch([]);
    const parsed = JSON.parse(result.content);
    expect(parsed).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// PythonExporter Tests
// ─────────────────────────────────────────────

describe('PythonExporter', () => {
  let exporter: PythonExporter;

  beforeEach(() => {
    exporter = new PythonExporter();
  });

  it('should return ExportResult with format python', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('python');
    expect(result.mimeType).toBe('text/x-python');
    expect(result.filename).toMatch(/\.py$/);
  });

  it('should contain dataclass decorator', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('@dataclass');
    expect(result.content).toContain('from dataclasses import dataclass, field');
  });

  it('should use PascalCase for class name', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('class TestWarrior:');
  });

  it('should map scalar gene to float', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('health: float = 0.85');
  });

  it('should map categorical gene to str', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('species: str = "dragon"');
  });

  it('should map vector gene to List[float]', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('color: List[float]');
    expect(result.content).toContain('field(default_factory=lambda:');
  });

  it('should map expression gene to str', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('behavior: str = "sin(t) * health"');
  });

  it('should include domain comment', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('# Domain: organism');
  });

  it('should handle struct gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('stats: dict');
    expect(result.content).toContain('field(default_factory=dict)');
  });

  it('should handle array gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('layers: list');
    expect(result.content).toContain('field(default_factory=list)');
  });

  it('should handle graph gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('network: dict');
  });

  it('should handle tensor gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('weights: List[float]');
  });

  it('should handle timeseries gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('animation: list');
  });

  it('should produce pass for empty genes', () => {
    const result = exporter.export(makeEmptySeed());
    expect(result.content).toContain('    pass');
  });

  it('should include fitness and generation comments', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('# Generation:');
    expect(result.content).toContain('# Primary Fitness:');
  });

  it('should include docstring with seed info', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('"""');
    expect(result.content).toContain('Seed: Test Warrior');
    expect(result.content).toContain('Domain: organism');
  });
});

// ─────────────────────────────────────────────
// RustExporter Tests
// ─────────────────────────────────────────────

describe('RustExporter', () => {
  let exporter: RustExporter;

  beforeEach(() => {
    exporter = new RustExporter();
  });

  it('should return ExportResult with format rust', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('rust');
    expect(result.mimeType).toBe('text/x-rust');
    expect(result.filename).toMatch(/\.rs$/);
  });

  it('should contain derive macros', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('#[derive(Debug, Clone, PartialEq)]');
  });

  it('should use pub struct with PascalCase name', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('pub struct TestWarrior {');
  });

  it('should map scalar to f64', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('pub health: f64,');
  });

  it('should map categorical to String', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('pub species: String,');
  });

  it('should map vector to Vec<f64>', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('pub color: Vec<f64>,');
  });

  it('should map expression to String', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('pub behavior: String,');
  });

  it('should include Default implementation', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('impl Default for TestWarrior');
    expect(result.content).toContain('fn default() -> Self');
  });

  it('should include default values', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('0.85_f64');
    expect(result.content).toContain('String::from("dragon")');
    expect(result.content).toContain('vec![');
  });

  it('should handle struct gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('std::collections::HashMap<String, f64>');
    expect(result.content).toContain('std::collections::HashMap::new()');
  });

  it('should handle graph gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('std::collections::HashMap<String, Vec<String>>');
  });

  it('should handle array gene type', () => {
    const result = exporter.export(makeFullSeed());
    // array maps to Vec<f64> with Vec::new() default
    expect(result.content).toContain('Vec::new()');
  });

  it('should handle tensor gene type with data', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('1_f64');
    expect(result.content).toContain('2_f64');
  });

  it('should handle timeseries gene with tuples', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('Vec<(f64, f64)>');
    expect(result.content).toContain('(0_f64, 0_f64)');
    expect(result.content).toContain('(1_f64, 1_f64)');
  });

  it('should include header comments', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('//! Seed: Test Warrior');
    expect(result.content).toContain('//! Domain: organism');
  });
});

// ─────────────────────────────────────────────
// CSharpExporter Tests
// ─────────────────────────────────────────────

describe('CSharpExporter', () => {
  let exporter: CSharpExporter;

  beforeEach(() => {
    exporter = new CSharpExporter();
  });

  it('should return ExportResult with format csharp', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('csharp');
    expect(result.mimeType).toBe('text/x-csharp');
    expect(result.filename).toMatch(/\.cs$/);
  });

  it('should extend MonoBehaviour', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain(': MonoBehaviour');
  });

  it('should use [SerializeField] attribute', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('[SerializeField]');
  });

  it('should use using statements', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('using UnityEngine;');
    expect(result.content).toContain('using System.Collections.Generic;');
  });

  it('should map scalar to float with f suffix', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('private float health = 0.85f;');
  });

  it('should map categorical to string', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('private string species = "dragon";');
  });

  it('should map vector to float array', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('private float[] color = new float[]');
  });

  it('should map expression to string field', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('private string behavior = "sin(t) * health";');
  });

  it('should generate public properties', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('public float Health => health;');
    expect(result.content).toContain('public string Species => species;');
  });

  it('should include Start method with Debug.Log', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('private void Start()');
    expect(result.content).toContain('Debug.Log');
    expect(result.content).toContain('[GSPL]');
  });

  it('should have XML summary doc', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('/// <summary>');
  });

  it('should handle struct gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('Dictionary<string, float>');
    expect(result.content).toContain('new Dictionary<string, float>()');
  });

  it('should handle graph gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('Dictionary<string, List<string>>');
  });

  it('should handle array gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('new float[] { }');
  });

  it('should handle timeseries gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('List<Vector2>');
    expect(result.content).toContain('new Vector2(');
  });

  it('should handle tensor gene type', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('1f');
    expect(result.content).toContain('2f');
  });

  it('should produce PascalCase filename', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.filename).toBe('TestWarrior.cs');
  });
});

// ─────────────────────────────────────────────
// GDScriptExporter Tests
// ─────────────────────────────────────────────

describe('GDScriptExporter', () => {
  let exporter: GDScriptExporter;

  beforeEach(() => {
    exporter = new GDScriptExporter();
  });

  it('should return ExportResult with format gdscript', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('gdscript');
    expect(result.mimeType).toBe('text/x-gdscript');
    expect(result.filename).toMatch(/\.gd$/);
  });

  it('should include class_name and extends', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('class_name TestWarrior');
    expect(result.content).toContain('extends Node');
  });

  it('should use @export annotations for scalar', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('@export var health: float = 0.85');
  });

  it('should use @export annotations for categorical', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('@export var species: String = "dragon"');
  });

  it('should map vector to Array[float]', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('@export var color: Array[float]');
  });

  it('should map expression to String', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('@export var behavior: String = "sin(t) * health"');
  });

  it('should include _ready function', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('func _ready() -> void:');
    expect(result.content).toContain('[GSPL]');
  });

  it('should handle struct gene', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('stats: Dictionary = {}');
  });

  it('should handle array gene', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('layers: Array = []');
  });

  it('should handle graph gene', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('network: Dictionary = {}');
  });

  it('should handle tensor gene', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('weights: Array[float]');
  });

  it('should handle timeseries gene', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('animation: Array = []');
  });

  it('should include header comments', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('## Seed: Test Warrior');
    expect(result.content).toContain('## Domain: organism');
  });
});

// ─────────────────────────────────────────────
// GLSLExporter Tests
// ─────────────────────────────────────────────

describe('GLSLExporter', () => {
  let exporter: GLSLExporter;

  beforeEach(() => {
    exporter = new GLSLExporter();
  });

  it('should return ExportResult with format glsl', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('glsl');
    expect(result.mimeType).toBe('text/x-glsl');
    expect(result.filename).toMatch(/\.frag$/);
  });

  it('should include GLSL version and precision', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('#version 300 es');
    expect(result.content).toContain('precision highp float;');
  });

  it('should include standard uniforms', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('uniform vec2 uResolution;');
    expect(result.content).toContain('uniform float uTime;');
  });

  it('should generate uniform for scalar gene', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('uniform float u_health;');
  });

  it('should generate vec3 uniform for 3D vector gene', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('uniform vec3 u_color;');
  });

  it('should generate vec4 uniform for 4D vector gene', () => {
    const result = exporter.export(makeVec4Seed());
    expect(result.content).toContain('uniform vec4 u_basecolor;');
  });

  it('should generate vec2 uniform for 2D vector gene', () => {
    const result = exporter.export(makeVec2Seed());
    expect(result.content).toContain('uniform vec2 u_offset;');
  });

  it('should include fragment shader main function', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('void main() {');
    expect(result.content).toContain('fragColor');
    expect(result.content).toContain('out vec4 fragColor;');
  });

  it('should use first color gene for baseColor when vec3 present', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('vec4 baseColor = vec4(u_color, 1.0);');
  });

  it('should use vec4 directly when 4D vector present', () => {
    const result = exporter.export(makeVec4Seed());
    expect(result.content).toContain('vec4 baseColor = u_basecolor;');
  });

  it('should use fallback color when no color genes present', () => {
    const seed = buildSeed('No Color', 'organism', {
      hp: makeScalarGene(0.5),
      name: makeCategoricalGene('test', ['test']),
    });
    const result = exporter.export(seed);
    expect(result.content).toContain('vec4 baseColor = vec4(uv, 0.5 + 0.5 * sin(uTime), 1.0);');
  });

  it('should multiply by scalar gene when available', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('baseColor.rgb *= u_health;');
  });

  it('should include uv calculation', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('vec2 uv = gl_FragCoord.xy / uResolution;');
  });

  it('should handle empty genes', () => {
    const result = exporter.export(makeEmptySeed());
    expect(result.content).toContain('void main()');
    expect(result.content).toContain('fragColor = baseColor;');
  });

  it('should not multiply by scalar when no scalar genes exist', () => {
    const seed = buildSeed('Cat Only', 'organism', {
      name: makeCategoricalGene('test', ['test']),
    });
    const result = exporter.export(seed);
    expect(result.content).not.toContain('baseColor.rgb *=');
  });
});

// ─────────────────────────────────────────────
// CSVExporter Tests
// ─────────────────────────────────────────────

describe('CSVExporter', () => {
  let exporter: CSVExporter;

  beforeEach(() => {
    exporter = new CSVExporter();
  });

  it('should return ExportResult with format csv', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('csv');
    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toMatch(/\.csv$/);
  });

  it('should include header row', () => {
    const result = exporter.export(makeBasicSeed());
    const lines = result.content.split('\n');
    expect(lines[0]).toBe('gene_name,type,value');
  });

  it('should include one row per gene', () => {
    const result = exporter.export(makeBasicSeed());
    const lines = result.content.split('\n');
    // header + 4 genes
    expect(lines).toHaveLength(5);
  });

  it('should correctly format scalar gene row', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('health,scalar,0.8500');
  });

  it('should correctly format categorical gene row', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('species,categorical,dragon');
  });

  it('should quote values containing commas', () => {
    const result = exporter.export(makeBasicSeed());
    // vector value contains commas: [0.800, 0.200, 0.100]
    expect(result.content).toMatch(/".*0\.800.*0\.200.*0\.100.*"/);
  });

  it('should handle empty genes', () => {
    const result = exporter.export(makeEmptySeed());
    expect(result.content).toBe('gene_name,type,value');
  });

  it('should handle batch export with multiple seeds', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = exporter.exportBatch(seeds);
    expect(result.format).toBe('csv');
    expect(result.filename).toBe('seeds-batch.csv');
    const lines = result.content.split('\n');
    // header + 2 seed rows
    expect(lines).toHaveLength(3);
  });

  it('should include all gene columns in batch', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = exporter.exportBatch(seeds);
    const header = result.content.split('\n')[0]!;
    expect(header).toContain('name');
    expect(header).toContain('domain');
    expect(header).toContain('hash');
    expect(header).toContain('fitness');
    expect(header).toContain('health');
    expect(header).toContain('species');
  });

  it('should return empty content for empty batch', () => {
    const result = exporter.exportBatch([]);
    expect(result.content).toBe('');
    expect(result.filename).toBe('seeds-batch.csv');
  });

  it('should fill empty cells when seed missing genes', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = exporter.exportBatch(seeds);
    const lines = result.content.split('\n');
    const emptyRow = lines[2]!;
    // Has trailing commas for missing gene values
    expect(emptyRow.split(',').length).toBeGreaterThan(4);
  });

  it('should escape values with quotes in CSV', () => {
    const seed = buildSeed('Quote Test', 'organism', {
      desc: makeCategoricalGene('has "quotes" inside', ['has "quotes" inside']),
    });
    const result = exporter.export(seed);
    expect(result.content).toContain('""quotes""');
  });
});

// ─────────────────────────────────────────────
// SVGExporter Tests
// ─────────────────────────────────────────────

describe('SVGExporter', () => {
  let exporter: SVGExporter;

  beforeEach(() => {
    exporter = new SVGExporter();
  });

  it('should return ExportResult with format svg', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.format).toBe('svg');
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.filename).toMatch(/\.svg$/);
  });

  it('should produce valid SVG with xml header', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result.content).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(result.content).toContain('</svg>');
  });

  it('should contain the seed name', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('Test Warrior');
  });

  it('should contain domain badge', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('organism');
  });

  it('should use domain color for organism', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('#4caf50');
  });

  it('should use creature domain color', () => {
    const result = exporter.export(makeFullSeed());
    expect(result.content).toContain('#ff9800');
  });

  it('should include fitness bar elements', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('Fitness:');
    expect(result.content).toContain('fitGrad');
    expect(result.content).toContain('fitClip');
  });

  it('should display gene names and types', () => {
    const result = exporter.export(makeBasicSeed());
    expect(result.content).toContain('health');
    expect(result.content).toContain('scalar');
    expect(result.content).toContain('species');
    expect(result.content).toContain('categorical');
  });

  it('should truncate long gene values', () => {
    const seed = buildSeed('Long Gene', 'organism', {
      longVec: makeVectorGene(
        [0.123456, 0.234567, 0.345678, 0.456789, 0.567890, 0.678901, 0.789012, 0.890123, 0.901234, 0.012345],
        10,
      ),
    });
    const result = exporter.export(seed);
    expect(result.content).toContain('...');
  });

  it('should handle seeds with many genes (truncation at 20)', () => {
    const genes: Record<string, ScalarGene> = {};
    for (let i = 0; i < 25; i++) {
      genes[`gene_${i}`] = makeScalarGene(i / 25, 0, 1);
    }
    const seed = buildSeed('Many Genes', 'organism', genes);
    const result = exporter.export(seed);
    expect(result.content).toContain('... and 5 more genes');
  });

  it('should handle empty genes', () => {
    const result = exporter.export(makeEmptySeed());
    expect(result.content).toContain('<svg');
    expect(result.content).toContain('</svg>');
  });

  it('should include hash (first 16 chars)', () => {
    const seed = makeBasicSeed();
    const result = exporter.export(seed);
    expect(result.content).toContain(seed.$hash.slice(0, 16));
  });

  it('should escape HTML in SVG text', () => {
    const result = exporter.export(makeSpecialCharSeed());
    expect(result.content).toContain('&lt;Seed&gt;');
  });

  it('should use fallback color for unknown domain', () => {
    const seed = buildSeed('Unknown', 'insect', {});
    const result = exporter.export(seed);
    // fallback is #6366f1
    expect(result.content).toContain('#6366f1');
  });
});

// ─────────────────────────────────────────────
// ExportEngine Tests
// ─────────────────────────────────────────────

describe('ExportEngine', () => {
  let engine: ExportEngine;

  beforeEach(() => {
    engine = new ExportEngine();
  });

  it('should return all 10 supported formats', () => {
    const formats = engine.getSupportedFormats();
    expect(formats).toHaveLength(10);
    expect(formats).toContain('html');
    expect(formats).toContain('markdown');
    expect(formats).toContain('json');
    expect(formats).toContain('python');
    expect(formats).toContain('rust');
    expect(formats).toContain('csharp');
    expect(formats).toContain('gdscript');
    expect(formats).toContain('glsl');
    expect(formats).toContain('csv');
    expect(formats).toContain('svg');
  });

  it('should route to HTMLExporter', () => {
    const result = engine.export(makeBasicSeed(), 'html');
    expect(result.format).toBe('html');
    expect(result.content).toContain('<!DOCTYPE html>');
  });

  it('should route to MarkdownExporter', () => {
    const result = engine.export(makeBasicSeed(), 'markdown');
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('# Test Warrior');
  });

  it('should route to JSONExporter', () => {
    const result = engine.export(makeBasicSeed(), 'json');
    expect(result.format).toBe('json');
    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('should route to PythonExporter', () => {
    const result = engine.export(makeBasicSeed(), 'python');
    expect(result.format).toBe('python');
    expect(result.content).toContain('@dataclass');
  });

  it('should route to RustExporter', () => {
    const result = engine.export(makeBasicSeed(), 'rust');
    expect(result.format).toBe('rust');
    expect(result.content).toContain('#[derive(');
  });

  it('should route to CSharpExporter', () => {
    const result = engine.export(makeBasicSeed(), 'csharp');
    expect(result.format).toBe('csharp');
    expect(result.content).toContain('MonoBehaviour');
  });

  it('should route to GDScriptExporter', () => {
    const result = engine.export(makeBasicSeed(), 'gdscript');
    expect(result.format).toBe('gdscript');
    expect(result.content).toContain('extends Node');
  });

  it('should route to GLSLExporter', () => {
    const result = engine.export(makeBasicSeed(), 'glsl');
    expect(result.format).toBe('glsl');
    expect(result.content).toContain('#version 300 es');
  });

  it('should route to CSVExporter', () => {
    const result = engine.export(makeBasicSeed(), 'csv');
    expect(result.format).toBe('csv');
    expect(result.content).toContain('gene_name,type,value');
  });

  it('should route to SVGExporter', () => {
    const result = engine.export(makeBasicSeed(), 'svg');
    expect(result.format).toBe('svg');
    expect(result.content).toContain('<svg');
  });

  it('should batch export to JSON using dedicated batch method', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = engine.exportBatch(seeds, 'json');
    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('should batch export to CSV using dedicated batch method', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = engine.exportBatch(seeds, 'csv');
    expect(result.format).toBe('csv');
    expect(result.content).toContain('name,domain,hash,fitness');
  });

  it('should batch export to HTML by concatenating with comment separator', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = engine.exportBatch(seeds, 'html');
    expect(result.format).toBe('html');
    expect(result.content).toContain('<!-- --- -->');
    expect(result.filename).toBe('seeds-batch.html');
  });

  it('should batch export to markdown by concatenating with --- separator', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = engine.exportBatch(seeds, 'markdown');
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('\n---\n');
    expect(result.filename).toBe('seeds-batch.md');
  });

  it('should batch export to python by concatenating', () => {
    const seeds = [makeBasicSeed(), makeEmptySeed()];
    const result = engine.exportBatch(seeds, 'python');
    expect(result.format).toBe('python');
    expect(result.filename).toBe('seeds-batch.py');
  });

  it('should batch export to rust', () => {
    const seeds = [makeBasicSeed()];
    const result = engine.exportBatch(seeds, 'rust');
    expect(result.format).toBe('rust');
    expect(result.filename).toBe('seeds-batch.rs');
  });

  it('should batch export to svg', () => {
    const seeds = [makeBasicSeed()];
    const result = engine.exportBatch(seeds, 'svg');
    expect(result.format).toBe('svg');
    expect(result.filename).toBe('seeds-batch.svg');
  });

  it('should batch export to gdscript', () => {
    const seeds = [makeBasicSeed()];
    const result = engine.exportBatch(seeds, 'gdscript');
    expect(result.format).toBe('gdscript');
    expect(result.filename).toBe('seeds-batch.gd');
  });

  it('should batch export to glsl', () => {
    const seeds = [makeBasicSeed()];
    const result = engine.exportBatch(seeds, 'glsl');
    expect(result.format).toBe('glsl');
    expect(result.filename).toBe('seeds-batch.frag');
  });

  it('should batch export to csharp', () => {
    const seeds = [makeBasicSeed()];
    const result = engine.exportBatch(seeds, 'csharp');
    expect(result.format).toBe('csharp');
    expect(result.filename).toBe('seeds-batch.cs');
  });

  it('should return correct exporter instances via getExporter', () => {
    expect(engine.getExporter('html')).toBeInstanceOf(HTMLExporter);
    expect(engine.getExporter('markdown')).toBeInstanceOf(MarkdownExporter);
    expect(engine.getExporter('json')).toBeInstanceOf(JSONExporter);
    expect(engine.getExporter('python')).toBeInstanceOf(PythonExporter);
    expect(engine.getExporter('rust')).toBeInstanceOf(RustExporter);
    expect(engine.getExporter('csharp')).toBeInstanceOf(CSharpExporter);
    expect(engine.getExporter('gdscript')).toBeInstanceOf(GDScriptExporter);
    expect(engine.getExporter('glsl')).toBeInstanceOf(GLSLExporter);
    expect(engine.getExporter('csv')).toBeInstanceOf(CSVExporter);
    expect(engine.getExporter('svg')).toBeInstanceOf(SVGExporter);
  });
});

// ─────────────────────────────────────────────
// Cross-cutting / Edge Case Tests
// ─────────────────────────────────────────────

describe('Cross-cutting edge cases', () => {
  it('should handle quotes in categorical gene across exporters', () => {
    const seed = buildSeed('Quote Seed', 'organism', {
      label: makeCategoricalGene('say "hello"', ['say "hello"']),
    });
    const engine = new ExportEngine();

    const pyResult = engine.export(seed, 'python');
    expect(pyResult.content).toContain('say \\"hello\\"');

    const rustResult = engine.export(seed, 'rust');
    expect(rustResult.content).toContain('say \\"hello\\"');

    const csResult = engine.export(seed, 'csharp');
    expect(csResult.content).toContain('say \\"hello\\"');

    const gdResult = engine.export(seed, 'gdscript');
    expect(gdResult.content).toContain('say \\"hello\\"');
  });

  it('should handle quotes in expression gene', () => {
    const seed = buildSeed('Expr Seed', 'organism', {
      formula: makeExpressionGene('concat("a", "b")'),
    });
    const engine = new ExportEngine();

    const pyResult = engine.export(seed, 'python');
    expect(pyResult.content).toContain('concat(\\"a\\", \\"b\\")');

    const rustResult = engine.export(seed, 'rust');
    expect(rustResult.content).toContain('concat(\\"a\\", \\"b\\")');
  });

  it('should handle empty seed name gracefully (safeFilename returns "seed")', () => {
    const seed = buildSeed('!!!', 'organism', {});
    const engine = new ExportEngine();
    const result = engine.export(seed, 'html');
    expect(result.filename).toBe('seed.html');
  });

  it('should handle fitness clamp in HTML (fitness > 1)', () => {
    const seed = buildSeed('High Fit', 'organism', {}, {
      $fitness: { primary: 1.5 },
    });
    const exporter = new HTMLExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('100%');
  });

  it('should handle fitness clamp in HTML (negative fitness)', () => {
    const seed = buildSeed('Neg Fit', 'organism', {}, {
      $fitness: { primary: -0.5 },
    });
    const exporter = new HTMLExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('0%');
  });

  it('should default primary fitness to 0 when $fitness is undefined', () => {
    const seed = makeBasicSeed();
    const exporter = new MarkdownExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('**Primary Fitness:** 0.0000');
  });

  it('should produce consistent output for identical seeds', () => {
    const seed1 = makeBasicSeed();
    const seed2 = makeBasicSeed();
    const engine = new ExportEngine();
    expect(engine.export(seed1, 'json').content).toBe(engine.export(seed2, 'json').content);
    expect(engine.export(seed1, 'python').content).toBe(engine.export(seed2, 'python').content);
    expect(engine.export(seed1, 'rust').content).toBe(engine.export(seed2, 'rust').content);
  });

  it('should handle gene value string for all 9 types via CSV', () => {
    const seed = makeFullSeed();
    const engine = new ExportEngine();
    const result = engine.export(seed, 'csv');
    expect(result.content).toContain('scalar');
    expect(result.content).toContain('categorical');
    expect(result.content).toContain('vector');
    expect(result.content).toContain('expression');
    expect(result.content).toContain('struct');
    expect(result.content).toContain('array');
    expect(result.content).toContain('graph');
    expect(result.content).toContain('tensor');
    expect(result.content).toContain('timeseries');
  });

  it('should render struct gene value string correctly', () => {
    const seed = makeFullSeed();
    const exporter = new CSVExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('{inner: 0.5000}');
  });

  it('should render array gene value string correctly', () => {
    const seed = makeFullSeed();
    const exporter = new CSVExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('0.1000');
    expect(result.content).toContain('0.2000');
  });

  it('should render graph gene value string correctly', () => {
    const seed = makeFullSeed();
    const exporter = new CSVExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('Graph(2 nodes');
  });

  it('should render tensor gene value string correctly', () => {
    const seed = makeFullSeed();
    const exporter = new CSVExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('Tensor(shape=');
  });

  it('should render timeseries gene value string correctly', () => {
    const seed = makeFullSeed();
    const exporter = new CSVExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('TimeSeries(3 keyframes');
  });

  it('should handle all known domains for color mapping in SVG', () => {
    const domains = [
      'organism', 'vehicle', 'weapon', 'building', 'terrain',
      'material', 'plant', 'creature', 'game', 'simulation',
      'audio', 'narrative', 'ui', 'shader', 'code',
    ];
    const svgExporter = new SVGExporter();
    for (const domain of domains) {
      const seed = buildSeed('Color Test', domain, {});
      const result = svgExporter.export(seed);
      expect(result.content).toContain('<svg');
    }
  });

  it('should handle GLSL export with only scalar genes (no color genes)', () => {
    const seed = buildSeed('Scalar Only', 'organism', {
      alpha: makeScalarGene(0.5),
      beta: makeScalarGene(0.3),
    });
    const exporter = new GLSLExporter();
    const result = exporter.export(seed);
    expect(result.content).toContain('vec4 baseColor = vec4(uv, 0.5 + 0.5 * sin(uTime), 1.0);');
    expect(result.content).toContain('baseColor.rgb *= u_alpha;');
  });

  it('should sanitize gene names with leading digits', () => {
    const seed = makeUnsafeNameSeed();
    const exporter = new PythonExporter();
    const result = exporter.export(seed);
    // snake_case of 'my-gene' -> 'my_gene', '3rd_value' -> '_3rd_value'
    expect(result.content).toContain('my_gene');
    expect(result.content).toContain('_3rd_value');
  });

  it('should handle names starting with numbers in PascalCase', () => {
    const seed = makeUnsafeNameSeed();
    const exporter = new RustExporter();
    const result = exporter.export(seed);
    // toPascalCase converts '123 numeric start!' -> '123NumericStart'
    // (sanitizeIdentifier prefixes leading digit with _)
    expect(result.content).toContain('pub struct');
    expect(result.content).toContain('NumericStart');
  });

  it('should produce different domain colors for different domains', () => {
    const svgExporter = new SVGExporter();
    const organismResult = svgExporter.export(buildSeed('A', 'organism', {}));
    const vehicleResult = svgExporter.export(buildSeed('B', 'vehicle', {}));
    // organism = #4caf50, vehicle = #2196f3
    expect(organismResult.content).toContain('#4caf50');
    expect(vehicleResult.content).toContain('#2196f3');
  });

  it('should handle SVG fitness clamping', () => {
    const seed = buildSeed('High Fit SVG', 'organism', {}, {
      $fitness: { primary: 2.0 },
    });
    const exporter = new SVGExporter();
    const result = exporter.export(seed);
    // fitnessPercent should be clamped to 1 (max)
    expect(result.content).toContain('Fitness: 2.0000');
  });
});
