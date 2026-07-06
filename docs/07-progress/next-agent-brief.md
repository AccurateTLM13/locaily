# Next Agent Brief

Hand this to Cursor, Claude, Codex, or any coding agent continuing Locaily work.

**Updated:** 2026-07-05 (Durable Enforcement Policy complete)

## Read First

1. [../00-start-here/current-state.md](../00-start-here/current-state.md)
2. [active-build-slice.md](./active-build-slice.md)
3. [build-status.md](./build-status.md)
4. [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md)
5. [benchmark-lab/OPERATOR_GUIDE.md](../../benchmark-lab/OPERATOR_GUIDE.md)
6. [../00-start-here/north-star-local-capability-network.md](../00-start-here/north-star-local-capability-network.md)

Also: root [AGENTS.md](../../AGENTS.md) and [../08-agents/agent-context.md](../08-agents/agent-context.md)

## Important: Benchmark Lab Status

**Benchmark Lab Milestone 1 is complete and operator-ready.** The following are implemented and should not be treated as ongoing work:

- CLI commands: run, review, compare, promote, matrix, probe, diagnose, report, model-card, qualification, checksum-verify
- 14 schemas with validation
- Mock + Ollama + ToolEvalRuntime adapters
- Evidence promotion, approval, and checksum verification workflow
- Qualification-record generation (CLI + runtime loader)
- Execution-router with native/policy-routed/runtime-constrained modes
- Model capability probing with cached results and suite requirement checking
- Read-only `/benchmark/status` on the Local Brain
- Published evidence, model cards, reports for intent-classification and basic-tool-use tracks
- Tool Eval Bench compatibility slice (8 scenarios, PARTIAL verdict support)

Do not modify completed evidence or qualification artifacts without an explicit task. Do not broaden claims from narrow benchmark evidence (e.g., do not claim broad model superiority from single-track results).

Broader model, track, hardware, prompt regression, and live qualification coverage remains follow-on work but is not yet scoped or scheduled. Do not implement a follow-on milestone without an explicitly supplied objective.

Preserve runtime separation: Local Brain may consume compact qualification artifacts but must not import `benchmark-lab/engine/` modules.

## Completed

### Canonical Track Run Records

The canonical Track Run Record schema, builder, and two Benchmark Lab runner integrations are **complete**.

### The Crew Runtime Track Run Record Emission

The companion track runner (`companion/crew/orchestrator.js`), workflow plan executor (`companion/orchestration/run-plan-executor.js`), and both endpoint handlers (`/tracks/run`, `/workflows/run`) emit canonical Track Run Records after every execution. Records are persisted to the append-only store at `data/evidence/track-run-records/`, include per-step child records, reference audit records via correlation ID, and are returned as additive evidence fields in endpoint responses. Failed executions also produce records.

### Pit Crew → The Crew Code Path Migration

The legacy `companion/pit-crew/` directory has been renamed to `companion/crew/`, and all active documentation and code references have been updated. The rename is purely structural — no orchestration behavior, endpoint contracts, or runtime semantics changed.

### Qualification Evidence Consumption

Qualification records from Benchmark Lab are now consumed by a six-state resolution engine (`companion/core/qualification-resolver.js`) that maps raw qualification records to actionable states: `qualified`, `unqualified`, `expired`, `stale`, `invalid`, and `untested`. A Capability Registry (`companion/core/capability-registry.js`) surfaces qualification state per model+role+track combination. An Evidence Linker (`companion/evidence/qualification-evidence-linker.js`) connects qualifications to Track Run Records. A dry-run routing recommendation endpoint (`POST /qualifications/dry-run`) explains why a capability would or would not be eligible without changing routing behavior. Read-only endpoints expose qualification state (`GET /qualifications/*`, `GET /capabilities`). The `/health` response includes qualification summary. No routing behavior was changed — current routing remains advisory policy by default. 25 tests cover all six states in `scripts/test-qualification-resolver.js`.

### Qualification-Aware Shadow Routing

A shadow routing engine (`companion/core/shadow-routing.js`) now compares current routing decisions against qualification-backed recommendations without changing execution. For every eligible Track run, the router computes: the recommended capability (best qualified model for the role+track), the comparison state (agree, disagree, no-qualified-capability, insufficient-evidence, current-selection-unqualified, recommendation-unavailable), and supporting reasoning. The comparison is recorded in Track Run Records via an optional `routing.shadowRecommendation` field — the canonical schema is preserved with an extension, not a new record format. No routing behavior changes: `enforced` is always `false`. The shadow router is wired into `executeModelStep()` via `buildModelRoutingOptions()` in server.js, so all model steps across every track produce shadow comparison data. 31 tests cover all comparison states and builder integration in `scripts/test-shadow-routing.js`.

### Shadow Routing Evidence Review and Enforcement Policy

An enforcement policy engine (`companion/core/enforcement-policy.js`) now defines 5 rollout states per track: `disabled`, `shadow`, `eligible`, `enforced`, `suspended`. The default is `shadow` — observe only. The policy evaluates enforcement eligibility across 8+ conditions: track enforcement state, qualification state (`qualified` required), score threshold (default 0.7), active overrides, runtime availability, model readiness, track approval, and comparison state validity. A shadow evidence review layer (`companion/evidence/shadow-evidence-review.js`) aggregates Track Run Record shadow comparisons into statistics: agreement rate, disagreement rate, coverage rate, per-track breakdowns. Enforcement endpoints: `GET /enforcement/status` (policy summary + evidence review), `POST /enforcement/set` (set track state), `POST /enforcement/approve` (approve track for enforcement), `POST /enforcement/override` (block specific recommendation), `GET /enforcement/review` (detailed review per track), `GET /enforcement/eligibility` (check if a recommendation is eligible). All enforcement is off by default. 60 tests cover all eligibility conditions, CRUD, and evidence review.

### Guarded Enforcement Integration

Enforcement evaluation is now integrated into the canonical model router (`companion/crew/model-router.js`). The routing sequence: current selection → shadow recommendation → policy evaluation → final selection → execution. Enforcement decision recorded in Track Run Records via optional `routing.enforcementDecision`. Fallback: enforced capability failure triggers re-execution with original selected model. Evidence review extended with enforcement outcome metrics (attempts, applied, blocked, fallback, success rates). Additive endpoints: `GET /enforcement/pilot`, `GET /enforcement/decisions`. Safe state change enforcement on `POST /enforcement/set`. 83 tests cover all policy states, eligibility failures, routing evidence, runtime failures, and compatibility.

### Durable Enforcement Policy

Enforcement policy configuration is now durable across companion server restarts (`companion/core/enforcement-policy-store.js`). Atomic persistence via writeFile + rename to `data/policy/enforcement-policy.json`. Synchronous eager init at startup; async mutations serialized through a queue. Full state transition graph: disabled↔shadow→eligible↔enforced, eligible↔suspended, enforced→{eligible,shadow}, suspended→{shadow,eligible,disabled}. Compound mutations for approval/revocation. Override CRUD with composite key identity (trackId+role+modelId). Corrupt-file fallback with lock preserves existing data. Append-only JSONL audit (`companion/core/enforcement-policy-audit.js`, `data/enforcement-policy-audit.jsonl`) for all 10 event types, validated against `enforcement-policy-audit-event.schema.json`. Canonical policy document schema (`companion/schemas/internal/enforcement-policy.schema.json`) with `additionalProperties: false`. Pure in-memory mode when no dataDir for test isolation. Additive endpoints: `GET /enforcement/policy`, `POST /enforcement/revoke`, `POST /enforcement/override/clear`. 123 store tests in `scripts/test-enforcement-policy-store.js`. Wrapper at `companion/core/enforcement-policy.js` updated with sync legacy seeding via `syncApi`.

## Current Task

Durable Enforcement Policy is complete. **No pilot Track activated** — no companion track has a current, valid `qualified` model capability with sufficient shadow routing evidence. All tracks remain in shadow mode. Enforcement machinery is durable, tested, and ready for pilot activation.

## Next Task

Pilot Enforcement Validation and Multi-Model Track Expansion. Activate enforcement for one qualified track once qualification evidence exists. Expand multi-model testing with runtime performance feedback. Add human correction records. Broader model qualification coverage and live qualification depth.

## Do Not

- Modify completed evidence or qualification artifacts without an explicit task
- Broaden claims from narrow benchmark evidence
- Implement a follow-on milestone or qualification-coverage expansion without an explicitly supplied objective
- Implement automatic model swapping / Model Garage auto-switching
- Claim DAG support, Relay Node routing, or automatic track classification exists
- Remove legacy `step-input.js` fallbacks until Lighthouse parity work resumes — **done 2026-06-30**
- Break existing Local Brain endpoints or response envelopes
- Implement RelayNode routing, hardware recommendations, or remote execution dispatch in this slice
- Import `benchmark-lab/engine/` modules from the Local Brain companion or any code under `companion/`
- Enable enforcement for any Track without explicit evidence review
- Modify the qualification-resolver, capability-registry, evidence-linker, shadow-routing, enforcement-policy, enforcement-policy-store, enforcement-policy-audit, or shadow-evidence-review modules unless extending them for enforcement
- Modify the policy schema (`companion/schemas/internal/enforcement-policy.schema.json`) or audit event schema (`companion/schemas/internal/enforcement-policy-audit-event.schema.json`) without updating all consumers
- Enable global enforcement — per-track states only
- Hardcode absolute filesystem paths in enforcement API responses

## Architecture Reminder

```txt
Workflow requests -> run plans -> track steps.
Models plug into tracks.
Tools plug into tracks.
Track JSON declares input_map for tool and model steps.
Internal orchestration state is JSON; Markdown is export-only.
Benchmark Lab produces evidence and qualification records.
Canonical track-run records are the first evidence loop artifact.
Local Brain consumes compact qualification records, not raw benchmark runs.
Local Brain must not import benchmark-lab/engine/ modules.
Relay Nodes may provide track capabilities in the future.
RelayNodes are future approved remote execution targets, not control planes.
Workflows compose tracks.
Validation scores tracks.
Local Brain dispatches tracks - not raw model names.
Target routing principle: smallest qualified capability.
```

## Quick Code Map

| Concern | Path |
|---|---|
| Server | `companion/server.js` |
| Workflow orchestration | `companion/orchestration/` |
| Track run | `companion/crew/orchestrator.js` |
| Track files | `companion/crew/tracks/` |
| Step input | `companion/crew/step-input.js`, `input-map-resolver.js` |
| Model / tool routers | `companion/crew/model-router.js`, `tool-router.js` |
| Tools | `companion/tools/registry.js`, `tool-packs/` |
| Benchmark Lab | `benchmark-lab/`, `companion/core/model-qualification-loader.js` |
| Qualification Resolver | `companion/core/qualification-resolver.js` (six-state resolution engine) |
| Capability Registry | `companion/core/capability-registry.js` (qualification-aware capability index) |
| Qualification Evidence Linker | `companion/evidence/qualification-evidence-linker.js` (links quals to Track Run Records) |
| Shadow Router | `companion/core/shadow-routing.js` (compares current routing vs qualification recommendation) |
| Enforcement Policy | `companion/core/enforcement-policy.js` (per-track enforcement states, eligibility evaluation, durable store wrapper) |
| Enforcement Policy Store | `companion/core/enforcement-policy-store.js` (durable persistence with atomic writes, state transitions, override CRUD, corrupt-file recovery) |
| Enforcement Policy Audit | `companion/core/enforcement-policy-audit.js` (append-only JSONL audit log with schema validation) |
| Policy Schema | `companion/schemas/internal/enforcement-policy.schema.json` (canonical policy document schema with additionalProperties: false) |
| Audit Event Schema | `companion/schemas/internal/enforcement-policy-audit-event.schema.json` (10 event types with before/after and revision) |
| Shadow Evidence Review | `companion/evidence/shadow-evidence-review.js` (aggregates shadow comparison statistics) |
| Proof workflows | `lighthouse-handoff.track.json`, `dealsniper.track.json` |

## Before Reporting Success

Run the appropriate non-live validation commands:

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
node scripts/test-enforcement-policy-store.js
node scripts/test-enforcement-policy.js
node scripts/test-enforcement-routing.js
```

Do not require a live Ollama runtime unless your changes specifically affect Ollama interaction. If the companion server is running, also run:

```powershell
node scripts/smoke-test.js
```

## When Done

Add an entry to [progress-log.md](./progress-log.md) and update [build-status.md](./build-status.md) if status changed.
