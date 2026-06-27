# worker @ 2026-06-27T04:54:43.754Z
run_id: 612e9eb1e061
iteration: 0
status: running

## Objective
# Active Objective — Controller Validation

Verify the autonomous supervisor/worker loop **without modifying product code**.

This is a dry run. Its only purpose is to prove the machine can drive around the
block: supervisor creates a task → worker executes → result artifact is written
→ supervisor reviews → correction is issued → worker retries → supervisor
accepts → controller stops cleanly.

## Hard constraints

- **Do not modify any product code** under `companion/`, `tool-packs/`,
  `benchmark-lab/`, `scripts/`, or `docs/`.
- **Do not commit.** No `git commit`, ever, during this objective. The worker's
  deliverable is the structured result artifact only.
- All coordination flows through files under `.opencode/agents/`. The worker's
  only allowed write into `.opencode/agents/` is
  `state/latest-worker-result.json`.

## Required loop behavior

The supervisor MUST, in order:

1. **Plan** a read-only inspection task: the worker inspects the repository
   (read files, run read-only `git`/`ls`/`grep`-style commands) and produces a
   short report summarizing what Locaily is, the current build slice, and the
   active proof workflows. The report goes into the `notes` (or a `report`)
   field of `state/latest-worker-result.json`.
2. **Review** the worker's result.
3. **Reject once** with a small, concrete `correction` (e.g., "report must
   include the current build slice name and the two proof workflow track ids").
   This deliberately exercises the correction path — do NOT accept the first
   result even if it is acceptable.
4. After the worker re-runs with the correction, **review** again.
5. **Accept** the corrected result.
6. Set `objective_complete: true` on the accepting review.
7. The controller stops cleanly with `status: complete`.

## Completion Conditions

- Exactly one rejection occurred, followed by one accepted corrected result.
- No product code was modified (the controller's git boundary confirms `git diff`
  is empty against the worker branch base).
- No commit was created.
- `state/latest-worker-result.json` was written with valid, fresh
  `run_id`/`iteration`/`task_id`/`created_at` on each turn.
- `state/latest-review.json` was written with valid freshness fields on each
  review.
- The controller reached `status: complete` and exited on its own.

## Out of Scope

- Anything that edits product code or docs.
- Real Track Learning Evidence Loop work (restore that objective afterward).
- Cost optimization, model selection experiments, additional objectives.

## Notes for the supervisor

- This objective is self-referential: you are proving you can run the loop. The
  "task" you assign is a read-only inspection; the real thing under test is the
  loop machinery, not the report content.
- Keep the worker's task small and read-only. A report of ~10-20 lines is
  plenty.

## Task
# Active Task

> Placeholder. The supervisor overwrites this file during the first plan phase.

## Objective

(pending first plan)

## Scope

- (pending)

## Excluded

- (pending)

## Acceptance Criteria

- (pending)
