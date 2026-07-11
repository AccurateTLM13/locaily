# Milestone 4 Completion Note — Relay Nodes & Distributed Capability Network

**Milestone:** Relay Nodes & Distributed Capability Network (M4)
**Status:** **Complete**
**Updated:** 2026-07-11

## Final status

| Item | Result |
|---|---|
| Relay Node protocol | Implemented (`companion/relay/protocol.js`, version `1.0`) |
| Connector module | Implemented (`companion/relay/connector.js`) |
| Node registry | Implemented (`companion/relay/registry.js`): capabilities, health, stats |
| Capability advertisement | `POST /relay/register` + `POST /relay/heartbeat` |
| Cross-node routing | Wired into `companion/crew/orchestrator.js` and `companion/orchestration/run-plan-executor.js` |
| Local fallback | Implemented with `RELAY_FALLBACK` audit event |
| Memory Bridge v1 | `POST /memory/search` + `POST /memory/writeback/apply` (opt-in) |
| Acceptance e2e | `scripts/test-relay-e2e.cjs` — 11/11 PASS |
| Offline suites | `test:relay` (11/11), `test:memory-v1` (6/6) |
| Regression | Existing smoke (57/57), contract, dag, benchmark, orchestration-unit all PASS |

**Delivered:** Locaily can now discover nearby Local Brain instances, route individual
model steps to a relay node when local capability is unavailable or lower-ranked, fall back
to local execution on relay failure with a full audit trail, and apply reviewed memory
writeback to an operator-configured vault.

## Architecture

```txt
Local Brain (orchestrator)
  ├─ relayRegistry  (in-memory node registry: capabilities + health)
  ├─ relayRouter    (routing decision + local fallback)
  └─ relayConnector (HTTP client to dispatch /relay/step)

Relay Node (another Local Brain)
  ├─ POST /relay/register  (capability advertisement / discovery)
  ├─ POST /relay/step      (execute a single step locally, return raw result)
  └─ POST /relay/heartbeat (health refresh)
```

Routing policy is selected per request via `options.relay_policy`
(`route_if_unavailable` default, `prefer_relay`, `local_only`). The server injects the live
registry/connector/router into execution options automatically; no client change is needed
beyond the `relay_policy` hint.

## API surfaces added

- `GET /relay/protocol`
- `GET /relay/nodes`
- `POST /relay/register`
- `POST /relay/heartbeat`
- `POST /relay/unregister`
- `POST /relay/step` (relay node work receiver)
- `POST /memory/search` (v1)
- `POST /memory/writeback/apply` (v1, opt-in)

`GET /health` now reports `relay` node counts.

## Acceptance evidence

`scripts/test-relay-e2e.cjs` starts two Local Brain servers (A orchestrator + B relay),
registers B with A, runs the Lighthouse Handoff workflow with `relay_policy: prefer_relay`,
and asserts:

- discovery + capability advertisement succeed (`/relay/register`, `/relay/nodes`)
- the workflow completes and at least one model step executes on relay node B
  (`worker_used.routed_via === "relay"`, `node_id === "relay-b"`)
- after killing B, the workflow still completes with **no** step routed to the dead node
  (local fallback)
- a `RELAY_FALLBACK` audit event is recorded

## Stop conditions honored

- Local Brain remains localhost-only by default (no public exposure).
- No automatic model swapping / Model Garage.
- Relay nodes are execution targets only — they cannot alter orchestrator policy,
  qualifications, or the registry beyond their own entry.
- Memory Bridge v1 apply is opt-in (`memoryBridge.allowApply`) and vault-path-gated.
- No distributed consensus or Byzantine fault tolerance is claimed.

## Handoff

Next: depend on M4 for multi-device workflows; keep relay nodes ephemeral and always
provide local fallback. See [roadmap-milestones-2-3-4.md](../07-progress/roadmap-milestones-2-3-4.md).
