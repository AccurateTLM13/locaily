# Development Control Plane — Compatibility Mapping

This document defines how the existing 9-state objective lifecycle and the new development control plane coexist without conflict.

## Two Systems, One Truth

The **objective lifecycle** (`scripts/objective-lifecycle.js`) manages `.opencode/agents/` state. It is the source of truth for agent-internal lifecycle management.

The **development control plane** (`development/`) manages project-level development state. It is the source of truth for what is being built, who is building it, and whether it is ready to deliver.

They describe the same work from different perspectives. They do not replace each other.

## State Mapping

| Objective Lifecycle | Development Control Plane | Notes |
|---|---|---|
| `planned` | `idea` or `planned` | Lifecycle `planned` is a pre-queued state; CP `idea` is earlier |
| `queued` | `ready` | Both mean "approved and waiting to start" |
| `active` | `active` | Same concept, different systems |
| `blocked` | `blocked` | Same concept |
| `held` | `paused` | Lifecycle `held` = CP `paused`; both mean "intentionally stopped" |
| `failed` | `cancelled` | Lifecycle `failed` maps to CP `cancelled` for the milestone |
| `completed` | `completed` or `merged` | CP distinguishes "implementation done" from "PR merged" |
| `abandoned` | `cancelled` | Same concept |
| `superseded` | (no equivalent) | Deprecated in new system; use `cancelled` with note |

## Entity Mapping

| Objective Lifecycle Concept | Development Control Plane Concept | Relationship |
|---|---|---|
| `objective_id` | milestone `id` | Same work item, different identifiers |
| `objective-lifecycle.js` states | milestone `status` | Parallel state machines with mapping above |
| `work-closeout.json` | session record | Closeout is single-overwrite; sessions are historical |
| `run-state.json` | session `status` | Ephemeral vs durable |
| `active-objective.md` | `project-state.json` `currentMilestone` | Markdown pointer vs JSON pointer |
| `.opencode/agents/state/milestones/*.json` | `development/milestones/*.json` | Agent-internal vs project-level |
| `.opencode/agents/state/manifests/*.json` | milestone `status: ready-for-delivery` | Manifest is delivery artifact; CP status is state |

## Data Flow

```
Agent starts work
  → objective lifecycle: active-objective.md, run-state.json
  → development control plane: project-state.json, session record

Agent completes work
  → objective lifecycle: milestone manifest, archive to completed/
  → development control plane: milestone status → completed, session closed

Agent delivers
  → objective lifecycle: (no delivery concept)
  → development control plane: milestone status → ready-for-delivery → delivered → merged
  → deliver-milestone.js: branch, commit, push, PR
```

## Rules

1. **The objective lifecycle is authoritative for `.opencode/agents/` state.** Do not modify milestone records in `.opencode/agents/state/milestones/` from the development control plane.

2. **The development control plane is authoritative for `development/` state.** Do not modify `development/project-state.json` or `development/milestones/*.json` from the objective lifecycle.

3. **When they disagree, fix the inconsistency.** Do not pick one side. Determine which system has the correct state and update the other.

4. **The development control plane adds delivery and session concepts** that the objective lifecycle does not have. These are extensions, not replacements.

5. **Both systems can run simultaneously.** An agent can use the objective lifecycle for agent-internal state while using the development control plane for project-level coordination.

## Migration Path

Phase 1 (current): Both systems coexist. Development control plane reads from objective lifecycle when needed.

Phase 2+: Development control plane becomes the primary coordination layer. Objective lifecycle remains for agent-internal state only.

Future: Objective lifecycle may be simplified to a thin adapter over the development control plane, but this is not planned for Phase 1.
