# Glossary

Terms used across Locaily docs. Names marked **(non-final)** may still change.

## Core Project Terms

### Locaily

Confirmed public umbrella name for local-first AI coordination: Local Brain, NearbyNode, AI Pit Crew, and workflows such as Lighthouse Handoff.

Legacy aliases still appearing in some repo files: Local AI Platform, Local AI Engine, Local AI Engine Core.

### Local Brain **(working name)**

Coordinator / orchestrator layer. Owns API, routing, permissions, validation, audit, and provider/model role resolution. **Internal operating format: JSON.** Markdown is reserved for exports and documentation.

**Code mapping today:** `companion/server.js`, `companion/core/*`.

See [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md).

### NearbyNode

Confirmed public name for the nearby device and capability layer. Exposes connectors and capabilities on local network peers without requiring each device to run a model.

**Status:** conceptual direction confirmed; implementation not built yet.

### AI Pit Crew

Confirmed public name for the strategy of coordinating multiple small models, tools, rules, and validators across task tracks instead of relying on one large general model.

Also called "track-based orchestration" or "tiny model garage" in research notes.

### Lighthouse Handoff

First practical workflow: translate Lighthouse / PageSpeed-style report data into developer handoff notes. Serves as Locaily's first validation test bench.

**Tool id:** `lighthouse-handoff`

## Capability and Registry Terms

### Capability

Any callable ability the system can route to: model inference, deterministic transform, file read, browser action, API call, validator, etc.

**Principle:** device = capability; device ≠ model.

### Capability Registry **(non-final)**

Index of available capabilities across Local Brain and connected nodes. Today this is approximated by the tool registry and `/tools` endpoint.

### Tool Pack

Plugin-style bundle of tools, schemas, prompts, and permissions. Example: `tool-packs/standard-text-pack/`.

### Tool

Single callable unit inside a pack or showcase set. Example: `text.clean`, `lighthouse-handoff`.

### Model Registry **(non-final)**

Future or external index of model metadata and suitability profiles. Today model availability is checked via provider adapters and `/models/roles`.

## Orchestration Terms

### Orchestrator

Component that runs multi-step workflows inside a track. Example: `companion/core/orchestrator.js` for Lighthouse Handoff steps.

### Task Track **(non-final)**

A classified workflow type (e.g. website audit, marketplace analysis). Tracks decompose into steps with per-step model roles and tools.

### Task Routing

Choosing which tool, workflow path, model role, and fallback policy apply to a request.

### Workflow

End-to-end user-facing flow spanning client, Local Brain, tools, and optional NearbyNode capabilities.

### Validator

Component that checks outputs against schemas, confidence rules, or safety policies. Returns **JSON** validation results (`valid`, `errors`). See `companion/core/result-validator.js` and `companion/schemas/internal/validation-result.schema.json`.

### JSON-First Internal Format

Architecture decision: Local Brain orchestration state (plans, tracks, artifacts, validation, audit) is JSON. Markdown is an export/rendering layer for human-facing output — not the orchestration source of truth.

### Markdown Export

Human- or agent-readable report rendered from validated JSON state (e.g. Lighthouse Handoff `markdown` field). Distinct from internal orchestration artifacts.

## Runtime Terms

### Local Companion **(legacy term)**

Earlier name for the localhost HTTP service. Same practical role as Local Brain in MVP docs.

Default URL: `http://127.0.0.1:31313`

### Model Role

Abstract assignment such as `fast_worker` or `default_worker` instead of hardcoding raw model names in tools.

### Provider

Backend that executes model calls (e.g. `ollama`, `mock`). Routed via `companion/providers/router.js`.

## Memory Terms

### Second Brain

Private, user-owned memory vault (typically a local Markdown wiki). Stays **outside** the Locaily repo. Locaily connects via Memory Bridge only when the user configures a local `vaultPath`.

### Memory Bridge

Locaily's optional integration layer for reading a private Markdown vault and supplying **Context Packs** to tasks. v0 is local-file adapter only — no embeddings, no vector DB.

**Endpoints:** `GET /memory/status`, `POST /memory/context-pack`, `POST /memory/writeback/propose`

**Status:** v0 implemented; disabled by default in `companion/config.json`.

### Context Pack

Structured bundle of project memory for a task: summaries, heading extraction, limited excerpts, and `filesUsed` metadata. Does **not** include full vault file dumps by default.

### Writeback (proposal-only)

Memory Bridge v0 writes reviewable Markdown proposals to `{vault}/.memory-bridge/writeback-inbox/`. No automatic wiki edits; no `/memory/writeback/apply` in v0.

## Status Labels Used In Docs

| Label | Meaning |
|---|---|
| **Confirmed** | Implemented or explicitly decided with repo evidence |
| **Experimental** | Direction under exploration; not production truth |
| **Archived** | Useful context; superseded as source of truth |
| **Needs review** | May be stale or partially contradicted by code |
