# Progress Log

Dated record of meaningful build and planning sessions.

---

## 2026-06-30 - Lane D: Remove Legacy Step-Input Fallbacks

### Changed

- Removed `buildLegacyToolStepInput()` and `buildLegacyModelStepInput()` from `companion/pit-crew/step-input.js`; track steps without `input_map` now fail with `STEP_INPUT_MAP_MISSING`.
- Removed deprecated `buildLegacyStepInput` re-export from `companion/pit-crew/tool-router.js`.
- Removed `prioritize_fixes` broad-context prompt fallback from `companion/pit-crew/prompts.js`.
- Updated `scripts/track-input-map-unit-test.js` to assert declarative mappings across all four catalog tracks without legacy comparisons.
- Updated step-input and progress docs to reflect removal.

### Evidence

- `node scripts/track-input-map-unit-test.js` — PASS
- `node scripts/lighthouse-handoff-parity-test.js` — PASS
- `node scripts/contract-test.js` — PASS
- `node scripts/orchestration-unit-test.js` — PASS

### Next

- Live Benchmark Lab Ollama suite, extension bridge, or private vault validation (see next-human-steps.md).

---

## 2026-06-30 - Lighthouse Handoff HTTP Parity Extension

### Changed

- Extended `scripts/lighthouse-handoff-parity-test.js` to spawn Local Brain on a test port and assert behavioral parity for `POST /tracks/run` and `POST /workflows/run` using `slim-mobile.fixture.json` and the mock provider.
- Added orchestrated-path alignment checks so workflow orchestration, track HTTP, and workflow HTTP produce the same priority-fix titles and checklist for the fixed fixture.
- Added [next-human-steps.md](./next-human-steps.md) listing live Ollama, extension bridge, private vault, and legacy fallback removal as human-owned next lanes.

### Evidence

- `node scripts/lighthouse-handoff-parity-test.js` — PASS
- `node scripts/contract-test.js` — PASS
- `node scripts/orchestration-unit-test.js` — PASS

### Next

- Human review for legacy `step-input.js` fallback removal (parity now covers four Lighthouse paths).
- Live Benchmark Lab Ollama suite or Chrome extension bridge (see next-human-steps.md).

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

First platform refactor after docs restructure: tracks declare how data moves between steps; Pit Crew routing stays generic.

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

Current implementation is already pipeline-stage orchestration (`POST /tracks/run`, pit-crew runner). The project needs explicit track docs before adding more workflows or agents invent conflicting architecture.

### Evidence

- `POST /tracks/run` exists in `companion/server.js`
- `companion/pit-crew/tracks/lighthouse-handoff.track.json` exists
- `companion/pit-crew/orchestrator.js` runs linear steps
- Hardcoded step mapping in `companion/pit-crew/tool-router.js`

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

## Template for Future Entries
```md
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
