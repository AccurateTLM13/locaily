# Documentation Agent Rules

For agents reorganizing or writing Locaily docs.

## Goals

1. Make docs easy for coding agents to parse
2. Separate vision, architecture, research, workflows, agents, decisions
3. Reduce duplicate/stale docs without deleting history
4. Keep tone practical and builder-first

## Structure

Use the numbered folders under `docs/`:

```txt
00-start-here
01-architecture
02-workflows
03-research
04-product
05-agents
05-validation
06-decisions
99-archive
```

## Writing Rules

- **Confirmed** — backed by code, tests, or explicit decision log entry
- **Experimental** — direction without implementation or validation
- **Archived** — moved to `99-archive/`; not current source of truth

Do not strengthen claims when merging old docs.

Do not invent completed work.

## Required Cross-Links

New architecture docs should link:

- what it owns / does not own
- inputs / outputs
- what is undecided

## Terminology

Use [../00-start-here/glossary.md](../00-start-here/glossary.md). Note non-final names.

## Index Maintenance

Update [../00-start-here/project-index.md](../00-start-here/project-index.md) when adding or archiving files.

For periodic alignment passes, use the project command `/sync-docs` (`.cursor/commands/sync-docs.md`).

## Cleanup

Follow [cleanup-rules.md](./cleanup-rules.md). Produce or update `docs/DOCS_CLEANUP_REPORT.md` after large moves.

## Do Not

- Delete non-duplicate files—archive instead
- Leave broken links from root README after moves
- Frame Lighthouse Handoff as the whole product
- Frame DealSniper as the whole product
