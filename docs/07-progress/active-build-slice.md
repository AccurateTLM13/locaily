# Active Build Slice

## Objective

Make enforcement policy configuration durable across companion server restarts with safe operator workflows for state changes, approvals, revocation, suspension, restoration, overrides, inspection, auditing, and corrupt-policy recovery.

## Current Slice

Durable Enforcement Policy — **complete**.

**Status:** Enforcement policy configuration now persists across companion server restarts. Atomic persistence, strict state transition enforcement, append-only JSONL audit, corrupt-file recovery, and pure in-memory test mode implemented. All prior enforcement machinery unchanged. Enforcement remains disabled for all tracks. No pilot activated.

### Completed Scope Items

| Area | Status | Notes |
|---|---|---|
| Canonical policy document schema | Complete | `companion/schemas/internal/enforcement-policy.schema.json` — v1, `additionalProperties: false`, strict validation |
| Audit event schema | Complete | `companion/schemas/internal/enforcement-policy-audit-event.schema.json` — 10 event types, before/after, revision tracking |
| Audit module | Complete | `companion/core/enforcement-policy-audit.js` — JSONL append-only, schema-validated, normalize events |
| Durable policy store | Complete | `companion/core/enforcement-policy-store.js` — sync eager init from disk, async mutations, atomic writeFile+rename, state transition graph, compound approval/revocation, override CRUD, corrupt-file fallback with lock, pure in-memory mode |
| Backward-compatible wrapper | Complete | `companion/core/enforcement-policy.js` — delegates to store, sync legacy seeding via `syncApi`, configurable score threshold |
| Server integration | Complete | `companion/server.js` — `GET /enforcement/policy`, `POST /enforcement/revoke`, `POST /enforcement/override/clear`, explicit store init at startup with dataDir, existing endpoints updated with reason/updatedBy |
| Store automated tests | Complete | `scripts/test-enforcement-policy-store.js` — 123 tests covering loading, validation, persistence, state transitions, approval/revocation, overrides, audit, regression |
| Legacy policy tests | Complete | `scripts/test-enforcement-policy.js` — 62 tests, async-aware, backward compatible |
| Smoke tests | Complete | 56/56 checks pass including enforcement endpoints |
| Backward compatibility | Complete | All existing tests pass: 83 enforcement routing, 91 enforcement routing (updated), 62 enforcement policy, 31 shadow routing, 25 qualification resolver, contract, benchmark:test |

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

## Prior Slice (Guarded Qualification-Aware Routing Enforcement)

Prior slice implemented enforcement evaluation in the model router, enforcement decision in Track Run Records, fallback behavior, enforcement metrics in evidence review, pilot/decisions endpoints, safe state change enforcement, and 83 routing tests. All prior scope items remain operational and unchanged.


