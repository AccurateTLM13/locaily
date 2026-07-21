# Locaily

A local-first AI coordination stack. One coordinator, many capabilities.

## What It Is

**Locaily** is a system for building and running practical AI workflows on your own
machine. It is not a single tool or app. It is the coordination layer that lets
small local models, deterministic tools, validators, tool packs, nearby devices,
and structured workflows work together through a single local service.

The repository contains the **Local Brain** (the coordinator), **Tracks** (execution
contracts), **The Crew** (specialized worker dispatch), **Tool Packs** (plugin-style
capability bundles), **Benchmark Lab** (evidence and qualification subsystem),
**Memory Bridge** (optional context integration), and **Relay Node** connectors
(nearby-device capability layer).

```
Locaily
├─ Local Brain        — coordinator and runtime
├─ Tracks             — reusable execution contracts
├─ The Crew           — specialized worker dispatch
├─ Tool Packs         — plugin-style capability bundles
├─ Model Lab          — evaluation and qualification layer
│  └─ Benchmark Lab   — evidence and qualification subsystem
├─ Memory Bridge      — optional local context integration
├─ Relay Nodes        — nearby-device capability layer
└─ Workflows          — composes tracks into end-to-end flows
```

## The Problem

Many local AI setups center on selecting one model and routing most work
through it. That can work, but it often treats very different tasks as though
they require the same capability.

Locaily flips the question. Instead of "which model is the smartest?" it asks:

1. What is the actual task?
2. Which capabilities does it need?
3. What is the smallest qualified worker that satisfies the contract?
4. How do we validate the result and fall back?

## Capability-First Philosophy

Locaily treats **capability** as the unit of dispatch, not model size.

A task may use zero models (deterministic transform), one small model on a single
step, several small models across steps, a tool pack, a validator, a rule, or a
relayed capability from another device. The system prefers the **smallest qualified
capability** — the least expensive worker that consistently meets the track contract.

**Device = capability.** Not every node needs a model; every node needs a connector.

## Architecture

### Local Brain

The **Local Brain** (`companion/server.js`) is the localhost coordinator. It
exposes a small HTTP API on `127.0.0.1:31313`, routes structured requests to tools
and tracks, resolves model roles to provider models, validates outputs, and writes
audit summaries. It owns the API surface, security gates, context handling, and
response envelopes. It does not own extension UIs, workflow business logic, or
model training.

Internal orchestration state is JSON. Markdown is the export layer — rendered from
JSON, not assembled as the source of truth.

Full detail: [docs/01-architecture/local-brain.md](docs/01-architecture/local-brain.md),
[docs/01-architecture/api-contract.md](docs/01-architecture/api-contract.md)

### Tracks

A **Track** is a reusable execution contract. It declares inputs, outputs, steps,
required capabilities, model roles, validation rules, retry policies, and evidence
expectations. Tracks decompose useful work into narrow contracts so each step can
be routed to the smallest qualified capability.

Locaily routes tracks, not raw model names. Workflows compose tracks. Models,
tools, validators, and relayed capabilities plug into track steps.

Track declarations are JSON files. Example tracks include:

- `website_audit.lighthouse_handoff`
- `marketplace.dealsniper`

Full detail: [docs/02-track-system/README.md](docs/02-track-system/README.md)

### The Crew

**The Crew** is the strategy for using multiple small specialists — model roles,
deterministic tools, rules, validators, and future relayed capabilities — instead
of one general model. The Crew is assembled per track contract, not a fixed set
of agents.

Model roles (`fast_worker`, `default_worker`, `reasoning_worker`, etc.) decouple
track definitions from specific model names. The provider router resolves roles
to available models at runtime.

Full detail: [docs/01-architecture/crew.md](docs/01-architecture/crew.md)

### Tool Packs

Tool packs are plugin-style bundles of tool definitions, schemas, prompts, and
permissions. Each pack lives under `tool-packs/` with a `tool.json` manifest that
the registry loads at startup. The **Standard Text Pack** (`text.clean`,
`text.summarize`, `text.extract_json`, `text.classify`, `text.detect_injection`,
`text.validate_schema`) is the first engine-native pack. The **Lighthouse Parser
Pack** provides structured Lighthouse data processing.

Full detail: [docs/01-architecture/locaily-overview.md](docs/01-architecture/locaily-overview.md)

### Model Lab / Benchmark Lab

**Model Lab** is the public architecture layer for evaluating and qualifying
models. **Benchmark Lab** (`benchmark-lab/`) is the concrete subsystem that powers
it — CLI evaluation commands, schemas, mock and Ollama adapters, evidence promotion,
checksum verification, and qualification records.

Qualification records are consumed by the Local Brain at runtime through
compact JSON records. The lab produces evidence, reports, and model cards
that inform routing decisions without assuming automatic model promotion.

Full detail: [docs/02-track-system/benchmark-lab.md](docs/02-track-system/benchmark-lab.md)

### Memory Bridge

The **Memory Bridge** is optional. Locaily runs without a memory vault. When
configured, it reads a user-owned local Markdown vault and supplies **Context
Packs** for tasks. Writeback can be configured as a proposal-first workflow
so humans review changes before they are applied to the vault. The vault stays
private outside this repository.

A starter vault template is at `templates/memory-vault/`.

Full detail: [docs/01-architecture/memory-bridge.md](docs/01-architecture/memory-bridge.md)

### Relay Nodes

**Relay Nodes** extend Locaily beyond one machine by allowing trusted nearby
devices to advertise usable capabilities through connectors. A Relay Node
does not need an AI model. Protocol, discovery, authentication, and deployment
details live in the Relay Node documentation.

Full detail: [docs/01-architecture/nearby-node.md](docs/01-architecture/nearby-node.md)

## Why Local-First

- **Privacy:** sensitive inputs stay on your machine by default
- **Cost:** smaller models and local hardware reduce cloud dependence
- **Control:** you own the runtime, tools, tool packs, and audit trail
- **Accessibility:** older or modest hardware can still run useful workflows
- **Modularity:** tools, packs, and workflows evolve without rewriting the core

## Example Workflows

**Lighthouse Handoff** is the first practical workflow test bench. It translates
Lighthouse and PageSpeed report data into structured developer handoff notes,
with a deterministic fallback path when no model is available and a multi-step
orchestrated path when a runtime is available.

**DealSniper** is a model-backed showcase tool for marketplace listing analysis.

These are demonstrations of the track system, not the entire product. New workflows
can be built by composing tracks, tool packs, and validators.

## Core Project Principles

- Local-first, not local-only: prefer local execution with explicit policy-controlled escalation
- Smallest qualified capability: select the least expensive worker that consistently meets the contract
- Deterministic where possible: use code, rules, schemas, and validators before model inference
- Models remain replaceable: tracks and agents declare capabilities, not permanent model dependencies
- Nodes advertise; Local Brain decides: capacity reports what it can do; routing authority stays centralized
- Evidence over intuition: routing, purchases, qualification, and track revisions should be supported by observed results
- Graceful degradation: queue, retry, reduce scope, or escalate rather than fail opaquely
- Human authority remains explicit: high-impact writeback, publishing, and destructive actions require approval

## Getting Started

Requirements:

- **Node.js 18** or newer
- **Ollama** (optional) for live model-backed analysis

Quick start:

```bash
node companion/server.js
```

Windows helpers:

```bat
start-windows.bat
```

```powershell
.\start-dev.ps1
```

On startup, the server prints the local URL, active provider, model readiness,
and registered tool count.

**Full setup and configuration:** [docs/00-start-here/README.md](docs/00-start-here/README.md)

**Example requests and smoke tests:** [docs/01-architecture/api-contract.md](docs/01-architecture/api-contract.md)

## Status

Locaily is under active development.

For verified implementation status, current capabilities, known limitations,
and active work, see:

[docs/00-start-here/current-state.md](docs/00-start-here/current-state.md)

## Documentation

| Need | Start here |
|---|---|
| Setup and orientation | [docs/00-start-here/README.md](docs/00-start-here/README.md) |
| Current verified status | [docs/00-start-here/current-state.md](docs/00-start-here/current-state.md) |
| Vision and terminology | [docs/00-start-here/current-vision.md](docs/00-start-here/current-vision.md) |
| Architecture | [docs/01-architecture/locaily-overview.md](docs/01-architecture/locaily-overview.md) |
| Track system | [docs/02-track-system/README.md](docs/02-track-system/README.md) |
| API contract | [docs/01-architecture/api-contract.md](docs/01-architecture/api-contract.md) |
| Roadmap | [docs/05-product/roadmap.md](docs/05-product/roadmap.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

## Key Integrations

- **Lighthouse Handoff client:** https://github.com/mnfrdrsh/lighthouse-handoff
