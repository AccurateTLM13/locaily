# Step Input Mapping

How track steps receive input from the original request and prior step artifacts.

## Current Implementation

Tool and model steps resolve `input_map` in `companion/crew/input-map-resolver.js` via `companion/crew/step-input.js` (`buildStepInput` for tools, `buildModelStepInput` for models).

The Lighthouse proof track declares `input_map` on every step in `companion/crew/tracks/lighthouse-handoff.track.json`, including the `prioritize_fixes` model step.

Tracks without `input_map` fall back to deprecated step-id logic in `buildLegacyToolStepInput()` / `buildLegacyModelStepInput()` inside `step-input.js`.

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

Any step id not listed falls through to `return input` (full original input).

### DealSniper tool steps

| Step ID | Input source |
|---|---|
| `prepare_listing` | `$input.title`, `$input.price`, optional listing fields |
| `analyze_listing` | `$artifacts.prepare_listing` |
| `validate_analysis` | `$artifacts.analyze_listing` |

## Remaining Debt

For **current catalog tracks**, input mapping is fully declarative. Legacy fallbacks remain for unmigrated steps only:

- `buildLegacyToolStepInput()` / `buildLegacyModelStepInput()` in `step-input.js` (remove in Milestone 4)
- `prompts.js` `classify_issues` template still reads broad context if invoked (unused by current tracks)
- `prioritize_fixes` legacy prompt path when `stepInput` is null (deprecated)

Adding new workflows should **not** extend legacy branches — declare `input_map` in track JSON.

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

## Legacy Fallback

Deprecated step-id branches remain in `buildLegacyToolStepInput()` and `buildLegacyModelStepInput()` inside `step-input.js`. Do not add new step ids there.

## Transition Plan

| Phase | Action |
|---|---|
| **Done** | Optional `input_map` on tool steps; resolver in `input-map-resolver.js` |
| **Done** | Migrate `website_audit.lighthouse_handoff` to declarative maps |
| **Done** | Add `marketplace.dealsniper` with declarative maps only |
| **Done** | Model-step `input_map` via `buildModelStepInput()` |
| **Next** | Remove legacy fallbacks when no tracks omit `input_map` |

## Do Not

- Add new workflows by extending legacy step-id branches in `step-input.js`

## Related

- [track-definition-schema.md](./track-definition-schema.md)
- [../07-progress/current-sprint.md](../07-progress/current-sprint.md)
- Code: `companion/crew/step-input.js`, `companion/crew/tool-router.js`, `companion/crew/model-router.js`
