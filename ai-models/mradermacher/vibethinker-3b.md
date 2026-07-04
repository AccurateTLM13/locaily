# VibeThinker 3B Q4_K_M (GGUF)

**Registry id:** `mradermacher-vibethinker-3b-q4-k-m-gguf`  
**Ollama runtime id:** `hf.co/mradermacher/VibeThinker-3B-GGUF:Q4_K_M`  
**Status:** Candidate with negative Operator Log evidence

## Role intent

Evaluated as a possible structured extractor, candidate ranker, and Operator Log section writer. It is not recommended for any of those roles based on the current fixtures.

## Measured evidence

### Broad Operator Log workflow

- Hardened full-vault run: 37 files, 28 batches, 265.2 seconds.
- Discovery produced a prompt-echo headline.
- Draft produced 80 prose words and failed structural validation.

### Narrow extraction v0.1

- Six representative files, three independent calls per file.
- 18/18 calls returned parseable schema-shaped JSON without retry.
- Source-path precision: 100%.
- Exact excerpt verification: 25% (required: 90%).
- Valid grounded signals: 1 across 18 calls.
- Unsupported-claim count: 2 across 4 emitted signals.
- Raw citations and prompt echoes: zero.
- Total benchmark time: 34.0 seconds; average call: 1.89 seconds.

## Routing guidance

**Known strength:** Fast, reliable constrained JSON shape and exact source-path copying under a narrow prompt.

**Avoid:** Grounded editorial extraction, opportunity ranking, long-form Operator Log writing, HTML generation, metadata generation, and XML generation.

Do not assign an extractor role merely because JSON and path precision pass. Claim-level grounding failed the fixture.

## Evidence

- [Operator Log evaluation](../../docs/04-validation/operator-log-vibethinker.md)
- [Narrow fixture](../../docs/04-validation/fixtures/operator-log-narrow-extraction-v0.1.json)
- [Broad workflow baseline](../benchmark-results/operator-log/vibethinker-3b-operator-log-baseline-v0.1.json)
- [Public benchmark summary](../benchmark-results/operator-log/vibethinker-3b-narrow-extraction-v0.1.json)

Private source excerpts and hashes remain in ignored local validation artifacts.
