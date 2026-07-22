# NOPE Evaluation

## Status

Candidate dependency. Not approved or integrated.

## What It Is

`@agnt-gg/nope` is a policy-enforcement package for agent actions. Locaily is evaluating it as a potential runtime component for its execution gate.

## Questions To Validate

- Can it operate independently from the AGNT ecosystem?
- Does it support Windows?
- Does it fail closed?
- Can it wrap filesystem, shell, browser, network, and NearbyNode actions?
- Can policies be stored and versioned locally?
- Does it support human approval flows?
- Can actions bypass it?
- What audit logging does it provide?
- What is its license?
- What dependencies and services does it require?
- Can Locaily place it behind an internal adapter?

## Evaluation Criteria

Any policy-enforcement dependency must meet these requirements before adoption:

1. **Fail-closed default** — unknown actions are denied, not allowed
2. **Local-only operation** — no external service dependencies for policy decisions
3. **Windows compatibility** — Locaily is a Windows-first local tool
4. **Adapter-friendly** — Locaily can wrap it behind its own interface without leaking its API
5. **Audit-transparent** — every policy decision is recorded with full context
6. **Human-approval capable** — supports pausing execution for operator review
7. **Action-type coverage** — covers filesystem, shell, browser, network, credentials, and NearbyNode actions

## Decision

Not yet evaluated. This document records the open questions. Evaluation will occur when Locaily reaches the Execution Policy Enforcement milestone.
