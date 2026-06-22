# Start Here — Locaily Documentation

Read this folder first if you are a human builder or a coding agent joining the project cold.

## What Is Locaily?

**Locaily** is the umbrella project for a local-first AI coordination system.

The thesis: useful AI does not always require one large cloud model. Smaller local models, nearby devices, tools, files, rules, validators, and workflows can become highly capable when coordinated through a local orchestration layer.

Locaily is **not** a chatbot product, a model marketplace, or a single Chrome extension. It is the platform layer that connects clients, capabilities, and models on the user's machine (and eventually nearby devices).

**JSON = how Locaily thinks. Markdown = how Locaily explains.** Orchestration uses structured JSON; Markdown is for exports and documentation. See [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md).

## Source of Truth Priority

1. Running code
2. Root `README.md`
3. [current-state.md](./current-state.md)
4. [../07-progress/build-status.md](../07-progress/build-status.md)
5. [../01-architecture/](../01-architecture/)
6. [../02-track-system/](../02-track-system/)
7. [../03-workflows/](../03-workflows/)
8. Archived docs — historical context only

## Where To Go Next

| Topic | Path |
|---|---|
| **Blunt status (read this)** | [current-state.md](./current-state.md) |
| Vision and terminology | [current-vision.md](./current-vision.md), [glossary.md](./glossary.md) |
| Repo map | [repo-map.md](./repo-map.md), [project-index.md](./project-index.md) |
| Architecture | [../01-architecture/locaily-overview.md](../01-architecture/locaily-overview.md) |
| **JSON-first internals** | [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md) |
| **Track system** | [../02-track-system/README.md](../02-track-system/README.md) |
| Workflows | [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md) |
| Validation evidence | [../04-validation/README.md](../04-validation/README.md) |
| Product / setup / roadmap | [../05-product/](../05-product/) |
| Progress / sprint / agent brief | [../07-progress/](../07-progress/) |
| Agent rules | [../08-agents/agent-context.md](../08-agents/agent-context.md) |
| Decisions | [../06-decisions/](../06-decisions/) |
| Research (archived) | [../99-archive/research-notes/](../99-archive/research-notes/) |
| Historical context | [../99-archive/README.md](../99-archive/README.md) |

## Current Focus

**Milestone 1:** Make Locaily's track system explicit.

The Local Brain dispatches **tracks** (units of work with contracts), not raw models. See [../02-track-system/README.md](../02-track-system/README.md) and [../07-progress/current-sprint.md](../07-progress/current-sprint.md).

## Naming Note

**Locaily** is the confirmed public product name. **NearbyNode** and **AI Pit Crew** are confirmed public architecture terms.

Some repo files still say **Local AI Platform** or **Local AI Engine** from earlier phases. Treat those as legacy aliases being phased out.
