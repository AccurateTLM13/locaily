# Roadmap

Practical sequencing for Locaily. **Dates omitted**—order reflects dependency, not schedule promises.

## Done (Repo Evidence)

- Local companion server on localhost
- Engine endpoints + legacy `/analyze`
- Ollama + mock providers
- Core modules: input gate, context, permissions, validator, audit
- Manifest-backed Standard Text Pack
- Showcase tools: DealSniper, Lighthouse Handoff
- Lighthouse multi-step orchestration path
- Smoke and contract tests
- Windows/PowerShell launch helpers

## Now — Stabilize First Workflow

- [x] Document Lighthouse Handoff L1 validation (smoke + contract)
- [x] Extension integration spec (bridge not implemented)
- [ ] Implement extension ↔ Local Brain HTTP bridge (extension repo + CORS/proxy)
- [x] L2: live Ollama orchestration evidence on target hardware — see [l2-live-ollama-memory-bridge.md](../05-validation/l2-live-ollama-memory-bridge.md)
- [x] Example normalized fixture in `examples/lighthouse-handoff/slim-mobile.fixture.json`
- [ ] Persistent provider / model role config across restarts
- [ ] CORS policy (or MV3 background proxy pattern) for extension testing

## Now — Memory Bridge v0

- [x] Architecture docs: memory-bridge, context-packs, memory-writeback
- [x] Decision: second-brain-as-memory-layer
- [x] Public starter template (`templates/memory-vault/`)
- [x] Vault adapter + context pack builder + writeback proposal modules
- [x] Endpoints: `GET /memory/status`, `POST /memory/context-pack`, `POST /memory/writeback/propose`
- [x] Smoke tests (disabled + template-enabled module checks, blockedPaths override)
- [x] Wire Context Pack into Lighthouse Handoff compose-handoff (optional memory preflight)
- [x] Audit redaction for memory endpoints and handoff memory metadata
- [x] Controlled validation against real wiki-style private vault (user-local; see `docs/05-validation/`)
- [x] L2: live Ollama + Lighthouse Handoff + Memory Bridge on target hardware — [l2-live-ollama-memory-bridge.md](../05-validation/l2-live-ollama-memory-bridge.md)

## Next — Pit Crew Mechanics

- [x] Model Scorecard / Skill Sheet architecture spec — see [model-scorecard-and-routing.md](../01-architecture/model-scorecard-and-routing.md)
- [ ] Model evaluation harness using templates in `03-research/`
- [ ] Scoreboard / comparison baselines with logged evidence
- [ ] Track classifier design (spec only until proven)
- [ ] Model Scorecard registry and selector implementation (experimental)

## Later — Product Surface

- [ ] Desktop Companion prototype (Tauri-first per decision)
- [ ] Tester-friendly packaging stage
- [ ] Permission review endpoint + UI

## Future — NearbyNode

- [ ] Capability connector protocol
- [ ] Device pairing and discovery
- [ ] Delegate non-model capabilities to nearby devices

## Explicitly Post-MVP / Research

- Community tool marketplace
- Voice/Mumble pack
- Cloud fallback gateway
- Distributed local clusters
- Memory embeddings / vector search
- `POST /memory/writeback/apply`

## Archive Roadmaps

Older phase plans:

- `docs/99-archive/old-summaries/implementation-plan.md`
- `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/13-implementation-roadmap.md`

Prefer this file and code for current direction; consult archives for historical detail only.

## Related

- [publish-readiness-checklist.md](./publish-readiness-checklist.md)
- [../05-validation/README.md](../05-validation/README.md)
- [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
