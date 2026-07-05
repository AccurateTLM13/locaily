# The Crew

> **Track system docs:** Implementation details for tracks, registries, and step input mapping live in [../02-track-system/README.md](../02-track-system/README.md). This file covers the strategy layer.
>
> **Historical note:** This layer was previously called "AI Pit Crew." The name was shortened to "The Crew" as the product naming matured. References to "AI Pit Crew" in archived material are historical. The internal code path was `companion/pit-crew/` and has since been renamed to `companion/crew/`.
>
> **`companion/crew/`** is the internal implementation path for the mechanics described publicly as **The Crew**.

## What It Is

**The Crew** is not a fixed set of autonomous agents. It is a collection of specialized capabilities—models, tools, rules, validators, hardware capabilities, Relay Nodes, and human approval steps—assigned to a Track job. A Track contract declares which Crew roles it needs; the Local Brain assembles them at execution time.

Key principle: deterministic tools should be preferred when the task is deterministic. Save model inference for steps that genuinely need it.

The research shorthand: **"treat every task as a track and every model as a vehicle."**

A rally car, drift car, and work truck each win on different tracks. Similarly, a 350M classifier may beat a 7B model on a narrow structured step when the workflow, schema, and validator are tight.

Track steps produce and consume **JSON artifacts**. Model steps enforce JSON schemas; validators return JSON results. Human-readable Markdown, when needed, is an export from that JSON pipeline.

## What It Owns

- Model **roles** rather than raw model names in tools
- Per-step decomposition inside a track (orchestrated workflows)
- Escalation and fallback between roles
- Deterministic tool dispatch for known rules
- **Model Scorecards / Skill Sheets** for suitability profiles (fast, structured-output, classification, hardware fit, fallback rules)
- Scoreboard / evaluation hooks for comparing orchestration modes (early: `companion/core/scoreboard.js`)
- Qualification-aware role assignment via Benchmark Lab evidence
- **Enforcement routing** — guarded qualification-aware model selection via the enforcement policy and model router integration

## What It Does Not Own

- HTTP API surface (Local Brain)
- Individual tool pack business logic
- Client UX for picking models (users should see roles/workflows, not 30 model names)

## Implemented Today

| Mechanism | Status |
|---|---|
| Model roles (`fast_worker`, `default_worker`, `reasoning_worker`, …) | Implemented |
| Role → model mapping via `/models/roles` | Implemented (in-memory config) |
| Multi-step Lighthouse orchestration | Implemented in `companion/crew/` + `POST /tracks/run` |
| Track catalog API (`GET /tracks`) | Implemented |
| Provider router (Ollama, mock) | Implemented |
| Benchmark Lab qualification evidence (informs role suitability) | M1 complete |
| Qualification loader at runtime | Implemented (companion/core/model-qualification-loader.js) |
| Automatic track classifier | Not implemented |
| Model Scorecard registry | Spec documented; not implemented |
| Crew across many concurrent models | Partial / workflow-specific only |
| Relay Node capability dispatch | Not implemented |

## Relation to Tracks

A Track is an execution contract that declares the required Crew roles. When a workflow runs, the Local Brain resolves the Track, assembles the Crew from registered tools and model roles, executes each step in order, validates outputs, and records a Track Run Record. The Crew is not permanent—it is assembled per Track execution.

## Relation to Model Lab / Benchmark Lab

Benchmark Lab produces qualification records that describe how well a given model performs on specific Track contracts. The Crew can use these records at role-assignment time to prefer qualified models over untested ones. Qualification is advisory, not automatic—installed models are not promoted or swapped merely because evidence exists.

## Lighthouse Example Track

Track id: `website_audit.lighthouse_handoff` (see `companion/crew/tracks/lighthouse-handoff.track.json`)

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
- Optional qualification evidence from Benchmark Lab

## Outputs

- Combined workflow result
- Per-step metadata (model, role, duration) where implemented
- Validation errors triggering retry or escalation
- Canonical Track Run Record emitted after every execution — persisted to `data/evidence/track-run-records/` and referenced in endpoint responses
- Enforcement decision recorded in Track Run Records via optional `routing.enforcementDecision` — documents original, recommended, and executed capabilities with full policy context
- Fallback on enforced execution failure: re-executes with original selected model; original error, fallback capability, and fallback success/failure recorded in enforcement decision

## Communicates With

- **Local Brain** orchestrator and model role manager
- **Providers** for inference steps
- **Validators** after each model step
- **Benchmark Lab** qualification records for role-assignment hints

## Still Undecided

- Global track taxonomy (SEO audit, marketplace, code review, …)
- When to escalate vs fail vs return partial results
- How to store and publish model suitability benchmarks

See [model-scorecard-and-routing.md](./model-scorecard-and-routing.md) for the target Model Skill Sheet schema and routing rules.

## Archive Context

The Crew concept originated in conversation captures archived under `docs/99-archive/raw-conversation-captures/`. Treat benchmark and "beats large model" claims there as **hypotheses**, not validated results.
