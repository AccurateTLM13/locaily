# Publish Readiness Checklist - Local AI Platform

Use this before publishing the repo or inviting testers.

## Positioning

- [x] README clearly says this is a local-first AI platform.
- [x] README does not frame the project as only a Chrome extension.
- [x] Short one-line pitch is included.
- [ ] Example use cases are listed.
- [x] Limitations are clearly stated.

Suggested one-liner:

```txt
Run one local AI companion. Power many tools.
```

## MVP Scope

MVP requires:

1. Local companion server
2. `/health` endpoint
3. `/tasks/run` endpoint
4. Ollama runtime adapter
5. Tool registry
6. One fully working tool: DealSniper
7. One stub/demo second tool: Lighthouse Handoff
8. Consistent response envelopes
9. README setup instructions
10. Basic smoke test script

- [x] DealSniper works as the required MVP tool when Ollama/model are available.
- [x] Lighthouse Handoff exists as a stub/demo tool.
- [x] Full Lighthouse Handoff support is documented as post-MVP.

## Core Functionality

- [x] Companion server starts locally.
- [x] Server binds to localhost by default.
- [x] Default port is `31313`.
- [x] `GET /health` works.
- [x] `POST /tasks/run` works.
- [x] legacy `POST /analyze` works.
- [x] Unknown routes return JSON errors.
- [x] Bad JSON does not crash the server.
- [x] Server logs are readable enough for MVP.

## Runtime Support

- [x] Ollama availability check works.
- [x] Missing Ollama state is clear.
- [x] Model availability check works.
- [x] Missing model state is clear.
- [x] Selected model can be configured.
- [x] Runtime adapter is isolated from route handlers.
- [x] Runtime adapter exposes `generateJson(prompt, schema, options = {})`.

## Tool System

- [x] Tool registry exists.
- [x] `/health` lists registered tools.
- [x] Unknown tools return useful errors.
- [x] Unknown tasks return useful errors.
- [x] DealSniper tool exists.
- [x] Lighthouse Handoff stub/demo tool exists.
- [x] Tool handlers return raw result objects only.
- [x] The platform wraps raw results into API envelopes.

## API Contract

- [x] API contract is documented.
- [x] Success response shape is consistent.
- [x] Error response shape uses the same envelope as success responses.
- [x] Errors use `ok: false`, `result: null`, and an `error` object.
- [x] Client-breaking changes are avoided.
- [x] Example requests are included.
- [x] Example responses are included.

## Client Integration

- [ ] DealSniper client can detect companion status.
- [ ] DealSniper client can call `/tasks/run` or legacy `/analyze`.
- [ ] DealSniper client falls back when local AI is unavailable.
- [ ] Client UI states are understandable.
- [x] API contract does not assume local AI is always running.

## Security / Privacy

- [x] Server is localhost-only by default.
- [ ] CORS behavior is intentional.
- [x] No sensitive request bodies are logged by default.
- [x] Docs explain what runs locally.
- [x] Docs explain what data is sent to the local runtime.
- [x] Public-network exposure is not enabled by default.

## Developer Experience

- [x] New developer can run setup from README.
- [x] Windows instructions are included.
- [x] Required software is listed.
- [x] Node version expectation is listed.
- [x] Ollama setup is listed.
- [x] Smoke test script exists.
- [x] Example config exists.

## Documentation

- [x] `AGENT.md` exists.
- [x] `AGENTS.md` exists.
- [x] `README.md` exists.
- [x] `docs/01-architecture/locaily-overview.md` exists.
- [x] `docs/01-architecture/api-contract.md` exists.
- [x] `docs/00-start-here/project-index.md` exists.
- [x] `docs/05-agents/client-integration-guide.md` exists.
- [x] `docs/04-product/packaging-plan.md` exists.
- [x] Docs do not claim unbuilt features as finished.

## Repo Hygiene

- [x] License selected.
- [x] `.gitignore` exists.
- [x] Example env/config file exists if needed.
- [x] No local secrets committed.
- [x] No giant model files committed.
- [x] No machine-specific paths committed.

## Tester Readiness

- [x] Tester setup steps are short and clear.
- [ ] Known issues are listed.
- [ ] Feedback instructions are included.
- [ ] Screenshots or terminal examples are included if useful.
- [x] Fallback behavior is explained.

## Almost Publish-Ready Definition

The project is almost publish-ready when a technically comfortable user can:

1. Clone the repo.
2. Start Ollama.
3. Pull the recommended model.
4. Start the companion.
5. Hit `/health`.
6. Run a sample `/tasks/run` request.
7. Connect one client tool.
8. Understand what to build next.
