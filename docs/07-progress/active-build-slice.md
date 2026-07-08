# Active Build Slice

## Objective

Add a separate human output-quality review and correction layer for Track Run Records.

## Current Slice

Output Quality Review + Human Correction Records - **complete**.

**Status:** Human review records can be attached to completed Track Run Records without mutating original model output or enforcement decision evidence. The Local Brain can now report quality-review aggregates separately from transport and enforcement success.

### Completed Scope Items

| Area | Status | Notes |
|---|---|---|
| Human review schema | Complete | `companion/evidence/schemas/human-review-record.schema.json` |
| Separate review store | Complete | `companion/evidence/human-review-record-store.js`; stores under `data/evidence/human-reviews/` |
| Review create/update API | Complete | `POST /runs/:id/review` |
| Review read API | Complete | `GET /runs/:id/review` |
| Quality summary API | Complete | `GET /enforcement/quality-summary` |
| Operator CLI | Complete | `npm.cmd run quality-review -- list`, `show`, `pass`, `needs-edit`, `fail`, `summary` |
| Original output preservation | Complete | Review/correction records are separate JSON artifacts keyed by `trackRunId` |
| Summary aggregation | Complete | Counts verdicts, pass/correction rates, averages, common failure reasons, critical risk count |
| Tests | Complete | `node scripts/test-human-review-records.js`; smoke covers HTTP review endpoints |

## Review Record Captures

- `trackRunId`
- `trackId`
- `roleId`
- `capabilityId`
- `executedCapabilityId`
- `reviewer`
- `reviewedAt`
- `usefulnessScore`
- `accuracyScore`
- `structureScore`
- `clarityScore`
- `riskScore`
- `riskFlags`
- `verdict`: `pass`, `needs_edit`, `fail`
- `correctionRequired`
- `correctionText`
- `reviewerNotes`
- `failureReasons`
- `createdAt`
- `updatedAt`

## Quality Summary

`GET /enforcement/quality-summary` reports:

- total reviewed runs
- pass / needs-edit / fail counts
- pass rate
- correction rate
- average usefulness, accuracy, and structure scores
- common failure reasons
- critical risk count

The simpler operator path does not require the server:

```bash
npm.cmd run quality-review -- list --track website_audit.lighthouse_handoff
npm.cmd run quality-review -- show <trackRunId>
npm.cmd run quality-review -- pass <trackRunId> --notes "Useful as-is"
npm.cmd run quality-review -- needs-edit <trackRunId> --correction "Corrected handoff text"
npm.cmd run quality-review -- fail <trackRunId> --reason "invented_audit"
npm.cmd run quality-review -- summary
```

## Key Principle

Execution success and enforcement success do not validate model judgment quality. This slice records human quality review separately so Locaily can distinguish:

1. Transport success
2. Enforcement/routing success
3. Human-reviewed output quality

## Next Slice Candidate

**Human Review Workflow for Lighthouse Pilot**

Review the actual first enforced Lighthouse pilot outputs, add real human review records, and use quality-summary data to decide whether to continue, suspend, or narrow the pilot.

## Stop Conditions

- Do not overwrite Track Run Record model output.
- Do not mutate `routing.enforcementDecision` when adding reviews.
- Do not claim model quality is validated from execution success alone.
- Do not build UI in this slice.
