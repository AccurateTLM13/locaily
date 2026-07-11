# Milestone Map

Layered planning, not a six-month prophecy.

**Updated:** 2026-07-11

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

## Relay Nodes & Distributed Capability Network (M4)

**Status:** Complete (2026-07-11)

- Relay Node protocol + connector module (`companion/relay/*`)
- Node registry with capabilities + health (`/relay/nodes`, `/relay/register`, `/relay/heartbeat`, `/relay/unregister`)
- Capability advertisement through registration
- Cross-node routing with local fallback, wired into track + workflow step execution
- Memory Bridge v1: structured search + writeback-apply (opt-in)

**Completion note:** [milestone-4-relay-nodes-completion.md](./milestone-4-relay-nodes-completion.md)
**Protocol doc:** [../05-integrations/relay-node-protocol.md](../05-integrations/relay-node-protocol.md)
**Acceptance:** `scripts/test-relay-e2e.cjs` (11/11) — two Local Brain instances, discovery, routing to node B, local fallback on node failure.

---

## Multi-Device Workflow Coordination (M5)

**Status:** Complete (2026-07-11)

- Placement planner (`companion/relay/placement.js`): step-to-node assignment across healthy relay nodes
- `distribute` policy spreads model steps across capable nodes (least-loaded); tool steps stay local
- `POST /relay/plan` placement preview endpoint
- `executeStepWithAssignedNode` routes each step to its assigned node; local fallback + `RELAY_FALLBACK` audit on failure
- Wired into `/tracks/run` and `/workflows/run`; responses include `relay_placement` summary
- `local_first` / `local_only` placement policies; M4 policies (`prefer_relay`, `route_if_unavailable`) unchanged

**Completion note:** [milestone-5-multi-device-workflow-coordination.md](./milestone-5-multi-device-workflow-coordination.md)
**Acceptance:** `scripts/test-multi-device-e2e.cjs` (22/22) — three Local Brain instances, distributed run across two relay nodes, local fallback after a node is killed; `scripts/test-relay-placement.cjs` (13/13).

---

## Research - Planner-Generated DAG

**Status:** Archive-ready research

- See [../02-track-system/future-dag-runner.md](../02-track-system/future-dag-runner.md)
