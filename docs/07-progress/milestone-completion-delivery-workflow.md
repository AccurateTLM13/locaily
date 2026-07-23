# Milestone Completion Delivery Workflow

**Design version:** 1.0.0
**Status:** Implemented — `scripts/deliver-milestone.js` with dry-run, execute, PR, and `--all` modes.

## Problem

When a milestone completes locally (via the sequencer/supervisor loop), there is no automated path from "milestone manifest finalized" to "PR open with CI running." An operator must manually:

1. Discover the milestone is done (check manifests, run-state, or sequencer output)
2. Determine which files changed and which documentation needs updating
3. Create a branch with a consistent naming convention
4. Stage and commit the correct files
5. Push the branch to origin
6. Write a structured PR description
7. Create the PR on GitHub
8. Wait for CI validation

This manual handoff is error-prone: files get missed, branch names are inconsistent, PR descriptions lack structure, and the gap between "local completion" and "PR open" can be hours or days.

## Design Principles

- **Local script, not a GitHub Action discovering local events.** The script runs on the operator's machine after local completion. CI validates the PR after it is pushed. No workflow attempts to discover or trigger on local lifecycle state changes.
- **Three explicit phases with operator control.** Dry-run first, then branch/commit, then PR creation. Each phase is inspectable. The operator can stop after any phase.
- **Read from existing completion artifacts.** The script consumes the milestone manifest, work closeout, and build slice — it does not create or modify completion state.
- **No automatic merge, release, or tagging in v1.** The PR is created as a draft. The operator reviews, marks it ready for review, and merges manually.

## Architecture

```text
                    LOCAL MACHINE                          |        GITHUB
                                                           |
  sequencer finishes milestone                             |
       |                                                   |
       v                                                   |
  [manifest + closeout + build-slice exist]                |
       |                                                   |
       v                                                   |
  deliver-milestone.js --dry-run                           |
       |  (reads artifacts, prints delivery summary)       |
       v                                                   |
  deliver-milestone.js --execute                           |
       |  (creates branch, stages, commits, pushes)        |
       v                                                   |
  deliver-milestone.js --pr                                |
       |  (creates draft PR via gh CLI)                    |
       |  ---- push to origin ---->                        |
       |                                                   v
       |                                            ci.yml runs on PR
       |                                                   |
       |                                            tests pass/fail
       |                                                   |
       v                                                   v
  operator reviews PR, marks ready, merges manually
```

## Script: `scripts/deliver-milestone.js`

### Input Sources

| Source | Path | Purpose |
|---|---|---|
| Milestone manifest | `.opencode/agents/state/manifests/<slug>.json` | Changed files, commits, base/head SHA, accepted tasks |
| Work closeout | `docs/07-progress/work-closeout.json` | Completion status, validation results, remaining work |
| Active build slice | `docs/07-progress/active-build-slice.md` | Current slice description, recently completed work |
| Current state | `docs/00-start-here/current-state.md` | What works, what is partial |
| Next agent brief | `docs/07-progress/next-agent-brief.md` | Completed items, current/next task |
| Sprint | `docs/07-progress/current-sprint.md` | Recently completed, approved next work |

### CLI Interface

```bash
# Phase 1: Dry run — generate delivery summary, no git operations
node scripts/deliver-milestone.js --slug <milestone-slug> --dry-run

# Phase 2: Execute — create branch, stage, commit, push
node scripts/deliver-milestone.js --slug <milestone-slug> --execute

# Phase 3: Create draft PR
node scripts/deliver-milestone.js --slug <milestone-slug> --pr

# All three phases in sequence (interactive confirmation between phases)
node scripts/deliver-milestone.js --slug <milestone-slug> --all
```

### Phase 1: Dry-Run Generation (`--dry-run`)

Reads all input sources and prints a delivery summary to stdout. No git operations, no file modifications.

**Output format:**

```
=== Milestone Delivery Summary ===
Slug:           <slug>
Objective ID:   <objective_id>
Branch:         milestone/<slug>
Base:           main (or specified base)
Commits:        <N> commits since <baseSha>
Changed files:  <N> files

--- Files to Commit ---
M  companion/server.js
A  scripts/deliver-milestone.js
M  docs/00-start-here/current-state.md
M  docs/07-progress/current-sprint.md
M  docs/07-progress/next-agent-brief.md
...

--- PR Title ---
feat(<area>): complete <slug> milestone

--- PR Description (preview) ---
## Milestone: <slug>

<description from objective file>

### What Changed
<list from manifest changed_files + closeout completed[]>

### Validation
<results from closeout validation>

### Remaining
<items from closeout remaining[]>

### Checklist
- [ ] All milestone conditions met
- [ ] Tests pass (`npm run test:full`)
- [ ] Documentation updated
- [ ] No regressions in existing workflows
```

**Exit codes:**
- 0: Summary generated successfully
- 1: Missing required artifacts (manifest not found, closeout missing, etc.)

### Phase 2: Branch and Commit (`--execute`)

Creates a scoped branch and commits only the files that changed in this milestone.

**Branch naming:** `milestone/<slug>` — clean, descriptive, distinct from worker branches (`agents/worker/<slug>`) and sequencer base (`agents/sequencer/base`).

**Files staged:**
1. All files from manifest `changed_files[]` (the actual code/config changes)
2. Documentation updates triggered by completion:
   - `docs/00-start-here/current-state.md`
   - `docs/07-progress/current-sprint.md`
   - `docs/07-progress/next-agent-brief.md`
   - `docs/07-progress/active-build-slice.md`
   - `docs/07-progress/work-closeout.json`
   - `docs/07-progress/latest-build-result.json`
3. Any new files introduced by the milestone (detected from manifest)

**Files NOT staged:**
- `.opencode/agents/state/` (internal agent state, not PR material)
- `data/` (runtime artifacts, gitignored)
- `node_modules/`
- Any files in `.gitignore`

**Commit message format:**

```
feat(<area>): complete <slug> milestone

- <item 1 from closeout completed[]>
- <item 2 from closeout completed[]>
- ...

Validation: <summary from closeout validation>
```

Uses conventional commits format. The area is derived from the changed files (e.g., `relay`, `memory`, `benchmark`, `companion`).

**Git operations:**
1. Verify clean working tree (abort if dirty)
2. Checkout `main` (or specified base branch)
3. Pull latest from origin
4. Create branch `milestone/<slug>` from base
5. Stage listed files
6. Create commit
7. Push branch to origin

**Exit codes:**
- 0: Branch created and pushed
- 1: Working tree dirty (abort)
- 2: Branch already exists on remote (abort)
- 3: Push failed

### Phase 3: Draft PR Creation (`--pr`)

Creates a draft PR on GitHub using the `gh` CLI.

**PR properties:**
- **Title:** `feat(<area>): complete <slug> milestone`
- **Base:** `main`
- **Head:** `milestone/<slug>`
- **Draft:** `true` (operator must manually mark ready for review)
- **Labels:** `milestone`, `auto-generated`
- **Description:** Full structured description from dry-run output

**PR description template:**

```markdown
## Milestone: <slug>

<objective description from .md file>

### What Changed

<bulleted list from manifest changed_files grouped by area>

### Validation Results

| Suite | Result |
|---|---|
| <validation item> | <status> |
| ... | ... |

### Remaining Work

<items from closeout remaining[] — or "None" if complete>

### Acceptance Checklist

- [ ] All milestone conditions met
- [ ] CI passes (tests, lint, typecheck)
- [ ] Documentation reflects current state
- [ ] No regressions in existing workflows
- [ ] Operator review complete
```

**PR creation:**
```bash
gh pr create --draft --title "..." --body "..." --base main --head "milestone/<slug>"
```

**Exit codes:**
- 0: PR created, URL printed
- 1: `gh` CLI not available or not authenticated
- 2: PR already exists for this branch
- 3: Push or PR creation failed

### `--all` Mode

Runs all three phases in sequence with interactive confirmation between phases:

```
=== Phase 1: Dry Run ===
<summary printed>
Proceed to branch/commit? [y/N]:

=== Phase 2: Branch & Commit ===
<branch created, files committed, pushed>
Proceed to PR creation? [y/N]:

=== Phase 3: Draft PR ===
<PR created>
Done. PR URL: https://github.com/...
```

## File Updates Required on Completion

The script updates these documentation files as part of the commit:

| File | Update |
|---|---|
| `docs/07-progress/current-sprint.md` | Move milestone from "Approved Next Work" to "Recently Completed" |
| `docs/07-progress/next-agent-brief.md` | Add completed milestone to "Completed" section, update "Current Task" |
| `docs/07-progress/active-build-slice.md` | Update "Most Recently Completed Slice" |
| `docs/00-start-here/current-state.md` | Add new capabilities to "What Works", update "What Is Partial" if changed |
| `docs/07-progress/work-closeout.json` | Already written by sequencer — no update needed |

## CI Integration

The existing `.github/workflows/ci.yml` already runs on pull requests to `main`/`master`. No new CI workflow is needed for v1.

**CI steps that validate the PR:**
1. `npm run test:full` — full offline validation suite
2. Companion server smoke test
3. Production jobs API contract
4. M4 relay end-to-end

**Optional future enhancement (not in v1):** A milestone-specific CI job that verifies the PR description matches the manifest, all manifest files are included in the diff, and documentation files are updated.

## Acceptance Conditions

This milestone is complete when ALL of the following are true:

### Script Implementation

1. `scripts/deliver-milestone.js` exists and is documented in `package.json` scripts
2. `--dry-run` reads manifest, closeout, and build slice; prints structured summary; exits 0
3. `--dry-run` exits 1 with clear error when required artifacts are missing
4. `--execute` verifies clean working tree before proceeding
5. `--execute` creates branch `milestone/<slug>` from the specified base
6. `--execute` stages only manifest `changed_files[]` + documentation updates
7. `--execute` creates a conventional-commit message referencing the milestone
8. `--execute` pushes the branch to origin
9. `--execute` exits 2 if branch already exists on remote
10. `--pr` creates a draft PR via `gh` CLI with structured description
11. `--pr` exits 2 if a PR already exists for the branch
12. `--all` runs all three phases with interactive confirmation between phases

### Documentation

13. Decision recorded in `docs/06-decisions/decision-log.md`
14. Proposed milestone added to `docs/07-progress/current-sprint.md`
15. `npm run deliver-milestone` (or equivalent) added to `package.json`

### Validation

16. Dry-run produces correct output for a test slug (mock manifest + closeout)
17. Branch creation and commit work on a test branch (not `main`)
18. Draft PR creation verified against GitHub (or mocked `gh` CLI)
19. No existing test suites broken by the new script

### Not in Scope (v1)

- Automatic merge after CI passes
- Automatic release or tag creation
- Automatic changelog generation
- Release notes from PR descriptions
- GitHub Actions trigger based on milestone completion
- Multi-repo delivery (e.g., push to a separate release repo)
- Rollback or revert automation

## Dependencies

- `gh` CLI must be installed and authenticated (`gh auth status`)
- Git remote must be configured (`git remote -v`)
- Node.js 18+ (for `fs/promises`, `child_process`)

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Operator runs script on wrong branch | Script verifies current branch is `main` (or base) before creating milestone branch |
| Manifest is stale (more commits since manifest was built) | Script warns if HEAD differs from manifest `headSha`; operator can re-run manifest build |
| `gh` CLI not installed | Clear error message with install instructions |
| Branch already exists from prior delivery attempt | Exit 2 with option to force-recreate (`--force` flag, not default) |
| Documentation files are out of date | Script always re-reads current file contents before updating; does not template from stale state |
