# Local AI Platform

Run one local AI companion. Power many tools.

## What This Is

Local AI Platform is a local-first companion server for structured AI requests from approved clients such as browser extensions, websites, desktop utilities, and developer tools.

The platform is not just DealSniper. DealSniper is the showcase/MVP model-backed tool, Lighthouse Handoff is a deterministic showcase stub, and the Standard Text Pack is the first engine-native pack.

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

`text.validate_schema` and Lighthouse Handoff are deterministic and do not require Ollama. DealSniper and the other text tools are model-backed.

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

Alternate development port:

```powershell
$env:LOCAL_AI_PORT = "31314"
node companion/server.js
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
Smoke test summary: 27/27 checks passed.
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
- The new engine docs mention port `4317`; this repo keeps `31313` for compatibility.
- Audit events are summary-only and do not persist raw input/output by default.
- CORS remains minimal and should be expanded carefully for browser extension testing.

## Documentation

- [Architecture](docs/architecture.md)
- [API contract](docs/api-contract.md)
- [Tool integration guide](docs/tool-integration-guide.md)
- [Current-to-engine implementation plan](docs/current-to-local-ai-engine-implementation-plan.md)
- [Packaging plan](docs/packaging-plan.md)
- [Publish readiness checklist](docs/publish-readiness-checklist.md)
