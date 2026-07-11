# Active Build Slice

## Objective

Complete the first full Lighthouse Handoff product loop — add `testing_checklist_writer`, assemble the full handoff, validate the complete artifact, and package the operator workflow.

## Current Slice

**Complete:** Full Lighthouse Handoff Validation Loop — 4 roles qualified, 10 track steps, full assembled artifact quality gate, `--artifact full-handoff` mode.

**Status:** All objectives met. No active build slice. Awaiting next direction.

## Next Slice: M6 — Trusted Relay Execution and Actual-Placement Evidence

The M5 architectural review identified four issues that need attention before the relay system can be used outside trusted development networks. M6 addresses these gaps.

### M6 Objectives

| # | Objective | Status |
|---|---|---|
| 1 | Node pairing and authentication — pre-shared credentials or bearer tokens for relay node registration and step execution | Pending |
| 2 | Capability verification — validate that nodes advertising capabilities actually possess them | Pending |
| 3 | Allowed-network and URL restrictions — restrict relay traffic to private LAN ranges | Pending |
| 4 | Minimal-context envelopes — send only the minimum required context to relay nodes, not entire workflow state | Pending |
| 5 | Planned-versus-actual placement records — separate `plannedPlacement` from `actualExecutionPlacement` in run results | Pending |
| 6 | Remote output schema validation — validate relay responses against expected output schemas | Pending |
| 7 | Explicit relay fallback reasons — record why fallback occurred (node missing, unhealthy, disabled, connector unavailable) | Pending |
| 8 | One real two-device pilot — prove the system works on actual hardware | Pending |
| 9 | Performance comparison — local-only vs. relay-only vs. distributed | Pending |
| 10 | Human-readable operator view — show where each step actually ran | Pending |

### M6 Review Findings (from M5 architectural review)

**High: Relay communication has no visible trust boundary**
- No authentication token, signature, node certificate, request nonce, or pairing credential
- Registration and heartbeat calls are unauthenticated
- A rogue or accidentally registered LAN node could receive workflow context and user-derived content
- Current state: Trusted-development-network only

**Medium: Planned relay placement can silently become local execution**
- When an assigned node is missing or unhealthy, `executeStepWithAssignedNode()` falls back to local execution without recording a fallback audit
- Run reports placement plan assigning step to relay node, but actual execution occurred locally with no recorded reason
- Consequence: Planned and executed topology can diverge silently, weakening the evidence system

**Medium: `local_first` defaults to effectively local-only**
- Every role is treated as locally capable when `localCapableRoles` is omitted
- `local_first` immediately assigns locally when the role is considered locally capable
- Consequence: Without explicit local-capability data, relay nodes are never used for model steps

**Medium: "Approved evidence" was written with an agent as approver**
- Several new evidence records use `"approvedBy": "locaily-agent"`
- Blurs distinction between generated, promoted, machine-reviewed, human-reviewed, and approved for qualification
- Fix: Use `promotionActor` instead of `approvedBy`; reserve `approvedBy` for actual human approval

### M6 Success Criteria

1. Relay nodes cannot register or execute steps without valid authentication
2. Capability advertisements are verified before routing decisions
3. Relay traffic is restricted to private LAN ranges
4. Relay nodes receive only minimum required context (not entire workflow state)
5. Run results clearly separate planned placement from actual execution placement
6. Relay responses are validated against expected output schemas
7. All fallback events include explicit reasons (node missing, unhealthy, disabled, connector unavailable)
8. One real two-device pilot completes successfully with M6 trust boundary active
9. Performance comparison shows measurable difference between local-only, relay-only, and distributed execution
10. Operator can view where each step actually ran vs. where it was planned to run

## New: testing_checklist_writer

| Area | Status | Notes |
|---|---|---|
| Schema | Complete | `companion/crew/schemas/testing-checklist-writer.schema.json` — 6 required fields (pageSpeedRerunSteps, beforeAfterComparisons, regressionChecks, manualQaNotes, codingAgentVerification, stopAndAskTriggers) |
| Prompt | Complete | `buildTestingChecklistWriterPrompt()` in `prompts.js` + `write_testing_checklist` template |
| Track step | Complete | `write_testing_checklist` added as step 8/10 in `lighthouse-handoff.track.json` |
| Handoff integration | Complete | `normalizeTestingChecklistPacket()` + 6 markdown sections (rerun steps, before/after, regression, manual QA, coding agent verification, stop-and-ask triggers) |
| Quality gate | Complete | `findTestingChecklistWriterChild()` + completeness checks + `parseTestingChecklistWriterCounts()` in `lighthouse-human-gate.js` |
| Model role | Complete | `testing_checklist_writer` mapped to `llama3.2` in `server.js` config |
| Formal qualification | Complete | Evidence summary, approved marker, qualification record, 3 checksums — score 1.0, 3/3 URL scenarios |
| Full handoff quality gate | Complete | `--artifact full-handoff` mode validates: priority fixes, developer tasks, guardrails, testing checklist, coding agent prompt, no invented audits, no unsupported claims |
| Validation report | Complete | `benchmark-lab/evidence/reviews/full-lighthouse-handoff-validation-v1.md` + `.json` |

## Completed Scope Items

| Area | Status | Notes |
|---|---|---|
| All Lighthouse roles | Complete | 4 roles qualified (priority_helper, developer_task_writer, guardrail_writer, testing_checklist_writer) |
| Track steps | Complete | 10 steps in website_audit.lighthouse_handoff |
| Enforcement | Complete | 3 roles enforced (testing_checklist_writer awaiting runtime enforcement) |
| All tests | Complete | benchmark:test, contract-test, status-smoke, enforcement*, qualification, shadow-routing, human-review all pass |
| Human review system | Complete | review records, quality gate, operator CLI |
| Run state | Complete | run-state.json unblocked and current |

## Key Principle

Execution success and enforcement success do not validate model judgment quality.

## Next Slice Candidate

**TBD — Awaiting explicit direction.** The full Lighthouse Handoff product loop is validated. Candidates for future direction:
- Enforce testing_checklist_writer (qualified score 1.0, track already enforced — will apply on next run with sufficient shadow evidence)
- Multi-model track expansion (qualify models for accessibility_deep, performance_budget, seo_audit, operator-log stubs)
- DealSniper workflow build-out (model qualification, human gate, evidence loop)
- Live qualification depth (broader model, track, hardware coverage via Benchmark Lab)

## Stop Conditions

- Do not broaden globally
- Do not add new adjacent Lighthouse roles without explicit direction
- Do not claim model quality from execution success alone
- Do not implement automatic model swapping or Relay Node routing without explicit task
