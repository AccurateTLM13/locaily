# Locaily

Run one local AI coordinator. Power many tools and workflows.

## What This Is

**Locaily** is a local-first AI coordination project. The **Local Brain** (companion server in this repo) runs on your machine, exposes a small HTTP API, and routes structured requests to tools, workflows, and local model providers.

```txt
Locaily
├─ Local Brain        — coordinator (this repo: companion/server.js)
├─ NearbyNode         — nearby device/capability layer (planned)
├─ AI Pit Crew        — specialized model/tool/task-track strategy
└─ Lighthouse Handoff — first practical workflow / test bench
```

This repo is not a single Chrome extension or one demo tool. **DealSniper** is a showcase model-backed tool. **Lighthouse Handoff** is the first workflow test bench (deterministic fallback plus orchestrated AI when a runtime is available). The **Standard Text Pack** is the first manifest-backed engine pack.

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
POST /tasks/run
GET  /audit
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
POST /analyze       legacy compatibility
```

## Implemented Core

```txt
companion/
  server.js
  config.json
  core/
    audit-log.js
    context.js
    envelope.js
    ids.js
    input-gate.js
    model-roles.js
    orchestrator.js
    permissions.js
    result-validator.js
  providers/
    router.js
  runtime/
    ollama.js
  tools/
    deal-sniper.js
    lighthouse-handoff.js
    registry.js
    standard-text.js
tool-packs/
  standard-text-pack/
scripts/
  smoke-test.js
  contract-test.js
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

Expected current result:

```txt
Smoke test summary: 28/28 checks passed.
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
- No `package.json` is required yet; helper scripts call Node directly.

## Documentation

Start at [docs/00-start-here/README.md](docs/00-start-here/README.md).

- [Current vision](docs/00-start-here/current-vision.md)
- [Project index](docs/00-start-here/project-index.md)
- [Architecture overview](docs/01-architecture/locaily-overview.md)
- [API contract](docs/01-architecture/api-contract.md)
- [Lighthouse Handoff workflow](docs/02-workflows/lighthouse-handoff.md)
- [Lighthouse validation record](docs/02-workflows/lighthouse-handoff-validation.md)
- [Client integration guide](docs/05-agents/client-integration-guide.md)
- [Agent context](docs/05-agents/agent-context.md)
- [Roadmap](docs/04-product/roadmap.md)
- [Packaging plan](docs/04-product/packaging-plan.md)
- [Publish readiness checklist](docs/04-product/publish-readiness-checklist.md)

## AI Pit Crew Thesis

Locaily explores whether multiple small local models, tools, rules, and validators—coordinated by the **AI Pit Crew** strategy—can complete useful workflows without always defaulting to one large general-purpose model.

Instead of treating model size as the primary measure of capability, the system treats each task as a **track**. Each track can decompose into smaller jobs routed to the best available model role, tool pack, ruleset, or verifier.

**Device = capability. Not every node needs a model; every node needs a connector.**

This architecture supports:

- tiny local models and model roles
- task decomposition and orchestration
- tool packs and structured outputs
- fallback handling and validation
- older hardware reuse
- future **NearbyNode** capability connectors

Do not claim benchmark wins without measured data in the repo.
