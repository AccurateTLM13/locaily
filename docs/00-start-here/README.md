# Start Here — Locaily Documentation

Read this folder first if you are a human builder or a coding agent joining the project cold.

## What Is Locaily?

**Locaily** is the umbrella project for a local-first AI coordination system.

The thesis: useful AI does not always require one large cloud model. Smaller local models, nearby devices, tools, files, rules, validators, and workflows can become highly capable when coordinated through a local orchestration layer.

Locaily is **not** a chatbot product, a model marketplace, or a single Chrome extension. It is the platform layer that connects clients, capabilities, and models on the user's machine (and eventually nearby devices).

## What Problem Is It Solving?

Most AI projects optimize for bigger models. Locaily optimizes for **better coordination**:

- Route each job to the right capability, not the biggest model
- Keep execution local-first for privacy, cost, and hardware reuse
- Use strict schemas, validators, and workflows so small models stay useful
- Let multiple tools and workflows plug in without rewriting the core

## Current Architecture

```txt
Locaily
├─ Local Brain        — coordinator / orchestrator (implemented as companion server)
├─ NearbyNode         — nearby device / capability layer (conceptual; not fully built)
├─ AI Pit Crew        — specialized model / tool / task-track strategy
└─ Lighthouse Handoff — first practical workflow and validation test bench
```

Important framing:

- **Device ≠ AI model.** A device is a **capability**. Not every node needs a model; every node needs a connector.
- **Local Brain** is the current name for the coordinator. In code today this is mostly `companion/server.js` and related core modules.
- **Lighthouse Handoff** is the first real workflow. It is not the whole product.

## Where To Go Next

| Topic | Path |
|---|---|
| Vision and terminology | [current-vision.md](./current-vision.md), [glossary.md](./glossary.md) |
| Full doc index | [project-index.md](./project-index.md) |
| Architecture | [../01-architecture/locaily-overview.md](../01-architecture/locaily-overview.md) |
| First workflow | [../02-workflows/lighthouse-handoff.md](../02-workflows/lighthouse-handoff.md) |
| Research notes | [../03-research/](../03-research/) |
| Product / setup / roadmap | [../04-product/](../04-product/) |
| Agent rules | [../05-agents/agent-context.md](../05-agents/agent-context.md) |
| Decisions and open questions | [../06-decisions/](../06-decisions/) |
| Historical context | [../99-archive/README.md](../99-archive/README.md) |

## What Is Confirmed Today

These are implemented or documented with evidence in the repo:

- Local companion HTTP server on `127.0.0.1:31313` (`companion/server.js`)
- Engine endpoints: `/health`, `/tools`, `/tasks/run`, `/audit`, provider and model-role endpoints
- Legacy `/analyze` compatibility endpoint
- Ollama and mock providers via provider router
- Manifest-backed tool pack loading (`tool-packs/standard-text-pack/`)
- Showcase tools: `deal-sniper`, `lighthouse-handoff`
- Standard Text Pack tools (`text.clean`, `text.summarize`, etc.)
- Input gate, context handler, permissions, result validation, audit log (core modules)
- Lighthouse Handoff multi-step orchestration path when a runtime is available
- Smoke and contract test scripts

See [../04-product/publish-readiness-checklist.md](../04-product/publish-readiness-checklist.md) for a detailed implementation checklist.

## What Is Still Experimental

Treat these as direction, not finished product truth:

- **Locaily** as the final public product name
- **NearbyNode** as a working nearby-device layer
- Full **AI Pit Crew** routing across many specialized models
- **Track classifier** that auto-picks workflow, pack, and model profile
- **Model suitability profiles** beyond basic role assignment
- Desktop Companion UI (planned; not started)
- Distributed / multi-machine local clusters
- Community tool pack marketplace
- Benchmark claims comparing small-model orchestration vs large models (no validated data in repo yet)

When in doubt, check [../06-decisions/open-questions.md](../06-decisions/open-questions.md) and prefer code + tests over older planning docs.

## Naming Note

**Locaily** is the confirmed public product name. **NearbyNode** and **AI Pit Crew** are confirmed public architecture terms.

Some repo files (`README.md`, `AGENTS.md`) still say **Local AI Platform** or **Local AI Engine** from earlier phases. Treat those as legacy aliases being phased out.
