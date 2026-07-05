# Publish Readiness Checklist - Locaily

Use this before publishing the repo or inviting testers.

Classification: **Complete** | **Partial** | **Not started** | **Not required** | **Owner decision**

## Positioning

| Item | Status | Notes |
|------|--------|-------|
| README says this is a local-first AI platform | Complete | Confirmed in root README |
| README does not frame the project as only a Chrome extension | Complete | Repo scope covers Local Brain, Tracks, Benchmark Lab |
| Short one-line pitch included | Complete | "Run one local AI companion. Power many tools." |
| Example use cases listed | Partial | Lighthouse Handoff and DealSniper documented; more needed |
| Limitations clearly stated | Partial | Updated in validation README and strategy; publish doc should list them prominently |
| Canonical naming (Locaily, The Crew, Relay Nodes) | Complete | Consistent across active docs; archived material uses historical names |
| License present | Complete | MIT in `package.json`; verify `LICENSE` file |
| Install instructions | Complete | README + setup-flow.md |
| Supported Node version | Complete | `>=18.0.0` in package.json |
| Local-only security posture | Complete | localhost-only by default; documented |
| No secrets/private paths committed | Complete | `.gitignore` covers data/, benchmark-lab local artifacts |
| Test commands documented | Complete | package.json scripts + validation README |
| Benchmark Lab trust boundary (no import in companion) | Complete | Enforced by architecture |
| Model license review | Not started | Should verify licenses for all registry candidates before publishing |
| Evidence claims scoped to actual results | In progress | This update improves scoping |
| Known limitations documented | Partial | Being addressed in this update |
| Contribution guidance | Complete | CONTRIBUTING.md created with workflow, guardrails, and PR expectations |
| Issue templates | Complete | Bug report, feature request, documentation templates (.github/ISSUE_TEMPLATE/) |
| Security policy | Complete | SECURITY.md documents reporting and scope |
| Release/package decision | Owner decision | npm package or repo-only? |

## MVP Scope

| Item | Status | Notes |
|------|--------|-------|
| DealSniper works as required MVP tool | Complete | When Ollama/model available |
| Lighthouse Handoff with deterministic + orchestrated paths | Complete | Deterministic fallback + model-backed orchestration |
| Memory Bridge v0 endpoints and modules | Complete | Disabled by default |
| Full extension ↔ Local Brain bridge documented but not implemented | Complete | Documented as not implemented in lighthouse-handoff-extension-integration.md |

## Core Functionality

| Item | Status |
|------|--------|
| Companion server starts locally | Complete |
| Server binds to localhost by default | Complete |
| Default port 31313 | Complete |
| `GET /health` works | Complete |
| `POST /tasks/run` works | Complete |
| Legacy `POST /analyze` works | Complete |
| Unknown routes return JSON errors | Complete |
| Bad JSON does not crash server | Complete |
| Server logs readable enough for MVP | Complete |

## Runtime Support

| Item | Status |
|------|--------|
| Ollama availability check | Complete |
| Missing Ollama state clear | Complete |
| Model availability check | Complete |
| Missing model state clear | Complete |
| Model configurable | Complete |
| Runtime adapter isolated from route handlers | Complete |
| `generateJson(prompt, schema, options)` exposed | Complete |

## Tool System

| Item | Status |
|------|--------|
| Tool registry exists | Complete |
| `/health` lists registered tools | Complete |
| Unknown tools return useful errors | Complete |
| Unknown tasks return useful errors | Complete |
| DealSniper tool exists | Complete |
| Lighthouse Handoff tool exists | Complete |
| Memory Bridge v0 modules/endpoints exist | Complete |
| Tool handlers return raw result objects | Complete |
| Platform wraps raw results into API envelopes | Complete |

## API Contract

| Item | Status |
|------|--------|
| API contract documented | Complete |
| Success response shape consistent | Complete |
| Error response same envelope as success | Complete |
| Errors use `ok: false`, `result: null`, `error` object | Complete |
| Client-breaking changes avoided | Complete |
| Example requests included | Complete |
| Example responses included | Complete |

## Client Integration

| Item | Status | Notes |
|------|--------|-------|
| DealSniper client can detect companion status | Not started | No dedicated client exists in repo |
| DealSniper client can call `/tasks/run` | Not started | |
| Client UI states understandable | Not started | No client UI in repo |
| API contract does not assume AI always running | Complete | |

## Security / Privacy

| Item | Status | Notes |
|------|--------|-------|
| Server localhost-only by default | Complete | |
| CORS behavior intentional | Partial | Implemented but should be documented clearly |
| No sensitive request bodies logged by default | Complete | |
| Docs explain what runs locally | Complete | |
| Docs explain what data sent to local runtime | Complete | |
| Public-network exposure not enabled by default | Complete | |

## Developer Experience

| Item | Status |
|------|--------|
| New developer can run setup from README | Complete |
| Windows instructions included | Complete |
| Required software listed | Complete |
| Node version expectation listed | Complete |
| Ollama setup listed | Complete |
| Smoke test script exists | Complete |
| Example config exists | Complete |

## Documentation

| Item | Status |
|------|--------|
| `AGENT.md` exists | Complete |
| `AGENTS.md` exists | Complete |
| `README.md` exists | Complete |
| `docs/01-architecture/locaily-overview.md` | Complete |
| `docs/01-architecture/api-contract.md` | Complete |
| `docs/01-architecture/memory-bridge.md` | Complete |
| `docs/04-validation/README.md` | Complete |
| `docs/00-start-here/project-index.md` | Complete |
| `docs/08-agents/client-integration-guide.md` | Complete |
| `docs/05-product/packaging-plan.md` | Complete |
| Docs do not claim unbuilt features as finished | Partial | This update resolves remaining claims |

## Repo Hygiene

| Item | Status |
|------|--------|
| License selected (MIT) | Complete |
| `.gitignore` exists | Complete |
| Example env/config file exists | Complete |
| No local secrets committed | Complete |
| No giant model files committed | Complete |
| No machine-specific paths committed | Complete |

## Tester Readiness

| Item | Status | Notes |
|------|--------|-------|
| Tester setup steps short and clear | Complete | |
| Known issues listed | Partial | Being addressed in this update |
| Feedback instructions included | Partial | tester-feedback-plan.md exists but needs public linking |
| Screenshots/terminal examples included | Owner decision | Helpful but not required for initial release |
| Fallback behavior explained | Complete | |

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

**Do not mark public release ready merely because code tests pass.** Evidence claims, limitations, and known issues must be documented and scoped.
