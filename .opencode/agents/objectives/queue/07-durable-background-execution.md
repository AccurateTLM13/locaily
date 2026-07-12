# Active Objective — M7: Durable Background Execution

Add a durable background execution layer so Locaily can accept queued objectives or workflow runs, execute them without an attached request, survive process restarts, and recover safely from failures. Reuse a proven scheduler or durable-workflow pattern where practical rather than inventing a full orchestration platform. The existing track runner, DAG executor, evidence system, enforcement gates, and Relay placement remain the execution foundation.

## Completion Conditions

- A durable job record schema exists with stable job ID, objective or workflow reference, status, attempt count, timestamps, and correlation IDs.
- Jobs can be queued, claimed, started, completed, failed, cancelled, and retried through explicit state transitions.
- Only one worker can hold an active lease for a job at a time.
- Expired leases can be reclaimed without duplicating a completed run.
- Job state persists across Local Brain process restarts.
- A restarted process resumes or safely retries interrupted work according to documented policy.
- Retry behavior includes bounded attempts, backoff, and non-retryable error classification.
- The background runner invokes existing track/workflow execution paths rather than creating a second orchestration engine.
- Canonical Track Run Records and audit records remain linked to the durable job.
- Human-gated jobs can pause in a review-required state and resume after an explicit decision.
- APIs or CLI commands exist to enqueue, inspect, cancel, retry, and list jobs.
- Tests cover restart recovery, lease expiration, duplicate-claim prevention, cancellation, retry exhaustion, human-gate pause/resume, and Relay fallback during a background job.
- Existing synchronous `/tracks/run` and `/workflows/run` behavior remains supported.
- Existing contract, smoke, Benchmark Lab, enforcement, DAG, Relay, and multi-device tests continue to pass.
- Documentation is updated: `current-state.md`, `next-agent-brief.md`, `build-status.md`, `latest-build-result.json`, operator guide, and decision log.

## Out of Scope (this objective)

- Full visual operator dashboard.
- Arbitrary code execution supplied by users.
- Multi-orchestrator consensus or active-active control planes.
- Cloud-hosted queue services as a required dependency.
- Automatic generation or mutation of track definitions.
- Large-scale throughput optimization.

## Stop / Hand-Back

Hand back to a human if:

- The chosen durable scheduler introduces a mandatory cloud dependency.
- Correct recovery requires breaking current Track Run Record or workflow contracts.
- Exactly-once execution is required but cannot be honestly supported with the selected storage model.
- The implementation would make Relay Nodes control planes rather than execution targets.
- A queue dependency or license conflicts with Locaily’s local-first or open-source direction.
