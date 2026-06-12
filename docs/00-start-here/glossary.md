# Glossary

Terms used across Locaily docs. Names marked **(non-final)** may still change.

## Core Project Terms

### Locaily

Confirmed public umbrella name for local-first AI coordination: Local Brain, NearbyNode, AI Pit Crew, and workflows such as Lighthouse Handoff.

Legacy aliases still appearing in some repo files: Local AI Platform, Local AI Engine, Local AI Engine Core.

### Local Brain **(working name)**

Coordinator / orchestrator layer. Owns API, routing, permissions, validation, audit, and provider/model role resolution.

**Code mapping today:** `companion/server.js`, `companion/core/*`.

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

Component that checks outputs against schemas, confidence rules, or safety policies. See `companion/core/result-validator.js`.

## Runtime Terms

### Local Companion **(legacy term)**

Earlier name for the localhost HTTP service. Same practical role as Local Brain in MVP docs.

Default URL: `http://127.0.0.1:31313`

### Model Role

Abstract assignment such as `fast_worker` or `default_worker` instead of hardcoding raw model names in tools.

### Provider

Backend that executes model calls (e.g. `ollama`, `mock`). Routed via `companion/providers/router.js`.

## Status Labels Used In Docs

| Label | Meaning |
|---|---|
| **Confirmed** | Implemented or explicitly decided with repo evidence |
| **Experimental** | Direction under exploration; not production truth |
| **Archived** | Useful context; superseded as source of truth |
| **Needs review** | May be stale or partially contradicted by code |
