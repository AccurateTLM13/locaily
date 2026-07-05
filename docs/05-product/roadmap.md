# Roadmap

Practical sequencing for Locaily. No dates or numbered milestones — order reflects dependency, not schedule promises.

## Completed

- Local companion server (Local Brain) on localhost, `127.0.0.1:31313`
- Engine endpoints: `GET /health`, `POST /tasks/run`, `POST /analyze`, `GET /tools`, `GET /audit`
- Ollama + mock provider runtime adapters
- Core modules: input gate, context, permissions, validator, audit, model-qualification-loader
- Manifest-backed tool pack loader (`tool-packs/*/tool.json` via `companion/tools/registry.js`)
- Track runner (Crew orchestrator) + declarative input mapping
- Second proof workflow: DealSniper (`marketplace.dealsniper` track)
- Workflow orchestration: `POST /workflows/plan`, `POST /workflows/run`
- Memory Bridge v0 (optional, bounded context access, proposal-only writeback)
- Audit redaction, Memory Bridge endpoints, smoke tests for disabled + template-enabled
- Benchmark Lab Milestone 1 (engine, CLI, schemas, evidence, qualifications, reports, model-cards, checksums)
- JSON-first internal format with runtime schema enforcement (7 internal schemas enforced at production boundaries)
- Windows/PowerShell launch helpers (`start-windows.bat`, `start-dev.ps1`)
- Smoke and contract tests
- Standard Text Pack (`text.clean`, `text.summarize`), Lighthouse Parser Pack

## Active Build Slice — Canonical Track Run Records

**Status:** Specification stage — not implemented.

- [ ] Canonical track-run record schema
- [ ] Emit valid records after successful and failed track executions
- [ ] Store summary-safe evidence without raw sensitive inputs or outputs
- [ ] Associate optional human correction records with existing runs
- [ ] Validate Lighthouse Handoff and DealSniper produce valid evidence records

## Candidate Follow-Ons (Unapproved)

These are candidates for future scoping — no schedule commitment:

- Lighthouse extension ↔ Local Brain HTTP bridge / CORS policy
- Broader model qualification coverage across roles and Tracks
- Hardware profiling and capability probe integration
- Memory Bridge validation depth (second workflow, richer extraction)
- Simple dependency graphs for Track definition
- Relay Node research (capability connector protocol, device discovery)
- Operator UX improvements (persistent provider/model config, permission review UI)
- Desktop Companion prototype (Tauri-first per decision)

## Later / Research

- DAG planning for Track execution
- Free-form Track generation
- Relay Node distributed execution
- Automatic model swapping
- Automated learning loops (may build on Canonical Track Run Records when implemented)
- Community tool marketplace
- Voice/Mumble pack
- Memory embeddings / vector search
- `POST /memory/writeback/apply`
- Cloud fallback gateway

## Archive Roadmaps

Older phase plans:

- `docs/99-archive/old-summaries/implementation-plan.md`
- `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/13-implementation-roadmap.md`

Prefer this file and code for current direction; consult archives for historical detail only.

## Related

- [publish-readiness-checklist.md](./publish-readiness-checklist.md)
- [../04-validation/README.md](../04-validation/README.md)
- [../06-decisions/decision-log.md](../06-decisions/decision-log.md)
