/**
 * @paradigm/3d — 3D math, mesh generation, skeletal rigs, cameras, scene graph, and glTF export.
 *
 * Zero external dependencies. All generation is deterministic when seeded via DeterministicRNG.
 * Fully typed with TypeScript strict mode — no `any`, no implicit returns.
 *
 * @packageDocumentation
 */

import type { Gene, UniversalSeed } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Vec3
// ─────────────────────────────────────────────

/** Immutable 3D vector with full arithmetic, geometric, and interpolation operations. */
export class Vec3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  /** (0, 0, 0) */
  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  /** (1, 1, 1) */
  static one(): Vec3 {
    return new Vec3(1, 1, 1);
  }

  /** (0, 1, 0) — world up axis */
  static up(): Vec3 {
    return new Vec3(0, 1, 0);
  }

  /** (1, 0, 0) — world right axis */
  static right(): Vec3 {
    return new Vec3(1, 0, 0);
  }

  /** (0, 0, -1) — world forward axis (OpenGL convention) */
  static forward(): Vec3 {
    return new Vec3(0, 0, -1);
  }

  /** Construct from a 3-element array [x, y, z]. */
  static fromArray(arr: [number, number, number]): Vec3 {
    return new Vec3(arr[0], arr[1], arr[2]);
  }

  /** Component-wise addition. */
  add(other: Vec3): Vec3 {
    return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  /** Component-wise subtraction. */
  sub(other: Vec3): Vec3 {
    return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  /** Uniform scalar multiplication. */
  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  /** Dot product. */
  dot(other: Vec3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  /** Cross product (right-hand rule). */
  cross(other: Vec3): Vec3 {
    return new Vec3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }

  /** Euclidean length. */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /** Unit vector. Returns zero vector if length is zero. */
  normalize(): Vec3 {
    const len = this.length();
    if (len === 0) return Vec3.zero();
    return this.scale(1 / len);
  }

  /** Euclidean distance to another vector. */
  distanceTo(other: Vec3): number {
    return this.sub(other).length();
  }

  /** Linear interpolation between this and target by factor t ∈ [0, 1]. */
  lerp(target: Vec3, t: number): Vec3 {
    return new Vec3(
      this.x + (target.x - this.x) * t,
      this.y + (target.y - this.y) * t,
      this.z + (target.z - this.z) * t,
    );
  }

  /** Deep copy. */
  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  /** Convert to a 3-element tuple [x, y, z]. */
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  /** Exact floating-point equality. */
  equals(other: Vec3): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }
}

// ─────────────────────────────────────────────
// Mat4
// ─────────────────────────────────────────────

/** Column-major 4×4 matrix for 3D transforms, projection, and view matrices. */
export class Mat4 {
  /** Internal 16-element column-major storage (col 0 = indices 0–3, etc.). */
  private readonly m: Readonly<[
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ]>;

  private constructor(
    m: [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ],
  ) {
    this.m = m;
  }

  /** Identity matrix. */
  static identity(): Mat4 {
    return new Mat4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  /** Translation matrix for (tx, ty, tz). */
  static translation(tx: number, ty: number, tz: number): Mat4 {
    return new Mat4([
      1,  0,  0,  0,
      0,  1,  0,  0,
      0,  0,  1,  0,
      tx, ty, tz, 1,
    ]);
  }

  /** Non-uniform scaling matrix. */
  static scaling(sx: number, sy: number, sz: number): Mat4 {
    return new Mat4([
      sx, 0,  0,  0,
      0,  sy, 0,  0,
      0,  0,  sz, 0,
      0,  0,  0,  1,
    ]);
  }

  /** Rotation about the X axis by rad radians (right-hand rule). */
  static rotationX(rad: number): Mat4 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new Mat4([
      1,  0, 0, 0,
      0,  c, s, 0,
      0, -s, c, 0,
      0,  0, 0, 1,
    ]);
  }

  /** Rotation about the Y axis by rad radians. */
  static rotationY(rad: number): Mat4 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new Mat4([
      c, 0, -s, 0,
      0, 1,  0, 0,
      s, 0,  c, 0,
      0, 0,  0, 1,
    ]);
  }

  /** Rotation about the Z axis by rad radians. */
  static rotationZ(rad: number): Mat4 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new Mat4([
       c, s, 0, 0,
      -s, c, 0, 0,
       0, 0, 1, 0,
       0, 0, 0, 1,
    ]);
  }

  /**
   * Perspective projection matrix (OpenGL NDC convention, column-major).
   * @param fovY Vertical field of view in radians.
   * @param aspect Width / height aspect ratio.
   * @param near Near clip plane distance (> 0).
   * @param far Far clip plane distance (> near).
   */
  static perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return new Mat4([
      f / aspect, 0,                     0,  0,
      0,          f,                     0,  0,
      0,          0,   (far + near) * nf, -1,
      0,          0, 2 * far * near * nf,  0,
    ]);
  }

  /**
   * View matrix using eye position, target point, and up direction.
   * Equivalent to gluLookAt.
   */
  static lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const f = target.sub(eye).normalize();
    const s = f.cross(up).normalize();
    const u = s.cross(f);
    return new Mat4([
       s.x,  u.x, -f.x, 0,
       s.y,  u.y, -f.y, 0,
       s.z,  u.z, -f.z, 0,
      -s.dot(eye), -u.dot(eye), f.dot(eye), 1,
    ]);
  }

  /** Matrix multiplication: this × other. */
  multiply(other: Mat4): Mat4 {
    const a = this.m;
    const b = other.m;
    const result: [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
        }
        result[col * 4 + row] = sum;
      }
    }
    return new Mat4(result);
  }

  /** Transform a Vec3 as a point (applies translation — w = 1). */
  transformPoint(v: Vec3): Vec3 {
    const m = this.m;
    const x = (m[0] ?? 0) * v.x + (m[4] ?? 0) * v.y + (m[8]  ?? 0) * v.z + (m[12] ?? 0);
    const y = (m[1] ?? 0) * v.x + (m[5] ?? 0) * v.y + (m[9]  ?? 0) * v.z + (m[13] ?? 0);
    const z = (m[2] ?? 0) * v.x + (m[6] ?? 0) * v.y + (m[10] ?? 0) * v.z + (m[14] ?? 0);
    const w = (m[3] ?? 0) * v.x + (m[7] ?? 0) * v.y + (m[11] ?? 0) * v.z + (m[15] ?? 0);
    if (w === 0) return new Vec3(x, y, z);
    return new Vec3(x / w, y / w, z / w);
  }

  /** Transform a Vec3 as a direction (ignores translation — w = 0). */
  transformDirection(v: Vec3): Vec3 {
    const m = this.m;
    return new Vec3(
      (m[0] ?? 0) * v.x + (m[4] ?? 0) * v.y + (m[8]  ?? 0) * v.z,
      (m[1] ?? 0) * v.x + (m[5] ?? 0) * v.y + (m[9]  ?? 0) * v.z,
      (m[2] ?? 0) * v.x + (m[6] ?? 0) * v.y + (m[10] ?? 0) * v.z,
    );
  }

  /** Determinant of the 4×4 matrix. */
  determinant(): number {
    const m = this.m;
    const [m00, m01, m02, m03] = [m[0] ?? 0, m[1] ?? 0, m[2]  ?? 0, m[3]  ?? 0];
    const [m10, m11, m12, m13] = [m[4] ?? 0, m[5] ?? 0, m[6]  ?? 0, m[7]  ?? 0];
    const [m20, m21, m22, m23] = [m[8] ?? 0, m[9] ?? 0, m[10] ?? 0, m[11] ?? 0];
    const [m30, m31, m32, m33] = [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0, m[15] ?? 0];

    const b00 = m00 * m11 - m01 * m10;
    const b01 = m00 * m12 - m02 * m10;
    const b02 = m00 * m13 - m03 * m10;
    const b03 = m01 * m12 - m02 * m11;
    const b04 = m01 * m13 - m03 * m11;
    const b05 = m02 * m13 - m03 * m12;
    const b06 = m20 * m31 - m21 * m30;
    const b07 = m20 * m32 - m22 * m30;
    const b08 = m20 * m33 - m23 * m30;
    const b09 = m21 * m32 - m22 * m31;
    const b10 = m21 * m33 - m23 * m31;
    const b11 = m22 * m33 - m23 * m32;

    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  }

  /** Flat 16-element column-major array copy. */
  toArray(): [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ] {
    return [...this.m] as [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ];
  }
}

// ─────────────────────────────────────────────
// Mesh types
// ─────────────────────────────────────────────

/** PBR material definition. All numeric values are in [0, 1] unless noted. */
export interface MaterialDef {
  /** Unique material name. */
  name: string;
  /** sRGB base color as [r, g, b] with components in [0, 1]. */
  color: [number, number, number];
  /** PBR metallic factor (0 = dielectric, 1 = metallic). */
  metallic?: number;
  /** PBR roughness factor (0 = mirror, 1 = fully rough). */
  roughness?: number;
  /** Emissive color contribution [r, g, b]. */
  emissive?: [number, number, number];
  /** Alpha opacity (1 = fully opaque). */
  opacity?: number;
}

/** Single mesh vertex with position, shading normal, and texture coordinates. */
export interface Vertex {
  position: Vec3;
  normal: Vec3;
  uv: [number, number];
}

/** Triangle face referencing vertex indices (counter-clockwise winding). */
export interface Face {
  /** Three vertex indices into a Mesh's vertices array. */
  indices: [number, number, number];
  /** Optional pre-computed face normal (for flat shading). */
  normal?: Vec3;
}

/** Complete indexed triangle mesh. */
export interface Mesh {
  name: string;
  vertices: Vertex[];
  faces: Face[];
  material?: MaterialDef;
}

// ─────────────────────────────────────────────
// MeshGenerator
// ─────────────────────────────────────────────

/** Procedural mesh generation driven by optional deterministic RNG. */
export class MeshGenerator {
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('mesh-generator-default');
  }

  /**
   * Axis-aligned box centred at origin.
   * @param w Width along X.
   * @param h Height along Y.
   * @param d Depth along Z.
   */
  generateBox(w: number, h: number, d: number): Mesh {
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;

    const vertices: Vertex[] = [
      // +X face (right)
      { position: new Vec3( hw, -hh, -hd), normal: new Vec3(1, 0, 0), uv: [0, 0] },
      { position: new Vec3( hw,  hh, -hd), normal: new Vec3(1, 0, 0), uv: [0, 1] },
      { position: new Vec3( hw,  hh,  hd), normal: new Vec3(1, 0, 0), uv: [1, 1] },
      { position: new Vec3( hw, -hh,  hd), normal: new Vec3(1, 0, 0), uv: [1, 0] },
      // -X face (left)
      { position: new Vec3(-hw, -hh,  hd), normal: new Vec3(-1, 0, 0), uv: [0, 0] },
      { position: new Vec3(-hw,  hh,  hd), normal: new Vec3(-1, 0, 0), uv: [0, 1] },
      { position: new Vec3(-hw,  hh, -hd), normal: new Vec3(-1, 0, 0), uv: [1, 1] },
      { position: new Vec3(-hw, -hh, -hd), normal: new Vec3(-1, 0, 0), uv: [1, 0] },
      // +Y face (top)
      { position: new Vec3(-hw,  hh, -hd), normal: new Vec3(0, 1, 0), uv: [0, 0] },
      { position: new Vec3(-hw,  hh,  hd), normal: new Vec3(0, 1, 0), uv: [0, 1] },
      { position: new Vec3( hw,  hh,  hd), normal: new Vec3(0, 1, 0), uv: [1, 1] },
      { position: new Vec3( hw,  hh, -hd), normal: new Vec3(0, 1, 0), uv: [1, 0] },
      // -Y face (bottom)
      { position: new Vec3(-hw, -hh,  hd), normal: new Vec3(0, -1, 0), uv: [0, 0] },
      { position: new Vec3(-hw, -hh, -hd), normal: new Vec3(0, -1, 0), uv: [0, 1] },
      { position: new Vec3( hw, -hh, -hd), normal: new Vec3(0, -1, 0), uv: [1, 1] },
      { position: new Vec3( hw, -hh,  hd), normal: new Vec3(0, -1, 0), uv: [1, 0] },
      // +Z face (front)
      { position: new Vec3(-hw, -hh,  hd), normal: new Vec3(0, 0, 1), uv: [0, 0] },
      { position: new Vec3( hw, -hh,  hd), normal: new Vec3(0, 0, 1), uv: [1, 0] },
      { position: new Vec3( hw,  hh,  hd), normal: new Vec3(0, 0, 1), uv: [1, 1] },
      { position: new Vec3(-hw,  hh,  hd), normal: new Vec3(0, 0, 1), uv: [0, 1] },
      // -Z face (back)
      { position: new Vec3( hw, -hh, -hd), normal: new Vec3(0, 0, -1), uv: [0, 0] },
      { position: new Vec3(-hw, -hh, -hd), normal: new Vec3(0, 0, -1), uv: [1, 0] },
      { position: new Vec3(-hw,  hh, -hd), normal: new Vec3(0, 0, -1), uv: [1, 1] },
      { position: new Vec3( hw,  hh, -hd), normal: new Vec3(0, 0, -1), uv: [0, 1] },
    ];

    const faces: Face[] = [];
    for (let f = 0; f < 6; f++) {
      const base = f * 4;
      faces.push({ indices: [base, base + 1, base + 2] });
      faces.push({ indices: [base, base + 2, base + 3] });
    }

    return { name: 'box', vertices, faces };
  }

  /**
   * UV sphere centred at origin.
   * @param r Radius.
   * @param segs Longitude segments (minimum 3).
   * @param rings Latitude rings (minimum 2).
   */
  generateSphere(r: number, segs: number = 16, rings: number = 12): Mesh {
    const segments = Math.max(3, segs);
    const latRings = Math.max(2, rings);
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    for (let lat = 0; lat <= latRings; lat++) {
      const theta = (lat / latRings) * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= segments; lon++) {
        const phi = (lon / segments) * 2 * Math.PI;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const nx = cosPhi * sinTheta;
        const ny = cosTheta;
        const nz = sinPhi * sinTheta;

        vertices.push({
          position: new Vec3(r * nx, r * ny, r * nz),
          normal: new Vec3(nx, ny, nz),
          uv: [lon / segments, lat / latRings],
        });
      }
    }

    for (let lat = 0; lat < latRings; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const first = lat * (segments + 1) + lon;
        const second = first + segments + 1;
        faces.push({ indices: [first, second, first + 1] });
        faces.push({ indices: [second, second + 1, first + 1] });
      }
    }

    return { name: 'sphere', vertices, faces };
  }

  /**
   * Cylinder aligned on the Y axis, centred at origin.
   * @param rTop Top cap radius.
   * @param rBot Bottom cap radius.
   * @param h Total height.
   * @param segs Number of radial segments (minimum 3).
   */
  generateCylinder(rTop: number, rBot: number, h: number, segs: number = 16): Mesh {
    const segments = Math.max(3, segs);
    const hh = h / 2;
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    // Side vertices (two rings)
    for (let ring = 0; ring <= 1; ring++) {
      const radius = ring === 0 ? rBot : rTop;
      const y = ring === 0 ? -hh : hh;

      for (let s = 0; s <= segments; s++) {
        const phi = (s / segments) * 2 * Math.PI;
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        // Slope normal for tapered cylinders
        const slopeLen = Math.sqrt((rBot - rTop) * (rBot - rTop) + h * h);
        const nx = cosPhi * (h / slopeLen);
        const ny = (rBot - rTop) / slopeLen;
        const nz = sinPhi * (h / slopeLen);

        vertices.push({
          position: new Vec3(radius * cosPhi, y, radius * sinPhi),
          normal: new Vec3(nx, ny, nz).normalize(),
          uv: [s / segments, ring],
        });
      }
    }

    // Side faces
    for (let s = 0; s < segments; s++) {
      const bot0 = s;
      const bot1 = s + 1;
      const top0 = segments + 1 + s;
      const top1 = segments + 1 + s + 1;
      faces.push({ indices: [bot0, top0, bot1] });
      faces.push({ indices: [bot1, top0, top1] });
    }

    // Cap centres
    const botCentreIdx = vertices.length;
    vertices.push({
      position: new Vec3(0, -hh, 0),
      normal: new Vec3(0, -1, 0),
      uv: [0.5, 0.5],
    });
    const topCentreIdx = vertices.length;
    vertices.push({
      position: new Vec3(0, hh, 0),
      normal: new Vec3(0, 1, 0),
      uv: [0.5, 0.5],
    });

    // Cap rim vertices
    const botRimStart = vertices.length;
    for (let s = 0; s <= segments; s++) {
      const phi = (s / segments) * 2 * Math.PI;
      vertices.push({
        position: new Vec3(rBot * Math.cos(phi), -hh, rBot * Math.sin(phi)),
        normal: new Vec3(0, -1, 0),
        uv: [0.5 + 0.5 * Math.cos(phi), 0.5 + 0.5 * Math.sin(phi)],
      });
    }
    const topRimStart = vertices.length;
    for (let s = 0; s <= segments; s++) {
      const phi = (s / segments) * 2 * Math.PI;
      vertices.push({
        position: new Vec3(rTop * Math.cos(phi), hh, rTop * Math.sin(phi)),
        normal: new Vec3(0, 1, 0),
        uv: [0.5 + 0.5 * Math.cos(phi), 0.5 + 0.5 * Math.sin(phi)],
      });
    }

    // Cap faces
    for (let s = 0; s < segments; s++) {
      faces.push({ indices: [botCentreIdx, botRimStart + s + 1, botRimStart + s] });
      faces.push({ indices: [topCentreIdx, topRimStart + s, topRimStart + s + 1] });
    }

    return { name: 'cylinder', vertices, faces };
  }

  /**
   * Flat subdivided plane in the XZ plane, centred at origin.
   * @param w Width along X.
   * @param h Depth along Z.
   * @param segsW Subdivisions along X (minimum 1).
   * @param segsH Subdivisions along Z (minimum 1).
   */
  generatePlane(w: number, h: number, segsW: number = 1, segsH: number = 1): Mesh {
    const sw = Math.max(1, segsW);
    const sh = Math.max(1, segsH);
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    for (let iz = 0; iz <= sh; iz++) {
      for (let ix = 0; ix <= sw; ix++) {
        const x = (ix / sw - 0.5) * w;
        const z = (iz / sh - 0.5) * h;
        vertices.push({
          position: new Vec3(x, 0, z),
          normal: new Vec3(0, 1, 0),
          uv: [ix / sw, iz / sh],
        });
      }
    }

    for (let iz = 0; iz < sh; iz++) {
      for (let ix = 0; ix < sw; ix++) {
        const tl = iz * (sw + 1) + ix;
        const tr = tl + 1;
        const bl = tl + sw + 1;
        const br = bl + 1;
        faces.push({ indices: [tl, bl, tr] });
        faces.push({ indices: [tr, bl, br] });
      }
    }

    return { name: 'plane', vertices, faces };
  }

  /**
   * Generate a mesh deterministically from a UniversalSeed.
   * Reads scalar genes to drive box/sphere/cylinder dimensions.
   */
  generateFromSeed(seed: UniversalSeed): Mesh {
    const rng = new DeterministicRNG(seed.$hash);
    const shapes = ['box', 'sphere', 'cylinder', 'plane'] as const;
    const shape = shapes[rng.nextInt(0, shapes.length)] ?? 'box';

    const s1 = 0.5 + rng.next() * 2.5;
    const s2 = 0.5 + rng.next() * 2.5;
    const s3 = 0.5 + rng.next() * 2.5;

    let mesh: Mesh;
    if (shape === 'sphere') {
      mesh = this.generateSphere(s1, 12 + rng.nextInt(0, 8), 8 + rng.nextInt(0, 6));
    } else if (shape === 'cylinder') {
      mesh = this.generateCylinder(s1, s2, s3, 10 + rng.nextInt(0, 8));
    } else if (shape === 'plane') {
      mesh = this.generatePlane(s1 * 2, s2 * 2, 1 + rng.nextInt(0, 4), 1 + rng.nextInt(0, 4));
    } else {
      mesh = this.generateBox(s1, s2, s3);
    }

    const color: [number, number, number] = [rng.next(), rng.next(), rng.next()];
    mesh.material = {
      name: `mat_${seed.$name}`,
      color,
      roughness: 0.3 + rng.next() * 0.7,
      metallic: rng.next() > 0.7 ? rng.next() : 0,
    };
    mesh.name = `mesh_${seed.$name}`;
    return mesh;
  }
}

// ─────────────────────────────────────────────
// Skeleton types
// ─────────────────────────────────────────────

/** Single joint in a hierarchical skeleton. */
export interface Bone {
  /** Unique bone name. */
  name: string;
  /** Local rest position relative to parent (or world origin for root). */
  position: Vec3;
  /** Local rest rotation in Euler angles (radians) XYZ order. */
  rotation: Vec3;
  /** Index of parent bone, or -1 for root. */
  parentIndex: number;
}

/** Named collection of bones forming an articulated rig. */
export interface Skeleton {
  name: string;
  bones: Bone[];
}

/** Procedural skeleton generation for humanoid and quadruped characters. */
export class SkeletonGenerator {
  /**
   * Generate a standard 15-bone humanoid skeleton (T-pose, Y-up).
   * Hierarchy: root → spine → chest → neck → head,
   * shoulders → upper arms → forearms → hands,
   * hips → thighs → shins → feet.
   */
  generateHumanoid(): Skeleton {
    const bones: Bone[] = [
      // 0 root
      { name: 'root',          position: new Vec3(0,    0,    0),    rotation: Vec3.zero(), parentIndex: -1 },
      // 1 spine
      { name: 'spine',         position: new Vec3(0,    0.15, 0),    rotation: Vec3.zero(), parentIndex: 0 },
      // 2 chest
      { name: 'chest',         position: new Vec3(0,    0.25, 0),    rotation: Vec3.zero(), parentIndex: 1 },
      // 3 neck
      { name: 'neck',          position: new Vec3(0,    0.20, 0),    rotation: Vec3.zero(), parentIndex: 2 },
      // 4 head
      { name: 'head',          position: new Vec3(0,    0.12, 0),    rotation: Vec3.zero(), parentIndex: 3 },
      // 5 shoulder.L
      { name: 'shoulder.L',    position: new Vec3(-0.15, 0.18, 0),   rotation: Vec3.zero(), parentIndex: 2 },
      // 6 upper_arm.L
      { name: 'upper_arm.L',   position: new Vec3(-0.10, 0,    0),   rotation: Vec3.zero(), parentIndex: 5 },
      // 7 forearm.L
      { name: 'forearm.L',     position: new Vec3(-0.25, 0,    0),   rotation: Vec3.zero(), parentIndex: 6 },
      // 8 hand.L
      { name: 'hand.L',        position: new Vec3(-0.22, 0,    0),   rotation: Vec3.zero(), parentIndex: 7 },
      // 9 shoulder.R
      { name: 'shoulder.R',    position: new Vec3( 0.15, 0.18, 0),   rotation: Vec3.zero(), parentIndex: 2 },
      // 10 upper_arm.R
      { name: 'upper_arm.R',   position: new Vec3( 0.10, 0,    0),   rotation: Vec3.zero(), parentIndex: 9 },
      // 11 forearm.R
      { name: 'forearm.R',     position: new Vec3( 0.25, 0,    0),   rotation: Vec3.zero(), parentIndex: 10 },
      // 12 hand.R
      { name: 'hand.R',        position: new Vec3( 0.22, 0,    0),   rotation: Vec3.zero(), parentIndex: 11 },
      // 13 thigh.L
      { name: 'thigh.L',       position: new Vec3(-0.10, -0.10, 0),  rotation: Vec3.zero(), parentIndex: 0 },
      // 14 shin.L
      { name: 'shin.L',        position: new Vec3(0,    -0.40, 0),   rotation: Vec3.zero(), parentIndex: 13 },
      // 15 foot.L  — index intentionally at 15 for 16-bone count starts here but we stop at 14
    ];

    // Add right leg and feet to reach ~15 relevant bones
    bones.push(
      { name: 'foot.L',  position: new Vec3(0, -0.38, 0.05), rotation: Vec3.zero(), parentIndex: 14 },
    );
    bones.push(
      { name: 'thigh.R', position: new Vec3(0.10, -0.10, 0),  rotation: Vec3.zero(), parentIndex: 0 },
    );
    bones.push(
      { name: 'shin.R',  position: new Vec3(0, -0.40, 0),     rotation: Vec3.zero(), parentIndex: 16 },
    );
    bones.push(
      { name: 'foot.R',  position: new Vec3(0, -0.38, 0.05),  rotation: Vec3.zero(), parentIndex: 17 },
    );

    return { name: 'humanoid', bones };
  }

  /**
   * Generate a standard 13-bone quadruped skeleton (rest pose, Y-up).
   * Hierarchy: root → pelvis → spine[0-1] → neck → head,
   * hip.L/R → upper_leg.L/R → lower_leg.L/R → foot.L/R.
   */
  generateQuadruped(): Skeleton {
    const bones: Bone[] = [
      // 0 root
      { name: 'root',         position: new Vec3(0,    0,     0),    rotation: Vec3.zero(), parentIndex: -1 },
      // 1 pelvis
      { name: 'pelvis',       position: new Vec3(0,    0.55,  0),    rotation: Vec3.zero(), parentIndex: 0 },
      // 2 spine
      { name: 'spine',        position: new Vec3(0,    0.05,  -0.20), rotation: Vec3.zero(), parentIndex: 1 },
      // 3 spine1
      { name: 'spine1',       position: new Vec3(0,    0.05,  -0.20), rotation: Vec3.zero(), parentIndex: 2 },
      // 4 neck
      { name: 'neck',         position: new Vec3(0,    0.10,  -0.15), rotation: Vec3.zero(), parentIndex: 3 },
      // 5 head
      { name: 'head',         position: new Vec3(0,    0.08,  -0.15), rotation: Vec3.zero(), parentIndex: 4 },
      // 6 hip.L
      { name: 'hip.L',        position: new Vec3(-0.10, 0, 0.15),    rotation: Vec3.zero(), parentIndex: 1 },
      // 7 upper_leg.L
      { name: 'upper_leg.L',  position: new Vec3(0, -0.25, 0),       rotation: Vec3.zero(), parentIndex: 6 },
      // 8 lower_leg.L
      { name: 'lower_leg.L',  position: new Vec3(0, -0.28, 0),       rotation: Vec3.zero(), parentIndex: 7 },
      // 9 hip.R
      { name: 'hip.R',        position: new Vec3( 0.10, 0, 0.15),    rotation: Vec3.zero(), parentIndex: 1 },
      // 10 upper_leg.R
      { name: 'upper_leg.R',  position: new Vec3(0, -0.25, 0),       rotation: Vec3.zero(), parentIndex: 9 },
      // 11 lower_leg.R
      { name: 'lower_leg.R',  position: new Vec3(0, -0.28, 0),       rotation: Vec3.zero(), parentIndex: 10 },
      // 12 tail
      { name: 'tail',         position: new Vec3(0, 0, 0.30),        rotation: Vec3.zero(), parentIndex: 1 },
    ];

    return { name: 'quadruped', bones };
  }

  /**
   * Generate a skeleton deterministically from a UniversalSeed.
   * Uses seed domain to pick rig type; adds random procedural scale.
   */
  generateFromSeed(seed: UniversalSeed): Skeleton {
    const rng = new DeterministicRNG(seed.$hash);
    const useQuad = seed.$domain === 'mammal' || rng.next() > 0.6;
    const base = useQuad ? this.generateQuadruped() : this.generateHumanoid();

    const scaleY = 0.8 + rng.next() * 0.5;
    const scaledBones: Bone[] = base.bones.map((bone) => ({
      ...bone,
      position: new Vec3(bone.position.x, bone.position.y * scaleY, bone.position.z),
    }));

    return { name: `skeleton_${seed.$name}`, bones: scaledBones };
  }

  /** Generate a winged skeleton (humanoid base + wing bones). */
  generateWinged(): Skeleton {
    const humanoid = this.generateHumanoid();
    const chestIndex = humanoid.bones.findIndex((b) => b.name === 'chest');
    const ci = chestIndex >= 0 ? chestIndex : 2;

    const wingBones: Bone[] = [
      { name: 'wing_root.L',  position: new Vec3(-0.12, 0.15, 0.08), rotation: Vec3.zero(), parentIndex: ci },
      { name: 'wing_mid.L',   position: new Vec3(-0.30, 0.10, 0.15), rotation: Vec3.zero(), parentIndex: humanoid.bones.length },
      { name: 'wing_tip.L',   position: new Vec3(-0.35, 0.05, 0.20), rotation: Vec3.zero(), parentIndex: humanoid.bones.length + 1 },
      { name: 'wing_root.R',  position: new Vec3( 0.12, 0.15, 0.08), rotation: Vec3.zero(), parentIndex: ci },
      { name: 'wing_mid.R',   position: new Vec3( 0.30, 0.10, 0.15), rotation: Vec3.zero(), parentIndex: humanoid.bones.length + 3 },
      { name: 'wing_tip.R',   position: new Vec3( 0.35, 0.05, 0.20), rotation: Vec3.zero(), parentIndex: humanoid.bones.length + 4 },
      // Tail
      { name: 'tail_base',    position: new Vec3(0, -0.05, 0.10), rotation: Vec3.zero(), parentIndex: 0 },
      { name: 'tail_mid',     position: new Vec3(0, -0.02, 0.20), rotation: Vec3.zero(), parentIndex: humanoid.bones.length + 6 },
      { name: 'tail_tip',     position: new Vec3(0,  0.00, 0.25), rotation: Vec3.zero(), parentIndex: humanoid.bones.length + 7 },
    ];

    return { name: 'winged', bones: [...humanoid.bones, ...wingBones] };
  }

  /** Generate a serpentine skeleton (spine chain with no limbs). */
  generateSerpentine(): Skeleton {
    const segmentCount = 10;
    const bones: Bone[] = [
      { name: 'root', position: new Vec3(0, 0, 0), rotation: Vec3.zero(), parentIndex: -1 },
    ];
    for (let i = 0; i < segmentCount; i++) {
      bones.push({
        name: `spine_${i}`,
        position: new Vec3(0, 0, -0.15),
        rotation: Vec3.zero(),
        parentIndex: i,
      });
    }
    // Head at the end
    bones.push({
      name: 'head',
      position: new Vec3(0, 0.05, -0.12),
      rotation: Vec3.zero(),
      parentIndex: segmentCount,
    });
    return { name: 'serpentine', bones };
  }

  /** Generate skeleton from BodyStructure type. */
  generateFromBodyStructure(body: string): Skeleton {
    switch (body) {
      case 'humanoid': return this.generateHumanoid();
      case 'quadruped': return this.generateQuadruped();
      case 'winged': return this.generateWinged();
      case 'serpentine': return this.generateSerpentine();
      case 'mechanical': return this.generateHumanoid(); // mechanical uses humanoid base
      case 'multi_limbed': return this.generateHumanoid(); // start with humanoid, extend later
      case 'floating': return this.generateHumanoid(); // ghostly humanoid
      case 'amorphous': {
        // Minimal skeleton: root + 4 control points
        return {
          name: 'amorphous',
          bones: [
            { name: 'root', position: new Vec3(0, 0, 0), rotation: Vec3.zero(), parentIndex: -1 },
            { name: 'top',  position: new Vec3(0, 0.3, 0), rotation: Vec3.zero(), parentIndex: 0 },
            { name: 'left', position: new Vec3(-0.2, 0, 0), rotation: Vec3.zero(), parentIndex: 0 },
            { name: 'right',position: new Vec3(0.2, 0, 0), rotation: Vec3.zero(), parentIndex: 0 },
            { name: 'front',position: new Vec3(0, 0, -0.2), rotation: Vec3.zero(), parentIndex: 0 },
          ],
        };
      }
      default: return this.generateHumanoid();
    }
  }
}

/**
 * Apply morphology proportions to a skeleton by scaling bone positions.
 * Head bones scale by headToBodyRatio, limb bones by limbToBodyRatio,
 * shoulder bones by shoulderToHipRatio. Exaggeration amplifies deviations.
 */
export function applyMorphologyToSkeleton(
  skeleton: Skeleton,
  proportions: { headToBodyRatio: number; limbToBodyRatio: number; shoulderToHipRatio: number },
  exaggeration: number,
): Skeleton {
  const headScale = 0.5 + proportions.headToBodyRatio * 2.0; // maps 0.13-0.55 → 0.76-1.6
  const limbScale = 0.5 + proportions.limbToBodyRatio;         // maps 0.3-0.75 → 0.8-1.25
  const shoulderScale = proportions.shoulderToHipRatio;

  const headBones = new Set(['head', 'neck']);
  const limbBones = new Set([
    'upper_arm.L', 'forearm.L', 'hand.L', 'upper_arm.R', 'forearm.R', 'hand.R',
    'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R',
    'upper_leg.L', 'lower_leg.L', 'upper_leg.R', 'lower_leg.R',
  ]);
  const shoulderBones = new Set(['shoulder.L', 'shoulder.R']);

  const scaledBones: Bone[] = skeleton.bones.map((bone) => {
    let sx = 1.0;
    let sy = 1.0;

    if (headBones.has(bone.name)) {
      const factor = 1.0 + (headScale - 1.0) * exaggeration;
      sx = factor;
      sy = factor;
    } else if (limbBones.has(bone.name)) {
      const factor = 1.0 + (limbScale - 1.0) * exaggeration;
      sy = factor;
    } else if (shoulderBones.has(bone.name)) {
      sx = 1.0 + (shoulderScale - 1.0) * exaggeration;
    }

    return {
      ...bone,
      position: new Vec3(bone.position.x * sx, bone.position.y * sy, bone.position.z),
    };
  });

  return { name: skeleton.name, bones: scaledBones };
}

// ─────────────────────────────────────────────
// Camera
// ─────────────────────────────────────────────

/** Full camera configuration for perspective or orthographic projection. */
export interface CameraConfig {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  /** Vertical field of view in radians (used for perspective mode). */
  fov: number;
  near: number;
  far: number;
  mode: 'perspective' | 'orthographic';
}

/** Preset camera configurations for common game and 3D application views. */
export class CameraPresets {
  /**
   * Orbit camera positioned on a sphere around the origin.
   * @param dist Distance from origin.
   * @param elevation Elevation angle in radians above the XZ plane.
   * @param azimuth Horizontal angle in radians from the +Z axis.
   */
  static orbit(dist: number, elevation: number, azimuth: number): CameraConfig {
    const cosElev = Math.cos(elevation);
    const x = dist * cosElev * Math.sin(azimuth);
    const y = dist * Math.sin(elevation);
    const z = dist * cosElev * Math.cos(azimuth);
    return {
      position: new Vec3(x, y, z),
      target: Vec3.zero(),
      up: Vec3.up(),
      fov: Math.PI / 4,
      near: 0.1,
      far: 1000,
      mode: 'perspective',
    };
  }

  /**
   * Top-down orthographic camera looking straight down.
   * @param h Height above the XZ plane.
   */
  static topDown(h: number): CameraConfig {
    return {
      position: new Vec3(0, h, 0),
      target: Vec3.zero(),
      up: new Vec3(0, 0, -1),
      fov: Math.PI / 4,
      near: 0.1,
      far: h * 2,
      mode: 'orthographic',
    };
  }

  /** Classic isometric view at 45° azimuth and ~35.26° elevation. */
  static isometric(): CameraConfig {
    return CameraPresets.orbit(20, Math.atan(1 / Math.sqrt(2)), Math.PI / 4);
  }

  /**
   * First-person perspective camera.
   * @param pos Eye position in world space.
   * @param dir Forward direction vector (will be normalised).
   */
  static firstPerson(pos: Vec3, dir: Vec3): CameraConfig {
    return {
      position: pos,
      target: pos.add(dir.normalize()),
      up: Vec3.up(),
      fov: (75 * Math.PI) / 180,
      near: 0.05,
      far: 500,
      mode: 'perspective',
    };
  }

  /** Deterministic camera preset derived from a UniversalSeed hash. */
  static forSeed(seed: UniversalSeed): CameraConfig {
    const rng = new DeterministicRNG(seed.$hash + ':camera');
    const dist = 5 + rng.next() * 15;
    const elev = 0.1 + rng.next() * 0.9;
    const azim = rng.next() * Math.PI * 2;
    return CameraPresets.orbit(dist, elev, azim);
  }
}

// ─────────────────────────────────────────────
// Scene Graph
// ─────────────────────────────────────────────

/** Single node in a hierarchical 3D scene graph. */
export interface SceneNode {
  /** Unique string identifier. */
  id: string;
  name: string;
  /** Optional mesh payload attached to this node. */
  mesh?: Mesh;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  children: SceneNode[];
  visible: boolean;
}

/** Mutable scene graph with add/remove/traverse operations. */
export class SceneGraph {
  /** Top-level nodes (roots without a parent). */
  nodes: SceneNode[] = [];

  /**
   * Add a node to the top-level or as a child of an existing node.
   * @param node The node to add.
   * @param parentId Optional parent node id. Appends to root list if omitted.
   */
  addNode(node: SceneNode, parentId?: string): void {
    if (parentId !== undefined) {
      const parent = this.findNode(parentId);
      if (parent !== undefined) {
        parent.children.push(node);
        return;
      }
    }
    this.nodes.push(node);
  }

  /**
   * Remove a node (and its subtree) by id.
   * @returns true if found and removed, false otherwise.
   */
  removeNode(id: string): boolean {
    const removeFrom = (list: SceneNode[]): boolean => {
      for (let i = 0; i < list.length; i++) {
        const node = list[i];
        if (node === undefined) continue;
        if (node.id === id) {
          list.splice(i, 1);
          return true;
        }
        if (removeFrom(node.children)) return true;
      }
      return false;
    };
    return removeFrom(this.nodes);
  }

  /**
   * Find a node by id, searching the entire tree depth-first.
   * @returns The found SceneNode or undefined.
   */
  findNode(id: string): SceneNode | undefined {
    const search = (list: SceneNode[]): SceneNode | undefined => {
      for (const node of list) {
        if (node.id === id) return node;
        const found = search(node.children);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    return search(this.nodes);
  }

  /**
   * Depth-first traversal of every node in the graph.
   * @param callback Called with each node and its depth level.
   */
  traverse(callback: (node: SceneNode, depth: number) => void): void {
    const visit = (node: SceneNode, depth: number): void => {
      callback(node, depth);
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    };
    for (const root of this.nodes) {
      visit(root, 0);
    }
  }
}

// ─────────────────────────────────────────────
// glTF 2.0 Exporter
// ─────────────────────────────────────────────

/**
 * Internal glTF 2.0 JSON structure.
 * Only the subset needed for mesh export is typed here.
 */
interface GLTFJson {
  asset: { version: string; generator: string };
  scenes: Array<{ name: string; nodes: number[] }>;
  nodes: Array<{ name: string; mesh?: number; translation?: [number, number, number]; rotation?: [number, number, number, number]; scale?: [number, number, number]; children?: number[] }>;
  meshes: Array<{ name: string; primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number }> }>;
  materials: Array<{ name: string; pbrMetallicRoughness: { baseColorFactor: [number, number, number, number]; metallicFactor: number; roughnessFactor: number }; emissiveFactor?: [number, number, number]; alphaMode?: string }>;
  accessors: Array<{ bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }>;
  bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number; target?: number }>;
  buffers: Array<{ byteLength: number; uri: string }>;
}

/** Exports a SceneGraph to a valid glTF 2.0 JSON string with embedded base64 buffers. */
export class GLTFExporter {
  /**
   * Serialize the scene graph to a glTF 2.0 JSON string.
   * All geometry is embedded as base64-encoded data URIs.
   */
  export(scene: SceneGraph): string {
    const gltf: GLTFJson = {
      asset: { version: '2.0', generator: '@paradigm/3d' },
      scenes: [{ name: 'Scene', nodes: [] }],
      nodes: [],
      meshes: [],
      materials: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };

    const byteChunks: Uint8Array[] = [];
    let byteOffset = 0;

    const addBufferView = (data: Uint8Array, target?: number): number => {
      const viewIndex = gltf.bufferViews.length;
      gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength, ...(target !== undefined ? { target } : {}) });
      byteChunks.push(data);
      byteOffset += data.byteLength;
      return viewIndex;
    };

    const meshIndexMap = new Map<Mesh, number>();

    const processMesh = (mesh: Mesh): number => {
      const existing = meshIndexMap.get(mesh);
      if (existing !== undefined) return existing;

      // --- positions ---
      const posData = new Float32Array(mesh.vertices.length * 3);
      let minPos = [Infinity, Infinity, Infinity];
      let maxPos = [-Infinity, -Infinity, -Infinity];
      mesh.vertices.forEach((v, i) => {
        posData[i * 3]     = v.position.x;
        posData[i * 3 + 1] = v.position.y;
        posData[i * 3 + 2] = v.position.z;
        minPos = [Math.min(minPos[0] ?? Infinity, v.position.x), Math.min(minPos[1] ?? Infinity, v.position.y), Math.min(minPos[2] ?? Infinity, v.position.z)];
        maxPos = [Math.max(maxPos[0] ?? -Infinity, v.position.x), Math.max(maxPos[1] ?? -Infinity, v.position.y), Math.max(maxPos[2] ?? -Infinity, v.position.z)];
      });
      const posView = addBufferView(new Uint8Array(posData.buffer), 34962);
      const posAccessor = gltf.accessors.length;
      gltf.accessors.push({ bufferView: posView, componentType: 5126, count: mesh.vertices.length, type: 'VEC3', min: minPos, max: maxPos });

      // --- normals ---
      const normData = new Float32Array(mesh.vertices.length * 3);
      mesh.vertices.forEach((v, i) => {
        normData[i * 3]     = v.normal.x;
        normData[i * 3 + 1] = v.normal.y;
        normData[i * 3 + 2] = v.normal.z;
      });
      const normView = addBufferView(new Uint8Array(normData.buffer), 34962);
      const normAccessor = gltf.accessors.length;
      gltf.accessors.push({ bufferView: normView, componentType: 5126, count: mesh.vertices.length, type: 'VEC3' });

      // --- UVs ---
      const uvData = new Float32Array(mesh.vertices.length * 2);
      mesh.vertices.forEach((v, i) => {
        uvData[i * 2]     = v.uv[0];
        uvData[i * 2 + 1] = v.uv[1];
      });
      const uvView = addBufferView(new Uint8Array(uvData.buffer), 34962);
      const uvAccessor = gltf.accessors.length;
      gltf.accessors.push({ bufferView: uvView, componentType: 5126, count: mesh.vertices.length, type: 'VEC2' });

      // --- indices ---
      const idxData = new Uint32Array(mesh.faces.length * 3);
      mesh.faces.forEach((f, i) => {
        idxData[i * 3]     = f.indices[0];
        idxData[i * 3 + 1] = f.indices[1];
        idxData[i * 3 + 2] = f.indices[2];
      });
      const idxView = addBufferView(new Uint8Array(idxData.buffer), 34963);
      const idxAccessor = gltf.accessors.length;
      gltf.accessors.push({ bufferView: idxView, componentType: 5125, count: mesh.faces.length * 3, type: 'SCALAR' });

      // --- material ---
      let matIndex: number | undefined;
      if (mesh.material !== undefined) {
        matIndex = gltf.materials.length;
        const mat = mesh.material;
        const [r, g, b] = mat.color;
        gltf.materials.push({
          name: mat.name,
          pbrMetallicRoughness: {
            baseColorFactor: [r ?? 0.8, g ?? 0.8, b ?? 0.8, mat.opacity ?? 1],
            metallicFactor: mat.metallic ?? 0,
            roughnessFactor: mat.roughness ?? 0.5,
          },
          ...(mat.emissive !== undefined ? { emissiveFactor: mat.emissive } : {}),
          ...(mat.opacity !== undefined && mat.opacity < 1 ? { alphaMode: 'BLEND' } : {}),
        });
      }

      const meshIndex = gltf.meshes.length;
      gltf.meshes.push({
        name: mesh.name,
        primitives: [{
          attributes: { POSITION: posAccessor, NORMAL: normAccessor, TEXCOORD_0: uvAccessor },
          indices: idxAccessor,
          ...(matIndex !== undefined ? { material: matIndex } : {}),
        }],
      });
      meshIndexMap.set(mesh, meshIndex);
      return meshIndex;
    };

    const nodeIndexMap = new Map<SceneNode, number>();

    const processNode = (sceneNode: SceneNode): number => {
      const nodeIdx = gltf.nodes.length;
      const entry: GLTFJson['nodes'][0] = {
        name: sceneNode.name,
        translation: sceneNode.position.toArray(),
        scale: sceneNode.scale.toArray(),
      };

      if (sceneNode.mesh !== undefined && sceneNode.visible) {
        entry.mesh = processMesh(sceneNode.mesh);
      }

      gltf.nodes.push(entry);
      nodeIndexMap.set(sceneNode, nodeIdx);

      if (sceneNode.children.length > 0) {
        const childIndices: number[] = sceneNode.children.map((child) => processNode(child));
        gltf.nodes[nodeIdx]!.children = childIndices;
      }

      return nodeIdx;
    };

    const sceneInstance = gltf.scenes[0];
    if (sceneInstance !== undefined) {
      for (const root of scene.nodes) {
        sceneInstance.nodes.push(processNode(root));
      }
    }

    // Assemble binary buffer
    const totalBytes = byteOffset;
    if (totalBytes > 0) {
      const combined = new Uint8Array(totalBytes);
      let off = 0;
      for (const chunk of byteChunks) {
        combined.set(chunk, off);
        off += chunk.byteLength;
      }
      const b64 = GLTFExporter.uint8ToBase64(combined);
      gltf.buffers.push({ byteLength: totalBytes, uri: `data:application/octet-stream;base64,${b64}` });
    }

    return JSON.stringify(gltf, null, 2);
  }

  /** Encode Uint8Array to base64 string without external dependencies. */
  private static uint8ToBase64(bytes: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
      const b0 = bytes[i] ?? 0;
      const b1 = bytes[i + 1] ?? 0;
      const b2 = bytes[i + 2] ?? 0;
      result += chars[b0 >> 2];
      result += chars[((b0 & 3) << 4) | (b1 >> 4)];
      result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      result += i + 2 < len ? chars[b2 & 63] : '=';
    }
    return result;
  }
}

// ─────────────────────────────────────────────
// SceneEngine
// ─────────────────────────────────────────────

/** High-level orchestrator composing mesh generation, skeleton rigs, camera, and export. */
export class SceneEngine {
  private readonly rng: DeterministicRNG;
  private readonly meshGen: MeshGenerator;
  private readonly skelGen: SkeletonGenerator;
  private readonly exporter: GLTFExporter;
  private nodeCounter: number = 0;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('scene-engine-default');
    this.meshGen = new MeshGenerator(this.rng.fork('mesh'));
    this.skelGen = new SkeletonGenerator();
    this.exporter = new GLTFExporter();
  }

  /** Create an empty scene graph ready for population. */
  createScene(): SceneGraph {
    return new SceneGraph();
  }

  /**
   * Add a seed's generated mesh as a scene node, with the seed name and position derived
   * from gene values when available.
   */
  addSeedToScene(scene: SceneGraph, seed: UniversalSeed): SceneNode {
    const mesh = this.generateMesh(seed);

    // Attempt to extract position from scalar genes if they exist
    const genes = seed.genes;
    const geneValues = Object.values(genes) as Gene[];
    const scalars = geneValues
      .filter((g): g is { type: 'scalar'; value: number; min: number; max: number } => g.type === 'scalar')
      .map((g) => g.value);

    const px = scalars[0] ?? 0;
    const py = scalars[1] ?? 0;
    const pz = scalars[2] ?? 0;

    const id = `node_${++this.nodeCounter}_${seed.$hash.slice(0, 6)}`;
    const node: SceneNode = {
      id,
      name: seed.$name,
      mesh,
      position: new Vec3(px, py, pz),
      rotation: Vec3.zero(),
      scale: Vec3.one(),
      children: [],
      visible: true,
    };

    scene.addNode(node);
    return node;
  }

  /**
   * Generate a mesh from a UniversalSeed using the internal MeshGenerator.
   */
  generateMesh(seed: UniversalSeed): Mesh {
    return this.meshGen.generateFromSeed(seed);
  }

  /**
   * Generate a skeleton from a UniversalSeed using the internal SkeletonGenerator.
   */
  generateSkeleton(seed: UniversalSeed): Skeleton {
    return this.skelGen.generateFromSeed(seed);
  }

  /**
   * Get a deterministic camera configuration for a given seed.
   */
  getCamera(seed: UniversalSeed): CameraConfig {
    return CameraPresets.forSeed(seed);
  }

  /**
   * Serialise the scene graph to a glTF 2.0 JSON string.
   */
  exportGLTF(scene: SceneGraph): string {
    return this.exporter.export(scene);
  }
}

// ═══════════════════════════════════════════════════════════════════
// v2: ANIMATION ENGINE — Disney Principles + Anime + Cartoon Physics
// ═══════════════════════════════════════════════════════════════════

/** A single keyframe in an animation track. */
export interface AnimKeyframe {
  readonly time: number;
  readonly value: number;
  readonly easing: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'bounce' | 'elastic';
}

/** An animation track controls a single property over time. */
export interface AnimTrack {
  readonly property: string;
  readonly keyframes: readonly AnimKeyframe[];
}

/** A complete animation clip with named tracks. */
export interface AnimClip {
  readonly name: string;
  readonly duration: number;
  readonly loop: boolean;
  readonly tracks: readonly AnimTrack[];
  readonly techniques: readonly string[];
}

/** Disney's 12 Principles with style-specific scaling. */
export interface DisneyPrinciples {
  readonly squashStretch: number;
  readonly anticipation: number;
  readonly staging: number;
  readonly followThrough: number;
  readonly easeInOut: number;
  readonly arcs: number;
  readonly secondaryAction: number;
  readonly timing: number;
  readonly exaggeration: number;
  readonly solidDrawing: number;
  readonly appeal: number;
}

/** Style-specific Disney principle presets. */
export function getDisneyPreset(style: string): DisneyPrinciples {
  switch (style) {
    case 'chibi':
      return { squashStretch: 2.0, anticipation: 1.5, staging: 1.0, followThrough: 1.5, easeInOut: 1.3, arcs: 1.2, secondaryAction: 1.5, timing: 1.3, exaggeration: 2.0, solidDrawing: 0.7, appeal: 1.5 };
    case 'shonen':
      return { squashStretch: 1.5, anticipation: 1.8, staging: 1.5, followThrough: 1.3, easeInOut: 1.2, arcs: 1.0, secondaryAction: 1.2, timing: 1.5, exaggeration: 1.5, solidDrawing: 1.0, appeal: 1.3 };
    case 'ufotable':
      return { squashStretch: 1.3, anticipation: 1.5, staging: 1.8, followThrough: 1.5, easeInOut: 1.5, arcs: 1.3, secondaryAction: 1.5, timing: 1.3, exaggeration: 1.3, solidDrawing: 1.2, appeal: 1.5 };
    case 'ghibli':
      return { squashStretch: 1.1, anticipation: 1.0, staging: 1.5, followThrough: 1.8, easeInOut: 1.5, arcs: 1.5, secondaryAction: 1.8, timing: 1.0, exaggeration: 1.1, solidDrawing: 1.3, appeal: 1.8 };
    case 'trigger':
      return { squashStretch: 1.8, anticipation: 2.0, staging: 1.5, followThrough: 1.0, easeInOut: 0.8, arcs: 0.8, secondaryAction: 1.0, timing: 2.0, exaggeration: 1.8, solidDrawing: 0.8, appeal: 1.5 };
    case 'looney_tunes':
    case 'cartoon':
      return { squashStretch: 2.0, anticipation: 2.0, staging: 1.3, followThrough: 2.0, easeInOut: 1.5, arcs: 1.3, secondaryAction: 2.0, timing: 1.5, exaggeration: 2.0, solidDrawing: 0.5, appeal: 1.8 };
    case 'realistic':
    case 'film_vfx':
      return { squashStretch: 1.05, anticipation: 1.0, staging: 1.0, followThrough: 1.0, easeInOut: 1.0, arcs: 1.0, secondaryAction: 1.0, timing: 1.0, exaggeration: 1.05, solidDrawing: 1.0, appeal: 1.0 };
    case 'pixel':
      return { squashStretch: 1.0, anticipation: 0.8, staging: 1.0, followThrough: 0.5, easeInOut: 0.5, arcs: 0.5, secondaryAction: 0.5, timing: 0.8, exaggeration: 1.0, solidDrawing: 0.5, appeal: 1.0 };
    default:
      return { squashStretch: 1.2, anticipation: 1.2, staging: 1.0, followThrough: 1.0, easeInOut: 1.0, arcs: 1.0, secondaryAction: 1.0, timing: 1.0, exaggeration: 1.2, solidDrawing: 1.0, appeal: 1.0 };
  }
}

/** Anime-specific animation techniques. */
export interface AnimeTechniques {
  readonly speedLines: boolean;
  readonly impactFrames: boolean;
  readonly smearFrames: boolean;
  readonly sakugaBursts: boolean;
  readonly limitedAnimation: boolean;
  readonly powerUpSequence: boolean;
  readonly screenFlash: boolean;
  readonly backgroundBlur: boolean;
}

export function getAnimeTechniques(style: string): AnimeTechniques {
  const base = { speedLines: false, impactFrames: false, smearFrames: false, sakugaBursts: false, limitedAnimation: false, powerUpSequence: false, screenFlash: false, backgroundBlur: false };
  switch (style) {
    case 'shonen':
      return { ...base, speedLines: true, impactFrames: true, smearFrames: true, sakugaBursts: true, powerUpSequence: true, screenFlash: true, backgroundBlur: true };
    case 'ufotable':
      return { ...base, speedLines: true, impactFrames: true, smearFrames: true, sakugaBursts: true, powerUpSequence: true, screenFlash: true, backgroundBlur: true };
    case 'trigger':
      return { ...base, speedLines: true, impactFrames: true, smearFrames: true, sakugaBursts: true, screenFlash: true };
    case 'seinen':
      return { ...base, impactFrames: true, limitedAnimation: true };
    case 'ghibli':
      return { ...base }; // Ghibli relies on fluid drawing, not anime shortcuts
    case 'kyoani':
      return { ...base, limitedAnimation: true }; // Subtle, not flashy
    default:
      return base;
  }
}

/** Cartoon physics rules. */
export interface CartoonPhysics {
  readonly gravityDelay: boolean;
  readonly hammerspace: boolean;
  readonly toonForceScaling: boolean;
  readonly elasticRecovery: boolean;
  readonly bodyPartIndependence: boolean;
  readonly delayedReaction: boolean;
}

export function getCartoonPhysics(style: string): CartoonPhysics {
  const none = { gravityDelay: false, hammerspace: false, toonForceScaling: false, elasticRecovery: false, bodyPartIndependence: false, delayedReaction: false };
  if (['looney_tunes', 'cartoon', 'cn_flat'].includes(style)) {
    return { gravityDelay: true, hammerspace: true, toonForceScaling: true, elasticRecovery: true, bodyPartIndependence: true, delayedReaction: true };
  }
  if (['chibi', 'disney_2d'].includes(style)) {
    return { ...none, elasticRecovery: true, toonForceScaling: true };
  }
  return none;
}

/** VFX layer configuration for an entity. */
export interface VFXStack {
  readonly environmentReaction: boolean;
  readonly aura: { readonly enabled: boolean; readonly color: string; readonly intensity: number };
  readonly particles: { readonly enabled: boolean; readonly type: string; readonly count: number };
  readonly abilityVisuals: boolean;
  readonly screenEffects: readonly string[];
  readonly cinematicCamera: boolean;
}

export function buildVFXStack(element: string, style: string, hasTransforms: boolean): VFXStack {
  const particleTypes: Record<string, string> = {
    fire: 'ember', ice: 'snowflake', lightning: 'spark', nature: 'leaf',
    water: 'bubble', dark: 'shadow_wisp', light: 'light_mote', cosmic: 'star',
    poison: 'miasma', wind: 'dust', earth: 'pebble',
  };

  const auraColors: Record<string, string> = {
    fire: '#FF4400', ice: '#88CCFF', lightning: '#FFFF00', nature: '#22AA22',
    water: '#0066CC', dark: '#440066', light: '#FFD700', cosmic: '#AA00FF',
    poison: '#44FF00', wind: '#CCDDFF', earth: '#886633',
  };

  return {
    environmentReaction: !['pixel', 'minimal'].includes(style),
    aura: {
      enabled: element !== 'none',
      color: auraColors[element] ?? '#FFFFFF',
      intensity: hasTransforms ? 0.8 : 0.4,
    },
    particles: {
      enabled: element !== 'none',
      type: particleTypes[element] ?? 'generic',
      count: style === 'realistic' ? 200 : style === 'pixel' ? 10 : 50,
    },
    abilityVisuals: true,
    screenEffects: hasTransforms ? ['screen_shake', 'flash_white', 'radial_blur'] : [],
    cinematicCamera: hasTransforms,
  };
}

/** FABRIK IK solver — Forward And Backward Reaching Inverse Kinematics. */
export class FABRIKSolver {
  private readonly tolerance: number;
  private readonly maxIterations: number;

  constructor(tolerance: number = 0.001, maxIterations: number = 10) {
    this.tolerance = tolerance;
    this.maxIterations = maxIterations;
  }

  /** Solve IK for a chain of joint positions to reach a target. */
  solve(joints: Vec3[], target: Vec3): Vec3[] {
    const n = joints.length;
    if (n < 2) return joints;

    const result = joints.map(j => new Vec3(j.x, j.y, j.z));
    const lengths: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      lengths.push(result[i]!.sub(result[i + 1]!).length());
    }

    const origin = new Vec3(result[0]!.x, result[0]!.y, result[0]!.z);
    const totalLength = lengths.reduce((a, b) => a + b, 0);
    const distToTarget = origin.sub(target).length();

    // If target is unreachable, stretch toward it
    if (distToTarget > totalLength) {
      for (let i = 0; i < n - 1; i++) {
        const dir = target.sub(result[i]!).normalize();
        result[i + 1] = result[i]!.add(dir.scale(lengths[i]!));
      }
      return result;
    }

    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Check convergence
      if (result[n - 1]!.sub(target).length() < this.tolerance) break;

      // Forward pass: end effector to target
      result[n - 1] = target;
      for (let i = n - 2; i >= 0; i--) {
        const dir = result[i]!.sub(result[i + 1]!).normalize();
        result[i] = result[i + 1]!.add(dir.scale(lengths[i]!));
      }

      // Backward pass: root to origin
      result[0] = origin;
      for (let i = 0; i < n - 1; i++) {
        const dir = result[i + 1]!.sub(result[i]!).normalize();
        result[i + 1] = result[i]!.add(dir.scale(lengths[i]!));
      }
    }

    return result;
  }
}

/** Animation state machine — manages transitions between animation clips. */
export interface AnimState {
  readonly name: string;
  readonly clip: string;
  readonly transitions: readonly AnimTransition[];
}

export interface AnimTransition {
  readonly target: string;
  readonly condition: string;
  readonly blendDuration: number;
}

export class AnimationStateMachine {
  private readonly states: Map<string, AnimState> = new Map();
  private currentState: string;

  constructor(initialState: string) {
    this.currentState = initialState;
  }

  addState(state: AnimState): void {
    this.states.set(state.name, state);
  }

  getCurrentState(): string {
    return this.currentState;
  }

  getCurrentClip(): string | undefined {
    return this.states.get(this.currentState)?.clip;
  }

  /** Attempt a transition based on a triggered condition. Returns true if transitioned. */
  trigger(condition: string): boolean {
    const state = this.states.get(this.currentState);
    if (!state) return false;

    const transition = state.transitions.find(t => t.condition === condition);
    if (!transition) return false;
    if (!this.states.has(transition.target)) return false;

    this.currentState = transition.target;
    return true;
  }

  /** Get available transitions from current state. */
  availableTransitions(): readonly AnimTransition[] {
    return this.states.get(this.currentState)?.transitions ?? [];
  }
}

/** Build a standard entity animation state machine from archetype + body structure. */
export function buildEntityStateMachine(archetype: string, bodyStructure: string): AnimationStateMachine {
  const sm = new AnimationStateMachine('idle');

  const canFly = bodyStructure === 'winged' || bodyStructure === 'floating';
  const isQuadruped = bodyStructure === 'quadruped' || bodyStructure === 'serpentine';
  const isCombat = ['warrior', 'mage', 'archer', 'rogue', 'knight', 'berserker', 'paladin', 'monk', 'dragon_archetype'].includes(archetype);

  sm.addState({
    name: 'idle',
    clip: 'idle',
    transitions: [
      { target: 'walk', condition: 'move', blendDuration: 0.2 },
      ...(isCombat ? [{ target: 'attack', condition: 'attack', blendDuration: 0.1 }] : []),
      ...(canFly ? [{ target: 'fly', condition: 'fly', blendDuration: 0.3 }] : []),
      { target: 'hurt', condition: 'damage', blendDuration: 0.05 },
    ],
  });

  sm.addState({
    name: 'walk',
    clip: isQuadruped ? 'walk_quad' : 'walk',
    transitions: [
      { target: 'idle', condition: 'stop', blendDuration: 0.2 },
      { target: 'run', condition: 'sprint', blendDuration: 0.15 },
      ...(isCombat ? [{ target: 'attack', condition: 'attack', blendDuration: 0.1 }] : []),
      { target: 'hurt', condition: 'damage', blendDuration: 0.05 },
    ],
  });

  sm.addState({
    name: 'run',
    clip: isQuadruped ? 'run_quad' : 'run',
    transitions: [
      { target: 'walk', condition: 'slow', blendDuration: 0.2 },
      { target: 'idle', condition: 'stop', blendDuration: 0.3 },
      ...(isCombat ? [{ target: 'attack', condition: 'attack', blendDuration: 0.1 }] : []),
      { target: 'hurt', condition: 'damage', blendDuration: 0.05 },
    ],
  });

  if (isCombat) {
    sm.addState({
      name: 'attack',
      clip: archetype === 'mage' ? 'cast' : archetype === 'archer' ? 'shoot' : 'attack',
      transitions: [
        { target: 'idle', condition: 'done', blendDuration: 0.2 },
        { target: 'hurt', condition: 'damage', blendDuration: 0.05 },
      ],
    });
  }

  if (canFly) {
    sm.addState({
      name: 'fly',
      clip: 'fly',
      transitions: [
        { target: 'idle', condition: 'land', blendDuration: 0.3 },
        ...(isCombat ? [{ target: 'attack', condition: 'attack', blendDuration: 0.1 }] : []),
        { target: 'hurt', condition: 'damage', blendDuration: 0.05 },
      ],
    });
  }

  sm.addState({
    name: 'hurt',
    clip: 'hurt',
    transitions: [
      { target: 'idle', condition: 'recover', blendDuration: 0.3 },
      { target: 'death', condition: 'die', blendDuration: 0.1 },
    ],
  });

  sm.addState({
    name: 'death',
    clip: 'death',
    transitions: [],
  });

  return sm;
}

/**
 * Procedural walk cycle generator.
 * Produces keyframe data for a walk cycle based on personality and body structure.
 */
export function generateWalkCycle(personality: string, bodyStructure: string, disneyScale: DisneyPrinciples): AnimClip {
  const duration = personality === 'stealthy' ? 1.5 : personality === 'confident' ? 0.8 : 1.0;
  const stride = personality === 'stealthy' ? 0.3 : personality === 'confident' ? 0.5 : 0.4;
  const bounce = 0.02 * disneyScale.squashStretch;
  const lean = personality === 'confident' ? 0.03 : personality === 'stealthy' ? 0.01 : 0.02;

  const isQuad = bodyStructure === 'quadruped' || bodyStructure === 'serpentine';

  const tracks: AnimTrack[] = [
    {
      property: 'position.y',
      keyframes: [
        { time: 0, value: 0, easing: 'ease_in_out' },
        { time: duration * 0.25, value: bounce, easing: 'ease_in_out' },
        { time: duration * 0.5, value: 0, easing: 'ease_in_out' },
        { time: duration * 0.75, value: bounce, easing: 'ease_in_out' },
        { time: duration, value: 0, easing: 'ease_in_out' },
      ],
    },
    {
      property: 'rotation.z',
      keyframes: [
        { time: 0, value: 0, easing: 'ease_in_out' },
        { time: duration * 0.25, value: lean, easing: 'ease_in_out' },
        { time: duration * 0.5, value: 0, easing: 'ease_in_out' },
        { time: duration * 0.75, value: -lean, easing: 'ease_in_out' },
        { time: duration, value: 0, easing: 'ease_in_out' },
      ],
    },
  ];

  if (!isQuad) {
    // Bipedal leg swing
    tracks.push({
      property: 'leftLeg.rotation.x',
      keyframes: [
        { time: 0, value: -stride, easing: 'ease_in_out' },
        { time: duration * 0.5, value: stride, easing: 'ease_in_out' },
        { time: duration, value: -stride, easing: 'ease_in_out' },
      ],
    });
    tracks.push({
      property: 'rightLeg.rotation.x',
      keyframes: [
        { time: 0, value: stride, easing: 'ease_in_out' },
        { time: duration * 0.5, value: -stride, easing: 'ease_in_out' },
        { time: duration, value: stride, easing: 'ease_in_out' },
      ],
    });
  }

  return {
    name: 'walk',
    duration,
    loop: true,
    tracks,
    techniques: ['arcs', 'ease_in_out', 'secondary_action'],
  };
}

/** Procedural idle animation generator. */
export function generateIdleAnim(personality: string, bodyStructure: string, disneyScale: DisneyPrinciples): AnimClip {
  const duration = 3.0;
  const breathAmp = 0.015 * disneyScale.secondaryAction;
  const swayAmp = personality === 'nervous' ? 0.01 : 0.005;

  const tracks: AnimTrack[] = [
    {
      property: 'scale.y',
      keyframes: [
        { time: 0, value: 1.0, easing: 'ease_in_out' },
        { time: duration * 0.5, value: 1.0 + breathAmp, easing: 'ease_in_out' },
        { time: duration, value: 1.0, easing: 'ease_in_out' },
      ],
    },
    {
      property: 'rotation.y',
      keyframes: [
        { time: 0, value: 0, easing: 'ease_in_out' },
        { time: duration * 0.3, value: swayAmp, easing: 'ease_in_out' },
        { time: duration * 0.7, value: -swayAmp, easing: 'ease_in_out' },
        { time: duration, value: 0, easing: 'ease_in_out' },
      ],
    },
  ];

  return {
    name: 'idle',
    duration,
    loop: true,
    tracks,
    techniques: ['secondary_action', 'breathing'],
  };
}

/**
 * Complete animation profile for an entity.
 * Combines Disney principles, anime techniques, cartoon physics, VFX, and state machine.
 */
export interface EntityAnimProfile {
  readonly disneyPrinciples: DisneyPrinciples;
  readonly animeTechniques: AnimeTechniques;
  readonly cartoonPhysics: CartoonPhysics;
  readonly vfxStack: VFXStack;
  readonly stateMachine: AnimationStateMachine;
  readonly clips: readonly AnimClip[];
}

/** Build complete animation profile from concept data. */
export function buildEntityAnimProfile(
  archetype: string,
  bodyStructure: string,
  style: string,
  element: string,
  hasTransforms: boolean,
  personality: string,
): EntityAnimProfile {
  const disney = getDisneyPreset(style);
  const anime = getAnimeTechniques(style);
  const physics = getCartoonPhysics(style);
  const vfx = buildVFXStack(element, style, hasTransforms);
  const sm = buildEntityStateMachine(archetype, bodyStructure);

  const clips: AnimClip[] = [
    generateIdleAnim(personality, bodyStructure, disney),
    generateWalkCycle(personality, bodyStructure, disney),
  ];

  return { disneyPrinciples: disney, animeTechniques: anime, cartoonPhysics: physics, vfxStack: vfx, stateMachine: sm, clips };
}
