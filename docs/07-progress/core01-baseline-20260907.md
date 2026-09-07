# CORE-01 Verified Baseline — 2026-09-07

This is the code-verified starting baseline for LOCALLY CORE-01 (System Formation).
Every statement below was established by inspecting the repository at the starting
commit, not from prior summaries. Where documentation and code disagreed, code wins.

```text
Starting commit:  82d20477bbfa90a56be0683778d940d1fdcfd12b (= origin/main, PR #38 merge)
Branch:           core/core-01-system-formation
Milestone:        core-01-system-formation (development/milestones/core-01-system-formation.json)
Session:          session-20260907-001
```

## Repository reconciliation performed before this baseline

| Item | Finding |
|---|---|
| `main` vs `origin/main` | Local `main` was 1 merge behind (stale ref). Fast-forwarded to `82d2047`. CI on main: green. |
| Open PRs | Only #30 `codex/dev-loop-01` (CONFLICTING, 56 behind). Content superseded by consolidation PR #33 + CTK-01 merge. Sole orphan: `scripts/test-development-state-guard.js` (61 lines) never referenced on main. Not merged. Recommendation: close #30, optionally recover the orphan test later. |
| Closed-unmerged PRs | None. PRs #19–#41 all merged. |
| Branches ahead of main | Only `fix/dev-harness-01-delivery-review-20260823` (merged as PR #38 = current main). All other remote branches are stale pre-consolidation snapshots (merging them would delete 15k–57k lines of newer main content). Preserved, not deleted. |
| Unmerged real work | `codex/lifecycle-docs-reconciliation-20260823` (local, Aug 30): maintenance milestone `maintenance-lifecycle-docs-node24-20260823` (DEP0190 fixes + lifecycle docs reconciliation). Never PR'd. Contains 2 junk zip files that must not reach main. Left unmerged; candidate for a separate narrow PR. |
| `legacy-locailly` remote | `github.com/AccurateTLM13/locailly` no longer exists (renamed to canonical `locaily`). Remote config is dead; harmless. |
| Uncommitted WIP found on main | Maintenance milestone `durable-job-state-integrity-20260905` (paused 2026-09-05 by codex; impl + local tests passed, delivery gates not run). Isolated into `git stash@{0}` with descriptive message + patch backup; NOT abandoned. Resume: `git stash pop` on a branch from main, then run prepare/validate gates. |
| Older stashes preserved | `stash@{1}` PR38 evidence refresh, `stash@{2}` m7-m8 WIP (content already in main via PR #19). Untouched. |
| Open issues | #37 (DEV-HARNESS-01 review — superseded by merged PR #38; closable). #42 (Model Gateway/OmniRoute — explicitly deferred by CORE-01 guardrails). |
| Offline suite on baseline | `npm run test:full` exit 0, all suites green (Windows, Node 24). Zero npm dependencies. |
| Code-debt markers | No TODO/FIXME/HACK in production code. One explicit stub: NearbyNode is spec-only (`companion/schemas/internal/nearby-node-capability.schema.json`). |

## Implemented workflows (`companion/orchestration/registry/workflows.json`)

| Workflow | Track | Status |
|---|---|---|
| `lighthouse_handoff` | `website_audit.lighthouse_handoff` (10 steps) | implemented |
| `dealsniper` | `marketplace.dealsniper` (3 steps, deterministic-only) | implemented |
| `operator_log_discovery` | `publishing.operator_log_discovery` (3 steps) | experimental |
| `operator_log_draft` | `publishing.operator_log_draft` (3 steps) | experimental |

`run-plan-builder.js` reads exactly one `workflow.track_id`. There is **no multi-track
composition anywhere**. Input contracts per workflow are hardcoded if-chains in
`validateWorkflowInput` (four `workflow_id ===` comparisons).

## Tracks (`companion/crew/tracks/*.track.json`) — 7 total

All tracks are validated against `task-track.schema.json` (steps with `tool`/`model`
executors, `input_map`, `depends_on`, `result_step`, `verification_step`).

- Lighthouse-coupled (4): `website_audit.lighthouse_handoff`, `.accessibility_deep`,
  `.performance_budget`, `.seo_audit`. The three audit variants share the same
  lighthouse-parser steps (extract → model analyze → model recommend → assemble → verify):
  intra-domain reuse exists, cross-domain reuse does not.
- Domain-specific (3): `marketplace.dealsniper`, `publishing.operator_log_discovery`,
  `publishing.operator_log_draft`.
- Reusable domain-neutral tracks: **none**.

## Capability vocabulary audit (code-verified classification)

| Capability | Classification | Evidence |
|---|---|---|
| extract | Partial / tool-only | `text.extract_json` (standard-text-pack) is a real model-backed handler with I/O schemas, consumed by **zero** tracks. `lighthouse.extract_category_audits` is domain-specific and consumed. |
| classify | Partial / tool-only | `text.classify` real + untested-by-tracks; `lighthouse.classify_audits` domain-specific consumed. |
| summarize | Partial / tool-only | `text.summarize` real, zero consumers; summarization otherwise lives inside domain model steps. |
| prioritize | Workflow-specific | Only `priority_helper` model step + `lighthouse.validate_priority_fixes` in the Lighthouse track. No generic form. |
| validate | Reusable implementation (infrastructure) | `companion/core/result-validator.js` used across all layers; step-output + workflow-result validation in `run-plan-validator.js`; `text.validate_schema` deterministic tool unused by tracks. |
| route | Reusable implementation (infrastructure) | `crew/model-router.js` (role resolution), `providers/router.js` (active-provider selection), enforcement routing, relay routing. No model-based workflow planner except `track-planner` (selects ONE track). |
| transform | Workflow-specific | `lighthouse.match_fixes` only. No generic form. |
| export | Partial | `crew/markdown.js` `formatHandoffMarkdown` is shared formatting, but the handoff-composition step is Lighthouse-specific. No generic export track. |

## Tool packs (`tool-packs/`, auto-discovered by `companion/tools/registry.js`)

- `standard-text-pack`: 6 generic text tools (clean, summarize, extract_json, classify,
  detect_injection, validate_schema). Real handlers + schemas + validation. **Not consumed
  by any track.** This is the strongest existing asset for CORE-01 reuse.
- `lighthouse-parser-pack`: 7 deterministic Lighthouse tools. Consumed heavily.
- `editorial-pack`: 4 vault/editorial tools. Consumed by the publishing tracks.
- Built-ins: `deal-sniper`, `lighthouse-handoff` (showcase), `track-planner`.

No Lighthouse-specific tool was found registered into a generic layer; layering is honest.

## Providers / models

- `providers/router.js`: exactly two providers — `ollama` (real, localhost) and `mock`
  (schema-shaped JSON generation, used by all offline tests). Single active provider; no
  per-step provider failover. Model selection: per-step `role` → `resolveModelForRole`
  (enforcement/qualification policy) → optional request override → `mock-local-model`.
- Benchmark Lab qualification evidence gates roles under
  `advisory | require_qualified | require_qualified_or_conditional` policies.
- No provider breadth work is in CORE-01 scope.

## Execution-plan architecture (baseline)

```text
workflow_id → getWorkflow → single track_id → loadTrack
  → buildRunPlan (steps described, plan validated vs workflow-plan.schema.json)
  → executeRunPlan (sequential or intra-track DAG via core/dag-graph levels)
     per step: relay-if-needed → tool | model executor
     context = { input, artifacts[step_id] }   ← artifact passing exists ONLY within one track
     step-output validation (schema + verification gate)
  → assembleTrackResult (result_step; verification meta)
  → validateWorkflowResult (track-metadata.json expectations)
  → recordWorkflowRun (Track Run Record evidence)
```

`input-map-resolver.js` supports `$input[.path]` and `$artifacts.<step_id>[.path]`
declarative references — the exact mechanism CORE-01 generalizes across tracks.

## Validation architecture

- `core/result-validator.js`: shared JSON-Schema-subset validator (all layers use it).
  Known gap (from paused milestone notes): object-or-null typed schemas skip nested
  constraints; separate hardening deliberately out of CORE-01 scope.
- `run-plan-validator.js`: per-step output + verification-gate + workflow-result checks.
- Track registry metadata: `companion/orchestration/registry/track-metadata.json`
  (purpose, I/O types, fallback_behavior, validation_expectations per track).

## Capability kernel (CTK-01/02/03) — separate subsystem

`companion/capability-kernel/` is an event-triggered capsule/registry/trust system for
node roles (fixtures + one `status-handoff` rule capability). It is NOT part of the
workflow/track execution path and NearbyNode is spec-only. CORE-01 does not build on it.

## Known gaps carried into CORE-01

1. No workflow-level artifact passing (tracks cannot consume other tracks' outputs).
2. No reusable core capability tracks despite working generic primitives.
3. `prioritize` has no domain-neutral implementation.
4. Workflow input contracts are hardcoded if-chains, not declarative.
5. Single workflow planner cannot compose tracks.
6. Paused `durable-job-state-integrity-20260905` milestone awaits delivery gates (stashed).
7. `maintenance-lifecycle-docs-node24-20260823` unmerged (DEP0190 warnings persist on Windows).
