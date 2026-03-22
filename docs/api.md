# GSPL Paradigm — API Reference

Base URL: `http://localhost:5001`

## Seeds

### `GET /seeds`
List all seeds.
**Response:** `{ seeds: UniversalSeed[] }`

### `POST /seeds`
Create a new seed.
**Body:** `{ name: string, domain: string, genes?: GeneMap }`
**Response:** `{ seed: UniversalSeed }`

### `GET /seeds/:hash`
Get a seed by hash.
**Response:** `{ seed: UniversalSeed }`

### `DELETE /seeds/:hash`
Delete a seed.
**Response:** `{ deleted: boolean }`

### `POST /seeds/:hash/mutate`
Mutate a seed.
**Body:** `{ intensity: number }` (0-1)
**Response:** `{ seed: UniversalSeed }`

### `POST /seeds/:hash/fitness`
Set fitness on a seed.
**Body:** `{ fitness: number }`
**Response:** `{ seed: UniversalSeed }`

### `POST /seeds/breed`
Breed two seeds.
**Body:** `{ parentA: string, parentB: string, strategy?: string, dominance?: number }`
**Response:** `{ seed: UniversalSeed }`

## Evolution

### `POST /evolution`
Run evolution campaign.
**Body:**
```json
{
  "templateHash": "string",
  "generations": 50,
  "populationSize": 100,
  "mutationRate": 0.05,
  "selectionStrategy": "tournament"
}
```
**Response:** `{ population: UniversalSeed[], stats: EvolutionStats[], best: UniversalSeed }`

### `GET /evolution/status`
Get current evolution status.

## Forge

### `POST /forge`
Generate an artifact from a seed.
**Body:** `{ seedHash: string, type: ArtifactType, theme?: "dark" | "light" }`
**Response:** `{ type, name, content, mimeType, size, metadata }`

**Artifact Types:** `html_page`, `html_game`, `website`, `api_spec`, `documentation`, `presentation`, `logo`, `color_palette`, `icon`, `source_code`, `shader`, `database_schema`, `test_suite`, `character_sheet`, `world_map`, `sprite_sheet`, `particle_config`, `soundtrack`, `sound_effect`, `physics_sim`

## Agent

### `POST /agent/chat`
Chat with the GSPL agent.
**Body:** `{ message: string }`
**Response:** `{ reply: string }`

## Export

### `POST /export`
Export seeds to a format.
**Body:** `{ seeds: string[], format: "json" | "gspl" | "html" | "markdown" }`
**Response:** `{ content: string, mimeType: string }`

## System

### `GET /status`
Server health check.
**Response:** `{ seedCount, routeCount, uptime }`

## Events (SSE)

### `GET /api/events`
Server-Sent Events stream for real-time updates.
**Content-Type:** `text/event-stream`

**Event types:**
- `seed.created` — New seed saved
- `seed.mutated` — Seed mutated
- `seed.bred` — Seeds bred
- `seed.died` — Seed deleted
- `evolution.tick` — Generation completed
- `forge.complete` — Artifact generated
- `agent.response` — Agent replied
