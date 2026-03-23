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
import { compileTextureEffect } from './body-parts/textures.js';

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

/**
 * Style-specific shading pipeline.
 * Generates GLSL code for lighting, coloring, and post-processing
 * appropriate to the visual style (anime, cartoon, pixel, realistic, etc.).
 */
function compileStyleShading(style: string, mat: MaterialParams): string {
  // Anime substyles — cel-shaded with style-specific tweaks
  if (['shonen', 'seinen', 'anime'].includes(style)) {
    return `
      // Shonen/Anime: Bold cel-shading with hard edges
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = celShade(dif, 3.0); // 3 bands: shadow, mid, highlight
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
      col = albedo * (celDif * 0.8 + 0.15) + albedo * emission;
      col += accColor * rim * 0.6;
      // Bold outline
      if (dot(n, viewDir) < ${f(Math.max(mat.outlineThickness, 0.15))}) col = vec3(0.02);
    `;
  }

  if (style === 'chibi') {
    return `
      // Chibi: Flat color with minimal shadows, bouncy feel
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = celShade(dif, 2.0); // 2 bands: simple shadow/light
      col = albedo * (celDif * 0.7 + 0.3) + albedo * emission * 0.5;
      // Thick outline
      if (dot(n, viewDir) < ${f(Math.max(mat.outlineThickness, 0.2))}) col = vec3(0.02);
    `;
  }

  if (style === 'ufotable') {
    return `
      // Ufotable: Dynamic lighting with bloom and volumetric feel
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = celShade(dif, 4.0); // 4 bands for smoother shading
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
      float bloom = max(emission - 0.5, 0.0) * 2.0;
      col = albedo * (celDif * 0.85 + 0.12) + albedo * emission;
      col += accColor * rim * 0.8;
      col += vec3(bloom * 0.3, bloom * 0.2, bloom * 0.4); // Bloom glow
      if (dot(n, viewDir) < ${f(Math.max(mat.outlineThickness, 0.1))}) col = vec3(0.01);
    `;
  }

  if (style === 'ghibli') {
    return `
      // Ghibli: Soft watercolor gradients, nature-infused
      float dif = max(dot(n, lightDir), 0.0);
      float softDif = smoothstep(0.0, 0.8, dif); // Soft gradient, no hard edges
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
      col = albedo * (softDif * 0.6 + 0.35) + albedo * emission * 0.3;
      col += vec3(0.05, 0.03, 0.01) * rim; // Warm rim
      col = mix(col, col * vec3(1.02, 1.0, 0.95), fbm3(hitPos * 2.0) * 0.15); // Watercolor texture
    `;
  }

  if (style === 'trigger') {
    return `
      // Trigger: Bold contrast, vivid colors, extreme energy
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = celShade(dif, 2.0); // Sharp 2-band for maximum contrast
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);
      col = albedo * (celDif * 0.9 + 0.1) + albedo * emission * 1.5;
      col += accColor * rim * 1.0; // Intense rim
      col *= 1.2; // Boost saturation
      if (dot(n, viewDir) < ${f(Math.max(mat.outlineThickness, 0.18))}) col = vec3(0.0);
    `;
  }

  if (style === 'kyoani') {
    return `
      // KyoAni: Diffuse soft lighting, subtle movement
      float dif = max(dot(n, lightDir), 0.0);
      float softDif = smoothstep(0.0, 1.0, dif);
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);
      float subsurface = max(dot(-n, lightDir), 0.0) * 0.15; // Fake SSS
      col = albedo * (softDif * 0.65 + 0.3 + subsurface) + albedo * emission * 0.3;
      col += vec3(0.04, 0.02, 0.01) * rim; // Warm subtle rim
      if (dot(n, viewDir) < ${f(Math.max(mat.outlineThickness, 0.08))}) col *= 0.1;
    `;
  }

  // Cartoon styles
  if (['cartoon', 'looney_tunes', 'cn_flat', 'disney_2d'].includes(style)) {
    return `
      // Cartoon: Flat bold colors, thick outlines
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = step(0.3, dif); // Binary: shadow or light
      col = albedo * (celDif * 0.6 + 0.4) + albedo * emission;
      // Extra thick outline
      if (dot(n, viewDir) < ${f(Math.max(mat.outlineThickness, 0.25))}) col = vec3(0.0);
    `;
  }

  // Pixel art styles
  if (['pixel', 'pixel_8bit', 'pixel_16bit', 'hd_pixel'].includes(style)) {
    return `
      // Pixel art: Quantized colors, grid-snapped
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = celShade(dif, 2.0);
      col = albedo * (celDif * 0.7 + 0.3) + albedo * emission;
      // Quantize to limited palette
      col = floor(col * 8.0 + 0.5) / 8.0;
    `;
  }

  // Photorealistic styles
  if (['realistic', 'game_realism', 'film_vfx', 'hyperrealism'].includes(style)) {
    return `
      // PBR Photorealistic: Full physically-based rendering
      float dif = max(dot(n, lightDir), 0.0);
      vec3 halfVec = normalize(lightDir + viewDir);
      float spec = pow(max(dot(n, halfVec), 0.0), mix(16.0, 256.0, 1.0 - roughness));
      float fres = fresnelSchlick(max(dot(n, viewDir), 0.0), mix(0.04, 1.0, metallic));

      // Fake ambient occlusion
      float ao = 0.5 + 0.5 * n.y;

      // Subsurface scattering approximation for skin
      float sss = max(dot(-n, lightDir), 0.0) * 0.2 * (1.0 - metallic);

      vec3 diffuse = albedo * (1.0 - metallic) * (dif * 0.7 + 0.1 + sss);
      vec3 specular = mix(vec3(0.04), albedo, metallic) * spec;
      col = (diffuse + specular) * ao + albedo * emission;
      col += vec3(fres * 0.08); // Rim from Fresnel
    `;
  }

  // Cyberpunk
  if (style === 'cyberpunk') {
    return `
      // Cyberpunk: Neon-lit, high contrast
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = celShade(dif, 3.0);
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
      col = albedo * (celDif * 0.5 + 0.1) + albedo * emission * 1.5;
      col += accColor * rim * 1.5; // Neon rim glow
      col += vec3(0.0, emission * 0.1, emission * 0.15); // Blue/cyan ambient neon
    `;
  }

  // Fantasy
  if (style === 'fantasy') {
    return `
      // Fantasy: Painterly, rich warm tones
      float dif = max(dot(n, lightDir), 0.0);
      float softDif = smoothstep(0.0, 0.9, dif);
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);
      col = albedo * (softDif * 0.7 + 0.25) + albedo * emission * 0.5;
      col += accColor * rim * 0.4;
      col *= vec3(1.05, 1.0, 0.92); // Warm tint
    `;
  }

  // Noir
  if (style === 'noir') {
    return `
      // Noir: High contrast black and white with dramatic shadows
      float dif = max(dot(n, lightDir), 0.0);
      float celDif = step(0.4, dif);
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
      float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
      col = vec3(lum) * (celDif * 0.8 + 0.1);
      col += vec3(rim * 0.3);
    `;
  }

  // Default: standard rendering (original behavior)
  return '';
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

  const styleShading = compileStyleShading(params.style, mat);
  const useStyleShading = styleShading.length > 0;

  const outlineCheck = !useStyleShading && mat.outlineThickness > 0.01
    ? `if (dot(n, viewDir) < ${f(mat.outlineThickness)}) col = vec3(0.0);`
    : '';

  return `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;       // Normalized mouse position (0-1)
uniform float u_emotion;    // 0.0 = calm, 1.0 = rage (changes aura color/intensity)
uniform float u_transform;  // 0.0 = base form, 1.0 = fully transformed (morph + color shift)
uniform float u_power;      // 0.0 = dormant, 1.0 = active (ability VFX)
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

      // Species texture pattern
      ${compileTextureEffect(params.sdf.species ?? 'unknown', params.style)}

      ${useStyleShading ? `// Style-specific shading: ${params.style}
      ${styleShading}` : `// Default shading
      float dif = max(dot(n, lightDir), 0.0);
      float amb = 0.12;
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
      col = albedo * (dif * (1.0 - metallic * 0.5) + amb) + albedo * emission;
      col += accColor * rim * ${f(Math.max(0.5, mat.emission * 0.5 + 0.3))};
      ${outlineCheck}`}
    } else {
      // Floor
      float f = mod(floor(hitPos.x) + floor(hitPos.z), 2.0);
      col = mix(vec3(0.03), vec3(0.055), f) * (max(dot(n, lightDir), 0.0) * 0.5 + 0.3);
    }
  }

  // Fog
  col = mix(col, vec3(0.015, 0.025, 0.06), 1.0 - exp(-0.04 * t));

  // v2: Interactive uniforms — emotion, transformation, power activation
  // Emotion: shifts aura color (calm=cool tones, rage=hot tones) and intensity
  if (u_emotion > 0.01) {
    vec3 emotionColor = mix(vec3(0.2, 0.4, 0.8), vec3(1.0, 0.2, 0.05), u_emotion);
    float emotionGlow = u_emotion * 0.5;
    col += emotionColor * emotionGlow * (0.5 + 0.5 * sin(u_time * 3.0 + u_emotion * 6.0));
  }

  // Transform: morphology scale shift + color intensity boost + aura burst
  if (u_transform > 0.01) {
    float transformPulse = u_transform * (0.7 + 0.3 * sin(u_time * 4.0));
    col *= 1.0 + transformPulse * 0.5;
    col += vec3(transformPulse * 0.15, transformPulse * 0.1, transformPulse * 0.25);
  }

  // Power: ability VFX activation — screen energy overlay
  if (u_power > 0.01) {
    float powerWave = u_power * abs(sin(u_time * 6.0));
    vec2 powerUV = gl_FragCoord.xy / u_resolution.xy - 0.5;
    float powerDist = length(powerUV);
    float powerRing = smoothstep(0.3, 0.25, abs(powerDist - 0.3 * u_power));
    col += vec3(0.3, 0.5, 1.0) * powerRing * powerWave;
  }

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
