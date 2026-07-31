# CTK-01 Reference Vertical Slice

## What It Proves

The reference slice submits a trusted `project.status.changed` event to the local Capability Trigger Kernel. The kernel selects `status-handoff@0.1.0`, builds a deterministic one-step plan, runs a no-model rule, validates the result, and writes durable evidence.

No server, Ollama runtime, relay node, network request, or cloud account is required.

## Run It

From the repository root:

```powershell
node scripts/ctk-run.js
```

The first submission of the fixture event should return:

```txt
state: completed
capability: status-handoff@0.1.0
output.current_status: review_ready
```

The run writes:

```txt
data/evidence/capability-kernel/runs.jsonl
data/evidence/capability-kernel/outputs/<run_id>.json
```

Submitting the unchanged fixture again returns `ignored` with `DUPLICATE_EVENT`; it does not call the handler twice. To perform another full run, copy the event fixture and assign a new unique `event_id`:

```powershell
node scripts/ctk-run.js --event C:\path\to\project-status-changed.event.json
```

Optional exact capability selection:

```powershell
node scripts/ctk-run.js --capability status-handoff --version 0.1.0
```

Use a separate evidence directory:

```powershell
node scripts/ctk-run.js --store-dir C:\path\to\ctk-evidence
```

## Run the Acceptance Suite

```powershell
node scripts/test-capability-trigger-kernel.js
```

The suite covers:

- valid activation and fixture end-to-end execution;
- irrelevant, malformed, duplicate, and untrusted events;
- unknown capability and incompatible version;
- unavailable handler;
- policy-blocked and approval-required execution;
- invalid output and failed execution records;
- declared retry and non-retry behavior;
- deterministic plan hashes and version-specific provenance;
- instruction-like payload text treated as data;
- secret redaction;
- zero network/cloud fallback calls.

## Inspect a Run

Each line in `runs.jsonl` is one complete terminal record. Useful fields:

- `event_hash`
- `capability_id` and `capability_version`
- `manifest_hash`
- `execution_plan` and `plan_hash`
- `transitions`
- `attempts`
- `validations`
- `outputs`
- `terminal_state`
- `error`

The event, node policy, manifest, and plan snapshots allow the accepted run to be reconstructed without relying on chat history.

## Reference Files

- Node boundary: `companion/capability-kernel/config/local-node.json`
- Capability manifest: `companion/capabilities/status-handoff/capability.json`
- Event fixture: `companion/capabilities/status-handoff/fixtures/project-status-changed.event.json`
- Contracts: `companion/schemas/capability-kernel/`
- Architecture and limitations: `docs/01-architecture/capability-trigger-kernel.md`
