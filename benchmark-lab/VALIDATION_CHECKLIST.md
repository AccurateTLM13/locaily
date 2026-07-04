# Benchmark Lab Validation Checklist

Use this before committing or opening a PR for Benchmark Lab framework changes.

## Required Non-Live Checks

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
```

Expected:

- Benchmark schema fixtures pass.
- Mock benchmark loop is deterministic.
- Failure modes are isolated by case.
- Promotion is explicit.
- Checksums verify.
- Companion status endpoint works.
- Companion does not import Benchmark Lab engine modules.

## Optional Full Smoke

Start the companion server, then run:

```powershell
node scripts/smoke-test.js
```

## Live Ollama Evidence

User/operator-owned:

```powershell
npm.cmd run benchmark:run -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json
npm.cmd run benchmark:review -- --run <run-id>
```

Only promote live evidence after manual review.

## Artifact Audit

Before commit, confirm no generated local-only artifacts are staged:

```txt
benchmark-lab/results/raw/
benchmark-lab/reports/drafts/
benchmark-lab/model-cards/drafts/
benchmark-lab/cache/
benchmark-lab/models/files/
benchmark-lab/runtime-logs/
```

Commit only reviewed evidence, generated checksums for reviewed evidence, intentional qualification records, and reviewed published reports.
