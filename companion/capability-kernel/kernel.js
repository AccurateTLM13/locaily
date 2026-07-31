const { createRunId } = require("../core/ids");
const { validateContract, assertContract } = require("./contracts");
const {
  hashCanonical,
  normalizeEventSnapshot,
  sanitizeForRecord
} = require("./canonical");
const { ELIGIBLE_STATUSES, manifestMatchesEvent } = require("./capability-registry");
const { buildExecutionPlan } = require("./planner");

const TERMINAL_STATES = new Set([
  "completed",
  "ignored",
  "rejected",
  "approval_required",
  "failed"
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  received: new Set(["normalized", "rejected"]),
  normalized: new Set(["matched", "ignored", "rejected"]),
  matched: new Set(["planned", "approval_required", "rejected"]),
  planned: new Set(["running", "rejected"]),
  running: new Set(["validating", "failed"]),
  validating: new Set(["completed", "failed"])
});

function createCapabilityKernel(options = {}) {
  const registry = options.registry;
  const handlerRegistry = options.handlerRegistry;
  const store = options.store;
  const nodeConfig = JSON.parse(JSON.stringify(options.nodeConfig || {}));
  const clock = options.clock || (() => new Date());

  assertContract(nodeConfig, "node-config.v1", "NODE_CONFIG_INVALID", "nearby-node");

  if (!registry || typeof registry.match !== "function") {
    throw kernelError("CAPABILITY_REGISTRY_REQUIRED", "Capability registry is required.");
  }

  if (!handlerRegistry || typeof handlerRegistry.execute !== "function") {
    throw kernelError("HANDLER_REGISTRY_REQUIRED", "Handler registry is required.");
  }

  if (!store || typeof store.appendRunRecord !== "function") {
    throw kernelError("PROVENANCE_STORE_REQUIRED", "Provenance store is required.");
  }

  async function submitEvent(rawEvent, submitOptions = {}) {
    const runId = submitOptions.runId || createRunId();
    const eventHash = hashCanonical(rawEvent);
    const record = createBaseRecord({
      runId,
      rawEvent,
      eventHash,
      nodeConfig,
      at: nowIso(clock)
    });
    let currentState = null;

    function transition(nextState, reason) {
      if (currentState !== null) {
        const allowed = ALLOWED_TRANSITIONS[currentState];

        if (!allowed || !allowed.has(nextState)) {
          throw kernelError(
            "ILLEGAL_RUN_TRANSITION",
            `Run cannot transition from '${currentState}' to '${nextState}'.`
          );
        }
      } else if (nextState !== "received") {
        throw kernelError("ILLEGAL_RUN_TRANSITION", "A run must begin in received state.");
      }

      record.transitions.push({
        from: currentState,
        to: nextState,
        at: nowIso(clock),
        ...(reason ? { reason } : {})
      });
      currentState = nextState;
    }

    async function finish(terminalState, code, message, output = null) {
      if (!TERMINAL_STATES.has(terminalState)) {
        throw kernelError("INVALID_TERMINAL_STATE", `Unknown terminal state '${terminalState}'.`);
      }

      if (currentState !== terminalState) {
        transition(terminalState, code || undefined);
      }

      record.terminal_state = terminalState;
      record.outputs = output === null ? null : sanitizeForRecord(output);
      record.error = code
        ? {
            code,
            message
          }
        : null;

      if (terminalState === "completed") {
        record.output_ref = await store.writeOutput(runId, record.outputs);
      }

      const persisted = await store.appendRunRecord(record);

      return {
        ok: terminalState === "completed",
        run_id: runId,
        state: terminalState,
        code: code || null,
        message: message || null,
        output: terminalState === "completed" ? record.outputs : null,
        record_ref: persisted.runsPath,
        output_ref: record.output_ref,
        record: sanitizeForRecord(record)
      };
    }

    transition("received");

    const eventValidation = validateContract(rawEvent, "event-envelope.v1", "event");
    record.validations.push(validationEvidence("event", "event-envelope.v1", eventValidation, clock));

    if (!eventValidation.ok) {
      return finish(
        "rejected",
        "EVENT_SCHEMA_INVALID",
        eventValidation.errors.join("; ")
      );
    }

    const event = JSON.parse(JSON.stringify(rawEvent));
    transition("normalized");
    record.event_id = event.event_id;
    record.source_auth = authenticateSource(event.source, nodeConfig);

    if (!record.source_auth.trusted) {
      return finish(
        "rejected",
        "UNTRUSTED_SOURCE",
        "The event source is not configured as trusted for this NearbyNode."
      );
    }

    if (await store.hasExecutedEvent(event.event_id)) {
      return finish(
        "ignored",
        "DUPLICATE_EVENT",
        "This event_id already reached execution and will not run again."
      );
    }

    const selection = selectCapability(registry, event, submitOptions);

    if (!selection.ok) {
      return finish(selection.state, selection.code, selection.message);
    }

    const capability = selection.capability;
    const manifest = capability.manifest;
    record.capability_id = manifest.capability_id;
    record.capability_version = manifest.version;
    record.manifest_hash = capability.manifestHash;
    record.manifest_snapshot = sanitizeForRecord(manifest);
    transition("matched");

    if (!ELIGIBLE_STATUSES.has(manifest.status)) {
      return finish(
        "rejected",
        "CAPABILITY_NOT_ELIGIBLE",
        `Capability status '${manifest.status}' is not eligible for runtime execution.`
      );
    }

    const policyDecision = evaluatePolicy(manifest, nodeConfig.policy, submitOptions);

    if (policyDecision.state === "approval_required") {
      return finish(
        "approval_required",
        policyDecision.code,
        policyDecision.message
      );
    }

    if (!policyDecision.ok) {
      return finish(
        "rejected",
        policyDecision.code,
        policyDecision.message
      );
    }

    let plan;

    try {
      plan = buildExecutionPlan({
        runId,
        event,
        eventHash,
        capability,
        nodeConfig,
        handlerRegistry
      });
    } catch (error) {
      return finish(
        "rejected",
        error.code || "PLANNING_FAILED",
        error.message
      );
    }

    record.execution_plan = sanitizeForRecord(plan);
    record.plan_hash = plan.plan_hash;
    record.validations.push(validationEvidence(
      "plan",
      "execution-plan.v1",
      validateContract(plan, "execution-plan.v1", "plan"),
      clock
    ));
    transition("planned");
    transition("running");

    const stepOutputs = {};

    for (const step of plan.steps) {
      const input = buildStepInput(step, event, stepOutputs);
      const inputValidation = validateContract(input, step.input_schema, `input:${step.track_id}`);
      record.validations.push(validationEvidence(
        `input:${step.track_id}`,
        step.input_schema,
        inputValidation,
        clock
      ));

      if (!inputValidation.ok) {
        return finish(
          "failed",
          "STEP_INPUT_INVALID",
          inputValidation.errors.join("; "),
          stepOutputs
        );
      }

      const execution = await executeStepWithRetry({
        step,
        input,
        event,
        stepOutputs,
        handlerRegistry,
        runId,
        clock
      });
      record.attempts.push(...execution.attempts);

      if (!execution.ok) {
        return finish(
          "failed",
          execution.error.code,
          execution.error.message,
          stepOutputs
        );
      }

      stepOutputs[step.track_id] = execution.output;
      const outputValidation = validateContract(
        execution.output,
        step.output_schema,
        `output:${step.track_id}`
      );
      record.validations.push(validationEvidence(
        `output:${step.track_id}`,
        step.output_schema,
        outputValidation,
        clock
      ));

      if (!outputValidation.ok) {
        return finish(
          "failed",
          "OUTPUT_VALIDATION_FAILED",
          outputValidation.errors.join("; "),
          stepOutputs
        );
      }
    }

    transition("validating");
    const finalStep = plan.steps[plan.steps.length - 1];
    const finalOutput = stepOutputs[finalStep.track_id];
    const finalValidation = validateContract(
      finalOutput,
      manifest.final_output_schema,
      "final-output"
    );
    record.validations.push(validationEvidence(
      "final-output",
      manifest.final_output_schema,
      finalValidation,
      clock
    ));

    if (!finalValidation.ok) {
      return finish(
        "failed",
        "FINAL_OUTPUT_VALIDATION_FAILED",
        finalValidation.errors.join("; "),
        stepOutputs
      );
    }

    return finish("completed", null, null, finalOutput);
  }

  return {
    nodeConfig: JSON.parse(JSON.stringify(nodeConfig)),
    submitEvent
  };
}

function createBaseRecord({ runId, rawEvent, eventHash, nodeConfig, at }) {
  return {
    schema_version: "1.0",
    run_id: runId,
    node_id: nodeConfig.node_id,
    received_at: at,
    event_id: rawEvent && typeof rawEvent.event_id === "string"
      ? rawEvent.event_id
      : null,
    event_hash: eventHash,
    event_snapshot: normalizeEventSnapshot(rawEvent),
    source_auth: {
      trusted: false,
      node_id: null,
      adapter_id: null
    },
    policy_snapshot: sanitizeForRecord({
      mode: nodeConfig.mode,
      trusted_sources: nodeConfig.trusted_sources,
      policy: nodeConfig.policy
    }),
    capability_id: null,
    capability_version: null,
    manifest_hash: null,
    manifest_snapshot: null,
    plan_hash: null,
    execution_plan: null,
    transitions: [],
    attempts: [],
    validations: [],
    outputs: null,
    output_ref: null,
    terminal_state: "rejected",
    error: null
  };
}

function selectCapability(registry, event, options) {
  if (options.capabilityVersion && !options.capabilityId) {
    return {
      ok: false,
      state: "rejected",
      code: "CAPABILITY_SELECTION_INVALID",
      message: "capabilityVersion requires capabilityId."
    };
  }

  if (options.capabilityId) {
    const versions = registry.listById(options.capabilityId);

    if (versions.length === 0) {
      return {
        ok: false,
        state: "rejected",
        code: "UNKNOWN_CAPABILITY",
        message: `Capability '${options.capabilityId}' is not installed.`
      };
    }

    let capability;

    if (options.capabilityVersion) {
      capability = registry.get(options.capabilityId, options.capabilityVersion);

      if (!capability) {
        return {
          ok: false,
          state: "rejected",
          code: "CAPABILITY_VERSION_INCOMPATIBLE",
          message: `Capability '${options.capabilityId}' version '${options.capabilityVersion}' is not installed.`
        };
      }
    } else {
      capability = versions[versions.length - 1];
    }

    if (!manifestMatchesEvent(capability.manifest, event)) {
      return {
        ok: false,
        state: "ignored",
        code: "NO_MATCH",
        message: "The requested capability does not match this event."
      };
    }

    return {
      ok: true,
      capability
    };
  }

  const matches = registry.match(event);

  if (matches.length === 0) {
    return {
      ok: false,
      state: "ignored",
      code: "NO_MATCH",
      message: "No installed capability matches this event."
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      state: "rejected",
      code: "AMBIGUOUS_CAPABILITY_MATCH",
      message: "More than one installed capability matches this event."
    };
  }

  return {
    ok: true,
    capability: matches[0]
  };
}

function evaluatePolicy(manifest, policy, options) {
  if (manifest.permissions.network && policy.network !== true) {
    return policyBlocked("Network permission is prohibited by the local-only node policy.");
  }

  if (policy.cloud_fallback !== false) {
    return policyBlocked("CTK-01 requires cloud fallback to be explicitly disabled.");
  }

  const allowedWrites = new Set(policy.allowed_filesystem_write || []);
  const blockedWrites = manifest.permissions.filesystem_write
    .filter((requestedPath) => !allowedWrites.has(requestedPath));

  if (blockedWrites.length > 0) {
    return policyBlocked(`Filesystem write permission is not allowed: ${blockedWrites.join(", ")}.`);
  }

  if (manifest.permissions.irreversible && policy.allow_irreversible !== true) {
    return policyBlocked("Irreversible execution is prohibited by node policy.");
  }

  const approvalNeeded = manifest.approval_policy === "before_run"
    || (
      manifest.approval_policy === "before_irreversible"
      && manifest.permissions.irreversible
    );

  if (approvalNeeded && options.approvalGranted !== true) {
    return {
      ok: false,
      state: "approval_required",
      code: "APPROVAL_REQUIRED",
      message: "Capability policy requires explicit approval before execution."
    };
  }

  return {
    ok: true,
    state: "allowed"
  };
}

function policyBlocked(message) {
  return {
    ok: false,
    state: "rejected",
    code: "POLICY_BLOCKED",
    message
  };
}

function authenticateSource(source, nodeConfig) {
  const trusted = nodeConfig.trusted_sources.some((configured) =>
    configured.node_id === source.node_id
    && configured.adapter_id === source.adapter_id
  );

  return {
    trusted,
    node_id: source.node_id,
    adapter_id: source.adapter_id
  };
}

function buildStepInput(step, event, stepOutputs) {
  if (step.input_schema === "event-envelope.v1") {
    return event;
  }

  return {
    event,
    dependencies: Object.fromEntries(
      step.depends_on.map((trackId) => [trackId, stepOutputs[trackId]])
    )
  };
}

async function executeStepWithRetry({
  step,
  input,
  event,
  stepOutputs,
  handlerRegistry,
  runId,
  clock
}) {
  const attempts = [];
  const retryableCodes = new Set(step.retry.retryable_codes);

  for (let attempt = 1; attempt <= step.retry.max_attempts; attempt += 1) {
    const startedAt = clock();
    const startedMs = startedAt.getTime();

    try {
      const output = await withTimeout(
        handlerRegistry.execute(step.handler_type, step.handler_id, {
          input,
          event,
          previous_outputs: JSON.parse(JSON.stringify(stepOutputs)),
          step,
          meta: {
            run_id: runId,
            node_execution: "local_only",
            cloud_fallback: false
          }
        }),
        step.timeout_ms
      );
      const completedAt = clock();
      attempts.push({
        track_id: step.track_id,
        handler_type: step.handler_type,
        handler_id: step.handler_id,
        attempt,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: Math.max(0, completedAt.getTime() - startedMs),
        status: "completed",
        output_hash: hashCanonical(output),
        error: null
      });

      return {
        ok: true,
        output,
        attempts
      };
    } catch (error) {
      const completedAt = clock();
      const code = error.code || "HANDLER_EXECUTION_FAILED";
      attempts.push({
        track_id: step.track_id,
        handler_type: step.handler_type,
        handler_id: step.handler_id,
        attempt,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: Math.max(0, completedAt.getTime() - startedMs),
        status: code === "HANDLER_TIMEOUT" ? "timeout" : "failed",
        output_hash: null,
        error: {
          code,
          message: error.message
        }
      });

      if (attempt >= step.retry.max_attempts || !retryableCodes.has(code)) {
        return {
          ok: false,
          attempts,
          error: {
            code,
            message: error.message
          }
        };
      }
    }
  }

  return {
    ok: false,
    attempts,
    error: {
      code: "HANDLER_EXECUTION_FAILED",
      message: "Handler exhausted its declared attempts."
    }
  };
}

function withTimeout(promise, timeoutMs) {
  let timer;

  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Handler timed out after ${timeoutMs}ms.`);
        error.code = "HANDLER_TIMEOUT";
        reject(error);
      }, timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function validationEvidence(scope, schemaId, validation, clock) {
  return {
    scope,
    schema_id: schemaId,
    ok: validation.ok,
    errors: validation.errors || [],
    at: nowIso(clock)
  };
}

function nowIso(clock) {
  return clock().toISOString();
}

function kernelError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  ALLOWED_TRANSITIONS,
  TERMINAL_STATES,
  createCapabilityKernel,
  authenticateSource,
  evaluatePolicy,
  executeStepWithRetry,
  selectCapability
};
