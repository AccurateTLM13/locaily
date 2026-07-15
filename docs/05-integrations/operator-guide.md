# Locaily Operator Guide

A step-by-step guide for installing, starting, running, and stopping the Locaily Local Brain on your machine.

---

## 1. Prerequisites

Before you begin, make sure you have:

- **Node.js 18 or newer** — download from [https://nodejs.org/](https://nodejs.org/)
- **npm** (included with Node.js)
- **Ollama** (optional but recommended) — download from [https://ollama.com/](https://ollama.com/)

Verify Node.js is installed:

```powershell
node --version
```

The output should show `v18.x.x` or higher.

---

## 2. One-time Setup

From the repository root, run the Windows install script:

```powershell
.\scripts\install-windows.ps1
```

The script will:

1. **Check Node.js** — confirms Node.js 18+ is available on your PATH.
2. **Install dependencies** — runs `npm install` to download required packages.
3. **Create runtime config** — copies `config.example.json` to `companion/config.json` (stripping comments). If `companion/config.json` already exists, it is left untouched.
4. **Check Ollama** — tests whether Ollama is reachable at `http://127.0.0.1:11434`. A warning here is not fatal; you can install or start Ollama later.

After the script finishes, it prints next steps. If you plan to use model-backed features, pull a model:

```powershell
ollama pull llama3.2
```

For full configuration options, see [`config.example.json`](../../config.example.json).

---

## 3. Starting the Server

Start the Local Brain with either method:

**Option A — Direct:**

```powershell
node companion/server.js
```

**Option B — Windows batch launcher:**

```powershell
.\start-windows.bat
```

Both start the server on `http://127.0.0.1:31313` by default.

### What healthy startup looks like

When the server starts successfully, you will see output similar to:

```
Local AI Platform
Server URL: http://127.0.0.1:31313
Canonical API: POST /tasks/run
Track API: POST /tracks/run
Workflow API: POST /workflows/plan, POST /workflows/run
Jobs API: POST /jobs, GET /jobs, GET /jobs/:id, ...
Compatibility API: POST /analyze
Active provider: ollama
Provider status: available
Provider endpoint: http://127.0.0.1:11434
Model profile: Balanced (balanced)
Default model role: default_worker
Selected model: llama3.2 (ready)
Registered tools: 17
Smoke test: node scripts\smoke-test.js
```

Key things to check:

- **Provider status** should say `available` if Ollama is running.
- **Selected model** should say `(ready)` if the model has been pulled.
- **Registered tools** shows how many tools are loaded.

### Verify with the health endpoint

Open a new terminal and run:

```powershell
curl http://127.0.0.1:31313/health
```

Or open `http://127.0.0.1:31313/health` in your browser. A healthy response includes `"ok": true`, `"status": "running"`, and lists your registered tools.

---

## 4. Running a Lighthouse Handoff

Lighthouse Handoff converts PageSpeed/Lighthouse report data into developer-ready handoff notes. It is Locaily's primary workflow.

### Using the canonical endpoint

Send a `POST` request to `/tasks/run`:

```powershell
curl -X POST http://127.0.0.1:31313/tasks/run ^
  -H "Content-Type: application/json" ^
  -d "{\"tool\":\"lighthouse-handoff\",\"task\":\"analyze-report\",\"input\":{\"url\":\"https://example.com\",\"scores\":{\"performance\":65,\"accessibility\":82,\"best-practices\":90,\"seo\":85}}}"
```

**Sample request body:**

```json
{
  "tool": "lighthouse-handoff",
  "task": "analyze-report",
  "input": {
    "url": "https://example.com",
    "scores": {
      "performance": 65,
      "accessibility": 82,
      "best-practices": 90,
      "seo": 85
    },
    "opportunities": [],
    "diagnostics": []
  }
}
```

**Sample response (success):**

```json
{
  "ok": true,
  "run_id": "run-abc123",
  "trace_id": "trace-xyz789",
  "tool": "lighthouse-handoff",
  "task": "analyze-report",
  "provider": "ollama",
  "model": "llama3.2",
  "result": {
    "executiveSummary": "...",
    "priorityFixes": [],
    "handoffNotes": "..."
  },
  "meta": {}
}
```

If Ollama is not running or no model is available, the tool returns a deterministic fallback result so you can still see the expected output shape.

### Using the legacy endpoint

Existing clients can use `POST /analyze` instead:

```powershell
curl -X POST http://127.0.0.1:31313/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"tool\":\"lighthouse-handoff\",\"task\":\"analyze-report\",\"input\":{\"url\":\"https://example.com\",\"scores\":{\"performance\":65}}}"
```

### Chrome extension client

The primary client for Lighthouse Handoff is the Chrome extension: [https://github.com/mnfrdrsh/lighthouse-handoff](https://github.com/mnfrdrsh/lighthouse-handoff). The extension captures PageSpeed data and sends it to your local Local Brain for processing.

For full endpoint details, request/response schemas, and error codes, see the [API Reference](api-reference.md).

---

## 5. Viewing the Operator Console

The Local Brain includes a browser-based operator console for running validations and monitoring status.

Open your browser and navigate to:

```
http://127.0.0.1:31313/operator
```

### What you will see

The console has the following sections:

- **Lighthouse Handoff launcher** — enter a URL, select a mode (Standard, Local AI, or Local AI + Memory), and click **Run Validation**. You can also paste a raw PageSpeed JSON report if you do not have a PageSpeed API key.
- **Readiness checklist** — shows whether the Local Brain, Ollama, tools, and Memory Bridge are ready.
- **Run Timeline** — displays the pipeline steps for the current validation run.
- **Result** — shows the validation outcome and summary fields.
- **Advanced details** (expandable) — includes:
  - **Setup tabs** — add a PageSpeed API key or configure a Memory vault path.
  - **Validation evidence** — detailed output from the most recent run.
  - **Markdown preview** — a preview of the generated handoff document.
  - **Run history** — a list of previous validation runs with a refresh button.

The console communicates with the server through the `/console/*` endpoints. For programmatic access, see the [API Reference](api-reference.md) sections on Console and Benchmark endpoints.

---

## 6. Reading Evidence

Evidence records produced by track runs are stored under:

```
companion/evidence/
```

This directory contains:

- `schemas/` — canonical evidence contracts
- `records/` — local development fixtures and generated runtime records
- `lessons/` — reusable lesson proposals

Evidence is summary-safe by default. Raw user input and full model output are not persisted unless explicitly configured.

### Programmatic access

Use these endpoints to check evidence and qualification status:

**Benchmark Lab status** — qualification records, checksums, and summary:

```powershell
curl http://127.0.0.1:31313/benchmark/status
```

**Qualifications summary** — records grouped by status and role:

```powershell
curl http://127.0.0.1:31313/qualifications/status
```

**Qualifications dashboard** — full view with capabilities, enforcement states, and track status:

```powershell
curl http://127.0.0.1:31313/qualifications/dashboard
```

For the complete list of evidence and qualification endpoints, see the [API Reference](api-reference.md).

---

## 7. Stopping the Server

Press **Ctrl+C** in the terminal where the server is running.

The server will shut down cleanly. If any background jobs were running at the time, they will be flagged as interrupted the next time the server starts. Durable jobs that were in `queued` or `claimed` state will be available for retry.

---

## 8. Troubleshooting

### Ollama is not running

**Symptom:** `GET /health` shows `"available": false` for the runtime. Startup output says `Provider status: unavailable`.

**Fix:** Start Ollama:

```powershell
ollama serve
```

Then restart the Local Brain or send a new request — the server checks Ollama availability on each request.

### Model not pulled

**Symptom:** Startup output says `Selected model: llama3.2 (not ready)`. Requests return `MODEL_UNAVAILABLE`.

**Fix:** Pull the model:

```powershell
ollama pull llama3.2
```

### Port conflict

**Symptom:** Server fails to start with an error like `listen EADDRINUSE: address already in use 127.0.0.1:31313`.

**Fix:** Find and stop the process using port 31313:

```powershell
netstat -ano | findstr :31313
```

Note the PID from the last column, then stop it:

```powershell
taskkill /PID <PID> /F
```

Or start the server on a different port:

```powershell
$env:LOCAL_AI_PORT = "31314"
node companion/server.js
```

### Node.js version mismatch

**Symptom:** The install script reports `ERROR: Node.js vX.X.X found, but >= 18 is required.`

**Fix:** Upgrade Node.js from [https://nodejs.org/](https://nodejs.org/). Version 18 or newer is required.

### Config file missing

**Symptom:** Server starts but uses built-in defaults instead of your configuration.

**Fix:** Run the install script again, or manually copy the example config:

```powershell
.\scripts\install-windows.ps1
```

This creates `companion/config.json` from `config.example.json` if it does not already exist. For configuration details, see [`config.example.json`](../../config.example.json).

---

## Further Reading

- [API Reference](api-reference.md) — full endpoint documentation with request/response examples
- [`config.example.json`](../../config.example.json) — all configuration options with inline comments
- [Lighthouse Handoff workflow](../03-workflows/lighthouse-handoff.md) — detailed workflow documentation
- [Architecture overview](../01-architecture/locaily-overview.md) — system design and component map
