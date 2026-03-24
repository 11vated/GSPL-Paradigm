import type { BodyPlan, SDFParams } from '../types.js';
import { compileFace, defaultFaceParams } from '../body-parts/face.js';
import { compileSpeciesDetail } from '../body-parts/species-detail.js';
import { compileHair, inferHairStyle } from '../body-parts/hair.js';
import { compileEquipment, inferEquipment } from '../body-parts/equipment.js';

/** Format number for GLSL (always has decimal point). */
const f = (n: number): string => n.toFixed(4);

/**
 * Humanoid body plan — parametric bipedal form.
 * All dimensions come from gene values.
 */
export const humanoidPlan: BodyPlan = {
  name: 'humanoid',

  compile(p: SDFParams): string {
    const k = f(p.blendSmoothness);
    const exag = p.exaggeration ?? 0.5;
    const htb = p.headToBodyRatio ?? 0.2;
    const musc = p.muscularity ?? 0.5;

    // v3: Morphology-driven proportions
    // Chibi (exag > 0.7): head 40% of body, stubby limbs
    // Muscular (musc > 0.7): wider torso, thicker limbs
    // Fairy (htb > 0.35): large head, thin body
    const headScale = 1.0 + exag * 0.8 + Math.max(0, htb - 0.2) * 2.0;
    const limbScale = 1.0 - exag * 0.3;
    const torsoScale = 1.0 + musc * 0.3;
    const limbThickScale = 1.0 + musc * 0.4 - exag * 0.2;

    const tw = f(p.torsoWidth * torsoScale);
    const th = f(p.torsoHeight * (1.0 - exag * 0.2));
    const hr = f(p.headRadius * headScale);
    const lt = f(p.limbThickness * limbThickScale);
    const ll = f(p.limbLength * limbScale);
    const nl = f(p.neckLength * (1.0 - exag * 0.4));

    const torsoH = p.torsoHeight * (1.0 - exag * 0.2);
    const neckL = p.neckLength * (1.0 - exag * 0.4);
    const headR = p.headRadius * headScale;

    let glsl = `
  // Torso (morphology-scaled: exag=${f(exag)}, musc=${f(musc)})
  float torso = sdCapsule(p - vec3(0.0, 0.0, 0.0), ${th}, ${tw});
  // Head (scaled by headToBodyRatio + exaggeration)
  float head = sdSphere(p - vec3(0.0, ${f(torsoH + neckL + headR)}, 0.0), ${hr});
  // Neck
  float neck = sdCapsule(p - vec3(0.0, ${f(torsoH)}, 0.0), ${nl}, ${f(p.limbThickness * 0.8 * limbThickScale)});

  // Arms (symmetric, morphology-scaled)
  vec3 armP = p;
  armP.x = abs(armP.x);
  vec3 armStart = vec3(${f(p.torsoWidth * torsoScale + 0.05)}, ${f(torsoH * 0.8)}, 0.0);
  vec3 armLocal = armP - armStart;
  armLocal = rotZ(armLocal, 0.3 + sin(u_time * 2.0) * 0.08);
  float arms = sdCapsule(armLocal, ${ll}, ${lt});

  // Legs (symmetric, morphology-scaled)
  vec3 legP = p;
  legP.x = abs(legP.x);
  vec3 legStart = vec3(${f(p.torsoWidth * torsoScale * 0.5)}, -0.05, 0.0);
  vec3 legLocal = legP - legStart;
  float phase = p.x > 0.0 ? 1.0 : -1.0;
  legLocal = rotX(legLocal, sin(u_time * 3.0) * 0.15 * phase);
  float legs = sdCapsule(legLocal - vec3(0.0, -0.05, 0.0), ${f(p.limbLength * limbScale * 1.1)}, ${f(p.limbThickness * limbThickScale * 1.1)});

  // Combine with smooth blending
  float body = smin(torso, neck, ${k});
  body = smin(body, head, ${k});
  body = smin(body, arms, ${f(p.blendSmoothness * 0.6)});
  body = smin(body, legs, ${f(p.blendSmoothness * 0.6)});`;

    // Face features (eyes, nose, mouth, ears — species/style driven)
    const species = p.species ?? 'human';
    const style = p.style ?? 'default';
    const archetype = p.archetype ?? 'unknown';
    const headYPos = torsoH + neckL + headR;
    const faceParams = defaultFaceParams(headR, headYPos, species, style);
    glsl += compileFace(faceParams);

    // Species-specific detail (spine ridges, whiskers, panel lines, etc.)
    glsl += compileSpeciesDetail({
      species, headRadius: headR, headY: headYPos,
      torsoHeight: torsoH, torsoWidth: p.torsoWidth * torsoScale,
      limbThickness: p.limbThickness * limbThickScale,
      hasHorns: p.hasHorns, hornSize: p.hornSize,
      hasTail: p.hasTail, tailLength: p.tailLength,
    });

    // Hair (style/species driven)
    const hairStyle = inferHairStyle(archetype, species, style);
    glsl += compileHair({
      headRadius: headR, headY: headYPos,
      hairLength: hairStyle === 'bald' || hairStyle === 'fur' ? 0 : 0.08 + exag * 0.05,
      hairStyle, species,
    });

    // Equipment (archetype-driven armor + weapons)
    const equip = inferEquipment(archetype);
    glsl += compileEquipment({
      torsoWidth: p.torsoWidth * torsoScale, torsoHeight: torsoH,
      headRadius: headR, headY: headYPos,
      limbThickness: p.limbThickness * limbThickScale,
      archetype, species,
      hasArmor: equip.hasArmor, hasWeapon: equip.hasWeapon,
      weaponType: equip.weaponType,
    });

    // Appendages
    if (p.hasWings) {
      glsl += `
  // Wings
  vec3 wingP = p;
  wingP.x = abs(wingP.x);
  wingP -= vec3(${f(p.torsoWidth)}, ${f(p.torsoHeight * 0.7)}, 0.05);
  wingP = rotZ(wingP, sin(u_time * 2.5) * 0.35 + 0.3);
  float wings = sdBox(wingP - vec3(${f(p.wingSpan * 0.5)}, 0.0, 0.0), vec3(${f(p.wingSpan * 0.5)}, 0.015, ${f(p.wingSpan * 0.3)}));
  body = smin(body, wings, ${f(p.blendSmoothness * 0.5)});`;
    }

    if (p.hasTail) {
      glsl += `
  // Tail
  vec3 tailP = p - vec3(0.0, 0.0, ${f(p.torsoWidth)});
  tailP.x += sin(tailP.z * 4.0 + u_time * 2.0) * 0.08;
  float tail = sdCapsule(rotX(tailP, 1.8), ${f(p.tailLength)}, ${f(p.limbThickness * 0.6)});
  body = smin(body, tail, ${k});`;
    }

    if (p.hasHorns) {
      glsl += `
  // Horns
  vec3 hornP = p - vec3(0.0, ${f(p.torsoHeight + p.neckLength + p.headRadius * 1.5)}, 0.0);
  hornP.x = abs(hornP.x);
  hornP -= vec3(${f(p.headRadius * 0.6)}, 0.0, 0.0);
  hornP = rotZ(hornP, -0.4);
  float horns = sdCone(hornP, ${f(p.hornSize * 0.4)}, ${f(p.hornSize)});
  body = smin(body, horns, 0.03);`;
    }

    glsl += `
  return body;`;

    return glsl;
  },
};
