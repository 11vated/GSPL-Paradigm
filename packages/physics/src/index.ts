import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ---------------------------------------------------------------------------
// Vec2
// ---------------------------------------------------------------------------

export class Vec2 {
  constructor(public x: number, public y: number) {}

  static zero(): Vec2 { return new Vec2(0, 0); }
  static one(): Vec2 { return new Vec2(1, 1); }
  static up(): Vec2 { return new Vec2(0, -1); }
  static right(): Vec2 { return new Vec2(1, 0); }

  add(other: Vec2): Vec2 { return new Vec2(this.x + other.x, this.y + other.y); }
  sub(other: Vec2): Vec2 { return new Vec2(this.x - other.x, this.y - other.y); }
  scale(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  dot(other: Vec2): number { return this.x * other.x + this.y * other.y; }
  lengthSq(): number { return this.x * this.x + this.y * this.y; }
  length(): number { return Math.sqrt(this.lengthSq()); }

  normalize(): Vec2 {
    const len = this.length();
    if (len === 0) return Vec2.zero();
    return this.scale(1 / len);
  }

  distanceTo(other: Vec2): number { return this.sub(other).length(); }
  angle(): number { return Math.atan2(this.y, this.x); }

  rotate(rad: number): Vec2 {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return new Vec2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  perpendicular(): Vec2 { return new Vec2(-this.y, this.x); }

  lerp(other: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (other.x - this.x) * t, this.y + (other.y - this.y) * t);
  }

  clone(): Vec2 { return new Vec2(this.x, this.y); }
  equals(other: Vec2, epsilon = 1e-9): boolean {
    return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon;
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface AABB {
  min: Vec2;
  max: Vec2;
}

export interface Circle {
  center: Vec2;
  radius: number;
}

export type Shape =
  | { kind: 'aabb'; aabb: AABB }
  | { kind: 'circle'; circle: Circle };

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export interface Body {
  id: string;
  position: Vec2;
  velocity: Vec2;
  acceleration: Vec2;
  mass: number;
  restitution: number;
  friction: number;
  shape: Shape;
  isStatic: boolean;
  forces: Vec2[];
}

// ---------------------------------------------------------------------------
// CollisionResult
// ---------------------------------------------------------------------------

export interface CollisionResult {
  bodyA: string;
  bodyB: string;
  normal: Vec2;
  depth: number;
  contactPoint: Vec2;
}

// ---------------------------------------------------------------------------
// CollisionDetector
// ---------------------------------------------------------------------------

export class CollisionDetector {
  testAABBvsAABB(a: AABB, b: AABB): CollisionResult | null {
    const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const overlapY = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);

    if (overlapX <= 0 || overlapY <= 0) return null;

    const centerA = new Vec2((a.min.x + a.max.x) / 2, (a.min.y + a.max.y) / 2);
    const centerB = new Vec2((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2);

    let normal: Vec2;
    let depth: number;
    let contactPoint: Vec2;

    if (overlapX < overlapY) {
      normal = centerA.x < centerB.x ? new Vec2(-1, 0) : new Vec2(1, 0);
      depth = overlapX;
      const cx = centerA.x < centerB.x ? a.max.x : a.min.x;
      const cy = Math.max(a.min.y, b.min.y) + Math.min(a.max.y - a.min.y, b.max.y - b.min.y) / 2;
      contactPoint = new Vec2(cx, cy);
    } else {
      normal = centerA.y < centerB.y ? new Vec2(0, -1) : new Vec2(0, 1);
      depth = overlapY;
      const cx = Math.max(a.min.x, b.min.x) + Math.min(a.max.x - a.min.x, b.max.x - b.min.x) / 2;
      const cy = centerA.y < centerB.y ? a.max.y : a.min.y;
      contactPoint = new Vec2(cx, cy);
    }

    return { bodyA: '', bodyB: '', normal, depth, contactPoint };
  }

  testCircleVsCircle(a: Circle, b: Circle): CollisionResult | null {
    const diff = b.center.sub(a.center);
    const dist = diff.length();
    const minDist = a.radius + b.radius;

    if (dist >= minDist) return null;

    const depth = minDist - dist;
    const normal = dist === 0 ? new Vec2(1, 0) : diff.normalize();
    const contactPoint = a.center.add(normal.scale(a.radius - depth / 2));

    return { bodyA: '', bodyB: '', normal, depth, contactPoint };
  }

  testAABBvsCircle(aabb: AABB, circle: Circle): CollisionResult | null {
    const clampedX = Math.max(aabb.min.x, Math.min(aabb.max.x, circle.center.x));
    const clampedY = Math.max(aabb.min.y, Math.min(aabb.max.y, circle.center.y));
    const closest = new Vec2(clampedX, clampedY);

    const diff = circle.center.sub(closest);
    const distSq = diff.lengthSq();

    if (distSq >= circle.radius * circle.radius) return null;

    const dist = Math.sqrt(distSq);
    const depth = circle.radius - dist;
    const normal = dist === 0 ? new Vec2(0, -1) : diff.normalize();
    const contactPoint = closest.clone();

    return { bodyA: '', bodyB: '', normal, depth, contactPoint };
  }

  testShapes(shapeA: Shape, shapeB: Shape): Omit<CollisionResult, 'bodyA' | 'bodyB'> | null {
    if (shapeA.kind === 'aabb' && shapeB.kind === 'aabb') {
      const r = this.testAABBvsAABB(shapeA.aabb, shapeB.aabb);
      if (!r) return null;
      return { normal: r.normal, depth: r.depth, contactPoint: r.contactPoint };
    }
    if (shapeA.kind === 'circle' && shapeB.kind === 'circle') {
      const r = this.testCircleVsCircle(shapeA.circle, shapeB.circle);
      if (!r) return null;
      return { normal: r.normal, depth: r.depth, contactPoint: r.contactPoint };
    }
    if (shapeA.kind === 'aabb' && shapeB.kind === 'circle') {
      const r = this.testAABBvsCircle(shapeA.aabb, shapeB.circle);
      if (!r) return null;
      return { normal: r.normal, depth: r.depth, contactPoint: r.contactPoint };
    }
    if (shapeA.kind === 'circle' && shapeB.kind === 'aabb') {
      const r = this.testAABBvsCircle(shapeB.aabb, shapeA.circle);
      if (!r) return null;
      return { normal: r.normal.scale(-1), depth: r.depth, contactPoint: r.contactPoint };
    }
    return null;
  }

  detectAll(bodies: Body[]): CollisionResult[] {
    const results: CollisionResult[] = [];

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const bA = bodies[i]!;
        const bB = bodies[j]!;

        if (bA.isStatic && bB.isStatic) continue;

        const shapeResult = this.testShapes(bA.shape, bB.shape);
        if (shapeResult) {
          results.push({ bodyA: bA.id, bodyB: bB.id, ...shapeResult });
        }
      }
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// CollisionResolver
// ---------------------------------------------------------------------------

export class CollisionResolver {
  resolve(collision: CollisionResult, bodyA: Body, bodyB: Body): void {
    if (bodyA.isStatic && bodyB.isStatic) return;

    const relativeVel = bodyB.velocity.sub(bodyA.velocity);
    const velAlongNormal = relativeVel.dot(collision.normal);

    // Do not resolve if bodies are separating
    if (velAlongNormal > 0) return;

    const restitution = Math.min(bodyA.restitution, bodyB.restitution);
    const invMassA = bodyA.isStatic ? 0 : 1 / bodyA.mass;
    const invMassB = bodyB.isStatic ? 0 : 1 / bodyB.mass;
    const totalInvMass = invMassA + invMassB;

    if (totalInvMass === 0) return;

    // Impulse scalar
    const j = -(1 + restitution) * velAlongNormal / totalInvMass;
    const impulse = collision.normal.scale(j);

    if (!bodyA.isStatic) {
      bodyA.velocity = bodyA.velocity.sub(impulse.scale(invMassA));
    }
    if (!bodyB.isStatic) {
      bodyB.velocity = bodyB.velocity.add(impulse.scale(invMassB));
    }

    // Positional correction to prevent sinking (Baumgarte stabilisation)
    const percent = 0.2;
    const slop = 0.01;
    const correctionMag = Math.max(collision.depth - slop, 0) / totalInvMass * percent;
    const correction = collision.normal.scale(correctionMag);

    if (!bodyA.isStatic) {
      bodyA.position = bodyA.position.sub(correction.scale(invMassA));
    }
    if (!bodyB.isStatic) {
      bodyB.position = bodyB.position.add(correction.scale(invMassB));
    }
  }
}

// ---------------------------------------------------------------------------
// SpatialHash
// ---------------------------------------------------------------------------

export class SpatialHash {
  private readonly cellSize: number;
  private cells: Map<number, Body[]> = new Map();
  private bodies: Body[] = [];

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private hashCell(cx: number, cy: number): number {
    // Cantor pairing — good enough for 2-D spatial hashing
    const ux = cx + 1000000;
    const uy = cy + 1000000;
    return ((ux + uy) * (ux + uy + 1)) / 2 + uy;
  }

  private bodyAABB(body: Body): AABB {
    if (body.shape.kind === 'aabb') {
      return {
        min: body.position.add(body.shape.aabb.min),
        max: body.position.add(body.shape.aabb.max),
      };
    }
    const r = body.shape.circle.radius;
    const c = body.position.add(body.shape.circle.center);
    return { min: new Vec2(c.x - r, c.y - r), max: new Vec2(c.x + r, c.y + r) };
  }

  clear(): void {
    this.cells.clear();
    this.bodies = [];
  }

  insert(body: Body): void {
    this.bodies.push(body);
    const aabb = this.bodyAABB(body);
    const minCX = Math.floor(aabb.min.x / this.cellSize);
    const minCY = Math.floor(aabb.min.y / this.cellSize);
    const maxCX = Math.floor(aabb.max.x / this.cellSize);
    const maxCY = Math.floor(aabb.max.y / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = this.hashCell(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) { cell = []; this.cells.set(key, cell); }
        cell.push(body);
      }
    }
  }

  query(aabb: AABB): Body[] {
    const found = new Set<Body>();
    const minCX = Math.floor(aabb.min.x / this.cellSize);
    const minCY = Math.floor(aabb.min.y / this.cellSize);
    const maxCX = Math.floor(aabb.max.x / this.cellSize);
    const maxCY = Math.floor(aabb.max.y / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(this.hashCell(cx, cy));
        if (cell) { for (const b of cell) found.add(b); }
      }
    }

    return Array.from(found);
  }

  getPotentialPairs(): [Body, Body][] {
    const pairs: [Body, Body][] = [];
    const seen = new Set<string>();

    for (const cell of this.cells.values()) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i]!;
          const b = cell[j]!;
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            pairs.push([a, b]);
          }
        }
      }
    }

    return pairs;
  }
}

// ---------------------------------------------------------------------------
// ForceGenerator
// ---------------------------------------------------------------------------

export class ForceGenerator {
  static gravity(body: Body, g = 9.81): Vec2 {
    if (body.isStatic) return Vec2.zero();
    return new Vec2(0, body.mass * g);
  }

  static spring(bodyA: Body, bodyB: Body, restLength: number, stiffness: number): Vec2 {
    const diff = bodyB.position.sub(bodyA.position);
    const dist = diff.length();
    if (dist === 0) return Vec2.zero();
    const extension = dist - restLength;
    return diff.normalize().scale(stiffness * extension);
  }

  static damping(body: Body, coefficient: number): Vec2 {
    return body.velocity.scale(-coefficient);
  }

  static friction(body: Body, normal: Vec2, coefficient: number): Vec2 {
    const speed = body.velocity.length();
    if (speed === 0) return Vec2.zero();
    const tangent = normal.perpendicular().normalize();
    const dot = body.velocity.dot(tangent);
    return tangent.scale(-coefficient * body.mass * dot);
  }

  static drag(body: Body, coefficient: number): Vec2 {
    const speedSq = body.velocity.lengthSq();
    if (speedSq === 0) return Vec2.zero();
    return body.velocity.normalize().scale(-coefficient * speedSq);
  }

  static attraction(bodyA: Body, bodyB: Body, strength: number): Vec2 {
    const diff = bodyB.position.sub(bodyA.position);
    const distSq = diff.lengthSq();
    if (distSq === 0) return Vec2.zero();
    return diff.normalize().scale(strength / distSq);
  }
}

// ---------------------------------------------------------------------------
// Verlet integration
// ---------------------------------------------------------------------------

export interface VerletBody {
  position: Vec2;
  previousPosition: Vec2;
  acceleration: Vec2;
  mass: number;
  pinned: boolean;
}

export interface Constraint {
  bodyA: number;
  bodyB: number;
  restLength: number;
  stiffness: number;
}

export class VerletIntegrator {
  particles: VerletBody[] = [];
  constraints: Constraint[] = [];

  addParticle(x: number, y: number, mass = 1, pinned = false): number {
    const pos = new Vec2(x, y);
    this.particles.push({
      position: pos.clone(),
      previousPosition: pos.clone(),
      acceleration: Vec2.zero(),
      mass,
      pinned,
    });
    return this.particles.length - 1;
  }

  addConstraint(a: number, b: number, restLength?: number, stiffness = 1): void {
    const pA = this.particles[a]!;
    const pB = this.particles[b]!;
    const len = restLength ?? pA.position.distanceTo(pB.position);
    this.constraints.push({ bodyA: a, bodyB: b, restLength: len, stiffness });
  }

  step(dt: number, gravity = 9.81): void {
    for (const p of this.particles) {
      if (p.pinned) continue;

      p.acceleration = p.acceleration.add(new Vec2(0, gravity));

      const currentPos = p.position.clone();
      const velocity = p.position.sub(p.previousPosition);
      p.position = p.position.add(velocity).add(p.acceleration.scale(dt * dt));
      p.previousPosition = currentPos;
      p.acceleration = Vec2.zero();
    }

    this.satisfyConstraints();
  }

  satisfyConstraints(iterations = 3): void {
    for (let iter = 0; iter < iterations; iter++) {
      for (const c of this.constraints) {
        const pA = this.particles[c.bodyA]!;
        const pB = this.particles[c.bodyB]!;

        const diff = pB.position.sub(pA.position);
        const dist = diff.length();
        if (dist === 0) continue;

        const error = (dist - c.restLength) / dist * c.stiffness;
        const correction = diff.scale(error * 0.5);

        if (!pA.pinned) pA.position = pA.position.add(correction);
        if (!pB.pinned) pB.position = pB.position.sub(correction);
      }
    }
  }

  createRope(start: Vec2, end: Vec2, segments: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pos = start.lerp(end, t);
      indices.push(this.addParticle(pos.x, pos.y, 1, i === 0));
    }
    for (let i = 0; i < indices.length - 1; i++) {
      this.addConstraint(indices[i]!, indices[i + 1]!);
    }
    return indices;
  }

  createCloth(origin: Vec2, w: number, h: number, cols: number, rows: number): number[][] {
    const grid: number[][] = [];
    const cellW = w / cols;
    const cellH = h / rows;

    for (let row = 0; row <= rows; row++) {
      const rowIndices: number[] = [];
      for (let col = 0; col <= cols; col++) {
        const x = origin.x + col * cellW;
        const y = origin.y + row * cellH;
        const pinned = row === 0;
        rowIndices.push(this.addParticle(x, y, 1, pinned));
      }
      grid.push(rowIndices);
    }

    // Structural horizontal constraints
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.addConstraint(grid[row]![col]!, grid[row]![col + 1]!);
      }
    }
    // Structural vertical constraints
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col <= cols; col++) {
        this.addConstraint(grid[row]![col]!, grid[row + 1]![col]!);
      }
    }
    // Shear constraints
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.addConstraint(grid[row]![col]!, grid[row + 1]![col + 1]!);
        this.addConstraint(grid[row]![col + 1]!, grid[row + 1]![col]!);
      }
    }

    return grid;
  }
}

// ---------------------------------------------------------------------------
// CharacterController
// ---------------------------------------------------------------------------

export class CharacterController {
  moveSpeed = 5;
  jumpForce = 10;
  grounded = false;

  private readonly body: Body;

  constructor(body: Body) {
    this.body = body;
  }

  moveLeft(): void {
    this.body.velocity = new Vec2(-this.moveSpeed, this.body.velocity.y);
  }

  moveRight(): void {
    this.body.velocity = new Vec2(this.moveSpeed, this.body.velocity.y);
  }

  jump(): void {
    if (!this.grounded) return;
    this.body.velocity = new Vec2(this.body.velocity.x, -this.jumpForce);
    this.grounded = false;
  }

  stop(): void {
    this.body.velocity = new Vec2(0, this.body.velocity.y);
  }

  update(dt: number): void {
    // Horizontal damping
    const dampedX = this.body.velocity.x * Math.pow(0.85, dt * 60);
    this.body.velocity = new Vec2(Math.abs(dampedX) < 0.01 ? 0 : dampedX, this.body.velocity.y);
  }

  onGround(ground: Body): void {
    if (ground.isStatic && this.body.velocity.y >= 0) {
      this.grounded = true;
      this.body.velocity = new Vec2(this.body.velocity.x, 0);
    }
  }
}

// ---------------------------------------------------------------------------
// PhysicsWorld
// ---------------------------------------------------------------------------

let _bodyCounter = 0;

function generateBodyId(): string {
  return `body_${++_bodyCounter}`;
}

function defaultShape(): Shape {
  return {
    kind: 'aabb',
    aabb: { min: new Vec2(-0.5, -0.5), max: new Vec2(0.5, 0.5) },
  };
}

export class PhysicsWorld {
  bodies: Body[] = [];
  private readonly gravity: Vec2;
  private readonly detector = new CollisionDetector();
  private readonly resolver = new CollisionResolver();

  constructor(gravity: Vec2 = new Vec2(0, 9.81)) {
    this.gravity = gravity;
  }

  addBody(partial: Partial<Body> & { id?: string }): Body {
    const body: Body = {
      id: partial.id ?? generateBodyId(),
      position: partial.position ?? Vec2.zero(),
      velocity: partial.velocity ?? Vec2.zero(),
      acceleration: partial.acceleration ?? Vec2.zero(),
      mass: partial.mass ?? 1,
      restitution: partial.restitution ?? 0.3,
      friction: partial.friction ?? 0.5,
      shape: partial.shape ?? defaultShape(),
      isStatic: partial.isStatic ?? false,
      forces: partial.forces ?? [],
    };
    this.bodies.push(body);
    return body;
  }

  removeBody(id: string): void {
    const idx = this.bodies.findIndex(b => b.id === id);
    if (idx !== -1) this.bodies.splice(idx, 1);
  }

  getBody(id: string): Body | undefined {
    return this.bodies.find(b => b.id === id);
  }

  step(dt: number): void {
    // Accumulate forces and integrate
    for (const body of this.bodies) {
      if (body.isStatic) continue;

      // Gravity
      body.forces.push(this.gravity.scale(body.mass));

      // Sum forces
      let totalForce = Vec2.zero();
      for (const f of body.forces) totalForce = totalForce.add(f);
      body.forces = [];

      body.acceleration = totalForce.scale(1 / body.mass);
      body.velocity = body.velocity.add(body.acceleration.scale(dt));
      body.position = body.position.add(body.velocity.scale(dt));
    }

    // Detect and resolve collisions
    const collisions = this.detector.detectAll(this.bodies);
    const bodyMap = new Map<string, Body>(this.bodies.map(b => [b.id, b]));

    for (const col of collisions) {
      const bA = bodyMap.get(col.bodyA);
      const bB = bodyMap.get(col.bodyB);
      if (bA && bB) this.resolver.resolve(col, bA, bB);
    }
  }

  raycast(
    origin: Vec2,
    dir: Vec2,
    maxDist: number,
  ): { body: Body; point: Vec2; distance: number } | null {
    const normalized = dir.normalize();
    let closest: { body: Body; point: Vec2; distance: number } | null = null;

    for (const body of this.bodies) {
      let hit: { point: Vec2; distance: number } | null = null;

      if (body.shape.kind === 'circle') {
        const c = body.position.add(body.shape.circle.center);
        const r = body.shape.circle.radius;
        const oc = origin.sub(c);
        const a = normalized.dot(normalized);
        const b = 2 * oc.dot(normalized);
        const cVal = oc.dot(oc) - r * r;
        const discriminant = b * b - 4 * a * cVal;
        if (discriminant >= 0) {
          const t = (-b - Math.sqrt(discriminant)) / (2 * a);
          if (t >= 0 && t <= maxDist) {
            hit = { point: origin.add(normalized.scale(t)), distance: t };
          }
        }
      } else {
        // Slab method for AABB
        const aabb = body.shape.aabb;
        const worldMin = body.position.add(aabb.min);
        const worldMax = body.position.add(aabb.max);

        let tMin = 0;
        let tMax = maxDist;

        for (let axis = 0; axis < 2; axis++) {
          const o = axis === 0 ? origin.x : origin.y;
          const d = axis === 0 ? normalized.x : normalized.y;
          const bMin = axis === 0 ? worldMin.x : worldMin.y;
          const bMax = axis === 0 ? worldMax.x : worldMax.y;

          if (Math.abs(d) < 1e-9) {
            if (o < bMin || o > bMax) { tMin = Infinity; break; }
          } else {
            const t1 = (bMin - o) / d;
            const t2 = (bMax - o) / d;
            tMin = Math.max(tMin, Math.min(t1, t2));
            tMax = Math.min(tMax, Math.max(t1, t2));
          }
        }

        if (tMin <= tMax && tMin >= 0) {
          hit = { point: origin.add(normalized.scale(tMin)), distance: tMin };
        }
      }

      if (hit && (!closest || hit.distance < closest.distance)) {
        closest = { body, ...hit };
      }
    }

    return closest;
  }
}

// ---------------------------------------------------------------------------
// PhysicsEngine
// ---------------------------------------------------------------------------

export class PhysicsEngine {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG(12345);
  }

  createWorld(gravity?: Vec2): PhysicsWorld {
    return new PhysicsWorld(gravity);
  }

  createVerletSystem(): VerletIntegrator {
    return new VerletIntegrator();
  }

  fromSeed(seed: UniversalSeed): PhysicsWorld {
    const getScalar = (key: string, fallback: number): number => {
      const gene = seed.genes[key];
      return gene && typeof gene === 'object' && 'value' in gene && typeof gene.value === 'number' ? gene.value : fallback;
    };

    const gravityStrength = getScalar('gravity', 0.5) * 20;
    const world = this.createWorld(new Vec2(0, gravityStrength));

    const bodyCount = Math.max(1, Math.min(20, Math.floor(getScalar('complexity', 0.5) * 20)));

    // Deterministic floor
    world.addBody({
      id: 'seed_floor',
      position: new Vec2(0, 10),
      shape: { kind: 'aabb', aabb: { min: new Vec2(-50, -0.5), max: new Vec2(50, 0.5) } },
      isStatic: true,
      mass: 1e9,
      restitution: 0.3,
      friction: 0.5,
    });

    const restitution = getScalar('elasticity', 0.3);
    const friction = getScalar('friction', 0.5);
    const mass = getScalar('mass', 0.1) * 10 + 0.5;

    for (let i = 0; i < bodyCount; i++) {
      const x = (this.rng.next() * 2 - 1) * 20;
      const y = (this.rng.next() * -20) - 1;
      const useCircle = this.rng.next() > 0.5;

      const shape: Shape = useCircle
        ? { kind: 'circle', circle: { center: Vec2.zero(), radius: 0.5 + this.rng.next() } }
        : {
            kind: 'aabb',
            aabb: {
              min: new Vec2(-0.5, -0.5),
              max: new Vec2(0.5, 0.5),
            },
          };

      world.addBody({
        id: `seed_body_${i}`,
        position: new Vec2(x, y),
        velocity: Vec2.zero(),
        shape,
        mass,
        restitution,
        friction,
        isStatic: false,
      });
    }

    return world;
  }
}

// ---------------------------------------------------------------------------
// Re-export everything for consumers
// ---------------------------------------------------------------------------

export type {
  UniversalSeed,
};
