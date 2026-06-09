# AGENT.md - Local AI Platform Development Guide

## Project Mission

Build a reusable **local-first AI platform** that runs on a user's machine and allows approved tools, browser extensions, websites, and apps to make structured local AI requests.

The platform is not just for one Chrome extension. DealSniper AI and Lighthouse Handoff are the first proof-of-concept tools, but the core goal is a reusable local AI layer.

Core idea:

```txt
One local AI companion. Many tools can plug into it.
```

## Product Positioning

This project should be treated as the **main open-source platform**.

Example tools such as DealSniper AI and Lighthouse Handoff should be treated as clients/integrations that call into the platform.

Do not frame the project as:

```txt
AI inside a Chrome extension
```

Frame it as:

```txt
A local AI companion platform that powers private AI calls for browser extensions, websites, apps, and developer tools.
```

## Architecture Summary

```txt
Client Tool
  - Chrome extension
  - Website helper
  - Static site assistant
  - Dev tool
  - Internal app
        ->
Local AI Platform / Companion Server
  - localhost API
  - permissions
  - tool registry
  - schemas
  - prompt routing
  - model runtime adapter
        ->
Local AI Runtime
  - Ollama first
  - other runtimes later
        ->
Local Model
```

## Initial Technical Direction

Start with a lightweight Node.js local server using no external packages unless truly necessary.

Primary local API port:

```txt
31313
```

Primary Ollama port:

```txt
11434
```

The first runtime adapter should target Ollama.

The project should remain easy to run on Windows.

Development-first command should eventually be as simple as:

```bash
node companion/server.js
```

Later production packaging can become:

```txt
LocalAICompanion.exe
```

## Contract Source of Truth

- API endpoints return full envelopes.
- Tool handlers return raw result objects only.
- Runtime adapters expose `generateJson(prompt, schema, options = {})`.
- Errors use the same envelope as successes, with `ok: false`, `result: null`, and an `error` object.
- MVP requires DealSniper as the working tool and Lighthouse Handoff as a stub/demo tool.

## Non-Negotiable Product Principles

1. **Local-first**
   AI requests should be processed locally whenever the local runtime is available.
2. **Tool-agnostic**
   The platform should not be hardcoded only for DealSniper.
3. **Structured I/O**
   Tools should send predictable JSON and receive predictable JSON.
4. **Graceful fallback**
   Clients should be able to continue in standard/non-AI mode if the companion or model is unavailable.
5. **Low setup friction**
   Early versions may require terminal commands. Real user versions should move toward a desktop companion.
6. **Privacy-aware by default**
   The system should make it obvious when data is processed locally and what tool is requesting access.
7. **Extensible without chaos**
   New tools should plug in through a registry/config/schema approach, not random one-off endpoints everywhere.

## Suggested Repo Structure

```txt
local-ai-platform/
  AGENT.md
  AGENTS.md
  README.md
  companion/
    server.js
    config.json
    runtime/
      ollama.js
    tools/
      deal-sniper.js
      lighthouse-handoff.js
    schemas/
      deal-sniper.schema.json
      lighthouse-handoff.schema.json
    prompts/
      deal-sniper.md
      lighthouse-handoff.md
  docs/
    architecture.md
    api-contract.md
    implementation-plan.md
    packaging-plan.md
    tool-integration-guide.md
    publish-readiness-checklist.md
  examples/
    deal-sniper-extension/
    lighthouse-handoff-client/
  scripts/
    smoke-test.js
```

## MVP Scope

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

DealSniper is required for MVP. Lighthouse Handoff only needs to exist as a stub/demo integration for MVP; full Lighthouse Handoff production logic is post-MVP.

## Current Implementation Status

Phases 1 through 8 are implemented. Phase 9 documentation synchronization is in progress/completing.

Implemented:

- `companion/server.js`
- `companion/runtime/ollama.js`
- `companion/tools/registry.js`
- `companion/tools/deal-sniper.js`
- `companion/tools/lighthouse-handoff.js`
- prompt and schema files for both tools
- `scripts/smoke-test.js`

Next phase:

- Phase 10 packaging preparation with Windows-friendly launch helpers and clearer tester setup.

## Expected Client Behavior

Client tools should not assume local AI exists.

They should:

1. Call `/health`.
2. Show connected/unavailable/model-not-ready states.
3. Call `/analyze` only when the companion and selected model are ready.
4. Fall back to standard mode when unavailable.
5. Never crash because local AI is missing.

## Core Endpoints

### `GET /health`

Checks whether the companion is running and whether the local runtime/model is available.

Expected response shape:

```json
{
  "ok": true,
  "service": "local-ai-platform",
  "version": "0.1.0",
  "runtime": {
    "provider": "ollama",
    "available": true,
    "baseUrl": "http://127.0.0.1:11434"
  },
  "model": {
    "name": "llama3.2",
    "ready": true
  },
  "tools": ["deal-sniper", "lighthouse-handoff"]
}
```

### `POST /analyze`

Generic tool analysis endpoint.

Expected request shape:

```json
{
  "tool": "deal-sniper",
  "task": "analyze-listing",
  "input": {},
  "options": {}
}
```

Expected success response shape:

```json
{
  "ok": true,
  "tool": "deal-sniper",
  "task": "analyze-listing",
  "provider": "ollama",
  "model": "llama3.2",
  "result": {},
  "meta": {
    "requestId": "string",
    "durationMs": 0,
    "createdAt": "ISO-8601 string"
  }
}
```

Expected error response shape:

```json
{
  "ok": false,
  "tool": "deal-sniper",
  "task": "analyze-listing",
  "provider": "ollama",
  "model": "llama3.2",
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

## Runtime Adapter Pattern

Keep Ollama-specific code in a runtime adapter.

Runtime adapters should expose:

- `isAvailable()`
- `listModels()`
- `hasModel(modelName)`
- `generate(prompt, options = {})`
- `generateJson(prompt, schema, options = {})`

For `generateJson(prompt, schema, options = {})`:

- `prompt` is the final model prompt.
- `schema` is the expected JSON shape or validation schema.
- `options` includes model, temperature, timeout, provider settings, and task metadata.

## Error Philosophy

Errors should be understandable to normal builders and use the standard full `/analyze` envelope.

Avoid vague responses like:

```txt
500 Internal Server Error
```

Prefer an envelope with a clear `error` object and useful `nextStep`.

## Development Priorities

Build in this order:

1. Companion server boots.
2. `/health` returns useful state.
3. Ollama detection works.
4. `/analyze` accepts generic tool requests.
5. Tool registry loads known tools.
6. DealSniper tool works.
7. Lighthouse Handoff stub/demo works through the same pattern.
8. Responses match client expectations.
9. Add tests/smoke tests.
10. Improve docs and packaging.

## What Not To Do Yet

Do not overbuild a desktop app before the local server core works.

Do not hardcode the entire platform around one Chrome extension.

Do not require external accounts or cloud APIs for the first local-first version.

Do not introduce heavy frameworks unless the project clearly needs them.

Do not bake prompts directly into random route handlers. Keep prompts organized.

Do not return freeform AI text when the client expects structured JSON.

Do not let tool handlers return partial API envelopes.

## Definition of Almost Publish-Ready

The project is close to publish-ready when:

- A new developer can clone and run it from the README.
- `/health` clearly reports companion/runtime/model state.
- DealSniper works through `/analyze`.
- Lighthouse Handoff exists as a stub/demo integration and can be expanded post-MVP.
- Client integrations gracefully handle offline/unavailable states.
- The repo has clear docs, examples, and smoke tests.
- The project name, positioning, and architecture are obvious within 60 seconds.

## Tone for User-Facing Copy

Keep copy practical, direct, and builder-friendly.

Avoid corporate AI fluff.

Good:

```txt
Run one local AI companion. Power many tools.
```

Bad:

```txt
An innovative AI-powered productivity ecosystem designed to revolutionize workflows.
```
