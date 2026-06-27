# Active Build Slice

## Objective

Build the first Track Learning Evidence Loop.

A completed track run should produce structured evidence that can later help improve existing tracks and reduce the cost of creating new ones.

## Current Slice

Canonical Track Run Records.

## Included

- Define a canonical track-run record schema
- Emit one record after each track execution
- Record track version, steps, workers, validation results, retries, and timing
- Support optional human correction records
- Store summary-safe evidence
- Add automated tests
- Update project state documentation

## Excluded

- Automatic track generation
- Automatic mutation of existing tracks
- NearbyNode
- DAG execution
- New provider integrations
- New showcase workflows
- Major console redesign
- Adapter training or model fine-tuning

## Acceptance Criteria

- Every completed track run produces a valid run record
- Failed track runs also produce a record
- Records validate against the canonical schema
- Raw sensitive inputs and outputs are not stored by default
- A correction can be associated with an existing run
- Lighthouse Handoff produces valid evidence records
- DealSniper produces valid evidence records
- Existing smoke and contract tests continue to pass
- New tests cover success, failure, retry, and correction cases

## Stop Conditions

Stop and report instead of expanding scope when:

- Existing audit logging conflicts with the proposed record format
- Sensitive data cannot be excluded safely
- Track identity or version cannot be determined reliably
- The implementation requires redesigning the track runner
- Existing tests fail for unrelated reasons

## Completion Requirements

Before declaring the slice complete:

1. Run all relevant tests
2. Record exact commands and results
3. Update `current-state.md`
4. Update `next-agent-brief.md`
5. Update `latest-build-result.json`
6. Record any architecture decision in the decision log
