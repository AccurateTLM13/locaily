# Roadmap

Practical sequencing for Locaily. No dates or numbered milestones — order reflects dependency, not schedule promises.

**Updated:** 2026-07-22

## Completed

- Local companion server (Local Brain) on localhost, `127.0.0.1:31313`
- Engine endpoints: `GET /health`, `POST /tasks/run`, `POST /analyze`, `GET /tools`, `GET /audit`
- Ollama + mock provider runtime adapters
- Core modules: input gate, context, permissions, validator, audit, model-qualification-loader
- Manifest-backed tool pack loader (`tool-packs/*/tool.json` via `companion/tools/registry.js`)
- Track runner (Crew orchestrator) + declarative input mapping
- Second proof workflow: DealSniper (`marketplace.dealsniper` track)
- Workflow orchestration: `POST /workflows/plan`, `POST /workflows/run`
- Memory Bridge v0 (optional, bounded context access, proposal-only writeback)
- Audit redaction, Memory Bridge endpoints, smoke tests for disabled + template-enabled
- Benchmark Lab Milestone 1 (engine, CLI, schemas, evidence, qualifications, reports, model-cards, checksums)
- JSON-first internal format with runtime schema enforcement (7 internal schemas enforced at production boundaries)
- Windows/PowerShell launch helpers (`start-windows.bat`, `start-dev.ps1`)
- Smoke and contract tests
- Standard Text Pack (`text.clean`, `text.summarize`), Lighthouse Parser Pack
- Canonical Track Run Records — schema, builder, store, evidence loop, runtime emission
- Track Learning Evidence Loop (M12) — disagreement classification, drift detection, per-track learning state, retry comparisons
- M10 — Locaily v1 Packaging — documentation alignment, state migration scaffolding, operator walkthrough, release positioning
- M09 — Physical Multi-Device Pilot infrastructure (held; physical validation pending)
- M06 — Operator Console UI, durable jobs, background worker, job mutations
- Objective Lifecycle Hardening — stable IDs, mandatory closeout, continuity gate, queue archival
- Security Policy Foundation — execution-security documentation, threat model, policy schemas, approval rules, capability boundaries, NOPE evaluation (`docs/security/`, `policies/`)

## Immediate (Next)

The next work must be explicitly selected by the operator. No automatic progression.

### Second-Repository Operator Acceptance

**Status:** Deferred. Ready to resume when operator is available.

Brief manual walkthrough on a real second repository to validate the Development Memory Loop outside simulation. Record pass/fail; fix only if blocked. This is a prerequisite for claiming the physical multi-device pilot is validated.

### Clean-Machine v1 Acceptance

**Status:** Not yet scoped.

Test on a machine without development history:

- Clone/download
- Install requirements
- Start Locaily
- Detect Ollama or run deterministic mode
- Open Operator Console
- Run Lighthouse Handoff
- Inspect evidence
- Stop and restart
- Preserve state
- Upgrade/migrate state
- Remove cleanly

**Completion condition:** A non-developer can follow one guide and complete one useful workflow without manually repairing configuration.

## Product Proof

### Lighthouse Handoff Product Bridge

**Status:** Candidate. Not yet scoped.

Move from candidate follow-on to approved milestone because Lighthouse Handoff is the clearest real product proof.

- Extension discovers Local Brain
- Explicit CORS policy
- Connection status
- Standard deterministic mode
- Local AI enhancement mode
- Failure fallback
- Report comparison
- Real PageSpeed payload handling
- Export to coding-agent-ready Markdown
- Installer/setup path covering both repositories

### Workflow Pack Contract and Starter SDK

**Status:** Candidate. Not yet scoped.

Turn the existing plugin-style Tool Pack concept into a complete distributable unit. A contributor can install or create a workflow pack without modifying Local Brain core code.

A Workflow Pack could contain:

```txt
workflow-pack/
  pack.json
  tracks/
  tools/
  prompts/
  schemas/
  fixtures/
  permissions.json
  qualification-requirements.json
  README.md
```

### Automatic Task Intake and Track Selection

**Status:** Candidate. Not yet scoped.

Start narrower than free-form super-agent planning:

```txt
User request
   ↓
Deterministic intent hints
   ↓
Small classifier
   ↓
Candidate workflow/track
   ↓
Contract and capability check
   ↓
Operator confirmation when ambiguous
```

**Completion conditions:**

- Select among known workflows
- Explain the selection
- Return uncertainty
- Refuse unsupported requests
- Never invent a Track
- Compare classifier selection against a human-labeled test set

## Before Broader Distributed Claims

### Relay Trust and Secure Pairing (M09A)

**Status:** Candidate. Should precede or become the first half of M09.

The current Relay trust boundary has no authentication, pairing, or signed requests and is currently suitable only for a trusted development network.

- Node identity
- Pairing ceremony
- Shared-secret or public-key authentication
- Signed requests
- Capability allowlists
- Node revocation
- Replay protection
- Per-node data boundaries
- Updated placement records after fallback
- Explicit local capability declarations

### Physical Multi-Device Pilot (M09B)

**Status:** Held. Requires two test devices + Ollama + operator.

Infrastructure and relay protocol are implemented and tested in simulation. Physical validation requires two devices on the same network.

## Execution Security

### Central Execution Gate Enforcement

**Status:** Design documents and machine-readable schemas complete (`docs/security/`, `policies/`). Implementation not yet scoped.

Every model, agent, tool, workflow, and Relay Node side effect must pass through one policy evaluator.

**Scope:**

- Typed action requests
- Central policy evaluator
- Allow, deny, approval, and constrained decisions
- Filesystem, shell, network, browser-action, NearbyNode enforcement
- Audit logging
- Human approval flow
- NOPE package evaluation
- Provider-independent Locaily adapter

**Completion conditions:**

- No registered tool can execute outside the policy gate
- Unknown action types fail closed
- Destructive actions require approval
- Credentials cannot be read directly by models
- NearbyNode calls are policy-evaluated
- Bypass tests are documented and passing
- Audit records exist for every attempted side effect

## Deeper System Maturity

### Orchestrator Governance and Step Budgets

**Status:** Candidate. Not yet scoped.

Reusable runtime policy for autonomous execution:

- Maximum steps, retries, runtime, provider cost
- Parallelism ceiling
- Stop conditions, stuck detection
- Approval checkpoints
- Final reviewer rejection
- Partial completion, escalation rules

### Model Specialization and Adapter Lab

**Status:** Research candidate. Not yet scoped.

Test purpose-built models or adapters for specific Locaily roles. Compare base model vs prompted specialist vs fine-tuned/adapter specialist vs deterministic implementation.

## Later / Research

The following items are genuinely unimplemented or exploratory:

- Embedding-based memory retrieval / vector search
- `POST /memory/writeback/apply` (proposal-only path exists; direct apply does not)
- Community workflow marketplace
- Voice/Mumble pack
- Cloud fallback gateway
- Free-form Track generation from natural language
- Automatic model swapping / Model Garage auto-switching

Note: DAG planning and Relay Node distributed execution are **partially implemented** (see `companion/core/dag-executor.js` and `companion/relay/`). They are not listed here as unimplemented research.

## Archive Roadmaps

Older phase plans:

- `docs/99-archive/old-summaries/implementation-plan.md`
- `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/13-implementation-roadmap.md`

Prefer this file and code for current direction; consult archives for historical detail only.

## Related

- [publish-readiness-checklist.md](./publish-readiness-checklist.md)
- [../04-validation/README.md](../04-validation/README.md)
- [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
- [../security/README.md](../security/README.md)
