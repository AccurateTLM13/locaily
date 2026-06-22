# Track System

The track system is how Locaily breaks work into steps, dispatches capabilities, and validates output. **Tracks, plans, artifacts, and validation results are JSON.** Markdown exports, when present, are rendered from that JSON state.

**A track is not a model.** A track is a unit of work with purpose, input/output contracts, required capabilities, preferred worker type, validation rules, and fallback policy.

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
| [future-tracks.md](./future-tracks.md) | Draft catalog — post–Milestone 2 tracks |
| [future-track-catalog.md](./future-track-catalog.md) | Per-track contracts (draft / not implemented) |
| [track-catalog-expansion-plan.md](./track-catalog-expansion-plan.md) | Rollout plan for future tracks |
| [future-dag-runner.md](./future-dag-runner.md) | Research — not implemented |

## Code Map

| Component | Path |
|---|---|
| Track catalog | `companion/pit-crew/tracks/*.track.json` |
| Track loader | `companion/pit-crew/decomposer.js` |
| Track runner | `companion/pit-crew/orchestrator.js` |
| Step input | `companion/pit-crew/step-input.js`, `input-map-resolver.js` |
| Model steps | `companion/pit-crew/model-router.js` |
| Tool steps | `companion/pit-crew/tool-router.js` |
| HTTP entry | `POST /tracks/run`, `GET /tracks` in `companion/server.js` |

## Current Stage

```txt
Implemented:  linear track pipeline (two workflow tracks, declarative input_map on all steps)
Next:         remove legacy step-input fallbacks in step-input.js
Future:       DAG planner generated from request
Not built:    automatic track classification, graph runner
```

## Related

- Architecture organs: [../01-architecture/locaily-overview.md](../01-architecture/locaily-overview.md)
- Pit Crew gap analysis: [../01-architecture/pit-crew-gap-analysis.md](../01-architecture/pit-crew-gap-analysis.md)
- Proof workflow: [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md)
- Build dashboard: [../07-progress/build-status.md](../07-progress/build-status.md)
