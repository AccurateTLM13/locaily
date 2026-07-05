# Next Human Steps

Owner-facing list of current priorities and follow-on candidates.

## Active Build Slice — Canonical Track Run Records

Actions directly related to the current active build slice:

- Define the canonical track-run record schema
- Implement the record builder and emission path
- Add persistence and run identifiers
- Record track version, steps, workers, validation results, retries, timing
- Add integration for optional human correction records
- Ensure summary-safe evidence (no raw sensitive inputs/outputs by default)
- Add automated tests for success, failure, retry, and correction cases
- Update status documentation when complete

## Follow-On Candidates (Not Yet Approved Scope)

These areas are recognized as valuable but are **not scoped or scheduled**:

- Broader model qualification across additional Ollama models
- Additional Benchmark Lab tracks beyond intent-classification and basic-tool-use
- Lighthouse extension integration and L4 validation
- Memory Bridge validation beyond current v0
- Hardware profiling and qualification records for multiple profiles
- Deeper prompt-regression coverage
- Structured output (Category O) and error recovery (Category E) evaluation

## Do Not Start Yet

These areas require a canonical decision before any implementation work:

- Relay Node protocol, connectors, or distributed execution
- Automatic model swapping or Model Garage runtime policy
- DAG planner or graph-based execution
- Free-form automatic track generation or classification
- Major console or Desktop Companion UI redesign
- Automatic evidence promotion from benchmark runs
- Cloud telemetry or analytics
