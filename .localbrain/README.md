# Local Brain

`.localbrain/` is the repository's cross-machine operational memory.

## Files

- `NOW.md` — current objective, status, blocker, and next action.
- `DECISIONS.md` — durable decisions that should survive individual sessions.
- `sessions/YYYY-MM-DD.md` — compact chronological work logs.

## What belongs here

Good:
- current objective
- active branch
- current blocker
- exact next action
- durable decisions
- validation result
- important work completed today

Bad:
- full chat transcripts
- duplicated permanent documentation
- speculative notes presented as facts
- secrets or credentials
- generated summaries that were never verified against the repo

## Source of truth

Git/repository state outranks Local Brain text.

If they conflict, update Local Brain to match reality.
