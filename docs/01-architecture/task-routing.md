# Task Routing

## What It Is

**Task routing** decides how an incoming request becomes executable work: which tool, task, permissions, model role, workflow mode, and fallback path apply.

## What It Owns

- Tool id resolution and unknown-tool errors
- Task id validation inside a tool
- Permission checks against declared tool permissions
- Model role selection when a tool requires inference
- Workflow execution mode (e.g. orchestrated vs baseline monolithic pass)
- Fallback triggers on schema failure, timeout, or missing runtime

## What It Does Not Own

- Building the final HTTP response envelope (server layer)
- Long-term storage of routing policies across restarts (partially undecided)

## Routing Flow (Implemented)

```txt
1. Parse request (tool, task or input, context, options)
2. Input gate — reject unsafe/oversized/malformed input
3. Build context packet
4. Resolve tool from registry
5. Check permissions
6. Resolve provider + model role if runtime_required
7. Dispatch tool handler (may call orchestrator)
8. Validate result schema; optional retry
9. Write audit summary
10. Return envelope
```

## Fallback Ladder (Design)

From archived spec, aligned with current validator behavior:

```txt
fast_worker → default_worker → reasoning_worker → fail / manual review
```

Common error codes include:

```txt
SCHEMA_VALIDATION_FAILED
MODEL_UNAVAILABLE
PERMISSION_DENIED
TOOL_NOT_FOUND
INPUT_TOO_LARGE
```

Default policy: retry same model once on schema fail; escalate role only when configured; do not silently jump to huge cloud models.

## Lighthouse Routing Example

`lighthouse-handoff` + task `analyze-report`:

- If no usable runtime → deterministic `buildDemoResult`
- If runtime available and `execution_mode: orchestrated` → multi-step track in `orchestrator.js`
- If `execution_mode: baseline` → single-pass `generateJson`

## Inputs

- Client request body
- Server config (`companion/config.json`)
- Active provider and role map

## Outputs

- Handler invocation
- Audit event with tool, task, provider, model, role, status

## Communicates With

- Tool registry, permissions, model roles, provider router, orchestrator, result validator

## Still Undecided

- Automatic **track classifier** before tool selection
- User-visible routing explanations in UI
- Cross-tool chains in one `/tasks/run` call
- MCP vs native pack routing

## Archived Detail

`docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/07-fallback-routing.md`
