---
schema: locaily.model_candidate_card.v1
modelId: prism-ml-ternary-bonsai-27b-gguf
displayName: Ternary Bonsai 27B GGUF
sourceRepository: https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf
sourceCheckedAt: 2026-08-02
verificationStatus: unverified
qualificationStatus: untested
localAvailability: not_confirmed
hardwareTarget: desktop-rtx2060-6gb-ram32gb
---

# Ternary Bonsai 27B GGUF

> **Evidence boundary:** This is a candidate intake card. It does not prove local installation, runtime compatibility, speed, memory use, quality, or qualification.

## Source-Backed Profile

- **Publisher:** PrismML
- **Task:** Text generation
- **Library / format:** llama.cpp / GGUF
- **Base-model metadata:** `Qwen/Qwen3.6-27B`
- **Representation tags:** Ternary, 2-bit
- **Backend tags:** CUDA, Metal, llama.cpp
- **License metadata:** Apache-2.0
- **Source:** https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf

The source repository includes evaluation-result metadata, but Locaily has not reproduced or promoted any result from it.

## Why Locaily Is Tracking It

[Inference] This may provide a compressed large-model tier between ordinary local workers and cloud escalation. Its potential Locaily role is a heavyweight local reviewer or synthesis worker invoked only when smaller workers fail or disagree.

## Candidate Tracks

- Bounded multi-source synthesis
- Failed-output review
- Final assembly of validated worker outputs
- Complex but grounded explanation
- Experimental local escalation

## Avoid Until Tested

- Default worker routing
- Autonomous multi-file coding
- High-stakes factual verification
- Permission or safety decisions
- Claims that ternary compression preserves sufficient quality for Locaily Tracks
- Large-context operation on the target desktop

## Hardware-Fit Hypothesis

[Inference] The model may be runnable through substantial CPU/RAM participation on the RTX 2060 6 GB and 32 GB RAM desktop. Responsiveness, supported runtime build, context limits, GPU offload behavior, and practical memory use are unknown.

This card must not be changed to `tested` merely because the model launches on another machine or a hosted demo works.

## First Validation Plan

1. Confirm the exact GGUF artifact, quantization/representation, digest, and required llama.cpp build.
2. Confirm whether the target runtime can load it without unsupported custom patches.
3. Run a minimal grounded text-generation smoke test at a small context.
4. Record RAM, VRAM, load time, time to first token, and generation speed.
5. Compare one bounded synthesis task against a smaller local worker.
6. Test validator pass rate and escalation usefulness rather than generic chat quality.
7. Review results before any Benchmark Lab status change.

## Promotion Gate

- **To `tested`:** One controlled run on the named desktop with exact artifact and runtime identifiers.
- **Beyond `untested`:** Promoted Track-specific evidence showing a useful escalation role under documented hardware and context limits.

## Evidence Log

No Locaily-controlled evidence recorded.
