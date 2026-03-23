# GSPL Rendering Upgrade Guide — From Primitives to Characters

## THE PROBLEM

The current SDF renderer produces abstract primitive assemblies — capsules and spheres stuck together. A dragon looks like warm-toned blobs. Goku looks like colored cylinders. The math is correct (SDF primitives, smooth blending, style-specific shading, element effects), but the **geometry library is too sparse** to produce recognizable characters.

The shading pipeline is actually excellent — 14 styles, PBR, cel-shading, element effects, interactive uniforms. The problem is what's BEING shaded: featureless shapes.

## THE FIX — 8 LAYERS OF DETAIL

Work through these in order. Each layer compounds on the previous. After all 8, the same shader compiler and style pipeline will produce dramatically richer output.

---

### LAYER 1: FACES (Critical — This alone transforms everything)

**Location:** Create `/packages/renderer/src/body-parts/face.ts`
**Modify:** Every body plan's `compile()` to call face generation

Heads are currently bare spheres. Adding eyes, nose, mouth makes entities instantly recognizable as characters instead of abstract shapes.

```glsl
// Face features as SDF operations on the head sphere
float face(vec3 p, float headRadius, float style) {
  float head = sdSphere(p, headRadius);

  // Eyes — two negative spheres carved into the head
  float eyeSize = headRadius * 0.12;        // Gene: eyeScale
  float eyeSpacing = headRadius * 0.28;      // Gene: eyeSpacing
  float eyeHeight = headRadius * 0.15;       // Gene: eyeHeight
  float eyeDepth = headRadius * 0.85;        // How far into head

  vec3 eyePos = vec3(eyeSpacing, eyeHeight, eyeDepth);
  float leftEye = sdSphere(p - eyePos, eyeSize);
  float rightEye = sdSphere(p - vec3(-eyePos.x, eyePos.y, eyePos.z), eyeSize);

  // Pupils — smaller spheres inside eye sockets (different color in material pass)
  float pupilSize = eyeSize * 0.5;          // Gene: pupilScale
  float leftPupil = sdSphere(p - (eyePos + vec3(0.0, 0.0, eyeSize * 0.3)), pupilSize);
  float rightPupil = sdSphere(p - (vec3(-eyePos.x, eyePos.y, eyePos.z) + vec3(0.0, 0.0, eyeSize * 0.3)), pupilSize);

  // Mouth — horizontal capsule subtracted from lower face
  float mouthWidth = headRadius * 0.2;       // Gene: mouthWidth
  float mouthHeight = headRadius * -0.2;     // Gene: mouthHeight
  float mouth = sdCapsule(p - vec3(0.0, mouthHeight, eyeDepth), mouthWidth, headRadius * 0.04);

  // Nose — small sphere or cone protruding
  float noseSize = headRadius * 0.06;        // Gene: noseSize
  float nose = sdSphere(p - vec3(0.0, 0.0, headRadius * 0.95), noseSize);

  // Ears — side-mounted ellipsoids (species-dependent)
  float earSize = headRadius * 0.15;         // Gene: earScale
  vec3 earPos = vec3(headRadius * 0.9, eyeHeight * 0.5, 0.0);
  float leftEar = sdEllipsoid(p - earPos, vec3(earSize * 0.3, earSize, earSize * 0.2));
  float rightEar = sdEllipsoid(p - vec3(-earPos.x, earPos.y, earPos.z), vec3(earSize * 0.3, earSize, earSize * 0.2));

  // Assembly
  head = smin(head, nose, 0.02);       // Add nose
  head = smin(head, leftEar, 0.03);    // Add ears
  head = smin(head, rightEar, 0.03);
  // Eyes, pupils, and mouth are handled in the material function for color

  return head;
}
```

**Style-driven face scaling:**
- **Chibi/SD**: eyeSize *= 2.0, eyeSpacing *= 1.3 (huge eyes, wide apart)
- **Shonen**: eyeSize *= 1.4, sharper eye shape (angular socket subtraction)
- **Seinen/Realistic**: eyeSize *= 0.8, more detailed nose, thinner mouth
- **Looney Tunes**: eyeSize *= 1.8, mouth *= 2.0 (enormous eyes and mouth)
- **Pixel**: eyeSize quantized to grid steps

**Species-driven face variation:**
- **Beast/quadruped**: snout instead of nose (elongated ellipsoid), eyes on sides, no visible ears
- **Dragon**: elongated snout, slit pupils, no external ears, horn base protrusions
- **Undead/skeleton**: deeper eye sockets (larger subtraction), no nose, exposed teeth (tiny capsule row)
- **Construct/robot**: rectangular eye sockets (sdBox subtraction), no nose, panel mouth
- **Fairy/elf**: pointed ears (elongated ear ellipsoid)

**Material pass for face colors:**
In the material section of the shader, detect face regions by position:
```glsl
vec3 getMaterial(vec3 p, vec3 baseColor) {
  // Eye white region
  if (length(p.xz - eyePos.xz) < eyeSize * 1.2 && abs(p.y - eyePos.y) < eyeSize) {
    return vec3(0.95); // White
  }
  // Pupil region
  if (length(p.xz - pupilPos.xz) < pupilSize * 1.2) {
    return accentColor; // Eye color from seed genes
  }
  // Mouth interior
  if (p.y < mouthHeight && p.z > eyeDepth * 0.9) {
    return vec3(0.15, 0.05, 0.05); // Dark mouth interior
  }
  return baseColor;
}
```

---

### LAYER 2: MORPHOLOGY-DRIVEN PROPORTIONS (Makes every entity unique)

**Location:** Modify each file in `/packages/renderer/src/body-plans/`
**Also modify:** `/packages/renderer/src/gene-extractor.ts`

Currently all humanoids have similar proportions regardless of archetype or species. The seed genes contain morphology data but it's not feeding into the body plan compilation.

**Extract and apply these genes:**

```typescript
// In gene-extractor.ts — add these extractions
const morphology = {
  headToBodyRatio: getNumeric(genes, 'morphology.headToBodyRatio', 0.2, 0.1, 0.5),
  limbLengthRatio: getNumeric(genes, 'morphology.limbToBodyRatio', 0.4, 0.2, 0.7),
  shoulderWidth: getNumeric(genes, 'morphology.shoulderToHipRatio', 1.0, 0.5, 2.0),
  exaggeration: getNumeric(genes, 'morphology.exaggeration', 0.5, 0.0, 1.0),
  muscularity: getNumeric(genes, 'morphology.muscularity', 0.5, 0.0, 1.0),
};
```

**Apply in body plan compilation:**

```glsl
// Chibi (exaggeration > 0.7): head 40% of body height, stubby limbs
float headR = baseHeadRadius * mix(1.0, 2.0, exaggeration);
float limbLen = baseLimbLength * mix(1.0, 0.5, exaggeration);
float torsoH = baseTorsoHeight * mix(1.0, 0.6, exaggeration);

// Muscular characters (muscularity > 0.7): wider torso, thicker limbs
float torsoW = baseTorsoWidth * mix(1.0, 1.5, muscularity);
float limbW = baseLimbWidth * mix(1.0, 1.4, muscularity);

// Fairy/small (headToBodyRatio > 0.35): large head, thin body
// Giant (headToBodyRatio < 0.15): tiny head, massive body
```

This alone means a fairy, an ogre, and a knight LOOK different even before face/equipment.

---

### LAYER 3: SPECIES-SPECIFIC GEOMETRY (Dragon ≠ Unicorn ≠ Spider)

**Location:** Create `/packages/renderer/src/body-plans/species-variants.ts`

Instead of "all dragons use the humanoid plan with wings", create species-aware modifications:

**Dragon variant:**
- Elongated snout (sdEllipsoid extending forward from head)
- Horns (two sdCone from top of head, swept backward)
- Spine ridges (repeated sdCone along back, using domain repetition)
- Tail with spaded tip (sdCapsule chain + sdCone at end)
- Wings with membrane (sdBox with sine-wave edge displacement)
- Scale texture (use Voronoi noise in material function)

**Cat/Feline variant (for Looney Tunes cat):**
- Pointed ears (two tall sdCone from top of head)
- Whisker lines (thin sdCapsule extending from snout sides)
- Curved tail (sdCapsule with high-frequency sine bend)
- Padded paws (slightly flattened sdSphere at leg endpoints)

**Robot/Mech variant:**
- Boxy head (sdBox instead of sdSphere)
- Angular torso (sdBox instead of sdCapsule)
- Cylindrical joints (visible sdCylinder at shoulders, elbows, knees)
- Panel lines (use step() in material for hard color edges)
- Antenna/sensor (thin sdCylinder from head)

**Ghost/Spirit variant:**
- Teardrop body (sphere smoothly merging into tapered cone downward)
- No legs — flowing lower body
- Ethereal trail (decreasing-radius sphere chain below body)
- Transparency effect (in material: alpha based on y-position)

---

### LAYER 4: HANDS AND FEET (Endpoints matter)

**Location:** Modify body plan compile functions

Currently limbs are simple capsules that end abruptly. Adding terminal segments:

```glsl
// Hand — sphere cluster at arm endpoint
vec3 handPos = armEnd; // where the arm capsule terminates
float palm = sdSphere(p - handPos, limbWidth * 0.6);
// Fingers — 4 small capsules fanned out
float fingers = sdCapsule(p - (handPos + vec3(0.03, 0.0, 0.05)), limbWidth * 0.08, limbWidth * 0.15);
// ... repeat for other fingers with slight angle variation
float hand = smin(palm, fingers, 0.01);

// Foot — flattened ellipsoid at leg endpoint
vec3 footPos = legEnd;
float foot = sdEllipsoid(p - footPos, vec3(limbWidth * 0.5, limbWidth * 0.3, limbWidth * 0.8));
```

**Species variations:**
- Humanoid: 4-finger hands, shoe-shaped feet
- Beast/quadruped: paw (sdSphere, larger) with claw tips (tiny sdCone)
- Bird: talons (3 long sdCone spread)
- Robot: gripper (sdBox fingers)
- Skeleton: bony fingers (thin sdCapsule, no palm sphere)

---

### LAYER 5: HAIR AND FUR (Silhouette definition)

**Location:** Create `/packages/renderer/src/body-parts/hair.ts`

Hair is critical for character identity. Goku's spiky hair, a knight's flowing mane, a cat's fur — these define silhouettes.

**Approach: Hair volume as SDF shell + noise displacement**

```glsl
// Hair volume — expanded head shape with directional bias
float hairVolume(vec3 p, float headRadius, float hairLength, float hairStyle) {
  // Base hair shell — slightly larger sphere
  float shell = sdSphere(p - headPos, headRadius * 1.1) - hairLength;

  // Style modifications:
  if (hairStyle == SPIKY) {
    // Spiky hair: upward bias + high-frequency noise
    shell -= fbm(p * 8.0) * hairLength * 0.5;   // Noise spikes
    shell -= max(0.0, p.y - headPos.y) * 0.3;     // Upward bias
  }
  else if (hairStyle == LONG_FLOWING) {
    // Long hair: downward extension
    float falloff = smoothstep(headPos.y, headPos.y - hairLength * 2.0, p.y);
    shell = sdCapsule(p - headPos, headRadius * 0.8, hairLength) * falloff;
    shell -= sin(p.x * 5.0 + u_time * 2.0) * 0.02; // Wind sway
  }
  else if (hairStyle == SHORT) {
    // Short hair: tight cap
    shell = sdSphere(p - headPos, headRadius * 1.05) - hairLength * 0.3;
  }
  else if (hairStyle == MOHAWK) {
    // Mohawk: ridge along top
    float ridge = sdBox(p - (headPos + vec3(0.0, headRadius * 0.5, 0.0)),
                        vec3(0.02, hairLength, headRadius * 0.3));
    shell = min(shell, ridge);
  }

  return shell;
}
```

**Hair color** is separate from body color — use hair region detection in material pass.

**Fur** for beasts: Instead of hair volume, use noise displacement on the entire body surface:
```glsl
// Fur effect — noise displacement on body SDF
float furBody = body - fbm(p * furFrequency) * furLength;
```

---

### LAYER 6: EQUIPMENT AND ARMOR (Identity layer)

**Location:** Create `/packages/renderer/src/body-parts/equipment.ts`

A knight without armor is just a bald humanoid. Equipment is identity.

**Armor as SDF shell:**
```glsl
// Plate armor — expanded torso with hard edges
float armor(vec3 p, float torsoSDF) {
  // Chest plate — slightly larger box around torso
  float chestPlate = sdBox(p - torsoPos, vec3(torsoWidth * 1.1, torsoHeight * 0.5, torsoWidth * 0.6));

  // Shoulder guards — spheres at shoulder positions
  float shoulderL = sdSphere(p - vec3(shoulderWidth, shoulderY, 0.0), 0.08);
  float shoulderR = sdSphere(p - vec3(-shoulderWidth, shoulderY, 0.0), 0.08);

  // Helmet — expanded head with visor slit
  float helmet = sdSphere(p - headPos, headRadius * 1.15);
  float visorSlit = sdBox(p - (headPos + vec3(0.0, eyeHeight, headRadius)),
                          vec3(headRadius * 0.6, 0.01, 0.1));
  helmet = max(helmet, -visorSlit); // Carve visor opening

  // Belt — torus at waist
  float belt = sdTorus(p - vec3(0.0, torsoBottom, 0.0), vec2(torsoWidth * 0.9, 0.02));

  return smin(smin(chestPlate, shoulderL, 0.02), smin(shoulderR, helmet, 0.02), 0.01);
}
```

**Weapon SDF:**
```glsl
// Sword — rotated capsule + cone
float sword(vec3 p, vec3 handPos) {
  vec3 swordP = p - handPos;
  float blade = sdCapsule(swordP, 0.01, 0.4);  // Thin, long
  float hilt = sdCapsule(swordP - vec3(0.0, -0.02, 0.0), 0.03, 0.05); // Short, wider
  float guard = sdBox(swordP - vec3(0.0, 0.0, 0.0), vec3(0.05, 0.005, 0.015)); // Cross guard
  return min(min(blade, hilt), guard);
}

// Staff — long capsule with orb
float staff(vec3 p, vec3 handPos) {
  float shaft = sdCapsule(p - handPos, 0.015, 0.6);
  float orb = sdSphere(p - (handPos + vec3(0.0, 0.6, 0.0)), 0.04);
  return min(shaft, orb);
}
```

**Equipment material** uses metallic/roughness genes — armor reflects light differently from skin.

---

### LAYER 7: PROCEDURAL PATTERNS AND TEXTURES (Visual richness)

**Location:** Create `/packages/renderer/src/textures.ts`

Instead of flat colors, apply procedural patterns based on species/style:

```glsl
// Scales (dragons, reptiles)
float scalePattern(vec3 p, float scale) {
  vec2 id = floor(p.xz * scale);
  float d = length(fract(p.xz * scale) - 0.5);
  return smoothstep(0.4, 0.35, d); // Returns 0 or 1 for scale boundary
}

// Stripes (tigers, zebras)
float stripePattern(vec3 p, float frequency, float thickness) {
  return smoothstep(thickness, thickness - 0.05, abs(sin(p.x * frequency + fbm(p * 2.0) * 2.0)));
}

// Circuit lines (robots, cyberpunk)
float circuitPattern(vec3 p, float scale) {
  vec2 grid = fract(p.xz * scale);
  float lines = min(smoothstep(0.02, 0.0, abs(grid.x - 0.5)),
                    smoothstep(0.02, 0.0, abs(grid.y - 0.5)));
  return lines;
}

// Wood grain (treants, staffs)
float woodGrain(vec3 p) {
  float rings = sin(length(p.xz) * 20.0 + fbm(p * 4.0) * 5.0);
  return rings * 0.5 + 0.5;
}

// Bone texture (skeletons, undead)
float boneTexture(vec3 p) {
  return fbm(p * 15.0) * 0.3; // High-frequency noise for porous appearance
}
```

**Apply in material function based on species gene:**
```glsl
vec3 getMaterial(vec3 p, vec3 baseColor, int species) {
  if (species == DRAGON || species == REPTILE) {
    float scales = scalePattern(p, 30.0);
    baseColor = mix(baseColor, baseColor * 0.7, scales);
  }
  else if (species == TIGER) {
    float stripes = stripePattern(p, 8.0, 0.15);
    baseColor = mix(baseColor, vec3(0.05), stripes);
  }
  else if (species == ROBOT) {
    float circuits = circuitPattern(p, 10.0);
    baseColor = mix(baseColor, accentColor, circuits * 0.5);
  }
  return baseColor;
}
```

---

### LAYER 8: ADVANCED ANIMATION (Bring them to life)

**Location:** Modify `/packages/renderer/src/body-plans/` animation sections

Current animation is just sine waves. Add:

**Walk cycle (driven by u_time uniform):**
```glsl
// Walk cycle — alternating leg/arm swing
float walkPhase = u_time * walkSpeed;
float legSwing = sin(walkPhase) * 0.3;           // ±0.3 radians
float armSwing = sin(walkPhase + 3.14) * 0.2;    // Opposite to legs
float hipBob = abs(sin(walkPhase * 2.0)) * 0.02; // Double frequency bob

// Apply to limb positions with rotation
mat2 legRotL = mat2(cos(legSwing), -sin(legSwing), sin(legSwing), cos(legSwing));
mat2 legRotR = mat2(cos(-legSwing), -sin(-legSwing), sin(-legSwing), cos(-legSwing));
```

**Idle variation (driven by emotion uniform):**
```glsl
// Emotion-driven idle
float idleBreath = sin(u_time * breathSpeed) * breathAmp;
float idleSway = sin(u_time * 0.7) * swayAmp * (1.0 - u_emotion * 0.5); // Tenser when emotional
float idleBob = sin(u_time * 1.1) * bobAmp;

// Anger: faster breathing, clenched posture (reduce sway, increase breath)
// Sadness: slower everything, slouched (increase bob downward)
// Joy: bouncier (increase bob amplitude, add extra sway frequency)
```

**Transformation animation (driven by u_transform uniform):**
```glsl
// Transformation visual — blend between base and transformed state
float transformProgress = u_transform; // 0.0 = base, 1.0 = fully transformed

// Scale change (power-ups often increase size)
float transformScale = mix(1.0, 1.3, transformProgress);
p /= transformScale;

// Aura intensity increases
float auraIntensity = mix(0.0, 1.0, transformProgress);

// Color shift (SSJ: black hair → gold → blue)
vec3 transformColor = mix(baseHairColor, transformHairColor, transformProgress);

// Particle density increases
float particleCount = mix(0.0, 50.0, transformProgress);
```

---

## IMPLEMENTATION ORDER

```
Session 1:  LAYER 1 (Faces) + LAYER 2 (Proportions)
            → Entities become recognizable humanoids/creatures

Session 2:  LAYER 3 (Species variants) + LAYER 4 (Hands/Feet)
            → Dragon looks like dragon, cat looks like cat

Session 3:  LAYER 5 (Hair) + LAYER 6 (Equipment)
            → Characters have identity (Goku's spiky hair, knight's armor)

Session 4:  LAYER 7 (Textures) + LAYER 8 (Animation)
            → Entities have visual richness and come alive
```

## THE GENE PIPELINE

Every new visual feature needs a gene in the seed. The pipeline is:

```
Concept → Ontology → Gene → Shader Compilation → WebGL Render
                      ↑
           gene-extractor.ts reads this
```

For each new visual layer, you need:
1. **New gene definitions** in `@paradigm/types` (e.g., `eyeScale`, `hairStyle`, `armorType`)
2. **Gene population** in `@paradigm/concept` (ontology → appropriate gene values)
3. **Gene extraction** in `@paradigm/renderer/src/gene-extractor.ts`
4. **GLSL generation** in the body plan's `compile()` function
5. **Material handling** in the shader's color/lighting section

The compiler, WebGL renderer, and UI don't need changes — they already handle whatever GLSL the body plans produce.

## SUCCESS CRITERIA

After all 8 layers, the same 6 entities from the screenshot should look like:

- **Goku SSJ Blue**: Recognizable humanoid with spiky blue hair, large anime eyes, orange gi (chest plate SDF), muscular proportions, blue energy aura, fighting stance
- **Photorealistic Knight**: Detailed armored humanoid with plate helmet (visor slit), metal texture, frost particle effects on armor, human face with realistic proportions
- **Looney Tunes Cat**: Exaggerated feline with huge eyes, pointed ears, whiskers, curved tail, cartoon-flat shading, oversized paws
- **Chibi Lightning Dragon**: Tiny body with enormous head, stubby wings, big round eyes, lightning element aura, cute proportions
- **Ghibli Forest Spirit**: Soft teardrop form with gentle face, nature texture, watercolor shading, floating motion, organic warmth
- **Cyberpunk Mech**: Boxy angular form with panel lines, circuit textures, glowing eyes, antenna, mechanical joints visible

Each recognizably different. Each faithful to its style. Each driven by the same compiler pipeline.
