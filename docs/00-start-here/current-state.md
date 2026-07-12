# Current State

Blunt snapshot of what Locaily is **right now**. When docs disagree with this file, check running code first, then update this file.

**Updated:** 2026-07-12 (M6 scope: durable job store wired into Local Brain; `/jobs` API endpoints added: `POST /jobs`, `GET /jobs`, `GET /jobs/:id`; `jobTotals` in `/health` response)

## What Works

- **Local Brain server** - `companion/server.js` on `127.0.0.1:31313`
- **`POST /tasks/run`** - canonical single-tool entry (plus legacy `/analyze`)
- **`POST /tracks/run`** and **`GET /tracks`** - Crew track runner
- **Tool registry** - manifest-backed packs under `tool-packs/`
- **Lighthouse Handoff track** - `website_audit.lighthouse_handoff` in `companion/crew/tracks/`
- **DealSniper workflow track** - `marketplace.dealsniper` in `companion/crew/tracks/`
- **Declarative step `input_map`** - tool and model steps via `companion/crew/step-input.js`
- **Workflow orchestration** - `POST /workflows/plan`, `POST /workflows/run`, `GET /orchestration/*` (`companion/orchestration/`). Run-plan execution now uses the DAG engine (`run-plan-executor.js`) — steps execute in dependency levels with per-level parallelism; sequential when `options.useDag === false`.
- **Track planner (`/tracks/plan`)** - model-backed free-form → plan decomposition, now qualification-gated (no blind LLM calls). `reasoning_worker` is qualified for `llama3.2-local` (Benchmark Lab suite `track-planning`, mock runtime, 4/4 pass).
- **Model roles** - role slots in track steps and routing options
- **Provider routing** - Ollama + mock via `companion/providers/router.js`
- **Audit / scoreboard hooks** - `GET /audit`, `GET /scoreboard`, per-run recording
- **Memory Bridge v0** - `/memory/status`, `/memory/context-pack`, `/memory/writeback/propose` (disabled by default)
- **Relay Node protocol (M4)** - `companion/relay/*`: registry, connector, router. Endpoints `GET /relay/protocol`, `GET /relay/nodes`, `POST /relay/register`, `POST /relay/heartbeat`, `POST /relay/unregister`, `POST /relay/step`. Cross-node routing wired into track + workflow step execution with local fallback + `RELAY_FALLBACK` audit. `GET /health` reports relay node counts.
- **Memory Bridge v1 (M4)** - adds `POST /memory/search` (allowlisted ranked search) and `POST /memory/writeback/apply` (opt-in, vault-path-gated, `memory.writeback.apply` permission).
- **Multi-Device Workflow Coordination (M5)** - `companion/relay/placement.js` placement planner distributes model steps across healthy relay nodes (capability + health + least-loaded; `distribute` policy). `POST /relay/plan` previews placement. `executeStepWithAssignedNode` routes each step to its assigned node and falls back locally (with `RELAY_FALLBACK` audit) on node failure. Wired into `/tracks/run` and `/workflows/run` for `relay_policy=distribute`; responses include `relay_placement` summary. Tests: `test-relay-placement.cjs` (14/14), `test-multi-device-e2e.cjs` (22/22), `test-relay` unit (17/17 after harness fix).
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
- **LFM2.5-1.2B-Thinking qualified for Developer Task Writer** — second qualified role on the same track. Qualification from Assembly Pilot evidence: 4 real URLs x 5 enforced runs = 20 total, 20/20 quality-gate pass, 0 fail, 0 critical risk, 0 corrections, score 1.0. Qualification record, evidence summary, checksums, and model card update published. Local Brain loads developer_task_writer as `qualified`.
- **LFM2.5-1.2B-Thinking qualified for Guardrail Writer** — third qualified role, now enforced alongside priority_helper and developer_task_writer. Qualification from guarded enforcement pilot: 3 real URLs x 5 enforced runs = 15 total, 15/15 quality-gate pass, 0 fail, 0 critical risk, 0 corrections, score 1.0.
- **LFM2.5-1.2B-Thinking qualified for Testing Checklist Writer** — fourth qualified role on the same track. Schema (6 required fields), prompt (`write_testing_checklist`), track step (`write_testing_checklist`, step 8/10), handoff integration (`normalizeTestingChecklistPacket` + 6 markdown sections), quality gate completeness checks, and `--artifact full-handoff` gate mode. Qualification evidence, approved marker, checksums, and qualification record published (score 1.0). Track has 10 steps. Capabilities: 6, Qualified: 4. No global broadening.
- **Pilot Enforcement Validation active** — `website_audit.lighthouse_handoff` is approved and in `enforced` state. Three roles now enforced: `priority_helper` (124 applied/136 total, score 0.9167), `developer_task_writer` (47 applied/49 total, score 1.0), and `guardrail_writer` (15 applied/15 total, score 1.0). `testing_checklist_writer` is qualified (score 1.0) and ready for enforcement. All execute through qualified capability `lfm25-1p2b-thinking-local`, runtime model `hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest`. Track has 10 steps, 6 capabilities, 4 qualified. No global broadening.
- **Human output-quality reviews** - Track Run Records can receive separate human review/correction records through `POST /runs/:id/review` and `GET /runs/:id/review`. Reviews are stored separately under `data/evidence/human-reviews/`; original model output and enforcement decisions are not overwritten. `GET /enforcement/quality-summary` aggregates reviewed runs by verdict, score averages, correction rate, failure reasons, and critical risk count. Operator shortcut: `npm.cmd run quality-review -- list|show|pass|needs-edit|fail|summary`.
- **Lighthouse run + Human Gate packet** - `npm.cmd run lighthouse:run -- --url https://your-site.com` creates a Lighthouse Track Run Record from a simple URL command using a synthetic Lighthouse payload unless scores/findings are supplied. `npm.cmd run quality-gate:lighthouse -- --dry-run` finds enforced `website_audit.lighthouse_handoff` / `priority_helper` pilot records for `lfm25-1p2b-thinking-local`, generates deterministic draft reviews, and writes review packet artifacts under `benchmark-lab/evidence/reviews/`. `--approve-safe` writes review records only for low-risk proposed passes.
- **Lighthouse Handoff Assembly Pilot** - The Lighthouse track now includes an adjacent model step, `developer_task_writer`, after validated priority fixes. It consumes priority helper output and emits coding-agent-ready developer tasks, acceptance criteria, guardrails, and testing checklist items. Four real URLs were validated with five fresh enforced runs each; URL-scoped gates approved 20/20 safe passes with 0 fails, 0 critical risks, and 0 corrections. This validates assembly quality separately from the enforced `priority_helper` routing path.
- **Durable Job Store API** — `POST /jobs` creates persistent background jobs (track or workflow), `GET /jobs` lists jobs with optional status filter, `GET /jobs/:id` returns full job record. `GET /health` now includes `jobTotals` with counts by status (queued, claimed, running, completed, failed, cancelled, paused_review). Jobs persist to `data/jobs/*.json` and survive server restart. 64 tests in `scripts/test-jobs-api.js` covering all endpoints, filtering, health integration, and persistence.
- **Smoke and contract tests** - `scripts/smoke-test.js`, `scripts/contract-test.js` (current verification suite passes; see latest progress log or CI evidence for counts)
- **Multi-track qualification** - 4 new Benchmark Lab suites for accessibility_deep, performance_budget, seo_audit, and dealsniper
- **llama3.2 qualified for 4 roles** - a11y_analyzer (score 1.0), budget_analyzer (score 1.0), seo_analyzer (score 1.0), default_worker/dealsniper (score 1.0)
- **Two qualified models** - lfm25-1p2b-thinking-local (Lighthouse) + llama3.2-local (website audits + dealsniper)
- **6 total qualified capabilities** across 5 tracks
- **Qualification dashboard** - `GET /qualifications/dashboard` with per-model, per-track, per-role breakdown
- **All 4 new tracks in shadow enforcement** - collecting routing evidence for future enforcement

## What Is Partial

- **Track runner** - linear pipeline (default) with optional DAG mode (useDag: true); eight tracks in catalog (4 active, 4 in shadow)
- **DAG executor** - `companion/core/dag-executor.js` + `companion/core/dag-graph.js` — topological sort, cycle detection, parallel step execution, fan-in/fan-out support
- **Track planner** - `companion/tools/track-planner.js` — model-backed tool for free-form request to structured plan decomposition; `POST /tracks/plan` endpoint
- **DAG validation** - dependency inference from `$artifacts.*` references in `input_map`, cycle detection, missing step detection, level grouping for parallelism
- **Model qualification coverage** - Qualification consumption engine and capability registry built; broader model, track, hardware, deeper live qualification evidence, and prompt/regression coverage remain incremental
- **Model scorecards / skill sheets** - six-state qualification consumption engine + capability registry are the runtime surface
- **Runtime Track Run Record emission** - The Crew orchestrator and workflow plan executor emit canonical Track Run Records for all supported runtime flows (direct track, workflow, Lighthouse Handoff, DealSniper). Records are persisted to `data/evidence/track-run-records/`. Responses from `/tracks/run` and `/worksflows/run` include evidence references. Failed executions also produce records. Qualification Evidence Linker connects records to qualification data.
- **Memory Bridge** - v0 endpoints + v1 search/apply (apply opt-in); no embeddings yet
- **Console validation** - local validation UI exists; not a finished product surface
- **Fallback ladder** - partial (`retry_same_model_once`); no full escalation handler
- **Step input mapping** - declarative `input_map` on all track steps; legacy step-id fallbacks removed from `step-input.js`
- **Relay trust boundary** — no authentication, pairing, or signed requests between orchestrator and relay nodes; current design is trusted-development-network only
- **Planned vs. actual placement** — placement plan shows intended execution, but silent fallback to local execution does not update the placement record
- **`local_first` capability source** — treats unknown capabilities as locally capable unless caller provides explicit `localCapableRoles`

## What Is Not Built Yet

- **Automatic track classification** - no classifier selects workflow + track *(M3 follow-on)*
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
| **Now** | M6: Trusted Relay Execution and Actual-Placement Evidence — node pairing/authentication, capability verification, allowed-network restrictions, minimal-context envelopes, planned-vs-actual placement records, remote output schema validation, explicit relay fallback reasons, one real two-device pilot |
| **Next** | Broader model qualification coverage; live Ollama qualification runs; operator-log tracks qualification; Model Garage evaluation harness (Phase 2 — spec only until evidence) |
| **Later** | Lighthouse canonical-path documentation; workflow audit summary hardening; Desktop Companion UI (deferred); automatic track classification |
| **Archive** | Old companion-only architecture, pre-track planning docs |

LFM2.5-1.2B-Thinking is now the first enforced qualified model capability for a companion server runtime track (`website_audit.lighthouse_handoff`, role `priority_helper`). Runtime execution uses `runtimeModelName` from the qualification record; policy and evidence keep the stable capability id `lfm25-1p2b-thinking-local`. Enforcement is still per-track only; no global enforcement is enabled.

Human review records now provide the next evidence layer. A run can be transport-successful and enforcement-successful while still receiving `needs_edit` or `fail` from human quality review.
