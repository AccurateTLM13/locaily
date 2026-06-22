# NearbyNode

## What It Is

**NearbyNode** is the planned layer for nearby devices and capabilities: phones, tablets, secondary machines, edge boxes, or browser-connected peers that expose connectors without necessarily hosting a model.

## What It Owns (Target)

- Device identity and presence on the local network
- Capability advertisements (what this node can do)
- Secure connector protocol between Local Brain and the node
- Execution of non-model capabilities (files, sensors, UI hooks, APIs)
- Optional delegated model runtime on capable hardware

## What It Does Not Own

- Global orchestration policy (Local Brain)
- Tool pack manifests and workflow definitions
- Public internet exposure by default

## Core Principle

**Device = capability. Device ≠ model.**

Not every node needs a model. Every node needs a **connector** so Local Brain can route work to the right place.

Examples of capabilities that might live on a NearbyNode:

- Read a folder the main PC cannot access
- Run a mobile-only API or sensor
- Offload a small inference job to a GPU on another local machine
- Provide a browser bridge on a second device

## Communicates With

- **Local Brain** — registration, health, task delegation, result return
- **Clients** — indirectly; clients talk to Local Brain, not directly to every node (target design)

## Inputs / Outputs (Planned)

Not standardized in this repo yet. Capability advertisements should be **structured JSON** records (see `companion/schemas/internal/nearby-node-capability.schema.json`). Expect something like:

- Register capability manifest (JSON)
- Accept delegated sub-tasks from orchestrator (JSON in / JSON out)
- Return structured capability results or errors (JSON)

## Status

**Experimental / not implemented.**

No NearbyNode discovery service, protocol, or reference connector exists in the current codebase. This doc captures direction from project vision and research notes only.

## Still Undecided

- Discovery mechanism (mDNS, manual pairing, QR code, etc.)
- Auth model between nodes
- Whether nodes run a thin agent or only respond to Local Brain
- How permissions map across devices
- Offline / split-brain behavior

## Related Research

- `docs/99-archive/raw-conversation-captures/Local AI Pit Crew Documentation.docx`
- `docs/99-archive/raw-conversation-captures/Local AI Engine Evolution.txt`
