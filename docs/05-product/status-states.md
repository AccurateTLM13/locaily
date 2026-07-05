# Status States

How Local Brain reports health and runtime readiness.

## Server States

| Signal | Source | Meaning |
|---|---|---|
| Local Brain running | `GET /health` `ok: true` | Companion accepting requests |
| Local Brain unavailable | Connection refused | Start server |
| Unknown route | JSON error envelope | Routing works; path invalid |

## Runtime Mode States

| State | Meaning |
|-------|---------|
| **Standard deterministic** | Model runtime not used; tools/fallbacks return deterministic output |
| **Model-enhanced** | Active provider and ready model used for AI-backed steps |

## Provider States

From `/health` runtime block and `GET /providers/status`:

| State | Typical fields | User-facing meaning |
|---|---|---|
| Provider available | `runtime.available: true` | Ollama (or active provider) reachable |
| Provider unavailable | `runtime.available: false` | Start provider or use deterministic tools |

## Model States

From `/health` model block:

| State | Typical fields | User-facing meaning |
|---|---|---|
| Model ready | `model.ready: true` | Configured model is pulled and usable |
| Model not installed | `model.ready: false` | Run `ollama pull <model>` |
| Model not ready | `model.ready: false` + `runtime.available: true` | Model is pulling or unavailable |

Deterministic tools (`text.validate_schema`, Lighthouse deterministic path) work when model is not ready.

## Qualification States

From `GET /benchmark/status`:

| State | Meaning |
|-------|---------|
| Qualification available | Records exist for the requested role/Track |
| Qualification unavailable | No records for the role — standard mode used |
| Qualification invalid | Records exist but checksums or evidence do not match |

## Memory Bridge States

| State | Meaning |
|-------|---------|
| Disabled | Memory Bridge not configured (default) |
| Configured | Vault path set and enabled |
| Error | Vault path invalid or unreadable |

## Track/Workflow States

| State | Meaning |
|-------|---------|
| Running | Execution in progress |
| Completed | All steps passed |
| Failed | Step returned error or verification failed |
| Skipped | Step skipped due to condition or fallback |

## Relay Nodes

Not implemented. Any Relay Node references in the UI or status responses should be labeled: **Not configured** or **Unavailable**. Do not create active states for unimplemented capability.

## Tool Execution States

Audit `status` values (summary events):

- success
- failure (with `error_code`)

Common error codes:

```txt
MODEL_NOT_READY
COMPANION_NOT_RUNNING
TOOL_NOT_FOUND
PERMISSION_DENIED
SCHEMA_VALIDATION_FAILED
```

## Provider Selection

`GET /providers/status` — lists providers and active selection.

`POST /providers/set` — changes active provider (in-memory today; not persisted across restarts).

## Model Roles

`GET /models/roles` — maps roles to concrete models for active provider.

`GET /models/profiles` — model profile configuration.

## Validation States

| State | Meaning |
|-------|---------|
| Running | Validation in progress |
| Passed | All checks passed |
| Failed | One or more checks failed |
| Not run | No validation has been performed |

## Client Guidance

Clients should:

1. Check `/health` before calling tools
2. Read `runtime_required` from `/tools`
3. Degrade gracefully when model unavailable
4. Surface `error.nextStep` when present
5. Distinguish deterministic vs model-backed behavior in any UI

## Related

- [../01-architecture/api-contract.md](../01-architecture/api-contract.md)
- [ux-principles.md](./ux-principles.md)
- [locaily-ui-constitution.md](./locaily-ui-constitution.md)
