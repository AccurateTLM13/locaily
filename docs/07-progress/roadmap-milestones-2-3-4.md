# Roadmap: Milestones 2–4

**Updated:** 2026-07-11 (M2 complete)

Builds on completed Milestone 1 (Track System, Benchmark Lab, Lighthouse Handoff product loop) and Milestone 2 (Multi-Track Qualification). Each milestone is independently shippable and has explicit stop conditions.

## Milestone 2: Multi-Track Qualification & Enforcement

**Theme:** Expand the qualification pipeline from one track to many.

### Scope

| Area | Deliverable |
|---|---|
| **accessibility_deep** | Qualify model(s) for a11y_analyzer and a11y_recommender roles. Enforce on `website_audit.accessibility_deep`. Build quality gate. |
| **performance_budget** | Qualify model(s) for budget_analyzer and budget_recommender roles. Enforce on `website_audit.performance_budget`. Build quality gate. |
| **seo_audit** | Qualify model(s) for seo_analyzer and seo_recommender roles. Enforce on `website_audit.seo_audit`. Build quality gate. |
| **DealSniper** | Qualify model role(s) for `marketplace.dealsniper`. Build human gate and evidence loop. |
| **Multi-model qualification** | Qualify at least one additional model (e.g., LFM-8B, Llama 3.2) across multiple tracks. Establish cross-model enforcement. |
| **Qualification dashboard** | Read-only endpoint showing per-model, per-track, per-role qualification status across all capabilities. |

### Status

**COMPLETE** — Implemented 2026-07-11. See `docs/06-decisions/decision-log.md` and `docs/07-progress/progress-log.md` for details.

M3 phases:
- **Phase 1–3 (done):** DAG graph engine, DAG executor, `/tracks/run` DAG mode, track planner tool, `POST /tracks/plan`, DAG tests (14 + 9).
- **Phase 4 (done 2026-07-11):** DAG integration into `run-plan-executor.js` for workflow orchestration (level-ordered parallel execution), planner qualification gating, DAG documentation (`docs/02-track-system/dag-execution.md`), and a `reasoning_worker` qualification so the planner uses evidence (no blind LLM calls).

Remaining (out of original scope, optional): CI workflow to run DAG tests automatically (no CI infra exists in repo yet).

### Acceptance Criteria (all met)

- 3 new website audit tracks have qualified roles and **shadow-enforced execution** (pilot enforcement available; per-track only, no global broadening)
- DealSniper has 1+ qualified role and functional human gate
- At least 2 models qualified across overlapping tracks (lfm25-1p2b-thinking-local + llama3.2-local)
- All new tracks pass: schema validation, contract tests, smoke tests
- No global enforcement broadening (per-track only)

### Stop Conditions

- Do not modify existing Lighthouse roles or enforcement
- Do not modify Benchmark Lab engine internals
- Do not build UI beyond read-only status endpoints
- Each track qualified independently — do not broad-brush qualify all at once

### Effort Estimate

**Medium (3–5 agent sessions).** Each track requires: qualification evaluation → evidence promotion → enforcement activation → gate build → validation.

---

## Milestone 3: Dynamic Track Planning & DAG Execution

**Theme:** Move from linear pipeline execution to graph-stage planning.

### Scope

| Area | Deliverable |
|---|---|
| **Track planner** | Model-backed tool that accepts a free-form request and decomposes it into a run plan (ordered step sequence with dependency edges). |
| **DAG runner** | Track runner that executes steps in dependency order (not file order). Parallel execution of independent steps. |
| **Plan → Run bridge** | Planner output feeds directly into the existing `POST /workflows/plan` and `POST /workflows/run` endpoints. |
| **Graph validation** | Schema and validator for DAG plans: detect cycles, unreachable steps, missing inputs. |
| **Track classification** | Model-backed classifier that maps a user request to the best track(s) + roles. Optional bridge from free-form request → track id. |

### Acceptance Criteria

- Free-form request "audit example.com for performance and a11y" produces a valid DAG plan
- DAG runner executes independent performance/a11y steps in parallel
- Cycle detection blocks invalid plans with clear error
- Existing linear track JSON files run unchanged (backward compatible)
- All existing tests still pass

### Stop Conditions

- Do not remove linear track runner (keep as fallback)
- Do not implement Relay Node routing in this milestone
- Do not replace existing `/tracks/run` contract — only add `/tracks/plan` + DAG mode
- Planner model role must use qualified capability with evidence (no blind LLM calls)

### Effort Estimate

**Large (6–10 agent sessions).** Core architectural change to the track runner.

---

## Milestone 4: Relay Nodes & Distributed Capability Network

**Theme:** Move from single-machine to nearby-device capability routing.

### Scope

| Area | Deliverable |
|---|---|
| **Relay Node protocol** | HTTP-based protocol spec for nearby devices to register capabilities, accept work, return results. Implement connector module. |
| **Node registry** | Worker/capability registry that tracks available relay nodes, their capabilities, and health status. |
| **Capability advertisement** | Relay nodes broadcast available capabilities (model roles, tool packs, hardware profiles). |
| **Cross-node routing** | Local Brain can route a track step to a qualified relay node when local capability is unavailable or lower-ranked. |
| **Memory Bridge v1** | Upgrade Memory Bridge from v0 (compose-handoff only) to include: apply/search/embeddings. Support relay node memory access with consent. |

### Acceptance Criteria

- 2+ machines can discover each other through the Relay Node protocol
- Local Brain routes a track step to a relay node and receives valid results
- Relay node failure triggers local fallback with audit trail
- Memory Bridge v1 supports structured search and writeback-apply
- All existing tests still pass (backward compatible)
- End-to-end: Lighthouse Handoff runs on machine A with model step executed on machine B

### Stop Conditions

- Do not expose Local Brain to public network (localhost-only by default)
- Do not implement automatic model swapping / Model Garage within this milestone
- Relay nodes are execution targets only — not control planes
- Memory Bridge v1 must be opt-in with explicit vault path configuration
- Do not claim distributed consensus or Byzantine fault tolerance

### Effort Estimate

**Large (8–12 agent sessions).** New protocol, registry, routing logic, and memory upgrade.

### Status

**COMPLETE** — Implemented 2026-07-11. See `docs/05-integrations/relay-node-protocol.md` and `docs/07-progress/milestone-4-relay-nodes-completion.md`.

M4 deliverables:

- Relay Node protocol + connector module (`companion/relay/*`)
- Node registry with capabilities + health (`/relay/nodes`, `/relay/register`, `/relay/heartbeat`, `/relay/unregister`)
- Capability advertisement through registration
- Cross-node routing with local fallback wired into track and workflow step execution
- Memory Bridge v1: structured search (`/memory/search`) + writeback-apply (`/memory/writeback/apply`, opt-in)

Acceptance criteria (all met and verified by `test:relay:e2e` + `test:memory-v1`):

- 2+ machines discover each other through the relay registry
- Local Brain routes a track step to a relay node and receives valid results
- Relay node failure triggers local fallback with an audit trail
- Memory Bridge v1 supports structured search and writeback-apply
- All existing tests still pass (backward compatible)
- End-to-end: Lighthouse Handoff runs on machine A with model steps executed on machine B

Stop conditions honored:

- Local Brain remains localhost-only by default
- No automatic model swapping / Model Garage within this milestone
- Relay nodes are execution targets only — not control planes
- Memory Bridge v1 is opt-in with explicit vault path configuration
- No distributed consensus or Byzantine fault tolerance claimed

---

## Dependency Graph

```
M2: Multi-Track Qualification
  └─ depends on: existing qualification engine, enforcement policy, tracks
  └─ unlocks: more capable Local Brain across more domains

M3: DAG Execution + Track Planner
  └─ depends on: existing track runner, orchestrator
  └─ unlocks: free-form request → structured execution
  └─ NOTE: Can start independently of M2

M4: Relay Nodes + Distributed Network
  └─ depends on: existing Local Brain, provider router
  └─ ideal after M3 (DAG routing makes multi-node dispatch more useful)
  └─ NOTE: Could start in parallel with M3 with separate scope
```

M2 and M3 are independent — they can be worked in either order or in parallel. M4 benefits from M3 but does not strictly require it.

## Risk Notes

- **M2 risk:** Qualification is expensive (model eval runs). Mitigation: reuse existing Benchmark Lab pipeline; qualify incrementally per track.
- **M3 risk:** DAG runner is a deep change to the track execution path. Mitigation: keep linear runner as fallback; run DAG as opt-in mode.
- **M4 risk:** Multi-machine coordination introduces network failure modes. Mitigation: treat relay nodes as ephemeral — never store state only on the node; fallback to local always available.
