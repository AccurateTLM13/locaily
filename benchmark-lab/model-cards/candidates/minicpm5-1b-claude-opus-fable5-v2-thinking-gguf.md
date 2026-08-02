---
schema: locaily.model_candidate_card.v1
modelId: gnllot-minicpm5-1b-claude-opus-fable5-v2-thinking-gguf
displayName: MiniCPM5 1B Claude Opus Fable5 V2 Thinking GGUF
sourceRepository: https://huggingface.co/GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF
sourceCheckedAt: 2026-08-02
verificationStatus: unverified
qualificationStatus: untested
localAvailability: not_confirmed
hardwareTarget: desktop-rtx2060-6gb-ram32gb
---

# MiniCPM5 1B Claude Opus Fable5 V2 Thinking GGUF

> **Evidence boundary:** This is a candidate intake card. The repository name and tags do not establish equivalence to Claude Opus or prove Locaily task performance.

## Source-Backed Profile

- **Publisher:** GnLOLot
- **Task:** Text generation
- **Library / format:** GGUF / llama.cpp-compatible metadata
- **Model-family metadata:** MiniCPM5 1B
- **Capability tags:** Thinking, tool calling, function calling, coding, instruction following
- **Language metadata:** English and Chinese
- **License metadata:** Apache-2.0
- **Source:** https://huggingface.co/GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF

The source metadata does not constitute Locaily evidence for reasoning, coding, or tool-use reliability.

## Why Locaily Is Tracking It

[Inference] This may be a lightweight general crew worker for tightly bounded language tasks where speed, low memory use, and validator-friendly output matter more than broad reasoning depth.

## Candidate Tracks

- Intent classification
- Structured extraction
- Short rewriting and cleanup
- Small Markdown or JSON transformations
- Bounded instruction following
- Simple tool-selection hints
- Short code transformation under tests

## Avoid Until Tested

- Broad planning
- Long-horizon tool use
- Autonomous repository changes
- Final factual verification
- Permission-sensitive decisions
- Trusting visible reasoning as proof
- Treating the model name as evidence of frontier-model behavior

## Hardware-Fit Hypothesis

[Inference] A 1B GGUF should be a strong fit candidate for the RTX 2060 6 GB and 32 GB RAM desktop at modest context sizes. Exact quantization, full GPU residency, context behavior, latency, and output reliability remain unverified.

## First Validation Plan

1. Select and pin an exact GGUF quantization and digest.
2. Confirm the correct chat template and think/no-think controls.
3. Run capability probes for text completion, chat completion, guided JSON, and tool arguments where supported.
4. Compare think and no-think behavior on the same bounded fixtures.
5. Run intent-classification, structured-output, and short rewrite suites.
6. Record invalid JSON, invented fields, overlong reasoning, retries, latency, RAM, and VRAM.
7. Test escalation behavior when the worker cannot satisfy the contract.

## Promotion Gate

- **To `tested`:** One controlled local run with exact quantization, runtime, prompt mode, and hardware profile.
- **Beyond `untested`:** Promoted evidence for one narrow Track; no broad worker qualification from a single suite.

## Evidence Log

No Locaily-controlled evidence recorded.
