# Blockers

Active impediments. Remove items when resolved; log resolution in [progress-log.md](./progress-log.md).

**Updated:** 2026-07-04

## Open

| Blocker | Impact | Mitigation |
|---|---|---|
| Extension ↔ Local Brain HTTP bridge not implemented | L4 validation blocked | Spec: [../03-workflows/lighthouse-handoff-extension-integration.md](../03-workflows/lighthouse-handoff-extension-integration.md) |
| No persistent job status API (`GET /jobs/{id}/status`) | Clients cannot poll long track runs | In-memory jobs exist today; persistence is future work |
| Canonical Track Run Record schema not yet defined | Active build slice cannot begin implementation | Schema definition is the first task of the active slice |

## Resolved

| Blocker | Resolution |
|---|---|
| Step input mapping hardcoded for Lighthouse | Resolved by M2 (DealSniper track) and declarative `input_map` — see [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md) |
| Crew embedded only in lighthouse tool | Extracted to `companion/crew/` — see gap analysis |
| No `/tracks/run` endpoint | Implemented — proof track on mock provider |
| Benchmark Lab acceptance | Milestone 1 complete and operator-ready |

## Not Blockers (Explicitly Deferred)

- DAG runner / graph planner
- Relay Node protocol and connectors
- Automatic track classifier
- Desktop Companion UI
- Broader model qualification coverage (follow-on work, not required by active slice)
