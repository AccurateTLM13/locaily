# Evaluation Agent Rules

For agents measuring workflows, models, and hardware—not implementing features.

## Purpose

Produce **evidence**, not hype, for Locaily's capability-first thesis.

## Falsifiable Claims Only

Good:

- "Lighthouse orchestrated path returns schema-valid JSON on fixture X with mock provider."
- "Smoke test passes 27/27 on Node 20 / Ubuntu."

Bad:

- "Small models beat GPT-4."
- "Locaily is production-ready for all users."

## Required Templates

- [../02-workflows/validation-template.md](../02-workflows/validation-template.md)
- [../03-research/model-evaluation-template.md](../03-research/model-evaluation-template.md)
- [../03-research/hardware-test-matrix.md](../03-research/hardware-test-matrix.md)

## Baselines

When comparing orchestration modes, document:

- deterministic-only
- baseline single-pass
- orchestrated multi-step
- (optional) larger model monolithic pass

Record hardware, provider, model names, and dates.

## Scoreboard

`companion/core/scoreboard.js` may capture run metadata—use it; do not fabricate metrics.

## Output Location

- Summaries → decision log or validation doc
- Raw logs → `data/` or CI artifacts—not committed secrets

## Verdict Labels

Use: `VERIFIED` | `NOT VERIFIED` | `INCONCLUSIVE` with links to commands run.

## Do Not

- Update marketing README with benchmark numbers without maintainer review
- Commit user Lighthouse reports with PII
