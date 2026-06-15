# Future Tracks

**Status:** Draft catalog — not implemented. No `*.track.json` files exist for these tracks yet.

This doc introduces reusable track types Locaily expects to add **after Milestone 2** (second workflow track + declarative input mapping). They extend the [core tracks](./core-tracks.md) with governance, routing, memory, and Model Garage patterns.

## Do Not Claim

- These tracks are registered in `GET /tracks`
- Fixtures under `docs/04-validation/fixtures/tracks/` are validated against a runner
- Automatic track classification picks these tracks
- NearbyNode or DAG execution is required for any track except where explicitly marked future-only

## Catalog Index

| Track | Track ID | Status | Doc section |
|---|---|---|---|
| Evidence Track | `governance.evidence_check` | Draft | [future-track-catalog.md](./future-track-catalog.md#evidence-track) |
| Diff Track | `content.doc_diff` | Draft | [future-track-catalog.md](./future-track-catalog.md#diff-track) |
| Confidence Track | `governance.confidence_score` | Draft | [future-track-catalog.md](./future-track-catalog.md#confidence-track) |
| Escalation Track | `routing.escalation_ladder` | Draft | [future-track-catalog.md](./future-track-catalog.md#escalation-track) |
| Context Selection Track | `memory.context_selection` | Draft | [future-track-catalog.md](./future-track-catalog.md#context-selection-track) |
| Model Profiling Track | `garage.model_profiling` | Draft | [future-track-catalog.md](./future-track-catalog.md#model-profiling-track) |
| Capability Discovery Track | `capability.discovery` | Future / NearbyNode-adjacent | [future-track-catalog.md](./future-track-catalog.md#capability-discovery-track-future-only) |

## How These Support Local Brain Routing

Local Brain dispatches **tracks**, not raw model names. These future tracks fill gaps called out in [pit-crew-gap-analysis.md](../01-architecture/pit-crew-gap-analysis.md):

```txt
User / client request
  → (future) Routing Track / classifier — not built
  → Workflow track (e.g. lighthouse_handoff, dealsniper)
  → Core + governance tracks composed as steps:
       Context Selection → model steps → Confidence → Evidence → Validation
       on failure → Escalation Track → retry or deterministic fallback
  → Model Profiling Track feeds Model Garage scorecards (offline / pre-run)
```

Today the linear runner executes workflow tracks only. Governance tracks below are **spec targets** for step reuse inside those workflows and for a future FallbackHandler — not standalone production entry points until implemented and validated.

## Fixture Examples

Draft fixtures live under `docs/04-validation/fixtures/tracks/`. Each file includes `input`, `expected_output_shape`, and `notes`. They are **examples for implementers**, not passing test cases.

| Track | Fixture |
|---|---|
| Evidence | [../04-validation/fixtures/tracks/evidence/basic-supported-claim.json](../04-validation/fixtures/tracks/evidence/basic-supported-claim.json) |
| Diff | [../04-validation/fixtures/tracks/diff/simple-doc-change.json](../04-validation/fixtures/tracks/diff/simple-doc-change.json) |
| Confidence | [../04-validation/fixtures/tracks/confidence/partial-source-coverage.json](../04-validation/fixtures/tracks/confidence/partial-source-coverage.json) |
| Escalation | [../04-validation/fixtures/tracks/escalation/tiny-model-not-enough.json](../04-validation/fixtures/tracks/escalation/tiny-model-not-enough.json) |
| Context Selection | [../04-validation/fixtures/tracks/context-selection/select-relevant-docs.json](../04-validation/fixtures/tracks/context-selection/select-relevant-docs.json) |
| Model Profiling | [../04-validation/fixtures/tracks/model-profiling/simple-model-scorecard.json](../04-validation/fixtures/tracks/model-profiling/simple-model-scorecard.json) |

## Implementation Plan

See [track-catalog-expansion-plan.md](./track-catalog-expansion-plan.md) for phased rollout, prerequisites, and explicit non-goals.

## Related

- [core-tracks.md](./core-tracks.md) — implemented and planned base types
- [track-registry.md](./track-registry.md) — current catalog (two workflow tracks)
- [fallback-and-validation.md](./fallback-and-validation.md) — validation today; escalation not built
- [future-dag-runner.md](./future-dag-runner.md) — graph runner research (not implemented)
