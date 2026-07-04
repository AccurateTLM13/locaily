# Model Swap Manager

**Status: Proposed Architecture — not yet implemented.**
**Target milestone: Lighthouse Handoff**

---

## Plain-English Overview

The Model Swap Manager is a proposed layer that sits inside the Local Brain and answers one question on every task request:

> *Which model should handle this, and is it already loaded?*

Without some form of swap management, a machine with limited RAM ends up in one of two bad states: it either keeps every model it has ever used loaded at once (runs out of memory fast), or it loads a fresh model on every request and makes the user wait every time.

The Model Swap Manager proposes a middle path. A small set of models stays warm all the time. Others load only when a task actually needs them. When memory gets tight, the manager decides what to unload first. When no local model is suitable or the machine is too busy, the manager can direct the task to a NearbyNode instead of failing.

This document describes the rules that govern those decisions. None of this is implemented yet. It is written as a design target so that the first implementation has something specific to test against.

---

## Why Model Swapping Exists

Local machines are not servers. A machine running LocAIly might have 8 GB of RAM, a mid-tier GPU, and several other applications open. Keeping every possible model loaded is not realistic.

At the same time, first-load latency for a large local model can be 10–30 seconds or longer. Users will not wait that long for every task.

Model swapping is the answer: keep the most-used models ready, load others only when needed, and release memory when it is no longer required. The goal is to make the common case fast without exhausting the machine.

---

## Relationship to Other Components

**Local Brain (`companion/server.js`)** is the coordinator. The Model Swap Manager is a proposed subcomponent that the Local Brain consults before routing any model-backed task. The Local Brain does not skip the manager and does not call a model runtime directly.

**Track Registry** (proposed) defines what each task track requires — which task types exist, what inputs they expect, and what model capabilities or tool packs they depend on. It answers: *what does this track need?* The Model Swap Manager reads track requirements from here when a run plan is being assembled.

**Model Registry** (proposed, distinct from the tool registry) is a catalog of models available on this machine — what they are named, where they live, what task types they can handle, which other models they are explicitly compatible with for substitution, and roughly how much memory they need. It answers: *what models exist and what can they do?* The Model Swap Manager reads from this registry to know what is available and what has been loaded.

**Capability Registry** (proposed) is a catalog of what the local machine or connected NearbyNodes can actually provide at runtime — which models are installed, what hardware is present, and what capacity is available. It answers: *what can this node actually run right now?* The Model Swap Manager checks the Capability Registry when evaluating whether a required model can be served locally or should be routed elsewhere. This is distinct from the Model Registry (which lists what exists) and from the Track Registry (which lists what is needed).

These three registries are separate concepts. The Track Registry is about task requirements. The Model Registry is about model identity and compatibility. The Capability Registry is about runtime availability. They are consulted in that order when building a run plan.

**NearbyNode** (planned) is a nearby device or capability layer. If the local machine cannot run a required model — because memory is too low, the model is not installed, or the machine is already under load — the Model Swap Manager can signal the Local Brain to route the task to a NearbyNode instead. The manager does not contact NearbyNode directly; it returns a routing signal and lets the Local Brain handle the handoff.

---

## Keep-Warm Models

Keep-warm models are loaded on startup and kept in memory continuously. They are never unloaded by pressure rules unless a human operator changes the configuration.

**Criteria for a keep-warm model:**

- It handles the most common task types (general text tasks, schema validation, injection detection).
- Load time is long enough that cold-starting it would noticeably delay common requests.
- It fits in memory without crowding out system processes.

**First implementation target:** one keep-warm slot, assigned to the configured default model (currently `llama3.2` via Ollama). The number of keep-warm slots is a config value, not hardcoded.

**Config field (proposed):**
```json
"modelSwap": {
  "keepWarm": ["llama3.2"],
  "pinned": [],
  "maxWarmSlots": 1
}
```

**`keepWarm` vs. `pinned` (proposed — neither is implemented):**

- `keepWarm` means: try to keep this model loaded. It will be loaded on startup and will not be idle-evicted. However, under severe memory pressure, a keep-warm model could eventually be released if the operator changes config.
- `pinned` means: do not unload this model unless the operator explicitly stops it. Pressure rules do not apply. The model stays loaded until the Local Brain is stopped or the operator removes the pin. A pinned model that cannot be loaded on startup should log a `pin_failed` error and surface it in the UI — it does not silently fall back to keep-warm behavior.

`pinned` is proposed only. It is out of scope for the first implementation. Do not implement pin behavior until keep-warm behavior is stable and tested.

---

## Model Substitution Rules

Sometimes the preferred model for a task is not available — it is not installed, it failed to load, or memory cannot accommodate it. In those cases, the Model Swap Manager may substitute a different model, but only under strict conditions.

**Rules:**

- A preferred model may be replaced only by a model that is explicitly listed as a compatible substitute in the Model Registry. There is no implicit compatibility. If a substitute is not declared, the manager does not guess.
- Every substitution must be logged as a `substitution` event (see Logging Fields). The log must record the preferred model, the selected substitute, and the reason for substitution.
- The validation output for any task that used a substituted model must include three fields: `preferred_model`, `selected_model`, and `substitution_reason`. This applies to task results, run plan records, and audit entries.
- Silent substitution is not permitted. If no explicit substitute is available and the preferred model cannot be loaded, the manager returns a `no_capable_model` signal rather than picking an arbitrary warm model.

**Proposed substitution declaration in Model Registry entry:**
```json
{
  "model": "llama3.2",
  "compatibleSubstitutes": ["llama3.1", "mistral-7b"],
  "footprintMb": 4200
}
```

The order of `compatibleSubstitutes` is the preference order. The first listed model that is available and loadable is selected.

---

## Load-on-Demand Models

Load-on-demand models are not loaded at startup. They are loaded when a task arrives that requires them, and they stay loaded for a configurable idle window after their last use.

**Trigger:** A task arrives whose required capability is not satisfied by any currently-warm model.

**Load sequence (proposed):**

1. Model Swap Manager checks the Model Registry for a model that satisfies the capability.
2. Manager checks available memory against the model's estimated footprint.
3. If memory is sufficient, manager requests a load from the runtime (Ollama).
4. Manager marks the model as `loading` in its internal state.
5. Once loaded, manager marks it `warm` and logs the load event.
6. Task is dispatched.

**Idle eviction window (proposed default: 5 minutes).** After a model's last task completes, a timer starts. If no new task uses the model within the window, the model is unloaded. The window duration is a config value.

```json
"modelSwap": {
  "idleEvictMinutes": 5
}
```

---

## Unload Rules

Unloading is triggered by one of two conditions: idle timeout or memory pressure (see next section).

**Idle timeout unload:**

- Timer fires for a load-on-demand model that has not been used within `idleEvictMinutes`.
- Manager requests an unload from the runtime.
- Model state moves from `warm` to `unloaded`.
- Log event emitted (see Logging Fields).

**Keep-warm models are never idle-evicted.** Their timer is not started.

**In-flight protection:** A model with an active task is never unloaded, even if the timer fires. The unload is deferred until the task completes.

---

## Workflow-Level Stability

Model selection should be stable for the duration of a workflow run. Swapping models mid-step introduces inconsistency in outputs and makes failures harder to diagnose.

**Rules:**

- Once a run plan has assigned a model to a workflow step, the Model Swap Manager must not swap that model out while the step is executing. This extends the in-flight protection rule to the full step boundary, not just the individual inference call.
- For validation runs and benchmark runs, all model selections must remain stable for the entire run unless a model fails and fallback is required. Memory pressure does not override this — if pressure occurs during a validation run, the manager logs a `pressure_deferred` event and does not evict the in-use model until the run completes.
- If a fallback is required mid-run (model failure, not pressure), the substitution rules apply: only an explicit compatible substitute may be used, and the substitution is logged and recorded in the run output.
- A run that required any substitution should be marked `completed_with_substitution` rather than `completed` in its result envelope. This makes benchmark comparisons reliable.

Memory pressure is detected by comparing an estimate of current model footprint against a configurable threshold. This is intentionally simple for the first implementation.

**Pressure threshold (proposed):** a percentage of estimated available RAM, configurable:
```json
"modelSwap": {
  "memoryPressureThresholdPct": 80
}
```

**Pressure response (in order):**

1. Identify all warm load-on-demand models that are not currently running a task.
2. Sort by last-used time, oldest first.
3. Unload models from the oldest until estimated footprint drops below the threshold.
4. If no load-on-demand models can be unloaded and pressure remains, log a `pressure_unresolved` event.
5. Do not unload keep-warm models under pressure. Surface the pressure state to the UI instead.

**Memory estimation:** In the first implementation, memory footprint per model is a manually configured value in the Model Registry entry (in MB). Actual runtime measurement is an open question (see Open Questions).

---

## Fallback Behavior

When a task cannot be served locally, the Model Swap Manager returns a routing signal rather than an error. The Local Brain decides what to do with it.

**Fallback triggers:**

- Required model is not in the Model Registry (model not installed).
- Memory pressure cannot be resolved by unloading any available model.
- Model load fails (runtime error from Ollama or other provider).
- Local machine is marked as overloaded (proposed: load-average-based check).

**Routing signals (proposed enum):**

| Signal | Meaning |
|---|---|
| `local_ready` | A warm model is available; proceed. |
| `local_loading` | A model is loading; task will be queued. |
| `local_substitute_ready` | A compatible substitute model is available locally; proceed, but mark the run as using substitution. |
| `nearbynode_preferred` | Local machine cannot serve this; try NearbyNode. |
| `no_capable_model` | No model (local or nearby) is known to handle this task type. |
| `failed` | Load was attempted and failed. |

The Local Brain receives the signal and acts: dispatch locally, hand off to NearbyNode, or return a structured error to the caller.

When `local_substitute_ready` is returned, the Local Brain must record `preferred_model`, `selected_model`, and `substitution_reason` in the finalized run plan before execution begins. The workflow result should be marked `completed_with_substitution` if the run completes successfully using the substitute model.

**Deterministic fallback:** Tasks that have a deterministic fallback path (like `text.validate_schema` and the Lighthouse Handoff deterministic branch) bypass the Model Swap Manager entirely. The manager is only consulted for model-backed tasks.

---

## UI Status States

The Model Swap Manager should expose state that the UI can read and display. These are the proposed states per model slot:

| State | Display label | Description |
|---|---|---|
| `warm` | Ready | Model is loaded and ready to handle tasks. |
| `loading` | Loading… | Model is being loaded; tasks will wait. |
| `unloaded` | Not loaded | Model is available to load but is not in memory. |
| `evicting` | Releasing… | Model is being unloaded. |
| `unavailable` | Not installed | Model is not present on this machine. |
| `pressure` | Memory low | Keep-warm model could not be maintained due to pressure. |

The overall machine state should also be surfaced:

| State | Display label |
|---|---|
| `nominal` | Models OK |
| `degraded` | Memory pressure |
| `overloaded` | Routing to nearby node |

These states are read via a proposed `GET /models/swap-status` endpoint. The endpoint does not exist yet.

---

## Logging Fields

Every swap event should emit a structured log entry compatible with the existing audit log in `companion/core/audit-log.js`.

**Proposed fields for swap events:**

```json
{
  "event": "model_swap",
  "action": "load" | "unload" | "evict_idle" | "evict_pressure" | "load_failed" | "pressure_unresolved" | "pressure_deferred" | "substitution",
  "model": "<model-name>",
  "trigger": "task_request" | "idle_timeout" | "memory_pressure" | "startup" | "config_change" | "model_failure",
  "task_id": "<uuid or null>",
  "warm_model_count": 2,
  "estimated_footprint_mb": 4200,
  "timestamp": "<ISO 8601>"
}
```

For `substitution` actions, two additional fields are required:

```json
{
  "event": "model_swap",
  "action": "substitution",
  "preferred_model": "<preferred-model-name>",
  "model": "<selected-substitute-name>",
  "substitution_reason": "preferred_model_unavailable" | "load_failed" | "memory_insufficient",
  "task_id": "<uuid or null>",
  "timestamp": "<ISO 8601>"
}
```

Swap events do not log task input or output. They log only model lifecycle transitions. This matches the audit log's existing pattern of summary-only, no raw data.

---

## Run-Plan Integration

The Model Swap Manager does not act on individual task requests in isolation. For multi-step workflows, it participates in run-plan assembly before any step executes.

**Proposed flow (documentation only):**

1. The Local Brain receives a workflow request and begins assembling a run plan. The run plan lists each step, its track, and its required capabilities.
2. For each model-backed step, the Local Brain asks the Model Swap Manager to evaluate availability: is a suitable model warm, loadable, or unavailable?
3. The Model Swap Manager checks the Track Registry for what the step needs, then checks the Model Registry for a matching model, then checks the Capability Registry for whether the local machine or a NearbyNode can run it.
4. The manager returns a proposed model assignment for each step. If a preferred model is unavailable, it applies substitution rules and returns the substitute (or `no_capable_model` if no substitute exists).
5. The Local Brain finalizes the run plan with the model assignment for each step recorded explicitly. No step in a finalized run plan has an unresolved model.
6. The finalized run plan is the authority for model selection during execution. The Model Swap Manager does not re-evaluate model assignments during a run except in the case of model failure (see Workflow-Level Stability).

**Proposed run plan record shape (per step):**
```json
{
  "step": "analyze",
  "track": "text.summarize",
  "preferredModel": "llama3.2",
  "selectedModel": "llama3.2",
  "substitutionReason": null,
  "modelSource": "local"
}
```

If substitution occurred:
```json
{
  "step": "analyze",
  "track": "text.summarize",
  "preferredModel": "llama3.2",
  "selectedModel": "llama3.1",
  "substitutionReason": "preferred_model_unavailable",
  "modelSource": "local"
}
```

The run plan record is included in the audit log entry for the workflow. It is not hidden in an internal field.

---

## First Implementation Scope for Lighthouse Handoff

The first implementation should be small enough to test in one sprint. Proposed scope:

**In scope:**

- Single keep-warm slot (default model only).
- Manual memory footprint estimates in config.
- Idle eviction timer for load-on-demand models.
- Basic memory pressure check (estimated footprint vs. threshold).
- `nearbynode_preferred` signal emitted but not acted on (NearbyNode routing is a future step).
- `GET /models/swap-status` endpoint returning current state.
- Structured log events for all swap actions, including substitution events.
- Model substitution using explicit `compatibleSubstitutes` declarations; no implicit fallback.
- Workflow-level stability: no model swap mid-step; pressure deferred during validation/benchmark runs.
- Run-plan integration: model assignment resolved before execution, recorded per step in run plan and audit log.
- Unit tests covering: load-on-demand trigger, idle eviction, pressure eviction order, in-flight protection, keep-warm exclusion from eviction, substitution logging, no-silent-substitution enforcement, run plan model assignment, mid-step swap prevention.

**Out of scope for first implementation:**

- Actual NearbyNode routing (signal is emitted, routing is not wired).
- Dynamic memory measurement from runtime.
- Multiple keep-warm slots.
- `pinned` behavior (proposed only; do not implement until keep-warm is stable).
- Per-model load priority scores.
- UI integration beyond raw endpoint output.
- Cross-node load balancing.

---

## Open Questions

These are unresolved design decisions. They should be answered before or during implementation, not after.

**1. How do we measure actual model memory footprint?**
Ollama exposes a `/api/ps` endpoint that returns running models. Does it include memory usage? If so, use that instead of manual estimates. If not, how do we get a real number without adding a heavy dependency?

**2. What is the right idle eviction window?**
Five minutes is a guess. Too short and models churn on bursty workloads. Too long and memory sits occupied. Should this be per-model or global? Should it adapt based on recent usage patterns?

**3. How does the manager know a machine is "overloaded" beyond memory?**
CPU and GPU saturation matter too. Is there a simple cross-platform way to check load average or GPU utilization that does not add a new dependency? Or do we accept that v1 only checks estimated RAM?

**4. How does NearbyNode advertise its available models?**
For the `nearbynode_preferred` signal to be useful, the Local Brain needs to know whether the NearbyNode can actually handle the task. Does NearbyNode expose a capability endpoint? Who maintains that catalog?

**5. What happens when two tasks arrive simultaneously and both need a load-on-demand model that is not yet loaded?**
Does the second task wait in a queue behind the first load? Does it fail fast? Does it try a different model? The in-flight protection rule needs to extend to the loading state.

**6. Should keep-warm models be configurable per-user or only at the machine level?**
If LocAIly runs as a shared local service (multi-user scenario), different users may want different warm models. Is that a v1 concern?

---

*This document is proposed architecture. It describes intended behavior, not current behavior. Nothing in this document should be interpreted as implemented unless the implementation section of this file or a linked validation record says otherwise.*
