# Local Brain Orchestration

Track-based orchestration layer for turning workflow requests into structured run plans and executing them step by step.

**Status:** Implemented (Milestone 4) — Lighthouse Handoff is the first workflow target.

## Purpose

The Track runner (`POST /tracks/run`) executes a known `track_id` directly. The orchestration layer adds a workflow-facing path:

```txt
Workflow request (JSON)
  → Workflow registry lookup
  → Track registry metadata
  → Run plan builder (JSON workflow plan)
  → Run plan executor (JSON step artifacts + statuses)
  → Validation (JSON validation results)
  → Audit logging (JSONL run records)
  → Canonical Track Run Record (JSON)
  → Structured response envelope (JSON)
  → [optional] Markdown export from final JSON state
```

The Canonical Track Run Record is the active build slice — it is not yet fully emitted at every track execution.

All orchestration state is JSON. Markdown handoffs, when present, are **exports** — see [json-first-internal-format.md](./json-first-internal-format.md).

## Key Concepts

- **Tracks** are the unit of dispatch. Locaily routes track contracts, not raw model names.
- **The Crew** is assembled per Track: the Track contract declares required model roles, tools, validators, and capabilities.
- **Model Lab / Benchmark Lab** produces qualification evidence that may inform model-role suitability at runtime. The Local Brain consumes compact qualification records through `companion/core/model-qualification-loader.js` but must not import `benchmark-lab/engine/` modules.
- **Relay Nodes** remain future capability providers — not implemented.
- **Canonical Track Run Records** are the current active evidence slice.

This milestone does **not** implement:

- Model swapping / Model Garage routing
- Relay Node capability routing
- LLM-generated plans or DAG planners
- Semantic quality scoring

## Module Layout

```txt
companion/orchestration/
  index.js
  track-registry.js
  workflow-registry.js
  run-plan-builder.js
  run-plan-executor.js
  run-plan-validator.js
  run-logger.js
  registry/
    track-metadata.json
    workflows.json
```

Execution still reuses Crew step routers via `companion/crew/orchestrator.js` (`executeStep`, `assembleTrackResult`).

## HTTP Surfaces

| Endpoint | Purpose |
|---|---|
| `GET /orchestration/tracks` | Enriched track registry entries |
| `GET /orchestration/workflows` | Workflow → track mappings |
| `POST /workflows/plan` | Build a run plan without executing |
| `POST /workflows/run` | Build + execute a run plan |

See [api-contract.md](./api-contract.md) for request/response shapes.

## Run Lifecycle

1. Client sends `{ workflow_id, input, options? }`.
2. Workflow registry resolves `track_id`.
3. Track registry supplies purpose, contracts, worker hints, validation expectations.
4. Run plan builder expands the track into ordered plan steps with `pending` status.
5. Run plan executor runs each step sequentially, updating step status and `worker_used`.
6. Validator checks step output shape and final workflow sections/schema.
7. Run logger writes an audit event with task id, workflow id, selected tracks, step statuses, duration, and final status.

## Failure Behavior

- Invalid workflow/input → `400`
- Unknown workflow/track → `404`
- Runtime unavailable → `503` (same gate as `POST /tracks/run`)
- Step or final validation failure → `422` with run plan attached in error `meta`
- Step execution error → `500` with failed step status preserved on the plan

## Relationship to `/tracks/run`

| Path | When to use |
|---|---|
| `POST /tracks/run` | Direct track execution when `track_id` is already known |
| `POST /workflows/run` | Workflow-first entry; returns executed run plan + audit trail |

Both paths share the same underlying track definitions in `companion/crew/tracks/`.

## Related Docs

- [json-first-internal-format.md](./json-first-internal-format.md)
- [../02-track-system/track-registry.md](../02-track-system/track-registry.md)
- [../02-track-system/run-plan-format.md](../02-track-system/run-plan-format.md)
- [../03-workflows/lighthouse-handoff-run-plan.md](../03-workflows/lighthouse-handoff-run-plan.md)
- [../02-track-system/workflow-registry.md](../02-track-system/workflow-registry.md)
- [crew.md](./crew.md)
- [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md)
