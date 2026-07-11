# Decision Log

## 2026-07-11 — M4 Relay Nodes: Ephemeral Execution Targets, Localhost-Only, Opt-In Memory

### Decision

For Milestone 4 (Relay Nodes & Distributed Capability Network):

- Relay nodes are **execution targets only** — they receive individual step work via `POST /relay/step` and return raw results. They cannot alter orchestrator policy, qualifications, or the node registry beyond their own entry.
- The Local Brain stays **localhost-only by default**; relay cross-device traffic is an opt-in client connection initiated by the orchestrator to a registered `baseUrl`. No public exposure is added.
- Discovery is **registry-based** (nodes register/heartbeat their `baseUrl` + capabilities). No mDNS/broadcast in M4.
- Relay nodes are treated as **ephemeral**: a failed/timeout dispatch marks the node unhealthy and falls back to local execution. No state is stored only on a relay node.
- Memory Bridge v1 `applyWriteback` is **opt-in** (`memoryBridge.allowApply`) and vault-path-gated; vault-local config cannot enable apply when the companion disallows it. Relay nodes only touch their operator-configured local vault.
- No distributed consensus or Byzantine fault tolerance is claimed; routing is single-node selection with local fallback.

### Why

Keeps the local-first, privacy-preserving posture of Locaily while enabling nearby-device capability routing. Treating relay nodes as ephemeral execution targets bounds the new failure modes introduced by multi-machine coordination (per the M4 risk note) and avoids over-claiming a distributed systems guarantee the project does not provide.

### Consequences

- `companion/relay/*` implements protocol, registry, connector, router.
- `POST /relay/step` intentionally exposes only step execution, not control operations.
- Cross-node routing requires no new client contract beyond `options.relay_policy` (already injected by the server).
- `test:relay:e2e` verifies discovery, routing, and fallback across two Local Brain instances.

### Status

Implemented and verified (2026-07-11).

---

## 2026-07-05 — Pit Crew → The Crew: Code Path Migration

### Decision

Rename the legacy `companion/pit-crew/` internal implementation path to `companion/crew/` and update all active code and documentation references. Preserve the rename history in archival and historical notes only.

### Why

The public product name was shortened from "AI Pit Crew" to "The Crew" earlier (2026-06-12). The code path `companion/pit-crew/` retained the old name, creating a mismatch between public terminology and internal structure. The rename closes that gap without changing any orchestration behavior, endpoint contracts, or runtime semantics.

### Consequences

- `companion/pit-crew/` directory renamed to `companion/crew/` via `git mv` — all require paths in server, orchestrator, routers, decomposer, markdown, and track JSON files updated.
- `docs/01-architecture/pit-crew-gap-analysis.md` renamed to `crew-gap-analysis.md`.
- 25+ documentation files updated with path/terminology alignment.
- Historical notes in `crew.md`, `crew-gap-analysis.md`, `glossary.md`, and `CONTRIBUTING.md` record the former name and path.
- Archive files (`99-archive/`), historical decision entries, and `docs/LocAIly_ and_Second_Brain_Alignment_and_Connection.md` are preserved as-is.
- No behavioral changes, endpoint response changes, or dependency changes.
- No benchmark evidence, qualification records, or schema checksums invalidated.

### Status

Implemented and verified.

---

## 2026-06-27 - North Star Local Capability Network

### Decision

Document Locaily's North Star as a local capability network: Local Brain decomposes work into track contracts, routes each track to the smallest qualified capability, validates outputs, and records structured evidence for future routing and track design.

### Why

The June 2026 direction document clarified that Locaily is not a model launcher, single chatbot, or generic agent framework. It is a local-first orchestration system where devices, tools, models, validators, scripts, and future nodes are treated as capabilities under track contracts and policy.

### Consequences

- Added [north-star-local-capability-network.md](../00-start-here/north-star-local-capability-network.md) as the durable summary.
- The current evidence-record slice is framed as the first step toward the compounding evidence loop.
- NearbyNode remains future local capability dispatch, not implemented behavior.
- RelayNode is recorded as a future approved remote execution target, not a control plane.
- New docs should avoid hardware, model, node, or provider additions unless they name the track need, qualification method, and evidence required.

### Status

Accepted direction; implementation remains incremental.

---

## 2026-07-05 — Guarded Qualification-Aware Routing Enforcement

### Decision

Implement guarded enforcement evaluation in the canonical model router (`companion/crew/model-router.js`), extending the shadow routing → enforcement policy pipeline into active model selection. Enforcement decision is recorded in Track Run Records via optional `routing.enforcementDecision`. Fallback on enforced execution failure: re-execute with original selected model. Keep all tracks in shadow mode by default. Do not activate a pilot track — no companion track has a current, valid `qualified` model capability with sufficient shadow coverage.

### Why

The enforcement policy engine and shadow routing were already implemented as separate modules but not wired into routing decisions. The model router is the correct integration point — it is the central authority for model selection, used by all track and workflow executions. Integration inside `executeModelStep()` keeps enforcement logic alongside existing shadow recommendation computation and qualification policy evaluation.

No pilot track was activated because:
- Model qualification records for companion tracks are either `candidate` or `screening` status (resolve to `untested`)
- The only `qualified` model capability targets the Benchmark Lab `hybrid-weather` track, which is not a companion server runtime track
- No shadow routing evidence exists for any companion track

### Consequences

- `companion/crew/model-router.js` extended with `evaluateEnforcement()` function and integration in `executeModelStep()`
- `companion/evidence/schemas/track-run-record.schema.json` extended with optional `routing.enforcementDecision`
- `companion/evidence/track-run-record-builder.js` passes `enforcementDecision` through
- `companion/crew/runtime-track-run-recorder.js` passes enforcement decision to child records
- `companion/evidence/shadow-evidence-review.js` extended with `buildEnforcementMetrics()` reporting enforcement attempts, applied, blocked, fallback, and success rates
- `companion/server.js` updated with enforcement policy wiring, safe state change enforcement on `/enforcement/set`, and new endpoints `/enforcement/pilot`, `/enforcement/decisions`
- All tracks remain in `shadow` state by default
- 83 tests cover all policy states, eligibility failures, routing evidence, runtime failures, metrics, and compatibility
- All existing tests (60 enforcement policy, 31 shadow routing, 25 qualification resolver, 4 schema, 18 crew track run record) remain passing
- Qualification records, evidence, checksums remain unchanged

### Status

Implemented and verified.

### Notes

Source: attached project direction document, "LocAIly North Star", June 2026.

---

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

## 2026-06-23 - Benchmark Lab Remains In-Repo

### Decision

Create Benchmark Lab as a top-level Locaily subsystem at `benchmark-lab/`, with canonical system documentation at `docs/02-systems/benchmark-lab.md`.

### Why

The first Benchmark Lab implementation must work directly against Locaily model roles, track definitions, worker contracts, schemas, and orchestration assumptions. Keeping it in the main repository avoids contract drift while qualification records and routing evidence are still taking shape.

### Consequences

- Benchmark engine code lives under `benchmark-lab/engine/`.
- Locaily-specific suites, fixtures, prompts, and worker contracts live under `benchmark-lab/locaily/`.
- Runtime and orchestration code should consume compact qualification records and approved evidence, not benchmark runner internals.
- Raw results, caches, model binaries, runtime logs, and temporary reports stay out of Git.
- Future extraction requires a concrete operational reason, such as independent consumers, divergent release cadence, repository size pressure, or a standalone package/CLI.

### Status

Accepted

### Notes

Initial schema: `benchmark-lab/schemas/qualification-record.schema.json`.

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

The Local Brain should route by task track and capability, not by generic model size or a single benchmark score. Scorecards make The Crew model-selection thesis concrete while preserving rules, tools, validators, and human review as first-class handler types.

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

**NearbyNode** and **AI Pit Crew** (later shortened to **The Crew**) ship as public product/architecture terms alongside Local Brain and Lighthouse Handoff.

### Why

Owner confirmation. These names communicate the capability-first and multi-specialist thesis clearly.

### Status

Confirmed (naming); "AI Pit Crew" shortened to "The Crew" as product naming matured (2026-07-04). NearbyNode implementation remains experimental.

### Notes

NearbyNode is a confirmed term for a not-yet-built layer—do not imply it is implemented. "AI Pit Crew" references in archived material are historical.

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

Restructure `/docs` into numbered folders (`00-start-here` through `06-decisions`, plus `99-archive`) aligned with Locaily, Local Brain, NearbyNode, The Crew (formerly AI Pit Crew), and Lighthouse Handoff framing.

### Why

Earlier docs mixed "Local AI Platform," engine-core specs, and conversation captures. Agents and builders need a single navigable source of truth.

### Status

Confirmed

### Notes

See `docs/99-archive/docs-maintenance/DOCS_CLEANUP_REPORT-2026-06-12.md` for file moves.

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

## 2026-06-18 — Split Operator Log discovery from drafting

### Decision

Implement Operator Log publishing as two linear tracks: source-audited discovery followed by human-selected drafting. Inventory every allowlisted file, process content in bounded batches, clamp model citations to actual source markers, and keep Lemonteed HTML/sitemap output proposal-only.

### Why

Discovery and publication have different risk boundaries. A human selection gate prevents a ranking mistake from becoming a repository write, while hashes and vault-relative source paths make each suggestion auditable.

### Status

Experimental

### Notes

The first VibeThinker-3B Q4 evaluation completed the hardened pipeline but failed editorial quality checks: a prompt-echo headline and an 80-word draft. See `docs/04-validation/operator-log-vibethinker.md`.

---

## 2026-06-18 — Do not route grounded Operator Log extraction to VibeThinker 3B

### Decision

Keep `hf.co/mradermacher/VibeThinker-3B-GGUF:Q4_K_M` out of the grounded editorial extractor, ranker, and writer roles. Preserve it as an evaluated candidate with negative evidence rather than removing it from the Model Garage.

### Why

The six-file narrow extraction fixture isolated extraction from all other publishing responsibilities. JSON validity and source-path precision reached 100%, but exact excerpt verification was 25% and only one valid grounded signal emerged across 18 calls. The model failed the automated gate even in the smaller role.

### Status

Confirmed for the Operator Log fixtures tested on 2026-06-18; other roles remain unevaluated.

### Notes

Public summary: `ai-models/benchmark-results/operator-log/vibethinker-3b-narrow-extraction-v0.1.json`. Private excerpts and hashes remain in ignored local artifacts.

---

## 2026-07-04 — Tool Eval Bench Compatibility Slice

### Decision

Port 8 deterministic Tool Eval Bench scenarios (Categories A–D) as a native Node.js integration into the existing Benchmark Lab, using a new ToolEvalRuntime adapter (Ollama /api/chat native tool-calling) and a multi-turn runner. Extend the run-summary schema with a PARTIAL verdict. Store evidence in existing conventions. Do not vendor or submodule the upstream Python repository.

### Why

The upstream Tool Eval Bench is Python-based with 8+ dependencies (httpx, rich, pyyaml etc.). The existing Benchmark Lab is Node.js with zero external dependencies. A thin subprocess adapter would add Python build/runtime requirements. A native port of 8 deterministic scenarios is the least invasive approach — each scenario is ~20 lines of deterministic evaluation logic. Existing schemas cover most needs; only the PARTIAL verdict was missing from the verdict enum.

### Consequences

- Added `benchmark-lab/engine/adapters/tool-eval-runtime.js` (Ollama /api/chat adapter with tool support)
- Added `benchmark-lab/engine/runners/tool-eval-runner.js` (multi-turn scenario runner)
- Added `benchmark-lab/locaily/tracks/basic-tool-use/` (8 ported scenarios, tool definitions, suite config)
- Extended `benchmark-lab/schemas/benchmark-run-summary.schema.json` with PARTIAL verdict
- Added `scripts/benchmark-lab-tool-eval-test.js` (integration test)
- Draft report and draft qualification record generated
- llama3.2 results: 4 PASS, 3 PARTIAL, 1 FAIL — tool selection and precision reliable, restraint and refusal failing
- Tool-call argument format differs from OpenAI: Ollama /api/chat requires arguments as JSON objects, not strings

### Status

Confirmed — compatibility slice operates independently of existing Benchmark Lab pipeline. All existing tests pass unchanged.

### Notes

Upstream commit: `8eca976167dfe925c125edd5a289433e78ee54e0`. Repository: https://github.com/MiaAI-Lab/tool-eval-bench.

---

## 2026-07-04 — Basic Tool Use Track Hardening

### Decision

Harden the basic-tool-use Benchmark Lab track with: (1) capability allowlisting at the runner level — hallucinated tool calls blocked and recorded as evidence, never executed; (2) track-level tool-use policy injected into system prompt — instructs on tool scope, refusal, direct answers, reference date; (3) explicit fixed reference date for TC-05; (4) TC-12 evaluator with 6 diagnostic dimensions; (5) TC-10/TC-11 separate correct-answer vs. unnecessary-tool metrics; (6) canonical checksum normalization for CRLF/LF text file equivalence.

### Why

The first completion report identified four specific gaps: TC-05 date parsing failed without explicit reference date; TC-10/TC-11 conflated answer correctness with tool-restraint compliance; TC-12 hallucinated tool names that were never blocked; checksums failed on Windows due to CRLF line endings. All six hardening items directly addressed these gaps without overfitting evaluators or hiding model failures.

### Consequences

- Capability allowlist blocks and records hallucinated tool calls (e.g., `send_email` for email deletion) — tools are never executed if not in the provided tool definitions.
- Track policy is specific to `basic-tool-use` — does not modify global model behavior or other Benchmark Lab tracks.
- TC-05 now has explicit `referenceDate: "2026-03-20"` and separates date correctness from argument-type validation.
- TC-12 evaluator tracks `refusedCorrectly`, `acknowledgedMissingCapability`, `hallucinatedTool`, `falselyClaimedCompletion`, `attemptedUnrelatedTool`, `failedWithoutExplanation` independently.
- Checksum records now include `checksumMode: "canonical_text_v1"` or `"byte_exact"`. Legacy records without `checksumMode` verified via fallback to canonical normalization.
- TC-12 improved from FAIL to PARTIAL — model still attempts `send_email` but runtime blocks it and model adjusts to refusal.
- Direct-answer compliance unchanged: llama3.2 still overuses tools for trivia and math.

### Status

Confirmed — all existing tests pass, 19 hardened integration tests pass, before/after comparison generated.

### Notes

Previous run ID: `run-tool-eval-20260704T162917Z`. Hardened run ID: `run-tool-eval-20260704T164235Z`. Comparison report: `compare-basic-tool-use-20260704T162917Z-vs-20260704T164235Z.md`.

---

## 2026-07-04 — Execution-Metadata Standardization and Cross-Model Assessment

### Decision

Standardize execution metadata in the benchmark-case schema with six optional fields: `executionPolicy`, `responseMode`, `supportMode`, `allowedInitialTools`, `allowedFollowupTools`, `maxTurns`. All fields are backward-compatible — existing fixtures and approved evidence remain valid without migration. Then attempt a cross-model mode comparison against `lfm25-8b-a1b-local` and `vibethinker-3b-q4km-local`.

### Why

The execution-mode comparison demonstrated that orchestration metadata (policy, mode, staged tools) is essential for distinguishing native capability from assisted capability. Without schema representation, this metadata cannot travel with evidence. The cross-model comparison was intended to determine whether observed failures are model-specific or runtime-specific.

### Consequences

- benchmark-case schema extended with 6 optional fields. All existing fixtures pass unchanged.
- Existing approved evidence remains valid without migration.
- lfm25-8b-a1b-local: **blocked** for tool-calling scenarios. Ollama reports `capabilities: ["completion"]` — no `tools` support. The `/api/chat` endpoint with `tools` parameter causes request timeout.
- vibethinker-3b-q4km-local: **incompatible** with standard tool-calling format. Has `capabilities: ["completion", "tools", "insert"]` but produces non-standard XML `<parallel>` output instead of JSON `tool_calls` array. Also exhibits extreme latency (5+ minutes per request) due to thinking token prefill.
- llama3.2-local: only fully compatible model for the standard tool-calling benchmark format.
- Cross-model comparison completed as model compatibility assessment rather than full execution matrix.

### Status

Confirmed — schema changes are backward-compatible. Model compatibility findings are documented blockers for non-llama3.2 models.

### Notes

llama3.2 capabilities: `completion tools`. LFM2.5-8B-A1B capabilities: `completion` only. VibeThinker-3B capabilities: `completion tools insert` but non-standard output format.

---

## 2026-07-04 — Hybrid Deterministic Workflow Integration

### Decision

For deterministic known-schema mappings where benchmark evidence demonstrates higher reliability than tested model-generated formatting, LocAIly will prefer a registered deterministic transformer. The hybrid workflow (model tool selection → deterministic formatting) is now a first-class capability with its own execution policy, runner, schema support, and operator CLI.

### Why

llama3.2 achieves 0% schema compliance in model-only TC-65 (generates Python code instead of JSON) but 100% schema compliance in the hybrid workflow (3/3 PASS, <1ms formatting latency). The deterministic approach eliminates hallucination risk, reduces latency from ~2.5s to <1ms, and produces source-faithful output. The evidence demonstrates that for structured tool output to known schemas, deterministic formatting is superior to model-generated JSON.

### Consequences

- Probe gating integrated into tool-eval-runner.js and mode-comparison-runner.js
- Hybrid CLI created (`npm run benchmark:hybrid`)
- benchmark-case schema extended with hybrid-deterministic supportMode and TOOL_THEN_DETERMINISTIC_TRANSFORM policy
- Transformation fixtures created with valid/invalid variants
- lfm25-local hybrid blocked (Ollama runtime stability — 8.5B model exceeds system memory)
- vibethinker-3b-q4km-local incompatible (non-standard tool output format)
- Canonical TC-65 remains unchanged

### Status

Confirmed — hybrid workflow validated for llama3.2-local. LFM2.5 blocked by runtime stability. Architecture documented under deterministic-transformation Track.

### Notes

Model-only formatting: 0% schema compliance. Deterministic formatting: 100% schema compliance, 100% source fidelity.

---

## 2026-07-05 — Canonical Track Run Record Schema

### Decision

Define and implement `locaily.track_run_record.v1` as the canonical Track Run Record schema. The schema lives at `companion/evidence/schemas/track-run-record.schema.json` and covers all required executor types (`model`, `tool`, `transform`, `rule`, `relay-node`, `hybrid`) with logical field groups for identity, request, routing, execution, output, validation, performance, errors, and child runs.

### Why

The active build slice (Canonical Track Run Records) requires a single, standardized execution record format usable by both Benchmark Lab executions and real LocAIly runtime executions. No such format existed — only empty placeholder schema files. The schema fills the first gap in the Track Learning Evidence Loop: `Run -> Observe -> Validate -> Record -> Compare -> Qualify -> Route Better`.

### Consequences

- Schema defined at `companion/evidence/schemas/track-run-record.schema.json` (replaced empty `{}` placeholder).
- Record builder at `companion/evidence/track-run-record-builder.js` with convenience builders per executor type.
- Benchmark Lab suite-runner now emits a Track Run Record after each mock/Ollama suite execution.
- Benchmark Lab hybrid-deterministic-runner now emits a parent Track Run Record with child records for each scenario trial's model, tool, and transform stages.
- Example fixture records for model, transform, and hybrid executor types.
- Schema validation tests pass against valid and invalid fixtures.
- Existing Benchmark Lab tests, schemas, qualification records, evidence, and checksums remain valid.
- The schema uses the codebase's existing custom JSON Schema validator (no `$ref`/`$defs` support) — child run structures are duplicated inline rather than referenced.
- No companion track runner integration yet; that is the next integration step.

### Status

Confirmed — core schema, builder, and two Benchmark Lab runner integrations complete.

### Notes

Architecture doc: `docs/02-track-system/canonical-track-run-records.md`. Active build slice: `docs/07-progress/active-build-slice.md`.

---

## 2026-07-05 — Qualification Evidence Consumption: Six-State Resolution Engine

### Decision

Built a dedicated qualification resolver (`companion/core/qualification-resolver.js`) that converts raw Benchmark Lab qualification records into six actionable consumption states (qualified, unqualified, expired, stale, invalid, untested) with deterministic precedence. Created a Capability Registry (`companion/core/capability-registry.js`) as the qualification-aware surface for model+role+track capability queries. Created a Qualification Evidence Linker (`companion/evidence/qualification-evidence-linker.js`) to connect qualifications to Track Run Records. Added read-only endpoints (`GET /qualifications/*`, `GET /capabilities`) and a dry-run routing recommendation API (`POST /qualifications/dry-run`). Preserved existing routing behavior — advisory policy remains the default.

### Why

Before this slice, qualification records existed in `benchmark-lab/qualifications/models/` and were loaded by `model-qualification-loader.js`, but there was no unified interpretation layer that could answer "is this model+role+track combination eligible for routing?" The six-state model provides a clean eligibility view while the dry-run API allows proving correct interpretation before enabling automatic routing. The Capability Registry fills the previously documented gap of "unified capability index does not exist."

### Consequences

- Six states resolved with precedence: invalid > expired > stale > unqualified > qualified > untested.
- `companion/core/qualification-resolver.js` wraps `modelQualificationLoader` — does not replace it.
- Record-level `status` field (untested/screening/candidate) gates non-definitive records to `untested`.
- Entry-level `status` field (qualified/conditional/rejected/revalidation_required) drives the definitive resolution.
- Temporal staleness uses configurable TTL (default 30 days).
- Dry-run API explains eligibility without changing routing — advisory policy remains default.
- Read-only endpoints do not modify any existing qualification records, evidence, or schema.
- No `benchmark-lab/engine/` modules imported — architectural boundary preserved.
- 25 tests in `scripts/test-qualification-resolver.js` cover all six states plus edge cases.
- Routes are inline in `companion/server.js` following existing pattern.

### Status

Confirmed.

### Notes

Full implementation: `companion/core/qualification-resolver.js`, `companion/core/capability-registry.js`, `companion/evidence/qualification-evidence-linker.js`, `scripts/test-qualification-resolver.js`. Routes: `GET /qualifications/status`, `GET /qualifications/capabilities`, `GET /qualifications/capability`, `POST /qualifications/dry-run`, `GET /capabilities`. Build slice result: `docs/07-progress/latest-build-result.json`.

---

## 2026-07-05 — Qualification-Aware Shadow Routing: Observe, Don't Enforce

### Decision

Built a shadow routing engine (`companion/core/shadow-routing.js`) that computes qualification-backed routing recommendations alongside the current routing decision without changing execution. Shadow comparison data is embedded in Track Run Records via an optional `routing.shadowRecommendation` field. The shadow router is called from `executeModelStep()` for every model step; both the selected capability and the recommended capability are recorded, along with the comparison state and reasoning. `enforced` is always `false` in shadow mode.

### Why

Before this slice, the qualification resolver could compute eligibility (dry-run), but there was no integration at runtime that captured the divergence between "what the router chose" and "what qualifications recommend." Shadow routing proves whether the evidence layer agrees with or correctly differs from current routing before it gains authority. Embedding the comparison in Track Run Records ensures every execution produces analyzable data without separate infrastructure.

### Consequences

- Shadow comparison data is produced for every model step across all tracks (Lighthouse Handoff, DealSniper, operator logs, benchmark suites).
- Six comparison states: agree (current matches best qualified), disagree (current differs from best qualified), no-qualified-capability (no model qualified), insufficient-evidence (models exist but none definitive), current-selection-unqualified (current model known to fail), recommendation-unavailable (no data at all).
- `routing.shadowRecommendation` is optional and omitted when not provided — no breaking schema change.
- Fallback recommendation tracks the second-best qualified candidate when multiple exist.
- `notEnforcedReason` explains why shadow mode does not affect routing.
- No routing behavior changed: `enforced` is always `false`, execution is never blocked or redirected.
- 31 tests cover all comparison states, builder integration, and shadow-not-enforced assertion.

### Status

Confirmed.

### Notes

Shadow router: `companion/core/shadow-routing.js`. Schema extension: `companion/evidence/schemas/track-run-record.schema.json` (optional `shadowRecommendation` in routing). Builder: `companion/evidence/track-run-record-builder.js`. Integration points: `companion/crew/model-router.js` (line 60-74), `companion/crew/orchestrator.js`, `companion/crew/runtime-track-run-recorder.js`, `companion/server.js`. Tests: `scripts/test-shadow-routing.js` (31 tests). Build slice result: `docs/07-progress/latest-build-result.json`.

---

## 2026-07-05 — Shadow Routing Evidence Review and Enforcement Policy

### Decision

Built an enforcement policy engine with 5 per-track rollout states (`disabled`, `shadow`, `eligible`, `enforced`, `suspended`) and an evidence review layer that aggregates shadow routing comparisons from Track Run Records. Enforcement eligibility is evaluated across 8+ conditions including track state, qualification state, score threshold, active overrides, runtime availability, model readiness, and comparison state validity. All enforcement is off by default — every track starts in `shadow` mode.

### Why

Shadow routing proved the system can detect when the current model is the best-qualified choice, when a better model exists, when the selected model is unqualified, when coverage is missing, and when evidence is insufficient. The next step before turning on enforcement is defining a safe policy that gates enforcement behind explicit conditions. The 5-state model (disabled, shadow, eligible, enforced, suspended) provides granular control without a single global switch. The evidence review layer enables data-driven decisions about which tracks are safe to enforce.

### Consequences

- 5 per-track enforcement states: disabled (no shadow either), shadow (observe only), eligible (ready to enforce but not yet), enforced (recommendations applied), suspended (previously enforced, now stopped).
- Default state for all tracks is `shadow` — enforcement never activates without explicit action.
- Eligibility checks: track must be approved, state must be eligible or enforced, qualification must be `qualified`, score must meet threshold (default 0.7), no active override, runtime must be available, model must be ready, comparison state must be actionable (not insufficient-evidence or recommendation-unavailable).
- Override system allows blocking specific track+role+model combinations.
- Evidence review aggregates by track with agreement rate, coverage rate, and per-comparison breakdowns.
- 6 new endpoints: GET /enforcement/status, POST /enforcement/set, POST /enforcement/approve, POST /enforcement/override, GET /enforcement/review, GET /enforcement/eligibility.
- 60 tests cover all conditions, CRUD operations, and evidence review.
- Next slice: select one low-risk Track, enable guarded enforcement, compare enforced results against shadow predictions.

### Status

Confirmed.

### Notes

Policy engine: `companion/core/enforcement-policy.js`. Evidence review: `companion/evidence/shadow-evidence-review.js`. Tests: `scripts/test-enforcement-policy.js` (60 tests). Endpoints: `companion/server.js` (6 new route handlers). Build slice result: `docs/07-progress/latest-build-result.json`.

---

## 2026-07-05 — Durable Enforcement Policy

### Decision

Make enforcement policy configuration durable across companion server restarts using atomic file write + rename, with synchronous eager initialization at startup, async mutations serialized through a queue, strict state transition enforcement, append-only JSONL audit logging, corrupt-file fallback recovery, and pure in-memory mode for test isolation.

### Why

The enforcement policy engine was previously in-memory only — all track states, approvals, and overrides were lost on server restart. For enforcement to be a practical rollout mechanism, operators need policy state to survive restarts, audit history to be append-only and immutable, and corrupt data to have a safe recovery path. The store design mirrors the existing append-only evidence store pattern already proven in the codebase.

### Consequences

- New files: `companion/core/enforcement-policy-store.js`, `companion/core/enforcement-policy-audit.js`, `companion/schemas/internal/enforcement-policy.schema.json`, `companion/schemas/internal/enforcement-policy-audit-event.schema.json`, `scripts/test-enforcement-policy-store.js`
- Modified files: `companion/core/enforcement-policy.js` (delegates to store with sync legacy seeding), `companion/server.js` (3 new endpoints, store init, reason/updatedBy parameters)
- Atomic persistence sequence: validate input → build candidate document → validate schema → write temp file → rename → update in-memory state → audit event
- Full state transition graph strictly enforced: `disabled↔shadow→eligible↔enforced`, `eligible↔suspended`, `enforced→{eligible,shadow}`, `suspended→{shadow,eligible,disabled}`
- Compound approval mutation: eligible + approved in one operation
- Compound revocation mutation: eligible → shadow or enforced → suspended atomically
- Override identity is composite key (trackId + role + modelId); duplicates rejected
- Corrupt-file fallback reads audit event synchronously before init returns
- Pure in-memory mode when no dataDir provided (enables test isolation without filesystem)
- Default score threshold: 0.7
- Policy file path: `data/policy/enforcement-policy.json` (not exposed in API responses)
- Audit file path: `data/enforcement-policy-audit.jsonl`
- Schema version: `enforcement-policy.v1`
- 123 store tests, 62 backward-compatible policy tests, 91 routing tests, 56/56 smoke tests pass
- Enforcement remains disabled for all tracks — no pilot activated

### Status

Confirmed.

### Notes

Store: `companion/core/enforcement-policy-store.js`. Audit: `companion/core/enforcement-policy-audit.js`. Policy schema: `companion/schemas/internal/enforcement-policy.schema.json`. Audit schema: `companion/schemas/internal/enforcement-policy-audit-event.schema.json`. Wrapper: `companion/core/enforcement-policy.js`. Store tests: `scripts/test-enforcement-policy-store.js` (123 tests). Build slice result: `docs/07-progress/latest-build-result.json`.

---

## 2026-07-05 — Durable Enforcement Policy: Code Review Corrections

### Decision

Address five findings from code review: (1) make the `enforced` state transition gate verify runtime readiness and shadow evidence; (2) surface audit degradation in store health and mutation results; (3) lock `defaultState` to `const: "shadow"` in schema; (4) remove `expiresAt` from schema, store, wrapper, and server; (5) fix audit after-state to contain actual committed state for revocation and override creation.

### Why

The durable enforcement gate for `eligible → enforced` did not verify that the runtime was available, the model was ready, or that sufficient shadow evidence existed — a direct mismatch with the declared safety contract. Audit failures were silently swallowed, making the system appear fully healthy after audit write failures. The schema allowed unsafe defaults like `defaultState: "enforced"`. The `expiresAt` field was accepted but never enforced. Audit events for revocation recorded `state: null` instead of the actual committed state.

### Consequences

- **Finding #1 (High)**: `checkEnforcementGateAsync()` now runs all gate checks (approval, qualified capability, score threshold, active override, runtime availability, model readiness, shadow evidence count) before entering the mutation queue for `enforced` transitions. New error codes: `RUNTIME_UNAVAILABLE`, `MODEL_NOT_READY`, `INSUFFICIENT_EVIDENCE`, `RUNTIME_CHECK_FAILED`, `EVIDENCE_CHECK_FAILED`. Minimum shadow evidence count: 3 (`MIN_SHADOW_EVIDENCE_COUNT`).
- **Finding #2 (Medium)**: `safeAudit()` sets `auditHealthy = false` on write failure. `getStoreHealth()` exposes `auditHealthy`. `executeMutation()` appends `POLICY_AUDIT_WRITE_FAILED` warnings to successful mutation results when audit is degraded.
- **Finding #3 (Medium)**: Schema `defaultState` changed from `enum` with all 5 states to `const: "shadow"`. Previously persisted documents with non-shadow defaults will fail schema validation and trigger corrupt-file fallback on restart.
- **Finding #4 (Medium)**: `expiresAt` removed from schema `overrides.items.properties`, store `setOverride()`, wrapper `setOverride()`, and server endpoint handler.
- **Finding #5 (Low)`: Revocation mutation returns `auditAfter: { approved: false, state: record.state }`; `executeMutation()` uses it to populate the success audit event. Override creation audit now records the generated `overrideId` instead of `null`.
- 143 store tests (20 new), 62 enforcement policy, 91 enforcement routing, all prior suites pass. 56/56 smoke tests pass.

### Status

Confirmed.

### Notes

Async gate: `companion/core/enforcement-policy-store.js` `checkEnforcementGateAsync()`. Audit health: `auditHealthy` flag, `getStoreHealth()`, `executeMutation()` warnings. Schema: `companion/schemas/internal/enforcement-policy.schema.json` `defaultState` → `const`. Test count: 143 in `scripts/test-enforcement-policy-store.js`.

---

## 2026-07-06 — Lighthouse Priority Helper Qualification

### Decision

Qualify LFM2.5-1.2B-Thinking as `qualified` for role `priority_helper`, track `website_audit.lighthouse_handoff`, after evaluating 3 local models (LFM2.5-1.2B-Thinking, llama3.2, LFM2.5-350M) against a 12-scenario Benchmark Lab suite. Create a custom benchmark track `lighthouse-priority-helper` with output schema, evaluation rubric, mock responses, and custom runner. Promote evidence, generate model card, generate qualification record.

### Why

Before this slice, no companion server runtime track had a `qualified` model capability — the primary blocker for the Pilot Enforcement Validation slice. The `website_audit.lighthouse_handoff` track and `priority_helper` role were the natural first candidates because Lighthouse Handoff is the project's first proof workflow and already exercised in the codebase. LFM2.5-1.2B-Thinking was selected as the best candidate (91.7% pass rate, ~40s runtime — strong accuracy-to-latency ratio versus llama3.2's ~6min runtime at 75% score or 350M's 2 invented-audit failures). The model card and qualification record follow existing Benchmark Lab conventions.

### Consequences

- Custom benchmark track created at `benchmark-lab/locaily/tracks/lighthouse-priority-helper/` with 12 scenarios, output schema, evaluation rubric, mock responses
- Custom runner (`benchmark-lab/engine/runners/lighthouse-priority-runner.js`) and CLI (`benchmark-lab/engine/cli/lighthouse-priority-run.js`)
- Three model evaluations completed: llama3.2 (9 PASS/2 PARTIAL/1 FAIL, ~6min), LFM2.5-1.2B-Thinking (11 PASS/1 FAIL, ~40s), LFM2.5-350M (9 PASS/1 PARTIAL/2 FAIL, ~8s)
- Evidence promoted: `lfm25-1p2b-thinking-lighthouse-priority-v1` (summary + approved + checksums)
- Model card generated: `benchmark-lab/model-cards/published/lfm25-1p2b-thinking-local.source.json` + `.md`
- Qualification record generated: `benchmark-lab/qualifications/models/lfm25-1p2b-thinking-local-lfm25-1p2b-thinking-lighthouse-priority-v1.json` — status `qualified`, score 0.9167
- Local Brain now reports `qualified: 1` for `website_audit.lighthouse_handoff` and `priority_helper` (from 4 total records, 2 qualified)
- First prerequisite for Pilot Enforcement Validation met (qualified companion track capability)
- All existing tests pass: 14/14 schemas, 25 resolver tests, 149 store tests, 62 policy tests, 91 routing tests, 31 shadow routing tests, 56/56 smoke tests
- Enforcement remains disabled for all tracks — second prerequisite (shadow routing evidence) not yet accumulated
- No existing evidence, qualification records, or checksums modified

### Status

Confirmed.

### Notes

Custom runner uses `npm.cmd run lighthouse-priority:run` and `npm.cmd run lighthouse-priority:test`. Template for future model qualification work: companion track → benchmark suite → mock test → live evaluation across candidates → evidence promotion → model card → qualification record → verification.

---

## 2026-07-06 — Lighthouse Shadow Readiness: 33 Actionable Comparisons, Pilot Readiness Review

### Decision

Collect shadow-routing evidence for the qualified model capability lfm25-1p2b-thinking-local (track `website_audit.lighthouse_handoff`, role `priority_helper`) and assess pilot readiness. The existing `GET /enforcement/pilot` read-only endpoint was already implemented — the assessment adds a human review artifact at `benchmark-lab/evidence/reviews/lighthouse-shadow-pilot-readiness-v1.json` with verdict `ready-with-conditions`.

### Why

Pilot Enforcement Validation requires two prerequisites: (1) a qualified model capability (met in previous slice) and (2) sufficient shadow routing evidence (12+ actionable comparisons, target 15). 33 actionable comparisons collected across 18 evaluation cases + 9 consistency trials + 5 qualified-model runs + 1 earlier workflow run. Evidence shows the shadow router consistently recommends the qualified model (33/33 disagree — expected because the runtime model name differs from the manifest id).

### Status

Confirmed. Pre-pilot actions documented: approve track and set state to eligible.

### Notes

- Policy file `data/policy/enforcement-policy.json` contained stale `expiresAt` fields on overrides (non-conforming to schema), causing `loadError` with `enforcementLocked: true`. Fixed by removing `expiresAt` from all 3 overrides.
- All 33 actionable comparisons are `disagree` because the shadow router compares manifest ids (`lfm25-1p2b-thinking-local` vs `llama3.2`), not runtime model names. This is correct behavior — the models are genuinely different.
- 3 non-actionable `recommendation-unavailable` records from pre-qualification era remain unchanged.
- Pilot readiness test script: `scripts/test-pilot-readiness.js` (13/13 pass).
- Existing suites: 149 store tests, 62 policy tests, 91 routing tests — all pass with no regressions.

---

## 2026-07-08 — Enforcement Uses Qualification Runtime Model Names

### Decision

Guarded enforcement keeps stable capability ids in policy and evidence, but runtime readiness checks and model execution use the qualification record's `subject.runtimeModelName` when present.

### Why

The first pilot capability is identified as `lfm25-1p2b-thinking-local`, while Ollama exposes the executable model as `hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest`. Checking or executing the stable capability id directly caused the `eligible -> enforced` gate to fail with `MODEL_NOT_READY`, even though the tested runtime model was installed and ready.

### Consequences

- Capability registry and qualification resolver expose `runtimeModelName`.
- Shadow recommendations carry `recommendedRuntimeModelName`.
- Enforcement gates check runtime/model readiness against `runtimeModelName`.
- Applied enforcement executes `runtimeModelName` but records `executedCapabilityId=lfm25-1p2b-thinking-local`.
- Track Run Records now allow `recommendedRuntimeModelName` and enforcement `checks`.
- First pilot for `website_audit.lighthouse_handoff` / `priority_helper` is active and produced 10/10 monitored successful enforced executions.

### Status

Confirmed.

### Notes

Do not rewrite approved qualification artifacts just to align model ids with runtime names. Stable ids and runtime names are separate fields by design.

---

## 2026-07-08 — Human Reviews Are Separate Evidence Records

### Decision

Store human output-quality reviews and corrections as separate records keyed by `trackRunId`, not as mutations to Track Run Records or model outputs.

### Why

Pilot enforcement proved routing and execution, but not judgment quality. Locaily needs to preserve the model-generated output exactly as evidence while allowing a human reviewer to mark usefulness, accuracy, structure, clarity, risk, verdict, failure reasons, and corrections.

### Consequences

- Review records live under `data/evidence/human-reviews/`.
- `POST /runs/:id/review` creates or updates the separate review layer.
- `GET /runs/:id/review` reads the review layer.
- `GET /enforcement/quality-summary` aggregates human-reviewed quality independently from enforcement success.
- Track Run Records and `routing.enforcementDecision` remain immutable for review purposes.
- A run can be transport-successful and enforcement-successful while receiving a human `needs_edit` or `fail` verdict.

### Status

Confirmed.

### Notes

This is the evidence foundation only. No UI was added.

---

## 2026-07-08 - Lighthouse Quality Gate Uses Review Packets

### Decision

Use a one-command human gate packet for Lighthouse pilot output-quality review instead of requiring operators to crawl Track Run Record JSON or hand-write review API calls.

### Why

The human reviewer should judge a readable packet with draft verdicts, risk flags, safe passes, and exceptions. Transport success, enforcement success, and quality judgment remain separate, but the operator workflow must be compact enough to repeat.

### Consequences

- `npm.cmd run quality-gate:lighthouse -- --dry-run` generates Markdown and JSON gate artifacts under `benchmark-lab/evidence/reviews/`.
- Deterministic draft reviews are proposals, not final claims of model quality.
- `--approve-safe` may write review records only for low-risk proposed passes with no correction required.
- `needs_edit`, `fail`, critical-risk, and risk-flagged runs remain human-attention items.
- Track Run Records and model output remain immutable.

### Status

Confirmed.

### Notes

The current packet found 11 enforced Lighthouse pilot candidate runs and recommended `continue`; the human still owns the gate decision.

---

## 2026-07-08 - Lighthouse Assembly Validation Is Adjacent-Role Evidence

### Decision

Add `developer_task_writer` as an adjacent Lighthouse Handoff role that consumes validated `priority_helper` output, but do not treat it as global enforcement or broad model qualification.

### Why

The enforced `priority_helper` path proves routing and priority selection for one qualified capability. Coding-agent-ready assembly is a separate quality layer: tasks, acceptance criteria, guardrails, and testing checklist items must be evaluated against the actual Lighthouse/Priority Helper evidence.

### Consequences

- The Lighthouse track now includes `write_developer_tasks` after priority-fix validation.
- Human gate packets inspect developer task packet completeness before safe approval.
- `developer_task_writer` can pass an assembly pilot without being globally enforced.
- Broader role qualification or model expansion requires a separate explicit decision and evidence set.

### Status

Confirmed.

### Notes

The first assembly pilot passed 20/20 latest real-URL gated runs with 0 fails, 0 critical risks, and 0 corrections.

---

## 2026-07-11 — Milestones 2-4 Roadmap

### Decision

Define three major post-Lighthouse milestones: M2 (Multi-Track Qualification & Enforcement), M3 (Dynamic Track Planning & DAG Execution), and M4 (Relay Nodes & Distributed Capability Network). Documented in `docs/07-progress/roadmap-milestones-2-3-4.md`.

### Why

The Lighthouse Handoff product loop is complete. The infrastructure (track runner, enforcement, qualification engine, Benchmark Lab) supports expansion. The next logical steps are: broaden coverage across more tracks (M2), move from linear to graph execution (M3), and distribute across devices (M4). These map directly to the north star of a local capability network.

### Status

Confirmed — M2 implemented. Awaiting direction on M3 or next work.

### Notes

M2 and M3 are independent and can be worked in either order or parallel. M4 benefits from M3 but does not require it. Each milestone has its own stop conditions, acceptance criteria, and effort estimate in the roadmap doc.

---

## 2026-07-11 — M2: Multi-Track Qualification & Enforcement Complete

### Decision

Completed M2 milestone: qualified llama3.2 for 4 new roles across 4 tracks (a11y_analyzer, budget_analyzer, seo_analyzer, default_worker/dealsniper). Created Benchmark Lab suites for each track. Built qualification dashboard endpoint. Set all 4 new tracks to shadow enforcement.

### Why

Three website audit tracks (accessibility_deep, performance_budget, seo_audit) and DealSniper had structural scaffolding (schemas, prompts, track JSONs, model role mappings) but no qualified model roles. Benchmark Lab suites were needed to evaluate structured output quality. Llama3.2 passed 10/10 scenarios across all 4 suites with score 1.0.

### Consequences

- 2 models now qualified (lfm25-1p2b-thinking-local + llama3.2-local)
- 6 total qualified capabilities across 5 tracks
- 4 new tracks in shadow enforcement mode, collecting routing evidence
- New `GET /qualifications/dashboard` endpoint for consolidated view
- New `quality-gate:website-audit` script for output validation
- All existing tests continue to pass

### Status

Confirmed.

### Notes

M2 acceptance criteria met: 3 new website audit tracks qualified (a11y, budget, seo), DealSniper qualified, 2 models qualified (llama3.2 + lfm25-1p2b-thinking), all tests pass. The operator-log-* tracks remain unqualified (they depend on editorial-pack with Memory Bridge vault). The recommender roles (a11y_recommender, budget_recommender, seo_recommender) remain at screening status pending additional Benchmark Lab suites.

---

## 2026-07-11 - M5: Multi-Device Workflow Coordination (Placement + Distributed Execution)

### Decision

Extend M4 Relay Nodes from single-step routing into coordinated multi-device workflow execution: the orchestrator computes a step-to-node placement plan across healthy relay nodes and executes each step on its assigned device, falling back locally when an assigned node fails. Add a placement planner (`companion/relay/placement.js`) and `POST /relay/plan` preview, and route via `executeStepWithAssignedNode`.

### Why

M4 proved a single step can be offloaded to one relay node with local fallback. The north star is a local capability network where work is distributed across devices; coordinating whole workflows (not just one step) across multiple capable devices is the natural next capability and reuses the M4 registry/connector/router.

### Status

Confirmed.

### Notes

- Single orchestrator, ephemeral relay nodes; no distributed consensus or global scheduler.
- Placement is capability + health + least-loaded; no latency/bandwidth awareness (deferred).
- Tool steps always execute locally (relay nodes are model-capability targets only).
- `distribute` policy is the M5 coordination path; M4 policies (`prefer_relay`, `route_if_unavailable`) remain per-step dynamic decisions and are unchanged.
- Failed node is marked unhealthy for 60s (registry stale window); fallback is per-step local with `RELAY_FALLBACK` audit. No data loss.

---

```md
## YYYY-MM-DD — Title
### Decision
### Why
### Status
Confirmed / Experimental / Revisit Later
### Notes
```
