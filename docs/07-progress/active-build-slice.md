# Active Build Slice

## Objective

Post-merge stabilization and recovery — make the current Locaily build internally trustworthy.

## Current Slice

**Complete:** Post-Merge Stabilization (2026-07-18)

Four confirmed defects fixed with regression coverage. Canonical `npm run test:full` suite added. CI updated to run required non-hardware validation.

## Completed Stabilization Items

| Defect | Fix | Regression tests |
|---|---|---|
| Confirm dialog cancellation | `confirmResult.confirmed` guard in operator console | `test-operator-confirm.js` (11) |
| Operator job creation contract | `executionType` payload + production route test | `test-jobs-api.js` (64), `test-jobs-api-production.js` (8) |
| Failed workflow jobs marked completed | `job-outcome.js` + worker outcome evaluation | `test-jobs-worker.js` (50) |
| DM multi-project path isolation | `memory-services.js` for server endpoints | `test-development-memory-multi-project.js` (6) |

## Validation Commands

```powershell
npm.cmd run test:full
npm.cmd run test:jobs:production   # requires running server
node scripts/smoke-test.js          # requires running server
```

## Next Slice

**Development Memory end-to-end proof using a second real project**

Prove the DM1–DM10 loop on a non-Locaily project with real capture, candidate extraction, review, and retrieval — not simulation-only evidence.

## Stop Conditions

- Do not expand product features during stabilization
- Do not modify approved benchmark evidence
- Hardware/provider tests remain explicitly out of scope until requested
