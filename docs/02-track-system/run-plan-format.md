# Run Plan Format

Structured execution plan produced by `companion/orchestration/run-plan-builder.js` and mutated by `run-plan-executor.js`.

**JSON Schema:** [../../companion/schemas/internal/workflow-plan.schema.json](../../companion/schemas/internal/workflow-plan.schema.json)

Run plans are **JSON orchestration state**. Markdown in workflow results is generated from final JSON artifacts at export time — not stored as the plan source of truth.

## Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `plan_id` | string | Stable plan identifier (`plan_*`) |
| `task_id` | string | Caller task / run correlation id |
| `workflow_id` | string | Workflow registry id (e.g. `lighthouse_handoff`) |
| `track_id` | string | Track executed by this plan |
| `status` | string | `pending` → `running` → `completed` or `failed` |
| `created_at` | ISO-8601 | Plan creation time |
| `completed_at` | ISO-8601 | Set when execution finishes |
| `duration_ms` | number | Total execution time (after run) |
| `input` | object | Workflow input payload |
| `options` | object | Execution options passed by client |
| `registry` | object | Snapshot of track registry metadata used for planning |
| `steps` | array | Ordered plan steps |

## Step Fields

| Field | Type | Description |
|---|---|---|
| `step_id` | string | Track step id |
| `track_id` | string | Parent track id |
| `required_input` | object | Declared `input_map` or track-input note |
| `expected_output` | object | Schema path or tool output descriptor |
| `worker_type` | object | `{ type: "tool", tool, task }` or `{ type: "model", role }` |
| `status` | string | `pending`, `running`, `completed`, or `failed` |
| `output` | object | Step output after successful execution |
| `error` | object | `{ code, message }` when failed |
| `duration_ms` | number | Step duration |
| `worker_used` | object | Actual worker metadata after execution |

## Example (plan only)

```json
{
  "plan_id": "plan_abc123",
  "task_id": "task_demo",
  "workflow_id": "lighthouse_handoff",
  "track_id": "website_audit.lighthouse_handoff",
  "status": "pending",
  "created_at": "2026-06-15T12:00:00.000Z",
  "input": {
    "url": "https://example.com",
    "scores": { "performance": 72 },
    "opportunities": []
  },
  "registry": {
    "purpose": "Convert Lighthouse or PageSpeed data into structured developer handoff notes for coding agents.",
    "input_type": "lighthouse_report",
    "output_type": "developer_handoff",
    "preferred_worker_type": "priority_helper",
    "fallback_behavior": "deterministic_tool_steps_when_runtime_unavailable"
  },
  "steps": [
    {
      "step_id": "extract_metrics",
      "track_id": "website_audit.lighthouse_handoff",
      "required_input": { "source": "input_map", "map": "$input" },
      "expected_output": { "type": "tool_output", "tool": "lighthouse.parse", "task": "run" },
      "worker_type": { "type": "tool", "tool": "lighthouse.parse", "task": "run" },
      "status": "pending"
    }
  ]
}
```

## API Responses

### `POST /workflows/plan`

Success envelope:

```json
{
  "ok": true,
  "tool": "workflow-orchestrator",
  "task": "lighthouse_handoff",
  "result": { "plan": {} }
}
```

### `POST /workflows/run`

Success envelope includes workflow result fields plus executed plan:

```json
{
  "ok": true,
  "tool": "workflow-orchestrator",
  "task": "lighthouse_handoff",
  "result": {
    "clientSummary": "...",
    "markdown": "# Developer Handoff: ... (export — rendered from structured JSON)",
    "plan": { "status": "completed", "steps": [] }
  },
  "meta": {
    "workflow_id": "lighthouse_handoff",
    "track_id": "website_audit.lighthouse_handoff",
    "plan_id": "plan_abc123",
    "task_id": "task_demo",
    "steps": []
  }
}
```

## Validation Notes

- Step validation checks object shape, model JSON schema (when declared), and verification steps (`verify_output`, `validate_analysis`).
- Final validation checks required result sections from track registry metadata and optional output schema.
- Semantic quality of model prose is **not** scored in this milestone.
