# AGENTS.md - Universal Coding Agent Instructions

This file mirrors the intent of `AGENT.md` for editors and coding tools that look for `AGENTS.md`.

## Role of the Coding Agent

You are helping develop a reusable local-first AI platform. Your job is to keep the architecture clean, practical, and publishable.

The platform should run locally, expose a small HTTP API, connect to a local model runtime such as Ollama, and allow multiple tools to plug into it.

## Core Mental Model

```txt
Local AI Platform = main project
DealSniper AI = required MVP working tool
Lighthouse Handoff = MVP stub/demo tool, full support post-MVP
Future tools = integrations/plugins
```

Do not treat DealSniper as the entire product.

## Primary Goal

Create a local companion server that can:

- Run on the user's machine
- Listen on `127.0.0.1:31313`
- Report status through `/health`
- Accept structured requests through `/analyze`
- Talk to Ollama on `127.0.0.1:11434`
- Return structured JSON responses
- Support multiple tools through a registry

## Build Constraints

- Favor Node.js with minimal dependencies.
- Prioritize Windows-friendly setup.
- Keep the first version easy to run from terminal.
- Avoid premature desktop-app complexity.
- Keep client integrations separate from platform core.
- Keep prompts, schemas, and tool handlers organized.

## Contract Source of Truth

- API endpoints return full envelopes.
- Tool handlers return raw result objects only.
- Runtime adapters expose `generateJson(prompt, schema, options = {})`.
- Errors use the same envelope as successes, with `ok: false`, `result: null`, and an `error` object.
- MVP requires DealSniper as the working tool and Lighthouse Handoff as a stub/demo tool.

## Endpoint Requirements

### `GET /health`

Must tell clients:

- Companion server is running
- Runtime provider
- Whether runtime is available
- Selected model name
- Whether model is ready
- Registered tools
- Platform version

### `POST /analyze`

Must accept:

```json
{
  "tool": "tool-id",
  "task": "task-id",
  "input": {},
  "options": {}
}
```

Must return this success envelope:

```json
{
  "ok": true,
  "tool": "tool-id",
  "task": "task-id",
  "provider": "ollama",
  "model": "model-name",
  "result": {},
  "meta": {
    "requestId": "string",
    "durationMs": 0,
    "createdAt": "ISO-8601 string"
  }
}
```

Must return errors with the same envelope shape:

```json
{
  "ok": false,
  "tool": "tool-id",
  "task": "task-id",
  "provider": "ollama",
  "model": "model-name",
  "result": null,
  "error": {
    "code": "MODEL_NOT_READY",
    "message": "The local model is not ready.",
    "nextStep": "Start Ollama and pull the configured model."
  },
  "meta": {
    "requestId": "string",
    "durationMs": 0,
    "createdAt": "ISO-8601 string"
  }
}
```

## Tool Registry Pattern

Each tool should define:

- `id`
- `name`
- Supported tasks
- Input expectations
- Output schema
- Prompt/template
- Handler function that returns a raw result object

Example:

```js
export const dealSniperTool = {
  id: "deal-sniper",
  name: "DealSniper AI",
  tasks: ["analyze-listing"],
  async handle({ task, input, runtime, options }) {
    // validate input
    // build prompt
    // call runtime
    // normalize and return raw result only
  }
};
```

Tool handlers must not return partial API envelopes. The platform wraps handler output into the final `/analyze` response.

## Runtime Adapter Pattern

Keep Ollama-specific code in a runtime adapter.

Do not spread Ollama calls throughout the app.

Suggested responsibilities:

- `isAvailable()`
- `listModels()`
- `hasModel(modelName)`
- `generate(prompt, options = {})`
- `generateJson(prompt, schema, options = {})`

For `generateJson(prompt, schema, options = {})`:

- `prompt` is the final model prompt.
- `schema` is the expected JSON shape or validation schema.
- `options` includes model, temperature, timeout, provider settings, and task metadata.

## Response Rules

Clients need predictable responses. Do not return random prose unless wrapped in a known result field.

Every `/analyze` response should include:

- `ok`
- `tool`
- `task`
- `provider`
- `model`
- `result`
- `meta`

Errors should also include:

- `error.code`
- `error.message`
- `error.nextStep` when useful

## Security and Privacy Rules

This is a local server. Still treat it seriously.

- Bind to localhost only by default.
- Do not expose to the public network by default.
- Add CORS carefully.
- Only allow approved origins during browser-extension testing.
- Do not log sensitive user data by default.
- Make tool permissions explicit in future versions.

## First Integrations

### DealSniper AI

Purpose: Analyze marketplace listings.

Expected output may include:

- Deal score
- Risk level
- Summary
- Red flags
- Negotiation tip
- Suggested next action

DealSniper is the required fully working MVP tool.

### Lighthouse Handoff

Purpose: Convert Lighthouse/PageSpeed data into useful developer handoff notes.

For MVP, Lighthouse Handoff only needs to exist as a stub/demo tool that proves the registry supports a second integration. Full production logic is post-MVP.

Expected future output may include:

- Priority fixes
- Client-friendly summary
- Developer checklist
- Estimated impact
- Recommended next steps

## Quality Bar

The project should feel like a serious open-source tool, not a messy one-off script.

Before considering the project ready to publish, make sure:

- README is clear.
- Architecture docs are present.
- API contract is documented.
- Example clients are included or referenced.
- Smoke tests exist.
- Errors are readable.
- Setup flow is not confusing.

## Agent Behavior

When making changes:

1. Preserve the platform-first architecture.
2. Avoid unnecessary dependencies.
3. Keep files organized.
4. Update docs when changing behavior.
5. Prefer small, working increments.
6. Keep schemas stable.
7. Do not silently change client response formats.
8. Do not invent unimplemented capabilities in docs.

## Current MVP Target

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

## Current Implementation Status

Core phases, including the dynamic manifest-backed Tool Pack registry (Phase L), are fully implemented.

Implemented:
- `companion/server.js` (core companion server)
- `companion/runtime/ollama.js` (runtime adapter)
- `companion/tools/registry.js` (dynamic manifest-backed tool pack registry loader)
- `companion/tools/deal-sniper.js` (showcase tool)
- `companion/tools/lighthouse-handoff.js` (showcase tool)
- `tool-packs/standard-text-pack/` (first official manifest-backed tool pack containing manifest, schemas, implementations, and examples)
- `scripts/smoke-test.js` & `scripts/contract-test.js` (test suites)
- `start-windows.bat` & `start-dev.ps1` (Windows startup scripts)

Next phase:
- Model Garage evaluation harness and auto model switching (Phase 2).
- Track Classifier for multi-track auto-routing.
