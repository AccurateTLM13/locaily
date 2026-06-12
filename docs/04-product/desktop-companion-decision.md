# Desktop Companion Decision

## Status

Planning gate complete. Do not start the desktop UI implementation yet.

The core endpoints needed by a future dashboard are now available, so UI planning can proceed without guessing at server contracts. The next UI step should be a prototype only after the remaining core packaging and manifest-loader decisions are stable enough for tester builds.

## Product Direction

The Desktop Companion should be a local control panel, not a chatbot.

Its first job is to answer:

- Is the engine running?
- Which provider and model are active?
- Which tools are installed?
- What happened recently?
- What needs attention?

It should make the local engine visible and understandable without becoming a separate product surface for every tool.

## Tauri vs Electron

Recommended first choice: Tauri.

Reasons:

- Smaller installer footprint for a local utility.
- Better fit for a lightweight control panel around an existing local server.
- Strong Windows packaging story without bundling a full browser runtime.
- Encourages keeping the Node companion server as the platform core instead of hiding logic in the UI.

Electron remains a fallback if the UI later needs heavier Node-side desktop integration, richer extension ecosystems, or if Tauri introduces avoidable Windows setup friction.

Do not choose either framework permanently until a small prototype proves:

- It can start and stop the existing companion server.
- It can call localhost APIs reliably.
- It can show provider/model/tool/audit state.
- It can package cleanly for Windows testers.

## Local API Dependencies

The UI should treat the HTTP API as the source of truth.

Required endpoints:

```txt
GET  /health
GET  /tools
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
GET  /audit
```

Optional developer/test endpoint:

```txt
POST /tasks/run
```

Legacy endpoint support:

```txt
POST /analyze
```

The UI should not depend on `/analyze` except when helping users understand legacy client compatibility.

## Dashboard Data Map

Dashboard card: Engine status

- Endpoint: `GET /health`
- Fields: `ok`, `status`, `service`, `version`, `runtime.provider`, `runtime.available`, `model.name`, `model.ready`, `warning`

Dashboard card: Active provider

- Endpoint: `GET /providers/status`
- Fields: `active_provider`, `providers[].id`, `providers[].status`, `providers[].endpoint`, `providers[].model`, `providers[].model_ready`, `providers[].warning`

Dashboard card: Model roles

- Endpoint: `GET /models/roles`
- Fields: `active_provider`, `roles[].role`, `roles[].label`, `roles[].model`, `roles[].provider`

Dashboard card: Installed tools

- Endpoint: `GET /tools`
- Fields: `tools[].id`, `tools[].name`, `tools[].pack`, `tools[].description`, `tools[].tasks`, `tools[].permissions`, `tools[].model_role`, `tools[].runtime_required`

Dashboard card: Recent runs

- Endpoint: `GET /audit?limit=20`
- Fields: `events[].timestamp`, `events[].source`, `events[].tool`, `events[].task`, `events[].provider`, `events[].model`, `events[].model_role`, `events[].duration_ms`, `events[].status`, `events[].error_code`, `events[].warnings`

Dashboard card: Attention needed

- Endpoints: `GET /health`, `GET /providers/status`, `GET /audit?limit=20`
- Signals:
  - provider unavailable
  - model not ready
  - recent failed runs
  - permission denied errors
  - input gate warnings

## Initial Screens

V1 should stay small:

- Dashboard
- Tools
- Models
- Logs
- Settings

Defer app/client management until connected client identity and approval flows are stronger.

## Required Server Gaps Before UI Build

Before a desktop implementation starts, decide or implement:

- Persistent provider selection instead of in-memory only `POST /providers/set`.
- Persistent model role updates instead of in-memory only `POST /models/roles/set`.
- A permission review endpoint for pending or denied permissions.
- CORS/origin policy for desktop and browser-extension clients.
- Tool pack manifest loading from Phase L.
- Clear behavior for starting/stopping the companion server from a wrapper app.

## Non-Goals For V1

- Do not build a full chat interface.
- Do not bundle large models.
- Do not add network/community marketplace features.
- Do not expose the server beyond localhost by default.
- Do not move core execution logic into the desktop app.

## Decision

Plan for a Tauri-first Desktop Companion after the core API and packaging path stabilize. Keep the companion server as the reusable platform core, and make the UI a thin local control panel over the documented HTTP API.
