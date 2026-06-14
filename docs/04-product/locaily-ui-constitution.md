# LocAIly UI Constitution

This document is the source of truth for LocAIly interface work. Agents must treat it as a product contract, not inspiration.

LocAIly is a local-first workflow launcher and coordination layer. Its UI should feel like premium local command software: calm, sharp, operational, technical, serious, and builder-grade.

LocAIly is not a SaaS landing page, chatbot, generic admin dashboard, neon AI site, or developer junk drawer.

## Core UI Rule

Every screen must answer these questions in under five seconds:

1. What can I run?
2. Is the system ready?
3. What happened?
4. What should I do next?

Anything that does not answer one of those questions belongs in advanced disclosure or should not be on the screen.

## Approved Layouts

Agents may only use these layouts unless the user explicitly approves a new one.

### App Shell

Use for most screens.

```txt
Top Bar
Side Rail | Main Work Area
```

The App Shell owns the app background, top bar, side rail, and main content grid. It must not contain marketing heroes, floating decorative cards, unrelated metrics, or generic dashboard clutter.

### Workflow Runner

Use for running tasks.

```txt
Top Bar
Workflow Setup | Readiness / Requirements
Run Timeline
Result Summary | Artifacts / Next Actions
```

### Result Review

Use after a workflow completes.

```txt
Result Header
Markdown Preview | Validation / Evidence
Actions: Copy / Save / Send / Run Again
```

### Engine Room

Use only for advanced users.

```txt
Advanced System Controls
Settings Nav | Raw Providers / Tools / Logs
```

## Approved Navigation

Use only these top-level navigation items:

1. Run
2. Workflows
3. Activity
4. System
5. Engine Room

Do not use top-level navigation labels such as Dashboard, Console, Settings, Tests, Models, Providers, Logs, Admin, or Experiments. Those details belong inside Engine Room when needed.

## Approved Screen Set

The MVP screen set is:

1. Welcome / Setup Check
2. Run Dashboard
3. Lighthouse Handoff Workflow
4. Current Run
5. Result Review
6. Activity
7. System
8. Engine Room

Everything else waits unless explicitly approved.

## Brand Colors

Use logo colors as command colors, not decoration.

```css
--locaily-green: #3d9040;
--locaily-slate: #3c4455;
```

### Light Mode

```css
--bg: #f4f2ec;
--surface: #fbfaf6;
--surface-raised: #ffffff;
--border: #d8d5cc;
--text: #1f2630;
--muted: #727b88;
--muted-soft: #9aa2ad;
--success: #3d9040;
--warning: #b9822d;
--danger: #a84f4f;
```

### Dark Mode

```css
--bg: #0b0f14;
--surface: #111820;
--surface-raised: #151d27;
--border: #27313d;
--text: #eef2ea;
--muted: #aeb7c4;
--muted-soft: #6f7a88;
--success: #57b45b;
--warning: #c9953b;
--danger: #bd5c5c;
```

### Forbidden Color Use

- No bright blue primary actions.
- No random purple.
- No rainbow AI gradients.
- No glowing blobs.
- No status color unless tied to actual state.

## Typography

### App Font Stack

```css
font-family:
  "Aptos",
  "Inter",
  "IBM Plex Sans",
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

### Technical Font Stack

```css
font-family:
  "Cascadia Mono",
  "IBM Plex Mono",
  "SFMono-Regular",
  Consolas,
  monospace;
```

### Type Scale

```css
--text-xs: 11px;
--text-sm: 13px;
--text-md: 15px;
--text-lg: 18px;
--text-xl: 24px;
--text-2xl: 32px;
--text-3xl: 42px;
```

### Typography Rules

- Page titles are 32-42px, not billboard huge.
- Labels are small and controlled.
- Do not use bold everywhere.
- Use monospace only for run IDs, commands, endpoints, and short technical metadata.
- Do not use tiny low-contrast text for important states.

## Shape Rules

Use restrained corners.

```css
--radius-none: 0;
--radius-tight: 3px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
```

Most components use `6px`. Buttons use `3px` or `4px`. Large shell surfaces may use `8px`.

Avoid `24px+` rounded cards, soft SaaS bubbles, pill-shaped everything, and plush toy corners. Pills are allowed only for compact status badges.

## Component Laws

Agents may use these components only:

- AppShell
- TopBar
- StatusPill
- ReadinessChecklist
- WorkflowLauncher
- ModeSelector
- RunTimeline
- ResultSummary
- ArtifactList
- AdvancedDisclosure
- EmptyState
- ErrorState

If a new component is needed, explain why before creating it.

### TopBar

Must include:

- LocAIly logo/name
- Current screen name
- Local Brain status
- One primary utility action

Example:

```txt
LocAIly | Workflow Validation | Local Brain Online | Refresh
```

No giant empty hero, massive title block, or random blue button.

### StatusPill

Approved states:

- Online
- Offline
- Needs Check
- Running
- Failed
- Fallback Used

Treatment: small dot plus label. Not a giant card.

### ReadinessChecklist

Use compact rows only:

```txt
Local Brain      Ready
Ollama           Ready
Model            llama3.2
PageSpeed        Needs API key
Memory Bridge    Disabled
Audit Logging    Ready
```

Do not use equal-weight metric cards for readiness.

### WorkflowLauncher

Must include:

- Workflow name
- Short purpose
- Input
- Mode
- Primary action

Example:

```txt
Lighthouse Handoff
Turn PageSpeed data into an agent-ready handoff.

URL
[ https://example.com ]

Mode
[ Standard ] [ Local AI ] [ Local AI + Memory ]

[ Run Validation ]
```

### RunTimeline

Approved statuses:

- Pending
- Running
- Passed
- Warning
- Failed
- Skipped
- Fallback

Approved layout:

```txt
Passed   Preflight
Failed   PageSpeed Capture
Pending  Slim Input
Pending  Local Analysis
Pending  Compose Handoff
Pending  Schema Validation
Pending  Save Artifacts
```

No giant horizontal progress spaghetti. No huge cards per step.

### ResultSummary

Must answer:

- Status
- Blocking issue
- Next recommended action
- Artifacts saved
- Duration

This is where the user finds the next step.

### AdvancedDisclosure

Anything ugly goes here:

- raw IDs
- timestamps
- validation IDs
- audit events
- JSON
- files used
- generated Markdown preview
- raw error stack
- provider metadata

The primary UI stays clean.

## Data Visibility

Primary view may show:

- readiness
- workflow mode
- current step
- result status
- next action
- artifact count
- whether PageSpeed and Memory are configured

Primary view must not show:

- raw validation IDs
- long timestamps
- raw JSON
- stack traces
- full generated Markdown
- audit samples
- file dumps
- PageSpeed API keys
- raw local memory vault paths

Those belong in AdvancedDisclosure.

## Local Configuration Inputs

LocAIly must provide a local-only way to configure the inputs needed for validation workflows:

- PageSpeed Insights API key
- Memory validation vault path (`MEMORY_VALIDATION_VAULT_PATH` or the equivalent Local Brain memory vault path)

Rules:

- These inputs are setup controls, not dashboard metrics.
- The PageSpeed key must never be echoed back after save; show only configured/not configured.
- The memory vault path may be entered in a local setup or Engine Room flow, but the primary UI must show only configured/not configured and safe relative `filesUsed`.
- Do not commit machine-specific paths or keys.
- If either value is missing, the Workflow Validation screen must show a clear next step.

## State Language

Write for normal builders.

Bad:

```txt
Quota exceeded for quota metric 'Queries'
```

Good:

```txt
PageSpeed could not run because the API quota/key is not ready.
```

Bad:

```txt
Provider unavailable
```

Good:

```txt
Local AI is not running. Standard workflows still work.
```

Bad:

```txt
Memory Bridge disabled
```

Good:

```txt
Memory is off for this run.
```

Bad:

```txt
Schema validation pending
```

Good:

```txt
Output has not been checked yet.
```

## Forbidden Patterns

Forbidden:

- generic dashboard grid
- giant status cards
- bright blue primary actions
- rounded everything
- equal visual weight for all data
- full-width dense debug panels
- raw IDs in primary view
- tiny unreadable metadata
- hero sections inside app screens
- default radio buttons
- default browser inputs
- status cards with four words and no hierarchy
- Markdown preview taking over before a run succeeds
- every section wrapped in a heavy card
- random layout invention
- top-level junk-drawer navigation

## Implementation Contract

You are building a premium local application interface for LocAIly.

You are not designing from scratch. You are implementing the LocAIly UI system.

The app should feel:

- calm
- sharp
- operational
- technical
- premium
- local-first
- builder-grade

Reference feel:

- Linear
- Raycast
- GitHub Desktop
- Vercel system pages
- Tailscale admin
- premium security validation tools

## Screen Acceptance Checklist

A screen fails if:

- it looks like a generic admin dashboard
- it uses blue primary buttons
- it shows more than one primary action
- it exposes raw debug data in the primary view
- it uses giant status cards for compact readiness
- it has no clear next step
- every section has equal visual weight
- the user cannot tell whether they can run the workflow
- it invents new top-level navigation
- it hides blocking state behind advanced details

## Agent Role Boundaries

Split UI work into narrow lanes:

- Designer Agent: layout, component hierarchy, interaction notes, state logic. No code.
- UI Builder Agent: implement approved component system. No layout invention.
- QA Agent: run this constitution as a checklist. Fail violations.
- Copy Agent: state messages and next-step text. No layout.
- User: creative director and final taste gate.
