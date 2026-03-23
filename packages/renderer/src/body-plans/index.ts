import type { BodyPlan } from '../types.js';
import { humanoidPlan } from './humanoid.js';
import { quadrupedPlan } from './quadruped.js';
import { serpentinePlan } from './serpentine.js';
import { amorphousPlan } from './amorphous.js';
import { floatingPlan } from './floating.js';

/** Registry of all parametric body plans, keyed by bodyStructure gene value. */
const BODY_PLANS: Record<string, BodyPlan> = {
  humanoid: humanoidPlan,
  quadruped: quadrupedPlan,
  winged: humanoidPlan,    // Winged uses humanoid base (wings added via appendage genes)
  serpentine: serpentinePlan,
  amorphous: amorphousPlan,
  mechanical: humanoidPlan, // Mechanical uses humanoid skeleton
  multi_limbed: humanoidPlan, // Multi-limbed starts humanoid (future: extra limb genes)
  floating: floatingPlan,
};

/** Get the body plan for a given bodyStructure gene value. Falls back to humanoid. */
export function getBodyPlan(bodyStructure: string): BodyPlan {
  return BODY_PLANS[bodyStructure] ?? humanoidPlan;
}

/** List all available body plan names. */
export function getAvailableBodyPlans(): string[] {
  return Object.keys(BODY_PLANS);
}
