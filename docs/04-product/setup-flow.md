# Setup Flow

How to run Locaily's Local Brain today (developer / tester path).

## Requirements

- Node.js 18+
- Ollama (for live model-backed tools)
- Recommended model: `llama3.2` (not proven optimal for all tracks)

## Quick Start

```bash
ollama pull llama3.2
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

```bash
node scripts/smoke-test.js
```

Expected (current): `27/27` checks passed when server is healthy.

## Client Integration

1. `GET /health`
2. `GET /tools`
3. `POST /tasks/run` (preferred) or legacy `POST /analyze`

See [../05-agents/client-integration-guide.md](../05-agents/client-integration-guide.md).

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
- No `package.json` yet—Node invoked directly
- Port conflicts on `31313` require manual resolution

## Future (Not Implemented)

- One-click Desktop Companion installer
- Guided first-run wizard
- NearbyNode pairing flow
