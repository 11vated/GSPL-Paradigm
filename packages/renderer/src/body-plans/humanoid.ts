import type { BodyPlan, SDFParams } from '../types.js';

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
    const tw = f(p.torsoWidth);
    const th = f(p.torsoHeight);
    const hr = f(p.headRadius);
    const lt = f(p.limbThickness);
    const ll = f(p.limbLength);
    const nl = f(p.neckLength);

    let glsl = `
  // Torso
  float torso = sdCapsule(p - vec3(0.0, 0.0, 0.0), ${th}, ${tw});
  // Head
  float head = sdSphere(p - vec3(0.0, ${f(p.torsoHeight + p.neckLength + p.headRadius)}, 0.0), ${hr});
  // Neck
  float neck = sdCapsule(p - vec3(0.0, ${f(p.torsoHeight)}, 0.0), ${nl}, ${f(p.limbThickness * 0.8)});

  // Arms (symmetric)
  vec3 armP = p;
  armP.x = abs(armP.x);
  vec3 armStart = vec3(${f(p.torsoWidth + 0.05)}, ${f(p.torsoHeight * 0.8)}, 0.0);
  vec3 armLocal = armP - armStart;
  armLocal = rotZ(armLocal, 0.3 + sin(u_time * 2.0) * 0.08);
  float arms = sdCapsule(armLocal, ${ll}, ${lt});

  // Legs (symmetric)
  vec3 legP = p;
  legP.x = abs(legP.x);
  vec3 legStart = vec3(${f(p.torsoWidth * 0.5)}, -0.05, 0.0);
  vec3 legLocal = legP - legStart;
  float phase = p.x > 0.0 ? 1.0 : -1.0;
  legLocal = rotX(legLocal, sin(u_time * 3.0) * 0.15 * phase);
  float legs = sdCapsule(legLocal - vec3(0.0, -0.05, 0.0), ${f(p.limbLength * 1.1)}, ${f(p.limbThickness * 1.1)});

  // Combine with smooth blending
  float body = smin(torso, neck, ${k});
  body = smin(body, head, ${k});
  body = smin(body, arms, ${f(p.blendSmoothness * 0.6)});
  body = smin(body, legs, ${f(p.blendSmoothness * 0.6)});`;

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
