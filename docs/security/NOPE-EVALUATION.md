# NOPE Evaluation

## Status

Evaluated in `SEC-01` (`sec-01-execution-policy-runtime-gate`, 2026-11-22). Decision: **Do not adopt `@agnt-gg/nope` as a runtime dependency now; implement Locaily's zero-dependency native evaluator behind a pluggable adapter interface.**

## What It Is

`@agnt-gg/nope` is a third-party policy-enforcement package for agent actions. Locaily evaluated it as a candidate component for its central execution-policy runtime gate.

## Evaluation Criteria & Assessment

| Criterion | `@agnt-gg/nope` (External Package) | `LocailyNativePolicyEvaluator` Behind Adapter |
|---|---|---|
| 1. **Fail-closed default** | Supports rule-based denies, requires mapping Locaily's schema | Enforces `defaultDecision: "deny"` directly against `policies/default-execution-policy.json` |
| 2. **Local-only operation** | External npm dependency tree | Zero external dependencies, 100% offline/local Node.js stdlib |
| 3. **Windows compatibility** | Requires verifying upstream release/build behavior on Windows | First-party Windows path normalization + case-insensitive drive boundary checks |
| 4. **Adapter-friendly** | Wrappable behind an internal interface | Implemented directly behind `companion/security/policy-evaluator-adapter.js` (`{ name, evaluate }`) with outer immutable hard-deny guardrails |
| 5. **Audit-transparent** | Custom audit mapping needed | Emits records conforming to `policies/policy-decision.schema.json`, `data/security/policy-decisions.jsonl`, and `run-log-audit-record.schema.json` |
| 6. **Human-approval capable** | Requires integrating Locaily approval queue | Integrated with `companion/security/approval-store.js`, `POST /security/approvals/:id/approve|deny`, and Console `#security` |
| 7. **Action-type coverage** | Requires schema translation | Validates `policies/action-request.schema.json` directly across filesystem, shell, browser, network, credentials, memory, audit, policy, and NearbyNode actions |

## Decision

1. **Rejected for direct dependency adoption in `SEC-01`**: Adopting `@agnt-gg/nope` would introduce Locaily's first external runtime npm dependency (currently zero dependencies in `package.json`), add supply-chain and Windows compatibility risk, and still require custom glue for Locaily's schemas, durable approval queue, and strict audit log contract.
2. **Native evaluator behind swappable adapter**: `companion/security/policy-evaluator-adapter.js` defines a clean `{ name, evaluate(actionRequest, context) }` adapter interface wrapped by `wrapEvaluatorAdapter(...)`, defaulting to `createNativePolicyEvaluator(...)`.
3. **Future reversibility**: If Locaily later needs features unique to `@agnt-gg/nope`, it can be plugged into `createExecutionGate({ evaluatorAdapter })` without changing callers, schemas, approval flows, or immutable hard-deny invariants.
4. Recorded in [docs/06-decisions/decision-log.md](../06-decisions/decision-log.md).
