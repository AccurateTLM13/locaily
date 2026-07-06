# Active Build Slice

## Objective

Implement guarded qualification-aware routing for one explicitly approved Track.

## Current Slice

Guarded Qualification-Aware Routing Enforcement — **complete**.

**Status:** Implementation complete. No pilot Track activated — no companion track has a current, valid `qualified` model capability with sufficient shadow routing evidence. Enforcement remains disabled for all tracks. The enforcement machinery is ready for pilot activation once a track meets all conditions.

### Completed Scope Items

| Area | Status | Notes |
|---|---|---|
| Enforcement evaluation in model router | Complete | `evaluateEnforcement()` added to `companion/crew/model-router.js`. Evaluated inside `executeModelStep()` after shadow routing, before execution. |
| Enforcement decision field in schema | Complete | Optional `routing.enforcementDecision` added to `locaily.track_run_record.v1` schema. Additive, validated, backwards-compatible. |
| Enforcement decision in record builder | Complete | `buildTrackRunRecord()` passes `enforcementDecision` through to `routing`; omitted when not provided. |
| Enforcement decision in runtime recorder | Complete | `buildStepChildRecord()` in `runtime-track-run-recorder.js` passes enforcement decision to child records. |
| Guarded fallback behavior | Complete | Enforced capability failure triggers fallback to original selected model. Fallback decision, original error, and success/failure recorded. |
| Evidence review enforcement metrics | Complete | `buildEnforcementMetrics()` in `shadow-evidence-review.js` reports enforcement attempts, applied, blocked, fallback counts, success rates per capability, qualification record usage, failed conditions. |
| API visibility | Complete | `GET /enforcement/status` includes enforcement metrics. `GET /enforcement/pilot` reports pilot status. `GET /enforcement/decisions` lists enforcement decisions. |
| Safe state change enforcement | Complete | `POST /enforcement/set` to `enforced` requires track approval, qualified capability, and non-suspended state. |
| Pilot Track selection | Complete | No track selected. See pilot selection documentation for details. |
| Automated tests | Complete | `scripts/test-enforcement-routing.js` — 83 tests covering all policy states, eligibility failures, routing evidence, runtime failures, enforcement metrics, builder integration, and compatibility. |
| Backward compatibility | Complete | All existing tests pass: 60 enforcement policy, 31 shadow routing, 25 qualification resolver, 4 schema, 18 crew track run record, contract tests. |

## Pilot Track Selection

Selected: **None**. No companion Track satisfies all pilot requirements:

- **At least one current, valid `qualified` capability exists**: The only model qualification record with non-`candidate`/non-`screening` status is `llama3.2-local-weather-tool-selection-cli-promoted` (status `conditional`, resolves to `qualified`), which qualifies `llama3.2-local` for role `fast_worker`, track `hybrid-weather`. This is a Benchmark Lab track, not a companion server runtime track. All other model qualification records have status `candidate` or `screening`, resolving to `untested`.
- **Companion tracks with model steps**: `website_audit.lighthouse_handoff` (role `priority_helper`), `publishing.operator_log_discovery` (role `reasoning_worker`), `publishing.operator_log_draft` (role `default_worker`). None have qualified capabilities.
- **Sufficient shadow-routing evidence**: No shadow routing evidence exists for any companion track — enforcement has never been active.

**Decision:** Implement enforcement machinery with enforcement inactive. Document conditions for future pilot activation.

**Qualification records that would need to exist for a pilot:**
- A companion track (e.g., `website_audit.lighthouse_handoff` or `publishing.operator_log_discovery`) with model role having a `qualified` (or `conditional`) qualification record where record status is not `candidate`/`screening`.
- At least 3-5 shadow routing comparisons showing consistent recommendation agreement.

### Enforcement Gates

1. Track rollout state is `enforced`
2. Track is approved
3. recommendation is eligible
4. recommended capability is `qualified`
5. qualification is valid and current
6. score threshold passes (default 0.7)
7. runtime is available
8. model is ready
9. no override blocks it
10. executor compatibility passes
11. fallback is available

### Fallback Behavior

```txt
enforced capability → execution failure → known fallback (current/default) → existing selection
```

- No indefinite retry
- No unqualified fallback unless existing routing already permits it
- Failed enforced attempt recorded
- Fallback decision recorded
- Final executed capability recorded
- Original error preserved
- Qualification status not automatically modified

### How to Suspend Enforcement

`POST /enforcement/set` with `{"trackId": "...", "state": "suspended"}` immediately blocks enforcement without deleting evidence, approval history, or override data.

### How Enforced Decisions Appear in Evidence

Track Run Records include optional `routing.enforcementDecision` with:
- `state`, `eligible`, `attempted`, `applied`, `reason`
- `selectedCapabilityId` (original), `recommendedCapabilityId`, `executedCapabilityId` (final)
- `failedConditions` (what blocked enforcement)
- `fallbackTriggered`, `fallbackCapabilityId`, `fallbackSucceeded`, `originalError`
- `qualificationRecordId`

### Tracks Remaining Shadow-Only

All tracks. No track is configured for enforcement. All default to `shadow`.

## Next Slice

**Pilot Enforcement Validation and Multi-Model Track Expansion**

Activate enforcement for one qualified track once qualification evidence exists. Expand multi-model testing with runtime performance feedback. Add human correction records.


