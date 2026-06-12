# Locaily Overview

## What This Document Covers

High-level map of the Locaily stack and how the pieces relate. For component detail see the linked architecture docs.

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
    ┌─────┴─────┬──────────────┐
    ▼           ▼              ▼
Tool Packs   AI Pit Crew    Providers
& Tools      (roles/tracks)  (Ollama, mock, …)
    │                           │
    └───────────┬───────────────┘
                ▼
         Workflows (e.g. Lighthouse Handoff)
                │
                ▼
      NearbyNode capabilities (future)
```

## Request Flow (Implemented)

```txt
Client
  → POST /tasks/run (or legacy POST /analyze)
  → Input Gate
  → Context Handler
  → Tool Registry / handler
  → [optional] Orchestrator steps
  → Provider Router + Model Role Manager
  → Result Validator
  → Audit Log
  → Response envelope
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
  providers/      # provider router
  runtime/        # ollama adapter
  tools/          # registry + showcase handlers
tool-packs/
  standard-text-pack/
scripts/
  smoke-test.js
  contract-test.js
```

## API Surfaces

Canonical:

```txt
GET  /health
GET  /tools
POST /tasks/run
GET  /audit
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
```

Legacy:

```txt
POST /analyze
```

Full contract: [api-contract.md](./api-contract.md)

## Compatibility Rule

New features should extend `/tasks/run` and engine endpoints. Legacy `/analyze` clients must keep working with the original envelope shape.

## Related Docs

- [local-brain.md](./local-brain.md)
- [nearby-node.md](./nearby-node.md)
- [ai-pit-crew.md](./ai-pit-crew.md)
- [capability-registry.md](./capability-registry.md)
- [task-routing.md](./task-routing.md)
- [orchestration-flow.md](./orchestration-flow.md)

## Still Undecided

- Final public naming (Locaily vs Local AI Platform)
- NearbyNode wire protocol and discovery
- Automatic track classifier
- Persistent provider/role configuration across restarts
- Sandboxed vs in-process tool pack execution
