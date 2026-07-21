# Locaily Objective Lifecycle and Work-Closeout Hardening

You are working in the Locaily repository.

Your task is to inspect and harden the objective lifecycle, queue archival process, agent closeout process, and startup continuity behavior.

Do not begin by editing files. First inspect the repository and verify the current implementation against this brief.

## Why This Work Exists

Locaily currently uses objective files and directory placement to represent lifecycle states such as:

* queued
* active
* completed
* failed
* held

Some runtime state is intentionally ignored by Git, while completed history is intended to remain tracked.

Recent inspection found signs that these states can drift apart:

* completed objectives may remain in the executable queue;
* ignored planning files may remain after their implementation is complete;
* an active objective can become stale;
* multiple versions of the same objective can exist without an explicit relationship;
* objective numbers can collide;
* archived objective files may have inconsistent encoding or corrupted text;
* a fresh clone may not reconstruct the real lifecycle of previous work.

The deeper problem is not merely stale files.

The repository currently lacks a single canonical and reconstructable objective lifecycle with enforced transition rules.

## Confirmed Design Intent

Before implementation, inspect at minimum:

* `.gitignore`
* `.opencode/agents/objectives/queue/BULK_MILESTONE_GUIDE.md`
* `.opencode/agents/objectives/queue/`
* `.opencode/agents/objectives/queue/completed/`
* `.opencode/agents/supervisor/SYSTEM.md`
* `.opencode/agents/supervisor/POLICY.md`
* `AGENT.md`
* `AGENTS.md`
* `docs/07-progress/active-build-slice.md`
* `docs/07-progress/next-agent-brief.md`
* `docs/08-agents/build-slice-protocol.md`
* controller, sequencer, supervisor, and archival scripts
* relevant tests and schemas

The intended lifecycle appears to be:

```text
queue
→ active objective
→ completed, failed, or held
```

Completed history should remain inspectable.

Runtime churn may remain local, but important project state must not exist only in ignored files or an agent completion message.

## Known Findings to Verify

Treat these as investigation leads, not unquestionable facts.

Verify each one against the repository, Git history, local worktree where available, and controller code.

### Queue and archive findings

* M7 and M8 may exist both in the queue root and `completed/`.
* Their archival may not have removed the original tracked queue files.
* M9 and M10 may still be queued and unactioned.
* Completed M7 and M8 may contain UTF-8 BOM or mojibake rather than clean UTF-8.
* The precise mechanism that produced the duplicate files has not yet been proven.

Do not claim that the sequencer caused the duplicates until its code or history demonstrates that.

### Ignored runtime findings

The local worktree may contain ignored files such as:

* stale `active-objective.md`
* DM2–DM9 planning files
* failed objective versions
* held objective versions
* multiple versions of Track Learning Evidence Loop

GitHub alone cannot verify ignored local files. Clearly distinguish repository facts from local-worktree findings.

### Possible lifecycle anomalies

* one objective represented in multiple lifecycle directories;
* completed objectives remaining executable;
* stale active objectives;
* numbering collisions;
* no canonical relationship between superseded objective versions;
* ignored records accumulating without cleanup;
* lifecycle state that cannot be reconstructed from a fresh clone.

## Required Outcome

Create a reliable, machine-readable objective and work-session lifecycle that prevents silent abandonment, duplicate lifecycle states, and accidental stacking of new work over unresolved work.

The solution must include both:

1. objective lifecycle hardening;
2. mandatory end-of-work closeout and startup continuity enforcement.

# Part 1 — Objective Lifecycle Hardening

## Stable Identity

Every objective must have a stable identity independent of its filename or directory.

Define appropriate metadata, such as:

```yaml
objective_id: m07
slug: durable-background-execution
status: completed
revision: 3
supersedes: null
source_objective: .opencode/agents/objectives/queue/07-durable-background-execution.md
activated_at: null
completed_at: null
completion_commit: null
```

Choose JSON, YAML front matter, or another format consistent with the repository.

Do not invent a parallel state system when an existing schema can be extended cleanly.

## Explicit Lifecycle States

Define the supported states and legal transitions.

At minimum, consider:

```text
planned
queued
active
blocked
held
failed
completed
abandoned
superseded
```

The implementation must define:

* which states are terminal;
* which transitions require human approval;
* whether an objective can return from held or failed;
* how supersession works;
* how retries relate to the same objective identity;
* how objective revisions are tracked.

## Canonical-State Rule

At any moment, one objective ID must have exactly one canonical lifecycle state.

Historical records may exist, but they must be explicitly marked as history, revision, attempt, or superseded material.

Do not allow directory placement alone to determine truth.

## Transactional Archive Behavior

A successful completion should behave conceptually as:

```text
validate completion
→ write completion record
→ move or archive the objective
→ remove the executable source
→ normalize text encoding
→ verify exactly one canonical state
→ record branch, commit, tests, and evidence
```

Avoid copy-and-forget archival.

Use atomic or rollback-safe behavior where practical.

## Repository Integrity Check

Add a script and test coverage that detects at least:

* duplicate objective IDs across lifecycle states;
* completed objectives still present in the executable queue;
* conflicting numeric prefixes;
* empty required sections;
* stale active-objective references;
* active work that points to failed, held, abandoned, or superseded work without an explicit transition;
* unsupported text encoding;
* UTF-8 BOM when repository policy disallows it;
* likely mojibake;
* missing completion metadata;
* broken supersession chains;
* ignored objective records without a lifecycle disposition, when they are visible to the check.

The integrity check should fail loudly and explain how to repair each issue.

# Part 2 — Mandatory End-of-Work Closeout

Every implementation session must produce a closeout record.

This applies when the work is:

* complete;
* incomplete;
* blocked;
* interrupted;
* failed;
* awaiting human action;
* awaiting external validation;
* stopped because of step, time, cost, or provider limits.

## Canonical Closeout Record

Prefer a tracked canonical file so the state survives clones.

Recommended location:

```text
docs/07-progress/work-closeout.json
```

Historical closeouts may be stored under:

```text
docs/07-progress/closeouts/
```

Use existing repository conventions where they provide a better location.

A closeout record should contain at minimum:

```json
{
  "work_id": "track-learning-evidence-loop",
  "objective_id": "m11",
  "status": "incomplete",
  "closed_at": "ISO-8601",
  "original_goal": "Implement the Track Learning Evidence Loop.",
  "completed": [],
  "remaining": [],
  "next_required_action": "",
  "blockers": [],
  "safe_to_start_unrelated_work": false,
  "working_branch": "",
  "last_commit": "",
  "validation": {
    "passed": [],
    "failed": [],
    "not_run": []
  },
  "recommended_next_agent": "worker"
}
```

Adapt field names to existing schemas where appropriate.

## Required Closeout Meaning

The record must answer:

* What was the agent trying to accomplish?
* What was completed?
* What remains?
* What changed?
* What branch and commit contain the work?
* What tests passed?
* What tests failed?
* What validation was not run?
* What blockers exist?
* What should happen next?
* May unrelated work safely begin?

The critical field is equivalent to:

```text
safe_to_start_unrelated_work: false
```

This must be based on explicit criteria, not agent mood.

## Completed Work

When work is genuinely complete:

* all required completion conditions are satisfied;
* required validation has run;
* documentation is updated;
* objective state is archived correctly;
* closeout status is complete;
* unrelated work may begin.

Do not mark work complete merely because implementation stopped.

# Part 3 — Startup Continuity Gate

Before any coding agent begins new implementation work, it must inspect the latest closeout and unresolved objective state.

The gate should ask:

```text
Is unfinished work recorded?
Is that work still actionable?
Has it been completed, held, abandoned, superseded, or explicitly overridden?
```

## Required Behavior

If unresolved work exists and unrelated work is not safe, the agent must not silently begin the new objective.

It must report:

* the unfinished work;
* what remains;
* current branch and commit;
* blocker state;
* validation state;
* recommended next action.

Then require one explicit disposition:

### Continue

Resume the previous work.

### Hold

Place the previous work into a documented held state with a reason and re-entry condition.

### Abandon

Close it intentionally with a reason and preserved history.

### Supersede

Replace it with a new objective while linking the old and new objective records.

### Override

Begin unrelated work only after an explicit human decision. Preserve the unresolved obligation and record the override reason.

A new prompt alone is not an override.

Do not clear unresolved work simply because the user requested something new.

## Human-Friendly Agent Response

The startup behavior should produce a message similar to:

```text
There is unresolved work from the previous session:

Track Learning Evidence Loop

Remaining:
- Connect records to workflow execution.
- Update current-state documentation.
- Run the full regression suite.

Current branch:
agents/worker/track-learning-loop

Last validated:
14 focused tests passed.
The full suite was not run.

Recommended action:
Finish workflow integration before beginning unrelated work.

Choose one:
continue, hold, abandon, supersede, or explicitly override.
```

The exact interface can vary, but the behavior must be enforced.

# Part 4 — Agent Instructions

Update the appropriate agent instruction files so all coding agents follow the lifecycle.

At minimum, update whichever files are canonical among:

* `AGENT.md`
* `AGENTS.md`
* supervisor system instructions;
* supervisor policy;
* worker instructions;
* sequencer instructions;
* build-slice protocol;
* next-agent handoff rules.

Avoid duplicating large blocks of policy across many files.

Prefer one canonical policy document referenced by agent entry points.

## Required Policy Language

The policy must embody these principles:

> Never silently abandon unfinished work.

> A new prompt does not erase the previous closeout.

> Before unrelated work begins, unresolved work must be continued, held, abandoned, superseded, or explicitly overridden.

> Every work session closes with a durable record, even when the work did not complete.

# Part 5 — Cleanup and Migration

After implementing the lifecycle system, inspect current objective state and prepare a safe cleanup.

Do not delete historical material without reviewing it.

For each anomaly:

* identify the canonical objective;
* preserve useful history;
* normalize encoding;
* remove executable duplicates;
* link superseded versions;
* assign unique IDs;
* place unresolved work into the correct state;
* record why each transition occurred.

Pay special attention to:

* duplicate M7 and M8 queue/completed files;
* M9 physical multi-device pilot;
* Locaily v1 packaging objectives;
* Track Learning Evidence Loop versions;
* DM2–DM10 objective history;
* stale active-objective state;
* numeric prefix collisions.

Do not assume that unfinished work should always be resumed. Some work may need to be held, abandoned, or superseded.

# Part 6 — Tests

Add tests for at least:

* successful objective completion;
* archive removes executable source;
* duplicate objective detection;
* conflicting sequence number detection;
* interrupted work closeout;
* blocked work closeout;
* failed work closeout;
* completed work closeout;
* startup with no unresolved work;
* startup with unresolved work;
* explicit hold;
* explicit abandon;
* explicit supersession;
* explicit override;
* new prompt without override;
* stale active objective;
* malformed closeout;
* missing closeout;
* branch and commit metadata;
* partial validation;
* clean UTF-8 normalization;
* restart/resume behavior where applicable.

Tests must prove behavior, not merely assert that files exist.

# Part 7 — Documentation

Update:

* current state;
* next-agent brief;
* build status;
* active build slice if required;
* decision log;
* queue guide;
* agent instructions;
* objective lifecycle documentation;
* operator documentation;
* schema documentation.

Include a small operator-facing explanation written for the project owner:

```text
Locaily will now warn you when previous work remains unresolved.

Before beginning unrelated work, the agent will ask whether to continue, hold,
abandon, supersede, or explicitly override the previous work.

This prevents incomplete work from disappearing when a new idea or prompt is
introduced.
```

# Constraints

* Preserve Locaily’s local-first direction.
* Do not add a mandatory cloud dependency.
* Do not create a second orchestration engine.
* Reuse existing schemas, manifests, controller state, and agent conventions where practical.
* Keep the system understandable.
* Prefer deterministic validation over model judgment.
* Do not rely on ignored files as the only durable source of important state.
* Do not claim a root cause without evidence.
* Do not delete historical records merely to make checks pass.
* Do not start unrelated product development during this objective.
* Do not push or merge unless explicitly authorized.

# Execution Process

1. Inspect the current repository.
2. Produce a concise findings report distinguishing:

   * confirmed repository facts;
   * local-worktree facts;
   * inferred mechanisms;
   * unresolved questions.
3. Identify the smallest coherent architecture change.
4. Implement lifecycle identity and invariants.
5. Implement mandatory closeout.
6. Implement startup continuity gate.
7. Add migration and cleanup tooling.
8. Add tests.
9. Run relevant focused and regression tests.
10. Update documentation and durable handoff state.
11. Produce a final closeout record for this work.

# Final Response Requirements

Your final response must include:

* files changed;
* architecture decisions;
* anomalies confirmed;
* anomalies disproven;
* cleanup performed;
* cleanup deferred;
* test commands actually run;
* passed and failed test counts;
* remaining risks;
* unresolved human decisions;
* branch and commit state;
* exact next action;
* the generated work-closeout record.

Do not report the objective complete unless the lifecycle checks, closeout behavior, startup gate, tests, and documentation are all complete.
