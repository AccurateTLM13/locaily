---
schema: locaily.model_candidate_card.v1
modelId: sentence-transformers-all-minilm-l6-v2
displayName: all-MiniLM-L6-v2
sourceRepository: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
sourceCheckedAt: 2026-08-02
verificationStatus: unverified
qualificationStatus: untested
localAvailability: not_confirmed
hardwareTarget: desktop-rtx2060-6gb-ram32gb
---

# all-MiniLM-L6-v2

> **Evidence boundary:** This is a candidate intake card. It records source metadata and proposed Locaily uses, not local retrieval quality or routing performance.

## Source-Backed Profile

- **Publisher:** Sentence Transformers
- **Task:** Sentence similarity
- **Library:** sentence-transformers
- **Architecture:** BERT
- **Parameter count:** 22.7M
- **Language metadata:** English
- **Supported ecosystem tags:** PyTorch, TensorFlow, Rust, ONNX, OpenVINO, safetensors
- **License metadata:** Apache-2.0
- **Source:** https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

## Why Locaily Is Tracking It

[Inference] This may serve as a small, always-available semantic utility for retrieval, clustering, duplicate detection, memory lookup, semantic caching, and shortlisting candidate skills or capabilities before a generative model is invoked.

## Candidate Tracks

- Semantic document retrieval
- Memory lookup
- Similarity scoring
- Duplicate and near-duplicate detection
- Topic clustering
- Skill or Track candidate shortlisting
- Semantic cache lookup

## Avoid Until Tested

- Using similarity as proof that two statements mean exactly the same thing
- Final routing authority without rules or review
- Whole-document embedding without a defined chunking contract
- Factual verification
- Permission decisions
- Comparing vectors produced by different model versions as if they share one space

## Hardware-Fit Hypothesis

[Inference] This model should be suitable for CPU-first execution on the 32 GB RAM desktop, leaving the RTX 2060 available for generative or audio workers. Actual indexing speed, query latency, memory use, runtime packaging, and retrieval quality are unverified.

## First Validation Plan

1. Pin the exact model revision, files, digest, runtime, pooling behavior, and normalization settings.
2. Define a deterministic, structure-aware chunking contract.
3. Build a small Locaily retrieval fixture set with correct files, memories, Tracks, and distractors.
4. Measure recall@3, recall@5, mean reciprocal rank, duplicate false positives, query latency, and indexing speed.
5. Compare keyword-only, embedding-only, and hybrid retrieval.
6. Test skill/capability shortlisting while keeping final selection rule- or model-reviewed.
7. Record index-version metadata so future model changes require reindexing and revalidation.

## Promotion Gate

- **To `tested`:** One controlled local indexing and retrieval run using a named fixture set and exact model revision.
- **Beyond `untested`:** Promoted retrieval or routing-shortlist evidence with documented chunking, normalization, index version, and acceptance thresholds.

## Evidence Log

No Locaily-controlled evidence recorded.
