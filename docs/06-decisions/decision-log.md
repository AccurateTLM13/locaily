# Decision Log

## 2026-06-12 — Docs Reorganized Around Locaily Vision

### Decision

Restructure `/docs` into numbered folders (`00-start-here` through `06-decisions`, plus `99-archive`) aligned with Locaily, Local Brain, NearbyNode, AI Pit Crew, and Lighthouse Handoff framing.

### Why

Earlier docs mixed "Local AI Platform," engine-core specs, and conversation captures. Agents and builders need a single navigable source of truth.

### Status

Confirmed

### Notes

See `docs/DOCS_CLEANUP_REPORT.md` for file moves.

---

## 2026-06-12 — Lighthouse Handoff as First Workflow Test Bench

### Decision

Treat Lighthouse Handoff as the first practical workflow for validating orchestration—not as the entire product.

### Why

It exercises structured input, deterministic fallback, multi-step roles, and client bridge patterns with bounded scope.

### Status

Confirmed (direction); full Chrome extension validation still open

### Notes

Code: `companion/tools/lighthouse-handoff.js`, `companion/core/orchestrator.js`

---

## 2026-06-12 — Capability-First, Not Model-First

### Decision

Route work by capability, tool pack, and task track; use model roles instead of advertising raw model names to users.

### Why

Matches Pit Crew / track orchestration research and keeps small models viable.

### Status

Confirmed (philosophy); automatic track classifier not built

### Notes

Archive: `docs/99-archive/raw-conversation-captures/Local AI Engine Evolution.txt`

---

## 2025-era — Localhost Companion as Platform Core

### Decision

Bind companion server to `127.0.0.1:31313`; keep platform logic in Node companion, not in clients or desktop UI.

### Why

Local-first security, reuse across extensions and tools, Windows-friendly dev loop.

### Status

Confirmed (implemented)

### Notes

Port `4317` mentioned in some archived docs; repo keeps `31313` unless config overrides.

---

## 2025-era — Canonical `/tasks/run` with Legacy `/analyze`

### Decision

New clients use `POST /tasks/run`; `POST /analyze` remains for MVP compatibility with original envelope.

### Why

Avoid breaking DealSniper-era clients while expanding engine features.

### Status

Confirmed (implemented)

### Notes

See `docs/01-architecture/api-contract.md`

---

## 2025-era — Tauri-First Desktop Companion (Deferred)

### Decision

Plan Desktop Companion as thin control panel; prefer Tauri over Electron for v1 prototype; do not start UI until API/packaging stable.

### Why

Smaller footprint; keeps server as core.

### Status

Revisit Later (planning only)

### Notes

`docs/04-product/desktop-companion-decision.md`

---

## 2025-era — Manifest-Backed Tool Packs

### Decision

Load tools from `tool-packs/*/tool.json` manifests instead of only static registration.

### Why

Plugin-style extensibility without forking core.

### Status

Confirmed (implemented for Standard Text Pack)

### Notes

`companion/tools/registry.js`, `tool-packs/standard-text-pack/`

---

## Template

```md
## YYYY-MM-DD — Title
### Decision
### Why
### Status
Confirmed / Experimental / Revisit Later
### Notes
```
