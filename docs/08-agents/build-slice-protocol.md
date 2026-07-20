# Build Slice Protocol

## Purpose

This protocol defines how development agents work on LocAIly build slices.

The repository is the communication surface. Important implementation state must not exist only inside an agent conversation.

## Required Reading

Before making changes, read:

1. `docs/00-start-here/current-vision.md`
2. `docs/00-start-here/current-state.md`
3. `docs/07-progress/active-build-slice.md`
4. `docs/07-progress/next-agent-brief.md`
5. Relevant architecture, track, schema, and workflow documentation

Running code is the final source of truth.

## Work Rules

- Work only within the active build slice
- Do not expand into excluded areas
- Reuse existing architecture before adding parallel systems
- Preserve deterministic-first behavior
- Do not claim validation without recorded evidence
- Do not invent benchmark results
- Do not silently change schemas or public contracts
- Stop when a documented stop condition occurs

## Branch Rules

Create a dedicated branch using:

`codex/<build-slice-name>`

Do not implement directly on `main`.

## Validation Rules

Run the relevant:

- Unit tests
- Contract tests
- Smoke tests
- Schema validation
- Workflow-specific checks

Record exact commands and results.

A passing statement without commands or output is not sufficient evidence.

## Startup Continuity

Before beginning implementation on any build slice, run:

```bash
node scripts/objective-lifecycle.js continuity
```

If unresolved work exists and `safe_to_start_unrelated_work` is false, do not begin new work. Require an explicit disposition: continue, hold, abandon, supersede, or override.

## Required Completion Updates

Before reporting completion, update:

- `docs/00-start-here/current-state.md`
- `docs/07-progress/next-agent-brief.md`
- `docs/07-progress/latest-build-result.json`
- `docs/06-decisions/decision-log.md` when a durable decision was made

## Mandatory Work Closeout

Before exiting any implementation session, write `docs/07-progress/work-closeout.json` documenting:

- `work_id` and `objective_id`
- `status` (complete, incomplete, blocked, interrupted, failed, awaiting_human_action, awaiting_external_validation, stopped)
- `closed_at` (ISO-8601)
- `original_goal`, items completed, items remaining
- `safe_to_start_unrelated_work` (true/false) — based on explicit criteria
- `working_branch`, `last_commit`
- validation results (passed, failed, not_run)
- `recommended_next_agent`

The closeout schema is defined at `docs/07-progress/work-closeout.schema.json`. This file is tracked in git and survives clones.

## Completion Status

Use exactly one:

- `complete`
- `complete_with_follow_up`
- `blocked`
- `failed`
- `partial`

## Completion Report

The final response should contain only:

1. Status
2. What changed
3. Validation performed
4. Acceptance criteria passed or failed
5. Blockers or known gaps
6. Branch and commit
7. Recommended next action

Do not provide a long narrative recap.
