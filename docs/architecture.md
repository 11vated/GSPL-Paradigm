# GSPL Paradigm — Architecture

## 5-Layer Package Architecture

```
Layer 1: Foundation (zero deps)
  types, rng, events

Layer 2: Core Engine (depends on Layer 1)
  seed, lang, runtime, evolution

Layer 3: Intelligence (depends on Layers 1-2)
  agent, llm, awareness, knowledge, search

Layer 4: Synthesis & Infrastructure (depends on Layers 1-2)
  forge, export, store, sprites, media, 3d, canvas, engines
  physics, behavior, narrative, social, levels, generate
  compute, collab, p2p, network, security, os, capsule,
  fabric, sovereignty, lsp

Layer 5: Surfaces (depends on all layers)
  web, ui, cli, tui, studio, desktop, paradigm (meta)
```

## Data Flow

```
User Input (prompt / UI / CLI / TUI)
  |
  v
WebEngine (HTTP router + controllers)
  |
  +---> SeedController ---> createSeed / mutateSeed / breedSeeds
  |
  +---> EvolutionController ---> EvolutionEngine.run()
  |       |
  |       +---> evaluateFitness -> select -> reproduce -> repeat
  |
  +---> ForgeController ---> Forge.forge(seed, { type })
  |       |
  |       +---> WebForger / DesignForger / CodeForger / CreativeForger
  |             AssetForger / AudioForger (19 artifact types)
  |
  +---> AgentController ---> GSPLAgent
  |       |
  |       +---> NLPCompiler (pattern-based intent, no LLM needed)
  |       +---> SeedReasoner / FitnessStrategist / GapDetector
  |       +---> LLM Providers (Claude / OpenAI / Gemini / Ollama)
  |       +---> AgentTools (25+ tools operating on seeds)
  |
  +---> ExportController ---> HTML / Markdown / JSON / Python / Rust
  |                           C# / GDScript / GLSL / CSV / SVG
  |
  +---> SSE /api/events ---> EventBus.onAny() -> broadcast to clients
```

## Platform Matrix

| Platform | Entry Point | Consumes |
|----------|-------------|----------|
| **Web App** | packages/ui (React 19 + Vite) | WebEngine via HTTP proxy (:5001) |
| **Desktop** | apps/desktop-tauri (Tauri v2) | packages/ui dist + WebEngine sidecar |
| **TUI** | packages/tui/src/bin.ts | WebEngine in-process |
| **CLI** | packages/cli | WebEngine in-process |
| **PWA** | packages/ui + manifest.json | Same as web app, offline-capable |

## Key Design Decisions

- **Immutability**: All seed operations return new instances
- **Deterministic RNG**: xoshiro256** with seed forking — same input = same output
- **Content-addressable**: Seed hash is computed from genes only
- **Zero external deps**: Core packages use only TypeScript stdlib
- **Event-driven**: EventBus with replay buffer for SSE streaming
- **Provider-agnostic LLM**: Agent works without LLM; providers are enhancement
