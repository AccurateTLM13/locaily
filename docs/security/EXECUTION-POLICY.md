# Execution Policy

## Core Rule

> Models may propose actions. Locaily decides whether those actions execute.

No model output, tool request, or workflow step executes automatically without passing through the execution gate. The gate is the single point of control for all side effects.

## Decision Types

Every action request receives exactly one of these decisions:

```txt
ALLOW          Action executes immediately.
DENY           Action is rejected. No side effect occurs.
REQUIRE_APPROVAL  Action is paused. Human operator must approve before execution.
CONSTRAIN      Action executes within explicit bounds (time, scope, resource limits).
```

## Default Decision

Unknown action types are **denied**. The policy file sets:

```json
"defaultDecision": "deny"
```

If an action is not explicitly listed in the policy, it does not execute. This is fail-closed behavior.

## Domain Policies

### Filesystem Reads

| Scope | Decision |
|---|---|
| Read files inside the active project workspace | ALLOW |
| Read files outside the workspace | REQUIRE_APPROVAL |
| Read Locaily configuration files | REQUIRE_APPROVAL |
| Read credential stores | DENY |

### Filesystem Writes

| Scope | Decision |
|---|---|
| Write temporary files inside the workspace | ALLOW |
| Write files inside the active project workspace | ALLOW |
| Write files outside the workspace | REQUIRE_APPROVAL |
| Write to Locaily configuration files | REQUIRE_APPROVAL |

### Deletes

| Scope | Decision |
|---|---|
| Delete temporary files the session created | ALLOW |
| Delete existing user files | REQUIRE_APPROVAL |
| Delete Locaily configuration or security files | DENY |
| Delete audit logs | DENY |

### Shell Execution

| Scope | Decision |
|---|---|
| Run pre-approved deterministic commands | REQUIRE_APPROVAL |
| Run arbitrary shell commands | DENY |

### Browser Automation

| Scope | Decision |
|---|---|
| Open local URLs (localhost) | ALLOW |
| Open external URLs | REQUIRE_APPROVAL |
| Interact with browser extensions | REQUIRE_APPROVAL |

### Network Requests

| Scope | Decision |
|---|---|
| Local network (localhost, LAN discovery) | REQUIRE_APPROVAL |
| External network (internet APIs, webhooks) | REQUIRE_APPROVAL |
| Network requests during model inference | ALLOW (provider-bounded) |

### API Calls

| Scope | Decision |
|---|---|
| Locaily internal endpoints | ALLOW |
| Local model runtime (Ollama) | ALLOW |
| Third-party paid APIs | REQUIRE_APPROVAL |
| Third-party free APIs | REQUIRE_APPROVAL |

### Credentials

| Scope | Decision |
|---|---|
| Read credentials | DENY |
| Write credentials | DENY |
| Pass credentials to approved local services | REQUIRE_APPROVAL |
| Pass credentials to external services | DENY |

### NearbyNode Actions

| Scope | Decision |
|---|---|
| Invoke a registered capability on a known node | REQUIRE_APPROVAL |
| Invoke an unregistered capability | DENY |
| Transfer data to another device | REQUIRE_APPROVAL |
| Register a new NearbyNode | REQUIRE_APPROVAL |
| Modify NearbyNode capability advertisements | REQUIRE_APPROVAL |

### Software Installation

| Scope | Decision |
|---|---|
| Install npm dependencies for Locaily | REQUIRE_APPROVAL |
| Install system packages | DENY |
| Download and execute binaries | DENY |

### External Publishing

| Scope | Decision |
|---|---|
| Publish content to any external service | REQUIRE_APPROVAL |
| Send messages | REQUIRE_APPROVAL |
| Post to social media or forums | DENY |

## Enforcement Notes

`policies/default-execution-policy.json` (`version: "1.0.0"`, `status: "enforced"`, `defaultDecision: "deny"`) is enforced at runtime by `companion/security/` (`createExecutionGate`). Tool runs, workflow steps, memory writebacks, Workflow Pack permission assessments, and NearbyNode relay endpoints evaluate `action-request.schema.json` payloads before execution and record `policy-decision.schema.json` outcomes to `data/security/policy-decisions.jsonl` and `companion/core/audit-log.js`. OS-level container/VM sandboxing and full browser automation remain future runtime hardening outside `SEC-01`.
