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
| Store automated tests | Complete | `scripts/test-enforcement-policy-store.js` — 143 tests covering loading, validation, persistence, state transitions, approval/revocation, overrides, audit, regression, async enforcement gate, audit degradation |
| Legacy policy tests | Complete | `scripts/test-enforcement-policy.js` — 62 tests, async-aware, backward compatible |
| Smoke tests | Complete | 56/56 checks pass including enforcement endpoints |
| Backward compatibility | Complete | All existing tests pass: 143 store, 62 enforcement policy, 91 enforcement routing, 31 shadow routing, 25 qualification resolver, contract, benchmark:test |

## Pilot Track Selection

Selected: **None**. No companion Track satisfies all pilot requirements:

- **At least one current, valid `qualified` capability exists**: LFM2.5-1.2B-Thinking is now qualified for `website_audit.lighthouse_handoff` (role `priority_helper`, score 0.9167, status `qualified`). This is the first companion server runtime track with a qualified model capability.
- **Companion tracks with model steps**: `website_audit.lighthouse_handoff` (role `priority_helper` — now has qualified capability), `publishing.operator_log_discovery` (role `reasoning_worker`), `publishing.operator_log_draft` (role `default_worker`).
- **Sufficient shadow-routing evidence**: No shadow routing evidence exists for any companion track — enforcement has never been active. The first prerequisite (qualified capability) is now met, but 3-5 shadow routing comparisons must accumulate for `website_audit.lighthouse_handoff`/`priority_helper` before pilot activation.

**Decision:** First prerequisite (qualified capability for a companion track) is now met. The second prerequisite (sufficient shadow routing evidence) remains unfulfilled. Continue shadow routing accumulation.

**Qualification records that would need to exist for a pilot:**
- ✅ A companion track (`website_audit.lighthouse_handoff`) with model role (`priority_helper`) having a `qualified` qualification record where record status is not `candidate`/`screening`.
- ❌ At least 3-5 shadow routing comparisons showing consistent recommendation agreement — not yet accumulated.

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


