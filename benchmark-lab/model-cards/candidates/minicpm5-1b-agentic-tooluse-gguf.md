---
schema: locaily.model_candidate_card.v1
modelId: ewinregirgojr-minicpm5-1b-agentic-tooluse-gguf
displayName: MiniCPM5 1B Agentic Tooluse GGUF
sourceRepository: https://huggingface.co/ewinregirgojr/MiniCPM5-1B-Agentic-Tooluse-GGUF
sourceCheckedAt: 2026-08-02
verificationStatus: unverified
qualificationStatus: untested
localAvailability: not_confirmed
hardwareTarget: desktop-rtx2060-6gb-ram32gb
---

# MiniCPM5 1B Agentic Tooluse GGUF

> **Evidence boundary:** This is a candidate intake card. Tool-use tags and source-repository evaluations are not Locaily qualification evidence.

## Source-Backed Profile

- **Publisher:** ewinregirgojr
- **Task:** Text generation
- **Library / format:** GGUF / llama.cpp
- **Model-family metadata:** MiniCPM5 1B
- **Capability tags:** Tool calling, function calling, XML tool calling, agentic tool use
- **Quantization tags:** Q4_K_M, Q8_0, F16
- **Dataset metadata:** Team-ACE/ToolACE
- **License metadata:** `other` — mandatory review required
- **Source:** https://huggingface.co/ewinregirgojr/MiniCPM5-1B-Agentic-Tooluse-GGUF

## Why Locaily Is Tracking It

[Inference] This may be useful as a dedicated single-action dispatcher: convert a bounded request and a small allowlisted tool catalog into one parseable tool call, while the Locaily controller retains permission, execution, retry, and stopping authority.

## Candidate Tracks

- Single-step tool selection
- Function argument generation
- Capability routing from a constrained catalog
- File/search/test tool dispatch
- Natural-language-to-action translation

## Avoid Until Tested

- Autonomous multi-step execution
- Self-authorized tool access
- Permission decisions
- Executing generated arguments without schema validation
- Choosing from large or ambiguous tool catalogs
- Assuming clean stopping behavior
- Bundling or redistribution before license review

## Hardware-Fit Hypothesis

[Inference] A 1B GGUF should be a strong fit candidate for the RTX 2060 6 GB and 32 GB RAM desktop. Tool-call accuracy, stopping behavior, XML parsing stability, latency, and quantization effects remain unverified.

## Required Controller Boundary

A future integration should use this pattern:

```txt
bounded request + allowlisted tools
  -> model proposes one call
  -> deterministic parser stops at the first complete call
  -> schema and permission validation
  -> external executor
  -> result returned to supervisor
```

The model must never own permissions or directly execute generated actions.

## First Validation Plan

1. Resolve license and redistribution status before installation or bundling decisions.
2. Select and pin one exact quantization, digest, chat template, and XML call format.
3. Run basic generation and parsing smoke tests.
4. Run a controlled single-tool-selection suite with known expected tools and arguments.
5. Measure valid-call rate, correct-tool rate, exact-argument rate, invented-tool rate, extra-output rate, and stop-boundary failures.
6. Test malformed and permission-denied scenarios.
7. Compare against the broader MiniCPM5 Fable5 candidate using identical fixtures.

## Promotion Gate

- **To `tested`:** License review plus one controlled local tool-call run with exact artifact and hardware profile.
- **Beyond `untested`:** Promoted evidence for a constrained tool-routing Track with deterministic parsing and permission enforcement.

## Evidence Log

No Locaily-controlled evidence recorded.
