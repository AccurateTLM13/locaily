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

## Your turn — pick one lane

### Lane A — Live model validation (Benchmark Lab M5 depth)

**Why:** Mock evidence exists; live qualification does not yet cover Lighthouse worker contracts.

**You provide:**

1. Ollama running locally (`127.0.0.1:11434`)
2. A pulled model matching a manifest under `benchmark-lab/models/manifests/` (e.g. `llama3.2`)
3. Run the opt-in suite:

```bash
npm run benchmark:run -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json
```

4. Review output, promote evidence if acceptable, generate qualification record

**Unlocks:** Real model qualification records for routing policy (`require_qualified`, etc.).

---

### Lane B — Chrome extension ↔ Local Brain bridge (L4 validation)

**Why:** End-to-end Lighthouse Handoff from the browser is spec'd but not wired.

**You provide:**

1. Clone/build the extension repo: https://github.com/mnfrdrsh/lighthouse-handoff
2. Local Brain running: `node companion/server.js`
3. Browser testing with CORS or MV3 background proxy (see `docs/03-workflows/lighthouse-handoff-extension-integration.md`)
4. Optional: Google PageSpeed Insights API key for live audits in the extension

**Unlocks:** L4 validation tier; real user workflow from PSI → Local Brain → Markdown handoff.

---

### Lane C — Memory Bridge with your private vault

**Why:** Template vault tests pass; real wiki-style vault validation is user-local.

**You provide:**

1. A private vault path (Obsidian/wiki-style layout)
2. Enable memory in config and run Lighthouse compose-handoff with memory preflight
3. Confirm context packs stay redacted in audit logs

**Unlocks:** Confidence that Memory Bridge works on your actual notes, not just the starter template.

---

