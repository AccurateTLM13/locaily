# Progress Log

Dated record of meaningful build and planning sessions.

---

## 2026-06-15 — Milestone 2 Complete: Second Workflow Track

**Milestone 2: Second workflow track — complete.**

### Changed

- Merged PR #7 (`ae0d03d`): `marketplace.dealsniper` track, DealSniper tool tasks, generic orchestrator result assembly, smoke + unit coverage.
- Two workflow tracks now run through declarative `input_map` with no new `buildLegacyStepInput()` branches.

### Why

Prove the track system is reusable beyond Lighthouse Handoff — second workflow on the same linear runner without router forks.

### Evidence

- Squash merge on `main`: `feat: add DealSniper workflow track`
- Clean-server validation: **51/51 smoke**, unit + contract tests pass
- PR #7: 1 commit, 13 files
- Lighthouse `write_handoff` path unchanged; DealSniper uses `result_step` / `verification_step`

### Next

- Remove `buildLegacyStepInput()` (both tracks declare `input_map`)
- Milestone 3 candidate: declarative input mapping for model steps

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

- ~~Milestone 2: second workflow track~~ — done (2026-06-15, PR #7)
- Remove `buildLegacyStepInput()` when ready

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
