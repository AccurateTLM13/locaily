# CI Failure Triage Pack

Official read-only Workflow Pack implementing `ci_failure_triage`.

## What It Does

1. **`ci_failure_triage.parse`** (`ci-log-parser.parse`) deterministically extracts failing tests, stack locations, error signatures, exit code, and flake hints.
2. **`core.classify`** classifies failure category (`assertion_failure`, `type_or_syntax`, `environment_or_dependency`, `timeout_or_flake`, `security_or_lint`).
3. **`core.summarize`** summarizes the failure diagnosis.
4. **`ci_failure_triage.brief`** (`ci-log-parser.assemble_brief`) builds a schema-validated diagnosis brief and recommended debug steps.

## Safety Boundary

Strictly read-only (`model.run` only; zero filesystem writes, shell execution, or network calls).

## Quick Verification

```bash
npm run pack:validate -- workflow-packs/ci-failure-triage-pack
npm run pack:test -- workflow-packs/ci-failure-triage-pack
```
