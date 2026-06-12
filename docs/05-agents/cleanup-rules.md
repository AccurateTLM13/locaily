# Documentation Cleanup Rules

Standard rules for docs reorganization passes.

## Archive, Don't Trash

Move stale content to `docs/99-archive/`:

- `old-summaries/` — superseded high-level plans
- `raw-conversation-captures/` — docx/txt conversation exports
- `deprecated-plans/` — detailed spec packs replaced by new structure

Archive means **not current source of truth**, not deleted.

## Duplicates

Delete only **exact duplicates**. Near-duplicates should merge or cross-link.

Known duplicate area:

- `api-contract.md` vs archived `09-api-contract.md` — keep `01-architecture/api-contract.md` as canonical

## Claim Hygiene

When merging old docs:

- weaken unvalidated claims
- mark experimental sections
- move benchmark aspirations to research templates unfilled

## Required Artifacts After Cleanup

- Update `docs/00-start-here/project-index.md`
- Update root `README.md` doc links
- Write `docs/DOCS_CLEANUP_REPORT.md`

## Naming

Prefer Locaily vision terms in new docs; note legacy names where repo still uses them.

## Agent Checklist

- [ ] Start-here path exists
- [ ] Glossary updated
- [ ] Decision log not empty for major moves
- [ ] No broken internal links in index
- [ ] Lighthouse framed as first workflow only
