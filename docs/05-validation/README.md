# Validation Docs

Evidence records for Locaily workflow and platform checks.

| Document | Scope |
|----------|-------|
| [lighthouse-handoff-validation.md](../02-workflows/lighthouse-handoff-validation.md) | Lighthouse Handoff L1 (Local Brain contract) |
| [memory-bridge-local-setup.md](./memory-bridge-local-setup.md) | Private wiki vault setup (local only) |
| [memory-bridge-manual-test-path.md](./memory-bridge-manual-test-path.md) | Manual Memory Bridge + Lighthouse integration steps |
| [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md) | Memory Bridge + Lighthouse controlled validation (2026-06-13) |
| [l2-live-ollama-memory-bridge.md](./l2-live-ollama-memory-bridge.md) | L2 live Ollama + Memory Bridge milestone (2026-06-13) |

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
