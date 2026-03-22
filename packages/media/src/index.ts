/**
 * @paradigm/media — Media analysis, audio synthesis, and format conversion.
 *
 * All synthesis is deterministic when a seed is provided.
 * No runtime npm dependencies — only @paradigm/types and @paradigm/rng.
 */

import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All supported media format identifiers. */
export type MediaFormat =
  | 'text'
  | 'markdown'
  | 'code'
  | 'json'
  | 'csv'
  | 'html'
  | 'svg'
  | 'png'
  | 'wav'
  | 'midi'
  | 'obj'
  | 'gltf'
  | 'pdf'
  | 'epub';

/** Sentiment analysis result. */
export interface SentimentResult {
  /** Normalised score in the range [-1, 1]. */
  score: number;
  /** Human-readable label derived from score. */
  label: 'positive' | 'neutral' | 'negative';
  positiveWords: string[];
  negativeWords: string[];
}

/** Full analysis report for a media item. */
export interface MediaAnalysis {
  format: MediaFormat;
  /** Byte size (or character count for text). */
  size: number;
  keywords: string[];
  sentiment: SentimentResult;
  entities: string[];
  summary: string;
  metadata: Record<string, unknown>;
}

/** PCM audio stream configuration. */
export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  duration: number;
}

/** Waveform oscillator parameters. */
export interface OscillatorConfig {
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
  frequency: number;
  amplitude: number;
  phase: number;
}

/** ADSR envelope in seconds / normalised sustain level. */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** A complete sound descriptor ready for synthesis. */
export interface SoundDescriptor {
  oscillators: OscillatorConfig[];
  envelope: Envelope;
  duration: number;
  effects?: {
    reverb?: number;
    delay?: number;
    distortion?: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
  'awesome', 'superb', 'brilliant', 'outstanding', 'perfect', 'love',
  'happy', 'joy', 'beautiful', 'best', 'incredible', 'magnificent',
  'positive', 'pleasant', 'delightful', 'enjoy', 'exciting', 'thrilling',
  'impressive', 'splendid', 'nice', 'fine', 'correct', 'right',
  'success', 'win', 'reward', 'benefit', 'improve', 'better',
  'innovative', 'creative', 'productive', 'effective', 'efficient',
  'reliable', 'trustworthy', 'honest', 'fair', 'kind', 'generous',
  'helpful', 'useful', 'valuable', 'worthy',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'dreadful', 'disgusting',
  'hate', 'despise', 'worst', 'ugly', 'failure', 'fail', 'broken',
  'wrong', 'error', 'problem', 'issue', 'bug', 'crash', 'corrupt',
  'useless', 'worthless', 'misleading', 'fraudulent', 'corrupt',
  'poor', 'inferior', 'inadequate', 'defective', 'flawed',
  'harmful', 'dangerous', 'toxic', 'destructive', 'damaging',
  'annoying', 'frustrating', 'disappointing', 'sad', 'angry',
  'unfair', 'dishonest', 'unreliable', 'unstable', 'insecure',
  'slow', 'expensive', 'complicated', 'confusing', 'unclear',
]);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
  'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over',
  'after', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'this', 'that', 'these', 'those', 'not', 'no', 'so', 'if',
  'as', 'each', 'all', 'both',
]);

// Musical note frequencies (MIDI 60 = C4 = 261.63 Hz)
const NOTE_FREQUENCIES: number[] = [
  261.63, 277.18, 293.66, 311.13, 329.63, 349.23,
  369.99, 392.00, 415.30, 440.00, 466.16, 493.88,
  523.25, 554.37, 587.33, 622.25, 659.25, 698.46,
  739.99, 783.99, 830.61, 880.00, 932.33, 987.77,
];

// ---------------------------------------------------------------------------
// SentimentAnalyzer
// ---------------------------------------------------------------------------

/** Lexicon-based sentiment analysis for plain text. */
export class SentimentAnalyzer {
  /**
   * Analyzes the sentiment of the supplied text.
   *
   * @param text - Input text to analyze.
   * @returns A SentimentResult with score, label, and matched word lists.
   */
  analyze(text: string): SentimentResult {
    const words = text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    const positiveWords: string[] = [];
    const negativeWords: string[] = [];

    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) positiveWords.push(word);
      if (NEGATIVE_WORDS.has(word)) negativeWords.push(word);
    }

    const total = words.length || 1;
    const score = (positiveWords.length - negativeWords.length) / total;
    const clamped = Math.max(-1, Math.min(1, score * 10));

    let label: SentimentResult['label'];
    if (clamped > 0.1) label = 'positive';
    else if (clamped < -0.1) label = 'negative';
    else label = 'neutral';

    return { score: clamped, label, positiveWords, negativeWords };
  }
}

// ---------------------------------------------------------------------------
// KeywordExtractor
// ---------------------------------------------------------------------------

/** Frequency-based keyword extractor with stop-word filtering. */
export class KeywordExtractor {
  /**
   * Extracts the top keywords from text by term frequency.
   *
   * @param text - Source text.
   * @param maxKeywords - Maximum number of keywords to return (default 10).
   * @returns Ordered array of keyword strings (most frequent first).
   */
  extract(text: string, maxKeywords: number = 10): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }
}

// ---------------------------------------------------------------------------
// MediaAnalyzer
// ---------------------------------------------------------------------------

/** Multi-format content analyzer. */
export class MediaAnalyzer {
  private readonly sentimentAnalyzer = new SentimentAnalyzer();
  private readonly keywordExtractor = new KeywordExtractor();

  /**
   * Analyze content according to the supplied (or auto-detected) format.
   *
   * @param content - Raw content string.
   * @param format - Explicit format, or omit to auto-detect.
   * @returns A fully populated MediaAnalysis.
   */
  analyze(content: string, format?: MediaFormat): MediaAnalysis {
    const resolved = format ?? this.detectFormat(content);

    switch (resolved) {
      case 'markdown': return this.analyzeMarkdown(content);
      case 'code':     return this.analyzeCode(content);
      case 'json':     return this.analyzeJSON(content);
      case 'csv':      return this.analyzeCSV(content);
      case 'html':     return this.analyzeHTML(content);
      case 'svg':      return this.analyzeSVG(content);
      default:         return this.analyzeText(content);
    }
  }

  /**
   * Auto-detects the most likely MediaFormat from content heuristics.
   *
   * @param content - Raw content string.
   * @returns The inferred MediaFormat.
   */
  detectFormat(content: string): MediaFormat {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('<svg')) return 'svg';
    if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) return 'html';
    if (trimmed.startsWith('<')) return 'html';
    if (/^[^\n]+,[^\n]+(\n[^\n]+,[^\n]*)*$/.test(trimmed.slice(0, 200))) return 'csv';
    if (/^#{1,6}\s|^\*\*|^__|\[.+\]\(.+\)/.test(trimmed)) return 'markdown';
    if (/^(import|export|function|class|const|let|var|def |#include)/.test(trimmed)) return 'code';
    return 'text';
  }

  /** Analyze plain text. */
  analyzeText(content: string): MediaAnalysis {
    const words = content.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;
    const charCount = content.length;

    const freq = new Map<string, number>();
    for (const word of words) {
      const clean = word.toLowerCase().replace(/[^a-z]/g, '');
      if (clean.length > 2) freq.set(clean, (freq.get(clean) ?? 0) + 1);
    }

    const keywords = this.keywordExtractor.extract(content);
    const sentiment = this.sentimentAnalyzer.analyze(content);
    const entities = this.extractEntities(content);

    return {
      format: 'text',
      size: charCount,
      keywords,
      sentiment,
      entities,
      summary: `Plain text with ${wordCount} words and ${charCount} characters.`,
      metadata: { wordCount, charCount, uniqueWords: freq.size },
    };
  }

  /** Analyze Markdown content. */
  analyzeMarkdown(content: string): MediaAnalysis {
    const headers = (content.match(/^#{1,6}\s.+/gm) ?? []).length;
    const links = (content.match(/\[.+?\]\(.+?\)/g) ?? []).length;
    const codeBlocks = (content.match(/```[\s\S]*?```/g) ?? []).length;

    const plainText = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/[*_`]/g, '');

    const base = this.analyzeText(plainText);

    return {
      ...base,
      format: 'markdown',
      summary: `Markdown with ${headers} headers, ${links} links, ${codeBlocks} code blocks.`,
      metadata: { ...base.metadata, headers, links, codeBlocks },
    };
  }

  /** Analyze source code. */
  analyzeCode(content: string): MediaAnalysis {
    const lines = content.split('\n');
    const totalLines = lines.length;

    const commentLines = lines.filter((l) =>
      /^\s*(\/\/|#|\/\*|\*|<!--)/.test(l)
    ).length;

    const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;

    let language = 'unknown';
    if (/^\s*(import|export|const|let|var|function|class|interface|type)\b/.test(content)) {
      language = content.includes(': ') ? 'typescript' : 'javascript';
    } else if (/^def |^class |^import |^from .+ import/.test(content)) {
      language = 'python';
    } else if (/#include|int main\(/.test(content)) {
      language = 'c/c++';
    } else if (/^package |^import "/.test(content)) {
      language = 'go';
    } else if (/^fn |^use |^let mut/.test(content)) {
      language = 'rust';
    }

    const keywords = this.keywordExtractor.extract(content);
    const sentiment = this.sentimentAnalyzer.analyze(content);

    return {
      format: 'code',
      size: content.length,
      keywords,
      sentiment,
      entities: [],
      summary: `${language} source code — ${totalLines} lines, ${Math.round(commentRatio * 100)}% comments.`,
      metadata: { language, totalLines, commentLines, commentRatio },
    };
  }

  /** Analyze JSON content. */
  analyzeJSON(content: string): MediaAnalysis {
    let parsed: unknown;
    let parseError: string | undefined;
    let schema: Record<string, string> = {};
    let keyCount = 0;

    try {
      parsed = JSON.parse(content);
      schema = this.extractJSONSchema(parsed);
      keyCount = Object.keys(schema).length;
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    const isArray = Array.isArray(parsed);
    const itemCount = isArray ? (parsed as unknown[]).length : undefined;

    return {
      format: 'json',
      size: content.length,
      keywords: Object.keys(schema).slice(0, 10),
      sentiment: { score: 0, label: 'neutral', positiveWords: [], negativeWords: [] },
      entities: [],
      summary: parseError
        ? `Invalid JSON: ${parseError}`
        : `JSON ${isArray ? `array (${itemCount} items)` : 'object'} with ${keyCount} top-level keys.`,
      metadata: { valid: !parseError, isArray, itemCount, schema, parseError },
    };
  }

  /** Analyze CSV content. */
  analyzeCSV(content: string): MediaAnalysis {
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const headers = lines[0]?.split(',').map((h) => h.trim()) ?? [];
    const rows = lines.length - 1;

    return {
      format: 'csv',
      size: content.length,
      keywords: headers.slice(0, 10),
      sentiment: { score: 0, label: 'neutral', positiveWords: [], negativeWords: [] },
      entities: [],
      summary: `CSV with ${headers.length} columns and ${rows} data rows.`,
      metadata: { columns: headers.length, rows, headers },
    };
  }

  /** Analyze HTML content. */
  analyzeHTML(content: string): MediaAnalysis {
    const tags = (content.match(/<[a-zA-Z][^>]*>/g) ?? []).length;
    const links = (content.match(/<a\s[^>]*href/g) ?? []).length;
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const base = this.analyzeText(plainText);

    return {
      ...base,
      format: 'html',
      summary: `HTML with ${tags} tags and ${links} links.`,
      metadata: { ...base.metadata, tags, links },
    };
  }

  /** Analyze SVG content. */
  analyzeSVG(content: string): MediaAnalysis {
    const elements = (content.match(/<[a-zA-Z][^>]*>/g) ?? []).length;
    const paths = (content.match(/<path/g) ?? []).length;
    const circles = (content.match(/<circle/g) ?? []).length;
    const rects = (content.match(/<rect/g) ?? []).length;

    const widthMatch = content.match(/width="([^"]+)"/);
    const heightMatch = content.match(/height="([^"]+)"/);

    return {
      format: 'svg',
      size: content.length,
      keywords: [],
      sentiment: { score: 0, label: 'neutral', positiveWords: [], negativeWords: [] },
      entities: [],
      summary: `SVG with ${elements} elements (${paths} paths, ${circles} circles, ${rects} rects).`,
      metadata: {
        elements, paths, circles, rects,
        width: widthMatch?.[1],
        height: heightMatch?.[1],
      },
    };
  }

  // --- Private helpers ---

  private extractEntities(text: string): string[] {
    const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) ?? [];
    const unique = [...new Set(matches)];
    return unique.slice(0, 20);
  }

  private extractJSONSchema(value: unknown, depth: number = 0): Record<string, string> {
    if (depth > 2 || typeof value !== 'object' || value === null) return {};
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// AudioSynthesizer
// ---------------------------------------------------------------------------

/** Deterministic audio synthesis from seeds or explicit parameters. */
export class AudioSynthesizer {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('audio-default');
  }

  /**
   * Build a SoundDescriptor driven by a UniversalSeed's gene array.
   *
   * Genes are expected to be numbers in [0, 1]. If fewer than 8 genes are
   * present, the remaining parameters fall back to deterministic defaults.
   *
   * @param seed - The UniversalSeed to derive audio from.
   * @returns A fully specified SoundDescriptor.
   */
  fromSeed(seed: UniversalSeed): SoundDescriptor {
    const genes = seed.genes ?? [];
    const g = (i: number, fallback: number): number =>
      typeof genes[i] === 'number' ? (genes[i] as number) : fallback;

    const waveforms: OscillatorConfig['waveform'][] = ['sine', 'square', 'sawtooth', 'triangle'];
    const waveformIndex = Math.floor(g(0, 0.5) * 4) % 4;

    const oscillators: OscillatorConfig[] = [
      {
        waveform: waveforms[waveformIndex] ?? 'sine',
        frequency: 110 + g(1, 0.5) * 440,
        amplitude: 0.4 + g(2, 0.5) * 0.4,
        phase: g(3, 0) * Math.PI * 2,
      },
      {
        waveform: 'sine',
        frequency: (110 + g(1, 0.5) * 440) * 2,
        amplitude: (0.4 + g(2, 0.5) * 0.4) * 0.3,
        phase: g(4, 0) * Math.PI * 2,
      },
    ];

    const envelope: Envelope = {
      attack:  0.01 + g(5, 0.1) * 0.2,
      decay:   0.05 + g(6, 0.1) * 0.15,
      sustain: 0.3  + g(7, 0.5) * 0.5,
      release: 0.1  + g(8, 0.2) * 0.4,
    };

    return {
      oscillators,
      envelope,
      duration: 0.5 + g(9, 0.5) * 2,
    };
  }

  /**
   * Generate a simple tone descriptor.
   *
   * @param frequency - Frequency in Hz.
   * @param duration - Duration in seconds.
   * @param waveform - Oscillator waveform type (default 'sine').
   * @returns SoundDescriptor for the tone.
   */
  generateTone(
    frequency: number,
    duration: number,
    waveform: OscillatorConfig['waveform'] = 'sine',
  ): SoundDescriptor {
    return {
      oscillators: [{ waveform, frequency, amplitude: 0.7, phase: 0 }],
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.1 },
      duration,
    };
  }

  /**
   * Generate a chord from multiple frequencies.
   *
   * @param frequencies - Array of frequencies in Hz.
   * @param duration - Duration in seconds.
   * @returns SoundDescriptor for the chord.
   */
  generateChord(frequencies: number[], duration: number): SoundDescriptor {
    const amplitude = 0.6 / Math.max(frequencies.length, 1);
    const oscillators: OscillatorConfig[] = frequencies.map((freq) => ({
      waveform: 'sine',
      frequency: freq,
      amplitude,
      phase: 0,
    }));
    return {
      oscillators,
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.15 },
      duration,
    };
  }

  /**
   * Generate a melodic sequence of notes from a seed.
   *
   * @param seed - Seed driving note selection and timing.
   * @param noteCount - Number of notes in the sequence (default 8).
   * @returns Array of SoundDescriptors, one per note.
   */
  generateMelody(seed: UniversalSeed, noteCount: number = 8): SoundDescriptor[] {
    const localRng = new DeterministicRNG(seed.$hash ?? 'melody');
    const notes: SoundDescriptor[] = [];

    for (let i = 0; i < noteCount; i++) {
      const noteIndex = Math.floor(localRng.next() * NOTE_FREQUENCIES.length);
      const frequency = NOTE_FREQUENCIES[noteIndex];
      const duration = 0.15 + localRng.next() * 0.35;
      const waveforms: OscillatorConfig['waveform'][] = ['sine', 'triangle'];
      const waveform = waveforms[Math.floor(localRng.next() * 2)];
      notes.push(this.generateTone(frequency ?? 440, duration, waveform ?? 'sine'));
    }

    return notes;
  }

  /**
   * Generate an ambient drone descriptor from a seed.
   *
   * Uses low-frequency oscillators with a slow-attack envelope.
   *
   * @param seed - Seed driving oscillator parameters.
   * @returns SoundDescriptor for the ambient sound.
   */
  generateAmbient(seed: UniversalSeed): SoundDescriptor {
    const localRng = new DeterministicRNG(seed.$hash ?? 'ambient');
    const baseFreq = 40 + localRng.next() * 80;

    const oscillators: OscillatorConfig[] = [
      { waveform: 'sine',     frequency: baseFreq,       amplitude: 0.5,  phase: 0 },
      { waveform: 'sine',     frequency: baseFreq * 1.5, amplitude: 0.25, phase: Math.PI / 4 },
      { waveform: 'triangle', frequency: baseFreq * 2,   amplitude: 0.15, phase: Math.PI / 2 },
    ];

    return {
      oscillators,
      envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 2.0 },
      duration: 8 + localRng.next() * 8,
      effects: { reverb: 0.6, delay: 0.3 },
    };
  }
}

// ---------------------------------------------------------------------------
// WAVEncoder
// ---------------------------------------------------------------------------

/** Encodes PCM sample arrays into RIFF WAV binaries. */
export class WAVEncoder {
  /**
   * Renders oscillator samples for a SoundDescriptor.
   *
   * @param descriptor - Sound to render.
   * @param sampleRate - Output sample rate in Hz (default 44100).
   * @returns Array of normalised PCM samples in [-1, 1].
   */
  renderSamples(descriptor: SoundDescriptor, sampleRate: number = 44100): number[] {
    const { oscillators, envelope, duration } = descriptor;
    const totalSamples = Math.floor(sampleRate * duration);
    const samples = new Array<number>(totalSamples).fill(0);

    const attackSamples  = Math.floor(envelope.attack  * sampleRate);
    const decaySamples   = Math.floor(envelope.decay   * sampleRate);
    const releaseSamples = Math.floor(envelope.release * sampleRate);
    const sustainStart   = attackSamples + decaySamples;
    const releaseStart   = Math.max(sustainStart, totalSamples - releaseSamples);

    for (let i = 0; i < totalSamples; i++) {
      // ADSR envelope gain
      let gain: number;
      if (i < attackSamples) {
        gain = attackSamples > 0 ? i / attackSamples : 1;
      } else if (i < sustainStart) {
        const t = decaySamples > 0 ? (i - attackSamples) / decaySamples : 1;
        gain = 1 - t * (1 - envelope.sustain);
      } else if (i < releaseStart) {
        gain = envelope.sustain;
      } else {
        const t = releaseSamples > 0 ? (i - releaseStart) / releaseSamples : 1;
        gain = envelope.sustain * (1 - t);
      }

      let sample = 0;
      const t = i / sampleRate;

      for (const osc of oscillators) {
        const angle = 2 * Math.PI * osc.frequency * t + osc.phase;
        let wave: number;
        switch (osc.waveform) {
          case 'sine':
            wave = Math.sin(angle);
            break;
          case 'square':
            wave = Math.sin(angle) >= 0 ? 1 : -1;
            break;
          case 'sawtooth':
            wave = 2 * ((osc.frequency * t + osc.phase / (2 * Math.PI)) % 1) - 1;
            break;
          case 'triangle': {
            const p = (osc.frequency * t + osc.phase / (2 * Math.PI)) % 1;
            wave = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
            break;
          }
        }
        sample += wave * osc.amplitude;
      }

      // Apply distortion if present
      const distortion = descriptor.effects?.distortion;
      if (distortion !== undefined && distortion > 0) {
        sample = Math.tanh(sample * (1 + distortion * 10));
      }

      samples[i] = sample * gain;
    }

    // Simple delay effect (feedback echo)
    const delay = descriptor.effects?.delay;
    if (delay !== undefined && delay > 0) {
      const delaySamples = Math.floor(sampleRate * 0.2);
      for (let i = delaySamples; i < totalSamples; i++) {
        samples[i] = (samples[i] ?? 0) + (samples[i - delaySamples] ?? 0) * delay * 0.4;
      }
    }

    return samples;
  }

  /**
   * Encode a PCM sample array as a RIFF WAV Uint8Array.
   *
   * @param samples - Normalised PCM samples in [-1, 1].
   * @param config - Audio configuration block.
   * @returns Raw WAV file bytes.
   */
  encode(samples: number[], config: AudioConfig): Uint8Array {
    const { sampleRate, channels, bitsPerSample } = config;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample * channels;
    const fileSize = 44 + dataSize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, str: string): void => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, fileSize - 8, true);
    writeString(8, 'WAVE');

    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);          // chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // PCM samples (16-bit signed)
    let offset = 44;
    for (const sample of samples) {
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = Math.round(clamped * 32767);
      for (let ch = 0; ch < channels; ch++) {
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return new Uint8Array(buffer);
  }

  /**
   * Encode a SoundDescriptor directly to WAV bytes.
   *
   * @param descriptor - Descriptor to synthesise and encode.
   * @param sampleRate - Output sample rate (default 44100).
   * @returns Raw WAV file bytes.
   */
  encodeDescriptor(descriptor: SoundDescriptor, sampleRate: number = 44100): Uint8Array {
    const samples = this.renderSamples(descriptor, sampleRate);
    const config: AudioConfig = {
      sampleRate,
      channels: 1,
      bitsPerSample: 16,
      duration: descriptor.duration,
    };
    return this.encode(samples, config);
  }

  /**
   * Convert WAV bytes to a Base64 string.
   *
   * @param wav - Raw WAV bytes.
   * @returns Base64-encoded string.
   */
  toBase64(wav: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < wav.length; i++) {
      binary += String.fromCharCode(wav[i]!);
    }
    return btoa(binary);
  }

  /**
   * Convert WAV bytes to a data: URL suitable for <audio> elements.
   *
   * @param wav - Raw WAV bytes.
   * @returns data:audio/wav;base64,... URL string.
   */
  toDataURL(wav: Uint8Array): string {
    return `data:audio/wav;base64,${this.toBase64(wav)}`;
  }
}

// ---------------------------------------------------------------------------
// MediaConverter
// ---------------------------------------------------------------------------

/** Lightweight lossless format converters (no external dependencies). */
export class MediaConverter {
  /**
   * Wrap plain text in a minimal Markdown document.
   *
   * @param text - Source text.
   * @param title - Optional document title (becomes an H1 heading).
   * @returns Markdown string.
   */
  textToMarkdown(text: string, title?: string): string {
    const heading = title ? `# ${title}\n\n` : '';
    const body = text
      .split('\n\n')
      .map((paragraph) => paragraph.trim())
      .filter((p) => p.length > 0)
      .join('\n\n');
    return `${heading}${body}\n`;
  }

  /**
   * Serialize an array of objects to a CSV string.
   *
   * @param json - Array of plain objects. All keys from the first object are
   *               used as column headers.
   * @returns CSV string with header row.
   * @throws {TypeError} When json is not an array.
   */
  jsonToCSV(json: unknown): string {
    if (!Array.isArray(json)) {
      throw new TypeError('jsonToCSV requires an array of objects.');
    }
    if (json.length === 0) return '';

    const headers = Object.keys(json[0] as Record<string, unknown>);
    const escape = (val: unknown): string => {
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };

    const rows = (json as Record<string, unknown>[]).map((row) =>
      headers.map((h) => escape(row[h])).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Parse a CSV string into an array of objects.
   *
   * @param csv - CSV string with a header row.
   * @returns Array of objects keyed by header names.
   */
  csvToJSON(csv: string): Record<string, string>[] {
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = this.parseCSVRow(lines[0]!);
    return lines.slice(1).map((line) => {
      const values = this.parseCSVRow(line);
      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        record[h] = values[i] ?? '';
      });
      return record;
    });
  }

  /**
   * Convert Markdown text to an HTML fragment.
   *
   * Supported syntax: headings (# through ######), **bold**, *italic*,
   * `inline code`, [links](url), unordered lists (- item), and paragraphs.
   *
   * @param markdown - Source Markdown string.
   * @returns HTML string (no wrapping <html> tag).
   */
  markdownToHTML(markdown: string): string {
    const lines = markdown.split('\n');
    const output: string[] = [];
    let inList = false;
    let inParagraph = false;

    const closeParagraph = (): void => {
      if (inParagraph) {
        output.push('</p>');
        inParagraph = false;
      }
    };

    const closeList = (): void => {
      if (inList) {
        output.push('</ul>');
        inList = false;
      }
    };

    const processInline = (text: string): string =>
      text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

    for (const raw of lines) {
      const line = raw.trimEnd();

      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch !== null) {
        closeList();
        closeParagraph();
        const level = headingMatch[1]!.length;
        output.push(`<h${level}>${processInline(headingMatch[2]!)}</h${level}>`);
        continue;
      }

      // Unordered list items
      const listMatch = line.match(/^[-*+]\s+(.+)/);
      if (listMatch !== null) {
        closeParagraph();
        if (!inList) {
          output.push('<ul>');
          inList = true;
        }
        output.push(`<li>${processInline(listMatch[1]!)}</li>`);
        continue;
      }

      // Blank line
      if (line.trim() === '') {
        closeList();
        closeParagraph();
        continue;
      }

      // Regular paragraph line
      closeList();
      if (!inParagraph) {
        output.push('<p>');
        inParagraph = true;
      }
      output.push(processInline(line));
    }

    closeList();
    closeParagraph();

    return output.join('\n');
  }

  // --- Private helpers ---

  private parseCSVRow(row: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }

    values.push(current);
    return values;
  }
}

// ---------------------------------------------------------------------------
// MediaEngine
// ---------------------------------------------------------------------------

/**
 * Unified facade that composes all media subsystems.
 *
 * Accepts an optional DeterministicRNG for fully deterministic synthesis.
 */
export class MediaEngine {
  private readonly analyzer: MediaAnalyzer;
  private readonly synthesizer: AudioSynthesizer;
  private readonly wavEncoder: WAVEncoder;
  private readonly converter: MediaConverter;
  private readonly keywordExtractor: KeywordExtractor;
  private readonly sentimentAnalyzer: SentimentAnalyzer;

  constructor(rng?: DeterministicRNG) {
    this.analyzer = new MediaAnalyzer();
    this.synthesizer = new AudioSynthesizer(rng);
    this.wavEncoder = new WAVEncoder();
    this.converter = new MediaConverter();
    this.keywordExtractor = new KeywordExtractor();
    this.sentimentAnalyzer = new SentimentAnalyzer();
  }

  /**
   * Analyze media content, optionally specifying the format.
   *
   * @param content - Raw content string.
   * @param format - Optional explicit MediaFormat.
   * @returns MediaAnalysis report.
   */
  analyze(content: string, format?: MediaFormat): MediaAnalysis {
    return this.analyzer.analyze(content, format);
  }

  /**
   * Auto-detect the format of content.
   *
   * @param content - Raw content string.
   * @returns Best-guess MediaFormat.
   */
  detectFormat(content: string): MediaFormat {
    return this.analyzer.detectFormat(content);
  }

  /**
   * Synthesize a SoundDescriptor from a UniversalSeed.
   *
   * @param seed - Driving seed.
   * @returns SoundDescriptor ready for encoding.
   */
  synthesizeAudio(seed: UniversalSeed): SoundDescriptor {
    return this.synthesizer.fromSeed(seed);
  }

  /**
   * Generate a melody sequence from a seed.
   *
   * @param seed - Driving seed.
   * @param noteCount - Number of notes (default 8).
   * @returns Array of per-note SoundDescriptors.
   */
  generateMelody(seed: UniversalSeed, noteCount?: number): SoundDescriptor[] {
    return this.synthesizer.generateMelody(seed, noteCount);
  }

  /**
   * Encode a SoundDescriptor to a WAV Uint8Array.
   *
   * @param descriptor - Sound to encode.
   * @param sampleRate - Output sample rate (default 44100).
   * @returns Raw WAV bytes.
   */
  encodeWAV(descriptor: SoundDescriptor, sampleRate?: number): Uint8Array {
    return this.wavEncoder.encodeDescriptor(descriptor, sampleRate);
  }

  /**
   * Access the MediaConverter for text/format transformations.
   *
   * @returns The shared MediaConverter instance.
   */
  get convert(): MediaConverter {
    return this.converter;
  }

  /**
   * Extract top keywords from text.
   *
   * @param text - Source text.
   * @param maxKeywords - Maximum keywords to return (default 10).
   * @returns Ordered keyword array.
   */
  extractKeywords(text: string, maxKeywords?: number): string[] {
    return this.keywordExtractor.extract(text, maxKeywords);
  }

  /**
   * Analyze the sentiment of text.
   *
   * @param text - Source text.
   * @returns SentimentResult with score and label.
   */
  analyzeSentiment(text: string): SentimentResult {
    return this.sentimentAnalyzer.analyze(text);
  }
}

// ---------------------------------------------------------------------------
// Named exports (re-export everything)
// ---------------------------------------------------------------------------

export {
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  STOP_WORDS,
  NOTE_FREQUENCIES,
};
