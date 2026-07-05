# Current Vision — Locaily

## Umbrella Project

**Locaily** is the umbrella name for a local-first AI coordination stack.

It is not one app. It is the system that lets practical workflows run on the user's machine using the right mix of:

- small local models
- deterministic tools and validators
- tool packs and workflows
- relay nodes and connectors
- rules, schemas, and audit trails

## North Star

Locaily is moving toward a **local capability network**: nearby hardware, local runtimes, tools, validators, and selected remote execution targets coordinated through the Local Brain.

The goal is to decompose useful work into narrow tracks, route each track to the smallest qualified capability, validate the result, and record evidence so future runs can route and validate better.

See [north-star-local-capability-network.md](./north-star-local-capability-network.md) for the full direction.

## Architecture

### Local Brain

The **Local Brain** is the coordinator and orchestrator.

It owns:

- HTTP API surface for clients
- Request normalization and security gates
- Context and run metadata
- Tool and capability discovery
- Task routing into tools and workflows
- Provider routing and model role resolution
- Result validation, fallbacks, and audit logging
- Evidence recording and qualification-aware routing boundaries

It does **not** own:

- Browser extension UI
- Individual workflow business logic (that lives in tool packs / workflows)
- Model training or hosting beyond local provider adapters

**Implemented today:** `companion/server.js` and `companion/core/*` are the Local Brain in practice. Older docs call this the "Local AI Engine Core" or "companion server."

### Tracks

A **Track** is a reusable execution contract: it declares inputs, outputs, steps, required capabilities, model roles, validation rules, retry policies, and evidence expectations. Tracks decompose useful work into narrow contracts so each step can be routed to the smallest qualified capability.

Tracks are the unit of dispatch. Locaily routes tracks, not raw model names. Workflows compose tracks. Models, tools, validators, and other capabilities plug into track steps.

**Implemented today:** two proof tracks exist (`website_audit.lighthouse_handoff`, `marketplace.dealsniper`) running on the linear track runner in `companion/crew/`. Track declarations are JSON files under `companion/crew/tracks/`.

See [../02-track-system/README.md](../02-track-system/README.md).

### The Crew

**The Crew** (historically "AI Pit Crew") is the strategy for using multiple small specialists — models, tools, rules, validators, and relayed capabilities — instead of one general model.

Mental model (from research notes): models are like vehicles; tasks are like tracks. The fastest car is not always the best car.

The Crew layer includes:

- model roles (`fast_worker`, `default_worker`, `reasoning_worker`, etc.)
- track step decomposition and routing
- tool packs with prompts, schemas, and rules
- validators and fallback escalation
- future model suitability profiles (speed, structured output quality, cost, etc.)
- shared inference services where roles keep separate contracts while using the same loaded model when appropriate
- deterministic tools preferred when the task is deterministic
- future Relay Node capability routing

**Implemented today:** model roles, multi-step Lighthouse orchestration, provider router, and tool packs are partial Crew mechanics. Track contracts declare the required Crew roles. Full automatic track classification is not built yet. The internal implementation path is `companion/crew/`.

### Model Lab / Benchmark Lab

**Model Lab** is the public Locaily architecture layer for evaluating and qualifying models. **Benchmark Lab** is the concrete repository subsystem under `benchmark-lab/` that powers it — CLI evaluation commands, 13 schemas, mock + Ollama adapters, evidence promotion, checksum verification, and qualification records.

Benchmark Lab Milestone 1 is complete and operator-ready. Qualification records are consumed by the Local Brain at runtime but must not be treated as automatic model promotion. Broader coverage across additional models, Tracks, hardware profiles, and live qualification depth remains incremental.

### Relay Nodes

**Relay Nodes** (formerly "NearbyNode") are the planned nearby-device and capability layer. A phone, tablet, old laptop, edge box, or browser-connected peer can expose **capabilities** (files, sensors, UI, compute, APIs) without necessarily running a full model.

Principles:

- Device = capability, not "device = model"
- Every node needs a connector, not necessarily a model
- Local Brain coordinates; Relay Nodes supply reachable capabilities

**Status:** conceptual / early. No full Relay Node protocol or discovery layer is implemented. Future work should start from capability advertisements, health, availability, permissions, and evidence history. It should not assume every node hosts a model.

### Lighthouse Handoff — First Workflow

**Lighthouse Handoff** is the first practical workflow and test bench.

It is:

- a Chrome extension-oriented workflow (client side not fully documented here)
- a PageSpeed / Lighthouse report translator
- a deterministic Markdown handoff generator when no model is available
- a local AI enhancement path when a runtime is available
- the first end-to-end validation path for orchestration, schemas, and fallbacks

It is **not** the entire Locaily system. It proves one track works before expanding to marketplace analysis, code review, and other packs.

### Memory Bridge (Optional)

Locaily operates **without** a memory vault. When configured, the **Memory Bridge** reads a user-owned local Markdown vault and supplies **Context Packs** for tasks.

- **Second Brain** (or any compatible vault) stays **private** — outside this repo.
- Locaily ships bridge code, schemas, and a [starter template](../../templates/memory-vault/README.md).
- Integration is via explicit endpoints (`/memory/status`, `/memory/context-pack`, `/memory/writeback/propose`), not repo merge.
- Writeback is **proposal-only** in v0; humans review before vault edits.

See [memory-bridge.md](../01-architecture/memory-bridge.md).

## Why Local-First?

- Privacy: sensitive inputs stay on the machine by default
- Cost: smaller models and local hardware reduce cloud dependence
- Control: users own the runtime, tools, and audit trail
- Accessibility: older or modest hardware may still run useful workflows
- Modularity: tools and packs can evolve without rewriting the core

## Why Capability-First, Not Model-First?

Locaily does not ask "which is the smartest model?" first.

It asks:

1. What is the task track?
2. What capabilities are required (model, validator, file access, browser, API)?
3. Which tool pack and workflow fit?
4. Which model role is good enough for each step?
5. How do we validate and fall back?

A workflow may use:

- zero models (deterministic transform)
- one model on one step
- several small models across steps
- a relayed capability from another device

The target selection rule is **smallest qualified capability**: choose the least expensive model, tool, rule, validator, script, or node that consistently satisfies the track contract. Larger models, dedicated model instances, new hardware, or remote execution need evidence that they solve a real bottleneck.

## Evidence Loop

Locaily should improve through structured evidence, not vague memory or unstructured logs.

```txt
Run -> Observe -> Validate -> Record -> Compare -> Qualify -> Route Better -> Improve the Track
```

Evidence should support routing, qualification, validator design, track revision, and hardware/provider decisions. The current active slice, Canonical Track Run Records, is the first build step toward this loop.

## Builder-Friendly Guardrails

- Prefer `/tasks/run` for new clients; keep `/analyze` for legacy clients
- Tool handlers return raw results; the platform wraps envelopes
- Do not claim benchmark wins without measured data
- Do not expand scope until Lighthouse Handoff and core contracts stay stable
- Do not add models, nodes, providers, or hardware without naming the track need, qualification method, and evidence required
- Keep setup understandable for normal builders, not only terminal experts

## Related Docs

- [glossary.md](./glossary.md)
- [../01-architecture/locaily-overview.md](../01-architecture/locaily-overview.md)
- [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md)
- [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
