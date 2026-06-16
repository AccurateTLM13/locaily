# Qwen2-VL-2B-Instruct (GGUF)

**Registry id:** `qwen-qwen2-vl-2b-instruct-gguf`  
**Runtime id:** `hf.co/mradermacher/Qwen2-VL-2B-Instruct-GGUF`  
**Primary role:** `vision_worker`  
**Priority:** High

## Role intent

Vision worker for screenshot analysis, UI inspection, and image-to-text tasks without cloud vision APIs.

## Target tracks

- `screenshot_analysis`
- `ui_inspection`
- `image_to_text`

## Why this candidate

Gives LocAIly visual understanding without jumping to cloud vision.

## Runtime notes

- Static quants of `Qwen/Qwen2-VL-2B-Instruct`
- Requires text backbone GGUF **and** `mmproj-fp16` from the same repo
- Prefer llama.cpp for reliable multimodal inference; Ollama vision support varies by model/build

Example llama.cpp CLI shape:

```bash
./llama-qwen2vl-cli \
  -m Qwen2-VL-2B-Instruct-Q4_K_M.gguf \
  --mmproj mmproj-fp16.gguf \
  -p "Describe this image." \
  --image test_image.jpg
```

## Evaluation status

Proposed — vision routing not implemented in Local Brain yet.
