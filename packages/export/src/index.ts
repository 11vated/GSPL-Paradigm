/**
 * @paradigm/export — Multi-format export system for GSPL Paradigm.
 *
 * Converts UniversalSeed instances into 10 output formats: HTML, Markdown,
 * JSON, Python, Rust, C#, GDScript, GLSL, CSV, and SVG. Zero external
 * dependencies beyond @paradigm/types and @paradigm/rng.
 *
 * @packageDocumentation
 */

import type {
  UniversalSeed,
  Gene,
  GeneMap,
  ScalarGene,
  CategoricalGene,
  VectorGene,
} from '@paradigm/types';

// ─────────────────────────────────────────────
// Export Format & Result
// ─────────────────────────────────────────────

/** Supported export target formats. */
export type ExportFormat =
  | 'html'
  | 'markdown'
  | 'json'
  | 'python'
  | 'rust'
  | 'csharp'
  | 'gdscript'
  | 'glsl'
  | 'csv'
  | 'svg';

/** Result of an export operation. */
export interface ExportResult {
  readonly format: ExportFormat;
  readonly content: string;
  readonly filename: string;
  readonly mimeType: string;
}

// ─────────────────────────────────────────────
// Gene Helpers
// ─────────────────────────────────────────────

/** Type-safe iteration over GeneMap entries. */
function geneEntries(genes: GeneMap): Array<[string, Gene]> {
  return Object.entries(genes) as Array<[string, Gene]>;
}

/** Sanitize a name into a valid identifier (alphanumeric + underscore). */
function sanitizeIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/__+/g, '_');
}

/** PascalCase conversion. */
function toPascalCase(name: string): string {
  return sanitizeIdentifier(name)
    .split('_')
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');
}

/** camelCase conversion. */
function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  if (pascal.length === 0) return 'unnamed';
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** snake_case conversion. */
function toSnakeCase(name: string): string {
  return sanitizeIdentifier(name).toLowerCase();
}

/** Extract a human-readable gene value as a string. */
function geneValueString(gene: Gene): string {
  switch (gene.type) {
    case 'scalar':
      return gene.value.toFixed(4);
    case 'categorical':
      return gene.value;
    case 'vector':
      return `[${gene.value.map((v) => v.toFixed(3)).join(', ')}]`;
    case 'expression':
      return gene.source;
    case 'struct':
      return `{${geneEntries(gene.value).map(([k, v]) => `${k}: ${geneValueString(v)}`).join(', ')}}`;
    case 'array':
      return `[${gene.value.map((v) => geneValueString(v)).join(', ')}]`;
    case 'graph':
      return `Graph(${gene.nodes.size} nodes, ${gene.edges.length} edges)`;
    case 'tensor':
      return `Tensor(shape=[${gene.shape.join(',')}])`;
    case 'timeseries':
      return `TimeSeries(${gene.keyframes.length} keyframes, ${gene.interpolation})`;
  }
}

/** Escape HTML special characters. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Get a filename-safe version of the seed name. */
function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'seed';
}

/** Map domain to a color hex string for visual exports. */
function domainColor(domain: string): string {
  const DOMAIN_COLORS: Record<string, string> = {
    organism: '#4caf50',
    vehicle: '#2196f3',
    weapon: '#f44336',
    building: '#9c27b0',
    terrain: '#795548',
    material: '#607d8b',
    plant: '#8bc34a',
    creature: '#ff9800',
    game: '#e91e63',
    simulation: '#00bcd4',
    audio: '#ff5722',
    narrative: '#673ab7',
    ui: '#03a9f4',
    shader: '#cddc39',
    code: '#009688',
  };
  return DOMAIN_COLORS[domain] ?? '#6366f1';
}

/** Compute primary fitness value, defaulting to 0. */
function primaryFitness(seed: UniversalSeed): number {
  return seed.$fitness?.primary ?? 0;
}

// ─────────────────────────────────────────────
// HTMLExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a self-contained HTML page with dark theme and interactive sections. */
export class HTMLExporter {
  /** Export a single seed to an interactive HTML document. */
  export(seed: UniversalSeed): ExportResult {
    const entries = geneEntries(seed.genes);
    const fitness = primaryFitness(seed);
    const color = domainColor(seed.$domain);
    const fitnessPercent = Math.round(Math.min(1, Math.max(0, fitness)) * 100);

    const geneRows = entries
      .map(
        ([name, gene]) =>
          `<tr>
            <td class="gene-name">${escapeHtml(name)}</td>
            <td class="gene-type"><span class="badge">${escapeHtml(gene.type)}</span></td>
            <td class="gene-value">${escapeHtml(geneValueString(gene))}</td>
          </tr>`,
      )
      .join('\n');

    const lineageHtml = seed.$lineage
      ? `<div class="section">
          <h3 class="collapsible" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('hidden')">
            Lineage <span class="arrow">&#9660;</span>
          </h3>
          <div class="section-body">
            <p><strong>Generation:</strong> ${seed.$lineage.generation}</p>
            <p><strong>Parents:</strong> ${seed.$lineage.parents.length > 0 ? seed.$lineage.parents.map((p) => escapeHtml(p.name)).join(', ') : 'None (origin)'}</p>
            ${seed.$lineage.breedingStrategy ? `<p><strong>Strategy:</strong> ${escapeHtml(seed.$lineage.breedingStrategy)}</p>` : ''}
            ${seed.$lineage.mutationIntensity !== undefined ? `<p><strong>Mutation Intensity:</strong> ${seed.$lineage.mutationIntensity.toFixed(4)}</p>` : ''}
          </div>
        </div>`
      : '';

    const metaHtml = seed.$metadata
      ? `<div class="section">
          <h3 class="collapsible" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('hidden')">
            Metadata <span class="arrow">&#9660;</span>
          </h3>
          <div class="section-body">
            <p><strong>Created:</strong> ${new Date(seed.$metadata.created).toISOString()}</p>
            ${seed.$metadata.creator ? `<p><strong>Creator:</strong> ${escapeHtml(seed.$metadata.creator)}</p>` : ''}
            ${seed.$metadata.description ? `<p><strong>Description:</strong> ${escapeHtml(seed.$metadata.description)}</p>` : ''}
            ${seed.$metadata.tags ? `<p><strong>Tags:</strong> ${seed.$metadata.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</p>` : ''}
          </div>
        </div>`
      : '';

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(seed.$name)} - GSPL Paradigm Seed</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f23;color:#e2e8f0;line-height:1.6;padding:2rem}
.container{max-width:900px;margin:0 auto}
.header{background:linear-gradient(135deg,${color}22,${color}44);border:1px solid ${color}66;border-radius:12px;padding:1.5rem 2rem;margin-bottom:1.5rem}
.header h1{font-size:1.75rem;color:#f8fafc;margin-bottom:0.25rem}
.header .domain{display:inline-block;background:${color};color:#fff;padding:2px 12px;border-radius:999px;font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
.header .hash{color:#94a3b8;font-size:0.75rem;font-family:monospace;margin-top:0.5rem}
.fitness-bar{margin-top:1rem}
.fitness-bar .label{font-size:0.85rem;color:#94a3b8;margin-bottom:4px}
.fitness-bar .track{background:#1e293b;border-radius:6px;height:20px;overflow:hidden}
.fitness-bar .fill{background:linear-gradient(90deg,#ef4444,#eab308,#22c55e);height:100%;width:${fitnessPercent}%;border-radius:6px;transition:width 0.3s}
.fitness-bar .value{text-align:right;font-size:0.8rem;color:#94a3b8;margin-top:2px}
.section{background:#1a1a2e;border:1px solid #2d2d44;border-radius:10px;padding:1.25rem 1.5rem;margin-bottom:1rem}
.section h3{cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center;font-size:1.1rem;color:#c4b5fd}
.section h3 .arrow{font-size:0.7rem;transition:transform 0.2s}
.section h3.collapsed .arrow{transform:rotate(-90deg)}
.hidden{display:none}
table{width:100%;border-collapse:collapse;margin-top:0.75rem}
th{text-align:left;padding:8px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em}
td{padding:8px 12px;border-bottom:1px solid #1e293b;font-size:0.9rem}
.gene-name{color:#f8fafc;font-weight:500}
.gene-type .badge{background:#312e81;color:#a5b4fc;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-family:monospace}
.gene-value{color:#cbd5e1;font-family:monospace;font-size:0.85rem;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag{display:inline-block;background:#1e293b;color:#94a3b8;padding:1px 8px;border-radius:4px;font-size:0.75rem;margin-right:4px}
p{margin:0.35rem 0}
.footer{text-align:center;color:#475569;font-size:0.75rem;margin-top:2rem;padding-top:1rem;border-top:1px solid #1e293b}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escapeHtml(seed.$name)}</h1>
    <span class="domain">${escapeHtml(seed.$domain)}</span>
    <span class="hash">${escapeHtml(seed.$hash)}</span>
    <div class="fitness-bar">
      <div class="label">Primary Fitness</div>
      <div class="track"><div class="fill"></div></div>
      <div class="value">${fitness.toFixed(4)} (${fitnessPercent}%)</div>
    </div>
  </div>

  <div class="section">
    <h3 class="collapsible" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('hidden')">
      Genes (${entries.length}) <span class="arrow">&#9660;</span>
    </h3>
    <div class="section-body">
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>
        <tbody>${geneRows}</tbody>
      </table>
    </div>
  </div>

  ${lineageHtml}
  ${metaHtml}

  <div class="footer">
    Generated by GSPL Paradigm &middot; GST ${escapeHtml(seed.$gst)}
  </div>
</div>
</body>
</html>`;

    return {
      format: 'html',
      content,
      filename: `${safeFilename(seed.$name)}.html`,
      mimeType: 'text/html',
    };
  }
}

// ─────────────────────────────────────────────
// MarkdownExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a Markdown document suitable for documentation or sharing. */
export class MarkdownExporter {
  /** Export a single seed to Markdown. */
  export(seed: UniversalSeed): ExportResult {
    const entries = geneEntries(seed.genes);
    const fitness = primaryFitness(seed);
    const lines: string[] = [];

    lines.push(`# ${seed.$name}`);
    lines.push('');
    lines.push(`**Domain:** ${seed.$domain}  `);
    lines.push(`**Hash:** \`${seed.$hash}\`  `);
    lines.push(`**GST Version:** ${seed.$gst}  `);
    lines.push(`**Primary Fitness:** ${fitness.toFixed(4)}  `);
    lines.push('');

    if (seed.$metadata.description) {
      lines.push(`> ${seed.$metadata.description}`);
      lines.push('');
    }

    // Gene table
    lines.push('## Genes');
    lines.push('');
    lines.push('| Name | Type | Value |');
    lines.push('|------|------|-------|');
    for (const [name, gene] of entries) {
      const val = geneValueString(gene).replace(/\|/g, '\\|');
      lines.push(`| ${name} | \`${gene.type}\` | \`${val}\` |`);
    }
    lines.push('');

    // Fitness
    if (seed.$fitness) {
      lines.push('## Fitness');
      lines.push('');
      const fitnessEntries = Object.entries(seed.$fitness) as Array<[string, number | undefined]>;
      for (const [key, value] of fitnessEntries) {
        if (value !== undefined) {
          lines.push(`- **${key}:** ${value.toFixed(4)}`);
        }
      }
      lines.push('');
    }

    // Lineage
    if (seed.$lineage) {
      lines.push('## Lineage');
      lines.push('');
      lines.push(`- **Generation:** ${seed.$lineage.generation}`);
      if (seed.$lineage.parents.length > 0) {
        lines.push(`- **Parents:** ${seed.$lineage.parents.map((p) => `${p.name} (\`${p.id}\`)`).join(', ')}`);
      } else {
        lines.push('- **Parents:** None (origin seed)');
      }
      if (seed.$lineage.breedingStrategy) {
        lines.push(`- **Breeding Strategy:** ${seed.$lineage.breedingStrategy}`);
      }
      if (seed.$lineage.mutationIntensity !== undefined) {
        lines.push(`- **Mutation Intensity:** ${seed.$lineage.mutationIntensity.toFixed(4)}`);
      }
      lines.push(`- **Timestamp:** ${seed.$lineage.timestamp}`);
      lines.push('');
    }

    // Metadata
    lines.push('## Metadata');
    lines.push('');
    lines.push(`- **Created:** ${new Date(seed.$metadata.created).toISOString()}`);
    if (seed.$metadata.creator) {
      lines.push(`- **Creator:** ${seed.$metadata.creator}`);
    }
    if (seed.$metadata.tags && seed.$metadata.tags.length > 0) {
      lines.push(`- **Tags:** ${seed.$metadata.tags.map((t) => `\`${t}\``).join(', ')}`);
    }
    lines.push('');

    lines.push('---');
    lines.push('*Generated by GSPL Paradigm*');

    return {
      format: 'markdown',
      content: lines.join('\n'),
      filename: `${safeFilename(seed.$name)}.md`,
      mimeType: 'text/markdown',
    };
  }
}

// ─────────────────────────────────────────────
// JSONExporter
// ─────────────────────────────────────────────

/** Exports seeds as pretty-printed JSON. */
export class JSONExporter {
  /** Export a single seed to JSON. */
  export(seed: UniversalSeed): ExportResult {
    return {
      format: 'json',
      content: JSON.stringify(seed, this.jsonReplacer, 2),
      filename: `${safeFilename(seed.$name)}.json`,
      mimeType: 'application/json',
    };
  }

  /** Export multiple seeds as a JSON array. */
  exportBatch(seeds: readonly UniversalSeed[]): ExportResult {
    return {
      format: 'json',
      content: JSON.stringify(seeds, this.jsonReplacer, 2),
      filename: 'seeds-batch.json',
      mimeType: 'application/json',
    };
  }

  /** Custom replacer handling Map, Set, and typed arrays. */
  private jsonReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Map) {
      return { __type: 'Map', entries: Array.from(value.entries()) };
    }
    if (value instanceof Set) {
      return { __type: 'Set', values: Array.from(value) };
    }
    if (value instanceof Float64Array) {
      return { __type: 'Float64Array', data: Array.from(value) };
    }
    if (value instanceof Float32Array) {
      return { __type: 'Float32Array', data: Array.from(value) };
    }
    if (value instanceof Uint8Array) {
      return { __type: 'Uint8Array', data: Array.from(value) };
    }
    return value;
  }
}

// ─────────────────────────────────────────────
// PythonExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a Python dataclass with typed fields. */
export class PythonExporter {
  /** Export a single seed to a Python dataclass. */
  export(seed: UniversalSeed): ExportResult {
    const className = toPascalCase(seed.$name) || 'GeneratedSeed';
    const entries = geneEntries(seed.genes);
    const lines: string[] = [];

    lines.push('"""');
    lines.push(`Auto-generated Python dataclass from GSPL Paradigm seed.`);
    lines.push('');
    lines.push(`Seed: ${seed.$name}`);
    lines.push(`Domain: ${seed.$domain}`);
    lines.push(`Hash: ${seed.$hash}`);
    lines.push(`Fitness: ${primaryFitness(seed).toFixed(4)}`);
    lines.push('"""');
    lines.push('');
    lines.push('from dataclasses import dataclass, field');
    lines.push('from typing import List');
    lines.push('');
    lines.push('');
    lines.push('@dataclass');
    lines.push(`class ${className}:`);
    lines.push(`    """${seed.$name} — Domain: ${seed.$domain}"""`);
    lines.push('');

    if (entries.length === 0) {
      lines.push('    pass');
    } else {
      for (const [name, gene] of entries) {
        const fieldName = toSnakeCase(name);
        const pyType = this.pythonType(gene);
        const pyValue = this.pythonDefault(gene);
        lines.push(`    ${fieldName}: ${pyType} = ${pyValue}`);
      }
    }

    lines.push('');
    lines.push('');
    lines.push(`# Domain: ${seed.$domain}`);
    lines.push(`# Generation: ${seed.$lineage.generation}`);
    lines.push(`# Primary Fitness: ${primaryFitness(seed).toFixed(4)}`);

    return {
      format: 'python',
      content: lines.join('\n'),
      filename: `${safeFilename(seed.$name)}.py`,
      mimeType: 'text/x-python',
    };
  }

  /** Map gene type to Python type annotation. */
  private pythonType(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return 'float';
      case 'categorical':
        return 'str';
      case 'vector':
        return 'List[float]';
      case 'expression':
        return 'str';
      case 'struct':
        return 'dict';
      case 'array':
        return 'list';
      case 'graph':
        return 'dict';
      case 'tensor':
        return 'List[float]';
      case 'timeseries':
        return 'list';
    }
  }

  /** Map gene to its Python default value literal. */
  private pythonDefault(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return gene.value.toString();
      case 'categorical':
        return `"${gene.value.replace(/"/g, '\\"')}"`;
      case 'vector':
        return `field(default_factory=lambda: [${gene.value.join(', ')}])`;
      case 'expression':
        return `"${gene.source.replace(/"/g, '\\"')}"`;
      case 'struct':
        return 'field(default_factory=dict)';
      case 'array':
        return 'field(default_factory=list)';
      case 'graph':
        return 'field(default_factory=dict)';
      case 'tensor':
        return `field(default_factory=lambda: [${Array.from(gene.data).join(', ')}])`;
      case 'timeseries':
        return 'field(default_factory=list)';
    }
  }
}

// ─────────────────────────────────────────────
// RustExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a Rust struct with derive macros. */
export class RustExporter {
  /** Export a single seed to a Rust struct definition. */
  export(seed: UniversalSeed): ExportResult {
    const structName = toPascalCase(seed.$name) || 'GeneratedSeed';
    const entries = geneEntries(seed.genes);
    const lines: string[] = [];

    lines.push(`//! Auto-generated Rust struct from GSPL Paradigm seed.`);
    lines.push(`//!`);
    lines.push(`//! Seed: ${seed.$name}`);
    lines.push(`//! Domain: ${seed.$domain}`);
    lines.push(`//! Hash: ${seed.$hash}`);
    lines.push(`//! Fitness: ${primaryFitness(seed).toFixed(4)}`);
    lines.push('');
    lines.push('#[derive(Debug, Clone, PartialEq)]');
    lines.push(`pub struct ${structName} {`);

    for (const [name, gene] of entries) {
      const fieldName = toSnakeCase(name);
      const rustType = this.rustType(gene);
      lines.push(`    pub ${fieldName}: ${rustType},`);
    }

    lines.push('}');
    lines.push('');

    // Default implementation
    lines.push(`impl Default for ${structName} {`);
    lines.push('    fn default() -> Self {');
    lines.push(`        ${structName} {`);

    for (const [name, gene] of entries) {
      const fieldName = toSnakeCase(name);
      const rustDefault = this.rustDefault(gene);
      lines.push(`            ${fieldName}: ${rustDefault},`);
    }

    lines.push('        }');
    lines.push('    }');
    lines.push('}');

    return {
      format: 'rust',
      content: lines.join('\n'),
      filename: `${safeFilename(seed.$name)}.rs`,
      mimeType: 'text/x-rust',
    };
  }

  /** Map gene type to Rust type. */
  private rustType(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return 'f64';
      case 'categorical':
        return 'String';
      case 'vector':
        return 'Vec<f64>';
      case 'expression':
        return 'String';
      case 'struct':
        return 'std::collections::HashMap<String, f64>';
      case 'array':
        return 'Vec<f64>';
      case 'graph':
        return 'std::collections::HashMap<String, Vec<String>>';
      case 'tensor':
        return 'Vec<f64>';
      case 'timeseries':
        return 'Vec<(f64, f64)>';
    }
  }

  /** Map gene to its Rust default value literal. */
  private rustDefault(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return `${gene.value}_f64`;
      case 'categorical':
        return `String::from("${gene.value.replace(/"/g, '\\"')}")`;
      case 'vector':
        return `vec![${gene.value.map((v) => `${v}_f64`).join(', ')}]`;
      case 'expression':
        return `String::from("${gene.source.replace(/"/g, '\\"')}")`;
      case 'struct':
        return 'std::collections::HashMap::new()';
      case 'array':
        return 'Vec::new()';
      case 'graph':
        return 'std::collections::HashMap::new()';
      case 'tensor':
        return `vec![${Array.from(gene.data).map((v) => `${v}_f64`).join(', ')}]`;
      case 'timeseries':
        return `vec![${gene.keyframes.map((kf) => `(${kf.t}_f64, ${kf.v}_f64)`).join(', ')}]`;
    }
  }
}

// ─────────────────────────────────────────────
// CSharpExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a Unity MonoBehaviour C# class. */
export class CSharpExporter {
  /** Export a single seed to a C# MonoBehaviour. */
  export(seed: UniversalSeed): ExportResult {
    const className = toPascalCase(seed.$name) || 'GeneratedSeed';
    const entries = geneEntries(seed.genes);
    const lines: string[] = [];

    lines.push('// Auto-generated C# MonoBehaviour from GSPL Paradigm seed.');
    lines.push(`// Seed: ${seed.$name}`);
    lines.push(`// Domain: ${seed.$domain}`);
    lines.push(`// Hash: ${seed.$hash}`);
    lines.push(`// Fitness: ${primaryFitness(seed).toFixed(4)}`);
    lines.push('');
    lines.push('using UnityEngine;');
    lines.push('using System.Collections.Generic;');
    lines.push('');
    lines.push(`/// <summary>${seed.$name} — Domain: ${seed.$domain}</summary>`);
    lines.push(`public class ${className} : MonoBehaviour`);
    lines.push('{');

    // Serialized fields
    for (const [name, gene] of entries) {
      const fieldName = toCamelCase(name);
      const csType = this.csharpType(gene);
      const csDefault = this.csharpDefault(gene);
      lines.push(`    [SerializeField]`);
      lines.push(`    private ${csType} ${fieldName} = ${csDefault};`);
      lines.push('');
    }

    // Public properties
    for (const [name, gene] of entries) {
      const fieldName = toCamelCase(name);
      const propName = toPascalCase(name);
      const csType = this.csharpType(gene);
      lines.push(`    public ${csType} ${propName} => ${fieldName};`);
    }
    lines.push('');

    // Start method
    lines.push('    private void Start()');
    lines.push('    {');
    lines.push(`        Debug.Log($"[GSPL] ${className} initialized — Domain: ${seed.$domain}, Fitness: ${primaryFitness(seed).toFixed(4)}");`);
    lines.push('    }');

    lines.push('}');

    return {
      format: 'csharp',
      content: lines.join('\n'),
      filename: `${toPascalCase(seed.$name) || 'GeneratedSeed'}.cs`,
      mimeType: 'text/x-csharp',
    };
  }

  /** Map gene type to C# type. */
  private csharpType(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return 'float';
      case 'categorical':
        return 'string';
      case 'vector':
        return 'float[]';
      case 'expression':
        return 'string';
      case 'struct':
        return 'Dictionary<string, float>';
      case 'array':
        return 'float[]';
      case 'graph':
        return 'Dictionary<string, List<string>>';
      case 'tensor':
        return 'float[]';
      case 'timeseries':
        return 'List<Vector2>';
    }
  }

  /** Map gene to its C# default value. */
  private csharpDefault(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return `${gene.value}f`;
      case 'categorical':
        return `"${gene.value.replace(/"/g, '\\"')}"`;
      case 'vector':
        return `new float[] { ${gene.value.map((v) => `${v}f`).join(', ')} }`;
      case 'expression':
        return `"${gene.source.replace(/"/g, '\\"')}"`;
      case 'struct':
        return 'new Dictionary<string, float>()';
      case 'array':
        return 'new float[] { }';
      case 'graph':
        return 'new Dictionary<string, List<string>>()';
      case 'tensor':
        return `new float[] { ${Array.from(gene.data).map((v) => `${v}f`).join(', ')} }`;
      case 'timeseries':
        return `new List<Vector2> { ${gene.keyframes.map((kf) => `new Vector2(${kf.t}f, ${kf.v}f)`).join(', ')} }`;
    }
  }
}

// ─────────────────────────────────────────────
// GDScriptExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a Godot GDScript with @export annotations. */
export class GDScriptExporter {
  /** Export a single seed to GDScript. */
  export(seed: UniversalSeed): ExportResult {
    const className = toPascalCase(seed.$name) || 'GeneratedSeed';
    const entries = geneEntries(seed.genes);
    const lines: string[] = [];

    lines.push(`## Auto-generated GDScript from GSPL Paradigm seed.`);
    lines.push(`## Seed: ${seed.$name}`);
    lines.push(`## Domain: ${seed.$domain}`);
    lines.push(`## Hash: ${seed.$hash}`);
    lines.push(`## Fitness: ${primaryFitness(seed).toFixed(4)}`);
    lines.push('');
    lines.push(`class_name ${className}`);
    lines.push('extends Node');
    lines.push('');

    // Exported fields
    for (const [name, gene] of entries) {
      const fieldName = toSnakeCase(name);
      const gdType = this.gdscriptType(gene);
      const gdDefault = this.gdscriptDefault(gene);
      lines.push(`@export var ${fieldName}: ${gdType} = ${gdDefault}`);
    }
    lines.push('');

    // Ready function
    lines.push('');
    lines.push('func _ready() -> void:');
    lines.push(`\tprint("[GSPL] ${className} ready — Domain: ${seed.$domain}")`);

    return {
      format: 'gdscript',
      content: lines.join('\n'),
      filename: `${safeFilename(seed.$name)}.gd`,
      mimeType: 'text/x-gdscript',
    };
  }

  /** Map gene type to GDScript type. */
  private gdscriptType(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return 'float';
      case 'categorical':
        return 'String';
      case 'vector':
        return 'Array[float]';
      case 'expression':
        return 'String';
      case 'struct':
        return 'Dictionary';
      case 'array':
        return 'Array';
      case 'graph':
        return 'Dictionary';
      case 'tensor':
        return 'Array[float]';
      case 'timeseries':
        return 'Array';
    }
  }

  /** Map gene to its GDScript default value. */
  private gdscriptDefault(gene: Gene): string {
    switch (gene.type) {
      case 'scalar':
        return gene.value.toString();
      case 'categorical':
        return `"${gene.value.replace(/"/g, '\\"')}"`;
      case 'vector':
        return `[${gene.value.join(', ')}]`;
      case 'expression':
        return `"${gene.source.replace(/"/g, '\\"')}"`;
      case 'struct':
        return '{}';
      case 'array':
        return '[]';
      case 'graph':
        return '{}';
      case 'tensor':
        return `[${Array.from(gene.data).join(', ')}]`;
      case 'timeseries':
        return '[]';
    }
  }
}

// ─────────────────────────────────────────────
// GLSLExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a GLSL fragment shader with gene-derived uniforms. */
export class GLSLExporter {
  /** Export a single seed to a GLSL fragment shader. */
  export(seed: UniversalSeed): ExportResult {
    const entries = geneEntries(seed.genes);
    const lines: string[] = [];

    lines.push('// Auto-generated GLSL fragment shader from GSPL Paradigm seed.');
    lines.push(`// Seed: ${seed.$name}`);
    lines.push(`// Domain: ${seed.$domain}`);
    lines.push(`// Hash: ${seed.$hash}`);
    lines.push(`// Fitness: ${primaryFitness(seed).toFixed(4)}`);
    lines.push('');
    lines.push('#version 300 es');
    lines.push('precision highp float;');
    lines.push('');
    lines.push('out vec4 fragColor;');
    lines.push('uniform vec2 uResolution;');
    lines.push('uniform float uTime;');
    lines.push('');

    // Gene uniforms
    const uniformNames: string[] = [];
    for (const [name, gene] of entries) {
      const uName = `u_${toSnakeCase(name)}`;
      uniformNames.push(uName);

      if (gene.type === 'vector' && (gene.dimensions === 3 || gene.dimensions === 4)) {
        const vecType = gene.dimensions === 4 ? 'vec4' : 'vec3';
        lines.push(`uniform ${vecType} ${uName}; // ${geneValueString(gene)}`);
      } else if (gene.type === 'vector' && gene.dimensions === 2) {
        lines.push(`uniform vec2 ${uName}; // ${geneValueString(gene)}`);
      } else if (gene.type === 'scalar') {
        lines.push(`uniform float ${uName}; // ${gene.value.toFixed(4)}`);
      }
    }
    lines.push('');

    // Main function with basic color output
    lines.push('void main() {');
    lines.push('    vec2 uv = gl_FragCoord.xy / uResolution;');
    lines.push('');

    // Build color from available genes
    const colorGenes = entries.filter(
      ([, g]) => g.type === 'vector' && (g as VectorGene).dimensions >= 3,
    );
    const scalarGenes = entries.filter(([, g]) => g.type === 'scalar');

    if (colorGenes.length > 0) {
      const firstColor = colorGenes[0];
      if (firstColor !== undefined) {
        const uName = `u_${toSnakeCase(firstColor[0])}`;
        const dim = (firstColor[1] as VectorGene).dimensions;
        if (dim === 4) {
          lines.push(`    vec4 baseColor = ${uName};`);
        } else {
          lines.push(`    vec4 baseColor = vec4(${uName}, 1.0);`);
        }
      } else {
        lines.push('    vec4 baseColor = vec4(uv, 0.5 + 0.5 * sin(uTime), 1.0);');
      }
    } else {
      lines.push('    vec4 baseColor = vec4(uv, 0.5 + 0.5 * sin(uTime), 1.0);');
    }

    if (scalarGenes.length > 0) {
      const firstScalar = scalarGenes[0];
      if (firstScalar !== undefined) {
        const uName = `u_${toSnakeCase(firstScalar[0])}`;
        lines.push(`    baseColor.rgb *= ${uName};`);
      }
    }

    lines.push('');
    lines.push('    fragColor = baseColor;');
    lines.push('}');

    return {
      format: 'glsl',
      content: lines.join('\n'),
      filename: `${safeFilename(seed.$name)}.frag`,
      mimeType: 'text/x-glsl',
    };
  }
}

// ─────────────────────────────────────────────
// CSVExporter
// ─────────────────────────────────────────────

/** Exports seed gene data in CSV format. */
export class CSVExporter {
  /** Export a single seed as CSV rows: gene_name, type, value. */
  export(seed: UniversalSeed): ExportResult {
    const entries = geneEntries(seed.genes);
    const lines: string[] = [];

    lines.push('gene_name,type,value');
    for (const [name, gene] of entries) {
      const val = this.csvEscape(geneValueString(gene));
      lines.push(`${this.csvEscape(name)},${gene.type},${val}`);
    }

    return {
      format: 'csv',
      content: lines.join('\n'),
      filename: `${safeFilename(seed.$name)}.csv`,
      mimeType: 'text/csv',
    };
  }

  /** Export multiple seeds as CSV with one seed per row and genes as columns. */
  exportBatch(seeds: readonly UniversalSeed[]): ExportResult {
    if (seeds.length === 0) {
      return {
        format: 'csv',
        content: '',
        filename: 'seeds-batch.csv',
        mimeType: 'text/csv',
      };
    }

    // Collect all unique gene names across seeds
    const allGeneNames = new Set<string>();
    for (const seed of seeds) {
      for (const name of Object.keys(seed.genes)) {
        allGeneNames.add(name);
      }
    }
    const geneNames = Array.from(allGeneNames).sort();

    // Header
    const header = ['name', 'domain', 'hash', 'fitness', ...geneNames];
    const lines: string[] = [];
    lines.push(header.map((h) => this.csvEscape(h)).join(','));

    // Rows
    for (const seed of seeds) {
      const row: string[] = [
        this.csvEscape(seed.$name),
        this.csvEscape(seed.$domain),
        this.csvEscape(seed.$hash),
        primaryFitness(seed).toFixed(4),
      ];
      for (const geneName of geneNames) {
        const gene = (seed.genes as Record<string, Gene | undefined>)[geneName];
        if (gene !== undefined) {
          row.push(this.csvEscape(geneValueString(gene)));
        } else {
          row.push('');
        }
      }
      lines.push(row.join(','));
    }

    return {
      format: 'csv',
      content: lines.join('\n'),
      filename: 'seeds-batch.csv',
      mimeType: 'text/csv',
    };
  }

  /** Escape a CSV field, quoting when necessary. */
  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

// ─────────────────────────────────────────────
// SVGExporter
// ─────────────────────────────────────────────

/** Exports a UniversalSeed as a visual SVG card with domain badge, fitness bar, and gene list. */
export class SVGExporter {
  /** Export a single seed as an SVG card. */
  export(seed: UniversalSeed): ExportResult {
    const entries = geneEntries(seed.genes);
    const fitness = primaryFitness(seed);
    const color = domainColor(seed.$domain);
    const fitnessPercent = Math.min(1, Math.max(0, fitness));

    const cardWidth = 400;
    const headerHeight = 70;
    const fitnessBarY = headerHeight + 20;
    const genesStartY = fitnessBarY + 40;
    const geneRowHeight = 24;
    const maxGenes = Math.min(entries.length, 20);
    const truncated = entries.length > maxGenes;
    const genesHeight = maxGenes * geneRowHeight + (truncated ? 24 : 0);
    const cardHeight = genesStartY + genesHeight + 30;

    const geneLines: string[] = [];
    for (let i = 0; i < maxGenes; i++) {
      const entry = entries[i];
      if (entry === undefined) continue;
      const [name, gene] = entry;
      const y = genesStartY + i * geneRowHeight + 16;
      const valStr = geneValueString(gene);
      const truncatedVal = valStr.length > 30 ? valStr.slice(0, 27) + '...' : valStr;
      geneLines.push(
        `    <text x="20" y="${y}" fill="#cbd5e1" font-size="11" font-family="monospace">${escapeHtml(name)}</text>`,
      );
      geneLines.push(
        `    <text x="170" y="${y}" fill="#64748b" font-size="10" font-family="monospace">${escapeHtml(gene.type)}</text>`,
      );
      geneLines.push(
        `    <text x="240" y="${y}" fill="#94a3b8" font-size="10" font-family="monospace">${escapeHtml(truncatedVal)}</text>`,
      );
    }
    if (truncated) {
      const y = genesStartY + maxGenes * geneRowHeight + 16;
      geneLines.push(
        `    <text x="20" y="${y}" fill="#475569" font-size="10" font-style="italic">... and ${entries.length - maxGenes} more genes</text>`,
      );
    }

    // Fitness gradient stop position
    const fitnessWidth = Math.round(340 * fitnessPercent);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cardWidth} ${cardHeight}" width="${cardWidth}" height="${cardHeight}">
  <defs>
    <linearGradient id="fitGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
    <clipPath id="fitClip">
      <rect x="30" y="${fitnessBarY + 16}" width="${fitnessWidth}" height="12" rx="6"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="#0f0f23"/>
  <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="none" stroke="#2d2d44" stroke-width="1"/>

  <!-- Header bar -->
  <rect width="${cardWidth}" height="${headerHeight}" rx="12" fill="${color}33"/>
  <rect y="${headerHeight - 1}" width="${cardWidth}" height="1" fill="#2d2d44"/>

  <!-- Seed name -->
  <text x="20" y="32" fill="#f8fafc" font-size="18" font-weight="bold" font-family="system-ui, sans-serif">${escapeHtml(seed.$name)}</text>

  <!-- Domain badge -->
  <rect x="20" y="42" width="${seed.$domain.length * 8 + 16}" height="20" rx="10" fill="${color}"/>
  <text x="28" y="56" fill="#ffffff" font-size="10" font-weight="600" font-family="system-ui, sans-serif" text-transform="uppercase">${escapeHtml(seed.$domain)}</text>

  <!-- Hash -->
  <text x="${cardWidth - 20}" y="56" fill="#64748b" font-size="9" font-family="monospace" text-anchor="end">${escapeHtml(seed.$hash.slice(0, 16))}</text>

  <!-- Fitness bar -->
  <text x="20" y="${fitnessBarY + 10}" fill="#94a3b8" font-size="10" font-family="system-ui, sans-serif">Fitness: ${fitness.toFixed(4)}</text>
  <rect x="30" y="${fitnessBarY + 16}" width="340" height="12" rx="6" fill="#1e293b"/>
  <rect x="30" y="${fitnessBarY + 16}" width="340" height="12" rx="6" fill="url(#fitGrad)" clip-path="url(#fitClip)"/>

  <!-- Genes -->
${geneLines.join('\n')}

</svg>`;

    return {
      format: 'svg',
      content: svg,
      filename: `${safeFilename(seed.$name)}.svg`,
      mimeType: 'image/svg+xml',
    };
  }
}

// ─────────────────────────────────────────────
// ExportEngine — Top-level router
// ─────────────────────────────────────────────

/** Central export engine that routes seeds to format-specific exporters. */
export class ExportEngine {
  private readonly htmlExporter: HTMLExporter;
  private readonly markdownExporter: MarkdownExporter;
  private readonly jsonExporter: JSONExporter;
  private readonly pythonExporter: PythonExporter;
  private readonly rustExporter: RustExporter;
  private readonly csharpExporter: CSharpExporter;
  private readonly gdscriptExporter: GDScriptExporter;
  private readonly glslExporter: GLSLExporter;
  private readonly csvExporter: CSVExporter;
  private readonly svgExporter: SVGExporter;

  constructor() {
    this.htmlExporter = new HTMLExporter();
    this.markdownExporter = new MarkdownExporter();
    this.jsonExporter = new JSONExporter();
    this.pythonExporter = new PythonExporter();
    this.rustExporter = new RustExporter();
    this.csharpExporter = new CSharpExporter();
    this.gdscriptExporter = new GDScriptExporter();
    this.glslExporter = new GLSLExporter();
    this.csvExporter = new CSVExporter();
    this.svgExporter = new SVGExporter();
  }

  /** Export a single seed in the specified format. */
  export(seed: UniversalSeed, format: ExportFormat): ExportResult {
    switch (format) {
      case 'html':
        return this.htmlExporter.export(seed);
      case 'markdown':
        return this.markdownExporter.export(seed);
      case 'json':
        return this.jsonExporter.export(seed);
      case 'python':
        return this.pythonExporter.export(seed);
      case 'rust':
        return this.rustExporter.export(seed);
      case 'csharp':
        return this.csharpExporter.export(seed);
      case 'gdscript':
        return this.gdscriptExporter.export(seed);
      case 'glsl':
        return this.glslExporter.export(seed);
      case 'csv':
        return this.csvExporter.export(seed);
      case 'svg':
        return this.svgExporter.export(seed);
    }
  }

  /** Export multiple seeds in the specified format. Batch-aware for JSON and CSV. */
  exportBatch(seeds: readonly UniversalSeed[], format: ExportFormat): ExportResult {
    switch (format) {
      case 'json':
        return this.jsonExporter.exportBatch(seeds);
      case 'csv':
        return this.csvExporter.exportBatch(seeds);
      default: {
        // For non-batch formats, concatenate individual exports with separators
        const results = seeds.map((seed) => this.export(seed, format));
        const separator = format === 'html' ? '\n<!-- --- -->\n' : '\n---\n';
        const combined = results.map((r) => r.content).join(separator);
        const ext = results[0]?.filename.split('.').pop() ?? format;
        return {
          format,
          content: combined,
          filename: `seeds-batch.${ext}`,
          mimeType: results[0]?.mimeType ?? 'application/octet-stream',
        };
      }
    }
  }

  /** Return all supported export formats. */
  getSupportedFormats(): ExportFormat[] {
    return ['html', 'markdown', 'json', 'python', 'rust', 'csharp', 'gdscript', 'glsl', 'csv', 'svg'];
  }

  /** Return the exporter instance for a given format. */
  getExporter(
    format: ExportFormat,
  ):
    | HTMLExporter
    | MarkdownExporter
    | JSONExporter
    | PythonExporter
    | RustExporter
    | CSharpExporter
    | GDScriptExporter
    | GLSLExporter
    | CSVExporter
    | SVGExporter {
    switch (format) {
      case 'html':
        return this.htmlExporter;
      case 'markdown':
        return this.markdownExporter;
      case 'json':
        return this.jsonExporter;
      case 'python':
        return this.pythonExporter;
      case 'rust':
        return this.rustExporter;
      case 'csharp':
        return this.csharpExporter;
      case 'gdscript':
        return this.gdscriptExporter;
      case 'glsl':
        return this.glslExporter;
      case 'csv':
        return this.csvExporter;
      case 'svg':
        return this.svgExporter;
    }
  }
}
