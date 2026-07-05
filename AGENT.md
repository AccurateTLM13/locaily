# AGENT.md - Locaily Development Guide

This file is the human-oriented development guide. Coding tools that look for `AGENTS.md` should use that file too—it mirrors this intent with agent-specific rules.

**Read first:** [docs/00-start-here/README.md](docs/00-start-here/README.md)

## Project Mission

Build **Locaily**: a reusable **local-first AI coordination stack** that runs on a user's machine and lets approved tools, browser extensions, websites, and apps make structured local AI requests through the **Local Brain**.

Core idea:

```txt
One local coordinator. Many tools and workflows can plug into it.
```

## Product Positioning

Locaily is the **umbrella project**. The companion server in this repo is the **Local Brain**.

Do not frame the project as:

```txt
AI inside a Chrome extension
One demo tool
A chatbot
```

Frame it as:

```txt
A local-first coordination layer (Local Brain) that powers structured AI workflows
for browser extensions, websites, apps, and developer tools—using capability-first
routing, tool packs, and The Crew (formerly AI Pit Crew) orchestration instead of one giant model by default.
```

Public architecture terms: **Local Brain**, **Tracks**, **The Crew** (formerly AI Pit Crew), **Model Lab**, **Benchmark Lab**, **Relay Nodes**, **Memory Bridge**, **Lighthouse Handoff**.

## Architecture Summary

```txt
Client / Workflow
  - Chrome extension (Lighthouse Handoff)
  - Website helper
  - Dev tool
  - CLI
        │
        ▼
Local Brain (companion server)
  - localhost API
  - input gate / context / permissions
  - Track execution + workflow orchestration
  - tool registry + tool packs
  - The Crew orchestrator (companion/crew/)
  - provider router (Ollama + mock)
  - audit log + scoreboard
        │
        ▼
Local providers + capabilities
  - Ollama (implemented)
  - mock (implemented)
  - Benchmark Lab (implemented — evidence/qualification subsystem)
  - Relay Nodes (planned — nearby-device capability layer)
```

`companion/crew/` is the internal implementation path for the mechanics described publicly as **The Crew**.

Full docs: [docs/01-architecture/locaily-overview.md](docs/01-architecture/locaily-overview.md)

## Technical Foundation

Lightweight Node.js local server using no external packages unless truly necessary.

Primary local API port:

```txt
31313
```

Primary Ollama port:

```txt
11434
```

Ollama is the primary local runtime adapter. The project should remain easy to run on Windows.

Development command:

```bash
node companion/server.js
```

Later packaging may add a Desktop Companion control panel—not a replacement for the Local Brain server.

## Active Build Slice

The current active build slice is **Canonical Track Run Records** — the first Track Learning Evidence Loop implementation step. See [docs/07-progress/current-sprint.md](docs/07-progress/current-sprint.md) and [docs/07-progress/next-agent-brief.md](docs/07-progress/next-agent-brief.md) for current scope.

## Contract Source of Truth

- API endpoints return full envelopes.
- Tool handlers return raw result objects only.
- Runtime adapters expose `generateJson(prompt, schema, options = {})`.
- Errors use the same envelope as successes, with `ok: false`, `result: null`, and an `error` object.
- New clients use `POST /tasks/run`; legacy clients use `POST /analyze`.
- Canonical spec: [docs/01-architecture/api-contract.md](docs/01-architecture/api-contract.md)

## Non-Negotiable Product Principles

1. **Local-first** — process locally when the runtime is available.
2. **Capability-first** — route by capability and track, not "biggest model wins."
3. **Tool-agnostic** — do not hardcode the core around one integration.
4. **Structured I/O** — predictable JSON in and out.
5. **Graceful fallback** — deterministic paths when runtime is missing.
6. **Low setup friction** — terminal-first now; Desktop Companion later.
7. **Privacy-aware by default** — localhost binding, minimal logging.
8. **Extensible without chaos** — registry, manifests, schemas—not one-off endpoints.

## Suggested Repo Structure

```txt
locailly/
  AGENT.md
  AGENTS.md
  README.md
  companion/
    server.js
    core/
    crew/
    orchestration/
    providers/
    runtime/
    tools/
    memory/
    console/
  benchmark-lab/
    engine/
    locaily/
    schemas/
    evidence/
    qualifications/
    model-cards/
    reports/
  tool-packs/
    standard-text-pack/
    lighthouse-parser-pack/
  docs/
    00-start-here/
    01-architecture/
    02-track-system/
    03-workflows/
    04-validation/
    05-product/
    06-decisions/
    07-progress/
    08-agents/
    99-archive/
  scripts/
  templates/
```

## Showcase Tools and First Workflow

| Integration | Role today |
|---|---|
| **DealSniper** | Showcase model-backed listing analysis tool |
| **Lighthouse Handoff** | First workflow test bench; deterministic + orchestrated paths |
| **Standard Text Pack** | First manifest-backed engine pack |

Lighthouse extension client repo: https://github.com/mnfrdrsh/lighthouse-handoff

Workflow doc: [docs/03-workflows/lighthouse-handoff.md](docs/03-workflows/lighthouse-handoff.md)

## Current Implementation Status

Engine core, Track runner, workflow orchestration, provider router, permissions, audit log, memory bridge v0, manifest-backed tool packs, Lighthouse orchestration, and Benchmark Lab Milestone 1 are implemented.

Implemented:

- `companion/server.js`, `companion/core/*`
- `companion/crew/*` — Track and The Crew runner (internal implementation path)
- `companion/orchestration/*` — workflow registry, plan builder/executor
- `companion/providers/router.js`, `companion/runtime/ollama.js`
- `companion/tools/registry.js`, showcase tools, `tool-packs/`
- `companion/memory/*` — Memory Bridge v0 endpoints
- `companion/console/*` — local validation UI
- `benchmark-lab/` — complete Milestone 1 operator-ready subsystem
- `scripts/smoke-test.js`, `scripts/contract-test.js`, `scripts/benchmark-lab-*.js`
- Windows/PowerShell launch helpers

The active build slice is **Canonical Track Run Records**. See [docs/07-progress/build-status.md](docs/07-progress/build-status.md) and [docs/07-progress/current-sprint.md](docs/07-progress/current-sprint.md) for current status.

## Expected Client Behavior

Clients should not assume local AI exists.

They should:

1. Call `GET /health`.
2. Call `GET /tools` for discovery.
3. Prefer `POST /tasks/run`; use legacy `POST /analyze` only when required.
4. Show connected / unavailable / model-not-ready states.
5. Fall back gracefully when runtime or model is missing.
6. Never crash because local AI is missing.

Integration guide: [docs/08-agents/client-integration-guide.md](docs/08-agents/client-integration-guide.md)

## Core Endpoints

### `GET /health`

Reports companion, provider, model, and tool readiness. See API contract for full shape.

### `POST /tasks/run` (canonical)

Generic tool execution for new clients.

### `POST /analyze` (legacy)

Legacy tool/task endpoint. Must remain compatible.

Example legacy request:

```json
{
  "tool": "deal-sniper",
  "task": "analyze-listing",
  "input": {},
  "options": {}
}
```

## Runtime Adapter Pattern

Keep provider-specific code in adapters. Expose:

- `isAvailable()`
- `listModels()`
- `hasModel(modelName)`
- `generate(prompt, options = {})`
- `generateJson(prompt, schema, options = {})`

## Error Philosophy

Return structured envelopes with clear `error.code`, `error.message`, and `error.nextStep` when useful—not opaque 500s.

## Development Priorities

Build and maintain in this order:

1. Local Brain boots and `/health` is truthful.
2. Tool registry and `/tools` work.
3. `/tasks/run` and legacy `/analyze` stay compatible.
4. Permissions, validation, and audit logging stay intact.
5. Lighthouse Handoff workflow stays stable (deterministic + orchestrated).
6. Tool packs extend capability without forking core.
7. Benchmark Lab non-live validation passes (`npm run benchmark:test`, `npm run benchmark:status-smoke`, `node scripts/contract-test.js`).
8. Tests pass; docs match code.
9. Packaging and Desktop Companion only after the above are solid.

## What Not To Do Yet

- Do not overbuild a desktop app before the Local Brain is stable.
- Do not hardcode the platform around one Chrome extension or one model.
- Do not require cloud APIs for the default local-first path.
- Do not introduce heavy frameworks without clear need.
- Do not return freeform AI text when the client expects structured JSON.
- Do not claim benchmark wins without measured data.

## Definition of Almost Publish-Ready

The project is close to publish-ready when:

- A new developer can clone, read `docs/00-start-here/`, and run the server.
- `/health` and `/tools` clearly report state.
- Lighthouse Handoff and DealSniper work through documented paths.
- The extension repo is linked and integration expectations are clear.
- Smoke and contract tests pass.
- Locaily positioning is obvious within 60 seconds.

Checklist: [docs/05-product/publish-readiness-checklist.md](docs/05-product/publish-readiness-checklist.md)

## Tone for User-Facing Copy

Keep copy practical, direct, and builder-friendly. Avoid corporate AI fluff.

Good:

```txt
Run one local AI coordinator. Power many tools and workflows.
```

Bad:

```txt
An innovative AI-powered productivity ecosystem designed to revolutionize workflows.
```
