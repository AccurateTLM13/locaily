# Development Memory Roadmap

Milestone plan for the **Development Memory Loop** — extending [Memory Bridge](../01-architecture/memory-bridge.md) with trustworthy development capture, review, and retrieval.

**Do not attempt the entire system as one objective.** Execute in order DM1 → DM10.

## Relationship to Other Locaily Work

| System | Relationship |
|--------|--------------|
| Memory Bridge v0/v1 | Foundation — extend, do not replace |
| Track Learning Evidence Loop | Separate — Track Run Records are product execution evidence, not vault development memory |
| Benchmark Lab | No direct dependency; qualification data may appear in events optionally |
| Active build slices | DM work requires explicit objective; do not start DM2+ without handoff |

## Milestone Overview

```txt
DM1  Contracts and audit          ← complete (contracts only)
DM2  Immutable event store
DM3  Capture adapters
DM4  Session aggregation
DM5  Knowledge candidate extraction
DM6  Review inbox
DM7  Project memory maintainer
DM8  Retrieval integration
DM9  Continuous controlled processing
DM10 Multi-project setup
```

DM1–DM4: trustworthy capture foundation.  
DM5–DM7: learning and maintenance loop.  
DM8: operational retrieval.  
DM9: continuous but controlled.  
DM10: reusable capability beyond Locaily-only.

---

## DM1 — Current-State Audit and Contracts

**Status:** Complete (contracts only; no capture implementation).

### Goal

Document Memory Bridge as implemented; define Development Memory Loop contracts before automation.

### Deliverables

- [development-memory-loop.md](../01-architecture/development-memory-loop.md)
- [development-memory-events.md](../01-architecture/development-memory-events.md)
- This roadmap
- `companion/schemas/development-memory-*.schema.json` (four schemas)
- Fixtures + `scripts/test-development-memory-schemas.js`

### Completion Conditions

- Every schema validates good and bad fixtures
- Existing Memory Bridge behavior unchanged
- No capture mechanism implemented
- Docs distinguish events, candidates, proposals, durable memory
- Privacy and provenance rules explicit

### Stop Conditions

Stop and report blocker when existing memory behavior contradicts contracts irreconcilably, required event sources cannot be identified, implementation would require storing secrets/transcripts by default, or canonical schema directory is unknown.

**Resolution:** Schema directory is `companion/schemas/`. Event sources documented in development-memory-events.md. Drift documented as known debt.

---

## DM2 — Immutable Development Event Store

### Goal

Durable append-only event store for trustworthy development evidence.

### Required Work

1. Implement event recorder under `companion/memory/events/`
2. Atomic file writes; validate against `development-memory-event.schema.json`
3. Deterministic or collision-resistant event IDs; prevent silent overwrites
4. Safe metadata-only audit entries; retention configuration
5. Query by project, eventType, date range, branch, objectiveId, taskId, runId
6. Redact sensitive fields before persistence; recover from interrupted writes

### Proposed Endpoints

- `POST /memory/events` (permission-gated; trusted local adapters)
- `GET /memory/events`
- `GET /memory/events/:eventId`

### Completion Conditions

Valid events persist; invalid rejected; duplicates idempotent; queries work; memory smoke tests pass; no secrets in records or audit.

### Non-Goals

No AI summarization, no automatic vault updates, no GitHub cloud dependency, no background filesystem surveillance.

---

## DM3 — Capture Adapters

### Goal

Capture meaningful activity from Locaily development and autonomous execution systems.

### Initial Adapters

| Adapter | Emits when |
|---------|------------|
| Controller | milestone queued/activated/completed/blocked; run resumed/terminated |
| Supervisor | task created; worker accepted/rejected; correction requested |
| Worker | implementation started/completed; validation completed; commit; blocker |
| Git | commit SHA, branch, author, timestamp, changed paths, message, diff stats (no full patches) |
| Human decision | CLI/endpoint for explicit decisions |

### Completion Conditions

Schema-valid events; capture failures non-fatal; retries visible; correlation links milestones/tasks/commits; no full conversations by default.

---

## DM4 — Session Aggregation

**Status:** Complete (2026-07-18)

### Goal

Group related events into development sessions with immutable manifests.

### Implemented

- `companion/memory/events/session-store.js`, `session-summary.js`, `session-manager.js`
- Manifests at `data/memory/development-sessions/manifests/` with `active-session.json` pointer
- Deterministic factual summaries from linked events (no model)
- Interrupted-session recovery via orphaned open manifests
- Sequencer auto start/close; capture stamps active `sessionId`

### Commands

```bash
npm run memory:session:start
npm run memory:session:status
npm run memory:session:close
npm run memory:session:rebuild
```

### Completion Conditions

Sessions rebuild from events; every manifest statement links to event IDs; closing never deletes events.

---

## DM5 — Knowledge Candidate Extraction

**Status:** Complete (2026-07-18)

### Goal

Convert session evidence into reviewable knowledge candidates.

### Implemented

- `companion/memory/events/candidate-{extractor,analysis,store,manager}.js`
- Deterministic event-type mapping to candidate types and suggested vault paths
- Duplicate detection and contradiction surfacing in extraction reports
- CLI: `memory:candidates:extract|list|status`

### Completion Conditions

Deterministic extraction works without Ollama; every candidate traceable to evidence; duplicates and contradictions surfaced.

---

## DM6 — Memory Review Inbox

**Status:** Complete (2026-07-18)

### Goal

Human gate for important memory updates before durable vault changes.

### Implemented

- Review records at `data/memory/development-candidates/reviews/`
- Actions: approve, edit_approve, reject, defer, merge
- Approve flow writes `proposal_only` writeback proposals with evidence links
- API: `/memory/candidates/review*`
- CLI: `memory:candidates:review*`
- Pending counts in `/console/status`

### Writeback policy resolution

Development memory candidates **never auto-apply**, even when `memoryBridge.allowApply` or `writebackMode: "apply"` is enabled globally. Review approval always creates a writeback inbox proposal for human follow-up.

---

## DM7 — Project Memory Maintainer

**Status:** Complete (2026-07-18)

### Goal

Maintain canonical project pages from accepted evidence without vault landfill.

### Implemented

- `companion/memory/events/maintainer-{drift,planner,store,manager}.js`
- Drift detection against canonical project vault pages
- Plan-only runs by default; explicit opt-in for low-risk apply
- Rollback manifests before apply
- API/CLI: `memory:maintainer:*`

### Completion Conditions

No double-apply in planning; stale/drift detectable; rollback manifest per application.

---

## DM8 — Retrieval Integration

### Goal

Make accepted project knowledge useful during future Locaily work.

### Required Work

Project-aware Context Pack requests; context budget; prefer canonical files over raw logs; `filesUsed` and evidence references; stale/contradiction warnings.

**Principle:** Retrieve what the task needs. Do not load the entire brain.

---

## DM9 — Continuous but Controlled Capture

### Goal

Keep Local Brain current during ongoing development without manual session maintenance every time.

### Proposed Status Fields

`captureEnabled`, `lastEventAt`, `unprocessedEvents`, `openSessions`, `pendingCandidates`, `pendingHumanReview`, `lastSuccessfulWritebackAt`, `warnings`

### Completion Conditions

Background processing never blocks core execution; capture lag visible; restart-safe; idempotent processing; pause capture without disabling retrieval.

---

## DM10 — Multi-Project Local Brain Template

### Goal

Same system for Locaily or any other project.

### Required Work

Project registration; per-project capture policies and allowlists; guided setup; starter vault; repository identity; cross-project isolation; import; health report; backup/migration docs.

### Setup Flow

Register project → choose vault → select workspace → choose capture sources → review privacy → generate starter files → validate → enable capture.

---

## Validation Strategy (All Milestones)

Each milestone includes where applicable:

- Unit tests, schema fixture tests, integration tests
- Permission tests, path traversal tests, secret-redaction tests
- Idempotency tests, interrupted-write recovery tests
- Memory-disabled tests, rollback tests

### End-to-End Proof Scenario (Post DM8)

1. Start development session  
2. Begin objective  
3. Complete two tasks  
4. Run tests  
5. Create commit  
6. Close session  
7. Generate knowledge candidates  
8. Review candidates  
9. Apply accepted memory  
10. Start new task  
11. Retrieve Context Pack  
12. Confirm new task receives accepted status, decision, and lesson  

Proof passes only when every durable claim traces to source evidence.

## Recommended Next Step

**DM2** — Immutable Development Event Store. Objective file: `.opencode/agents/objectives/queue/dm2-immutable-event-store.md`

## Related

- [development-memory-loop.md](../01-architecture/development-memory-loop.md)
- [development-memory-events.md](../01-architecture/development-memory-events.md)
