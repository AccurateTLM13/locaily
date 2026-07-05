# UX Principles

Product UX guidance for Locaily and future Desktop Companion. UI is mostly **not built**; these are target principles.

For high-level UI rules (layout, navigation, components, colors, typography), see [locaily-ui-constitution.md](./locaily-ui-constitution.md). This document covers practical application guidance.

## Core Principle

**Anyone with a brain should be able to start and run this tool easily.**

(from The Crew research notes — aspirational, not fully achieved)

## Local Brain / Server UX (Today)

Terminal-first setup is acceptable for developers. Startup output should answer:

- Is the server running?
- What URL and port?
- Is the provider available?
- Is the model ready?
- How many tools are registered?
- How do I run the smoke test?

Implemented in server startup logging and `GET /health`.

## Desktop Companion (Planned)

The Desktop Companion is a **control panel**, not a chatbot.

First job: make the engine visible.

Cards (from desktop companion decision):

- Engine status
- Active provider
- Model roles
- Installed tools
- Recent runs (audit)
- Attention needed (failures, missing model, etc.)

V1 screens: Dashboard, Tools, Models, Logs, Settings.

Defer client/app management until identity and approval flows mature.

## Workflow Client UX (e.g. Lighthouse)

- Show what ran: deterministic vs orchestrated vs baseline
- Show when local AI is unavailable and what fallback was used
- Do not imply cloud-grade analysis from demo paths
- Prefer structured handoff output over raw model prose
- Show whether a result is validated
- Show whether Memory Bridge or qualification data was used

## Making State Visible

- The UI should reveal what is running, and distinguish deterministic from model-backed behavior
- Users should see whether a result is validated
- Failure states should be actionable (include a clear next step)
- Technical detail (run IDs, JSON, audit events) should be available without overwhelming normal users — use progressive disclosure
- The interface should not pretend future capabilities exist
- Local/private behavior should be visible
- Operators should understand whether Memory Bridge or qualification data was used
- Relay Nodes should not appear as active — they are not implemented

## Failure States

Failures must be readable:

- `MODEL_NOT_READY` → clear next step (start Ollama, pull model)
- `COMPANION_NOT_RUNNING` → how to start server
- Schema validation errors → which step failed in orchestrated mode (target)

## Non-Goals

- Full chat interface as v1
- Model marketplace browsing
- Exposing server beyond localhost by default

## Related

- [locaily-ui-constitution.md](./locaily-ui-constitution.md)
- [desktop-companion-decision.md](./desktop-companion-decision.md)
- [setup-flow.md](./setup-flow.md)
- [status-states.md](./status-states.md)
