# Status States

How Local Brain reports health and runtime readiness.

## Server States

| Signal | Source | Meaning |
|---|---|---|
| Server running | `GET /health` `ok: true` | Companion accepting requests |
| Unknown route | JSON error envelope | Routing works; path invalid |

## Runtime States

From `/health` runtime and model blocks:

| State | Typical fields | User-facing meaning |
|---|---|---|
| Provider available | `runtime.available: true` | Ollama (or active provider) reachable |
| Provider missing | `runtime.available: false` | Start provider or use deterministic tools |
| Model ready | `model.ready: true` | Configured model is pulled and usable |
| Model missing | `model.ready: false` | Run `ollama pull <model>` |

Deterministic tools (`text.validate_schema`, Lighthouse demo path) may still work when model is not ready.

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

`POST /providers/set` — changes active provider (in-memory today).

## Model Roles

`GET /models/roles` — maps roles to concrete models for active provider.

## Client Guidance

Clients should:

1. Check `/health` before calling tools
2. Read `runtime_required` from `/tools`
3. Degrade gracefully when model unavailable
4. Surface `error.nextStep` when present

## Related

- [../01-architecture/api-contract.md](../01-architecture/api-contract.md)
