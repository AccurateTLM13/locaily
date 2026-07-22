# Locaily Development Agent Protocol

Every coding agent (OpenCode, Cursor, Claude, Codex, Antigravity, or any future agent) must read and obey this file before changing files in this repository.

Vendor-specific instruction files (`.cursor/rules/`, `CLAUDE.md`, `.codex/instructions.md`) must only say: "Read and obey `/AGENTS.md`. Run `npm run dev:status` before working."

This file is the single source of truth for agent behavior. Do not duplicate it.

## Before Changing Files

1. Run `npm run dev:status` to see current project state.
2. Read `development/project-state.json` for the canonical pointer.
3. If a milestone is active, read its manifest in `development/milestones/active/`.
4. Do not begin unscoped work.
5. Do not create a second active milestone without explicit approval.
6. Work only within the approved scope of the current milestone.

## Development Lifecycle Commands

```bash
npm run dev:status              # Current project state (human-readable)
npm run dev:status -- --json    # Machine-readable JSON output
npm run dev:status -- --strict  # Exit 1 for warnings (CI mode)
npm run dev:milestone:start     # Start an approved milestone
npm run dev:checkpoint          # Record progress
npm run dev:session:close       # Close implementation session
npm run dev:prepare             # Stage, commit, record prepared SHA
npm run dev:validate            # Run validation profile
npm run dev:milestone:complete  # Gate check before delivery
npm run dev:pause               # Safely pause work
npm run dev:block               # Record a blocker
npm run dev:resume              # Resume paused work
```

## Before Stopping Work

1. Update `docs/07-progress/work-closeout.json` with what was done, what remains, validation results, and whether it is safe to start unrelated work.
2. If possible, run a checkpoint record (Phase 2 will formalize this).
3. Record durable architecture decisions in `docs/06-decisions/decision-log.md`.

**Never silently abandon unfinished work.** A new prompt does not erase the previous closeout.

## Lifecycle States

Every objective has a stable identity (`objective_id`) and exactly one canonical lifecycle state:

```
planned → queued → active → completed
                  ↘ blocked → active
                  ↘ held → active
                  ↘ failed → queued (retry) or abandoned
                  ↘ abandoned (terminal)
                  ↘ superseded (terminal)
```

The lifecycle manager is at `scripts/objective-lifecycle.js`. Terminal states: `completed`, `failed`, `abandoned`.

## Source of Truth Hierarchy

```
1. Machine-readable development state (development/*.json)
2. Running code and test results
3. Generated summaries and dashboards
4. Human-readable documentation
5. Agent-specific instructions (this file)
```

**JSON is authoritative. Markdown is generated or explanatory. HTML is generated.**

Do not manually edit generated files. Regenerate them from canonical sources.

## What This Repository Is

**Locaily** — a reusable local-first AI coordination stack.

```txt
Locaily = umbrella project
Local Brain = coordinator and runtime (companion/server.js)
Tracks = reusable execution contracts
The Crew = specialized workers and capabilities
Benchmark Lab = evaluation and qualification subsystem (benchmark-lab/)
Relay Nodes = nearby-device capability layer
Memory Bridge = controlled local context integration
Tool packs = plugin-style capabilities
```

## What You Must Not Do

- Do not modify completed evidence or qualification artifacts without an explicit task
- Do not broaden claims from narrow benchmark evidence
- Do not implement a follow-on milestone without an explicitly supplied objective
- Do not expose the Local Brain to the public network (keep localhost-only default)
- Do not treat relay nodes as control planes (they are execution targets only)
- Do not import `benchmark-lab/engine/` modules from the Local Brain companion
- Do not manually edit `development/generated/` files
- Do not mark work complete solely because tests pass
- Do not deliver work until milestone acceptance and validation gates pass
- Do not change architectural boundaries without a decision record in `docs/06-decisions/`

## Validation Before Reporting Success

Run the relevant subset of these commands. Do not claim all tests pass unless actually executed.

```bash
node scripts/test-development-schemas.js   # development schemas
node scripts/dev-status.js                 # project state check
node scripts/test-lifecycle.js             # lifecycle tests
node scripts/test-controller-invariants.js # controller tests
node scripts/contract-test.js              # contract helpers
node scripts/test-development-schemas.js   # schema validation
```

Use `npm.cmd` on Windows if the repository requires it.

## Documentation Map

| Need | Path |
|---|---|
| Start here | `docs/00-start-here/README.md` |
| Current state | `docs/00-start-here/current-state.md` |
| Project state (JSON) | `development/project-state.json` |
| Development schemas | `development/schemas/` |
| Development fixtures | `development/fixtures/` |
| Track system | `docs/02-track-system/README.md` |
| Progress / agent brief | `docs/07-progress/next-agent-brief.md` |
| Architecture | `docs/01-architecture/locaily-overview.md` |
| Validation evidence | `docs/04-validation/README.md` |
| Decisions | `docs/06-decisions/decision-log.md` |
| Agent rules | `docs/08-agents/agent-context.md` |

## Compatibility: Objective Lifecycle ↔ Development Control Plane

The existing 9-state objective lifecycle (`scripts/objective-lifecycle.js`) and the new development control plane (`development/`) coexist. They do not replace each other.

| Objective Lifecycle | Development Control Plane | Relationship |
|---|---|---|
| `objective_id` | milestone `id` | Same entity, different identifiers |
| `planned` | `idea` / `planned` | Mapping |
| `queued` | `ready` | Mapping |
| `active` | `active` | Same |
| `blocked` | `blocked` | Same |
| `held` | `paused` | Same concept |
| `completed` | `completed` / `merged` | Completion vs merge |
| `failed` | `cancelled` | Mapping |
| `abandoned` | `cancelled` | Mapping |
| `superseded` | (no equivalent) | Deprecated in new system |
| `work-closeout.json` | Session record | Closeout is single-overwrite; sessions are historical |
| `run-state.json` | Session status | Ephemeral vs durable |

**Rule:** The objective lifecycle remains the source of truth for `.opencode/agents/` state. The development control plane is the source of truth for `development/` state. When they disagree, fix the inconsistency rather than picking one side.

## Learned User Preferences

- When adding or changing validation, workflow, or memory features, also update the companion console (`companion/console/`) so the change can be tested from the local validation UI
- During plan-driven implementation, do not edit the attached plan file; implement against it as specified
- During multi-milestone roadmap execution, wait for explicit user approval before starting the next milestone
- Do not introduce new public product names or top-level architecture layers without explicit user approval
- Keep PRs draft until clean-server smoke tests pass before requesting merge to `main`
- Before running model benchmarks, verify model provenance matches the requested model slug

## Learned Workspace Facts

- Locaily is public/open-source; the user's Second Brain vault is private — do not merge the repos or copy private Second Brain content into Locaily
- Companion contract JSON schemas belong under `companion/schemas/`, not a root-level `schemas/` directory
- Console validation runs write artifacts under `data/validation/`
- The development control plane lives under `development/`, not under `.opencode/` or any vendor-specific directory
