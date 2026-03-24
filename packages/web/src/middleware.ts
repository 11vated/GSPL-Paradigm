/**
 * Middleware utilities for the WebEngine: rate limiting, request logging, error formatting.
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────
// Rate Limiter — Token bucket per client
// ─────────────────────────────────────────────

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

/**
 * Token-bucket rate limiter with per-client tracking.
 * Each client gets a bucket that refills at a configurable rate.
 */
export class RateLimiter {
  private readonly buckets: Map<string, BucketEntry> = new Map();
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly windowMs: number;

  /**
   * @param maxRequests - Maximum requests per window (e.g., 100).
   * @param windowMs - Time window in milliseconds (e.g., 1000 for 1 second).
   */
  constructor(maxRequests: number, windowMs: number = 1000) {
    this.maxTokens = maxRequests;
    this.refillRate = maxRequests / windowMs;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request from the given client should be allowed.
   *
   * @param clientId - Client identifier (IP address, API key, etc.).
   * @returns Object with `allowed` boolean and `remaining` tokens.
   */
  check(clientId: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(clientId, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refilled = elapsed * this.refillRate;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refilled);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
    }

    // Calculate when 1 token will be available
    const retryAfterMs = Math.ceil((1 - bucket.tokens) / this.refillRate);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  /** Remove stale buckets that haven't been accessed recently. */
  cleanup(maxIdleMs: number = 60_000): void {
    const now = Date.now();
    for (const [clientId, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxIdleMs) {
        this.buckets.delete(clientId);
      }
    }
  }

  /** Get count of tracked clients. */
  getClientCount(): number {
    return this.buckets.size;
  }
}

// ─────────────────────────────────────────────
// Request Timer — Structured logging
// ─────────────────────────────────────────────

export interface RequestLog {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly timestamp: number;
  readonly clientId?: string;
}

/**
 * Simple request logger that records timing and status.
 * Keeps a rolling buffer of recent requests for diagnostics.
 */
export class RequestLogger {
  private readonly buffer: RequestLog[] = [];
  private readonly maxBuffer: number;

  constructor(maxBuffer: number = 1000) {
    this.maxBuffer = maxBuffer;
  }

  /** Record a completed request. */
  record(log: RequestLog): void {
    this.buffer.push(log);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }
  }

  /** Get recent request logs. */
  getRecent(count: number = 50): readonly RequestLog[] {
    return this.buffer.slice(-count);
  }

  /** Get average response time over recent requests. */
  getAvgDurationMs(count: number = 100): number {
    const recent = this.buffer.slice(-count);
    if (recent.length === 0) return 0;
    const total = recent.reduce((sum, r) => sum + r.durationMs, 0);
    return total / recent.length;
  }

  /** Get total request count. */
  getTotalRequests(): number {
    return this.buffer.length;
  }
}

// ─────────────────────────────────────────────
// Error Response Formatter
// ─────────────────────────────────────────────

/** Structured error response body. */
export interface ErrorResponse {
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly context?: Record<string, unknown>;
  readonly timestamp: number;
}

/** Format a structured error response. */
export function formatError(
  code: string,
  message: string,
  context?: Record<string, unknown>,
): ErrorResponse {
  return {
    error: code,
    code,
    message,
    context,
    timestamp: Date.now(),
  };
}

/** Format a rate limit exceeded response. */
export function formatRateLimitError(retryAfterMs: number): ErrorResponse {
  return formatError(
    'RATE_LIMIT_EXCEEDED',
    `Too many requests. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
    { retryAfterMs },
  );
}

/** Format a validation error response. */
export function formatValidationError(
  details: Array<{ path: string; message: string }>,
): ErrorResponse {
  const summary = details.map((d) => d.path ? `${d.path}: ${d.message}` : d.message).join('; ');
  return formatError('VALIDATION_ERROR', summary, { details });
}
