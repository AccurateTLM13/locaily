# Track Catalog Expansion Plan

**Status:** Planning doc — docs/spec scaffolding only. No runtime changes in this milestone.

## Goal

Give Locaily a **draft catalog** of governance, routing, memory, and Model Garage tracks so Milestone 2+ agents can implement workflow steps without re-inventing contracts or conflicting with the linear runner.

## What Was Added (This PR)

| Artifact | Purpose |
|---|---|
| [future-tracks.md](./future-tracks.md) | Index, routing diagram, fixture map |
| [future-track-catalog.md](./future-track-catalog.md) | Per-track contracts and failure modes |
| [track-catalog-expansion-plan.md](./track-catalog-expansion-plan.md) | This rollout plan |
| `docs/04-validation/fixtures/tracks/**` | Draft example inputs/output shapes |

## What Was Intentionally Not Implemented

- No new `companion/pit-crew/tracks/*.track.json` files
- No changes to `companion/server.js`, orchestrators, or routers
- No DAG runner or `depends_on` execution
- No NearbyNode connectors or Capability Discovery runtime
- No automatic track classification or planner
- No Lighthouse Handoff behavior changes
- No production wiring of governance tracks into existing workflows

## Why This Helps Milestone 2 and Beyond

| Milestone | How this catalog helps |
|---|---|
| **M2 — Second workflow track** | DealSniper and future workflows can reference shared Validation + Confidence patterns instead of one-off step logic |
| **M4 — Model Garage** | Model Profiling Track fixture shape matches planned harness output |
| **FallbackHandler work** | Escalation Track spec matches gap-analysis ladder without premature code |
| **Memory Bridge v1+** | Context Selection Track defines bounded context contract ahead of embedding search |
| **M5 — Simple dependency graph** | Tracks remain linear step lists; catalog does not assume DAG |

## Prerequisites Before Implementing Any Catalog Track

1. At least two workflow tracks use declarative `input_map` only (Milestone 1B + M2)
2. FallbackHandler or orchestrator hook accepts per-step `on_failure` policy (not built)
3. New tool pack tasks or core modules registered without `buildLegacyStepInput()` branches
4. Validation evidence recorded per track in [../04-validation/evidence-log.md](../04-validation/evidence-log.md)
5. Decision entry in [../06-decisions/decision-log.md](../06-decisions/decision-log.md) for tracks that change API envelopes

## Phased Rollout (Proposed)

### Phase A — Deterministic governance tools (lowest risk)

| Track | Deliverable |
|---|---|
| Evidence | `governance.check_evidence` tool task + unit tests |
| Diff | `content.diff` tool task |
| Confidence | Deterministic scorer tool |

**Exit:** Fixtures copied into harness; smoke runs on mock provider.

### Phase B — Escalation policy module

| Track | Deliverable |
|---|---|
| Escalation | `FallbackHandler` reads ladder from track JSON or workflow config |

**Exit:** Failed model step triggers logged escalation decision; Lighthouse deterministic fallback unchanged.

### Phase C — Memory composition

| Track | Deliverable |
|---|---|
| Context Selection | Step wrapping Memory Bridge adapter; opt-in per workflow |

**Exit:** New workflow only — no change to default Lighthouse path.

### Phase D — Model Garage harness

| Track | Deliverable |
|---|---|
| Model Profiling | Offline script calling `/tracks/run` with model override + fixture refs |

**Exit:** Scorecard rows in evidence log; no user-facing endpoint required.

### Phase E — NearbyNode (future gate)

| Track | Deliverable |
|---|---|
| Capability Discovery | Requires Milestone 6 decision — do not start from this catalog alone |

## Implementation Checklist (Per Track)

```txt
[ ] Add track section remains accurate in future-track-catalog.md
[ ] Add *.track.json OR embed as reusable step template in workflow track
[ ] Add tool pack tasks with validateInput + schemas
[ ] Add input_map on every tool step
[ ] Add draft fixture → harness case (when harness exists)
[ ] Record evidence in docs/04-validation/
[ ] Update workflow-registry.md if user-facing
[ ] Do NOT mark Implemented in track-registry until smoke/evidence exists
```

## Non-Goals

- LLM-generated track plans
- Cloud offload nodes
- Automatic workflow selection from free-form chat
- Replacing core-tracks.md — future tracks **compose with** core tracks

## Related

- [../07-progress/milestone-map.md](../07-progress/milestone-map.md)
- [../01-architecture/pit-crew-gap-analysis.md](../01-architecture/pit-crew-gap-analysis.md)
- [fallback-and-validation.md](./fallback-and-validation.md)
