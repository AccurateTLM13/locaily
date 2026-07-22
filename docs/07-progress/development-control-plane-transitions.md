# Development Control Plane — Transition Ownership and Synchronized Fields

This document defines which system owns each state transition and which fields are synchronized between the objective lifecycle and the development control plane.

## Transition Ownership

### Development Control Plane (primary authority)

The development control plane is the **primary coordination interface** for all development work. These transitions are owned by the CP:

| Transition | Command | Owner |
|---|---|---|
| `idle` → `planning` | `dev:milestone:start` (planning phase) | CP |
| `planning` → `active` | `dev:milestone:start` (implementation phase) | CP |
| `active` → `paused` | `dev:pause` | CP |
| `paused` → `active` | `dev:resume` | CP |
| `active` → `blocked` | `dev:block` | CP |
| `blocked` → `active` | `dev:block --clear` or `dev:resume` | CP |
| `active` → `validating` | `dev:validate` | CP |
| `validating` → `ready-for-delivery` | `dev:milestone:complete` | CP |
| `ready-for-delivery` → `delivered` | `deliver-milestone.js` | CP |
| `delivered` → `merged` | `dev:milestone:merge` (Phase 3) | CP |
| `merged` → `completed` | `dev:milestone:complete` (post-merge) | CP |
| `*` → `cancelled` | `dev:milestone:cancel` | CP |

### Objective Lifecycle (agent-internal adapter)

The objective lifecycle remains the source of truth for `.opencode/agents/` state. These transitions are owned by the lifecycle:

| Transition | Command | Owner |
|---|---|---|
| `queued` → `active` | sequencer/supervisor | Lifecycle |
| `active` → `completed` | sequencer/supervisor | Lifecycle |
| `active` → `failed` | sequencer/supervisor | Lifecycle |
| `active` → `held` | manual | Lifecycle |

### Synchronized Transitions

When the CP transitions a milestone, it should also update the corresponding lifecycle state (if one exists):

| CP Transition | Lifecycle Update | Direction |
|---|---|---|
| CP: `active` → `paused` | Lifecycle: `active` → `held` | CP → Lifecycle |
| CP: `paused` → `active` | Lifecycle: `held` → `active` | CP → Lifecycle |
| CP: `active` → `ready-for-delivery` | Lifecycle: `active` → `completed` | CP → Lifecycle |
| CP: `cancelled` | Lifecycle: `active` → `abandoned` | CP → Lifecycle |

**Rule:** The CP commands update both systems. The lifecycle commands only update the lifecycle. This prevents dual-write conflicts.

## Synchronized Fields

These fields are kept in sync between the CP and the lifecycle:

| CP Field | Lifecycle Field | Sync Direction | Notes |
|---|---|---|---|
| milestone `id` | `objective_id` | CP → Lifecycle | Same entity, different identifiers |
| milestone `status` | lifecycle state | CP → Lifecycle | CP is authoritative |
| session `branch` | `worker_branch` | CP → Lifecycle | Same branch |
| session `startingCommit` | `base_commit` | CP → Lifecycle | Same commit |
| project-state `currentMilestone` | `active-objective.md` | CP → Lifecycle | CP is authoritative |

## Fields That Do NOT Synchronize

| Field | System | Notes |
|---|---|---|
| `run-state.json` | Lifecycle only | Ephemeral, agent-internal |
| `project-state.json` | CP only | Project-level coordination |
| `session.checks` | CP only | Checkpoint history |
| `session.dirtyFiles` | CP only | Session-specific |
| `milestone.scope` | CP only | Planning detail |
| `milestone.acceptanceCriteria` | CP only | Planning detail |

## Conflict Resolution

When the CP and lifecycle disagree:

1. **Check which system should have been updated.** If the CP transitioned, the lifecycle should have been updated. If not, update the lifecycle.
2. **If both systems were updated independently,** determine which update is more recent and correct, then update the other.
3. **Never silently override.** If a conflict cannot be resolved automatically, flag it as a contradiction in `dev:status`.

## Milestone Completion Semantics

The milestone lifecycle has five distinct completion phases:

```
implementation complete  →  ready-for-delivery
branch pushed, PR created  →  delivered
PR merged  →  merged
post-merge closeout done  →  completed
```

### Phase 1: Implementation Complete → `ready-for-delivery`

- All acceptance criteria met
- All required validation passed
- Session records closed
- Project state current
- No unresolved blockers

**Command:** `dev:milestone:complete`

### Phase 2: Branch Pushed, Draft PR Created → `delivered`

- Branch `milestone/<slug>` pushed to origin
- Draft PR created via `gh` CI
- PR includes structured description from milestone record

**Command:** `deliver-milestone.js --slug <slug> --all`

### Phase 3: PR Merged → `merged`

- PR approved and merged by operator
- Merge commit recorded

**Command:** `dev:milestone:merge --pr <number>` (Phase 3)

### Phase 4: Post-Merge Closeout → `completed`

- Milestone record updated with merge commit
- `project-state.json` updated with `lastCompletedMilestone`
- Sprint updated
- Next-agent brief updated
- Dashboard regenerated (Phase 3)

**Command:** Part of `dev:milestone:merge`

## Legacy Branch Reconciliation

Branches from pre-control-plane sessions that don't correspond to any milestone are "legacy branches." They are:

1. **Detected** by `dev:status` as a warning
2. **Documented** in `project-state.json` `activeBranch` and `warnings`
3. **Resolved** by one of:
   - Committing and merging the branch
   - Discarding the changes
   - Creating a milestone for the work
   - Stashing and switching to main

The CP does not automatically delete or merge legacy branches. The operator decides their disposition.
