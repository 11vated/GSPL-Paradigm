/**
 * @paradigm/runtime — World simulation, GSPL execution, and the complete standard library.
 *
 * Key design decisions vs old codebase:
 * 1. Explicit result types replace exception-based control flow (ReturnSignal/BreakSignal/ContinueSignal)
 * 2. Zero Node.js-specific imports (no `path`, no `require`, no `module-resolver`)
 * 3. Seed version bumped to $gst: '4.0'
 * 4. All 162+ stdlib functions ported as built-in GSPL functions
 * 5. Configurable survival threshold (was hardcoded 0.05)
 *
 * @packageDocumentation
 */

import type {
  UniversalSeed,
  GeneMap,
  Gene,
  SeedDomain,
  FitnessVector,
  SeedMetadata,
  ActivationState,
  LineageRecord,
  ParadigmEvent,
  WorldChangedEvent,
  SimulationStepEvent,
  CrossoverStrategy,
  GeneType,
} from '@paradigm/types';

import { createSeed, mutateSeed, breedSeeds } from '@paradigm/seed';
import { DeterministicRNG, DefaultSimulationClock, type SimulationClock } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import type { Program, Stmt, Expr, IdentifierExpr } from '@paradigm/lang';
import { TokenType, Lexer, Parser } from '@paradigm/lang';

// ═══════════════════════════════════════════════
// STANDARD LIBRARY
// ═══════════════════════════════════════════════

// ── Math ──────────────────────────────────────

export const stdlib_PI = Math.PI;
export const stdlib_E = Math.E;
export const stdlib_TAU = Math.PI * 2;

export function stdlib_sin(x: number): number { return Math.sin(x); }
export function stdlib_cos(x: number): number { return Math.cos(x); }
export function stdlib_tan(x: number): number { return Math.tan(x); }
export function stdlib_asin(x: number): number { return Math.asin(x); }
export function stdlib_acos(x: number): number { return Math.acos(x); }
export function stdlib_atan(x: number): number { return Math.atan(x); }
export function stdlib_atan2(y: number, x: number): number { return Math.atan2(y, x); }
export function stdlib_sqrt(x: number): number { return Math.sqrt(x); }
export function stdlib_cbrt(x: number): number { return Math.cbrt(x); }
export function stdlib_pow(x: number, y: number): number { return Math.pow(x, y); }
export function stdlib_abs(x: number): number { return Math.abs(x); }
export function stdlib_floor(x: number): number { return Math.floor(x); }
export function stdlib_ceil(x: number): number { return Math.ceil(x); }
export function stdlib_round(x: number): number { return Math.round(x); }
export function stdlib_trunc(x: number): number { return Math.trunc(x); }
export function stdlib_sign(x: number): number { return Math.sign(x); }
export function stdlib_clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}
export function stdlib_lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function stdlib_inverseLerp(a: number, b: number, x: number): number {
  return (x - a) / (b - a);
}
export function stdlib_remap(x: number, a1: number, a2: number, b1: number, b2: number): number {
  return stdlib_lerp(b1, b2, stdlib_inverseLerp(a1, a2, x));
}
export function stdlib_fract(x: number): number { return x - Math.floor(x); }
export function stdlib_mod(x: number, y: number): number { return ((x % y) + y) % y; }
export function stdlib_log(x: number): number { return Math.log(x); }
export function stdlib_log2(x: number): number { return Math.log2(x); }
export function stdlib_log10(x: number): number { return Math.log10(x); }
export function stdlib_exp(x: number): number { return Math.exp(x); }
export function stdlib_min(...values: number[]): number { return Math.min(...values); }
export function stdlib_max(...values: number[]): number { return Math.max(...values); }
export function stdlib_hypot(x: number, y: number): number { return Math.hypot(x, y); }
export function stdlib_toRadians(degrees: number): number { return degrees * (Math.PI / 180); }
export function stdlib_toDegrees(radians: number): number { return radians * (180 / Math.PI); }
export function stdlib_isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}
export function stdlib_gcd(a: number, b: number): number {
  while (b !== 0) { const t = b; b = a % b; a = t; }
  return Math.abs(a);
}
export function stdlib_lcm(a: number, b: number): number {
  return Math.abs(a * b) / stdlib_gcd(a, b);
}
export function stdlib_fibonacci(n: number): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) { const t = a + b; a = b; b = t; }
  return b;
}
export function stdlib_factorial(n: number): number {
  if (n < 0) throw new Error('Factorial of negative number');
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}
export function stdlib_smoothstep(a: number, b: number, x: number): number {
  const t = stdlib_clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function stdlib_step(edge: number, x: number): number {
  return x < edge ? 0 : 1;
}

// ── Easing ────────────────────────────────────

export function easeInQuad(t: number): number { return t * t; }
export function easeOutQuad(t: number): number { return t * (2 - t); }
export function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
export function easeInCubic(t: number): number { return t * t * t; }
export function easeOutCubic(t: number): number { return (--t) * t * t + 1; }
export function easeInOutCubic(t: number): number { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) / 2 + 1; }
export function easeInQuart(t: number): number { return t * t * t * t; }
export function easeOutQuart(t: number): number { return 1 - (--t) * t * t * t; }
export function easeInOutQuart(t: number): number { return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t; }
export function easeInQuint(t: number): number { return t * t * t * t * t; }
export function easeOutQuint(t: number): number { return 1 + (--t) * t * t * t * t; }
export function easeInOutQuint(t: number): number { return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t; }
export function easeInSine(t: number): number { return 1 - Math.cos((t * Math.PI) / 2); }
export function easeOutSine(t: number): number { return Math.sin((t * Math.PI) / 2); }
export function easeInOutSine(t: number): number { return -(Math.cos(Math.PI * t) - 1) / 2; }
export function easeInExpo(t: number): number { return t === 0 ? 0 : Math.pow(2, 10 * t - 10); }
export function easeOutExpo(t: number): number { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
export function easeInOutExpo(t: number): number { return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2; }
export function easeInCirc(t: number): number { return 1 - Math.sqrt(1 - t * t); }
export function easeOutCirc(t: number): number { return Math.sqrt(1 - (--t) * t); }
export function easeInOutCirc(t: number): number { return t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2; }
export function easeInBack(t: number): number { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; }
export function easeOutBack(t: number): number { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
export function easeInOutBack(t: number): number { const c = 1.70158 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; }
export function easeInElastic(t: number): number { const c = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c); }
export function easeOutElastic(t: number): number { const c = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1; }
export function easeInOutElastic(t: number): number { const c = (2 * Math.PI) / 4.5; return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c)) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c)) / 2 + 1; }
export function easeInBounce(t: number): number { return 1 - easeOutBounce(1 - t); }
export function easeOutBounce(t: number): number {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
export function easeInOutBounce(t: number): number { return t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2; }
export function stdlib_spring(t: number, damping: number = 0.7, stiffness: number = 100): number {
  return 1 - Math.exp(-damping * t) * Math.cos(stiffness * t);
}

// ── Statistics ────────────────────────────────

export function stdlib_mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
export function stdlib_median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
export function stdlib_mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let maxCount = 0, result = 0;
  for (const [k, v] of counts.entries()) { if (v > maxCount) { maxCount = v; result = k; } }
  return result;
}
export function stdlib_variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = stdlib_mean(values);
  return stdlib_mean(values.map(v => Math.pow(v - m, 2)));
}
export function stdlib_stdDev(values: number[]): number { return Math.sqrt(stdlib_variance(values)); }
export function stdlib_sum(values: number[]): number { return values.reduce((a, b) => a + b, 0); }
export function stdlib_product(values: number[]): number { return values.reduce((a, b) => a * b, 1); }
export function stdlib_range(values: number[]): number { return Math.max(...values) - Math.min(...values); }
export function stdlib_percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}
export function stdlib_iqr(values: number[]): number {
  return stdlib_percentile(values, 75) - stdlib_percentile(values, 25);
}
export function stdlib_zScore(values: number[], value: number): number {
  const m = stdlib_mean(values);
  const sd = stdlib_stdDev(values);
  return sd === 0 ? 0 : (value - m) / sd;
}
export function stdlib_correlation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const mx = stdlib_mean(x), my = stdlib_mean(y);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i]! - mx, dy = y[i]! - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}
export function stdlib_covariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const mx = stdlib_mean(x), my = stdlib_mean(y);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += (x[i]! - mx) * (y[i]! - my);
  return sum / x.length;
}
export function stdlib_linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  if (x.length !== y.length || x.length < 2) return { slope: 0, intercept: 0 };
  const mx = stdlib_mean(x), my = stdlib_mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i]! - mx; num += dx * (y[i]! - my); den += dx * dx; }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}
export function stdlib_entropy(values: number[]): number {
  const s = values.reduce((a, b) => a + b, 0);
  if (s === 0) return 0;
  let h = 0;
  for (const v of values) { if (v > 0) { const p = v / s; h -= p * Math.log2(p); } }
  return h;
}
export function stdlib_movingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    result.push(stdlib_mean(values.slice(start, i + 1)));
  }
  return result;
}

// ── Geometry ──────────────────────────────────

export interface GeoPoint { x: number; y: number; }
export interface GeoRect { x: number; y: number; width: number; height: number; }
export interface GeoCircle { x: number; y: number; radius: number; }

export function stdlib_distance2d(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
export function stdlib_distance3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
}
export function stdlib_polygonArea(points: GeoPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i]!.x * points[j]!.y - points[j]!.x * points[i]!.y;
  }
  return Math.abs(area / 2);
}
export function stdlib_triangleArea(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number {
  return Math.abs((x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)) / 2);
}
export function stdlib_pointInRect(x: number, y: number, rect: GeoRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
export function stdlib_pointInCircle(x: number, y: number, circle: GeoCircle): boolean {
  return (x - circle.x) ** 2 + (y - circle.y) ** 2 <= circle.radius ** 2;
}
export function stdlib_pointInPolygon(x: number, y: number, polygon: GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!, pj = polygon[j]!;
    if ((pi.y > y) !== (pj.y > y) && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x)
      inside = !inside;
  }
  return inside;
}
export function stdlib_lineIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 1e-10) return false;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}
export function stdlib_bezierPoint(p0: GeoPoint, p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, t: number): GeoPoint {
  const mt = 1 - t, mt2 = mt * mt, mt3 = mt2 * mt, t2 = t * t, t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}
export function stdlib_convexHull(points: GeoPoint[]): GeoPoint[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const lower: GeoPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2) {
      const o = lower[lower.length - 2]!, a = lower[lower.length - 1]!;
      if ((a.x - o.x) * (p.y - o.y) - (a.y - o.y) * (p.x - o.x) <= 0) lower.pop();
      else break;
    }
    lower.push(p);
  }
  const upper: GeoPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2) {
      const o = upper[upper.length - 2]!, a = upper[upper.length - 1]!;
      if ((a.x - o.x) * (p.y - o.y) - (a.y - o.y) * (p.x - o.x) <= 0) upper.pop();
      else break;
    }
    upper.push(p);
  }
  return lower.concat(upper.slice(0, -1));
}
export function stdlib_boundingBox(points: GeoPoint[]): GeoRect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0]!.x, minY = points[0]!.y, maxX = minX, maxY = minY;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ── Physics ───────────────────────────────────

export const PHYS_G = 6.674e-11;
export const PHYS_C = 299792458;
export const PHYS_BOLTZMANN = 1.380649e-23;

export function stdlib_gravity(m1: number, m2: number, distance: number): number {
  return distance === 0 ? 0 : (PHYS_G * m1 * m2) / (distance * distance);
}
export function stdlib_springForce(displacement: number, k: number): number { return -k * displacement; }
export function stdlib_dampingForce(velocity: number, c: number): number { return -c * velocity; }
export function stdlib_friction(normalForce: number, mu: number): number { return mu * normalForce; }
export function stdlib_dragForce(velocity: number, rho: number, area: number, cd: number): number {
  return 0.5 * rho * velocity * velocity * area * cd;
}
export function stdlib_projectilePosition(v0: number, angle: number, time: number, g: number = 9.81): { x: number; y: number } {
  return { x: v0 * Math.cos(angle) * time, y: v0 * Math.sin(angle) * time - 0.5 * g * time * time };
}
export function stdlib_kineticEnergy(mass: number, velocity: number): number { return 0.5 * mass * velocity * velocity; }
export function stdlib_potentialEnergy(mass: number, height: number, g: number = 9.81): number { return mass * g * height; }
export function stdlib_momentum(mass: number, velocity: number): number { return mass * velocity; }
export function stdlib_elasticCollision1D(m1: number, v1: number, m2: number, v2: number): { v1: number; v2: number } {
  return {
    v1: ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2),
    v2: ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2),
  };
}
export function stdlib_orbitalVelocity(M: number, r: number): number { return Math.sqrt((PHYS_G * M) / r); }
export function stdlib_escapeVelocity(M: number, r: number): number { return Math.sqrt((2 * PHYS_G * M) / r); }

// ── Color ─────────────────────────────────────

export interface RGBColor { r: number; g: number; b: number; }
export interface HSLColor { h: number; s: number; l: number; }

export function stdlib_rgb(r: number, g: number, b: number): RGBColor {
  return { r: Math.max(0, Math.min(255, r)), g: Math.max(0, Math.min(255, g)), b: Math.max(0, Math.min(255, b)) };
}
export function stdlib_hsl(h: number, s: number, l: number): HSLColor {
  return { h: ((h % 360) + 360) % 360, s: Math.max(0, Math.min(100, s)), l: Math.max(0, Math.min(100, l)) };
}
export function stdlib_hslToRgb(color: HSLColor): RGBColor {
  const h = color.h / 360, s = color.s / 100, l = color.l / 100;
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
export function stdlib_rgbToHsl(color: RGBColor): HSLColor {
  const r = color.r / 255, g = color.g / 255, b = color.b / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
export function stdlib_hexToRgb(hex: string): RGBColor {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) } : { r: 0, g: 0, b: 0 };
}
export function stdlib_rgbToHex(color: RGBColor): string {
  const hex = (n: number) => { const h = Math.max(0, Math.min(255, n)).toString(16); return h.length === 1 ? '0' + h : h; };
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}
export function stdlib_blendColors(c1: RGBColor, c2: RGBColor, alpha: number): RGBColor {
  return { r: Math.round(c1.r * (1 - alpha) + c2.r * alpha), g: Math.round(c1.g * (1 - alpha) + c2.g * alpha), b: Math.round(c1.b * (1 - alpha) + c2.b * alpha) };
}
export function stdlib_luminance(color: RGBColor): number {
  const rl = color.r / 255, gl = color.g / 255, bl = color.b / 255;
  const r = rl <= 0.03928 ? rl / 12.92 : Math.pow((rl + 0.055) / 1.055, 2.4);
  const g = gl <= 0.03928 ? gl / 12.92 : Math.pow((gl + 0.055) / 1.055, 2.4);
  const b = bl <= 0.03928 ? bl / 12.92 : Math.pow((bl + 0.055) / 1.055, 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function stdlib_contrastRatio(c1: RGBColor, c2: RGBColor): number {
  const l1 = stdlib_luminance(c1), l2 = stdlib_luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── Vector ────────────────────────────────────

export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

export function stdlib_vec2(x: number, y: number): Vec2 { return { x, y }; }
export function stdlib_vec3(x: number, y: number, z: number): Vec3 { return { x, y, z }; }
export function stdlib_vecAdd(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function stdlib_vecSub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function stdlib_vecMul(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
export function stdlib_vecMagnitude(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
export function stdlib_vecNormalize(v: Vec2): Vec2 { const m = stdlib_vecMagnitude(v); return m === 0 ? v : { x: v.x / m, y: v.y / m }; }
export function stdlib_vecDot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
export function stdlib_vecDistance(a: Vec2, b: Vec2): number { return stdlib_vecMagnitude(stdlib_vecSub(a, b)); }
export function stdlib_vecRotate2d(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

// ═══════════════════════════════════════════════
// INTERPRETER — Explicit result types (no exceptions)
// ═══════════════════════════════════════════════

/** Statement execution result — replaces old exception-based control flow. */
type StmtResult =
  | { kind: 'normal' }
  | { kind: 'return'; value: unknown }
  | { kind: 'break' }
  | { kind: 'continue' };

const NORMAL: StmtResult = { kind: 'normal' };

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type AnyFunction = Function;

interface Environment {
  parent?: Environment;
  variables: Map<string, unknown>;
  functions: Map<string, AnyFunction>;
}

export interface ExecutionResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

const VALID_DOMAINS: ReadonlySet<string> = new Set<string>([
  'organism', 'vehicle', 'weapon', 'building', 'terrain', 'material',
  'plant', 'insect', 'fish', 'bird', 'mammal', 'robot', 'particle',
  'fluid', 'crystal', 'sound', 'music', 'pattern', 'network', 'language',
  'code', 'strategy', 'schedule', 'rule', 'constraint', 'ecosystem',
  'game', 'simulation', 'audio', 'narrative', 'ui', 'city', 'neural',
  'intelligence', 'quantum', 'molecular', 'education', 'finance',
  'infrastructure', 'product', 'seed-intelligence', 'void', 'web',
  'render', 'shader', 'animation-visual', 'interaction', 'aesthetic',
  'emotion', 'perception', 'cinematic', 'rig', 'mocap', 'lod',
  'texture', 'logo', 'brand', 'compression', 'security-threat',
  'intrusion', 'forensics', 'memory-store',
]);

function isSeedDomain(s: string): s is SeedDomain {
  return VALID_DOMAINS.has(s);
}

function isSeedLike(val: unknown): val is UniversalSeed {
  return typeof val === 'object' && val !== null && '$gst' in val;
}

export class Interpreter {
  private globalEnv: Environment;
  currentEnv: Environment;
  private rng: DeterministicRNG;
  private seeds: Map<string, UniversalSeed> = new Map();

  constructor(globals?: Record<string, unknown>, rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('gspl-interpreter-default');
    this.globalEnv = {
      variables: new Map(Object.entries(globals ?? {})),
      functions: new Map(),
    };
    this.currentEnv = this.globalEnv;
    this.registerBuiltins();
  }

  execute(program: Program): ExecutionResult {
    try {
      for (const stmt of program.declarations) {
        const result = this.executeStmt(stmt);
        if (result.kind === 'return') {
          return { success: true, value: result.value };
        }
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  getSeeds(): Map<string, UniversalSeed> {
    return new Map(this.seeds);
  }

  private executeStmt(stmt: Stmt): StmtResult {
    switch (stmt.kind) {
      case 'expressionStmt':
        this.evalExpr(stmt.expression);
        return NORMAL;

      case 'varDecl': {
        const value = stmt.initializer ? this.evalExpr(stmt.initializer) : null;
        this.currentEnv.variables.set(stmt.name, value);
        return NORMAL;
      }

      case 'fnDecl': {
        const fn = (...args: unknown[]) => {
          const env: Environment = {
            parent: this.currentEnv,
            variables: new Map(),
            functions: new Map(),
          };
          for (let i = 0; i < stmt.parameters.length; i++) {
            env.variables.set(stmt.parameters[i]!.name, args[i] ?? null);
          }
          const prev = this.currentEnv;
          this.currentEnv = env;
          try {
            for (const s of stmt.body) {
              const result = this.executeStmt(s);
              if (result.kind === 'return') return result.value;
            }
            return null;
          } finally {
            this.currentEnv = prev;
          }
        };
        this.currentEnv.functions.set(stmt.name, fn);
        return NORMAL;
      }

      case 'if': {
        const condition = this.evalExpr(stmt.condition);
        const branch = this.isTruthy(condition) ? stmt.consequent : stmt.alternate;
        if (branch) {
          for (const s of branch) {
            const result = this.executeStmt(s);
            if (result.kind !== 'normal') return result;
          }
        }
        return NORMAL;
      }

      case 'while': {
        while (this.isTruthy(this.evalExpr(stmt.condition))) {
          for (const s of stmt.body) {
            const result = this.executeStmt(s);
            if (result.kind === 'break') return NORMAL;
            if (result.kind === 'continue') break;
            if (result.kind === 'return') return result;
          }
        }
        return NORMAL;
      }

      case 'for': {
        const iterable = this.evalExpr(stmt.iterable);
        if (Array.isArray(iterable)) {
          outer: for (const item of iterable) {
            this.currentEnv.variables.set(stmt.variable, item);
            for (const s of stmt.body) {
              const result = this.executeStmt(s);
              if (result.kind === 'break') break outer;
              if (result.kind === 'continue') continue outer;
              if (result.kind === 'return') return result;
            }
          }
        }
        return NORMAL;
      }

      case 'return':
        return { kind: 'return', value: stmt.value ? this.evalExpr(stmt.value) : null };

      case 'break':
        return { kind: 'break' };

      case 'continue':
        return { kind: 'continue' };

      case 'import':
        // In browser-compatible runtime, imports are resolved via host-provided module loaders.
        // The interpreter itself doesn't do filesystem I/O.
        throw new Error(`Import not supported in this runtime. Use the host environment's module loader.`);

      case 'seedDecl': {
        const genes: GeneMap = {};
        for (const block of stmt.blocks) {
          for (const entry of block.entries) {
            const val = this.evalExpr(entry.value);
            if (typeof val === 'number') {
              genes[entry.key] = { type: 'scalar', value: val, min: 0, max: 100 };
            } else if (typeof val === 'boolean') {
              genes[entry.key] = { type: 'scalar', value: val ? 1 : 0, min: 0, max: 1 };
            } else if (typeof val === 'string') {
              genes[entry.key] = { type: 'categorical', value: val, options: [val] };
            } else {
              genes[entry.key] = { type: 'scalar', value: Number(val) || 0, min: 0, max: 100 };
            }
          }
        }
        const domain = stmt.domain ?? 'organism';
        const validDomain: SeedDomain = isSeedDomain(domain) ? domain : 'organism';
        const seed = createSeed(stmt.name, validDomain, genes, this.rng);
        this.seeds.set(stmt.name, seed);
        this.currentEnv.variables.set(stmt.name, seed);
        return NORMAL;
      }

      case 'worldDecl': {
        const worldObj: Record<string, unknown> = { __type: 'world', name: stmt.name, parent: stmt.parent };
        const properties: Record<string, unknown> = {};
        for (const prop of stmt.properties) properties[prop.key] = this.evalExpr(prop.value);
        worldObj['properties'] = properties;
        const embeddedSeeds: string[] = [];
        for (const seedStmt of stmt.embeddedSeeds) {
          this.executeStmt(seedStmt);
          embeddedSeeds.push(seedStmt.name);
        }
        worldObj['seeds'] = embeddedSeeds;
        const embeddedEntities: string[] = [];
        for (const entityStmt of stmt.embeddedEntities) {
          this.executeStmt(entityStmt);
          embeddedEntities.push(entityStmt.name);
        }
        worldObj['entities'] = embeddedEntities;
        this.currentEnv.variables.set(stmt.name, worldObj);
        return NORMAL;
      }

      case 'entityDecl': {
        const entityObj: Record<string, unknown> = { __type: 'entity', name: stmt.name, parent: stmt.parent };
        const components: Record<string, Record<string, unknown>> = {};
        for (const comp of stmt.components) {
          const props: Record<string, unknown> = {};
          for (const entry of comp.entries) props[entry.key] = this.evalExpr(entry.value);
          components[comp.kind] = props;
        }
        entityObj['components'] = components;
        const instincts: Array<{ name: string; entries: Record<string, unknown> }> = [];
        for (const inst of stmt.instincts) {
          const entries: Record<string, unknown> = {};
          for (const entry of inst.entries) entries[entry.key] = this.evalExpr(entry.value);
          instincts.push({ name: inst.name, entries });
        }
        entityObj['instincts'] = instincts;
        const affinities: Array<{ name: string; entries: Record<string, unknown> }> = [];
        for (const aff of stmt.affinities) {
          const entries: Record<string, unknown> = {};
          for (const entry of aff.entries) entries[entry.key] = this.evalExpr(entry.value);
          affinities.push({ name: aff.name, entries });
        }
        entityObj['affinities'] = affinities;
        // Create a seed for the entity
        const entityGenes: GeneMap = {};
        for (const comp of stmt.components) {
          for (const entry of comp.entries) {
            const val = this.evalExpr(entry.value);
            if (typeof val === 'number') entityGenes[entry.key] = { type: 'scalar', value: val, min: 0, max: val * 3 || 100 };
            else if (typeof val === 'string') entityGenes[entry.key] = { type: 'categorical', value: val, options: [val] };
          }
        }
        if (Object.keys(entityGenes).length > 0) {
          const seed = createSeed(stmt.name, 'organism', entityGenes, this.rng);
          this.seeds.set(stmt.name, seed);
        }
        this.currentEnv.variables.set(stmt.name, entityObj);
        return NORMAL;
      }

      case 'lawDecl': {
        const lawObj: Record<string, unknown> = { __type: 'law', name: stmt.name, affects: stmt.affects, event: stmt.event };
        const bodyEntries: Record<string, unknown> = {};
        for (const entry of stmt.body) bodyEntries[entry.key] = this.evalExpr(entry.value);
        lawObj['body'] = bodyEntries;
        this.currentEnv.variables.set(stmt.name, lawObj);
        return NORMAL;
      }

      case 'observationDecl': {
        const obsObj: Record<string, unknown> = { __type: 'observation', name: stmt.name };
        for (const entry of stmt.entries) obsObj[entry.key] = this.evalExpr(entry.value);
        this.currentEnv.variables.set(stmt.name, obsObj);
        return NORMAL;
      }

      case 'composition': {
        const { operation, name: targetName } = stmt;
        switch (operation) {
          case 'breed': {
            if (stmt.arguments.length < 2) throw new Error('breed requires at least 2 parents');
            const parentA = this.evalExpr(stmt.arguments[0]!);
            const parentB = this.evalExpr(stmt.arguments[1]!);
            if (!isSeedLike(parentA)) throw new Error('breed: parentA is not a valid seed');
            if (!isSeedLike(parentB)) throw new Error('breed: parentB is not a valid seed');
            const strategy = (stmt.arguments.length > 2 ? String(this.evalExpr(stmt.arguments[2]!)) : 'uniform') as CrossoverStrategy;
            const dominance = stmt.arguments.length > 3 ? Number(this.evalExpr(stmt.arguments[3]!)) : 0.5;
            const offspring = breedSeeds(parentA, parentB, strategy, dominance, this.rng);
            this.seeds.set(targetName, offspring);
            this.currentEnv.variables.set(targetName, offspring);
            break;
          }
          case 'mutate': {
            if (stmt.arguments.length < 1) throw new Error('mutate requires at least 1 parent');
            const parent = this.evalExpr(stmt.arguments[0]!);
            if (!isSeedLike(parent)) throw new Error('mutate: parent is not a valid seed');
            const intensity = stmt.arguments.length > 1 ? Number(this.evalExpr(stmt.arguments[1]!)) : 0.1;
            const mutant = mutateSeed(parent, intensity, this.rng);
            this.seeds.set(targetName, mutant);
            this.currentEnv.variables.set(targetName, mutant);
            break;
          }
          case 'compose':
          case 'evolve':
          case 'graft':
            throw new Error(`Composition operation '${operation}' not yet implemented`);
          default:
            throw new Error(`Unknown composition operation: ${operation}`);
        }
        return NORMAL;
      }

      default:
        return NORMAL;
    }
  }

  private evalExpr(expr: Expr): unknown {
    switch (expr.kind) {
      case 'literal': return expr.value;

      case 'identifier': {
        // Walk the env chain
        let env: Environment | undefined = this.currentEnv;
        while (env) {
          const val = env.variables.get(expr.name);
          if (val !== undefined) return val;
          const fn = env.functions.get(expr.name);
          if (fn) return fn;
          env = env.parent;
        }
        return null;
      }

      case 'binary': {
        const left = this.evalExpr(expr.left);
        const right = this.evalExpr(expr.right);
        switch (expr.operator) {
          case TokenType.Plus:
            if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
            return (left as number) + (right as number);
          case TokenType.Minus: return (left as number) - (right as number);
          case TokenType.Star: return (left as number) * (right as number);
          case TokenType.Slash: return (left as number) / (right as number);
          case TokenType.Percent: return (left as number) % (right as number);
          case TokenType.StarStar: return Math.pow(left as number, right as number);
          case TokenType.Lt: return (left as number) < (right as number);
          case TokenType.Gt: return (left as number) > (right as number);
          case TokenType.LtEq: return (left as number) <= (right as number);
          case TokenType.GtEq: return (left as number) >= (right as number);
          case TokenType.EqEq: return left === right;
          case TokenType.BangEq: return left !== right;
          case TokenType.And: return this.isTruthy(left) && this.isTruthy(right);
          case TokenType.Or: return this.isTruthy(left) || this.isTruthy(right);
          default: return null;
        }
      }

      case 'unary': {
        const operand = this.evalExpr(expr.operand);
        switch (expr.operator) {
          case TokenType.Bang: return !this.isTruthy(operand);
          case TokenType.Minus: return -(operand as number);
          case TokenType.Plus: return +(operand as number);
          case TokenType.Tilde: return ~(operand as number);
          default: return null;
        }
      }

      case 'call': {
        const callee = this.evalExpr(expr.callee);
        const args = expr.arguments.map(a => this.evalExpr(a));
        if (typeof callee === 'function') return (callee as Function)(...args);
        throw new Error('Not a function');
      }

      case 'member': {
        const obj = this.evalExpr(expr.object);
        if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[expr.property];
        return null;
      }

      case 'index': {
        const obj = this.evalExpr(expr.object);
        const idx = this.evalExpr(expr.index);
        if (Array.isArray(obj)) return obj[idx as number];
        if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[String(idx)];
        return null;
      }

      case 'array': return expr.elements.map(e => this.evalExpr(e));

      case 'object': {
        const obj: Record<string, unknown> = {};
        for (const prop of expr.properties) obj[prop.key] = this.evalExpr(prop.value);
        return obj;
      }

      case 'function': {
        return (...args: unknown[]) => {
          const env: Environment = { parent: this.currentEnv, variables: new Map(), functions: new Map() };
          for (let i = 0; i < expr.parameters.length; i++)
            env.variables.set(expr.parameters[i]!.name, args[i] ?? null);
          const prev = this.currentEnv;
          this.currentEnv = env;
          try {
            for (const s of expr.body) {
              const result = this.executeStmt(s);
              if (result.kind === 'return') return result.value;
            }
            return null;
          } finally { this.currentEnv = prev; }
        };
      }

      case 'assignment': {
        const value = this.evalExpr(expr.value);
        if (expr.target.kind === 'identifier') {
          // Walk env chain to find the variable
          let env: Environment | undefined = this.currentEnv;
          while (env) {
            if (env.variables.has(expr.target.name)) {
              env.variables.set(expr.target.name, value);
              return value;
            }
            env = env.parent;
          }
          // Not found — set in current env
          this.currentEnv.variables.set(expr.target.name, value);
          return value;
        }
        return null;
      }

      case 'templateString': {
        let result = '';
        for (const part of expr.parts) {
          result += part.isExpr ? String(this.evalExpr(part.expr)) : part.value;
        }
        return result;
      }

      case 'ternary':
        return this.isTruthy(this.evalExpr(expr.condition))
          ? this.evalExpr(expr.consequent)
          : this.evalExpr(expr.alternate);

      case 'range': {
        const start = this.evalExpr(expr.start) as number;
        const end = this.evalExpr(expr.end) as number;
        const result: number[] = [];
        if (start <= end) { for (let i = start; i <= end; i++) result.push(i); }
        else { for (let i = start; i >= end; i--) result.push(i); }
        return result;
      }

      case 'spread':
        return { __spread: true, value: this.evalExpr(expr.expr) };

      case 'geneAccess': {
        const seedVal = this.evalExpr(expr.seed);
        if (!isSeedLike(seedVal)) return null;
        let current: unknown = seedVal.genes;
        for (const key of expr.genePath) {
          if (current && typeof current === 'object')
            current = (current as Record<string, unknown>)[key];
          else return null;
        }
        return current;
      }

      case 'seedRef':
        return this.seeds.get(expr.name) ?? null;

      case 'update': {
        if (expr.target.kind !== 'identifier') return null;
        const name = (expr.target as IdentifierExpr).name;
        const currentVal = this.currentEnv.variables.get(name) as number;
        const amount = 1;
        let newVal: number;
        switch (expr.operator) {
          case '+=': newVal = currentVal + amount; break;
          case '-=': newVal = currentVal - amount; break;
          case '*=': newVal = currentVal * amount; break;
          case '/=': newVal = currentVal / amount; break;
          default: return null;
        }
        this.currentEnv.variables.set(name, newVal);
        return newVal;
      }

      default: return null;
    }
  }

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    return true;
  }

  private registerBuiltins(): void {
    const vars = this.globalEnv.variables;
    const fns = this.globalEnv.functions;

    // Math constants
    vars.set('PI', Math.PI);
    vars.set('E', Math.E);
    vars.set('TAU', stdlib_TAU);
    vars.set('EPSILON', Number.EPSILON);
    vars.set('INF', Number.POSITIVE_INFINITY);

    // Math functions (40+)
    fns.set('sin', stdlib_sin); fns.set('cos', stdlib_cos); fns.set('tan', stdlib_tan);
    fns.set('asin', stdlib_asin); fns.set('acos', stdlib_acos); fns.set('atan', stdlib_atan);
    fns.set('atan2', stdlib_atan2 as (...args: unknown[]) => unknown);
    fns.set('sqrt', stdlib_sqrt); fns.set('cbrt', stdlib_cbrt);
    fns.set('pow', stdlib_pow as (...args: unknown[]) => unknown);
    fns.set('abs', stdlib_abs); fns.set('floor', stdlib_floor); fns.set('ceil', stdlib_ceil);
    fns.set('round', stdlib_round); fns.set('trunc', stdlib_trunc); fns.set('sign', stdlib_sign);
    fns.set('clamp', stdlib_clamp as (...args: unknown[]) => unknown);
    fns.set('lerp', stdlib_lerp as (...args: unknown[]) => unknown);
    fns.set('inverseLerp', stdlib_inverseLerp as (...args: unknown[]) => unknown);
    fns.set('remap', stdlib_remap as (...args: unknown[]) => unknown);
    fns.set('fract', stdlib_fract); fns.set('mod', stdlib_mod as (...args: unknown[]) => unknown);
    fns.set('log', stdlib_log); fns.set('log2', stdlib_log2); fns.set('log10', stdlib_log10);
    fns.set('exp', stdlib_exp);
    fns.set('min', (...args: unknown[]) => Math.min(...(args as number[])));
    fns.set('max', (...args: unknown[]) => Math.max(...(args as number[])));
    fns.set('hypot', stdlib_hypot as (...args: unknown[]) => unknown);
    fns.set('toRadians', stdlib_toRadians); fns.set('toDegrees', stdlib_toDegrees);
    fns.set('isPrime', stdlib_isPrime as unknown as (...args: unknown[]) => unknown);
    fns.set('gcd', stdlib_gcd as (...args: unknown[]) => unknown);
    fns.set('lcm', stdlib_lcm as (...args: unknown[]) => unknown);
    fns.set('fibonacci', stdlib_fibonacci as unknown as (...args: unknown[]) => unknown);
    fns.set('factorial', stdlib_factorial as unknown as (...args: unknown[]) => unknown);
    fns.set('smoothstep', stdlib_smoothstep as (...args: unknown[]) => unknown);
    fns.set('step', stdlib_step as (...args: unknown[]) => unknown);

    // Random (RNG-bound)
    fns.set('random', () => this.rng.next());
    fns.set('randomInt', (min: unknown, max: unknown) => this.rng.nextInt(min as number, max as number));
    fns.set('gaussian', () => this.rng.gaussian());

    // Easing (32 functions)
    fns.set('easeInQuad', easeInQuad); fns.set('easeOutQuad', easeOutQuad); fns.set('easeInOutQuad', easeInOutQuad);
    fns.set('easeInCubic', easeInCubic); fns.set('easeOutCubic', easeOutCubic); fns.set('easeInOutCubic', easeInOutCubic);
    fns.set('easeInQuart', easeInQuart); fns.set('easeOutQuart', easeOutQuart); fns.set('easeInOutQuart', easeInOutQuart);
    fns.set('easeInQuint', easeInQuint); fns.set('easeOutQuint', easeOutQuint); fns.set('easeInOutQuint', easeInOutQuint);
    fns.set('easeInSine', easeInSine); fns.set('easeOutSine', easeOutSine); fns.set('easeInOutSine', easeInOutSine);
    fns.set('easeInExpo', easeInExpo); fns.set('easeOutExpo', easeOutExpo); fns.set('easeInOutExpo', easeInOutExpo);
    fns.set('easeInCirc', easeInCirc); fns.set('easeOutCirc', easeOutCirc); fns.set('easeInOutCirc', easeInOutCirc);
    fns.set('easeInBack', easeInBack); fns.set('easeOutBack', easeOutBack); fns.set('easeInOutBack', easeInOutBack);
    fns.set('easeInElastic', easeInElastic); fns.set('easeOutElastic', easeOutElastic); fns.set('easeInOutElastic', easeInOutElastic);
    fns.set('easeInBounce', easeInBounce); fns.set('easeOutBounce', easeOutBounce); fns.set('easeInOutBounce', easeInOutBounce);
    fns.set('spring', stdlib_spring as (...args: unknown[]) => unknown);
    fns.set('linear', (t: unknown) => t as number);

    // Statistics (25+)
    fns.set('mean', (v: unknown) => stdlib_mean(v as number[]));
    fns.set('median', (v: unknown) => stdlib_median(v as number[]));
    fns.set('mode', (v: unknown) => stdlib_mode(v as number[]));
    fns.set('variance', (v: unknown) => stdlib_variance(v as number[]));
    fns.set('stdDev', (v: unknown) => stdlib_stdDev(v as number[]));
    fns.set('sum', (v: unknown) => stdlib_sum(v as number[]));
    fns.set('product', (v: unknown) => stdlib_product(v as number[]));
    fns.set('range', (v: unknown) => stdlib_range(v as number[]));
    fns.set('percentile', (v: unknown, p: unknown) => stdlib_percentile(v as number[], p as number));
    fns.set('iqr', (v: unknown) => stdlib_iqr(v as number[]));
    fns.set('zScore', (v: unknown, val: unknown) => stdlib_zScore(v as number[], val as number));
    fns.set('correlation', (x: unknown, y: unknown) => stdlib_correlation(x as number[], y as number[]));
    fns.set('covariance', (x: unknown, y: unknown) => stdlib_covariance(x as number[], y as number[]));
    fns.set('entropy', (v: unknown) => stdlib_entropy(v as number[]));
    fns.set('movingAverage', (v: unknown, w: unknown) => stdlib_movingAverage(v as number[], w as number));

    // Geometry (20+)
    fns.set('distance2d', stdlib_distance2d as (...args: unknown[]) => unknown);
    fns.set('distance3d', stdlib_distance3d as (...args: unknown[]) => unknown);
    fns.set('triangleArea', stdlib_triangleArea as (...args: unknown[]) => unknown);

    // Physics (15+)
    vars.set('GRAVITY_CONST', PHYS_G);
    vars.set('SPEED_OF_LIGHT', PHYS_C);
    fns.set('gravity', stdlib_gravity as (...args: unknown[]) => unknown);
    fns.set('springForce', stdlib_springForce as (...args: unknown[]) => unknown);
    fns.set('dampingForce', stdlib_dampingForce as (...args: unknown[]) => unknown);
    fns.set('friction', stdlib_friction as (...args: unknown[]) => unknown);
    fns.set('kineticEnergy', stdlib_kineticEnergy as (...args: unknown[]) => unknown);
    fns.set('potentialEnergy', stdlib_potentialEnergy as (...args: unknown[]) => unknown);
    fns.set('momentum', stdlib_momentum as (...args: unknown[]) => unknown);

    // Color
    fns.set('rgb', stdlib_rgb as (...args: unknown[]) => unknown);
    fns.set('hsl', stdlib_hsl as (...args: unknown[]) => unknown);
    fns.set('hslToRgb', (c: unknown) => stdlib_hslToRgb(c as HSLColor));
    fns.set('rgbToHsl', (c: unknown) => stdlib_rgbToHsl(c as RGBColor));
    fns.set('hexToRgb', stdlib_hexToRgb as unknown as (...args: unknown[]) => unknown);
    fns.set('rgbToHex', (c: unknown) => stdlib_rgbToHex(c as RGBColor));
    fns.set('blendColors', (c1: unknown, c2: unknown, a: unknown) => stdlib_blendColors(c1 as RGBColor, c2 as RGBColor, a as number));
    fns.set('luminance', (c: unknown) => stdlib_luminance(c as RGBColor));
    fns.set('contrastRatio', (c1: unknown, c2: unknown) => stdlib_contrastRatio(c1 as RGBColor, c2 as RGBColor));

    // Vector
    fns.set('vec2', stdlib_vec2 as (...args: unknown[]) => unknown);
    fns.set('vec3', stdlib_vec3 as (...args: unknown[]) => unknown);
    fns.set('vecAdd', (a: unknown, b: unknown) => stdlib_vecAdd(a as Vec2, b as Vec2));
    fns.set('vecSub', (a: unknown, b: unknown) => stdlib_vecSub(a as Vec2, b as Vec2));
    fns.set('vecMul', (v: unknown, s: unknown) => stdlib_vecMul(v as Vec2, s as number));
    fns.set('vecMagnitude', (v: unknown) => stdlib_vecMagnitude(v as Vec2));
    fns.set('vecNormalize', (v: unknown) => stdlib_vecNormalize(v as Vec2));
    fns.set('vecDot', (a: unknown, b: unknown) => stdlib_vecDot(a as Vec2, b as Vec2));
    fns.set('vecDistance', (a: unknown, b: unknown) => stdlib_vecDistance(a as Vec2, b as Vec2));

    // Array functions
    fns.set('length', (arr: unknown) => Array.isArray(arr) ? arr.length : typeof arr === 'string' ? arr.length : 0);
    fns.set('push', (arr: unknown, val: unknown) => { if (Array.isArray(arr)) { arr.push(val); return arr; } return arr; });
    fns.set('pop', (arr: unknown) => Array.isArray(arr) ? arr.pop() : null);
    fns.set('map', (arr: unknown, fn: unknown) => Array.isArray(arr) && typeof fn === 'function' ? arr.map((v: unknown) => (fn as Function)(v)) : []);
    fns.set('filter', (arr: unknown, fn: unknown) => Array.isArray(arr) && typeof fn === 'function' ? arr.filter((v: unknown) => (fn as Function)(v)) : []);
    fns.set('reduce', (arr: unknown, fn: unknown, init: unknown) => Array.isArray(arr) && typeof fn === 'function' ? arr.reduce((a: unknown, b: unknown) => (fn as Function)(a, b), init) : init);
    fns.set('join', (arr: unknown, sep: unknown) => Array.isArray(arr) ? arr.join(String(sep ?? ',')) : '');
    fns.set('slice', (arr: unknown, start: unknown, end: unknown) => Array.isArray(arr) ? arr.slice(start as number, end as number | undefined) : []);
    fns.set('indexOf', (arr: unknown, val: unknown) => Array.isArray(arr) ? arr.indexOf(val) : -1);
    fns.set('includes', (arr: unknown, val: unknown) => Array.isArray(arr) ? arr.includes(val) : false);
    fns.set('reverse', (arr: unknown) => Array.isArray(arr) ? [...arr].reverse() : []);
    fns.set('sort', (arr: unknown) => Array.isArray(arr) ? [...arr].sort() : []);
    fns.set('flat', (arr: unknown) => Array.isArray(arr) ? arr.flat() : []);
    fns.set('concat', (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) ? a.concat(b) : []);

    // String functions
    fns.set('toString', (val: unknown) => String(val));
    fns.set('toNumber', (val: unknown) => Number(val));
    fns.set('toUpperCase', (s: unknown) => String(s).toUpperCase());
    fns.set('toLowerCase', (s: unknown) => String(s).toLowerCase());
    fns.set('trim', (s: unknown) => String(s).trim());
    fns.set('split', (s: unknown, sep: unknown) => String(s).split(String(sep)));
    fns.set('startsWith', (s: unknown, prefix: unknown) => String(s).startsWith(String(prefix)));
    fns.set('endsWith', (s: unknown, suffix: unknown) => String(s).endsWith(String(suffix)));
    fns.set('replace', (s: unknown, from: unknown, to: unknown) => String(s).replace(String(from), String(to)));
    fns.set('substring', (s: unknown, start: unknown, end: unknown) => String(s).substring(start as number, end as number | undefined));

    // Type checking
    fns.set('typeOf', (val: unknown) => typeof val);
    fns.set('isArray', (val: unknown) => Array.isArray(val));
    fns.set('isNumber', (val: unknown) => typeof val === 'number');
    fns.set('isString', (val: unknown) => typeof val === 'string');
    fns.set('isSeed', (val: unknown) => isSeedLike(val));

    // Genetics (runtime integration)
    fns.set('createSeed', (name: unknown, domain: unknown, genes: unknown) => {
      const geneMap: GeneMap = {};
      if (genes && typeof genes === 'object') {
        for (const [key, value] of Object.entries(genes as Record<string, unknown>)) {
          if (typeof value === 'number') geneMap[key] = { type: 'scalar', value, min: 0, max: 100 };
          else if (typeof value === 'string') geneMap[key] = { type: 'categorical', value, options: [value] };
        }
      }
      const d = String(domain);
      const validDomain: SeedDomain = isSeedDomain(d) ? d : 'organism';
      return createSeed(String(name), validDomain, geneMap, this.rng);
    });

    // Utility
    fns.set('print', (...args: unknown[]) => { console.log(...args); return null; });
    fns.set('keys', (obj: unknown) => obj && typeof obj === 'object' ? Object.keys(obj) : []);
    fns.set('values', (obj: unknown) => obj && typeof obj === 'object' ? Object.values(obj) : []);
    fns.set('entries', (obj: unknown) => obj && typeof obj === 'object' ? Object.entries(obj) : []);
  }
}

// ═══════════════════════════════════════════════
// WORLD — Seed population management
// ═══════════════════════════════════════════════

export interface WorldConfig {
  name: string;
  eventBus?: EventBus;
  clock?: SimulationClock;
  survivalThreshold?: number;
}

export interface SeedSummary {
  id: string;
  name: string;
  domain: SeedDomain;
  generation: number;
  genes: GeneMap;
  metadata: SeedMetadata;
  fitness?: FitnessVector;
  lineage?: LineageRecord;
  activation?: ActivationState;
}

export interface SimulationResult {
  tick: number;
  population: Array<{ id: string; fitness: number }>;
  averageFitness: number;
  bestFitness: number;
}

export interface ExportedWorldState {
  world: {
    name: string;
    seedCount: number;
    seeds: SeedSummary[];
  };
}

export class World {
  private seeds: Map<string, UniversalSeed> = new Map();
  private eventBus: EventBus;
  private clock: SimulationClock;
  private survivalThreshold: number;
  public readonly name: string;

  constructor(config: WorldConfig) {
    this.name = config.name;
    this.eventBus = config.eventBus ?? new EventBus();
    this.clock = config.clock ?? new DefaultSimulationClock();
    this.survivalThreshold = config.survivalThreshold ?? 0.05;
  }

  getClock(): SimulationClock { return this.clock; }

  advanceClock(step?: number): void {
    this.clock = this.clock.advance(step);
  }

  registerSeed<T extends GeneMap = GeneMap>(seed: UniversalSeed<T>): UniversalSeed<T> {
    this.seeds.set(seed.$hash, seed);
    this.eventBus.emit({
      type: 'world.changed',
      action: 'seed_added',
      seedCount: this.seeds.size,
      timestamp: this.clock.now(),
    } satisfies WorldChangedEvent);
    return seed;
  }

  getSeed<T extends GeneMap = GeneMap>(id: string): UniversalSeed<T> | undefined {
    const byHash = this.seeds.get(id) as UniversalSeed<T> | undefined;
    if (byHash) return byHash;
    const idLower = id.toLowerCase();
    for (const seed of this.seeds.values()) {
      if (seed.$name.toLowerCase() === idLower) return seed as UniversalSeed<T>;
    }
    return undefined;
  }

  listSeeds<T extends GeneMap = GeneMap>(): UniversalSeed<T>[] {
    return Array.from(this.seeds.values()) as UniversalSeed<T>[];
  }

  query<T extends GeneMap = GeneMap>(predicate: (seed: UniversalSeed<T>) => boolean): UniversalSeed<T>[] {
    return this.listSeeds<T>().filter(predicate);
  }

  getSeedCount(): number { return this.seeds.size; }

  updateSeed<T extends GeneMap = GeneMap>(seed: UniversalSeed<T>): UniversalSeed<T> {
    this.seeds.set(seed.$hash, seed);
    this.eventBus.emit({
      type: 'world.changed',
      action: 'seed_updated',
      seedCount: this.seeds.size,
      timestamp: this.clock.now(),
    } satisfies WorldChangedEvent);
    return seed;
  }

  removeSeed(id: string): boolean {
    const removed = this.seeds.delete(id);
    if (removed) {
      this.eventBus.emit({
        type: 'world.changed',
        action: 'seed_removed',
        seedCount: this.seeds.size,
        timestamp: this.clock.now(),
      } satisfies WorldChangedEvent);
    }
    return removed;
  }

  clear(): void {
    this.seeds.clear();
    this.eventBus.emit({
      type: 'world.changed',
      action: 'cleared',
      seedCount: 0,
      timestamp: this.clock.now(),
    } satisfies WorldChangedEvent);
  }

  simulate(ticks: number, options?: {
    rng?: DeterministicRNG;
    evaluateFitness?: (seed: UniversalSeed) => number;
    survivalThreshold?: number;
  }): SimulationResult {
    if (ticks <= 0) throw new Error('Ticks must be positive');

    const rng = options?.rng ?? new DeterministicRNG(this.clock.now());
    const threshold = options?.survivalThreshold ?? this.survivalThreshold;
    const evaluateFitness = options?.evaluateFitness ?? ((seed: UniversalSeed) => {
      let fitness = 0.5;
      let count = 0;
      for (const gene of Object.values(seed.genes)) {
        if (gene.type === 'scalar') {
          const range = gene.max - gene.min;
          fitness += (range === 0 ? 0.5 : (gene.value - gene.min) / range) * 0.1;
          count += 1;
        }
      }
      if (count > 0) fitness /= count;
      fitness += seed.$lineage.generation * 0.01;
      return Math.max(0, Math.min(1, fitness));
    });

    let stepCount = 0;
    let population: Array<{ id: string; fitness: number }> = [];
    let fitnesses: number[] = [];

    for (let t = 0; t < ticks; t++) {
      stepCount++;
      population = [];
      fitnesses = [];

      for (const seed of this.seeds.values()) {
        const fitness = evaluateFitness(seed);
        fitnesses.push(fitness);
        population.push({ id: seed.$hash, fitness });
      }

      this.eventBus.emit({
        type: 'simulation.step',
        tick: t + 1,
        seedCount: population.length,
        timestamp: this.clock.now(),
      } satisfies SimulationStepEvent);

      for (const entry of population) {
        if (entry.fitness < threshold) this.removeSeed(entry.id);
      }
    }

    const averageFitness = fitnesses.length > 0 ? fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length : 0;
    const bestFitness = fitnesses.length > 0 ? Math.max(...fitnesses) : 0;
    return { tick: stepCount, population, averageFitness, bestFitness };
  }

  exportState(): ExportedWorldState {
    return {
      world: {
        name: this.name,
        seedCount: this.seeds.size,
        seeds: this.listSeeds().map(seed => ({
          id: seed.$hash,
          name: seed.$name,
          domain: seed.$domain,
          generation: seed.$lineage.generation,
          genes: seed.genes,
          metadata: seed.$metadata,
          fitness: seed.$fitness,
          lineage: seed.$lineage,
          activation: seed.$activation,
        })),
      },
    };
  }

  createSnapshot(): { state: ExportedWorldState; timestamp: number } {
    return { state: this.exportState(), timestamp: this.clock.now() };
  }

  static fromState(state: ExportedWorldState, _rng: DeterministicRNG, clock?: SimulationClock): World {
    const world = new World({ name: state.world.name, clock });
    for (const data of state.world.seeds) {
      const seed: UniversalSeed = {
        $gst: '4.0',
        $hash: data.id,
        $name: data.name,
        $domain: data.domain,
        genes: data.genes,
        $lineage: data.lineage ?? { generation: data.generation, parents: [], timestamp: 0 },
        $metadata: data.metadata ?? { created: 0 },
        $fitness: data.fitness,
        $activation: data.activation ?? { alive: true, active: true, energy: 100, age: 0 },
      };
      world.registerSeed(seed);
    }
    return world;
  }

  static fromSnapshot(snapshot: { state: ExportedWorldState; timestamp: number }, rng: DeterministicRNG, clock?: SimulationClock): World {
    return World.fromState(snapshot.state, rng, clock);
  }

  getEventBus(): EventBus { return this.eventBus; }
}

// ═══════════════════════════════════════════════
// VALIDATION — Schema-based seed validation
// ═══════════════════════════════════════════════

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationDiagnostic {
  severity: ValidationSeverity;
  message: string;
  path?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
  seed: UniversalSeed | null;
}

const VALID_GENE_TYPES: ReadonlySet<string> = new Set([
  'scalar', 'categorical', 'vector', 'expression',
  'struct', 'array', 'graph', 'tensor', 'timeseries',
]);

export function validateSeed(seed: unknown): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];

  if (typeof seed !== 'object' || seed === null) {
    diagnostics.push({ severity: 'error', message: 'Seed must be an object' });
    return { valid: false, diagnostics, seed: null };
  }

  const s = seed as Record<string, unknown>;

  if (s['$gst'] !== '4.0') {
    diagnostics.push({ severity: 'error', message: `Invalid GSPL version: ${s['$gst']}, expected '4.0'`, path: '$gst' });
  }

  if (typeof s['$domain'] !== 'string' || !VALID_DOMAINS.has(s['$domain'])) {
    diagnostics.push({ severity: 'error', message: `Invalid domain: ${s['$domain']}`, path: '$domain' });
  }

  if (typeof s['$hash'] !== 'string' || s['$hash'].length === 0) {
    diagnostics.push({ severity: 'error', message: 'Invalid or missing hash', path: '$hash' });
  }

  if (typeof s['$name'] !== 'string' || s['$name'].length === 0) {
    diagnostics.push({ severity: 'error', message: 'Seed name must be non-empty string', path: '$name' });
  }

  if (typeof s['$lineage'] !== 'object' || s['$lineage'] === null) {
    diagnostics.push({ severity: 'error', message: 'Missing lineage record', path: '$lineage' });
  } else {
    const lineage = s['$lineage'] as Record<string, unknown>;
    if (typeof lineage['generation'] !== 'number' || (lineage['generation'] as number) < 0) {
      diagnostics.push({ severity: 'error', message: `Invalid generation: ${lineage['generation']}`, path: '$lineage.generation' });
    }
    if (!Array.isArray(lineage['parents'])) {
      diagnostics.push({ severity: 'warning', message: 'Parents should be an array', path: '$lineage.parents' });
    }
  }

  if (typeof s['genes'] !== 'object' || s['genes'] === null) {
    diagnostics.push({ severity: 'error', message: 'Missing genes object', path: 'genes' });
  } else {
    const genes = s['genes'] as Record<string, unknown>;
    if (Object.keys(genes).length === 0) {
      diagnostics.push({ severity: 'error', message: 'Genes map is empty', path: 'genes' });
    } else {
      for (const [key, gene] of Object.entries(genes)) {
        const geneResult = validateGene(gene);
        for (const diag of geneResult.diagnostics) {
          diagnostics.push({ ...diag, path: `genes.${key}${diag.path ? '.' + diag.path : ''}` });
        }
      }
    }
  }

  if (typeof s['$metadata'] !== 'object' || s['$metadata'] === null) {
    diagnostics.push({ severity: 'warning', message: 'Missing or invalid metadata', path: '$metadata' });
  }

  const valid = !diagnostics.some(d => d.severity === 'error');
  return { valid, diagnostics, seed: valid ? (JSON.parse(JSON.stringify(s)) as UniversalSeed) : null };
}

function validateGene(gene: unknown): { valid: boolean; diagnostics: ValidationDiagnostic[] } {
  const diagnostics: ValidationDiagnostic[] = [];

  if (typeof gene !== 'object' || gene === null) {
    diagnostics.push({ severity: 'error', message: 'Gene must be an object' });
    return { valid: false, diagnostics };
  }

  const g = gene as Record<string, unknown>;
  if (typeof g['type'] !== 'string' || !VALID_GENE_TYPES.has(g['type'])) {
    diagnostics.push({ severity: 'error', message: `Invalid gene type: ${g['type']}` });
    return { valid: false, diagnostics };
  }

  switch (g['type'] as GeneType) {
    case 'scalar':
      if (typeof g['value'] !== 'number') diagnostics.push({ severity: 'error', message: 'Scalar.value must be number' });
      if (typeof g['min'] !== 'number') diagnostics.push({ severity: 'error', message: 'Scalar.min must be number' });
      if (typeof g['max'] !== 'number') diagnostics.push({ severity: 'error', message: 'Scalar.max must be number' });
      if (typeof g['min'] === 'number' && typeof g['max'] === 'number' && (g['min'] as number) > (g['max'] as number))
        diagnostics.push({ severity: 'error', message: 'Scalar.min must be <= Scalar.max' });
      break;
    case 'categorical':
      if (typeof g['value'] !== 'string') diagnostics.push({ severity: 'error', message: 'Categorical.value must be string' });
      if (!Array.isArray(g['options']) || g['options'].length === 0) diagnostics.push({ severity: 'error', message: 'Categorical.options must be non-empty array' });
      break;
    case 'vector':
      if (!Array.isArray(g['value'])) diagnostics.push({ severity: 'error', message: 'Vector.value must be array' });
      if (typeof g['dimensions'] !== 'number' || (g['dimensions'] as number) <= 0) diagnostics.push({ severity: 'error', message: 'Vector.dimensions must be positive number' });
      break;
    case 'expression':
      if (typeof g['source'] !== 'string') diagnostics.push({ severity: 'error', message: 'Expression.source must be string' });
      break;
    case 'struct':
      if (typeof g['value'] !== 'object' || g['value'] === null) diagnostics.push({ severity: 'error', message: 'Struct.value must be object' });
      break;
    case 'array':
      if (!Array.isArray(g['value'])) diagnostics.push({ severity: 'error', message: 'Array.value must be array' });
      break;
    case 'tensor':
      if (!(g['data'] instanceof Float64Array)) diagnostics.push({ severity: 'error', message: 'Tensor.data must be Float64Array' });
      if (!Array.isArray(g['shape']) || g['shape'].length === 0) diagnostics.push({ severity: 'error', message: 'Tensor.shape must be non-empty array' });
      break;
    case 'timeseries':
      if (!Array.isArray(g['keyframes']) || g['keyframes'].length < 2) diagnostics.push({ severity: 'error', message: 'TimeSeries.keyframes must have at least 2 points' });
      if (typeof g['interpolation'] !== 'string' || !['linear', 'cubic', 'step'].includes(g['interpolation'] as string))
        diagnostics.push({ severity: 'error', message: 'TimeSeries.interpolation must be linear, cubic, or step' });
      break;
  }

  return { valid: !diagnostics.some(d => d.severity === 'error'), diagnostics };
}

export function validateDomainSeeds(seed: UniversalSeed): ValidationResult {
  return validateSeed(seed);
}

// ═══════════════════════════════════════════════
// Convenience: Parse and execute GSPL source
// ═══════════════════════════════════════════════

export function executeGSPL(source: string, options?: {
  globals?: Record<string, unknown>;
  rng?: DeterministicRNG;
}): ExecutionResult & { seeds: Map<string, UniversalSeed> } {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const parseResult = parser.parse();

  if (parseResult.errors.length > 0 || !parseResult.program) {
    return {
      success: false,
      error: parseResult.errors.map(e => e.message).join('; '),
      seeds: new Map(),
    };
  }

  const interpreter = new Interpreter(options?.globals, options?.rng);
  const result = interpreter.execute(parseResult.program);
  return { ...result, seeds: interpreter.getSeeds() };
}
