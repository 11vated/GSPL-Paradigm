# GSPL Paradigm

**The Living World Compiler** — A seed-native creative platform where everything is a `UniversalSeed` genome that evolves.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all 44 packages
pnpm build

# Start development
pnpm dev:api    # API server on http://localhost:5001
pnpm dev:ui     # React UI on http://localhost:5173
pnpm dev:tui    # Terminal UI
pnpm dev:cli    # CLI tool
pnpm dev:desktop # Tauri desktop app
```

## Architecture

5-layer monorepo with 44 packages, ~115K LOC TypeScript (strict mode).

```
Layer 1: Foundation    types, rng (OKLab color science), events (backpressure + metrics), seed, lang, runtime
Layer 2: Evolution     evolution, compute, generate
Layer 3: Intelligence  agent (11 tools), llm (4 providers + resilience), awareness, knowledge
Layer 4: Synthesis     forge (OKLab palettes), export (12 formats), store (IndexedDB/SQLite), sprites,
                       media, 3d, canvas, engines, narrative, physics, behavior
Layer 5: Surfaces      web (REST + WebSocket + rate limiting), ui (React 19 + D3 + Three.js),
                       cli, tui, studio, desktop (Tauri v2)
```

## Core Concepts

**UniversalSeed** — Immutable genetic data structure with 9 gene types:
Scalar, Categorical, Vector, Expression, Struct, Array, Graph, Tensor, TimeSeries

**Evolution Engine** — Seeds breed, mutate, and compete across generations with tournament selection, configurable crossover/mutation strategies, and fitness tracking.

**Forge** — Converts seeds into 20 artifact types: HTML pages, games, shaders, 3D models, music, sprites, documentation, and more. All colors use perceptually uniform OKLab color science.

**GSPL Language** — Domain-specific language for seed declaration with 42 keywords, 162+ built-in functions, and a full lexer/parser/AST pipeline.

**Agent** — 10-stage intelligence pipeline (PERCEIVE through EVOLVE) with 11 registered tools, provider-agnostic LLM integration (Ollama, Claude, OpenAI, Gemini), and NLP compiler that works without any LLM.

## The Studio

Professional-grade web UI with deep space dark theme (`#0a0e1a`):

- **Garden View** — 3D Three.js scene with domain-specific seed meshes, golden-angle spiral layout, instanced particles, relation connection lines
- **Seed Inspector** — 9 gene-type visualizers (scalar bars, categorical pills, vector charts, tensor heatmaps, timeseries curves), tabbed metadata/lineage/fitness panels
- **Evolution Dashboard** — D3.js fitness charts (best/avg/worst with confidence band), diversity area chart, real-time SSE streaming, 4 stat cards
- **Forge Panel** — 20 artifact types, tabbed Forge/Gallery preview, download with proper MIME types
- **Agent Chat** — Markdown rendering, tool execution badges, autonomy mode selector (supervised/copilot/autonomous), suggestion chips

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.7 (strict mode) |
| Monorepo | pnpm 10.32 + Turbo 2.4 |
| Frontend | React 19 + Tailwind CSS 4 + Three.js + D3.js + Framer Motion |
| State | Zustand (5 stores: seed, evolution, forge, agent, ui) |
| Desktop | Tauri v2 (Rust backend) |
| Storage | SQLite (Node) / IndexedDB (browser) via CachedAsyncAdapter |
| Realtime | SSE + WebSocket (bidirectional, with backpressure) |
| LLM | Ollama (free, local) + Claude/OpenAI/Gemini with ResilientProvider (retry + circuit breaker) |
| Validation | Zod v4 schemas on all API boundaries |
| Testing | Vitest with coverage |
| Color | OKLab (Bjorn Ottosson 2020, exact M1/M2 matrices from Sprite Forge) |

## Export Formats (12)

HTML, Markdown, JSON, Python, Rust, C#, GDScript, GLSL, CSV, SVG, GSPL (native), glTF 2.0

## API

REST server on port 5001 with WebSocket support:

- `GET/POST /api/seeds` — Seed CRUD
- `POST /api/evolve` — Run evolution campaigns
- `POST /api/forge` — Generate artifacts
- `POST /api/chat` — Agent conversation
- `GET /api/search?q=` — Full-text seed search
- `GET /api/lineage/:hash` — Ancestry tree
- `GET /api/diagnostics` — Request metrics, rate limiter stats
- `WS /ws` — Bidirectional WebSocket with event subscriptions

## Commands

```bash
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm typecheck    # TypeScript strict check
pnpm lint         # ESLint all packages
pnpm clean        # Remove dist/ directories
```

## License

MIT
