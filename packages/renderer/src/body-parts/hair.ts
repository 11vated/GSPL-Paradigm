/**
 * Hair SDF Module — Generates GLSL for hair/fur volumes.
 *
 * Hair is critical for character identity: Goku's spiky hair, knight's mane,
 * cat's fur. Implemented as expanded head shell + noise displacement.
 */

const f = (n: number): string => n.toFixed(4);

export interface HairParams {
  readonly headRadius: number;
  readonly headY: number;
  readonly hairLength: number;   // 0 = bald, 0.1 = short, 0.3 = long
  readonly hairStyle: string;    // 'spiky' | 'flowing' | 'short' | 'mohawk' | 'bald' | 'fur'
  readonly species: string;
}

/**
 * Compile hair/fur GLSL code. Returns code that adds hair volume to the `body` SDF.
 */
export function compileHair(params: HairParams): string {
  if (params.hairLength <= 0.01 || params.hairStyle === 'bald') return '';

  const hr = params.headRadius;
  const hy = params.headY;
  const hl = params.hairLength;
  const isBeast = ['feline', 'canine', 'wolf', 'fox', 'bear', 'beast', 'quadruped'].includes(params.species);

  // Beasts get fur instead of hair
  if (isBeast && params.hairStyle === 'fur') {
    return `
  // Fur (noise displacement on body surface)
  // Applied as surface perturbation during raymarch — already handled by opDisplace in material`;
  }

  let glsl = `
  // ── Hair Volume ──────────────────────────`;

  switch (params.hairStyle) {
    case 'spiky':
      // Spiky hair: upward bias + high-frequency noise (Goku, shonen characters)
      glsl += `
  // Spiky hair (upward bias + noise spikes)
  vec3 hairP = p - vec3(0.0, ${f(hy)}, 0.0);
  float hairShell = sdSphere(hairP, ${f(hr * 1.15)}) - ${f(hl)};
  // Noise spikes pointing upward
  hairShell -= fbm3(hairP * 8.0) * ${f(hl * 0.6)};
  hairShell -= max(0.0, hairP.y) * ${f(hl * 1.5)}; // Upward bias
  hairShell = max(hairShell, sdSphere(hairP, ${f(hr * 0.95)})); // Don't go inside head
  body = smin(body, hairShell, 0.02);`;
      break;

    case 'flowing':
      // Long flowing hair (downward extension with wind sway)
      glsl += `
  // Flowing long hair (downward cascade + wind)
  vec3 hairP = p - vec3(0.0, ${f(hy)}, 0.0);
  float hairBack = sdCapsule(hairP - vec3(0.0, 0.0, -${f(hr * 0.3)}), ${f(hl * 2.0)}, ${f(hr * 0.7)});
  hairBack += sin(hairP.x * 5.0 + u_time * 2.0) * 0.015; // Wind sway
  hairBack += sin(hairP.z * 3.0 + u_time * 1.5) * 0.01;
  float hairTop = sdSphere(hairP, ${f(hr * 1.08)}) - ${f(hl * 0.2)};
  float hair = smin(hairTop, hairBack, 0.04);
  body = smin(body, hair, 0.02);`;
      break;

    case 'short':
      // Short cropped hair (tight cap)
      glsl += `
  // Short hair (tight cap on head)
  vec3 hairP = p - vec3(0.0, ${f(hy + hr * 0.1)}, 0.0);
  float hair = sdSphere(hairP, ${f(hr * 1.06)}) - ${f(hl * 0.3)};
  hair = max(hair, -sdSphere(p - vec3(0.0, ${f(hy - hr * 0.3)}, ${f(hr * 0.5)}), ${f(hr * 0.8)})); // Clear face area
  body = smin(body, hair, 0.015);`;
      break;

    case 'mohawk':
      // Mohawk ridge along top
      glsl += `
  // Mohawk (ridge along top of head)
  vec3 hairP = p - vec3(0.0, ${f(hy + hr * 0.8)}, 0.0);
  float ridge = sdBox(hairP, vec3(0.015, ${f(hl * 1.5)}, ${f(hr * 0.5)}));
  ridge -= fbm3(hairP * 12.0) * 0.01; // Texture
  body = smin(body, ridge, 0.015);`;
      break;

    default:
      // Default: slight volume around head
      glsl += `
  // Default hair volume
  vec3 hairP = p - vec3(0.0, ${f(hy + hr * 0.1)}, 0.0);
  float hair = sdSphere(hairP, ${f(hr * 1.1)}) - ${f(hl * 0.15)};
  body = smin(body, hair, 0.02);`;
      break;
  }

  return glsl;
}

/** Determine hair style from archetype/species. */
export function inferHairStyle(archetype: string, species: string, style: string): string {
  if (['skeleton', 'zombie', 'ghost', 'wraith', 'robot', 'mech', 'golem', 'automaton'].includes(species)) return 'bald';
  if (['feline', 'canine', 'wolf', 'bear', 'beast'].includes(species)) return 'fur';
  if (style === 'shonen' || archetype === 'warrior' || archetype === 'berserker') return 'spiky';
  if (archetype === 'mage' || archetype === 'healer' || archetype === 'royalty') return 'flowing';
  if (archetype === 'rogue' || archetype === 'monk') return 'short';
  if (archetype === 'berserker') return 'mohawk';
  return 'short';
}
