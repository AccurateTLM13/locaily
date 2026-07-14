# Active Objective

Implement the first **Track Learning Evidence Loop** across Lighthouse Handoff
and DealSniper.

A completed track run should produce structured evidence that can later help
improve existing tracks and reduce the cost of creating new ones.

## Source

Mirrors `docs/07-progress/active-build-slice.md` (Canonical Track Run Records).
When this file and the build slice disagree, the build slice wins; update this
file to match.

## Completion Conditions

- Canonical run records exist (schema defined)
- Successful and failed runs emit evidence
- Human corrections can attach to runs
- Evidence is summary-safe (raw sensitive inputs/outputs not stored by default)
- Both Lighthouse Handoff and DealSniper pass tests with valid evidence records
- New tests cover success, failure, retry, and correction cases
- Existing smoke and contract tests continue to pass
- Documentation reflects the real implementation (`current-state.md`,
  `next-agent-brief.md`, `latest-build-result.json`, decision log)

## Out of Scope (this objective)

- Automatic track generation
- Automatic mutation of existing tracks
- Relay Nodes
- DAG execution
- New provider integrations
- New showcase workflows
- Adapter training or model fine-tuning

## Stop / Hand-Back

Hand back to a human if (per the build slice):

- Existing audit logging conflicts with the proposed record format
- Sensitive data cannot be excluded safely
- Track identity or version cannot be determined reliably
- The implementation requires redesigning the track runner
- Existing tests fail for unrelated reasons