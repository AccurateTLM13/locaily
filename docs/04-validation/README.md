# Validation Docs

Evidence records for Locaily **tracks** and **workflows**.

| Document | Scope |
|----------|-------|
| [json-first-schema-audit.md](./json-first-schema-audit.md) | Gap analysis: internal JSON schemas vs runtime enforcement |
| [tool-metadata-contract-audit.md](./tool-metadata-contract-audit.md) | Tool manifest / registry / public metadata schema alignment |
| [validation-strategy.md](./validation-strategy.md) | How we validate (tiers, good/bad claims) |
| [evidence-log.md](./evidence-log.md) | Milestone evidence index |
| [lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md) | Lighthouse Handoff L1 (Local Brain contract) |
| [memory-bridge-local-setup.md](./memory-bridge-local-setup.md) | Private wiki vault setup (local only) |
| [memory-bridge-manual-test-path.md](./memory-bridge-manual-test-path.md) | Manual Memory Bridge + Lighthouse integration steps |
| [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md) | Memory Bridge + Lighthouse controlled validation (2026-06-13) |
| [l2-live-ollama-memory-bridge.md](./l2-live-ollama-memory-bridge.md) | L2 live Ollama + Memory Bridge milestone (2026-06-13) |
| [fixtures/tracks/](./fixtures/tracks/) | Draft track fixture examples (not validated — spec scaffolding) |

## Local Test Bench Console

Run the companion server and open:

```txt
http://127.0.0.1:31313/console
```

The console is a local-only cockpit for Lighthouse Handoff validation. It can run Standard/no-AI, L2 Ollama, and L2 Ollama + Memory flows from the browser, then save gitignored artifacts under `data/validation/`.

Interpret warnings carefully:

- Thin memory context is a warning, not a failed validation, when Memory Bridge is enabled but only a small number of relative files were used.
- PageSpeed without `PAGESPEED_API_KEY` may hit public quota limits.
- The console validates the Lighthouse Handoff L2 chain only. It does not validate multi-model routing, the Chrome extension bridge, benchmark quality, or automatic score improvement.
