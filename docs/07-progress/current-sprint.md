# Current Sprint

**Updated:** 2026-06-26

## Goal

Prepare Benchmark Lab as the accepted next milestone after M4, rebase it onto the JSON-first runtime baseline, and keep the runtime contract stable while qualification evidence wiring lands.

## Completed (recent)

- Milestone 4 merged: PR #9 to `main` (`c89db65`)
- JSON-first runtime integration merged on `origin/main` (`96d813b`)
- Track-based orchestration layer shipped (`companion/orchestration/`, workflow APIs)
- Completion note and M5 checkpoint docs added
- Benchmark Lab accepted as the next milestone

## In Scope

- Keep Benchmark Lab in-repo while it depends on Locaily track, schema, and model-role contracts
- Validate qualification records before runtime routing consumes them
- Keep `GET /benchmark/status` read-only and side-effect free
- Preserve `/tasks/run`, `/tracks/run`, and `/workflows/run` response envelopes
- Re-run smoke, contract, schema, and Benchmark Lab tests after rebase

## Out of Scope

- Removing legacy `step-input.js` fallbacks
- Automatic model swapping / Model Garage auto-switching
- NearbyNode routing
- DAG runner / LLM-generated plans
- Public benchmark marketing beyond committed evidence

## Done When

- [x] Milestone 4 completion note published
- [x] Benchmark Lab accepted as next milestone
- [x] Benchmark Lab branch rebased on `origin/main`
- [x] Qualification-record schema validation is enforced at load
- [x] Full verification suite passes on the rebased branch
