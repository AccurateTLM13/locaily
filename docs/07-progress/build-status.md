# Build Status

**Updated:** 2026-07-04

## Current Stage

Pipeline-stage **Local Brain** with **Crew track runner**, JSON-first internal contracts, workflow orchestration, Memory Bridge v0, and Benchmark Lab Milestone 1 complete and operator-ready.

North Star direction is now documented as a local capability network: route track contracts to the smallest qualified capability, validate results, and preserve structured evidence for future routing and track improvement.

## Milestones

| Milestone | Status |
|---|---|
| **1A - Track system explicit (docs)** | Complete |
| **1B - Declarative track input mapping (tools)** | Complete |
| **2 - Second workflow track** | Complete |
| **3 - Model-step input mapping** | Complete |
| **4 - Track-based orchestration** | Complete |
| **5 - Benchmark Lab** | Complete — Milestone 1 operator-ready |

## Current Proof

**Lighthouse Handoff** - track id `website_audit.lighthouse_handoff`

**DealSniper** - track id `marketplace.dealsniper`

**Benchmark Lab** - operator-ready local evaluation subsystem under `benchmark-lab/`, with CLI run/compare/promote/review/matrix/probe/diagnose/report/qualification/model-card/checksum-verify commands, mock + Ollama + ToolEvalRuntime adapters, 14 schemas, execution modes, capability probing, evidence promotion workflow, checksum verification, qualification-record generation, and read-only runtime status.

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
- Declarative step `input_map` (`input-map-resolver.js` + `step-input.js` for tool and model steps)
- Model roles + provider router (Ollama, mock)
- Benchmark Lab schemas (14), mock + Ollama + ToolEvalRuntime adapters, CLI commands (run/compare/promote/review/matrix/probe/diagnose/report/qualification/model-card/checksum-verify), evidence promotion, checksum verification, capability probing, and qualification records
- Execution-router architecture with native/policy-routed/runtime-constrained execution modes
- Policy-routed and runtime-constrained execution behavior
- Model capability probing with cached results and suite requirement checking
- Qualification records schema-validated at `companion/core/model-qualification-loader.js`
- Input gate, permissions, audit, result validation
- Memory Bridge v0 endpoints (disabled by default)
- Current verification suite passes; see the latest progress log or CI evidence for counts
- Windows launch helpers

## Partial

- Track registry (orchestration metadata + implemented track files)
- Model qualification coverage (Milestone 1 engine and operator workflow complete; broader model, track, and hardware qualification remains incremental)
- Model scorecards / skill sheets (direction; qualification records are the current evidence-backed runtime surface)
- Scoreboard (records runs; no full rubric harness)
- Memory Bridge (v0; compose preflight only on Lighthouse)
- Fallback ladder (retry only)
- Validation console (early UI)

## Not Built

- Automatic model swapping / Model Garage auto-switching
- DAG runner / graph planner
- Relay Node protocol and connectors
- Automatic track classifier
- Worker registry beyond role slots
- Unified capability registry
- Extension to Local Brain HTTP bridge (end-to-end)
- `GET /jobs/{id}/status` persistence API

## Current Priority

**Now:** Build Canonical Track Run Records as the first Track Learning Evidence Loop slice. Records must stay summary-safe and must not store raw sensitive inputs or outputs by default.

**Next:** Not yet documented beyond the active build slice.

**Benchmark Lab:** Milestone 1 complete and operator-ready. Broader model, track, hardware, and live qualification coverage remain follow-on work — not yet scoped or scheduled.

## Evidence Pointers

- Benchmark Lab architecture: [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md)
- Benchmark Lab Operator Guide: [../../benchmark-lab/OPERATOR_GUIDE.md](../../benchmark-lab/OPERATOR_GUIDE.md)
- Benchmark Lab Validation Checklist: [../../benchmark-lab/VALIDATION_CHECKLIST.md](../../benchmark-lab/VALIDATION_CHECKLIST.md)
- North Star: [../00-start-here/north-star-local-capability-network.md](../00-start-here/north-star-local-capability-network.md)
- M4 completion: [milestone-4-completion.md](./milestone-4-completion.md)
- Track system: [../02-track-system/README.md](../02-track-system/README.md)
- Input mapping: [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md)
