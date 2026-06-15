# Workflow: DealSniper

## Status

**Implemented** — showcase tool plus Pit Crew workflow track

## Goal

Analyze marketplace listings and surface structured buying/selling insights for the user.

## User Input

Listing text, price, and marketplace context (see `companion/tools/deal-sniper.js`).

Required: `title`, `price`. Optional: `description`, `location`, `sellerInfo`, `source`.

## Output

Structured analysis object per `companion/schemas/deal-sniper.schema.json`, wrapped in the track run envelope from `POST /tracks/run`.

## Track

**Track ID:** `marketplace.dealsniper`

**File:** `companion/pit-crew/tracks/dealsniper.track.json`

| Step | Executor | Purpose |
|---|---|---|
| `prepare_listing` | `deal-sniper` / `prepare-listing` | Deterministic listing normalization |
| `analyze_listing` | `deal-sniper` / `analyze-listing` | Model-backed deal analysis |
| `validate_analysis` | `deal-sniper` / `validate-analysis` | Deterministic output schema check |

All tool steps use declarative `input_map` — no hardcoded step-id branches in `tool-router.js`.

## Entry Points

- `POST /tracks/run` with `track_id: "marketplace.dealsniper"`
- `POST /tasks/run` / `POST /analyze` with tool `deal-sniper` (single-tool path)

## Validation Evidence

Smoke tests cover track catalog listing, declarative `input_map`, and mock-provider track run. Unit test: `scripts/track-input-map-unit-test.js`.

## Known Gaps

- No dedicated L2/L3 workflow validation doc under `docs/04-validation/`
- Track result assembly still special-cases Lighthouse markdown via `write_handoff` artifact detection

## Related

- [../02-track-system/workflow-registry.md](../02-track-system/workflow-registry.md)
- Tool handler: `companion/tools/deal-sniper.js`
