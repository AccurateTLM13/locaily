---
schema: locaily.model_candidate_card.v1
modelId: meta-muse-glimmer-30b
displayName: Meta Muse Glimmer 30B
sourceRepository: https://huggingface.co/meta-models/Muse-Glimmer-30B
sourceCheckedAt: 2026-08-11
verificationStatus: unverified
qualificationStatus: untested
localAvailability: not_confirmed
hardwareTarget: desktop-rtx2060-6gb-ram32gb
---

# Meta Muse Glimmer 30B

> **Evidence boundary:** This is a research candidate, not an installed model, Locaily benchmark result, qualification, routing default, or NearbyNode implementation.

## Source-Backed Profile

- **Publisher:** Meta (`meta-models` on Hugging Face)
- **Model family:** Muse Glimmer
- **Parameter count:** Approximately 30B (model name); exact parameter breakdown is not recorded in the retrieved source metadata.
- **Task / architecture:** `image-text-to-text`; `MuseGlimmerForConditionalGeneration` (`muse_glimmer`)
- **Modalities:** Text and image input; text output. Audio support is not source-verified here.
- **License metadata:** Apache-2.0
- **Source artifacts:** [Transformers / safetensors model](https://huggingface.co/meta-models/Muse-Glimmer-30B) and [official GGUF artifacts](https://huggingface.co/meta-models/Muse-Glimmer-30B-GGUF)
- **Official artifact revisions observed 2026-08-11:** safetensors `a4e59da52a7bc87ae7251dd5545c0dd437c44b68`; GGUF `a0532f7263ee67f1e0a5f5c5fdcd50dd62fc9aa4`.
- **Tool use:** The official source chat template contains an ATEM function-call protocol. Locaily has not tested tool-call correctness or tool-loop behavior.
- **Agentic / coding capability:** Candidate hypotheses only; neither capability is Locaily-validated.
- **Languages / exact context limit:** Not source-verified in this intake.
- **Quantization / formats:** Official GGUF repository contains a named 17 GB artifact, a dynamic GGUF artifact, `dflash-kquant.gguf`, and `mmproj-kquant.gguf`; exact quantization level and performance are unverified.

## Locaily Classification

- **Model class:** `local-heavy`
- **Capability class:** `agentic-generalist`
- **Candidate roles:** `crew-chief`, `heavy-nearbynode`, `escalation-model`, `general-agent`, `coding-agent`

These are evaluation targets, not role assignments. Glimmer does not replace Locaily's deterministic-tool or tiny-specialist lanes and has no recommended role or runtime routing entry.

## Runtime and Hardware Boundary

The current target has an NVIDIA RTX 2060 with 6 GB VRAM. The official named GGUF artifact alone is 17 GB, so this target cannot hold that artifact fully in VRAM; context, vision projection, KV cache, and runtime overhead would add more demand. No CPU/offload configuration, RAM requirement, latency, context capacity, or successful local load has been measured.

Benchmark Lab currently executes live models through Ollama only. The official source has Transformers safetensors and GGUF files, but Locaily has not verified a compatible Ollama, llama.cpp, vLLM, SGLang, or other local-runtime version. The candidate is registered as an unavailable Benchmark Lab manifest for provenance and future selection after an exact local artifact and runtime are installed; the M3 UI intentionally will not display it as selectable until then.

## Benchmark Plan

Use existing Benchmark Lab suites and exact-provenance manifests to compare, without creating a Glimmer-only framework:

1. Glimmer alone on the fixed suite.
2. Glimmer with Locaily tools/context using existing tool-use and mode-comparison paths.
3. Existing tiny specialist / Crew baseline.
4. Tiny specialist with Glimmer escalation, only after a bounded contract exists.
5. A separately declared external baseline under the same evaluation conditions.

Record runtime model name, exact artifact digest, quantization, prompt/template, hardware profile, context configuration, tool configuration, repeated trials, and failures. No comparison is qualified until the normal review, promotion, and qualification gates pass.

## NearbyNode Review

No NearbyNode change is required. The existing advertisement schema already accepts additional properties and represents a capability, status, connector, permissions, schemas, and track affinity. A future trusted node may advertise local inference with agentic-generalist, coding, and tool-use capabilities while referencing this model, but NearbyNode remains spec-only and must not be treated as an implemented Glimmer dispatch path.

## Known Limitations

- No model weights are installed locally; no local inference was attempted.
- No exact artifact digest is pinned for a runnable configuration.
- No Locaily evidence supports general-agent, coding-agent, tool-use, or escalation suitability.
- The available GPU does not fit the named 17 GB GGUF fully in VRAM.

## First Validation Gate

1. Select a supported runtime and pin the exact official artifact, digest, quantization, template, and context setting.
2. Confirm a controlled load on a named hardware profile.
3. Update the manifest with the observed runtime model name and digest.
4. Run existing basic-tool-use and one fixed general/coding-relevant suite with repeated trials.
5. Review resource use and failures before considering any routing or NearbyNode work.

## Evidence Log

No Locaily-controlled runtime, benchmark, or qualification evidence recorded.
