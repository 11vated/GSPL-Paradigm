import type { BodyPlan, SDFParams } from '../types.js';

const f = (n: number): string => n.toFixed(4);

/** Amorphous body plan — noise-displaced blob. Gene values control size and blobiness. */
export const amorphousPlan: BodyPlan = {
  name: 'amorphous',

  compile(p: SDFParams): string {
    return `
  float core = sdSphere(p - vec3(0.0, sin(u_time) * 0.04, 0.0), ${f(p.torsoWidth * 1.5)});
  float blob1 = sdSphere(p - vec3(${f(p.torsoWidth * 0.6)}, -0.08 + sin(u_time * 1.3) * 0.08, ${f(p.torsoWidth * 0.5)}), ${f(p.torsoWidth)});
  float blob2 = sdSphere(p - vec3(${f(-p.torsoWidth * 0.6)}, -0.08 + sin(u_time * 1.6) * 0.08, ${f(-p.torsoWidth * 0.4)}), ${f(p.torsoWidth * 1.1)});
  float body = smin(core, blob1, ${f(p.blendSmoothness * 3.0)});
  body = smin(body, blob2, ${f(p.blendSmoothness * 3.0)});
  // Noise displacement for organic wobble
  body += sin(p.x * 12.0 + u_time) * sin(p.y * 12.0) * sin(p.z * 12.0) * 0.04;
  // Eyes
  float eyeL = sdSphere(p - vec3(-${f(p.headRadius * 0.5)}, ${f(p.torsoWidth * 0.3)}, ${f(p.torsoWidth * 1.2)}), ${f(p.headRadius * 0.2)});
  float eyeR = sdSphere(p - vec3(${f(p.headRadius * 0.5)}, ${f(p.torsoWidth * 0.3)}, ${f(p.torsoWidth * 1.2)}), ${f(p.headRadius * 0.2)});
  body = max(body, -min(eyeL, eyeR));
  return body;`;
  },
};
