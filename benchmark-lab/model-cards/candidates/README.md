# Candidate Model Cards

Candidate Model Cards record models worth evaluating before Locaily has local benchmark evidence for them.

They are deliberately separate from `../published/`:

- `candidates/` contains manually researched intake cards.
- `drafts/` contains temporary generated artifacts and is Git-ignored.
- `published/` contains cards generated from promoted Benchmark Lab evidence.

A candidate card is not a recommendation, qualification, benchmark result, or proof that the model runs on the target hardware.

## Status Model

Candidate cards use two different status fields because availability and evidence are not the same thing.

### `verificationStatus`

| Status | Meaning |
|---|---|
| `unverified` | Source metadata was captured, but Locaily has not completed a controlled local run. |
| `tested` | At least one controlled local run exists, but the result may still be narrow, incomplete, or unpromoted. |

### `qualificationStatus`

This follows the canonical Benchmark Lab lifecycle:

`untested -> screening -> candidate -> qualified | conditional | rejected | revalidation_required`

A card becoming `tested` does not make it `qualified`. Qualification requires reviewed, promoted evidence and a qualification record.

## Target Hardware Profile

The initial local target referenced by these cards is:

```yaml
desktop:
  gpu: NVIDIA RTX 2060
  vram_gb: 6
  physical_ram_gb: 32
```

Hardware-fit statements in unverified cards are hypotheses only. Actual runtime, quantization, context, latency, and memory use must be measured locally.

## Current Intake

| Model | Type | Initial Locaily hypothesis | Verification | Qualification |
|---|---|---|---|---|
| Ternary Bonsai 27B GGUF | Generative / compressed large model | Heavy local escalation and synthesis | Unverified | Untested |
| Qwythos 9B Claude Mythos 5 1M GGUF | Multimodal generative model | Local reviewer, synthesis, bounded supervisor | Unverified | Untested |
| MOSS Transcribe-Diarize | Audio specialist | Transcription, timestamps, and speaker diarization | Unverified | Untested |
| MiniCPM5 1B Fable5 V2 Thinking GGUF | Tiny generative worker | General bounded worker with tool-use potential | Unverified | Untested |
| MiniCPM5 1B Agentic Tooluse GGUF | Tiny tool-use worker | Single-action tool router | Unverified | Untested |
| all-MiniLM-L6-v2 | Embedding model | Semantic retrieval, clustering, deduplication, and routing shortlist | Unverified | Untested |
| Meta Muse Glimmer 30B | Multimodal generative / agentic-generalist candidate | Heavy-local escalation, general agent, coding and tool-use evaluation | Unverified | Untested |

## Required Promotion Path

1. Confirm license and redistribution terms.
2. Pin an exact model file, quantization, digest, runtime, and prompt/template version.
3. Install or expose the model through a supported local provider.
4. Run capability probes where applicable.
5. Run a controlled Track-specific suite on a named hardware profile.
6. Review failures and resource measurements.
7. Promote approved evidence.
8. Generate the published model card and qualification record.

Do not copy vendor or repository benchmark claims into Locaily qualification fields as if Locaily reproduced them.
