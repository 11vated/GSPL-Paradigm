/**
 * Procedural Texture Module — Generates GLSL for surface patterns.
 *
 * Instead of flat colors, applies species-appropriate procedural textures:
 * scales for dragons, stripes for tigers, circuits for robots, etc.
 * Uses the texture operations from glsl-primitives.ts.
 */

const f = (n: number): string => n.toFixed(4);

/**
 * Compile species-appropriate texture GLSL for the material pass.
 * Returns code that modifies `albedo` based on position and species.
 */
export function compileTextureEffect(species: string, style: string): string {
  const sp = species.toLowerCase();

  // Dragon/reptile: scale pattern
  if (['dragon', 'drake', 'wyvern', 'reptile', 'lizard', 'serpent'].includes(sp)) {
    return `
      // Dragon scale texture
      float scales = scalePattern(hitPos, 25.0);
      albedo = mix(albedo, albedo * 0.65, scales * 0.4);`;
  }

  // Feline: stripe hints
  if (['feline', 'cat', 'tiger'].includes(sp)) {
    return `
      // Feline stripe pattern
      float stripes = stripePattern(hitPos, 10.0, 0.12);
      albedo = mix(albedo, albedo * 0.3, stripes * 0.5);`;
  }

  // Canine: subtle mottled fur
  if (['canine', 'wolf', 'fox', 'dog'].includes(sp)) {
    return `
      // Canine fur mottling
      float furTex = worley(hitPos * 15.0);
      albedo = mix(albedo, albedo * 0.8, furTex * 0.2);`;
  }

  // Robot/mech: circuit lines + panel edges
  if (['robot', 'mech', 'mechanical', 'automaton', 'cyborg', 'golem'].includes(sp)) {
    return `
      // Robot circuit pattern
      float circuits = weavePattern(hitPos, 8.0);
      vec3 circuitGlow = accColor * 0.6;
      albedo = mix(albedo, circuitGlow, circuits * 0.3);`;
  }

  // Skeleton/undead: bone texture
  if (['skeleton', 'zombie', 'undead', 'lich'].includes(sp)) {
    return `
      // Bone/decay texture
      float boneTex = fbm3(hitPos * 18.0) * 0.35;
      albedo = mix(albedo, vec3(0.85, 0.8, 0.7), boneTex);`;
  }

  // Plant/treant: bark/wood grain
  if (['treant', 'plant', 'myconid', 'vine_creature', 'flower_spirit'].includes(sp)) {
    return `
      // Wood/bark grain
      float grain = sin(length(hitPos.xz) * 20.0 + fbm3(hitPos * 4.0) * 5.0) * 0.5 + 0.5;
      albedo = mix(albedo, albedo * vec3(0.85, 0.7, 0.55), grain * 0.25);`;
  }

  // Crystal/gem: faceted prismatic
  if (['crystal', 'gem', 'ice_elemental'].includes(sp)) {
    return `
      // Crystal facet prismatic
      vec2 crystV = voronoi(hitPos.xz * 12.0);
      float facets = smoothstep(0.1, 0.0, crystV.y);
      albedo = mix(albedo, accColor, facets * 0.3);`;
  }

  // Ghost/spirit: ethereal shimmer
  if (['ghost', 'wraith', 'spirit', 'phantom', 'astral'].includes(sp)) {
    return `
      // Ethereal shimmer
      float shimmer = sin(hitPos.y * 30.0 + u_time * 3.0) * 0.5 + 0.5;
      albedo = mix(albedo, albedo * 1.3, shimmer * 0.2);
      emission += 0.3;`;
  }

  // Elemental: flowing energy pattern
  if (['elemental', 'fire_elemental', 'water_elemental', 'earth_elemental', 'air_elemental', 'lightning_elemental'].includes(sp)) {
    return `
      // Elemental energy flow
      float flow = sin(hitPos.y * 8.0 + u_time * 4.0 + fbm3(hitPos * 3.0) * 3.0) * 0.5 + 0.5;
      albedo = mix(albedo, accColor, flow * 0.4);
      emission += flow * 0.5;`;
  }

  // Cyberpunk style override (regardless of species)
  if (style === 'cyberpunk') {
    return `
      // Cyberpunk neon circuits
      float neonLines = weavePattern(hitPos, 6.0);
      albedo = mix(albedo, accColor * 2.0, neonLines * 0.25);
      emission += neonLines * 0.4;`;
  }

  return ''; // No texture for generic species
}
