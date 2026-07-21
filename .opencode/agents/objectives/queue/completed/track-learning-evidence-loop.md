# 10 — Track Learning Evidence Loop

Close the evidence feedback loop so track execution produces measurable
improvement data, not just transport-success records. Locaily already
collects Track Run Records, qualification evidence, shadow routing
comparisons, enforcement decisions, and human reviews. Those streams must
be connected into a learning loop: evidence → analysis → actionable
routing or model selection improvement.

## Completion Conditions

- [ ] All Track Run Records include `routing.shadowRecommendation` and
  `routing.enforcementDecision` where applicable
- [ ] Shadow routing evidence is aggregated per-track with: agreement
  rate, disagreement rate, coverage rate, drift detection
- [ ] Disagreement cases (shadow recommends differently than current
  selection) are classified: model regression, qualification stale,
  runtime unavailable, unexplainable
- [ ] A read-only `/evidence/learning` endpoint summarizes per-track
  learning state: record count, agreement %, disagreement breakdown,
  last qualification, recommendation confidence
- [ ] The enforcement dashboard (`GET /enforcement/status`) includes
  evidence-backed recommendations (not just policy state)
- [ ] Human correction records are linked to their parent Track Run
  Records and surfaced in evidence summaries
- [ ] Failed executions produce Track Run Records with structured error
  data (not just `ok: false`)
- [ ] Retry and correction records include before/after comparisons
  where the same input was re-executed
- [ ] Evidence store is summary-safe: individual run records are
  append-only; aggregated summaries do not leak user input
- [ ] Existing Lighthouse Handoff and DealSniper tracks emit learning
  evidence
- [ ] Tests verify: success records, failure records, shadow comparison
  records, human correction linkage, retry/correction attribution,
  summary privacy
- [ ] Update `docs/02-track-system/canonical-track-run-records.md` to
  document the learning evidence loop
- [ ] Update `docs/04-validation/README.md` with evidence aggregation
  documentation
- [ ] The `/health` endpoint includes learning evidence summary
  (record count, coverage %, last aggregation timestamp)

## Out of Scope

- Do not change existing Track Run Record schema fields — add optional
  extension fields only
- Do not modify the qualification-resolver or enforcement-policy-store
  behavior
- Do not import benchmark-lab/engine/ modules into companion/
- Do not change existing endpoint response envelopes
- Do not add automatic model switching — evidence informs but does not
  enforce without explicit policy change
- Do not remove or rename existing evidence fields

## Stop / Hand-back Conditions

- Sensitive user data cannot be excluded from evidence summaries
- Track identity or version conflicts with existing record formats
- Evidence aggregation requires redesigning the Track Run Record schema
- Aggregated evidence contradicts existing qualification records and
  the conflict cannot be triaged into a bounded task
