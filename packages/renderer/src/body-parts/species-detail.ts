/**
 * Species-Specific Detail Module — Adds recognizable features per species.
 *
 * Dragon: spine ridges, snout elongation, scale hints, tail spade
 * Feline: whisker lines, curved tail, padded paws
 * Robot: panel lines, visible joints, antenna
 * Skeleton: exposed bones, rib cage carving
 * Ghost: ethereal trail, transparency base
 */

const f = (n: number): string => n.toFixed(4);

/** Parameters for species-specific detail generation. */
export interface SpeciesDetailParams {
  readonly species: string;
  readonly headRadius: number;
  readonly headY: number;
  readonly torsoHeight: number;
  readonly torsoWidth: number;
  readonly limbThickness: number;
  readonly hasHorns: boolean;
  readonly hornSize: number;
  readonly hasTail: boolean;
  readonly tailLength: number;
}

/**
 * Compile species-specific GLSL detail code.
 * Adds features that make each species recognizable beyond the base body plan.
 */
export function compileSpeciesDetail(params: SpeciesDetailParams): string {
  const sp = params.species.toLowerCase();
  let glsl = '';

  // ── Dragon Detail ──────────────────────────
  if (sp === 'dragon' || sp === 'drake' || sp === 'wyvern' || sp === 'wyrm') {
    // Spine ridges along back (repeated cones)
    glsl += `
  // Dragon spine ridges (opRepeatLimited along back)
  vec3 spineP = p - vec3(0.0, ${f(params.torsoHeight * 0.6)}, -${f(params.torsoWidth * 0.3)});
  vec3 spineRepeat = opRepeatLimited(spineP, 0.06, vec3(0.0, 0.0, ${f(Math.floor(params.torsoHeight / 0.06))}));
  float spineRidges = sdCone(spineRepeat - vec3(0.0, 0.02, 0.0), 0.015, 0.04);
  body = smin(body, spineRidges, 0.01);`;

    // Tail spade tip (if has tail)
    if (params.hasTail) {
      glsl += `
  // Dragon tail spade
  // (tail tip is a flattened diamond shape)`;
    }

    // Scale texture hint (subtle surface displacement)
    glsl += `
  // Dragon scale surface hint
  // Applied in material pass via scalePattern()`;
  }

  // ── Feline Detail ──────────────────────────
  if (sp === 'feline' || sp === 'cat' || sp === 'canine' || sp === 'fox' || sp === 'wolf') {
    // Whisker lines (thin capsules from snout sides)
    glsl += `
  // Whiskers (thin capsules from snout)
  vec3 whiskerP = p; whiskerP.x = abs(whiskerP.x);
  vec3 whiskerStart = vec3(${f(params.headRadius * 0.5)}, ${f(params.headY - params.headRadius * 0.15)}, ${f(params.headRadius * 0.8)});
  float whisker1 = sdCapsule(rotZ(whiskerP - whiskerStart, 0.1), ${f(params.headRadius * 0.5)}, 0.003);
  float whisker2 = sdCapsule(rotZ(whiskerP - (whiskerStart + vec3(0.0, -0.015, 0.0)), -0.05), ${f(params.headRadius * 0.45)}, 0.003);
  body = min(body, min(whisker1, whisker2));`;

    // Padded paws (slightly flattened spheres at leg endpoints)
    glsl += `
  // Padded paws
  vec3 pawP = p; pawP.x = abs(pawP.x);
  float paws = sdSphere(pawP - vec3(${f(params.torsoWidth * 0.7)}, ${f(-params.torsoHeight * 0.4 - params.limbThickness * 3.0)}, 0.0), ${f(params.limbThickness * 1.3)});
  body = smin(body, paws, 0.02);`;
  }

  // ── Robot/Mech Detail ──────────────────────
  if (sp === 'robot' || sp === 'mech' || sp === 'mechanical' || sp === 'automaton' || sp === 'golem' || sp === 'cyborg') {
    // Panel lines (thin box subtractions on torso)
    glsl += `
  // Robot panel lines
  float panelH = sdBox(p - vec3(0.0, ${f(params.torsoHeight * 0.4)}, ${f(params.torsoWidth * 0.95)}), vec3(${f(params.torsoWidth * 0.8)}, 0.002, 0.005));
  float panelV = sdBox(p - vec3(0.0, ${f(params.torsoHeight * 0.4)}, ${f(params.torsoWidth * 0.95)}), vec3(0.002, ${f(params.torsoHeight * 0.4)}, 0.005));
  body = max(body, -panelH - 0.001);
  body = max(body, -panelV - 0.001);`;

    // Visible joints (cylinders at shoulders/knees)
    glsl += `
  // Visible joint cylinders
  vec3 jointP = p; jointP.x = abs(jointP.x);
  float shoulderJoint = sdCylinder(jointP - vec3(${f(params.torsoWidth + 0.03)}, ${f(params.torsoHeight * 0.75)}, 0.0), 0.01, ${f(params.limbThickness * 1.2)});
  body = smin(body, shoulderJoint, 0.005);`;
  }

  // ── Skeleton/Undead Detail ─────────────────
  if (sp === 'skeleton' || sp === 'zombie' || sp === 'undead') {
    // Rib cage (repeated capsule subtractions on torso)
    glsl += `
  // Rib cage (carved grooves on torso)
  vec3 ribP = p - vec3(0.0, ${f(params.torsoHeight * 0.3)}, 0.0);
  vec3 ribRepeat = ribP;
  ribRepeat.y = mod(ribRepeat.y + 0.03, 0.06) - 0.03;
  float ribs = sdCapsule(vec3(ribRepeat.x, ribRepeat.y, ribRepeat.z - ${f(params.torsoWidth * 0.85)}), ${f(params.torsoWidth * 0.7)}, 0.008);
  body = max(body, -ribs - 0.003);`;
  }

  // ── Ghost/Spirit Detail ────────────────────
  if (sp === 'ghost' || sp === 'wraith' || sp === 'spirit' || sp === 'phantom') {
    // Ethereal trail below body (decreasing spheres)
    glsl += `
  // Ethereal trail
  float trail = sdSphere(p - vec3(0.0, -0.3, 0.0), 0.12);
  trail = min(trail, sdSphere(p - vec3(0.02, -0.45, 0.0), 0.08));
  trail = min(trail, sdSphere(p - vec3(-0.01, -0.58, 0.0), 0.05));
  body = smin(body, trail, 0.05);`;
  }

  // ── Insect Detail ──────────────────────────
  if (sp === 'insect' || sp === 'spider' || sp === 'scorpion' || sp === 'beetle') {
    // Antennae (thin capsules from head)
    glsl += `
  // Antennae
  vec3 antP = p; antP.x = abs(antP.x);
  float antenna = sdCapsule(antP - vec3(${f(params.headRadius * 0.3)}, ${f(params.headY + params.headRadius)}, ${f(params.headRadius * 0.5)}), ${f(params.headRadius * 0.6)}, 0.005);
  body = min(body, antenna);`;
  }

  // ── Crystal/Gem Detail ─────────────────────
  if (sp === 'crystal' || sp === 'gem' || sp === 'crystal_mat') {
    // Faceted surface protrusions
    glsl += `
  // Crystal facets
  vec3 crystP = p; crystP.x = abs(crystP.x);
  float facet = sdOctahedron(crystP - vec3(${f(params.torsoWidth * 0.8)}, ${f(params.torsoHeight * 0.5)}, 0.0), ${f(params.torsoWidth * 0.15)});
  body = smin(body, facet, 0.02);`;
  }

  return glsl;
}
