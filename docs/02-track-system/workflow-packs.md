# Workflow Pack Contract & Starter SDK

**Contract schema:** [companion/schemas/workflow-pack-manifest.schema.json](../../companion/schemas/workflow-pack-manifest.schema.json) (`locaily.workflow_pack.v1`)  
**Loader:** [companion/packs/workflow-pack-loader.js](../../companion/packs/workflow-pack-loader.js)  
**SDK CLI:** [scripts/workflow-pack-sdk.js](../../scripts/workflow-pack-sdk.js)  
**Reference pack:** [workflow-packs/incident-triage-pack/](../../workflow-packs/incident-triage-pack/)

---

## Overview

A **Workflow Pack** turns Locaily's track, tool, schema, prompt, permission, qualification, and intake abstractions into a self-contained directory that installs under `workflow-packs/` (or extra directories configured via `LOCAILY_WORKFLOW_PACK_DIRS`) **without modifying Local Brain core files**.

## Standard Directory Layout

```txt
workflow-packs/<pack-id>/
  pack.json                        # Manifest (locaily.workflow_pack.v1)
  tracks/*.track.json              # Pack-local task tracks (task-track.schema.json)
  tools/
    tool.json                      # Tool-pack manifest (tool-pack-manifest.schema.json)
    index.js                       # Tool handlers
    schemas/*.schema.json          # Tool input/output schemas
  prompts/*.md                     # Optional prompt templates ({{field}}, {{json:field}})
  schemas/*.schema.json            # Workflow/track output schemas
  fixtures/*.json                  # Executable test fixtures
  permissions.json                 # { "required": [...], "optional": [...] }
  qualification-requirements.json  # [{ "track_id", "role", "min_status", "min_score" }]
  README.md
```

## Security & Isolation Boundaries

1. **Path containment (`resolveInsidePack`):** Every file reference (`tracks`, `tools`, `prompts`, `schemas`, `fixtures`, `permissions`, `qualification_requirements`, `readme`) must resolve strictly inside its pack directory. Absolute paths and `..` directory traversal fail closed with `WORKFLOW_PACK_PATH_ESCAPE`.
2. **ID collision protection (`WORKFLOW_PACK_ID_CONFLICT`):** Any pack declaring a `pack.id`, `workflow_id`, or `track_id` that collides with built-in registries or another loaded pack is rejected and recorded in `getLoadErrors()` without disrupting built-in workflows.
3. **Permission & qualification visibility:** `evaluatePackPermissions()` and `evaluatePackQualificationReadiness()` surface whether required permissions are approved and whether required model roles meet qualification thresholds.

## Starter SDK CLI

```bash
# List discovered packs, permissions, and qualification readiness
npm run pack:list

# Validate manifest, schemas, paths, fixtures, permissions, and requirements
npm run pack:validate -- workflow-packs/incident-triage-pack

# Scaffold a runnable new pack
npm run pack:init -- --id my-new-pack --name "My New Pack"

# Run all declared fixtures end-to-end against mock runtime
npm run pack:test -- workflow-packs/incident-triage-pack
```

## HTTP Endpoints

- `GET /packs` (alias `GET /orchestration/packs`) — lists loaded packs with `permissionStatus`, `qualificationReadiness`, and load errors.
- `GET /packs/:id` — detailed pack summary (`404 PACK_NOT_FOUND` when missing).
- `POST /packs/validate` — validates `{ packDir }` restricted inside allowed pack roots.

## Installed Official Starter Packs (Read-Only)

All six official packs declare only `model.run` permission and use strictly in-memory deterministic tools (no filesystem writes, shell execution, or network calls) pending the runtime central execution-policy gate (`SEC-01`):

| Pack ID | Workflow ID | Composed Shared Capabilities | Purpose |
|---|---|---|---|
| `incident-triage-pack` | `incident_triage` | `core.classify`, `core.summarize` | Parse outage alerts/error codes and assemble an on-call triage brief |
| `pr-diff-review-pack` | `pr_diff_review` | `core.classify`, `core.prioritize`, `core.summarize` | Parse unified git diffs, flag sensitive paths, rank file risk, and generate review checklist |
| `ci-failure-triage-pack` | `ci_failure_triage` | `core.classify`, `core.summarize` | Extract failing tests, stack locations, and flake hints from CI build logs |
| `issue-triage-pack` | `issue_triage` | `core.classify`, `core.prioritize`, `core.summarize` | Audit repro completeness, identify missing clarification questions, and suggest backlog priority |
| `meeting-notes-pack` | `meeting_action_plan` | `core.classify`, `core.prioritize`, `core.summarize`, `core.validate` | Extract decisions, blockers, open questions, and prioritized action items from transcripts |
| `release-notes-pack` | `release_notes` | `core.classify`, `core.summarize` | Group conventional commits, detect breaking changes/semver bump, and draft changelog + upgrade notes |
