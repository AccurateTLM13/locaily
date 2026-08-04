---
schema: locaily.model_candidate_card.v1
modelId: empero-ai-qwythos-9b-claude-mythos-5-1m-gguf
displayName: Qwythos 9B Claude Mythos 5 1M GGUF
sourceRepository: https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF
sourceCheckedAt: 2026-08-02
verificationStatus: unverified
qualificationStatus: untested
localAvailability: not_confirmed
hardwareTarget: desktop-rtx2060-6gb-ram32gb
---

# Qwythos 9B Claude Mythos 5 1M GGUF

> **Evidence boundary:** This is a candidate intake card. Names, tags, and repository claims are not Locaily benchmark results.

## Source-Backed Profile

- **Publisher:** Empero AI
- **Task:** Image-text-to-text
- **Library / format:** GGUF
- **Model-family metadata:** Qwen3.5
- **Capability tags:** Reasoning, function calling, multimodal, vision, agentic
- **Context metadata:** Repository advertises `1M-context`
- **Language metadata:** English
- **License metadata:** Apache-2.0
- **Source:** https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF

The repository name references Claude Mythos. This intake card does not interpret that name as Anthropic model ownership or equivalent capability.

## Why Locaily Is Tracking It

[Inference] This may be a practical middle-tier local model for review, grounded synthesis, multimodal inspection, and bounded supervision when tiny workers are insufficient.

## Candidate Tracks

- Grounded document synthesis
- Worker-output review
- Bounded task decomposition
- Function-call generation
- Screenshot or image-assisted inspection
- Final response assembly from validated evidence

## Avoid Until Tested

- Treating the advertised context length as practical on the target desktop
- Whole-repository autonomous coding
- Long-horizon autonomous tool chains
- High-stakes factual or security decisions
- Unvalidated multimodal conclusions
- Using visible reasoning text as trusted evidence

## Hardware-Fit Hypothesis

[Inference] A suitable quantized build may run through GPU offload plus system RAM on the RTX 2060 6 GB and 32 GB RAM desktop. Full GPU residency, useful context size, vision memory overhead, latency, and output quality are unknown.

## First Validation Plan

1. Select and pin one exact GGUF quantization and digest.
2. Confirm the chat template, vision-projector requirements, and supported runtime.
3. Run text-only smoke tests before enabling vision or tools.
4. Measure load time, RAM, VRAM, time to first token, and generation speed at 8K and 16K context targets.
5. Run one grounded synthesis suite and one constrained tool-call suite.
6. Test whether reasoning output can be stripped without damaging the final answer contract.
7. Add multimodal testing only after text behavior is understood.

## Promotion Gate

- **To `tested`:** Controlled local text run with the exact artifact and hardware profile.
- **Beyond `untested`:** Promoted evidence for a named Track, prompt/template version, context profile, and validator contract.

## Evidence Log

No Locaily-controlled evidence recorded.
