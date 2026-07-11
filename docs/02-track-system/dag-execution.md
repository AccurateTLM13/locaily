# Track DAG Execution

Locaily tracks are JSON-first step lists. By default the track runner executes steps in **file order** (the linear runner, kept as the backward-compatible fallback required by Milestone 3). When a track declares dependencies, the **DAG executor** runs steps in dependency order with parallel execution of independent steps.

## How dependencies are discovered

The DAG graph is computed from a track's steps by `companion/core/dag-graph.js`:

1. **Explicit `depends_on`** — `step.depends_on: ["other_step_id"]`.
2. **Implicit `$artifacts.*` references** in `step.input_map` — any `$artifacts.<stepId>` reference becomes an edge `stepId → thisStep`.

Both sources are merged (de-duplicated) into a directed edge list.

## Validation

`computeDependencyGraph` returns `valid: false` if:

- **Cycles** are detected (DFS color-marking).
- **Missing step references** — a `depends_on` or `$artifacts.*` target that is not a known step id (except the reserved `input`).

Invalid graphs are rejected before execution with `DAG_CYCLE_DETECTED` / `DAG_MISSING_STEP`.

## Execution

`companion/core/dag-executor.js`:

- Sorts steps into **levels** via Kahn topological sort.
- Executes one level at a time; steps **within a level run concurrently** (`Promise.all`, configurable `maxConcurrency`, default 4).
- On a step failure, marks it `failed`, records the error, and (when `abortOnError`, default true) stops before starting later levels.
- Returns `{ ok, context, graph, durationMs, totalSteps, completed, failed, errors, stepOrder }`.

## Enabling DAG mode

### Track runs (`/tracks/run`)

```json
POST /tracks/run
{ "track_id": "website_audit.lighthouse_handoff", "input": {...}, "options": { "useDag": true } }
```

### Workflow runs (`/workflows/run`, `/workflows/plan`)

`companion/orchestration/run-plan-executor.js` computes the dependency graph from the loaded track and executes the run-plan steps in level order with per-level parallelism. Enabled by default (`options.useDag !== false`). Pass `useDag: false` to force strict sequential execution.

## Track planner (`/tracks/plan`)

`companion/tools/track-planner.js` is a model-backed tool that decomposes a free-form request into a structured track plan. It is **gated by model qualification**: it resolves its `reasoning_worker` role through the same qualification system used by track steps, and refuses (`PLANNER_ROLE_NOT_QUALIFIED`) when the role lacks qualified/conditional evidence under a `require_qualified*` policy. It must not make blind LLM calls.

## Tests

```bash
node scripts/test-dag-graph.cjs      # graph: sort, cycles, missing, levels
node scripts/test-dag-executor.cjs   # executor: linear, parallel, error handling
node scripts/test-run-plan-dag.cjs    # workflow run-plan DAG execution
```

All three are wired into `npm run test:dag`.
