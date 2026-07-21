# Locaily — Release Notes

> **Version:** 0.1.0 · **Status:** Pre-release / Developer Preview

---

## What Locaily Is

Locaily is a local-first AI coordination project. The **Local Brain** — a companion server in this repository — runs on your machine, exposes a structured HTTP API, and routes requests to tools, workflows, and local model providers. It coordinates **Tracks** (reusable execution contracts), **The Crew** (specialized workers and capabilities), **Model Lab / Benchmark Lab** (evaluation and qualification), and **Memory Bridge** (optional local context integration). **Relay Nodes** — a planned nearby-device capability layer — will extend this coordination to other hardware on your network.

---

## What Locaily Is Not

- **Not a Chrome extension.** A browser extension client exists for Lighthouse Handoff ([separate repository](https://github.com/mnfrdrsh/lighthouse-handoff)), but Locaily itself is the server-side coordinator.
- **Not a desktop app.** A desktop companion is planned (Tauri-first) but not implemented. Current distribution is a Node.js server with launcher scripts.
- **Not a single-purpose tool.** DealSniper is a showcase model-backed tool — it demonstrates the platform but is not the product centerpiece.
- **Not a cloud service.** Everything runs locally. No data leaves your machine unless you explicitly configure a remote model provider.
- **Not a model hosting platform.** Locaily connects to local model runtimes (currently Ollama) through provider adapters. It does not train, host, or distribute models.

---

## Proven Capabilities

These capabilities are implemented, tested, and backed by code, endpoints, or test suites in this repository.

### Core Server

- **Companion server** starts, binds to `127.0.0.1:31313`, and serves a JSON HTTP API
- **First-run diagnostics** — startup output reports Ollama availability, model readiness, registered tools, and smoke-test guidance
- **Single-command Windows install** via `scripts/install-windows.ps1`
- **Structured response envelope** — all endpoints return consistent `{ ok, result, error, meta }` shapes
- **Legacy compatibility** — both `POST /tasks/run` (canonical) and `POST /analyze` (legacy) are supported

### Tools and Workflows

- **Deterministic Lighthouse Handoff** — produces structured developer handoff notes from Lighthouse/PageSpeed data without requiring a model runtime
- **Model-backed Lighthouse Handoff orchestration** — multi-step track execution when Ollama is available (`website_audit.lighthouse_handoff`)
- **DealSniper listing analysis** — model-backed marketplace listing evaluation (`marketplace.dealsniper`)
- **Standard Text Pack** — manifest-backed engine tools: `text.clean`, `text.summarize`, `text.extract_json`, `text.classify`, `text.detect_injection`, `text.validate_schema`
- **Track system with Crew orchestration** — declarative track definitions with model roles, step input mapping, and multi-step execution
- **Workflow planning and execution** — `POST /workflows/plan` and `POST /workflows/run` with DAG-based step dependency resolution

### Infrastructure

- **Memory Bridge v0** — optional local context integration (`/memory/status`, `/memory/context-pack`, `/memory/writeback/propose`); disabled by default
- **Benchmark Lab Milestone 1** — complete and operator-ready: 14 schemas, mock + Ollama + ToolEvalRuntime adapters, evidence promotion, checksum verification, qualification records, model cards, and CLI workflow
- **Operator console** — validation UI served at `/operator` with dashboard, jobs, relay nodes, and enqueue panels
- **Durable background jobs (M7)** — `POST /jobs` creates persistent background work; jobs survive server restarts
- **Operator control plane (M8)** — cancel, retry, and human-gate review mutation endpoints for job lifecycle management
- **Relay node protocol (M6)** — registry, connector, router, heartbeat, and cross-node step routing with local fallback (authentication layer; trusted-development-network only)
- **Qualification-aware routing** — six-state qualification consumption engine, capability registry, shadow routing comparison, and enforcement policy engine
- **Canonical Track Run Records** — schema-backed evidence records emitted for all runtime execution flows

---

## Experimental / In Progress

These capabilities are under active development. They exist in code but are not claimed as complete or production-ready.

- **Model Lab broader qualification coverage** — Benchmark Lab Milestone 1 is complete, but coverage across additional models, tracks, hardware profiles, and live qualification depth remains incremental.
- **Memory Bridge v1** — search and writeback-apply endpoints exist but are not production-hardened; no embeddings yet.
- **DAG executor** — topological sort and parallel step execution are implemented but the track runner defaults to linear pipeline mode.

## Deferred

These capabilities were scoped but deferred pending hardware, external validation, or a sequenced follow-on objective.

- **Physical multi-device pilot (m09)** — Relay protocol, placement planner, and pilot infrastructure are implemented and tested in simulation. The pilot requires two physical devices and a human operator. Formally deferred — second device unavailable. Re-entry condition: resume when two test devices and an operator are available.
- **Second-repo operator acceptance** — Development Memory E2E is proven in simulation. A real second-repository walkthrough was deferred during lifecycle hardening. Re-entry condition: resume after m10 packaging.

---

## Known Limitations

- **Ollama required for model-backed features.** Without Ollama running, only deterministic tools and fallback paths work.
- **No Docker packaging.** The server runs as a Node.js process; no container image is provided.
- **No npm registry distribution.** Locaily is distributed as a Git repository, not an npm package.
- **Desktop app deferred.** The planned Tauri/Electron companion is not implemented.
- **localhost-only by default.** The server binds to `127.0.0.1` and is not reachable from the network. Remote access requires manual configuration.
- **CORS is minimal.** Browser extension testing may require careful CORS expansion.
- **Memory Bridge v0 is disabled by default** and not production-hardened. Writeback is proposal-only; no automatic vault edits.
- **Benchmark Lab evidence is narrow.** Qualification records exist for specific model/track/role combinations (LFM2.5-1.2B-Thinking for Lighthouse Handoff roles, llama3.2 for website audits and DealSniper). This is not comprehensive coverage across all models and tracks.
- **No telemetry or analytics.** The server does not collect or transmit usage data.
- **Relay trust boundary** — Pre-shared token (Bearer) authentication only — no cryptographic signing or dynamic device pairing. Trusted-development-network only.
- **Fallback ladder is partial.** Retry-once for the same model is supported; full escalation handling is not implemented.

---

## Quick Start

### Requirements

- Node.js 18 or newer
- Ollama (for model-backed features)
- Recommended model: `llama3.2`

### Install and Start

**Windows (single-command install):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-windows.ps1
```

**Manual start:**

```bash
ollama pull llama3.2
node companion/server.js
```

**Windows batch launcher:**

```bat
start-windows.bat
```

### Verify

```bash
curl http://127.0.0.1:31313/health
```

Expected: JSON response with `"ok": true`, `"status": "running"`, runtime status, registered tools, and qualification summary.

### Full Walkthrough

See the [Operator Guide](docs/05-integrations/operator-guide.md) for a complete step-by-step walkthrough covering setup, tool execution, track runs, workflow planning, and operator console usage.

---

## Documentation Map

| Need | Path |
|---|---|
| Operator guide (full walkthrough) | [docs/05-integrations/operator-guide.md](docs/05-integrations/operator-guide.md) |
| API reference | [docs/05-integrations/api-reference.md](docs/05-integrations/api-reference.md) |
| Architecture overview | [docs/01-architecture/locaily-overview.md](docs/01-architecture/locaily-overview.md) |
| Current state (blunt) | [docs/00-start-here/current-state.md](docs/00-start-here/current-state.md) |
| Current vision | [docs/00-start-here/current-vision.md](docs/00-start-here/current-vision.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Track system | [docs/02-track-system/README.md](docs/02-track-system/README.md) |
| API contract | [docs/01-architecture/api-contract.md](docs/01-architecture/api-contract.md) |
| Memory Bridge | [docs/01-architecture/memory-bridge.md](docs/01-architecture/memory-bridge.md) |
| Lighthouse Handoff workflow | [docs/03-workflows/lighthouse-handoff.md](docs/03-workflows/lighthouse-handoff.md) |
| Publish readiness checklist | [docs/05-product/publish-readiness-checklist.md](docs/05-product/publish-readiness-checklist.md) |
| Packaging plan | [docs/05-product/packaging-plan.md](docs/05-product/packaging-plan.md) |

---

*Locaily 0.1.0 — Local-first AI coordination. Run one coordinator. Power many tools.*
