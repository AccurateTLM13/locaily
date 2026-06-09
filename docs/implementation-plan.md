# Implementation Plan - Local AI Platform

## Goal

Build the local companion into a reusable platform that is almost ready for public open-source release.

Do not build desktop-app complexity before the local HTTP companion, runtime adapter, registry, and response contracts are stable.

## Current Progress

Phases 1 through 8 are implemented. Phase 9 is this documentation synchronization pass. Phase 10 packaging preparation is next.

Implemented files include:

```txt
companion/server.js
companion/runtime/ollama.js
companion/tools/registry.js
companion/tools/deal-sniper.js
companion/tools/lighthouse-handoff.js
companion/prompts/deal-sniper.md
companion/prompts/lighthouse-handoff.md
companion/schemas/deal-sniper.schema.json
companion/schemas/lighthouse-handoff.schema.json
scripts/smoke-test.js
```

## MVP Definition

MVP requires:

1. Local companion server
2. `/health` endpoint
3. `/analyze` endpoint
4. Ollama runtime adapter
5. Tool registry
6. One fully working tool: DealSniper
7. One stub/demo second tool: Lighthouse Handoff
8. Consistent response envelopes
9. README setup instructions
10. Basic smoke test script

DealSniper is required for MVP. Lighthouse Handoff only needs to exist as a stub/demo integration for MVP; full Lighthouse Handoff support is post-MVP.

## Phase 1 - Skeleton Server - Done

### Tasks

- Create `companion/server.js`.
- Start HTTP server on `127.0.0.1:31313`.
- Add basic request routing.
- Add JSON body parsing.
- Add consistent JSON responses.
- Add basic error handling.

### Acceptance Criteria

- Running `node companion/server.js` starts the server.
- `GET /health` returns JSON.
- Unknown routes return useful JSON errors.

## Phase 2 - Health State - Done

### Tasks

- Add platform metadata.
- Add config loading from `companion/config.json`.
- Add Ollama availability check.
- Add selected model check.
- Return registered tool list.

### Acceptance Criteria

`GET /health` can distinguish:

- Companion running
- Ollama running
- Ollama missing
- Model ready
- Model missing

## Phase 3 - Runtime Adapter - Done

### Tasks

Create:

```txt
companion/runtime/ollama.js
```

Functions:

- `isAvailable()`
- `listModels()`
- `hasModel(modelName)`
- `generate(prompt, options = {})`
- `generateJson(prompt, schema, options = {})`

For `generateJson(prompt, schema, options = {})`:

- `prompt` is the final model prompt.
- `schema` is the expected JSON shape or validation schema.
- `options` includes model, temperature, timeout, provider settings, and task metadata.

### Acceptance Criteria

- Adapter can call Ollama.
- Adapter can report missing runtime.
- Adapter can report missing model.
- Adapter returns useful errors.

## Phase 4 - Tool Registry - Done

### Tasks

Create a registry system under:

```txt
companion/tools/
```

Each tool should export:

- `id`
- `name`
- `tasks`
- `handle()`

Tool handlers return raw result objects only. The platform wraps handler output into the final API envelope.

### Acceptance Criteria

- `/health` lists registered tools.
- `/analyze` rejects unknown tools.
- `/analyze` rejects unsupported tasks.
- Tool handlers are isolated.

## Phase 5 - Generic `/analyze` - Done

### Tasks

- Parse request body.
- Validate `tool`, `task`, and `input`.
- Find tool handler.
- Call handler.
- Normalize handler output as a raw result.
- Wrap raw result into the standard success envelope.
- Wrap errors into the standard error envelope.

### Acceptance Criteria

- DealSniper can call `/analyze`.
- Lighthouse Handoff stub/demo can call `/analyze`.
- Invalid requests do not crash server.
- Success and error responses share the same envelope fields.

## Phase 6 - DealSniper Integration - Done

### Tasks

Create:

```txt
companion/tools/deal-sniper.js
companion/prompts/deal-sniper.md
companion/schemas/deal-sniper.schema.json
```

Support task:

```txt
analyze-listing
```

### Expected Output

- Deal score
- Risk level
- Summary
- Red flags
- Positive signals
- Negotiation tip
- Next action

### Acceptance Criteria

- DealSniper receives the schema it expects.
- If AI is unavailable, the client can fall back cleanly.
- Model output is normalized even when imperfect.
- Handler returns a raw result object only.

## Phase 7 - Lighthouse Handoff Stub/Demo Integration - Done

### Tasks

Create:

```txt
companion/tools/lighthouse-handoff.js
companion/prompts/lighthouse-handoff.md
companion/schemas/lighthouse-handoff.schema.json
```

Support task:

```txt
analyze-report
```

### MVP Expected Output

- A minimal stub/demo raw result
- Clear placeholder copy that does not claim full production logic
- Same registry and envelope path as DealSniper

### Acceptance Criteria

- Lighthouse data can be sent through the same `/analyze` endpoint.
- Response envelope is stable.
- Platform proves it supports more than one tool.
- Docs identify full Lighthouse Handoff support as post-MVP.

## Phase 8 - Smoke Tests - Done

### Tasks

Create:

```txt
scripts/smoke-test.js
```

Test:

- Server health
- Unknown route
- Unknown tool
- DealSniper sample request
- Lighthouse sample request or stub/demo request
- `ok`, `tool`, `task`, `result`, and `meta` fields

### Acceptance Criteria

A developer can run one script and verify the platform is basically working. The script should fail honestly if no server is running.

## Phase 9 - Documentation

### Tasks

Add/update:

- README
- AGENT.md
- AGENTS.md
- Architecture doc
- API contract
- Tool integration guide
- Packaging plan
- Publish checklist

### Acceptance Criteria

A new developer can understand the project in under a few minutes.

Status: in progress for this pass.

## Phase 10 - Packaging Preparation

### Tasks

- Add Windows-friendly run instructions.
- Add optional `.bat` launcher.
- Add clear Ollama setup notes.
- Document future desktop app direction.

### Acceptance Criteria

Tester setup does not feel like a mystery.

Status: not started.
