# Validation: Lighthouse Handoff (Local Brain)

## Claim Under Test

The **Local Brain** `lighthouse-handoff` tool returns schema-valid handoff JSON on documented fixtures, supports deterministic fallback without a runtime, and supports orchestrated and baseline AI paths when the mock provider is active.

**Out of scope for this validation record:** Chrome extension Markdown quality, extension ↔ Local Brain HTTP wiring, or benchmark claims vs larger models.

## Status

**Passed** for Local Brain automated checks (2026-06-12).

**Inconclusive** for extension end-to-end integration (separate repo; bridge not implemented).

## Evidence

| Evidence | Command | Result |
|---|---|---|
| Contract helpers | `node scripts/contract-test.js` | `Contract helpers passed.` |
| Full smoke suite | `node companion/server.js` then `node scripts/smoke-test.js` | `28/28 checks passed` |
| Lighthouse deterministic (`/analyze`) | smoke: `Lighthouse Handoff stub success` | PASS |
| Lighthouse deterministic (`/tasks/run`) | smoke: `tasks run Lighthouse success` | PASS |
| Lighthouse input validation | smoke: `Lighthouse Handoff input validation` | PASS |
| Lighthouse unsafe input block | smoke: `tasks run unsafe input blocked` | PASS |
| Lighthouse orchestrated + baseline + scoreboard | smoke: `Lighthouse orchestrated and scoreboard` | PASS |
| Audit redaction for Lighthouse run | smoke: `GET /audit run filter` | PASS |

### Environment (automated run)

- OS: Linux (cloud agent VM)
- Node: 18+
- Provider during orchestration checks: `mock` (switched in-test)
- Default provider otherwise: `ollama` (may be unavailable; deterministic Lighthouse path still passes)
- Base URL: `http://127.0.0.1:31313`

## Fixtures

Smoke tests use a canonical fixture:

```json
{
  "url": "https://example.com",
  "scores": {
    "performance": 72,
    "accessibility": 96,
    "bestPractices": 100,
    "seo": 92
  },
  "opportunities": [
    { "title": "Reduce render-blocking resources" }
  ],
  "diagnostics": []
}
```

Invalid fixture (missing `scores`): expects `INVALID_INPUT` / HTTP 400.

## Pass Criteria (Local Brain)

- [x] Tool listed on `GET /tools` with `runtime_required: false`
- [x] Deterministic path returns required output fields per `lighthouse-handoff.schema.json`
- [x] `/tasks/run` success envelope with `meta.schema_valid: true` on happy path
- [x] Orchestrated mode completes on mock provider with scoreboard counters incremented
- [x] Baseline mode completes on mock provider
- [x] Invalid input rejected with structured error
- [x] Unsafe input blocked through input gate
- [x] Audit event written without raw opportunity text in summary payload

## Fail Criteria

- Any Lighthouse-specific smoke check fails
- Output missing required schema fields (`clientSummary`, `developerSummary`, `priorityFixes`, `handoffChecklist`, `estimatedImpact`)
- Orchestrated run on mock provider returns `schema_valid: false`

## What Is **Not** Validated Here

| Area | Status | Notes |
|---|---|---|
| Extension Markdown report quality | Not measured in this repo | Client repo: https://github.com/mnfrdrsh/lighthouse-handoff |
| Extension → Local Brain HTTP bridge | **Not implemented** | Extension uses PSI + client-side `report-builder.js` today |
| Ollama orchestrated path on real hardware | Environment-dependent | Smoke passes without Ollama via deterministic path; live Ollama orchestration needs separate run with `ollama pull` |
| Human usefulness vs hand-written handoffs | Not measured | No golden set in repo |
| Production PageSpeed analysis accuracy | Not claimed | PSI + parsing live in extension, not validated here |

## Validation Tiers

Use these labels in docs and PRs:

| Tier | Meaning |
|---|---|
| **L1 — Local Brain contract** | Automated smoke + contract tests pass (this doc) |
| **L2 — Live Ollama orchestration** | Same fixtures with active Ollama + pulled model; manual or CI with Ollama |
| **L3 — Extension standalone** | Extension repo golden URLs + agent-usable Markdown review |
| **L4 — Extension ↔ Local Brain** | Extension POSTs normalized Lighthouse JSON to `/tasks/run`; CORS + UX verified |

**Current project status:** **L1 passed.** L2–L4 open.

## Reproduce Locally

```bash
node companion/server.js
# separate terminal
node scripts/smoke-test.js
node scripts/contract-test.js
```

Optional L2 (requires Ollama):

```bash
ollama pull llama3.2
# ensure provider is ollama, then POST /tasks/run with options.execution_mode orchestrated
```

## Owner

- **coding-agent** — keep smoke checks green when tool changes
- **evaluation-agent** — populate L2–L4 when runs exist
- **human-tester** — L3 Markdown quality on real sites

## Next Step

1. Implement extension ↔ Local Brain bridge per [lighthouse-handoff-extension-integration.md](./lighthouse-handoff-extension-integration.md)
2. Add L2 evidence row after Ollama orchestration run on target hardware
3. Add golden URL set under `examples/lighthouse-handoff/` when maintainer approves

## Related

- [lighthouse-handoff.md](./lighthouse-handoff.md)
- [lighthouse-handoff-extension-integration.md](./lighthouse-handoff-extension-integration.md)
- `scripts/smoke-test.js` — checks listed above
