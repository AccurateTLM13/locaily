# Current State

Blunt snapshot of what Locaily is **right now**. When docs disagree with this file, check running code first, then update this file.

**Updated:** 2026-07-05 (Shadow Routing Evidence Review and Enforcement Policy)

## What Works

- **Local Brain server** - `companion/server.js` on `127.0.0.1:31313`
- **`POST /tasks/run`** - canonical single-tool entry (plus legacy `/analyze`)
- **`POST /tracks/run`** and **`GET /tracks`** - Crew track runner
- **Tool registry** - manifest-backed packs under `tool-packs/`
- **Lighthouse Handoff track** - `website_audit.lighthouse_handoff` in `companion/crew/tracks/`
- **DealSniper workflow track** - `marketplace.dealsniper` in `companion/crew/tracks/`
- **Declarative step `input_map`** - tool and model steps via `companion/crew/step-input.js`
- **Workflow orchestration** - `POST /workflows/plan`, `POST /workflows/run`, `GET /orchestration/*` (`companion/orchestration/`)
- **Model roles** - role slots in track steps and routing options
- **Provider routing** - Ollama + mock via `companion/providers/router.js`
- **Audit / scoreboard hooks** - `GET /audit`, `GET /scoreboard`, per-run recording
- **Memory Bridge v0** - `/memory/status`, `/memory/context-pack`, `/memory/writeback/propose` (disabled by default)
- **Operator Log editorial tracks** - experimental discovery and human-selected draft proposal paths
- **Benchmark Lab Milestone 1** - complete and operator-ready. Implements: engine and CLI (run, review, compare, promote, matrix, probe, diagnose, report, model-card, qualification, checksum-verify); 14 schemas with validation; mock + Ollama + ToolEvalRuntime adapters; execution-router with native/policy-routed/runtime-constrained modes; evidence promotion and checksum verification (canonical_text_v1/byte_exact); qualification-record generation; model capability probing; read-only runtime status at `GET /benchmark/status`; Local Brain consuming compact qualification data without importing Benchmark Lab engine internals
- **Tool Eval Bench compatibility slice** - `benchmark-lab/locaily/tracks/basic-tool-use/`, ported 8 Tool Eval Bench scenarios, `ToolEvalRuntime` adapter (Ollama `/api/chat` tool-calling), multi-turn runner, PARTIAL verdict support, and evidence/report pipeline
- **Hardened basic-tool-use track** - capability allowlisting, track-level tool-use policy, canonical checksum normalization (CRLF/LF), TC-05 field-level diagnostics, TC-12 detailed refusal diagnostics, separate restraint/answer metrics
- **Canonical Track Run Records** - schema (`locaily.track_run_record.v1`), record builder, example fixtures, schema validation tests, Benchmark Lab suite-runner and hybrid-runner integrations
- **Qualification Evidence Consumption** - six-state resolution engine (`companion/core/qualification-resolver.js`) mapping benchmark qualifications to consume states (qualified, unqualified, expired, stale, invalid, untested); Capability Registry (`companion/core/capability-registry.js`) surfacing qualification state per model+role+track; Evidence Linker (`companion/evidence/qualification-evidence-linker.js`) linking qualifications to Track Run Records; dry-run routing recommendation API at `POST /qualifications/dry-run`; read-only endpoints at `GET /qualifications/status`, `GET /qualifications/capabilities`, `GET /qualifications/capability`, `GET /capabilities`; `/health` response includes qualification summary; 25 tests in `scripts/test-qualification-resolver.js` covering all six states
- **Qualification-Aware Shadow Routing** - shadow routing engine (`companion/core/shadow-routing.js`) compares current routing decisions against qualification-backed recommendations without changing execution; Shadow recommendation recorded in Track Run Records via optional `routing.shadowRecommendation` field; Comparison states: agree, disagree, no-qualified-capability, insufficient-evidence, current-selection-unqualified, recommendation-unavailable; Integrated into `executeModelStep()` and `buildModelRoutingOptions()` in server; 31 tests in `scripts/test-shadow-routing.js` covering all comparison states and builder integration
- **Shadow Routing Evidence Review and Enforcement Policy** - enforcement policy engine (`companion/core/enforcement-policy.js`) defines 5 rollout states (disabled, shadow, eligible, enforced, suspended) with per-track granularity; Evaluates enforcement eligibility across 8+ conditions (track state, qualification state, score threshold, overrides, runtime availability, model readiness, track approval, comparison state); Shadow evidence review (`companion/evidence/shadow-evidence-review.js`) aggregates comparison statistics (agreement rate, coverage rate, by-track breakdowns); Endpoints: `GET /enforcement/status`, `POST /enforcement/set`, `POST /enforcement/approve`, `POST /enforcement/override`, `GET /enforcement/review`, `GET /enforcement/eligibility`; Enforcement remains off by default (all tracks in shadow); 60 tests in `scripts/test-enforcement-policy.js` covering all eligibility conditions, CRUD, and evidence review
- **Smoke and contract tests** - `scripts/smoke-test.js`, `scripts/contract-test.js` (current verification suite passes; see latest progress log or CI evidence for counts)

## What Is Partial

- **Track runner** - linear pipeline only; four workflow tracks in catalog
- **Model qualification coverage** - Qualification consumption engine and capability registry built; broader model, track, hardware, deeper live qualification evidence, and prompt/regression coverage remain incremental
- **Model scorecards / skill sheets** - six-state qualification consumption engine + capability registry are the runtime surface
- **Runtime Track Run Record emission** - The Crew orchestrator and workflow plan executor emit canonical Track Run Records for all supported runtime flows (direct track, workflow, Lighthouse Handoff, DealSniper). Records are persisted to `data/evidence/track-run-records/`. Responses from `/tracks/run` and `/workflows/run` include evidence references. Failed executions also produce records. Qualification Evidence Linker connects records to qualification data.
- **Memory Bridge** - v0 endpoints + optional Lighthouse `compose-handoff` preflight; no apply/search/embeddings
- **Console validation** - local validation UI exists; not a finished product surface
- **Fallback ladder** - partial (`retry_same_model_once`); no full escalation handler
- **Step input mapping** - declarative `input_map` on all track steps; legacy step-id fallbacks removed from `step-input.js`

## What Is Not Built Yet

- **Track planner** - no automatic decomposition from free-form requests
- **DAG execution** - steps run in file order only
- **Relay Node protocol** - conceptual docs only
- **Automatic track classification** - no classifier selects workflow + track
- **Worker registry** - models routed by role, not a full worker catalog
- **Automatic model swapping / Model Garage auto-switching** - proposed only
- **Extension to Local Brain HTTP bridge** - spec exists; not implemented end-to-end

## Canonical Track Run Records

The canonical Track Run Record schema (`locaily.track_run_record.v1`) is implemented at `companion/evidence/schemas/track-run-record.schema.json` with:
- **Record builder** at `companion/evidence/track-run-record-builder.js` with convenience builders for all 6 executor types (`model`, `tool`, `transform`, `rule`, `relay-node`, `hybrid`)
- **Example fixtures** for model, transform, and hybrid executor types
- **Schema validation tests** at `scripts/track-run-record-schema-test.js`
- **Benchmark Lab suite-runner** emits a Track Run Record after each mock/Ollama suite execution
- **Hybrid deterministic runner** emits parent + child records for each scenario trial's stages
- **Record store** at `companion/evidence/track-run-record-store.js` — append-only file-based persistence at `data/evidence/track-run-records/`
- **Runtime recorder** at `companion/crew/runtime-track-run-recorder.js` — shared service for live record emission
- **The Crew orchestrator** (`companion/crew/orchestrator.js`) emits records via `recordOpts` parameter
- **Workflow plan executor** (`companion/orchestration/run-plan-executor.js`) emits parent-child workflow records
- **Endpoint integration** — `/tracks/run` and `/workflows/run` return evidence references (`trackRunRecordId`, `childRecordIds`)
- **Failure coverage** — `recordFailedExecution()` emits records for failed runs
- **18 test cases** in `scripts/crew-track-run-record-test.js` covering all runtime flows
- **Architecture documentation** at `docs/02-track-system/canonical-track-run-records.md`

Existing Benchmark Lab schemas, qualification records, evidence, checksums, and CLI commands remain unchanged.

## Current Proof Workflows

**Lighthouse Handoff** - `website_audit.lighthouse_handoff`

Exercises extraction, classification, prioritization, validation, markdown assembly, model routing, deterministic tool steps, and deterministic fallback when runtime is unavailable.

**DealSniper** - `marketplace.dealsniper`

Three-step track: prepare listing -> model analysis -> schema validation. Proves a second workflow on the same declarative track runner.

**Benchmark Lab** - `benchmark-lab/`

Operator-ready local evaluation subsystem. Exercises 14 benchmark schemas, mock + Ollama + ToolEvalRuntime adapters, execution-router with native/policy-routed/runtime-constrained modes, capability probing, evidence promotion, approval, checksum verification (canonical_text_v1/byte_exact), qualification-record generation, model-card/report generation, and CLI workflow from run → review → compare → promote → qualification → report.

See [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md), [../03-workflows/dealsniper.md](../03-workflows/dealsniper.md), and [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md).

## Current Architecture Stage

**Pipeline-stage track runner plus completed Benchmark Lab Milestone 1**, not graph-stage planner.

Locaily dispatches **tracks** (units of work with contracts), not raw models. Workflows compose tracks. Models and tools plug into track steps. Benchmark Lab produces evidence and qualification records; Local Brain consumes compact records, not raw benchmark runs.

The North Star is now documented as a local capability network: decompose work into track contracts, route each track to the smallest qualified capability, validate output, and record evidence. This is direction, not a claim that Relay Node routing, adaptive model swapping, or automatic track planning exists.

## Source of Truth Order

1. Running code
2. Root `README.md`
3. This file
4. [../07-progress/build-status.md](../07-progress/build-status.md)
5. [../01-architecture/](../01-architecture/)
6. [../02-track-system/](../02-track-system/)
7. [../03-workflows/](../03-workflows/)
8. Archived docs - historical context only

## Now / Next / Later

| Layer | Focus |
|---|---|
| **Now** | Select one low-risk Track, enable guarded enforcement, record routing outcomes, compare enforced runtime results. Land Benchmark Lab with strict evidence boundaries |
| **Next** | Expand multi-model testing; add runtime performance feedback; add human correction records. Benchmark Lab live qualification depth; extension bridge; Memory Bridge private vault validation |
| **Later** | Simple dependency graphs; Relay Node protocol implementation; broader model qualification coverage |
| **Research** | DAG planner generated by Local Brain |
| **Archive** | Old companion-only architecture, pre-track planning docs |

Enforcement policy engine and shadow evidence review are complete. All tracks remain in shadow mode by default. The next step is selecting one low-risk Track (likely intent-classification based on approved qualification evidence), enabling guarded enforcement, and comparing enforced runtime results against shadow predictions.
