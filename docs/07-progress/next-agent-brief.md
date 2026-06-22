# Next Agent Brief

Hand this to Cursor, Claude, Codex, or any coding agent continuing Locaily work.

**Updated:** 2026-06-15

## Read First

1. [../00-start-here/current-state.md](../00-start-here/current-state.md)
2. [../02-track-system/README.md](../02-track-system/README.md)
3. [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md)
4. [../07-progress/build-status.md](./build-status.md)

Also: root [AGENTS.md](../../AGENTS.md) and [../08-agents/agent-context.md](../08-agents/agent-context.md)

## Do Not

- Replace the current server or break existing endpoints
- Break `POST /tasks/run` or `POST /tracks/run` response envelopes
- Claim DAG support, NearbyNode, or automatic track classification exists
- Add NearbyNode implementation without an explicit milestone decision
- Make model benchmark claims without evidence in [../04-validation/](../04-validation/)
- Add new hardcoded step-id branches in `step-input.js` legacy fallbacks

## Current Task

**Milestone 5 candidate:** Remove legacy step-input fallbacks in `companion/pit-crew/step-input.js` now that both catalog tracks declare `input_map` on every step.

**M5 follow-up (non-blocking):** Improve `workflow-orchestrator` audit summaries so `GET /audit` can expose step-level orchestration status without leaking raw task input/output. Current audit normalization stores events under the correct `tool` but summarizes away step detail.

See [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md) and [milestone-map.md](./milestone-map.md).

## Architecture Reminder

```txt
Workflow requests → run plans → track steps.
Models plug into tracks.
Tools plug into tracks.
Track JSON declares input_map for tool and model steps.
Internal orchestration state is JSON; Markdown is export-only.
NearbyNodes will provide track capabilities (future).
Workflows compose tracks.
Validation scores tracks.
Local Brain dispatches tracks — not raw model names.
```

## Quick Code Map

| Concern | Path |
|---|---|
| Server | `companion/server.js` |
| Workflow orchestration | `companion/orchestration/` |
| Track run | `companion/pit-crew/orchestrator.js` |
| Track files | `companion/pit-crew/tracks/` |
| Step input | `companion/pit-crew/step-input.js`, `input-map-resolver.js` |
| Model / tool routers | `companion/pit-crew/model-router.js`, `tool-router.js` |
| Tools | `companion/tools/registry.js`, `tool-packs/` |
| Proof workflows | `lighthouse-handoff.track.json`, `dealsniper.track.json` |

## When Done

Add an entry to [progress-log.md](./progress-log.md) and update [build-status.md](./build-status.md) if status changed.
