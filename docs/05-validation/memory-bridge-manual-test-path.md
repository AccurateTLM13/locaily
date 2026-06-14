# Manual Integration Test Path — Memory Bridge + Lighthouse Handoff

Run with the companion server on `http://127.0.0.1:31313` and a **local** wiki vault configured per [memory-bridge-local-setup.md](./memory-bridge-local-setup.md).

Writeback stays **disabled** for the first validation (`writeback: false`).

## 1. Smoke baseline

```powershell
node scripts/smoke-test.js
```

Expect `48/48` checks passed.

## 2. Memory status

```http
GET /memory/status
```

Confirm:

- `enabled: true`
- `readable: true`
- `effectiveAllowedPaths` includes `wiki/topics/`, etc.
- `effectiveBlockedPaths` includes `raw/`
- `warnings` empty or informational only
- Response does **not** include absolute `vaultPath`

## 3. Context pack probe

```http
POST /memory/context-pack
Content-Type: application/json

{
  "project": "Lighthouse Handoff",
  "task": "Generate coding-agent handoff from PageSpeed report",
  "maxFiles": 6
}
```

Confirm:

- `filesUsed` lists only allowlisted wiki paths
- `excerpts` are truncated (not full files)
- No `raw/` paths appear

## 4. Lighthouse Handoff — four comparison modes

Use one real Lighthouse/PageSpeed capture as input (see validation script). For each mode, call:

```http
POST /tasks/run
Content-Type: application/json
```

### A. Standard (AI off, memory off)

```json
{
  "tool": "lighthouse-handoff",
  "task": "analyze-report",
  "input": { "url": "...", "scores": {}, "opportunities": [] },
  "options": { "memory": { "enabled": false } }
}
```

Then `compose-handoff` with deterministic metrics (no memory).

### B. Memory-only (AI off, memory on)

```json
{
  "tool": "lighthouse-handoff",
  "task": "compose-handoff",
  "input": { "url": "...", "metrics": {}, "prioritizedFixes": {}, "matchedFixes": {} },
  "options": {
    "memory": {
      "enabled": "auto",
      "project": "Lighthouse Handoff",
      "task": "Generate coding-agent handoff from PageSpeed report",
      "maxFiles": 6,
      "writeback": false
    }
  }
}
```

### C. AI-only (AI on, memory off)

```json
{
  "tool": "lighthouse-handoff",
  "task": "analyze-report",
  "input": { "url": "...", "scores": {}, "opportunities": [] },
  "options": {
    "provider": "mock",
    "execution_mode": "orchestrated",
    "memory": { "enabled": false }
  }
}
```

### D. AI + Memory (AI on, memory on)

Run orchestrated `analyze-report` (mock), then `compose-handoff` with `memory.enabled: "auto"`.

## 5. Audit redaction check

```http
GET /audit?limit=30
```

For each `memory-bridge` event and Lighthouse events with `output_summary.memory`:

- Must include: `contextPackId`, `filesUsed`, `warnings` (when applicable)
- Must **not** include: `excerpts`, full `summary`, `vaultPath`, writeback body fields

## 6. Optional writeback inbox test (manual, after review)

Only after read/context validation passes:

```http
POST /memory/writeback/propose
```

Review the file in `{vault}/.memory-bridge/writeback-inbox/` manually. Do **not** call `/memory/writeback/apply`.

## Automated helper

```powershell
node scripts/memory-bridge-lighthouse-validation.js
```

Writes local artifacts under `data/validation/` (gitignored). Summarize results in [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md).
