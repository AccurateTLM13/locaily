# Multi-Device Pilot (M9)

**Status:** Infrastructure prepared — pilot not yet executed on physical hardware
**Created:** 2026-07-13

## Overview

The M9 physical multi-device pilot validates that Locaily's relay node architecture works
across real hardware — not just simulated test environments. The pilot exercises three
relay policies (`local-only`, `local-first`, `distributed`) against the same track
workflows, collecting timing metrics and placement evidence for comparison.

This document describes the prerequisites, setup, run procedures, evidence collection,
and tear-down for the pilot. The pilot infrastructure (schema, templates, runner script)
lives under `scripts/pilot/`.

## Prerequisites

### Hardware

- **Two physical devices** on the same local network (LAN)
  - Device A: orchestrator / Local Brain (the machine running the pilot runner)
  - Device B: relay node (a second machine running a Local Brain instance)
- Both devices must have network connectivity to each other (ping test recommended)

### Software

- **Node.js >= 18** on both devices
- **Ollama** installed and running on both devices (or mock provider for testing)
- At least one model pulled on each device (e.g. `llama3.2`, `lfm2.5-1.2b-thinking`)
- **Locaily** repository cloned on both devices (same commit recommended)

### Configuration

- `RELAY_TOKEN` environment variable set on both devices (shared pre-shared token for relay authentication)
- Device B's Local Brain must be reachable from Device A (not bound to `127.0.0.1` only — use `0.0.0.0` or the LAN IP)

## Hardware Profiles

Each device participating in the pilot needs a hardware profile describing its
capabilities. Use the template at `scripts/pilot/hardware-profile-template.json`:

1. Copy the template to a new file for each device:
   ```bash
   cp scripts/pilot/hardware-profile-template.json scripts/pilot/device-a.json
   cp scripts/pilot/hardware-profile-template.json scripts/pilot/device-b.json
   ```

2. Fill in the placeholder values with real hardware information:
   - `deviceName` — human-readable name (e.g. `"desktop-gpu"`, `"laptop-arm"`)
   - `os` — operating system and version
   - `cpu` — CPU model and core count
   - `ram.gb` — total system RAM in GB
   - `vram.gb` — GPU VRAM in GB (0 if no discrete GPU)
   - `vram.gpu` — GPU model name
   - `runtimeProvider` — `"ollama"` or `"mock"`
   - `availableModels` — array of model names pulled on this device
   - `advertisedCapabilities` — array of capability roles this device can serve
   - `networkAddress` — base URL of the Local Brain (e.g. `"http://192.168.1.50:31313"`)

3. Validate profiles against the schema:
   ```bash
   node -e "const Ajv = require('ajv'); const ajv = new Ajv(); const schema = require('./scripts/pilot/hardware-profile.schema.json'); const validate = ajv.compile(schema); const profile = require('./scripts/pilot/device-a.json'); console.log(validate(profile) ? 'VALID' : JSON.stringify(validate.errors));"
   ```

## Setup

### Device A (Orchestrator)

1. Start the Local Brain:
   ```bash
   set RELAY_TOKEN=your-shared-token
   npm start
   ```

2. Verify it is running:
   ```bash
   curl http://127.0.0.1:31313/health
   ```

### Device B (Relay Node)

1. Start the Local Brain on Device B, binding to the LAN interface:
   ```bash
   set RELAY_TOKEN=your-shared-token
   set LOCAL_AI_BIND=0.0.0.0
   npm start
   ```

2. Register Device B with Device A's Local Brain:
   ```bash
   curl -X POST http://DEVICE_A_IP:31313/relay/register -H "Content-Type: application/json" -d "{\"nodeId\": \"device-b\", \"baseUrl\": \"http://DEVICE_B_IP:31313\", \"label\": \"Device B\", \"capabilities\": [\"default_worker\", \"priority_helper\"]}"
   ```

3. Verify registration:
   ```bash
   curl http://DEVICE_A_IP:31313/relay/nodes
   ```

## Run Procedures

### Local-Only Mode

No relay nodes are used. All steps execute on Device A's Local Brain.

```bash
npm.cmd run pilot:local-only
```

Or directly:
```bash
node scripts/pilot/pilot-runner.js --policy local-only --repeat 3
```

### Local-First Mode

Steps execute locally when the Local Brain is capable. Relay nodes are used only when
the local runtime cannot serve a role.

```bash
npm.cmd run pilot:local-first
```

Or directly:
```bash
node scripts/pilot/pilot-runner.js --policy local-first --repeat 3
```

### Distributed Mode

The placement planner distributes steps across all healthy relay nodes based on
capability and load. Steps may execute on Device B even when Device A is capable.

```bash
npm.cmd run pilot:distributed
```

Or directly:
```bash
node scripts/pilot/pilot-runner.js --policy distributed --repeat 3
```

### Custom Workflow and Input

```bash
node scripts/pilot/pilot-runner.js --policy distributed --workflow marketplace.dealsniper --input ./my-input.json --repeat 5
```

## Evidence Collection

The pilot runner writes evidence to `data/pilot-evidence/` by default (override with
`--output-dir`).

### Per-Run Evidence Files

Each run produces a JSON file: `run-<runId>-<NNN>.json`

Contains:
- `run_id` — unique pilot run identifier
- `run_number` — sequential run number
- `policy` — relay policy used
- `workflow` — track ID executed
- `total_duration_ms` — wall-clock time for the run
- `ok` — whether the run succeeded
- `relay_placement` — summary of planned vs actual placement
  - `planned` — placement plan from the planner
  - `actual_step_count` — number of steps executed
  - `relay_nodes_used` — count of distinct relay nodes that executed steps
  - `relay_node_ids` — list of relay node IDs that executed steps
- `track_run_record_id` — reference to the canonical Track Run Record
- `steps` — per-step timing and executor details

### Summary CSV

Each pilot run produces a summary CSV: `summary-<runId>.csv`

Columns:
- `policy` — relay policy
- `workflow` — track ID
- `run_number` — sequential run number
- `total_duration_ms` — wall-clock duration
- `ok` — success flag
- `relay_nodes_used` — number of relay nodes involved

## Tear-Down

1. Unregister Device B from Device A:
   ```bash
   curl -X POST http://DEVICE_A_IP:31313/relay/unregister -H "Content-Type: application/json" -d "{\"nodeId\": \"device-b\"}"
   ```

2. Stop the Local Brain on both devices (Ctrl+C or close the terminal).

3. Archive evidence:
   ```bash
   # Optionally copy evidence to a permanent location
   xcopy /E /I data\pilot-evidence archive\pilot-evidence-YYYY-MM-DD
   ```

## Known Limitations

- The pilot runner starts a Local Brain automatically if one is not already running on
  `127.0.0.1:31313`. For multi-device mode, start the servers manually first.
- The `distributed` policy requires at least one registered, healthy relay node. Without
  relay nodes, it behaves like `local-first`.
- Timing metrics are wall-clock only — they do not separate model inference time from
  network latency or tool execution time.
- The pilot runner does not validate hardware profiles — that is the operator's
  responsibility before starting the pilot.
- No automatic retry on transient network failures between devices.

## Stop Conditions

Halt the pilot and do not proceed if:

- A device crashes or becomes unresponsive during execution
- Relay node registration fails repeatedly (authentication or network issue)
- Evidence files are not being written (disk space or permission issue)
- The Local Brain returns consistent errors (check `/health` and server logs)
- Any safety concern with the hardware or network environment
