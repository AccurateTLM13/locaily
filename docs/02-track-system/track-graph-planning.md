# Track Graph Planning

How Locaily should evolve from **linear pipelines** toward **graph-based planning** — without pretending the future is already shipped.

## Current Stage: Linear Track Pipeline

**Implemented today.**

- Track steps are an **ordered array** in `*.track.json`
- `companion/crew/orchestrator.js` runs steps sequentially
- Step outputs land in `context.artifacts[step.id]`
- No parallel branches, no conditional edges, no planner-generated graphs

This is intentional. Known workflows stay explicit and testable.

## Next Stage: Declarative Step Dependencies

**Planned — not implemented.**

Target: track files declare how each step receives input (see [step-input-mapping.md](./step-input-mapping.md)) and optionally declare **depends_on** edges without a full DAG runner.

Example direction (not valid track JSON yet):

```json
{
  "id": "write_handoff",
  "depends_on": ["extract_metrics", "classify_issues", "validate_priority_fixes", "match_fixes"],
  "input_map": {
    "url": "$input.url",
    "metrics": "$artifacts.extract_metrics",
    "classifiedIssues": "$artifacts.classify_issues"
  }
}
```

Runner could still execute in topological order while keeping workflows readable.

## Future Stage: DAG Planner Generated From Request

**Research — not implemented.**

Vision: Local Brain receives a free-form request, selects or generates a track graph from:

- Registered core tracks
- Available tools and model roles
- Workflow registry entries
- Validation policies

This is **not** v1 scope. Nathan's DAG direction belongs here as research, not as current architecture.

> Locaily should evolve toward graph-based planning, but v1 should keep known workflows explicit and testable.

## What We Are Not Building Yet

| Capability | Status |
|---|---|
| Automatic DAG generation from natural language | Research |
| Parallel step execution | Not built |
| Conditional branching in track runner | Not built |
| Track classifier auto-picking workflow | Planned spec only |
| Dynamic replanning mid-run | Research |

## Milestone Alignment

| Milestone | Graph stage |
|---|---|
| **M1A/M1B — Track system + declarative input** | Linear pipeline, `input_map` on all steps |
| **M2/M3/M4 — Second track, model input, orchestration** | Proof tracks, declarative mapping, workflow orchestration — all linear |
| **M5 — Benchmark Lab** | Operator-ready evaluation; not graph-related |
| **Active slice** | Canonical Track Run Records (specification stage) |
| **Simple dependency graph** | Planned — topological runner with `depends_on` in track files |
| **DAG planner** | Research gate — requires validation harness + classifier |

## Related

- [track-registry.md](./track-registry.md)
- [future-dag-runner.md](./future-dag-runner.md)
- [../07-progress/milestone-map.md](../07-progress/milestone-map.md)
