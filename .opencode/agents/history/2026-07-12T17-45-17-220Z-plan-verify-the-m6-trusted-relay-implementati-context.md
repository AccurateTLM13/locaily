# plan @ 2026-07-12T17:45:17.220Z
run_id: 291358d237ed
iteration: 0
status: running

## Objective
# Active Objective — M6: Trusted Relay Execution

Harden the existing Relay Node and multi-device execution path so Locaily can safely operate across trusted nearby devices. This milestone adds a real trust boundary, verifies node identity and capabilities, minimizes shared context, and records where each step actually executed. The goal is not internet-facing distributed computing; it is a defensible local-network execution layer for controlled physical-device pilots.

## Completion Conditions

- Relay registration, heartbeat, step execution, and unregister operations require authenticated node identity.
- A documented pairing or pre-shared credential flow exists for adding a trusted Relay Node.
- Relay destinations are restricted to approved local-network hosts or explicitly allowlisted addresses.
- Duplicate node identities, invalid credentials, unsupported protocol versions, and unauthorized capability claims are rejected with structured errors.
- Remote step payloads include only the context required by that step rather than the complete workflow state by default.
- Remote outputs are validated against the expected step output schema before entering downstream execution.
- Track Run Records distinguish planned placement from actual execution placement.
- Local fallback records a structured reason when an assigned node is unavailable, unhealthy, unauthorized, times out, or returns invalid output.
- Existing local-only behavior and current Relay policies remain backward compatible.
- Tests cover authentication success/failure, pairing, allowlist enforcement, invalid output, unhealthy assigned nodes, timeout fallback, and planned-versus-actual placement.
- Existing contract, smoke, Benchmark Lab, enforcement, DAG, Relay, and multi-device tests continue to pass.
- Documentation is updated: `current-state.md`, `next-agent-brief.md`, `build-status.md`, `latest-build-result.json`, Relay protocol docs, and decision log.

## Out of Scope (this objective)

- Public-internet Relay Nodes.
- Distributed consensus, leader election, or Byzantine fault tolerance.
- Automatic discovery through mDNS or Bluetooth.
- User-facing operator dashboard.
- Durable background task queues.
- End-to-end encryption beyond what is required for the selected trusted-LAN design.

## Stop / Hand-Back

Hand back to a human if:

- The selected trust model requires a breaking change to existing track or workflow request contracts.
- Secure identity storage requires an external secret manager or operating-system integration not already approved.
- LAN restrictions cannot be implemented without blocking the current development workflow.
- Existing evidence records cannot represent planned and actual placement without a schema migration requiring product-level approval.
- A security decision would materially define the future public protocol rather than only the trusted local pilot.


## Task
# Active Task

## Objective
Verify the M6 trusted-relay implementation (auth, allowlisting, minimal context, schema validation, fallback reasons, placement evidence) by running all related test suites, then update project documentation to reflect the completed M6 work.

## Scope
- Run all relay tests: `node scripts/test-relay-unit.cjs`, `node scripts/test-relay-placement.cjs`, `node scripts/test-relay-e2e.cjs`
- Run contract test: `node scripts/contract-test.js`
- Run benchmark tests (no Ollama needed): `npm.cmd run benchmark:test`, `npm.cmd run benchmark:status-smoke`
- Run enforcement tests: `node scripts/test-enforcement-policy-store.js`, `node scripts/test-enforcement-policy.js`, `node scripts/test-enforcement-routing.js`
- Run DAG tests: `npm.cmd run test:dag`
- Run memory tests: `npm.cmd run test:memory-v1`
- Fix any test failures that are regressions caused by M6 code (but do not re-implement features)
- Update `docs/00-start-here/current-state.md`:
  - Move relay trust-boundary items from "What Is Partial" to "What Works"
  - Add M6-specific entries: auth, allowlisting, minimal context, schema validation, fallback reasons, placement evidence
  - Update "Planned vs. actual placement" to note it now records both and no longer silently falls back
- Update `docs/07-progress/next-agent-brief.md`:
  - Add M6 implementation status section under "Completed Since Last Update"
  - Update "Current Task" to note M6 implementation is done, documentation + verification in progress
  - Update the relay-node trust boundary note to reflect auth is now present
- Update `docs/07-progress/build-status.md`:
  - Add M6 milestone row (Trusted Relay Execution) with status "In Progress — core implementation complete, docs + verification pending"
  - Add M6-specific entries under "Working" (relay auth, allowlisting, minimal context, output validation, placement evidence, fallback reasons)
  - Remove "relay trust boundary" from "Partial"
- Update `docs/07-progress/latest-build-result.json`:
  - Add M6 build slice data referencing the 7 completed implementation tasks
  - Include test results from this verification run
  - Update `last_fresh_validation` and `updated_at` timestamps
- Update `docs/05-integrations/relay-node-protocol.md` if any protocol changes from M6 (auth, allowlisting, minimal context, output validation) are not yet documented
- Record a decision in `docs/06-decisions/decision-log.md` for the pre-shared-token trust model chosen for M6

## Excluded
- No new feature implementation or code changes outside test fixes
- Do not modify `companion/relay/` code unless fixing a test regression
- Do not modify `companion/core/`, `companion/crew/`, or `companion/orchestration/` code
- Do not modify `benchmark-lab/` or its evidence artifacts
- Do not address the `local_first` capability-source issue (separate task)
- Do not address the "approved evidence" agent-approver issue (separate task)
- Do not change response envelope formats or API contracts

## Acceptance Criteria
- All relay tests pass: `test-relay-unit.cjs`, `test-relay-placement.cjs`, `test-relay-e2e.cjs`
- `node scripts/contract-test.js` passes
- `npm.cmd run benchmark:test` passes
- `npm.cmd run benchmark:status-smoke` passes
- `node scripts/test-enforcement-policy-store.js` passes
- `node scripts/test-enforcement-policy.js` passes
- `node scripts/test-enforcement-routing.js` passes
- `npm.cmd run test:dag` passes
- `npm.cmd run test:memory-v1` passes
- `docs/00-start-here/current-state.md` updated to reflect M6 implementation
- `docs/07-progress/next-agent-brief.md` updated
- `docs/07-progress/build-status.md` updated with M6 milestone
- `docs/07-progress/latest-build-result.json` updated with M6 build data and fresh timestamps
- `docs/05-integrations/relay-node-protocol.md` updated if needed for auth/allowlisting/validation changes
- Decision logged in `docs/06-decisions/decision-log.md` for pre-shared-token trust model
- No existing tests regress
- No excluded files modified

## Recommended Worker
worker

