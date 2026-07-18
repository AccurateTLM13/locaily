# Development Memory Events

Versioned contract for **Layer A — Source Evidence** in the [Development Memory Loop](./development-memory-loop.md).

Events record meaningful development state transitions. They are immutable after capture. They are not durable project memory until processed through candidates, review, and writeback.

**Schema:** [companion/schemas/development-memory-event.schema.json](../../companion/schemas/development-memory-event.schema.json)

## Event Shape

Required fields:

```json
{
  "eventId": "evt_20260718_abc123",
  "schemaVersion": "1.0",
  "project": "locaily",
  "eventType": "commit_created",
  "occurredAt": "2026-07-18T15:30:00.000Z",
  "capturedAt": "2026-07-18T15:30:01.000Z",
  "source": {
    "adapter": "git",
    "repository": "AccurateTLM13/locaily",
    "branch": "main",
    "commit": "abc123def456"
  },
  "summary": "Short factual description of what happened",
  "artifacts": [],
  "validation": {
    "sourceVerified": true,
    "status": "accepted"
  },
  "sensitivity": "internal",
  "correlation": {
    "runId": null,
    "objectiveId": null,
    "taskId": null,
    "sessionId": null
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `eventId` | yes | Collision-resistant ID; prefix `evt_` recommended |
| `schemaVersion` | yes | `"1.0"` for this contract |
| `project` | yes | Registered project slug |
| `eventType` | yes | Enum below; no arbitrary unversioned types |
| `occurredAt` | yes | When the transition happened (ISO-8601) |
| `capturedAt` | yes | When the adapter recorded it (ISO-8601) |
| `source` | yes | Adapter identity and source-specific metadata |
| `summary` | yes | Short factual description; no chain-of-thought |
| `artifacts` | yes | Array (may be empty); references to related files/records |
| `validation` | yes | Verification outcome at capture time |
| `sensitivity` | yes | `public`, `internal`, `restricted` |
| `correlation` | yes | Links to run, objective, task, session (nullable fields) |

### `source` Object

| Field | Required | Notes |
|-------|----------|-------|
| `adapter` | yes | `controller`, `supervisor`, `worker`, `git`, `track`, `workflow`, `job`, `human`, `memory` |
| Additional fields | adapter-specific | e.g. `repository`, `branch`, `commit` for git |

### `artifacts` Items

```json
{
  "kind": "file_path",
  "ref": "companion/memory/vault-adapter.js",
  "label": "Changed file path (metadata only)"
}
```

Allowed `kind` values: `file_path`, `commit_sha`, `record_id`, `url`, `manifest_path`. Do not store full patches or transcript bodies in artifacts by default.

### `validation` Object

| Field | Required | Values |
|-------|----------|--------|
| `sourceVerified` | yes | boolean |
| `status` | yes | `accepted`, `rejected`, `pending` |

### `correlation` Object

All fields optional (nullable). Used to rebuild sessions and trace provenance:

| Field | Typical source |
|-------|----------------|
| `runId` | Sequencer run-state, job id, track run record id |
| `objectiveId` | Active objective slug |
| `taskId` | Supervisor task id |
| `sessionId` | Session manifest id (DM4+) |

## Event Types (Initial Enum)

| `eventType` | Description |
|-------------|-------------|
| `commit_created` | Git commit recorded (metadata only; no full patch by default) |
| `pull_request_opened` | PR opened (when PR integration exists) |
| `pull_request_merged` | PR merged |
| `objective_started` | Milestone/objective activated |
| `objective_completed` | Milestone/objective completed successfully |
| `objective_blocked` | Milestone/objective blocked |
| `task_dispatched` | Task assigned to worker |
| `task_accepted` | Worker result accepted by supervisor |
| `task_rejected` | Worker result rejected |
| `test_completed` | Test suite or validation run finished |
| `decision_recorded` | Explicit human decision |
| `blocker_recorded` | Blocker declared |
| `release_created` | Release tag or publish event |
| `human_note` | Manual operator note |
| `memory_proposal_created` | Writeback or candidate proposal created |
| `memory_proposal_applied` | Accepted memory written to vault |
| `memory_proposal_rejected` | Proposal rejected in review |

Do not permit arbitrary unversioned event blobs. New types require schema version bump or documented enum extension.

## Mapping Event Types to Adapters (DM3)

| Adapter | Event types emitted |
|---------|---------------------|
| Controller (sequencer) | `objective_started`, `objective_completed`, `objective_blocked` |
| Supervisor | `task_dispatched`, `task_accepted`, `task_rejected`, `objective_blocked`, `objective_completed` |
| Worker | `task_dispatched` (started), `commit_created`, `test_completed`, `blocker_recorded` |
| Git | `commit_created` |
| Human | `decision_recorded`, `human_note`, `blocker_recorded` |
| Track / workflow | `test_completed` (optional product-run linkage) |
| Job store | `task_accepted`, `task_rejected` (review transitions) |
| Memory | `memory_proposal_*` |

## Sensitivity and Redaction

| `sensitivity` | Use when |
|---------------|----------|
| `public` | Safe to include in shared summaries (rare for dev events) |
| `internal` | Default for project development activity |
| `restricted` | Contains operational detail requiring extra care |

**Never persist in events (default capture policy):**

- API keys, tokens, passwords, connection strings
- Full environment variable dumps
- Complete terminal output or stack traces with secrets
- Full model prompts, completions, or chain-of-thought
- Full git patches (use diff stats and file paths only)
- Personal data unrelated to the project

Adapters must redact before `POST /memory/events` (DM2). Schema validation rejects documents with forbidden field names in a future hardening pass if needed.

## Integration Points

Where adapters emit events. **DM2 store, HTTP endpoints, and DM3 capture adapters are implemented.**

| Source | Events emitted | Integration file |
|--------|----------------|------------------|
| Sequencer | `objective_started`, `objective_completed`, `objective_blocked` | `.opencode/agents/controller/sequencer.js` |
| Supervisor | `task_dispatched`, `task_accepted`, `task_rejected`, `objective_completed`, `objective_blocked` | `.opencode/agents/controller/supervisor.js` |
| Worker (via supervisor) | `test_completed`, `blocker_recorded` | `reconcileAfterWorker` + worker result JSON |
| Git (via capture module) | `commit_created` | `companion/memory/events/capture/git-metadata.js` |
| Human CLI | `decision_recorded` | `scripts/memory-decision.js` |

### Controller / Sequencer

| File | Function | Lifecycle | Suggested `eventType` |
|------|----------|-----------|------------------------|
| `.opencode/agents/controller/sequencer.js` | `main` | Objective queued → activated | `objective_started` |
| same | `main` | Objective completed | `objective_completed` |
| same | `main` | Objective failed | `objective_blocked` |
| same | `restoreFromFailed` | Failed restored to queue | `objective_started` (with note) |
| `.opencode/agents/controller/invariants.js` | `markMilestoneComplete` / `markMilestoneFailed` | Milestone terminal state | `objective_completed` / `objective_blocked` |

### Supervisor

| File | Function | Lifecycle | Suggested `eventType` |
|------|----------|-----------|------------------------|
| `.opencode/agents/controller/supervisor.js` | `reconcileAfterPlan` | Task created | `task_dispatched` |
| same | `reconcileAfterWorker` | Worker finished | (internal; review follows) |
| same | `reconcileAfterReview` | Accepted | `task_accepted` |
| same | `reconcileAfterReview` | Rejected | `task_rejected` |
| same | status → `blocked` | Objective blocked | `objective_blocked` |

**Gap:** `invariants.recordAcceptedTask` exists but is **unused** in production path — wire in DM3.

### Worker

| File | Function | Lifecycle | Suggested `eventType` |
|------|----------|-----------|------------------------|
| Worker result artifacts | structured fields only | Implementation complete | `task_dispatched` / completion metadata |
| Git boundary checks | post-worker | Commit created | `commit_created` |

Do not store private chain-of-thought or full hidden reasoning.

### Git

| File | Function | Captured metadata |
|------|----------|-------------------|
| `.opencode/agents/controller/invariants.js` | `buildMilestoneManifest` | Commit count, changed file paths |
| `.opencode/agents/controller/supervisor.js` | git boundary helpers | SHA, branch, diff stats |

No PR API integration exists today; `pull_request_*` types reserved for future GitHub/local forge adapters.

### Track Runner / Workflow Runner

| File | Function | Notes |
|------|----------|-------|
| `companion/crew/orchestrator.js` | `runTrack` | Emits Track Run Records, not DM events — optional `test_completed` linkage only |
| `companion/orchestration/run-plan-executor.js` | `executeRunPlan` | Same pattern |

Product execution evidence ≠ development memory. Use TRR pattern as store/recorder reference for DM2, not as the same stream.

### Durable Jobs

| File | Function | Lifecycle | Suggested `eventType` |
|------|----------|-----------|------------------------|
| `companion/core/durable-job-store.js` | `reviewJob` | approve / reject / request_correction | `task_accepted` / `task_rejected` |

### Console

| File | Function | DM milestone |
|------|----------|--------------|
| `companion/console/controller.js` | `getStatus` | DM9 — capture health fields |
| same | validation runs | Optional `test_completed` |

### Human Decision (DM3)

New CLI or endpoint:

```bash
npm run memory:decision -- \
  --project locaily \
  --title "Keep proposal-only writeback as default" \
  --reason "Protect user-controlled memory"
```

Emits `decision_recorded`.

## Query Filters (DM2)

Proposed `GET /memory/events` filters:

- `project`
- `eventType`
- `from` / `to` (date range on `occurredAt`)
- `branch` (via `source.branch`)
- `objectiveId`, `taskId`, `runId`, `sessionId` (via `correlation`)

## Idempotency (DM2)

Duplicate submissions with the same deterministic `eventId` must be idempotent (no silent overwrites; return existing record).

## Related

- [development-memory-loop.md](./development-memory-loop.md)
- [../02-planning/development-memory-roadmap.md](../02-planning/development-memory-roadmap.md)
- [memory-bridge.md](./memory-bridge.md)
