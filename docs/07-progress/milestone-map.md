# Milestone Map

Layered planning — not a six-month prophecy.

**Updated:** 2026-06-15

## Milestone 1A — Track System Explicit

**Status:** **Complete**

- Document core tracks, track registry, workflow registry
- First proof track: `website_audit.lighthouse_handoff`
- Validation evidence linked per workflow

**Exit criteria:** Agent brief + track docs match code; no false DAG/classifier claims.

---

## Milestone 1B — Declarative Step Input

**Status:** **Complete**

- `input_map` in track JSON + resolver in `input-map-resolver.js`
- Lighthouse track migrated off hardcoded step ids

---

## Milestone 2 — Second Workflow Track

**Status:** **Complete** — `marketplace.dealsniper` track merged (PR #7)

- DealSniper track with declarative `input_map` only
- Generic `result_step` / `verification_step` in orchestrator
- Proves two tracks share runner without router forks

---

## Milestone 3 — Model-Step Input Mapping (Next)

**Status:** Not started

- Declarative inputs for model steps (not only tool steps)
- Both Lighthouse and DealSniper tracks declare step data flow in JSON

---

## Milestone 4 — Model Garage Evidence (Later)
**Status:** Spec only

- Evaluation harness using [../99-archive/research-notes/model-evaluation-template.md](../99-archive/research-notes/model-evaluation-template.md)
- Scoreboard baselines with logged runs
- No benchmark marketing without data

---

## Milestone 5 — Simple Dependency Graph (Later)
**Status:** Research gate

- Topological runner for explicit `depends_on` in track files
- Still no LLM-generated graphs

---

## Milestone 6 — NearbyNode (Future)

**Status:** Not built

- Capability connector protocol
- Device pairing — see [../01-architecture/nearby-node.md](../01-architecture/nearby-node.md)

---

## Milestone 7 — Planner-Generated DAG (Research)

**Status:** Archive-ready research

- See [../02-track-system/future-dag-runner.md](../02-track-system/future-dag-runner.md)
