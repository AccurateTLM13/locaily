# Development Memory Loop

**Working name:** Development Memory Loop (internal). Also acceptable: Project Learning Loop, Repository Memory Loop, Continuous Knowledge Capture, Local Brain Development Capture.

**Status:** Contracts defined (DM1). Capture automation not yet implemented.

## What It Is

The **Development Memory Loop** extends [Memory Bridge](./memory-bridge.md) so that development activity can be captured, processed, reviewed, and converted into durable project knowledge. The Local Brain grows useful context while Locaily—or another connected project—is being developed.

This is **system learning**, not model-weight training. The system improves because stored context, decisions, project state, lessons, and retrieval quality improve over time.

Do not introduce a new public product or top-level architecture layer. Document and implement this as a Memory Bridge extension.

## Relationship to Memory Bridge

```txt
Development Activity
        ↓
Capture Adapters (DM3+)
        ↓
Immutable Event Records (DM2+)
        ↓
Session / Change Aggregation (DM4+)
        ↓
Knowledge Candidate Extraction (DM5+)
        ↓
Validation and Deduplication
        ↓
Review Policy (DM6+)
        ↓
Memory Writeback (existing propose/apply)
        ↓
Retrievable Project Context (existing Context Packs, DM8+)
```

Memory Bridge v0/v1 remains the foundation:

| Existing capability | Path | Role in loop |
|---------------------|------|--------------|
| Vault adapter | `companion/memory/vault-adapter.js` | Durable memory storage |
| Context packs | `companion/memory/context-pack-builder.js` | Retrieval (DM8 integrated)
| Writeback propose | `companion/memory/writeback-proposal.js` | Human-reviewed proposals |
| Writeback apply | vault adapter + server | Opt-in vault updates |
| Search | vault adapter + server | Allowlisted keyword search |
| Audit redaction | `companion/memory/audit-redaction.js` | Privacy on memory ops |

## Three Layers (Do Not Collapse)

| Layer | Name | What it holds | Mutability |
|-------|------|---------------|------------|
| **A** | Source Evidence | What actually happened (commits, task results, decisions, test outcomes) | Immutable after capture |
| **B** | Knowledge Candidates | What the system believes may be worth remembering | Proposals until validated |
| **C** | Durable Memory | Reviewed, accepted knowledge in the vault | Updated only through review policy |

**Event** → Layer A. **Candidate** → Layer B. **Vault pages** (via writeback) → Layer C.

Do not collapse these into one log.

## Terminology

| Term | Definition |
|------|------------|
| **Event** | Versioned, immutable record of a meaningful development state transition. Schema: `development-memory-event.schema.json`. |
| **Session** | Correlated group of events representing one bounded work period (milestone run, coding session, PR cycle). Schema: `development-memory-session.schema.json`. |
| **Knowledge candidate** | Structured proposal that a statement should become durable memory, with evidence links. Schema: `development-memory-candidate.schema.json`. |
| **Proposal** | Existing Memory Bridge writeback inbox artifact (`POST /memory/writeback/propose`). May originate from an accepted candidate (DM6+). |
| **Durable memory** | Allowlisted Markdown pages in the user vault after human review and optional apply. |
| **Capture policy** | Configurable rules for what is worth recording and how writeback is gated. Schema: `development-memory-capture-policy.schema.json`. Target path: `{vault}/.memory-bridge/capture-policy.json` (DM2+). |

## Distinction from Track Learning Evidence Loop

| Aspect | Track Run Records | Development Memory Loop |
|--------|-------------------|-------------------------|
| Purpose | Product execution evidence (tracks, workflows, qualifications) | Project development knowledge (decisions, status, lessons) |
| Storage | `data/evidence/track-run-records/` | Vault + event store (`companion/memory/events/`, DM2+) |
| Retrieval | Qualification, enforcement, audit | Context Packs, project pages |
| Audience | Benchmark Lab, operator, routing | Future tasks, agents, humans |

Track Run Records may **inform** development events (e.g. test_completed) but are not substitutes for vault memory.

## Capability Matrix (DM1 Audit)

| Capability | Status | Notes |
|------------|--------|-------|
| Local Markdown vault adapter | **Implemented** | `companion/memory/vault-adapter.js` |
| Allowlist + blocked-path reads | **Implemented** | `blockedPaths` override `allowedPaths` |
| `GET /memory/status` | **Implemented** | No absolute vault path in response |
| `POST /memory/context-pack` | **Implemented** | Schema: `context-pack.schema.json` |
| `POST /memory/writeback/propose` | **Implemented** | Inbox only; `requiresHumanReview: true` enforced |
| `POST /memory/search` | **Implemented** | v1; no request/response schema yet |
| `POST /memory/writeback/apply` | **Implemented** | Opt-in; gated by permission + `allowApply` |
| Audit redaction (memory) | **Implemented** | Pack/propose metadata only in audit |
| Lighthouse memory preflight | **Implemented** | `companion/memory/preflight.js` |
| Flat + wiki vault layouts | **Implemented** | Templates under `templates/memory-vault/` |
| Project-aware vault layout | **Documented only** | Recommended structure below; not enforced |
| Development event store | **Implemented** | DM2 — `companion/memory/events/`, `data/memory/development-events/` |
| `POST /memory/events` | **Implemented** | Schema validation, secret rejection, idempotent append |
| `GET /memory/events` | **Implemented** | Query filters; requires `memory.read` |
| `GET /memory/events/:eventId` | **Implemented** | Single event fetch |
| Capture adapters | **Implemented** | DM3 — sequencer, supervisor, git, human CLI |
| Session aggregation | **Implemented** | DM4 — manifests, CLI, sequencer wiring, rebuild/recovery |
| Knowledge candidate extraction | **Implemented** | DM5 — deterministic rules, store, CLI, duplicate/contradiction reports |
| Candidate review inbox | **Implemented** | DM6 — review records, proposal-only approve flow, API/CLI, console counts |
| Project memory maintainer | **Implemented** | DM7 — drift detection, plan/apply CLI, rollback snapshots |
| Project-aware Context Packs | **Implemented** | DM8 — canonical pages, evidence refs, stale/contradiction warnings |
| Continuous capture processing | **Implemented** | DM9 — background processor, pause/resume, status API |
| Candidate review inbox UI | **Partial** | DM6 review flow implemented; candidate-specific console UI deferred |
| Multi-project registration | **Implemented** | DM10 — project registry, namespaced storage, setup flow, health reports |
| Embeddings / vector search | **Missing** | Explicitly out of scope |
| Raw transcript capture | **Missing** | Prohibited by default in capture policy |

## Known Documentation / Code Drift (Not Fixed in DM1)

These are recorded as **known debt**. DM1 defines additive contracts only; behavior changes are deferred.

1. **`memory-writeback.md` vs code** — Doc says apply is "deferred until proposal flow is trusted"; v1 apply is implemented and gated. See [memory-bridge.md](./memory-bridge.md) v1 section for current behavior.
2. **`writebackMode` tension** — Propose requires `writebackMode === "proposal_only"`. Apply enables when `allowApply` or `writebackMode === "apply"`. Setting mode to `"apply"` breaks propose. Dual-gate semantics need DM6 design.
3. **Apply does not load inbox by `proposalId`** — Apply re-renders proposal Markdown from request body + `targetPath`; inbox files are write-only artifacts until a human copies or a future flow loads them.
4. **`memory.read` permission** — Listed in approved permissions but not enforced on status, context-pack, or search endpoints.
5. **`api-reference.md` body shapes** — Some examples show `{ targetPath, content, reason }` for propose/apply; actual propose uses taskId/project/task arrays per `memory-writeback.schema.json`.
6. **Committed `config.json` vs server defaults** — Server defaults may approve `memory.writeback.apply`; committed config may not. Operators must align permissions explicitly.
7. **Search/apply audit redaction** — Less explicit than context-pack/propose; snippets and `writtenPath` may appear in audit unless extended in a future milestone.

## Trust Boundaries

Extend existing Memory Bridge rules:

1. **Localhost companion** — Vault path user-configured only; bind to localhost by default.
2. **Allowlisted reads** — Only `.md` under configured paths; traversal blocked.
3. **Blocked paths win** — `raw/`, `private/`, `personal/`, `.git/`, writeback inbox blocked from reads.
4. **No secrets by default** — Capture policy defaults prohibit credentials, env values, tokens, full command output, model transcripts.
5. **Immutable evidence** — Source events are append-only; never mutate evidence to clean summaries.
6. **Human ownership** — User owns vault, capture settings, review policy, applied knowledge, retention.
7. **Provenance required** — Every durable statement traceable to event, accepted proposal, human note, or approved external source.
8. **Audit redaction** — Memory audit events exclude excerpts, proposal bodies, vault paths (existing behavior preserved).

## Safe Defaults

| Setting | Default |
|---------|---------|
| Memory retrieval | Enabled after vault setup |
| Development capture | **Opt-in** (`capture.enabled: false` until operator enables) |
| Raw transcript capture | **Disabled** |
| Terminal output capture | **Disabled** |
| Working tree surveillance | **Disabled** |
| Automatic high-risk writeback | **Disabled** |
| Secrets capture | **Prohibited** |
| Cross-project retrieval | **Disabled** |
| Writeback mode | `review` (human gate for high-risk candidate types) |

## Recommended Project-Aware Vault Layout (Optional)

The implementation must not assume every vault uses this layout. Paths remain configurable and allowlisted.

```txt
index.md
log.md
projects/
  locaily/
    PROJECT.md
    STATUS.md
    DECISIONS.md
    BLOCKERS.md
    ARCHITECTURE.md
    OPERATING-RULES.md
    LESSONS.md
    RESUME.md
    updates/
      2026-07-17-development-session.md
    evidence/
      events/
      sessions/
      manifests/
topics/
entities/
.memory-bridge/
  config.json
  capture-policy.json
  writeback-inbox/
  applied/
  rejected/
  checkpoints/
```

Flat starter template remains valid: [templates/memory-vault/](../../templates/memory-vault/README.md).

**Implemented in DM2** (not proposed only):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/memory/events` | Append validated development event (`memory.events.write`) |
| GET | `/memory/events` | Query events by filters (`memory.read`) |
| GET | `/memory/events/:eventId` | Fetch single event (`memory.read`) |

**Implemented in DM9** (continuous capture):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/memory/capture/status` | Capture lag/backlog, review counts, worker status (`memory.read`) |
| POST | `/memory/capture/pause` | Pause event capture without disabling retrieval (`memory.capture.control`) |
| POST | `/memory/capture/resume` | Resume paused capture (`memory.capture.control`) |
| POST | `/memory/capture/process` | Manual one-shot processor tick (`memory.capture.control`) |

## Compatibility with Existing Endpoints

DM1 added **no new routes**. DM2 added the three event routes above. Existing endpoints unchanged:

| Method | Path | DM1 impact |
|--------|------|------------|
| GET | `/memory/status` | None |
| POST | `/memory/context-pack` | None |
| POST | `/memory/writeback/propose` | None |
| POST | `/memory/search` | None |
| POST | `/memory/writeback/apply` | None |

## Schemas (DM1)

| Schema | Path | Runtime enforcement |
|--------|------|---------------------|
| Development event | [companion/schemas/development-memory-event.schema.json](../../companion/schemas/development-memory-event.schema.json) | **Runtime-enforced at append** — `appendEvent()` in `companion/memory/events/event-store.js` |
| Knowledge candidate | [companion/schemas/development-memory-candidate.schema.json](../../companion/schemas/development-memory-candidate.schema.json) | Implemented (DM5) |
| Candidate review record | [companion/schemas/development-memory-candidate-review.schema.json](../../companion/schemas/development-memory-candidate-review.schema.json) | Implemented (DM6) |
| Session manifest | [companion/schemas/development-memory-session.schema.json](../../companion/schemas/development-memory-session.schema.json) | Implemented (DM4) |
| Capture policy | [companion/schemas/development-memory-capture-policy.schema.json](../../companion/schemas/development-memory-capture-policy.schema.json) | Implemented (DM9) — loaded by capture processor and gate |

Fixtures: `companion/schemas/fixtures/development-memory/`. Tests: `scripts/test-development-memory-schemas.js`, `scripts/test-development-memory-events.js`.

## Privacy and Provenance Rules

### Privacy

- Never store secrets, environment values, credentials, personal tokens, or full command output without explicit capture policy override (not recommended).
- Never enable raw model transcript capture by default.
- Redact sensitive fields before event persistence (DM2).
- Context Packs remain bounded; do not dump entire vault files (existing rule).

### Provenance

- Every knowledge candidate must list `evidenceEventIds`.
- Every applied vault change must link to proposal and evidence (DM6+).
- Session summaries must link statements to event IDs (DM4+).
- Reject candidates with no evidence, unsupported claims, or contradictions with accepted memory (DM5+).

## Agent Execution Rules

1. **Preserve evidence** — Never mutate or delete source events to make summaries cleaner.
2. **No hidden learning claims** — Do not claim models train themselves or gain weights.
3. **No transcript vacuum** — Capture by explicit policy only.
4. **Deterministic first** — Git facts, test pass/fail, milestone state from structured data; models for classification/summarization only with evidence.
5. **Human ownership** — User controls vault, capture, review, and deletion.

## Related

- [development-memory-events.md](./development-memory-events.md) — Event contract and integration points
- [../02-planning/development-memory-roadmap.md](../02-planning/development-memory-roadmap.md) — DM1–DM10 milestones
- [memory-bridge.md](./memory-bridge.md)
- [context-packs.md](./context-packs.md)
- [memory-writeback.md](./memory-writeback.md)
