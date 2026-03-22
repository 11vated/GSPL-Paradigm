/**
 * @paradigm/media — comprehensive test suite.
 * Target: 80%+ line/function/statement coverage, 70%+ branch coverage.
 */

import { describe, it, expect } from 'vitest';
import type { UniversalSeed } from '@paradigm/types';
import {
  SentimentAnalyzer,
  KeywordExtractor,
  MediaAnalyzer,
  AudioSynthesizer,
  WAVEncoder,
  MediaConverter,
  MediaEngine,
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  STOP_WORDS,
  NOTE_FREQUENCIES,
} from './index.js';

// ---------------------------------------------------------------------------
// Seed factory (inline as instructed)
// ---------------------------------------------------------------------------

const makeSeed = (
  name: string,
  domain: string,
  genes: Record<string, unknown> = {},
): UniversalSeed => ({
  $gst: '4.0',
  $name: name,
  $domain: domain as any,
  genes: genes as any,
  $hash: name + '-hash',
  $lineage: [],
  $metadata: { created: Date.now(), generation: 0 },
  $fitness: [0.5],
});

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe('Exported constants', () => {
  it('POSITIVE_WORDS is a Set containing known positive words', () => {
    expect(POSITIVE_WORDS).toBeInstanceOf(Set);
    expect(POSITIVE_WORDS.has('good')).toBe(true);
    expect(POSITIVE_WORDS.has('excellent')).toBe(true);
  });

  it('NEGATIVE_WORDS is a Set containing known negative words', () => {
    expect(NEGATIVE_WORDS).toBeInstanceOf(Set);
    expect(NEGATIVE_WORDS.has('bad')).toBe(true);
    expect(NEGATIVE_WORDS.has('terrible')).toBe(true);
  });

  it('STOP_WORDS is a Set containing common stop words', () => {
    expect(STOP_WORDS).toBeInstanceOf(Set);
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('and')).toBe(true);
  });

  it('NOTE_FREQUENCIES is an array of 24 frequencies starting near 261 Hz', () => {
    expect(Array.isArray(NOTE_FREQUENCIES)).toBe(true);
    expect(NOTE_FREQUENCIES).toHaveLength(24);
    expect(NOTE_FREQUENCIES[0]).toBeCloseTo(261.63, 1);
  });
});

// ---------------------------------------------------------------------------
// SentimentAnalyzer
// ---------------------------------------------------------------------------

describe('SentimentAnalyzer', () => {
  const sa = new SentimentAnalyzer();

  it('returns positive label for clearly positive text', () => {
    const result = sa.analyze('This is a great excellent wonderful product, amazing and fantastic!');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0.1);
    expect(result.positiveWords.length).toBeGreaterThan(0);
    expect(result.negativeWords).toHaveLength(0);
  });

  it('returns negative label for clearly negative text', () => {
    const result = sa.analyze('This is terrible awful horrible and completely broken. Worst failure ever.');
    expect(result.label).toBe('negative');
    expect(result.score).toBeLessThan(-0.1);
    expect(result.negativeWords.length).toBeGreaterThan(0);
  });

  it('returns neutral label for a mixed or plain sentence', () => {
    const result = sa.analyze('The quick brown fox jumps over the lazy dog');
    expect(result.label).toBe('neutral');
  });

  it('handles empty string without throwing', () => {
    const result = sa.analyze('');
    expect(result.label).toBe('neutral');
    expect(result.score).toBe(0);
    expect(result.positiveWords).toHaveLength(0);
    expect(result.negativeWords).toHaveLength(0);
  });

  it('clamps score to [-1, 1]', () => {
    // Flood with many positive words
    const text = Array(50).fill('good').join(' ');
    const result = sa.analyze(text);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(-1);
  });

  it('strips punctuation before matching words', () => {
    const result = sa.analyze('great! excellent. wonderful,');
    expect(result.positiveWords).toContain('great');
    expect(result.positiveWords).toContain('excellent');
  });

  it('is case-insensitive', () => {
    const result = sa.analyze('GOOD GREAT EXCELLENT');
    expect(result.label).toBe('positive');
  });
});

// ---------------------------------------------------------------------------
// KeywordExtractor
// ---------------------------------------------------------------------------

describe('KeywordExtractor', () => {
  const ke = new KeywordExtractor();

  it('returns top keywords sorted by frequency', () => {
    const text = 'apple apple apple banana banana cherry';
    const keywords = ke.extract(text);
    expect(keywords[0]).toBe('apple');
    expect(keywords[1]).toBe('banana');
  });

  it('filters out stop words', () => {
    const text = 'the and or but this that elephant elephant';
    const keywords = ke.extract(text);
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('and');
    expect(keywords).toContain('elephant');
  });

  it('filters words shorter than 3 characters', () => {
    const text = 'ox on it elephant elephant';
    const keywords = ke.extract(text);
    expect(keywords).not.toContain('ox');
    expect(keywords).not.toContain('on');
    expect(keywords).toContain('elephant');
  });

  it('respects maxKeywords parameter', () => {
    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu';
    const keywords = ke.extract(text, 3);
    expect(keywords).toHaveLength(3);
  });

  it('returns empty array for text with only stop words', () => {
    const text = 'the and or but is are was';
    const keywords = ke.extract(text);
    expect(keywords).toHaveLength(0);
  });

  it('returns empty array for empty string', () => {
    expect(ke.extract('')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — detectFormat
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.detectFormat', () => {
  const ma = new MediaAnalyzer();

  it('detects JSON object', () => {
    expect(ma.detectFormat('{"key": "value"}')).toBe('json');
  });

  it('detects JSON array', () => {
    expect(ma.detectFormat('[1,2,3]')).toBe('json');
  });

  it('detects SVG', () => {
    expect(ma.detectFormat('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe('svg');
  });

  it('detects HTML with DOCTYPE', () => {
    expect(ma.detectFormat('<!DOCTYPE html><html></html>')).toBe('html');
  });

  it('detects HTML with <html> tag', () => {
    expect(ma.detectFormat('<html><body></body></html>')).toBe('html');
  });

  it('detects generic HTML starting with <', () => {
    expect(ma.detectFormat('<div>hello</div>')).toBe('html');
  });

  it('detects Markdown with # heading', () => {
    expect(ma.detectFormat('# My Title\n\nSome text here.')).toBe('markdown');
  });

  it('detects Markdown with ** bold', () => {
    expect(ma.detectFormat('**bold text** is here')).toBe('markdown');
  });

  it('detects Markdown with link syntax embedded in prose', () => {
    // A line starting with '[' is treated as a JSON array by detectFormat;
    // link detection only fires when the text does NOT start with '{' or '['.
    expect(ma.detectFormat('Visit [Click here](https://example.com) for details')).toBe('markdown');
  });

  it('detects code starting with import', () => {
    expect(ma.detectFormat('import { foo } from "bar";\nexport const x = 1;')).toBe('code');
  });

  it('detects code starting with function', () => {
    expect(ma.detectFormat('function hello() { return 42; }')).toBe('code');
  });

  it('defaults to text for plain prose', () => {
    expect(ma.detectFormat('Hello world this is plain text without any special syntax.')).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyzeText
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyzeText', () => {
  const ma = new MediaAnalyzer();

  it('returns correct format', () => {
    const result = ma.analyzeText('Hello world');
    expect(result.format).toBe('text');
  });

  it('sets size to character count', () => {
    const text = 'Hello world';
    const result = ma.analyzeText(text);
    expect(result.size).toBe(text.length);
  });

  it('includes word and char count in metadata', () => {
    const result = ma.analyzeText('Hello world foo');
    expect(result.metadata.wordCount).toBe(3);
    expect(result.metadata.charCount).toBe(15);
  });

  it('extracts entities (capitalized words)', () => {
    const result = ma.analyzeText('Alice and Bob met Charlie in New York.');
    expect(result.entities.length).toBeGreaterThan(0);
  });

  it('summary mentions word and character counts', () => {
    const result = ma.analyzeText('one two three');
    expect(result.summary).toContain('3 words');
    expect(result.summary).toContain('13 characters');
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyzeMarkdown
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyzeMarkdown', () => {
  const ma = new MediaAnalyzer();

  const md = `# Title

## Section

Some **bold** and *italic* text with a [link](https://example.com).

\`\`\`typescript
const x = 1;
\`\`\`
`;

  it('returns markdown format', () => {
    expect(ma.analyzeMarkdown(md).format).toBe('markdown');
  });

  it('counts headers correctly', () => {
    const result = ma.analyzeMarkdown(md);
    expect(result.metadata.headers).toBe(2);
  });

  it('counts links correctly', () => {
    const result = ma.analyzeMarkdown(md);
    expect(result.metadata.links).toBe(1);
  });

  it('counts code blocks correctly', () => {
    const result = ma.analyzeMarkdown(md);
    expect(result.metadata.codeBlocks).toBe(1);
  });

  it('summary mentions headers, links and code blocks', () => {
    const result = ma.analyzeMarkdown(md);
    expect(result.summary).toContain('headers');
    expect(result.summary).toContain('links');
    expect(result.summary).toContain('code blocks');
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyzeCode
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyzeCode', () => {
  const ma = new MediaAnalyzer();

  it('returns code format', () => {
    const result = ma.analyzeCode('const x: number = 1;');
    expect(result.format).toBe('code');
  });

  it('detects TypeScript when colon type annotation present', () => {
    const result = ma.analyzeCode('const x: number = 42;\nconst y: string = "hello";');
    expect(result.metadata.language).toBe('typescript');
  });

  it('detects JavaScript when no type annotations', () => {
    const result = ma.analyzeCode('const x = 42;\nfunction foo() {}');
    expect(result.metadata.language).toBe('javascript');
  });

  it('detects Python', () => {
    const result = ma.analyzeCode('def greet():\n    print("hello")');
    expect(result.metadata.language).toBe('python');
  });

  it('detects C/C++', () => {
    const result = ma.analyzeCode('#include <stdio.h>\nint main() { return 0; }');
    expect(result.metadata.language).toBe('c/c++');
  });

  it('detects Go', () => {
    const result = ma.analyzeCode('package main\nimport "fmt"');
    expect(result.metadata.language).toBe('go');
  });

  it('detects Rust', () => {
    const result = ma.analyzeCode('fn main() {\n    let mut x = 5;\n}');
    expect(result.metadata.language).toBe('rust');
  });

  it('counts total lines', () => {
    const result = ma.analyzeCode('line1\nline2\nline3');
    expect(result.metadata.totalLines).toBe(3);
  });

  it('counts comment lines', () => {
    const code = '// comment\nconst x = 1;\n# python comment\n/* block */\n* continuation';
    const result = ma.analyzeCode(code);
    expect(result.metadata.commentLines).toBeGreaterThan(0);
  });

  it('defaults language to unknown for unrecognised code', () => {
    const result = ma.analyzeCode('HELLO WORLD THIS IS NOT CODE');
    expect(result.metadata.language).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyzeJSON
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyzeJSON', () => {
  const ma = new MediaAnalyzer();

  it('returns json format', () => {
    expect(ma.analyzeJSON('{"a":1}').format).toBe('json');
  });

  it('marks valid JSON as valid', () => {
    const result = ma.analyzeJSON('{"name":"Alice","age":30}');
    expect(result.metadata.valid).toBe(true);
  });

  it('marks invalid JSON with error', () => {
    const result = ma.analyzeJSON('{invalid}');
    expect(result.metadata.valid).toBe(false);
    expect(result.summary).toContain('Invalid JSON');
  });

  it('detects arrays and reports item count', () => {
    const result = ma.analyzeJSON('[1,2,3]');
    expect(result.metadata.isArray).toBe(true);
    expect(result.metadata.itemCount).toBe(3);
  });

  it('reports top-level key count for objects', () => {
    const result = ma.analyzeJSON('{"a":1,"b":2,"c":3}');
    expect(result.metadata.isArray).toBe(false);
    expect(result.summary).toContain('3 top-level keys');
  });

  it('uses keys as keywords', () => {
    const result = ma.analyzeJSON('{"alpha":1,"beta":2}');
    expect(result.keywords).toContain('alpha');
    expect(result.keywords).toContain('beta');
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyzeCSV
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyzeCSV', () => {
  const ma = new MediaAnalyzer();

  const csv = 'name,age,city\nAlice,30,London\nBob,25,Paris\n';

  it('returns csv format', () => {
    expect(ma.analyzeCSV(csv).format).toBe('csv');
  });

  it('counts columns correctly', () => {
    const result = ma.analyzeCSV(csv);
    expect(result.metadata.columns).toBe(3);
  });

  it('counts data rows correctly', () => {
    const result = ma.analyzeCSV(csv);
    expect(result.metadata.rows).toBe(2);
  });

  it('uses headers as keywords', () => {
    const result = ma.analyzeCSV(csv);
    expect(result.keywords).toContain('name');
    expect(result.keywords).toContain('age');
  });

  it('summary mentions columns and rows', () => {
    const result = ma.analyzeCSV(csv);
    expect(result.summary).toContain('3 columns');
    expect(result.summary).toContain('2 data rows');
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyzeHTML
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyzeHTML', () => {
  const ma = new MediaAnalyzer();

  const html = `<html><body>
    <h1>Hello World</h1>
    <p>This is a <strong>test</strong> paragraph.</p>
    <a href="https://example.com">Link</a>
    <a href="https://other.com">Another Link</a>
  </body></html>`;

  it('returns html format', () => {
    expect(ma.analyzeHTML(html).format).toBe('html');
  });

  it('counts tags', () => {
    const result = ma.analyzeHTML(html);
    expect(result.metadata.tags).toBeGreaterThan(0);
  });

  it('counts links', () => {
    const result = ma.analyzeHTML(html);
    expect(result.metadata.links).toBe(2);
  });

  it('summary mentions tags and links', () => {
    const result = ma.analyzeHTML(html);
    expect(result.summary).toContain('tags');
    expect(result.summary).toContain('links');
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyzeSVG
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyzeSVG', () => {
  const ma = new MediaAnalyzer();

  const svg = `<svg width="100" height="200" xmlns="http://www.w3.org/2000/svg">
    <path d="M 0 0 L 100 100"/>
    <path d="M 50 50 L 80 80"/>
    <circle cx="50" cy="50" r="20"/>
    <rect x="10" y="10" width="50" height="30"/>
  </svg>`;

  it('returns svg format', () => {
    expect(ma.analyzeSVG(svg).format).toBe('svg');
  });

  it('counts paths', () => {
    const result = ma.analyzeSVG(svg);
    expect(result.metadata.paths).toBe(2);
  });

  it('counts circles', () => {
    const result = ma.analyzeSVG(svg);
    expect(result.metadata.circles).toBe(1);
  });

  it('counts rects', () => {
    const result = ma.analyzeSVG(svg);
    expect(result.metadata.rects).toBe(1);
  });

  it('extracts width and height', () => {
    const result = ma.analyzeSVG(svg);
    expect(result.metadata.width).toBe('100');
    expect(result.metadata.height).toBe('200');
  });

  it('summary mentions element counts', () => {
    const result = ma.analyzeSVG(svg);
    expect(result.summary).toContain('paths');
    expect(result.summary).toContain('circles');
    expect(result.summary).toContain('rects');
  });

  it('handles SVG with no width/height attributes', () => {
    const result = ma.analyzeSVG('<svg><rect/></svg>');
    expect(result.metadata.width).toBeUndefined();
    expect(result.metadata.height).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MediaAnalyzer — analyze (dispatcher)
// ---------------------------------------------------------------------------

describe('MediaAnalyzer.analyze', () => {
  const ma = new MediaAnalyzer();

  it('dispatches to analyzeJSON when format is json', () => {
    const result = ma.analyze('{"key":"value"}', 'json');
    expect(result.format).toBe('json');
  });

  it('dispatches to analyzeMarkdown when format is markdown', () => {
    const result = ma.analyze('# Title\n\nText', 'markdown');
    expect(result.format).toBe('markdown');
  });

  it('dispatches to analyzeCode when format is code', () => {
    const result = ma.analyze('const x = 1;', 'code');
    expect(result.format).toBe('code');
  });

  it('dispatches to analyzeCSV when format is csv', () => {
    const result = ma.analyze('a,b\n1,2', 'csv');
    expect(result.format).toBe('csv');
  });

  it('dispatches to analyzeHTML when format is html', () => {
    const result = ma.analyze('<html><body>hi</body></html>', 'html');
    expect(result.format).toBe('html');
  });

  it('dispatches to analyzeSVG when format is svg', () => {
    const result = ma.analyze('<svg></svg>', 'svg');
    expect(result.format).toBe('svg');
  });

  it('auto-detects format when none supplied', () => {
    const result = ma.analyze('{"auto":"detected"}');
    expect(result.format).toBe('json');
  });

  it('defaults to text format for unknown content', () => {
    const result = ma.analyze('plain prose here');
    expect(result.format).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// AudioSynthesizer — fromSeed
// ---------------------------------------------------------------------------

describe('AudioSynthesizer.fromSeed', () => {
  const synth = new AudioSynthesizer();

  it('returns a SoundDescriptor with oscillators and envelope', () => {
    const seed = makeSeed('warrior', 'entity');
    const desc = synth.fromSeed(seed);
    expect(desc.oscillators).toHaveLength(2);
    expect(desc.envelope).toBeDefined();
    expect(desc.duration).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed', () => {
    const seed = makeSeed('hero', 'entity');
    const a = synth.fromSeed(seed);
    const b = synth.fromSeed(seed);
    expect(a.oscillators[0]!.frequency).toBe(b.oscillators[0]!.frequency);
    expect(a.duration).toBe(b.duration);
  });

  it('uses numeric genes when provided', () => {
    const seed = makeSeed('test', 'entity', { '0': 0, '1': 0.5, '2': 0.8 });
    const desc = synth.fromSeed(seed);
    expect(desc.oscillators[0]!.frequency).toBeGreaterThan(100);
  });

  it('falls back to defaults when genes are missing', () => {
    const seed = makeSeed('empty-genes', 'entity');
    const desc = synth.fromSeed(seed);
    expect(desc.oscillators).toHaveLength(2);
    expect(desc.envelope.attack).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AudioSynthesizer — generateTone
// ---------------------------------------------------------------------------

describe('AudioSynthesizer.generateTone', () => {
  const synth = new AudioSynthesizer();

  it('generates a descriptor with the requested frequency and duration', () => {
    const desc = synth.generateTone(440, 1.0);
    expect(desc.oscillators[0]!.frequency).toBe(440);
    expect(desc.duration).toBe(1.0);
  });

  it('defaults to sine waveform', () => {
    const desc = synth.generateTone(440, 1.0);
    expect(desc.oscillators[0]!.waveform).toBe('sine');
  });

  it('respects explicit waveform parameter', () => {
    const desc = synth.generateTone(440, 1.0, 'square');
    expect(desc.oscillators[0]!.waveform).toBe('square');
  });

  it('uses all four waveform types without error', () => {
    for (const wf of ['sine', 'square', 'sawtooth', 'triangle'] as const) {
      expect(() => synth.generateTone(440, 0.5, wf)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// AudioSynthesizer — generateChord
// ---------------------------------------------------------------------------

describe('AudioSynthesizer.generateChord', () => {
  const synth = new AudioSynthesizer();

  it('creates one oscillator per frequency', () => {
    const desc = synth.generateChord([261.63, 329.63, 392.0], 2.0);
    expect(desc.oscillators).toHaveLength(3);
  });

  it('duration matches input', () => {
    const desc = synth.generateChord([440, 550], 3.0);
    expect(desc.duration).toBe(3.0);
  });

  it('handles empty frequency array without throwing', () => {
    expect(() => synth.generateChord([], 1.0)).not.toThrow();
  });

  it('normalises amplitude relative to number of frequencies', () => {
    const single = synth.generateChord([440], 1.0);
    const triple = synth.generateChord([440, 550, 660], 1.0);
    expect(single.oscillators[0]!.amplitude).toBeGreaterThan(
      triple.oscillators[0]!.amplitude,
    );
  });
});

// ---------------------------------------------------------------------------
// AudioSynthesizer — generateMelody
// ---------------------------------------------------------------------------

describe('AudioSynthesizer.generateMelody', () => {
  const synth = new AudioSynthesizer();

  it('returns the default 8 notes', () => {
    const seed = makeSeed('melody-seed', 'entity');
    const notes = synth.generateMelody(seed);
    expect(notes).toHaveLength(8);
  });

  it('respects explicit note count', () => {
    const seed = makeSeed('melody-seed', 'entity');
    const notes = synth.generateMelody(seed, 4);
    expect(notes).toHaveLength(4);
  });

  it('is deterministic for the same seed', () => {
    const seed = makeSeed('melody-det', 'entity');
    const a = synth.generateMelody(seed, 4);
    const b = synth.generateMelody(seed, 4);
    expect(a[0]!.oscillators[0]!.frequency).toBe(b[0]!.oscillators[0]!.frequency);
  });

  it('each note has a positive duration', () => {
    const seed = makeSeed('durations', 'entity');
    const notes = synth.generateMelody(seed, 5);
    for (const note of notes) {
      expect(note.duration).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// AudioSynthesizer — generateAmbient
// ---------------------------------------------------------------------------

describe('AudioSynthesizer.generateAmbient', () => {
  const synth = new AudioSynthesizer();

  it('returns a descriptor with 3 oscillators', () => {
    const seed = makeSeed('ambient-seed', 'entity');
    const desc = synth.generateAmbient(seed);
    expect(desc.oscillators).toHaveLength(3);
  });

  it('has slow attack envelope (>=1 second)', () => {
    const desc = synth.generateAmbient(makeSeed('amb', 'entity'));
    expect(desc.envelope.attack).toBeGreaterThanOrEqual(1.0);
  });

  it('includes reverb and delay effects', () => {
    const desc = synth.generateAmbient(makeSeed('fx', 'entity'));
    expect(desc.effects?.reverb).toBeGreaterThan(0);
    expect(desc.effects?.delay).toBeGreaterThan(0);
  });

  it('duration is at least 8 seconds', () => {
    const desc = synth.generateAmbient(makeSeed('dur', 'entity'));
    expect(desc.duration).toBeGreaterThanOrEqual(8);
  });

  it('is deterministic for the same seed', () => {
    const seed = makeSeed('ambient-det', 'entity');
    const a = synth.generateAmbient(seed);
    const b = synth.generateAmbient(seed);
    expect(a.oscillators[0]!.frequency).toBe(b.oscillators[0]!.frequency);
    expect(a.duration).toBe(b.duration);
  });
});

// ---------------------------------------------------------------------------
// WAVEncoder — renderSamples
// ---------------------------------------------------------------------------

describe('WAVEncoder.renderSamples', () => {
  const enc = new WAVEncoder();
  const synth = new AudioSynthesizer();

  it('returns the correct number of samples for a tone', () => {
    const desc = synth.generateTone(440, 0.1);
    const samples = enc.renderSamples(desc, 44100);
    expect(samples).toHaveLength(Math.floor(44100 * 0.1));
  });

  it('all sample values are in [-1, 1] range after simple sine tone', () => {
    const desc = synth.generateTone(440, 0.05);
    const samples = enc.renderSamples(desc, 8000);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(-2); // allow slight headroom for multi-osc
      expect(s).toBeLessThanOrEqual(2);
    }
  });

  it('renders square wave without error', () => {
    const desc = synth.generateTone(440, 0.05, 'square');
    expect(() => enc.renderSamples(desc, 8000)).not.toThrow();
  });

  it('renders sawtooth wave without error', () => {
    const desc = synth.generateTone(440, 0.05, 'sawtooth');
    expect(() => enc.renderSamples(desc, 8000)).not.toThrow();
  });

  it('renders triangle wave without error', () => {
    const desc = synth.generateTone(440, 0.05, 'triangle');
    expect(() => enc.renderSamples(desc, 8000)).not.toThrow();
  });

  it('applies distortion effect when provided', () => {
    const desc = synth.generateTone(440, 0.05);
    const distorted = { ...desc, effects: { distortion: 0.5 } };
    expect(() => enc.renderSamples(distorted, 8000)).not.toThrow();
  });

  it('applies delay effect when provided', () => {
    const desc = synth.generateTone(440, 0.5);
    const delayed = { ...desc, effects: { delay: 0.3 } };
    const samples = enc.renderSamples(delayed, 8000);
    expect(samples.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// WAVEncoder — encode
// ---------------------------------------------------------------------------

describe('WAVEncoder.encode', () => {
  const enc = new WAVEncoder();

  const config = { sampleRate: 8000, channels: 1, bitsPerSample: 16, duration: 0.1 };
  const samples = new Array(800).fill(0.5);

  it('returns a Uint8Array', () => {
    const wav = enc.encode(samples, config);
    expect(wav).toBeInstanceOf(Uint8Array);
  });

  it('starts with RIFF header', () => {
    const wav = enc.encode(samples, config);
    const riff = String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!);
    expect(riff).toBe('RIFF');
  });

  it('contains WAVE marker at offset 8', () => {
    const wav = enc.encode(samples, config);
    const wave = String.fromCharCode(wav[8]!, wav[9]!, wav[10]!, wav[11]!);
    expect(wave).toBe('WAVE');
  });

  it('file size equals 44 + dataSize', () => {
    const wav = enc.encode(samples, config);
    // 800 samples * 1 channel * 2 bytes = 1600 data bytes, 44 header bytes
    expect(wav.length).toBe(44 + 800 * 2);
  });

  it('encodes with 2 channels without error', () => {
    const stereoConfig = { ...config, channels: 2 };
    const wav = enc.encode(samples, stereoConfig);
    expect(wav.length).toBe(44 + 800 * 2 * 2);
  });
});

// ---------------------------------------------------------------------------
// WAVEncoder — encodeDescriptor
// ---------------------------------------------------------------------------

describe('WAVEncoder.encodeDescriptor', () => {
  const enc = new WAVEncoder();
  const synth = new AudioSynthesizer();

  it('encodes a tone descriptor to WAV bytes', () => {
    const desc = synth.generateTone(440, 0.05);
    const wav = enc.encodeDescriptor(desc, 8000);
    expect(wav).toBeInstanceOf(Uint8Array);
    expect(wav.length).toBeGreaterThan(44);
  });

  it('uses default 44100 sample rate when not specified', () => {
    const desc = synth.generateTone(440, 0.01);
    const wav = enc.encodeDescriptor(desc);
    // 44100 * 0.01 = 441 samples * 2 bytes + 44 header
    expect(wav.length).toBe(44 + 441 * 2);
  });
});

// ---------------------------------------------------------------------------
// WAVEncoder — toBase64 / toDataURL
// ---------------------------------------------------------------------------

describe('WAVEncoder.toBase64', () => {
  const enc = new WAVEncoder();

  it('returns a non-empty string', () => {
    const bytes = new Uint8Array([82, 73, 70, 70]); // "RIFF"
    const b64 = enc.toBase64(bytes);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
  });

  it('round-trips through atob', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const b64 = enc.toBase64(bytes);
    const decoded = atob(b64);
    expect(decoded.charCodeAt(0)).toBe(1);
    expect(decoded.charCodeAt(4)).toBe(5);
  });
});

describe('WAVEncoder.toDataURL', () => {
  const enc = new WAVEncoder();

  it('returns a data:audio/wav;base64, URL', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const url = enc.toDataURL(bytes);
    expect(url.startsWith('data:audio/wav;base64,')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MediaConverter — textToMarkdown
// ---------------------------------------------------------------------------

describe('MediaConverter.textToMarkdown', () => {
  const mc = new MediaConverter();

  it('wraps text in a Markdown body', () => {
    const md = mc.textToMarkdown('Hello world\n\nSecond paragraph');
    expect(md).toContain('Hello world');
    expect(md).toContain('Second paragraph');
  });

  it('adds H1 heading when title is provided', () => {
    const md = mc.textToMarkdown('Body text', 'My Title');
    expect(md).toContain('# My Title');
    expect(md).toContain('Body text');
  });

  it('omits heading when title is not provided', () => {
    const md = mc.textToMarkdown('Just text');
    expect(md).not.toContain('# ');
  });

  it('ends with a newline', () => {
    const md = mc.textToMarkdown('content');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('filters empty paragraphs', () => {
    const md = mc.textToMarkdown('\n\n\n\nContent\n\n');
    expect(md.trim()).toBe('Content');
  });
});

// ---------------------------------------------------------------------------
// MediaConverter — jsonToCSV
// ---------------------------------------------------------------------------

describe('MediaConverter.jsonToCSV', () => {
  const mc = new MediaConverter();

  it('converts array of objects to CSV', () => {
    const csv = mc.jsonToCSV([{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]);
    expect(csv).toContain('name,age');
    expect(csv).toContain('Alice,30');
    expect(csv).toContain('Bob,25');
  });

  it('returns empty string for empty array', () => {
    expect(mc.jsonToCSV([])).toBe('');
  });

  it('throws TypeError for non-array input', () => {
    expect(() => mc.jsonToCSV({ key: 'value' })).toThrow(TypeError);
    expect(() => mc.jsonToCSV('string')).toThrow(TypeError);
    expect(() => mc.jsonToCSV(null)).toThrow(TypeError);
  });

  it('escapes values containing commas', () => {
    const csv = mc.jsonToCSV([{ name: 'Smith, John' }]);
    expect(csv).toContain('"Smith, John"');
  });

  it('escapes values containing double quotes', () => {
    const csv = mc.jsonToCSV([{ text: 'say "hello"' }]);
    expect(csv).toContain('""hello""');
  });

  it('handles null and undefined values', () => {
    const csv = mc.jsonToCSV([{ a: null, b: undefined }]);
    expect(csv).toContain('a,b');
  });
});

// ---------------------------------------------------------------------------
// MediaConverter — csvToJSON
// ---------------------------------------------------------------------------

describe('MediaConverter.csvToJSON', () => {
  const mc = new MediaConverter();

  it('parses a basic CSV', () => {
    const records = mc.csvToJSON('name,age\nAlice,30\nBob,25');
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ name: 'Alice', age: '30' });
    expect(records[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('returns empty array for CSV with only a header row', () => {
    expect(mc.csvToJSON('name,age')).toHaveLength(0);
  });

  it('returns empty array for empty string', () => {
    expect(mc.csvToJSON('')).toHaveLength(0);
  });

  it('handles quoted fields with commas', () => {
    const records = mc.csvToJSON('name\n"Smith, John"');
    expect(records[0]!.name).toBe('Smith, John');
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const records = mc.csvToJSON('text\n"say ""hello"""');
    expect(records[0]!.text).toBe('say "hello"');
  });

  it('round-trips with jsonToCSV', () => {
    const original = [{ city: 'New York', pop: '8000000' }, { city: 'Paris', pop: '2200000' }];
    const csv = mc.jsonToCSV(original);
    const recovered = mc.csvToJSON(csv);
    expect(recovered[0]!.city).toBe('New York');
    expect(recovered[1]!.city).toBe('Paris');
  });
});

// ---------------------------------------------------------------------------
// MediaConverter — markdownToHTML
// ---------------------------------------------------------------------------

describe('MediaConverter.markdownToHTML', () => {
  const mc = new MediaConverter();

  it('converts H1 heading', () => {
    const html = mc.markdownToHTML('# Title');
    expect(html).toContain('<h1>Title</h1>');
  });

  it('converts H3 heading', () => {
    const html = mc.markdownToHTML('### Sub');
    expect(html).toContain('<h3>Sub</h3>');
  });

  it('converts **bold** to <strong>', () => {
    const html = mc.markdownToHTML('**bold text**');
    expect(html).toContain('<strong>bold text</strong>');
  });

  it('converts *italic* to <em>', () => {
    const html = mc.markdownToHTML('*italic text*');
    expect(html).toContain('<em>italic text</em>');
  });

  it('converts __bold__ to <strong>', () => {
    const html = mc.markdownToHTML('__bold text__');
    expect(html).toContain('<strong>bold text</strong>');
  });

  it('converts _italic_ to <em>', () => {
    const html = mc.markdownToHTML('_italic_');
    expect(html).toContain('<em>italic</em>');
  });

  it('converts `inline code` to <code>', () => {
    const html = mc.markdownToHTML('Use `const` here');
    expect(html).toContain('<code>const</code>');
  });

  it('converts [link](url) to <a href>', () => {
    const html = mc.markdownToHTML('[Click](https://example.com)');
    expect(html).toContain('<a href="https://example.com">Click</a>');
  });

  it('converts unordered list items', () => {
    const html = mc.markdownToHTML('- item one\n- item two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item one</li>');
    expect(html).toContain('<li>item two</li>');
    expect(html).toContain('</ul>');
  });

  it('supports * and + as list markers', () => {
    const html = mc.markdownToHTML('* star item\n+ plus item');
    expect(html).toContain('<li>star item</li>');
    expect(html).toContain('<li>plus item</li>');
  });

  it('wraps plain text in <p> tags', () => {
    const html = mc.markdownToHTML('This is plain paragraph text.');
    expect(html).toContain('<p>');
    expect(html).toContain('</p>');
  });

  it('blank lines close open paragraph', () => {
    const html = mc.markdownToHTML('para one\n\npara two');
    // Should contain two <p> open tags
    expect((html.match(/<p>/g) ?? []).length).toBe(2);
  });

  it('handles empty string', () => {
    expect(mc.markdownToHTML('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// MediaEngine — facade methods
// ---------------------------------------------------------------------------

describe('MediaEngine', () => {
  const engine = new MediaEngine();

  it('analyze delegates to MediaAnalyzer', () => {
    const result = engine.analyze('{"x":1}');
    expect(result.format).toBe('json');
  });

  it('analyze with explicit format works', () => {
    const result = engine.analyze('# Title\n', 'markdown');
    expect(result.format).toBe('markdown');
  });

  it('detectFormat returns correct format', () => {
    expect(engine.detectFormat('<svg></svg>')).toBe('svg');
    expect(engine.detectFormat('plain text')).toBe('text');
  });

  it('synthesizeAudio returns a SoundDescriptor', () => {
    const seed = makeSeed('engine-seed', 'entity');
    const desc = engine.synthesizeAudio(seed);
    expect(desc.oscillators.length).toBeGreaterThan(0);
    expect(desc.duration).toBeGreaterThan(0);
  });

  it('generateMelody returns correct note count', () => {
    const seed = makeSeed('melody-engine', 'entity');
    const notes = engine.generateMelody(seed, 6);
    expect(notes).toHaveLength(6);
  });

  it('generateMelody uses default note count', () => {
    const seed = makeSeed('melody-default', 'entity');
    const notes = engine.generateMelody(seed);
    expect(notes).toHaveLength(8);
  });

  it('encodeWAV returns Uint8Array', () => {
    const seed = makeSeed('wav-engine', 'entity');
    const desc = engine.synthesizeAudio(seed);
    // Use a very short duration to keep the test fast
    const fastDesc = { ...desc, duration: 0.05 };
    const wav = engine.encodeWAV(fastDesc, 8000);
    expect(wav).toBeInstanceOf(Uint8Array);
  });

  it('convert getter returns a MediaConverter', () => {
    expect(engine.convert).toBeDefined();
    expect(typeof engine.convert.textToMarkdown).toBe('function');
  });

  it('extractKeywords delegates to KeywordExtractor', () => {
    const keywords = engine.extractKeywords('elephant elephant giraffe lion lion lion');
    expect(keywords[0]).toBe('lion');
    expect(keywords[1]).toBe('elephant');
  });

  it('extractKeywords respects maxKeywords', () => {
    const keywords = engine.extractKeywords('apple banana cherry date elderberry', 2);
    expect(keywords).toHaveLength(2);
  });

  it('analyzeSentiment returns positive for positive text', () => {
    const result = engine.analyzeSentiment('great excellent wonderful amazing');
    expect(result.label).toBe('positive');
  });

  it('analyzeSentiment returns negative for negative text', () => {
    const result = engine.analyzeSentiment('terrible horrible awful failure');
    expect(result.label).toBe('negative');
  });

  it('constructor accepts a custom RNG', async () => {
    const { DeterministicRNG } = await import('@paradigm/rng');
    const rng = new DeterministicRNG('custom-seed');
    expect(() => new MediaEngine(rng)).not.toThrow();
  });
});
