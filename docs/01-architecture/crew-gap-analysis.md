# The Crew Implementation Gap Analysis

> **Historical note:** This analysis was originally written during the "AI Pit Crew" extraction phase (branch `cursor/pit-crew-platform-extraction-4150`). The underlying code path was `companion/pit-crew/` and has since been renamed to `companion/crew/`. The public name is **The Crew**.

## Summary

The repo contained a **proof-of-concept Crew runner** embedded inside the `lighthouse-handoff` tool. The target architecture is a platform where Tracks declare required Crew roles and the Local Brain assembles and executes them.

## Layer mapping

| Diagram component | Current location | Remaining gap |
|-------------------|------------------|---------------|
| InputGate | `companion/core/input-gate.js` | Large `raw_report` limits |
| Permissions | `companion/core/permissions.js` | Pack-level permissions |
| AuditLog | `companion/core/audit-log.js` | Per-step track events |
| ContextManager | `companion/core/context.js` | Full ContextManager module |
| SessionJobManager | `companion/crew/session-jobs.js` (in-memory) | Persistent jobs + status API |
| StatusReporter | — | Not implemented |
| TrackOrchestrator | `companion/crew/orchestrator.js` | Track classifier |
| TaskDecomposer | `tracks/*.track.json` | Multi-track catalog (partial — 2 tracks exist) |
| ModelRouter | `companion/crew/model-router.js` | Model Garage + feedback |
| ToolRouter | `companion/crew/tool-router.js` | CapabilityRegistry unify |
| OutputValidator | `result-validator.js` + per-step in orchestrator | Full FallbackHandler |
| FallbackHandler | `retry_same_model_once` | Escalation ladder |
| Scoreboard | `scoreboard.js` + track runs | Measured RAM, rubric |
| CapabilityRegistry | Tool packs via registry | Unified index |
| ModelGarage | Role slots in track JSON + Benchmark Lab qualification records | Evaluation-to-routing bridge |
| lighthouse_handoff | Tool pack `compose-handoff` step | — |
| Relay Nodes | — | Not implemented |

## Flow (resolved)

```txt
POST /tracks/run → SessionJobManager → TrackOrchestrator (companion/crew/)
  → TaskDecomposer(track_id)
  → per step: ModelRouter | ToolRouter
  → lighthouse_handoff invoked only at write_handoff step

POST /tasks/run (lighthouse-handoff, orchestrated) → same Crew runner (backward compat)
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
| `POST /tracks/run` | Implemented — platform entry |
| `GET /tracks` | Implemented — track catalog |
| `GET /orchestration/tracks` | Implemented — enriched track metadata |
| `GET /orchestration/workflows` | Implemented — workflow→track mapping |
| `POST /workflows/plan` | Implemented — dry-run plan |
| `POST /workflows/run` | Implemented — plan + execute |
| `GET /jobs/{id}/status` | Future |
| `GET /scoreboard` | Exists |

## Success criteria (milestone)

- [x] `POST /tracks/run` executes lighthouse proof track on mock provider
- [x] `extract_metrics` uses deterministic `lighthouse.parse`
- [x] `write_handoff` invokes `lighthouse-handoff` via ToolRouter
- [x] `/tasks/run` orchestrated mode uses same Crew runner
- [x] Smoke tests pass (30/30 including `/tracks/run`)

## Remaining gaps

- Free-form automatic Track selection (no classifier selects workflow + track)
- Dynamic Crew assembly beyond registered Track contracts
- Full fallback escalation ladder (currently retry_same_model_once only)
- Distributed Relay Node execution (not started)
- DAG execution (steps run in file order only)
- Broad evidence-backed qualification coverage (Benchmark Lab M1 is complete, but broader model/track/hardware coverage remains incremental)
- Automated learning from Track Run Records (Canonical Track Run Records is the active build slice, not completed)
- Persistent `GET /jobs/{id}/status` for SessionJobManager
- Model Garage evaluation harness (Phase 2 — spec only until evidence)

## Related docs

- [`crew.md`](crew.md) — The Crew strategy (formerly AI Pit Crew)
- **[`../02-track-system/README.md`](../02-track-system/README.md)** — Track registry, core tracks, step input mapping (primary track docs)
- [`orchestration-flow.md`](orchestration-flow.md) — Request flow
- [`api-contract.md`](api-contract.md)
