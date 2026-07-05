# Glossary

Terms used across Locaily docs.

## Core Project Terms

### Locaily

Confirmed public umbrella name for local-first AI coordination: Local Brain, Tracks, The Crew, Model Lab, Benchmark Lab, Relay Nodes, Memory Bridge, and workflows such as Lighthouse Handoff.

Legacy aliases still appearing in some repo files: Local AI Platform, Local AI Engine, Local AI Engine Core.

### Local Brain

Coordinator / orchestrator layer. Owns API, routing, permissions, validation, audit, and provider/model role resolution. **Internal operating format: JSON.** Markdown is reserved for exports and documentation.

**Code mapping today:** `companion/server.js`, `companion/core/*`.

See [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md).

### Track

A reusable execution contract that declares inputs, outputs, steps, required capabilities, model roles, validation rules, retry/fallback policies, and evidence expectations. Tracks are the unit of dispatch — Locaily routes tracks, not raw model names.

**Implemented today:** two proof Tracks (`website_audit.lighthouse_handoff`, `marketplace.dealsniper`) in `companion/crew/tracks/`.

See [../02-track-system/README.md](../02-track-system/README.md).

### Track Run Record

A structured JSON record emitted after each Track execution. Contains Track version, steps executed, workers used, validation results, retries, timing, and routing context. Does not include raw sensitive inputs or outputs by default.

### Canonical Track Run Record

The active build slice for the Track Learning Evidence Loop. A standard schema and emission path for Track Run Records so they can be reviewed, compared, and used for routing and Track improvement over time.

### Track Learning Evidence Loop

The North Star evidence feedback cycle: `Run -> Observe -> Validate -> Record -> Compare -> Qualify -> Route Better -> Improve the Track`. Canonical Track Run Records are the first implementation step toward this loop.

### The Crew

Specialized models, tools, rules, validators, capabilities, and human steps assigned to Track jobs. The Crew is assembled per Track contract, not a fixed set of autonomous agents.

**Historical names still appearing in some repo files:** AI Pit Crew.

**Code mapping today:** `companion/crew/` — this is the internal implementation path. Public documentation uses "The Crew."

### Crew Member

Any capability assigned to a Track step: a model role, a deterministic tool, a validator, a rule, a human approval gate, or a future Relay Node capability.

### Lighthouse Handoff

First practical workflow: translate Lighthouse / PageSpeed-style report data into developer handoff notes. Serves as Locaily's first validation test bench.

**Tool id:** `lighthouse-handoff`

### Model Lab

Public Locaily architecture layer for evaluating and qualifying models. Benchmark Lab is the concrete repository subsystem that powers it.

### Benchmark Lab

Concrete repository subsystem under `benchmark-lab/` that runs evaluations and produces evidence, reports, model cards, and qualification records. Milestone 1 is complete and operator-ready.

**Runtime boundary:** Local Brain may consume compact qualification records but must not import `benchmark-lab/engine/` modules.

### Qualification Record

A compact JSON record that captures a model's performance against a Track contract: schema version, subject model, qualified-for entries (role, Track, contract, score, status), evidence references, and generation metadata. Consumed by `companion/core/model-qualification-loader.js`.

### Evidence Promotion

The explicit operator workflow for promoting a benchmark draft run to signed-off evidence: `run -> review -> compare -> promote -> checksum verify`. Promotion writes compact summaries, approved evidence, and checksum records.

### Relay Node

(Formerly "NearbyNode.") A nearby device that exposes trusted capabilities through a connector. A Relay Node does not need an AI model. The complete protocol, discovery, trust, distributed execution, and capability routing are not yet implemented.

### Memory Bridge

Locaily's optional integration layer for reading a private Markdown vault and supplying **Context Packs** to tasks. v0 is local-file adapter only — no embeddings, no vector DB.

**Endpoints:** `GET /memory/status`, `POST /memory/context-pack`, `POST /memory/writeback/propose`

**Status:** v0 implemented; disabled by default in `companion/config.json`.

### Context Pack

Structured bundle of project memory for a task: summaries, heading extraction, limited excerpts, and `filesUsed` metadata. Does **not** include full vault file dumps by default.

### Tool Pack

Plugin-style bundle of tools, schemas, prompts, and permissions. Example: `tool-packs/standard-text-pack/`, `tool-packs/lighthouse-parser-pack/`.

### Tool

Single callable unit inside a pack or showcase set. Example: `text.clean`, `lighthouse-handoff`.

### Workflow

End-to-end user-facing flow spanning client, Local Brain, tools, and optional Relay Node capabilities.

### Run Plan

A structured JSON plan built from a Workflow and Track registry entries: ordered steps with step type (tool, model), assigned worker hints, input mappings, output expectations, and pending/running/done/failed status tracking.

### Model Role

Abstract assignment such as `fast_worker` or `default_worker` instead of hardcoding raw model names in tools.

### Capability

Any callable ability the system can route to: model inference, deterministic transform, file read, browser action, API call, validator, human approval, etc.

**Principle:** device = capability; device ≠ model.

### Validator

Component that checks outputs against schemas, confidence rules, or safety policies. Locaily uses **multiple validation contracts** — workflow verification `{ valid, errors }`, engine schema checks `{ ok, errors }` via `validateResult()`, and separate content-review shapes.

See [../04-validation/validation-result-contract-audit.md](../04-validation/validation-result-contract-audit.md).

### Smallest Qualified Capability

Target routing rule: choose the least expensive model, tool, rule, validator, script, or node that consistently satisfies the track contract and policy constraints. This is a direction, not full automatic runtime behavior today.

## Former Names

### AI Pit Crew

Former name for **The Crew**. The public name was shortened as the product naming matured. The code path was `companion/pit-crew/` and has since been renamed to `companion/crew/`.

### NearbyNode

Former name for **Relay Node**. No code rename has occurred.

## Additional Registry Terms

### Capability Registry

Index of available capabilities across Local Brain and connected nodes. Today this is approximated by the tool registry and `/tools` endpoint.

### Worker Registry

Future index of dispatchable workers: models, tools, scripts, rule engines, validators, and service endpoints. Today Locaily has model roles, tool manifests, provider routing, and Benchmark Lab qualification records, not a complete worker registry.

### Qualification Registry

Future source of truth for which workers are approved for which tracks and under what tested conditions. Today this is represented by Benchmark Lab qualification records and runtime qualification-record loading.

### Evidence Store

Structured run records used for regression, routing improvement, debugging, and system learning. The active build slice, Canonical Track Run Records, is the first step toward this.

### RelayNode

Approved remote execution target for burst capacity, hosted models, scheduled automation, or external benchmarking. RelayNodes remain execution targets; Local Brain remains the control plane. Not implemented.

### Model Registry

Future or external index of model metadata and suitability profiles. Today model availability is checked via provider adapters and `/models/roles`.

## Orchestration Terms

### Orchestrator

Component that runs multi-step workflows inside a track. Example: `companion/crew/orchestrator.js` for Lighthouse Handoff steps. Workflow orchestration (`companion/orchestration/`) builds and executes run plans from registered Track definitions.

### Task Routing

Choosing which tool, workflow path, model role, and fallback policy apply to a request.

### JSON-First Internal Format

Architecture decision: Local Brain orchestration state (plans, tracks, artifacts, validation, audit) is JSON. Markdown is an export/rendering layer for human-facing output — not the orchestration source of truth.

### Markdown Export

Human- or agent-readable report rendered from validated JSON state (e.g. Lighthouse Handoff `markdown` field). Distinct from internal orchestration artifacts.

## Runtime Terms

### Local Companion

Earlier name for the localhost HTTP service. Same practical role as Local Brain in MVP docs.

Default URL: `http://127.0.0.1:31313`

### Provider

Backend that executes model calls (e.g. `ollama`, `mock`). Routed via `companion/providers/router.js`.

## Memory Terms

### Second Brain

Private, user-owned memory vault (typically a local Markdown wiki). Stays **outside** the Locaily repo. Locaily connects via Memory Bridge only when the user configures a local `vaultPath`.

### Writeback (proposal-only)

Memory Bridge v0 writes reviewable Markdown proposals to `{vault}/.memory-bridge/writeback-inbox/`. No automatic wiki edits; no `/memory/writeback/apply` in v0.

## Status Labels Used In Docs

| Label | Meaning |
|---|---|
| **Confirmed** | Implemented or explicitly decided with repo evidence |
| **Experimental** | Direction under exploration; not production truth |
| **Archived** | Useful context; superseded as source of truth |
| **Needs review** | May be stale or partially contradicted by code |
