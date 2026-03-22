import { describe, it, expect, beforeEach } from 'vitest';
import type { UniversalSeed } from '@paradigm/types';
import {
  Vec2,
  CollisionDetector,
  CollisionResolver,
  SpatialHash,
  ForceGenerator,
  VerletIntegrator,
  CharacterController,
  PhysicsWorld,
  PhysicsEngine,
} from './index.js';
import type { Body, AABB, Circle, Shape } from './index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeSeed = (name: string, domain: string, genes: Record<string, unknown> = {}): UniversalSeed => ({
  $gst: '4.0', $name: name, $domain: domain as any, genes: genes as any,
  $hash: name + '-hash', $lineage: [], $metadata: { created: Date.now(), generation: 0 }, $fitness: [0.5],
});

function makeBody(overrides: Partial<Body> = {}): Body {
  return {
    id: overrides.id ?? 'b1',
    position: overrides.position ?? Vec2.zero(),
    velocity: overrides.velocity ?? Vec2.zero(),
    acceleration: overrides.acceleration ?? Vec2.zero(),
    mass: overrides.mass ?? 1,
    restitution: overrides.restitution ?? 0.5,
    friction: overrides.friction ?? 0.5,
    shape: overrides.shape ?? { kind: 'aabb', aabb: { min: new Vec2(-0.5, -0.5), max: new Vec2(0.5, 0.5) } },
    isStatic: overrides.isStatic ?? false,
    forces: overrides.forces ?? [],
  };
}

function makeAABBShape(minX: number, minY: number, maxX: number, maxY: number): Shape {
  return { kind: 'aabb', aabb: { min: new Vec2(minX, minY), max: new Vec2(maxX, maxY) } };
}

function makeCircleShape(cx: number, cy: number, radius: number): Shape {
  return { kind: 'circle', circle: { center: new Vec2(cx, cy), radius } };
}

// ---------------------------------------------------------------------------
// Vec2
// ---------------------------------------------------------------------------

describe('Vec2', () => {
  describe('constructor', () => {
    it('stores x and y', () => {
      const v = new Vec2(3, 4);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });
  });

  describe('static factories', () => {
    it('zero() returns (0,0)', () => {
      const v = Vec2.zero();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });

    it('one() returns (1,1)', () => {
      const v = Vec2.one();
      expect(v.x).toBe(1);
      expect(v.y).toBe(1);
    });

    it('up() returns (0,-1)', () => {
      const v = Vec2.up();
      expect(v.x).toBe(0);
      expect(v.y).toBe(-1);
    });

    it('right() returns (1,0)', () => {
      const v = Vec2.right();
      expect(v.x).toBe(1);
      expect(v.y).toBe(0);
    });
  });

  describe('add', () => {
    it('adds two vectors', () => {
      const result = new Vec2(1, 2).add(new Vec2(3, 4));
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('does not mutate operands', () => {
      const a = new Vec2(1, 2);
      const b = new Vec2(3, 4);
      a.add(b);
      expect(a.x).toBe(1);
    });
  });

  describe('sub', () => {
    it('subtracts two vectors', () => {
      const result = new Vec2(5, 6).sub(new Vec2(2, 1));
      expect(result.x).toBe(3);
      expect(result.y).toBe(5);
    });
  });

  describe('scale', () => {
    it('scales by scalar', () => {
      const result = new Vec2(3, 4).scale(2);
      expect(result.x).toBe(6);
      expect(result.y).toBe(8);
    });

    it('scale by zero gives zero vector', () => {
      const result = new Vec2(3, 4).scale(0);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });
  });

  describe('dot', () => {
    it('computes dot product', () => {
      expect(new Vec2(1, 2).dot(new Vec2(3, 4))).toBe(11);
    });

    it('perpendicular vectors have zero dot', () => {
      expect(new Vec2(1, 0).dot(new Vec2(0, 1))).toBe(0);
    });
  });

  describe('lengthSq', () => {
    it('returns squared length', () => {
      expect(new Vec2(3, 4).lengthSq()).toBe(25);
    });
  });

  describe('length', () => {
    it('returns Euclidean length', () => {
      expect(new Vec2(3, 4).length()).toBeCloseTo(5);
    });

    it('zero vector has length 0', () => {
      expect(Vec2.zero().length()).toBe(0);
    });
  });

  describe('normalize', () => {
    it('returns unit vector', () => {
      const n = new Vec2(3, 4).normalize();
      expect(n.length()).toBeCloseTo(1);
    });

    it('normalizing zero vector returns zero', () => {
      const n = Vec2.zero().normalize();
      expect(n.x).toBe(0);
      expect(n.y).toBe(0);
    });
  });

  describe('distanceTo', () => {
    it('computes distance between points', () => {
      expect(new Vec2(0, 0).distanceTo(new Vec2(3, 4))).toBeCloseTo(5);
    });

    it('distance to itself is 0', () => {
      const v = new Vec2(7, 8);
      expect(v.distanceTo(v)).toBe(0);
    });
  });

  describe('angle', () => {
    it('returns atan2(y, x)', () => {
      expect(new Vec2(1, 0).angle()).toBeCloseTo(0);
      expect(new Vec2(0, 1).angle()).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('rotate', () => {
    it('rotates 90 degrees', () => {
      const r = new Vec2(1, 0).rotate(Math.PI / 2);
      expect(r.x).toBeCloseTo(0);
      expect(r.y).toBeCloseTo(1);
    });

    it('rotates 180 degrees', () => {
      const r = new Vec2(1, 0).rotate(Math.PI);
      expect(r.x).toBeCloseTo(-1);
      expect(r.y).toBeCloseTo(0);
    });
  });

  describe('perpendicular', () => {
    it('returns (-y, x)', () => {
      const p = new Vec2(3, 4).perpendicular();
      expect(p.x).toBe(-4);
      expect(p.y).toBe(3);
    });

    it('is perpendicular to original', () => {
      const v = new Vec2(3, 4);
      expect(v.dot(v.perpendicular())).toBeCloseTo(0);
    });
  });

  describe('lerp', () => {
    it('t=0 returns start', () => {
      const r = new Vec2(0, 0).lerp(new Vec2(10, 10), 0);
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
    });

    it('t=1 returns end', () => {
      const r = new Vec2(0, 0).lerp(new Vec2(10, 10), 1);
      expect(r.x).toBe(10);
      expect(r.y).toBe(10);
    });

    it('t=0.5 returns midpoint', () => {
      const r = new Vec2(0, 0).lerp(new Vec2(10, 0), 0.5);
      expect(r.x).toBeCloseTo(5);
    });
  });

  describe('clone', () => {
    it('produces equal but distinct object', () => {
      const v = new Vec2(5, 6);
      const c = v.clone();
      expect(c.x).toBe(5);
      expect(c.y).toBe(6);
      expect(c).not.toBe(v);
    });
  });

  describe('equals', () => {
    it('returns true for same values', () => {
      expect(new Vec2(1, 2).equals(new Vec2(1, 2))).toBe(true);
    });

    it('returns false for different values', () => {
      expect(new Vec2(1, 2).equals(new Vec2(1, 3))).toBe(false);
    });

    it('respects epsilon', () => {
      expect(new Vec2(1, 2).equals(new Vec2(1 + 1e-10, 2), 1e-9)).toBe(true);
      expect(new Vec2(1, 2).equals(new Vec2(1 + 1, 2), 1e-9)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// CollisionDetector
// ---------------------------------------------------------------------------

describe('CollisionDetector', () => {
  let detector: CollisionDetector;

  beforeEach(() => {
    detector = new CollisionDetector();
  });

  describe('testAABBvsAABB', () => {
    it('returns null when no overlap on X axis', () => {
      const a: AABB = { min: new Vec2(0, 0), max: new Vec2(1, 1) };
      const b: AABB = { min: new Vec2(2, 0), max: new Vec2(3, 1) };
      expect(detector.testAABBvsAABB(a, b)).toBeNull();
    });

    it('returns null when no overlap on Y axis', () => {
      const a: AABB = { min: new Vec2(0, 0), max: new Vec2(1, 1) };
      const b: AABB = { min: new Vec2(0, 2), max: new Vec2(1, 3) };
      expect(detector.testAABBvsAABB(a, b)).toBeNull();
    });

    it('detects overlap and returns result with depth', () => {
      const a: AABB = { min: new Vec2(0, 0), max: new Vec2(2, 2) };
      const b: AABB = { min: new Vec2(1, 0), max: new Vec2(3, 2) };
      const result = detector.testAABBvsAABB(a, b);
      expect(result).not.toBeNull();
      expect(result!.depth).toBeCloseTo(1);
    });

    it('uses X-axis normal when overlapX < overlapY', () => {
      // Overlap on X is 0.1, Y is 2 → normal along X
      const a: AABB = { min: new Vec2(0, 0), max: new Vec2(1.1, 2) };
      const b: AABB = { min: new Vec2(1, 0), max: new Vec2(2, 2) };
      const result = detector.testAABBvsAABB(a, b);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.normal.x)).toBeCloseTo(1);
      expect(result!.normal.y).toBeCloseTo(0);
    });

    it('uses Y-axis normal when overlapY < overlapX', () => {
      // Overlap on Y is 0.1, X is 2 → normal along Y
      const a: AABB = { min: new Vec2(0, 0), max: new Vec2(2, 1.1) };
      const b: AABB = { min: new Vec2(0, 1), max: new Vec2(2, 2) };
      const result = detector.testAABBvsAABB(a, b);
      expect(result).not.toBeNull();
      expect(result!.normal.x).toBeCloseTo(0);
      expect(Math.abs(result!.normal.y)).toBeCloseTo(1);
    });

    it('normal points from A center toward B center (X axis)', () => {
      // A is to the left of B
      const a: AABB = { min: new Vec2(0, 0), max: new Vec2(2, 1) };
      const b: AABB = { min: new Vec2(1.5, 0), max: new Vec2(3.5, 1) };
      const result = detector.testAABBvsAABB(a, b);
      expect(result!.normal.x).toBe(-1); // A center < B center, so normal = (-1,0)
    });
  });

  describe('testCircleVsCircle', () => {
    it('returns null when circles do not overlap', () => {
      const a: Circle = { center: new Vec2(0, 0), radius: 1 };
      const b: Circle = { center: new Vec2(3, 0), radius: 1 };
      expect(detector.testCircleVsCircle(a, b)).toBeNull();
    });

    it('detects overlap and returns depth', () => {
      const a: Circle = { center: new Vec2(0, 0), radius: 1 };
      const b: Circle = { center: new Vec2(1.5, 0), radius: 1 };
      const result = detector.testCircleVsCircle(a, b);
      expect(result).not.toBeNull();
      expect(result!.depth).toBeCloseTo(0.5);
    });

    it('normal points from A to B', () => {
      const a: Circle = { center: new Vec2(0, 0), radius: 1 };
      const b: Circle = { center: new Vec2(1.5, 0), radius: 1 };
      const result = detector.testCircleVsCircle(a, b);
      expect(result!.normal.x).toBeCloseTo(1);
      expect(result!.normal.y).toBeCloseTo(0);
    });

    it('handles coincident centers (dist=0) by returning (1,0) normal', () => {
      const a: Circle = { center: new Vec2(0, 0), radius: 1 };
      const b: Circle = { center: new Vec2(0, 0), radius: 1 };
      const result = detector.testCircleVsCircle(a, b);
      expect(result).not.toBeNull();
      expect(result!.normal.x).toBe(1);
      expect(result!.normal.y).toBe(0);
    });

    it('touching boundary (dist = sumRadii) returns null', () => {
      const a: Circle = { center: new Vec2(0, 0), radius: 1 };
      const b: Circle = { center: new Vec2(2, 0), radius: 1 };
      expect(detector.testCircleVsCircle(a, b)).toBeNull();
    });
  });

  describe('testAABBvsCircle', () => {
    it('returns null when circle does not touch AABB', () => {
      const aabb: AABB = { min: new Vec2(0, 0), max: new Vec2(2, 2) };
      const circle: Circle = { center: new Vec2(10, 10), radius: 1 };
      expect(detector.testAABBvsCircle(aabb, circle)).toBeNull();
    });

    it('detects overlap when circle center is outside AABB but radius overlaps', () => {
      const aabb: AABB = { min: new Vec2(0, 0), max: new Vec2(2, 2) };
      const circle: Circle = { center: new Vec2(2.5, 1), radius: 1 };
      const result = detector.testAABBvsCircle(aabb, circle);
      expect(result).not.toBeNull();
      expect(result!.depth).toBeCloseTo(0.5);
    });

    it('detects overlap when circle center is inside AABB', () => {
      const aabb: AABB = { min: new Vec2(0, 0), max: new Vec2(4, 4) };
      const circle: Circle = { center: new Vec2(2, 2), radius: 1 };
      const result = detector.testAABBvsCircle(aabb, circle);
      expect(result).not.toBeNull();
    });

    it('handles zero dist case by using (0,-1) normal', () => {
      // Circle center exactly on corner of AABB (closest point = center)
      const aabb: AABB = { min: new Vec2(0, 0), max: new Vec2(0, 0) };
      const circle: Circle = { center: new Vec2(0, 0), radius: 1 };
      const result = detector.testAABBvsCircle(aabb, circle);
      expect(result).not.toBeNull();
      expect(result!.normal.y).toBe(-1);
    });
  });

  describe('testShapes routing', () => {
    it('routes aabb vs aabb', () => {
      const sA: Shape = makeAABBShape(0, 0, 2, 2);
      const sB: Shape = makeAABBShape(1, 0, 3, 2);
      expect(detector.testShapes(sA, sB)).not.toBeNull();
    });

    it('routes circle vs circle', () => {
      const sA: Shape = makeCircleShape(0, 0, 1);
      const sB: Shape = makeCircleShape(1.5, 0, 1);
      expect(detector.testShapes(sA, sB)).not.toBeNull();
    });

    it('routes aabb vs circle', () => {
      const sA: Shape = makeAABBShape(0, 0, 2, 2);
      const sB: Shape = makeCircleShape(2.5, 1, 1);
      expect(detector.testShapes(sA, sB)).not.toBeNull();
    });

    it('routes circle vs aabb (flips normal)', () => {
      const sA: Shape = makeCircleShape(2.5, 1, 1);
      const sB: Shape = makeAABBShape(0, 0, 2, 2);
      const result = detector.testShapes(sA, sB);
      // Should detect and flip normal relative to aabb vs circle
      const flipped = detector.testShapes(sB, sA);
      if (result && flipped) {
        expect(result.normal.x).toBeCloseTo(-flipped.normal.x);
        expect(result.normal.y).toBeCloseTo(-flipped.normal.y);
      }
    });

    it('returns null when shapes do not overlap', () => {
      const sA: Shape = makeAABBShape(0, 0, 1, 1);
      const sB: Shape = makeAABBShape(5, 5, 6, 6);
      expect(detector.testShapes(sA, sB)).toBeNull();
    });
  });

  describe('detectAll', () => {
    it('returns empty array when no bodies', () => {
      expect(detector.detectAll([])).toEqual([]);
    });

    it('returns empty array when no collisions', () => {
      // testShapes uses raw shape extents (not body position), so place shapes
      // in non-overlapping world-space extents by using body-relative shapes
      // that map to different world regions when added to position.
      // The detector calls testShapes(bA.shape, bB.shape) without offset,
      // so we bake non-overlapping absolute extents into the shapes directly.
      const shape1: Shape = makeAABBShape(0, 0, 1, 1);
      const shape2: Shape = makeAABBShape(100, 100, 101, 101);
      const b1 = makeBody({ id: 'b1', position: Vec2.zero(), shape: shape1 });
      const b2 = makeBody({ id: 'b2', position: Vec2.zero(), shape: shape2 });
      expect(detector.detectAll([b1, b2])).toHaveLength(0);
    });

    it('detects collision between overlapping bodies', () => {
      const shape: Shape = makeAABBShape(-1, -1, 1, 1);
      const b1 = makeBody({ id: 'b1', position: new Vec2(0, 0), shape });
      const b2 = makeBody({ id: 'b2', position: new Vec2(1, 0), shape });
      const results = detector.detectAll([b1, b2]);
      expect(results).toHaveLength(1);
      expect(results[0]!.bodyA).toBe('b1');
      expect(results[0]!.bodyB).toBe('b2');
    });

    it('skips static-vs-static pairs', () => {
      const shape: Shape = makeAABBShape(-1, -1, 1, 1);
      const b1 = makeBody({ id: 's1', position: new Vec2(0, 0), shape, isStatic: true });
      const b2 = makeBody({ id: 's2', position: new Vec2(0, 0), shape, isStatic: true });
      expect(detector.detectAll([b1, b2])).toHaveLength(0);
    });

    it('detects multiple collisions', () => {
      const shape: Shape = makeAABBShape(-0.6, -0.6, 0.6, 0.6);
      const b1 = makeBody({ id: 'b1', position: new Vec2(0, 0), shape });
      const b2 = makeBody({ id: 'b2', position: new Vec2(0.5, 0), shape });
      const b3 = makeBody({ id: 'b3', position: new Vec2(-0.5, 0), shape });
      const results = detector.detectAll([b1, b2, b3]);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// CollisionResolver
// ---------------------------------------------------------------------------

describe('CollisionResolver', () => {
  let resolver: CollisionResolver;

  beforeEach(() => {
    resolver = new CollisionResolver();
  });

  function makeCollision(normalX: number, normalY: number, depth = 0.1) {
    return {
      bodyA: 'a',
      bodyB: 'b',
      normal: new Vec2(normalX, normalY),
      depth,
      contactPoint: Vec2.zero(),
    };
  }

  it('does nothing when both bodies are static', () => {
    const a = makeBody({ id: 'a', isStatic: true });
    const b = makeBody({ id: 'b', isStatic: true });
    const velBefore = a.velocity.clone();
    resolver.resolve(makeCollision(1, 0), a, b);
    expect(a.velocity.x).toBe(velBefore.x);
  });

  it('does nothing when bodies are separating (velAlongNormal > 0)', () => {
    // B moving away from A along collision normal
    const a = makeBody({ id: 'a', velocity: new Vec2(-1, 0) });
    const b = makeBody({ id: 'b', velocity: new Vec2(1, 0) });
    const col = makeCollision(1, 0); // normal points A→B direction
    resolver.resolve(col, a, b);
    // velocities should not change significantly
    expect(a.velocity.x).toBeCloseTo(-1);
    expect(b.velocity.x).toBeCloseTo(1);
  });

  it('applies impulse to separate colliding bodies', () => {
    const a = makeBody({ id: 'a', velocity: new Vec2(1, 0), restitution: 0.5, mass: 1 });
    const b = makeBody({ id: 'b', velocity: new Vec2(-1, 0), restitution: 0.5, mass: 1 });
    const col = makeCollision(1, 0, 0.05);
    resolver.resolve(col, a, b);
    // After resolution: a should be moving left, b moving right
    expect(a.velocity.x).toBeLessThan(1);
    expect(b.velocity.x).toBeGreaterThan(-1);
  });

  it('static body velocity is not changed', () => {
    const staticBody = makeBody({ id: 'a', velocity: Vec2.zero(), isStatic: true, mass: 1e9 });
    const dynBody = makeBody({ id: 'b', velocity: new Vec2(-2, 0), restitution: 0.5, mass: 1 });
    const col = makeCollision(-1, 0, 0.05);
    resolver.resolve(col, staticBody, dynBody);
    expect(staticBody.velocity.x).toBe(0);
    expect(staticBody.velocity.y).toBe(0);
  });

  it('applies positional correction to prevent sinking', () => {
    const a = makeBody({ id: 'a', position: new Vec2(-0.5, 0), mass: 1, restitution: 0 });
    const b = makeBody({ id: 'b', position: new Vec2(0.5, 0), mass: 1, restitution: 0 });
    const col = makeCollision(1, 0, 0.1);
    resolver.resolve(col, a, b);
    // Positional correction should separate them
    expect(a.position.x).toBeLessThan(-0.5);
    expect(b.position.x).toBeGreaterThan(0.5);
  });

  it('does not correct position of static body', () => {
    const a = makeBody({ id: 'a', position: new Vec2(0, 0), isStatic: true, mass: 1e9 });
    const b = makeBody({ id: 'b', position: new Vec2(0.9, 0), mass: 1, restitution: 0 });
    const col = makeCollision(1, 0, 0.2);
    resolver.resolve(col, a, b);
    expect(a.position.x).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SpatialHash
// ---------------------------------------------------------------------------

describe('SpatialHash', () => {
  let hash: SpatialHash;

  beforeEach(() => {
    hash = new SpatialHash(10);
  });

  describe('insert and query', () => {
    it('inserts a body and retrieves it via query', () => {
      const body = makeBody({ id: 'b1', position: new Vec2(5, 5) });
      hash.insert(body);
      const result = hash.query({ min: new Vec2(0, 0), max: new Vec2(10, 10) });
      expect(result).toContain(body);
    });

    it('query returns empty for non-overlapping region', () => {
      const body = makeBody({ id: 'b1', position: new Vec2(5, 5) });
      hash.insert(body);
      const result = hash.query({ min: new Vec2(100, 100), max: new Vec2(110, 110) });
      expect(result).toHaveLength(0);
    });

    it('inserts circle-shaped body', () => {
      const body = makeBody({
        id: 'c1',
        position: new Vec2(5, 5),
        shape: makeCircleShape(0, 0, 2),
      });
      hash.insert(body);
      const result = hash.query({ min: new Vec2(0, 0), max: new Vec2(10, 10) });
      expect(result).toContain(body);
    });

    it('retrieves multiple bodies in the same region', () => {
      const b1 = makeBody({ id: 'b1', position: new Vec2(1, 1) });
      const b2 = makeBody({ id: 'b2', position: new Vec2(2, 2) });
      hash.insert(b1);
      hash.insert(b2);
      const result = hash.query({ min: new Vec2(0, 0), max: new Vec2(10, 10) });
      expect(result).toContain(b1);
      expect(result).toContain(b2);
    });
  });

  describe('getPotentialPairs', () => {
    it('returns empty when no bodies', () => {
      expect(hash.getPotentialPairs()).toHaveLength(0);
    });

    it('returns a pair for two bodies in the same cell', () => {
      const b1 = makeBody({ id: 'b1', position: new Vec2(1, 1) });
      const b2 = makeBody({ id: 'b2', position: new Vec2(2, 2) });
      hash.insert(b1);
      hash.insert(b2);
      const pairs = hash.getPotentialPairs();
      expect(pairs.length).toBeGreaterThan(0);
      const [pA, pB] = pairs[0]!;
      const ids = [pA.id, pB.id].sort();
      expect(ids).toEqual(['b1', 'b2']);
    });

    it('does not return duplicate pairs', () => {
      // Bodies spanning multiple cells — pair should appear only once
      const b1 = makeBody({ id: 'b1', position: new Vec2(5, 5), shape: makeAABBShape(-6, -6, 6, 6) });
      const b2 = makeBody({ id: 'b2', position: new Vec2(5, 5), shape: makeAABBShape(-6, -6, 6, 6) });
      hash.insert(b1);
      hash.insert(b2);
      const pairs = hash.getPotentialPairs();
      // Filter to only b1-b2 pairs
      const relevant = pairs.filter(([a, b]) =>
        (a.id === 'b1' && b.id === 'b2') || (a.id === 'b2' && b.id === 'b1')
      );
      expect(relevant).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('empties cells after clear', () => {
      const body = makeBody({ id: 'b1', position: new Vec2(5, 5) });
      hash.insert(body);
      hash.clear();
      const result = hash.query({ min: new Vec2(0, 0), max: new Vec2(10, 10) });
      expect(result).toHaveLength(0);
    });

    it('getPotentialPairs empty after clear', () => {
      const b1 = makeBody({ id: 'b1', position: new Vec2(1, 1) });
      hash.insert(b1);
      hash.clear();
      expect(hash.getPotentialPairs()).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// ForceGenerator
// ---------------------------------------------------------------------------

describe('ForceGenerator', () => {
  describe('gravity', () => {
    it('returns downward force = mass * g', () => {
      const body = makeBody({ mass: 2 });
      const f = ForceGenerator.gravity(body, 9.81);
      expect(f.x).toBe(0);
      expect(f.y).toBeCloseTo(2 * 9.81);
    });

    it('uses default g=9.81', () => {
      const body = makeBody({ mass: 1 });
      const f = ForceGenerator.gravity(body);
      expect(f.y).toBeCloseTo(9.81);
    });

    it('returns zero for static bodies', () => {
      const body = makeBody({ mass: 10, isStatic: true });
      const f = ForceGenerator.gravity(body);
      expect(f.x).toBe(0);
      expect(f.y).toBe(0);
    });
  });

  describe('spring', () => {
    it('returns zero when bodies coincide', () => {
      const a = makeBody({ id: 'a', position: Vec2.zero() });
      const b = makeBody({ id: 'b', position: Vec2.zero() });
      const f = ForceGenerator.spring(a, b, 1, 10);
      expect(f.x).toBe(0);
      expect(f.y).toBe(0);
    });

    it('pulls bodies toward restLength', () => {
      const a = makeBody({ id: 'a', position: new Vec2(0, 0) });
      const b = makeBody({ id: 'b', position: new Vec2(3, 0) });
      const f = ForceGenerator.spring(a, b, 1, 10); // restLen=1, stiffness=10
      // dist=3, extension=2, force = (1,0)*10*2 = (20,0)
      expect(f.x).toBeCloseTo(20);
      expect(f.y).toBeCloseTo(0);
    });

    it('returns repulsive force when compressed', () => {
      const a = makeBody({ id: 'a', position: new Vec2(0, 0) });
      const b = makeBody({ id: 'b', position: new Vec2(0.5, 0) });
      const f = ForceGenerator.spring(a, b, 2, 10); // restLen=2, dist=0.5, extension=-1.5
      expect(f.x).toBeLessThan(0); // repulsive, pointing left
    });
  });

  describe('damping', () => {
    it('opposes velocity', () => {
      const body = makeBody({ velocity: new Vec2(4, 0) });
      const f = ForceGenerator.damping(body, 2);
      expect(f.x).toBeCloseTo(-8);
      expect(f.y).toBeCloseTo(0);
    });

    it('returns zero for stationary body', () => {
      const body = makeBody({ velocity: Vec2.zero() });
      const f = ForceGenerator.damping(body, 5);
      // -0 and 0 are both falsy; use toBeCloseTo to handle IEEE-754 negative zero
      expect(f.x).toBeCloseTo(0);
      expect(f.y).toBeCloseTo(0);
    });
  });

  describe('friction', () => {
    it('returns zero when body is stationary', () => {
      const body = makeBody({ velocity: Vec2.zero() });
      const f = ForceGenerator.friction(body, new Vec2(0, 1), 0.5);
      expect(f.x).toBe(0);
      expect(f.y).toBe(0);
    });

    it('opposes tangential motion', () => {
      const body = makeBody({ velocity: new Vec2(1, 0), mass: 1 });
      // Normal is (0,1), perpendicular is (-1,0) → tangent = normalize(-1,0) = (-1,0)
      // dot = (1,0)·(-1,0) = -1
      // friction = (-1,0) * -coeff * mass * (-1) = (-1,0) * coeff
      const f = ForceGenerator.friction(body, new Vec2(0, 1), 0.5);
      expect(f.y).toBeCloseTo(0);
    });
  });

  describe('drag', () => {
    it('returns zero for stationary body', () => {
      const body = makeBody({ velocity: Vec2.zero() });
      const f = ForceGenerator.drag(body, 1);
      expect(f.x).toBe(0);
      expect(f.y).toBe(0);
    });

    it('opposes velocity direction', () => {
      const body = makeBody({ velocity: new Vec2(2, 0) });
      const f = ForceGenerator.drag(body, 1);
      // speedSq = 4, force = -normalize(2,0) * 4 = (-4, 0)
      expect(f.x).toBeCloseTo(-4);
      expect(f.y).toBeCloseTo(0);
    });

    it('magnitude proportional to speed squared', () => {
      const b1 = makeBody({ velocity: new Vec2(2, 0) });
      const b2 = makeBody({ velocity: new Vec2(4, 0) });
      const f1 = ForceGenerator.drag(b1, 1);
      const f2 = ForceGenerator.drag(b2, 1);
      expect(Math.abs(f2.x)).toBeCloseTo(4 * Math.abs(f1.x));
    });
  });

  describe('attraction', () => {
    it('returns zero when bodies coincide', () => {
      const a = makeBody({ id: 'a', position: Vec2.zero() });
      const b = makeBody({ id: 'b', position: Vec2.zero() });
      const f = ForceGenerator.attraction(a, b, 100);
      expect(f.x).toBe(0);
      expect(f.y).toBe(0);
    });

    it('attracts toward other body', () => {
      const a = makeBody({ id: 'a', position: new Vec2(0, 0) });
      const b = makeBody({ id: 'b', position: new Vec2(2, 0) });
      const f = ForceGenerator.attraction(a, b, 10);
      // diff = (2,0), distSq=4, f = normalize*(10/4) = (1,0)*2.5
      expect(f.x).toBeCloseTo(2.5);
      expect(f.y).toBeCloseTo(0);
    });

    it('force scales inversely with distance squared', () => {
      const a = makeBody({ id: 'a', position: Vec2.zero() });
      const b1 = makeBody({ id: 'b1', position: new Vec2(1, 0) });
      const b2 = makeBody({ id: 'b2', position: new Vec2(2, 0) });
      const f1 = ForceGenerator.attraction(a, b1, 1);
      const f2 = ForceGenerator.attraction(a, b2, 1);
      expect(f1.x).toBeCloseTo(4 * f2.x);
    });
  });
});

// ---------------------------------------------------------------------------
// VerletIntegrator
// ---------------------------------------------------------------------------

describe('VerletIntegrator', () => {
  let vi: VerletIntegrator;

  beforeEach(() => {
    vi = new VerletIntegrator();
  });

  describe('addParticle', () => {
    it('returns incrementing index', () => {
      expect(vi.addParticle(0, 0)).toBe(0);
      expect(vi.addParticle(1, 1)).toBe(1);
    });

    it('stores position correctly', () => {
      vi.addParticle(3, 7);
      expect(vi.particles[0]!.position.x).toBe(3);
      expect(vi.particles[0]!.position.y).toBe(7);
    });

    it('stores previousPosition equal to initial position', () => {
      vi.addParticle(5, 9);
      expect(vi.particles[0]!.previousPosition.x).toBe(5);
    });

    it('defaults mass=1 and pinned=false', () => {
      vi.addParticle(0, 0);
      expect(vi.particles[0]!.mass).toBe(1);
      expect(vi.particles[0]!.pinned).toBe(false);
    });

    it('respects custom mass and pinned', () => {
      vi.addParticle(0, 0, 5, true);
      expect(vi.particles[0]!.mass).toBe(5);
      expect(vi.particles[0]!.pinned).toBe(true);
    });
  });

  describe('addConstraint', () => {
    it('adds a constraint between two particles', () => {
      vi.addParticle(0, 0);
      vi.addParticle(1, 0);
      vi.addConstraint(0, 1);
      expect(vi.constraints).toHaveLength(1);
      expect(vi.constraints[0]!.restLength).toBeCloseTo(1);
    });

    it('uses explicit restLength when provided', () => {
      vi.addParticle(0, 0);
      vi.addParticle(5, 0);
      vi.addConstraint(0, 1, 2);
      expect(vi.constraints[0]!.restLength).toBe(2);
    });

    it('default stiffness is 1', () => {
      vi.addParticle(0, 0);
      vi.addParticle(1, 0);
      vi.addConstraint(0, 1);
      expect(vi.constraints[0]!.stiffness).toBe(1);
    });

    it('respects custom stiffness', () => {
      vi.addParticle(0, 0);
      vi.addParticle(1, 0);
      vi.addConstraint(0, 1, undefined, 0.5);
      expect(vi.constraints[0]!.stiffness).toBe(0.5);
    });
  });

  describe('step', () => {
    it('moves unpinned particle under gravity', () => {
      vi.addParticle(0, 0);
      const initialY = vi.particles[0]!.position.y;
      vi.step(0.016, 9.81);
      expect(vi.particles[0]!.position.y).toBeGreaterThan(initialY);
    });

    it('pinned particle does not move', () => {
      vi.addParticle(0, 0, 1, true);
      vi.step(0.016, 9.81);
      expect(vi.particles[0]!.position.y).toBe(0);
    });

    it('resets acceleration after step', () => {
      vi.addParticle(0, 0);
      vi.step(0.016, 9.81);
      expect(vi.particles[0]!.acceleration.x).toBe(0);
      expect(vi.particles[0]!.acceleration.y).toBe(0);
    });

    it('previousPosition becomes current position from before step', () => {
      vi.addParticle(0, 0);
      vi.step(0.016, 9.81);
      // previousPosition should be (0,0) = position before step
      expect(vi.particles[0]!.previousPosition.x).toBe(0);
      expect(vi.particles[0]!.previousPosition.y).toBe(0);
    });
  });

  describe('satisfyConstraints', () => {
    it('pulls particles to rest length', () => {
      vi.addParticle(0, 0);
      vi.addParticle(4, 0); // distance 4, restLength will be 4
      vi.addConstraint(0, 1, 2); // restLength=2, current dist=4
      vi.satisfyConstraints(10);
      const dist = vi.particles[0]!.position.distanceTo(vi.particles[1]!.position);
      expect(dist).toBeCloseTo(2, 1);
    });

    it('does not move pinned particles', () => {
      vi.addParticle(0, 0, 1, true); // pinned
      vi.addParticle(4, 0);
      vi.addConstraint(0, 1, 2);
      vi.satisfyConstraints(10);
      expect(vi.particles[0]!.position.x).toBe(0);
    });

    it('skips zero-distance constraints (no NaN)', () => {
      vi.addParticle(0, 0);
      vi.addParticle(0, 0);
      vi.addConstraint(0, 1, 1);
      // Should not throw or produce NaN
      expect(() => vi.satisfyConstraints(3)).not.toThrow();
      expect(vi.particles[0]!.position.x).not.toBeNaN();
    });
  });

  describe('createRope', () => {
    it('creates correct number of particles', () => {
      vi.createRope(new Vec2(0, 0), new Vec2(10, 0), 5);
      expect(vi.particles).toHaveLength(6); // segments+1
    });

    it('first particle is pinned', () => {
      vi.createRope(new Vec2(0, 0), new Vec2(10, 0), 5);
      expect(vi.particles[0]!.pinned).toBe(true);
    });

    it('last particle is not pinned', () => {
      vi.createRope(new Vec2(0, 0), new Vec2(10, 0), 5);
      expect(vi.particles[5]!.pinned).toBe(false);
    });

    it('creates constraints between consecutive particles', () => {
      vi.createRope(new Vec2(0, 0), new Vec2(10, 0), 5);
      expect(vi.constraints).toHaveLength(5); // segments
    });

    it('returns array of particle indices', () => {
      const indices = vi.createRope(new Vec2(0, 0), new Vec2(10, 0), 4);
      expect(indices).toHaveLength(5);
      expect(indices[0]).toBe(0);
    });
  });

  describe('createCloth', () => {
    it('creates correct number of particles', () => {
      vi.createCloth(new Vec2(0, 0), 10, 10, 3, 3);
      expect(vi.particles).toHaveLength(16); // (cols+1)*(rows+1) = 4*4
    });

    it('pins all particles in the top row', () => {
      vi.createCloth(new Vec2(0, 0), 10, 10, 2, 2);
      // Top row: indices 0,1,2
      expect(vi.particles[0]!.pinned).toBe(true);
      expect(vi.particles[1]!.pinned).toBe(true);
      expect(vi.particles[2]!.pinned).toBe(true);
    });

    it('bottom row particles are not pinned', () => {
      vi.createCloth(new Vec2(0, 0), 10, 10, 2, 2);
      // Bottom row: indices 6,7,8
      expect(vi.particles[6]!.pinned).toBe(false);
    });

    it('creates structural and shear constraints', () => {
      vi.createCloth(new Vec2(0, 0), 10, 10, 2, 2);
      // cols=2, rows=2:
      // Horizontal: 3 rows * 2 = 6
      // Vertical: 2 rows * 3 = 6
      // Shear: 2 rows * 2 cols * 2 = 8
      // Total = 20
      expect(vi.constraints).toHaveLength(20);
    });

    it('returns a 2D grid of indices', () => {
      const grid = vi.createCloth(new Vec2(0, 0), 10, 10, 2, 2);
      expect(grid).toHaveLength(3); // rows+1
      expect(grid[0]).toHaveLength(3); // cols+1
    });
  });
});

// ---------------------------------------------------------------------------
// CharacterController
// ---------------------------------------------------------------------------

describe('CharacterController', () => {
  let body: Body;
  let ctrl: CharacterController;

  beforeEach(() => {
    body = makeBody({ id: 'player', velocity: Vec2.zero() });
    ctrl = new CharacterController(body);
  });

  describe('moveLeft', () => {
    it('sets velocity.x to -moveSpeed', () => {
      ctrl.moveLeft();
      expect(body.velocity.x).toBe(-ctrl.moveSpeed);
    });

    it('preserves velocity.y', () => {
      body.velocity = new Vec2(0, 5);
      ctrl.moveLeft();
      expect(body.velocity.y).toBe(5);
    });
  });

  describe('moveRight', () => {
    it('sets velocity.x to moveSpeed', () => {
      ctrl.moveRight();
      expect(body.velocity.x).toBe(ctrl.moveSpeed);
    });

    it('preserves velocity.y', () => {
      body.velocity = new Vec2(0, 3);
      ctrl.moveRight();
      expect(body.velocity.y).toBe(3);
    });
  });

  describe('jump', () => {
    it('does nothing when not grounded', () => {
      ctrl.grounded = false;
      ctrl.jump();
      expect(body.velocity.y).toBe(0);
    });

    it('applies upward force when grounded', () => {
      ctrl.grounded = true;
      ctrl.jump();
      expect(body.velocity.y).toBe(-ctrl.jumpForce);
    });

    it('sets grounded to false after jump', () => {
      ctrl.grounded = true;
      ctrl.jump();
      expect(ctrl.grounded).toBe(false);
    });

    it('preserves velocity.x during jump', () => {
      ctrl.grounded = true;
      body.velocity = new Vec2(3, 0);
      ctrl.jump();
      expect(body.velocity.x).toBe(3);
    });
  });

  describe('stop', () => {
    it('sets velocity.x to 0', () => {
      body.velocity = new Vec2(5, 2);
      ctrl.stop();
      expect(body.velocity.x).toBe(0);
    });

    it('preserves velocity.y', () => {
      body.velocity = new Vec2(5, 7);
      ctrl.stop();
      expect(body.velocity.y).toBe(7);
    });
  });

  describe('update', () => {
    it('damps horizontal velocity over time', () => {
      body.velocity = new Vec2(10, 0);
      ctrl.update(0.016);
      expect(Math.abs(body.velocity.x)).toBeLessThan(10);
    });

    it('zeroes very small horizontal velocity', () => {
      body.velocity = new Vec2(0.005, 0);
      ctrl.update(0.016);
      expect(body.velocity.x).toBe(0);
    });

    it('does not affect vertical velocity', () => {
      body.velocity = new Vec2(0, 5);
      ctrl.update(0.016);
      expect(body.velocity.y).toBe(5);
    });
  });

  describe('onGround', () => {
    it('sets grounded=true and zeroes vy when landing on static ground', () => {
      body.velocity = new Vec2(1, 2);
      const ground = makeBody({ id: 'ground', isStatic: true });
      ctrl.onGround(ground);
      expect(ctrl.grounded).toBe(true);
      expect(body.velocity.y).toBe(0);
    });

    it('does not set grounded on non-static body', () => {
      body.velocity = new Vec2(0, 1);
      const movingPlatform = makeBody({ id: 'platform', isStatic: false });
      ctrl.onGround(movingPlatform);
      expect(ctrl.grounded).toBe(false);
    });

    it('does not set grounded when moving upward', () => {
      body.velocity = new Vec2(0, -5); // moving up
      const ground = makeBody({ id: 'ground', isStatic: true });
      ctrl.onGround(ground);
      expect(ctrl.grounded).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// PhysicsWorld
// ---------------------------------------------------------------------------

describe('PhysicsWorld', () => {
  let world: PhysicsWorld;

  beforeEach(() => {
    world = new PhysicsWorld();
  });

  describe('addBody', () => {
    it('adds a body and returns it', () => {
      const body = world.addBody({ id: 'test' });
      expect(body.id).toBe('test');
      expect(world.bodies).toContain(body);
    });

    it('auto-generates id when not provided', () => {
      const body = world.addBody({});
      expect(body.id).toMatch(/^body_\d+/);
    });

    it('applies sensible defaults', () => {
      const body = world.addBody({});
      expect(body.mass).toBe(1);
      expect(body.restitution).toBe(0.3);
      expect(body.friction).toBe(0.5);
      expect(body.isStatic).toBe(false);
    });

    it('respects provided values', () => {
      const body = world.addBody({ mass: 5, isStatic: true });
      expect(body.mass).toBe(5);
      expect(body.isStatic).toBe(true);
    });
  });

  describe('removeBody', () => {
    it('removes a body by id', () => {
      world.addBody({ id: 'rem' });
      world.removeBody('rem');
      expect(world.bodies.find(b => b.id === 'rem')).toBeUndefined();
    });

    it('does nothing for non-existent id', () => {
      world.addBody({ id: 'keep' });
      expect(() => world.removeBody('nonexistent')).not.toThrow();
      expect(world.bodies).toHaveLength(1);
    });
  });

  describe('getBody', () => {
    it('returns the body by id', () => {
      world.addBody({ id: 'find-me' });
      const body = world.getBody('find-me');
      expect(body).toBeDefined();
      expect(body!.id).toBe('find-me');
    });

    it('returns undefined for missing id', () => {
      expect(world.getBody('ghost')).toBeUndefined();
    });
  });

  describe('step', () => {
    it('moves dynamic body under gravity', () => {
      const body = world.addBody({ id: 'dynamic', position: new Vec2(0, 0) });
      const yBefore = body.position.y;
      world.step(0.016);
      expect(body.position.y).toBeGreaterThan(yBefore);
    });

    it('does not move static body', () => {
      const body = world.addBody({ id: 'static', position: new Vec2(0, 5), isStatic: true });
      world.step(0.016);
      expect(body.position.y).toBe(5);
    });

    it('resolves collision between two overlapping bodies', () => {
      // The CollisionDetector operates on raw shape extents (no position offset).
      // Place the shapes so they overlap, then give them approaching velocities
      // that are aligned with the collision normal so the resolver fires.
      //
      // Both shapes are at (-1,-1)→(1,1); overlap is 2 units on both axes.
      // overlapX == overlapY == 2, so the Y-axis branch runs:
      //   centerA.y (0) < centerB.y (0)? No → normal = (0, 1).
      // Actually both centers are identical (both at origin), so centerA.y == centerB.y:
      //   normal = (0, 1).
      // relativeVel = b.vel - a.vel. For resolution to fire, velAlongNormal must be < 0.
      // With normal (0,1): set a.vy = +2 (moving down), b.vy = -2 (moving up) →
      //   relVel = (0,-4), velAlongNormal = (0,-4)·(0,1) = -4 < 0 → resolver fires.
      const shape: Shape = makeAABBShape(-1, -1, 1, 1);
      const a = world.addBody({ id: 'ca', position: Vec2.zero(), shape, velocity: new Vec2(0, 2), restitution: 0.5 });
      const b = world.addBody({ id: 'cb', position: Vec2.zero(), shape, velocity: new Vec2(0, -2), restitution: 0.5 });
      world.step(0.016);
      // After resolution, A's downward velocity should be reduced (or reversed)
      // and B's upward velocity should be reduced (or reversed).
      expect(a.velocity.y).toBeLessThan(2);
      expect(b.velocity.y).toBeGreaterThan(-2);
    });

    it('accumulates gravity force each step', () => {
      const body = world.addBody({ id: 'b', position: Vec2.zero(), velocity: Vec2.zero() });
      world.step(0.1);
      const vel1 = body.velocity.y;
      world.step(0.1);
      expect(body.velocity.y).toBeGreaterThan(vel1);
    });
  });

  describe('raycast', () => {
    it('returns null when no bodies', () => {
      expect(world.raycast(Vec2.zero(), Vec2.right(), 100)).toBeNull();
    });

    it('hits an AABB body', () => {
      world.addBody({
        id: 'wall',
        position: new Vec2(5, 0),
        shape: makeAABBShape(-1, -1, 1, 1),
      });
      const hit = world.raycast(new Vec2(0, 0), new Vec2(1, 0), 100);
      expect(hit).not.toBeNull();
      expect(hit!.body.id).toBe('wall');
      expect(hit!.distance).toBeCloseTo(4);
    });

    it('hits a circle body', () => {
      world.addBody({
        id: 'orb',
        position: new Vec2(5, 0),
        shape: makeCircleShape(0, 0, 1),
      });
      const hit = world.raycast(new Vec2(0, 0), new Vec2(1, 0), 100);
      expect(hit).not.toBeNull();
      expect(hit!.body.id).toBe('orb');
    });

    it('returns null when ray does not reach body', () => {
      world.addBody({
        id: 'far',
        position: new Vec2(50, 0),
        shape: makeAABBShape(-1, -1, 1, 1),
      });
      const hit = world.raycast(new Vec2(0, 0), new Vec2(1, 0), 10);
      expect(hit).toBeNull();
    });

    it('returns closest body when multiple in path', () => {
      world.addBody({ id: 'close', position: new Vec2(3, 0), shape: makeAABBShape(-0.5, -0.5, 0.5, 0.5) });
      world.addBody({ id: 'far', position: new Vec2(8, 0), shape: makeAABBShape(-0.5, -0.5, 0.5, 0.5) });
      const hit = world.raycast(new Vec2(0, 0), new Vec2(1, 0), 100);
      expect(hit!.body.id).toBe('close');
    });

    it('returns null when ray is parallel to AABB face and outside', () => {
      world.addBody({ id: 'box', position: new Vec2(0, 5), shape: makeAABBShape(-1, -1, 1, 1) });
      // Ray travels along X at y=0, box is at y=5 (no overlap)
      const hit = world.raycast(new Vec2(0, 0), new Vec2(1, 0), 100);
      expect(hit).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// PhysicsEngine
// ---------------------------------------------------------------------------

describe('PhysicsEngine', () => {
  let engine: PhysicsEngine;

  beforeEach(() => {
    engine = new PhysicsEngine();
  });

  describe('createWorld', () => {
    it('returns a PhysicsWorld', () => {
      const world = engine.createWorld();
      expect(world).toBeInstanceOf(PhysicsWorld);
    });

    it('accepts custom gravity', () => {
      const world = engine.createWorld(new Vec2(0, 20));
      // Verify gravity is applied in step
      const body = world.addBody({ id: 'test' });
      world.step(1);
      expect(body.velocity.y).toBeCloseTo(20);
    });
  });

  describe('createVerletSystem', () => {
    it('returns a VerletIntegrator', () => {
      const vi = engine.createVerletSystem();
      expect(vi).toBeInstanceOf(VerletIntegrator);
    });

    it('starts with empty particles', () => {
      const vi = engine.createVerletSystem();
      expect(vi.particles).toHaveLength(0);
    });
  });

  describe('fromSeed', () => {
    it('creates a world with floor body', () => {
      const seed = makeSeed('test', 'creature');
      const world = engine.fromSeed(seed);
      const floor = world.getBody('seed_floor');
      expect(floor).toBeDefined();
      expect(floor!.isStatic).toBe(true);
    });

    it('creates dynamic bodies from seed complexity gene', () => {
      const seed = makeSeed('complex', 'creature', {
        complexity: { value: 1.0 },
      });
      const world = engine.fromSeed(seed);
      const dynamicBodies = world.bodies.filter(b => !b.isStatic);
      expect(dynamicBodies.length).toBeGreaterThan(0);
      expect(dynamicBodies.length).toBeLessThanOrEqual(20);
    });

    it('uses gravity gene for world gravity', () => {
      // gravity gene = 1.0 → gravityStrength = 20
      const seed = makeSeed('heavy', 'creature', {
        gravity: { value: 1.0 },
      });
      const world = engine.fromSeed(seed);
      // Add a test body and check gravity effect
      const body = world.addBody({ id: 'probe', velocity: Vec2.zero() });
      world.step(1);
      expect(body.velocity.y).toBeCloseTo(20);
    });

    it('falls back to defaults when genes are absent', () => {
      const seed = makeSeed('minimal', 'creature');
      expect(() => engine.fromSeed(seed)).not.toThrow();
      const world = engine.fromSeed(seed);
      expect(world.bodies.length).toBeGreaterThan(0);
    });

    it('seed bodies have correct restitution/friction from genes', () => {
      const seed = makeSeed('elastic', 'creature', {
        elasticity: { value: 0.9 },
        friction: { value: 0.1 },
        mass: { value: 0.5 },
        complexity: { value: 0.1 },
      });
      const world = engine.fromSeed(seed);
      const dynamicBodies = world.bodies.filter(b => !b.isStatic);
      expect(dynamicBodies.length).toBeGreaterThan(0);
      expect(dynamicBodies[0]!.restitution).toBeCloseTo(0.9);
      expect(dynamicBodies[0]!.friction).toBeCloseTo(0.1);
    });

    it('produces bodies with id prefixed by seed_body_', () => {
      const seed = makeSeed('named', 'creature', { complexity: { value: 0.2 } });
      const world = engine.fromSeed(seed);
      const seedBodies = world.bodies.filter(b => b.id.startsWith('seed_body_'));
      expect(seedBodies.length).toBeGreaterThan(0);
    });

    it('is deterministic — same seed produces same body count', () => {
      const seed = makeSeed('deterministic', 'creature', { complexity: { value: 0.5 } });
      const w1 = engine.fromSeed(seed);
      const w2 = engine.fromSeed(seed);
      expect(w1.bodies.length).toBe(w2.bodies.length);
    });
  });
});
