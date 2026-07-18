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
