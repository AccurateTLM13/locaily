# 15 — Model Strategy

## Goal

The Engine should prove that small local models can do useful work when assigned the right jobs.

## Do Not Offer a Model Buffet

Users should not have to pick from 30 raw model names.

Expose roles:

```txt
Fast Worker
Default Worker
Reasoning Worker
Voice Worker
```

## Recommended Starting Roles

### Fast Worker

For:

```txt
classification
simple extraction
short cleanup
routing hints
```

Candidates:

```txt
LFM2.5-350M
LFM2.5-1.2B
Qwen3-1.7B
```

### Default Worker

For:

```txt
summaries
rewrites
clean notes
structured markdown
```

Candidates:

```txt
LFM2.5-1.2B
SmolLM3 3B
Llama 3.2 3B
```

### Reasoning Worker

For:

```txt
tool routing
multi-step checks
logic review
failed output review
```

Candidates:

```txt
Phi-4-mini
DeepSeek-R1-Distill-Qwen-1.5B
```

### Heavy Optional

Not default.

Candidates:

```txt
DeepSeek-R1-Distill-Qwen-7B
```

Use only in developer profile.

## Profiles

### Lightweight

```txt
one model loaded at a time
no auto-load above ~2.5GB
aggressive unload
```

### Balanced

```txt
default model warm
specialist loads on demand
specialist unloads after task
```

### Developer

```txt
allow multiple warm models
allow optional heavier fallback
benchmark mode
```

## Model Selection Principle

```txt
Smallest model that can reliably pass the output validator.
```

## Benchmark Harness

Every model should be tested against:

```txt
text.clean
text.summarize
text.extract_json
text.classify
tool.choose
schema.retry
```

Track:

```txt
latency
valid schema rate
quality score
memory usage
fallback count
```

## Model Source Notes

The project planning PDF lists several candidate local models and approximate footprints, including Liquid LFM2.5, Qwen3-1.7B, SmolLM3 3B, Phi-4-mini, Llama 3.2 3B, and DeepSeek-R1 distilled variants. Verify current official licenses and model availability before shipping defaults.
