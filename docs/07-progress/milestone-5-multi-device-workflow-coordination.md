# Milestone 5 — Multi-Device Workflow Coordination

**Status:** COMPLETE
**Date:** 2026-07-11
**Build slice:** M5-multi-device-workflow-coordination

## Objective
Extend M4 Relay Nodes from single-step routing into coordinated multi-device
workflow execution. The orchestrator computes a step-to-node placement plan
across healthy relay nodes, executes each workflow step on its assigned device,
and falls back to local execution when an assigned node fails.

## What shipped
- `companion/relay/placement.js` — placement planner:
  - `createPlacementPlanner({ registry })` with `plan()` and `summarize()`.
  - `buildPlacementFromTrack({ registry, track, policy, localCapableRoles })`.
  - Policies: `distribute` (spread model steps across capable healthy nodes,
    least-loaded), `local_first`, `local_only`. M4 policies
    (`prefer_relay`, `route_if_unavailable`) remain per-step dynamic decisions.
- `companion/relay/router.js`:
  - `executeStepWithAssignedNode` routes a step to a specific node, falling back
    locally (with `RELAY_FALLBACK` audit) on failure/unhealth.
  - `executeStepViaRelayIfNeeded` now consults `options.relay.assignments[stepId]`.
- `companion/crew/orchestrator.js` (DAG + linear) and
  `companion/orchestration/run-plan-executor.js` pass `stepId`.
- `companion/server.js`:
  - `POST /relay/plan` placement preview (assignments + summary + node list).
  - `applyRelayPlacement()` attaches assignments + `placementSummary` when
    `relay_policy=distribute` for `/tracks/run` and `/workflows/run`.
  - Responses include `relay_placement` (counts + byNode).

## Tests
- `scripts/test-relay-placement.cjs` — 13/13 (distribution, local_first,
  local_only, unmatched-role fallback, unhealthy-node exclusion).
- `scripts/test-multi-device-e2e.cjs` — 22/22 (three Local Brain instances:
  A orchestrator + B `priority_helper` + C developer/guardrail/testing writers;
  distributed run, then kill C → local fallback with audit).

## Acceptance
- Coordinator computes a placement plan across 2+ relay nodes. ✅
- Each step executes on its assigned device; tool steps stay local. ✅
- Node failure mid-workflow falls back to local execution with audit trail. ✅
- Placement preview endpoint reports assignments + summary. ✅
- All existing tests still pass (backward compatible). ✅

## Scope notes
- Single orchestrator, ephemeral relay nodes — no distributed consensus.
- Placement is capability + health + least-loaded (no latency awareness).
- Tool steps always local (relay nodes are model-capability targets).
- Failed node marked unhealthy for 60s (registry stale window).

## Stop conditions honored
- Localhost-only default; relay nodes are execution targets only.
- No automatic model swapping / Model Garage.
- No distributed consensus / Byzantine fault tolerance claimed.
- Failures degrade gracefully to local execution (no data loss).
