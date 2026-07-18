const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../../../core/result-validator");
const schema = require("../../../schemas/development-memory-capture-policy.schema.json");
const validFixture = require("../../../schemas/fixtures/development-memory/capture-policy.valid.json");

const EVENT_TYPE_POLICY_MAP = {
  objective_started: "objectiveTransitions",
  objective_completed: "objectiveTransitions",
  objective_blocked: "objectiveTransitions",
  task_dispatched: "taskResults",
  task_accepted: "taskResults",
  task_rejected: "taskResults",
  test_completed: "testResults",
  commit_created: "commits",
  blocker_recorded: "blockers",
  decision_recorded: "humanDecisions",
  human_note: "humanDecisions",
  worker_validation_completed: "taskResults"
};

function buildDefaultPolicy(project = "locaily") {
  return {
    ...validFixture,
    project
  };
}

function loadCapturePolicy(options = {}) {
  const warnings = [];
  const project = options.project || process.env.DEVELOPMENT_MEMORY_PROJECT || "locaily";
  const policyPaths = [];

  if (options.policyPath) {
    policyPaths.push(options.policyPath);
  }

  if (options.vaultPath) {
    policyPaths.push(path.join(options.vaultPath, ".memory-bridge", "capture-policy.json"));
  }

  policyPaths.push(path.join(__dirname, "..", "..", "..", "..", "data", "memory", "development-capture", "capture-policy.json"));

  for (const policyPath of policyPaths) {
    if (!policyPath || !fs.existsSync(policyPath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
      const validation = validateResult(parsed, schema, policyPath);

      if (!validation.ok) {
        warnings.push(`Capture policy at ${policyPath} failed schema validation.`);
        continue;
      }

      return {
        ok: true,
        policy: parsed,
        policyPath,
        warnings
      };
    } catch (error) {
      warnings.push(`Capture policy at ${policyPath} could not be read: ${error.message}`);
    }
  }

  return {
    ok: true,
    policy: buildDefaultPolicy(project),
    policyPath: null,
    warnings: [...warnings, "Using built-in default capture policy."]
  };
}

function resolveCaptureEnabled(policy, options = {}) {
  if (process.env.DEVELOPMENT_MEMORY_CAPTURE === "0") {
    return false;
  }

  if (options.captureEnabled === false) {
    return false;
  }

  if (options.captureEnabled === true) {
    return true;
  }

  return Boolean(policy && policy.enabled);
}

function isEventTypeAllowed(eventType, policy) {
  if (!policy || !policy.capture) {
    return true;
  }

  const captureKey = EVENT_TYPE_POLICY_MAP[eventType];

  if (!captureKey) {
    return true;
  }

  return Boolean(policy.capture[captureKey]);
}

module.exports = {
  buildDefaultPolicy,
  loadCapturePolicy,
  resolveCaptureEnabled,
  isEventTypeAllowed,
  EVENT_TYPE_POLICY_MAP
};
