# PR Diff Review Pack

Official read-only Workflow Pack implementing `pr_diff_review`.

## What It Does

1. **`pr_diff_review.parse`** (`pr-diff-parser.parse`) deterministically parses changed files, line churn, and sensitive path patterns from a unified diff.
2. **`core.classify`** classifies the change kind (`feature`, `bugfix`, `refactor`, `security`, `config_or_infra`).
3. **`core.prioritize`** deterministically ranks changed files by sensitivity and churn weight.
4. **`core.summarize`** summarizes the change scope concisely.
5. **`pr_diff_review.brief`** (`pr-diff-parser.assemble_brief`) builds a schema-validated PR review checklist and suggested test focus.

## Safety Boundary

Strictly read-only (`model.run` only; zero filesystem writes, shell execution, or network calls).

## Quick Verification

```bash
npm run pack:validate -- workflow-packs/pr-diff-review-pack
npm run pack:test -- workflow-packs/pr-diff-review-pack
```
