# Current-to-Engine Implementation Plan

## Purpose

This plan compares the current Local AI Platform implementation with the expanded `docs/new-local-ai-engine-dev-docs/` vision, then defines a staged path from the current working server to the completed Local AI Engine Core.

The important constraint: do not throw away the current working MVP. Build forward from it.

## Current Baseline

The current repo already has a working minimal local companion:

```txt
companion/
  server.js
  config.json
  runtime/
    ollama.js
  tools/
    registry.js
    deal-sniper.js
    lighthouse-handoff.js
  prompts/
    deal-sniper.md
    lighthouse-handoff.md
  schemas/
    deal-sniper.schema.json
    lighthouse-handoff.schema.json
scripts/
  smoke-test.js
```

Implemented today:

- `GET /health`
- `POST /analyze`
- JSON body parsing and bad JSON handling
- Unknown route JSON errors
- Ollama availability and model readiness checks
- Runtime adapter for Ollama
- Static tool registry
- DealSniper model-backed tool
- Lighthouse Handoff deterministic stub/demo tool
- Standard `/analyze` success/error envelope
- Smoke test covering the main current MVP paths

Known current gaps:

- No `/tasks/run` v2 API yet
- No `/tools` endpoint yet
- No context packet
- No permission manager
- No audit log
- No provider router beyond direct Ollama adapter
- No model role manager
- No fallback router
- No input gate
- No tool pack manifest loader
- No standard text pack
- No desktop companion

## New Docs Target

The new docs define a broader **Local AI Engine Core**:

```txt
Apps / Clients
  -> Input Gate
  -> Context Handler
  -> Task Router
  -> Tool Registry
  -> Provider Router
  -> Model Role Manager
  -> Result Validator
  -> Fallback Router
  -> Audit Log
```

Recommended new API:

```txt
GET  /health
GET  /tools
POST /tasks/run
GET  /audit
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
```

Recommended first official tool pack:

```txt
standard-text-pack:
  text.clean
  text.summarize
  text.extract_json
  text.classify
  text.detect_injection
  text.validate_schema
```

Major architectural additions:

- Result envelope with `run_id`, `trace_id`, `model_role`, `confidence`, `warnings`, and `fallbacks_used`
- Context packet
- Permission manager
- Tool pack manifests
- Provider router
- Model role manager
- Input gate and prompt-injection flags
- Audit log
- Fallback routing
- Desktop companion UI later

## Compatibility Decision

Keep current API compatibility while adding the new engine API.

Do not remove these current endpoints yet:

```txt
GET  /health
POST /analyze
```

Add the new API beside them:

```txt
GET  /tools
POST /tasks/run
GET  /audit
GET  /providers/status
GET  /models/roles
```

Later, `/analyze` can become a compatibility wrapper around `/tasks/run`.

Port decision:

- Keep current default `127.0.0.1:31313` for compatibility.
- Add configurable support for the new docs' `4317` port later.
- Do not silently switch ports and break existing clients.

Naming decision:

- Keep repo/project docs under "Local AI Platform" until the rename is intentional.
- Introduce "Local AI Engine Core" as the next architecture layer.

Tech stack decision:

- Continue with minimal Node.js/CommonJS for the next implementation wave.
- Consider TypeScript/Fastify/Zod/SQLite after contracts stabilize.
- Do not pause progress for a monorepo migration.

## Phase A - Contract Bridge - Done

Goal: Add the v2 envelope and run identity without breaking current `/analyze`.

Tasks:

- Create `companion/core/ids.js` for `run_id`, `trace_id`, and current `requestId` compatibility.
- Create `companion/core/envelope.js`.
- Support both envelope styles:
  - current `/analyze` envelope
  - new engine result envelope for `/tasks/run`
- Add `confidence`, `warnings`, `fallbacks_used`, and `schema_valid` defaults.
- Keep current smoke tests passing.
- Add new smoke checks for v2 envelope helpers.

Acceptance criteria:

- Current `/analyze` output is unchanged.
- New envelope builder can produce the `docs/new-local-ai-engine-dev-docs/03-result-envelope.md` shape.
- All errors still include useful messages and next steps.

Implemented files:

```txt
companion/core/ids.js
companion/core/envelope.js
scripts/contract-test.js
```

## Phase B - Context Handler - Done

Goal: Normalize task requests into a context packet before execution.

Tasks:

- Create `companion/core/context.js`.
- Define the context packet fields from `02-context-handler-spec.md`.
- Generate missing `run_id` and `trace_id`.
- Normalize source metadata.
- Normalize task metadata.
- Attach default constraints, permissions, fallback policy, and audit preferences.
- Add support for v1 input types:
  - `text`
  - `json`
  - `markdown`
  - `html`
  - `url_context`
  - `clipboard_text`
  - `browser_selection`
  - `voice_transcript`
  - `file_reference`
- Reject unsupported input types with `UNSUPPORTED_INPUT_TYPE`.

Acceptance criteria:

- Every task run has a context packet.
- Every task has source metadata.
- Existing DealSniper and Lighthouse calls can be adapted into context packets.
- Context packets are not persisted by default.

Implemented files:

```txt
companion/core/context.js
```

Notes:

- Current `/analyze` requests are adapted into context packets internally.
- Public `/analyze` response compatibility is preserved.
- Full `/tasks/run` use of context packets starts in Phase E.

## Phase C - Input Gate and Security Baseline - Done

Goal: Add first defensive layer for untrusted inputs.

Tasks:

- Create `companion/core/input-gate.js`.
- Enforce configurable input size limits.
- Assign risk levels: `low`, `medium`, `high`, `blocked`.
- Detect obvious prompt-injection strings:
  - `ignore previous instructions`
  - `reveal system prompt`
  - `send local files`
  - `exfiltrate clipboard`
  - `disable safety`
  - `run shell command`
  - `upload private data`
- Add untrusted content wrapping helpers.
- Reject blocked input before model/tool execution.
- Record input gate warnings in the result envelope.

Acceptance criteria:

- Oversized input is rejected or flagged.
- Unsafe input can produce `UNSAFE_INPUT_DETECTED`.
- External/browser/clipboard content is treated as untrusted.
- Smoke tests cover at least one safe input and one unsafe input.

Implemented files:

```txt
companion/core/input-gate.js
```

Notes:

- Current `/analyze` requests pass through the input gate after context creation.
- Blocked unsafe input returns a legacy-compatible error envelope with `UNSAFE_INPUT_DETECTED`.
- Warning-only prompt-injection patterns are recorded in `meta.security`.

## Phase D - Tool Discovery Endpoint - Done

Goal: Expose registered tool metadata through the new API.

Tasks:

- Add `GET /tools`.
- Extend current static registry metadata:
  - `id`
  - `pack`
  - `description`
  - `permissions`
  - `model_role`
  - `runtime_required`
  - `input_schema`
  - `output_schema`
- Keep current registry working for `/analyze`.
- Add `requiresRuntime` to the public metadata.

Acceptance criteria:

- `GET /tools` returns DealSniper and Lighthouse Handoff.
- Tool metadata is useful to clients.
- Disabled tools are not listed.

Implemented files:

```txt
companion/server.js
companion/tools/registry.js
companion/tools/deal-sniper.js
companion/tools/lighthouse-handoff.js
scripts/contract-test.js
scripts/smoke-test.js
```

Notes:

- `GET /tools` returns public tool metadata from the active registry.
- Public metadata includes pack, description, tasks, permissions, model role, runtime requirement, and schema paths.
- Disabled tools remain filtered by registry configuration before discovery metadata is returned.

## Phase E - `/tasks/run` API - Done

Goal: Add the new canonical execution endpoint.

Tasks:

- Add `POST /tasks/run`.
- Request shape:

```json
{
  "tool": "text.clean",
  "input": {},
  "context": {},
  "options": {}
}
```

- Route through:
  - input gate
  - context handler
  - registry
  - permission manager placeholder
  - provider/model role layer placeholder
  - tool handler
  - result validator placeholder
  - audit log placeholder
- Return the new result envelope.
- Keep `/analyze` as a compatibility wrapper using current envelope.

Acceptance criteria:

- `POST /tasks/run` can run `lighthouse-handoff`.
- `POST /tasks/run` can attempt `deal-sniper` and return clear provider/model errors.
- Current `/analyze` smoke tests still pass.
- New smoke tests cover `/tasks/run`.

Implemented files:

```txt
companion/server.js
scripts/smoke-test.js
```

Notes:

- `POST /tasks/run` now uses the v2 engine result envelope.
- The endpoint builds a context packet, runs the input gate, validates tool input, checks runtime readiness when required, executes the tool handler, and wraps raw tool output.
- Tool raw input objects are accepted directly and internally wrapped as JSON context content.
- Engine-shaped inputs with `content`, `attachments`, or `metadata` are also accepted for future clients.
- Lighthouse Handoff runs offline through `/tasks/run`; DealSniper returns provider/model availability errors when Ollama is not ready.
- Permission manager, provider router, result validator, and audit log remain placeholders for later phases as planned.

## Phase F - Audit Log v1 - Done

Goal: Write an audit event for every task run.

Tasks:

- Create `companion/core/audit-log.js`.
- Start with JSONL file storage under a local ignored data directory:

```txt
data/audit.jsonl
```

- Update `.gitignore` for local data.
- Log:
  - event_id
  - run_id
  - trace_id
  - timestamp
  - source summary
  - tool
  - provider
  - model
  - model_role
  - permissions used
  - input summary
  - output summary
  - fallbacks used
  - duration
  - status
  - error code if any
- Add `GET /audit` with `limit`, `run_id`, `tool`, and `source` filters.
- Default to summary-only logging.

Acceptance criteria:

- Every `/tasks/run` call writes an audit event.
- Failures are logged.
- `GET /audit` returns recent events.
- Full sensitive input is not logged by default.

Implemented files:

```txt
companion/core/audit-log.js
companion/server.js
scripts/contract-test.js
scripts/smoke-test.js
.gitignore
```

Notes:

- `/tasks/run` now writes summary-only audit events to `data/audit.jsonl`.
- `GET /audit` supports `limit`, `run_id`, `tool`, and `source` filters.
- Audit events include run identity, source summary, tool/task, provider/model/model role, permissions used, input summary, output summary, fallbacks, duration, status, and error code.
- Raw input and raw output values are not persisted in the audit log.
- The local `data/` directory is ignored by git.

## Phase G - Provider Router - Done

Goal: Replace direct server coupling to Ollama with a provider router.

Tasks:

- Create `companion/providers/router.js`.
- Move Ollama adapter under provider router.
- Add mock provider for testability.
- Add `GET /providers/status`.
- Add `POST /providers/set` for active provider changes.
- Normalize provider errors:
  - `PROVIDER_UNAVAILABLE`
  - `MODEL_UNAVAILABLE`
  - `TIMEOUT`
  - `PROVIDER_ERROR`

Acceptance criteria:

- Health uses provider router state.
- `/providers/status` lists Ollama and mock provider.
- Mock provider can run standard text tools in tests without Ollama.
- Existing Ollama behavior remains intact.

Implemented files:

```txt
companion/providers/router.js
companion/server.js
scripts/contract-test.js
scripts/smoke-test.js
```

Notes:

- Server runtime access now goes through the provider router.
- The router exposes Ollama plus a deterministic local mock provider.
- `GET /providers/status` lists provider availability, active state, endpoints, models, selected model, and warning details.
- `POST /providers/set` switches the active provider in memory.
- `/health`, `/analyze`, `/tasks/run`, and audit metadata now reflect the active provider/model.
- Smoke tests verify provider status, provider switching, and a mock-backed DealSniper `/tasks/run` execution.

## Phase H - Model Role Manager - Done

Goal: Tools request model roles instead of raw model names.

Tasks:

- Create `companion/core/model-roles.js`.
- Add role config to `companion/config.json`.
- Initial roles:
  - `fast_worker`
  - `default_worker`
  - `reasoning_worker`
  - `voice_worker` placeholder
- Map DealSniper to `default_worker`.
- Map standard text tools by role.
- Add `GET /models/roles`.
- Add `POST /models/roles/set`.
- Keep raw model config as fallback for compatibility.

Acceptance criteria:

- Tools can declare `modelRole`.
- Provider calls resolve role to model.
- Audit events record `model_role`.
- Missing role model returns useful error.

Implemented files:

```txt
companion/core/model-roles.js
companion/providers/router.js
companion/server.js
companion/config.json
scripts/contract-test.js
scripts/smoke-test.js
```

Notes:

- Model roles now map to configured models through a dedicated role manager.
- Initial roles are `fast_worker`, `default_worker`, `reasoning_worker`, and `voice_worker`.
- Role mappings support provider-specific overrides, including deterministic mock-provider roles.
- `GET /models/roles` lists active provider role mappings.
- `POST /models/roles/set` updates a role mapping in memory.
- `/tasks/run` resolves `model_role` to a concrete model before runtime readiness checks and model calls.
- `/analyze` also uses the tool/request model role when checking and calling the provider while preserving the legacy envelope.
- Audit events continue to record `model_role` and now receive the concrete role-selected model.

## Phase I - Permission Manager v1 - Done

Goal: Enforce declared tool permissions before execution.

Tasks:

- Create `companion/core/permissions.js`.
- Add permissions to tool definitions and manifests.
- Start with safe default approvals for built-in official tools:
  - `model.run`
- Deny high-risk permissions by default:
  - `file.delete`
  - `file.write`
  - `network.send`
  - `browser.write`
  - `memory.delete`
- Add approval state storage.
- Add permission info to audit events.
- Return `PERMISSION_DENIED` when missing permissions block execution.

Acceptance criteria:

- Tool cannot use undeclared permission.
- Tool with missing approval is blocked.
- Permissions used are recorded in audit.
- Built-in MVP tools continue to work with default approvals.

Implemented files:

```txt
companion/core/permissions.js
companion/server.js
companion/config.json
companion/core/audit-log.js
scripts/contract-test.js
scripts/smoke-test.js
```

Notes:

- Permission checks now run before tool execution on `/tasks/run` and legacy `/analyze`.
- Built-in `model.run` is approved by default.
- High-risk permissions are denied by default:
  - `file.delete`
  - `file.write`
  - `network.send`
  - `browser.write`
  - `memory.delete`
- A tool cannot request permissions it does not declare.
- Permission failures return `PERMISSION_DENIED`.
- `/tasks/run` responses include permission metadata.
- Audit events now record actual `permissions_used` from the permission gate.
- Permission approval state can be backed by `data/permissions.json`.

## Phase J - Result Validator and Fallback Router v1 - Done

Goal: Validate outputs and add first fallback behavior.

Tasks:

- Create `companion/core/result-validator.js`.
- Validate required output fields for each tool schema.
- Mark `schema_valid` in envelope metadata.
- Add fallback policy defaults.
- Implement first fallback:
  - schema failure triggers one retry for model-backed tools
- Add fallback tracking in `fallbacks_used`.
- Return `SCHEMA_VALIDATION_FAILED` when validation fails after retry.

Acceptance criteria:

- Tool output schema is validated.
- Bad handler/model output is rejected.
- Retry path is tested with mock provider.
- Fallbacks are visible in response and audit log.

Implemented files:

```txt
companion/core/result-validator.js
companion/server.js
scripts/contract-test.js
```

Notes:

- Tool results are now validated against each tool's declared output schema.
- The validator supports the schema subset currently used by built-in tools:
  - required fields
  - object, array, string, number, integer, and boolean types
  - enum checks
  - numeric min/max checks
  - nested array item object checks
- `/tasks/run` responses now use validator output for `meta.schema_valid`.
- Schema validation failures return `SCHEMA_VALIDATION_FAILED`.
- Model-backed tools use the first fallback policy: `retry_same_model_once` on schema failure.
- Fallback markers are included in `fallbacks_used`.
- Contract tests cover valid results, invalid results, retry success, and retry failure.
- Richer fallback behavior such as model-role escalation remains deferred.

## Phase K - Standard Text Pack - Done

Goal: Build the first official engine-native tool pack.

Tasks:

- Create:

```txt
tool-packs/standard-text-pack/
  tool.json
  README.md
  tools/
  schemas/
  examples/
```

- Implement:
  - `text.clean`
  - `text.summarize`
  - `text.extract_json`
  - `text.classify`
  - `text.detect_injection`
  - `text.validate_schema`
- Use mock provider first for deterministic tests where useful.
- Use runtime/provider for model-backed tools when available.
- `text.validate_schema` should be deterministic code.

Acceptance criteria:

- `GET /tools` lists standard text tools.
- `/tasks/run` can run each standard text tool.
- Each tool has schemas and examples.
- Smoke test covers at least `text.clean` and `text.validate_schema`.

Implemented files:

```txt
companion/tools/standard-text.js
companion/tools/registry.js
companion/providers/router.js
companion/config.json
scripts/contract-test.js
scripts/smoke-test.js
tool-packs/standard-text-pack/tool.json
tool-packs/standard-text-pack/README.md
tool-packs/standard-text-pack/tools/README.md
tool-packs/standard-text-pack/schemas/
tool-packs/standard-text-pack/examples/
```

Notes:

- Added the first engine-native `standard-text-pack`.
- Implemented:
  - `text.clean`
  - `text.summarize`
  - `text.extract_json`
  - `text.classify`
  - `text.detect_injection`
  - `text.validate_schema`
- The first five tools are model-backed and require `model.run`.
- `text.validate_schema` is deterministic and runtime-free.
- The static registry exposes the tools now; Phase L will replace this with manifest loading.
- The mock provider now generates schema-aware mock JSON so model-backed text tools can be tested without Ollama.
- Smoke tests cover all six standard text tools through `/tasks/run`.

## Phase L - Tool Pack Manifest Loader

Goal: Move from static registry to manifest-backed tool packs.

Tasks:

- Define minimum `tool.json` manifest format.
- Load built-in packs from `tool-packs/`.
- Validate manifests.
- Ignore invalid packs with useful errors.
- Preserve current built-in DealSniper/Lighthouse definitions as showcase packs or compatibility built-ins.
- Add trust levels:
  - `official`
  - `verified`
  - `community`
  - `experimental`
  - `local_private`

Acceptance criteria:

- Registry loads tools from manifests.
- Invalid manifest does not crash server.
- `/tools` includes pack metadata.
- Current tools still work.

## Phase M - Compatibility Cleanup - Done

Goal: Reconcile current platform API and new engine API.

Tasks:

- Document `/analyze` as legacy compatibility endpoint.
- Ensure `/analyze` internally maps to the same tool registry and validation path.
- Ensure `/tasks/run` is canonical in docs.
- Decide whether `/health` should expose both current and engine fields.
- Decide whether to keep port `31313`, add `4317`, or support both by config.

Acceptance criteria:

- Old clients keep working.
- New clients can use `/tasks/run`.
- Docs clearly label canonical and compatibility endpoints.

Implemented files:

```txt
companion/server.js
README.md
docs/api-contract.md
docs/architecture.md
docs/tool-integration-guide.md
docs/publish-readiness-checklist.md
```

Notes:

- `POST /tasks/run` is now documented as the canonical execution endpoint.
- `POST /analyze` is documented as a legacy compatibility endpoint and remains supported.
- `GET /health` preserves existing fields while adding:
  - `engine`
  - `status`
  - `canonicalEndpoint`
  - `compatibilityEndpoints`
- Default port remains `127.0.0.1:31313` for compatibility.
- The newer docs' `4317` port is still treated as a future/configuration decision, not a breaking default change.
- Unknown route guidance now points to `/tasks/run` and labels `/analyze` as legacy.

## Phase N - Packaging Preparation - Done

Goal: Finish current old Phase 10 while respecting new engine direction.

Tasks:

- Add `start-windows.bat`.
- Add `start-dev.ps1` if useful.
- Add clearer startup status output:
  - local server URL
  - active provider
  - provider availability
  - selected model/role
  - registered tool count
- Add `npm` scripts only if `package.json` is introduced.
- Add known-port conflict guidance.

Acceptance criteria:

- Windows tester can start the server with one helper.
- Smoke test instructions are obvious.
- Port conflict messaging is clear.

Implemented files:

```txt
companion/server.js
start-windows.bat
start-dev.ps1
README.md
docs/packaging-plan.md
```

Notes:

- Added `start-windows.bat` for one-step Windows startup from the repo root.
- Added `start-dev.ps1` with configurable host, port, and Ollama model.
- Server startup now prints:
  - local server URL
  - canonical and compatibility API endpoints
  - active provider
  - provider availability and endpoint
  - default model role and selected model readiness
  - registered tool count
  - smoke-test command
- Port conflict errors now include Windows `netstat` guidance and an alternate-port example.
- No `package.json` was introduced, so no npm scripts were added.

## Phase O - Desktop Companion Planning Gate - Done

Goal: Prepare for UI without starting too early.

Tasks:

- Add a short UI implementation decision doc:
  - Tauri vs Electron
  - local API dependencies
  - data needed by dashboard
- Defer actual UI until:
  - `/tools`
  - `/providers/status`
  - `/models/roles`
  - `/audit`
  are all working.

Acceptance criteria:

- UI build starts only after core endpoints are stable.
- Dashboard data needs are mapped to API endpoints.

Implemented files:

```txt
docs/desktop-companion-decision.md
README.md
docs/architecture.md
```

Notes:

- Added a Tauri-first desktop companion decision doc.
- Deferred actual UI implementation.
- Mapped dashboard data needs to current API endpoints:
  - `GET /health`
  - `GET /tools`
  - `GET /providers/status`
  - `GET /models/roles`
  - `GET /audit`
- Captured server-side gaps to resolve before UI work starts, including persistent provider/model-role settings, permission review endpoints, CORS/origin policy, tool pack manifest loading, and start/stop behavior.

## Final Completed Development Target

The new Local AI Engine Core development target is complete when:

- Current `/health` still works.
- Current `/analyze` still works or is clearly documented as compatibility.
- New `GET /tools` works.
- New `POST /tasks/run` works.
- New `GET /audit` works.
- New `GET /providers/status` works.
- New model role endpoints work.
- Context packets are generated for every task.
- Input gate flags or blocks unsafe input.
- Permission checks run before every tool.
- Audit events are written for every run.
- Provider router supports at least mock and Ollama.
- Model roles map tools to configured models.
- Fallback routing handles schema failure at least once.
- Standard text pack is installed and runnable.
- DealSniper remains a showcase/model-backed tool.
- Lighthouse Handoff remains an MVP stub or is explicitly upgraded later.
- Smoke tests cover both compatibility and new engine API paths.
- Docs label implemented, compatibility, and future desktop features clearly.

## Deferred Until After Core Completion

Do not start these until the core is stable:

- Desktop Companion UI
- Chrome bridge
- Website widget
- Voice/Mumble pack
- Community marketplace
- Heavy model download management
- File automation tools
- Network-enabled community tools
- Full AI-backed Lighthouse/PageSpeed production pack

## Notes From New Docs Review

- Several new docs contain mojibake/encoding artifacts in headings and diagrams. Clean these before treating them as publish-ready.
- The new docs recommend TypeScript, Fastify, Zod, pino, SQLite, and a monorepo. This plan intentionally does not require that migration immediately because the current minimal Node server is working.
- The new docs move DealSniper/PageSpeed into showcase-pack territory. Current code can keep DealSniper as the required MVP tool while the engine core is expanded.
- The new docs use `localhost:4317`; current code uses `127.0.0.1:31313`. Treat this as a compatibility/config decision, not an immediate breaking change.
