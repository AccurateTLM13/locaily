# Model Candidates

Research notes for **AI Pit Crew** roles. These are candidates for evaluation—not confirmed production choices.

Source: archived `15-model-strategy.md` and project research. **No benchmark results in this repo yet.**

## Strategy

- Expose **roles** to users, not raw model buffets
- Prefer small local models that fit the track
- Escalate roles only when validation fails

## Roles and Candidate Models

### Fast Worker

**Good for:** classification, simple extraction, short cleanup, routing hints

Candidates:

```txt
LFM2.5-350M
LFM2.5-1.2B
Qwen3-1.7B
```

### Default Worker

**Good for:** summaries, rewrites, clean notes, structured markdown

Candidates:

```txt
LFM2.5-1.2B
SmolLM3 3B
Llama 3.2 3B
```

**Repo default today:** `llama3.2` via Ollama config (not proven optimal for all tracks).

### Reasoning Worker

**Good for:** tool routing, multi-step checks, logic review, failed output review

Candidates:

```txt
Phi-4-mini
DeepSeek-R1-Distill-Qwen-1.5B
```

### Heavy Optional (not default)

Larger models only when user explicitly enables a developer/power profile. Not part of Locaily's default thesis.

## Evaluation Status

| Model | Role tested | Workflow | Result | Date |
|---|---|---|---|---|
| — | — | — | not measured | — |

Use [model-evaluation-template.md](./model-evaluation-template.md) when recording runs.

## Provider Notes

First implemented provider: **Ollama** (`companion/runtime/ollama.js`).

Others under consideration: LM Studio, llama.cpp, Liquid/LEAP, OpenAI-compatible local endpoints. See [runtime-options.md](./runtime-options.md).

## Do Not

- Present this list as "the models Locaily uses"
- Claim a candidate beats a larger model without logged evidence
