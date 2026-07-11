# Relay Node Protocol (Milestone 4 + 5)

**Status:** M4 implemented 2026-07-11; M5 implemented 2026-07-11
**Protocol version:** `1.0`

The Relay Node protocol lets nearby Local Brain instances register capabilities, accept
work, and return results over plain HTTP. It is the "Distributed Capability Network" layer
of Locaily. A **relay node** is an execution target only — never a control plane.

## Mental Model

```txt
Machine A (orchestrator / Local Brain)
   ├─ Node Registry (in-memory): known relay nodes + capabilities + health
   └─ Router: routes a model step to a relay node when local is unavailable/lower-ranked
            └─ on relay failure → local fallback + audit trail

Machine B (relay node / Local Brain)
   ├─ Registers with A (capability advertisement): nodeId, baseUrl, capabilities[]
   └─ Accepts work at POST /relay/step and returns raw step result
```

**Device = capability.** Not every node needs a model; every node needs a connector.

## Endpoints

All relay endpoints live on the Local Brain HTTP server (bound to localhost by default).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/relay/protocol` | Protocol description + message shapes |
| GET | `/relay/nodes` | List registered nodes + registry stats |
| POST | `/relay/register` | A relay node advertises itself (discovery) |
| POST | `/relay/heartbeat` | Refresh `lastSeen` / health, optionally update capabilities |
| POST | `/relay/unregister` | Remove a node from the registry |
| POST | `/relay/step` | Execute a single track step locally and return the raw result |
| POST | `/relay/plan` | Placement preview: given steps + policy, return a node assignment plan |

`GET /relay/protocol` returns the canonical message shapes.

## Node Registration (Discovery + Capability Advertisement)

A relay node registers with the orchestrator:

```json
POST /relay/register
{
  "nodeId": "relay-b",
  "baseUrl": "http://127.0.0.1:31314",
  "label": "Machine B",
  "capabilities": ["default_worker", "developer_task_writer", "guardrail_writer"],
  "hardware": { "gpu": "cuda:0", "ramGb": 32 }
}
```

The registry tracks `status`, `lastSeen`, `dispatchCount`, and `failureCount`. A node is
`healthy` if it has heartbeated within the staleness window (60s). Routing only selects
healthy nodes. This registry **is** the discovery mechanism for M4 (no mDNS/broadcast yet).

## Cross-Node Routing

When the Local Brain executes a track/workflow step, the router (`companion/relay/router.js`)
decides where to run it:

- `model` steps may be routed to a relay node; `tool` steps always run locally.
- Policy:
  - `route_if_unavailable` (default): route only when the local runtime cannot run the role.
  - `prefer_relay`: route whenever a capable healthy node exists (used by the e2e test to
    prove "model step executed on machine B").
  - `local_only`: never route.
- Capability match: the relay node must advertise the step's model `role`.

Routing is requested per call via `options.relay_policy` on `/tracks/run` or
`/workflows/run`. The server injects the live registry/connector/router into execution
options automatically.

## Relay Failure → Local Fallback

If a relay node is unreachable or returns `ok:false`:

1. The node is marked `unhealthy` in the registry.
2. A `RELAY_FALLBACK` audit event is recorded (`tool: relay-router`).
3. The step runs locally via the normal executor.
4. Execution continues; no state is lost (relay nodes are ephemeral).

## M5: Multi-Device Workflow Coordination (Placement)

Milestone 5 builds on M4 routing with **placement planning**. Instead of per-step
`route_if_unavailable` / `prefer_relay` decisions, an operator may request a whole
track/workflow run to be **distributed** across registered nodes up front.

The **placement planner** (`companion/relay/placement.js`) computes a deterministic
assignment of `model` steps to capable healthy nodes before execution:

- `distribute` (M5): spread `model` steps across capable healthy nodes, least-loaded first
  (a node advertising both `role` and `role:role` counts once). Roles the local Local Brain
  can run are kept local by default; only roles it cannot run — or that an operator wants
  offloaded — are assigned to relay nodes.
- `local_first`: run everything locally when local is capable; route only what local cannot run.
- `local_only`: never route (equivalent to M4 `local_only`).

### Placement policy request

Pass `relay_policy: "distribute"` on `/tracks/run` or `/workflows/run`. The server calls
`applyRelayPlacement()`, which:

1. Builds the plan from the run's steps via `buildPlacementFromTrack`.
2. Returns a `relay_placement` summary in the response (`policy`, `plan`, `summary.byNode`,
   `summary.localSteps`, `summary.relayedSteps`).
3. Injects `options.relay.assignments[stepId] = nodeId` so each step is routed to its assigned
   node. The router's `executeStepWithAssignedNode` honors the assignment and still falls back
   locally (with a `RELAY_FALLBACK` audit) if the assigned node is unhealthy or unreachable.

### Placement preview (no execution)

`POST /relay/plan` returns the computed plan without running anything:

```json
POST /relay/plan
{
  "steps": [
    { "stepId": "s1", "role": "priority_helper", "executorType": "model" },
    { "stepId": "s2", "role": "developer_task_writer", "executorType": "model" }
  ],
  "policy": "distribute",
  "localCapableRoles": []
}
```

Response (excerpt):

```json
{
  "ok": true,
  "policy": "distribute",
  "plan": { "s1": "relay-b", "s2": "relay-c" },
  "summary": {
    "byNode": { "relay-b": 1, "relay-c": 1 },
    "localSteps": [],
    "relayedSteps": ["s1", "s2"]
  }
}
```

Placement is **read-only preview by default**; only `distribute` on an actual run performs
assignment. This keeps node selection auditable and reversible prior to execution.

## Security & Boundaries

- Local Brain binds to `127.0.0.1` by default; it is not exposed to the public network.
- Relay nodes are **execution targets only** — they never change orchestrator policy,
  qualifications, or the registry beyond their own entry.
- No distributed consensus or Byzantine fault tolerance is claimed.
- Memory Bridge v1 apply is opt-in and vault-path-gated; relay nodes only touch their
  operator-configured local vault.

## Modules

- `companion/relay/protocol.js` — version, constants, message shapes
- `companion/relay/registry.js` — node registry (capabilities, health, stats)
- `companion/relay/connector.js` — HTTP client to dispatch a step / register / heartbeat
- `companion/relay/router.js` — routing decision + fallback orchestration
- `companion/relay/placement.js` — M5 placement planner (`distribute` / `local_first` / `local_only`)

## Tests

- `scripts/test-relay-unit.cjs` — registry + router logic, including M5 `executeStepWithAssignedNode` (offline)
- `scripts/test-memory-v1.cjs` — Memory Bridge v1 search + apply (offline)
- `scripts/test-relay-e2e.cjs` — two-server discovery, routing, and fallback (acceptance)
- `scripts/test-relay-placement.cjs` — placement planner: distribute / local_first / local_only / dedupe / load split (offline)
- `scripts/test-multi-device-e2e.cjs` — three-server distributed run with node failure + local fallback (acceptance)

## Acceptance Evidence

M4 acceptance criteria are met and covered by `test:relay:e2e`:

- 2+ machines discover each other through the relay registry.
- Local Brain routes a track step to a relay node and receives valid results.
- Relay node failure triggers local fallback with an audit trail.
- Memory Bridge v1 supports structured search and writeback-apply.
- All existing tests still pass (backward compatible).
- End-to-end: Lighthouse Handoff runs on machine A with model steps executed on machine B.

M5 acceptance criteria are met and covered by `test:relay:placement` + `test:multi-device:e2e`:

- `POST /relay/plan` returns a deterministic assignment plan for a set of steps + policy.
- `distribute` spreads `model` steps across capable healthy nodes (least-loaded first) and
  dedupes nodes that advertise both `role` and `role:role`.
- A multi-machine run distributes assigned steps to the correct nodes; the orchestrator's
  `worker_used` reports `node_id` + `routed_via` for each routed step.
- Killing a relay node mid-run triggers local fallback (with `RELAY_FALLBACK` audit) and the
  run still completes.
- All existing tests still pass (backward compatible).
