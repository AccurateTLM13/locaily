# Execution Security Design

This folder documents Locaily's intended execution-security boundary — the design for how agent-initiated side effects are evaluated, approved, constrained, or denied before they execute.

## What This Folder Covers

- Threat model and protected assets
- Core execution policy (models propose, Locaily decides)
- Human approval rules for different action types
- Capability boundaries for NearbyNode and tool execution
- Evaluation brief for the NOPE policy dependency

## Current Status

Locaily has documented its intended execution-security boundary.

Runtime enforcement is not yet complete. These documents describe required
behavior and future architecture; they must not be treated as proof that all
agent actions are currently sandboxed or policy-enforced.

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
