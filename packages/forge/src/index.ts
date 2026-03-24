/**
 * @paradigm/forge — Artifact generation engine for UniversalSeed.
 *
 * Routes seeds through domain-specialized forgers to produce fully-formed
 * web pages, SVGs, GLSL shaders, SQL schemas, JSON configs, and more.
 * All randomness is driven by DeterministicRNG for reproducible output.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, Gene } from '@paradigm/types';
import { DeterministicRNG, generatePalette, srgbToHex } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

/** All artifact types producible by the Forge system. */
export type ArtifactType =
  | 'html_page'
  | 'html_game'
  | 'website'
  | 'api_spec'
  | 'documentation'
  | 'presentation'
  | 'logo'
  | 'color_palette'
  | 'icon'
  | 'source_code'
  | 'shader'
  | 'database_schema'
  | 'test_suite'
  | 'character_sheet'
  | 'world_map'
  | 'sprite_sheet'
  | 'particle_config'
  | 'soundtrack'
  | 'sound_effect'
  | 'physics_sim'
  | 'sprite_entity';

/** Options controlling artifact generation. */
export interface ForgeOptions {
  type: ArtifactType;
  format?: string;
  quality?: 'draft' | 'standard' | 'high';
  width?: number;
  height?: number;
  theme?: 'dark' | 'light';
}

/** A generated artifact with full content and metadata. */
export interface Artifact {
  type: ArtifactType;
  name: string;
  content: string;
  mimeType: string;
  size: number;
  metadata: Record<string, unknown>;
}

/** Protocol all forgers must implement. */
export interface ForgerStrategy {
  name: string;
  supportedTypes: ArtifactType[];
  canForge(type: ArtifactType): boolean;
  forge(seed: UniversalSeed, options: ForgeOptions): Artifact;
}

// ─────────────────────────────────────────────
// Gene Extraction Helpers
// ─────────────────────────────────────────────

/**
 * Safely extract a numeric value from a seed gene by key.
 * Falls back to provided default if gene is absent or non-numeric.
 */
function getNumericGene(seed: UniversalSeed, key: string, fallback: number): number {
  const gene: Gene | undefined = seed.genes[key];
  if (!gene) return fallback;
  if (gene.type === 'scalar') return gene.value;
  if (gene.type === 'vector' && gene.value.length > 0) return gene.value[0] ?? fallback;
  return fallback;
}

/**
 * Safely extract a string value from a seed gene by key.
 */
function getStringGene(seed: UniversalSeed, key: string, fallback: string): string {
  const gene: Gene | undefined = seed.genes[key];
  if (!gene) return fallback;
  if (gene.type === 'categorical') return gene.value;
  if (gene.type === 'expression') return gene.source;
  return fallback;
}

/**
 * Safely extract a number[] from a vector gene, or synthesize from any numeric gene.
 */
function getVectorGene(seed: UniversalSeed, key: string, fallback: number[]): number[] {
  const gene: Gene | undefined = seed.genes[key];
  if (!gene) return fallback;
  if (gene.type === 'vector') return gene.value;
  if (gene.type === 'scalar') return [gene.value];
  return fallback;
}

/** Collect all scalar gene values from a seed as an ordered array. */
function collectScalars(seed: UniversalSeed): number[] {
  return Object.values(seed.genes)
    .filter((g): g is Extract<Gene, { type: 'scalar' }> => g.type === 'scalar')
    .map((g) => g.value);
}

/** Collect all vector gene values from a seed, flattened. */
function collectVectors(seed: UniversalSeed): number[] {
  return Object.values(seed.genes)
    .filter((g): g is Extract<Gene, { type: 'vector' }> => g.type === 'vector')
    .flatMap((g) => g.value);
}

/** Collect all categorical gene values from a seed. */
function collectCategoricals(seed: UniversalSeed): string[] {
  return Object.values(seed.genes)
    .filter((g): g is Extract<Gene, { type: 'categorical' }> => g.type === 'categorical')
    .map((g) => g.value);
}

/** Clamp a value to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Derive a perceptually uniform color palette from a seed using OKLab color science.
 * Uses K-means++ in OKLab space via @paradigm/rng for maximally distinct colors.
 */
function deriveColors(
  seed: UniversalSeed,
  _rng: DeterministicRNG,
): { primary: string; secondary: string; accent: string; background: string; text: string } {
  // Generate 5 perceptually distinct colors from seed hash
  const palette = generatePalette(seed.$hash, 5, {
    minLightness: 0.35,
    maxLightness: 0.75,
    minChroma: 0.06,
    maxChroma: 0.18,
  });

  // Generate background (high lightness, low chroma) and text (low lightness)
  const bgPalette = generatePalette(`${seed.$hash}:bg`, 2, {
    minLightness: 0.92,
    maxLightness: 0.97,
    minChroma: 0.01,
    maxChroma: 0.03,
  });

  const textPalette = generatePalette(`${seed.$hash}:text`, 2, {
    minLightness: 0.1,
    maxLightness: 0.2,
    minChroma: 0.01,
    maxChroma: 0.03,
  });

  return {
    primary: srgbToHex(palette[0] ?? { r: 0.4, g: 0.7, b: 0.5 }),
    secondary: srgbToHex(palette[1] ?? { r: 0.5, g: 0.6, b: 0.7 }),
    accent: srgbToHex(palette[2] ?? { r: 0.7, g: 0.4, b: 0.6 }),
    background: srgbToHex(bgPalette[0] ?? { r: 0.95, g: 0.95, b: 0.96 }),
    text: srgbToHex(textPalette[0] ?? { r: 0.12, g: 0.12, b: 0.15 }),
  };
}

/** Build an Artifact record from parts. */
function makeArtifact(
  type: ArtifactType,
  name: string,
  content: string,
  mimeType: string,
  metadata: Record<string, unknown>,
): Artifact {
  return { type, name, content, mimeType, size: content.length, metadata };
}

// ─────────────────────────────────────────────
// WebForger
// ─────────────────────────────────────────────

/** Generates web artifacts: HTML pages, games, API specs, documentation. */
export class WebForger implements ForgerStrategy {
  readonly name = 'WebForger';
  readonly supportedTypes: ArtifactType[] = [
    'html_page',
    'html_game',
    'website',
    'api_spec',
    'documentation',
    'presentation',
  ];

  canForge(type: ArtifactType): boolean {
    return (this.supportedTypes as string[]).includes(type);
  }

  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    switch (options.type) {
      case 'html_page':
      case 'website':
        return this.forgeHTMLPage(seed, options);
      case 'html_game':
        return this.forgeHTMLGame(seed, options);
      case 'api_spec':
        return this.forgeAPISpec(seed, options);
      case 'documentation':
      case 'presentation':
        return this.forgeDocumentation(seed, options);
      default:
        return this.forgeHTMLPage(seed, options);
    }
  }

  private forgeHTMLPage(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const title = seed.$name || `Paradigm Seed ${seed.$hash.slice(0, 8)}`;
    const domain = seed.$domain;
    const isDark = options.theme === 'dark';
    const bg = isDark ? '#0d0d0d' : colors.background;
    const fg = isDark ? '#e8e8e8' : colors.text;
    const categoricals = collectCategoricals(seed);
    const scalars = collectScalars(seed);

    const sections = categoricals.slice(0, 4).map((cat, i) => {
      const val = scalars[i] ?? rng.next();
      const pct = Math.round(clamp(val, 0, 1) * 100);
      return `<div class="section">
        <h3>${cat}</h3>
        <div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${colors.primary}"></div></div>
        <span class="pct">${pct}%</span>
      </div>`;
    });

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: ${bg}; color: ${fg}; min-height: 100vh; }
    header { background: ${colors.primary}; color: #fff; padding: 2rem; text-align: center; }
    header h1 { font-size: 2rem; font-weight: 700; letter-spacing: 0.05em; }
    header p { opacity: 0.85; margin-top: 0.5rem; }
    main { max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    .meta { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .badge { background: ${colors.secondary}; color: #fff; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem; }
    .section { margin-bottom: 1.5rem; }
    .section h3 { font-size: 1rem; margin-bottom: 0.4rem; text-transform: capitalize; }
    .bar-wrap { background: ${isDark ? '#333' : '#e0e0e0'}; border-radius: 4px; height: 10px; overflow: hidden; }
    .bar { height: 100%; border-radius: 4px; transition: width 0.3s; }
    .pct { font-size: 0.75rem; opacity: 0.6; margin-top: 0.2rem; display: block; }
    footer { text-align: center; padding: 2rem; opacity: 0.4; font-size: 0.75rem; }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <p>Domain: ${domain} &bull; Hash: ${seed.$hash.slice(0, 12)}</p>
  </header>
  <main>
    <div class="meta">
      <span class="badge">${domain}</span>
      <span class="badge">Gen ${seed.$lineage.generation}</span>
      ${seed.$metadata.tags?.map((t) => `<span class="badge">${t}</span>`).join('') ?? ''}
    </div>
    ${sections.length > 0 ? sections.join('\n    ') : '<p>No categorical genes available.</p>'}
  </main>
  <footer>Generated by @paradigm/forge &bull; Seed ${seed.$hash}</footer>
</body>
</html>`;
    return makeArtifact('html_page', `${seed.$name}.html`, content, 'text/html', {
      domain,
      hash: seed.$hash,
      generation: seed.$lineage.generation,
      colors,
    });
  }

  private forgeHTMLGame(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const title = `${seed.$name} — Arcade`;
    const speed = clamp(getNumericGene(seed, 'speed', rng.next() * 5 + 2), 1, 8);
    const enemyRate = clamp(getNumericGene(seed, 'rate', rng.next() * 2 + 0.5), 0.3, 3);
    const w = options.width ?? 480;
    const h = options.height ?? 360;

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { margin: 0; background: #0a0a0a; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: monospace; color: #fff; }
    canvas { border: 2px solid ${colors.primary}; display: block; }
    #ui { width: ${w}px; display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 0.85rem; }
    #msg { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); background: rgba(0,0,0,0.8); padding: 1rem 2rem; border-radius: 8px; text-align: center; display: none; }
  </style>
</head>
<body>
  <div id="ui"><span>Score: <b id="score">0</b></span><span>Lives: <b id="lives">3</b></span></div>
  <canvas id="c" width="${w}" height="${h}"></canvas>
  <div id="msg"><h2 id="msgText">Game Over</h2><p>Press Space to restart</p></div>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const msgEl = document.getElementById('msg');
    const msgText = document.getElementById('msgText');
    const W = ${w}, H = ${h};
    const PLAYER_SPEED = ${speed.toFixed(2)};
    const ENEMY_SPEED = ${(speed * 0.6).toFixed(2)};
    const ENEMY_INTERVAL = ${Math.round(1000 / enemyRate)};
    let state = 'playing';
    let score = 0, lives = 3;
    let player = { x: W/2, y: H - 40, w: 30, h: 20, vx: 0 };
    let bullets = [], enemies = [], particles = [];
    let keys = {};
    let lastEnemy = 0, lastShot = 0;
    document.addEventListener('keydown', e => {
      keys[e.key] = true;
      if (e.key === ' ') { e.preventDefault(); if (state === 'playing') shoot(); else if (state === 'over') restart(); }
    });
    document.addEventListener('keyup', e => { keys[e.key] = false; });
    function shoot() {
      const now = Date.now();
      if (now - lastShot < 200) return;
      lastShot = now;
      bullets.push({ x: player.x + player.w/2 - 2, y: player.y, w: 4, h: 10, vy: -8 });
    }
    function spawnEnemy() {
      const ex = Math.random() * (W - 24);
      enemies.push({ x: ex, y: -24, w: 24, h: 24, vy: ENEMY_SPEED, hp: 1 });
    }
    function spawnParticles(x, y, color) {
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particles.push({ x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 1, color });
      }
    }
    function collides(a, b) {
      return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
    }
    function restart() {
      score = 0; lives = 3; bullets = []; enemies = []; particles = [];
      player.x = W/2; player.y = H-40; state = 'playing';
      msgEl.style.display = 'none';
      scoreEl.textContent = '0'; livesEl.textContent = '3';
    }
    function update(now) {
      if (state !== 'playing') return;
      if (keys['ArrowLeft'] || keys['a']) player.x = Math.max(0, player.x - PLAYER_SPEED);
      if (keys['ArrowRight'] || keys['d']) player.x = Math.min(W - player.w, player.x + PLAYER_SPEED);
      bullets = bullets.filter(b => { b.y += b.vy; return b.y > -b.h; });
      enemies = enemies.filter(e => { e.y += e.vy; return e.y < H + e.h; });
      if (now - lastEnemy > ENEMY_INTERVAL) { spawnEnemy(); lastEnemy = now; }
      for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
          if (collides(bullets[i], enemies[j])) {
            spawnParticles(enemies[j].x + 12, enemies[j].y + 12, '${colors.accent}');
            bullets.splice(i, 1); enemies.splice(j, 1);
            score++; scoreEl.textContent = score; break;
          }
        }
      }
      for (let j = enemies.length - 1; j >= 0; j--) {
        if (collides(player, enemies[j])) {
          spawnParticles(player.x + 15, player.y + 10, '#ff4444');
          enemies.splice(j, 1); lives--;
          livesEl.textContent = lives;
          if (lives <= 0) { state = 'over'; msgEl.style.display = 'block'; msgText.textContent = 'Score: ' + score; }
        }
      }
      particles = particles.filter(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.06; return p.life > 0; });
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);
      if (state === 'playing' || state === 'over') {
        ctx.fillStyle = '${colors.primary}';
        ctx.beginPath(); ctx.moveTo(player.x, player.y+player.h); ctx.lineTo(player.x+player.w/2, player.y); ctx.lineTo(player.x+player.w, player.y+player.h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffee44';
        bullets.forEach(b => { ctx.fillRect(b.x, b.y, b.w, b.h); });
        ctx.fillStyle = '${colors.accent}';
        enemies.forEach(e => { ctx.fillRect(e.x, e.y, e.w, e.h); });
        particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x-2, p.y-2, 4, 4); });
        ctx.globalAlpha = 1;
      }
    }
    function loop(now) { update(now); draw(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
  </script>
</body>
</html>`;
    return makeArtifact('html_game', `${seed.$name}-game.html`, content, 'text/html', {
      domain: seed.$domain,
      hash: seed.$hash,
      playerSpeed: speed,
      enemyRate,
      colors,
    });
  }

  private forgeAPISpec(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const categoricals = collectCategoricals(seed);
    const scalars = collectScalars(seed);
    const baseName = seed.$name.replace(/\s+/g, '_').toLowerCase();
    const version = `1.${seed.$lineage.generation}.0`;

    const resources = categoricals.slice(0, 4).map((cat, i) => {
      const plural = cat.endsWith('s') ? cat : `${cat}s`;
      const limit = Math.round(clamp((scalars[i] ?? 0.5) * 100, 5, 100));
      const capCat = cat.charAt(0).toUpperCase() + cat.slice(1);
      return `  /${plural}:
    get:
      summary: List ${plural}
      operationId: list${capCat}
      parameters:
        - name: limit
          in: query
          schema: { type: integer, default: ${limit}, maximum: 100 }
        - name: offset
          in: query
          schema: { type: integer, default: 0 }
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/${cat}' } }
                  total: { type: integer }
    post:
      summary: Create a ${cat}
      operationId: create${capCat}
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/${cat}Input' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/${cat}' }
        '422':
          description: Validation error
  /${plural}/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: string }
    get:
      summary: Get ${cat} by ID
      operationId: get${capCat}
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema: { $ref: '#/components/schemas/${cat}' }
        '404':
          description: Not found
    delete:
      summary: Delete ${cat}
      operationId: delete${capCat}
      responses:
        '204': { description: Deleted }
        '404': { description: Not found }`;
    });

    const schemas = categoricals.slice(0, 4).map((cat) => {
      const fields = scalars
        .slice(0, 3)
        .map((v, i) => `        field_${i + 1}: { type: number, example: ${v.toFixed(3)} }`)
        .join('\n');
      return `    ${cat}:
      type: object
      required: [id, name]
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
${fields}
        createdAt: { type: string, format: date-time }
    ${cat}Input:
      type: object
      required: [name]
      properties:
        name: { type: string }
${fields}`;
    });

    const content = `openapi: '3.0.3'
info:
  title: ${seed.$name} API
  version: '${version}'
  description: Auto-generated API spec from seed ${seed.$hash.slice(0, 12)} (domain: ${seed.$domain})
  contact:
    name: Paradigm Forge
servers:
  - url: https://api.${baseName}.example.com/v1
    description: Production
  - url: https://staging-api.${baseName}.example.com/v1
    description: Staging
paths:
${resources.join('\n')}
components:
  schemas:
${schemas.join('\n')}
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
security:
  - BearerAuth: []
`;
    return makeArtifact('api_spec', `${baseName}-openapi.yaml`, content, 'application/yaml', {
      domain: seed.$domain,
      hash: seed.$hash,
      version,
      resourceCount: resources.length,
    });
  }

  private forgeDocumentation(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const geneEntries = Object.entries(seed.genes);
    const geneTable = geneEntries
      .map(([key, gene]) => {
        const val =
          gene.type === 'scalar'
            ? gene.value.toFixed(4)
            : gene.type === 'categorical'
              ? gene.value
              : gene.type === 'vector'
                ? `[${gene.value.slice(0, 4).map((v) => v.toFixed(3)).join(', ')}]`
                : gene.type;
        return `| \`${key}\` | \`${gene.type}\` | \`${val}\` |`;
      })
      .join('\n');

    const fitnessSection =
      seed.$fitness
        ? Object.entries(seed.$fitness)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `- **${k}:** ${(v as number).toFixed(4)}`)
            .join('\n')
        : '_No fitness data recorded._';

    const activationSection =
      seed.$activation
        ? `- **Alive:** ${seed.$activation.alive}
- **Active:** ${seed.$activation.active}
- **Energy:** ${seed.$activation.energy.toFixed(4)}
- **Age:** ${seed.$activation.age}`
        : '_No activation state._';

    const content = `# ${seed.$name}

> Domain: **${seed.$domain}** | Generation: **${seed.$lineage.generation}** | Hash: \`${seed.$hash}\`

## Overview

Seed \`${seed.$name}\` is a ${seed.$domain}-domain entity at generation ${seed.$lineage.generation}.
${seed.$metadata.description ? `\n${seed.$metadata.description}\n` : ''}
${seed.$metadata.tags?.length ? `**Tags:** ${seed.$metadata.tags.map((t) => `\`${t}\``).join(', ')}\n` : ''}

## Gene Map

| Gene Key | Type | Value |
|----------|------|-------|
${geneTable}

## Lineage

- **Generation:** ${seed.$lineage.generation}
- **Breeding Strategy:** ${seed.$lineage.breedingStrategy ?? 'N/A'}
- **Mutation Intensity:** ${seed.$lineage.mutationIntensity?.toFixed(4) ?? 'N/A'}
- **Parents:** ${seed.$lineage.parents.length === 0 ? 'None (root seed)' : seed.$lineage.parents.map((p) => `\`${p.name}\``).join(', ')}

## Fitness

${fitnessSection}

## Activation State

${activationSection}

---
_Generated by @paradigm/forge at ${new Date(seed.$metadata.created).toISOString()}_
`;
    return makeArtifact(
      options.type === 'presentation' ? 'presentation' : 'documentation',
      `${seed.$name.replace(/\s+/g, '-').toLowerCase()}-docs.md`,
      content,
      'text/markdown',
      { domain: seed.$domain, hash: seed.$hash, geneCount: geneEntries.length },
    );
  }
}

// ─────────────────────────────────────────────
// DesignForger
// ─────────────────────────────────────────────

/** Generates design artifacts: SVG logos, color palettes, icons. */
export class DesignForger implements ForgerStrategy {
  readonly name = 'DesignForger';
  readonly supportedTypes: ArtifactType[] = ['logo', 'color_palette', 'icon'];

  canForge(type: ArtifactType): boolean {
    return (this.supportedTypes as string[]).includes(type);
  }

  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    switch (options.type) {
      case 'logo':
        return this.forgeLogo(seed, options);
      case 'color_palette':
        return this.forgeColorPalette(seed, options);
      case 'icon':
        return this.forgeIcon(seed, options);
      default:
        return this.forgeLogo(seed, options);
    }
  }

  private forgeLogo(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const w = options.width ?? 200;
    const h = options.height ?? 200;
    const cx = w / 2;
    const cy = h / 2;
    const scalars = collectScalars(seed);
    const vectors = collectVectors(seed);

    const r1 = clamp((scalars[0] ?? rng.next()) * 60 + 30, 20, 80);
    const r2 = clamp((scalars[1] ?? rng.next()) * 40 + 15, 10, 55);
    const sides = Math.round(clamp((scalars[2] ?? rng.next()) * 5 + 3, 3, 8));
    const rot = (vectors[0] ?? rng.next()) * Math.PI * 2;

    const polygonPoints = Array.from({ length: sides }, (_, i) => {
      const angle = rot + (i * Math.PI * 2) / sides;
      return `${(cx + r1 * Math.cos(angle)).toFixed(2)},${(cy + r1 * Math.sin(angle)).toFixed(2)}`;
    }).join(' ');

    const innerPoints = Array.from({ length: sides }, (_, i) => {
      const angle = rot + Math.PI / sides + (i * Math.PI * 2) / sides;
      return `${(cx + r2 * Math.cos(angle)).toFixed(2)},${(cy + r2 * Math.sin(angle)).toFixed(2)}`;
    }).join(' ');

    const initials = seed.$name
      .split(' ')
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');

    const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0.05"/>
    </radialGradient>
    <linearGradient id="shape" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colors.primary}"/>
      <stop offset="100%" stop-color="${colors.secondary}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)" rx="12"/>
  <polygon points="${polygonPoints}" fill="url(#shape)" opacity="0.9"/>
  <polygon points="${innerPoints}" fill="${colors.accent}" opacity="0.7"/>
  <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="system-ui,sans-serif"
    font-size="${Math.round(r2 * 0.9)}" font-weight="700" fill="#ffffff" opacity="0.95">${initials}</text>
</svg>`;
    return makeArtifact('logo', `${seed.$name}-logo.svg`, content, 'image/svg+xml', {
      domain: seed.$domain,
      hash: seed.$hash,
      colors,
      sides,
    });
  }

  private forgeColorPalette(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const scalars = collectScalars(seed);

    const shadeEntries: Record<string, string> = {};
    for (let i = 1; i <= 9; i++) {
      const l = clamp(i * 10 + 5, 10, 95);
      shadeEntries[`primary-${i * 100}`] = colors.primary + Math.round(l).toString(16).padStart(2, '0');
    }

    const palette = {
      name: `${seed.$name} Color Palette`,
      domain: seed.$domain,
      seedHash: seed.$hash,
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        accent: colors.accent,
        background: colors.background,
        text: colors.text,
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
        ...shadeEntries,
      },
      scalars: scalars.slice(0, 8).reduce<Record<string, number>>((acc, v, i) => {
        acc[`gene_${i}`] = v;
        return acc;
      }, {}),
      generated: new Date(seed.$metadata.created).toISOString(),
    };

    const content = JSON.stringify(palette, null, 2);
    return makeArtifact('color_palette', `${seed.$name}-palette.json`, content, 'application/json', {
      domain: seed.$domain,
      hash: seed.$hash,
      colorCount: Object.keys(palette.colors).length,
    });
  }

  private forgeIcon(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const size = options.width ?? 64;
    const half = size / 2;
    const scalars = collectScalars(seed);
    const r = clamp((scalars[0] ?? rng.next()) * half * 0.7 + half * 0.2, half * 0.2, half * 0.85);

    const points = 5;
    const outerR = r;
    const innerR = r * 0.45;
    const starPoints = Array.from({ length: points * 2 }, (_, i) => {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outerR : innerR;
      return `${(half + radius * Math.cos(angle)).toFixed(2)},${(half + radius * Math.sin(angle)).toFixed(2)}`;
    }).join(' ');

    const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colors.primary}"/>
      <stop offset="100%" stop-color="${colors.accent}"/>
    </linearGradient>
  </defs>
  <circle cx="${half}" cy="${half}" r="${half}" fill="${colors.background}"/>
  <polygon points="${starPoints}" fill="url(#g)"/>
</svg>`;
    return makeArtifact('icon', `${seed.$name}-icon.svg`, content, 'image/svg+xml', {
      domain: seed.$domain,
      hash: seed.$hash,
      size,
      colors,
    });
  }
}

// ─────────────────────────────────────────────
// CodeForger
// ─────────────────────────────────────────────

/** Generates code artifacts: TypeScript, GLSL shaders, SQL schemas, test suites. */
export class CodeForger implements ForgerStrategy {
  readonly name = 'CodeForger';
  readonly supportedTypes: ArtifactType[] = ['source_code', 'shader', 'database_schema', 'test_suite'];

  canForge(type: ArtifactType): boolean {
    return (this.supportedTypes as string[]).includes(type);
  }

  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    switch (options.type) {
      case 'source_code':
        return this.forgeSourceCode(seed, options);
      case 'shader':
        return this.forgeShader(seed, options);
      case 'database_schema':
        return this.forgeDatabaseSchema(seed, options);
      case 'test_suite':
        return this.forgeTestSuite(seed, options);
      default:
        return this.forgeSourceCode(seed, options);
    }
  }

  private forgeSourceCode(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const className = seed.$name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
    const geneEntries = Object.entries(seed.genes);

    const properties = geneEntries
      .map(([key, gene]) => {
        const safeName = key.replace(/[^a-zA-Z0-9_]/g, '_');
        if (gene.type === 'scalar') return `  readonly ${safeName}: number = ${gene.value.toFixed(6)};`;
        if (gene.type === 'categorical') return `  readonly ${safeName}: string = ${JSON.stringify(gene.value)};`;
        if (gene.type === 'vector')
          return `  readonly ${safeName}: readonly number[] = [${gene.value.map((v) => v.toFixed(6)).join(', ')}];`;
        return `  readonly ${safeName}_geneType: string = ${JSON.stringify(gene.type)};`;
      })
      .join('\n');

    const scalarKeys = geneEntries
      .filter(([, g]) => g.type === 'scalar')
      .slice(0, 3)
      .map(([k]) => `this.${k.replace(/[^a-zA-Z0-9_]/g, '_')}`);

    const selfFitness = scalarKeys.length > 0 ? scalarKeys.join(' + ') : '0';
    const otherFitness = scalarKeys.length > 0 ? scalarKeys.map((k) => k.replace('this.', 'other.')).join(' + ') : '0';

    const content = `/**
 * ${className} — Generated from GSPL Paradigm seed.
 * Domain: ${seed.$domain} | Hash: ${seed.$hash}
 * Generation: ${seed.$lineage.generation}
 * @auto-generated by @paradigm/forge
 */

/** Gene data extracted from seed ${seed.$hash.slice(0, 12)}. */
export interface ${className}Genes {
${geneEntries
  .map(([k, g]) => {
    const safe = k.replace(/[^a-zA-Z0-9_]/g, '_');
    if (g.type === 'scalar') return `  ${safe}: number;`;
    if (g.type === 'categorical') return `  ${safe}: string;`;
    if (g.type === 'vector') return `  ${safe}: readonly number[];`;
    return `  ${safe}_geneType: string;`;
  })
  .join('\n')}
}

/** Instantiated entity derived from seed ${seed.$name}. */
export class ${className} {
  readonly $hash: string = ${JSON.stringify(seed.$hash)};
  readonly $domain: string = ${JSON.stringify(seed.$domain)};
  readonly $generation: number = ${seed.$lineage.generation};

${properties}

  constructor(overrides?: Partial<${className}Genes>) {
    if (overrides) Object.assign(this, overrides);
  }

  /** Serialize to plain gene data object. */
  toGenes(): ${className}Genes {
    return { ...this } as unknown as ${className}Genes;
  }

  /** Compare fitness with another instance using sum of scalar genes. */
  compareFitness(other: ${className}): number {
    const selfFitness = ${selfFitness};
    const otherFitness = ${otherFitness};
    return selfFitness - otherFitness;
  }
}
`;
    return makeArtifact('source_code', `${className}.ts`, content, 'text/typescript', {
      domain: seed.$domain,
      hash: seed.$hash,
      className,
      geneCount: geneEntries.length,
    });
  }

  private forgeShader(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const scalars = collectScalars(seed);
    const vectors = collectVectors(seed);

    const get = (i: number, fallback: number): number => scalars[i] ?? fallback;
    const getV = (i: number, fallback: number): number => vectors[i] ?? fallback;

    const freq = clamp(get(0, 3.0) * 10, 1.0, 20.0).toFixed(3);
    const amp = clamp(get(1, 0.5), 0.1, 1.0).toFixed(3);
    const speed = clamp(get(2, 1.0) * 2, 0.1, 5.0).toFixed(3);
    const r = clamp(getV(0, 0.5), 0, 1).toFixed(3);
    const g = clamp(getV(1, 0.3), 0, 1).toFixed(3);
    const b = clamp(getV(2, 0.8), 0, 1).toFixed(3);
    const octaves = Math.round(clamp(get(3, 0.4) * 6 + 1, 1, 6));

    const content = `// GLSL Fragment Shader — Generated from seed ${seed.$hash.slice(0, 12)}
// Domain: ${seed.$domain} | @paradigm/forge

precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

// Gene-derived constants
const float FREQ = ${freq};
const float AMP = ${amp};
const float SPEED = ${speed};
const vec3 BASE_COLOR = vec3(${r}, ${g}, ${b});

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float val = 0.0;
  float amplitude = AMP;
  float frequency = FREQ;
  for (int i = 0; i < ${octaves}; i++) {
    val += amplitude * noise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return val;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  float t = u_time * SPEED;
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(1.7, 9.2)));
  vec2 r = vec2(
    fbm(uv + 4.0 * q + vec2(1.7, 9.2) + 0.15 * t),
    fbm(uv + 4.0 * q + vec2(8.3, 2.8) + 0.126 * t)
  );

  float f = fbm(uv + 4.0 * r);
  vec3 color = mix(BASE_COLOR, vec3(1.0) - BASE_COLOR, clamp(f * f * 4.0, 0.0, 1.0));
  color = mix(color, BASE_COLOR * 0.5, clamp(length(q) * 2.0, 0.0, 1.0));
  color = mix(color, BASE_COLOR * 0.8, clamp(r.x * r.y, 0.0, 1.0));
  color *= f * 2.0 + 0.5;

  gl_FragColor = vec4(color, 1.0);
}
`;
    return makeArtifact('shader', `${seed.$name.replace(/\s+/g, '_')}.frag`, content, 'text/plain', {
      domain: seed.$domain,
      hash: seed.$hash,
      freq,
      amp,
      octaves,
    });
  }

  private forgeDatabaseSchema(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const categoricals = collectCategoricals(seed);
    const scalars = collectScalars(seed);
    const baseName = seed.$name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    const tables = categoricals.slice(0, 4).map((cat, tableIdx) => {
      const tbl = `${baseName}_${cat.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      const numCols = Math.round(clamp((scalars[tableIdx] ?? 0.5) * 6 + 2, 2, 8));
      const cols = Array.from({ length: numCols }, (_, i) => {
        const scalarVal = scalars[tableIdx * numCols + i] ?? 0.5;
        const colType = scalarVal < 0.33 ? 'REAL' : scalarVal < 0.66 ? 'TEXT' : 'INTEGER';
        return `  ${cat}_${i + 1} ${colType}${i === 0 ? ' NOT NULL' : ''},`;
      });
      return `-- Table for ${cat} (derived from gene index ${tableIdx})
CREATE TABLE IF NOT EXISTS ${tbl} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_hash TEXT NOT NULL DEFAULT '${seed.$hash}',
  generation INTEGER NOT NULL DEFAULT ${seed.$lineage.generation},
${cols.join('\n')}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_${tbl}_seed ON ${tbl}(seed_hash);
CREATE INDEX IF NOT EXISTS idx_${tbl}_generation ON ${tbl}(generation);

CREATE OR REPLACE FUNCTION update_${tbl}_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_${tbl}_updated
  BEFORE UPDATE ON ${tbl}
  FOR EACH ROW EXECUTE FUNCTION update_${tbl}_timestamp();
`;
    });

    const content = `-- Database Schema — Generated from seed ${seed.$hash.slice(0, 12)}
-- Domain: ${seed.$domain} | Generation: ${seed.$lineage.generation}
-- Generated by @paradigm/forge

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

${tables.join('\n')}
CREATE TABLE IF NOT EXISTS ${baseName}_seeds (
  hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0,
  fitness JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ${baseName}_seeds (hash, name, domain, generation, metadata)
VALUES (
  '${seed.$hash}',
  '${seed.$name.replace(/'/g, "''")}',
  '${seed.$domain}',
  ${seed.$lineage.generation},
  '${JSON.stringify({ tags: seed.$metadata.tags ?? [] }).replace(/'/g, "''")}'
) ON CONFLICT (hash) DO NOTHING;
`;
    return makeArtifact('database_schema', `${baseName}-schema.sql`, content, 'text/plain', {
      domain: seed.$domain,
      hash: seed.$hash,
      tableCount: tables.length + 1,
    });
  }

  private forgeTestSuite(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const className = seed.$name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
    const geneEntries = Object.entries(seed.genes).slice(0, 6);
    const scalars = collectScalars(seed);

    const geneTests = geneEntries
      .map(([key, gene]) => {
        if (gene.type === 'scalar') {
          return `  it('gene ${key} should be within scalar bounds', () => {
    const val = seed.genes[${JSON.stringify(key)}];
    expect(val).toBeDefined();
    expect(val?.type).toBe('scalar');
    if (val?.type === 'scalar') {
      expect(val.value).toBeGreaterThanOrEqual(val.min);
      expect(val.value).toBeLessThanOrEqual(val.max);
    }
  });`;
        }
        if (gene.type === 'categorical') {
          return `  it('gene ${key} should have a valid categorical value', () => {
    const val = seed.genes[${JSON.stringify(key)}];
    expect(val?.type).toBe('categorical');
    if (val?.type === 'categorical') {
      expect(val.options).toContain(val.value);
    }
  });`;
        }
        if (gene.type === 'vector') {
          return `  it('gene ${key} vector should match declared dimensions', () => {
    const val = seed.genes[${JSON.stringify(key)}];
    expect(val?.type).toBe('vector');
    if (val?.type === 'vector') {
      expect(val.value).toHaveLength(val.dimensions);
    }
  });`;
        }
        return `  it('gene ${key} should exist with type ${gene.type}', () => {
    expect(seed.genes[${JSON.stringify(key)}]).toBeDefined();
    expect(seed.genes[${JSON.stringify(key)}]?.type).toBe(${JSON.stringify(gene.type)});
  });`;
      })
      .join('\n\n');

    const fitnessVal = scalars[0] ?? 0.5;

    const content = `/**
 * Test suite for seed: ${seed.$name}
 * Domain: ${seed.$domain} | Hash: ${seed.$hash}
 * @auto-generated by @paradigm/forge
 */
import { describe, it, expect } from 'vitest';
import type { UniversalSeed } from '@paradigm/types';

const seed: UniversalSeed = ${JSON.stringify(seed, null, 2)};

describe('${className} Seed Integrity', () => {
  it('should have correct GST version', () => {
    expect(seed.$gst).toBe('4.0');
  });

  it('should have correct domain', () => {
    expect(seed.$domain).toBe(${JSON.stringify(seed.$domain)});
  });

  it('should have a valid hash', () => {
    expect(seed.$hash).toBeTruthy();
    expect(typeof seed.$hash).toBe('string');
    expect(seed.$hash.length).toBeGreaterThan(0);
  });

  it('should have a valid name', () => {
    expect(seed.$name).toBeTruthy();
    expect(typeof seed.$name).toBe('string');
  });

  it('should have valid lineage', () => {
    expect(seed.$lineage.generation).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(seed.$lineage.parents)).toBe(true);
    expect(typeof seed.$lineage.timestamp).toBe('number');
  });

  it('should have valid metadata', () => {
    expect(typeof seed.$metadata.created).toBe('number');
    expect(seed.$metadata.created).toBeGreaterThan(0);
  });

  it('should have a non-empty gene map', () => {
    expect(typeof seed.genes).toBe('object');
    expect(Object.keys(seed.genes).length).toBeGreaterThan(0);
  });
});

describe('${className} Gene Validation', () => {
${geneTests}
});

describe('${className} Fitness', () => {
  it('fitness primary value should be a number if present', () => {
    if (seed.$fitness?.primary !== undefined) {
      expect(typeof seed.$fitness.primary).toBe('number');
      expect(isFinite(seed.$fitness.primary)).toBe(true);
    }
  });

  it('fitness snapshot baseline', () => {
    const expectedFitness = ${fitnessVal.toFixed(6)};
    if (seed.$fitness?.primary !== undefined) {
      expect(seed.$fitness.primary).toBeCloseTo(expectedFitness, 2);
    }
  });
});

describe('${className} Activation', () => {
  it('activation state should be valid if present', () => {
    if (seed.$activation) {
      expect(typeof seed.$activation.alive).toBe('boolean');
      expect(typeof seed.$activation.active).toBe('boolean');
      expect(typeof seed.$activation.energy).toBe('number');
      expect(seed.$activation.energy).toBeGreaterThanOrEqual(0);
      expect(typeof seed.$activation.age).toBe('number');
    }
  });
});
`;
    return makeArtifact('test_suite', `${className}.test.ts`, content, 'text/typescript', {
      domain: seed.$domain,
      hash: seed.$hash,
      testCount: geneTests.split("it('").length - 1 + 9,
    });
  }
}

// ─────────────────────────────────────────────
// CreativeForger
// ─────────────────────────────────────────────

/** Generates creative artifacts: character sheets, world maps. */
export class CreativeForger implements ForgerStrategy {
  readonly name = 'CreativeForger';
  readonly supportedTypes: ArtifactType[] = ['character_sheet', 'world_map'];

  canForge(type: ArtifactType): boolean {
    return (this.supportedTypes as string[]).includes(type);
  }

  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    switch (options.type) {
      case 'character_sheet':
        return this.forgeCharacterSheet(seed, options);
      case 'world_map':
        return this.forgeWorldMap(seed, options);
      default:
        return this.forgeCharacterSheet(seed, options);
    }
  }

  private forgeCharacterSheet(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const scalars = collectScalars(seed);
    const categoricals = collectCategoricals(seed);
    const isDark = options.theme === 'dark';
    const bg = isDark ? '#1a1a2e' : '#f8f5ee';
    const fg = isDark ? '#e8e8f0' : '#2a2020';

    const statNames = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const;
    const stats: Record<string, number> = {};
    statNames.forEach((name, i) => {
      stats[name] = Math.round(clamp((scalars[i] ?? rng.next()) * 20, 1, 20));
    });

    const abilities = categoricals.slice(0, 4);
    const statRows = Object.entries(stats)
      .map(([stat, val]) => {
        const mod = Math.floor((val - 10) / 2);
        return `<div class="stat"><span class="stat-name">${stat}</span><span class="stat-val">${val}</span><span class="mod">${mod >= 0 ? '+' : ''}${mod}</span></div>`;
      })
      .join('\n        ');

    const abilityList =
      abilities.length > 0
        ? abilities.map((a) => `<li>${a}</li>`).join('\n          ')
        : '<li>No special abilities</li>';

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${seed.$name} — Character Sheet</title>
  <style>
    body { font-family: 'Georgia', serif; background: ${bg}; color: ${fg}; max-width: 700px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; border-bottom: 3px solid ${colors.primary}; padding-bottom: 0.5rem; margin-bottom: 1rem; }
    .header-meta { display: flex; gap: 1.5rem; margin-bottom: 2rem; font-size: 0.9rem; opacity: 0.7; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
    h2 { font-size: 1.1rem; color: ${colors.primary}; border-bottom: 1px solid ${colors.primary}; padding-bottom: 0.25rem; margin-bottom: 1rem; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
    .stat { background: ${isDark ? '#2a2a3e' : '#ece8df'}; border-radius: 8px; padding: 0.75rem; text-align: center; border: 1px solid ${colors.secondary}; }
    .stat-name { display: block; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.65; }
    .stat-val { display: block; font-size: 1.8rem; font-weight: 700; color: ${colors.primary}; }
    .mod { display: block; font-size: 0.75rem; color: ${colors.accent}; }
    ul { padding-left: 1.5rem; line-height: 1.8; }
    .hash { font-family: monospace; font-size: 0.7rem; opacity: 0.4; margin-top: 2rem; text-align: center; }
  </style>
</head>
<body>
  <h1>${seed.$name}</h1>
  <div class="header-meta">
    <span>Domain: ${seed.$domain}</span>
    <span>Generation: ${seed.$lineage.generation}</span>
    ${categoricals[0] ? `<span>Class: ${categoricals[0]}</span>` : ''}
  </div>
  <div class="grid">
    <div>
      <h2>Ability Scores</h2>
      <div class="stats">
        ${statRows}
      </div>
    </div>
    <div>
      <h2>Special Abilities</h2>
      <ul>
          ${abilityList}
      </ul>
      <h2 style="margin-top:1.5rem">Traits</h2>
      <ul>
        <li>Seed Hash: <code>${seed.$hash.slice(0, 12)}</code></li>
        <li>Breeding: ${seed.$lineage.breedingStrategy ?? 'Primordial'}</li>
        <li>Parents: ${seed.$lineage.parents.length === 0 ? 'None' : seed.$lineage.parents.map((p) => p.name).join(', ')}</li>
      </ul>
    </div>
  </div>
  <p class="hash">${seed.$hash}</p>
</body>
</html>`;
    return makeArtifact('character_sheet', `${seed.$name}-sheet.html`, content, 'text/html', {
      domain: seed.$domain,
      hash: seed.$hash,
      stats,
      colors,
    });
  }

  private forgeWorldMap(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const w = options.width ?? 600;
    const h = options.height ?? 400;
    const scalars = collectScalars(seed);
    const categoricals = collectCategoricals(seed);

    const terrainCount = Math.round(clamp((scalars[0] ?? rng.next()) * 12 + 4, 4, 16));
    const terrainTypes = [
      { name: 'forest', color: '#2d6a4f' },
      { name: 'desert', color: '#e9c46a' },
      { name: 'mountain', color: '#8b8680' },
      { name: 'ocean', color: '#1a6b8a' },
      { name: 'plains', color: '#a7c957' },
      { name: 'swamp', color: '#4a7c59' },
    ];

    const patches = Array.from({ length: terrainCount }, (_, i) => {
      const tx = clamp((scalars[i] ?? rng.next()) * w, 0, w);
      const ty = clamp((scalars[i + 1] ?? rng.next()) * h, 0, h);
      const tr = clamp((scalars[i + 2] ?? rng.next()) * 80 + 20, 15, 120);
      const tidx = Math.floor(rng.next() * terrainTypes.length);
      const terrain = terrainTypes[tidx] ?? terrainTypes[0]!;
      return `<ellipse cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" rx="${tr.toFixed(1)}" ry="${(tr * 0.65).toFixed(1)}" fill="${terrain.color}" opacity="0.75"/>`;
    });

    const locationCount = Math.min(categoricals.length, 5);
    const locations = categoricals.slice(0, locationCount).map((locName, i) => {
      const lx = clamp((scalars[i * 2] ?? rng.next()) * (w - 40) + 20, 20, w - 20);
      const ly = clamp((scalars[i * 2 + 1] ?? rng.next()) * (h - 40) + 20, 20, h - 20);
      return `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="6" fill="${colors.accent}" stroke="#fff" stroke-width="1.5"/>
  <text x="${(lx + 9).toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="9" fill="#fff" font-family="sans-serif" font-weight="600">${locName.slice(0, 12)}</text>`;
    });

    const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <radialGradient id="ocean" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1a6b8a"/>
      <stop offset="100%" stop-color="#0d3d52"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#ocean)" rx="8"/>
  ${patches.join('\n  ')}
  ${locations.join('\n  ')}
  <text x="${w / 2}" y="22" text-anchor="middle" font-size="14" fill="${colors.primary}" font-family="Georgia,serif" font-weight="700">${seed.$name} — World Map</text>
  <text x="${w - 5}" y="${h - 5}" text-anchor="end" font-size="7" fill="#ffffff" opacity="0.4" font-family="monospace">${seed.$hash.slice(0, 12)}</text>
</svg>`;
    return makeArtifact('world_map', `${seed.$name}-map.svg`, content, 'image/svg+xml', {
      domain: seed.$domain,
      hash: seed.$hash,
      terrainCount,
      locationCount,
      colors,
    });
  }
}

// ─────────────────────────────────────────────
// AssetForger
// ─────────────────────────────────────────────

/** Generates game asset descriptors: sprite sheets, particle configs. */
export class AssetForger implements ForgerStrategy {
  readonly name = 'AssetForger';
  readonly supportedTypes: ArtifactType[] = ['sprite_sheet', 'particle_config'];

  canForge(type: ArtifactType): boolean {
    return (this.supportedTypes as string[]).includes(type);
  }

  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    switch (options.type) {
      case 'sprite_sheet':
        return this.forgeSpriteSheet(seed, options);
      case 'particle_config':
        return this.forgeParticleConfig(seed, options);
      default:
        return this.forgeSpriteSheet(seed, options);
    }
  }

  private forgeSpriteSheet(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const scalars = collectScalars(seed);
    const categoricals = collectCategoricals(seed);

    const frameW = Math.round(clamp((scalars[0] ?? rng.next()) * 96 + 32, 16, 128));
    const frameH = Math.round(clamp((scalars[1] ?? rng.next()) * 96 + 32, 16, 128));
    const fps = Math.round(clamp((scalars[2] ?? rng.next()) * 20 + 8, 6, 30));
    const cols = 8;

    const animationNames =
      categoricals.length > 0 ? categoricals.slice(0, 6) : ['idle', 'walk', 'run', 'attack', 'die', 'jump'];

    let frameIndex = 0;
    const animations = animationNames.map((animName, i) => {
      const frameCount = Math.round(clamp((scalars[i + 3] ?? rng.next()) * 10 + 2, 2, 12));
      const frames = Array.from({ length: frameCount }, () => {
        const col = frameIndex % cols;
        const row = Math.floor(frameIndex / cols);
        const frame = { frame: { x: col * frameW, y: row * frameH, w: frameW, h: frameH }, index: frameIndex };
        frameIndex++;
        return frame;
      });
      return { name: animName, fps, loop: animName !== 'die', frameCount, frames };
    });

    const totalFrames = frameIndex;
    const rows = Math.ceil(totalFrames / cols);

    const spriteSheet = {
      meta: {
        name: seed.$name,
        domain: seed.$domain,
        seedHash: seed.$hash,
        image: `${seed.$name.replace(/\s+/g, '_').toLowerCase()}.png`,
        size: { w: cols * frameW, h: rows * frameH },
        frameSize: { w: frameW, h: frameH },
        scale: 1,
        generated: new Date(seed.$metadata.created).toISOString(),
      },
      animations,
      frames: animations.flatMap((a) => a.frames),
    };

    const content = JSON.stringify(spriteSheet, null, 2);
    return makeArtifact(
      'sprite_sheet',
      `${seed.$name.replace(/\s+/g, '_')}-spritesheet.json`,
      content,
      'application/json',
      { domain: seed.$domain, hash: seed.$hash, frameCount: totalFrames, animationCount: animations.length },
    );
  }

  private forgeParticleConfig(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const colors = deriveColors(seed, rng);
    const scalars = collectScalars(seed);
    const categoricals = collectCategoricals(seed);

    const emitterTypes = ['point', 'circle', 'rectangle', 'line'] as const;
    const blendModes = ['normal', 'additive', 'multiply', 'screen'] as const;
    const emitterIdx = Math.floor((scalars[0] ?? rng.next()) * emitterTypes.length);
    const blendIdx = Math.floor((scalars[1] ?? rng.next()) * blendModes.length);

    const config = {
      name: `${seed.$name} Particles`,
      seedHash: seed.$hash,
      domain: seed.$domain,
      emitter: {
        type: emitterTypes[clamp(emitterIdx, 0, emitterTypes.length - 1)] ?? 'point',
        position: { x: 0, y: 0 },
        radius: clamp((scalars[2] ?? rng.next()) * 100, 5, 200),
        rate: clamp((scalars[3] ?? rng.next()) * 100 + 10, 5, 300),
        burst: Math.round(clamp((scalars[4] ?? rng.next()) * 50, 0, 100)),
        duration: clamp((scalars[5] ?? rng.next()) * 5 + 0.5, 0.1, 10),
        loop: (scalars[0] ?? 0.5) > 0.3,
      },
      particle: {
        lifetime: {
          min: clamp((scalars[0] ?? rng.next()) * 3 + 0.2, 0.1, 5),
          max: clamp((scalars[1] ?? rng.next()) * 5 + 0.5, 0.5, 8),
        },
        speed: {
          min: clamp((scalars[2] ?? rng.next()) * 200 + 10, 5, 500),
          max: clamp((scalars[3] ?? rng.next()) * 400 + 50, 50, 800),
        },
        angle: { min: -180, max: 180 },
        gravity: { x: 0, y: clamp((scalars[4] ?? rng.next()) * 500 - 100, -500, 500) },
        drag: clamp((scalars[5] ?? rng.next()) * 0.1, 0, 0.15),
        size: { start: clamp((scalars[0] ?? rng.next()) * 32 + 4, 2, 64), end: 0 },
        alpha: { start: 1, end: 0 },
        rotation: {
          start: 0,
          speed: clamp((scalars[1] ?? rng.next()) * 360 - 180, -360, 360),
        },
        color: {
          start: colors.primary,
          end: colors.accent,
          tween: categoricals[0] ?? 'linear',
        },
        blendMode: blendModes[clamp(blendIdx, 0, blendModes.length - 1)] ?? 'additive',
      },
      generated: new Date(seed.$metadata.created).toISOString(),
    };

    const content = JSON.stringify(config, null, 2);
    return makeArtifact(
      'particle_config',
      `${seed.$name.replace(/\s+/g, '_')}-particles.json`,
      content,
      'application/json',
      { domain: seed.$domain, hash: seed.$hash, emitterType: config.emitter.type, blendMode: config.particle.blendMode },
    );
  }
}

// ─────────────────────────────────────────────
// AudioForger
// ─────────────────────────────────────────────

/** Generates audio descriptors: soundtracks and sound effects. */
export class AudioForger implements ForgerStrategy {
  readonly name = 'AudioForger';
  readonly supportedTypes: ArtifactType[] = ['soundtrack', 'sound_effect'];

  canForge(type: ArtifactType): boolean {
    return (this.supportedTypes as string[]).includes(type);
  }

  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    switch (options.type) {
      case 'soundtrack':
        return this.forgeSoundtrack(seed, options);
      case 'sound_effect':
        return this.forgeSoundEffect(seed, options);
      default:
        return this.forgeSoundtrack(seed, options);
    }
  }

  private forgeSoundtrack(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const scalars = collectScalars(seed);
    const categoricals = collectCategoricals(seed);

    const bpm = Math.round(clamp((scalars[0] ?? rng.next()) * 120 + 60, 60, 200));
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
    const scales = ['major', 'minor', 'dorian', 'phrygian', 'mixolydian', 'pentatonic'] as const;
    const moods = ['epic', 'melancholic', 'tense', 'peaceful', 'triumphant', 'mysterious', 'playful'] as const;
    const instrumentPool = [
      'piano', 'strings', 'brass', 'woodwind', 'percussion',
      'synthesizer', 'choir', 'guitar', 'bass', 'organ',
    ] as const;

    const keyIdx = clamp(Math.floor((scalars[1] ?? rng.next()) * keys.length), 0, keys.length - 1);
    const scaleIdx = clamp(Math.floor((scalars[2] ?? rng.next()) * scales.length), 0, scales.length - 1);
    const moodIdx = clamp(Math.floor((scalars[3] ?? rng.next()) * moods.length), 0, moods.length - 1);
    const instrumentCount = Math.round(clamp((scalars[4] ?? rng.next()) * 6 + 2, 2, 8));

    const instruments = Array.from({ length: instrumentCount }, (_, i) => {
      const idx = clamp(
        Math.floor((scalars[i + 5] ?? rng.next()) * instrumentPool.length),
        0,
        instrumentPool.length - 1,
      );
      return instrumentPool[idx] ?? 'piano';
    });

    const sections = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
    const soundtrack = {
      name: `${seed.$name} Soundtrack`,
      seedHash: seed.$hash,
      domain: seed.$domain,
      bpm,
      key: `${keys[keyIdx] ?? 'C'} ${scales[scaleIdx] ?? 'major'}`,
      mood: moods[moodIdx] ?? 'epic',
      duration: Math.round(clamp((scalars[5] ?? rng.next()) * 180 + 30, 30, 300)),
      timeSignature: (scalars[0] ?? 0.5) > 0.7 ? '3/4' : '4/4',
      instruments: [...new Set(instruments)],
      structure: sections.map((sectionName, i) => ({
        name: sectionName,
        bars: Math.round(clamp((scalars[i] ?? rng.next()) * 16 + 4, 4, 32)),
        intensity: clamp((scalars[i + 1] ?? rng.next()), 0.1, 1.0),
        instruments: instruments.slice(0, Math.max(1, Math.round(rng.next() * instruments.length))),
      })),
      motifs: categoricals.slice(0, 3).map((cat, i) => ({
        name: cat,
        intervalPattern: Array.from({ length: 4 }, (_, j) => Math.round((scalars[i + j] ?? rng.next()) * 12) - 6),
        rhythmicPattern: [1, 0.5, 0.5, 1],
      })),
      generated: new Date(seed.$metadata.created).toISOString(),
    };

    const content = JSON.stringify(soundtrack, null, 2);
    return makeArtifact('soundtrack', `${seed.$name.replace(/\s+/g, '_')}-soundtrack.json`, content, 'application/json', {
      domain: seed.$domain,
      hash: seed.$hash,
      bpm,
      key: soundtrack.key,
      mood: soundtrack.mood,
    });
  }

  private forgeSoundEffect(seed: UniversalSeed, _options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);
    const scalars = collectScalars(seed);
    const categoricals = collectCategoricals(seed);

    const sfxTypes = ['impact', 'explosion', 'pickup', 'jump', 'shoot', 'ambient', 'ui_click', 'footstep', 'magic'] as const;
    const synthTypes = ['sine', 'square', 'sawtooth', 'triangle', 'noise'] as const;

    const sfxIdx = clamp(Math.floor((scalars[0] ?? rng.next()) * sfxTypes.length), 0, sfxTypes.length - 1);
    const synthIdx = clamp(Math.floor((scalars[1] ?? rng.next()) * synthTypes.length), 0, synthTypes.length - 1);

    const sfx = {
      name: `${seed.$name} SFX`,
      seedHash: seed.$hash,
      domain: seed.$domain,
      type: sfxTypes[sfxIdx] ?? 'impact',
      synthesis: synthTypes[synthIdx] ?? 'sine',
      duration: clamp((scalars[2] ?? rng.next()) * 2 + 0.05, 0.05, 3.0),
      frequency: {
        start: clamp((scalars[3] ?? rng.next()) * 2000 + 50, 50, 4000),
        end: clamp((scalars[4] ?? rng.next()) * 1000 + 20, 20, 2000),
        sweep: categoricals[0] ?? 'linear',
      },
      amplitude: {
        attack: clamp((scalars[5] ?? rng.next()) * 0.1, 0.001, 0.2),
        decay: clamp((scalars[0] ?? rng.next()) * 0.3, 0.01, 0.5),
        sustain: clamp((scalars[1] ?? rng.next()) * 0.8, 0.0, 1.0),
        release: clamp((scalars[2] ?? rng.next()) * 0.5, 0.01, 1.0),
      },
      distortion: clamp((scalars[3] ?? rng.next()) * 0.5, 0, 0.8),
      reverb: {
        enabled: (scalars[4] ?? rng.next()) > 0.5,
        decay: clamp((scalars[5] ?? rng.next()) * 3, 0.1, 5.0),
        mix: clamp((scalars[0] ?? rng.next()) * 0.6, 0.0, 0.8),
      },
      pitch: {
        semitones: Math.round((scalars[1] ?? 0.5) * 24 - 12),
        cents: Math.round((scalars[2] ?? 0.5) * 100 - 50),
      },
      layers: Math.round(clamp((scalars[3] ?? rng.next()) * 3 + 1, 1, 4)),
      generated: new Date(seed.$metadata.created).toISOString(),
    };

    const content = JSON.stringify(sfx, null, 2);
    return makeArtifact('sound_effect', `${seed.$name.replace(/\s+/g, '_')}-sfx.json`, content, 'application/json', {
      domain: seed.$domain,
      hash: seed.$hash,
      sfxType: sfx.type,
      synthesis: sfx.synthesis,
    });
  }
}

// ─────────────────────────────────────────────
// Forge — Master Router
// ─────────────────────────────────────────────

/** Master artifact router. Dispatches forge requests to specialized forgers. */
/**
 * EntitySpriteForger — Generates sprite entity blueprints from seeds.
 * Extracts morphology, style, and ability genes to produce a structured
 * JSON artifact describing the entity's visual and behavioral properties.
 */
export class EntitySpriteForger implements ForgerStrategy {
  readonly name = 'EntitySpriteForger';
  readonly supportedTypes: ArtifactType[] = ['sprite_entity'];

  canForge(type: ArtifactType): boolean {
    return type === 'sprite_entity';
  }

  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const rng = new DeterministicRNG(seed.$hash);

    // Extract concept genes from seed
    const archetype = getStringGene(seed, 'archetype', 'unknown');
    const bodyStructure = getStringGene(seed, 'bodyStructure', 'humanoid');
    const style = getStringGene(seed, 'style', 'default');
    const species = getStringGene(seed, 'species', 'unknown');
    const exaggeration = getNumericGene(seed, 'exaggeration', 0.5);

    const proportions = getVectorGene(seed, 'proportions', [0.2, 0.6, 1.2, 0.2]);
    const palette = getVectorGene(seed, 'palette', []);
    const personality = getVectorGene(seed, 'personality', []);

    // Determine frame size from body structure
    const frameSizes: Record<string, [number, number]> = {
      humanoid: [64, 64], quadruped: [96, 64], winged: [128, 128],
      serpentine: [96, 48], floating: [64, 64], amorphous: [48, 48],
    };
    const [fw, fh] = frameSizes[bodyStructure] ?? [64, 64];

    // Build entity descriptor
    const entity = {
      name: seed.$name,
      hash: seed.$hash,
      archetype,
      bodyStructure,
      style,
      species,
      exaggeration,
      proportions: {
        headToBodyRatio: proportions[0] ?? 0.2,
        limbToBodyRatio: proportions[1] ?? 0.6,
        shoulderToHipRatio: proportions[2] ?? 1.2,
        eyeToHeadRatio: proportions[3] ?? 0.2,
      },
      palette: this.buildPaletteHex(palette),
      personality: personality.length >= 10 ? {
        openness: personality[0], conscientiousness: personality[1],
        extraversion: personality[2], agreeableness: personality[3],
        neuroticism: personality[4], wit: personality[5],
        cunning: personality[6], courage: personality[7],
        loyalty: personality[8], adaptability: personality[9],
      } : undefined,
      spriteConfig: { frameWidth: fw, frameHeight: fh, fps: 12 },
      fitness: seed.$fitness?.primary ?? 0,
      generation: seed.$lineage.generation,
    };

    const content = JSON.stringify(entity, null, 2);
    return makeArtifact(
      'sprite_entity',
      `${seed.$name} Entity`,
      content,
      'application/json',
      { archetype, bodyStructure, style, species },
    );
  }

  private buildPaletteHex(values: number[]): string[] {
    const colors: string[] = [];
    for (let i = 0; i + 2 < values.length; i += 3) {
      const r = Math.round((values[i] ?? 0) * 255);
      const g = Math.round((values[i + 1] ?? 0) * 255);
      const b = Math.round((values[i + 2] ?? 0) * 255);
      colors.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
    }
    return colors;
  }
}

export class Forge {
  private readonly forgers: ForgerStrategy[];
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG(42);
    this.forgers = [
      new WebForger(),
      new DesignForger(),
      new CodeForger(),
      new CreativeForger(),
      new AssetForger(),
      new AudioForger(),
      new EntitySpriteForger(),
    ];
  }

  /** Register a custom forger strategy. */
  registerForger(forger: ForgerStrategy): void {
    this.forgers.push(forger);
  }

  /** Get all artifact types supported by registered forgers. */
  getSupportedTypes(): ArtifactType[] {
    const seen = new Set<ArtifactType>();
    for (const forger of this.forgers) {
      for (const t of forger.supportedTypes) {
        seen.add(t);
      }
    }
    return Array.from(seen);
  }

  /** Check whether a given type can be forged by any registered forger. */
  canForge(type: ArtifactType): boolean {
    return this.forgers.some((f) => f.canForge(type));
  }

  /** Get the first forger capable of handling the given type. */
  getForgerForType(type: ArtifactType): ForgerStrategy | undefined {
    return this.forgers.find((f) => f.canForge(type));
  }

  /**
   * Forge a single artifact from a seed.
   * @throws {Error} If no forger is registered for the requested type.
   */
  forge(seed: UniversalSeed, options: ForgeOptions): Artifact {
    const forger = this.getForgerForType(options.type);
    if (!forger) {
      throw new Error(
        `No forger available for artifact type "${options.type}". ` +
          `Supported types: ${this.getSupportedTypes().join(', ')}`,
      );
    }
    return forger.forge(seed, options);
  }

  /**
   * Forge multiple artifact types from a single seed.
   * Any type with no registered forger is silently skipped.
   */
  forgeAll(seed: UniversalSeed, types?: ArtifactType[]): Artifact[] {
    const targets = types ?? this.getSupportedTypes();
    const results: Artifact[] = [];
    for (const type of targets) {
      if (!this.canForge(type)) continue;
      try {
        results.push(this.forge(seed, { type }));
      } catch {
        // Isolate per-forger failures; continue with remaining types
      }
    }
    return results;
  }
}

// Re-export unused helpers for external use
export { getNumericGene, getStringGene, getVectorGene, collectScalars, collectVectors, collectCategoricals };

// ─────────────────────────────────────────────
// getGeneValue — universal gene extractor (spec-required named export)
// ─────────────────────────────────────────────

/**
 * Safely extract a value from a seed's gene map.
 *
 * Returns the gene's primary value for scalar, categorical, vector, array,
 * struct, and expression genes. Falls back to `fallback` for graph, tensor,
 * timeseries, and absent keys.
 *
 * @param seed     - The UniversalSeed to read from.
 * @param key      - Gene map key to look up.
 * @param fallback - Value returned when the key is absent or unresolvable.
 * @returns The gene value or `fallback`.
 */
export function getGeneValue(seed: UniversalSeed, key: string, fallback: unknown): unknown {
  const gene: Gene | undefined = seed.genes[key];
  if (gene === undefined) return fallback;
  switch (gene.type) {
    case 'scalar':      return gene.value;
    case 'categorical': return gene.value;
    case 'vector':      return gene.value;
    case 'array':       return gene.value;
    case 'struct':      return gene.value;
    case 'expression':  return gene.source;
    case 'graph':
    case 'tensor':
    case 'timeseries':
    default:            return fallback;
  }
}

// ─────────────────────────────────────────────
// ForgeAllResult — structured result for Forge.forgeAll
// ─────────────────────────────────────────────

/** Typed error thrown by the Forge when artifact generation fails. */
export class ForgeError extends Error {
  /** The artifact type that could not be generated. */
  readonly artifactType: ArtifactType;
  /** The hash of the seed that triggered the failure. */
  readonly seedHash: string;
  /** Original underlying error, if any. */
  readonly cause: Error | undefined;

  constructor(message: string, artifactType: ArtifactType, seedHash: string, cause?: Error) {
    super(message);
    this.name = 'ForgeError';
    this.artifactType = artifactType;
    this.seedHash = seedHash;
    this.cause = cause;
    // Maintain prototype chain in transpiled environments.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Structured result returned by {@link Forge.forgeAll}. */
export interface ForgeAllResult {
  /** Successfully generated artifacts. */
  artifacts: Artifact[];
  /** Per-type errors for types that could not be generated. */
  errors: Array<{ type: ArtifactType; error: ForgeError }>;
  /** Hash of the source seed. */
  seedHash: string;
}
