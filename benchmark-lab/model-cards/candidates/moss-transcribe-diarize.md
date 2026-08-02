---
schema: locaily.model_candidate_card.v1
modelId: openmoss-team-moss-transcribe-diarize
displayName: MOSS Transcribe-Diarize
sourceRepository: https://huggingface.co/OpenMOSS-Team/MOSS-Transcribe-Diarize
sourceCheckedAt: 2026-08-02
verificationStatus: unverified
qualificationStatus: untested
localAvailability: not_confirmed
hardwareTarget: desktop-rtx2060-6gb-ram32gb
---

# MOSS Transcribe-Diarize

> **Evidence boundary:** This is a candidate intake card. It records repository metadata and a proposed Locaily role, not local transcription or diarization results.

## Source-Backed Profile

- **Publisher:** OpenMOSS Team
- **Task:** Audio-text-to-text
- **Library / format:** Transformers / safetensors
- **Parameter count:** 908.5M
- **Architecture metadata:** `moss_transcribe_diarize`
- **Capability tags:** ASR, diarization, timestamp ASR, long-form audio, multilingual
- **Language metadata:** English and Chinese
- **License metadata:** Apache-2.0
- **Source:** https://huggingface.co/OpenMOSS-Team/MOSS-Transcribe-Diarize

The source repository includes evaluation-result metadata. Locaily has not reproduced or promoted those results.

## Why Locaily Is Tracking It

[Inference] This is a direct specialist candidate for turning local recordings into timestamped, speaker-separated evidence before downstream models summarize, classify, or extract decisions.

## Candidate Tracks

- Audio transcription
- Speaker diarization
- Timestamped segment generation
- Meeting-ingest preprocessing
- Voice-note conversion
- Subtitle or searchable transcript preparation

## Avoid Until Tested

- Speaker identity claims
- Legal, medical, or compliance-grade transcripts
- Assuming multilingual quality from metadata alone
- Long-recording guarantees
- Automatic project-memory writeback without transcript review
- Treating acoustic or speaker labels as ground truth

## Hardware-Fit Hypothesis

[Inference] The parameter count suggests this may fit within the RTX 2060 6 GB and 32 GB RAM desktop, but supported precision, peak memory for long audio, processing speed, custom-code requirements, and Windows behavior remain unverified.

## First Validation Plan

1. Confirm the exact revision, files, dependencies, and custom-code trust requirements.
2. Confirm supported audio format, sampling requirements, precision, and device configuration on the RTX 2060.
3. Run a short clean single-speaker clip.
4. Run a short two-speaker clip with known turn boundaries.
5. Run a noisy or overlapping-speech clip.
6. Measure transcript accuracy, speaker-attribution accuracy, timestamp validity, processing time, RAM, and VRAM.
7. Compare against the current local transcription baseline, if one exists.

## Promotion Gate

- **To `tested`:** One controlled local audio run with reviewed transcript, timestamps, and hardware measurements.
- **Beyond `untested`:** Promoted evidence from a transcription/diarization Track suite with human-reviewed expected outputs.

## Evidence Log

No Locaily-controlled evidence recorded.
