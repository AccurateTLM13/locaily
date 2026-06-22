# Fallback and Validation

How track runs validate output and recover from failures **today**. The `verify_output` step returns JSON `{ valid, errors }` (aligned with `validation-result.schema.json` core fields, but **not** validated against that schema file). See [../04-validation/json-first-schema-audit.md](../04-validation/json-first-schema-audit.md).

## Per-Step Validation

| Layer | Where | Behavior |
|---|---|---|
| Tool input validation | Tool handler `validateInput` | Called before tool step runs |
| Model JSON schema | Model router + step `executor.schema` | Structured output enforced for model steps |
| Handoff verification | `verify_output` step | Deterministic checker on final handoff object |
| Final output schema | Orchestrator + `output_schema` | Track-level schema check on result |

Lighthouse proof track runs an explicit **verify_output** step before returning.

## Track-Level Validation

`POST /tracks/run` records:

- `schemaValid` on scoreboard entry
- Step durations and executor metadata in response envelope

See `GET /scoreboard` for aggregated run summaries.

## Fallback Behavior (Partial)

| Mechanism | Status | Notes |
|---|---|---|
| Deterministic demo path | Implemented | Lighthouse tool when runtime unavailable |
| `retry_same_model_once` | Partial | Model router retry |
| Provider unavailable error | Implemented | `503 PROVIDER_UNAVAILABLE` on `/tracks/run` |
| Escalation ladder (role → stronger model → tool-only) | **Not built** | Spec in gap analysis |
| Full FallbackHandler module | **Not built** | Per-step fallback policies not in track JSON |

Do not claim a complete fallback ladder exists.

## Validation Strategy for Tracks

Validate **tracks and workflows**, not "Locaily" globally.

Good evidence:

```txt
website_audit.lighthouse_handoff passes smoke tests on mock provider.
L2 Ollama + Memory Bridge passed on lemonteed fixture.
Model X preserved PSI metrics but failed prioritization schema.
```

Bad evidence:

```txt
LocAIly works.
```

Record evidence in [../04-validation/](../04-validation/) and [../07-progress/progress-log.md](../07-progress/progress-log.md).

## Related

- [../04-validation/README.md](../04-validation/README.md)
- [../01-architecture/pit-crew-gap-analysis.md](../01-architecture/pit-crew-gap-analysis.md)
- Workflow validation template: [../03-workflows/validation-template.md](../03-workflows/validation-template.md)
