# Worker — Prompt

> The controller assembles the final message sent to the CLI from this template.

You are the **worker** in a supervisor/worker loop building Locaily.

Follow your system and policy files exactly:
- `.opencode/agents/worker/SYSTEM.md`
- `.opencode/agents/worker/POLICY.md`

Also obey the project-wide rules in `AGENTS.md` and
`docs/08-agents/agent-context.md`.

## Current task

```
{{ACTIVE_TASK}}
```

## Current loop state

```json
{{RUN_STATE}}
```

## Freshness stamp (copy into your result file verbatim)

- `run_id`: `{{RUN_ID}}`
- `iteration`: `{{ITERATION}}`

## What to do

1. Read the task above (also on disk at `.opencode/agents/tasks/active-task.md`).
2. Implement only what is in **Scope**. Do not touch anything in **Excluded**.
3. Match conventions in the files you edit. Minimal dependencies, small diffs,
   no comments unless asked.
4. Run the appropriate tests (smoke `node scripts/smoke-test.js`, contract
   `node scripts/contract-test.js`, and `npm run benchmark:test` if you touched
   `benchmark-lab/`). Start the companion server if a test needs it.
5. Commit only the files this task changed with a concise, repo-style message.
   Do not push. Never commit secrets or private vault content.
6. Write `.opencode/agents/state/latest-worker-result.json` in the exact shape
   from your policy. **Required fields**: `run_id`, `iteration`, `task_id`
   (equals `task`), `created_at` (ISO-8601 now) — use the freshness stamp below;
   plus `status`, `files_changed`, `commit`, `tests`, `acceptance`, `blocker`,
   `notes`. Map each acceptance criterion from the task to `met` + `evidence`.
7. Do **not** update `.opencode/agents/state/run-state.json` — that is the
   supervisor's job.
8. Output only a short JSON line:
   `{"task":"<id>","status":"complete|failed","commit":"<sha or null>","next":"review"}`

If you cannot complete the task (a stop condition from the active build slice, a
hard constraint, or tests failing for unrelated reasons), set `status:"failed"`
and fill `blocker` in the result file. Then output
`{"task":"<id>","status":"failed","next":"review"}`.