# Operator Log Editorial Workflow

**Status:** Experimental

The Operator Log workflow turns the allowlisted, synthesized Second Brain into reviewable editorial opportunities and static HTML proposals. It does not read `raw/` and does not write to Lemonteed.

## Tracks

### `publishing.operator_log_discovery`

1. Inventory every allowlisted Markdown file.
2. Record vault-relative paths, SHA-256 hashes, byte counts, and modified timestamps.
3. Process complete file content in bounded, source-marked batches.
4. Extract candidate signals with the selected local model.
5. Deterministically discard signals without an actual scanned source path.
6. Rank the remaining signals into an opportunity report.
7. Verify source paths, headline bounds, zones, scores, and required fields.

The result includes a recommended opportunity index and source-linked opportunities. Discovery is advisory; a person chooses what proceeds.

### `publishing.operator_log_draft`

1. Accept one selected opportunity.
2. Re-read only its allowlisted supporting files into a bounded evidence packet.
3. Draft complete Operator Log HTML and a sitemap XML fragment.
4. Verify required anatomy, canonical metadata, slug, sitemap URL, banned phrases, and a 300-word prose minimum.

Draft output is a proposal. There is no Lemonteed write or sitemap-apply step.

## API examples

```json
POST /workflows/run
{
  "workflow_id": "operator_log_discovery",
  "input": {
    "editorialBrief": "Find concrete Lemonteed build stories with a real problem, meaningful change, and surprising observation.",
    "maxOpportunities": 6
  },
  "options": {
    "model": "hf.co/mradermacher/VibeThinker-3B-GGUF:Q4_K_M"
  }
}
```

After selecting an opportunity, call `operator_log_draft` with that object as `input.opportunity`. The Memory Bridge must be readable. No absolute vault path is stored in track output.

## Current boundaries

- No editorial history ledger yet.
- Incremental scans accept `changedSince`, but no persisted previous-run cursor exists yet.
- No automatic write to the Lemonteed repository or sitemap.
- Model quality is experimental and must pass deterministic verification.

## v0.1 failure matrix

| Stage | Observed failure | Owner |
|---|---|---|
| Batch extraction | Prompt echo, invented sources, weak variety | Model + extraction prompt |
| Source clamp | Correctly removed invalid citations | Deterministic tool |
| Deduplication | Near-identical signals survived | Deterministic tool |
| Scoring | Repeated unsupported scores | Deterministic scoring |
| Ranking | High-risk duplicate selected | Ranking contract/model |
| Evidence collection | Correct source gathered | Deterministic tool |
| Writing | 80 words and placeholders | Model task decomposition |
| HTML/sitemap | Invalid markup | Deterministic renderer |
| Validation | Correctly rejected output | Deterministic validator |

## v0.2 direction

The model should receive narrow roles only: grounded signal extraction, pairwise packet ranking, one-section drafting, or concise cleanup. Deterministic tools should own source verification, normalization, deduplication, scoring, abstention gates, HTML, metadata, sitemap XML, and final validation.

The first narrow extraction fixture is frozen at `docs/04-validation/fixtures/operator-log-narrow-extraction-v0.1.json`. It runs six single-file batches three times each and keeps private content and hashes in ignored local artifacts.

See [the VibeThinker evaluation](../04-validation/operator-log-vibethinker.md).
