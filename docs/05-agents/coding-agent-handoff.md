# Coding Agent Handoff

Mission and delivery rules for agents implementing Locaily / Local Brain.

Consolidated from archived agent brief and `AGENTS.md`. **Code wins** if this doc drifts.

## Mission

Build and maintain the **local-first coordinator** that lets clients run structured tools and workflows through a stable HTTP API.

## First Priorities

1. Keep `/tasks/run` and core modules stable
2. Preserve legacy `/analyze` compatibility
3. Harden Lighthouse Handoff as the first workflow test bench
4. Extend tool packs without bloating core

## Non-Negotiables

1. Do not build a chatbot first
2. Do not build a visual workflow builder in core
3. Do not hardcode one model provider in tools
4. Do not make showcase apps part of immovable core APIs
5. Do not skip result envelopes
6. Do not skip audit logging for runs
7. Do not let tools bypass permission checks
8. Do not hardcode raw model names when a model role works
9. Do not introduce heavy models by default

## Suggested Implementation Order

When adding features:

```txt
contracts → registry → provider adapter → one tool → tests → docs
```

## Key Paths

```txt
companion/server.js
companion/core/
companion/providers/
companion/tools/registry.js
tool-packs/
scripts/smoke-test.js
scripts/contract-test.js
```

## Testing Before PR

```bash
node scripts/smoke-test.js
node scripts/contract-test.js
```

## API Preference

- New clients: `POST /tasks/run`
- Legacy: `POST /analyze`

## When Unsure

- Check [../06-decisions/open-questions.md](../06-decisions/open-questions.md)
- Log decisions in [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
- Archive obsolete plans instead of deleting

## Archived Full Brief

`docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/14-agentic-coding-agent-brief.md`
