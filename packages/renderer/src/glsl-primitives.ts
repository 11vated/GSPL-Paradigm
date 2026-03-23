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
`;
