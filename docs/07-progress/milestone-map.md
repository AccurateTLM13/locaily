# Milestone Map

Layered planning, not a six-month prophecy.

**Updated:** 2026-06-26

## Milestone 1A - Track System Explicit

**Status:** Complete

- Document core tracks, track registry, workflow registry
- First proof track: `website_audit.lighthouse_handoff`
- Validation evidence linked per workflow

**Exit criteria:** Agent brief + track docs match code; no false DAG/classifier claims.

---

## Milestone 1B - Declarative Step Input

**Status:** Complete

- `input_map` in track JSON + resolver in `input-map-resolver.js`
- Lighthouse track migrated off hardcoded step ids

---

## Milestone 2 - Second Workflow Track

**Status:** Complete - `marketplace.dealsniper` track merged (PR #7)

- DealSniper track with declarative `input_map` only
- Generic `result_step` / `verification_step` in orchestrator
- Proves two tracks share runner without router forks

---

## Milestone 3 - Model-Step Input Mapping

**Status:** Complete

- Declarative `input_map` for model steps via shared `step-input.js`
- Lighthouse `prioritize_fixes` migrated off broad context reads in prompts
- Legacy prompt context fallback retained with deprecation comment

---

## Milestone 4 - Track-Based Orchestration

**Status:** Complete

- Workflow registry + enriched track registry (`companion/orchestration/`)
- Run plan builder and step-by-step executor
- `GET /orchestration/tracks`, `GET /orchestration/workflows`, `POST /workflows/plan`, `POST /workflows/run`
- Lighthouse Handoff first workflow target with audit logging

**Completion note:** [milestone-4-completion.md](./milestone-4-completion.md)

---

## Milestone 5 - Benchmark Lab

**Status:** Active / accepted next milestone

**Checkpoint:** [milestone-5-checkpoint.md](./milestone-5-checkpoint.md)

- Keep Benchmark Lab in-repo while qualification records and evidence contracts depend on Locaily runtime schemas
- Validate qualification records before runtime model routing consumes them
- Keep `GET /benchmark/status` read-only and side-effect free
- Preserve Local Brain endpoint envelopes
- Avoid broad benchmark claims beyond committed evidence

---

## Follow-On Hardening - Lighthouse Path / Step Fallbacks

**Status:** After Benchmark Lab acceptance

- Confirm canonical Lighthouse path (tool vs track vs workflow orchestration)
- Extend parity checks across `/tasks/run`, `/tracks/run`, and `/workflows/run`
- Remove `buildLegacyToolStepInput()` / `buildLegacyModelStepInput()` from `step-input.js` after parity tests
- Improve `workflow-orchestrator` audit summaries without leaking raw task input/output

---

## Later - Model Swap / Model Garage Runtime Policy

**Status:** Proposed architecture only

- `docs/01-architecture/model-swap-manager.md` is design context, not an M5 runtime promise
- No automatic model swapping until a dedicated milestone opens it

---

## Later - Simple Dependency Graph

**Status:** Research gate

- Topological runner for explicit `depends_on` in track files
- Still no LLM-generated graphs

---

## Future - NearbyNode

**Status:** Not built

- Capability connector protocol
- Device pairing - see [../01-architecture/nearby-node.md](../01-architecture/nearby-node.md)

---

## Research - Planner-Generated DAG

**Status:** Archive-ready research

- See [../02-track-system/future-dag-runner.md](../02-track-system/future-dag-runner.md)
