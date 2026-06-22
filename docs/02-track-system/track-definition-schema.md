# Track Definition Schema

JSON shape for track files under `companion/pit-crew/tracks/`. Matches what `decomposer.js` validates today.

**JSON Schema:** [../../companion/schemas/internal/task-track.schema.json](../../companion/schemas/internal/task-track.schema.json)

See also [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md).

## Top-Level Fields

| Field | Required | Description |
|---|---|---|
| `track_id` | yes | Stable identifier returned by `GET /tracks` |
| `version` | recommended | Track definition version |
| `name` | recommended | Display name |
| `description` | recommended | Short summary |
| `output_schema` | recommended | Path to final result JSON schema |
| `result_step` | no | Step id whose artifact becomes the primary track result (non-Lighthouse tracks) |
| `verification_step` | no | Step id whose artifact supplies `{ valid, errors }` verification meta |
| `steps` | yes | Non-empty array of step objects |

## Step Object

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique within track; becomes artifact key |
| `executor` | yes | How the step runs |
| `input_map` | no | Declarative step input mapping for tool and model steps (see [step-input-mapping.md](./step-input-mapping.md)) |

## Executor: Tool Step

```json
{
  "id": "extract_metrics",
  "executor": {
    "type": "tool",
    "tool": "lighthouse.parse",
    "task": "run"
  }
}
```

## Executor: Model Step

```json
{
  "id": "prioritize_fixes",
  "executor": {
    "type": "model",
    "role": "priority_helper",
    "schema": "companion/pit-crew/schemas/prioritize-fixes.schema.json",
    "prompt_template": "prioritize_fixes"
  }
}
```

Model steps request a **role**, not a hardcoded model name. The model router resolves role → provider model.

## Reference: Proof Tracks

- Lighthouse: `companion/pit-crew/tracks/lighthouse-handoff.track.json` — track id `website_audit.lighthouse_handoff` (7 steps)
- DealSniper: `companion/pit-crew/tracks/dealsniper.track.json` — track id `marketplace.dealsniper` (3 steps)

## Validation Rules (Loader)

From `decomposer.js`:

- `track_id` must be present
- `steps` must be non-empty array
- Each step needs `id` and `executor.type`
- Invalid JSON or schema validation failure → `TRACK_CONFIG_INVALID` (parse) or `TASK_TRACK_INVALID` (schema)

## Output Validation

After all steps complete, orchestrator validates final handoff against `output_schema` when configured.

## Related

- [track-registry.md](./track-registry.md)
- [step-input-mapping.md](./step-input-mapping.md)
