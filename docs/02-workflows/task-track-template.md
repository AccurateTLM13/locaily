# Task Track Template

Use for **AI Pit Crew** tracks: classified job types that map to tools, packs, roles, and validators.

---

# Track: [Track Name]

## Status

`Experimental` (default until validated)

## Track Definition

What kind of user request qualifies for this track.

Examples: website audit, marketplace listing analysis, repo code review.

## Classifier Signal (planned)

How Local Brain would recognize this track in the future:

- keywords
- client source id
- input schema shape
- explicit `track` field in request

**Today:** usually explicit tool id from client.

## Recommended Tool Pack

- Pack id:
- Tools:

## Model Role Map

| Step / job type | Role | Notes |
|---|---|---|
| | `fast_worker` | |
| | `default_worker` | |
| | `reasoning_worker` | |

## Required Capabilities

- [ ] local model inference
- [ ] deterministic validator
- [ ] file access
- [ ] browser bridge
- [ ] NearbyNode connector

## Output Contract

Link to JSON schema or handoff format.

## Fallback Ladder

```txt
fast_worker → default_worker → reasoning_worker → fail
```

## Proof Criteria

What evidence is required before calling this track "validated":

- [ ] smoke test
- [ ] schema contract test
- [ ] human review sample set
- [ ] comparison baseline documented

## Benchmarks

| Metric | Target | Measured | Date |
|---|---|---|---|
| | | not yet | |

Leave empty until data exists.
