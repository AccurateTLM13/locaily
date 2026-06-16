# Model Candidates

Structured candidate list for LocAIly **Model Garage** evaluation. Entries in `registry.models.json` with `status: "proposed"` are unevaluated potential fits; `status: "candidate"` means at least one fixture benchmark exists; `status: "baseline"` is the comparison anchor.

## Strategy

- Expose **roles** to users, not raw model buffets
- Prefer small local models that fit the track
- Escalate roles only when validation fails
- Do not promote a model to production routing without fixture evidence

## Proposed Candidates (High Priority)

| Registry id | Model | Primary role | Tracks | Notes |
|---|---|---|---|---|
| `supralabs-supra-title-350m-exp-gguf` | [Supra-Title-350M-exp-GGUF](./supralabs/supra-title-350m-exp.md) | `title_worker` | title generation, run labeling, report naming, short summary | Very small LFM2 title model |
| `gravitee-io-very-small-prompt-compression-gguf` | [very-small-prompt-compression](./gravitee-io/very-small-prompt-compression.md) | `prompt_compression_worker` | prompt cleanup, context budgeting, router preprocessing | Pre-router prompt trimming |
| `paddlepaddle-paddleocr-vl-1.6-i1-gguf` | [PaddleOCR-VL-1.6-i1-GGUF](./paddlepaddle/paddleocr-vl-1.6-i1.md) | `ocr_worker` | OCR cleanup, document extraction, screenshot text extraction | VL OCR; llama.cpp + mmproj |
| `qwen-qwen2-vl-2b-instruct-gguf` | [Qwen2-VL-2B-Instruct-GGUF](./qwen/qwen2-vl-2b-instruct.md) | `vision_worker` | screenshot analysis, UI inspection, image-to-text | General local vision lane |
| `davidau-qwen3-zero-coder-reasoning-v2-0.8b-gguf` | [Qwen3-Zero-Coder-Reasoning-V2-0.8B](./davidau/qwen3-zero-coder-reasoning-v2-0.8b.md) | `coding_worker` | developer task expansion, code drafting, coding brainstorm, handoff enhancement | Tiny coding + reasoning worker |

## Evaluated Candidates

See [registry.models.json](./registry.models.json) for LiquidAI LFM2.5 variants and the `llama3.2` baseline with benchmark ranks and fixture links.

Benchmark artifacts: [benchmark-results/lighthouse-handoff/](./benchmark-results/lighthouse-handoff/)

## New Role Lanes (Proposed)

These roles extend the current operational set (`fast_worker`, `default_worker`, `reasoning_worker`, `voice_worker`) but are **not wired into runtime config yet**:

| Role | Intent |
|---|---|
| `title_worker` | Tiny naming/title generation and run labels |
| `prompt_compression_worker` | Prompt cleanup and context budgeting before routing |
| `ocr_worker` | OCR cleanup and document/screenshot text extraction |
| `vision_worker` | Screenshot analysis and UI inspection |
| `coding_worker` | Developer task expansion, code drafting, handoff enhancement |

## Evaluation Status

| Model | Role tested | Workflow | Result | Date |
|---|---|---|---|---|
| LiquidAI LFM2.5 family | mixed | Lighthouse Handoff | partial fixture evidence | 2026-06-14 |
| Proposed candidates above | — | — | not measured | — |

Use [docs/99-archive/research-notes/model-evaluation-template.md](../docs/99-archive/research-notes/model-evaluation-template.md) when recording runs.

## Do Not

- Present proposed entries as production routing defaults
- Claim a candidate beats an evaluated model without logged evidence
- Skip runtime notes for VL/OCR models that require mmproj files
