# Archive

Useful context that is **not** the current source of truth for Locaily.

## When To Read Archive

- Understanding historical naming (Local AI Platform, Local AI Engine)
- Recovering detailed engine-core specs from early planning
- Reviewing conversation captures that shaped Pit Crew / track orchestration
- Comparing old implementation plans to what code actually shipped

## When Not To Read Archive First

- Implementing features → start at [../00-start-here/README.md](../00-start-here/README.md)
- API contracts → [../01-architecture/api-contract.md](../01-architecture/api-contract.md)
- Current vision → [../00-start-here/current-vision.md](../00-start-here/current-vision.md)

## Subfolders

| Folder | Contents |
|---|---|
| `old-summaries/` | Superseded top-level plans (`architecture.md`, `implementation-plan.md`, migration plan) |
| `raw-conversation-captures/` | Exported conversations (txt/docx) on evolution and Pit Crew |
| `deprecated-plans/new-local-ai-engine-dev-docs/` | Numbered engine-core spec pack (01–16) |

## Staleness Warning

Archived `current-to-local-ai-engine-implementation-plan.md` lists gaps (no `/tasks/run`, no audit log, etc.) that **have since been implemented**. Trust code and current `01-architecture` docs over that file.
