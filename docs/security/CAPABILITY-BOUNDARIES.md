# Capability Boundaries

## Overview

Locaily treats nearby devices as capability providers, not merely model hosts. A NearbyNode advertises what it can do — running a model, executing a tool, hosting a service. This document defines the security boundary around that capability model.

## Capability Advertising vs. Authorization

A node advertising a capability does **not** automatically authorize its use.

- Registration declares what a node claims to support
- Authorization happens through the execution policy gate
- Every capability invocation must pass through policy evaluation before execution

## Capability Scopes

Each registered capability has an explicit scope:

| Scope | Description |
|---|---|
| `model.run` | Execute model inference on the node |
| `tool.execute` | Run a tool handler on the node |
| `service.invoke` | Call a service endpoint on the node |
| `data.transfer` | Send or receive data from the node |

A node may advertise multiple capabilities. Each capability is evaluated independently by the execution gate.

## Minimum Data Principle

Nodes receive only the minimum data required to perform their assigned task:

- Model steps receive the prompt and schema — not the full project context
- Tool steps receive the specific input contract — not arbitrary payloads
- Data transfer is explicitly scoped and policy-evaluated

## Execution Gate Requirement

Every node action must eventually pass through the centralized execution gate:

1. A workflow step is assigned to a node
2. The step's action request is constructed (action type, target, reason, risk level)
3. The execution gate evaluates the request against the active policy
4. The decision (ALLOW, DENY, REQUIRE_APPROVAL, CONSTRAIN) governs execution
5. The decision is recorded in the audit log

No code path bypasses the gate. This includes:
- Direct `/relay/step` calls
- Workflow orchestrator step execution
- Track runner step execution
- Manual operator-triggered actions

## Current Implementation Status

Relay Node protocol and capability registration are implemented (M4). The execution gate that wraps capability invocation in policy evaluation is planned but not yet implemented.

The existing capability registry (`docs/01-architecture/capability-registry.md`) documents what capabilities exist. This document defines the security boundary around how they may be used.

## Risk: Unrestricted Capability Access

Without enforcement, a compromised model or injected prompt could:
- Invoke any registered capability on any reachable node
- Transfer data to another device without policy evaluation
- Advertise unauthorized capabilities from a compromised node

The execution policy layer prevents this by requiring every capability invocation to pass through the policy gate.
