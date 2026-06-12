# Agent Context

Rules for coding agents, documentation agents, and evaluation agents working on Locaily.

## Read First

1. [../00-start-here/README.md](../00-start-here/README.md)
2. [../00-start-here/current-vision.md](../00-start-here/current-vision.md)
3. [../00-start-here/project-index.md](../00-start-here/project-index.md)

## Non-Negotiables

### Naming

- **Do not assume the project name is final.** Locaily is the current umbrella vision; repo may still say Local AI Platform.
- Label renamed concepts as non-final in docs when appropriate.

### Claims and evidence

- **Do not claim benchmark results** unless measured data exists in repo or attached artifacts.
- **Do not default to bigger models** as the answer. Prefer roles, tracks, tools, validators.
- Label unvalidated ideas as **experimental**.

### Scope discipline

- **Do not overcomplicate** before the first workflow (Lighthouse Handoff) validates cleanly.
- Preserve **local-first** and **capability-first** thesis.
- Tool handlers return raw results; platform wraps envelopes—do not break contract.

### Documentation

- Document decisions in [../06-decisions/decision-log.md](../06-decisions/decision-log.md).
- Separate confirmed facts, assumptions, and open questions.
- Move stale planning docs to archive; do not delete useful history.

### Builder empathy

- Keep setup understandable for normal builders, not only ML experts.
- Prefer small diffs and existing conventions in `companion/`.

## Architecture Reminder

```txt
Locaily
├─ Local Brain      (companion server — implemented)
├─ NearbyNode       (conceptual)
├─ AI Pit Crew      (roles/tracks — partial)
└─ Lighthouse Handoff (first workflow)
```

Device = capability. Not every node needs a model.

## Code Truth Hierarchy

1. `companion/` implementation + tests
2. `docs/01-architecture/api-contract.md`
3. Current docs in `00`–`06` folders
4. `docs/99-archive/` (context only)

## Related Agent Docs

- [coding-agent-handoff.md](./coding-agent-handoff.md)
- [documentation-agent-rules.md](./documentation-agent-rules.md)
- [evaluation-agent-rules.md](./evaluation-agent-rules.md)
- [cleanup-rules.md](./cleanup-rules.md)
- [client-integration-guide.md](./client-integration-guide.md)
