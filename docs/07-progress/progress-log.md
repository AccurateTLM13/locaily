# Progress Log

Dated record of meaningful build and planning sessions.

> **Terminology note:** Earlier entries use "NearbyNode" for what is now called "Relay Nodes." Entries are preserved as written to reflect the terminology in use at that time.

---

## 2026-07-05 — Pit Crew → The Crew Code Path Migration

### Changed

- Renamed `companion/pit-crew/` → `companion/crew/` via `git mv` — updated all require paths in 10+ code files including server.js, orchestrator.js, run-plan-builder.js, run-plan-executor.js, track-registry.js, lighthouse-handoff.js, and 6 script files.
- Renamed `docs/01-architecture/pit-crew-gap-analysis.md` → `crew-gap-analysis.md`.
- Updated 3 track JSON file schema references and 1 internal schema file.
- Updated 25+ documentation files across all active doc directories (00-start-here through 08-agents) — path and terminology alignment.
- Added decision log entry (`docs/06-decisions/decision-log.md`).
- Updated `latest-build-result.json`, `current-state.md`, `next-agent-brief.md`.

### Evidence

- `git status` confirms zero untracked files in old `companion/pit-crew/` path — all files migrated cleanly.
- Contract tests, audit schema tests, tool registry tests, and orchestration unit tests all pass.
- Zero `companion/pit-crew/` references remain in active code or documentation (historical notes preserved in crew.md, crew-gap-analysis.md, glossary.md).

### Next

- Connect canonical Track Run Records to companion track runner (`companion/crew/orchestrator.js`) emissions.
- Connect records to Local Brain routing and qualification consumption feedback loop.
- Human correction record integration.

---

## 2026-07-05 — Canonical Track Run Records

### Changed

- Created `companion/evidence/schemas/track-run-record.schema.json` — canonical schema (`locaily.track_run_record.v1`) covering all 6 executor types with identity, request, routing, execution, output, validation, performance, error, and child-run areas.
- Created `companion/evidence/schemas/fixtures/track-run-record.valid.json`, `track-run-record.transform.valid.json`, `track-run-record.hybrid.valid.json`, `track-run-record.invalid.json` — example records for schema validation.
- Created `companion/evidence/track-run-record-builder.js` — record builder with convenience functions per executor type.
- Created `scripts/track-run-record-schema-test.js` — schema validation tests (4 checks: model valid, model invalid, transform valid, hybrid valid).
- Integrated record generation into `benchmark-lab/engine/runners/suite-runner.js` — emits canonical Track Run Record after each mock/Ollama suite execution.
- Integrated record generation into `benchmark-lab/engine/runners/hybrid-deterministic-runner.js` — emits parent record with child records for each scenario trial's model, tool, and transform stages.
- Created `docs/02-track-system/canonical-track-run-records.md` — architecture documentation.
- Added decision log entry for canonical Track Run Records (`docs/06-decisions/decision-log.md`).
- Updated `docs/00-start-here/current-state.md`, `docs/07-progress/next-agent-brief.md`, `docs/07-progress/active-build-slice.md`, `docs/07-progress/latest-build-result.json`.

### Evidence

- 4/4 track-run-record schema tests pass.
- 14/14 benchmark-lab schema tests pass (unchanged).
- 31/31 transform tests pass (unchanged).
- 29/29 hybrid integration tests pass (unchanged).
- 26/26 hybrid CLI integration tests pass (unchanged).
- All 6 executor-type builder tests pass.
- Contract tests, audit schema tests, tool registry tests, and orchestration unit tests all pass.

### Next

- Connect canonical Track Run Records to companion track runner (`companion/crew/orchestrator.js`) emissions.
- Connect records to Local Brain routing and qualification consumption feedback loop.
- Human correction record integration.

---

## 2026-06-27 - North Star Direction Added

### Changed

- Added `docs/00-start-here/north-star-local-capability-network.md` from the June 2026 project direction document.
- Updated start-here, current vision, architecture overview, glossary, roadmap, build status, active slice, next-agent brief, current state, latest build result, and decision log to reflect the local capability network direction.
- Framed Canonical Track Run Records as the first implementation step toward the compounding evidence loop.

### Evidence

- Docs-only change; runtime validation not required.

### Next

- Implement the canonical track-run record schema and emission path.

---

## 2026-06-26 - Milestone 5 Accepted: Benchmark Lab

### Changed

- Rebasing complete: `codex/feat-benchmark-lab` now sits on current `origin/main` / JSON-first runtime integration.
- Milestone 5 scope changed from Lighthouse fallback removal to Benchmark Lab acceptance.
- Updated `current-sprint.md`, `milestone-5-checkpoint.md`, `next-agent-brief.md`, and `build-status.md`.
- Qualification records now validate against `benchmark-lab/schemas/qualification-record.schema.json` before `model-qualification-loader` exposes them to runtime routing.
- Audit schema and redaction paths now accept richer workflow worker summaries and nullable redacted memory metadata.
- Disabled/error memory audit responses fall back to a valid compact `memory_response` summary instead of an empty object.

### Evidence

- `node scripts/contract-test.js` - PASS
- `node scripts/benchmark-lab-schema-test.js` - PASS
- `node scripts/benchmark-lab-run-test.js` - PASS
- `node scripts/audit-record-schema-test.js` - PASS
- `node scripts/tool-registry-schema-test.js` - PASS
- `node scripts/validation-result-contract-test.js` - PASS
- `node scripts/orchestration-unit-test.js` - PASS
- `node scripts/editorial-pack-unit-test.js` - PASS
- `node scripts/lighthouse-handoff-parity-test.js` - PASS
- `node scripts/benchmark-status-smoke-test.js` - PASS
- Clean-server `node scripts/smoke-test.js` - **56/56 PASS**

### Next

- Merge/publish the rebased Benchmark Lab branch.
- Close patch-equivalent stale branches that are already represented on `main`.
- Keep automatic model swapping and legacy `step-input.js` fallback removal out of M5 unless a follow-on milestone explicitly opens them.

---

## 2026-06-17 — Milestone 5: Lighthouse Handoff Parity Characterization

**First M5 hardening change:** behavioral parity test between validation-console core sequence and workflow-orchestrated execution.

### Changed

- Added `scripts/lighthouse-handoff-parity-test.js` — fixed `slim-mobile.fixture.json` input; legacy path runs `analyze-report` → `compose-handoff` → `lighthouse.verify_handoff` (same interfaces as `validation-runner.js`); workflow path runs `buildRunPlan` + `executeRunPlan` with mock provider; asserts schema, URL/score preservation, priority fixes, markdown sections, and verification validity

### Evidence

- `node scripts/lighthouse-handoff-parity-test.js` — PASS
- `node scripts/orchestration-unit-test.js` — PASS
- `node scripts/contract-test.js` — PASS
- `node scripts/smoke-test.js` — **55/55** PASS

### Intentional differences documented

- Execution topology (3 tool tasks vs 7 track steps)
- Legacy `buildDemoResult` analyze stub vs workflow classify/prioritize/validate pipeline
- Prose and priority-fix/checklist provenance differ by design; both paths remain schema-valid

### Next

- Extend parity test to `POST /tracks/run`; then remove `step-input.js` legacy fallbacks when all three paths agree

---

## 2026-06-16 — Milestone 4 Merged + M5 Planning Checkpoint

**Milestone 4: Track-based orchestration — merged and closed.**

### Final status

- Merged PR #9 into `main` — merge commit `c89db65`
- Post-merge smoke on `main`: **55/55 PASS**
- Local Brain track-based orchestration is implemented; no model swapping, NearbyNode routing, or LLM-generated planning

### Architectural outcome

Workflow registries, track metadata, run plan builder/executor/validator, and workflow audit logging. Lighthouse Handoff can be planned and executed as a structured workflow via `POST /workflows/plan` and `POST /workflows/run`.

### Documentation

- Completion note: [milestone-4-completion.md](./milestone-4-completion.md)
- M5 planning checkpoint: [milestone-5-checkpoint.md](./milestone-5-checkpoint.md)

### Next (planning only — not started)

- Milestone 5: legacy fallback removal / workflow hardening
- Review PR #10 `ai-models/` on `main` before M5 code
- M5 audit-summary follow-up; keep Model Swap Manager spec separate

---

## 2026-06-15 — Milestone 4 Complete: Track-Based Orchestration

**Milestone 4: Track-based orchestration — complete.**

### Changed

- Added `companion/orchestration/` (track registry, workflow registry, run plan builder/executor/validator/logger)
- New endpoints: `GET /orchestration/tracks`, `GET /orchestration/workflows`, `POST /workflows/plan`, `POST /workflows/run`
- Lighthouse Handoff first workflow target with step-by-step run plan execution and audit logging
- Unit test `scripts/orchestration-unit-test.js`; smoke suite expanded to **55/55**

### Why

Local Brain can now accept a workflow request, materialize a structured run plan from the track registry, execute it step by step, validate shapes, and log selected tracks/workers — without model swapping or NearbyNode routing.

### Evidence

- `node scripts/orchestration-unit-test.js` — PASS
- `node scripts/contract-test.js` — PASS
- Clean-server smoke: **55/55**

### Next

- Milestone 5: remove legacy step-input fallbacks in `step-input.js`

---

**Milestone 3: Model-step input mapping — complete.**

### Changed

- Merged PR #8 (`c186e70`): shared `step-input.js`, model-step `input_map`, Lighthouse `prioritize_fixes` migration, unit + smoke coverage.

### Why

Tool and model steps both resolve declared `input_map` — track JSON becomes the workflow data-flow contract.

### Evidence

- Squash merge on `main`: `feat: add model step input maps`
- Clean-server validation: **51/51 smoke**, unit + contract tests pass
- PR #8: 1 commit, 12 files

### Next

- Milestone 4: remove legacy step-input fallbacks in `step-input.js`

---

## 2026-06-15 — Milestone 2 Complete: Second Workflow Track

**Milestone 2: Second workflow track — complete.**

### Changed

- Merged PR #7 (`ae0d03d`): `marketplace.dealsniper` track, DealSniper tool tasks, generic orchestrator result assembly, smoke + unit coverage.
- Two workflow tracks now run through declarative `input_map` with no new `buildLegacyStepInput()` branches.

### Why

Prove the track system is reusable beyond Lighthouse Handoff — second workflow on the same linear runner without router forks.

### Evidence

- Squash merge on `main`: `feat: add DealSniper workflow track`
- Clean-server validation: **51/51 smoke**, unit + contract tests pass
- PR #7: 1 commit, 13 files
- Lighthouse `write_handoff` path unchanged; DealSniper uses `result_step` / `verification_step`

### Next

- Remove `buildLegacyStepInput()` (both tracks declare `input_map`)
- Milestone 3 candidate: declarative input mapping for model steps

---

## 2026-06-14 — Draft Future Track Catalog (Docs Only)

### Changed

- Added `docs/02-track-system/future-tracks.md`, `future-track-catalog.md`, and `track-catalog-expansion-plan.md`.
- Added draft fixtures under `docs/04-validation/fixtures/tracks/` for Evidence, Diff, Confidence, Escalation, Context Selection, and Model Profiling tracks.
- Updated track system README read order with future catalog links.

### Why

Parallel spec work while Milestone 2 runtime plumbing proceeds — gives implementers contracts and example fixtures without touching the linear runner.

### Evidence

- Docs-only branch `docs/track-catalog-expansion`; no changes to `companion/server.js`, orchestrators, or routers.
- All catalog tracks marked draft / not implemented; Capability Discovery marked future / NearbyNode-adjacent.

### Next

- Implement Phase A governance tools when FallbackHandler milestone starts.

---

## 2026-06-15 — Milestone 1B Complete: Declarative Track Input Mapping

**Milestone 1B: Declarative track input mapping — complete.**

### Changed

- Merged PR #5 (`a07d9f6`): generic `input_map` resolver, Lighthouse track migration, unit + smoke coverage.
- Tool steps read input contracts from track JSON instead of hardcoded Lighthouse step IDs in `tool-router.js`.

### Why

First platform refactor after docs restructure: tracks declare how data moves between steps; Crew routing stays generic.

### Evidence

- Squash merge on `main`: `feat: add declarative track input maps`
- Clean-server validation: 50/50 smoke, unit + contract tests pass
- PR #5: 1 commit, 7 files

### Next

- ~~Milestone 2: second workflow track~~ — done (2026-06-15, PR #7)
- Remove `buildLegacyStepInput()` when ready

---

## 2026-06-14 — Track System Direction Clarified (Milestone 1A)
### Changed

- Reframed Local Brain as dispatching **tracks**, not models.
- Identified Lighthouse Handoff as first official proof workflow track.
- Added `docs/02-track-system/` (registry, core tracks, workflow registry, step input mapping gap, graph planning).
- Added `docs/07-progress/` (build status, sprint, agent brief, milestone map).
- Added `docs/00-start-here/current-state.md` as blunt status anchor.
- Reorganized docs: `03-workflows`, `04-validation`, `05-product`, `08-agents`, research → archive.

### Why

Current implementation is already pipeline-stage orchestration (`POST /tracks/run`, Crew runner). The project needs explicit track docs before adding more workflows or agents invent conflicting architecture.

### Evidence

- `POST /tracks/run` exists in `companion/server.js`
- `companion/crew/tracks/lighthouse-handoff.track.json` exists
- `companion/crew/orchestrator.js` runs linear steps
- Hardcoded step mapping in `companion/crew/tool-router.js`

### Next

- ~~Implement declarative `input_map`~~ — done in Milestone 1B (2026-06-15)

---

## 2026-06-13 — L2 Live Ollama + Memory Bridge
See [../06-decisions/decision-log.md](../06-decisions/decision-log.md) and [../04-validation/l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md).

---

## 2026-06-18 — Operator Log editorial tracks

### Changed

- Added source-audited Second Brain editorial discovery and human-selected Operator Log drafting tracks.
- Added manifest-backed editorial tools, schemas, validators, workflow registry entries, and explicit track/workflow model overrides.
- Ran VibeThinker-3B Q4 against 37 allowlisted files; discovery completed after hardening, but editorial ranking and the 80-word draft did not meet quality gates.
- Added the six-file narrow extraction fixture, exact excerpt verification, grounding checks, duplicate metrics, and per-call timing.
- Ran 18 narrow VibeThinker calls in 34.0 seconds: JSON/path gates passed, exact excerpts reached only 25%, and the automated extractor gate failed.

### Evidence

- `docs/04-validation/operator-log-vibethinker.md`
- `ai-models/benchmark-results/operator-log/vibethinker-3b-narrow-extraction-v0.1.json`
- Local artifact: `data/validation/operator-log-evaluation_*.local.json` (not committed)

### Next

- Compare another installed model against the identical frozen fixture.
- Implement deterministic signal normalization, candidate packet building, scoring, and abstention before another broad workflow run.
- Add an editorial history ledger before repeated scheduled discovery.

---

## 2026-07-04 — Benchmark Lab Milestone 1 Complete

### Changed

- Benchmark Lab Milestone 1 is complete and operator-ready.
- All CLI commands, mock + Ollama adapters, 13 schemas, evidence promotion workflow, checksum verification (canonical_text_v1/byte_exact), qualification-record generation, model-card/report generation, execution-router with three modes, and read-only `/benchmark/status` endpoint implemented.
- Tool Eval Bench compatibility slice with 8 scenarios, PARTIAL verdict support, and multi-turn runner.
- Qualification/evidence trust boundary established: promotion is explicit, checksums verify, Local Brain consumes compact records without importing engine internals.
- Published evidence, model cards, and reports committed for intent-classification track.

### Evidence

- `node scripts/benchmark-lab-schema-test.js` — PASS (13 schemas)
- `node scripts/benchmark-lab-run-test.js` — PASS (mock loop deterministic)
- `node scripts/benchmark-status-smoke-test.js` — PASS
- `node scripts/contract-test.js` — PASS
- Current verification suite passes; see the latest recorded validation evidence for command-specific totals.

### Next

- Canonical Track Run Records as the first Track Learning Evidence Loop slice.
- Broader model, track, hardware, and live qualification coverage remain follow-on work (not yet scoped).

---

## 2026-07-04 — Documentation Sync: Benchmark Lab M1 Completion

### Changed

- Updated all Benchmark Lab documentation files (README, OPERATOR_GUIDE, VALIDATION_CHECKLIST, locaily READMEs, model manifests README) to reflect M1 completion and operator-ready status.
- Updated `docs/02-systems/benchmark-lab.md` with current command surface, 14 schemas, capability probing, execution modes, artifact lifecycle table, qualification policies, evidence interpretation rules, and follow-on areas.
- Added package metadata (name, version, description, private, engines, license) and added `start`, `test:contract`, `test:smoke`, `test:benchmark`, and `validate` scripts.
- Added `benchmark-lab/evidence/probes/` to `.gitignore`.
- Updated progress documentation: current-state, build-status, current-sprint, next-agent-brief, milestone-map.

### Evidence

- `npm run benchmark:test` — PASS (schema + mock loop)
- `npm run benchmark:status-smoke` — PASS
- `node scripts/contract-test.js` — PASS
- `node scripts/benchmark-lab-mode-comparison-test.js` — PASS (60 tests)

### Next

- Canonical Track Run Records as the first Track Learning Evidence Loop slice.

---
---

## 2026-07-05 — The Crew Runtime Track Run Record Emission

### Changed

- Created `companion/evidence/track-run-record-store.js` — append-only file-based store for Track Run Records at `data/evidence/track-run-records/`, with schema validation, collision-safe writes, and lookup by recordId, workflowId, or parentRunId.
- Created `companion/crew/runtime-track-run-recorder.js` — shared recorder service producing canonical Track Run Records from live execution context, including `recordDirectTrackRun`, `recordWorkflowRun`, and `recordFailedExecution` functions.
- Modified `companion/crew/orchestrator.js` — `runTrack()` now accepts `recordOpts` and emits a parent Track Run Record with per-step child records when recording is enabled.
- Modified `companion/orchestration/run-plan-executor.js` — `executeRunPlan()` now accepts `recordOpts` and emits a parent workflow Track Run Record with per-step child records.
- Modified `companion/server.js` — `/tracks/run` and `/workflows/run` endpoints now pass record options to the runtime, emit Track Run Records on success and failure, and return evidence references (`trackRunRecordId`, `childRecordIds`, `trackRunRecordRef`) in response envelopes. Existing response fields and status codes remain unchanged.
- Created `scripts/crew-track-run-record-test.js` — 18 tests covering store operations, direct track emission, workflow emission, parent-child linkage, Lighthouse Handoff emission, DealSniper emission, failed execution records, summary safety, record ID uniqueness, and terminology compliance.
- Updated store to strip null optional fields before persistence to match schema constraints.

### Evidence

- 18/18 crew-track-run-record tests pass.
- Contract tests, audit schema tests, tool registry tests, orchestration unit tests, and lighthouse parity tests all pass.
- Benchmark Lab schema and run tests (14 schemas + mock loop) all pass.
- Benchmark Lab status smoke test passes.
- Zero companion imports from `benchmark-lab/engine/` — architectural boundary preserved.
- Zero Pit Crew terminology in new files.

### Next

- Runtime Evidence and Audit Feedback Linkage — connect Track Run Records to qualification consumption and routing feedback.

---

## YYYY-MM-DD — Short title

### Changed
- ...

### Why
- ...

### Evidence
- ...

### Next
- ...
```
