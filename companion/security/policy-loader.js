const { readFileSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_POLICY_PATH = path.join(REPO_ROOT, "policies", "default-execution-policy.json");
const ACTION_REQUEST_SCHEMA_PATH = path.join(REPO_ROOT, "policies", "action-request.schema.json");
const POLICY_DECISION_SCHEMA_PATH = path.join(REPO_ROOT, "policies", "policy-decision.schema.json");

const ALLOWED_DECISIONS = Object.freeze(new Set([
  "allow",
  "deny",
  "require_approval",
  "constrain"
]));

const ALWAYS_DENIED_ACTIONS = Object.freeze(new Set([
  "shell.execute.arbitrary",
  "credentials.read",
  "credentials.write",
  "credentials.pass.external",
  "audit.disable",
  "audit.delete",
  "policy.modify.runtime",
  "filesystem.delete.protected",
  "nearbyNode.invoke.unregistered",
  "software.install.system",
  "software.download_execute",
  "publish.social",
  "memory.delete"
]));

/**
 * Load and validate a fail-closed execution policy definition.
 */
function loadExecutionPolicy(policyPath = DEFAULT_POLICY_PATH) {
  const resolvedPath = path.resolve(policyPath);
  let raw;

  try {
    raw = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const err = new Error(`Failed to read execution policy '${resolvedPath}': ${error.message}`);
    err.code = "EXECUTION_POLICY_INVALID";
    throw err;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const err = new Error("Execution policy must be a JSON object.");
    err.code = "EXECUTION_POLICY_INVALID";
    throw err;
  }

  if (typeof raw.version !== "string" || !raw.version.trim()) {
    const err = new Error("Execution policy requires a non-empty version string.");
    err.code = "EXECUTION_POLICY_INVALID";
    throw err;
  }

  if (raw.defaultDecision !== "deny") {
    const err = new Error(
      `Execution policy must fail closed with defaultDecision === "deny" (received ${JSON.stringify(raw.defaultDecision)}).`
    );
    err.code = "EXECUTION_POLICY_INVALID";
    throw err;
  }

  if (!raw.actions || typeof raw.actions !== "object" || Array.isArray(raw.actions)) {
    const err = new Error("Execution policy requires an 'actions' map object.");
    err.code = "EXECUTION_POLICY_INVALID";
    throw err;
  }

  const actionsMap = new Map();
  const invariantWarnings = [];

  for (const actionKey of Object.keys(raw.actions)) {
    if (!Object.prototype.hasOwnProperty.call(raw.actions, actionKey)) {
      continue;
    }

    const trimmedKey = typeof actionKey === "string" ? actionKey.trim() : "";
    const rawDecision = raw.actions[actionKey];

    if (!trimmedKey || typeof rawDecision !== "string" || !ALLOWED_DECISIONS.has(rawDecision)) {
      const err = new Error(
        `Execution policy action '${String(actionKey)}' has invalid decision ${JSON.stringify(rawDecision)}.`
      );
      err.code = "EXECUTION_POLICY_INVALID";
      throw err;
    }

    if (ALWAYS_DENIED_ACTIONS.has(trimmedKey) && rawDecision !== "deny") {
      invariantWarnings.push(
        `Action '${trimmedKey}' was configured as '${rawDecision}' in policy file and forced to immutable 'deny'.`
      );
      actionsMap.set(trimmedKey, "deny");
    } else {
      actionsMap.set(trimmedKey, rawDecision);
    }
  }

  for (const lockedAction of ALWAYS_DENIED_ACTIONS) {
    if (!actionsMap.has(lockedAction)) {
      actionsMap.set(lockedAction, "deny");
    }
  }

  const actionsSnapshot = Object.freeze(Object.fromEntries(actionsMap.entries()));

  return Object.freeze({
    version: raw.version.trim(),
    status: typeof raw.status === "string" && raw.status.trim() ? raw.status.trim() : "enforced",
    defaultDecision: "deny",
    sourcePath: resolvedPath,
    actionsMap,
    actionsSnapshot,
    invariantWarnings: Object.freeze(invariantWarnings)
  });
}

module.exports = {
  DEFAULT_POLICY_PATH,
  ACTION_REQUEST_SCHEMA_PATH,
  POLICY_DECISION_SCHEMA_PATH,
  ALLOWED_DECISIONS,
  ALWAYS_DENIED_ACTIONS,
  loadExecutionPolicy
};
