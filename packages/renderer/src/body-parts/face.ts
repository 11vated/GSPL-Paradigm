/**
 * Face SDF Module — Generates GLSL code for facial features.
 *
 * Adds eyes, pupils, nose, mouth, ears to the head sphere.
 * Style-driven scaling (chibi=2x eyes, realistic=0.8x).
 * Species-driven variation (dragon=snout, robot=box sockets, elf=pointed ears).
 *
 * The face features are SDF operations on the head sphere. They don't change
 * the head geometry — they add detail by carving (eyes, mouth) and building
 * (nose, ears) on top of the head SDF.
 */

/** Face parameters extracted from seed genes. */
export interface FaceParams {
  readonly headRadius: number;
  readonly headY: number;
  readonly eyeScale: number;
  readonly eyeSpacing: number;
  readonly eyeHeight: number;
  readonly pupilScale: number;
  readonly mouthWidth: number;
  readonly mouthHeight: number;
  readonly noseSize: number;
  readonly earScale: number;
  readonly species: string;
  readonly style: string;
}

const f = (n: number): string => n.toFixed(4);

/**
 * Get style-based eye scale multiplier.
 * Chibi/cartoon = huge eyes, realistic = small, anime = medium-large.
 */
function styleEyeMultiplier(style: string): number {
  switch (style) {
    case 'chibi': return 2.0;
    case 'looney_tunes': case 'cartoon': case 'cn_flat': return 1.8;
    case 'shonen': case 'trigger': return 1.4;
    case 'anime': case 'ufotable': case 'kyoani': return 1.3;
    case 'ghibli': case 'disney_2d': return 1.2;
    case 'seinen': return 1.0;
    case 'realistic': case 'film_vfx': case 'game_realism': return 0.8;
    case 'noir': return 0.9;
    case 'pixel': case 'pixel_8bit': case 'pixel_16bit': return 1.1;
    default: return 1.0;
  }
}

/**
 * Compile face GLSL code for a given set of face parameters.
 * Returns GLSL that modifies the `body` SDF variable by adding face features.
 */
export function compileFace(face: FaceParams): string {
  const hr = face.headRadius;
  const hy = face.headY;
  const styleMul = styleEyeMultiplier(face.style);

  const eyeSize = hr * 0.12 * face.eyeScale * styleMul;
  const eyeSpacing = hr * 0.28 * face.eyeSpacing;
  const eyeHeight = hy + hr * 0.15 * face.eyeHeight;
  const eyeDepth = hr * 0.85;
  const pupilSize = eyeSize * 0.5 * face.pupilScale;
  const noseSize = hr * 0.06 * face.noseSize;
  const mouthW = hr * 0.2 * face.mouthWidth;
  const mouthH = hy - hr * 0.2 * face.mouthHeight;
  const earSize = hr * 0.15 * face.earScale;

  // Species-specific face modifications
  const isSnout = ['quadruped', 'serpentine'].includes(face.species) ||
    face.species === 'dragon' || face.species === 'wolf' || face.species === 'canine' ||
    face.species === 'feline' || face.species === 'beast';
  const isRobot = face.species === 'robot' || face.species === 'mech' || face.species === 'mechanical' ||
    face.species === 'golem' || face.species === 'automaton';
  const isUndead = face.species === 'skeleton' || face.species === 'zombie' || face.species === 'lich' ||
    face.species === 'ghost' || face.species === 'wraith';
  const isElf = face.species === 'elf' || face.species === 'fairy';
  const isDragon = face.species === 'dragon' || face.species === 'drake' || face.species === 'wyvern';

  let glsl = `
  // ── Face Features ──────────────────────────
  vec3 headCenter = vec3(0.0, ${f(hy)}, 0.0);
  float faceForward = ${f(eyeDepth)};`;

  // Eyes
  if (isRobot) {
    // Robot: rectangular eye sockets
    glsl += `
  // Robot eye sockets (sdBox carving)
  vec3 eyePR = p; eyePR.x = abs(eyePR.x);
  float eyeSocket = sdBox(eyePR - vec3(${f(eyeSpacing)}, ${f(eyeHeight)}, faceForward), vec3(${f(eyeSize * 1.2)}, ${f(eyeSize * 0.6)}, ${f(eyeSize)}));
  body = max(body, -eyeSocket - 0.005);`;
  } else if (isUndead) {
    // Undead: deep hollow eye sockets
    glsl += `
  // Undead deep eye sockets
  vec3 eyePU = p; eyePU.x = abs(eyePU.x);
  float deepSocket = sdSphere(eyePU - vec3(${f(eyeSpacing)}, ${f(eyeHeight)}, ${f(eyeDepth * 0.9)}), ${f(eyeSize * 1.8)});
  body = max(body, -deepSocket);`;
  } else {
    // Standard/anime/cartoon eyes: spherical carving into head
    glsl += `
  // Eyes (carved into head)
  vec3 eyeP = p; eyeP.x = abs(eyeP.x);
  float eyeCarve = sdSphere(eyeP - vec3(${f(eyeSpacing)}, ${f(eyeHeight)}, faceForward), ${f(eyeSize)});
  body = max(body, -eyeCarve - 0.003);`;

    // Pupils (small spheres inside eye sockets — raised from surface)
    glsl += `
  // Pupils (raised dots in eye sockets)
  float pupil = sdSphere(eyeP - vec3(${f(eyeSpacing)}, ${f(eyeHeight)}, ${f(eyeDepth + eyeSize * 0.3)}), ${f(pupilSize)});
  body = smin(body, pupil, 0.005);`;
  }

  // Nose
  if (isSnout || isDragon) {
    // Snout: elongated ellipsoid forward from head
    const snoutLen = isDragon ? hr * 0.6 : hr * 0.35;
    glsl += `
  // Snout (elongated forward)
  float snout = sdEllipsoid(p - vec3(0.0, ${f(hy - hr * 0.1)}, ${f(hr + snoutLen * 0.3)}), vec3(${f(hr * 0.25)}, ${f(hr * 0.15)}, ${f(snoutLen)}));
  body = smin(body, snout, ${f(hr * 0.1)});`;
  } else if (!isRobot) {
    // Standard nose: small sphere protrusion
    glsl += `
  // Nose
  float nose = sdSphere(p - vec3(0.0, ${f(hy - hr * 0.05)}, ${f(hr * 0.95)}), ${f(noseSize)});
  body = smin(body, nose, 0.02);`;
  }

  // Mouth
  if (isUndead) {
    // Skeleton teeth: row of tiny capsules
    glsl += `
  // Teeth row
  vec3 teethP = p - vec3(0.0, ${f(mouthH)}, ${f(eyeDepth * 0.95)});
  teethP.x = abs(teethP.x);
  float teeth = sdCapsule(teethP, ${f(hr * 0.005)}, ${f(hr * 0.02)});
  // Repeat for tooth row
  vec3 tRP = teethP; tRP.x = mod(tRP.x + 0.01, 0.02) - 0.01;
  float toothRow = sdCapsule(tRP, ${f(hr * 0.005)}, ${f(hr * 0.015)});
  body = smin(body, toothRow, 0.005);`;
  } else if (!isRobot) {
    // Standard mouth: horizontal capsule subtraction carved into face
    glsl += `
  // Mouth (carved line)
  float mouthCarve = sdCapsule(vec3(abs(p.x), p.y - ${f(mouthH)}, p.z - ${f(eyeDepth * 0.95)}), ${f(mouthW)}, ${f(hr * 0.015)});
  body = max(body, -mouthCarve - 0.002);`;
  }

  // Ears
  if (isElf) {
    // Pointed elf ears: elongated upward
    glsl += `
  // Pointed ears (elf/fairy)
  vec3 earP = p; earP.x = abs(earP.x);
  vec3 earPos = vec3(${f(hr * 0.95)}, ${f(hy + hr * 0.3)}, 0.0);
  float ears = sdEllipsoid(earP - earPos, vec3(${f(earSize * 0.2)}, ${f(earSize * 2.0)}, ${f(earSize * 0.15)}));
  body = smin(body, ears, 0.02);`;
  } else if (isDragon) {
    // Dragon: no external ears, but horn bases
    // Horns are already handled in main body plan
  } else if (face.species === 'feline' || face.species === 'cat' || face.species === 'canine') {
    // Cat/dog pointed ears on top of head
    glsl += `
  // Pointed animal ears
  vec3 earP = p; earP.x = abs(earP.x);
  float animalEars = sdCone(earP - vec3(${f(hr * 0.55)}, ${f(hy + hr * 1.0)}, 0.0), ${f(earSize * 0.4)}, ${f(earSize * 1.2)});
  body = smin(body, animalEars, 0.02);`;
  } else if (!isRobot && !isUndead && !isSnout) {
    // Standard humanoid ears: side-mounted ellipsoids
    glsl += `
  // Ears
  vec3 earP = p; earP.x = abs(earP.x);
  float ears = sdEllipsoid(earP - vec3(${f(hr * 0.92)}, ${f(hy)}, 0.0), vec3(${f(earSize * 0.3)}, ${f(earSize)}, ${f(earSize * 0.2)}));
  body = smin(body, ears, 0.03);`;
  }

  // Robot: antenna
  if (isRobot) {
    glsl += `
  // Antenna
  float antenna = sdCapsule(p - vec3(0.0, ${f(hy + hr * 1.1)}, 0.0), ${f(hr * 0.3)}, ${f(hr * 0.02)});
  float antennaTip = sdSphere(p - vec3(0.0, ${f(hy + hr * 1.4)}, 0.0), ${f(hr * 0.04)});
  body = smin(body, min(antenna, antennaTip), 0.01);`;
  }

  return glsl;
}

/** Default face parameters when genes don't specify them. */
export function defaultFaceParams(headRadius: number, headY: number, species: string, style: string): FaceParams {
  return {
    headRadius,
    headY,
    eyeScale: 1.0,
    eyeSpacing: 1.0,
    eyeHeight: 1.0,
    pupilScale: 1.0,
    mouthWidth: 1.0,
    mouthHeight: 1.0,
    noseSize: 1.0,
    earScale: 1.0,
    species,
    style,
  };
}
