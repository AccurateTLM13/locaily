# Current Vision — Locaily

## Umbrella Project

**Locaily** is the umbrella name for a local-first AI coordination stack.

It is not one app. It is the system that lets practical workflows run on the user's machine using the right mix of:

- small local models
- deterministic tools and validators
- tool packs and workflows
- nearby devices and connectors
- rules, schemas, and audit trails

## The Four Layers

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

It does **not** own:

- Browser extension UI
- Individual workflow business logic (that lives in tool packs / workflows)
- Model training or hosting beyond local provider adapters

**Implemented today:** `companion/server.js` and `companion/core/*` are the Local Brain in practice. Older docs call this the "Local AI Engine Core" or "companion server."

### NearbyNode

**NearbyNode** is the nearby device and capability layer.

The idea: a phone, tablet, old laptop, edge box, or browser-connected peer can expose **capabilities** (files, sensors, UI, compute, APIs) without necessarily running a full model.

Principles:

- Device = capability, not "device = model"
- Every node needs a connector, not necessarily a model
- Local Brain coordinates; NearbyNode supplies reachable capabilities

**Status:** conceptual / early. No full NearbyNode protocol or discovery layer is implemented in this repo yet.

### AI Pit Crew

The **AI Pit Crew** is the strategy for using multiple small specialists instead of one general model.

Mental model (from research notes): models are like vehicles; tasks are like tracks. The fastest car is not always the best car.

The Pit Crew layer includes:

- model roles (`fast_worker`, `default_worker`, `reasoning_worker`, etc.)
- task tracks and step decomposition
- tool packs with prompts, schemas, and rules
- validators and fallback escalation
- future model suitability profiles (speed, structured output quality, cost, etc.)

**Implemented today:** model roles, multi-step Lighthouse orchestration, provider router, and tool packs are partial Pit Crew mechanics. Full automatic track classification is not built yet.

### Lighthouse Handoff — First Workflow

**Lighthouse Handoff** is the first practical workflow and test bench.

It is:

- a Chrome extension-oriented workflow (client side not fully documented here)
- a PageSpeed / Lighthouse report translator
- a deterministic Markdown handoff generator when no model is available
- a local AI enhancement path when a runtime is available
- the first end-to-end validation path for orchestration, schemas, and fallbacks

It is **not** the entire Locaily system. It proves one track works before expanding to marketplace analysis, code review, and other packs.

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
- a nearby device for a non-model capability

## Builder-Friendly Guardrails

- Prefer `/tasks/run` for new clients; keep `/analyze` for legacy clients
- Tool handlers return raw results; the platform wraps envelopes
- Do not claim benchmark wins without measured data
- Do not expand scope until Lighthouse Handoff and core contracts stay stable
- Keep setup understandable for normal builders, not only terminal experts

## Related Docs

- [glossary.md](./glossary.md)
- [../01-architecture/locaily-overview.md](../01-architecture/locaily-overview.md)
- [../02-workflows/lighthouse-handoff.md](../02-workflows/lighthouse-handoff.md)
- [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
