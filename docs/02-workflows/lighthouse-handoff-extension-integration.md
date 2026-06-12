# Lighthouse Handoff — Extension ↔ Local Brain Integration

## Current State (Confirmed)

Two repositories play different roles today:

| Repo | Role today | Calls Local Brain? |
|---|---|---|
| [locailly](https://github.com/AccurateTLM13/locailly) (this repo) | **Local Brain** — `lighthouse-handoff` tool, orchestrator, scoreboard | N/A |
| [mnfrdrsh/lighthouse-handoff](https://github.com/mnfrdrsh/lighthouse-handoff) | **Chrome extension** — PSI API, side panel, client-side Markdown reports | **No** — not wired to `:31313` yet |

The extension's AI layer (`src/ai/providers/ollama.js`) is a **stub** that talks directly to Ollama conceptually, not to Locaily's HTTP API.

**Do not claim integrated end-to-end validation until L4 in [lighthouse-handoff-validation.md](./lighthouse-handoff-validation.md) is passed.**

## Target Architecture

```txt
Chrome extension (lighthouse-handoff)
  1. User triggers PSI audit (Google API + user key)
  2. Normalize lighthouseResult → Locaily input shape
  3. Optional: POST Local Brain /tasks/run (lighthouse-handoff)
  4. Merge/enhance Markdown from JSON result (or fallback to report-builder only)
        │
        ▼
Local Brain (locailly @ 127.0.0.1:31313)
  lighthouse-handoff → deterministic | baseline | orchestrated
```

The extension should remain usable **without** Local Brain (standalone Markdown path).

## Local Brain Contract (Implemented)

### Endpoint

```txt
POST http://127.0.0.1:31313/tasks/run
```

Legacy (supported, not preferred for new bridge code):

```txt
POST http://127.0.0.1:31313/analyze
```

### Request (canonical)

```json
{
  "tool": "lighthouse-handoff",
  "input": {
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
  },
  "context": {
    "source": "lighthouse-handoff-extension",
    "surface": "chrome-side-panel"
  },
  "options": {
    "execution_mode": "orchestrated"
  }
}
```

### `execution_mode` values

| Value | When to use |
|---|---|
| `orchestrated` | Default when Local Brain has mock/Ollama runtime — multi-step Pit Crew track |
| `baseline` | Single-pass model call (comparison / fallback) |
| *(omit + no runtime)* | Local Brain returns deterministic demo JSON |

### Response (success)

Engine envelope with `ok: true`, `result` matching `companion/schemas/lighthouse-handoff.schema.json`:

- `clientSummary`
- `developerSummary`
- `priorityFixes[]`
- `handoffChecklist[]`
- `estimatedImpact` — `Low` | `Medium` | `High`

Consume structured fields; do not parse model prose outside `result`.

### Health preflight

```txt
GET http://127.0.0.1:31313/health
GET http://127.0.0.1:31313/tools
```

Extension UI states:

| State | Condition |
|---|---|
| `local-brain-missing` | fetch to `/health` fails |
| `local-brain-ready-no-model` | health ok; deterministic path still works |
| `local-brain-ai-ready` | provider available + model ready (or mock in dev) |
| `standalone-only` | user disabled Local Brain enhancement |

## Mapping: PSI / Lighthouse → Locaily Input

Extension normalizer should produce at minimum:

| Locaily field | Source |
|---|---|
| `url` | audited URL |
| `scores.performance` | `lighthouseResult.categories.performance.score * 100` (round) |
| `scores.accessibility` | same pattern |
| `scores.bestPractices` | same pattern |
| `scores.seo` | same pattern |
| `opportunities[]` | selected audits where `details.type` implies opportunity; map `title`, optional `description`, `score` |
| `diagnostics[]` | non-opportunity audits worth surfacing; keep objects small |

Exact mapping logic should live in the extension (`src/lighthouse/normalizer.js` exists in extension repo). Local Brain validates presence of `url` + `scores` only.

## CORS (Blocker for Browser Extension)

Local Brain currently uses minimal CORS. Before L4 validation:

- Allow extension origin (`chrome-extension://<id>`) or use extension background proxy pattern (background fetch to localhost avoids page CORS in many MV3 setups)
- Document chosen approach in Local Brain server config

**Recommended for MV3:** perform `fetch` to `127.0.0.1:31313` from the **service worker** (`background.js`), not the side panel page, unless CORS headers are explicitly added on the server.

## Fallback Rules (Extension)

1. If Local Brain unreachable → use existing `report-builder.js` Markdown only
2. If Local Brain returns error → show error + offer standalone report
3. If runtime unavailable but Local Brain up → deterministic JSON still returned; extension may merge or ignore AI fields
4. Never block PSI/report generation on Local Brain availability

## Implementation Checklist (Extension Repo)

- [ ] Map PSI result → Locaily input shape
- [ ] Add settings toggle: "Enhance with Locaily Local Brain"
- [ ] Background fetch to `/health` and `/tasks/run`
- [ ] Merge `result.priorityFixes` / summaries into Markdown template (or new section)
- [ ] Handle `execution_mode` user preference (orchestrated vs baseline vs off)
- [ ] Manual test with Local Brain running + document in extension repo

## Implementation Checklist (Local Brain Repo)

- [x] `lighthouse-handoff` tool + orchestrator
- [x] Smoke coverage for deterministic, orchestrated, baseline (mock)
- [ ] CORS or documented background-proxy pattern for extension
- [ ] Example normalized fixture in `examples/lighthouse-handoff/` (optional)

## Related

- [lighthouse-handoff.md](./lighthouse-handoff.md)
- [lighthouse-handoff-validation.md](./lighthouse-handoff-validation.md)
- [../05-agents/client-integration-guide.md](../05-agents/client-integration-guide.md)
