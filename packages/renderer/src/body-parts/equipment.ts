/**
 * Equipment SDF Module — Adds armor, weapons, and accessories.
 *
 * A knight without armor is just a bald humanoid. Equipment is identity.
 * Armor as expanded SDF shells, weapons as composed primitives.
 */

const f = (n: number): string => n.toFixed(4);

export interface EquipmentParams {
  readonly torsoWidth: number;
  readonly torsoHeight: number;
  readonly headRadius: number;
  readonly headY: number;
  readonly limbThickness: number;
  readonly archetype: string;
  readonly species: string;
  readonly hasArmor: boolean;
  readonly hasWeapon: boolean;
  readonly weaponType: string;   // 'sword' | 'staff' | 'bow' | 'axe' | 'shield' | 'none'
}

/**
 * Compile equipment GLSL. Returns code that adds armor/weapons to the `body` SDF.
 */
export function compileEquipment(params: EquipmentParams): string {
  let glsl = '';

  // ── Armor ──────────────────────────────────
  if (params.hasArmor) {
    const tw = params.torsoWidth;
    const th = params.torsoHeight;
    const hr = params.headRadius;
    const hy = params.headY;

    // Chest plate (expanded box around torso)
    glsl += `
  // ── Armor ──────────────────────────
  // Chest plate
  float chestPlate = sdBox(p - vec3(0.0, ${f(th * 0.4)}, 0.0), vec3(${f(tw * 1.15)}, ${f(th * 0.45)}, ${f(tw * 0.65)}));
  chestPlate = opRound(chestPlate, 0.02);
  body = smin(body, chestPlate, 0.01);`;

    // Shoulder guards
    glsl += `
  // Shoulder guards
  vec3 shP = p; shP.x = abs(shP.x);
  float shoulderGuard = sdSphere(shP - vec3(${f(tw * 1.1 + 0.05)}, ${f(th * 0.75)}, 0.0), ${f(tw * 0.22)});
  body = smin(body, shoulderGuard, 0.015);`;

    // Belt
    glsl += `
  // Belt
  float belt = sdTorus(vec3(p.x, p.y + 0.01, p.z) - vec3(0.0, 0.0, 0.0), ${f(tw * 0.95)}, 0.018);
  body = smin(body, belt, 0.01);`;

    // Helmet (for knight/paladin/guard archetypes)
    if (['knight', 'paladin', 'guard', 'warrior'].includes(params.archetype)) {
      glsl += `
  // Helmet (expanded head with visor slit)
  float helmet = sdSphere(p - vec3(0.0, ${f(hy)}, 0.0), ${f(hr * 1.18)});
  float visorSlit = sdBox(p - vec3(0.0, ${f(hy)}, ${f(hr * 1.1)}), vec3(${f(hr * 0.6)}, ${f(hr * 0.08)}, 0.05));
  helmet = max(helmet, -visorSlit);
  body = smin(body, helmet, 0.01);`;
    }
  }

  // ── Weapons ────────────────────────────────
  if (params.hasWeapon) {
    const armEndX = params.torsoWidth + params.limbThickness * 3;
    const armEndY = params.torsoHeight * 0.3;

    switch (params.weaponType) {
      case 'sword':
        glsl += `
  // Sword (blade + crossguard + hilt)
  vec3 swordP = p - vec3(${f(armEndX + 0.05)}, ${f(armEndY - 0.1)}, 0.05);
  swordP = rotZ(swordP, -0.2);
  float blade = sdCapsule(swordP, 0.35, 0.012);
  float hilt = sdCapsule(swordP - vec3(0.0, -0.02, 0.0), 0.05, 0.02);
  float guard = sdBox(swordP - vec3(0.0, 0.0, 0.0), vec3(0.04, 0.005, 0.012));
  float sword = min(min(blade, hilt), guard);
  body = min(body, sword);`;
        break;

      case 'staff':
        glsl += `
  // Staff (long shaft + orb)
  vec3 staffP = p - vec3(${f(armEndX + 0.03)}, 0.0, 0.03);
  float shaft = sdCapsule(staffP, 0.55, 0.015);
  float orb = sdSphere(staffP - vec3(0.0, 0.55, 0.0), 0.04);
  // Orb glow handled in material pass
  body = min(body, min(shaft, orb));`;
        break;

      case 'bow':
        glsl += `
  // Bow (curved capsule + string)
  vec3 bowP = p - vec3(${f(armEndX + 0.05)}, ${f(armEndY)}, 0.05);
  float bowArm = sdCapsule(rotZ(bowP, 0.3), 0.25, 0.01);
  float bowArm2 = sdCapsule(rotZ(bowP, -0.3), 0.25, 0.01);
  body = min(body, min(bowArm, bowArm2));`;
        break;

      case 'axe':
        glsl += `
  // Axe (handle + head)
  vec3 axeP = p - vec3(${f(armEndX + 0.05)}, ${f(armEndY)}, 0.05);
  axeP = rotZ(axeP, -0.3);
  float axeHandle = sdCapsule(axeP, 0.3, 0.012);
  float axeHead = sdBox(axeP - vec3(0.03, 0.25, 0.0), vec3(0.06, 0.04, 0.008));
  body = min(body, min(axeHandle, axeHead));`;
        break;

      case 'shield':
        glsl += `
  // Shield (rounded box on left arm)
  vec3 shieldP = p - vec3(${f(-armEndX - 0.03)}, ${f(armEndY + 0.05)}, 0.06);
  float shield = sdRoundBox(shieldP, vec3(0.06, 0.08, 0.015), 0.01);
  body = min(body, shield);`;
        break;
    }
  }

  return glsl;
}

/** Infer equipment from archetype. */
export function inferEquipment(archetype: string): { hasArmor: boolean; hasWeapon: boolean; weaponType: string } {
  switch (archetype) {
    case 'knight': case 'paladin': case 'guard':
      return { hasArmor: true, hasWeapon: true, weaponType: 'sword' };
    case 'warrior': case 'berserker':
      return { hasArmor: true, hasWeapon: true, weaponType: 'axe' };
    case 'mage': case 'summoner': case 'healer':
      return { hasArmor: false, hasWeapon: true, weaponType: 'staff' };
    case 'archer': case 'ranger':
      return { hasArmor: false, hasWeapon: true, weaponType: 'bow' };
    case 'rogue': case 'assassin':
      return { hasArmor: false, hasWeapon: true, weaponType: 'sword' };
    default:
      return { hasArmor: false, hasWeapon: false, weaponType: 'none' };
  }
}
