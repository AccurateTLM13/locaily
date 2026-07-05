# Setup Flow

How to run Locaily's Local Brain today (developer / tester path).

No cloud hosting, Vercel deployment, or production setup is required. Everything runs locally.

## Requirements

### Core runtime (always needed)

- Node.js 18+
- `node companion/server.js`

### Optional for live model-backed tools

- Ollama (`http://127.0.0.1:11434`)
- A pulled and configured model (e.g. `llama3.2` — not proven optimal for all tracks)

### Optional for workflows

- PageSpeed Insights API key (for live Lighthouse capture)
- Memory Bridge vault (local Markdown folder; see [templates/memory-vault/](../../templates/memory-vault/README.md))
- Chrome extension client (separate repo)

## Quick Start

```bash
node companion/server.js
```

Windows:

```bat
start-windows.bat
```

PowerShell dev helper:

```powershell
.\start-dev.ps1
```

Alternate port:

```powershell
.\start-dev.ps1 -Port 31314
$env:LOCAL_AI_BASE_URL = "http://127.0.0.1:31314"
```

## Verify

### Non-live validation (no Ollama required)

```bash
node scripts/contract-test.js
node scripts/benchmark-lab-schema-test.js
node scripts/benchmark-lab-run-test.js
```

### Requires running companion

```bash
node scripts/smoke-test.js
node scripts/benchmark-status-smoke-test.js
```

No specific test-count baseline is stated here — counts change as the suite evolves. Run the suite and check for zero failures.

## Client Integration

1. `GET /health`
2. `GET /tools`
3. `POST /tasks/run` (preferred) or legacy `POST /analyze`

See [../08-agents/client-integration-guide.md](../08-agents/client-integration-guide.md).

## Failure States

| State | Symptom | Resolution |
|-------|---------|------------|
| Local Brain unavailable | `GET /health` fails or connection refused | Start `node companion/server.js` |
| Ollama unavailable | `/health` shows `runtime.available: false` | Start Ollama or use deterministic tools |
| Model missing | `/health` shows `model.ready: false` | `ollama pull <model>` |
| Memory Bridge disabled | `GET /memory/status` shows `enabled: false` | Configure `memoryBridge` in `companion/config.json` |
| PageSpeed key missing | `PAGESPEED_API_KEY` not set | Deterministic fallback used; no live capture |
| Qualification unavailable | `GET /benchmark/status` shows no records | Standard deterministic mode used |
| Port conflict | Server fails to start on 31313 | Use alternate port via `LOCAL_AI_PORT` |

## Packaging Stages

| Stage | Status | Audience |
|---|---|---|
| Developer clone + terminal | **Current** | Contributors, agents |
| Tester-friendly launchers | Partial (`start-windows.bat`, `start-dev.ps1`) | Early testers |
| Desktop installer | Not started | Normal builders |

Detail: [packaging-plan.md](./packaging-plan.md)

## Known Friction

- Requires terminal comfort today
- Separate Ollama install and model pull
- Port conflicts on `31313` require manual resolution
- Memory Bridge vault must be configured and managed manually
- No automatic model download or memory configuration

## Future (Not Implemented)

- One-click Desktop Companion installer
- Guided first-run wizard
- Relay Node setup flow
