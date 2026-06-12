# Docs Cleanup Report

**Date:** 2026-06-12  
**Branch:** `cursor/docs-reorganization-d787`  
**Scope:** Reorganize `/docs` to match Locaily vision (Local Brain, NearbyNode, AI Pit Crew, Lighthouse Handoff).

## Summary

The docs tree now uses numbered folders (`00`–`06`, `99-archive`) with a clear agent entry path at `docs/00-start-here/README.md`. Historical engine plans and conversation captures were archived without deletion. New architecture, workflow, research, product, agent, and decision docs were synthesized from existing material and current code—claims were not strengthened beyond evidence.

## Files Created

### 00-start-here
- `README.md`
- `current-vision.md`
- `glossary.md`
- `project-index.md`

### 01-architecture
- `locaily-overview.md`
- `local-brain.md`
- `nearby-node.md`
- `ai-pit-crew.md`
- `capability-registry.md`
- `task-routing.md`
- `orchestration-flow.md`

### 02-workflows
- `lighthouse-handoff.md`
- `workflow-template.md`
- `task-track-template.md`
- `validation-template.md`

### 03-research
- `model-candidates.md`
- `model-evaluation-template.md`
- `hardware-profiles.md`
- `hardware-test-matrix.md`
- `runtime-options.md`
- `license-notes.md`

### 04-product
- `ux-principles.md`
- `setup-flow.md`
- `status-states.md`
- `roadmap.md`
- `tester-feedback-plan.md`

### 05-agents
- `agent-context.md`
- `coding-agent-handoff.md`
- `documentation-agent-rules.md`
- `evaluation-agent-rules.md`
- `cleanup-rules.md`

### 06-decisions
- `decision-log.md`
- `open-questions.md`
- `assumptions.md`

### Root / archive
- `docs/README.md`
- `docs/DOCS_CLEANUP_REPORT.md` (this file)
- `docs/99-archive/README.md`

## Files Moved

| From | To |
|---|---|
| `docs/architecture.md` | `docs/99-archive/old-summaries/architecture.md` |
| `docs/implementation-plan.md` | `docs/99-archive/old-summaries/implementation-plan.md` |
| `docs/current-to-local-ai-engine-implementation-plan.md` | `docs/99-archive/old-summaries/current-to-local-ai-engine-implementation-plan.md` |
| `docs/api-contract.md` | `docs/01-architecture/api-contract.md` |
| `docs/tool-integration-guide.md` | `docs/05-agents/client-integration-guide.md` |
| `docs/packaging-plan.md` | `docs/04-product/packaging-plan.md` |
| `docs/publish-readiness-checklist.md` | `docs/04-product/publish-readiness-checklist.md` |
| `docs/desktop-companion-decision.md` | `docs/04-product/desktop-companion-decision.md` |
| `docs/new-local-ai-engine-dev-docs/` | `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/` |
| `docs/v2/*` | `docs/99-archive/raw-conversation-captures/` |
| `docs/pit-crew/*` | `docs/99-archive/raw-conversation-captures/` |

## Files Merged (Content Consolidated, Sources Archived)

| New file | Primary sources |
|---|---|
| `00-start-here/current-vision.md` | User vision brief, Pit Crew capture, evolution txt |
| `01-architecture/local-brain.md` | Old `architecture.md`, engine spec 01–04, code layout |
| `01-architecture/ai-pit-crew.md` | Evolution txt, Pit Crew docx, orchestrator code |
| `02-workflows/lighthouse-handoff.md` | `lighthouse-handoff.js`, prompts, old MVP notes |
| `03-research/model-candidates.md` | Archived `15-model-strategy.md` |
| `05-agents/coding-agent-handoff.md` | Archived `14-agentic-coding-agent-brief.md`, AGENTS.md |
| `06-decisions/open-questions.md` | Archived `16-open-questions.md` |

No exact-duplicate files were deleted.

## Files Archived (Not Deleted)

- Entire `new-local-ai-engine-dev-docs` spec pack (17 files)
- Three conversation capture files (2× docx, 1× txt)
- Three old top-level summaries

## Duplicate Docs Found

| Pair | Resolution |
|---|---|
| `01-architecture/api-contract.md` vs `99-archive/.../09-api-contract.md` | Canonical copy in `01-architecture/`; archive kept |
| `99-archive/old-summaries/architecture.md` vs new `01-architecture/*` | Old file archived; new split across component docs |
| `AGENTS.md` / `AGENT.md` vs `05-agents/*` | Repo root files kept; agent folder adds Locaily-specific rules (needs-review for alignment) |
| README "Local AI Platform" vs docs "Locaily" | Documented as legacy naming in glossary and start-here |

## Stale Docs Found

| Doc | Issue |
|---|---|
| `99-archive/old-summaries/current-to-local-ai-engine-implementation-plan.md` | Lists missing `/tasks/run`, audit log, tool packs—many now implemented |
| `99-archive/old-summaries/implementation-plan.md` | Describes Lighthouse as stub-only; code now has orchestrated path |
| `99-archive/deprecated-plans/.../README.md` | Says "do not start with PageSpeed/Lighthouse"—superseded by Locaily workflow priority |
| Root `README.md` / `AGENTS.md` | Still use "Local AI Platform" framing; not updated in this pass beyond doc links |
| `04-product/publish-readiness-checklist.md` | Some checklist items may be stale; marked needs-review in index |

## Open Questions (Docs Process)

1. Should root `README.md` and `AGENTS.md` be renamed/reframed to Locaily now or in a separate pass?
2. Should `AGENT.md` mirror `05-agents/agent-context.md`?
3. Where should populated benchmark results live—`03-research/` only or also `data/`?
4. Is there an existing Chrome extension repo path to link from `lighthouse-handoff.md`?

## Recommended Next Docs Work

1. **Align root README and AGENTS.md** with Locaily terminology and point to `00-start-here`
2. **Fill validation template** for Lighthouse with smoke/contract test evidence
3. **Add example client folder** and link from workflow doc (packaging plan gap)
4. **Populate hardware test matrix** after first evaluation runs
5. **Extract Pit Crew docx** into structured markdown in research or archive (optional; currently binary)
6. **Review publish-readiness-checklist** line-by-line against current code
7. **Add redirect stubs** at old paths only if external links exist (none identified in repo)

## Conflicts / Confusing Docs

| Conflict | Guidance |
|---|---|
| Project name: Locaily vs Local AI Platform vs Local AI Engine | Use Locaily in new docs; legacy names noted in glossary |
| Lighthouse: "stub/demo" (AGENTS.md, old MVP) vs orchestrated implementation | Docs now say: deterministic fallback confirmed; orchestrated path implemented; extension UX unvalidated |
| DealSniper as MVP centerpiece vs Lighthouse as first workflow | Both true in different eras: DealSniper was MVP tool; Locaily direction prioritizes Lighthouse as workflow test bench |
| Pit Crew naming vs Track-Based Orchestration | Same concept; glossary lists aliases |

## Owner Confirmation (2026-06-12 follow-up)

1. **Locaily** — confirmed as public product name
2. **NearbyNode** and **AI Pit Crew** — confirmed as public terms
3. **Next work priority** — owner asked for clarification (see explanation in PR/issue thread)
4. **Lighthouse extension repo** — https://github.com/mnfrdrsh/lighthouse-handoff (linked in workflow doc)
