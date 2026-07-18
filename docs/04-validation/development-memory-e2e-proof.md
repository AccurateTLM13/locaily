# Development Memory End-to-End Proof (Second Project)

**Status:** Proven in simulation (2026-07-18). Real second-repo operator acceptance pending.  
**Regression test:** `npm run test:development-memory-e2e`

This document records the Development Memory end-to-end proof for a **non-Locaily** registered project namespace. It complements DM1–DM10 unit/integration tests by exercising the full loop on namespaced storage.

## What this proves vs. what remains

| Claim | Status |
|---|---|
| Automated E2E on second project namespace | **Proven** (regression test) |
| Locaily legacy path isolation | **Proven** (regression test) |
| Real operator using DM inside a separate working repository | **Pending** — brief acceptance check before physical pilot |

The automated proof is substantial and merge-worthy. The manual walkthrough is a **short acceptance exercise**, not a major development milestone. No new features unless a blocker appears.

## Proof Project

| Field | Value |
|---|---|
| Slug | `pilot-workspace` |
| Display name | Pilot Workspace |
| Storage layout | `namespaced` |
| Locaily slug | `locaily` (legacy flat paths — unchanged) |

The proof uses an isolated temp workspace in the regression test. Operators can reproduce the same flow against a real second repository using the CLI steps below.

## Proof Scenario

Following the post-DM8 roadmap scenario:

1. Register second project  
2. Generate starter vault and enable capture  
3. Start development session  
4. Complete tasks and record a human decision  
5. Close session  
6. Extract knowledge candidates  
7. Approve candidate via review inbox  
8. Build context pack for a new task  
9. Confirm approved decision appears in retrieval evidence  
10. Confirm `locaily` legacy storage has zero cross-project leakage  

Proof passes only when every durable claim traces to source evidence.

## Evidence Paths (Namespaced Project)

For slug `{slug}` (e.g. `pilot-workspace`):

| Layer | Path |
|---|---|
| Registry | `data/memory/projects/registry.json` |
| Events | `data/memory/projects/{slug}/development-events/` |
| Sessions | `data/memory/projects/{slug}/development-sessions/manifests/` |
| Candidates | `data/memory/projects/{slug}/development-candidates/` |
| Reviews | `data/memory/projects/{slug}/development-candidates/reviews/` |
| Maintainer | `data/memory/projects/{slug}/development-maintainer/runs/` |
| Capture processor | `data/memory/projects/{slug}/development-capture/` |
| Vault (generated) | operator-chosen path; registered on project record |

Legacy `locaily` project continues to use flat paths under `data/memory/development-*`.

## Operator Workflow (Real Second Project)

Requires Local Brain running on `127.0.0.1:31313`.

### 1. Register and activate

```powershell
npm.cmd run memory:project:register -- --slug my-app --display-name "My App" --workspace-root C:\path\to\my-app
npm.cmd run memory:project:activate -- --slug my-app
```

Or via API: `POST /memory/projects/register`, then activate in registry.

### 2. Generate vault and enable capture

```powershell
npm.cmd run memory:project:generate-vault -- --slug my-app --vault-path C:\path\to\my-app-vault
```

Enable capture through setup (`enable-capture` step) or `POST /memory/projects/{slug}/setup` with step `enable-capture`.

### 3. Run a bounded development session

Use capture adapters during normal development, or record decisions:

```powershell
npm.cmd run memory:decision -- --project my-app --title "Decision title" --reason "Why we chose this"
npm.cmd run memory:session:close -- --project my-app
```

### 4. Extract and review candidates

```powershell
npm.cmd run memory:candidates:extract -- --project my-app
npm.cmd run memory:candidates:review-list -- --project my-app
npm.cmd run memory:candidates:review -- --candidate-id <id> --action approve --reviewer operator
```

### 5. Verify retrieval

```powershell
# POST /memory/context-pack with project=my-app, include known_decisions
```

Approved candidates should appear in `evidenceReferences` with `reviewStatus: "approved"`.

### 6. Health check

```powershell
npm.cmd run memory:project:health -- --slug my-app
```

## What This Proves

| Claim | Evidence |
|---|---|
| Second project registers with namespaced storage | Registry + path resolver tests |
| Full DM loop works off Locaily | E2E test: session → candidate → review → retrieval |
| Project isolation | E2E test: zero events in locaily legacy store |
| Human gate preserved | Approve creates review record; proposal-only writeback |
| Retrieval surfaces accepted memory | Context pack includes DECISIONS page + evidence reference |

## What This Does Not Prove

- Physical multi-device pilot  
- Live Ollama or provider-backed capture  
- Embedding-based retrieval  
- Automatic maintainer apply to vault (plan-only unless operator opts in)  
- Real operator UI for candidate review (CLI/API only)

## Remaining acceptance (before physical pilot)

Run once against an **actual second repository** (not Locaily):

1. Open real repo → register it in Local Brain  
2. Perform a small development task with capture enabled  
3. Close session → extract candidates → review → approve  
4. Start a later task → confirm accepted memory appears in context pack  
5. Record pass/fail in handoff docs  

If this fails, fix the blocker; do not begin the physical multi-device pilot until acceptance passes or is explicitly waived with evidence.

## Related

- [development-memory-loop.md](../01-architecture/development-memory-loop.md)
- [development-memory-roadmap.md](../02-planning/development-memory-roadmap.md)
- `scripts/test-development-memory-e2e-second-project.js`
