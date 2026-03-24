/**
 * Shared GLSL primitive functions for SDF rendering.
 * These are mathematical building blocks — not species templates.
 */

export const GLSL_PRIMITIVES = `
// Smooth minimum — blends two SDFs with configurable smoothness
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

// SDF primitives — fundamental shapes parameterized by dimensions
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0-1.0)/k1; }
float sdCapsule(vec3 p, float h, float r) { p.y -= clamp(p.y, 0.0, h); return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0); }
float sdCylinder(vec3 p, float h, float r) { vec2 d = abs(vec2(length(p.xz),p.y)) - vec2(r,h); return min(max(d.x,d.y),0.0) + length(max(d,0.0)); }
float sdCone(vec3 p, float r, float h) { vec2 q = h*vec2(r/h,-1.0); vec2 w = vec2(length(p.xz), p.y); return max(dot(w,normalize(q)), -p.y-h); }

// Boolean operations
float opUnion(float a, float b) { return min(a, b); }
float opSubtract(float a, float b) { return max(-a, b); }

// Noise for procedural detail
float hash3(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0,0,0)), hash3(i+vec3(1,0,0)),f.x),
                 mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)),f.x),
                 mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 x) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; ++i) { v += a * noise3(x); x = x * 2.0 + vec3(100.0); a *= 0.5; }
  return v;
}

// Rotation helpers
mat2 rot2(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
vec3 rotX(vec3 p, float a) { p.yz *= rot2(a); return p; }
vec3 rotY(vec3 p, float a) { p.xz *= rot2(a); return p; }
vec3 rotZ(vec3 p, float a) { p.xy *= rot2(a); return p; }

// v2: Advanced SDF operations
float sdTorus(vec3 p, float R, float r) { vec2 q = vec2(length(p.xz) - R, p.y); return length(q) - r; }
float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - r; }
float opSmoothSubtract(float d1, float d2, float k) { float h = clamp(0.5 - 0.5*(d2+d1)/k, 0.0, 1.0); return mix(d2, -d1, h) + k*h*(1.0-h); }
float opSmoothIntersect(float d1, float d2, float k) { float h = clamp(0.5 - 0.5*(d2-d1)/k, 0.0, 1.0); return mix(d2, d1, h) + k*h*(1.0-h); }
vec3 opTwist(vec3 p, float k) { float c = cos(k*p.y); float s = sin(k*p.y); mat2 m = mat2(c,-s,s,c); return vec3(m*p.xz, p.y); }
vec3 opBend(vec3 p, float k) { float c = cos(k*p.x); float s = sin(k*p.x); mat2 m = mat2(c,-s,s,c); return vec3(p.x, m*p.yz); }
float opShell(float d, float thickness) { return abs(d) - thickness; }
float opRound(float d, float r) { return d - r; }
vec3 opElongate(vec3 p, vec3 h) { vec3 q = p - clamp(p, -h, h); return q; }

// v2: Cel-shading helper — quantize diffuse to N bands
float celShade(float d, float bands) { return floor(d * bands + 0.5) / bands; }

// v2: Fresnel for rim lighting
float fresnelSchlick(float cosTheta, float f0) { return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0); }

// v2: Aura/particle effect helpers
float auraPulse(vec3 p, float time, float intensity) {
  float r = length(p);
  float pulse = sin(r * 8.0 - time * 4.0) * 0.5 + 0.5;
  return pulse * intensity * smoothstep(1.5, 0.0, r);
}

// ═══════════════════════════════════════════════════════
// v3: EXPANDED SDF ARSENAL — 29 new operations (21→50)
// Based on Inigo Quilez's established SDF formulas
// ═══════════════════════════════════════════════════════

// ── New Primitives (7→18) ──────────────────────────

// Rounded cone — tapered capsule (horns, tails, limbs with taper)
float sdRoundCone(vec3 p, float r1, float r2, float h) {
  vec2 q = vec2(length(p.xz), p.y);
  float b = (r1-r2)/h;
  float a = sqrt(1.0-b*b);
  float k = dot(q,vec2(-b,a));
  if(k < 0.0) return length(q) - r1;
  if(k > a*h) return length(q-vec2(0.0,h)) - r2;
  return dot(q, vec2(a,b)) - r1;
}

// Triangular prism — blades, fins, wedge shapes
float sdTriPrism(vec3 p, vec2 h) {
  vec3 q = abs(p);
  return max(q.z-h.y,max(q.x*0.866025+p.y*0.5,-p.y)-h.x*0.5);
}

// Hexagonal prism — crystals, insect segments, honeycomb
float sdHexPrism(vec3 p, vec2 h) {
  vec3 q = abs(p);
  return max(q.z-h.y,max(q.x*0.866025+q.y*0.5,q.y)-h.x);
}

// Octahedron — diamond/gem shapes
float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  float m = p.x+p.y+p.z-s;
  vec3 q;
  if(3.0*p.x < m) q = p.xyz;
  else if(3.0*p.y < m) q = p.yzx;
  else if(3.0*p.z < m) q = p.zxy;
  else return m*0.57735027;
  float k = clamp(0.5*(q.z-q.y+s),0.0,s);
  return length(vec3(q.x,q.y-s+k,q.z-k));
}

// Pyramid — 4-sided pyramid with height h and unit base
float sdPyramid(vec3 p, float h) {
  float m2 = h*h + 0.25;
  p.xz = abs(p.xz);
  p.xz = (p.z>p.x) ? p.zx : p.xz;
  p.xz -= 0.5;
  vec3 q = vec3(p.z, h*p.y - 0.5*p.x, h*p.x + 0.5*p.y);
  float s = max(-q.x, 0.0);
  float t = clamp((q.y - 0.5*p.z)/(m2 + 0.25), 0.0, 1.0);
  float a = m2*(q.x+s)*(q.x+s) + q.y*q.y;
  float b = m2*(q.x+0.5*t)*(q.x+0.5*t) + (q.y-m2*t)*(q.y-m2*t);
  float d2 = max(min(q.y,-q.x*m2-q.y*0.5), 0.0) > 0.0 ? 0.0 : min(a,b);
  return sqrt((d2+q.z*q.z)/m2) * sign(max(q.z,-p.y));
}

// Solid angle (wedge) — claws, teeth, beaks
float sdSolidAngle(vec3 p, vec2 c, float r) {
  vec2 q = vec2(length(p.xz), p.y);
  float l = length(q) - r;
  float m = length(q - c*clamp(dot(q,c),0.0,r));
  return max(l, m*sign(c.y*q.x-c.x*q.y));
}

// Infinite plane — ground, walls, wing membranes
float sdPlane(vec3 p, vec3 n, float h) { return dot(p,n) + h; }

// Revolution — spin 2D profile around Y axis (wheels, vases, columns)
float sdRevolution(vec3 p, float sdfY, float sdfR, float offset) {
  vec2 q = vec2(length(p.xz) - offset, p.y);
  return length(q) - sdfR;
}

// Extrude linear — pull 2D circle into 3D cylinder along Y
float sdExtrudeY(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

// Bezier quadratic curve distance (approximate)
float sdBezierApprox(vec3 p, vec3 a, vec3 b, vec3 c) {
  vec3 ab = b - a; vec3 bc = c - b; vec3 ac = c - a;
  vec3 ap = p - a;
  float t = clamp(dot(ap, ac) / dot(ac, ac), 0.0, 1.0);
  vec3 pt = a + ab*2.0*t*(1.0-t) + ac*t*t;
  return length(p - pt);
}

// ── New Combination Operations (3→10) ──────────────

// Chamfer — flat bevel edge between two surfaces (mechanical, armor panel lines)
float opChamfer(float a, float b, float r) {
  return min(min(a,b), (a - r + b)*0.7071);
}

// Fillet — smooth round transition (organic)
float opFillet(float a, float b, float r) {
  vec2 u = max(vec2(r-a, r-b), vec2(0.0));
  return max(r, min(a,b)) - length(u);
}

// Stair union — stepped blend (crystal growth, terraced)
float opStairUnion(float a, float b, float r, float n) {
  float s = r/n;
  float u = b-r;
  return min(min(a,b), 0.5*(u+a+abs(mod(u-a+s, 2.0*s)-s)));
}

// Column union — columnar blend (organic tissue, vein-like)
float opColumnUnion(float a, float b, float r) {
  if (abs(a) < r && abs(b) < r) {
    float ar = a/r; float br = b/r;
    float v = max(0.0, 1.0 - ar*ar - br*br);
    return min(a,b) - r*(1.0 - sqrt(v));
  }
  return min(a,b);
}

// Groove — carved channel (panel seams, detail lines)
float opGroove(float a, float b, float r, float d) {
  return max(a, min(b+d, -b+r));
}

// ── New Domain Operations (5→15) ───────────────────

// Repeat infinite — scales, rivets, tiles
vec3 opRepeatXYZ(vec3 p, vec3 s) { return mod(p+s*0.5, s) - s*0.5; }

// Repeat limited — bounded repetition (teeth, spine ridges, fingers)
vec3 opRepeatLimited(vec3 p, float s, vec3 lim) {
  return p - s*clamp(round(p/s), -lim, lim);
}

// Repeat polar — radial repetition (petals, wheel spokes, tentacles)
vec3 opRepeatPolar(vec3 p, float n) {
  float angle = 6.2831853/n;
  float a = atan(p.z, p.x);
  float r = length(p.xz);
  a = mod(a + angle*0.5, angle) - angle*0.5;
  return vec3(r*cos(a), p.y, r*sin(a));
}

// Mirror — bilateral symmetry
vec3 opMirror(vec3 p) { p.x = abs(p.x); return p; }

// 4-fold symmetry (starfish, flowers)
vec3 opSymmetry4(vec3 p) { p.xz = abs(p.xz); return p; }

// Displacement — noise-driven surface perturbation
float opDisplace(float d, vec3 p, float amt) {
  return d + (noise3(p * 4.0) - 0.5) * amt;
}

// Onion — concentric shells (layered armor, auras, energy rings)
float opOnion(float d, float thickness) { return abs(d) - thickness; }

// Taper — progressive scaling along Y axis
vec3 opTaper(vec3 p, float amount) {
  float s = 1.0 - p.y * amount;
  return vec3(p.x / max(s, 0.01), p.y, p.z / max(s, 0.01));
}

// Cheap bend — fast approximation for large deformations
vec3 opCheapBend(vec3 p, float k) {
  float c = cos(k*p.y); float s = sin(k*p.y);
  mat2 m = mat2(c,-s,s,c);
  vec2 xz = m * p.xz;
  return vec3(xz.x, p.y, xz.y);
}

// ── New Texture Operations (0→7) ───────────────────

// Voronoi — cell patterns (scales, cracks, veins)
vec2 voronoi(vec2 x) {
  vec2 n = floor(x); vec2 f = fract(x);
  float md = 8.0; vec2 mr;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++) {
    vec2 g = vec2(float(i),float(j));
    vec2 o = vec2(hash3(vec3(n+g,0.0)), hash3(vec3(n+g,1.0)));
    vec2 r = g + o - f;
    float d = dot(r,r);
    if(d<md){ md=d; mr=r; }
  }
  return vec2(md, length(mr));
}

// Worley noise — organic cellular texture (2D for perf, projected from xz)
float worley(vec3 p) {
  vec2 n = floor(p.xz); vec2 ff = fract(p.xz);
  float md = 1.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++) {
    vec2 g = vec2(float(i),float(j));
    vec2 o = vec2(hash3(vec3(n+g,0.0)), hash3(vec3(n+g,1.0)));
    float d = length(g + o - ff);
    md = min(md, d);
  }
  return md;
}

// Stripe pattern — directional bands (tiger, zebra)
float stripePattern(vec3 p, float freq, float thick) {
  return smoothstep(thick, thick-0.05, abs(sin(p.x*freq + fbm3(p*2.0)*2.0)));
}

// Spot pattern — radial dots (leopard, dalmatian)
float spotPattern(vec3 p, float scale, float size) {
  vec2 v = voronoi(p.xz * scale);
  return smoothstep(size, size*0.5, v.x);
}

// Weave pattern — interlocking grid (fabric, chainmail)
float weavePattern(vec3 p, float scale) {
  vec2 uv = fract(p.xz * scale);
  float h = step(0.5, uv.x);
  float v = step(0.5, uv.y);
  return abs(h - v);
}

// Triplanar projection — seamless 3D texture application
vec3 triplanar(vec3 p, vec3 n, float scale) {
  vec3 bf = abs(n); bf /= (bf.x+bf.y+bf.z);
  float tx = noise3(vec3(p.yz * scale, 0.0));
  float ty = noise3(vec3(p.xz * scale, 0.0));
  float tz = noise3(vec3(p.xy * scale, 0.0));
  return vec3(tx*bf.x + ty*bf.y + tz*bf.z);
}

// Scale pattern — Voronoi-based for dragons/reptiles
float scalePattern(vec3 p, float scale) {
  vec2 v = voronoi(p.xz * scale);
  return smoothstep(0.4, 0.35, v.y);
}
`;
