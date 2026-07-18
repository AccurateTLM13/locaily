# Active Objective — M8: Operator Control Plane

Build the first practical operator interface for supervising Locaily’s durable work. The operator must be able to see queued, active, blocked, failed, and completed jobs; understand which tracks, models, tools, and nodes are involved; respond to human gates; and retry or cancel work without reading raw state files. This is an operational console, not a polished public product.

## Completion Conditions

- An operator UI or local web console shows queue counts and jobs grouped by status.
- Each job view shows objective/workflow identity, current step, attempts, timestamps, selected capability, planned node, actual node, and evidence links.
- Operators can enqueue an approved objective or workflow from the interface.
- Operators can cancel queued or running jobs using the durable execution API.
- Operators can retry eligible failed jobs and see why a failure is or is not retryable.
- Human review gates display the material needed for a decision without exposing unrelated sensitive context.
- Operators can approve, reject, request correction, or stop a gated job.
- Node health and capability summaries are visible, including authentication and last-heartbeat state.
- Fallbacks, enforcement decisions, and planned-versus-actual placement differences are clearly surfaced.
- The interface distinguishes transport success, execution success, enforcement success, and human-reviewed output quality.
- The console does not directly mutate evidence, qualification artifacts, or track definitions.
- Accessibility and keyboard navigation are covered for core operator actions.
- Tests cover queue rendering, job detail states, human-gate actions, retry/cancel actions, unavailable nodes, and API error handling.
- Existing CLI and API operator paths continue to work.
- Existing product and orchestration tests continue to pass.
- Documentation is updated: `current-state.md`, `next-agent-brief.md`, `build-status.md`, `latest-build-result.json`, operator guide, and decision log.

## Out of Scope (this objective)

- Public multi-tenant accounts.
- Remote internet administration.
- Mobile-native applications.
- Visual track-building or prompt-authoring tools.
- Automatic evidence approval.
- Brand-polished marketing UI.

## Stop / Hand-Back

Hand back to a human if:

- The interface requires exposing the Local Brain beyond localhost or the trusted LAN.
- A human-gate action cannot be made auditable and reversible where appropriate.
- Required operator information exists only in raw sensitive inputs or outputs.
- Product design choices would permanently define the public Locaily interface.
- The console would need direct write access to protected Benchmark Lab evidence or qualification files.
