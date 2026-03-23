# GSPL — Next Steps Guide for Claude

## CURRENT STATE (What You're Walking Into)

You have a **98K LOC working system across 52 packages**. The full pipeline is functional:

```
User types concept → Agent parses intent → Ontology analyzes → Seed compiled (13-16 genes)
→ GLSL SDF shader generated (7,700-8,600 chars) → Artifacts forged (20+ types)
```

**What WORKS end-to-end:**
- Chat → entity creation (create_seed tool)
- Ontology v2 detection (14 styles: ghibli, shonen, ufotable, looney_tunes, noir, cyberpunk, pixel, chibi, realistic, anime, etc.)
- Body plan selection (winged, quadruped, floating, mechanical, humanoid, serpentine, amorphous, multi_limbed)
- Element detection (fire, ice, lightning, nature, dark, shadow, etc.)
- Style-specific GLSL shader rendering (each of 14 styles produces distinct shader)
- Power system compilation (reservoirs, expression types, progression stages)
- Transformation chains (Awakened → Mastered with visual phases)
- GLSL shader quality (10/10 markers: SDF primitives, cel-shading, PBR, outlines, animation, noise, lighting, tone mapping)
- 20+ artifact types (HTML game, sprite sheet JSON, character sheet, SVG logo, GLSL fragment, etc.)
- Behavior trees auto-generated from archetype genes
- Procedural content (Markov names, noise heightmaps)
- WebGL2 renderer (SeedPreview.tsx + WebGLRenderer.tsx exist and compile shaders)
- Full REST API with SSE real-time updates
- React UI with Zustand state management
- SQLite persistence
- Agent with 8 specializations, works WITHOUT LLM

**Key packages and their sizes:**
- @paradigm/agent: 9,194 LOC (8 specializations, reasoning/, autonomy/, tools/)
- @paradigm/llm: 5,453 LOC (NLP compiler, 4 LLM providers)
- @paradigm/ui: 4,982 LOC (React + WebGL2 + 12 components)
- @paradigm/web: 4,662 LOC (REST API, WebSocket, SSE)
- @paradigm/lang: 3,895 LOC (expression language compiler)
- @paradigm/forge: 3,034 LOC (20+ artifact types)
- @paradigm/3d: 3,063 LOC (mesh generation, glTF)
- @paradigm/store: 2,930 LOC (SQLite + memory adapters)
- @paradigm/sprites: 2,528 LOC (PixelArtGenerator exists)
- @paradigm/evolution: 2,340 LOC (complete GA)
- @paradigm/concept: 2,150 LOC (ISCA + ConceptToEntityPipeline)
- @paradigm/renderer: 1,147 LOC (compileSeedShader() → GLSL)
- @paradigm/seed: 1,335 LOC (create, mutate, breed with 5 strategies)
- @paradigm/ontology: 949 LOC (Taxonomy<T>, trie parser)

---

## THE 5 CRITICAL GAPS (Priority Order)

These are the gaps between "working pipeline" and "the most advanced platform ever built." They should be addressed in this order because each one unlocks the next.

---

### GAP 1: AGENT ROUTING — The Brain Isn't Using Its Full Mind
**Priority: CRITICAL — Fix First**
**Estimated effort: 1-2 sessions**

**Problem:** The agent ALWAYS routes to `create_seed` for creation intents. The more sophisticated `create_entity` tool (which returns full blueprints with concept analysis, morphology, personality, abilities) exists in the concept package but the intent router never selects it. The agent is thinking with one tool when it has eight.

**What to do:**
1. Open `@paradigm/agent/src/tools/seed-tools.ts` and `@paradigm/llm/src/index.ts` (NLP compiler)
2. Find the intent → tool routing logic
3. Upgrade the routing so that:
   - Simple creation ("make a fire orb") → `create_seed` (fast path)
   - Complex creation ("create a chibi lightning dragon with plasma breath and storm aura") → `create_entity` via `ConceptToEntityPipeline` (full path with ontology analysis, 12-dimension decomposition, constraint solving)
   - The agent should DETECT complexity based on: number of concepts, presence of style modifiers, presence of ability descriptions, presence of personality/lore hints
4. Wire `EnhancedConceptPipeline` from `@paradigm/concept` into the agent's `SEED_ARCHITECT` specialization
5. Ensure the `create_entity` path returns the full `EntityBlueprint` (concept + seed + skeleton + spriteConfig), not just the seed

**Success criteria:** "Create a ghibli forest spirit with nature healing powers and a gentle personality" should produce a seed with ALL 12 dimensions populated (identity, morphology, appearance, personality, power system, style, etc.), not just basic genes.

**Also fix:** Agent response format uses `reply` field but consumers may expect `message`. Standardize to one field name across the entire API surface.

---

### GAP 2: VISUAL RENDERING — Entities Need to Be SEEN
**Priority: HIGH — This is the demo**
**Estimated effort: 2-3 sessions**

**Problem:** The SDF shaders are mathematically correct but only render inside a WebGL canvas. The `SeedPreview.tsx` (73 LOC) and `WebGLRenderer.tsx` (188 LOC) exist but the connection between "agent creates seed" → "user sees animated entity on screen" needs to be bulletproof.

**What to do:**
1. Verify `WebGLRenderer.tsx` correctly:
   - Accepts a compiled GLSL shader from `compileSeedShader()`
   - Sets up uniforms (time, resolution, mouse)
   - Runs animation loop
   - Handles errors gracefully (shader compilation failure → fallback)
2. Connect the pipeline end-to-end in the UI:
   - User types in `ChatPanel.tsx`
   - Agent creates seed
   - Seed appears in `SeedCard.tsx`
   - Clicking seed opens `SeedPreview.tsx` with live WebGL rendering
   - Preview shows the actual SDF entity animated in real-time
3. Add **style-specific post-processing** to the renderer:
   - Anime/Shonen: cel-shading with hard shadow edges, outline extraction
   - Chibi: round everything, enlarge head SDF, reduce limb SDFs
   - Ghibli: soft watercolor gradient, pastel color palette
   - Pixel: snap SDF output to pixel grid, limit color palette
   - Realistic: enable PBR material, subsurface scattering, ambient occlusion
   - Looney Tunes: exaggerate squash/stretch uniforms, bold outlines
4. Add **animation uniforms** to shaders:
   - `u_time` for procedural animation (breathing, idle sway, aura pulse)
   - `u_emotion` for emotional state changes (0.0=calm → 1.0=rage changes aura color)
   - `u_transform` for transformation state (0.0=base → 1.0=transformed changes geometry+color)

**Success criteria:** User creates "shonen fire dragon" and SEES an animated, fire-auraed, winged dragon form rendered live in the browser with style-appropriate cel-shading and outline.

---

### GAP 3: SPRITE PIPELINE — Connect Concept → Actual Pixel Output
**Priority: HIGH — Needed for 2D use cases**
**Estimated effort: 2-3 sessions**

**Problem:** `@paradigm/sprites` has a `PixelArtGenerator` that produces procedural pixel grids. The forge produces sprite sheet JSON metadata. But these two aren't connected — you can't go from concept → actual pixel sprite frames.

**What to do:**
1. Read `@paradigm/sprites/src/` thoroughly — understand what PixelArtGenerator produces
2. Connect the pipeline:
   ```
   Concept → ConceptToEntityPipeline → EntityBlueprint → PixelArtGenerator → actual pixel frames
   ```
3. The EntityBlueprint contains `spriteConfig` with frameWidth, frameHeight, animations, fps. Use these to drive the pixel generator.
4. Generate actual animation frames:
   - Idle (breathing, slight sway)
   - Walk cycle (4-8 frames based on body plan)
   - Attack (melee/ranged based on archetype)
   - Hit reaction
   - Death
   - Special ability (element-specific VFX frames)
5. Output as:
   - Individual PNG frames
   - Assembled sprite sheet (single PNG with all frames in grid)
   - Sprite sheet JSON with frame coordinates, timing, hitboxes
6. Body plan drives animation set:
   - Humanoid: walk, run, attack, jump, cast, idle, death
   - Quadruped: walk, run, pounce, bite, idle, death
   - Winged: fly, dive, breath attack, hover, land, idle, death
   - Floating: drift, pulse, absorb, project, idle, death

**Success criteria:** "Create a pixel art fire knight" produces an actual downloadable sprite sheet PNG with walk cycle, attack, idle, and death animations — correctly proportioned, correctly colored, correctly styled.

---

### GAP 4: ONTOLOGY DEPTH — The Knowledge Needs to Match the Vision
**Priority: MEDIUM-HIGH — Powers the intelligence**
**Estimated effort: 3-4 sessions**

**Problem:** The ontology package (949 LOC) has the framework (Taxonomy<T>, trie parser, matchKeywords) but the actual taxonomy DATA isn't fully populated to the depth described in the Master Prompt. The ISCA keyword maps in concept (21 archetypes, 8 body types, 10 elements) are a good start but shallow compared to the full vision (hierarchical species trees, studio-specific style parameters, universal power system abstraction).

**What to do:**
1. **Populate the Species Taxonomy** with full inheritance tree:
   - Humanoid → Human, Elf, Dwarf, Orc, Giant, Fairy, Demon, Angel
   - Beast → Mammal → Canine/Feline/Ursine/Equine, Reptile, Avian, Aquatic, Insect, Amphibian
   - Mythical → Dragon, Griffin, Unicorn, Basilisk, Hydra, Chimera, Cerberus, Phoenix
   - Undead → Skeleton, Zombie, Lich, Vampire, Ghost, Wraith, Revenant
   - Construct → Golem, Robot, Automaton, Mech, AI Entity
   - Elemental → Fire/Water/Earth/Air/Lightning/Ice/Shadow/Light
   - Cosmic → Celestial, Astral, Void Walker, Eldritch
   - Plant → Treant, Myconid, Vine Creature, Flower Spirit
   - Each node must carry: default morphology, default proportions, default animations, compatible elements, compatible abilities

2. **Populate the Style Taxonomy** with studio-level depth:
   - Anime → Shonen (proportion rules, shading, animation techniques), Seinen, Chibi, Ghibli, Ufotable, Trigger, KyoAni
   - Each style node carries: head-to-body ratio, eye size, line weight, shading method, frame rate preference, squash-stretch percentage, exaggeration level
   - This data DIRECTLY feeds the renderer — style selection should parameterize the shader

3. **Implement the Universal Power System** in the ontology:
   - Every power system decomposes into: Energy Reservoir + Conversion Layer + Expression Mechanism + Limitation System + Progression
   - Pre-populate: Ki, Chakra, Nen, Devil Fruit, Stands, Quirks, Cursed Energy, Haki, Reiatsu, The Force, Bending, Magic (D&D/HP/FF), Superhero powers, Toon Force
   - When concept mentions "ki" or "energy blast" → maps to Ki-type power system automatically
   - When concept mentions "chakra" or "jutsu" → maps to Chakra-type with nature typing
   - Unknown power descriptions get classified to nearest matching system

4. **Implement the Transformation System** in the ontology:
   - Transformation types: power-up chain, mode switch, weapon release, awakening, fusion, equipment, emotional trigger
   - Each transformation carries: trigger condition, visual progression phases, power multiplier, new abilities, costs, revert condition
   - Pre-populate common chains: SSJ line, Naruto modes, Bleach releases, Devil Fruit awakening

5. **Connect ontology data to the concept pipeline:**
   - When ConceptToEntityPipeline runs, it should query all 6 taxonomies
   - Species match → inherit default morphology + animations
   - Style match → inherit rendering parameters
   - Power keywords → auto-assign power system with correct mechanics
   - Element match → set elemental affinity + weakness chain

**Success criteria:** "Ufotable-style demon slayer with water breathing techniques and a transformation sequence" should automatically:
- Detect Ufotable style → set cinematic lighting, 2D/3D hybrid rendering, high particle density
- Detect "demon slayer" → humanoid, combat archetype, sword weapon
- Detect "water breathing" → water element, melee ability type, flowing visual effects
- Detect "transformation" → staged power-up with visual phases
- Produce a seed where ALL of this is encoded in genes, not just keyword matches

---

### GAP 5: THE GSPL AGENT INTELLIGENCE TIERS — From Reactive to Creative
**Priority: MEDIUM — The differentiator**
**Estimated effort: 4-5 sessions (ongoing)**

**Problem:** The agent has 8 specializations and impressive reasoning infrastructure (9,194 LOC), but it's currently operating at Tier 1 (reactive — responds to direct commands). The vision calls for Tier 2-4 (compositional, proactive, creative).

**What to do:**

**Tier 2 — Compositional Intelligence:**
1. Agent handles complex multi-concept inputs:
   - "chibi undead frost dragon with trickster personality and time magic"
   - Must decompose into 6+ taxonomy matches, detect conflicts, resolve them, discover emergent properties
2. Implement the **Concept Composer** logic:
   - ice + dragon + undead = emergent "Frostlich Wyrm" with frost breath + necrotic aura + skeletal wings
   - chibi + realistic = CONFLICT → suggest resolution or hybrid
   - warrior + healer = merged personality → paladin tendencies
3. Wire this through the agent so multi-concept inputs produce richer seeds than simple ones

**Tier 3 — Proactive Intelligence:**
1. After creating a protagonist, agent SUGGESTS: "This hero needs a rival. Want me to generate a shadow counterpart with opposing elements?"
2. After creating an entity with incomplete abilities, agent SUGGESTS: "This fire mage has no defensive ability. Should I add a flame shield?"
3. Implement gap detection: analyze a seed's 12 dimensions, find empty/weak ones, suggest improvements
4. Wire into ChatPanel so suggestions appear naturally in conversation

**Tier 4 — Creative Intelligence:**
1. "Surprise me" → agent traverses UNEXPLORED regions of concept space
2. Finds novel combinations that haven't been created yet
3. Uses the Knowledge Accumulator to know what EXISTS and deliberately go somewhere NEW
4. Generates entities that are genuinely original, not just random gene combinations

**Success criteria:** User creates three entities and the agent proactively says: "I notice these three form a natural team — a damage dealer, a support, and a tank. Want me to generate their nemesis team with counter-abilities?"

---

## EXECUTION ORDER

```
Session 1-2:  GAP 1 (Agent Routing) — unlock full concept pipeline
Session 3-5:  GAP 2 (Visual Rendering) — make entities VISIBLE
Session 5-7:  GAP 3 (Sprite Pipeline) — produce actual pixel output
Session 7-11: GAP 4 (Ontology Depth) — power the intelligence with deep data
Session 11+:  GAP 5 (Agent Tiers) — make the agent truly intelligent
```

Each gap builds on the previous. Don't skip ahead — the agent can't be "creative" (Gap 5) if the ontology isn't deep enough (Gap 4), the ontology isn't useful if entities can't be seen (Gap 2-3), and nothing works right if the agent routes to the wrong tool (Gap 1).

---

## IMPORTANT CONTEXT

- **This is a pnpm workspace monorepo** with Turborepo. Build with `pnpm build`, test with `pnpm test`.
- **TypeScript 5.7.0 strict mode.** No `any`, no `as` except at I/O boundaries. Result<T,E> at module boundaries.
- **All randomness through DeterministicRNG** (Mulberry32 PRNG) for reproducible output.
- **The agent works WITHOUT LLM** — pure TypeScript algorithms. LLM (Ollama, local, free) is optional enhancement.
- **Zero external AI dependencies for core pipeline.** The intelligence is NATIVE.
- **52 packages exist.** Don't create new ones without checking if the functionality already exists somewhere.
- **The renderer produces GLSL shaders.** Entities are rendered via SDF (Signed Distance Fields) — mathematical shapes, not bitmaps. Resolution independent.
- **The forge produces artifacts** (HTML games, character sheets, logos, sprite metadata, GLSL files, etc.)

## THE ACID TEST (Always Keep This In Mind)

Can GSPL handle ALL THREE of these with equal mastery?

1. **"Goku going Super Saiyan Blue with Kamehameha"** → correct body, spiky blue hair, ki power system, SSJ chain, beam ability with VFX, fighting personality, orange gi + blue aura

2. **"Photorealistic medieval knight with frost magic"** → film-VFX quality rendering, PBR plate armor, mana power system, ice school, breath mist particles, stoic personality, clanking armor sounds

3. **"Looney Tunes cartoon cat with hammerspace hammer"** → flat cartoon style, toon force physics, gravity delay, hammerspace ability, slapstick behavior, 200% squash/stretch, slide whistle sounds

When all three render with equal mastery from the same pipeline, GSPL has achieved its vision.

---

## START by reading this document, then confirm you understand the current state and which gap you're tackling first.
