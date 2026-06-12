# Packaging Plan - Local AI Platform

## Goal

Make the Local AI Platform easy enough for open-source testers first, then package it into a user-friendly desktop companion later.

## Packaging Stages

## Stage 1 - Developer/Test Package

This stage is implemented for the current MVP.

### User Flow

```txt
1. Install Node.js
2. Install Ollama
3. Pull a supported model
4. Clone repo
5. Run companion server
6. Load client tool/extension
```

### Example Commands

```bash
ollama pull llama3.2
node companion/server.js
```

Current implementation:

- Node companion server exists.
- Ollama adapter exists.
- Smoke test exists.
- README includes setup and alternate-port instructions.
- Windows launcher exists at `start-windows.bat`.
- PowerShell development launcher exists at `start-dev.ps1`.
- Startup output includes local URL, active provider, provider availability, selected model role/model, registered tool count, and smoke-test guidance.

Still missing for a smoother tester package:

- Example client folders

### Pros

- Fast to build
- Easy to debug
- Good for open-source contributors
- Avoids installer complexity

### Cons

- Too technical for normal users
- Requires terminal comfort
- Requires separate Ollama setup

## Stage 2 - Tester-Friendly Package

Add simple launch helpers.

Status: started for Windows. Mac/Linux helpers are deferred until non-Windows testing starts.

### Add

```txt
start-windows.bat      implemented
start-dev.ps1          implemented
start-mac.sh           deferred
start-linux.sh         deferred
```

Windows batch example:

```bat
@echo off
echo Starting Local AI Platform...
node companion\server.js
pause
```

### Add Better Status Output

On start, print:

```txt
Local AI Platform running at http://127.0.0.1:31313
Checking Ollama at http://127.0.0.1:11434...
Ollama detected: yes/no
Selected model: llama3.2
Registered tools: deal-sniper, lighthouse-handoff
```

The current server prints this same information in a compact status block. Port conflicts include Windows `netstat` guidance and an alternate-port example.

## Stage 3 - Desktop Companion App

This is the real user version.

Status: planned but not started. The implementation decision is documented in `docs/04-product/desktop-companion-decision.md`.

Current direction: Tauri-first, with Electron as a fallback if prototype work proves Tauri is a poor fit.

Do not start implementation until the server API, tester package, and manifest-loader direction are stable.

### User Flow

```txt
1. Install Local AI Companion
2. Open app
3. App checks runtime/model status
4. User starts local AI service
5. Client tools connect automatically
```

### Desktop App Responsibilities

- Start/stop companion server
- Show local server status
- Show Ollama status
- Show selected model
- Show installed models
- Show connected tools
- Show recent requests/logs in safe way
- Provide setup guidance

### Possible Tech Choices

Options to evaluate later:

- Tauri
- Electron
- Native Node wrapper
- Simple tray app

Do not pick prematurely unless the server core is stable.

## Stage 4 - Runtime/Model Bundling

Later, decide whether to bundle or auto-install runtime/model support.

### Option A - Do Not Bundle Model

The platform checks for Ollama and guides the user.

Pros:

- Smaller installer
- Easier licensing
- Faster release
- Users can choose models

Cons:

- More setup friction

### Option B - Assisted Model Download

The companion app helps install/pull a recommended model.

Pros:

- Better UX
- Still avoids massive installer

Cons:

- Requires more app logic
- Requires clear model licensing notes

### Option C - Bundle Runtime + Model

The app ships with everything.

Pros:

- Best normal-user UX

Cons:

- Large installer
- Licensing complexity
- Updates are harder
- More support burden

## Recommended Path

Start with:

```txt
Node companion + Ollama adapter + clear docs
```

Then move to:

```txt
Simple launcher scripts
```

Then move to:

```txt
Desktop companion app
```

Do not try to solve model bundling on day one.

## Publish Package Checklist

Before public open-source release:

- README explains what this is.
- README explains what this is not.
- Setup is tested on Windows.
- Health endpoint works.
- Ollama setup is documented.
- DealSniper works as the required MVP tool.
- Lighthouse Handoff exists as a stub/demo integration.
- Errors are readable and use the standard envelope.
- License is chosen.
- Security note explains localhost-only behavior.
- Contribution path is clear.
