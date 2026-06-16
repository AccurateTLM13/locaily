# PaddlePaddle PaddleOCR-VL-1.6-i1 (GGUF)

**Registry id:** `paddlepaddle-paddleocr-vl-1.6-i1-gguf`  
**Runtime id:** `hf.co/mradermacher/PaddleOCR-VL-1.6-i1-GGUF`  
**Primary role:** `ocr_worker`  
**Priority:** High

## Role intent

OCR worker for document parsing, OCR cleanup, and screenshot text extraction.

## Target tracks

- `ocr_cleanup`
- `document_extraction`
- `screenshot_text_extraction`

## Why this candidate

Enables image/PDF/document workflows locally.

## Runtime notes

- Imatrix-weighted quants of `PaddlePaddle/PaddleOCR-VL-1.6`
- Vision-language OCR model: requires text GGUF **and** mmproj companion file
- Primary path today: llama.cpp / llama-server with `--mmproj`
- Ollama native support for PaddleOCR-VL is still maturing

Example llama.cpp server shape:

```bash
llama-server \
  -m /path/to/PaddleOCR-VL-1.6.gguf \
  --mmproj /path/to/PaddleOCR-VL-1.6-mmproj.gguf \
  --port 8080
```

## Evaluation status

Proposed — not yet wired into LocAIly orchestration.
