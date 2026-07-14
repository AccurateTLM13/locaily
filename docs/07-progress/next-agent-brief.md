# Next Agent Brief

Hand this to Cursor, Claude, Codex, or any coding agent continuing Locaily work.

**Updated:** 2026-07-14 (M9: pilot infrastructure prepared — hardware profile schema, pilot runner CLI, and multi-device pilot plan documented)

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

### Multi-Device Workflow Coordination (M5)

Built on M4 Relay Nodes. A placement planner (`companion/relay/placement.js`) computes a step-to-node assignment across healthy relay nodes for a track, distributing model steps across capable nodes least-loaded (`distribute` policy), while tool steps stay local. `POST /relay/plan` previews the assignment. `executeStepWithAssignedNode` in `companion/relay/router.js` routes each step to its assigned node and falls back to local execution (with a `RELAY_FALLBACK` audit event) when that node fails or is unhealthy. The assignment is consulted by `executeStepViaRelayIfNeeded` via `options.relay.assignments[stepId]`. Wired into `/tracks/run` and `/workflows/run` when `relay_policy=distribute`; responses include a `relay_placement` summary. Tests: `scripts/test-relay-placement.cjs` (13/13) and `scripts/test-multi-device-e2e.cjs` (22/22, three Local Brain instances, node-failure fallback). M4 policies (`prefer_relay`, `route_if_unavailable`) remain per-step dynamic decisions and unchanged. Tests: `scripts/test-relay-placement.cjs` (14/14), `scripts/test-multi-device-e2e.cjs` (22/22), `scripts/test-relay-unit.cjs` (17/17).

**Post-completion review (2026-07-11) fixed:** (1) `registry.selectForRole` sorted descending → now least-loaded ascending; (2) placement `byRole` double-counted nodes advertising both `role` and `role:role` → deduped; (3) added direct unit tests for `executeStepWithAssignedNode` (routes to assigned node, falls back when unhealthy, falls back + `RELAY_FALLBACK` audit on relay failure); (4) `docs/05-integrations/relay-node-protocol.md` now documents M5 (placement, `distribute`, `POST /relay/plan`, `relay_placement`); plus a hidden bug where `test-relay-unit.cjs` fire-and-forget async checks never ran (masked a wrong `r.code` vs `r.error_code` audit assertion) — harness now awaits async checks. All relay/M5 tests green: unit 17/17, placement 14/14, multi-device e2e 22/22.

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

Enforcement policy configuration is now durable across companion server restarts (`companion/core/enforcement-policy-store.js`). Atomic persistence via writeFile + rename to `data/policy/enforcement-policy.json`. Synchronous eager init at startup; async mutations serialized through a queue. Full state transition graph: disabled↔shadow→eligible↔enforced, eligible↔suspended, enforced→{eligible,shadow}, suspended→{shadow,eligible,disabled}. Async enforcement gate (`checkEnforcementGateAsync`) verifies runtime availability, model readiness, shadow evidence sufficiency (min 3 comparisons), approval, qualified capability, score threshold, and active override before committing `enforced`. Audit degradation surfaced via `auditHealthy` flag and `POLICY_AUDIT_WRITE_FAILED` warnings. Schema locks `defaultState` to `const: "shadow"`. `expiresAt` removed. Compound mutations for approval/revocation. Override CRUD with composite key identity (trackId+role+modelId). Corrupt-file fallback with lock preserves existing data. Append-only JSONL audit (`companion/core/enforcement-policy-audit.js`, `data/enforcement-policy-audit.jsonl`) for all 10 event types, validated against `enforcement-policy-audit-event.schema.json`. Canonical policy document schema (`companion/schemas/internal/enforcement-policy.schema.json`) with `additionalProperties: false`. Pure in-memory mode when no dataDir for test isolation. Additive endpoints: `GET /enforcement/policy`, `POST /enforcement/revoke`, `POST /enforcement/override/clear`. 149 store tests (was 143) in `scripts/test-enforcement-policy-store.js`. Wrapper at `companion/core/enforcement-policy.js` updated with sync legacy seeding via `syncApi`.

### Lighthouse Priority Helper Qualification

LFM2.5-1.2B-Thinking is the first qualified model capability for a companion server runtime track. Benchmark Lab evaluation against a 12-scenario Lighthouse priority helper suite: 11/12 PASS (91.7% pass rate, score 0.9167). One INVENTED_AUDIT failure on a complex cross-referencing scenario — the model produced an audit ID not present in the input. Evidence promoted (`lfm25-1p2b-thinking-lighthouse-priority-v1`), model card generated, qualification record generated with status `qualified` for role `priority_helper`, track `website_audit.lighthouse_handoff`. Local Brain health endpoint now reports `qualified: 1` for this track/role combination. This is the first prerequisite for Pilot Enforcement Validation. Enforcement remains disabled for all tracks.

### Pilot Enforcement Validation

The first enforcement pilot is active. `website_audit.lighthouse_handoff` is approved and in `enforced` state for role `priority_helper`. The qualified capability id is `lfm25-1p2b-thinking-local`; runtime execution uses `hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest` from the qualification record's `runtimeModelName`. First 10 monitored enforced executions succeeded, with persisted Track Run Records showing `routing.enforcementDecision.applied=true`, `executedCapabilityId=lfm25-1p2b-thinking-local`, no fallback, and the Thinking runtime model in model step metadata.

### M9 Pilot Infrastructure

Pilot infrastructure for the physical multi-device pilot is prepared (infrastructure-only; pilot not yet executed on physical hardware).

- `scripts/pilot/hardware-profile.schema.json` — JSON schema defining required fields for device hardware profiles (deviceName, os, cpu, ram, vram, runtimeProvider, availableModels, advertisedCapabilities, networkAddress)
- `scripts/pilot/hardware-profile-template.json` — operator-fillable template with placeholder values
- `scripts/pilot/pilot-runner.js` — CLI script that accepts `--policy` (local-only/local-first/distributed), `--workflow`, `--input`, `--output-dir`, `--repeat` flags; executes tracks via `/tracks/run`; collects timing metrics and relay_placement summaries; writes per-run evidence JSON files and summary CSV
- `docs/05-integrations/multi-device-pilot.md` — pilot plan document covering prerequisites, hardware profile instructions, setup, run procedures for each policy mode, evidence collection, tear-down, known limitations, and stop conditions
- `package.json` scripts: `pilot:local-only`, `pilot:local-first`, `pilot:distributed`
- Pilot runner verified working in local-only mode against a running Local Brain with mock provider (2/2 runs ok, evidence files and summary CSV written correctly)
- All existing test suites pass: benchmark:test, benchmark:status-smoke, contract-test, test-relay-unit.cjs (52/52), test-relay-placement.cjs (17/17)

### Output Quality Review Foundation

Human review records can now be attached to Track Run Records without mutating original model output or enforcement decisions. Review/correction records live separately under `data/evidence/human-reviews/`. APIs: `POST /runs/:id/review`, `GET /runs/:id/review`, `GET /enforcement/quality-summary`. Operator CLI: `npm.cmd run quality-review -- list|show|pass|needs-edit|fail|summary` works without the server. The summary reports verdict counts, pass/correction rates, score averages, common failure reasons, and critical risk count. Tests: `node scripts/test-human-review-records.js` or `npm.cmd run quality-review:test`.

### Lighthouse Human Gate Packet

`npm.cmd run lighthouse:run -- --url https://your-site.com` creates a Lighthouse Track Run Record from a simple URL command, using a synthetic Lighthouse payload unless scores/findings are supplied. `npm.cmd run quality-gate:lighthouse -- --url https://your-site.com --dry-run` locates enforced Lighthouse pilot runs for that URL, `website_audit.lighthouse_handoff` / `priority_helper` / `lfm25-1p2b-thinking-local`, generates deterministic draft reviews, and writes:

- `benchmark-lab/evidence/reviews/lighthouse-human-gate-v1.md`
- `benchmark-lab/evidence/reviews/lighthouse-human-gate-v1.json`
- `benchmark-lab/evidence/reviews/lighthouse-human-gate-proposed-reviews-v1.json`
- `benchmark-lab/evidence/reviews/lighthouse-human-gate-decision-v1.json`

`npm.cmd run quality-gate:lighthouse -- --approve-safe` writes review records only for proposed `pass` items with no risk flags, `riskScore <= 1`, and no correction required. Gate filtering supports `--url`, `--latest-only`, `--latest-n 5`, and `--include-fixtures`. Fixture URLs such as `example.com` are excluded by default. Current generated URL-scoped packet for `https://doughboyvinyl.com/` found 1 candidate run, proposed 1 pass / 0 needs_edit / 0 fail, excluded 11 fixture runs, and recommends `continue`.

### Lighthouse Handoff Assembly Pilot

The Lighthouse track now adds `write_developer_tasks` after validated priority fixes. Role `developer_task_writer` consumes validated priority helper output plus Lighthouse issue context and emits:

- `developerTasks`
- `acceptanceCriteria`
- `guardrails`
- `testingChecklist`

This role is adjacent to the enforced `priority_helper` path; it is not globally enforced or broadly qualified. The human gate heuristics now require a structurally complete task packet and surface missing task/guardrail/test content as quality exceptions.

Real URL validation set:

| URL | Runs | Pass | needs_edit | Fail | Critical Risk | Correction Rate | Avg Usefulness | Avg Accuracy | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `https://doughboyvinyl.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://doughboyvinyl.com/25-mil-patterns` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com/junk-drawer/` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |

## Current Task

The M9 physical multi-device pilot infrastructure is prepared. Hardware profile schema, template, and pilot runner CLI are implemented under `scripts/pilot/`. The pilot runner executes track workflows with three relay policies (local-only, local-first, distributed), collects timing metrics and relay placement evidence, and writes per-run JSON evidence files plus a summary CSV. Documentation for the pilot procedure is at `docs/05-integrations/multi-device-pilot.md`. The pilot has not yet been executed on physical hardware — this is infrastructure preparation only.

### Immediate Next
- Execute the pilot on two physical devices with Ollama installed
- Collect and analyze evidence from local-only, local-first, and distributed policy modes
- Compare timing metrics and relay placement across policies

## Completed Since Last Update

- **Operator Console UI (M6 operator-control-plane)** — completed 2026-07-12
  - `companion/operator/index.html` — single-page operator dashboard with four panels (Dashboard, Jobs, Relay Nodes, Enqueue)
  - `companion/operator/styles.css` — dark theme with CSS custom properties, status colors, responsive grid layout
  - `companion/operator/app.js` — all client-side logic: fetch wrappers, panel rendering, event handlers, keyboard shortcuts (1-4/R/Esc), auto-refresh, confirmation dialogs, ARIA accessibility, outcome layer badges
  - `companion/server.js` — added `GET /operator`, `/operator/styles.css`, `/operator/app.js` static file routes
  - `scripts/test-operator-console.js` — 34 integration tests covering static file serving, health integration, job mutation endpoints, 404 handling
  - All interactive elements have ARIA labels and are keyboard-navigable

- **Job Cancel/Retry/Review Mutation Endpoints (M6 operator-control-plane)** — completed 2026-07-12
  - `companion/core/durable-job-store.js`: added `reviewJob()` method supporting 5 review actions (`request_review`, `approve`, `reject`, `request_correction`, `stop`) with full state validation, review metadata persistence, and updated `VALID_TRANSITIONS` for `paused_review` and `running`
  - `companion/schemas/internal/durable-job.schema.json`: added `review` property definition
  - `companion/server.js`: added `POST /jobs/:id/cancel`, `POST /jobs/:id/retry`, `POST /jobs/:id/review` endpoints with proper 404/400 error handling and JSON envelope responses
  - `scripts/test-jobs-mutation.js`: 85 integration tests covering all cancel, retry, and review scenarios including edge cases, error states, persistence, and envelope shape

- **Background Worker Polling Loop (M6 operator-control-plane)** — completed 2026-07-12
  - `companion/jobs/worker.js` implements a polling worker with `start()`, `stop()`, and `getStatus()`
  - Polls every 5 seconds (configurable) calling `durableJobStore.listClaimableJobs()`
  - Claims queued jobs, transitions to `running`, executes via execution callbacks, completes/fails/retries
  - Track-type jobs execute via `runTrack`; workflow-type jobs execute via `buildRunPlan`+`executeRunPlan`
  - Retry logic: retryable errors with remaining attempts re-queue via `retryJob`; non-retryable or exhausted attempts leave in `failed`
  - Single concurrency (`isProcessing` flag) — skips poll cycle if still processing
  - Lifecycle events logged to console (claimed, started, completed, failed, retried)
  - Wired into `companion/server.js` — worker starts automatically after server listens
  - 44 integration tests in `scripts/test-jobs-worker.js` covering success paths, failure/retry, concurrency, polling, and lifecycle

- **Durable Job Store API (M6 operator-control-plane)** — completed 2026-07-12
  - `createDurableJobStore` imported and initialized in server.js
  - `POST /jobs` creates persistent background jobs for track and workflow types with schema validation
  - `GET /jobs` lists all jobs with optional `?status=` and `?limit=` query filters
  - `GET /jobs/:id` returns the full job record (or 404 for unknown jobs)
  - `GET /health` includes `jobTotals` with counts by all seven job statuses
  - Jobs persist to `data/jobs/*.json` and survive server restart
  - 64 integration tests in `scripts/test-jobs-api.js` covering create, list, filter, get, health, and persistence
  - Changes are additive — no existing endpoint shapes modified

- **M2: Multi-Track Qualification & Enforcement** — completed 2026-07-11
  - Created 4 Benchmark Lab suites (accessibility-deep, performance-budget, seo-audit, dealsniper) with case files, output schemas, and validators
  - Qualified llama3.2 for 4 roles: a11y_analyzer (score 1.0), budget_analyzer (score 1.0), seo_analyzer (score 1.0), default_worker/dealsniper (score 1.0)
  - All 10/10 scenarios pass across all suites
  - Built `GET /qualifications/dashboard` endpoint showing per-model, per-track, per-role status with enforcement state
  - Created `scripts/website-audit-gate.js` quality gate for output validation
  - Set all 4 new tracks to shadow enforcement mode, collecting routing evidence
  - Updated model manifest for llama3.2-local with qualification data
  - 2 models now qualified across 5 tracks: lfm25-1p2b-thinking-local (4 roles) + llama3.2-local (4 roles)
  - 6 total qualified capabilities: priority_helper, developer_task_writer, guardrail_writer, testing_checklist_writer, a11y_analyzer, budget_analyzer, seo_analyzer, default_worker

## Next Task

**M6: Trusted Relay Execution and Actual-Placement Evidence** is the recommended next milestone. Do not immediately add more node types or a bigger autonomous scheduler.

Build the layer that makes today's architecture honest and safe:

1. **Node pairing and authentication** — pre-shared credentials or bearer tokens for relay node registration and step execution
2. **Capability verification** — validate that nodes advertising capabilities actually possess them
3. **Allowed-network and URL restrictions** — restrict relay traffic to private LAN ranges
4. **Minimal-context envelopes** — send only the minimum required context to relay nodes, not entire workflow state
5. **Planned-versus-actual placement records** — separate `plannedPlacement` from `actualExecutionPlacement` in run results
6. **Remote output schema validation** — validate relay responses against expected output schemas
7. **Explicit relay fallback reasons** — record why fallback occurred (node missing, unhealthy, disabled, connector unavailable)
8. **One real two-device pilot** — prove the system works on actual hardware
9. **Performance comparison** — local-only vs. relay-only vs. distributed
10. **Human-readable operator view** — show where each step actually ran

This converts today's architecture from "it can distribute work" into "we can trust and evaluate distributed work."

**Do not:**
- Remove linear track runner
- Replace existing `/tracks/run` contract
- Call planner model without qualified capability evidence
- Expose the Local Brain to the public network (keep localhost-only default)
- Treat relay nodes as control planes (they are execution targets only)
- Claim distributed consensus or Byzantine fault tolerance

M2 follow-on candidates remain: qualify recommender roles (a11y_recommender, budget_recommender, seo_recommender), qualify operator-log tracks, enforce the 4 shadow tracks.

## Do Not

- Modify completed evidence or qualification artifacts without an explicit task
- Broaden claims from narrow benchmark evidence
- Implement a follow-on milestone or qualification-coverage expansion without an explicitly supplied objective
- Implement automatic model swapping / Model Garage auto-switching
- Claim DAG support or automatic track classification exists (both are implemented; do not overclaim distributed consensus)
- Remove legacy `step-input.js` fallbacks until Lighthouse parity work resumes — **done 2026-06-30**
- Break existing Local Brain endpoints or response envelopes
- Import `benchmark-lab/engine/` modules from the Local Brain companion or any code under `companion/`
- Enable enforcement for any Track without explicit evidence review
- Enable global enforcement — per-track states only
- Claim model quality is validated from execution success alone
- Modify the qualification-resolver, capability-registry, evidence-linker, shadow-routing, enforcement-policy, enforcement-policy-store, enforcement-policy-audit, or shadow-evidence-review modules unless extending them for enforcement
- Modify the policy schema (`companion/schemas/internal/enforcement-policy.schema.json`) or audit event schema (`companion/schemas/internal/enforcement-policy-audit-event.schema.json`) without updating all consumers
- Hardcode absolute filesystem paths in enforcement API responses
- Use relay nodes outside trusted development networks without completing M6 trust boundary requirements
- Assume planned placement equals actual execution without explicit placement evidence records

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
Relay Nodes provide track capabilities across nearby devices; cross-node routing with local fallback is implemented in `companion/relay/`.
RelayNodes are execution targets only, not control planes.
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
| Relay Nodes | `companion/relay/` (protocol, registry, connector, router) |
| Memory Bridge | `companion/memory/vault-adapter.js`, `companion/memory/writeback-proposal.js` |

## Before Reporting Success

Run the appropriate non-live validation commands:

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
node scripts/test-enforcement-policy-store.js
node scripts/test-enforcement-policy.js
node scripts/test-enforcement-routing.js
npm.cmd run test:relay
npm.cmd run test:memory-v1
npm.cmd run test:relay:e2e
```

Do not require a live Ollama runtime unless your changes specifically affect Ollama interaction. If the companion server is running, also run:

```powershell
node scripts/smoke-test.js
```

## When Done

Add an entry to [progress-log.md](./progress-log.md) and update [build-status.md](./build-status.md) if status changed.
