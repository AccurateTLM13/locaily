# Automatic Task Intake & Track Selection

**Result schema:** [companion/schemas/task-intake-result.schema.json](../../companion/schemas/task-intake-result.schema.json) (`locaily.task_intake_result.v1`)  
**Engine:** [companion/orchestration/task-intake.js](../../companion/orchestration/task-intake.js)  
**Labeled dataset:** [companion/schemas/fixtures/task-intake-labeled-dataset.json](../../companion/schemas/fixtures/task-intake-labeled-dataset.json)

---

## Overview

Automatic Task Intake translates a plain-English user request (plus optional structured `input`) into a grounded routing decision across built-in workflows and dynamically installed Workflow Packs—without ever inventing unapproved tracks or executing blindly when uncertain.

## Four-Stage Pipeline

```txt
User request + optional input
   ↓
1. Deterministic Intent Hints (exact workflow/name, phrases, keywords, input keys, negative penalties)
   ↓
2. Optional Qualification-Gated Small Classifier (core.classify; skipped if unqualified; anti-invention guard)
   ↓
3. Contract & Capability Check (input_requirements readiness, track/tool existence, qualification state)
   ↓
4. Decision Policy: selected | confirm_required | refused
```

## Decision Thresholds & Guarantees

- **Thresholds:**
  - `REFUSAL_THRESHOLD = 0.25` — requests scoring below this (or flagged `unsupported` when deterministic signal is weak) return `decision: "refused"`, `selected_workflow: null`, `selected_tracks: []`.
  - `HIGH_CONFIDENCE_THRESHOLD = 0.50` — requests scoring `[0.25, 0.50)` return `decision: "confirm_required"` with `uncertainty_reasons`.
  - `AMBIGUITY_MARGIN = 0.15` — when a runner-up candidate (`>= 0.25`) is within `0.15` of the top candidate, intake returns `confirm_required` listing ranked `candidates`.
- **Anti-invention guarantee:** If the optional small classifier outputs any `category` that is neither `"unsupported"` nor an exact `workflow_id` present in the loaded catalog, `classifier.invented_rejected` is set to `true` and the output is discarded in favor of deterministic scoring.
- **Safe execution gate (`POST /intake/route`, `POST /workflows/intake`):** When `options.execute === true`, execution is permitted **only** when `decision === "selected"` (or `decision === "confirm_required"` with `options.confirmed === true`) and `contract_check.ready_to_run === true`. Refused or unconfirmed ambiguous requests never execute (`execution: null`).

## Verification

- Evaluated against the 26-case human-labeled dataset covering all 8 built-in workflows, `incident_triage` (Workflow Pack), ambiguous prompts, and out-of-scope refusals: **26/26 (100.0% accuracy, 100.0% refusal recall, 0 invented tracks)**.
- Acceptance suite: `npm run test:task-intake`.
