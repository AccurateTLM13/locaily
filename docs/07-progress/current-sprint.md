# Current Sprint

**Updated:** 2026-07-22

## Status

Between major build cycles. No objective is currently active.

The repository is safe to begin new work. Lifecycle integrity passes; continuity check resolves cleanly.

## Recently Completed

- **Development Control Plane Phase 2B** — profile-driven validation and milestone completion gates. dev:validate runs strict status checks first, then profile commands, records immutable validation results. dev:milestone:complete enforces 8 gates (blockers, contradictions, validation, stale validation, open session, acceptance criteria, remaining work, closeout). Stale-validation protection based on branch+HEAD+dirty state. Contradiction severity model: info→exit 0, warning→exit 0, error→exit 1, critical→exit 2 (strict: warning→exit 1). 30 Phase 2B tests passing. Full E2E: start→validate→pause→complete→ready-for-delivery.
- **Development Control Plane Phase 1.5 + 2A** — state reconciliation and lifecycle commands. Fixed legacy run-state contradiction, added contradiction severity levels, dev:lifecycle.js with start/checkpoint/pause/block/resume, 14 reconciliation tests. Cross-session handoff proven.
- **Development Control Plane Phase 1** — canonical project-state.json, 4 JSON schemas (project-state, milestone, session, validation-profile), fixtures, 25 schema validation tests, dev:status command (human-readable + JSON), agent-neutral AGENTS.md, compatibility mapping. All existing tests pass.
- **Security Policy Foundation** — execution-security documentation and machine-readable policy schemas added (`docs/security/`, `policies/`). Policy documented; centralized enforcement not yet complete.
- **M10 — Locaily v1 Packaging** — documentation alignment, state migration scaffolding, operator walkthrough, relay pairing docs, release positioning. Archived to completed via lifecycle mechanism.
- **M12 — Track Learning Evidence Loop** — disagreement classification, drift detection, per-track learning state, retry comparisons. All 14 conditions met.
- **Objective Lifecycle Hardening** — stable objective IDs, mandatory closeout, continuity gate, queue archival, encoding normalization.
- **M09 — Physical Multi-Device Pilot** — held (second physical device unavailable). Infrastructure and relay protocol implemented and tested in simulation.

## Approved Next Work

The following items are approved for consideration as the next objective. They are not yet started. Selection requires an explicit user decision.

### Immediate candidates (operator-facing proof)

1. **Second-Repository Operator Acceptance** — brief manual walkthrough on a real second repository to validate the Development Memory Loop outside simulation. Record pass/fail; fix only if blocked. Prerequisite for physical pilot claims.
2. **Clean-Machine v1 Acceptance** — clone, install, start, run a workflow, inspect evidence, stop/restart, preserve state, upgrade/migrate, remove cleanly. A non-developer can follow one guide and complete one useful workflow without manually repairing configuration.

### Product proof candidates

3. **Lighthouse Handoff Product Bridge** — extension discovers Local Brain, explicit CORS policy, connection status, deterministic mode, local AI enhancement mode, failure fallback, report comparison, real PageSpeed payload handling, export to coding-agent-ready Markdown, installer/setup path covering both repositories.
4. **Workflow Pack Contract and Starter SDK** — contributor can install or create a complete workflow pack (tracks, tools, prompts, schemas, fixtures, permissions, qualification requirements) without modifying Local Brain core code.

### Infrastructure candidates

5. **Milestone Completion Delivery Workflow** — local script (`deliver-milestone.js`) that reads milestone manifest + closeout + build slice, generates a dry-run delivery summary, creates a scoped `milestone/<slug>` branch with conventional-commit message, and opens a draft PR via `gh` CLI. CI validates via existing `ci.yml`. No automatic merge, release, or tagging in v1. Design and acceptance conditions at [milestone-completion-delivery-workflow.md](./milestone-completion-delivery-workflow.md). **Implemented** — dry-run, execute, PR, and `--all` modes verified. See `npm run deliver-milestone`.

### Selection criteria

- The next objective must be explicitly selected by the operator
- No automatic progression to the next milestone
- Each candidate is independently viable

## Deferred

- **M09A — Relay Trust and Secure Pairing** — node identity, pairing ceremony, authentication, signed requests, capability allowlists, node revocation. Should precede or become the first half of M09.
- **M09B — Physical Multi-Device Pilot** — requires two devices + Ollama + operator. Infrastructure ready; physical validation pending.
- **Central Execution Gate Enforcement** — every model, agent, tool, workflow, and Relay Node side effect passes through one policy evaluator. Design docs exist; implementation not yet scoped.
- **Automatic Task Intake and Track Selection** — deterministic intent hints → small classifier → candidate workflow/track → contract check → operator confirmation when ambiguous.

## Later Candidates (not yet scoped)

- Orchestrator Governance and Step Budgets
- Model Specialization and Adapter Lab
- Embedding-based Memory Retrieval
- Community Workflow Marketplace

## Out of Scope

- Automatic model swapping / Model Garage auto-switching
- DAG planning or free-form Track generation as separate features (both partially implemented)
- Public benchmark marketing beyond committed evidence
- Broader qualification coverage without an explicit task
