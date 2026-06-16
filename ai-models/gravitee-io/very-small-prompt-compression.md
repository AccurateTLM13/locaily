# Gravitee.io very-small-prompt-compression (GGUF)

**Registry id:** `gravitee-io-very-small-prompt-compression-gguf`  
**Runtime id:** `hf.co/mradermacher/very-small-prompt-compression-GGUF`  
**Primary role:** `prompt_compression_worker`  
**Priority:** High

## Role intent

Prompt compression worker that trims short prompts before routing to small models.

## Target tracks

- `prompt_cleanup`
- `context_budgeting`
- `router_preprocessing`

## Why this candidate

Reduces prompt size before routing to small models.

## Runtime notes

- Base model: `gravitee-io/very-small-prompt-compression` (~60.5M seq2seq params)
- GGUF quants: `mradermacher/very-small-prompt-compression-GGUF`
- Designed for prompts ≤64 tokens; may need a dedicated preprocessing adapter rather than standard chat routing

## Evaluation status

Proposed — integration path into Pit Crew router is unproven.
