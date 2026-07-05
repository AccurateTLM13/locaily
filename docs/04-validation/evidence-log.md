# Evidence Log

Chronological index of validation milestones. Detail lives in linked docs — this is the dashboard.

## Evidence Types

| Abbreviation | Meaning |
|---|---|
| **(F)** | Framework test result — contract/schema/smoke pass |
| **(L)** | Live runtime result — real Ollama/hardware execution |
| **(B)** | Promoted Benchmark Lab evidence — qualification records |
| **(M)** | Manual workflow validation — human review |
| **(H)** | Historical test count — reflects state at time of recording |

## Current Entries

| Date | Claim | Type | Evidence | Status |
|---|---|---|---|---|
| 2026-06-20 | JSON-first runtime enforcement (7 schemas) | (F) | [json-first-runtime-integration.md](./json-first-runtime-integration.md) | Passed |
| 2026-06-15 | M3 model-step `input_map` | (F) | [../07-progress/progress-log.md](../07-progress/progress-log.md) | Passed |
| 2026-06-15 | M2 DealSniper track (`marketplace.dealsniper`) | (F) | [../03-workflows/dealsniper.md](../03-workflows/dealsniper.md) | Passed (mock track run) |
| 2026-06-18 | VibeThinker-3B narrow extraction v0.1 | (L) | [operator-log-vibethinker.md](./operator-log-vibethinker.md) | Failed grounding gate |
| 2026-06-14 | L2 Console + Memory Bridge post-cleanup | (L) | [l2-live-ollama-memory-bridge.md](./l2-live-ollama-memory-bridge.md) | Passed |
| 2026-06-13 | L1 smoke + contract (historical 51/51) | (F/H) | [../03-workflows/lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md) | Passed |
| 2026-06-13 | Memory Bridge + Lighthouse compose (controlled vault) | (M) | [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md) | Passed (local) |
| 2026-06-13 | L2 live Ollama + Memory Bridge | (L) | [l2-live-ollama-memory-bridge.md](./l2-live-ollama-memory-bridge.md) | Passed (documented run) |
| 2026-06-14 | LiquidAI LFM2.5 family lighthouse benchmark | (B) | `benchmark-lab/qualifications/models/` | Partial fixture evidence |
| — | L3 extension standalone | — | External extension repo | Open |
| — | L4 extension ↔ Local Brain | — | [../03-workflows/lighthouse-handoff-extension-integration.md](../03-workflows/lighthouse-handoff-extension-integration.md) | Not implemented |
| — | DAG / track classifier | — | — | Not built |

## Benchmark Lab Approved Evidence

For current promoted model qualification records, see:

- `benchmark-lab/qualifications/models/` — qualification records
- `benchmark-lab/evidence/approved/` — approved evidence bundles
- `benchmark-lab/model-cards/` — model cards with qualification summaries

Historical smoke-test totals (51/51, 55/55) are **not** a current global quality baseline. They reflect contract compliance at the time of recording.

Add a row when new evidence lands. Remove "Passed" if regressions break tests.
