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

- [ ] Document and harden Lighthouse Handoff validation path
- [ ] Example client folder for extension bridge
- [ ] Persistent provider / model role config
- [ ] CORS policy for extension testing

## Next — Pit Crew Mechanics

- [ ] Model evaluation harness using templates in `03-research/`
- [ ] Scoreboard / comparison baselines with logged evidence
- [ ] Track classifier design (spec only until proven)
- [ ] Model suitability profiles (experimental)

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

## Archive Roadmaps

Older phase plans:

- `docs/99-archive/old-summaries/implementation-plan.md`
- `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/13-implementation-roadmap.md`

Prefer this file and code for current direction; consult archives for historical detail only.

## Related

- [publish-readiness-checklist.md](./publish-readiness-checklist.md)
- [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
