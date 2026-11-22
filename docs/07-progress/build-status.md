# Build Status

**Updated:** 2026-11-22 (SEC-01 Central Execution-Policy Runtime Gate implemented on `milestone/sec-01-execution-policy-runtime-gate`; CORE-07 Starter Read-Only Workflow Pack Library merged on `main` via PR #47; CORE-06, SYSTEM-PROOF-01, CORE-01–CORE-05, PX1–PX5/PX7–PX9, CTK-01–CTK-03, M09A, and Benchmark Lab M1–M3 merged on `main`)

## Current Stage

Operational **Local Brain** with **Crew track runner** (linear + DAG), generic reusable capability tracks (`core.*`), **Central Execution-Policy Runtime Gate (`SEC-01`)**, self-contained **Workflow Packs + Starter SDK (`CORE-06`)**, six official **read-only Starter Workflow Packs (`CORE-07`)**, **Automatic Task Intake & Track Selection (`CORE-06`/`CORE-07`)**, multi-track composed workflows, multi-tier model qualification & fallback routing, Companion Console (`CORE-05`/`CORE-06`/`CORE-07`/`SEC-01`), unified shell (`PX4`/`PX8`), Benchmark Lab M1–M3, Capability Trigger Kernel (`CTK-01`–`03`), Relay Nodes + `M09A` pairing + `PX2` LAN hard gate, Development Memory Loop (`DM1`–`DM10`), and empirical thesis validation (`SYSTEM-PROOF-01`, `POSITIVE` verdict). Physical two-device pilot and external 5-tester validation (`PX6`) and `RESEARCH-01` remain planned.

North Star direction is a local capability network: route track contracts to the smallest qualified capability, validate results, and preserve structured evidence for future routing and track improvement.

## Milestones

| Milestone | Status |
|---|---|
| **SEC-01 (Central Execution-Policy Runtime Gate)** | Implemented & Verified on `milestone/sec-01-execution-policy-runtime-gate` (`ready-for-delivery` pending merge) |
| **CORE-07 (Starter Read-Only Workflow Pack Library)** | Complete & Merged (PR #47) |
| **CORE-06 (Workflow Pack Contract, Starter SDK, and Automatic Task Intake)** | Complete & Merged (PR #46) |
| **CORE-01 – CORE-05 (Generic Capabilities, Matrix Qualification, Fallback, Console Explorer)** | Complete & Merged |
| **SYSTEM-PROOF-01 (Real Multi-Track Workflow Proof)** | Complete & Merged (`POSITIVE` verdict) |
| **PX1 – PX5, PX7 – PX9 (Truth Surfaces, LAN Gate, Run Inspector, Unified Shell, Tester Package, Audit Remediation)** | Complete |
| **PX6 (External Validation Program — 5 Testers + Physical 2-Device Pilot)** | Planned (internal dry-run & 2nd workflow done; external testers & 2nd device pending) |
| **CTK-01 – CTK-03 (Capability Trigger Kernel, Capsules, Event Bus)** | Complete |
| **M09A (Relay Trust & Pairing Ceremony)** | Complete |
| **Benchmark Lab M1 – M3 (Evaluation Engine, Semantic Qualification, Interactive Model Lab)** | Complete |
| **DEV-LOOP-01 & DEV-HARNESS-01 (Queue Runner & Harness-Neutral Operations)** | Complete |
| **LH Product Bridge & Durable Job State Integrity** | Complete |
| **Development Memory Loop (DM1–DM10)** | Complete |
| **RESEARCH-01 (Decision Track Bakeoff)** | Planned (low priority; gated on operator approval) |

## Current Proof

**Repo Review (`SYSTEM-PROOF-01`)** - workflow id `repo_review`, empirically validated on unseen `expressjs/express@7ef98448...` (`POSITIVE` verdict: 1.2B orchestrated model matched/outperformed monolithic 3.2B baseline with 100% factual accuracy and isolated fault recovery).

**Lighthouse Handoff** - track id `website_audit.lighthouse_handoff`

**DealSniper** - track id `marketplace.dealsniper`

**Document Review & Content OS** - workflow ids `document_review`, `content_os` (proving cross-domain reuse of `core.*` capability tracks)

**Benchmark Lab** - operator-ready local evaluation subsystem under `benchmark-lab/`, with CLI and interactive localhost workflows (M1–M3) and 22 model qualification records across `llama3.2` and `LFM2.5` tiers.

## Working

- Local Brain server (`127.0.0.1:31313`)
- `GET /health`, `GET /tools`, `GET /audit`, `GET /scoreboard`, `GET /benchmark/status`
- Interactive Benchmark Lab APIs under `/benchmark/models`, `/benchmark/suites`, `/benchmark/preflight`, and `/benchmark/runs`
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

**Now:** `main` is idle following `CORE-07` (`core-07-starter-workflow-packs`) merge via PR #47 (`25d3a2f`). Canonical state lives in `development/project-state.json`.

**Next:** Ready to start `sec-01-execution-policy-runtime-gate` (`SEC-01`: Central Execution-Policy Runtime Gate). Other planned options: `px6-external-validation-program` or `research-01-decision-track-bakeoff`.

## Evidence Pointers

- Benchmark Lab architecture: [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md)
- Benchmark Lab Operator Guide: [../../benchmark-lab/OPERATOR_GUIDE.md](../../benchmark-lab/OPERATOR_GUIDE.md)
- Benchmark Lab Validation Checklist: [../../benchmark-lab/VALIDATION_CHECKLIST.md](../../benchmark-lab/VALIDATION_CHECKLIST.md)
- North Star: [../00-start-here/north-star-local-capability-network.md](../00-start-here/north-star-local-capability-network.md)
- M4 completion: [milestone-4-completion.md](./milestone-4-completion.md)
- M5 completion: [milestone-5-multi-device-workflow-coordination.md](./milestone-5-multi-device-workflow-coordination.md)
- Track system: [../02-track-system/README.md](../02-track-system/README.md)
- Input mapping: [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md)
