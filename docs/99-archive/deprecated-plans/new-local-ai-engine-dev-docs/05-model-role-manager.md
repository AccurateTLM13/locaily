# 05 — Model Role Manager and Auto Model Switching

## Purpose

The project should not offer a confusing model buffet.

It should offer **roles** and let the Engine choose the smallest capable model.

## Core Philosophy

> Use the smallest model possible. Escalate only when needed. Unload specialists after use.

## Model States

```txt
installed = model file exists on disk
loaded    = model is in RAM/VRAM and ready
active    = model is currently running a task
sleeping  = installed but not loaded
missing   = not installed
```

## Core Model Roles

### fast_worker

Best for:

```txt
classification
simple extraction
small cleanup
routing hints
short summaries
```

### default_worker

Best for:

```txt
clean notes
summaries
rewrites
structured markdown
general tool-backed tasks
```

### reasoning_worker

Best for:

```txt
harder logic
tool routing
multi-step planning
reviewing failed outputs
checking ambiguous cases
```

### voice_worker

Best for:

```txt
transcription
voice cleanup
speech-to-text pipeline
```

### vision_worker

Phase 2+ only.

Best for:

```txt
screenshot review
image description
UI checks
```

## Example Role Config

```json
{
  "profiles": {
    "lightweight": {
      "policy": "single_loaded",
      "max_auto_model_gb": 2.5,
      "roles": {
        "fast_worker": "qwen3-1.7b-q4",
        "default_worker": "qwen3-1.7b-q4",
        "reasoning_worker": null
      }
    },
    "balanced": {
      "policy": "smart_load",
      "max_auto_model_gb": 4,
      "roles": {
        "fast_worker": "lfm2.5-1.2b-q4",
        "default_worker": "smollm3-3b-q4",
        "reasoning_worker": "phi-4-mini-q4"
      }
    },
    "developer": {
      "policy": "multi_warm",
      "max_auto_model_gb": 7,
      "roles": {
        "fast_worker": "qwen3-1.7b-q4",
        "default_worker": "smollm3-3b-q4",
        "reasoning_worker": "deepseek-r1-distill-qwen-1.5b-q4",
        "heavy_reasoning_optional": "deepseek-r1-distill-qwen-7b-q4"
      }
    }
  }
}
```

## Auto Model Switching Flow

```txt
1. Receive task
2. Determine required model role
3. Check if role model is loaded
4. If loaded, run task
5. If not loaded, check memory
6. Unload lower-priority models if needed
7. Load specialist
8. Run task
9. Validate result
10. Unload specialist if policy requires
11. Return to lightweight/default model
```

## Escalation Rules

Escalate from fast_worker to default_worker when:

```txt
schema fails twice
confidence below threshold
input is longer than fast_worker limit
task requires polished writing
```

Escalate from default_worker to reasoning_worker when:

```txt
task requires multi-step decision
tool routing is ambiguous
previous output contradicts rules
result needs review
```

Do not escalate automatically to heavy models unless user enabled developer profile.

## Memory Policy

### lightweight

```txt
only one model loaded at a time
unload specialist immediately
never auto-load models above limit
```

### balanced

```txt
keep default model warm
load specialist on demand
unload specialist after task
```

### developer

```txt
allow multiple warm models
show detailed memory controls
allow benchmarks
```

## User-Facing Labels

Do not show raw model names by default.

Show:

```txt
Fast Worker
Default Worker
Reasoning Worker
Voice Worker
```

Advanced settings can show raw model names.

## Acceptance Criteria

The Model Role Manager is done when:

- tools request model roles, not raw model names
- roles map to configured models
- model state is tracked
- specialist models can be loaded/unloaded
- escalation can happen after failure
- user profile controls max model size
- audit log records model switch events
