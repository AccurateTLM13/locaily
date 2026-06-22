# Decision Log

## 2026-06-20 — JSON-First Internal Operating Format

### Decision

Local Brain internals use **JSON** as the operating format. **Markdown** is reserved for human-facing exports, documentation, README content, and coding-agent handoffs.

```txt
JSON     = how Locaily thinks
Markdown = how Locaily explains
```

Markdown output support is preserved but reframed as an **export / rendering layer**, not the orchestration source of truth.

### Why

Structured JSON makes workflow plans, routing decisions, validation results, retries, and audit records testable, composable, and machine-readable. Markdown remains valuable for humans and coding agents but should be generated from validated JSON state.

### Consequences

- Architecture docs and internal JSON schemas document the target format ([json-first-internal-format.md](../01-architecture/json-first-internal-format.md), [internal-json-schemas.md](../01-architecture/internal-json-schemas.md)).
- Lighthouse Handoff pipeline is documented as JSON stages ending in Markdown export.
- No claim that every schema is runtime-validated until code supports it.
- Runtime changes are deferred unless matching code already exists.

### Status

Accepted (docs + schema alignment; no mandatory runtime refactor in this decision)

### Notes

Schemas: `companion/schemas/internal/`. Lighthouse `write_handoff` already produces JSON + Markdown export.

---

## 2026-06-14 — Lighthouse Handoff Remains First Proof Workflow

### Decision

Lighthouse Handoff remains the first official proof workflow and the reference implementation for the track system (`website_audit.lighthouse_handoff`).

### Why

It already exercises extraction, classification, prioritization, validation, markdown assembly, model routing, deterministic tool steps, and deterministic fallback when runtime is unavailable.

### Consequences

- New architecture changes should preserve Lighthouse Handoff compatibility until a migration is documented.
- Additional workflows should follow the track registry pattern — not embed orchestration inside single tools.
- Step input mapping debt in `tool-router.js` must be resolved before scaling to a second workflow track.

### Status

Accepted

### Notes

Track system docs: `docs/02-track-system/`. Progress: `docs/07-progress/`.

---

## 2026-06-14 — Docs Restructured Around Track System

### Decision

Reorganize documentation into explicit buckets: track system (`02-track-system`), workflows (`03-workflows`), validation evidence (`04-validation`), product (`05-product`), progress (`07-progress`), agents (`08-agents`), research in archive.

### Why

Vision, implementation, future ideas, and old plans were mixing. Locaily needs a blunt current-state anchor and track-system docs before adding workflows or agent-driven architecture drift.

### Status

Accepted (docs-only; no runtime behavior change in this decision)

---

## 2026-06-13 — Model Skill Sheets as Routing Data Layer

### Decision

Use **Model Scorecards / Skill Sheets** as the target data layer for model suitability, hardware fit, task-track strengths, failure modes, and fallback rules.

### Why

The Local Brain should route by task track and capability, not by generic model size or a single benchmark score. Scorecards make the AI Pit Crew model-selection thesis concrete while preserving rules, tools, validators, and human review as first-class handler types.

### Status

Confirmed direction; implementation remains experimental

### Notes

Spec: `docs/01-architecture/model-scorecard-and-routing.md`. Do not treat scorecard fields as measured facts unless backed by evaluation artifacts, scoreboard entries, or documented local runs.

---

## 2026-06-12 — Locaily Confirmed as Public Product Name

### Decision

**Locaily** is the confirmed public umbrella name for the project.

### Why

Owner confirmation after docs reorganization review.

### Status

Confirmed

### Notes

Some repo files (`README.md`, `AGENTS.md`) still use legacy "Local AI Platform" wording and should be updated in a follow-up pass.

---

## 2026-06-12 — NearbyNode and AI Pit Crew as Public Terms

### Decision

**NearbyNode** and **AI Pit Crew** ship as public product/architecture terms alongside Local Brain and Lighthouse Handoff.

### Why

Owner confirmation. These names communicate the capability-first and multi-specialist thesis clearly.

### Status

Confirmed (naming); NearbyNode implementation remains experimental

### Notes

NearbyNode is a confirmed term for a not-yet-built layer—do not imply it is implemented.

---

## 2026-06-12 — Lighthouse Handoff Chrome Extension Repository

### Decision

The Lighthouse Handoff Chrome extension client lives at:

https://github.com/mnfrdrsh/lighthouse-handoff

This repo (`locailly`) owns the Local Brain server side; the extension repo owns browser capture and client UX.

### Why

Owner provided the external client repository link.

### Status

Confirmed

### Notes

Linked from `docs/03-workflows/lighthouse-handoff.md`.

---

## 2026-06-12 — Lighthouse Handoff L1 Validation Passed

### Decision

Record **L1 (Local Brain contract)** validation as passed based on `node scripts/contract-test.js` and `node scripts/smoke-test.js` (28/28 checks) on 2026-06-12.

### Why

Priority A after docs reorg: prove the first workflow test bench with evidence, not claims.

### Status

Confirmed for L1 only. L2–L4 (Ollama live, extension standalone, extension bridge) remain open.

### Notes

See `docs/03-workflows/lighthouse-handoff-validation.md`. Extension ↔ Local Brain HTTP bridge is not implemented.

---

## 2026-06-12 — Root README and Agent Files Aligned to Locaily

### Decision

Reframe root `README.md`, `AGENTS.md`, and `AGENT.md` to use Locaily naming, point to `docs/00-start-here/`, and describe Lighthouse Handoff as the first workflow (not a stub-only integration).

### Why

Owner chose priority **B** after docs reorganization: reduce confusion for builders and coding agents reading repo-root files first.

### Status

Confirmed

### Notes

Legacy alias "Local AI Platform" may still appear in archived docs and older checklists.

---

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

`docs/05-product/desktop-companion-decision.md`

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

## 2026-06-12 — Memory Bridge v0 and Second Brain as Memory Layer

### Decision

**Second Brain** remains a private memory vault. **Locaily** owns the public Memory Bridge (adapter, schemas, starter template, endpoints). Users configure a local `vaultPath`. Context packs use summaries/excerpts by default; writeback is proposal-only; `blockedPaths` always override `allowedPaths`.

### Why

Align two repos without merging private content into the open-source tree. Enable system improvement through memory and reviewable writeback, not model weight changes.

### Status

Confirmed — v0 implemented

### Notes

See `docs/06-decisions/second-brain-as-memory-layer.md`, `docs/01-architecture/memory-bridge.md`.

---

## 2026-06-13 — Memory Bridge Privacy and Audit Redaction

### Decision

Memory endpoint and Lighthouse memory-preflight audits store **redacted metadata only** — no excerpts, proposal bodies, summaries, or vault paths. `companion/memory/audit-redaction.js` enforces this.

### Why

Private Second Brain content must not persist in Locaily audit logs when context packs are built over HTTP.

### Status

Confirmed — implemented and smoke-tested

### Notes

Part of privacy stabilization before controlled validation. Smoke suite: 47/47.

---

## 2026-06-13 — Lighthouse Handoff Only Workflow Wired to Memory Bridge v0

### Decision

Only `lighthouse-handoff` task `compose-handoff` receives optional memory preflight in v0. No other workflows call Memory Bridge until L2 validation repeats cleanly.

### Why

Prove one integration path before expanding surface area.

### Status

Confirmed

### Notes

`options.memory.enabled: "auto"`. Metrics from Lighthouse/PageSpeed remain authoritative.

---

## 2026-06-13 — Memory Bridge + Lighthouse Controlled Validation

### Decision

Record controlled validation as passed for Memory Bridge + Lighthouse `compose-handoff` against a real wiki-style private vault and real Lighthouse CLI capture (user-local). Public evidence in `docs/04-validation/`; commit `f4551b9`.

### Why

Confirm bridge works outside public starter templates without metric regression or privacy leaks.

### Status

Confirmed for controlled local validation. L2 live Ollama path remains open.

### Notes

See `docs/04-validation/memory-bridge-lighthouse-v0.md`. Do not commit private vault paths or validation artifacts.

---

## 2026-06-13 — L2 Live Ollama + Memory Bridge Validated

### Decision

Record **L2 (live Ollama orchestration + Memory Bridge compose)** as passed on target hardware (2026-06-13) for the Lighthouse Handoff chain: live PageSpeed capture → slim input → Ollama `analyze-report` → schema-valid result → memory-enabled `compose-handoff` → metric-preserving Markdown.

### Why

Closes the open L2 milestone with evidence on a real site (`https://lemonteed.com/`, performance 76 weakest) without claiming multi-model routing, extension bridge, or handoff quality benchmarks.

### Status

Confirmed for documented manual validation. Automated regression: `scripts/lighthouse-memory-compose-regression.js`.

### Notes

Evidence doc: `docs/04-validation/l2-live-ollama-memory-bridge.md`. Local artifacts under `data/validation/` (gitignored). Checklist deduplication added in `companion/tools/lighthouse-handoff.js`. Private vault project page enrichment remains a follow-up.

---

## 2026-06-13 — Local Test Bench Console

### Decision

Add a localhost-only `LocAIly Test Bench` at `GET /console` for Lighthouse Handoff validation runs, with status preflight, browser-triggered runs, live pipeline status, result review, and local run history.

### Why

Manual PowerShell validation proved the L2 chain, but normal validation should be runnable by a non-technical user without hand-calling endpoints or copying artifacts.

### Status

Implemented as a simple static HTML/CSS/JS console served by the existing companion server. Validation artifacts remain local and gitignored under `data/validation/`.

### Notes

The console validates the Lighthouse Handoff L2 workflow only. It does not claim Chrome extension validation, multi-model routing validation, benchmark quality, or score improvement. Memory paths stay redacted; only vault-relative `filesUsed` may appear in run evidence.

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
