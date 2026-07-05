# Track System

The track system is how Locaily breaks work into steps, dispatches capabilities, and validates output. **Tracks, plans, artifacts, and validation results are JSON.** Markdown exports, when present, are rendered from that JSON state.

**A track is not a model.** A track is a unit of work with purpose, input/output contracts, required capabilities, preferred worker type, validation rules, and fallback policy.

## What a Track Is

A Track is a versioned, inspectable contract that defines:

- identity and purpose
- accepted input
- execution steps in order
- Crew roles (model roles, tools, validators)
- input mapping from request and prior steps
- tool/model requirements
- validation rules and expected output
- fallback behavior
- evidence requirements
- revalidation triggers where applicable (Model Lab qualification)

Tracks are not prompts. Tracks are not model names. Tools and models are handlers that execute track steps. The Crew supplies those handlers to Track jobs.

## Current Implementation

- Two Track files are registered and discoverable (`website_audit.lighthouse_handoff`, `marketplace.dealsniper`).
- `POST /tracks/run` and `GET /tracks` exist and are stable.
- Workflows compose registered Tracks via `POST /workflows/run`.
- Execution is linear/file-ordered (no DAG).
- Model and tool steps use declarative input mapping (`input_map`).
- Role-based model routing resolves model roles to provider models.
- Benchmark Lab qualification metadata can inform model suitability according to runtime policy (`advisory`, `reject_rejected`, `require_qualified`, `require_qualified_or_conditional`).
- Success and failure use stable API envelopes.
- **Canonical Track Run Records** schema, builder, and Benchmark Lab runner integrations are complete (see `companion/evidence/schemas/track-run-record.schema.json`).

## Code Map

| Component | Path |
|---|---|
| Track catalog | `companion/crew/tracks/*.track.json` |
| Track loader | `companion/crew/decomposer.js` |
| Track runner | `companion/crew/orchestrator.js` |
| Step input | `companion/crew/step-input.js`, `input-map-resolver.js` |
| Model steps | `companion/crew/model-router.js` |
| Tool steps | `companion/crew/tool-router.js` |
| HTTP entry | `POST /tracks/run`, `GET /tracks` in `companion/server.js` |

## Current Stage

```txt
Implemented:  linear track pipeline (two workflow tracks, declarative input_map on all steps)
Active slice: The Crew Runtime Track Run Record Emission (integrate into companion track runner)
Future:       dependency graph, DAG planner, Relay Node dispatch
Not built:    automatic track classification, graph runner, free-form Track generation
```

## Read Order

| Doc | Purpose |
|---|---|
| [track-registry.md](./track-registry.md) | What a track is |
| [core-tracks.md](./core-tracks.md) | Reusable base track types |
| [workflow-registry.md](./workflow-registry.md) | Workflows composed from tracks |
| [track-definition-schema.md](./track-definition-schema.md) | Track JSON file shape (matches code) |
| [run-plan-format.md](./run-plan-format.md) | Workflow run plan JSON shape |
| [step-input-mapping.md](./step-input-mapping.md) | Declarative step input mapping |
| [track-graph-planning.md](./track-graph-planning.md) | Linear → declarative → DAG evolution |
| [fallback-and-validation.md](./fallback-and-validation.md) | Validation and fallback today |
| [future-tracks.md](./future-tracks.md) | Draft catalog — future Track ideas |
| [future-track-catalog.md](./future-track-catalog.md) | Per-track contracts (draft / not implemented) |
| [track-catalog-expansion-plan.md](./track-catalog-expansion-plan.md) | Rollout proposal for future tracks |
| [future-dag-runner.md](./future-dag-runner.md) | Research — not implemented |

## Code Map

| Component | Path |
|---|---|
| Track catalog | `companion/crew/tracks/*.track.json` |
| Track loader | `companion/crew/decomposer.js` |
| Track runner | `companion/crew/orchestrator.js` |
| Step input | `companion/crew/step-input.js`, `input-map-resolver.js` |
| Model steps | `companion/crew/model-router.js` |
| Tool steps | `companion/crew/tool-router.js` |
| HTTP entry | `POST /tracks/run`, `GET /tracks` in `companion/server.js` |

## Current Stage

```txt
Implemented:  linear track pipeline (two workflow tracks, declarative input_map on all steps)
Next:         Lighthouse canonical-path doc; workflow audit summary hardening
Future:       DAG planner generated from request
Not built:    automatic track classification, graph runner
```
## Related

- Architecture: [../01-architecture/locaily-overview.md](../01-architecture/locaily-overview.md)
- The Crew / legacy gap analysis: [../01-architecture/crew-gap-analysis.md](../01-architecture/crew-gap-analysis.md)
- Model Lab qualification: [Track Qualification Through Model Lab](./benchmark-lab.md)
- Proof workflow: [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md)
- Build dashboard: [../07-progress/build-status.md](../07-progress/build-status.md)
