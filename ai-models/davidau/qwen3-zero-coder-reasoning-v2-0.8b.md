# DavidAU Qwen3-Zero-Coder-Reasoning-V2-0.8B (GGUF)

**Registry id:** `davidau-qwen3-zero-coder-reasoning-v2-0.8b-gguf`  
**Ollama runtime id:** `hf.co/mradermacher/Qwen3-Zero-Coder-Reasoning-V2-0.8B-GGUF`  
**Primary role:** `coding_worker`  
**Priority:** High

## Role intent

Tiny coding worker for developer task expansion, code drafting, coding brainstorm, and Lighthouse Handoff enhancement steps.

## Target tracks

- `developer_task_expansion`
- `code_drafting`
- `coding_brainstorm`
- `handoff_enhancement`

## Why this candidate

Strong fit for Lighthouse Handoff and developer workflows.

## Quick pull

```powershell
ollama run hf.co/mradermacher/Qwen3-Zero-Coder-Reasoning-V2-0.8B-GGUF
```

## LocAIly validation (when wired)

```powershell
node scripts/validate-console.js --mode l2_ollama_memory --model hf.co/mradermacher/Qwen3-Zero-Coder-Reasoning-V2-0.8B-GGUF --url https://example.com/
```

## Evaluation status

Proposed — not yet benchmarked on Lighthouse Handoff fixtures.
