# Validation Docs

Evidence records for Locaily **tracks** and **workflows**.

> **Warning:** Passing framework or smoke tests does not qualify a model or prove a workflow is useful for production. Validation is layered — see [validation-strategy.md](./validation-strategy.md).

## Validation Hierarchy

| Layer | Scope | Entry point |
|-------|-------|-------------|
| **Contract** | Schemas, envelopes, route behavior, deterministic contracts | [json-first-runtime-integration.md](./json-first-runtime-integration.md), [json-first-schema-audit.md](./json-first-schema-audit.md) |
| **Runtime** | Local Brain execution, tools, Tracks, workflows, fallbacks, audit, providers | [lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md), [l2-live-ollama-memory-bridge.md](./l2-live-ollama-memory-bridge.md) |
| **Model qualification** | Benchmark Lab evaluation for specific roles/Track contracts | `benchmark-lab/` (see [index](../../benchmark-lab/README.md)), [model-candidates.md](../../ai-models/model-candidates.md) |
| **Product** | Workflow usefulness to a human or coding agent | [lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md) |
| **Integration** | Complete paths: client → Local Brain → Track/workflow → model/tool → validation → result | Not fully implemented for extension bridge |

## Document Index

### Contract validation

| Document | Scope |
|----------|-------|
| [json-first-runtime-integration.md](./json-first-runtime-integration.md) | Enforcement matrix, ancestry, combined test commands |
| [json-first-schema-audit.md](./json-first-schema-audit.md) | Gap analysis: internal JSON schemas vs runtime enforcement |
| [validation-result-contract-audit.md](./validation-result-contract-audit.md) | Validation contract inventory — workflow verification vs engine checks vs content review |
| [tool-metadata-contract-audit.md](./tool-metadata-contract-audit.md) | Tool metadata stage schemas and enforcement boundaries |

### Runtime validation

| Document | Scope |
|----------|-------|
| [lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md) | Lighthouse Handoff L1 (Local Brain contract) + L2 (live Ollama) |
| [l2-live-ollama-memory-bridge.md](./l2-live-ollama-memory-bridge.md) | L2 live Ollama + Memory Bridge milestone (2026-06-13) |

### Model qualification

| Document | Scope |
|----------|-------|
| [operator-log-vibethinker.md](./operator-log-vibethinker.md) | Operator Log broad failure + narrow VibeThinker extraction (2026-06-18) |
| Benchmark Lab evidence | `benchmark-lab/qualifications/models/`, `benchmark-lab/evidence/approved/` |

### Memory Bridge validation

| Document | Scope |
|----------|-------|
| [memory-bridge-local-setup.md](./memory-bridge-local-setup.md) | Private wiki vault setup (local only) |
| [memory-bridge-manual-test-path.md](./memory-bridge-manual-test-path.md) | Manual Memory Bridge + Lighthouse integration steps |
| [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md) | Memory Bridge + Lighthouse controlled validation (2026-06-13) |
| [development-memory-e2e-proof.md](./development-memory-e2e-proof.md) | DM loop E2E proof on second namespaced project (simulation, 2026-07-18) |
| [l2-live-ollama-memory-bridge.md](./l2-live-ollama-memory-bridge.md) | L2 live Ollama + Memory Bridge milestone |

### Strategy and index

| Document | Scope |
|----------|-------|
| [validation-strategy.md](./validation-strategy.md) | How we validate (layers, targets, test types) |
| [evidence-log.md](./evidence-log.md) | Evidence index with distinctions by type |

### Historical evidence

| Document | Scope |
|----------|-------|
| [fixtures/operator-log-narrow-extraction-v0.1.json](./fixtures/operator-log-narrow-extraction-v0.1.json) | Six-file private-vault-relative extraction fixture; no private content committed |
| [fixtures/tracks/](./fixtures/tracks/) | Draft track fixture examples (not validated — spec scaffolding) |

## Current Automated Tests

| Command | Scope | Requires |
|---------|-------|----------|
| `node scripts/contract-test.js` | Contract helpers, envelope shapes, route behavior | None |
| `node scripts/smoke-test.js` | Full server smoke (requires companion running) | Running companion |
| `node scripts/benchmark-lab-schema-test.js` | Benchmark Lab schema validation | None |
| `node scripts/benchmark-lab-run-test.js` | Benchmark Lab run loop (mock) | None |
| `node scripts/benchmark-status-smoke-test.js` | `/benchmark/status` contract | Running companion |
| `node scripts/validation-result-contract-test.js` | Validation result contracts | None |
| `node scripts/orchestration-unit-test.js` | Orchestration unit tests | None |
| `node scripts/tool-registry-schema-test.js` | Tool registry schema tests | None |
| `node scripts/audit-record-schema-test.js` | Audit record schema tests | None |

**Canonical Track Run Records** are at the specification stage — no validation exists today for this layer.

## Benchmark Lab Entry Point

```bash
npm run benchmark:test              # schema + mock run loop (no Ollama)
npm run benchmark:status-smoke      # /benchmark/status contract
node scripts/benchmark-lab-schema-test.js
node scripts/benchmark-lab-run-test.js
```

See [benchmark-lab/README.md](../../benchmark-lab/README.md).

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

## Current Limitations

- Canonical Track Run Records are at specification stage — not yet implemented.
- No automatic learning loop exists. Future learning validation is not established.
- Extension ↔ Local Brain integration is not validated at L4.
- Model qualification is specific to tested roles, Tracks, contracts, prompts, runtimes, and evidence — not general.
- Historical smoke-test totals (e.g. 51/51, 55/55) reflect framework contract compliance, not production readiness.

## Related

- [benchmark-lab/README.md](../../benchmark-lab/README.md)
- [validation-strategy.md](./validation-strategy.md)
- [evidence-log.md](./evidence-log.md)
