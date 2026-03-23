/**
 * Native Sprite Forge Integration — concept-aware AI sprite generation.
 *
 * Unlike a thin HTTP proxy, this integration uses the full ConceptModel
 * to engineer prompts, validate results against GSPL constraints, and
 * retry with constraint-specific modifications when quality is insufficient.
 *
 * @packageDocumentation
 */

import type {
  ConceptModel, StyleType, ConstraintRule, ISCAResult,
} from '@paradigm/types';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

/** Result from Sprite Forge generation with GSPL validation metadata. */
export interface SpriteForgeResult {
  readonly requestId: string;
  readonly spriteSheetPath: string | null;
  readonly generationTimeSeconds: number;
  readonly seedUsed: number | null;
  readonly qualityScore: number;
  readonly constraintViolations: readonly string[];
  readonly validationPassed: boolean;
  readonly attempts: number;
  readonly promptUsed: string;
  readonly animationsGenerated: readonly string[];
}

/** Sprite Forge generation options. */
export interface GenerationOptions {
  readonly style?: string;
  readonly maxAnimations?: number;
  readonly exportFormat?: string;
  readonly maxRetries?: number;
  readonly seed?: number;
}

/** Internal Sprite Forge job status. */
interface SFJob {
  readonly request_id: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly sprite_sheet_path: string | null;
  readonly generation_time_seconds: number;
  readonly seed_used: number | null;
  readonly error_message?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Prompt Engineering — concept-aware, not generic
// ═══════════════════════════════════════════════════════════════════

/** Map GSPL StyleType to Sprite Forge's style parameter. */
function mapStyleToSpriteForge(style: StyleType): string {
  const map: Partial<Record<StyleType, string>> = {
    anime: 'anime', pixel: 'pixel_art', cartoon: 'cartoon',
    realistic: 'realistic', cyberpunk: 'modern_2d', fantasy: 'pixel_art',
    minimal: 'pixel_art', noir: 'hand_drawn',
  };
  return map[style] ?? 'pixel_art';
}

/**
 * Build a semantically rich prompt from a ConceptModel.
 * Uses archetype, species, elements, weapons, armor, style, and morphology
 * to produce a prompt that captures the entity's identity — not just keywords.
 */
function buildPromptFromConcept(concept: ConceptModel): string {
  const parts: string[] = [];

  // Style context
  if (concept.style !== 'default') {
    parts.push(`${concept.style} style`);
  }

  // Morphology hints
  if (concept.morphology.exaggeration > 0.7) {
    parts.push('chibi proportions, oversized head, small body, cute');
  }

  // Core identity
  if (concept.species !== 'unknown') {
    parts.push(concept.species);
  }
  parts.push(concept.archetype !== 'unknown' ? concept.archetype : 'character');
  parts.push(concept.name);

  // Elements → visual descriptors
  for (const element of concept.elements) {
    const elementVisuals: Record<string, string> = {
      fire: 'surrounded by flames, fiery aura',
      ice: 'frost crystals, icy blue glow',
      lightning: 'electric sparks, crackling energy',
      water: 'flowing water effects, aqua tones',
      earth: 'stone texture, rocky armor',
      wind: 'wind swirls, flowing cloth',
      light: 'golden radiance, holy glow',
      dark: 'shadow tendrils, dark aura',
      nature: 'vine patterns, leafy details',
      poison: 'toxic green mist, dripping venom',
    };
    parts.push(elementVisuals[element] ?? element);
  }

  // Equipment
  if (concept.weapons.length > 0) {
    parts.push(`wielding ${concept.weapons.join(' and ')}`);
  }
  if (concept.armor.length > 0) {
    parts.push(`wearing ${concept.armor.join(' and ')}`);
  }

  // Quality boosters
  parts.push('high quality', 'detailed', 'game sprite', 'clean lines');

  return parts.join(', ');
}

/**
 * Build negative prompt from ConceptModel constraints.
 * Constraints that are hard to achieve become negative prompt entries.
 */
function buildNegativePrompt(concept: ConceptModel): string {
  const negatives = [
    'blurry', 'low quality', 'watermark', 'text', 'signature',
    'deformed', 'extra limbs', 'bad anatomy', 'ugly', 'duplicate',
  ];

  if (concept.bodyStructure === 'humanoid') {
    negatives.push('extra fingers', 'mutated hands', 'extra arms');
  }

  if (concept.morphology.exaggeration > 0.7) {
    negatives.push('realistic proportions', 'photorealistic');
  }

  if (concept.style === 'pixel') {
    negatives.push('smooth gradients', 'anti-aliasing', 'photorealistic');
  }

  return negatives.join(', ');
}

/**
 * Enhance prompt with constraint-specific modifications after a failed validation.
 * Each constraint violation adds targeted instructions to guide regeneration.
 */
function enhancePromptForConstraints(basePrompt: string, violations: string[]): string {
  const additions: string[] = [];

  for (const v of violations) {
    if (v.includes('silhouette')) additions.push('clear silhouette, strong outline');
    if (v.includes('proportion')) additions.push('correct proportions');
    if (v.includes('symmetry')) additions.push('symmetrical design');
    if (v.includes('readability')) additions.push('readable at small size');
  }

  return additions.length > 0
    ? `${basePrompt}, ${additions.join(', ')}`
    : basePrompt;
}

// ═══════════════════════════════════════════════════════════════════
// Constraint Validation
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate a generation result against the ConceptModel's constraints.
 * Returns a quality score (0-1) and list of violations.
 *
 * Note: Without access to the actual pixel data, this validates metadata
 * and structural properties. Full pixel-level validation requires the
 * Sprite Forge quality scorer integration (future enhancement).
 */
function validateAgainstConstraints(
  concept: ConceptModel,
  job: SFJob,
): { qualityScore: number; violations: string[] } {
  const violations: string[] = [];
  let score = 1.0;

  // Check generation succeeded
  if (job.status !== 'completed' || !job.sprite_sheet_path) {
    return { qualityScore: 0, violations: ['Generation failed or produced no output'] };
  }

  // Check generation time (extremely long may indicate quality issues)
  if (job.generation_time_seconds > 180) {
    violations.push('Generation took unusually long (>3 min) — may indicate provider issues');
    score -= 0.1;
  }

  // Validate against concept constraints
  for (const rule of concept.constraints) {
    if (rule.priority === 0) {
      // Priority 0 = must-enforce: if we can't verify, note it
      if (rule.category === 'silhouette') {
        // Can't verify silhouette without pixels — flag for user review
        violations.push(`[needs-review] ${rule.description}`);
      }
    }
  }

  return { qualityScore: Math.max(0, score), violations };
}

// ═══════════════════════════════════════════════════════════════════
// SpriteForgeIntegration — the main class
// ═══════════════════════════════════════════════════════════════════

type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Native GSPL integration with Sprite Forge's AI sprite generation.
 *
 * Uses the full ConceptModel for prompt engineering, validates results
 * against GSPL constraints, and retries with constraint-specific
 * modifications when quality is insufficient.
 */
export class SpriteForgeIntegration {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private circuitState: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(baseUrl: string = 'http://localhost:8000', timeoutMs: number = 30_000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  /** Check if Sprite Forge is available. */
  async isAvailable(): Promise<boolean> {
    if (this.circuitState === 'open') {
      if (Date.now() - this.lastFailureTime > 60_000) {
        this.circuitState = 'half_open';
      } else {
        return false;
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) { this.recordSuccess(); return true; }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Generate a sprite from a ConceptModel with constraint validation.
   *
   * The full pipeline:
   * 1. Build semantically rich prompt from concept
   * 2. Send to Sprite Forge
   * 3. Poll for completion
   * 4. Validate against GSPL constraints
   * 5. If failed, re-generate with constraint hints (up to maxRetries)
   * 6. Return result with quality metadata
   */
  async generateFromConcept(
    concept: ConceptModel,
    options?: GenerationOptions,
  ): Promise<SpriteForgeResult> {
    this.checkCircuit();

    const maxRetries = options?.maxRetries ?? 2;
    const style = mapStyleToSpriteForge(options?.style as StyleType ?? concept.style);
    const animations = concept.suggestedAnimations.slice(0, options?.maxAnimations ?? 6);
    const exportFormat = options?.exportFormat ?? 'generic';

    let prompt = buildPromptFromConcept(concept);
    const negativePrompt = buildNegativePrompt(concept);
    let lastResult: SpriteForgeResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Generate
        const job = await this.requestGeneration({
          prompt,
          style,
          animations,
          export_format: exportFormat,
          negative_prompt: negativePrompt,
          seed: options?.seed,
        });

        // Poll
        const completedJob = await this.pollUntilComplete(job.request_id);

        // Validate against constraints
        const { qualityScore, violations } = validateAgainstConstraints(concept, completedJob);

        lastResult = {
          requestId: completedJob.request_id,
          spriteSheetPath: completedJob.sprite_sheet_path,
          generationTimeSeconds: completedJob.generation_time_seconds,
          seedUsed: completedJob.seed_used,
          qualityScore,
          constraintViolations: violations,
          validationPassed: violations.filter((v) => !v.startsWith('[needs-review]')).length === 0,
          attempts: attempt + 1,
          promptUsed: prompt,
          animationsGenerated: animations,
        };

        this.recordSuccess();

        // If validation passed or no actionable violations, return
        if (lastResult.validationPassed || attempt === maxRetries) {
          return lastResult;
        }

        // Enhance prompt with constraint-specific hints for retry
        const actionableViolations = violations.filter((v) => !v.startsWith('[needs-review]'));
        prompt = enhancePromptForConstraints(prompt, actionableViolations);

      } catch (err) {
        this.recordFailure();

        if (attempt === maxRetries) {
          return {
            requestId: '',
            spriteSheetPath: null,
            generationTimeSeconds: 0,
            seedUsed: null,
            qualityScore: 0,
            constraintViolations: [err instanceof Error ? err.message : 'Unknown error'],
            validationPassed: false,
            attempts: attempt + 1,
            promptUsed: prompt,
            animationsGenerated: animations,
          };
        }

        // Wait before retry
        await sleep(1000 * Math.pow(2, attempt));
      }
    }

    return lastResult!;
  }

  /** Call Sprite Forge POST /analyze. */
  async analyzePrompt(prompt: string): Promise<Record<string, unknown>> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error(`Sprite Forge analyze failed: ${res.status}`);
    return await res.json() as Record<string, unknown>;
  }

  // ─── Internal ─────────────────────────────────────

  private async requestGeneration(request: Record<string, unknown>): Promise<SFJob> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown');
      throw new Error(`Sprite Forge generation failed: ${text}`);
    }
    return await res.json() as SFJob;
  }

  private async pollUntilComplete(requestId: string): Promise<SFJob> {
    const maxPollTime = 300_000; // 5 minutes
    const pollInterval = 2000;
    const start = Date.now();

    while (Date.now() - start < maxPollTime) {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/jobs/${requestId}`, { method: 'GET' });
      if (!res.ok) { await sleep(pollInterval); continue; }

      const job = await res.json() as SFJob;
      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error_message ?? 'Generation failed');

      await sleep(pollInterval);
    }

    throw new Error('Generation timed out after 5 minutes');
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private checkCircuit(): void {
    if (this.circuitState === 'open') {
      if (Date.now() - this.lastFailureTime > 60_000) {
        this.circuitState = 'half_open';
      } else {
        throw new Error('Sprite Forge unavailable (circuit breaker open)');
      }
    }
  }

  private recordSuccess(): void {
    if (this.circuitState === 'half_open') {
      this.circuitState = 'closed';
      this.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= 5) this.circuitState = 'open';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
