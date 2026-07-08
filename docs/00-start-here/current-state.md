# Current State

Blunt snapshot of what Locaily is **right now**. When docs disagree with this file, check running code first, then update this file.

**Updated:** 2026-07-08 (Output Quality Review foundation complete)

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
- **Guarded Enforcement Integration** - Enforcement decision evaluated in the canonical model router (`companion/crew/model-router.js`) via `evaluateEnforcement()`. The routing sequence: current selection -> shadow recommendation -> policy evaluation -> final selection -> execution. Enforcement decision structure recorded in Track Run Records via optional `routing.enforcementDecision`. Fallback behavior: enforced capability failure triggers re-execution with original selected model. First pilot is active for `website_audit.lighthouse_handoff` / `priority_helper`; applied enforcement executes the qualification record's runtime model name while preserving stable capability ids in policy/evidence. 91 tests in `scripts/test-enforcement-routing.js` cover policy states, eligibility failures, routing evidence, runtime failures, fallback metadata, and compatibility. Evidence review includes enforcement outcome metrics (attempts, applied, blocked, fallback, success rates per capability). Additive API endpoints: `GET /enforcement/pilot`, `GET /enforcement/decisions`. Safe state change enforcement: `POST /enforcement/set` to `enforced` requires track approval, qualified capability, runtime readiness, shadow evidence, and non-suspended state.
- **Durable Enforcement Policy** — complete as of 2026-07-05
- **LFM2.5-1.2B-Thinking qualified for Lighthouse Priority Helper** — first companion track (`website_audit.lighthouse_handoff`, role `priority_helper`) with a `qualified` model capability. Benchmark Lab evaluation: 11/12 PASS (91.7% structured-output pass rate, score 0.9167). Model card, promoted evidence, checksums, and qualification record published. Consumed by Local Brain — `/health` reports `qualified: 1` for `website_audit.lighthouse_handoff` and `priority_helper`.
- **Pilot Enforcement Validation active** — `website_audit.lighthouse_handoff` is approved and in `enforced` state. The qualified capability is `lfm25-1p2b-thinking-local`, executed through runtime model `hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest`. First 10 monitored enforced executions succeeded; `/enforcement/pilot` reports the active pilot and enforcement review metrics.
- **Human output-quality reviews** - Track Run Records can receive separate human review/correction records through `POST /runs/:id/review` and `GET /runs/:id/review`. Reviews are stored separately under `data/evidence/human-reviews/`; original model output and enforcement decisions are not overwritten. `GET /enforcement/quality-summary` aggregates reviewed runs by verdict, score averages, correction rate, failure reasons, and critical risk count.
- **Smoke and contract tests** - `scripts/smoke-test.js`, `scripts/contract-test.js` (current verification suite passes; see latest progress log or CI evidence for counts)

## What Is Partial

- **Track runner** - linear pipeline only; four workflow tracks in catalog
- **Model qualification coverage** - Qualification consumption engine and capability registry built; broader model, track, hardware, deeper live qualification evidence, and prompt/regression coverage remain incremental
- **Model scorecards / skill sheets** - six-state qualification consumption engine + capability registry are the runtime surface
- **Runtime Track Run Record emission** - The Crew orchestrator and workflow plan executor emit canonical Track Run Records for all supported runtime flows (direct track, workflow, Lighthouse Handoff, DealSniper). Records are persisted to `data/evidence/track-run-records/`. Responses from `/tracks/run` and `/worksflows/run` include evidence references. Failed executions also produce records. Qualification Evidence Linker connects records to qualification data.
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
- **Enforcement Decision** — optional `routing.enforcementDecision` added to schema. Additive, validated. See `companion/crew/model-router.js` `evaluateEnforcement()` for integration.

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
| **Now** | Pilot Enforcement Validation is active for `website_audit.lighthouse_handoff` / `priority_helper`. The track is approved and `enforced`; the first 10 monitored enforced executions succeeded using `hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest`, with persisted `enforcementDecision.applied=true` records. |
| **Next** | Use the human review APIs to review the actual enforced Lighthouse pilot outputs and decide whether to continue, suspend, narrow, or broaden the pilot. Benchmark Lab live qualification depth, extension bridge, and Memory Bridge private vault validation remain candidates, not automatic scope. |
| **Later** | Simple dependency graphs; Relay Node protocol implementation; broader model qualification coverage |
| **Research** | DAG planner generated by Local Brain |
| **Archive** | Old companion-only architecture, pre-track planning docs |

LFM2.5-1.2B-Thinking is now the first enforced qualified model capability for a companion server runtime track (`website_audit.lighthouse_handoff`, role `priority_helper`). Runtime execution uses `runtimeModelName` from the qualification record; policy and evidence keep the stable capability id `lfm25-1p2b-thinking-local`. Enforcement is still per-track only; no global enforcement is enabled.

Human review records now provide the next evidence layer. A run can be transport-successful and enforcement-successful while still receiving `needs_edit` or `fail` from human quality review.
