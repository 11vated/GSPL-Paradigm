import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Interpreter
  Interpreter,
  executeGSPL,
  // World
  World,
  // Validation
  validateSeed,
  validateDomainSeeds,
  // Stdlib - Math
  stdlib_sin, stdlib_cos, stdlib_tan, stdlib_asin, stdlib_acos, stdlib_atan, stdlib_atan2,
  stdlib_sqrt, stdlib_cbrt, stdlib_pow,
  stdlib_abs, stdlib_floor, stdlib_ceil, stdlib_round, stdlib_trunc, stdlib_sign,
  stdlib_clamp, stdlib_lerp, stdlib_inverseLerp,
  stdlib_remap, stdlib_fract, stdlib_mod,
  stdlib_log, stdlib_log2, stdlib_log10, stdlib_exp,
  stdlib_min, stdlib_max,
  stdlib_isPrime, stdlib_gcd, stdlib_lcm,
  stdlib_fibonacci, stdlib_factorial, stdlib_smoothstep, stdlib_step,
  stdlib_toRadians, stdlib_toDegrees, stdlib_hypot,
  // Stdlib - Easing
  easeInQuad, easeOutQuad, easeInOutQuad,
  easeInCubic, easeOutCubic, easeInOutCubic,
  easeInQuart, easeOutQuart, easeInOutQuart,
  easeInQuint, easeOutQuint, easeInOutQuint,
  easeInSine, easeOutSine, easeInOutSine,
  easeInExpo, easeOutExpo, easeInOutExpo,
  easeInCirc, easeOutCirc, easeInOutCirc,
  easeInBack, easeOutBack, easeInOutBack,
  easeInElastic, easeOutElastic, easeInOutElastic,
  easeInBounce, easeOutBounce, easeInOutBounce,
  stdlib_spring,
  // Stdlib - Statistics
  stdlib_mean, stdlib_median, stdlib_mode, stdlib_variance, stdlib_stdDev,
  stdlib_sum, stdlib_product, stdlib_percentile, stdlib_iqr, stdlib_zScore,
  stdlib_correlation, stdlib_covariance, stdlib_linearRegression, stdlib_entropy,
  stdlib_movingAverage, stdlib_range,
  // Stdlib - Geometry
  stdlib_distance2d, stdlib_distance3d, stdlib_polygonArea, stdlib_triangleArea,
  stdlib_pointInRect, stdlib_pointInCircle, stdlib_pointInPolygon,
  stdlib_lineIntersect, stdlib_bezierPoint, stdlib_convexHull, stdlib_boundingBox,
  // Stdlib - Physics
  stdlib_gravity, stdlib_springForce, stdlib_dampingForce, stdlib_friction, stdlib_dragForce,
  stdlib_projectilePosition,
  stdlib_kineticEnergy, stdlib_potentialEnergy,
  stdlib_momentum, stdlib_elasticCollision1D, stdlib_orbitalVelocity, stdlib_escapeVelocity,
  PHYS_G,
  // Stdlib - Color
  stdlib_rgb, stdlib_hsl, stdlib_hslToRgb, stdlib_rgbToHsl,
  stdlib_hexToRgb, stdlib_rgbToHex, stdlib_blendColors,
  stdlib_luminance, stdlib_contrastRatio,
  // Stdlib - Vector
  stdlib_vec2, stdlib_vec3, stdlib_vecAdd, stdlib_vecSub, stdlib_vecMul,
  stdlib_vecMagnitude, stdlib_vecNormalize, stdlib_vecDot, stdlib_vecDistance,
  stdlib_vecRotate2d,
  // Types
  type ExecutionResult,
  type WorldConfig,
  type ExportedWorldState,
  type ValidationResult,
} from './index.js';

import { DeterministicRNG, DefaultSimulationClock } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import { createSeed } from '@paradigm/seed';
import { Lexer, Parser } from '@paradigm/lang';
import type { UniversalSeed, GeneMap } from '@paradigm/types';

// ═══════════════════════════════════════════════
// STDLIB: Math
// ═══════════════════════════════════════════════

describe('stdlib_math', () => {
  it('trig functions', () => {
    expect(stdlib_sin(0)).toBe(0);
    expect(stdlib_cos(0)).toBe(1);
    expect(stdlib_sin(Math.PI / 2)).toBeCloseTo(1);
  });

  it('abs', () => {
    expect(stdlib_abs(-5)).toBe(5);
    expect(stdlib_abs(5)).toBe(5);
  });

  it('clamp', () => {
    expect(stdlib_clamp(5, 0, 10)).toBe(5);
    expect(stdlib_clamp(-5, 0, 10)).toBe(0);
    expect(stdlib_clamp(15, 0, 10)).toBe(10);
  });

  it('lerp and inverseLerp', () => {
    expect(stdlib_lerp(0, 10, 0.5)).toBe(5);
    expect(stdlib_lerp(0, 10, 0)).toBe(0);
    expect(stdlib_lerp(0, 10, 1)).toBe(10);
    expect(stdlib_inverseLerp(0, 10, 5)).toBe(0.5);
  });

  it('remap', () => {
    expect(stdlib_remap(5, 0, 10, 0, 100)).toBe(50);
  });

  it('fract and mod', () => {
    expect(stdlib_fract(3.7)).toBeCloseTo(0.7);
    expect(stdlib_mod(-1, 3)).toBe(2);
    expect(stdlib_mod(5, 3)).toBe(2);
  });

  it('isPrime', () => {
    expect(stdlib_isPrime(2)).toBe(true);
    expect(stdlib_isPrime(7)).toBe(true);
    expect(stdlib_isPrime(4)).toBe(false);
    expect(stdlib_isPrime(1)).toBe(false);
  });

  it('gcd and lcm', () => {
    expect(stdlib_gcd(12, 8)).toBe(4);
    expect(stdlib_lcm(4, 6)).toBe(12);
  });

  it('fibonacci', () => {
    expect(stdlib_fibonacci(0)).toBe(0);
    expect(stdlib_fibonacci(1)).toBe(1);
    expect(stdlib_fibonacci(10)).toBe(55);
  });

  it('factorial', () => {
    expect(stdlib_factorial(0)).toBe(1);
    expect(stdlib_factorial(5)).toBe(120);
    expect(() => stdlib_factorial(-1)).toThrow();
  });

  it('smoothstep and step', () => {
    expect(stdlib_smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(stdlib_smoothstep(0, 1, 0)).toBe(0);
    expect(stdlib_smoothstep(0, 1, 1)).toBe(1);
    expect(stdlib_step(0.5, 0.3)).toBe(0);
    expect(stdlib_step(0.5, 0.7)).toBe(1);
  });

  it('degree conversions', () => {
    expect(stdlib_toRadians(180)).toBeCloseTo(Math.PI);
    expect(stdlib_toDegrees(Math.PI)).toBeCloseTo(180);
  });

  it('hypot', () => {
    expect(stdlib_hypot(3, 4)).toBe(5);
  });

  it('trig extended: tan, asin, acos, atan, atan2', () => {
    expect(stdlib_tan(0)).toBe(0);
    expect(stdlib_asin(1)).toBeCloseTo(Math.PI / 2);
    expect(stdlib_acos(1)).toBeCloseTo(0);
    expect(stdlib_atan(0)).toBe(0);
    expect(stdlib_atan2(1, 1)).toBeCloseTo(Math.PI / 4);
  });

  it('sqrt, cbrt, pow', () => {
    expect(stdlib_sqrt(16)).toBe(4);
    expect(stdlib_cbrt(27)).toBe(3);
    expect(stdlib_pow(2, 10)).toBe(1024);
  });

  it('floor, ceil, round, trunc, sign', () => {
    expect(stdlib_floor(3.7)).toBe(3);
    expect(stdlib_ceil(3.2)).toBe(4);
    expect(stdlib_round(3.5)).toBe(4);
    expect(stdlib_trunc(3.9)).toBe(3);
    expect(stdlib_sign(-5)).toBe(-1);
    expect(stdlib_sign(5)).toBe(1);
  });

  it('log, log2, log10, exp', () => {
    expect(stdlib_log(1)).toBe(0);
    expect(stdlib_log2(8)).toBe(3);
    expect(stdlib_log10(100)).toBe(2);
    expect(stdlib_exp(0)).toBe(1);
  });

  it('min and max', () => {
    expect(stdlib_min(3, 1, 2)).toBe(1);
    expect(stdlib_max(3, 1, 2)).toBe(3);
  });
});

// ═══════════════════════════════════════════════
// STDLIB: Easing
// ═══════════════════════════════════════════════

describe('stdlib_easing', () => {
  it('all easings start at 0 and end at 1', () => {
    const fns = [easeInQuad, easeOutQuad, easeInOutQuad, easeInCubic, easeOutBounce];
    for (const fn of fns) {
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });

  it('elastic and spring return reasonable values', () => {
    expect(easeInElastic(0)).toBe(0);
    expect(easeInElastic(1)).toBe(1);
    expect(easeOutElastic(0)).toBe(0);
    expect(easeOutElastic(1)).toBe(1);
    expect(typeof stdlib_spring(0.5)).toBe('number');
  });

  it('all easing families pass boundary conditions (0→0, 1→1)', () => {
    const families = [
      easeInCubic, easeOutCubic, easeInOutCubic,
      easeInQuart, easeOutQuart, easeInOutQuart,
      easeInQuint, easeOutQuint, easeInOutQuint,
      easeInSine, easeOutSine, easeInOutSine,
      easeInExpo, easeOutExpo, easeInOutExpo,
      easeInCirc, easeOutCirc, easeInOutCirc,
      easeInBack, easeOutBack, easeInOutBack,
      easeInOutElastic,
      easeInBounce, easeInOutBounce,
    ];
    for (const fn of families) {
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });
});

// ═══════════════════════════════════════════════
// STDLIB: Statistics
// ═══════════════════════════════════════════════

describe('stdlib_statistics', () => {
  it('mean', () => {
    expect(stdlib_mean([1, 2, 3, 4, 5])).toBe(3);
    expect(stdlib_mean([])).toBe(0);
  });

  it('median', () => {
    expect(stdlib_median([1, 3, 5])).toBe(3);
    expect(stdlib_median([1, 2, 3, 4])).toBe(2.5);
    expect(stdlib_median([])).toBe(0);
  });

  it('mode', () => {
    expect(stdlib_mode([1, 2, 2, 3])).toBe(2);
  });

  it('variance and stdDev', () => {
    expect(stdlib_variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4);
    expect(stdlib_stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2);
  });

  it('sum and product', () => {
    expect(stdlib_sum([1, 2, 3])).toBe(6);
    expect(stdlib_product([2, 3, 4])).toBe(24);
  });

  it('range', () => {
    expect(stdlib_range([1, 5, 3])).toBe(4);
  });

  it('percentile', () => {
    expect(stdlib_percentile([10, 20, 30, 40, 50], 50)).toBe(30);
  });

  it('iqr', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(stdlib_iqr(vals)).toBeGreaterThan(0);
  });

  it('zScore', () => {
    expect(stdlib_zScore([10, 20, 30], 20)).toBe(0);
  });

  it('correlation', () => {
    expect(stdlib_correlation([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(stdlib_correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(stdlib_correlation([], [])).toBe(0);
  });

  it('covariance', () => {
    expect(stdlib_covariance([1, 2, 3], [1, 2, 3])).toBeGreaterThan(0);
  });

  it('linearRegression', () => {
    const result = stdlib_linearRegression([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(result.slope).toBeCloseTo(2);
    expect(result.intercept).toBeCloseTo(0);
  });

  it('entropy', () => {
    expect(stdlib_entropy([1, 1, 1, 1])).toBeCloseTo(2);
    expect(stdlib_entropy([1, 0, 0, 0])).toBe(0);
    expect(stdlib_entropy([])).toBe(0);
  });

  it('movingAverage', () => {
    const result = stdlib_movingAverage([1, 2, 3, 4, 5], 3);
    expect(result.length).toBe(5);
    expect(result[0]).toBe(1);
    expect(result[2]).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// STDLIB: Geometry
// ═══════════════════════════════════════════════

describe('stdlib_geometry', () => {
  it('distance2d', () => {
    expect(stdlib_distance2d(0, 0, 3, 4)).toBe(5);
  });

  it('distance3d', () => {
    expect(stdlib_distance3d(0, 0, 0, 1, 2, 2)).toBe(3);
  });

  it('polygonArea', () => {
    expect(stdlib_polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(12);
    expect(stdlib_polygonArea([])).toBe(0);
  });

  it('triangleArea', () => {
    expect(stdlib_triangleArea(0, 0, 4, 0, 0, 3)).toBe(6);
  });

  it('pointInRect', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(stdlib_pointInRect(5, 5, rect)).toBe(true);
    expect(stdlib_pointInRect(15, 5, rect)).toBe(false);
  });

  it('pointInCircle', () => {
    const circle = { x: 0, y: 0, radius: 5 };
    expect(stdlib_pointInCircle(3, 3, circle)).toBe(true);
    expect(stdlib_pointInCircle(10, 10, circle)).toBe(false);
  });

  it('pointInPolygon', () => {
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(stdlib_pointInPolygon(5, 5, poly)).toBe(true);
    expect(stdlib_pointInPolygon(15, 5, poly)).toBe(false);
  });

  it('lineIntersect', () => {
    expect(stdlib_lineIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true);
    expect(stdlib_lineIntersect(0, 0, 1, 0, 0, 1, 1, 1)).toBe(false);
  });

  it('bezierPoint', () => {
    const p = stdlib_bezierPoint({ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 0 }, 0.5);
    expect(typeof p.x).toBe('number');
    expect(typeof p.y).toBe('number');
  });

  it('convexHull', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0.5 }];
    const hull = stdlib_convexHull(pts);
    expect(hull.length).toBeGreaterThanOrEqual(3);
  });

  it('boundingBox', () => {
    const bb = stdlib_boundingBox([{ x: 1, y: 2 }, { x: 5, y: 8 }]);
    expect(bb).toEqual({ x: 1, y: 2, width: 4, height: 6 });
    expect(stdlib_boundingBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

// ═══════════════════════════════════════════════
// STDLIB: Physics
// ═══════════════════════════════════════════════

describe('stdlib_physics', () => {
  it('gravity', () => {
    expect(stdlib_gravity(1, 1, 0)).toBe(0);
    expect(stdlib_gravity(1e10, 1e10, 1)).toBeCloseTo(PHYS_G * 1e20);
  });

  it('springForce', () => {
    expect(stdlib_springForce(2, 10)).toBe(-20);
  });

  it('kineticEnergy', () => {
    expect(stdlib_kineticEnergy(2, 3)).toBe(9);
  });

  it('potentialEnergy', () => {
    expect(stdlib_potentialEnergy(1, 10)).toBeCloseTo(98.1);
  });

  it('momentum', () => {
    expect(stdlib_momentum(5, 3)).toBe(15);
  });

  it('elasticCollision1D', () => {
    const result = stdlib_elasticCollision1D(1, 1, 1, 0);
    expect(result.v1).toBeCloseTo(0);
    expect(result.v2).toBeCloseTo(1);
  });

  it('orbitalVelocity', () => {
    expect(stdlib_orbitalVelocity(1e24, 1e6)).toBeGreaterThan(0);
  });

  it('dampingForce', () => {
    expect(stdlib_dampingForce(5, 2)).toBe(-10);
  });

  it('friction', () => {
    expect(stdlib_friction(100, 0.3)).toBeCloseTo(30);
  });

  it('dragForce', () => {
    expect(stdlib_dragForce(10, 1.2, 2, 0.5)).toBeGreaterThan(0);
  });

  it('projectilePosition', () => {
    const pos = stdlib_projectilePosition(10, Math.PI / 4, 1);
    expect(pos.x).toBeGreaterThan(0);
    expect(typeof pos.y).toBe('number');
  });

  it('escapeVelocity', () => {
    expect(stdlib_escapeVelocity(1e24, 1e6)).toBeGreaterThan(0);
    expect(stdlib_escapeVelocity(1e24, 1e6)).toBeGreaterThan(stdlib_orbitalVelocity(1e24, 1e6));
  });
});

// ═══════════════════════════════════════════════
// STDLIB: Color
// ═══════════════════════════════════════════════

describe('stdlib_color', () => {
  it('rgb clamps values', () => {
    expect(stdlib_rgb(300, -10, 128)).toEqual({ r: 255, g: 0, b: 128 });
  });

  it('hsl normalizes', () => {
    expect(stdlib_hsl(400, 50, 50)).toEqual({ h: 40, s: 50, l: 50 });
  });

  it('hslToRgb and rgbToHsl round-trip', () => {
    const hsl = { h: 120, s: 100, l: 50 };
    const rgb = stdlib_hslToRgb(hsl);
    expect(rgb.r).toBeCloseTo(0, -1);
    expect(rgb.g).toBeCloseTo(255, -1);
    expect(rgb.b).toBeCloseTo(0, -1);
    const back = stdlib_rgbToHsl(rgb);
    expect(back.h).toBeCloseTo(120, -1);
  });

  it('hex conversions', () => {
    expect(stdlib_hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(stdlib_rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
    expect(stdlib_hexToRgb('invalid')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('blendColors', () => {
    const blended = stdlib_blendColors({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5);
    expect(blended.r).toBeCloseTo(128, -1);
  });

  it('luminance and contrastRatio', () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    expect(stdlib_luminance(white)).toBeCloseTo(1);
    expect(stdlib_luminance(black)).toBe(0);
    expect(stdlib_contrastRatio(white, black)).toBeCloseTo(21);
  });
});

// ═══════════════════════════════════════════════
// STDLIB: Vector
// ═══════════════════════════════════════════════

describe('stdlib_vector', () => {
  it('constructors', () => {
    expect(stdlib_vec2(1, 2)).toEqual({ x: 1, y: 2 });
    expect(stdlib_vec3(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('add and sub', () => {
    expect(stdlib_vecAdd({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(stdlib_vecSub({ x: 5, y: 3 }, { x: 2, y: 1 })).toEqual({ x: 3, y: 2 });
  });

  it('mul and magnitude', () => {
    expect(stdlib_vecMul({ x: 2, y: 3 }, 2)).toEqual({ x: 4, y: 6 });
    expect(stdlib_vecMagnitude({ x: 3, y: 4 })).toBe(5);
  });

  it('normalize', () => {
    const n = stdlib_vecNormalize({ x: 3, y: 4 });
    expect(stdlib_vecMagnitude(n)).toBeCloseTo(1);
    expect(stdlib_vecNormalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('dot', () => {
    expect(stdlib_vecDot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    expect(stdlib_vecDot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
  });

  it('distance', () => {
    expect(stdlib_vecDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('rotate2d', () => {
    const rotated = stdlib_vecRotate2d({ x: 1, y: 0 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
  });
});

// ═══════════════════════════════════════════════
// INTERPRETER
// ═══════════════════════════════════════════════

describe('Interpreter', () => {
  let rng: DeterministicRNG;

  beforeEach(() => {
    rng = new DeterministicRNG('test-seed');
  });

  function run(source: string, globals?: Record<string, unknown>) {
    return executeGSPL(source, { globals, rng });
  }

  describe('expressions', () => {
    it('evaluates arithmetic', () => {
      const result = run('let x = 2 + 3 * 4;');
      expect(result.success).toBe(true);
    });

    it('evaluates string concatenation', () => {
      const result = run('let x = "hello" + " world";');
      expect(result.success).toBe(true);
    });

    it('evaluates comparison operators', () => {
      const result = run('let a = 5 > 3; let b = 5 < 3;');
      expect(result.success).toBe(true);
    });

    it('evaluates if-expression (no ternary in GSPL)', () => {
      const result = run('let x = 0; if (true) { x = 1; } return x;');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
    });
  });

  describe('variables and functions', () => {
    it('declares and reads variables', () => {
      const result = run('let x = 42; let y = x;');
      expect(result.success).toBe(true);
    });

    it('declares and calls functions', () => {
      const result = run('fn add(a, b) { return a + b; } let r = add(3, 4);');
      expect(result.success).toBe(true);
    });

    it('supports closures', () => {
      const result = run('fn makeAdder(x) { return fn(y) { return x + y; }; } let add5 = makeAdder(5); let r = add5(3);');
      expect(result.success).toBe(true);
    });

    it('function returns value', () => {
      const result = run('fn double(x) { return x * 2; } return double(21);');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });
  });

  describe('control flow', () => {
    it('if-else', () => {
      const result = run('let x = 0; if (true) { x = 1; } else { x = 2; } return x;');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
    });

    it('while loop', () => {
      const result = run('let i = 0; while (i < 5) { i = i + 1; } return i;');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('for-in loop', () => {
      const result = run('let sum = 0; for (x in [1, 2, 3]) { sum = sum + x; } return sum;');
      expect(result.success).toBe(true);
      expect(result.value).toBe(6);
    });

    it('break exits loop', () => {
      const result = run('let i = 0; while (true) { i = i + 1; if (i == 3) { break; } } return i;');
      expect(result.success).toBe(true);
      expect(result.value).toBe(3);
    });

    it('continue skips iteration', () => {
      const result = run('let sum = 0; for (x in [1, 2, 3, 4, 5]) { if (x == 3) { continue; } sum = sum + x; } return sum;');
      expect(result.success).toBe(true);
      expect(result.value).toBe(12);
    });
  });

  describe('built-in functions', () => {
    it('math builtins work', () => {
      const result = run('return sqrt(16);');
      expect(result.success).toBe(true);
      expect(result.value).toBe(4);
    });

    it('trig builtins work', () => {
      const result = run('return sin(0);');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });

    it('string functions work', () => {
      const result = run('return toUpperCase("hello");');
      expect(result.success).toBe(true);
      expect(result.value).toBe('HELLO');
    });

    it('array functions work', () => {
      const result = run('return length([1, 2, 3]);');
      expect(result.success).toBe(true);
      expect(result.value).toBe(3);
    });

    it('easing functions available', () => {
      const result = run('return easeInQuad(0.5);');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0.25);
    });

    it('statistics functions available', () => {
      const result = run('return mean([1, 2, 3, 4, 5]);');
      expect(result.success).toBe(true);
      expect(result.value).toBe(3);
    });

    it('type checking functions', () => {
      const result = run('return isNumber(42);');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('random is deterministic', () => {
      const rng1 = new DeterministicRNG('det-test');
      const rng2 = new DeterministicRNG('det-test');
      const r1 = executeGSPL('return random();', { rng: rng1 });
      const r2 = executeGSPL('return random();', { rng: rng2 });
      expect(r1.value).toBe(r2.value);
    });
  });

  describe('seed declarations', () => {
    it('creates a seed', () => {
      const result = run(`
        seed Warrior : organism {
          fields {
            health: 100
            speed: 50
          }
        }
      `);
      expect(result.success).toBe(true);
      expect(result.seeds.size).toBe(1);
      const seed = result.seeds.get('Warrior');
      expect(seed).toBeDefined();
      expect(seed!.$domain).toBe('organism');
      expect(seed!.$gst).toBe('4.0');
      expect(seed!.genes['health']).toBeDefined();
      expect(seed!.genes['health']!.type).toBe('scalar');
    });

    it('creates seed with string genes', () => {
      const result = run(`
        seed MyBot : robot {
          fields { name: "Robo" }
        }
      `);
      expect(result.success).toBe(true);
      const seed = result.seeds.get('MyBot');
      expect(seed!.genes['name']!.type).toBe('categorical');
    });

    it('defaults to organism domain', () => {
      const result = run(`seed Basic { fields { hp: 10 } }`);
      expect(result.success).toBe(true);
      expect(result.seeds.get('Basic')!.$domain).toBe('organism');
    });
  });

  describe('GSPL 5.0: Living World syntax', () => {
    it('parses world declarations', () => {
      const result = run(`
        world ForestWorld {
          name: "Enchanted Forest"
          size: 1000
        }
      `);
      expect(result.success).toBe(true);
    });

    it('parses entity declarations', () => {
      const result = run(`
        entity Wolf {
          stats {
            speed: 15
            strength: 6
          }
        }
      `);
      expect(result.success).toBe(true);
      expect(result.seeds.has('Wolf')).toBe(true);
    });

    it('parses law declarations', () => {
      const result = run(`
        law GravityLaw {
          force: 9.81
        }
      `);
      expect(result.success).toBe(true);
    });

    it('parses observation declarations', () => {
      const result = run(`
        observation Note {
          text: "Something happened"
          priority: 5
        }
      `);
      expect(result.success).toBe(true);
    });
  });

  describe('composition operations', () => {
    it('breeds two seeds', () => {
      const result = run(`
        seed A : organism { fields { hp: 100 speed: 10 } }
        seed B : organism { fields { hp: 50 speed: 90 } }
        breed Child = (A, B);
      `);
      expect(result.success).toBe(true);
      expect(result.seeds.has('Child')).toBe(true);
    });

    it('mutates a seed', () => {
      const result = run(`
        seed Base : organism { fields { hp: 100 } }
        mutate Mutant = (Base, 0.5);
      `);
      expect(result.success).toBe(true);
      expect(result.seeds.has('Mutant')).toBe(true);
    });

    it('breed fails without 2 parents', () => {
      const result = run(`breed X = ();`);
      expect(result.success).toBe(false);
    });

    it('mutate fails with invalid parent', () => {
      const result = run(`mutate X = (42);`);
      expect(result.success).toBe(false);
    });
  });

  describe('error handling', () => {
    it('parse errors return failure', () => {
      const result = run('let x = ;');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('import parses but does not resolve (no-op in standalone runtime)', () => {
      // Imports are parsed into program.imports but the interpreter only
      // iterates program.declarations — so imports silently succeed.
      // Resolution is the host environment's responsibility.
      const result = run('import foo from "bar";');
      expect(result.success).toBe(true);
    });
  });

  describe('globals injection', () => {
    it('provides globals to interpreter', () => {
      const result = run('return config;', { config: 42 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });
  });
});

// ═══════════════════════════════════════════════
// WORLD
// ═══════════════════════════════════════════════

describe('World', () => {
  let rng: DeterministicRNG;
  let eventBus: EventBus;

  function makeSeed(name: string, domain: string = 'organism'): UniversalSeed {
    return createSeed(name, domain as any, {
      health: { type: 'scalar', value: 100, min: 0, max: 200 },
      speed: { type: 'scalar', value: 50, min: 0, max: 100 },
    }, rng);
  }

  beforeEach(() => {
    rng = new DeterministicRNG('world-test');
    eventBus = new EventBus();
  });

  it('creates world with config', () => {
    const world = new World({ name: 'TestWorld', eventBus });
    expect(world.name).toBe('TestWorld');
    expect(world.getSeedCount()).toBe(0);
  });

  it('registers and retrieves seeds', () => {
    const world = new World({ name: 'W', eventBus });
    const seed = makeSeed('warrior');
    world.registerSeed(seed);
    expect(world.getSeedCount()).toBe(1);
    expect(world.getSeed(seed.$hash)).toBeDefined();
  });

  it('retrieves seed by name (case-insensitive)', () => {
    const world = new World({ name: 'W', eventBus });
    const seed = makeSeed('warrior');
    world.registerSeed(seed);
    expect(world.getSeed('WARRIOR')).toBeDefined();
  });

  it('lists all seeds', () => {
    const world = new World({ name: 'W', eventBus });
    world.registerSeed(makeSeed('a'));
    world.registerSeed(makeSeed('b'));
    expect(world.listSeeds().length).toBe(2);
  });

  it('queries seeds by predicate', () => {
    const world = new World({ name: 'W', eventBus });
    world.registerSeed(makeSeed('a'));
    world.registerSeed(makeSeed('b'));
    const results = world.query(s => s.$name === 'a');
    expect(results.length).toBe(1);
  });

  it('updates seed', () => {
    const world = new World({ name: 'W', eventBus });
    const seed = makeSeed('warrior');
    world.registerSeed(seed);
    const updated = { ...seed, $name: 'super-warrior' };
    world.updateSeed(updated);
    expect(world.getSeed(seed.$hash)?.$name).toBe('super-warrior');
  });

  it('removes seed', () => {
    const world = new World({ name: 'W', eventBus });
    const seed = makeSeed('warrior');
    world.registerSeed(seed);
    expect(world.removeSeed(seed.$hash)).toBe(true);
    expect(world.getSeedCount()).toBe(0);
    expect(world.removeSeed('nonexistent')).toBe(false);
  });

  it('clears all seeds', () => {
    const world = new World({ name: 'W', eventBus });
    world.registerSeed(makeSeed('a'));
    world.registerSeed(makeSeed('b'));
    world.clear();
    expect(world.getSeedCount()).toBe(0);
  });

  it('emits events on changes', () => {
    const handler = vi.fn();
    eventBus.on('world.changed', handler);
    const world = new World({ name: 'W', eventBus });
    world.registerSeed(makeSeed('a'));
    expect(handler).toHaveBeenCalledTimes(1);
    world.clear();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('simulates with fitness evaluation', () => {
    const world = new World({ name: 'W', eventBus });
    world.registerSeed(makeSeed('a'));
    world.registerSeed(makeSeed('b'));
    const result = world.simulate(3, { rng });
    expect(result.tick).toBe(3);
    expect(result.averageFitness).toBeGreaterThanOrEqual(0);
    expect(result.bestFitness).toBeGreaterThanOrEqual(0);
  });

  it('simulate throws on non-positive ticks', () => {
    const world = new World({ name: 'W', eventBus });
    expect(() => world.simulate(0)).toThrow('Ticks must be positive');
  });

  it('configurable survival threshold', () => {
    const world = new World({ name: 'W', eventBus, survivalThreshold: 0.99 });
    world.registerSeed(makeSeed('a'));
    world.simulate(1, { rng });
    // High threshold should kill seeds with default fitness evaluator
    expect(world.getSeedCount()).toBe(0);
  });

  it('exports and restores state', () => {
    const world = new World({ name: 'W', eventBus });
    world.registerSeed(makeSeed('warrior'));
    world.registerSeed(makeSeed('mage'));
    const state = world.exportState();
    expect(state.world.seedCount).toBe(2);
    expect(state.world.seeds.length).toBe(2);

    const restored = World.fromState(state, rng);
    expect(restored.name).toBe('W');
    expect(restored.getSeedCount()).toBe(2);
  });

  it('creates and restores snapshot', () => {
    const world = new World({ name: 'W', eventBus });
    world.registerSeed(makeSeed('warrior'));
    const snapshot = world.createSnapshot();
    expect(snapshot.timestamp).toBeDefined();

    const restored = World.fromSnapshot(snapshot, rng);
    expect(restored.getSeedCount()).toBe(1);
  });

  it('exposes event bus', () => {
    const world = new World({ name: 'W', eventBus });
    expect(world.getEventBus()).toBe(eventBus);
  });

  it('clock management', () => {
    const world = new World({ name: 'W', eventBus });
    const t0 = world.getClock().now();
    world.advanceClock();
    expect(world.getClock().now()).toBeGreaterThan(t0);
  });
});

// ═══════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════

describe('Validation', () => {
  let rng: DeterministicRNG;

  beforeEach(() => {
    rng = new DeterministicRNG('validation-test');
  });

  function makeValidSeed(): UniversalSeed {
    return createSeed('test', 'organism', {
      health: { type: 'scalar', value: 100, min: 0, max: 200 },
    }, rng);
  }

  it('validates a correct seed', () => {
    const seed = makeValidSeed();
    const result = validateSeed(seed);
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.seed).not.toBeNull();
  });

  it('rejects non-object', () => {
    const result = validateSeed(null);
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]!.message).toContain('object');
  });

  it('rejects wrong $gst version', () => {
    const seed = { ...makeValidSeed(), $gst: '1.0' as any };
    const result = validateSeed(seed);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.path === '$gst')).toBe(true);
  });

  it('rejects invalid domain', () => {
    const seed = { ...makeValidSeed(), $domain: 'invalid-domain' as any };
    const result = validateSeed(seed);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.path === '$domain')).toBe(true);
  });

  it('rejects empty name', () => {
    const seed = { ...makeValidSeed(), $name: '' };
    const result = validateSeed(seed);
    expect(result.valid).toBe(false);
  });

  it('rejects missing lineage', () => {
    const seed = { ...makeValidSeed(), $lineage: null as any };
    const result = validateSeed(seed);
    expect(result.valid).toBe(false);
  });

  it('rejects empty genes', () => {
    const seed = { ...makeValidSeed(), genes: {} };
    const result = validateSeed(seed);
    expect(result.valid).toBe(false);
  });

  it('validates scalar gene min <= max', () => {
    const seed = makeValidSeed();
    seed.genes['bad'] = { type: 'scalar', value: 5, min: 100, max: 0 };
    const result = validateSeed(seed);
    expect(result.valid).toBe(false);
  });

  it('validates categorical gene', () => {
    const seed = makeValidSeed();
    seed.genes['cat'] = { type: 'categorical', value: 'a', options: ['a', 'b'] };
    const result = validateSeed(seed);
    expect(result.valid).toBe(true);
  });

  it('validates vector gene', () => {
    const seed = makeValidSeed();
    seed.genes['vec'] = { type: 'vector', value: [1, 2, 3], dimensions: 3 };
    const result = validateSeed(seed);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid gene type', () => {
    const seed = makeValidSeed();
    (seed.genes as any)['bad'] = { type: 'not-a-type', value: 0 };
    const result = validateSeed(seed);
    expect(result.valid).toBe(false);
  });

  it('validateDomainSeeds delegates to validateSeed', () => {
    const seed = makeValidSeed();
    const result = validateDomainSeeds(seed);
    expect(result.valid).toBe(true);
  });

  it('warns on missing metadata', () => {
    const seed = { ...makeValidSeed(), $metadata: null as any };
    const result = validateSeed(seed);
    // Missing metadata is a warning, not error
    expect(result.diagnostics.some(d => d.severity === 'warning' && d.path === '$metadata')).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// executeGSPL convenience function
// ═══════════════════════════════════════════════

describe('executeGSPL', () => {
  it('parses and executes GSPL source', () => {
    const result = executeGSPL('let x = 42; return x;');
    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
    expect(result.seeds).toBeDefined();
  });

  it('returns parse errors', () => {
    const result = executeGSPL('invalid }{}{;');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('accepts custom RNG for determinism', () => {
    const rng = new DeterministicRNG('fixed');
    const r1 = executeGSPL('return random();', { rng: new DeterministicRNG('fixed') });
    const r2 = executeGSPL('return random();', { rng: new DeterministicRNG('fixed') });
    expect(r1.value).toBe(r2.value);
  });
});
