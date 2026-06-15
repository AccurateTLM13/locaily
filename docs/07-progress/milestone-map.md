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

## Milestone 3 — Model-Step Input Mapping

**Status:** **Complete**

- Declarative `input_map` for model steps via shared `step-input.js`
- Lighthouse `prioritize_fixes` migrated off broad context reads in prompts
- Legacy prompt context fallback retained with deprecation comment

---

## Milestone 4 — Track-Based Orchestration

**Status:** **Complete**

- Workflow registry + enriched track registry (`companion/orchestration/`)
- Run plan builder and step-by-step executor
- `GET /orchestration/tracks`, `GET /orchestration/workflows`, `POST /workflows/plan`, `POST /workflows/run`
- Lighthouse Handoff first workflow target with audit logging

---

## Milestone 5 — Legacy Fallback Removal (Next)

**Status:** Not started

- Remove `buildLegacyToolStepInput()` / `buildLegacyModelStepInput()` from `step-input.js`
- All current catalog tracks declare `input_map` on every step

---

## Milestone 6 — Model Garage Evidence (Later)
**Status:** Spec only

- Evaluation harness using [../99-archive/research-notes/model-evaluation-template.md](../99-archive/research-notes/model-evaluation-template.md)
- Scoreboard baselines with logged runs
- No benchmark marketing without data

---

## Milestone 7 — Simple Dependency Graph (Later)
**Status:** Research gate

- Topological runner for explicit `depends_on` in track files
- Still no LLM-generated graphs

---

## Milestone 8 — NearbyNode (Future)

**Status:** Not built

- Capability connector protocol
- Device pairing — see [../01-architecture/nearby-node.md](../01-architecture/nearby-node.md)

---

## Milestone 9 — Planner-Generated DAG (Research)

**Status:** Archive-ready research

- See [../02-track-system/future-dag-runner.md](../02-track-system/future-dag-runner.md)
