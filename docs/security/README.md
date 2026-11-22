# Execution Security Design

This folder documents Locaily's intended execution-security boundary — the design for how agent-initiated side effects are evaluated, approved, constrained, or denied before they execute.

## What This Folder Covers

- Threat model and protected assets
- Core execution policy (models propose, Locaily decides)
- Human approval rules for different action types
- Capability boundaries for NearbyNode and tool execution
- Evaluation brief for the NOPE policy dependency

## Current Status

Locaily has implemented **v1.0.0** of its Central Execution-Policy Runtime Gate (`SEC-01`, `companion/security/`) enforcing `policies/default-execution-policy.json` (`status: "enforced"`, `defaultDecision: "deny"`).

Runtime enforcement now wraps:
- Tool and track execution (`companion/crew/tool-router.js`, `POST /tasks/run`, `POST /analyze`, `POST /tracks/run`, `POST /workflows/run`, background worker options)
- Memory vault writeback apply (`POST /memory/writeback/apply`)
- NearbyNode relay registration and dispatch (`POST /relay/register`, `POST /relay/step`, `companion/relay/router.js`)
- Workflow Pack permission assessment (`GET /packs`, `GET /packs/:id`)
- Operator inspection and approval resolution (`/security/policy`, `/security/evaluate`, `/security/decisions`, `/security/approvals`, and Companion Console `#security`)

Remaining scope boundaries (intentionally out of scope for `SEC-01`):
- OS-level container/VM process sandboxing
- Automated browser-action execution runtime

## Documents

| Document | Purpose |
|---|---|
| [THREAT-MODEL.md](./THREAT-MODEL.md) | What Locaily is protecting against and what assets are at stake |
| [EXECUTION-POLICY.md](./EXECUTION-POLICY.md) | Core policy rule, decision types, and per-domain enforcement rules |
| [APPROVAL-RULES.md](./APPROVAL-RULES.md) | Which actions are automatic, which require human approval, and which are always denied |
| [CAPABILITY-BOUNDARIES.md](./CAPABILITY-BOUNDARIES.md) | How NearbyNode capabilities are scoped and restricted |
| [NOPE-EVALUATION.md](./NOPE-EVALUATION.md) | Evaluation brief for `@agnt-gg/nope` as a policy-enforcement dependency |

## Relationship to Other Files

- `SECURITY.md` (repo root) covers vulnerability reporting scope and supported concerns
- `docs/01-architecture/capability-registry.md` documents the tool registry that this policy layer will wrap
- `policies/` contains machine-readable policy definitions and schemas

## Design Principle

> Models may propose actions. Locaily decides whether those actions execute.

This is the foundational rule. Every document in this folder derives from it.
