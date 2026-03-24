import type { BodyPlan, SDFParams } from '../types.js';

const f = (n: number): string => n.toFixed(4);

/** Serpentine body plan — chain of spheres with wave motion. Gene-driven. */
export const serpentinePlan: BodyPlan = {
  name: 'serpentine',

  compile(p: SDFParams): string {
    const segmentCount = 10;

    return `
  float body = 100.0;
  for (int i = 0; i < ${segmentCount}; i++) {
    float fi = float(i);
    float t = fi / ${f(segmentCount - 1)};
    float r = mix(${f(p.headRadius)}, ${f(p.limbThickness)}, t);
    vec3 pos = vec3(
      sin(t * 8.0 + u_time * 2.5) * ${f(p.torsoWidth * 0.8)},
      sin(t * 4.0 + u_time) * ${f(p.torsoHeight * 0.3)},
      -t * ${f(p.torsoHeight * 3.0)} + ${f(p.torsoHeight)}
    );
    body = smin(body, sdSphere(p - pos, r), ${f(p.blendSmoothness * 1.5)});
  }
  return body;`;
  },
};
