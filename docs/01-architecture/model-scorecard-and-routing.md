# Model Scorecard and Routing

## Purpose

Model Scorecards, also called **Model Skill Sheets**, describe what each local model is available for, what it is good at, what it should not be trusted with, and what routing guardrails apply.

They are the missing data layer between:

```txt
Model Skill Sheet -> Model Registry -> Task Router -> Local Brain
```

The goal is not to rank models with one generic score. The goal is to route each task track to the best available local capability, then validate and fall back when confidence is low.

## Current Status

Implemented today:

- Model roles such as `fast_worker`, `default_worker`, `reasoning_worker`, and `voice_worker`
- Role suitability metadata in `companion/core/model-profiles.js`
- Runtime provider routing through Ollama and mock providers
- Per-workflow role assignment in Lighthouse Handoff orchestration
- Scoreboard and audit hooks for early evaluation data

Target direction:

- Static model scorecard files checked into a registry
- A model selector that uses scorecards, hardware fit, provider availability, task track, and validation policy
- Logged routing decisions explaining why a model, tool, rule, or human review path was selected

Until evaluation evidence exists, scorecards must be treated as **experimental profiles**, not benchmark claims.

## Why Locaily Needs Skill Sheets

Locaily is capability-first, not model-first. A task should begin with:

```txt
What kind of job is this?
Can it be deterministic?
Does it need a model?
Does it need decomposition?
What output contract and validator apply?
Which available capability best fits each step?
```

Small local models are useful when they are boxed into clean lanes: classification, extraction, rewriting, structured output, routing hints, or narrow summaries. They become risky when asked to make unsupported factual claims, perform high-stakes validation, or plan broad workflows without checks.

The scorecard makes those lanes explicit.

## Model Scorecard Schema

Suggested v1 shape:

```json
{
  "model_id": "example-model",
  "display_name": "Example Model",
  "status": "candidate",
  "license": "needs_review",
  "provider": "unknown",

  "runtime": {
    "supported": ["ollama", "llama.cpp"],
    "preferred": "ollama",
    "formats": ["GGUF"]
  },

  "hardware_profile": {
    "cpu_only": true,
    "gpu_supported": true,
    "min_ram_gb": 8,
    "recommended_ram_gb": 16,
    "min_vram_gb": null,
    "load_time_ms": null,
    "avg_tokens_per_second": null
  },

  "skill_scores": {
    "intent_detection": 0,
    "classification": 0,
    "summarization": 0,
    "structured_output": 0,
    "tool_routing": 0,
    "function_calling": 0,
    "rewrite_cleanup": 0,
    "reasoning": 0,
    "coding_help": 0,
    "validation": 0,
    "final_assembly": 0
  },

  "best_for": [],
  "acceptable_for": [],
  "avoid_for": [],

  "requirements": {
    "needs_grounded_context": true,
    "needs_schema_constraints": true,
    "needs_validator": true
  },

  "fallback": {
    "fallback_model": null,
    "fallback_tool": null,
    "fallback_behavior": "ask_for_review"
  },

  "benchmarks": {},
  "benchmark_interpretation": {},
  "known_failure_modes": [],
  "notes": ""
}
```

Score values are `0` to `10` and mean local confidence for a specific track, not global model quality. A model can be strong for extraction and weak for factual QA at the same time.

## Task Track Schema

Task tracks describe the work, not the model.

```json
{
  "track_id": "classification",
  "display_name": "Classification",
  "handler_preference": ["rule", "tool", "model"],
  "required_skills": ["classification", "structured_output"],
  "required_output": "json_schema",
  "risk_level": "low",
  "needs_grounding": false,
  "validator_required": true,
  "fallback_policy": "retry_then_escalate"
}
```

Track metadata lets the router match a request to a handler type and then to a model role only when a model is needed.

## Handler Types

The Local Brain should choose between four handler types:

| Handler | Use When |
|---|---|
| Rule | The step is deterministic, simple, or safety-critical enough to avoid model judgment |
| Tool | The step needs parsing, formatting, schema validation, local file access, or another concrete capability |
| Model | The step benefits from language understanding, summarization, rewriting, classification, or constrained reasoning |
| Human review | The step is high-stakes, ambiguous, unsupported by local evidence, or repeatedly fails validation |

Model-aware routing does not mean model-only routing.

## How the Local Brain Selects Models

Target flow:

```txt
User Request
  -> Intent + Task Classifier
  -> Task Complexity Check
  -> Task Decomposer
  -> Track Assignment
  -> Handler Selection
  -> Model/Tool Selection
  -> Execution
  -> Validation
  -> Fallback or Retry
  -> Final Assembly
```

The selector should consider:

- Runtime availability: provider is running and model is installed
- Task fit: scorecard skill scores match required track skills
- Hardware fit: model can run within the active profile and local limits
- Output fit: model has enough structured-output reliability for the schema
- Risk fit: task risk is low enough or has a validator/fallback
- Context fit: task has grounded input when the model requires grounding
- Failure history: recent retries, schema failures, latency, or validation failures

Future route score:

```txt
route_score =
  skill_fit
+ hardware_fit
+ speed_fit
+ context_fit
+ output_format_fit
+ reliability_score
- risk_penalty
- load_time_penalty
- failure_history_penalty
```

The first implementation can be rule-based. The score formula should only become active after evaluation logging produces enough evidence.

## When Tasks Should Be Decomposed

Start with rule-based decomposition for known workflows:

| Request Shape | Decomposition |
|---|---|
| PageSpeed or Lighthouse report | Parse -> extract issues -> classify -> prioritize -> write handoff -> validate |
| Summarization request | Extract relevant text -> summarize -> validate shape |
| Comparison request | Extract -> normalize -> compare -> summarize |
| Report generation request | Extract -> classify -> prioritize -> format -> validate |

Later layers:

1. **Task classifier model** labels task type, risk, tracks, grounding needs, and whether decomposition is required.
2. **Planner model** proposes steps for flexible workflows.
3. **Rules and validators** check the classifier or planner output before execution.

The classifier and planner do not own final authority. They produce routing hints that the Local Brain checks.

## Model Roles

Current operational roles in code:

| Role | Intended Fit |
|---|---|
| `fast_worker` | Classification, simple extraction, routing hints, short summaries |
| `default_worker` | Summaries, rewrites, structured Markdown, general tool tasks |
| `reasoning_worker` | Multi-step planning, tool routing, failed output review, logic checks |
| `voice_worker` | Future voice cleanup and speech-to-text work |

Target scorecard archetypes can be layered underneath these roles:

| Archetype | Meaning |
|---|---|
| Scout | Fast intent detection and routing hints |
| Extractor | Structured extraction from messy input |
| Sorter | Classification, tagging, grouping, scoring |
| Writer | Rewriting, explanation, Markdown generation |
| Planner | Step decomposition under rule checks |
| Tool Caller | Function calls and structured tool use |
| Verifier | Schema, claim, and rule checks when evidence supports it |
| Assembler | Combining validated pieces into final output |
| Fallback Brain | Heavier local model used only when smaller workers fail |

These archetypes should not replace the public role map until they are proven useful in evaluation.

## Fallback Behavior

Fallback should be explicit and logged.

Common policies:

| Policy | Behavior |
|---|---|
| `deterministic_fallback` | Use rules/tools when runtime is unavailable |
| `retry_same_model` | Retry once with stricter prompt/schema constraints |
| `escalate_role` | Move from `fast_worker` to `default_worker` or `reasoning_worker` |
| `switch_handler` | Use a deterministic tool instead of model output |
| `ask_for_review` | Return a review-needed result instead of pretending confidence is high |
| `fail_closed` | Stop when validation or permissions fail |

Do not silently jump to a larger or cloud model. Escalation must respect local-first settings and user profile limits.

## Evaluation Logging

Every scorecard field that claims measured performance should point to evidence:

- Input fixture or workflow run
- Hardware profile
- Provider and model version
- Track or step id
- Schema validity
- Duration and tokens where available
- Human usefulness rating where applicable
- Validation failures and retry behavior
- Scoreboard entry, audit metadata, or validation artifact

Use `docs/03-research/model-evaluation-template.md` for early human-recorded runs. Future automated runs can write summarized results into scorecards after review.

## Example: Lighthouse Handoff

Request:

```txt
Analyze this PageSpeed report and make a coding-agent handoff.
```

Expected workflow:

```json
{
  "workflow": "lighthouse_handoff",
  "requires_decomposition": true,
  "tracks": [
    "parse_report",
    "extract_issues",
    "classify_priority",
    "generate_tasks",
    "write_markdown",
    "validate_structure"
  ]
}
```

Routing:

| Step | Track | Preferred Handler |
|---|---|---|
| 1 | Parse report | Deterministic parser |
| 2 | Extract issues | Rule/tool |
| 3 | Classify priority | `fast_worker` or `default_worker` model |
| 4 | Generate tasks | `default_worker` or `reasoning_worker` model |
| 5 | Write Markdown | Formatter + writer model |
| 6 | Validate output | Rule validator |

The Lighthouse report remains the source of truth. Model output can improve handoff wording and prioritization, but validators must preserve facts, schema, and metric integrity.

## Open Questions

- What file layout should hold scorecards: `registry/models/`, `companion/model-registry/`, or `docs/03-research/` until implemented?
- Which score fields are manually curated vs generated from evaluation runs?
- What is the minimum evidence needed before a scorecard becomes `recommended` instead of `candidate`?
- How should recent failure history influence routing without making behavior hard to explain?
- Should NearbyNode advertisements include model scorecard ids or only hardware/runtime capabilities?
- How much routing explanation should be returned to clients vs kept in audit logs?
