# Next Agent Brief

Hand this to Cursor, Claude, Codex, or any coding agent continuing Locaily work.

**Updated:** 2026-06-27

## Read First

1. [../00-start-here/current-state.md](../00-start-here/current-state.md)
2. [milestone-5-checkpoint.md](./milestone-5-checkpoint.md) - M5 Benchmark Lab checkpoint
3. [build-status.md](./build-status.md)
4. [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md)
5. [../00-start-here/north-star-local-capability-network.md](../00-start-here/north-star-local-capability-network.md)

Also: root [AGENTS.md](../../AGENTS.md) and [../08-agents/agent-context.md](../08-agents/agent-context.md)

## Current Task

The active build slice is Canonical Track Run Records, the first Track Learning Evidence Loop slice.

Primary work:

1. Define a canonical track-run record schema.
2. Emit a valid summary-safe record after successful and failed track executions.
3. Record track version, steps, workers, validation results, retries, timing, and routing context without raw sensitive inputs/outputs by default.
4. Support optional human correction records associated with existing runs.
5. Prove Lighthouse Handoff and DealSniper produce valid evidence records.
6. Preserve `/tasks/run`, `/tracks/run`, and `/workflows/run` response envelopes.
7. Re-run relevant smoke, contract, schema, and track evidence tests after changes.

## Do Not

- Implement automatic model swapping / Model Garage auto-switching as part of M5
- Remove legacy `step-input.js` fallbacks until Lighthouse parity work resumes
- Claim DAG support, NearbyNode routing, or automatic track classification exists
- Claim broad model benchmark wins from narrow fixture evidence
- Break existing Local Brain endpoints or response envelopes
- Implement RelayNode routing, hardware recommendations, or remote execution dispatch in this slice

## Follow-On After Benchmark Lab

1. Record canonical Lighthouse entry path: tool, track, workflow, or staged support matrix.
2. Extend parity coverage across `/tasks/run`, `/tracks/run`, and `/workflows/run`.
3. Remove legacy `step-input.js` fallbacks only after parity is demonstrated.
4. Improve workflow-orchestrator audit summaries without leaking raw task input/output.

## Architecture Reminder

```txt
Workflow requests -> run plans -> track steps.
Models plug into tracks.
Tools plug into tracks.
Track JSON declares input_map for tool and model steps.
Internal orchestration state is JSON; Markdown is export-only.
Benchmark Lab produces evidence and qualification records.
Canonical track-run records are the first evidence loop artifact.
Local Brain consumes compact qualification records, not raw benchmark runs.
NearbyNodes will provide track capabilities (future).
RelayNodes are future approved remote execution targets, not control planes.
Workflows compose tracks.
Validation scores tracks.
Local Brain dispatches tracks - not raw model names.
Target routing principle: smallest qualified capability.
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
| Benchmark Lab | `benchmark-lab/`, `companion/core/model-qualification-loader.js` |
| Proof workflows | `lighthouse-handoff.track.json`, `dealsniper.track.json` |

## When Done

Add an entry to [progress-log.md](./progress-log.md) and update [build-status.md](./build-status.md) if status changed.
