# Architecture - Local AI Platform

## Big Picture

The Local AI Platform is a reusable local engine layer that runs on a user's computer and exposes structured AI/tool execution to approved clients.

Clients can be browser extensions, local websites, desktop utilities, developer tools, or future app integrations.

## System Diagram

```txt
Client tools
  -> Local AI Platform API at 127.0.0.1:31313
  -> Input gate / context / permissions
  -> Tool registry OR Pit Crew track orchestrator (POST /tracks/run)
  -> Provider router
  -> Ollama or mock provider
  -> Result validator / audit log / scoreboard
```

## Pit Crew Platform (track orchestration)

Implemented in `companion/pit-crew/`:

- `decomposer.js` — load track definitions from `tracks/*.track.json`
- `orchestrator.js` — run multi-step tracks via ModelRouter + ToolRouter
- `model-router.js` — model role steps
- `tool-router.js` — invoke registered tool packs per step
- `session-jobs.js` — in-memory job records for track runs

Track API:

```txt
GET  /tracks
POST /tracks/run
GET  /scoreboard
```

First proof track: `website_audit.lighthouse_handoff` (Lighthouse report → developer handoff markdown).

`lighthouse-handoff` is one tool pack step (`compose-handoff`), not the orchestrator host.

## API Layers

Canonical engine API:

```txt
POST /tasks/run
```

Legacy compatibility API:

```txt
POST /analyze
```

`/analyze` is kept for existing MVP clients. New clients should use `/tasks/run`.

## Core Components

### Companion Server

Implemented in `companion/server.js`.

Responsibilities:

- bind to localhost
- expose health, discovery, execution, audit, provider, and model-role endpoints
- preserve `/analyze` compatibility
- return structured envelopes

### Context And Input Gate

Implemented in:

```txt
companion/core/context.js
companion/core/input-gate.js
```

Every `/tasks/run` request becomes a context packet before execution. Unsafe inputs can be blocked before tool/provider work starts.

### Tool Registry

Implemented in:

```txt
companion/tools/registry.js
```

Current tool sources are statically registered. Phase L will move this toward manifest-backed loading.

Current tool groups:

- Showcase tools: `deal-sniper`, `lighthouse-handoff`
- Standard Text Pack: `text.clean`, `text.summarize`, `text.extract_json`, `text.classify`, `text.detect_injection`, `text.validate_schema`

### Provider Router

Implemented in:

```txt
companion/providers/router.js
```

The server talks to providers through the router. Current providers:

- `ollama`
- `mock`

### Model Roles And Suitability Profiles

Implemented in:

```txt
companion/core/model-roles.js
companion/core/model-profiles.js
```

Tools request roles such as `default_worker`; the role manager resolves those roles to concrete provider models.

Model suitability profiles (`lightweight`, `balanced`, `developer`) apply role mappings and memory policies. Track orchestration records profile and suitability metadata on model steps.

### Model Garage And Auto Switching

Implemented in:

```txt
companion/core/model-garage.js
```

The garage tracks candidate models per role, simulates load/unload policies (`single_loaded`, `smart_load`, `multi_warm`), records model switch events, and runs a benchmark harness against standard text tools.

### Permissions

Implemented in:

```txt
companion/core/permissions.js
```

Tools declare permissions. Requests are blocked if a tool asks for undeclared or unapproved permissions.

### Result Validator And Fallbacks

Implemented in:

```txt
companion/core/result-validator.js
```

Tool outputs are validated against declared output schemas. Model-backed tools can retry once on schema failure.

### Audit Log

Implemented in:

```txt
companion/core/audit-log.js
```

Audit records are written as summary-only JSONL entries under `data/`.

## Endpoint Summary

```txt
GET  /health
GET  /tools
POST /tasks/run
GET  /audit
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
GET  /models/profiles
POST /models/profiles/set
GET  /models/garage
POST /models/garage/evaluate
POST /analyze       legacy compatibility
```

## Compatibility Rule

Old `/analyze` clients should continue to work. New engine features should be added through `/tasks/run` and related engine endpoints without breaking the legacy response envelope.

## Desktop Companion Boundary

The future Desktop Companion should be a thin local control panel over the HTTP API, not a replacement for the companion server.

The current planning decision is documented in `docs/desktop-companion-decision.md`. UI implementation is deferred until the core API, packaging path, and manifest-loader direction are stable enough for tester builds.
