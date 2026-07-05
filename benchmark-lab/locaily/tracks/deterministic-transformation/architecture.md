# Deterministic Transformation and Hybrid Routing

## Principle

Models handle ambiguity and capability selection. Deterministic components handle known transformations.

## Model Responsibilities

* interpret user requests
* select capabilities and tools
* classify ambiguous input
* make semantic judgments
* explain outcomes

## Deterministic Responsibilities

* known field mapping
* type normalization
* schema construction
* validation
* checksums
* defined calculations
* canonical formatting

## Validated Pattern

```
User request
→ model selects capability (e.g., get_weather)
→ tool returns structured data
→ deterministic transformer maps data to output schema
→ validator verifies output
→ final structured result
```

## Evidence (llama3.2-local)

| Configuration | Tool Selection | Schema Validity | Source Fidelity | Reliability | Formatting Latency |
|---|---|---|---|---|---|
| Canonical TC-65 (model-only) | 3/3 | 0% | 0% | PARTIAL | ~2.5s |
| Hybrid (model + deterministic) | 3/3 | 100% | 100% | PASS | <1ms |
| Transform-only baseline | N/A | 100% | 100% | PASS | <1ms |

## Scope

This pattern is validated for the weather tool-to-schema workflow with llama3.2-local.
Deterministic transformers do not generalize automatically to arbitrary schemas.
Each schema-specific transformer requires explicit implementation, testing, and fixture coverage.

## Invalidation Conditions

The combined hybrid qualification is invalidated when any of the following change:

* model
* model quantization
* runtime model name
* runtime adapter
* Ollama version (where relevant)
* tool contract
* transformer version
* transformer checksum
* source schema
* destination schema
* evaluator version

## Decision

For deterministic known-schema mappings where benchmark evidence demonstrates higher reliability
than tested model-generated formatting, LocAIly prefers registered deterministic transformers.
In the tested TC-65 weather workflow, deterministic transformation was more reliable than
model-generated schema construction for the tested models.
