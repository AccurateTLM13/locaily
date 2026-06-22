# Locaily Overview

## What This Document Covers

High-level map of the Locaily stack and how the pieces relate. For component detail see the linked architecture docs.

## Operating Format

```txt
JSON       = how Locaily thinks   (orchestration, validation, audit, registries)
Markdown   = how Locaily explains (exports, docs, coding-agent handoffs)
```

Internal state is JSON. Markdown reports are generated from validated JSON — not manually assembled as the primary source of truth. Full detail: [json-first-internal-format.md](./json-first-internal-format.md).

## System Map

```txt
Clients (extension, CLI, desktop UI, web widget)
        │
        ▼
┌───────────────────┐
│    Local Brain    │  companion server + core modules
│  (orchestrator)   │
└─────────┬─────────┘
          │
    ┌─────┴─────┬──────────────┬─────────────┐
    ▼           ▼              ▼             ▼
Tool Packs   AI Pit Crew    Providers   Memory Bridge
& Tools      (roles/tracks)  (Ollama…)   (optional vault)
    │                           │             │
    └───────────┬───────────────┴─────────────┘
                ▼
         Workflows (e.g. Lighthouse Handoff)
                │
                ▼
      NearbyNode capabilities (future)
```

**Memory Bridge** is optional. Locaily runs without a vault. When configured, it reads a user-owned private Markdown vault and supplies Context Packs; only **Lighthouse Handoff** `compose-handoff` is wired to optional memory preflight in v0.

## Request Flow (Implemented)

```txt
Client (JSON request)
  → POST /tasks/run (or legacy POST /analyze)
  → Input Gate
  → Context Handler
  → Tool Registry / handler
  → [optional] Track orchestrator (JSON plans + step artifacts)
  → Provider Router + Model Role Manager
  → Result Validator (JSON validation results)
  → Audit Log (JSONL summaries)
  → Response envelope (JSON)
  → [optional] Markdown export layer (e.g. Lighthouse handoff)
```

## What Lives Where

| Layer | Owns | Does not own |
|---|---|---|
| Local Brain | API, security gates, routing, envelopes, audit | Extension UI, pack business logic |
| Tool Pack | Tool definitions, schemas, prompts | Server lifecycle |
| Workflow | Track steps, handoff format | Global provider config |
| NearbyNode (future) | Device connectors, local capabilities | Central model policy |
| Client | Capture input, display results | Direct model calls |

## Implemented Repo Layout

```txt
companion/
  server.js
  core/           # context, input-gate, permissions, orchestrator, …
  memory/         # vault adapter, context packs, writeback, audit redaction
  providers/      # provider router
  runtime/        # ollama adapter
  tools/          # registry + showcase handlers
tool-packs/
  standard-text-pack/
  lighthouse-parser-pack/
templates/
  memory-vault/
  memory-vault-wiki/
scripts/
  smoke-test.js
  contract-test.js
  memory-bridge-lighthouse-validation.js
```

## API Surfaces

Canonical:

```txt
GET  /health
GET  /tools
GET  /tracks
POST /tracks/run
POST /tasks/run
GET  /audit
GET  /scoreboard
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
GET  /memory/status
POST /memory/context-pack
POST /memory/writeback/propose
```

Legacy:

```txt
POST /analyze
```

Full contract: [api-contract.md](./api-contract.md)

## Compatibility Rule

New features should extend `/tasks/run` and engine endpoints. Legacy `/analyze` clients must keep working with the original envelope shape.

## Related Docs

- [memory-bridge.md](./memory-bridge.md)
- [context-packs.md](./context-packs.md)
- [memory-writeback.md](./memory-writeback.md)
- [json-first-internal-format.md](./json-first-internal-format.md)
- [internal-json-schemas.md](./internal-json-schemas.md)
- [local-brain.md](./local-brain.md)
- [nearby-node.md](./nearby-node.md)
- [ai-pit-crew.md](./ai-pit-crew.md)
- [model-scorecard-and-routing.md](./model-scorecard-and-routing.md)
- [capability-registry.md](./capability-registry.md)
- [task-routing.md](./task-routing.md)
- [orchestration-flow.md](./orchestration-flow.md)

## Still Undecided

- Final public naming (Locaily vs Local AI Platform)
- NearbyNode wire protocol and discovery
- Automatic track classifier
- Persistent provider/role configuration across restarts
- Sandboxed vs in-process tool pack execution
