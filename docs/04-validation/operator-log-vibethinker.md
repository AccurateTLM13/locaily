# Operator Log + VibeThinker Initial Evaluation

**Date:** 2026-06-18 (America/Chicago)  
**Status:** Experimental; model not approved for unattended editorial use

Model: `hf.co/mradermacher/VibeThinker-3B-GGUF:Q4_K_M` through local Ollama.

## Scope

- 37 allowlisted Second Brain Markdown files inventoried and processed
- Complete allowlisted content split into 28 bounded batches
- `raw/`, private paths, and writeback inbox blocked
- Validation artifact retained locally under `data/validation/*.local.json`

## Results

The first run failed after 84.2 seconds because one extraction batch returned malformed JSON. A concise retry path and bounded signal count were added.

The hardened run completed discovery and drafting in 265.2 seconds. A deterministic source clamp removed signals citing paths absent from batch source markers. Discovery returned six structurally valid opportunities, but the top headline copied the editorial brief. The draft contained 80 prose words and failed the required 300-word minimum. No publishable HTML was accepted and no external files were written.

The report verifier was then tightened to reject headline directions over 140 characters as likely prompt echoes and require a known Lemonteed zone.

## Conclusion

VibeThinker-3B Q4 can scan batches and return schema-shaped data after retry hardening, but this run did not demonstrate acceptable ranking or long-form Operator Log writing. Keep it experimental for this workflow. Future comparisons should reuse the same inventory and validators.

## Narrow extraction experiment v0.1

The next experiment removed ranking, headlines, zones, status, scores, HTML, metadata, and XML. Six representative files were each tested three times as single-file extraction calls.

| Metric | Result | Gate |
|---|---:|---:|
| Parseable JSON after one retry | 100% | 100% |
| Source-path precision | 100% | 100% |
| Exact excerpt verification | 25% | >=90% |
| Raw citations | 0 | 0 |
| Prompt echoes | 0 | 0 |
| Valid grounded signals | 1 / 18 calls | Informational |
| Useful-signal yield | 0.0556 per call | Informational |
| Total duration | 34.0 seconds | Informational |

The automated gate failed on exact evidence grounding before human usefulness review. VibeThinker should not be assigned the grounded extractor role for Operator Log v0.2. Its demonstrated strengths are narrow JSON shape compliance, source-path copying, and speed—not claim-level evidence fidelity.
