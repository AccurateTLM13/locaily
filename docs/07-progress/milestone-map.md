# Milestone Map

Layered planning, not a six-month prophecy.

**Updated:** 2026-07-04

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

**Status:** Complete — Milestone 1 operator-ready

**Checkpoint (historical):** [milestone-5-checkpoint.md](./milestone-5-checkpoint.md)

- CLI commands: run, review, compare, promote, matrix, probe, diagnose, report, model-card, qualification, checksum-verify
- Mock + Ollama + ToolEvalRuntime adapters
- 14 schemas with validation
- Evidence promotion, approval, and checksum verification workflow
- Qualification-record generation consumed by runtime routing
- Execution-router with native/policy-routed/runtime-constrained modes
- Model capability probing with cached results and suite requirement checking
- Published evidence, model cards, and reports for intent-classification track
- Basic-tool-use track with Tool Eval Bench scenarios

## Next Milestone

**Status:** Not yet selected

The next major milestone has not yet been canonically selected. Follow-on candidates (broader model coverage, additional tracks, hardware profiling, prompt regression) are recognized but not approved scope.

---

## Follow-On Hardening - Lighthouse Path / Step Fallbacks

**Status:** Step-input legacy fallbacks removed (2026-06-30); remaining items deferred — not yet scoped.

- Confirm canonical Lighthouse path (tool vs track vs workflow orchestration)
- Extend parity checks across `/tasks/run`, `/tracks/run`, and `/workflows/run` — parity test covers workflow + HTTP track/workflow paths
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

## Future — Relay Nodes

**Status:** Not built

- Capability connector protocol (formerly NearbyNode protocol)
- Device pairing — see [Relay Nodes doc](../01-architecture/nearby-node.md)

---

## Research - Planner-Generated DAG

**Status:** Archive-ready research

- See [../02-track-system/future-dag-runner.md](../02-track-system/future-dag-runner.md)
