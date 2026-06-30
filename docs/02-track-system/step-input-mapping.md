# Step Input Mapping

How track steps receive input from the original request and prior step artifacts.

## Current Implementation

Tool and model steps resolve `input_map` in `companion/pit-crew/input-map-resolver.js` via `companion/pit-crew/step-input.js` (`buildStepInput` for tools, `buildModelStepInput` for models).

The Lighthouse proof track declares `input_map` on every step in `companion/pit-crew/tracks/lighthouse-handoff.track.json`, including the `prioritize_fixes` model step.

All catalog tracks declare `input_map` on every step. Steps without `input_map` fail with `STEP_INPUT_MAP_MISSING` from `step-input.js`.

### Reference syntax (implemented)

- `$input` — full track run input
- `$input.<field>` — field from original input
- `$artifacts.<step_id>` — full prior step output
- `$artifacts.<step_id>.<path>` — nested field from a prior step artifact
- Array values — coalesce first non-null/non-undefined reference; final array item is literal default

### Lighthouse model steps

| Step ID | Input source |
|---|---|
| `prioritize_fixes` | `$input.url`, `$input.scores`, `$artifacts.classify_issues.rankedOpportunities`, `$artifacts.classify_issues.issues` |

### Lighthouse tool steps

| Step ID | Input source |
|---|---|
| `extract_metrics` | Full original `context.input` |
| `classify_issues` | `input.opportunities` |
| `validate_priority_fixes` | opportunities + `artifacts.prioritize_fixes` |
| `match_fixes` | `artifacts.classify_issues` + `artifacts.validate_priority_fixes` |
| `write_handoff` | URL, metrics, classifications, priorities, matches, opportunities |
| `verify_output` | `artifacts.write_handoff` |

## Remaining Debt

- `prompts.js` `classify_issues` template still reads broad context if invoked (unused by current tracks)

Adding new workflows must declare `input_map` in track JSON — legacy step-id branches were removed in 2026-06-30.

### DealSniper tool steps

| Step ID | Input source |
|---|---|
| `prepare_listing` | `$input.title`, `$input.price`, optional listing fields |
| `analyze_listing` | `$artifacts.prepare_listing` |
| `validate_analysis` | `$artifacts.analyze_listing` |

## Historical Problem (pre–Milestone 1B)

- Every new track requires editing shared router code
- Step ids are global strings — collision risk across tracks
- Mapping logic is invisible in track JSON files
- Agents reading track files cannot see data flow without reading router source

## Example (implemented)

Track files declare how each step receives input from `$input` and `$artifacts`:

```json
{
  "id": "write_handoff",
  "input_map": {
    "url": "$input.url",
    "metrics": "$artifacts.extract_metrics",
    "classifiedIssues": "$artifacts.classify_issues",
    "prioritizedFixes": "$artifacts.validate_priority_fixes",
    "matchedFixes": "$artifacts.match_fixes",
    "opportunities": "$input.opportunities"
  },
  "executor": {
    "type": "tool",
    "tool": "lighthouse-handoff",
    "task": "compose-handoff"
  }
}
```

Resolver rules (target behavior):

- `$input.*` — fields from the track run request input
- `$artifacts.<step_id>` — full output object from a prior step
- `$artifacts.<step_id>.<path>` — nested field (optional v2)

## Transition Plan

| Phase | Action |
|---|---|
| **Done** | Optional `input_map` on tool steps; resolver in `input-map-resolver.js` |
| **Done** | Migrate `website_audit.lighthouse_handoff` to declarative maps |
| **Done** | Add `marketplace.dealsniper` with declarative maps only |
| **Done** | Model-step `input_map` via `buildModelStepInput()` |
| **Done** | Remove legacy fallbacks — all catalog tracks declare `input_map` |

## Do Not

- Add track steps without `input_map` in track JSON

## Related

- [track-definition-schema.md](./track-definition-schema.md)
- [../07-progress/current-sprint.md](../07-progress/current-sprint.md)
- Code: `companion/pit-crew/step-input.js`, `companion/pit-crew/tool-router.js`, `companion/pit-crew/model-router.js`
