# Milestone 5 Checkpoint

**Status:** Active - Benchmark Lab accepted as next milestone
**Updated:** 2026-06-26

Milestone 4 is complete. Milestone 5 is now scoped around Benchmark Lab: a controlled local evaluation subsystem that produces compact evidence, model cards, and qualification records Locaily can consume without importing benchmark runner code into the runtime.

## M5 Scope - Benchmark Lab

**Theme:** Evidence before routing decisions.

Benchmark Lab should make local model evaluation repeatable, inspectable, and narrow enough to support Locaily's track-specific model-role thesis without claiming broad model quality.

### In Scope

- Top-level `benchmark-lab/` subsystem with CLI entrypoints, schemas, fixtures, evidence folders, reports, model cards, and qualification records
- Canonical Benchmark Lab architecture doc at `docs/02-systems/benchmark-lab.md`
- Read-only `GET /benchmark/status` endpoint and compact `/health` summary
- Runtime consumption of compact qualification records through `companion/core/model-qualification-loader.js`
- Advisory qualification metadata on model steps, with explicit stricter opt-in policies
- Schema validation for qualification records before runtime routing consumes them
- Mock benchmark loop and schema tests suitable for CI/local contract checks
- Clear docs that approved evidence is not general benchmark marketing

### Out of Scope

- Automatic model swapping / Model Garage auto-switching
- NearbyNode routing
- DAG runner / LLM-generated plans
- Removing legacy `step-input.js` fallbacks
- Public leaderboard or broad model ranking
- Runtime imports from `benchmark-lab/engine/`

## Follow-On Hardening

The previous M5 planning items remain valid, but they move behind Benchmark Lab acceptance:

1. Record canonical Lighthouse entry path: tool, track, workflow, or a staged support matrix.
2. Extend parity coverage across `/tasks/run`, `/tracks/run`, and `/workflows/run`.
3. Remove legacy `step-input.js` fallbacks only after parity is demonstrated.
4. Improve workflow-orchestrator audit summaries without leaking raw task input/output.

## Acceptance Gates

- [x] Benchmark Lab accepted as the next milestone
- [x] Branch rebased onto current `origin/main`
- [x] Qualification records are schema-validated at the loader boundary
- [x] `node scripts/benchmark-lab-schema-test.js` passes
- [x] `node scripts/benchmark-lab-run-test.js` passes
- [x] `node scripts/contract-test.js` passes
- [x] Clean-server smoke passes: 56/56

## Notes

`docs/01-architecture/model-swap-manager.md` may exist as proposed architecture context, but model swapping is not part of M5 implementation. Treat it as design input for a later M5A/M6 decision, not as a current runtime promise.
