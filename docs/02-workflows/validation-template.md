# Validation Template

Use when proving a workflow or track is ready for wider testing.

---

# Validation: [Workflow or Track Name]

## Claim Under Test

State a falsifiable claim.

Bad: "Small models are better."

Good: "Orchestrated Lighthouse Handoff produces schema-valid output on smoke fixtures without Ollama."

## Status

`Not started` | `In progress` | `Passed` | `Failed` | `Inconclusive`

## Evidence Required

| Evidence | Path / command | Result |
|---|---|---|
| Smoke test | `node scripts/smoke-test.js` | |
| Contract test | `node scripts/contract-test.js` | |
| Manual scenario | | |
| Benchmark log | | |

## Fixtures

List input files and expected properties (not necessarily full golden outputs).

## Pass Criteria

- 

## Fail Criteria

- 

## Known Gaps

- 

## Owner

Suggested agent role: `coding-agent` | `evaluation-agent` | `human-tester`

## Next Step

- 
