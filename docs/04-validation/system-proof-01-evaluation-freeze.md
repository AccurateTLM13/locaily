# SYSTEM-PROOF-01 Evaluation Freeze & Pre-Experiment Baseline

- **Milestone:** `system-proof-01-real-workflow-proof`
- **Session:** `session-20261002-001`
- **Date:** 2026-10-02
- **Status:** FROZEN (Pre-Execution)

---

## 1. Proof Fixture Selection & Provenance

A real-world open source repository was selected and cloned as the evaluation fixture. Locaily has never previously seen, processed, benchmarked, or qualified against this repository.

- **Repository:** `expressjs/express`
- **Upstream Remote:** `https://github.com/expressjs/express.git`
- **Local Fixture Path:** `data/fixtures/sp01-express`
- **Commit SHA:** `7ef98448f8b38099ab1ded55e458538ad47a51e7`
- **Fixture Verification:** Verified clean clone at HEAD commit `7ef98448f8b38099ab1ded55e458538ad47a51e7`.

---

## 2. Ground-Truth Reference (Deterministic Scan Baseline)

The deterministic scanner (`repo-scan:scan`) was executed against `data/fixtures/sp01-express` to establish the exact ground truth against which all outputs will be scored:

- **Total Files:** `214`
- **Total Lines:** `26,984`
- **Language Distribution:**
  - `js`: 141 files
  - `ejs`: 20 files
  - `txt`: 11 files
  - `html`: 8 files
  - `none`: 7 files
  - `yml`: 7 files
- **Deterministic Findings (6 oversized files flagged):**
  1. `History.md` — 3,924 lines (`area: .`, `severity: 5`, `effort: 4`, maintainability)
  2. `test/app.router.js` — 1,218 lines (`area: test`, `severity: 5`, `effort: 4`, maintainability)
  3. `lib/response.js` — 1,050 lines (`area: lib`, `severity: 5`, `effort: 4`, maintainability)
  4. `test/res.sendFile.js` — 914 lines (`area: test`, `severity: 5`, `effort: 4`, maintainability)
  5. `test/express.urlencoded.js` — 829 lines (`area: test`, `severity: 5`, `effort: 4`, maintainability)
  6. `test/express.static.js` — 816 lines (`area: test`, `severity: 5`, `effort: 4`, maintainability)
- **Primary Domain Category:** `maintainability` (due to massive test files and large router/response components) or `documentation` (if weighted on History.md).

---

## 3. Review Task & Input Definition

All conditions receive the exact same underlying task and inputs:

- **Workflow:** `repo_review`
- **Target Repository:** `data/fixtures/sp01-express`
- **Task Requirements:**
  1. Ingest/scan repository structure and extract heuristic findings.
  2. Classify repository status into standard categories (`correctness`, `performance`, `security`, `maintainability`, `documentation`).
  3. Prioritize findings using severity and effort weights.
  4. Summarize repository status into a developer brief (up to 5 key points).
  5. Produce a complete developer handoff report conforming to `companion/schemas/repo-review-handoff.schema.json` with human-readable markdown.

---

## 4. Model & Runtime Environment Configuration

All model invocations are executed locally against Ollama v0.34.4 running on `http://127.0.0.1:11434`:

| Role | Model Identifier | Parameters / Size | SHA / Digest | Qualification Record |
|---|---|---|---|---|
| **Baseline Model (Cond A & B)** | `llama3.2:latest` | ~3.2B / 2.0 GB | `a80c4f17acd5` | `llama3.2-local-llama3.2-core-classify-v1`, `llama3.2-local-llama3.2-core-summarize-v1` |
| **Locaily Primary Worker (Cond C)** | `hf.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF:latest` | ~1.2B / 730 MB | `5791ac70d52d` | `lfm25-1p2b-instruct-local-lfm25-1p2b-instruct-core-classify-v1`, `lfm25-1p2b-instruct-local-lfm25-1p2b-instruct-core-summarize-v1` |
| **Locaily Fallback Worker (Cond C-fail)** | `hf.co/LiquidAI/LFM2.5-350M-GGUF:latest` | ~350M / 229 MB | `1f41ea409551` | `lfm25-350m-local-lfm25-350m-core-classify-v1` |

---

## 5. Frozen Evaluation Rubric

Before observing any experimental results, the scoring rubric is frozen as follows:

### A. Output Quality Metrics
1. **Factual Accuracy (0–100%):**
   - Scoring: Proportion of factual claims (file counts, line numbers, language proportions, named files) that accurately match ground truth.
   - Deduction: -20% for each hallucinated file count or fabricated line count.
2. **Useful Findings Count:**
   - Number of distinct, real, verifiable findings or architectural observations relevant to the codebase.
3. **Unsupported / Hallucinated Findings Count:**
   - Number of findings, file names, or security/correctness claims that do not correspond to actual repository contents.
4. **Completeness (0–100%):**
   - 25%: Category classification with rationale.
   - 25%: Ranked priority items with score/severity.
   - 25%: Executive summary / developer brief points.
   - 25%: Actionable developer handoff markdown report.
5. **Structured-Output Compliance:**
   - Schema validation against `companion/schemas/repo-review-handoff.schema.json`.
   - Pass = `true`, Fail = `false` (+ list of validation errors).

### B. Execution Behavior Metrics
1. **Wall-Clock Duration (ms):** Total end-to-end execution time.
2. **Retries & Failures:** Count of failed attempts, unhandled exceptions, and retries.
3. **Worker Audit Trail:** Transparency of which model, role, and qualification record handled each step.

### C. Failure Behavior Metrics (Condition C-fail)
1. **Failure Isolation (Boolean):** Does a failure in an individual track crash the entire run, or is it contained?
2. **Recovery Usability (Boolean):** Does fallback produce a usable, valid partial result?

---

## 6. Experimental Conditions

- **Condition A — Single-Model Baseline (Monolithic):**
  One single local qualified model (`llama3.2`) receives the entire repo review task directly in a single monolithic prompt/call, without Locaily track decomposition.
- **Condition B — Decomposed Same-Model Baseline:**
  The same model (`llama3.2`) executes the Locaily `repo_review` tracks in sequence (decomposed through Locaily's pipeline, but without multi-model routing or qualification).
- **Condition C — Locaily Qualification & Routing:**
  Locaily orchestrated execution with qualification and routing selecting the appropriate qualified capability model (`LFM2.5-1.2B-Instruct`) for each role, backed by qualification evidence.
- **Condition C-fail — Controlled Capability Failure:**
  Condition C with an injected simulated model failure on the primary model to evaluate fallback recovery and track failure isolation.

---

## 7. Thesis Gate Criteria

- **POSITIVE:** Condition C demonstrates a measurable system-level advantage over Condition A in at least one thesis-relevant dimension: reliability, structured-output compliance, failure isolation, controllability, predictable recovery, or comparable usefulness at a lower model tier (e.g. 1.2B LFM matching/exceeding 3.2B Llama).
- **NULL:** No meaningful measurable difference between Condition A and Condition C on thesis-relevant dimensions.
- **NEGATIVE:** Condition C is materially worse than Condition A on primary quality or reliability.
- **Null/Negative Trigger:** If verdict is NULL or NEGATIVE, produce a root-cause diagnosis document; do not proceed to subsequent roadmap milestones without explicit approval.
