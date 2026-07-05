# Future Tracks

**Status:** Draft catalog — not implemented. No `*.track.json` files exist for these tracks yet.

This document is a short index of future Track ideas. Detailed per-track contracts are in [future-track-catalog.md](./future-track-catalog.md).

## Catalog Index

| Track | Track ID | Status | Doc section |
|---|---|---|---|
| Evidence Track | `governance.evidence_check` | Draft / idea | [future-track-catalog.md](./future-track-catalog.md#evidence-track) |
| Diff Track | `content.doc_diff` | Draft / idea | [future-track-catalog.md](./future-track-catalog.md#diff-track) |
| Confidence Track | `governance.confidence_score` | Draft / idea | [future-track-catalog.md](./future-track-catalog.md#confidence-track) |
| Escalation Track | `routing.escalation_ladder` | Draft / idea | [future-track-catalog.md](./future-track-catalog.md#escalation-track) |
| Context Selection Track | `memory.context_selection` | Draft / idea | [future-track-catalog.md](./future-track-catalog.md#context-selection-track) |
| Model Profiling Track | `garage.model_profiling` | Draft / idea | [future-track-catalog.md](./future-track-catalog.md#model-profiling-track) |
| Capability Discovery Track | `capability.discovery` | Future / Relay Node-dependent | [future-track-catalog.md](./future-track-catalog.md#capability-discovery-track-future-only) |

## Prerequisites

Before any future Track can be implemented:

1. Canonical Track Run Records are in place and stable (active build slice)
2. Tracks continue using declarative `input_map` only (no legacy fallbacks)
3. Model Lab qualification is available for the target contract
4. Scaffolding and validation patterns are proven by the two current proof Tracks

## Related

- [core-tracks.md](./core-tracks.md) — implemented and planned base types
- [track-registry.md](./track-registry.md) — current catalog (two workflow tracks)
- [track-catalog-expansion-plan.md](./track-catalog-expansion-plan.md) — rollout proposal
- [fallback-and-validation.md](./fallback-and-validation.md) — validation today
