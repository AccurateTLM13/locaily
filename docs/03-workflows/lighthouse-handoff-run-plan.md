# Lighthouse Handoff Run Plan

First workflow plan executed through Local Brain track-based orchestration.

**Workflow id:** `lighthouse_handoff`  
**Track id:** `website_audit.lighthouse_handoff`  
**Track file:** `companion/pit-crew/tracks/lighthouse-handoff.track.json`

## JSON Pipeline Stages

| Stage | Step | Output type |
|---|---|---|
| Normalize | `extract_metrics` | JSON metrics object |
| Extract issues | `classify_issues` | JSON classified issues |
| Prioritize | `prioritize_fixes` | JSON priority fixes |
| Validate priorities | `validate_priority_fixes` | Priority fix **content review** (`priorityFixes`, `needsReview`) — not `{ valid, errors }` |
| Match fixes | `match_fixes` | JSON matched mappings |
| Export | `write_handoff` | JSON handoff object + Markdown export |
| Final validation | `verify_output` | JSON `{ valid, errors }` |

Markdown is generated at the **export** stage from prior JSON artifacts. See [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md).

## Request

```json
{
  "workflow_id": "lighthouse_handoff",
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
  "options": {
    "execution_mode": "workflow_orchestrated"
  }
}
```

## Planned Steps

| Step | Worker | Purpose |
|---|---|---|
| `extract_metrics` | tool `lighthouse.parse` | Normalize Lighthouse metrics |
| `classify_issues` | tool `lighthouse.classify_audits` | Classify audit opportunities |
| `prioritize_fixes` | model role `priority_helper` | Rank fixes for developers |
| `validate_priority_fixes` | tool `lighthouse.validate_priority_fixes` | Audit-truth content review (not a verification gate) |
| `match_fixes` | tool `lighthouse.match_fixes` | Match fixes to classified issues |
| `write_handoff` | tool `lighthouse-handoff` / `compose-handoff` | Assemble JSON handoff object + render Markdown export |
| `verify_output` | tool `lighthouse.verify_handoff` | Final structural verification |

Each step declares `input_map` in the track file. The run plan surfaces those maps as `required_input`.

## Registry Metadata

| Field | Value |
|---|---|
| `input_type` | `lighthouse_report` |
| `output_type` | `developer_handoff` |
| `requires_model` | `true` |
| `preferred_worker_type` | `priority_helper` |
| `fallback_behavior` | deterministic tool steps when runtime unavailable (via tool handlers / mock provider) |

## Expected Final Result Sections

- `clientSummary`
- `developerSummary`
- `priorityFixes`
- `handoffChecklist`
- `estimatedImpact`
- `markdown` (export — rendered from structured JSON)
- `meta.verification`

Output schema: `companion/schemas/lighthouse-handoff.schema.json`

## Try It

Plan only:

```bash
curl -s http://127.0.0.1:31313/workflows/plan \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"lighthouse_handoff","input":{"url":"https://example.com","scores":{"performance":72},"opportunities":[]}}'
```

Execute (mock provider recommended for local smoke):

```bash
curl -s http://127.0.0.1:31313/providers/set \
  -H "Content-Type: application/json" \
  -d '{"provider":"mock"}'

curl -s http://127.0.0.1:31313/workflows/run \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"lighthouse_handoff","input":{"url":"https://example.com","scores":{"performance":72,"accessibility":96,"bestPractices":100,"seo":92},"opportunities":[{"title":"Reduce render-blocking resources"}],"diagnostics":[]}}'
```

## Validation Evidence

- Unit: `node scripts/orchestration-unit-test.js`
- Smoke: `POST /workflows/plan`, `POST /workflows/run` checks in `scripts/smoke-test.js` (**55/55** suite)

## Related

- [lighthouse-handoff.md](./lighthouse-handoff.md)
- [../02-track-system/run-plan-format.md](../02-track-system/run-plan-format.md)
- [../01-architecture/local-brain-orchestration.md](../01-architecture/local-brain-orchestration.md)
