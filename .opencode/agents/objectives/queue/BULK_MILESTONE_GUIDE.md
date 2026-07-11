# Locaily Bulk Milestone Queue Guide

## Drop Location

Place milestone files in:

```text
.opencode/agents/objectives/queue/
```

The sequencer processes Markdown files alphabetically. Use a zero-padded numeric prefix:

```text
06-trusted-relay-execution.md
07-durable-background-execution.md
08-operator-control-plane.md
09-physical-multi-device-pilot.md
10-locaily-v1-packaging.md
```

Do not place general notes or non-objective Markdown files in the queue unless the sequencer explicitly ignores them. Keep `TEMPLATE.md` outside the executable queue or update the sequencer to skip it.

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

1. Add one milestone first and run the sequencer.
2. Inspect the archived objective, branch, commits, test output, and supervisor review.
3. Fix controller or objective-format problems before loading the remaining files.
4. Load the remaining milestones in numeric order.
5. Require the sequencer to stop on failed or hand-back objectives unless explicitly configured otherwise.

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
