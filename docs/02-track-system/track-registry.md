# Track Registry

Defines what a **track** is in Locaily and how it differs from tools, models, and workflows.

## Definition

A track is a **unit of work** with:

```txt
purpose
input contract
output contract
required capabilities
preferred worker type (model role or tool)
validation rules
fallback policy
known failure modes
```

A track is **not**:

- A model name
- A single prompt
- A Chrome extension
- An entire product

Models and tools are **handlers** that execute track steps.

## Track File Location

Track definitions live as JSON files:

```txt
companion/pit-crew/tracks/*.track.json
```

Loaded by `companion/pit-crew/decomposer.js`. Listed via `GET /tracks` (basic) and `GET /orchestration/tracks` (enriched metadata from `companion/orchestration/track-registry.js`).

## Current Catalog

| Track ID | File | Status |
|---|---|---|
| `website_audit.lighthouse_handoff` | `lighthouse-handoff.track.json` | **Implemented** — proof track (7 steps, all `input_map`) |
| `marketplace.dealsniper` | `dealsniper.track.json` | **Implemented** — second workflow track (3 steps, all `input_map`) |

## Track Contract (Conceptual)

Every track should declare:

| Field | Description |
|---|---|
| `track_id` | Stable identifier (e.g. `website_audit.lighthouse_handoff`) |
| `version` | Semver for track definition changes |
| `name` / `description` | Human-readable summary |
| `output_schema` | Path to JSON schema for final result |
| `steps` | Ordered list of step definitions |

Each step declares:

| Field | Description |
|---|---|
| `id` | Stable step id (used for artifacts and input mapping) |
| `input_map` | Declarative input from `$input` / `$artifacts` (tool and model steps) |
| `executor.type` | `tool` or `model` |
| `executor.tool` / `executor.task` | For tool steps |
| `executor.role` | For model steps (requests model role, not raw model name) |
| `executor.schema` | Output schema for model JSON steps |
| `executor.prompt_template` | Named prompt for model steps |

See [track-definition-schema.md](./track-definition-schema.md) for the shape that matches code today.

## Execution Model (Today)

```txt
POST /workflows/run { workflow_id, input, options }
  → Workflow registry → track_id
  → Run plan builder
  → Run plan executor (step by step)
  → validate final output
  → audit log + scoreboard

POST /tracks/run { track_id, input, options }
  → SessionJobManager (in-memory job)
  → TrackOrchestrator
  → for each step in file order:
       ModelRouter (model steps) | ToolRouter (tool steps)
       artifact[step.id] = output
  → validate final output schema
  → scoreboard + audit hooks
```

Steps run **sequentially** in array order. There is no dependency graph runner.

## Relationship to Other Registries

| Registry | What it indexes | Status |
|---|---|---|
| **Tool registry** | Manifest-backed tools and packs | Implemented |
| **Track registry** | Track JSON files + orchestration metadata | Implemented — see `GET /orchestration/tracks` |
| **Workflow registry** | Named user-facing workflows → track plans | Implemented — see `GET /orchestration/workflows` |
| **Capability registry** | All executable capabilities (tools + future nodes) | Partial — tools only |
| **Worker registry** | Models/devices by role and scorecard | Planned |

## Failure Modes (Known)

| Code | When |
|---|---|
| `TRACK_NOT_FOUND` | Unknown `track_id` |
| `TRACK_CONFIG_INVALID` | Malformed track JSON |
| `TOOL_NOT_FOUND` | Step references unregistered tool |
| `PROVIDER_UNAVAILABLE` | No usable runtime for model steps |
| `INVALID_INPUT` | Step input fails tool validation |

## Future (Not Implemented)

- Track classifier picks `track_id` from user request
- Track registry API with metadata search
- Versioned track migrations
- Shared core track modules referenced by multiple workflow tracks

Do **not** claim these exist until code and validation evidence say so.
