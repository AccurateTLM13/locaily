# AI Pit Crew

## What It Is

The **AI Pit Crew** is Locaily's strategy for coordinating multiple small specialists—models, tools, rules, and validators—across a task instead of defaulting to one large general model.

Research shorthand: **"treat every task as a track and every model as a vehicle."**

## What It Owns

- Model **roles** rather than raw model names in tools
- Per-step decomposition inside a track (orchestrated workflows)
- Escalation and fallback between roles
- Future **model suitability profiles** (fast, structured-output, classification, etc.)
- Scoreboard / evaluation hooks for comparing orchestration modes (early: `companion/core/scoreboard.js`)

## What It Does Not Own

- HTTP API surface (Local Brain)
- Individual tool pack business logic
- Client UX for picking models (users should see roles/workflows, not 30 model names)

## Mental Model

```txt
Large general model     →  one supercar for every track
AI Pit Crew             →  garage of vehicles + pit crew for each race
```

A rally car, drift car, and work truck each win on different tracks. Similarly, a 350M classifier may beat a 7B model on a narrow structured step when the workflow, schema, and validator are tight.

## Implemented Today

| Mechanism | Status |
|---|---|
| Model roles (`fast_worker`, `default_worker`, `reasoning_worker`, …) | Implemented |
| Role → model mapping via `/models/roles` | Implemented (in-memory config) |
| Multi-step Lighthouse orchestration | Implemented in `companion/pit-crew/` + `POST /tracks/run` |
| Track catalog API (`GET /tracks`) | Implemented |
| Provider router (Ollama, mock) | Implemented |
| Automatic track classifier | Not implemented |
| Model suitability profile registry | Not implemented |
| Pit crew across many concurrent models | Partial / workflow-specific only |

## Lighthouse Example Track

Track id: `website_audit.lighthouse_handoff` (see `companion/pit-crew/tracks/lighthouse-handoff.track.json`)

| Step | Executor |
|---|---|
| `extract_metrics` | `lighthouse.parse` tool (deterministic) |
| `classify_issues` | `fast_worker` model |
| `prioritize_fixes` | `reasoning_worker` model |
| `match_fixes` | `lighthouse.match_fixes` tool |
| `write_handoff` | `lighthouse-handoff` tool (`compose-handoff` task) |
| `verify_output` | `lighthouse.verify_handoff` checker |

Clients can run the track via `POST /tracks/run` or use `POST /tasks/run` with `lighthouse-handoff` and `options.execution_mode: "orchestrated"` for backward compatibility.

When runtime is unavailable, the tool falls back to deterministic demo output.

## Inputs

- Workflow input from client
- Tool/task options (e.g. `execution_mode`: `orchestrated` vs `baseline`)
- Resolved model roles from Local Brain

## Outputs

- Combined workflow result
- Per-step metadata (model, role, duration) where implemented
- Validation errors triggering retry or escalation

## Communicates With

- **Local Brain** orchestrator and model role manager
- **Providers** for inference steps
- **Validators** after each model step

## Still Undecided

- Global track taxonomy (SEO audit, marketplace, code review, …)
- When to escalate vs fail vs return partial results
- How to store and publish model suitability benchmarks
- Whether Pit Crew naming ships publicly or stays internal

## Archive Context

Pit Crew research originated in conversation captures archived under `docs/99-archive/raw-conversation-captures/`. Treat benchmark and "beats large model" claims there as **hypotheses**, not validated results.
