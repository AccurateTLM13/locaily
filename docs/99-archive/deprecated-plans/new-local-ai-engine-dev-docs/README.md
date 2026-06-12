# Local AI Engine Core — Developer Documentation Pack

## Purpose

This documentation defines the first buildable version of the **Local AI Engine Core**.

The project goal is **not** to build another general AI chat app.

The goal is to build a local-first runtime layer that lets apps, browser extensions, desktop tools, voice clients, and future community tool packs use **small local models** through a shared, permissioned, auditable engine.

## Core Thesis

> Small models become powerful when the system gives them the right job, the right context, the right tools, and strict output rules.

## Product Shape

The Engine should consist of two major parts:

1. **Local AI Engine Core**
   - Local service/runtime
   - Tool registry
   - Provider router
   - Context handler
   - Permission manager
   - Audit log
   - Fallback router
   - Model role manager

2. **Desktop Companion UI**
   - Status dashboard
   - Installed tool packs
   - Connected apps
   - Model roles/status
   - Permission approvals
   - Audit logs
   - Settings

## What This Is Similar To

Use this mental model:

| WordPress Concept | Local AI Engine Concept |
|---|---|
| WordPress Core | Local AI Engine Core |
| WP Admin Dashboard | Desktop Companion UI |
| WordPress Plugins | Tool Packs |
| Plugin Functions | Tools |
| Hosting/PHP Runtime | Model Providers / Local Runtime |
| Activity Log | Audit Log |
| Themes/Sites | Connected Apps / Clients |

## What This Is Not

This project should **not** become:

- a ChatGPT clone
- a model marketplace
- a heavy local model runner
- a visual workflow builder
- a cloud AI gateway
- a giant general-purpose assistant

Those lanes are already crowded.

## The Lane

This project should focus on:

- small local models
- role-based model assignment
- local-first execution
- app/extension bridge
- plugin-style tool packs
- strict schemas
- permission boundaries
- auditability
- fallback routing
- niche task workflows

## Recommended First Build

Start with a small but real version:

```txt
GET  /health
GET  /tools
POST /tasks/run
GET  /audit
GET  /providers/status
POST /providers/set
```

Ship with:

```txt
standard-text-pack:
- text.clean
- text.summarize
- text.extract_json
- text.classify
- text.detect_injection
- text.validate_schema
```

Do not start with DealSniper, PageSpeed, or Voice as core features. Those are showcase/tool packs later.
