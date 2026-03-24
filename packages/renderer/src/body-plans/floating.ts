import type { BodyPlan, SDFParams } from '../types.js';

const f = (n: number): string => n.toFixed(4);

/** Floating body plan — ethereal teardrop form with wavy lower edge. */
export const floatingPlan: BodyPlan = {
  name: 'floating',

  compile(p: SDFParams): string {
    return `
  // Main body: sphere-based teardrop
  float body = sdSphere(p - vec3(0.0, 0.1, 0.0), ${f(p.torsoWidth * 1.3)});
  float cutTop = sdSphere(p - vec3(0.0, ${f(p.torsoWidth * 2.0)}, 0.0), ${f(p.torsoWidth * 1.1)});
  body = max(body, -cutTop);
  // Wavy lower edge
  vec3 tp = p - vec3(0.0, ${f(-p.torsoHeight * 0.6)}, 0.0);
  tp.x += sin(tp.y * 6.0 + u_time * 2.0) * 0.06;
  tp.z += cos(tp.y * 5.0 + u_time * 1.5) * 0.05;
  float trail = length(vec2(length(tp.xz), tp.y)) - ${f(p.torsoWidth * 0.8)};
  trail = max(trail, -p.y - 0.05);
  body = smin(body, trail, ${f(p.blendSmoothness * 1.5)});
  // Eye hollows
  float eyeL = sdSphere(p - vec3(-${f(p.headRadius * 0.5)}, 0.12, -${f(p.torsoWidth * 0.9)}), ${f(p.headRadius * 0.25)});
  float eyeR = sdSphere(p - vec3(${f(p.headRadius * 0.5)}, 0.12, -${f(p.torsoWidth * 0.9)}), ${f(p.headRadius * 0.25)});
  body = max(body, -eyeL);
  body = max(body, -eyeR);
  return body;`;
  },
};
