# 01 — Architecture Overview

## High-Level Shape

```txt
Apps / Clients
    ↓
Input Gate
    ↓
Context Handler
    ↓
Task Router
    ↓
Tool Registry
    ↓
Provider Router
    ↓
Model Role Manager
    ↓
Result Validator
    ↓
Fallback Router
    ↓
Audit Log
```

## Main Components

### 1. Apps / Clients

Clients are anything that can call the local engine.

Examples:

- Desktop Companion
- Chrome extension
- Website widget
- Voice/Mumble client
- CLI
- Internal tool
- Demo web app

Clients should not know which model is being used. They should call tools through the Engine.

### 2. Input Gate

The first defensive layer.

Responsibilities:

- normalize input
- enforce size limits
- detect input type
- chunk oversized input
- strip obvious prompt injection
- classify risk level
- reject malformed requests
- prepare input for Context Handler

### 3. Context Handler

The nervous system of the engine.

Responsibilities:

- build the context packet
- preserve run state
- track step outputs
- carry source/app metadata
- carry permissions
- carry fallback policy
- pass context between tools/models
- preserve audit-ready metadata

### 4. Task Router

Decides which tool or tool chain should run.

Responsibilities:

- resolve requested tool
- validate tool exists
- validate tool permissions
- choose model role if needed
- select workflow path
- call Tool Registry

### 5. Tool Registry

Loads and indexes available tools.

Responsibilities:

- load standard tools
- load installed tool packs
- expose tool metadata
- validate tool manifests
- map tool IDs to run handlers
- expose tool list to clients

### 6. Provider Router

Routes model calls to the appropriate provider backend.

Potential providers:

- Liquid / LEAP
- llama.cpp
- Ollama
- LM Studio
- OpenAI-compatible local endpoint
- Whisper / whisper.cpp
- mock provider
- optional cloud fallback later

### 7. Model Role Manager

Assigns tasks to model roles instead of raw model names.

Core roles:

```txt
fast_worker
default_worker
reasoning_worker
voice_worker
vision_worker
```

The Model Role Manager should also handle:

- loaded/unloaded state
- memory policy
- auto model switching
- model warm cache
- escalation rules
- specialist unloading

### 8. Result Validator

Ensures tool outputs are usable.

Responsibilities:

- validate output schema
- check JSON validity
- check required fields
- check confidence
- identify warnings
- trigger fallback when needed

### 9. Fallback Router

Handles sad paths.

Examples:

- retry same model once
- escalate to stronger role
- return partial result
- ask for user review
- fail cleanly with error envelope
- block unsafe operation

### 10. Audit Log

Every run should be logged.

Log:

- source app
- tool called
- model role used
- provider used
- permissions used
- fallback path
- duration
- success/failure
- warnings
- output summary

## Design Principle

The core should be boring and stable.

The weird/fun workflows should live in tool packs.
