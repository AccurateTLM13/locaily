# Screen Contract: Workflow Validation

This contract governs the LocAIly Workflow Validation screen. It implements the laws in [LocAIly UI Constitution](../locaily-ui-constitution.md).

## Screen Goal

Let the user run a Lighthouse Handoff validation and understand whether LocAIly is ready, running, passed, failed, or needs setup.

## User Questions

The user must understand:

1. Can I run validation?
2. Which workflow am I testing?
3. Which mode am I using?
4. What is blocking the run?
5. What should I do next?

## Required Layout

Use AppShell.

```txt
TopBar
WorkflowLauncher | ReadinessChecklist
RunTimeline      | ResultSummary
AdvancedDisclosure
```

No marketing hero. No generic dashboard grid. No giant status cards.

## TopBar

Required content:

```txt
LocAIly | Workflow Validation | Local Brain status | Refresh
```

Rules:

- Current screen name is `Workflow Validation`.
- Local Brain state uses StatusPill.
- Refresh is the single utility action.
- Do not place raw provider/model metadata in the top bar.

## WorkflowLauncher

Title:

```txt
Lighthouse Handoff
```

Subtitle:

```txt
Turn PageSpeed data into an agent-ready handoff.
```

Fields:

- URL input
- Mode selector:
  - Standard
  - Local AI
  - Local AI + Memory
- Local setup actions:
  - Add PageSpeed API key
  - Add Memory vault path

Primary action:

```txt
Run Validation
```

Secondary action:

```txt
Use pasted report
```

Rules:

- The primary action uses LocAIly green, not blue.
- Do not use default browser radio buttons. Use the approved ModeSelector treatment.
- The user should understand that Standard still works when Local AI is offline.
- PageSpeed key entry is local-only and must not echo the saved key back to the UI.
- Memory path entry is local-only. After save, show configured/not configured in primary UI; keep raw paths in advanced/setup flows only.

## ReadinessChecklist

Compact rows only:

```txt
Local Brain
Ollama
Model
PageSpeed
Memory
Audit Logging
```

Each row must show:

- system label
- human state
- short next-step copy when blocked or warning

Examples:

```txt
Local Brain      Ready
Ollama           Ready
Model            llama3.2 ready
PageSpeed        Needs API key
Memory           Off for this run
Audit Logging    Ready
```

Do not show raw vault paths, API keys, or audit file paths.

When PageSpeed is not configured, the next step should be:

```txt
Add a PageSpeed API key or use a pasted report.
```

When Memory is not configured for `Local AI + Memory`, the next step should be:

```txt
Add the Memory vault path for this machine.
```

The setup flow must support entering the local memory validation vault path (`MEMORY_VALIDATION_VAULT_PATH` or the equivalent Local Brain memory vault path) without committing or displaying machine-specific paths in the primary UI.

## RunTimeline

Steps:

1. Preflight
2. PageSpeed Capture
3. Slim Input
4. Local Analysis
5. Compose Handoff
6. Schema Validation
7. Save Artifacts

Approved statuses:

- Pending
- Running
- Passed
- Warning
- Failed
- Skipped
- Fallback

Rules:

- Timeline rows are compact.
- Current running step should be visually clear.
- Failed step must include plain-language cause and next action.
- Do not use huge cards per step.
- Do not use a giant horizontal progress graphic.

## ResultSummary

Must answer:

- Status
- Blocking issue
- Next step
- Artifacts
- Duration

The summary owns the user’s next action.

Examples:

```txt
Status: Failed
Blocking issue: PageSpeed could not run because the API quota/key is not ready.
Next step: Add PAGESPEED_API_KEY or use a pasted report.
Artifacts: 1 local record saved
Duration: 312 ms
```

```txt
Status: Passed
Blocking issue: None
Next step: Review the handoff and saved artifacts.
Artifacts: 5 local artifacts saved
Duration: 18.4 s
```

## AdvancedDisclosure

Advanced only:

- validation ID
- timestamps
- audit event sample
- raw Markdown
- files used
- full error message
- generated JSON
- run history
- provider metadata
- artifact paths
- local setup/configuration controls

Rules:

- AdvancedDisclosure is collapsed by default unless a run has completed and the user opens it.
- Primary UI may show artifact count; full paths belong here.
- `filesUsed` may be shown as vault-relative paths only.
- Never show raw vault paths or API keys.
- If setup controls are included here, saved secrets and paths must be masked after entry.

## State Copy

Use human-readable state copy.

Use:

```txt
Local AI is not running. Standard workflows still work.
```

Not:

```txt
Provider unavailable
```

Use:

```txt
PageSpeed could not run because the API quota/key is not ready.
```

Not:

```txt
Quota exceeded for quota metric Queries
```

Use:

```txt
Memory is off for this run.
```

Not:

```txt
Memory Bridge disabled
```

Use:

```txt
Output has not been checked yet.
```

Not:

```txt
Schema validation pending
```

## Visual Requirements

- Use LocAIly green and slate.
- No blue primary button.
- No giant cards.
- No hero area.
- No huge blank header.
- No raw debug-first layout.
- No default radio buttons.
- No all-caps everywhere.
- No equal visual weight for every data point.
- Use restrained radii from the constitution.

## Interaction Requirements

Before run:

- User sees whether validation can run.
- Blocking setup issues are visible.
- Standard mode remains available when Local AI or Memory is not ready.

During run:

- Timeline updates current step.
- ResultSummary shows `Running` and the current action.
- Primary action is disabled or converted to a clear running state.

After failure:

- ResultSummary shows the blocking issue and one next step.
- Full error text is hidden in AdvancedDisclosure.
- Missing PageSpeed key and missing Memory vault path failures must point to the local setup action.

After success:

- ResultSummary shows pass state, duration, artifact count, and next step.
- Markdown preview and artifact paths are available through AdvancedDisclosure.

## Acceptance Criteria

This screen passes only if:

- the user can tell what to run
- the user can tell if the system is ready
- the user can identify the current or failed step
- the user gets a clear next step
- advanced details are not in the primary view
- visual treatment follows the LocAIly UI Constitution

This screen fails if:

- it looks like a generic admin dashboard
- it opens with a marketing hero
- it uses giant status cards
- it uses bright blue as the primary action
- it exposes raw IDs/timestamps/logs in the primary view
- every section has equal weight
- the user cannot tell whether the workflow can run
