# Locaily Overview

## What This Document Covers

High-level map of the Locaily stack and how the pieces relate. For component detail see the linked architecture docs.

The long-term North Star is a **local capability network**: Local Brain decomposes work into track contracts, routes each track to the smallest qualified capability, validates outputs, and records evidence that improves future routing and track design. See [../00-start-here/north-star-local-capability-network.md](../00-start-here/north-star-local-capability-network.md).

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
┌──────────────────────────┐
│       Local Brain        │  companion server + core
│  (orchestrator, router)  │
└──────────┬───────────────┘
           │
     ┌─────┼──────┬──────────┬───────────┬────────────┐
     ▼     ▼      ▼          ▼           ▼            ▼
  Tool    Tracks  The Crew  Providers  Memory      Benchmark
  Packs          (roles/   (Ollama…)  Bridge      Lab
  & Tools         tracks)              (optional)  (evidence)
     │     │      │          │           │            │
     └─────┴──────┴──────────┴───────────┴────────────┘
                            │
                            ▼
        Workflows (e.g. Lighthouse Handoff)
                            │
                            ▼
               Relay Nodes (future)
```

**Tracks** are the unit of dispatch. Locaily routes work as track contracts, not raw model names. Models, tools, validators, and relayed capabilities plug into track steps. See [../02-track-system/README.md](../02-track-system/README.md).

**Model Lab** is the public architecture layer for evaluating and qualifying models. **Benchmark Lab** (under `benchmark-lab/`) is the implemented repository subsystem that powers it — CLI evaluation commands, 13 schemas, mock + Ollama adapters, evidence promotion, checksum verification, and qualification records. Milestone 1 is complete and operator-ready. Broader coverage remains incremental.

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

## Target Architecture Spine

```txt
User Task
  -> Workflow Contract
  -> Task Decomposer
  -> Track Router
  -> Qualified Worker
  -> Validation
  -> Output Assembly
  -> Final Validation
  -> Result + Evidence Record
```

Only part of this spine is implemented today. Current code supports explicit workflow/track execution, model roles, provider routing, tool routing, validation, audit summaries, Benchmark Lab operator-ready evidence and qualification subsystem, and Memory Bridge v0. Automatic task decomposition, DAG planning, Relay Node dispatch, and adaptive routing are future work.

## What Lives Where

| Layer | Owns | Does not own |
|---|---|---|
| Local Brain | API, security gates, routing, envelopes, audit | Extension UI, pack business logic |
| Tracks | Execution contracts, step orchestration, evidence records | Automatic planning, DAG generation |
| The Crew | Model roles, tool dispatch, rules, validators | HTTP API surface, pack business logic |
| Tool Pack | Tool definitions, schemas, prompts | Server lifecycle |
| Workflow | Track composition, handoff format | Global provider config |
| Model Lab / Benchmark Lab | Evidence, qualification records, model cards, checksums | Direct runtime routing (advisory only) |
| Relay Node (future) | Device connectors, advertised capabilities, health, availability | Central routing authority |
| Memory Bridge | Vault context, writeback proposals | Automatic editing (proposal-only) |
| Client | Capture input, display results | Direct model calls |

## Routing Principle

Tracks request capabilities, not permanent model names. A mature router should ask whether a worker is qualified, available, appropriate for privacy/latency/context/tool constraints, and efficient enough to be the smallest practical option that satisfies the contract.

Current implementation uses model roles and qualification-record loading as the narrow runtime surface. A unified capability registry, worker registry, node scheduler, and automatic model swapping are not built.

## Implemented Repo Layout

```txt
companion/
  server.js
  core/           # context, input-gate, permissions, validation, audit, qualification loader
  crew/           # Track runner, model/tool routers, step input, track JSON files
  orchestration/  # workflow registry, run plan builder/executor
  memory/         # vault adapter, context packs, writeback, audit redaction
  providers/      # provider router
  runtime/        # ollama adapter
  tools/          # registry + showcase handlers
  console/        # local validation UI

benchmark-lab/
  engine/         # CLI entrypoints, runners, adapters, scorers, reporters
  locaily/        # Locaily-specific suites, fixtures, prompts
  schemas/        # 13 benchmark schemas with validation
  evidence/       # curated, checksummed approved evidence
  qualifications/ # runtime-facing qualification records
  model-cards/    # published model cards
  reports/        # published reports
  models/         # model manifests

tool-packs/
  standard-text-pack/
  lighthouse-parser-pack/

templates/
  memory-vault/

scripts/
  smoke-test.js
  contract-test.js
  benchmark-lab-schema-test.js
  benchmark-lab-run-test.js
  benchmark-status-smoke-test.js
  benchmark-lab-tool-eval-test.js
```

## API Surfaces

Canonical:

```txt
GET  /health
GET  /tools
GET  /tracks
POST /tracks/run
GET  /orchestration/tracks
GET  /orchestration/workflows
POST /workflows/plan
POST /workflows/run
POST /tasks/run
GET  /audit
GET  /scoreboard
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
GET  /models/profiles
POST /models/profiles/set
GET  /memory/status
POST /memory/context-pack
POST /memory/writeback/propose
GET  /benchmark/status
GET  /console/status
POST /console/run-validation
POST /console/setup/pagespeed-key
POST /console/setup/memory-vault
GET  /console/runs
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
- [crew.md](./crew.md) (was ai-pit-crew.md — now part of The Crew docs)
- [model-scorecard-and-routing.md](./model-scorecard-and-routing.md)
- [capability-registry.md](./capability-registry.md)
- [task-routing.md](./task-routing.md)
- [orchestration-flow.md](./orchestration-flow.md)

## Still Undecided

- Relay Node wire protocol and discovery
- Automatic track classifier
- Persistent provider/role configuration across restarts
- Sandboxed vs in-process tool pack execution
