# 16 — Open Questions

## Product Questions

1. Should Desktop Companion be Tauri or Electron?
2. Should v1 use SQLite for audit logs?
3. Should tool packs be local folders only at first?
4. Should MCP support be built in v1 or added after the native tool-pack format works?
5. Should the first client be a demo web app or Chrome bridge?

## Security Questions

1. How strict should prompt injection detection be in v1?
2. Should website widget clients be delayed until origin/auth handling is mature?
3. Should network permissions be disabled for all community tools by default?
4. How should sensitive audit data be redacted?

## Model Questions

1. Which provider should be first: Ollama, LM Studio, or direct llama.cpp?
2. Should Liquid be first provider or second after OpenAI-compatible local provider?
3. What max model size should balanced profile allow?
4. Should model downloads be managed by Engine or delegated to provider tools?

## Tool Pack Questions

1. What is the minimum manifest format?
2. Should tools run in-process or sandboxed?
3. How should version compatibility be declared?
4. Should community packs require signing/checksums?

## Future Questions

1. How should Content OS pack save notes?
2. When should Mumble/Voice pack be added?
3. Should DealSniper and PageSpeed remain showcase-only?
4. Should tool directory be a website, Git repo list, or local folder index?
