# Locaily North Star: Local Capability Network

**Source:** project direction document, June 2026.

This document records the durable direction from the North Star brief. It is a vision and architecture guardrail, not a claim that every item is implemented.

## North Star

Locaily turns nearby hardware into a local capability network. It decomposes useful work into narrow tracks, routes each track to the smallest qualified model, tool, rule, or node, validates the result, and records evidence so future runs can route and validate better.

## Defining Shift

Locaily is capability-first, not model-first.

Model-first thinking chooses one powerful model and pushes every task through it. Capability-first thinking defines the work first, then routes each part to the smallest qualified capability that can satisfy the contract.

Core thesis:

- Device does not equal AI model. A device is a collection of capabilities.
- Agent does not equal model instance. An agent is a role, contract, state, permissions, and tools using shared inference.
- A track is an execution contract, not just a prompt.
- The best worker is the smallest qualified worker, not automatically the largest available model.
- Meaningful runs should leave structured evidence that improves routing, validation, or future track design.

## Architecture Spine

```txt
User Task
  -> Workflow Contract
  -> Task Decomposer
  -> Track Router
  -> Qualified Worker
  -> Validation
  -> Output Assembly
  -> Final Validation
  -> Result + Evidence Record
```

Current implementation is earlier than the full spine. Local Brain, tool packs, model roles, linear tracks, workflow orchestration, Memory Bridge v0, and Benchmark Lab scaffolding exist. Automatic decomposition, graph planning, NearbyNode dispatch, RelayNode dispatch, and adaptive routing are future work.

## Tracks as Contracts

A track is the smallest reusable unit of meaningful work. It should be narrow enough to benchmark, route, retry, replace, and improve independently.

A complete track contract should define:

- Input schema and required context
- Expected output schema
- Required capabilities
- Allowed tools and permissions
- Validation rules and quality floor
- Retry, fallback, and escalation policy
- Evidence to record after execution

## Capability Routing

Tracks request capabilities rather than hard-coded model names. A mature router should consider:

- **Qualified:** Has this worker passed the track quality floor?
- **Available:** Can the worker run now on an eligible node?
- **Appropriate:** Does it satisfy privacy, latency, context, and tool requirements?
- **Efficient:** Is it the smallest practical option that meets the contract?

Current code supports model roles, provider routing, tool routing, qualification-record loading, and track execution. A unified capability registry and automatic adaptive router are not built yet.

## Shared Inference, Separate Agents

Locaily agents should not require a dedicated model copy. A model server can load weights once and serve several agent roles through queued or batched requests. Each role keeps its own context, state, tool permissions, and output contract while sharing the underlying inference capability.

Guidelines:

- One model may support several crew roles.
- One role may use different qualified models depending on the track.
- Concurrency is a scheduling problem, not a reason to duplicate the whole model stack.
- Dedicated model instances should be introduced only when measurements justify the resource cost.

## Nodes and Capability Network

A node is defined by what it can reliably offer to Locaily at a given moment, not by a specific processor, GPU, or model.

Node metadata should eventually cover:

- Identity: trusted node ID, ownership, network relationship, and policy scope
- Capabilities: models, tools, storage, sensors, files, services, and deterministic workloads
- Constraints: memory, compute, runtimes, context limits, power state, and privacy boundaries
- Availability: load, queue depth, health, readiness, and loading state
- Evidence: observed latency, quality, reliability, failures, and qualification history

NearbyNodes are trusted local or nearby devices that advertise capabilities to Local Brain and accept only approved work. RelayNodes are approved remote execution targets for burst capacity, hosted models, automation, or benchmarking. RelayNodes may provide execution, but Local Brain remains the control plane.

## Compounding Evidence Loop

The system compounds when completed work improves the system that performs the next run.

```txt
Run -> Observe -> Validate -> Record -> Compare -> Qualify -> Route Better -> Improve the Track
```

Evidence should be structured, comparable, and connected to decisions:

- Execution evidence: model, tool, node, versions, parameters, context size, timing, and resource behavior
- Quality evidence: schema validity, deterministic checks, human review, semantic judging, and task-specific scoring
- Failure evidence: timeouts, malformed outputs, unsupported tools, weak reasoning, drift, and recovery path
- Routing evidence: why the worker was selected and whether that selection was correct
- Qualification evidence: whether a worker remains approved for the track under tested conditions
- Design evidence: what should change in the track, workflow, validator, or routing policy

## Registries

The long-term system needs shared machine-readable truth:

- Workflow Registry: complete jobs and how tracks connect
- Track Registry: contracts, schemas, validation, permissions, and retry policies
- Model Registry: model identities, runtimes, capabilities, limits, and qualification references
- Capability Registry: what every node can run right now
- Worker Registry: models, tools, scripts, rule engines, validators, and service endpoints available for dispatch
- Qualification Registry: which workers are approved for which tracks and under what conditions
- Evidence Store: run records used for regression, routing improvement, debugging, and system learning

JSON remains the internal runtime format. Markdown is the human-facing explanation and export format.

## Operating Principles

- Local-first, not local-only: prefer local execution while retaining explicit, policy-controlled escalation.
- Smallest qualified capability: select the least expensive worker that consistently meets the track contract.
- Deterministic where possible: use code, rules, schemas, and validators before model inference.
- Models remain replaceable: tracks and agents declare capabilities, not permanent model dependencies.
- Nodes advertise; Local Brain decides: execution capacity reports what it can do, routing authority stays centralized.
- Evidence over intuition: routing, purchases, qualification, and track revisions should be supported by observed results.
- Graceful degradation: queue, retry, reduce scope, or escalate rather than fail opaquely.
- Privacy is a routing constraint: sensitive workloads stay on eligible nodes and never silently cross a policy boundary.
- Human authority remains explicit: high-impact writeback, publishing, external outreach, and destructive actions require approval.

## Success Definition

Locaily is moving toward the North Star when it can demonstrate:

- Useful workflows decomposed into reusable, independently testable tracks
- Multiple agents sharing model services without duplicated model instances
- Tracks routed by capability and qualification rather than hard-coded machine or model names
- Laptop and desktop participating as separate nodes in one coordinated execution system
- Failed or low-quality tracks retrying, falling back, or escalating according to policy
- Benchmark Lab qualification records affecting runtime routing
- Every completed workflow producing a structured evidence record
- Evidence from past runs improving quality, latency, reliability, or cost
- Additional hardware joining as nodes without redesigning workflow contracts
- Local-only operation remaining useful

North Star metric:

```txt
Percentage of useful workflow runs completed at the required quality floor
by the smallest qualified capability, with a valid evidence record and no
unnecessary escalation.
```

## Directional Build Sequence

1. Prove the loop: one workflow, a small track set, two registered nodes, deterministic validation, and complete evidence records.
2. Prove qualification: Benchmark Lab produces qualification records that runtime uses for real routing decisions.
3. Prove shared services: multiple crew roles share inference endpoints through queues, priorities, and bounded contexts.
4. Prove adaptive routing: routing considers quality, availability, latency, privacy, cost, and recent evidence.
5. Expand the network: additional NearbyNodes and RelayNodes add capabilities without changing workflow contracts.
6. Compound track development: run evidence suggests track revisions, benchmark cases, validator improvements, and new reusable workflows.

## Decision Guardrail

Before adding a model, agent, node, provider, or hardware purchase, answer:

- Which existing or planned track needs this capability?
- What measurable limitation exists today?
- Can a deterministic tool, smaller model, or scheduling change solve it first?
- How will the capability be qualified?
- What evidence will prove the addition was worthwhile?
- Can it join the network without creating a new silo?
