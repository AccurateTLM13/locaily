# Build Status

**Updated:** 2026-06-26

## Current Stage

Pipeline-stage **Local Brain** with **Pit Crew track runner**, JSON-first internal contracts, workflow orchestration, Memory Bridge v0, and Benchmark Lab evidence/qualification scaffolding.

## Milestones

| Milestone | Status |
|---|---|
| **1A - Track system explicit (docs)** | Complete |
| **1B - Declarative track input mapping (tools)** | Complete |
| **2 - Second workflow track** | Complete |
| **3 - Model-step input mapping** | Complete |
| **4 - Track-based orchestration** | Complete |
| **5 - Benchmark Lab** | Active / accepted next milestone |

## Current Proof

**Lighthouse Handoff** - track id `website_audit.lighthouse_handoff`

**DealSniper** - track id `marketplace.dealsniper`

**Benchmark Lab** - controlled local evaluation scaffold under `benchmark-lab/`, with read-only runtime status and qualification-record loading.

## Working

- Local Brain server (`127.0.0.1:31313`)
- `GET /health`, `GET /tools`, `GET /audit`, `GET /scoreboard`, `GET /benchmark/status`
- `POST /tasks/run` and legacy `POST /analyze`
- `POST /tracks/run` and `GET /tracks`
- `GET /orchestration/tracks`, `GET /orchestration/workflows`, `POST /workflows/plan`, `POST /workflows/run`
- Workflow orchestration layer (`companion/orchestration/`)
- Manifest-backed tool registry
- Lighthouse proof track (7 steps)
- DealSniper workflow track (3 steps)
- Experimental Operator Log editorial tracks
- Declarative step `input_map` on all track steps (`input-map-resolver.js` + `step-input.js`)
- Model roles + provider router (Ollama, mock)
- Benchmark Lab schemas, mock run loop, evidence folders, reports, model cards, and qualification records
- Qualification records schema-validated at `companion/core/model-qualification-loader.js`
- Input gate, permissions, audit, result validation
- Memory Bridge v0 endpoints (disabled by default)
- Smoke tests 56/56 (clean server); contract/schema/unit tests
- Windows launch helpers

## Partial

- Track registry (orchestration metadata + implemented track files)
- Benchmark Lab live model evaluation depth (mock loop and first evidence path exist; broader qualification coverage remains incremental)
- Model scorecards / skill sheets (direction; qualification records are the current evidence-backed runtime surface)
- Scoreboard (records runs; no full rubric harness)
- Memory Bridge (v0; compose preflight only on Lighthouse)
- Fallback ladder (retry only)
- Validation console (early UI)

## Not Built

- Automatic model swapping / Model Garage auto-switching
- DAG runner / graph planner
- NearbyNode protocol and connectors
- Automatic track classifier
- Worker registry beyond role slots
- Unified capability registry
- Extension to Local Brain HTTP bridge (end-to-end)
- `GET /jobs/{id}/status` persistence API

## Current Priority

**Now:** Land Milestone 5 Benchmark Lab with strict evidence boundaries. Runtime may consume compact qualification records and approved summaries, but must not import Benchmark Lab runner internals.

**Next:** Benchmark Lab live qualification depth, extension bridge, or Memory Bridge private vault validation.

## Evidence Pointers

- M5 checkpoint: [milestone-5-checkpoint.md](./milestone-5-checkpoint.md)
- Benchmark Lab architecture: [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md)
- M4 completion: [milestone-4-completion.md](./milestone-4-completion.md)
- Pit Crew extraction: [../01-architecture/pit-crew-gap-analysis.md](../01-architecture/pit-crew-gap-analysis.md)
- L2 Ollama + Memory: [../04-validation/l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md)
- Track system: [../02-track-system/README.md](../02-track-system/README.md)
- Input mapping: [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md)
