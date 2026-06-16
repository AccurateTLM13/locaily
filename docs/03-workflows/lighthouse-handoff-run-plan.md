# Lighthouse Handoff Run Plan

First workflow plan executed through Local Brain track-based orchestration.

**Workflow id:** `lighthouse_handoff`  
**Track id:** `website_audit.lighthouse_handoff`  
**Track file:** `companion/pit-crew/tracks/lighthouse-handoff.track.json`

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
| `validate_priority_fixes` | tool `lighthouse.validate_priority_fixes` | Schema/shape guard for priorities |
| `match_fixes` | tool `lighthouse.match_fixes` | Match fixes to classified issues |
| `write_handoff` | tool `lighthouse-handoff` / `compose-handoff` | Assemble handoff object + markdown |
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
- `markdown`
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
