# Pit Crew Platform — Gap Analysis

Status: Phase 4 extraction complete (branch `cursor/pit-crew-platform-extraction-4150`)

## Summary

The repo contained a **proof-of-concept pit crew** embedded inside the `lighthouse-handoff` tool. The target architecture is a **four-layer platform** where `lighthouse_handoff` is one tool pack invoked by `ToolRouter` during a configured track.

## Layer mapping

| Diagram component | Before extraction | After extraction | Remaining gap |
|-------------------|-------------------|------------------|---------------|
| InputGate | `companion/core/input-gate.js` | Same | Large `raw_report` limits |
| Permissions | `companion/core/permissions.js` | Same | Pack-level permissions |
| AuditLog | `companion/core/audit-log.js` | Same | Per-step track events |
| ContextManager | `companion/core/context.js` | Step artifacts in orchestrator | Full ContextManager module |
| SessionJobManager | — | `companion/pit-crew/session-jobs.js` (in-memory) | Persistent jobs + status API |
| StatusReporter | — | — | **Future** |
| TrackOrchestrator | `companion/core/orchestrator.js` (LH-only) | `companion/pit-crew/orchestrator.js` | Track classifier |
| TaskDecomposer | Inline prompts | `tracks/*.track.json` | Multi-track catalog |
| ModelRouter | Callback in options | `companion/pit-crew/model-router.js` | Model Garage + feedback |
| ToolRouter | Registry only | `companion/pit-crew/tool-router.js` | CapabilityRegistry unify |
| OutputValidator | `result-validator.js` | Per-step in orchestrator | Full FallbackHandler |
| FallbackHandler | `retry_same_model_once` | Partial | Escalation ladder |
| Scoreboard | `scoreboard.js` | Same + track runs | Measured RAM, rubric |
| CapabilityRegistry | Partial registry | Tool packs via registry | Unified index |
| ModelGarage | All roles → llama3.2 | Role slots in track JSON | Evaluation harness |
| lighthouse_handoff | Tool + embedded orchestrator | Tool pack `compose-handoff` step | — |
| NearbyNodes | — | — | Stubs planned |

## Flow (resolved)

```txt
POST /tracks/run → SessionJobManager → TrackOrchestrator (companion/pit-crew/)
  → TaskDecomposer(track_id)
  → per step: ModelRouter | ToolRouter
  → lighthouse_handoff invoked only at write_handoff step

POST /tasks/run (lighthouse-handoff, orchestrated) → same pit-crew runner (backward compat)
```

## Proof track: `website_audit.lighthouse_handoff`

| Step | Executor | Status |
|------|----------|--------|
| extract_metrics | `lighthouse.parse` (deterministic) | Done |
| classify_issues | `fast_worker` model | Done |
| prioritize_fixes | `reasoning_worker` model | Done |
| match_fixes | `lighthouse.match_fixes` (deterministic) | Done |
| write_handoff | `lighthouse-handoff` `compose-handoff` | Done |
| verify_output | `lighthouse.verify_handoff` checker | Done |

## API status

| Endpoint | Status |
|----------|--------|
| `POST /tasks/run` | Exists — single-tool clients |
| `POST /tracks/run` | **Implemented** — platform entry |
| `GET /tracks` | **Implemented** — track catalog |
| `GET /jobs/{id}/status` | Future |
| `GET /scoreboard` | Exists |

## Success criteria (milestone)

- [x] `POST /tracks/run` executes lighthouse proof track on mock provider
- [x] `extract_metrics` uses deterministic `lighthouse.parse`
- [x] `write_handoff` invokes `lighthouse-handoff` via ToolRouter
- [x] `/tasks/run` orchestrated mode uses same pit-crew runner
- [x] Smoke tests pass (30/30 including `/tracks/run`)

## Next gaps (post-merge)

- Model Garage evaluation harness (Phase 2)
- FallbackHandler escalation ladder
- Track catalog: DealSniper, repo review
- `GET /jobs/{id}/status` for SessionJobManager
- Align live architecture docs with `companion/pit-crew/` (see `orchestration-flow.md`, `ai-pit-crew.md`)

## Related docs

- [`ai-pit-crew.md`](ai-pit-crew.md)
- [`orchestration-flow.md`](orchestration-flow.md)
- [`api-contract.md`](api-contract.md)
