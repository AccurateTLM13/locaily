# Progress Log

Dated record of meaningful build and planning sessions.

> **Terminology note:** Earlier entries use "NearbyNode" for what is now called "Relay Nodes." Entries are preserved as written to reflect the terminology in use at that time.

---

## 2026-07-18 — Development Memory Loop DM1–DM10 Complete

### Changed

- Implemented the full Development Memory Loop as a Memory Bridge extension: immutable events (DM2), capture adapters (DM3), session aggregation (DM4), candidate extraction (DM5), review inbox (DM6), project maintainer (DM7), retrieval integration (DM8), continuous capture processor (DM9), and multi-project template (DM10)
- Added schemas, fixtures, CLIs, API routes, and offline test suites under `companion/memory/`, `companion/schemas/development-memory-*`, and `scripts/test-development-memory-*.js`
- Multi-project registry with legacy `locaily` flat paths and namespaced `data/memory/projects/{slug}/` isolation
- Updated handoff docs, backup guide, decision log, and active build slice

### Evidence

- `npm run test:development-memory` — all DM test suites green (schemas, events, capture, sessions, candidates, review, maintainer, retrieval, processor, multi-project)
- `npm run test:memory-v1` — 6/6 unchanged

### Next

Development Memory Loop roadmap complete. Follow-on candidates (E2E proof scenario, candidate review console UI, embeddings) require explicit objectives.

## 2026-07-11 — M5 Architectural Review: Trust Boundary, Placement Evidence, and M6 Scope

### Changed

- **Architectural review accepted:** GitHub review of Locaily work completed July 11, 2026 identified four issues needing attention before relay system can be used outside trusted development networks
- **M6 defined:** Trusted Relay Execution and Actual-Placement Evidence — 10 specific objectives to harden the relay system
- **Documentation updated:** current-state.md, next-agent-brief.md, active-build-slice.md, decision-log.md, latest-build-result.json all updated with review findings and M6 scope

### Review Findings

**High: Relay communication has no visible trust boundary**
- No authentication token, signature, node certificate, request nonce, or pairing credential
- Registration and heartbeat calls are unauthenticated
- A rogue or accidentally registered LAN node could receive workflow context, user-derived content, and return manipulated results
- Current state: Trusted-development-network only

**Medium: Planned relay placement can silently become local execution**
- When an assigned node is missing or unhealthy, `executeStepWithAssignedNode()` falls back to local execution without recording a fallback audit
- Run reports placement plan assigning step to relay node, but actual execution occurred locally with no recorded reason
- Consequence: Planned and executed topology can diverge silently, weakening the evidence system

**Medium: `local_first` defaults to effectively local-only**
- Every role is treated as locally capable when `localCapableRoles` is omitted
- `local_first` immediately assigns locally when the role is considered locally capable
- Consequence: Without explicit local-capability data, relay nodes are never used for model steps

**Medium: "Approved evidence" was written with an agent as approver**
- Several new evidence records use `"approvedBy": "locaily-agent"`
- Blurs distinction between generated, promoted, machine-reviewed, human-reviewed, and approved for qualification
- Fix: Use `promotionActor` instead of `approvedBy`; reserve `approvedBy` for actual human approval

### M6 Objectives

1. Node pairing and authentication — pre-shared credentials or bearer tokens
2. Capability verification — validate node capability advertisements
3. Allowed-network and URL restrictions — restrict relay traffic to private LAN ranges
4. Minimal-context envelopes — send only minimum required context to relay nodes
5. Planned-versus-actual placement records — separate planned from actual execution
6. Remote output schema validation — validate relay responses against expected schemas
7. Explicit relay fallback reasons — record why fallback occurred
8. One real two-device pilot — prove system works on actual hardware
9. Performance comparison — local-only vs. relay-only vs. distributed
10. Human-readable operator view — show where each step actually ran

### Evidence

- Documentation updates: current-state.md, next-agent-brief.md, active-build-slice.md, decision-log.md, latest-build-result.json
- All existing M5 tests remain passing (unit 17/17, placement 14/14, multi-device e2e 22/22)

### Scope notes

- M6 converts "it can distribute work" into "we can trust and evaluate distributed work"
- Relay nodes remain explicitly marked as "trusted-development-network only" until M6 completes
- No implementation changes in this entry — documentation and planning only

---

## 2026-07-11 — M5 Completed: Multi-Device Workflow Coordination

### Changed

- **Placement planner:** Added `companion/relay/placement.js` with `createPlacementPlanner` (`plan` + `summarize`) and `buildPlacementFromTrack`. Policies: `distribute` (spread model steps across capable healthy nodes, least-loaded), `local_first`, `local_only`. M4 policies (`prefer_relay`, `route_if_unavailable`) remain per-step dynamic decisions.
- **Assigned-node routing:** `companion/relay/router.js` gained `executeStepWithAssignedNode` (route to a specific node, fallback locally + `RELAY_FALLBACK` audit on failure/unhealth). `executeStepViaRelayIfNeeded` now consults `options.relay.assignments[stepId]`. Both `companion/crew/orchestrator.js` (DAG + linear) and `companion/orchestration/run-plan-executor.js` pass `stepId`.
- **Server wiring:** `POST /relay/plan` placement preview; `applyRelayPlacement()` attaches assignments + `placementSummary` when `relay_policy=distribute` for `/tracks/run` and `/workflows/run`; responses include `relay_placement`. `GET /relay/protocol` lists `/relay/plan`.
- **Tests:** `scripts/test-relay-placement.cjs` (13/13) and `scripts/test-multi-device-e2e.cjs` (22/22 — three Local Brain instances A orchestrator + B `priority_helper` + C developer/guardrail/testing writers; distributed run, then kill C → local fallback). `package.json`: `test:relay:placement`, `test:multi-device:e2e`, `test:m5`.

### Evidence

- `node scripts/test-relay-placement.cjs` → 13/13 (distribution, local_first, local_only, unmatched-role fallback, unhealthy-node exclusion)
- `node scripts/test-multi-device-e2e.cjs` → 22/22 (Lighthouse Handoff distributed across B and C; `relay_placement` 4 relayed / 6 local; kill C → local fallback + `RELAY_FALLBACK` audit)
- Regression: smoke 57/57, `test:relay` 11/11, `test:memory-v1` 6/6, `test:relay:e2e` 11/11, `test:dag` (14+9+workflow), `benchmark:test`, `benchmark:status-smoke`, `contract-test`, `orchestration-unit-test` all PASS.

### Scope notes

- Single orchestrator, ephemeral relay nodes; no distributed consensus.
- Placement is capability + health + least-loaded (no latency awareness).
- Tool steps always local (relay nodes are model-capability targets).
- Failed node marked unhealthy for 60s (registry stale window); fallback is per-step local.

---

## 2026-07-11 — M4 Completed: Relay Nodes & Distributed Capability Network

### Changed

- **Relay Node protocol:** Added `companion/relay/` with `protocol.js` (v1.0 constants + message shapes), `registry.js` (in-memory node registry: capabilities, health, stats, select-for-role), `connector.js` (HTTP client for step dispatch / register / heartbeat), and `router.js` (routing decision + local fallback + `RELAY_FALLBACK` audit).
- **Server endpoints:** `GET /relay/protocol`, `GET /relay/nodes`, `POST /relay/register`, `POST /relay/heartbeat`, `POST /relay/unregister`, `POST /relay/step` (relay node work receiver). `GET /health` now reports `relay` node counts.
- **Cross-node routing:** Wired `executeStepViaRelayIfNeeded` into `companion/crew/orchestrator.js` (DAG + linear paths) and `companion/orchestration/run-plan-executor.js`. Policy selected per request via `options.relay_policy` (`route_if_unavailable` default, `prefer_relay`, `local_only`); server injects the live registry/connector/router into execution options. `worker_used` now reports `node_id` + `routed_via`.
- **Memory Bridge v1:** `companion/memory/vault-adapter.js` gained `search()` (allowlisted ranked keyword search with snippets) and `applyWriteback()` (opt-in, vault-path-gated). Server added `POST /memory/search` and `POST /memory/writeback/apply` (gated by `memory.writeback.apply` permission + `allowApply` config). Config `allowApply` added to vault adapter + default permissions.
- **CI:** Added `.github/workflows/ci.yml` running offline suites (`contract-test`, `test:dag`, `benchmark:test`, `benchmark:status-smoke`, `test:relay`, `test:memory-v1`), a server smoke test (mock provider), and `test:relay:e2e`.

### Evidence

- `node scripts/test-relay-unit.cjs` → 11/11 (registry + router; relay + fallback offline)
- `node scripts/test-memory-v1.cjs` → 6/6 (search + apply; allowlist/disable gates)
- `node scripts/test-relay-e2e.cjs` → 11/11 (two Local Brain servers: discovery, routing to node B, local fallback after B killed, `RELAY_FALLBACK` audit)
- Regression: smoke 57/57, `contract-test`, `test:dag` (14+9+workflow), `benchmark:test`, `orchestration-unit-test` all PASS.

### Stop conditions honored

- Local Brain remains localhost-only by default; no public exposure.
- Relay nodes are execution targets only (no control-plane operations).
- Memory Bridge v1 apply is opt-in and vault-path-gated.
- No distributed consensus / Byzantine fault tolerance claimed.

---

## 2026-07-11 — M2 & M3 Completed-Work Review: Fixes

### Changed

- **M3-1 (blocker):** Integrated DAG execution into `companion/orchestration/run-plan-executor.js`. `executeRunPlan` now computes the dependency graph from the loaded track (`computeDependencyGraph`) and executes run-plan steps in level order with per-level parallelism (`Promise.all`), preserving step validation, `planStep.status`, `worker_used`, `duration_ms`, and evidence emission. Sequential behavior is retained when `options.useDag === false` or no dependency edges exist (backward compatible). Added `scripts/test-run-plan-dag.cjs`; wired into `npm run test:dag`.
- **M3-3 (bug):** `companion/crew/orchestrator.js` DAG `stepExecutor` no longer forces `ok: true`. It now returns `ok: false` with the step error on failure, so downstream `$artifacts.*` references are not silently corrupted.
- **M3-4 (stop-condition):** The `track-planner` tool (`companion/tools/track-planner.js`) now resolves its `reasoning_worker` role through the qualification system (`getModelQualificationEvidence` / `resolveModelForRole` passed from the server's `buildModelRoutingOptions`) and refuses with `PLANNER_ROLE_NOT_QUALIFIED` when the role lacks qualified/conditional evidence under a `require_qualified*` policy — no blind LLM calls. Created a `reasoning_worker` qualification (Benchmark Lab suite `benchmark-lab/locaily/tracks/track-planning`, mock runtime, 4/4 pass) and generated the record via `qualification:generate` (model `llama3.2-local`). Server `/tracks/plan` now passes qualification-aware options.
- **M3-2 / M2-2 (docs):** Added `docs/02-track-system/dag-execution.md`; removed the stale "DAG runner / graph planner" line from `build-status.md` "Not Built" and moved DAG to "Recently Completed"; reconciled M2 acceptance wording (new tracks are shadow-enforced, not enforced) in `roadmap-milestones-2-3-4.md`.
- **M3-5 (latent bug):** Added a `qualifications` property to `benchmark-lab/schemas/model-manifest.schema.json` so M2 manifests (which carry `qualifications`) validate and `qualification:generate` works again.
- **TEST-1 (stale):** Updated `scripts/orchestration-unit-test.js` Lighthouse plan-step assertion from 7 → 10 to match the current track.

### Evidence

- `node scripts/test-dag-graph.cjs` → 14/14
- `node scripts/test-dag-executor.cjs` → 9/9
- `node scripts/test-run-plan-dag.cjs` → all pass (DAG levels + DAG/sequential execution)
- `node scripts/orchestration-unit-test.js` → passes
- `node scripts/benchmark-lab-schema-test.js` → all schemas ok (incl. `model-manifest.schema.json`)
- `node scripts/contract-test.js` → contract helpers pass
- `reasoning_worker` resolves as `qualified` for `llama3.2-local` via the qualification resolver.
- `benchmark:run` on `track-planning` suite → 4/4 pass (mock); `benchmark:promote` + `qualification:generate` produce approved evidence + qualification record.

### Next

M2 and M3 are now complete and internally consistent: DAG execution covers both track runs (`/tracks/run` `useDag`) and workflow orchestration (`/workflows/run`); the planner is qualification-gated. Remaining optional work: wire DAG tests into a CI workflow (no CI infra exists yet), and broaden `reasoning_worker` to live Ollama evidence once a model is available. See `docs/07-progress/m2-m3-review-issues.md`.

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

## 2026-07-05 — Guarded Qualification-Aware Routing Enforcement

### Changed

- Extended `companion/crew/model-router.js` — added `evaluateEnforcement()` function and integrated enforcement evaluation in `executeModelStep()` after shadow routing and before execution. Added fallback handling: enforced capability failure triggers re-execution with original model. Exported `evaluateEnforcement`.
- Extended `companion/evidence/schemas/track-run-record.schema.json` — added optional `routing.enforcementDecision` to parent and child record schemas. Additive, validated, backwards-compatible.
- Extended `companion/evidence/track-run-record-builder.js` — passes `enforcementDecision` through to `routing`; omitted when not provided.
- Extended `companion/crew/runtime-track-run-recorder.js` — `buildStepChildRecord()` passes enforcement decision through to child records.
- Extended `companion/evidence/shadow-evidence-review.js` — added `buildEnforcementMetrics()` reporting enforcement attempts, applied, blocked, fallback, per-capability success rates, qualification record usage, failed conditions. Added `getEnforcementDecisions()` for list retrieval. Exported new functions.
- Modified `companion/server.js` — added `enforcementPolicy` to `buildModelRoutingOptions()` wiring it to model router. Added `GET /enforcement/pilot` (pilot status), `GET /enforcement/decisions` (enforcement decisions list). Extended `GET /enforcement/status` with pilot reason. Extended `POST /enforcement/set` with safe state change enforcement (requires approval, qualified capability, non-suspended).
- Created `scripts/test-enforcement-routing.js` — 83 tests covering: 5 policy states, 10 eligibility failures, 7 routing evidence, 5 runtime failures, 3 enforcement metrics, 2 builder integration, 2 shadow compatibility, 1 non-pilot compatibility.
- Updated all documentation files.

### Why

Complete the enforcement pipeline by integrating the policy engine into the model router. The model router is the central authority for model selection — enforcement evaluation belongs here alongside shadow routing and qualification policy evaluation. Implementation is complete but no pilot track is activated because no companion track has a current, valid `qualified` model capability.

### Evidence

- 83/83 enforcement routing tests pass.
- 60/60 enforcement policy tests pass (backward compatible).
- 31/31 shadow routing tests pass (backward compatible).
- 25/25 qualification resolver tests pass (backward compatible).
- 18/18 crew track run record tests pass (backward compatible).
- 4/4 schema tests pass (backward compatible).
- Contract tests pass.
- Zero companion imports from `benchmark-lab/engine/` — architectural boundary preserved.
- All tracks remain in shadow mode — enforcement inactive.
- No pilot track activated — documented with activation requirements.
- Qualification records, evidence, and checksums remain unchanged.

### Next

Pilot Enforcement Validation and Multi-Model Track Expansion — activate enforcement for one qualified track once qualification evidence exists. Expand multi-model testing with runtime performance feedback. Add human correction records.

---

## 2026-07-05 — Durable Enforcement Policy

### Changed

- Created `companion/schemas/internal/enforcement-policy.schema.json` — canonical policy document schema (v1) with tracks, overrides, metadata, `additionalProperties: false`, strict JSON Schema validation.
- Created `companion/schemas/internal/enforcement-policy-audit-event.schema.json` — 10 event types (policy.created, state.changed, approved, revoked, override.added, override.cleared, override.cleared-all, policy.corrupt, policy.recovered, policy.imported) with before/after state and revision tracking.
- Created `companion/core/enforcement-policy-audit.js` — JSONL append-only audit module, validates events against schema, normalizes event shape, writes to `data/enforcement-policy-audit.jsonl`.
- Created `companion/core/enforcement-policy-store.js` — durable policy store with:
  - Synchronous eager initialization from disk (`readFileSync`)
  - Async mutation API with serialization through a queue (no concurrent writes)
  - Atomic write sequence: validate input → build candidate document → validate schema → write temp file → rename → update in-memory state → write audit event
  - Full state transition graph: disabled↔shadow→eligible↔enforced, eligible↔suspended, enforced→{eligible,shadow}, suspended→{shadow,eligible,disabled}
  - Compound approval mutation (eligible + approved in one op)
  - Compound revocation mutation (eligible→shadow or enforced→suspended atomically)
  - Override CRUD with composite key identity (trackId+role+modelId); duplicate rejection
  - Override clear by overrideId or composite key
  - Corrupt-file fallback with mutex lock; writes audit event synchronously before returning
    - Pure in-memory mode when dataDir is not provided (test isolation without filesystem)
  - Health status: healthy or degraded (safe fallback with loadError); enforcement locked when degraded
  - Async enforcement gate (`checkEnforcementGateAsync`) verifying runtime availability, model readiness, shadow evidence (min 3), approval, qualified capability, score threshold, and active override before committing `enforced`
- Modified `companion/core/enforcement-policy.js` — refactored to delegate to store instance; configurable score threshold added; backward-compatible `syncApi._seedTrackStateSync`, `syncApi._seedApprovalSync`, `syncApi._seedOverrideSync` for legacy constructor option seeding; legacy tests pass without changes.
- Modified `companion/server.js` — added `GET /enforcement/policy`, `POST /enforcement/revoke`, `POST /enforcement/override/clear` endpoints; updated `POST /enforcement/set`, `POST /enforcement/approve`, `POST /enforcement/override` with `reason` and `updatedBy` query parameters; enforcement policy health in root status response; explicit store initialization at startup with `dataDir`.
- Created `scripts/test-enforcement-policy-store.js` — 123 tests covering: loading and validation (20), persistence (20), state transitions (25), approval and revocation (16), overrides (18), audit (12), regression (12).
- Modified `scripts/test-enforcement-policy.js` — updated to 62 tests with async-aware assertions; backward compatible with legacy option-based constructor.

### Why

Enforcement policy was previously in-memory only — all track states, approvals, and overrides were lost on server restart. For enforcement to be a practical rollout mechanism, policy state must survive restarts, audit history must be append-only and immutable, and corrupt data must have a safe recovery path. The store design mirrors the existing append-only evidence store pattern.

### Evidence

- 123/123 enforcement policy store tests pass.
- 62/62 enforcement policy tests pass (backward compatible, async-aware).
- 91/91 enforcement routing tests pass (backward compatible).
- 31/31 shadow routing tests pass (backward compatible).
- 25/25 qualification resolver tests pass (backward compatible).
- 18/18 crew track run record tests pass (backward compatible).
- 4/4 schema tests pass (backward compatible).
- Contract tests pass.
- benchmark:test passes.
- 56/56 smoke tests pass (including new enforcement endpoints).
- Enforcement remains disabled for all tracks — no pilot activated.
- No absolute filesystem paths exposed in API responses.

### Next

Pilot Enforcement Validation and Multi-Model Track Expansion — activate enforcement for one qualified track once qualification evidence exists. Expand multi-model testing with runtime performance feedback. Add human correction records.

---

## 2026-07-05 — Durable Enforcement Policy: Code Review Corrections

### Changed

- Modified `companion/core/enforcement-policy-store.js`:
  - Added `MIN_SHADOW_EVIDENCE_COUNT = 3` constant.
  - Added `auditHealthy` state variable tracking audit write health.
  - Refactored `setTrackState()` — moved all gate checks before `mutate()` for `enforced` target, enabling async gate evaluation.
  - Added `checkEnforcementGateAsync()` — async gate checking runtime availability, model readiness, shadow evidence sufficiency, approval, qualified capability, score threshold, and active override. Error codes: `RUNTIME_UNAVAILABLE`, `MODEL_NOT_READY`, `INSUFFICIENT_EVIDENCE`, `RUNTIME_CHECK_FAILED`, `EVIDENCE_CHECK_FAILED`.
  - Removed dead sync `checkEnforcementGate()` (replaced by async version).
  - Updated `getStoreHealth()` — includes `auditHealthy`.
  - Updated `executeMutation()` — fills in audit `overrideId` from mutation result; fills in audit `after` state from `candidate.tracks[trackId]` when available; appends `POLICY_AUDIT_WRITE_FAILED` warnings to success results when audit is degraded.
  - Updated `safeAudit()` — sets `auditHealthy = false` on write failure.
  - Updated `setOverride()` — removed `expiresAt` parameter.
  - Updated `syncApi._seedOverrideSync()` — removed `expiresAt: null`.
  - Added `MIN_SHADOW_EVIDENCE_COUNT` to exports.
  - Updated `revokeApproval()` — mutation returns `auditAfter: { approved: false, state: record.state }` for accurate audit records.
- Modified `companion/schemas/internal/enforcement-policy.schema.json`:
  - Changed `defaultState` from `enum` (5 states) to `const: "shadow"`.
  - Removed `expiresAt` from overrides items properties.
- Modified `companion/core/enforcement-policy.js`:
  - Removed `expiresAt` from `setOverride()` parameter and `store.setOverride()` call.
  - Added `auditHealthy` to `getPolicySummary()` `storeHealth`.
- Modified `companion/server.js` — removed `expiresAt` from override endpoint handler.
- Modified `scripts/test-enforcement-policy-store.js` — added 20 new tests covering: runtime unavailable gate, model not ready gate, insufficient evidence gate, all conditions met, forceGate bypass, auditHealthy flag, audit warnings, revocation after-state accuracy, override creation audit.

### Why

Address five code review findings. The enforced transition gate was the critical issue — it did not verify runtime readiness or shadow evidence, breaking the declared safety contract for the durable `enforced` state. Audit failures were invisible. Schema permitted unsafe defaults. `expiresAt` was dead code. Audit after-state was inaccurate.

### Evidence

- 143/143 store tests pass (20 new: async gate, audit health, audit accuracy).
- 62/62 enforcement policy tests pass (backward compatible).
- 91/91 enforcement routing tests pass (backward compatible).
- 31/31 shadow routing, 25 qualification resolver, contract, benchmark:test, benchmark:status-smoke, 56/56 smoke tests — all pass.
- Runtime/evidence checks now gate the durable `eligible → enforced` transition, matching the original safety contract.

### Next

Pilot Enforcement Validation and Multi-Model Track Expansion — activate enforcement for one qualified track once qualification evidence exists. Expand multi-model testing with runtime performance feedback. Add human correction records.
```

---

## 2026-07-08 - Pilot Enforcement Validation Active

### Changed

- Activated first guarded enforcement pilot for `website_audit.lighthouse_handoff` / `priority_helper`.
- Approved the track, moved it to `eligible`, then moved it to `enforced` through the guarded policy gate.
- Updated qualification capability plumbing so Local Brain carries `runtimeModelName` from qualification records.
- Updated shadow recommendations and enforcement gates to use `runtimeModelName` for runtime readiness and execution while preserving stable capability ids in policy/evidence.
- Updated runtime track recording so model child records persist `routing.enforcementDecision`.
- Updated Track Run Record schema for `recommendedRuntimeModelName` and enforcement `checks`.
- Fixed `/enforcement/pilot` so it reports the active enforced pilot instead of stale no-pilot text.
- Fixed shadow/evidence review deduplication so records without stable ids are not collapsed in tests.

### Evidence

- `GET /enforcement/pilot` reports `pilotTrack=website_audit.lighthouse_handoff`.
- First 10 monitored enforced executions succeeded with `hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest`.
- Enforcement review reports applied decisions for `lfm25-1p2b-thinking-local`, no fallback, and 100% enforced success for the monitored pilot records.
- 149/149 enforcement policy store tests pass.
- 62/62 enforcement policy tests pass.
- 91/91 enforcement routing tests pass.
- 31/31 shadow routing tests pass.
- 25/25 qualification resolver tests pass.
- Track Run Record schema fixtures pass.
- Contract helpers pass.
- `npm.cmd run benchmark:test` passes.
- `npm.cmd run benchmark:status-smoke` passes.
- 56/56 smoke tests pass.

### Next

Review enforced output quality beyond transport success, add human correction records for Lighthouse priority decisions, and then decide whether to continue, suspend, or broaden the pilot.

---

## 2026-07-08 - Output Quality Review + Human Correction Records

### Changed

- Added human review schema at `companion/evidence/schemas/human-review-record.schema.json`.
- Added separate review/correction store at `companion/evidence/human-review-record-store.js`.
- Added `POST /runs/:id/review` to create/update a human review for a Track Run Record.
- Added `GET /runs/:id/review` to retrieve the review layer without reading model output from the review record.
- Added `GET /enforcement/quality-summary` to aggregate human-reviewed output quality.
- Added `scripts/quality-review.js` and `npm.cmd run quality-review` so operators can list, inspect, review, and summarize runs without hand-written API calls.
- Added `scripts/test-human-review-records.js` and `npm.cmd run quality-review:test`.
- Extended smoke tests with human review endpoint coverage.

### Evidence

- 25/25 human review assertions pass.
- 149/149 enforcement policy store tests pass.
- 62/62 enforcement policy tests pass.
- 91/91 enforcement routing tests pass.
- 31/31 shadow routing tests pass.
- 25/25 qualification resolver tests pass.
- Track Run Record schema fixtures pass.
- Contract helpers pass.
- `npm.cmd run benchmark:test` passes.
- `npm.cmd run benchmark:status-smoke` passes.
- 57/57 smoke checks pass, including human review endpoints.
- `node --check scripts/quality-review.js` passes.
- `npm.cmd run quality-review -- summary` reads the review store.
- `npm.cmd run quality-review -- list --limit 3` reads Track Run Records.

### Next

Apply real human reviews to the first enforced Lighthouse pilot outputs with `npm.cmd run quality-review -- list --track website_audit.lighthouse_handoff`, then use `npm.cmd run quality-review -- summary` to decide whether to continue, suspend, narrow, or broaden the pilot.

---

## 2026-07-08 - Lighthouse Human Gate Packet + Draft Reviews

### Changed

- Added `scripts/lighthouse-human-gate.js`.
- Added `npm.cmd run quality-gate:lighthouse`.
- Gate command finds enforced `website_audit.lighthouse_handoff` / `priority_helper` runs for `lfm25-1p2b-thinking-local` with enforcement applied and no fallback.
- Added deterministic draft-review heuristics for missing/malformed output, invented Lighthouse audit IDs, unsupported implementation claims, vague output, and safe passes.
- Generated packet artifacts:
  - `benchmark-lab/evidence/reviews/lighthouse-human-gate-v1.md`
  - `benchmark-lab/evidence/reviews/lighthouse-human-gate-v1.json`
  - `benchmark-lab/evidence/reviews/lighthouse-human-gate-proposed-reviews-v1.json`
  - `benchmark-lab/evidence/reviews/lighthouse-human-gate-decision-v1.json`
- `--approve-safe` writes review records only for proposed pass items with no risk flags, `riskScore <= 1`, and no correction required.

### Evidence

- `node --check scripts/lighthouse-human-gate.js` passes.
- `npm.cmd run quality-gate:lighthouse -- --dry-run` generated the packet; 11 candidate runs, 11 proposed pass, 0 needs_edit, 0 fail, recommendation `continue`.
- `npm.cmd run quality-gate:lighthouse -- --approve-safe` wrote 11 safe pass review records.
- Direct review-store check confirmed all 11 auto-written reviews are `pass`, `riskScore <= 1`, no risk flags, no correction required.
- `npm.cmd run quality-review:test` passes: 25/25 assertions.
- `npm.cmd run benchmark:test` passes.
- `node scripts/contract-test.js` passes.
- `node scripts/smoke-test.js` passes: 57/57 checks with companion server running.

### Next

Human should review `benchmark-lab/evidence/reviews/lighthouse-human-gate-v1.md`, confirm or override the `continue` recommendation, and avoid broadening claims beyond this reviewed Lighthouse pilot gate.

---

## 2026-07-08 - Simple Lighthouse URL Run Command

### Changed

- Added `scripts/lighthouse-run.js`.
- Added `npm.cmd run lighthouse:run`.
- Command accepts `--url https://your-site.com`, creates a synthetic Lighthouse input payload, posts `website_audit.lighthouse_handoff`, and prints the new Track Run Record ID.
- Command starts the companion server temporarily if needed and stops only the server it started.
- Optional `--mock` is available for fast local plumbing checks.

### Evidence

- `node --check scripts/lighthouse-run.js` passes.
- `npm.cmd run lighthouse:run -- --url https://your-site.com --mock` created Track Run Record `track-mrc9uwxc-7aea46a3`.
- Temporary companion server stopped after the mock run.

### Next

Use:

```bash
npm.cmd run lighthouse:run -- --url https://your-site.com
npm.cmd run quality-gate:lighthouse -- --dry-run
```

---

## 2026-07-08 - URL-Scoped Lighthouse Human Gate

### Changed

- Added `--url` filtering to `npm.cmd run quality-gate:lighthouse`.
- Added `--latest-only` and `--latest-n N` selection for matching runs.
- Added `--include-fixtures`; fixture URLs such as `example.com` are excluded by default.
- Packet now includes a `Filters` section with URL filter, fixture inclusion, latest selection, matching count, selected count, excluded fixture count, and shortfall warnings.

### Evidence

- `npm.cmd run quality-gate:lighthouse -- --url https://doughboyvinyl.com --dry-run` selected 1 matching doughboy run and excluded 11 fixture runs.
- `npm.cmd run quality-gate:lighthouse -- --url https://doughboyvinyl.com --latest-only --dry-run` selected only the latest matching run.
- `npm.cmd run quality-gate:lighthouse -- --url https://doughboyvinyl.com --latest-n 5 --dry-run` reported: requested 5 matching runs, only found 1.
- `npm.cmd run quality-gate:lighthouse -- --include-fixtures --latest-n 2 --dry-run` explicitly allowed fixture/canary records.

### Next

Use URL-scoped gates for real sites:

```bash
npm.cmd run lighthouse:run -- --url https://doughboyvinyl.com
npm.cmd run quality-gate:lighthouse -- --url https://doughboyvinyl.com --dry-run
```

---

## 2026-07-08 - Targeted Multi-Run URL Validation

### Changed

- Added `--count` support to `scripts/lighthouse-run.js`.
- `npm.cmd run lighthouse-priority:run -- --url <url> --count <n>` now delegates to the URL run path.
- Ran five fresh enforced Lighthouse executions for `https://doughboyvinyl.com`.
- Generated a URL-scoped gate packet for only the latest five Doughboy runs.
- Approved safe reviews only after the packet showed five pass verdicts, no risk flags, no corrections, and no failures.

### Evidence

- Fresh runs:
  - `track-mrcdsdru-a58c7f7e`
  - `track-mrcdseid-1a169de4`
  - `track-mrcdsf7y-0b4d4c6b`
  - `track-mrcdsg0y-c5a0d98f`
  - `track-mrcdsgu2-83e60a18`
- `npm.cmd run quality-gate:lighthouse -- --url https://doughboyvinyl.com --latest-n 5 --dry-run`: 5 candidate runs, 5 pass, 0 needs_edit, 0 fail, 0 critical risk, fixtures excluded.
- `npm.cmd run quality-gate:lighthouse -- --url https://doughboyvinyl.com --latest-n 5 --approve-safe`: wrote 5 safe pass review records.
- `npm.cmd run quality-review -- summary`: 19 reviewed runs, 19 pass, 0 needs_edit, 0 fail, 100% pass rate, 0% correction rate, 0 critical risk.

### Next

Use this as the default validation loop for real URLs: run N fresh executions, gate with `--url` and `--latest-n N`, review exceptions only, then approve safe if clean.

---

## 2026-07-08 - Real URL Validation Set

### Changed

- Ran 5 fresh enforced Lighthouse priority executions for each real URL:
  - `https://doughboyvinyl.com`
  - `https://doughboyvinyl.com/25-mil-patterns`
  - `https://lemonteed.com`
  - `https://lemonteed.com/junk-drawer/`
- Generated URL-scoped quality gates with `--latest-n 5`.
- Fixture/canary runs were excluded.
- Approved safe reviews only after each URL packet showed no exceptions.

### Evidence

| URL | Runs | Pass | needs_edit | Fail | Critical Risk | Correction Rate | Avg Usefulness | Avg Accuracy | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `https://doughboyvinyl.com/` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://doughboyvinyl.com/25-mil-patterns` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com/` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com/junk-drawer` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |

- `npm.cmd run quality-review -- summary`: 39 reviewed runs, 39 pass, 0 needs_edit, 0 fail, 100% pass rate, 0% correction rate, 0 critical risk.

### Next

At least 3 real URLs have now passed the gate. Broader pilot changes still require an explicit decision; do not broaden automatically from this evidence alone.

---

## 2026-07-08 - Lighthouse Handoff Assembly Pilot

### Changed

- Added `developer_task_writer` as the next adjacent Lighthouse role.
- Added `write_developer_tasks` to `website_audit.lighthouse_handoff` after validated priority fixes.
- Added `companion/crew/schemas/developer-task-writer.schema.json`.
- Added a prompt template that requires coding-agent-ready tasks, acceptance criteria, guardrails, and testing checklist items grounded in supplied Lighthouse/Priority Helper data.
- Added `developerTaskPacket` to the composed Lighthouse handoff output without overwriting model output or enforcement evidence.
- Extended the Lighthouse human gate to check task-packet completeness and surface missing tasks, guardrails, or tests as quality exceptions.
- Updated mock JSON generation so schema-backed mock workflow tests honor `minItems`, required object fields, and string fields.

### Evidence

| URL | Runs | Pass | needs_edit | Fail | Critical Risk | Correction Rate | Avg Usefulness | Avg Accuracy | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `https://doughboyvinyl.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://doughboyvinyl.com/25-mil-patterns` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com/junk-drawer/` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |

- Cross-URL assembly set: 20 reviewed, 20 pass, 0 needs_edit, 0 fail, 0 critical risk, 0 corrections.
- `npm.cmd run quality-review -- summary`: 59 reviewed, 59 pass, 0 needs_edit, 0 fail, 0 critical risk.
- `npm.cmd run quality-review:test`: 25/25 assertions passed.
- `npm.cmd run benchmark:test`: passed.
- `node scripts/smoke-test.js`: 57/57 checks passed.

### 2026-07-11 — Guardrail Writer Qualification and Guarded Enforcement Pilot

Added `guardrail_writer` as the next adjacent Lighthouse Handoff role. Created schema, prompt, track step, handoff integration, and role mapping. Formal qualification generated (score 1.0, 3/3 URL scenarios). Guarded enforcement activated through existing policy.

**Implementation:**
- Schema: `companion/crew/schemas/guardrail-writer.schema.json` (5 required fields)
- Prompt: `buildGuardrailWriterPrompt()` + `write_guardrails` template in `companion/crew/prompts.js`
- Track step: `write_guardrails` added to `lighthouse-handoff.track.json` (step 7 of 9, after `write_developer_tasks`)
- Handoff: `normalizeGuardrailPacket()` + guardrail sections in markdown output
- Quality gate: guardrail completeness checks added to `lighthouse-human-gate.js`
- Role: `guardrail_writer` mapped to `llama3.2` in server.js config

**Qualification artifacts:**
- Evidence summary: `benchmark-lab/evidence/summaries/lfm25-1p2b-thinking-guardrail-writer-v1.json`
- Approved evidence: `benchmark-lab/evidence/approved/lfm25-1p2b-thinking-guardrail-writer-v1.json`
- Qualification record: `benchmark-lab/qualifications/models/lfm25-1p2b-thinking-local-lfm25-1p2b-thinking-guardrail-writer-v1.json`
- Model card updated with all 3 evidence entries
- 5 checksum records generated

**Guarded enforcement validation (3 URLs x 5 runs = 15 enforced runs):**
| URL | Runs | applied=true | execCapabilityId | fallback |
|---|---|---|---|---|
| `https://doughboyvinyl.com` | 5 | 5 | lfm25-1p2b-thinking-local | 0 |
| `https://doughboyvinyl.com/25-mil-patterns` | 5 | 5 | lfm25-1p2b-thinking-local | 0 |
| `https://lemonteed.com` | 5 | 5 | lfm25-1p2b-thinking-local | 0 |

Quality gates: 15/15 pass, 0 needs_edit, 0 fail, 0 critical risk. Aggregate: 115 reviewed, 115 pass.
Enforcement: GW 15 applied/15 total, DT 47 applied/49 total, PH 124 applied/136 total. 100% success, 0 fallback.
Capabilities: 6, Qualified: 4. No global broadening.

### 2026-07-11 — Guarded Enforcement Pilot for developer_task_writer

Moved developer_task_writer through guarded enforcement within `website_audit.lighthouse_handoff`. The track was already in `enforced` state; developer_task_writer qualified capability (score 1.0) was eligible, so enforcement activated through the existing policy path without policy modification.

- **3 real URLs x 5 fresh enforced runs each = 15 runs**
- All 15 runs: `enforcementDecision.applied=true`, `executedCapabilityId=lfm25-1p2b-thinking-local`, `fallbackTriggered=false`
- URL-scoped quality gates with `--latest-n 5 --approve-safe`: 15/15 pass, 0 needs_edit, 0 fail, 0 critical risk
- 15 safe auto-approval review records written
- `npm.cmd run quality-review -- summary`: 99 reviewed, 99 pass, 0 needs_edit, 0 fail, 0 critical risk
- Enforcement: DTW 16 applied/17 total, PH 93 applied/104 total
- `priority_helper` remains enforced; no global broadening (4 tracks unchanged)
- Smoke 57/57, benchmark:test, contract, status-smoke all pass

### 2026-07-11 — Formal Qualification for developer_task_writer

Created formal Benchmark Lab qualification artifacts for `developer_task_writer` role:

- **Evidence summary** promoted: `benchmark-lab/evidence/summaries/lfm25-1p2b-thinking-developer-task-writer-v1.json`
- **Approved evidence marker**: `benchmark-lab/evidence/approved/lfm25-1p2b-thinking-developer-task-writer-v1.json`
- **Qualification record**: `benchmark-lab/qualifications/models/lfm25-1p2b-thinking-local-lfm25-1p2b-thinking-developer-task-writer-v1.json`
  - role: `developer_task_writer`, track: `website_audit.lighthouse_handoff`, contract: `developer-task-writer-v1`
  - status: `qualified`, score: `1.0` (4/4 URL validation scenarios pass)
  - evidence: 20 enforced runs across 4 real URLs, 20/20 quality-gate pass, 0 fail, 0 critical risk
- **Model card updated**: includes both `priority_helper` (91.7%) and `developer_task_writer` (100%) evidence
- **5 checksum records** generated for all new/updated artifacts
- **Local Brain loaded**: capabilities increased from 4→5, qualified from 2→3
- **No enforcement broadening**: `priority_helper` remains the only enforced role

All schema validations pass. Smoke test: 57/57. Benchmark:test, contract-test, status-smoke all pass.

### 2026-07-11 — Lighthouse Handoff Assembly Pilot Fresh Validation (Ollama, real runs)

Re-validated the complete Assembly Pilot with fresh enforced runs using real Ollama (llama3.2 for `developer_task_writer`, enforced `lfm25-1p2b-thinking-local` for `priority_helper`).

- 4 URLs x 5 fresh runs = 20 new enforced Lighthouse Track Run Records
- All 20 runs transport-successful, enforcement-successful
- Quality gate applied with `--url <url> --latest-n 5 --approve-safe` per URL
- 20/20 proposed pass, 0 needs_edit, 0 fail, 0 critical risk, 0 corrections
- Human review records written for all 20 safe passes
- `npm.cmd run quality-review -- summary`: 83 reviewed, 83 pass, 0 needs_edit, 0 fail, 0 critical risk

| URL | Runs | Pass | needs_edit | Fail | Critical Risk | Correction Rate | Avg Usefulness | Avg Accuracy | Decision |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `https://doughboyvinyl.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://doughboyvinyl.com/25-mil-patterns` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com/junk-drawer/` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |

### Next

Do not broaden globally from this pilot.

---

## 2026-07-11 — Full Lighthouse Handoff Validation Loop (Testing Checklist Writer + Complete Product Loop)

### Changed

Added `testing_checklist_writer` as the fourth Lighthouse Handoff role, completing the first full product-loop validation slice.

**Implementation:**
- Schema: `companion/crew/schemas/testing-checklist-writer.schema.json` (6 required fields)
- Prompt: `buildTestingChecklistWriterPrompt()` + `write_testing_checklist` template in `companion/crew/prompts.js`
- Track step: `write_testing_checklist` added as step 8/10 in `lighthouse-handoff.track.json` (track is now 10 steps)
- Handoff: `normalizeTestingChecklistPacket()` + 6 sections in markdown output (PageSpeed Rerun Steps, Before/After Comparisons, Regression Checks, Manual QA Notes, Coding Agent Verification, Stop and Ask Human)
- Quality gate: `findTestingChecklistWriterChild()` + `parseTestingChecklistWriterCounts()` + completeness checks
- Model role: `testing_checklist_writer` mapped to `llama3.2` in `companion/server.js`
- Full handoff quality gate: `--artifact full-handoff` mode validates entire assembled handoff

**Qualification artifacts:**
- Evidence summary: `benchmark-lab/evidence/summaries/lfm25-1p2b-thinking-testing-checklist-writer-v1.json`
- Approved evidence: `benchmark-lab/evidence/approved/lfm25-1p2b-thinking-testing-checklist-writer-v1.json`
- Qualification record: `benchmark-lab/qualifications/models/lfm25-1p2b-thinking-local-lfm25-1p2b-thinking-testing-checklist-writer-v1.json`
- 3 checksum records generated

**Full handoff validation report:**
- `benchmark-lab/evidence/reviews/full-lighthouse-handoff-validation-v1.md`
- `benchmark-lab/evidence/reviews/full-lighthouse-handoff-validation-v1.json`

### Evidence

- All existing tests pass: benchmark:test, contract-test, benchmark:status-smoke, qualification-resolver (25), shadow-routing (31), enforcement-routing (91), enforcement-policy (62), enforcement-policy-store (149), human-review-records (25)
- Track: 10 steps, Capabilities: 6, Qualified: 4, Roles: 4 qualified, 3 enforced
- Full handoff assembled artifact includes: Score Summary → Priority Fixes → Developer Tasks → Guardrails → Testing Checklist → Coding Agent Prompt
- No global broadening (4 tracks unchanged, only `website_audit.lighthouse_handoff` enforced)
- All existing roles and enforcement states unchanged

### Next

Do not broaden globally. The full Lighthouse Handoff product loop is now validated. Decide next action after explicit direction. Follow-on candidates: multi-model track expansion, DealSniper workflow build-out, live qualification depth.

---

## 2026-07-11 — M2: Multi-Track Qualification & Enforcement Complete

### Changed

- Created 4 Benchmark Lab suites with 10 total scenarios across accessibility-deep, performance-budget, seo-audit, and dealsniper tracks
- Qualified llama3.2 for 4 roles: a11y_analyzer (score 1.0), budget_analyzer (score 1.0), seo_analyzer (score 1.0), default_worker/dealsniper (score 1.0)
- Built `GET /qualifications/dashboard` endpoint with per-model, per-track, per-role breakdown including enforcement state
- Created `scripts/website-audit-gate.js` quality gate for website audit track output validation
- Added `quality-gate:website-audit` and `audit:dealsniper` npm scripts
- Set 4 new tracks to shadow enforcement mode: website_audit.accessibility_deep, website_audit.performance_budget, website_audit.seo_audit, marketplace.dealsniper
- Updated model manifest for llama3.2-local with 4 qualified capabilities
- Updated enforcement policy with 4 new tracks (shadow, approved)
- Updated docs: current-state.md, next-agent-brief.md, latest-build-result.json, decision-log.md, progress-log.md

### Evidence

- All Benchmark Lab suites pass: 10/10 scenarios across 4 suites
- All existing tests pass: benchmark:test, contract-test, benchmark:status-smoke, enforcement-policy-store (149/149), enforcement-policy (62/62), enforcement-routing (91/91)
- Server starts and GET /qualifications/dashboard returns valid response with 11 capabilities across 2 models
- 2 models now qualified: lfm25-1p2b-thinking-local (4 Lighthouse roles) + llama3.2-local (4 web audit + dealsniper roles)
- 8 total qualified capabilities across 5 tracks
- No global enforcement broadening (all new tracks in shadow)

### Next

M3: Dynamic Track Planning & DAG Execution. See `docs/07-progress/roadmap-milestones-2-3-4.md`. Or pursue M2 follow-ons: qualify recommender roles, enforce shadow tracks, qualify operator-log tracks.

---

## 2026-07-11 — M3: DAG Execution Engine & Track Planner (Phase 1-3)

### Changed

- **Built DAG graph engine** (`companion/core/dag-graph.js`): computes dependency graphs from `$artifacts.*` references in step `input_map`, topological sort, cycle detection, missing step detection, level grouping for parallel execution
- **Built DAG executor** (`companion/core/dag-executor.js`): validates DAG, executes steps in level order with configurable concurrency, handles fan-in/fan-out, error propagation with abort-on-error
- **Added DAG mode to orchestrator** (`companion/crew/orchestrator.js`): `useDag: true` option switches from sequential `for` loop to DAG-based execution with parallel step dispatch
- **Built track planner tool** (`companion/tools/track-planner.js`): model-backed tool that accepts free-form user requests and decomposes into structured track plans with step-level dependencies
- **Added `POST /tracks/plan` endpoint**: accepts user request, runs track planner, returns structured plan
- **Registered track-planner tool**: added to tool registry, server enabled tools, companion config
- **Added DAG tests**: 14 graph tests + 9 executor tests (linear, parallel, error handling, lighthouse-like 9-step DAG)

### Evidence

- DAG executor handles: linear tracks, parallel fan-out/fan-in, DealSniper (3 steps), Lighthouse-like (9 steps with 8 levels)
- Parallel steps detected: `write_guardrails` + `write_testing_checklist` at level 5 (can run concurrently)
- Cycle detection catches circular dependencies
- Missing step detection catches references to non-existent steps
- Real server test: `POST /tracks/run` with `{"options":{"useDag":true}}` executes DealSniper track successfully with DAG
- All existing tests pass: benchmark:test, contract-test, status-smoke, enforcement (3 suites), DAG tests

### Files Created

| File | Purpose |
|---|---|
| `companion/core/dag-graph.js` | DAG graph computation, topological sort, cycle detection |
| `companion/core/dag-executor.js` | DAG step executor with parallel dispatch |
| `companion/tools/track-planner.js` | Model-backed track planner tool |
| `companion/schemas/track-planner-output.schema.json` | Track planner output schema |
| `scripts/test-dag-graph.cjs` | DAG graph tests (14) |
| `scripts/test-dag-executor.cjs` | DAG executor tests (9) |

### Next

Remaining M3 scope: DAG integration into run-plan-executor.js for workflow orchestration, DAG tests in CI, track-level DAG documentation.

## 2026-07-11 � M4 + M5 Post-Completion Review

Reviewed completed M4 (Relay Nodes) and M5 (Multi-Device Workflow Coordination) for bugs, mistakes, and unfinished items. Found and fixed 4 issues plus a hidden test-harness bug:

| # | Issue | Fix |
|---|---|---|
| 1 | 
egistry.selectForRole sorted descending (most-loaded first) | companion/relay/registry.js: sort ascending by dispatchCount |
| 2 | Placement yRole double-counted nodes advertising both 
ole and 
ole:role | companion/relay/placement.js: dedupe nodes per role |
| 3 | No direct unit test for M5 executeStepWithAssignedNode | Added 3 tests to scripts/test-relay-unit.cjs (routes to assigned node; falls back when unhealthy; falls back + RELAY_FALLBACK audit on failure) |
| 4 | 
elay-node-protocol.md M4-only, missing M5 | Added M5 placement section (distribute, POST /relay/plan, relay_placement, assignments) |
| H | 	est-relay-unit.cjs async checks were fire-and-forget before process.exit (never ran; masked wrong 
.code vs 
.error_code audit assertion) | Harness now awaits async checks; corrected assertion |

Verification after fixes:

- scripts/test-relay-unit.cjs � 17/17 PASS
- scripts/test-relay-placement.cjs � 14/14 PASS
- scripts/test-multi-device-e2e.cjs � 22/22 PASS

M4 + M5 acceptance criteria met; no blockers remaining. See docs/07-progress/latest-build-result.json 
eview_2026-07-11.

---

## 2026-07-20 — Objective Lifecycle Hardening and Mandatory Closeout

### Changed

- Created `scripts/objective-lifecycle.js` — lifecycle manager with 9 states (planned, queued, active, blocked, held, failed, completed, abandoned, superseded), validated transitions, terminal-state enforcement, stable objective identity via JSON meta files, transactional archive with encoding normalization, integrity check, and startup continuity gate
- Created `docs/07-progress/work-closeout.schema.json` — canonical closeout record schema
- Created `docs/07-progress/work-closeout.json` — active closeout record for current session
- Created `scripts/test-lifecycle.js` — 21 tests covering state machine, duplicate detection, encoding, transactional archive, and startup continuity
- Updated AGENTS.md, supervisor POLICY.md, worker POLICY.md, and build-slice-protocol.md with lifecycle and closeout policies
- Cleaned up encoding corruption (UTF-16 LE BOM) in `completed/07-durable-background-execution.md` and `completed/08-operator-control-plane.md`
- Removed duplicate tracked queue files `07-durable-background-execution.md` and `08-operator-control-plane.md` from queue root (archived in completed/)
- Reset stale `run-state.json` and finalized `milestones/06-trusted-relay-execution.json`
- Added `.meta.json` files with stable identity and supersession chains for all lifecycle directories
- Resolved prefix collision in held objectives

### Evidence

- `node scripts/test-lifecycle.js` — 21/21 passed
- `node scripts/objective-lifecycle.js check` — 3 issues remaining (acceptable: duplicate slugs with meta files, active-objective with valid content)
- All existing offline test suites pass

### Next

Second-repo operator acceptance, then physical multi-device pilot.
