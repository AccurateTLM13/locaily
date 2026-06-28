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
- [x] L2: live Ollama orchestration evidence on target hardware — see [l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md)
- [x] Example normalized fixture in `examples/lighthouse-handoff/slim-mobile.fixture.json`
- [ ] Persistent provider / model role config across restarts
- [ ] CORS policy (or MV3 background proxy pattern) for extension testing

## Now - Track Learning Evidence Loop

- [ ] Canonical track-run record schema
- [ ] Emit a valid record after successful and failed track executions
- [ ] Store summary-safe evidence without raw sensitive inputs or outputs by default
- [ ] Associate optional human correction records with existing runs
- [ ] Prove Lighthouse Handoff and DealSniper produce valid evidence records

## Now — Memory Bridge v0

- [x] Architecture docs: memory-bridge, context-packs, memory-writeback
- [x] Decision: second-brain-as-memory-layer
- [x] Public starter template (`templates/memory-vault/`)
- [x] Vault adapter + context pack builder + writeback proposal modules
- [x] Endpoints: `GET /memory/status`, `POST /memory/context-pack`, `POST /memory/writeback/propose`
- [x] Smoke tests (disabled + template-enabled module checks, blockedPaths override)
- [x] Wire Context Pack into Lighthouse Handoff compose-handoff (optional memory preflight)
- [x] Audit redaction for memory endpoints and handoff memory metadata
- [x] Controlled validation against real wiki-style private vault (user-local; see `docs/04-validation/`)
- [x] L2: live Ollama + Lighthouse Handoff + Memory Bridge on target hardware — [l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md)

## Next — Pit Crew Mechanics

- [x] Model Scorecard / Skill Sheet architecture spec — see [model-scorecard-and-routing.md](../01-architecture/model-scorecard-and-routing.md)
- [ ] Model evaluation harness using templates in `99-archive/research-notes/`
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
- [ ] Capability advertisements with node health, availability, constraints, and evidence history
- [ ] Two-computer proof: laptop and desktop registered as distinct nodes in one coordinated execution system

## Future - RelayNode

- [ ] Spec approved remote execution targets as policy-controlled execution capacity
- [ ] Keep Local Brain as the control plane when remote execution is used
- [ ] Require qualification, privacy policy, and evidence records before remote dispatch affects routing

## Explicitly Post-MVP / Research

- Community tool marketplace
- Voice/Mumble pack
- Cloud fallback gateway beyond explicit RelayNode experiments
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
- [../04-validation/README.md](../04-validation/README.md)
- [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
