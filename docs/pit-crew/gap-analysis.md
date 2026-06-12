# Pit Crew Platform — Gap Analysis

Status: Phase 4 extraction (complete); Model Suitability Profiles (complete); Model Garage (complete)

## Summary

The repo contains a **proof-of-concept pit crew** embedded inside the `lighthouse-handoff` tool. The target architecture is a **four-layer platform** where `lighthouse_handoff` is one tool pack invoked by `ToolRouter` during a configured track.

## Layer mapping

| Diagram component | Before extraction | Target | Gap |
|-------------------|-------------------|--------|-----|
| InputGate | `companion/core/input-gate.js` | Same | Minor — large raw_report limits |
| Permissions | `companion/core/permissions.js` | Same | Pack-level permissions |
| AuditLog | `companion/core/audit-log.js` | Per-step track events | Extend event shape |
| ContextManager | `companion/core/context.js` | Step artifact accumulation | **New module** |
| SessionJobManager | — | Job create/run/status | **New module** |
| StatusReporter | — | Progress to clients | **New module** |
| TrackOrchestrator | `companion/core/orchestrator.js` (LH-only) | `companion/pit-crew/orchestrator.js` | **Extract + generalize** |
| TaskDecomposer | Inline prompts | `tracks/*.track.json` | **Extract** |
| ModelRouter | `model-roles.js` via options callback | Dedicated router + garage | **Done** (`pit-crew/model-router.js`) |
| ToolRouter | `registry.js` only | Step → tool invocation | **New module** |
| OutputValidator | `result-validator.js` | Per-step + final | **Extend** |
| FallbackHandler | `retry_same_model_once` only | Full escalation ladder | **Future** |
| Scoreboard | `scoreboard.js` + GET /scoreboard | Measured metrics + feedback | **Extend** |
| CapabilityRegistry | Partial registry | Unified index | **Future** |
| ModelGarage | All roles → llama3.2 | Slot-based candidates | **Done** (`core/model-garage.js`) |
| lighthouse_handoff | Tool + embedded orchestrator | Tool pack step only | **This extraction** |
| NearbyNodes | — | Stubs | **Future** |

## Flow gap

```txt
BEFORE:
  POST /tasks/run → lighthouse-handoff.handle()
    → executeLighthouseHandoffTrack() [inline LLM prompts, 5 steps]

AFTER (target):
  POST /tracks/run → SessionJobManager → TrackOrchestrator
    → TaskDecomposer(track_id)
    → per step: ModelRouter | ToolRouter
    → lighthouse_handoff invoked only at write_handoff step

INTERIM (this milestone):
  Both paths supported. /tracks/run is canonical for platform.
  /tasks/run orchestrated mode delegates to same pit-crew runner.
```

## Proof track step gaps

| Step | Prototype | Target executor | Extraction action |
|------|-----------|-----------------|-------------------|
| extract_metrics | LLM (fast_worker) | `lighthouse.parse` tool (deterministic) | **Add parser pack** |
| classify_issues | LLM inline | ModelRouter + fast_worker | Move to track JSON |
| prioritize_fixes | LLM inline | ModelRouter + reasoning_worker | Move to track JSON |
| match_fixes | Missing | `lighthouse.match_fixes` tool | **Add deterministic KB** |
| write_handoff | LLM inline | `lighthouse-handoff` compose-handoff | **Add tool task** |
| verify_output | validateResult only | `lighthouse.verify_handoff` checker | **Add checker tool** |

## API gaps

| Endpoint | Status |
|----------|--------|
| POST /tasks/run | Exists — keep for single-tool clients |
| POST /tracks/run | **Adding** — platform entry |
| GET /tracks | **Adding** — track catalog |
| GET /jobs/{id}/status | Future — SessionJobManager |
| GET /scoreboard | Exists |

## Non-goals for this milestone

- Full FallbackHandler escalation ladder
- Track Classifier for multi-track auto-routing
- NearbyNodes execution
- Markdown-only output without JSON handoff schema

## Success criteria (this milestone)

- [x] `POST /tracks/run` executes lighthouse proof track end-to-end on mock provider
- [x] `extract_metrics` uses deterministic parser tool (`lighthouse.parse`, no LLM)
- [x] `write_handoff` invokes `lighthouse-handoff` `compose-handoff` task via ToolRouter
- [x] `lighthouse-handoff` orchestrated mode uses same pit-crew runner (no duplicate inline logic)
- [x] Smoke tests pass including new `/tracks/run` check
- [x] Model suitability profiles (`GET/POST /models/profiles`) with role suitability metadata
- [x] Model garage with auto switching policies and `GET/POST /models/garage/evaluate`
- [x] Gap doc reflects completed items
