# Locaily Bulk Milestone Queue Guide

## Canonical Queue

Milestones are canonical only under:

```text
development/milestones/*.json
```

Set a reviewed milestone to `ready`, with completed dependencies and no
blockers, then inspect or run it with:

```powershell
npm.cmd run dev:loop -- --dry-run
npm.cmd run dev:loop
```

This directory is a legacy compatibility/archive surface. Markdown files here
are not consumed by `dev:loop` and must not be used to represent current
milestone state.

## Recommended Size

Target **25–55 lines per milestone**.

A good objective should contain:

- One paragraph explaining the outcome and why it matters.
- 8–16 verifiable completion conditions.
- 4–8 explicit out-of-scope boundaries.
- 3–6 stop/hand-back conditions.

The supervisor should decide implementation tasks. The milestone file should define the result and guardrails, not prescribe every file edit.

## Required Information

Each milestone should answer:

1. What capability exists when this is complete?
2. What evidence proves completion?
3. Which existing behavior must remain compatible?
4. Which tests must pass?
5. Which documents must be updated?
6. What is explicitly excluded?
7. What decisions require a human?

## Writing Rules

- Use observable conditions: “API rejects invalid credentials,” not “security is improved.”
- Name existing contracts that must not break.
- Require tests for success, failure, fallback, and restart paths when relevant.
- Keep implementation choices open unless architecture has already decided them.
- Do not bundle unrelated product expansion into the milestone.
- Do not use “complete,” “secure,” “reliable,” or “production-ready” without defining the evidence.
- Preserve Locaily’s separation between tracks, models, tools, nodes, evidence, and policy.

## Suggested Queue Process

1. Add or review one JSON milestone under `development/milestones/`.
2. Mark it `ready` only after approval, dependencies, and blockers are resolved.
3. Run `npm.cmd run dev:loop -- --dry-run` and verify the selected ID.
4. Run `npm.cmd run dev:loop`.
5. Inspect the preserved branch, session, closeout, validation, and supervisor review.
6. Resolve the completion approval or stop condition before running later work.

## Recommended Controller Safeguards

Before unattended bulk execution, confirm the controller:

- Skips `TEMPLATE.md`.
- Refuses an empty completion-conditions section.
- Creates or switches to a dedicated branch per milestone.
- Returns to the original branch after each objective.
- Does not overwrite an existing active objective without archiving it.
- Records stdout/stderr and final test results.
- Has maximum iteration, runtime, and retry limits.
- Stops on human hand-back conditions.
- Leaves failed work inspectable rather than deleting it.
- Never pushes or merges unless explicitly configured and approved.
