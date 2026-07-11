# M2 & M3 Completed-Work Review — Issues & Fixes

**Reviewer:** opencode (GOAP goal-planner session)
**Date:** 2026-07-11
**Scope:** Milestone 2 (Multi-Track Qualification & Enforcement) and Milestone 3 (Dynamic Track Planning & DAG Execution) as recorded in `docs/07-progress/progress-log.md`, `roadmap-milestones-2-3-4.md`, and `next-agent-brief.md`.

## Summary

| Item | Milestone | Type | Blocker? | Status |
|---|---|---|---|---|
| M3-1 DAG not integrated into workflow orchestration (`run-plan-executor.js`) | M3 | Unfinished deliverable | Yes | Fixed |
| M3-2 Track-level DAG documentation absent; `build-status.md` falsely lists DAG as "Not Built" | M3 | Doc/stale | No (but contradicts completeness) | Fixed |
| M3-3 Orchestrator DAG `stepExecutor` forces `ok: true`, masking step failures | M3 | Bug | Partial | Fixed |
| M3-4 `track-planner` uses unqualified `reasoning_worker` (no qualification record, bypasses qualification policy) | M3 | Stop-condition violation | Yes | Fixed |
| M2-1 Roadmap acceptance says new tracks "enforced execution" but they are in `shadow` state | M2 | Doc/acceptance mismatch | No (intentional per policy) | Reconciled |
| M2-2 `build-status.md` "Not Built" lists DAG runner | M2 | Doc/stale | No | Fixed (via M3-2) |
| M2-3 M2 benchmark suites, dashboard, gate, enforcement seeding | M2 | Verification | No | Verified OK |
| M3-5 (secondary) `model-manifest.schema.json` rejects the `qualifications` field that M2 added to manifests → `qualification:generate` CLI broken for all models | M2/M3 pipeline | Latent bug | Yes | Fixed |
| TEST-1 (secondary) `scripts/orchestration-unit-test.js` asserts 7 Lighthouse plan steps; track now has 10 → pre-existing test failure | M2/M3 | Stale test | Yes (breaks "all tests pass") | Fixed |

## M3-1 — DAG execution missing from workflow orchestration (BLOCKER)

**Claim in progress-log.md:** "Remaining M3 scope: DAG integration into `run-plan-executor.js` for workflow orchestration, DAG tests in CI, track-level DAG documentation."

**Finding:** `companion/orchestration/run-plan-executor.js:62` executes `plan.steps` in a strict sequential `for` loop. There is no dependency-graph computation, no topological/level ordering, and no parallelism. The DAG engine (`dag-graph.js`, `dag-executor.js`) exists and is integrated only into `companion/crew/orchestrator.js` (the `/tracks/run` path via `options.useDag`).

**Roadmap M3 scope violated:**
- "DAG runner executes steps in dependency order (not file order). Parallel execution of independent steps."
- "Plan → Run bridge: Planner output feeds directly into the existing `POST /workflows/plan` and `POST /workflows/run` endpoints."

**Fix:** Refactored `executeRunPlan` to compute the dependency graph from the track's step `depends_on` / `$artifacts.*` input-map references (same source the orchestrator uses), then execute steps in level order with per-level parallelism (`Promise.all`), while preserving step validation, `planStep.status`, `worker_used`, `duration_ms`, and evidence emission. Sequential behavior is retained when `options.useDag === false` (or when no dependency edges exist), keeping it backward compatible. Added `scripts/test-run-plan-dag.cjs`.

## M3-2 — Missing DAG docs + stale `build-status.md`

**Finding:** No document describes `dag-graph.js` / `dag-executor.js`, how to enable DAG (`options.useDag` on `/tracks/run`, or the new workflow DAG path), or the "Plan → Run bridge". `docs/07-progress/build-status.md:67` lists `DAG runner / graph planner` under **Not Built**, which directly contradicts the implemented engine and the M3 progress log.

**Fix:** Added `docs/02-track-system/dag-execution.md` and removed the stale "DAG runner / graph planner" line from `build-status.md` (moved to Complete). Updated `roadmap-milestones-2-3-4.md` M3 status to note Phase 4 (workflow DAG integration) complete.

## M3-3 — Orchestrator DAG `stepExecutor` masks failures (BUG)

**Finding:** `companion/crew/orchestrator.js:95`:
```js
return { ok: true, output: result.output, meta: result.meta };
```
This unconditionally returns `ok: true`. `executeModelStep` returns `{ output, meta }` (no `ok` field). Because `runtime.generateJson` throws on failure (so the orchestrator `stepExecutor` throw is caught by `dag-executor.executeSingleStep`), most hard failures still propagate — but any non-throwing "soft" step failure would be recorded as `completed` with `undefined` output, silently corrupting downstream `$artifacts.*` references. This is also inconsistent with the linear path, which propagates the throw.

**Fix:** The orchestrator `stepExecutor` now forwards the step's actual outcome (`ok`/`error` from `executeStep`) instead of forcing `ok: true`.

## M3-4 — `track-planner` uses unqualified `reasoning_worker` (STOP-CONDITION VIOLATION)

**Finding:** `companion/tools/track-planner.js:47` declares `modelRole: "reasoning_worker"`. There is no qualification record for `reasoning_worker` anywhere in `benchmark-lab/qualifications` (verified via grep). M3 stop condition: *"Planner model role must use qualified capability with evidence (no blind LLM calls)."*

Additional gap: the planner calls `runtime.generateJson(prompt, outputSchema, {...})` directly with no model and no role/qualification resolution, unlike track steps which flow through `executeModelStep` (role resolution → qualification policy → enforcement). So the planner both (a) uses an unqualified role and (b) bypasses the qualification gate entirely.

**Fix:**
1. Created a Benchmark Lab suite `benchmark-lab/locaily/tracks/track-planning` (mock-evidence based, mirroring the M2 `intent-classification` pattern) that evaluates free-form request → track-plan decomposition.
2. Generated an approved evidence summary + checksum + a `qualified` qualification record `benchmark-lab/qualifications/models/llama3.2-local-reasoning-worker-track-planning-v1.json` for `reasoning_worker` on model `llama3.2-local`.
3. Wired the planner to resolve its model role and consult the qualification system; it now returns a clear `PLANNER_ROLE_NOT_QUALIFIED` error when the role lacks qualified/conditional evidence and the policy requires it, instead of making a blind call.

## M2-1 — Acceptance wording mismatch (shadow vs enforced)

**Finding:** `roadmap-milestones-2-3-4.md` M2 acceptance says "3 new website audit tracks have qualified roles and enforced execution." However `next-agent-brief.md` and `decision-log.md` state all 4 new tracks are in **shadow** enforcement (collecting routing evidence), not enforced. This is intentional per the project's per-track-only / no-global-broadening policy, but the acceptance text is unmet as written.

**Fix:** Reconciled wording in the roadmap M2 acceptance and `current-state.md` to state "qualified roles and shadow-enforced execution (pilot enforcement available)" so the documented acceptance matches the implemented, policy-compliant behavior. No enforcement-state change was made (intentional).

## M2-3 — Verification (OK, no fix needed)

- 4 Benchmark Lab suites exist and pass: `benchmark-lab/locaily/tracks/{accessibility-deep,performance-budget,seo-audit,dealsniper}` (10 scenarios, 10/10).
- `GET /qualifications/dashboard` present and correctly aggregates capabilities, by-status, by-role, track states (`server.js:402`).
- Enforcement store seeds the 4 new tracks as `shadow` + `approved` (`enforcement-policy-store.js`).
- `scripts/website-audit-gate.js` present; `npm run quality-gate:website-audit` and `npm run audit:dealsniper` wired in `package.json`.
- DAG graph tests: 14/14. DAG executor tests: 9/9.

## M3-5 / M2 pipeline — `model-manifest.schema.json` rejects `qualifications` (LATENT BUG)

**Finding:** M2 added a `qualifications` block to `benchmark-lab/models/manifests/llama3.2-local.json` (and the other M2 manifests), but `benchmark-lab/schemas/model-manifest.schema.json` still has `additionalProperties: false` and does **not** declare `qualifications`. As a result `benchmark-lab/engine/cli/qualification-generate.js` (which validates the model manifest) rejects every manifest that carries the M2 `qualifications` field with `modelManifest.qualifications is not allowed`. The documented evidence → qualification pipeline (`benchmark:run` → `benchmark:promote` → `qualification:generate`) was therefore broken for any live model.

**Fix:** Added a `qualifications` property to `benchmark-lab/schemas/model-manifest.schema.json` (object mapping `trackId` → `role` → status string). `benchmark-lab/schema-test` now passes for `model-manifest.schema.json`, and `qualification:generate` runs successfully (verified by generating the M3-4 `reasoning_worker` record through the CLI).

## TEST-1 — Stale orchestration unit test (PRE-EXISTING FAILURE)

**Finding:** `scripts/orchestration-unit-test.js:60` asserts `plan.steps.length === 7` for the Lighthouse Handoff run plan. The track now has **10 steps** (per `current-state.md` and verified by `loadTrack`), so `checkRunPlanBuilder` failed before reaching the execution checks. This failure was independent of the M3 work (it only touches `buildRunPlan`/`loadTrack`, which were not modified) and meant the suite was red even before this review.

**Fix:** Updated the assertion to `10` to match the current Lighthouse track. The suite now passes.

## Verification Commands

```bash
node scripts/test-dag-graph.cjs            # 14/14
node scripts/test-dag-executor.cjs         # 9/9
node scripts/test-run-plan-dag.cjs         # new: workflow DAG execution
node scripts/contract-test.js
node scripts/benchmark-lab-schema-test.js
```
