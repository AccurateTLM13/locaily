# Current Sprint

**Updated:** 2026-07-04

## Status

The prior sprint (Benchmark Lab Milestone 1) is complete and operator-ready.

The next sprint has not yet been canonically selected. The active build slice documented in [active-build-slice.md](./active-build-slice.md) describes the current focus (Canonical Track Run Records) but is not a formally scoped sprint without an explicitly supplied objective.

## Completed Objective

Deliver an operator-ready local evaluation subsystem: CLI commands for run, review, compare, promote, matrix, probe, diagnose, report, model-card, qualification, and checksum-verify; 14 schemas; mock + Ollama + ToolEvalRuntime adapters; execution-router with native/policy-routed/runtime-constrained modes; model capability probing; evidence promotion workflow; checksum verification (canonical_text_v1/byte_exact); qualification-record generation; read-only `/benchmark/status` endpoint; Local Brain consuming compact qualification data without importing engine internals.

### Completed Acceptance Criteria

1. Qualification record schema defined and validated.
2. Two Locaily-specific benchmark suites registered (intent-classification, basic-tool-use).
3. Mock adapter produces deterministic fixture runs.
4. Ollama adapter runs live model against suites.
5. Raw local results persisted under `benchmark-lab/results/raw/`.
6. Draft summaries generated after each run.
7. Promotion writes compact summary, approved evidence, and checksum records.
8. Qualification record generated from promoted evidence.
9. Model card generated from promoted evidence.
10. Report generated from promoted evidence.
11. Checksums verify across canonical_text_v1 and byte_exact modes.
12. `/benchmark/status` reports qualification and checksum counts without running benchmarks.
13. Local Brain consumes qualification records without importing `benchmark-lab/engine/` modules.
14. Tool Eval Bench compatibility slice with 8 scenarios, PARTIAL verdict support.
15. Model capability probing with cached results and suite requirement checking.
16. Execution modes (native, policy-routed, runtime-constrained) implemented and tested.

### Unresolved Follow-On Candidates

These items are recognized as valuable extensions but are **not yet approved scope**:

- Broader model qualification coverage across additional Ollama models
- Additional Benchmark Lab tracks beyond intent-classification and basic-tool-use
- Hardware profiling and qualification records for multiple hardware profiles
- Deeper live qualification evidence for prompt regression, output variance, and cross-track generalization
- Structured output (Category O) and error recovery (Category E) evaluation scenarios
- Automatic qualification-based model swapping / Model Garage runtime policy

**Warning:** These candidates are not yet scoped, approved, or scheduled. Do not begin implementation without an explicitly supplied objective.

## Active Build Slice (Current Focus)

Canonical Track Run Records — the first Track Learning Evidence Loop slice:

- Define a canonical track-run record schema
- Emit valid summary-safe records after successful and failed track executions
- Record track version, steps, workers, validation results, retries, timing, and routing context
- Support optional human correction records
- Prove Lighthouse Handoff and DealSniper produce valid evidence records
- Preserve `/tasks/run`, `/tracks/run`, and `/workflows/run` response envelopes

See [active-build-slice.md](./active-build-slice.md) for full scope, exclusions, and acceptance criteria.

## Out of Scope

- Automatic model swapping / Model Garage auto-switching
- Relay Node routing
- DAG runner / LLM-generated plans
- Public benchmark marketing beyond committed evidence
- Broader Benchmark Lab qualification coverage without an explicit task
