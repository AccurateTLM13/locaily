# Build Status

**Updated:** 2026-07-18 (Development Memory Loop DM1–DM10 complete — events through multi-project template)

## Current Stage

Pipeline-stage **Local Brain** with **Crew track runner**, JSON-first internal contracts, workflow orchestration, Memory Bridge v0, and Benchmark Lab Milestone 1 complete and operator-ready. M9 physical multi-device pilot infrastructure is prepared (not yet executed on hardware).

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
| **6 - Relay Nodes (M4)** | Complete |
| **7 - Multi-Device Workflow Coordination (M5)** | Complete |
| **8 - Pilot Infrastructure (M9)** | Infrastructure prepared — not yet executed on hardware |
| **8 - Operator Control Plane (M6)** | Complete |
| **9 - Physical Multi-Device Pilot (M9)** | Infrastructure prepared — pilot not yet executed |
| **Development Memory Loop (DM1–DM10)** | Complete — events, capture, sessions, candidates, review, maintainer, retrieval, processor, multi-project |

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
- Lighthouse proof track (10 steps)
- DealSniper workflow track (3 steps)
- Experimental Operator Log editorial tracks
- Declarative step `input_map` on all track steps (`input-map-resolver.js` + `step-input.js`)
- Model roles + provider router (Ollama, mock)
- Benchmark Lab schemas (14), mock + Ollama + ToolEvalRuntime adapters, CLI commands (run/compare/promote/review/matrix/probe/diagnose/report/qualification/model-card/checksum-verify), evidence promotion, checksum verification, capability probing, and qualification records
- Execution-router architecture with native/policy-routed/runtime-constrained execution modes
- Policy-routed and runtime-constrained execution behavior
- Model capability probing with cached results and suite requirement checking
- Qualification records schema-validated at `companion/core/model-qualification-loader.js`
- Input gate, permissions, audit, result validation
- Memory Bridge v0 endpoints (disabled by default)
- Relay Node protocol, node registry, cross-node routing with local fallback (`companion/relay/*`, `/relay/*` endpoints)
- Multi-device workflow placement planner (`companion/relay/placement.js`) + `POST /relay/plan` preview; distributed step execution with local fallback on node failure
- Pilot infrastructure for M9 physical multi-device pilot (`scripts/pilot/`): hardware profile schema, template, pilot runner CLI with three relay policies, evidence collection, and summary CSV generation
- Memory Bridge v1: structured search (`/memory/search`) + writeback-apply (`/memory/writeback/apply`, opt-in)
- Development Memory Loop DM1–DM10: event store, capture adapters, sessions, candidates, review inbox, maintainer, context-pack retrieval, background capture processor, multi-project registry (`/memory/projects/*`, `npm run memory:*`, `npm run test:development-memory`)
- Current verification suite passes; see the latest progress log or CI evidence for counts
- Windows launch helpers

## Partial

- Track registry (orchestration metadata + implemented track files)
- Model qualification coverage (Milestone 1 engine and operator workflow complete; broader model, track, and hardware qualification remains incremental)
- Model scorecards / skill sheets (direction; qualification records are the current evidence-backed runtime surface)
- Scoreboard (records runs; no full rubric harness)
- Memory Bridge (v1 apply is opt-in; Development Memory Loop complete; no embeddings/vector search yet)
- Fallback ladder (retry only; relay fallback added for cross-node routing)
- Validation console (early UI)

## Not Built

- Automatic model swapping / Model Garage auto-switching
- Automatic track classifier (optional M3 area — planner covers manual decomposition)
- Distributed consensus / Byzantine fault tolerance across relay nodes (relay nodes are ephemeral execution targets; local fallback always available)
- Global scheduler / latency-aware placement (placement is capability + health + least-loaded only)
- `GET /jobs/{id}/status` persistence API

## Recently Completed

- **DAG execution engine** (`companion/core/dag-graph.js`, `companion/core/dag-executor.js`): dependency graph from `depends_on` / `$artifacts.*` input-map references, topological sort, cycle + missing-step detection, level-grouped parallel execution.
- **Track-run DAG mode**: `POST /tracks/run` with `{"options":{"useDag":true}}` runs steps in dependency order.
- **Workflow DAG integration**: `companion/orchestration/run-plan-executor.js` executes run-plan steps in dependency levels with per-level parallelism (`options.useDag`, default true).
- **Track planner**: `POST /tracks/plan` decomposes a free-form request into a structured plan; gated by model qualification (no blind LLM calls).
- See [Track DAG Execution](../02-track-system/dag-execution.md).

## Current Priority

**Now:** Full Lighthouse Handoff product loop is complete — 4 roles (priority_helper, developer_task_writer, guardrail_writer, testing_checklist_writer) qualified; 3 enforced. Track has 10 steps. Full assembled artifact quality gate with `--artifact full-handoff` mode. No global broadening.

**Next:** Decide next action after explicit direction. Multi-model track expansion, DealSniper workflow build-out, and live qualification depth remain follow-on candidates.

**Benchmark Lab:** Milestone 1 complete and operator-ready. Broader model, track, hardware, and live qualification coverage remain follow-on work — not yet scoped or scheduled.

## Evidence Pointers

- Benchmark Lab architecture: [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md)
- Benchmark Lab Operator Guide: [../../benchmark-lab/OPERATOR_GUIDE.md](../../benchmark-lab/OPERATOR_GUIDE.md)
- Benchmark Lab Validation Checklist: [../../benchmark-lab/VALIDATION_CHECKLIST.md](../../benchmark-lab/VALIDATION_CHECKLIST.md)
- North Star: [../00-start-here/north-star-local-capability-network.md](../00-start-here/north-star-local-capability-network.md)
- M4 completion: [milestone-4-completion.md](./milestone-4-completion.md)
- M5 completion: [milestone-5-multi-device-workflow-coordination.md](./milestone-5-multi-device-workflow-coordination.md)
- Track system: [../02-track-system/README.md](../02-track-system/README.md)
- Input mapping: [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md)
