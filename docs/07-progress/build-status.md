# Build Status

**Updated:** 2026-06-15

## Current Stage

Pipeline-stage **Local Brain** with **Pit Crew track runner** — linear steps, declarative tool-step `input_map`, one proof track.

## Milestones

| Milestone | Status |
|---|---|
| **1A — Track system explicit (docs)** | Complete |
| **1B — Declarative track input mapping** | **Complete** |
| **2 — Second workflow track** | Not started |

## Current Proof

**Lighthouse Handoff** — track id `website_audit.lighthouse_handoff`

## Working

- Local Brain server (`127.0.0.1:31313`)
- `GET /health`, `GET /tools`, `GET /audit`, `GET /scoreboard`
- `POST /tasks/run` and legacy `POST /analyze`
- `POST /tracks/run` and `GET /tracks`
- Manifest-backed tool registry
- Lighthouse proof track (7 steps)
- **Declarative tool-step `input_map`** (`input-map-resolver.js` + Lighthouse track JSON)
- Model roles + provider router (Ollama, mock)
- Input gate, permissions, audit, result validation
- Memory Bridge v0 endpoints (disabled by default)
- Smoke tests 50/50 (clean server); contract tests
- Windows launch helpers

## Partial

- Track registry (one track file)
- Model scorecards (spec; limited implementation)
- Scoreboard (records runs; no full rubric harness)
- Memory Bridge (v0; compose preflight only on Lighthouse)
- Fallback ladder (retry only)
- Legacy `buildLegacyStepInput()` fallback for tracks without `input_map`
- Validation console (early UI)

## Not Built

- DAG runner / graph planner
- NearbyNode protocol and connectors
- Automatic track classifier
- Worker registry beyond role slots
- Unified capability registry
- Extension ↔ Local Brain HTTP bridge (end-to-end)
- `GET /jobs/{id}/status` persistence API

## Current Priority

**Milestone 2:** Add a second workflow track using declarative `input_map` (no new hardcoded step-id branches).

## Evidence Pointers

- Pit Crew extraction: [../01-architecture/pit-crew-gap-analysis.md](../01-architecture/pit-crew-gap-analysis.md)
- L1 validation: [../03-workflows/lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md)
- L2 Ollama + Memory: [../04-validation/l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md)
- Track system: [../02-track-system/README.md](../02-track-system/README.md)
- Input mapping: [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md)
