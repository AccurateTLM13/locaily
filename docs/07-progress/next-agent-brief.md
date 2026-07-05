# Next Agent Brief

Hand this to Cursor, Claude, Codex, or any coding agent continuing Locaily work.

**Updated:** 2026-07-05 (Shadow Routing Evidence Review and Enforcement Policy complete)

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

## Current Task

The next step is Guarded Enforcement for One Track. This includes:

1. Select one low-risk Track with existing approved qualification evidence, multiple tested model candidates, deterministic validation, and reliable fallback behavior.
2. Based on current Benchmark Lab history, the safest candidate is likely `intent-classification` — it has approved qualification records and a simple deterministic validation path.
3. Enable the track for enforcement: set state to `eligible` (not `enforced`), approve the track, verify no overrides block the recommendation.
4. Run the companion with the track in eligible mode — verify shadow routing continues to record comparisons.
5. If the evidence review shows strong agreement and no issues, promote to `enforced` for that single track.
6. Record routing outcome in Track Run Records with the enforced recommendation.
7. Compare enforced runtime results against prior shadow predictions.
8. Do not enable enforcement for any other track.
9. Re-run relevant smoke, contract, schema, and track evidence tests after changes.

## Do Not

- Modify completed evidence or qualification artifacts without an explicit task
- Broaden claims from narrow benchmark evidence
- Implement a follow-on milestone or qualification-coverage expansion without an explicitly supplied objective
- Implement automatic model swapping / Model Garage auto-switching
- Claim DAG support, Relay Node routing, or automatic track classification exists
- Break existing Local Brain endpoints or response envelopes
- Implement RelayNode routing, hardware recommendations, or remote execution dispatch in this slice
- Import `benchmark-lab/engine/` modules from the Local Brain companion or any code under `companion/`
- Change active routing behavior for more than the single selected Track
- Enable enforcement for any Track without explicit evidence review
- Modify the qualification-resolver, capability-registry, evidence-linker, shadow-routing, enforcement-policy, or shadow-evidence-review modules unless extending them for enforcement
- Enable global enforcement — per-track states only

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
| Enforcement Policy | `companion/core/enforcement-policy.js` (per-track enforcement states, eligibility evaluation) |
| Shadow Evidence Review | `companion/evidence/shadow-evidence-review.js` (aggregates shadow comparison statistics) |
| Proof workflows | `lighthouse-handoff.track.json`, `dealsniper.track.json` |

## Before Reporting Success

Run the appropriate non-live validation commands:

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
```

Do not require a live Ollama runtime unless your changes specifically affect Ollama interaction. If the companion server is running, also run:

```powershell
node scripts/smoke-test.js
```

## When Done

Add an entry to [progress-log.md](./progress-log.md) and update [build-status.md](./build-status.md) if status changed.
