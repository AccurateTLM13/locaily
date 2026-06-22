# Orchestration Flow

## What It Is

**Orchestration** is multi-step execution inside a workflow track: breaking work into steps, running each step with the right role/tool, validating intermediates as JSON, and assembling a final structured result. Human-readable Markdown, when needed, is rendered from that JSON state at export time.

See [json-first-internal-format.md](./json-first-internal-format.md).

## What It Owns

- Step sequencing and intermediate schemas
- Per-step model role assignment
- Step timing metadata
- Combining step outputs into final workflow result

## What It Does Not Own

- Global API auth or CORS
- Pack installation
- NearbyNode delegation (future)

## High-Level Shape

```txt
Workflow input (JSON)
    │
    ▼
Step 1 (e.g. extract)     → JSON artifact
    │ validate intermediate (JSON)
    ▼
Step 2 (e.g. classify)    → JSON artifact
    │ validate intermediate (JSON)
    ▼
Step 3 (e.g. prioritize)  → JSON artifact
    │ validate final (JSON)
    ▼
Structured workflow result (JSON)
    │
    ▼
[optional] Markdown / other export render
```

## Implemented Example: Lighthouse Handoff

Platform module: `companion/pit-crew/` (orchestrator, decomposer, model-router, tool-router).

Legacy wrapper: `companion/core/orchestrator.js` delegates to the pit-crew runner.

| Step | Purpose | Executor |
|---|---|---|
| `extract_metrics` | Pull scores and URL | `lighthouse.parse` tool |
| `classify_issues` | Group issues by category/severity | `fast_worker` model |
| `prioritize_fixes` | Rank fixes with reasoning | `reasoning_worker` model |
| `match_fixes` | Map fixes to KB steps | `lighthouse.match_fixes` tool |
| `write_handoff` | Compose developer handoff | `lighthouse-handoff` `compose-handoff` |
| `verify_output` | Validate handoff structure | `lighthouse.verify_handoff` |

APIs:

```txt
GET  /tracks
POST /tracks/run
```

The tool handler in `companion/tools/lighthouse-handoff.js` also supports orchestrated vs baseline vs deterministic demo paths via `POST /tasks/run`.

## Inputs

- Normalized workflow input (e.g. Lighthouse JSON fields)
- Runtime adapter with `generateJson(prompt, schema, options)`
- Options: `execution_mode`, model overrides, `resolveModelForRole`

## Outputs

- Final schema-constrained result for the workflow
- `stepsRun` metadata where recorded (for evaluation / scoreboard)

## Communicates With

- Tool handler
- Provider runtime
- Result validator (per step and final)
- Scoreboard (experimental metrics capture)

## Design Principle

Core orchestration mechanics should stay **boring and stable**. Weird, domain-specific logic belongs in tool packs and workflow modules—not in the server monolith.

## Target Direction (Not Fully Built)

From evolution notes:

```txt
User → Track Classifier → Orchestrator → Model + Tool Pack → Local Brain
```

Today, the client or tool id effectively acts as the classifier (e.g. calling `lighthouse-handoff`).

## Still Undecided

- Generic orchestration DSL vs per-workflow code
- Persisting partial workflow state across failures
- Human-in-the-loop review steps
- Running steps on NearbyNode hardware

## Archive

- `docs/99-archive/raw-conversation-captures/Local AI Engine Evolution.txt`
- `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/01-architecture-overview.md`
