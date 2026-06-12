# Model Evaluation Template

---

# Evaluation: [Model Name] on [Track/Step]

## Date

YYYY-MM-DD

## Hardware Profile

Link: [hardware-profiles.md](./hardware-profiles.md) or describe CPU/GPU/RAM.

## Provider

Ollama | mock | other

## Role

`fast_worker` | `default_worker` | `reasoning_worker`

## Workflow / Step

e.g. Lighthouse Handoff → `classify_issues`

## Input Fixture

Path or description.

## Metrics

| Metric | Value |
|---|---|
| Schema valid | yes/no |
| Duration ms | |
| Tokens (if available) | |
| Human usefulness (1-5) | |
| Notes | |

## Comparison Baseline

What this run is compared against (monolithic pass, larger model, deterministic-only).

## Verdict

`Accept` | `Reject` | `Needs more data`

## Raw Artifacts

Paths to logs, scoreboard entries, or audit excerpts. Do not commit sensitive user data.
