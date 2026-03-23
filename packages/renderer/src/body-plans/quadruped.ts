import type { BodyPlan, SDFParams } from '../types.js';

const f = (n: number): string => n.toFixed(4);

/** Quadruped body plan — four-legged form. All dimensions from genes. */
export const quadrupedPlan: BodyPlan = {
  name: 'quadruped',

  compile(p: SDFParams): string {
    const k = f(p.blendSmoothness);

    let glsl = `
  // Torso (horizontal ellipsoid)
  float torso = sdEllipsoid(p, vec3(${f(p.torsoWidth)}, ${f(p.torsoHeight * 0.6)}, ${f(p.torsoHeight)}));
  // Head
  vec3 headPos = vec3(0.0, ${f(p.torsoHeight * 0.4)}, ${f(p.torsoHeight + p.neckLength)});
  float head = sdSphere(p - headPos, ${f(p.headRadius)});
  // Snout
  float snout = sdEllipsoid(p - headPos - vec3(0.0, ${f(-p.headRadius * 0.2)}, ${f(p.headRadius * 0.8)}), vec3(${f(p.headRadius * 0.6)}, ${f(p.headRadius * 0.4)}, ${f(p.headRadius * 0.7)}));
  head = smin(head, snout, ${f(p.blendSmoothness * 0.8)});

  // Four legs (symmetric pairs)
  vec3 legP = p;
  legP.x = abs(legP.x);
  float frontLegs = sdCylinder(legP - vec3(${f(p.torsoWidth * 0.7)}, ${f(-p.torsoHeight * 0.4)}, ${f(p.torsoHeight * 0.6)}), ${f(p.limbLength * 0.8)}, ${f(p.limbThickness)});
  float backLegs = sdCylinder(legP - vec3(${f(p.torsoWidth * 0.7)}, ${f(-p.torsoHeight * 0.4)}, ${f(-p.torsoHeight * 0.6)}), ${f(p.limbLength * 0.9)}, ${f(p.limbThickness * 1.1)});

  float body = smin(torso, head, ${k});
  body = smin(body, frontLegs, ${k});
  body = smin(body, backLegs, ${k});`;

    if (p.hasTail) {
      glsl += `
  // Tail
  vec3 tailP = p - vec3(0.0, ${f(p.torsoHeight * 0.2)}, ${f(-p.torsoHeight - 0.05)});
  tailP.x += sin(tailP.z * 5.0 + u_time * 2.5) * 0.05;
  float tail = sdCapsule(rotX(tailP, 2.2), ${f(p.tailLength)}, ${f(p.limbThickness * 0.5)});
  body = smin(body, tail, ${k});`;
    }

    if (p.hasWings) {
      glsl += `
  vec3 wingP = p;
  wingP.x = abs(wingP.x);
  wingP -= vec3(${f(p.torsoWidth * 0.5)}, ${f(p.torsoHeight * 0.5)}, 0.0);
  wingP = rotZ(wingP, sin(u_time * 2.0) * 0.4 + 0.25);
  float wings = sdBox(wingP - vec3(${f(p.wingSpan * 0.5)}, 0.0, 0.0), vec3(${f(p.wingSpan * 0.5)}, 0.015, ${f(p.wingSpan * 0.25)}));
  body = smin(body, wings, ${f(p.blendSmoothness * 0.5)});`;
    }

    if (p.hasHorns) {
      glsl += `
  vec3 hornP = p - headPos - vec3(0.0, ${f(p.headRadius * 0.8)}, 0.0);
  hornP.x = abs(hornP.x);
  hornP -= vec3(${f(p.headRadius * 0.4)}, 0.0, 0.0);
  hornP = rotZ(hornP, -0.3);
  float horns = sdCone(hornP, ${f(p.hornSize * 0.3)}, ${f(p.hornSize)});
  body = smin(body, horns, 0.03);`;
    }

    glsl += `
  return body;`;
    return glsl;
  },
};
