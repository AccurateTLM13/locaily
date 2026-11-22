# Issue Triage Pack

Official read-only Workflow Pack implementing `issue_triage`.

## What It Does

1. **`issue_triage.parse`** (`issue-parser.parse`) deterministically checks repro steps, expected vs. actual output, OS/Node versions, subsystem hints, and missing clarification questions.
2. **`core.classify`** classifies the report (`bug`, `regression`, `feature_request`, `documentation`, `support_question`).
3. **`core.prioritize`** deterministically ranks triage severity/urgency signals.
4. **`core.summarize`** summarizes the issue report concisely.
5. **`issue_triage.brief`** (`issue-parser.assemble_brief`) builds a schema-validated triage card and next actions.

## Safety Boundary

Strictly read-only (`model.run` only; zero filesystem writes, shell execution, or network calls).

## Quick Verification

```bash
npm run pack:validate -- workflow-packs/issue-triage-pack
npm run pack:test -- workflow-packs/issue-triage-pack
```
