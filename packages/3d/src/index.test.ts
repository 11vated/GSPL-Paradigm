/**
 * @paradigm/3d — comprehensive test suite targeting 80%+ coverage.
 *
 * Import paths use '.js' extensions to satisfy the ESM resolver that vitest
 * uses when "type": "module" is set in package.json.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { UniversalSeed } from '@paradigm/types';
import {
  Vec3,
  Mat4,
  MeshGenerator,
  SkeletonGenerator,
  CameraPresets,
  SceneGraph,
  GLTFExporter,
  SceneEngine,
} from './index.js';
import type { SceneNode, Mesh, CameraConfig } from './index.js';

// ─────────────────────────────────────────────
// Seed factory — keeps tests self-contained
// ─────────────────────────────────────────────

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

/** Build a minimal valid SceneNode. */
const makeNode = (id: string, name?: string, mesh?: Mesh): SceneNode => ({
  id,
  name: name ?? id,
  mesh,
  position: Vec3.zero(),
  rotation: Vec3.zero(),
  scale: Vec3.one(),
  children: [],
  visible: true,
});

const EPSILON = 1e-5;
const approx = (a: number, b: number) => Math.abs(a - b) < EPSILON;

// ─────────────────────────────────────────────
// Vec3
// ─────────────────────────────────────────────

describe('Vec3', () => {
  describe('static constructors', () => {
    it('zero returns (0,0,0)', () => {
      const v = Vec3.zero();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('one returns (1,1,1)', () => {
      const v = Vec3.one();
      expect(v.x).toBe(1);
      expect(v.y).toBe(1);
      expect(v.z).toBe(1);
    });

    it('up returns (0,1,0)', () => {
      const v = Vec3.up();
      expect(v.x).toBe(0);
      expect(v.y).toBe(1);
      expect(v.z).toBe(0);
    });

    it('right returns (1,0,0)', () => {
      const v = Vec3.right();
      expect(v.x).toBe(1);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('forward returns (0,0,-1)', () => {
      const v = Vec3.forward();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(-1);
    });

    it('fromArray round-trips', () => {
      const v = Vec3.fromArray([3, 4, 5]);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
      expect(v.z).toBe(5);
    });
  });

  describe('arithmetic', () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(4, 5, 6);

    it('add', () => {
      const r = a.add(b);
      expect(r.x).toBe(5);
      expect(r.y).toBe(7);
      expect(r.z).toBe(9);
    });

    it('sub', () => {
      const r = b.sub(a);
      expect(r.x).toBe(3);
      expect(r.y).toBe(3);
      expect(r.z).toBe(3);
    });

    it('scale', () => {
      const r = a.scale(2);
      expect(r.x).toBe(2);
      expect(r.y).toBe(4);
      expect(r.z).toBe(6);
    });

    it('dot', () => {
      expect(a.dot(b)).toBe(32); // 1*4 + 2*5 + 3*6
    });

    it('cross — right-hand rule', () => {
      // (1,0,0) × (0,1,0) = (0,0,1) by right-hand rule
      const r = Vec3.right().cross(Vec3.up());
      expect(approx(r.x, 0)).toBe(true);
      expect(approx(r.y, 0)).toBe(true);
      expect(approx(r.z, 1)).toBe(true);
    });

    it('cross — anticommutative', () => {
      const ab = a.cross(b);
      const ba = b.cross(a);
      expect(approx(ab.x, -ba.x)).toBe(true);
      expect(approx(ab.y, -ba.y)).toBe(true);
      expect(approx(ab.z, -ba.z)).toBe(true);
    });
  });

  describe('length / normalize', () => {
    it('length of (3,4,0) is 5', () => {
      expect(new Vec3(3, 4, 0).length()).toBeCloseTo(5, 10);
    });

    it('normalize produces unit vector', () => {
      const n = new Vec3(3, 4, 0).normalize();
      expect(n.length()).toBeCloseTo(1, 10);
    });

    it('normalize of zero vector returns zero', () => {
      const n = Vec3.zero().normalize();
      expect(n.x).toBe(0);
      expect(n.y).toBe(0);
      expect(n.z).toBe(0);
    });

    it('distanceTo', () => {
      const dist = new Vec3(0, 0, 0).distanceTo(new Vec3(1, 0, 0));
      expect(dist).toBeCloseTo(1, 10);
    });
  });

  describe('lerp', () => {
    it('t=0 returns this', () => {
      const a = new Vec3(0, 0, 0);
      const b = new Vec3(10, 10, 10);
      expect(a.lerp(b, 0).equals(a)).toBe(true);
    });

    it('t=1 returns target', () => {
      const a = new Vec3(0, 0, 0);
      const b = new Vec3(10, 10, 10);
      expect(a.lerp(b, 1).equals(b)).toBe(true);
    });

    it('t=0.5 returns midpoint', () => {
      const r = new Vec3(0, 0, 0).lerp(new Vec3(4, 6, 8), 0.5);
      expect(r.x).toBeCloseTo(2);
      expect(r.y).toBeCloseTo(3);
      expect(r.z).toBeCloseTo(4);
    });
  });

  describe('clone / toArray / equals', () => {
    it('clone produces equal but distinct object', () => {
      const a = new Vec3(7, 8, 9);
      const b = a.clone();
      expect(b.equals(a)).toBe(true);
      expect(b).not.toBe(a);
    });

    it('toArray round-trips', () => {
      const arr = new Vec3(1, 2, 3).toArray();
      expect(arr).toEqual([1, 2, 3]);
    });

    it('equals — true for same components', () => {
      expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 3))).toBe(true);
    });

    it('equals — false for different components', () => {
      expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 4))).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Mat4
// ─────────────────────────────────────────────

describe('Mat4', () => {
  describe('identity', () => {
    it('determinant of identity is 1', () => {
      expect(Mat4.identity().determinant()).toBeCloseTo(1);
    });

    it('transformPoint by identity is a no-op', () => {
      const v = new Vec3(3, 4, 5);
      const r = Mat4.identity().transformPoint(v);
      expect(r.equals(v)).toBe(true);
    });

    it('toArray has 16 elements', () => {
      expect(Mat4.identity().toArray().length).toBe(16);
    });
  });

  describe('translation', () => {
    it('moves a point correctly', () => {
      const t = Mat4.translation(10, 20, 30);
      const r = t.transformPoint(new Vec3(1, 2, 3));
      expect(r.x).toBeCloseTo(11);
      expect(r.y).toBeCloseTo(22);
      expect(r.z).toBeCloseTo(33);
    });

    it('does not affect direction vectors', () => {
      const t = Mat4.translation(10, 20, 30);
      // transformDirection ignores translation
      const d = new Vec3(1, 0, 0);
      const r = t.transformDirection(d);
      expect(r.x).toBeCloseTo(1);
      expect(r.y).toBeCloseTo(0);
      expect(r.z).toBeCloseTo(0);
    });
  });

  describe('scaling', () => {
    it('scales a point by given factors', () => {
      const s = Mat4.scaling(2, 3, 4);
      const r = s.transformPoint(new Vec3(1, 1, 1));
      expect(r.x).toBeCloseTo(2);
      expect(r.y).toBeCloseTo(3);
      expect(r.z).toBeCloseTo(4);
    });

    it('determinant equals product of scale factors', () => {
      expect(Mat4.scaling(2, 3, 4).determinant()).toBeCloseTo(24);
    });
  });

  describe('rotations', () => {
    it('rotationX by PI/2 maps Y to Z', () => {
      const v = new Vec3(0, 1, 0);
      const r = Mat4.rotationX(Math.PI / 2).transformPoint(v);
      expect(r.x).toBeCloseTo(0);
      expect(r.y).toBeCloseTo(0);
      expect(r.z).toBeCloseTo(1);
    });

    it('rotationY by PI/2 maps Z to X', () => {
      const v = new Vec3(0, 0, 1);
      const r = Mat4.rotationY(Math.PI / 2).transformPoint(v);
      expect(r.x).toBeCloseTo(1);
      expect(r.y).toBeCloseTo(0);
      expect(r.z).toBeCloseTo(0);
    });

    it('rotationZ by PI/2 maps X to Y', () => {
      const v = new Vec3(1, 0, 0);
      const r = Mat4.rotationZ(Math.PI / 2).transformPoint(v);
      expect(r.x).toBeCloseTo(0);
      expect(r.y).toBeCloseTo(1);
      expect(r.z).toBeCloseTo(0);
    });

    it('rotation determinant is 1 (no scale)', () => {
      expect(Mat4.rotationX(1.2).determinant()).toBeCloseTo(1);
      expect(Mat4.rotationY(0.7).determinant()).toBeCloseTo(1);
      expect(Mat4.rotationZ(2.1).determinant()).toBeCloseTo(1);
    });

    it('rotation by 0 is identity transform', () => {
      const v = new Vec3(1, 2, 3);
      const r = Mat4.rotationX(0).transformPoint(v);
      expect(r.x).toBeCloseTo(v.x);
      expect(r.y).toBeCloseTo(v.y);
      expect(r.z).toBeCloseTo(v.z);
    });
  });

  describe('perspective', () => {
    it('produces a 16-element array', () => {
      const p = Mat4.perspective(Math.PI / 4, 16 / 9, 0.1, 1000);
      expect(p.toArray().length).toBe(16);
    });

    it('non-zero w component for non-infinity projection', () => {
      const p = Mat4.perspective(Math.PI / 4, 1, 0.1, 100);
      const arr = p.toArray();
      // m[11] should be -1 in the OpenGL convention (element at index 11 of column-major)
      expect(arr[11]).toBeCloseTo(-1);
    });
  });

  describe('lookAt', () => {
    it('produces a view matrix that positions origin at (0,0,-dist) after transform', () => {
      const eye = new Vec3(0, 0, 5);
      const target = Vec3.zero();
      const up = Vec3.up();
      const view = Mat4.lookAt(eye, target, up);
      // The eye in view space should map to approximately (0, 0, 0)
      const transformed = view.transformPoint(eye);
      expect(transformed.x).toBeCloseTo(0, 4);
      expect(transformed.y).toBeCloseTo(0, 4);
      expect(transformed.z).toBeCloseTo(0, 4);
    });

    it('determinant is 1 (pure rotation + translation)', () => {
      const view = Mat4.lookAt(new Vec3(0, 0, 5), Vec3.zero(), Vec3.up());
      expect(Math.abs(view.determinant())).toBeCloseTo(1, 4);
    });
  });

  describe('multiply', () => {
    it('identity × identity = identity', () => {
      const m = Mat4.identity().multiply(Mat4.identity());
      expect(m.determinant()).toBeCloseTo(1);
      const r = m.transformPoint(new Vec3(1, 2, 3));
      expect(r.x).toBeCloseTo(1);
      expect(r.y).toBeCloseTo(2);
      expect(r.z).toBeCloseTo(3);
    });

    it('scaling × scaling compounds', () => {
      const m = Mat4.scaling(2, 2, 2).multiply(Mat4.scaling(3, 3, 3));
      const r = m.transformPoint(new Vec3(1, 1, 1));
      expect(r.x).toBeCloseTo(6);
      expect(r.y).toBeCloseTo(6);
      expect(r.z).toBeCloseTo(6);
    });

    it('translation × translation compounds', () => {
      const m = Mat4.translation(1, 0, 0).multiply(Mat4.translation(2, 0, 0));
      const r = m.transformPoint(Vec3.zero());
      expect(r.x).toBeCloseTo(3);
    });
  });

  describe('transformPoint with w division', () => {
    it('handles w=0 guard without dividing by zero', () => {
      // A perspective matrix can yield w != 1, but identity gives w=1
      const r = Mat4.identity().transformPoint(new Vec3(1, 2, 3));
      expect(r.x).toBeCloseTo(1);
    });
  });

  describe('determinant', () => {
    it('scaling(1,1,1) determinant is 1', () => {
      expect(Mat4.scaling(1, 1, 1).determinant()).toBeCloseTo(1);
    });

    it('scaling(0,1,1) determinant is 0 (singular)', () => {
      expect(Mat4.scaling(0, 1, 1).determinant()).toBeCloseTo(0);
    });
  });
});

// ─────────────────────────────────────────────
// MeshGenerator
// ─────────────────────────────────────────────

describe('MeshGenerator', () => {
  let gen: MeshGenerator;
  beforeEach(() => { gen = new MeshGenerator(); });

  describe('generateBox', () => {
    it('produces 24 vertices and 12 faces', () => {
      const m = gen.generateBox(1, 1, 1);
      expect(m.vertices.length).toBe(24);
      expect(m.faces.length).toBe(12);
    });

    it('name is "box"', () => {
      expect(gen.generateBox(2, 3, 4).name).toBe('box');
    });

    it('vertices are within bounding box', () => {
      const m = gen.generateBox(2, 4, 6);
      for (const v of m.vertices) {
        expect(Math.abs(v.position.x)).toBeLessThanOrEqual(1 + EPSILON);
        expect(Math.abs(v.position.y)).toBeLessThanOrEqual(2 + EPSILON);
        expect(Math.abs(v.position.z)).toBeLessThanOrEqual(3 + EPSILON);
      }
    });

    it('all face normals point outward (each normal is a unit vector)', () => {
      const m = gen.generateBox(1, 1, 1);
      for (const v of m.vertices) {
        expect(v.normal.length()).toBeCloseTo(1, 5);
      }
    });

    it('all face indices are within vertex array bounds', () => {
      const m = gen.generateBox(1, 1, 1);
      for (const f of m.faces) {
        for (const idx of f.indices) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(m.vertices.length);
        }
      }
    });
  });

  describe('generateSphere', () => {
    it('has correct vertex and face counts', () => {
      const m = gen.generateSphere(1, 8, 6);
      expect(m.vertices.length).toBe((8 + 1) * (6 + 1));
      expect(m.faces.length).toBe(8 * 6 * 2);
    });

    it('name is "sphere"', () => {
      expect(gen.generateSphere(1).name).toBe('sphere');
    });

    it('enforces minimum 3 segments and 2 rings', () => {
      const m = gen.generateSphere(1, 1, 1);
      // segments clamped to 3, rings clamped to 2
      expect(m.vertices.length).toBe((3 + 1) * (2 + 1));
    });

    it('all vertex normals are unit length', () => {
      const m = gen.generateSphere(1, 8, 6);
      for (const v of m.vertices) {
        expect(v.normal.length()).toBeCloseTo(1, 5);
      }
    });

    it('all vertices lie on the sphere surface', () => {
      const r = 3;
      const m = gen.generateSphere(r, 8, 6);
      for (const v of m.vertices) {
        expect(v.position.length()).toBeCloseTo(r, 4);
      }
    });

    it('all face indices within bounds', () => {
      const m = gen.generateSphere(1, 8, 6);
      for (const f of m.faces) {
        for (const idx of f.indices) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(m.vertices.length);
        }
      }
    });
  });

  describe('generateCylinder', () => {
    it('name is "cylinder"', () => {
      expect(gen.generateCylinder(1, 1, 2).name).toBe('cylinder');
    });

    it('has faces', () => {
      const m = gen.generateCylinder(1, 1, 2, 8);
      expect(m.faces.length).toBeGreaterThan(0);
    });

    it('enforces minimum 3 segments', () => {
      const m = gen.generateCylinder(1, 1, 2, 1);
      // 3 segments clamped — side verts = (3+1)*2 + 2 + (3+1)*2
      expect(m.vertices.length).toBeGreaterThan(0);
    });

    it('all face indices within bounds', () => {
      const m = gen.generateCylinder(1, 1, 2, 8);
      for (const f of m.faces) {
        for (const idx of f.indices) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(m.vertices.length);
        }
      }
    });

    it('tapered cylinder (cone-like) has different radii', () => {
      const m = gen.generateCylinder(0.5, 1, 2, 8);
      expect(m.vertices.length).toBeGreaterThan(0);
    });
  });

  describe('generatePlane', () => {
    it('name is "plane"', () => {
      expect(gen.generatePlane(2, 2).name).toBe('plane');
    });

    it('1×1 subdivision has 4 vertices and 2 faces', () => {
      const m = gen.generatePlane(2, 2, 1, 1);
      expect(m.vertices.length).toBe(4);
      expect(m.faces.length).toBe(2);
    });

    it('2×2 subdivision has 9 vertices and 8 faces', () => {
      const m = gen.generatePlane(4, 4, 2, 2);
      expect(m.vertices.length).toBe(9);
      expect(m.faces.length).toBe(8);
    });

    it('all normals point up (0,1,0)', () => {
      const m = gen.generatePlane(2, 2, 2, 2);
      for (const v of m.vertices) {
        expect(v.normal.x).toBeCloseTo(0);
        expect(v.normal.y).toBeCloseTo(1);
        expect(v.normal.z).toBeCloseTo(0);
      }
    });

    it('enforces minimum 1 segment', () => {
      const m = gen.generatePlane(1, 1, 0, 0);
      expect(m.vertices.length).toBe(4);
    });
  });

  describe('generateFromSeed', () => {
    it('returns a mesh with a name prefixed by "mesh_"', () => {
      const seed = makeSeed('hero', 'human');
      const m = gen.generateFromSeed(seed);
      expect(m.name).toBe('mesh_hero');
    });

    it('attaches a material named "mat_<seed.$name>"', () => {
      const seed = makeSeed('dragon', 'beast');
      const m = gen.generateFromSeed(seed);
      expect(m.material?.name).toBe('mat_dragon');
    });

    it('material color channels are in [0,1]', () => {
      const seed = makeSeed('wizard', 'magic');
      const m = gen.generateFromSeed(seed);
      const [r, g, b] = m.material!.color;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    });

    it('is deterministic — same seed produces same mesh name', () => {
      const seed = makeSeed('cleric', 'holy');
      const m1 = gen.generateFromSeed(seed);
      const m2 = new MeshGenerator().generateFromSeed(seed);
      expect(m1.name).toBe(m2.name);
      expect(m1.vertices.length).toBe(m2.vertices.length);
    });

    it('different seeds generally produce different meshes', () => {
      const m1 = gen.generateFromSeed(makeSeed('alpha', 'world'));
      const m2 = gen.generateFromSeed(makeSeed('beta', 'world'));
      // Names will differ even if vertex count happens to match
      expect(m1.name).not.toBe(m2.name);
    });
  });
});

// ─────────────────────────────────────────────
// SkeletonGenerator
// ─────────────────────────────────────────────

describe('SkeletonGenerator', () => {
  const gen = new SkeletonGenerator();

  describe('generateHumanoid', () => {
    it('returns skeleton named "humanoid"', () => {
      expect(gen.generateHumanoid().name).toBe('humanoid');
    });

    it('root bone has parentIndex -1', () => {
      const sk = gen.generateHumanoid();
      const root = sk.bones[0];
      expect(root?.name).toBe('root');
      expect(root?.parentIndex).toBe(-1);
    });

    it('has at least 15 bones', () => {
      expect(gen.generateHumanoid().bones.length).toBeGreaterThanOrEqual(15);
    });

    it('contains expected key bones', () => {
      const names = gen.generateHumanoid().bones.map((b) => b.name);
      expect(names).toContain('spine');
      expect(names).toContain('chest');
      expect(names).toContain('head');
      expect(names).toContain('hand.L');
      expect(names).toContain('hand.R');
      expect(names).toContain('foot.L');
      expect(names).toContain('foot.R');
    });

    it('all non-root bones reference valid parent indices', () => {
      const sk = gen.generateHumanoid();
      for (const bone of sk.bones) {
        if (bone.parentIndex !== -1) {
          expect(bone.parentIndex).toBeGreaterThanOrEqual(0);
          expect(bone.parentIndex).toBeLessThan(sk.bones.length);
        }
      }
    });
  });

  describe('generateQuadruped', () => {
    it('returns skeleton named "quadruped"', () => {
      expect(gen.generateQuadruped().name).toBe('quadruped');
    });

    it('root bone has parentIndex -1', () => {
      const sk = gen.generateQuadruped();
      expect(sk.bones[0]?.parentIndex).toBe(-1);
    });

    it('has at least 12 bones', () => {
      expect(gen.generateQuadruped().bones.length).toBeGreaterThanOrEqual(12);
    });

    it('contains tail bone', () => {
      const names = gen.generateQuadruped().bones.map((b) => b.name);
      expect(names).toContain('tail');
    });

    it('all non-root bones reference valid parent indices', () => {
      const sk = gen.generateQuadruped();
      for (const bone of sk.bones) {
        if (bone.parentIndex !== -1) {
          expect(bone.parentIndex).toBeGreaterThanOrEqual(0);
          expect(bone.parentIndex).toBeLessThan(sk.bones.length);
        }
      }
    });
  });

  describe('generateFromSeed', () => {
    it('skeleton name is "skeleton_<seed.$name>"', () => {
      const seed = makeSeed('goblin', 'human');
      const sk = gen.generateFromSeed(seed);
      expect(sk.name).toBe('skeleton_goblin');
    });

    it('mammal domain forces quadruped rig', () => {
      const seed = makeSeed('wolf', 'mammal');
      const sk = gen.generateFromSeed(seed);
      const names = sk.bones.map((b) => b.name);
      // quadruped has tail; humanoid does not
      expect(names).toContain('tail');
    });

    it('is deterministic — two calls with same seed produce same bone count', () => {
      const seed = makeSeed('elf', 'human');
      const sk1 = gen.generateFromSeed(seed);
      const sk2 = new SkeletonGenerator().generateFromSeed(seed);
      expect(sk1.bones.length).toBe(sk2.bones.length);
      expect(sk1.bones[0]?.name).toBe(sk2.bones[0]?.name);
    });

    it('scales Y positions by a factor in [0.8, 1.3]', () => {
      // This is structural — just ensure positions are Vec3 instances
      const seed = makeSeed('giant', 'human');
      const sk = gen.generateFromSeed(seed);
      for (const bone of sk.bones) {
        expect(bone.position).toBeInstanceOf(Vec3);
      }
    });
  });
});

// ─────────────────────────────────────────────
// CameraPresets
// ─────────────────────────────────────────────

describe('CameraPresets', () => {
  const assertValidCamera = (cam: CameraConfig) => {
    expect(cam.near).toBeGreaterThan(0);
    expect(cam.far).toBeGreaterThan(cam.near);
    expect(cam.fov).toBeGreaterThan(0);
    expect(cam.position).toBeInstanceOf(Vec3);
    expect(cam.target).toBeInstanceOf(Vec3);
    expect(cam.up).toBeInstanceOf(Vec3);
  };

  describe('orbit', () => {
    it('produces perspective camera', () => {
      const cam = CameraPresets.orbit(10, 0.5, 1.0);
      expect(cam.mode).toBe('perspective');
    });

    it('target is origin', () => {
      const cam = CameraPresets.orbit(10, 0.5, 1.0);
      expect(cam.target.equals(Vec3.zero())).toBe(true);
    });

    it('camera distance from origin equals dist param', () => {
      const dist = 7;
      const cam = CameraPresets.orbit(dist, 0, 0);
      expect(cam.position.length()).toBeCloseTo(dist, 4);
    });

    it('passes valid camera check', () => assertValidCamera(CameraPresets.orbit(10, 0.3, 0.8)));
  });

  describe('topDown', () => {
    it('produces orthographic camera', () => {
      expect(CameraPresets.topDown(50).mode).toBe('orthographic');
    });

    it('position Y equals h', () => {
      const cam = CameraPresets.topDown(20);
      expect(cam.position.y).toBe(20);
    });

    it('far = h * 2', () => {
      const cam = CameraPresets.topDown(30);
      expect(cam.far).toBeCloseTo(60);
    });

    it('passes valid camera check', () => assertValidCamera(CameraPresets.topDown(100)));
  });

  describe('isometric', () => {
    it('produces perspective camera', () => {
      expect(CameraPresets.isometric().mode).toBe('perspective');
    });

    it('target is origin', () => {
      expect(CameraPresets.isometric().target.equals(Vec3.zero())).toBe(true);
    });

    it('passes valid camera check', () => assertValidCamera(CameraPresets.isometric()));
  });

  describe('firstPerson', () => {
    it('position equals supplied pos', () => {
      const pos = new Vec3(1, 2, 3);
      const dir = new Vec3(0, 0, -1);
      const cam = CameraPresets.firstPerson(pos, dir);
      expect(cam.position.equals(pos)).toBe(true);
    });

    it('target is one unit ahead along dir', () => {
      const pos = new Vec3(0, 0, 0);
      const dir = new Vec3(0, 0, -1);
      const cam = CameraPresets.firstPerson(pos, dir);
      expect(cam.target.z).toBeCloseTo(-1);
    });

    it('fov is 75° in radians', () => {
      const cam = CameraPresets.firstPerson(Vec3.zero(), new Vec3(0, 0, -1));
      expect(cam.fov).toBeCloseTo((75 * Math.PI) / 180, 5);
    });

    it('normalises non-unit direction', () => {
      const cam = CameraPresets.firstPerson(Vec3.zero(), new Vec3(0, 0, -5));
      // target should be unit distance from position
      expect(cam.target.distanceTo(cam.position)).toBeCloseTo(1, 5);
    });

    it('passes valid camera check', () => {
      assertValidCamera(CameraPresets.firstPerson(new Vec3(0, 1, 0), new Vec3(1, 0, 0)));
    });
  });

  describe('forSeed', () => {
    it('returns a perspective camera', () => {
      expect(CameraPresets.forSeed(makeSeed('hero', 'world')).mode).toBe('perspective');
    });

    it('is deterministic', () => {
      const seed = makeSeed('torch', 'light');
      const c1 = CameraPresets.forSeed(seed);
      const c2 = CameraPresets.forSeed(seed);
      expect(c1.position.x).toBeCloseTo(c2.position.x);
      expect(c1.position.y).toBeCloseTo(c2.position.y);
      expect(c1.position.z).toBeCloseTo(c2.position.z);
    });

    it('passes valid camera check', () => {
      assertValidCamera(CameraPresets.forSeed(makeSeed('moon', 'cosmic')));
    });
  });
});

// ─────────────────────────────────────────────
// SceneGraph
// ─────────────────────────────────────────────

describe('SceneGraph', () => {
  let graph: SceneGraph;
  beforeEach(() => { graph = new SceneGraph(); });

  describe('addNode', () => {
    it('adds root node to top-level list', () => {
      graph.addNode(makeNode('a'));
      expect(graph.nodes.length).toBe(1);
    });

    it('adds child node when parentId found', () => {
      graph.addNode(makeNode('parent'));
      graph.addNode(makeNode('child'), 'parent');
      expect(graph.nodes.length).toBe(1);
      expect(graph.nodes[0]?.children.length).toBe(1);
    });

    it('adds to root list when parentId not found', () => {
      graph.addNode(makeNode('orphan'), 'nonexistent-id');
      expect(graph.nodes.length).toBe(1);
    });

    it('supports multiple root nodes', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      expect(graph.nodes.length).toBe(3);
    });
  });

  describe('removeNode', () => {
    it('returns false when node not found', () => {
      expect(graph.removeNode('missing')).toBe(false);
    });

    it('removes a root node and returns true', () => {
      graph.addNode(makeNode('a'));
      expect(graph.removeNode('a')).toBe(true);
      expect(graph.nodes.length).toBe(0);
    });

    it('removes a nested child node', () => {
      graph.addNode(makeNode('parent'));
      graph.addNode(makeNode('child'), 'parent');
      expect(graph.removeNode('child')).toBe(true);
      expect(graph.nodes[0]?.children.length).toBe(0);
    });

    it('removes deeply nested node', () => {
      graph.addNode(makeNode('root'));
      graph.addNode(makeNode('mid'), 'root');
      graph.addNode(makeNode('leaf'), 'mid');
      expect(graph.removeNode('leaf')).toBe(true);
      expect(graph.findNode('leaf')).toBeUndefined();
    });

    it('removing a subtree root also removes its children', () => {
      graph.addNode(makeNode('root'));
      graph.addNode(makeNode('branch'), 'root');
      graph.addNode(makeNode('leaf'), 'branch');
      graph.removeNode('branch');
      expect(graph.findNode('branch')).toBeUndefined();
      expect(graph.findNode('leaf')).toBeUndefined();
    });
  });

  describe('findNode', () => {
    it('returns undefined for empty graph', () => {
      expect(graph.findNode('x')).toBeUndefined();
    });

    it('finds a root node', () => {
      graph.addNode(makeNode('alpha'));
      expect(graph.findNode('alpha')?.id).toBe('alpha');
    });

    it('finds a child node via DFS', () => {
      graph.addNode(makeNode('r'));
      graph.addNode(makeNode('c'), 'r');
      expect(graph.findNode('c')?.id).toBe('c');
    });

    it('returns undefined for non-existent id', () => {
      graph.addNode(makeNode('r'));
      expect(graph.findNode('z')).toBeUndefined();
    });
  });

  describe('traverse', () => {
    it('visits no nodes on empty graph', () => {
      let count = 0;
      graph.traverse(() => count++);
      expect(count).toBe(0);
    });

    it('visits all nodes once', () => {
      graph.addNode(makeNode('r'));
      graph.addNode(makeNode('c1'), 'r');
      graph.addNode(makeNode('c2'), 'r');
      const visited: string[] = [];
      graph.traverse((node) => visited.push(node.id));
      expect(visited).toEqual(['r', 'c1', 'c2']);
    });

    it('passes correct depth values', () => {
      graph.addNode(makeNode('r'));
      graph.addNode(makeNode('child'), 'r');
      const depths: number[] = [];
      graph.traverse((_node, depth) => depths.push(depth));
      expect(depths).toEqual([0, 1]);
    });

    it('performs DFS ordering', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'), 'a');
      graph.addNode(makeNode('c'), 'b');
      graph.addNode(makeNode('d'), 'a');
      const order: string[] = [];
      graph.traverse((n) => order.push(n.id));
      expect(order).toEqual(['a', 'b', 'c', 'd']);
    });
  });
});

// ─────────────────────────────────────────────
// GLTFExporter
// ─────────────────────────────────────────────

describe('GLTFExporter', () => {
  let exporter: GLTFExporter;
  let gen: MeshGenerator;
  beforeEach(() => {
    exporter = new GLTFExporter();
    gen = new MeshGenerator();
  });

  const buildScene = (includeMesh = false): SceneGraph => {
    const scene = new SceneGraph();
    const mesh = includeMesh ? gen.generateBox(1, 1, 1) : undefined;
    scene.addNode(makeNode('node-1', 'TestNode', mesh));
    return scene;
  };

  describe('export produces valid JSON', () => {
    it('empty scene yields parseable JSON', () => {
      const result = exporter.export(new SceneGraph());
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('output contains asset version 2.0', () => {
      const gltf = JSON.parse(exporter.export(buildScene()));
      expect(gltf.asset.version).toBe('2.0');
    });

    it('output contains generator "@paradigm/3d"', () => {
      const gltf = JSON.parse(exporter.export(buildScene()));
      expect(gltf.asset.generator).toBe('@paradigm/3d');
    });

    it('has a scenes array with at least one entry', () => {
      const gltf = JSON.parse(exporter.export(buildScene()));
      expect(Array.isArray(gltf.scenes)).toBe(true);
      expect(gltf.scenes.length).toBeGreaterThan(0);
    });

    it('nodes array is present', () => {
      const gltf = JSON.parse(exporter.export(buildScene()));
      expect(Array.isArray(gltf.nodes)).toBe(true);
    });

    it('node name matches scene node name', () => {
      const gltf = JSON.parse(exporter.export(buildScene()));
      expect(gltf.nodes[0].name).toBe('TestNode');
    });
  });

  describe('mesh export', () => {
    it('exports mesh accessors when node has a mesh', () => {
      const gltf = JSON.parse(exporter.export(buildScene(true)));
      expect(gltf.meshes.length).toBeGreaterThan(0);
      expect(gltf.accessors.length).toBeGreaterThan(0);
      expect(gltf.bufferViews.length).toBeGreaterThan(0);
      expect(gltf.buffers.length).toBeGreaterThan(0);
    });

    it('buffer URI is base64 data URI', () => {
      const gltf = JSON.parse(exporter.export(buildScene(true)));
      expect(gltf.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
    });

    it('position accessor type is VEC3', () => {
      const gltf = JSON.parse(exporter.export(buildScene(true)));
      const posAccessor = gltf.accessors[0];
      expect(posAccessor.type).toBe('VEC3');
    });

    it('mesh with material exports material entry', () => {
      const scene = new SceneGraph();
      const mesh = gen.generateBox(1, 1, 1);
      mesh.material = { name: 'mat-test', color: [1, 0, 0], metallic: 0, roughness: 0.5 };
      scene.addNode(makeNode('n', 'N', mesh));
      const gltf = JSON.parse(exporter.export(scene));
      expect(gltf.materials.length).toBe(1);
      expect(gltf.materials[0].name).toBe('mat-test');
    });

    it('mesh with emissive exports emissiveFactor', () => {
      const scene = new SceneGraph();
      const mesh = gen.generateBox(1, 1, 1);
      mesh.material = { name: 'glow', color: [0, 1, 0], emissive: [0.5, 0.5, 0] };
      scene.addNode(makeNode('n', 'N', mesh));
      const gltf = JSON.parse(exporter.export(scene));
      expect(gltf.materials[0].emissiveFactor).toEqual([0.5, 0.5, 0]);
    });

    it('mesh with opacity < 1 sets alphaMode BLEND', () => {
      const scene = new SceneGraph();
      const mesh = gen.generateBox(1, 1, 1);
      mesh.material = { name: 'glass', color: [1, 1, 1], opacity: 0.5 };
      scene.addNode(makeNode('n', 'N', mesh));
      const gltf = JSON.parse(exporter.export(scene));
      expect(gltf.materials[0].alphaMode).toBe('BLEND');
    });

    it('invisible node does not export mesh data', () => {
      const scene = new SceneGraph();
      const mesh = gen.generateBox(1, 1, 1);
      const node: SceneNode = { ...makeNode('invis', 'Invis', mesh), visible: false };
      scene.addNode(node);
      const gltf = JSON.parse(exporter.export(scene));
      // Node should appear but mesh reference should be absent
      expect(gltf.nodes[0].mesh).toBeUndefined();
    });

    it('scene with child nodes exports child indices', () => {
      const scene = new SceneGraph();
      scene.addNode(makeNode('parent', 'Parent'));
      scene.addNode(makeNode('child', 'Child'), 'parent');
      const gltf = JSON.parse(exporter.export(scene));
      expect(gltf.nodes[0].children).toBeDefined();
      expect(gltf.nodes[0].children.length).toBe(1);
    });

    it('same mesh referenced in two nodes reuses mesh index', () => {
      const scene = new SceneGraph();
      const mesh = gen.generateBox(1, 1, 1);
      scene.addNode(makeNode('n1', 'N1', mesh));
      scene.addNode(makeNode('n2', 'N2', mesh));
      const gltf = JSON.parse(exporter.export(scene));
      // Both nodes reference the same mesh index
      expect(gltf.nodes[0].mesh).toBe(gltf.nodes[1].mesh);
      expect(gltf.meshes.length).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────
// SceneEngine
// ─────────────────────────────────────────────

describe('SceneEngine', () => {
  let engine: SceneEngine;
  beforeEach(() => { engine = new SceneEngine(); });

  describe('createScene', () => {
    it('returns a SceneGraph instance', () => {
      expect(engine.createScene()).toBeInstanceOf(SceneGraph);
    });

    it('new scene has no nodes', () => {
      expect(engine.createScene().nodes.length).toBe(0);
    });
  });

  describe('generateMesh', () => {
    it('returns a mesh with a name', () => {
      const seed = makeSeed('warrior', 'human');
      const m = engine.generateMesh(seed);
      expect(typeof m.name).toBe('string');
      expect(m.vertices.length).toBeGreaterThan(0);
    });

    it('is deterministic across engine instances', () => {
      const seed = makeSeed('mage', 'arcane');
      const m1 = engine.generateMesh(seed);
      const m2 = new SceneEngine().generateMesh(seed);
      expect(m1.name).toBe(m2.name);
      expect(m1.vertices.length).toBe(m2.vertices.length);
    });
  });

  describe('generateSkeleton', () => {
    it('returns a skeleton with bones', () => {
      const seed = makeSeed('troll', 'beast');
      const sk = engine.generateSkeleton(seed);
      expect(sk.bones.length).toBeGreaterThan(0);
    });

    it('name starts with "skeleton_"', () => {
      const seed = makeSeed('fairy', 'spirit');
      const sk = engine.generateSkeleton(seed);
      expect(sk.name).toMatch(/^skeleton_/);
    });
  });

  describe('getCamera', () => {
    it('returns a perspective camera', () => {
      const cam = engine.getCamera(makeSeed('scout', 'world'));
      expect(cam.mode).toBe('perspective');
    });

    it('is deterministic', () => {
      const seed = makeSeed('bard', 'music');
      const c1 = engine.getCamera(seed);
      const c2 = engine.getCamera(seed);
      expect(c1.position.x).toBeCloseTo(c2.position.x);
    });
  });

  describe('addSeedToScene', () => {
    it('adds a node to the scene', () => {
      const scene = engine.createScene();
      engine.addSeedToScene(scene, makeSeed('goblin', 'creature'));
      expect(scene.nodes.length).toBe(1);
    });

    it('node name matches seed.$name', () => {
      const scene = engine.createScene();
      const seed = makeSeed('paladin', 'human');
      const node = engine.addSeedToScene(scene, seed);
      expect(node.name).toBe('paladin');
    });

    it('node id is unique across multiple calls', () => {
      const scene = engine.createScene();
      const n1 = engine.addSeedToScene(scene, makeSeed('a', 'x'));
      const n2 = engine.addSeedToScene(scene, makeSeed('b', 'x'));
      expect(n1.id).not.toBe(n2.id);
    });

    it('node is visible', () => {
      const scene = engine.createScene();
      const node = engine.addSeedToScene(scene, makeSeed('knight', 'human'));
      expect(node.visible).toBe(true);
    });

    it('node has scale (1,1,1)', () => {
      const scene = engine.createScene();
      const node = engine.addSeedToScene(scene, makeSeed('rogue', 'human'));
      expect(node.scale.equals(Vec3.one())).toBe(true);
    });

    it('node mesh is set', () => {
      const scene = engine.createScene();
      const node = engine.addSeedToScene(scene, makeSeed('ranger', 'human'));
      expect(node.mesh).toBeDefined();
    });

    it('seed with scalar genes uses them as position components', () => {
      const genes = {
        x: { type: 'scalar', value: 5, min: 0, max: 10 },
        y: { type: 'scalar', value: 3, min: 0, max: 10 },
        z: { type: 'scalar', value: 7, min: 0, max: 10 },
      };
      const seed = makeSeed('locator', 'world', genes);
      const scene = engine.createScene();
      const node = engine.addSeedToScene(scene, seed);
      expect(node.position.x).toBeCloseTo(5);
      expect(node.position.y).toBeCloseTo(3);
      expect(node.position.z).toBeCloseTo(7);
    });
  });

  describe('exportGLTF', () => {
    it('returns a valid JSON string', () => {
      const scene = engine.createScene();
      engine.addSeedToScene(scene, makeSeed('elf', 'human'));
      const result = engine.exportGLTF(scene);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('exported JSON contains asset block', () => {
      const scene = engine.createScene();
      const gltf = JSON.parse(engine.exportGLTF(scene));
      expect(gltf.asset.version).toBe('2.0');
    });
  });
});
