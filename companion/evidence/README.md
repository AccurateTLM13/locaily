# Track Evidence

This directory contains the contracts and development fixtures for LocAIly's Track Learning Evidence Loop.

## Purpose

Each track execution should produce a structured evidence record describing:

- What track ran
- Which version ran
- Which steps executed
- Which capabilities or workers were used
- Whether validation passed
- Whether retries or fallbacks occurred
- How long the run took
- Whether a human correction was later attached

## Privacy Boundary

Runtime evidence should be summary-safe by default.

Do not persist raw user input, full model output, secrets, local file contents, or private context unless an explicit future configuration permits it.

## Directories

- `schemas/` — canonical evidence contracts
- `records/` — local development fixtures only
- `lessons/` — future reusable lesson proposals

Generated runtime records should be ignored by Git unless intentionally committed as sanitized test fixtures.
