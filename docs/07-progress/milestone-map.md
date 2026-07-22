# Milestone Map

Layered planning, not a six-month prophecy.

**Updated:** 2026-07-22

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

---

## Milestone 6 - Operator Control Plane

**Status:** Complete (2026-07-12)

- Operator Console UI (`companion/operator/`)
- Durable Job Store API (`POST /jobs`, `GET /jobs`, mutations)
- Background Worker Polling Loop
- Job cancel/retry/review mutation endpoints
- 34 + 64 + 50 + 85 = 233 tests

---

## Milestone 10 - Locaily v1 Packaging

**Status:** Complete (2026-07-22, archived via lifecycle mechanism)

- Documentation alignment, state migration scaffolding, operator walkthrough
- Relay Node pairing walkthrough
- Release positioning and deferred-work documentation

---

## Milestone 12 - Track Learning Evidence Loop

**Status:** Complete (2026-07-18)

- Canonical track-run record schema, builder, store, runtime emission
- Disagreement classification, drift detection, per-track learning state
- Retry comparisons, correction records
- All 14 completion conditions met

---

## Security Policy Foundation

**Status:** Complete (2026-07-22)

- Execution-security documentation (`docs/security/`)
- Threat model, execution policy, approval rules, capability boundaries
- Machine-readable policy definitions (`policies/`)
- NOPE evaluation brief

Policy documented; centralized enforcement not yet complete.

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

## Next Milestone

**Status:** Not yet selected

The next major milestone has not yet been canonically selected. The assessment identifies these candidates in priority order:

### Immediate (operator-facing proof)

1. **Second-Repository Operator Acceptance** — brief manual walkthrough on a real second repository
2. **Clean-Machine v1 Acceptance** — clone-to-cleanup path for non-developer users

### Product proof

3. **Lighthouse Handoff Product Bridge** — extension + Local Brain end-to-end
4. **Workflow Pack Contract and Starter SDK** — complete distributable workflow units
5. **Automatic Task Intake and Track Selection** — classifier-based workflow routing

### Before broader distributed claims

6. **Relay Trust and Secure Pairing (M09A)** — authentication, signed requests, capability allowlists
7. **Physical Multi-Device Pilot (M09B)** — two-device validation (held pending hardware)

Selection requires an explicit operator decision.

---

## Later Milestones (candidates, not yet scoped)

### Central Execution Gate Enforcement

**Status:** Design docs and schemas complete. Implementation not yet scoped.

- Every side effect passes through one policy evaluator
- Design artifacts: `docs/security/`, `policies/`

### Orchestrator Governance and Step Budgets

**Status:** Candidate. Not yet scoped.

- Maximum steps, retries, runtime, cost, parallelism
- Stop conditions, stuck detection, approval checkpoints

### Model Specialization and Adapter Lab

**Status:** Research candidate. Not yet scoped.

- Purpose-built models or adapters for specific Locaily roles
- Compare base vs prompted specialist vs adapter vs deterministic

---

## Follow-On Hardening - Lighthouse Path / Step Fallbacks

**Status:** Step-input legacy fallbacks removed (2026-06-30); remaining items deferred — not yet scoped.

- Confirm canonical Lighthouse path (tool vs track vs workflow orchestration)
- Extend parity checks across `/tasks/run`, `/tracks/run`, and `/workflows/run` — parity test covers workflow + HTTP track/workflow paths
- Improve `workflow-orchestrator` audit summaries without leaking raw task input/output

---

## Later - Model Swap / Model Garage Runtime Policy

**Status:** Proposed architecture only

- `docs/01-architecture/model-swap-manager.md` is design context, not a runtime promise
- No automatic model swapping until a dedicated milestone opens it

---

## Partially Implemented (not future research)

The following are listed as future research in some documents but are **already partially implemented**:

- **DAG planning and execution** — `companion/core/dag-executor.js` + `companion/core/dag-graph.js` implement topological sort, cycle detection, parallel step execution, fan-in/fan-out. Not yet used as default runner.
- **Relay Node distributed execution** — `companion/relay/` implements protocol, registry, connector, router with cross-node routing and local fallback. Physical validation pending (M09 held).

---

## Research - Planner-Generated DAG

**Status:** Archive-ready research

- See [../02-track-system/future-dag-runner.md](../02-track-system/future-dag-runner.md)
