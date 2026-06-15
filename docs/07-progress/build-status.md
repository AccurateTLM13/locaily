# Build Status

**Updated:** 2026-06-15

## Current Stage

Pipeline-stage **Local Brain** with **Pit Crew track runner** — linear steps, declarative `input_map` on tool and model steps, two workflow tracks.

## Milestones

| Milestone | Status |
|---|---|
| **1A — Track system explicit (docs)** | Complete |
| **1B — Declarative track input mapping (tools)** | **Complete** |
| **2 — Second workflow track** | **Complete** |
| **3 — Model-step input mapping** | **Complete** |

## Current Proof

**Lighthouse Handoff** — track id `website_audit.lighthouse_handoff`

**DealSniper** — track id `marketplace.dealsniper`

## Working

- Local Brain server (`127.0.0.1:31313`)
- `GET /health`, `GET /tools`, `GET /audit`, `GET /scoreboard`
- `POST /tasks/run` and legacy `POST /analyze`
- `POST /tracks/run` and `GET /tracks`
- Manifest-backed tool registry
- Lighthouse proof track (7 steps)
- DealSniper workflow track (3 steps)
- **Declarative step `input_map`** (`input-map-resolver.js` + `step-input.js` for tool and model steps)
- Model roles + provider router (Ollama, mock)
- Input gate, permissions, audit, result validation
- Memory Bridge v0 endpoints (disabled by default)
- Smoke tests 51/51 (clean server); contract tests
- Windows launch helpers

## Partial

- Track registry (two track files)
- Model scorecards (spec; limited implementation)
- Scoreboard (records runs; no full rubric harness)
- Memory Bridge (v0; compose preflight only on Lighthouse)
- Fallback ladder (retry only)
- Legacy `buildLegacyToolStepInput()` / `buildLegacyModelStepInput()` fallbacks for unmigrated steps
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

**Next:** Remove legacy step-input fallbacks (all catalog steps now declare `input_map`); Model Garage evaluation harness (spec only until evidence).

## Evidence Pointers

- Pit Crew extraction: [../01-architecture/pit-crew-gap-analysis.md](../01-architecture/pit-crew-gap-analysis.md)
- L1 validation: [../03-workflows/lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md)
- L2 Ollama + Memory: [../04-validation/l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md)
- Track system: [../02-track-system/README.md](../02-track-system/README.md)
- Input mapping: [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md)
