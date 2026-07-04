# Sync Docs

Align `docs/` (and closely linked root files) with the current Locaily codebase, tests, and decisions.

## Goal

Keep documentation **confirmed**, **navigable**, and **free of stale claims** — without inventing features or copying chat transcripts.

## Read First (source of truth order)

1. `companion/` implementation — especially `server.js`, `config.json`, `core/`, `memory/`, `tools/`
2. `tool-packs/`, `templates/memory-vault*`, `scripts/smoke-test.js`, `scripts/contract-test.js`
3. `docs/01-architecture/api-contract.md`
4. `docs/06-decisions/decision-log.md`
5. `docs/00-start-here/project-index.md`
6. `docs/08-agents/documentation-agent-rules.md` and `cleanup-rules.md`
7. Recent validation in `docs/04-validation/` and `docs/03-workflows/*-validation.md`

## Scope

**In scope**

- `docs/**` (all numbered folders + `docs/README.md`)
- Root drift checks: `README.md`, `AGENTS.md`, `AGENT.md` (endpoint lists, smoke counts, naming)
- `docs/00-start-here/project-index.md` — add/archive entries
- `docs/06-decisions/decision-log.md` — log doc-impacting decisions
- `docs/DOCS_CLEANUP_REPORT.md` — append summary when changes are non-trivial

**Out of scope unless user asks**

- Private Second Brain vault content
- `docs/99-archive/` content (only fix broken links pointing into archive)
- Implementing deferred features to match docs

## Sync Checklist

### 1. Discover current state

- List registered tools (`GET /tools` or `companion/tools/registry.js`)
- List HTTP routes in `companion/server.js`
- Run or read latest smoke/contract test counts from `scripts/smoke-test.js`
- Note Memory Bridge status: disabled by default; Lighthouse-only wiring in v0
- Check roadmap done/open items against code

### 2. Find stale docs

Search for outdated patterns:

- `28/28` smoke (historical L1 baseline)
- `48/48` smoke (pre–DealSniper track checks; superseded)
- Current baseline: **51/51** with memory disabled on clean server
- "stub/demo" for Lighthouse Handoff (now a real workflow test bench)
- "Local AI Platform" / "Local AI Engine" without Locaily context
- Missing Memory Bridge endpoints or `companion/memory/` modules
- Claims of unimplemented features as finished (embeddings, writeback apply, multi-workflow memory)
- Missing `05-validation/` references after validation work

### 3. Update by folder

| Folder | Keep aligned |
|--------|----------------|
| `00-start-here/` | Confirmed vs experimental lists, glossary, project index |
| `01-architecture/` | System map, modules, API surfaces, memory bridge |
| `02-workflows/` | Tool contracts, validation tiers, memory preflight |
| `04-product/` | Roadmap done/open, publish checklist |
| `05-validation/` | Evidence records, privacy notes, deferred scope |
| `05-agents/` | Agent rules, doc maintenance pointers |
| `06-decisions/` | Decision log, open questions (resolve or narrow) |

### 4. Writing rules

- **Confirmed** — backed by code, tests, or decision log entry
- **Experimental** — direction without implementation
- **Archived** — move or link to `99-archive/`; do not delete history
- Do not claim benchmark wins or model learning
- Do not include private vault paths; use placeholders only
- Memory Bridge expansion beyond Lighthouse Handoff stays **deferred** unless code changed
- Preserve API envelope contracts; note legacy `/analyze` compatibility

### 5. Required outputs

After syncing, report:

```markdown
## Docs Sync Summary

### Updated
- [file] — [what changed]

### Verified current (no change needed)
- [file or area]

### Stale / deferred (not updated — why)
- [item]

### Suggested follow-ups
- [next doc or validation to add]
```

### 6. Index and cross-links

- Update `docs/00-start-here/project-index.md` for any added/moved/archived doc
- Update `docs/README.md` quick links if major sections changed
- Add decision-log entries for significant doc-alignment decisions
- Fix broken relative links discovered during pass

## Do Not

- Dump chat transcripts into docs
- Commit private Second Brain content or absolute vault paths
- Mark Memory Bridge multi-workflow or writeback apply as done
- Weaken claims when merging old docs
- Delete non-duplicate files — archive instead

## Optional user context

If the user typed text after `/sync-docs`, treat it as scope hints (e.g. "focus on Memory Bridge", "after PR #12"). Prioritize those areas first, then run the full checklist.
