# AGENTS.md - Universal Coding Agent Instructions

This file mirrors the intent of `AGENT.md` for editors and coding tools that look for `AGENTS.md`.

**Read first:** [docs/00-start-here/current-state.md](docs/00-start-here/current-state.md), [docs/07-progress/next-agent-brief.md](docs/07-progress/next-agent-brief.md), and [docs/08-agents/agent-context.md](docs/08-agents/agent-context.md)

## Role of the Coding Agent

You are helping develop **Locaily**—a reusable local-first AI coordination stack. Your job is to keep the architecture clean, practical, and publishable.

The **Local Brain** (companion server in this repo) should run locally, expose a small HTTP API, connect to local model runtimes such as Ollama, and allow tools and workflows to plug in through a registry.

## Core Mental Model

```txt
Locaily = umbrella project
Local Brain = coordinator / orchestrator (companion/server.js)
NearbyNode = nearby device / capability layer (planned, not fully built)
AI Pit Crew = specialized model / tool / task-track strategy
Lighthouse Handoff = first practical workflow / validation test bench
DealSniper = showcase model-backed tool (not the whole product)
Tool packs = plugin-style capabilities (e.g. standard-text-pack)
```

Do not treat DealSniper or Lighthouse Handoff as the entire product.

**Device = capability.** Not every node needs a model; every node needs a connector.

## Primary Goal

Maintain a local coordinator that can:

- Run on the user's machine
- Listen on `127.0.0.1:31313`
- Report status through `/health`
- Accept structured requests through `/tasks/run` (canonical) and `/analyze` (legacy)
- Talk to Ollama on `127.0.0.1:11434` via the provider router
- Return structured JSON envelopes
- Support tools through a manifest-backed registry

## Build Constraints

- Favor Node.js with minimal dependencies.
- Prioritize Windows-friendly setup.
- Keep the first version easy to run from terminal.
- Avoid premature desktop-app complexity.
- Keep client integrations separate from platform core.
- Keep prompts, schemas, and tool handlers organized.
- Do not default to bigger models as the answer; prefer roles, tracks, tools, and validators.

## Contract Source of Truth

- API endpoints return full envelopes.
- Tool handlers return raw result objects only.
- Runtime adapters expose `generateJson(prompt, schema, options = {})`.
- Errors use the same envelope as successes, with `ok: false`, `result: null`, and an `error` object.
- New clients use `/tasks/run`; legacy clients may use `/analyze`.
- Full contract: [docs/01-architecture/api-contract.md](docs/01-architecture/api-contract.md)

## Endpoint Requirements

### `GET /health`

Must tell clients:

- Companion server is running
- Runtime provider
- Whether runtime is available
- Selected model name / role readiness
- Registered tools
- Platform version and canonical endpoint hints

### `POST /tasks/run` (canonical)

Preferred endpoint for new tools and clients. Accepts tool id, input, context, and options. Returns the engine result envelope documented in the API contract.

### `POST /analyze` (legacy)

Must remain compatible for existing clients. Accepts:

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
- Prompt/template (when model-backed)
- Handler function that returns a raw result object

Tool handlers must not return partial API envelopes. The platform wraps handler output into the final response.

Tool packs load from `tool-packs/*/tool.json` manifests via `companion/tools/registry.js`.

## Runtime Adapter Pattern

Keep provider-specific code in runtime adapters and the provider router.

Do not spread Ollama calls throughout the app.

Suggested responsibilities:

- `isAvailable()`
- `listModels()`
- `hasModel(modelName)`
- `generate(prompt, options = {})`
- `generateJson(prompt, schema, options = {})`

Tools should request **model roles** (`fast_worker`, `default_worker`, …), not hardcode raw model names when avoidable.

## Response Rules

Clients need predictable responses. Do not return random prose unless wrapped in a known result field.

Every response should include `ok`, tool/task identifiers, provider/model context where applicable, `result` or `error`, and `meta`.

## Security and Privacy Rules

This is a local server. Still treat it seriously.

- Bind to localhost only by default.
- Do not expose to the public network by default.
- Add CORS carefully.
- Only allow approved origins during browser-extension testing.
- Do not log sensitive user data by default.
- Enforce tool permissions through the permission manager.

## Key Integrations

### DealSniper AI (showcase tool)

Purpose: Analyze marketplace listings. Model-backed showcase—not the product centerpiece.

### Lighthouse Handoff (first workflow)

Purpose: Convert Lighthouse/PageSpeed data into developer handoff notes. This is Locaily's **first workflow test bench**, not a throwaway stub.

**Current behavior:**

- Deterministic fallback when no usable runtime is available
- Multi-step orchestrated path when runtime is available (`companion/core/orchestrator.js`)
- Chrome extension client: https://github.com/mnfrdrsh/lighthouse-handoff

Do not describe Lighthouse Handoff as "stub only" in new docs. Do not claim production validation for the full extension workflow without evidence.

### Standard Text Pack

Engine-native manifest-backed pack (`text.clean`, `text.summarize`, etc.).

## Quality Bar

The project should feel like a serious open-source tool, not a messy one-off script.

Before considering the project ready to publish, make sure:

- README and agent docs point to `docs/00-start-here/`
- Architecture docs are present and match code
- API contract is documented
- Clients/workflows are referenced (Lighthouse extension repo linked)
- Smoke and contract tests exist
- Errors are readable
- Setup flow is not confusing

## Agent Behavior

When making changes:

1. Preserve the platform-first / Local Brain architecture.
2. Avoid unnecessary dependencies.
3. Keep files organized.
4. Update docs when changing behavior.
5. Prefer small, working increments.
6. Keep schemas stable.
7. Do not silently change client response formats.
8. Do not invent unimplemented capabilities in docs.
9. Do not claim benchmark results without data.
10. Document decisions in [docs/06-decisions/decision-log.md](docs/06-decisions/decision-log.md).

## Current Implementation Status

Core engine modules and manifest-backed tool packs are implemented.

Implemented:

- `companion/server.js` (Local Brain / companion server)
- `companion/core/*` (input gate, context, permissions, validator, audit, orchestrator)
- `companion/pit-crew/*` (track orchestrator, decomposer, step-input, model/tool routers, session jobs)
- `companion/pit-crew/tracks/` — `website_audit.lighthouse_handoff`, `marketplace.dealsniper`
- `companion/core/model-profiles.js` (Model Garage profiles / suitability metadata)
- `companion/providers/router.js` (Ollama + mock)
- `companion/runtime/ollama.js`
- `companion/tools/registry.js` (manifest-backed tool pack loader)
- `companion/tools/deal-sniper.js`, `companion/tools/lighthouse-handoff.js`
- `companion/memory/*` (Memory Bridge v0: vault adapter, context packs, writeback proposals)
- `templates/memory-vault/` (public starter vault template)
- `GET /memory/status`, `POST /memory/context-pack`, `POST /memory/writeback/propose`
- `tool-packs/standard-text-pack/`, `tool-packs/lighthouse-parser-pack/`
- `POST /tracks/run`, `GET /tracks` track APIs
- `companion/orchestration/*` (track registry, workflow registry, run plan builder/executor)
- `GET /orchestration/tracks`, `GET /orchestration/workflows`, `POST /workflows/plan`, `POST /workflows/run`
- `scripts/smoke-test.js`, `scripts/contract-test.js` (56/56 clean-server baseline)
- `start-windows.bat`, `start-dev.ps1`

Next focus areas (see [docs/07-progress/milestone-map.md](docs/07-progress/milestone-map.md) and [docs/05-product/roadmap.md](docs/05-product/roadmap.md)):

- **M5:** Benchmark Lab acceptance (schema-backed evidence, qualification records, read-only status)
- Follow-on: Lighthouse canonical-path documentation; workflow audit summary hardening
- Model Garage evaluation harness (Phase 2 — spec only until evidence)
- Harden Lighthouse Handoff validation end-to-end with the extension client
- NearbyNode capability connectors (spec + prototype — not implementation yet)
- Desktop Companion UI (deferred; see desktop companion decision doc)

## Documentation Map

| Need | Path |
|---|---|
| Start here | [docs/00-start-here/README.md](docs/00-start-here/README.md) |
| Current state (blunt) | [docs/00-start-here/current-state.md](docs/00-start-here/current-state.md) |
| Track system | [docs/02-track-system/README.md](docs/02-track-system/README.md) |
| Progress / agent brief | [docs/07-progress/next-agent-brief.md](docs/07-progress/next-agent-brief.md) |
| Vision / glossary | [docs/00-start-here/current-vision.md](docs/00-start-here/current-vision.md) |
| Architecture | [docs/01-architecture/locaily-overview.md](docs/01-architecture/locaily-overview.md) |
| Pit Crew gap analysis | [docs/01-architecture/pit-crew-gap-analysis.md](docs/01-architecture/pit-crew-gap-analysis.md) |
| Lighthouse workflow | [docs/03-workflows/lighthouse-handoff.md](docs/03-workflows/lighthouse-handoff.md) |
| Validation evidence | [docs/04-validation/README.md](docs/04-validation/README.md) |
| Agent rules | [docs/08-agents/agent-context.md](docs/08-agents/agent-context.md) |
| Decisions | [docs/06-decisions/decision-log.md](docs/06-decisions/decision-log.md) |
| Archive (context only) | [docs/99-archive/README.md](docs/99-archive/README.md) |
