# Active Build Slice

## Objective

Complete the first full Lighthouse Handoff product loop — add `testing_checklist_writer`, assemble the full handoff, validate the complete artifact, and package the operator workflow.

## Current Slice

**Complete:** Full Lighthouse Handoff Validation Loop — 4 roles qualified, 10 track steps, full assembled artifact quality gate, `--artifact full-handoff` mode.

**Status:** `testing_checklist_writer` is qualified (score 1.0). All 4 roles (priority_helper, developer_task_writer, guardrail_writer, testing_checklist_writer) are qualified; 3 enforced within `website_audit.lighthouse_handoff`. Track has 10 steps. Capabilities: 6, Qualified: 4. Full handoff assembly includes testing checklist. No global broadening.

## New: testing_checklist_writer

| Area | Status | Notes |
|---|---|---|
| Schema | Complete | `companion/crew/schemas/testing-checklist-writer.schema.json` — 6 required fields (pageSpeedRerunSteps, beforeAfterComparisons, regressionChecks, manualQaNotes, codingAgentVerification, stopAndAskTriggers) |
| Prompt | Complete | `buildTestingChecklistWriterPrompt()` in `prompts.js` + `write_testing_checklist` template |
| Track step | Complete | `write_testing_checklist` added as step 8/10 in `lighthouse-handoff.track.json` |
| Handoff integration | Complete | `normalizeTestingChecklistPacket()` + 6 markdown sections (rerun steps, before/after, regression, manual QA, coding agent verification, stop-and-ask triggers) |
| Quality gate | Complete | `findTestingChecklistWriterChild()` + completeness checks + `parseTestingChecklistWriterCounts()` in `lighthouse-human-gate.js` |
| Model role | Complete | `testing_checklist_writer` mapped to `llama3.2` in `server.js` config |
| Formal qualification | Complete | Evidence summary, approved marker, qualification record, 3 checksums — score 1.0, 3/3 URL scenarios |
| Full handoff quality gate | Complete | `--artifact full-handoff` mode validates: priority fixes, developer tasks, guardrails, testing checklist, coding agent prompt, no invented audits, no unsupported claims |
| Validation report | Complete | `benchmark-lab/evidence/reviews/full-lighthouse-handoff-validation-v1.md` + `.json` |

## Completed Scope Items

| Area | Status | Notes |
|---|---|---|
| Human review schema | Complete | `companion/evidence/schemas/human-review-record.schema.json` |
| Separate review store | Complete | `companion/evidence/human-review-record-store.js`; stores under `data/evidence/human-reviews/` |
| Review create/update API | Complete | `POST /runs/:id/review` |
| Review read API | Complete | `GET /runs/:id/review` |
| Quality summary API | Complete | `GET /enforcement/quality-summary` |
| Operator CLI | Complete | `npm.cmd run quality-review -- list`, `show`, `pass`, `needs-edit`, `fail`, `summary` |
| Lighthouse run CLI | Complete | `npm.cmd run lighthouse:run -- --url https://your-site.com`; creates a Track Run Record from a simple URL command |
| Lighthouse human gate | Complete | `npm.cmd run quality-gate:lighthouse -- --dry-run`; writes Markdown/JSON packet artifacts |
| Safe pass approval | Complete | `npm.cmd run quality-gate:lighthouse -- --approve-safe`; writes only pass, low-risk, no-correction review records |
| Developer task writer step | Complete | `write_developer_tasks` consumes validated priority helper output and emits a structured task packet |
| Assembly gate validation | Complete | 4 real URLs x 5 fresh enforced runs; 20 pass, 0 needs_edit, 0 fail, 0 critical risk |
| Original output preservation | Complete | Review/correction records are separate JSON artifacts keyed by `trackRunId` |
| Summary aggregation | Complete | Counts verdicts, pass/correction rates, averages, common failure reasons, critical risk count |
| Tests | Complete | `node scripts/test-human-review-records.js`; smoke covers HTTP review endpoints |
| **Formal qualification** | Complete | Evidence summary, approved marker, qualification record, model card, 5 checksums published |
| **Local Brain integration** | Complete | developer_task_writer loads as qualified (state=qualified, score=1.0, capabilities=5, qualified=3) |
| **No enforcement broadening** | Complete | priority_helper remains the only enforced role; developer_task_writer is adjacent only |
| **Guarded enforcement pilot** | Complete | developer_task_writer enforced through existing policy (no modification). 16/17 applied, 100% success, 0 fallback |
| **Validation: 3 URLs x 5 runs** | Complete | 15 fresh enforced runs, all applied=true, executedCapabilityId=lfm25-1p2b-thinking-local, 0 exceptions |
| **Quality gate** | Complete | 15/15 safe approvals via --latest-n 5 --approve-safe, 0 needs_edit, 0 fail, 0 critical risk |
| **Guardrail writer schema** | Complete | `companion/crew/schemas/guardrail-writer.schema.json` — 5 required fields |
| **Guardrail writer prompt** | Complete | `buildGuardrailWriterPrompt()` in `prompts.js` + `write_guardrails` template |
| **Track step** | Complete | `write_guardrails` added as step 7/9 in `lighthouse-handoff.track.json` |
| **Handoff integration** | Complete | `normalizeGuardrailPacket()` + markdown sections for guardrails |
| **Quality gate guardrail checks** | Complete | `findGuardrailWriterChild()` + completeness validation in `lighthouse-human-gate.js` |
| **Guardrail qualification** | Complete | Evidence summary, approved marker, qualification record, checksums — score 1.0, 3/3 scenarios |
| **Guardrail enforcement pilot** | Complete | 15/15 applied, 0 blocked, 0 fallback — enforced through existing policy |
| **No global broadening** | Complete | Still 4 tracks, only website_audit.lighthouse_handoff enforced, 3 roles now enforced within it |

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

The one-command Lighthouse gate path reduces the human task to packet review:

```bash
npm.cmd run lighthouse:run -- --url https://your-site.com
npm.cmd run quality-gate:lighthouse -- --url https://your-site.com --dry-run
npm.cmd run quality-gate:lighthouse -- --approve-safe
```

Gate filtering:

- `--url https://your-site.com` includes only matching input/audit URLs.
- `--latest-only` reviews only the latest matching run.
- `--latest-n 5` reviews the latest five matching runs and reports a shortfall when fewer exist.
- Fixture URLs such as `example.com` are excluded by default; use `--include-fixtures` only when intentionally reviewing fixture/canary records.

Generated artifacts:

- `benchmark-lab/evidence/reviews/lighthouse-human-gate-v1.md`
- `benchmark-lab/evidence/reviews/lighthouse-human-gate-v1.json`
- `benchmark-lab/evidence/reviews/lighthouse-human-gate-proposed-reviews-v1.json`
- `benchmark-lab/evidence/reviews/lighthouse-human-gate-decision-v1.json`

## Key Principle

Execution success and enforcement success do not validate model judgment quality. This slice records human quality review separately so Locaily can distinguish:

1. Transport success
2. Enforcement/routing success
3. Human-reviewed output quality
4. Adjacent-role assembly quality

## Assembly Pilot Result

| URL | Runs | Pass | needs_edit | Fail | Critical Risk | Correction Rate | Avg Usefulness | Avg Accuracy | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `https://doughboyvinyl.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://doughboyvinyl.com/25-mil-patterns` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |
| `https://lemonteed.com/junk-drawer/` | 5 | 5 | 0 | 0 | 0 | 0% | 4 | 4 | continue |

## Next Slice Candidate

**TBD — Do not proceed without explicit direction.**

`developer_task_writer` is guarded-enforced alongside `priority_helper`. Do not add a new adjacent role, broaden globally, or expand enforcement without an explicit task. Candidates for future direction:
- Keep sampling the developer_task_writer enforced path
- Add the next adjacent Lighthouse role (after explicit decision)
- Multi-model track expansion

## Stop Conditions

- Do not overwrite Track Run Record model output.
- Do not mutate `routing.enforcementDecision` when adding reviews.
- Do not claim model quality is validated from execution success alone.
- Do not build UI in this slice.
