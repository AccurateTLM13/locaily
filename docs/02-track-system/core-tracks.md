# Core Tracks

Reusable base track **types** Locaily expects to compose into workflows. These are conceptual building blocks — not every type has a standalone track file yet.

Status key: **Implemented** = used in a shipped track file | **Planned** = defined here, no track file yet

---

## Classification Track

**Status:** Implemented (Lighthouse `classify_issues` step)

**Purpose:** Group raw inputs into labeled categories for downstream steps.

**Input:** Structured source data (e.g. Lighthouse opportunities, audit items).

**Output:** Classified issues, ranked opportunities, category labels.

**Preferred handlers:** Deterministic tool (`lighthouse.classify_audits`) or `fast_worker` / `default_worker` model.

**Can be deterministic:** Yes — Lighthouse proof track uses deterministic classifier.

**Requires model:** No for Lighthouse proof track.

**Validation:** Output schema per workflow; issue count bounds.

**Used by:**

- Lighthouse Handoff
- DealSniper (planned)
- Content OS (planned)

---

## Extraction Track

**Status:** Implemented (Lighthouse `extract_metrics` step)

**Purpose:** Parse raw report/input into normalized metrics and structured fields.

**Input:** Raw workflow input (URL, scores, opportunities, diagnostics).

**Output:** Normalized metrics object, ranked opportunities where applicable.

**Preferred handlers:** Deterministic parser tools (`lighthouse.parse`).

**Can be deterministic:** Yes — preferred for audit workflows.

**Requires model:** No for Lighthouse proof track.

**Validation:** Schema match; required score fields present.

**Used by:**

- Lighthouse Handoff
- OCR Document Review (planned)

---

## Summarization Track

**Status:** Planned

**Purpose:** Condense structured or long text into bounded summaries.

**Input:** Text or structured artifacts from prior steps.

**Output:** Summary fields within token/schema limits.

**Preferred handlers:** `fast_worker` model or Standard Text Pack (`text.summarize`).

**Can be deterministic:** Partial — truncation rules only.

**Requires model:** Usually yes for quality summaries.

**Validation:** Max length, required sections.

**Used by:**

- Content OS (planned)
- Repo Review (planned)

---

## Routing Track

**Status:** Planned

**Purpose:** Choose which downstream track, tool, or worker handles the next phase.

**Input:** Classified or extracted artifacts + routing policy.

**Output:** Route decision (track id, handler id, confidence).

**Preferred handlers:** Rule engine or `fast_worker` classifier.

**Can be deterministic:** Yes for known workflow entry points.

**Requires model:** Optional.

**Validation:** Route must resolve to registered track or tool.

**Used by:**

- Future track classifier (not built)
- Multi-workflow Local Brain entry (planned)

---

## Validation Track

**Status:** Implemented (Lighthouse `validate_priority_fixes`, `verify_output` steps)

**Purpose:** Enforce contracts before and after model/tool output is accepted.

**Input:** Prior step artifacts + original input constraints.

**Output:** Valid/invalid flag, errors, corrected or rejected payloads.

**Preferred handlers:** Deterministic checkers (`lighthouse.validate_priority_fixes`, `lighthouse.verify_handoff`).

**Can be deterministic:** Yes — preferred.

**Requires model:** No for Lighthouse proof track.

**Validation:** Schema validation, metric preservation, business rules.

**Used by:**

- Lighthouse Handoff
- All workflows (recommended pattern)

---

## Planning Track

**Status:** Planned (research)

**Purpose:** Decompose a request into step list or dependency graph.

**Input:** User request + available tracks/tools.

**Output:** Track plan (linear today; graph in future).

**Preferred handlers:** `reasoning_worker` or dedicated planner module.

**Can be deterministic:** No for open-ended requests.

**Requires model:** Likely yes for open-ended planning.

**Validation:** Plan must reference registered tracks only.

**Used by:**

- Future Local Brain auto-routing (not built)

---

## Prioritization Track

**Status:** Implemented (Lighthouse `prioritize_fixes` step)

**Purpose:** Rank fixes or actions by impact, effort, or policy.

**Input:** Classified issues + opportunities.

**Output:** Ordered priority fixes, reasoning/thinking field optional.

**Preferred handlers:** `reasoning_worker` or `priority_helper` role.

**Can be deterministic:** Partial — tie-break rules only.

**Requires model:** Yes in Lighthouse proof track.

**Validation:** Priority list schema; items must reference known issues.

**Used by:**

- Lighthouse Handoff

---

## OCR Cleanup Track

**Status:** Planned

**Purpose:** Normalize noisy OCR output before classification or assembly.

**Input:** Raw OCR text blocks.

**Output:** Cleaned text, structure hints.

**Preferred handlers:** Deterministic cleanup + optional `fast_worker`.

**Can be deterministic:** Partial.

**Requires model:** Optional.

**Used by:**

- OCR Document Review (planned)

---

## Markdown Export Track

**Status:** Implemented (Lighthouse `write_handoff` step)

**Purpose:** Render final human- or agent-facing Markdown from validated JSON artifacts. This is an **export layer**, not orchestration state.

**Input:** JSON artifacts — metrics, classifications, priorities, matched fixes, URL.

**Output:** Handoff JSON object + rendered Markdown export field.

**Preferred handlers:** Workflow tool (`lighthouse-handoff` `compose-handoff`).

**Can be deterministic:** Partial — template rendering from JSON is deterministic; enhancement may use model.

**Requires model:** Optional (Memory Bridge preflight when enabled).

**Validation:** JSON output schema + JSON verify step before export.

**Used by:**

- Lighthouse Handoff
- Repo Review (planned)

Previously documented as "Markdown Assembly Track." Renamed to reflect JSON-first orchestration: Markdown is generated **from** JSON, not assembled as the primary source of truth.

---

## Matching Track

**Status:** Implemented (Lighthouse `match_fixes` step)

**Purpose:** Link prioritized fixes to classified issues or known patterns.

**Input:** Issues + priority fixes from prior artifacts.

**Output:** Matched fix mappings.

**Preferred handlers:** Deterministic tool (`lighthouse.match_fixes`).

**Can be deterministic:** Yes in Lighthouse proof track.

**Requires model:** No.

**Used by:**

- Lighthouse Handoff
