# `.opencode/agents/` — Supervisor/Worker Control Center

This folder is the **control center for the agents that build Locaily**.
It is deliberately separate from Locaily's product runtime.

```txt
companion/          = Locaily product (the Local Brain server)
.opencode/agents/   = agents building Locaily
```

The folder itself does **not** make anything autonomous. The automation lives in
`controller/supervisor.js`, which drives a supervisor → worker → review loop by
invoking a coding-agent CLI (opencode by default).

## Layout

| Path | Purpose |
|---|---|
| `supervisor/` | Supervisor agent instructions (`SYSTEM.md`, `POLICY.md`, `PROMPT.md`) |
| `worker/` | Worker agent instructions |
| `objectives/active-objective.md` | The larger goal + completion conditions |
| `objectives/queue/` | Future objectives waiting to become active |
| `tasks/active-task.md` | The single task the worker is working on right now |
| `tasks/completed/`, `tasks/failed/` | Archived task records |
| `state/run-state.json` | Machine-readable loop state (iteration, status, blocker) |
| `state/latest-review.json` | Supervisor's most recent review decision |
| `state/latest-worker-result.json` | Worker's most recent structured result |
| `runs/` | Per-iteration run logs (CLI output) |
| `controller/` | The automation: `supervisor.js` (loop), `worker-runner.js` (one worker step), `config.json` |

## Loop

1. **Supervisor (plan)** reads the objective + state, writes `tasks/active-task.md`.
2. **Worker** implements that one task, runs tests, commits, writes `state/latest-worker-result.json`, exits.
3. **Supervisor (review)** inspects the diff + tests + worker result, writes `state/latest-review.json` (`accepted` / `rejected` / `corrected`).
4. Accepted + objective complete → stop. Rejected → supervisor issues a corrected task and the loop repeats, `iteration++`. Stop on `blocker`.

## Run it

```powershell
node .opencode/agents/controller/supervisor.js
```

State flows through **files**, not CLI stdout: the agents read/write the files
under `state/`, `tasks/`, and `objectives/`; the controller reads those files to
make decisions. Override the CLI/model/agents in `controller/config.json`.