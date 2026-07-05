# Locaily

Run one local AI coordinator. Power many tools and workflows.

## What This Is

**Locaily** is a local-first AI coordination project. The **Local Brain** (companion server in this repo) runs on your machine, exposes a small HTTP API, and routes structured requests to tools, workflows, and local model providers.

```txt
Locaily
├─ Local Brain        — coordinator and runtime (companion/server.js)
├─ Tracks             — reusable execution contracts
├─ The Crew           — specialized workers and capabilities (formerly AI Pit Crew)
├─ Model Lab          — evaluation and qualification layer
│  └─ Benchmark Lab   — evidence and qualification subsystem (benchmark-lab/)
├─ Relay Nodes        — nearby-device capability layer (planned)
├─ Memory Bridge      — controlled local context integration
└─ Lighthouse Handoff — first practical workflow / test bench
```

This repo is not a single Chrome extension or one demo tool. **DealSniper** is a showcase model-backed tool. **Lighthouse Handoff** is the first workflow test bench (deterministic fallback plus orchestrated AI when a runtime is available). The **Standard Text Pack** is the first manifest-backed engine pack.

**Model Lab** is the public Locaily architecture layer for evaluating and qualifying models. **Benchmark Lab** is the concrete repository subsystem that powers it — CLI evaluation commands, 13 schemas, mock + Ollama adapters, evidence promotion, checksum verification, and qualification records. Benchmark Lab Milestone 1 is complete and operator-ready. Broader coverage across additional models, Tracks, hardware profiles, and live qualification depth remains incremental.

The active build slice is **Canonical Track Run Records** — the first Track Learning Evidence Loop implementation step.

**Lighthouse client:** https://github.com/mnfrdrsh/lighthouse-handoff

**Docs entry point:** [docs/00-start-here/README.md](docs/00-start-here/README.md)

## Current API Shape

Default local server:

```txt
http://127.0.0.1:31313
```

Canonical engine endpoint for new clients:

```txt
POST /tasks/run
```

Legacy compatibility endpoint for existing clients:

```txt
POST /analyze
```

`/analyze` remains supported and keeps its legacy envelope. New tools and clients should prefer `/tasks/run`.

## Implemented Endpoints

```txt
GET  /health
GET  /tools
GET  /tracks
POST /tracks/run
GET  /orchestration/tracks
GET  /orchestration/workflows
POST /workflows/plan
POST /workflows/run
POST /tasks/run
GET  /audit
GET  /scoreboard
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
GET  /models/profiles
POST /models/profiles/set
GET  /memory/status
POST /memory/context-pack
POST /memory/writeback/propose
GET  /benchmark/status
GET  /console/status
POST /console/run-validation
POST /console/setup/pagespeed-key
POST /console/setup/memory-vault
GET  /console/runs
POST /analyze          legacy compatibility
```

## Implemented Core

```txt
companion/
  server.js          — Local Brain HTTP server
  config.json
  core/              — input gate, context, permissions, validator, audit, model-profiles
  crew/              — track orchestrator, input maps, model/tool routers, track files
  orchestration/     — workflow registry, run plan builder/executor
  providers/         — provider router (Ollama + mock)
  runtime/           — Ollama adapter
  tools/             — tool registry, showcase tools
  memory/            — Memory Bridge v0
  console/           — local validation UI

benchmark-lab/
  engine/            — CLI entrypoints, runners, adapters, scorers, reporters
  locaily/           — Locaily-specific suites, fixtures, prompts
  schemas/           — 13 benchmark schemas with validation
  evidence/          — curated, checksummed approved evidence
  qualifications/    — runtime-facing qualification records
  model-cards/       — published model cards
  reports/           — published reports
  models/            — model manifests
  validators/        — contract and schema validators
  configs/           — lab configuration
  contracts/         — benchmark-facing validation contracts

tool-packs/
  standard-text-pack/
  lighthouse-parser-pack/

scripts/
  smoke-test.js
  contract-test.js
  benchmark-lab-schema-test.js
  benchmark-lab-run-test.js
  benchmark-status-smoke-test.js
  benchmark-lab-tool-eval-test.js

templates/
  memory-vault/      — starter vault template
```

## Included Tools

Showcase tools:

```txt
deal-sniper
lighthouse-handoff
```

Standard Text Pack:

```txt
text.clean
text.summarize
text.extract_json
text.classify
text.detect_injection
text.validate_schema
```

`text.validate_schema` and Lighthouse Handoff's deterministic path do not require Ollama. Lighthouse Handoff can also run multi-step orchestration when a runtime is available. DealSniper and the other text tools are model-backed.

## How To Run

Requirements:

- Node.js 18 or newer
- Ollama for live model-backed local analysis
- Recommended model: `llama3.2`

Install/pull the model:

```bash
ollama pull llama3.2
```

Start the server:

```bash
node companion/server.js
```

Windows helper:

```bat
start-windows.bat
```

PowerShell development helper:

```powershell
.\start-dev.ps1
```

Alternate development port:

```powershell
.\start-dev.ps1 -Port 31314
```

On startup, the server prints the local URL, canonical API endpoint, active provider, provider availability, default model role, selected model readiness, registered tool count, and the smoke-test command.

If port `31313` is already in use, either stop the existing server process or start on another port:

```powershell
netstat -ano | findstr :31313
.\start-dev.ps1 -Port 31314
```

## Smoke Test

With the server running:

```bash
node scripts/smoke-test.js
```

If using an alternate port:

```powershell
$env:LOCAL_AI_BASE_URL = "http://127.0.0.1:31314"
node scripts/smoke-test.js
```

Expected: all checks pass. See the latest progress log or CI evidence for current counts. Memory Bridge checks pass with memory disabled in default `companion/config.json`.

## Non-Live Validation

Benchmark Lab framework changes do not require a live Ollama:

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
```

## Example `/tasks/run`

```json
{
  "tool": "text.validate_schema",
  "input": {
    "data": {
      "title": "Example"
    },
    "schema": {
      "type": "object",
      "required": ["title"]
    }
  },
  "context": {
    "source": "example-client"
  },
  "options": {}
}
```

## Example Legacy `/analyze`

```json
{
  "tool": "deal-sniper",
  "task": "analyze-listing",
  "input": {
    "title": "Used Honda Generator",
    "price": 450,
    "description": "Runs good, pickup only."
  }
}
```

## Notes

- The server binds to localhost by default.
- Some older docs mention port `4317`; this repo keeps `31313` for compatibility.
- Audit events are summary-only and do not persist raw input/output by default.
- CORS remains minimal and should be expanded carefully for browser extension testing.

## Project Policies

- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [License](LICENSE)

## Documentation

Start at [docs/00-start-here/README.md](docs/00-start-here/README.md). **Blunt status:** [docs/00-start-here/current-state.md](docs/00-start-here/current-state.md).

- [Track system](docs/02-track-system/README.md)
- [Build status / next agent brief](docs/07-progress/next-agent-brief.md)
- [Current vision](docs/00-start-here/current-vision.md)
- [Repo map](docs/00-start-here/repo-map.md)
- [Architecture overview](docs/01-architecture/locaily-overview.md)
- [Memory Bridge](docs/01-architecture/memory-bridge.md)
- [API contract](docs/01-architecture/api-contract.md)
- [Lighthouse Handoff workflow](docs/03-workflows/lighthouse-handoff.md)
- [Lighthouse validation record](docs/03-workflows/lighthouse-handoff-validation.md)
- [Client integration guide](docs/08-agents/client-integration-guide.md)
- [Agent context](docs/08-agents/agent-context.md)
- [Roadmap](docs/05-product/roadmap.md)
- [Packaging plan](docs/05-product/packaging-plan.md)
- [Publish readiness checklist](docs/05-product/publish-readiness-checklist.md)

## The Crew Thesis

Locaily explores whether multiple small local models, tools, rules, and validators—coordinated by **The Crew** strategy (formerly "AI Pit Crew")—can complete useful workflows without always defaulting to one large general-purpose model.

Instead of treating model size as the primary measure of capability, the system treats each task as a **track**. Each track can decompose into smaller jobs routed to the best available model role, tool pack, ruleset, or verifier.

**Device = capability. Not every node needs a model; every node needs a connector.**

This architecture supports:

- tiny local models and model roles
- task decomposition and orchestration
- tool packs and structured outputs
- fallback handling and validation
- older hardware reuse
- future **Relay Node** capability connectors

Do not claim benchmark wins without measured data in the repo.
