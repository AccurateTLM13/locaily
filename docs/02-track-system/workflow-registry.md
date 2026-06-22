# Workflow Registry

Workflows are **user-facing jobs** composed from core tracks and workflow-specific steps. A workflow may map to one track file or several tracks in the future.

Status: **Implemented** — workflow orchestration API + track files for Lighthouse Handoff and DealSniper.

---

## Lighthouse Handoff

**Workflow type:** Website audit → developer handoff

**Status:** **Implemented** as linear track

**Track ID:** `website_audit.lighthouse_handoff`

**Uses core tracks:**

- Extraction (`extract_metrics`)
- Classification (`classify_issues`)
- Prioritization (`prioritize_fixes`)
- Validation (`validate_priority_fixes`, `verify_output`)
- Matching (`match_fixes`)
- Markdown Export (`write_handoff`) — rendered from JSON artifacts

**Specialized steps:**

- Lighthouse metric extraction (`lighthouse.parse`)
- Lighthouse audit classification (`lighthouse.classify_audits`)
- Lighthouse priority validation (`lighthouse.validate_priority_fixes`)
- Handoff composition (`lighthouse-handoff` / `compose-handoff`)

**Entry points:**

- `POST /workflows/run` with `workflow_id: "lighthouse_handoff"` (orchestration layer)
- `POST /workflows/plan` to inspect the run plan without executing
- `POST /tracks/run` with `track_id: "website_audit.lighthouse_handoff"`
- `POST /tasks/run` / `POST /analyze` with `lighthouse-handoff` tool (orchestrated mode)

**Run plan doc:** [../03-workflows/lighthouse-handoff-run-plan.md](../03-workflows/lighthouse-handoff-run-plan.md)

**Validation evidence:** [../04-validation/](../04-validation/), [../03-workflows/lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md)

**Known gaps:** Extension ↔ Local Brain HTTP bridge not implemented; L3/L4 validation open.

**Doc:** [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md)

---

## DealSniper

**Workflow type:** Marketplace listing analysis

**Status:** **Implemented** as linear track

**Track ID:** `marketplace.dealsniper`

**Uses core tracks:**

- Extraction (`prepare_listing`)
- Summarization / analysis (`analyze_listing`)
- Validation (`validate_analysis`)

**Specialized steps:**

- Listing normalization (`deal-sniper` / `prepare-listing`)
- Deal analysis (`deal-sniper` / `analyze-listing`)
- Output schema validation (`deal-sniper` / `validate-analysis`)

**Entry points:**

- `POST /tracks/run` with `track_id: "marketplace.dealsniper"`
- `POST /tasks/run` / `POST /analyze` with `deal-sniper` tool

**Doc:** [../03-workflows/dealsniper.md](../03-workflows/dealsniper.md)

---

## Content OS

**Workflow type:** Content pipeline (draft, clean, summarize, publish prep)

**Status:** **Planned**

**Uses core tracks (planned):**

- Extraction
- Classification
- Summarization
- Markdown Export
- Validation

**Current implementation:** Standard Text Pack tools only (`text.clean`, `text.summarize`, etc.) — no composed workflow track.

---

## Repo Review

**Workflow type:** Repository analysis → review handoff

**Status:** **Planned**

**Uses core tracks (planned):**

- Extraction
- Classification
- Summarization
- Prioritization
- Markdown Export
- Validation

**Current implementation:** None.

---

## OCR Document Review

**Workflow type:** OCR capture → cleaned document → review handoff

**Status:** **Planned**

**Uses core tracks (planned):**

- OCR Cleanup
- Extraction
- Classification
- Validation
- Markdown Export

**Current implementation:** None.

---

## Adding a Workflow

1. Define workflow doc from [../03-workflows/workflow-template.md](../03-workflows/workflow-template.md)
2. Map core tracks + specialized steps
3. Add `*.track.json` under `companion/pit-crew/tracks/`
4. Replace hardcoded step input mapping with declarative maps — see [step-input-mapping.md](./step-input-mapping.md)
5. Add validation evidence under [../04-validation/](../04-validation/)

Do not add a workflow to this registry as **Implemented** until a track file exists and smoke/validation evidence is recorded.
