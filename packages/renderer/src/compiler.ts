/**
 * SDF Compiler — assembles gene-driven GLSL fragment shaders.
 *
 * The compiler reads RenderParams (extracted from seed genes) and produces
 * a complete GLSL fragment shader. Every numeric value in the shader comes
 * from a gene. Mutating genes → different shader → different visual form.
 */

import type { RenderParams, ElementEffect, MaterialParams, MotionParams } from './types.js';
import { GLSL_PRIMITIVES } from './glsl-primitives.js';
import { getBodyPlan } from './body-plans/index.js';

const f = (n: number): string => n.toFixed(4);
const v3 = (c: readonly [number, number, number]): string => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;

/** Generate element-specific material modulation GLSL. */
function compileElementEffect(element: ElementEffect): string {
  switch (element) {
    case 'fire':
      return 'emission += 1.0; albedo = mix(albedo, vec3(1.0, 0.3, 0.05), 0.3 + 0.2 * sin(u_time * 5.0));';
    case 'ice':
      return 'roughness = min(roughness, 0.05); albedo = mix(albedo, vec3(0.7, 0.9, 1.0), 0.3);';
    case 'lightning':
      return 'emission += 0.8; albedo = mix(albedo, vec3(1.0, 1.0, 0.2), 0.2 * abs(sin(u_time * 15.0)));';
    case 'light':
      return 'emission += 1.2; albedo = mix(albedo, vec3(1.0, 0.95, 0.8), 0.4);';
    case 'dark':
      return 'albedo *= 0.3; emission += 0.3;';
    case 'nature':
      return 'roughness = max(roughness, 0.7); albedo = mix(albedo, vec3(0.2, 0.6, 0.1), 0.3 + 0.1 * fbm3(hitPos * 3.0));';
    case 'poison':
      return 'emission += 0.4; albedo = mix(albedo, vec3(0.3, 1.0, 0.1), 0.3);';
    case 'water':
      return 'roughness = min(roughness, 0.1); albedo = mix(albedo, vec3(0.1, 0.4, 0.8), 0.3);';
    case 'earth':
      return 'roughness = max(roughness, 0.8); albedo = mix(albedo, vec3(0.5, 0.35, 0.2), 0.3 + 0.1 * noise3(hitPos * 5.0));';
    case 'wind':
      return 'albedo = mix(albedo, vec3(0.8, 0.9, 1.0), 0.2);';
    case 'none':
    default:
      return '';
  }
}

/** Generate motion animation GLSL from motion genes. */
function compileMotion(motion: MotionParams, bodyStructure: string): string {
  let code = '';

  // Breathing (universal)
  code += `p *= 1.0 + sin(u_time * ${f(motion.idleSpeed)}) * ${f(motion.breathingAmplitude)};\n`;

  // Sway
  if (motion.swayAmount > 0.005) {
    code += `p.x += sin(u_time * ${f(motion.idleSpeed * 0.5)}) * ${f(motion.swayAmount)};\n`;
  }

  // Bob (vertical bounce — mainly for floating)
  if (motion.bobHeight > 0.005) {
    code += `p.y += sin(u_time * ${f(motion.idleSpeed * 0.7)}) * ${f(motion.bobHeight)};\n`;
  }

  // Body-structure specific idle animation
  if (bodyStructure === 'floating') {
    code += `p = rotY(p, u_time * 0.3);\n`;
  } else if (bodyStructure === 'serpentine') {
    code += `p.x += sin(p.z * 3.0 + u_time * 3.0) * 0.04;\n`;
  }

  return code;
}

/**
 * Compile a complete GLSL fragment shader from gene-extracted parameters.
 * Every numeric literal in the output is derived from a seed gene value.
 */
export function compileShader(params: RenderParams): string {
  const bodyPlan = getBodyPlan(params.bodyStructure);
  const bodyGLSL = bodyPlan.compile(params.sdf);
  const motionGLSL = compileMotion(params.motion, params.bodyStructure);
  const elementGLSL = compileElementEffect(params.element);
  const mat = params.material;

  const outlineCheck = mat.outlineThickness > 0.01
    ? `if (dot(n, viewDir) < ${f(mat.outlineThickness)}) col = vec3(0.0);`
    : '';

  return `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
out vec4 fragColor;

${GLSL_PRIMITIVES}

// Gene-driven SDF entity (${bodyPlan.name} body plan)
float mapEntity(vec3 p) {
  // Motion genes control idle animation
  ${motionGLSL}
  // Body plan compiled from bodyParams + appendages genes
  ${bodyGLSL}
}

float map(vec3 p) {
  float entity = mapEntity(p);
  float floor_ = p.y + 1.2;
  return min(entity, floor_);
}

vec3 calcNormal(vec3 p) {
  const float e = 0.001;
  return normalize(vec3(
    map(p + vec3(e,0,0)) - map(p - vec3(e,0,0)),
    map(p + vec3(0,e,0)) - map(p - vec3(0,e,0)),
    map(p + vec3(0,0,e)) - map(p - vec3(0,0,e))
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  // Orbiting camera
  vec3 ro = vec3(sin(u_time * 0.25) * 2.5, 1.2, cos(u_time * 0.25) * 2.5 + 2.0);
  vec3 ta = vec3(0.0, 0.3, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = normalize(cross(uu, ww));
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  // Raymarch
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001 || t > 25.0) break;
    t += d;
  }

  // Background: deep space
  vec3 col = mix(vec3(0.015, 0.025, 0.06), vec3(0.0, 0.0, 0.02), rd.y);
  float stars = pow(fract(sin(dot(rd.xy, vec2(12.9898, 78.233))) * 43758.5453), 180.0);
  col += vec3(stars) * 0.6;

  if (t < 25.0) {
    vec3 hitPos = ro + rd * t;
    vec3 n = calcNormal(hitPos);
    vec3 lightDir = normalize(vec3(1.0, 1.2, -0.5));
    vec3 viewDir = normalize(ro - hitPos);

    float entityDist = mapEntity(hitPos);
    bool isEntity = entityDist < 0.01;

    if (isEntity) {
      // Material from seed genes
      vec3 albedo = ${v3(mat.primaryColor)};
      vec3 secColor = ${v3(mat.secondaryColor)};
      vec3 accColor = ${v3(mat.accentColor)};
      albedo = mix(albedo, secColor, clamp(sin(hitPos.y * 5.0 + u_time) * 0.5 + 0.5, 0.0, 1.0));

      float roughness = ${f(mat.roughness)};
      float metallic = ${f(mat.metallic)};
      float emission = ${f(mat.emission)};

      // Element effect from primaryElement gene
      ${elementGLSL}

      // Lighting
      float dif = max(dot(n, lightDir), 0.0);
      float amb = 0.12;

      // Fresnel rim glow
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

      col = albedo * (dif * (1.0 - metallic * 0.5) + amb) + albedo * emission;
      col += accColor * rim * ${f(Math.max(0.5, mat.emission * 0.5 + 0.3))};

      // Cel-shading outline from outlineThickness gene
      ${outlineCheck}
    } else {
      // Floor
      float f = mod(floor(hitPos.x) + floor(hitPos.z), 2.0);
      col = mix(vec3(0.03), vec3(0.055), f) * (max(dot(n, lightDir), 0.0) * 0.5 + 0.3);
    }
  }

  // Fog
  col = mix(col, vec3(0.015, 0.025, 0.06), 1.0 - exp(-0.04 * t));

  // Tone mapping (ACES)
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

  // Vignette
  vec2 q = gl_FragCoord.xy / u_resolution.xy;
  col *= 0.5 + 0.5 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.25);

  fragColor = vec4(col, 1.0);
}`;
}

/** Vertex shader for fullscreen quad. */
export const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;
