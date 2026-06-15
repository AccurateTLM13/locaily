# Progress Log

Dated record of meaningful build and planning sessions.

---

## 2026-06-14 — Draft Future Track Catalog (Docs Only)

### Changed

- Added `docs/02-track-system/future-tracks.md`, `future-track-catalog.md`, and `track-catalog-expansion-plan.md`.
- Added draft fixtures under `docs/04-validation/fixtures/tracks/` for Evidence, Diff, Confidence, Escalation, Context Selection, and Model Profiling tracks.
- Updated track system README read order with future catalog links.

### Why

Parallel spec work while Milestone 2 runtime plumbing proceeds — gives implementers contracts and example fixtures without touching the linear runner.

### Evidence

- Docs-only branch `docs/track-catalog-expansion`; no changes to `companion/server.js`, orchestrators, or routers.
- All catalog tracks marked draft / not implemented; Capability Discovery marked future / NearbyNode-adjacent.

### Next

- Milestone 2 runtime track work continues on separate branch.
- Implement Phase A governance tools when FallbackHandler milestone starts.

---

## 2026-06-15 — Milestone 1B Complete: Declarative Track Input Mapping

**Milestone 1B: Declarative track input mapping — complete.**

### Changed

- Merged PR #5 (`a07d9f6`): generic `input_map` resolver, Lighthouse track migration, unit + smoke coverage.
- Tool steps read input contracts from track JSON instead of hardcoded Lighthouse step IDs in `tool-router.js`.

### Why

First platform refactor after docs restructure: tracks declare how data moves between steps; Pit Crew routing stays generic.

### Evidence

- Squash merge on `main`: `feat: add declarative track input maps`
- Clean-server validation: 50/50 smoke, unit + contract tests pass
- PR #5: 1 commit, 7 files

### Next

- Milestone 2: second workflow track using declarative `input_map` only
- Remove `buildLegacyStepInput()` when all tracks migrate

---

## 2026-06-14 — Track System Direction Clarified (Milestone 1A)
### Changed

- Reframed Local Brain as dispatching **tracks**, not models.
- Identified Lighthouse Handoff as first official proof workflow track.
- Added `docs/02-track-system/` (registry, core tracks, workflow registry, step input mapping gap, graph planning).
- Added `docs/07-progress/` (build status, sprint, agent brief, milestone map).
- Added `docs/00-start-here/current-state.md` as blunt status anchor.
- Reorganized docs: `03-workflows`, `04-validation`, `05-product`, `08-agents`, research → archive.

### Why

Current implementation is already pipeline-stage orchestration (`POST /tracks/run`, pit-crew runner). The project needs explicit track docs before adding more workflows or agents invent conflicting architecture.

### Evidence

- `POST /tracks/run` exists in `companion/server.js`
- `companion/pit-crew/tracks/lighthouse-handoff.track.json` exists
- `companion/pit-crew/orchestrator.js` runs linear steps
- Hardcoded step mapping in `companion/pit-crew/tool-router.js`

### Next

- ~~Implement declarative `input_map`~~ — done in Milestone 1B (2026-06-15)

---

## 2026-06-13 — L2 Live Ollama + Memory Bridge
See [../06-decisions/decision-log.md](../06-decisions/decision-log.md) and [../04-validation/l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md).

---

## Template for Future Entries
```md
## YYYY-MM-DD — Short title

### Changed
- ...

### Why
- ...

### Evidence
- ...

### Next
- ...
```
