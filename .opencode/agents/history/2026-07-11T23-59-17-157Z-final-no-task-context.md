# final @ 2026-07-11T23:59:17.157Z
run_id: b3b6b5d9ee14
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

Add relay node authentication and pairing so registration, heartbeat, step execution, and unregister require valid node credentials.

## Scope

- Add `companion/relay/credentials.js` implementing an in-memory relay credential store: `generateToken(nodeId)` returns a cryptographically random hex token, `verifyToken(nodeId, token)` returns `true`/`false`, `pairNode(nodeId)` generates and stores a token then returns it, `hasToken(nodeId)` checks existence. Support optional seed tokens from config (`options.seedTokens`).
- Add `companion/relay/auth.js` implementing a relay auth guard: `extractBearerToken(request)` parses `Authorization: Bearer <token>` from the request headers, `authenticateRelayRequest(request, credentialStore)` returns `{ ok: true, nodeId }` or `{ ok: false, error: { code, message } }` with codes `RELAY_AUTH_MISSING` (no Authorization header), `RELAY_AUTH_INVALID` (malformed), `RELAY_NODE_TOKEN_MISMATCH` (token doesn't match), and `RELAY_NODE_UNKNOWN` (nodeId not in credential store).
- Wire `authenticateRelayRequest` into the four relay mutation endpoints in `companion/server.js`: `/relay/register`, `/relay/heartbeat`, `/relay/unregister`, `/relay/step`. On auth failure, respond with 401 and the structured error object.
- Add a `GET /relay/pairing` endpoint returning pairing instructions (required fields, where to send the request, how to include the token in subsequent requests). When `options.relay.authRequired` is falsy, return a note that authentication is not required.
- Update `companion/relay/connector.js` so `registerWithOrchestrator`, `sendHeartbeat`, and `executeRemoteStep` accept an optional `token` parameter and pass it as `Authorization: Bearer <token>` in requests.
- Make authentication skippable: when `options.relay.authRequired === false`, ALL relay endpoints skip auth checks (preserving backward compatibility for existing tests and dev workflow). When `authRequired` is undefined or truthy, auth is enforced.
- Add `scripts/test-relay-auth.cjs` covering: valid token accepted on each protected endpoint, missing token rejected, malformed token rejected, wrong-node token rejected, pairing endpoint returns expected shape, connector passes token header, auth-skip mode allows requests without tokens.
- Run `node scripts/test-relay-unit.cjs` and `node scripts/test-relay-placement.cjs` to confirm no regressions.
- Run `node scripts/contract-test.js` to confirm no contract regressions.

## Excluded

- Capability verification before routing decisions (next task).
- Allowed-network / LAN-range restrictions (next task).
- Minimal-context envelopes (next task).
- Planned-versus-actual placement evidence records (next task).
- Remote output schema validation (next task).
- Explicit fallback reason recording (next task).
- Documentation updates to `current-state.md`, `next-agent-brief.md`, protocol docs, or decision log (save for a later consolidation task).
- Two-device pilot.
- Benchmark Lab changes.
- Modification to existing test harness (beyond adding the new test file).

## Acceptance Criteria

- `companion/relay/credentials.js` and `companion/relay/auth.js` exist and export their documented functions.
- `/relay/register`, `/relay/heartbeat`, `/relay/unregister`, and `/relay/step` return 401 with structured error codes (`RELAY_AUTH_MISSING`, `RELAY_AUTH_INVALID`, `RELAY_NODE_TOKEN_MISMATCH`) when credentials are missing, malformed, or invalid.
- `GET /relay/pairing` returns pairing instructions with required fields and auth expectations.
- Connector functions accept and forward Bearer tokens.
- When `options.relay.authRequired === false`, all relay endpoints accept requests without authentication.
- `scripts/test-relay-auth.cjs` passes all cases.
- Existing `scripts/test-relay-unit.cjs` and `scripts/test-relay-placement.cjs` still pass.
- `scripts/contract-test.js` still passes.
- No changes to response envelopes for non-relay endpoints.

## Recommended Worker

worker

