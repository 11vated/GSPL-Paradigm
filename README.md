# GSPL Paradigm

**The Living World Compiler** — A platform where everything is a seed that evolves.

GSPL Paradigm treats every entity (characters, worlds, shaders, narratives, music) as an evolvable **UniversalSeed** genome. Create seeds from natural language, breed and mutate populations, evolve toward fitness goals, forge artifacts, and export to 14+ game engines.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the API server
pnpm dev:api    # http://localhost:5001

# Start the web UI (in another terminal)
pnpm dev:ui     # http://localhost:5173

# Or run the TUI
pnpm dev:tui
```

## Architecture

```
44 packages across 5 layers:

Foundation:  types, rng, events, seed, lang, runtime
Evolution:   evolution, compute, generate
Intelligence: agent, llm, awareness, knowledge, search
Synthesis:   forge, export, sprites, media, 3d, canvas, engines
Surfaces:    web, ui, cli, tui, studio, desktop
```

**Zero external runtime dependencies** in core packages. Pure TypeScript.

## Core Concepts

### Seeds
Everything is a `UniversalSeed` — an immutable genetic data structure with 9 gene types:
- **Scalar** — numeric values with bounds (health: 100, speed: 45)
- **Categorical** — enumerated choices (role: "warrior", element: "fire")
- **Vector** — multi-dimensional arrays (position: [0, 0, 0], color: [0.9, 0.2, 0.1])
- **Expression** — compiled formulas (damage: "attack * (1 - defense/100)")
- **Struct, Array, Graph, Tensor, TimeSeries** — complex nested data

### Evolution
Seeds breed, mutate, and compete across generations:
```typescript
import { createSeed, mutateSeed, breedSeeds } from '@paradigm/seed';
import { EvolutionEngine } from '@paradigm/evolution';

const warrior = createSeed('Warrior', 'organism', genes, rng);
const mutant = mutateSeed(warrior, 0.3, rng);
const offspring = breedSeeds(warrior, mutant, 'uniform', 0.5, rng);

const engine = new EvolutionEngine({ generations: 50, populationSize: 100 });
const result = engine.run(warrior, fitnessFunction);
// result.best — the champion seed after 50 generations
```

### Forge
Convert evolved seeds into concrete artifacts:
```typescript
import { Forge } from '@paradigm/forge';

const forge = new Forge();
const game = forge.forge(champion, { type: 'html_game' });
const sheet = forge.forge(champion, { type: 'character_sheet' });
const code = forge.forge(champion, { type: 'source_code' });
```

19 artifact types: html_page, html_game, website, api_spec, documentation, logo, color_palette, icon, source_code, shader, database_schema, test_suite, character_sheet, world_map, sprite_sheet, particle_config, soundtrack, sound_effect, physics_sim.

### GSPL Language
A dedicated programming language for seed declaration:
```gspl
@gseed 1.0
@domain organism

seed "Fire Dragon" organism {
  health: scalar(250, 0, 500);
  attack: scalar(85, 0, 100);
  element: categorical("fire", ["fire", "ice", "lightning"]);
  color: vector([0.9, 0.2, 0.1]);
}
```

## Platforms

| Platform | Status | Run |
|----------|--------|-----|
| **Web App** | React 19 + Tailwind 4 + Three.js | `pnpm dev:ui` |
| **API Server** | Node.js + WebEngine | `pnpm dev:api` |
| **Desktop** | Tauri v2 (Rust) | `pnpm dev:desktop` |
| **TUI** | Interactive terminal | `pnpm dev:tui` |
| **CLI** | Command-line | `pnpm dev:cli` |
| **Mobile** | PWA (installable) | Deploy web app |

## LLM Integration

Provider-agnostic AI with all major providers:
```typescript
import { createProvider, detectAvailableProviders } from '@paradigm/llm';

const providers = detectAvailableProviders(); // ['claude', 'ollama', ...]
const claude = createProvider('claude');
const response = await claude.chat([{ role: 'user', content: 'Design a boss enemy seed' }]);
```

Supported: **Claude** (Anthropic), **GPT-4o** (OpenAI), **Gemini** (Google), **Ollama** (local).

## Agent Intelligence

The GSPL agent reasons about seeds natively — not just text generation:
- **Seed Reasoner** — Analyzes structure, suggests improvements
- **Fitness Strategist** — Recommends evolution strategies
- **Cross-Domain Synthesizer** — Identifies breeding opportunities
- **Gap Detector** — Finds missing capabilities
- **Emergence Predictor** — Predicts behaviors from gene combinations

Three autonomy modes: Supervised, Co-pilot, Autonomous.

## Development

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all 44 packages
pnpm test             # Run all test suites
pnpm typecheck        # TypeScript strict check
```

## Tech Stack

- **Language:** TypeScript 5.7 (strict mode)
- **Monorepo:** pnpm 10.32 + Turbo
- **Testing:** Vitest (80% coverage target)
- **Frontend:** React 19, Tailwind CSS 4, Three.js, Framer Motion
- **Desktop:** Tauri v2 (Rust)
- **LLM:** Claude, OpenAI, Gemini, Ollama
- **Persistence:** SQLite (Node), IndexedDB (browser)

## License

All rights reserved.
