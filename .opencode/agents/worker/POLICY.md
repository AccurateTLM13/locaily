# Worker — Policy

## Scope

- Implement **only** what `tasks/active-task.md` describes.
- Never touch anything under "Excluded" in the task.
- Never change response envelope shapes for `/tasks/run`, `/tracks/run`,
  `/workflows/run`, or `/analyze`. Tool handlers return raw results; the
  platform wraps envelopes.
- Do not invent unimplemented capabilities in docs (DAG, Relay Node routing,
  automatic track classification). Label unvalidated ideas as experimental.
- Do not claim benchmark results without measured data.

## Style

- Minimal dependencies. Windows-friendly. Small diffs.
- Match existing conventions in `companion/` (see neighboring files).
- Do not add comments unless asked. Keep files organized.
- Do not silently change client-facing response formats.

## Tests

- Run the tests appropriate to the area you changed (see `SYSTEM.md`).
- Capture **exact** commands and their pass/fail results in your result.
- If a test requires the companion server, start it, run the test, then stop it.
- If unrelated tests fail, report it; do not "fix" unrelated failures unless the
  task explicitly allows it.

## Commit

- Commit only the files your task changed. Stage deliberately; never commit
  secrets or private vault content.
- Use a concise message matching repo style. Do not push unless asked.
- Never commit unless the task is done and tests pass.

## Result file

Always write `.opencode/agents/state/latest-worker-result.json` with this shape.
The `run_id`, `iteration`, `task_id`, and `created_at` fields are **required** —
they are injected into your prompt; copy them verbatim. The controller rejects
stale or mismatched results.

```json
{
  "run_id": "<from prompt>",
  "iteration": <from prompt>,
  "task_id": "<the task's id>",
  "created_at": "<ISO-8601 now>",
  "task": "<id>",
  "status": "complete" | "failed",
  "files_changed": [],
  "commit": "<sha or null>",
  "tests": [
    { "command": "node scripts/smoke-test.js", "passed": true, "summary": "see latest progress log or CI" }
  ],
  "acceptance": [
    { "criterion": "<from task>", "met": true, "evidence": "" }
  ],
  "blocker": "<reason or null>",
  "notes": ""
}
```

`task_id` must equal the `task` field. The controller overwrites this file with
a stale sentinel before each invocation, so you MUST rewrite it fresh every
turn.

If you cannot complete the task, set `status: "failed"` and explain in
`blocker`/`notes`. Do not silently leave the task half done.

## Closeout

- Before exiting, write or update `docs/07-progress/work-closeout.json` if this was a top-level work session (not a subtask within a supervisor loop).
- The closeout must contain: `work_id`, `objective_id`, `status`, `closed_at` (ISO-8601), `original_goal`, completed/remaining items, `safe_to_start_unrelated_work` (true/false), `working_branch`, `last_commit`, validation results, and `recommended_next_agent`.
- Valid statuses: complete, incomplete, blocked, interrupted, failed, awaiting_human_action, awaiting_external_validation, stopped.
- `safe_to_start_unrelated_work` must be based on explicit criteria, not mood. Set false unless all completion conditions are met.
- See `docs/07-progress/work-closeout.schema.json` for the full schema.

## Exit

- One task per invocation. Write the result file, then stop.
- Do not pick the next task. Do not update `run-state.json`.