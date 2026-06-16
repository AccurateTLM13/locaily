# Current Sprint

**Updated:** 2026-06-15

## Goal

Complete Milestone 4 track-based orchestration and prepare Milestone 5 (legacy step-input fallback removal).

## Completed (recent)

- Milestone 3: model-step `input_map` (PR #8)
- Milestone 4: workflow orchestration layer (`companion/orchestration/`, workflow APIs)
- Lighthouse Handoff run plan + executor with audit logging
- Clean-server smoke baseline: **55/55**

## In Scope (next)

- Remove `buildLegacyToolStepInput()` / `buildLegacyModelStepInput()` when safe
- Keep Lighthouse + DealSniper tracks and workflow runs passing smoke/contract/unit tests
- Sync progress docs after merge

## Out of Scope

- Model swapping / Model Garage routing
- NearbyNode routing
- DAG runner implementation
- Semantic quality validation scoring

## Done When

- Legacy fallbacks removed or explicitly deferred with decision-log entry
- `current-state.md`, `build-status.md`, and `next-agent-brief.md` match code
- Smoke suite remains **55/55** on clean server
