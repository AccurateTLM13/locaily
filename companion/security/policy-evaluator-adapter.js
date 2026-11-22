const path = require("node:path");
const { validateResult } = require("../core/result-validator");
const {
  ACTION_REQUEST_SCHEMA_PATH,
  POLICY_DECISION_SCHEMA_PATH,
  ALWAYS_DENIED_ACTIONS
} = require("./policy-loader");

const actionRequestSchema = require(ACTION_REQUEST_SCHEMA_PATH);
const policyDecisionSchema = require(POLICY_DECISION_SCHEMA_PATH);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const CREDENTIAL_SEGMENT_PATTERN = /(^|\/)(\.env(\..+)?|id_rsa(\.pub)?|id_ed25519(\.pub)?|credentials(\.[^/]+)?|secrets(\.[^/]+)?|\.npmrc|\.pypirc|\.netrc)(\/|$)/i;
const CREDENTIAL_DIR_PATTERN = /(^|\/)(\.ssh|\.aws|\.gnupg)(\/|$)/i;
const CREDENTIAL_EXT_PATTERN = /\.(pem|key|p12|pfx)$/i;

const PROTECTED_WRITE_PATHS = [
  "policies/",
  "companion/security/",
  "data/audit.jsonl",
  "data/security/"
];

const CONFIG_PATHS = new Set([
  "companion/config.json",
  "data/permissions.json"
]);

/**
 * Validate an action request against policies/action-request.schema.json.
 */
function validateActionRequest(actionRequest) {
  const validation = validateResult(actionRequest, actionRequestSchema, "actionRequest");
  const errors = [...validation.errors];

  if (actionRequest && typeof actionRequest === "object" && !Array.isArray(actionRequest)) {
    for (const field of ["action", "target", "requestedBy", "reason"]) {
      const value = field === "action"
        ? actionRequest.action
        : field === "target"
          ? actionRequest.target
          : field === "requestedBy"
            ? actionRequest.requestedBy
            : actionRequest.reason;
      if (typeof value === "string" && !value.trim()) {
        errors.push(`actionRequest.${field} must be non-empty.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

/**
 * Validate a policy decision against policies/policy-decision.schema.json.
 */
function validatePolicyDecision(policyDecision) {
  const validation = validateResult(policyDecision, policyDecisionSchema, "policyDecision");
  const errors = [...validation.errors];

  if (policyDecision && typeof policyDecision === "object" && !Array.isArray(policyDecision)) {
    if (typeof policyDecision.reason === "string" && !policyDecision.reason.trim()) {
      errors.push("policyDecision.reason must be non-empty.");
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function normalizePosix(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function normalizePathComparison(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function analyzeTargetPath(target, workspaceRoot) {
  const rawPosix = normalizePosix(target);
  if (!workspaceRoot) {
    return {
      rawPosix,
      relPosix: rawPosix.replace(/^\.\//, ""),
      outsideWorkspace: false
    };
  }

  const normalizedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(normalizedRoot, String(target || ""));
  const rootCmp = normalizePathComparison(normalizedRoot);
  const targetCmp = normalizePathComparison(resolvedTarget);
  const rootPrefix = rootCmp.endsWith(path.sep) ? rootCmp : rootCmp + path.sep;
  const outsideWorkspace = targetCmp !== rootCmp && !targetCmp.startsWith(rootPrefix);
  const relPosix = normalizePosix(path.relative(normalizedRoot, resolvedTarget));

  return {
    rawPosix,
    relPosix,
    outsideWorkspace
  };
}

function isCredentialTarget(targetInfo) {
  const candidates = [targetInfo.rawPosix, targetInfo.relPosix].filter(Boolean);
  return candidates.some((candidate) => (
    CREDENTIAL_SEGMENT_PATTERN.test(candidate)
    || CREDENTIAL_DIR_PATTERN.test(candidate)
    || CREDENTIAL_EXT_PATTERN.test(candidate)
  ));
}

function isProtectedSecurityTarget(targetInfo) {
  const candidates = [targetInfo.relPosix, targetInfo.rawPosix.replace(/^\.\//, "")].filter(Boolean);
  return candidates.some((candidate) => {
    const lower = candidate.toLowerCase();
    return PROTECTED_WRITE_PATHS.some((prefix) => {
      const bare = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
      return lower === bare || lower.startsWith(prefix);
    });
  });
}

function isConfigTarget(targetInfo) {
  const candidates = [targetInfo.relPosix, targetInfo.rawPosix.replace(/^\.\//, "")].filter(Boolean);
  return candidates.some((candidate) => CONFIG_PATHS.has(candidate.toLowerCase()));
}

function evaluateFilesystemOrMemoryGuards(action, target, policyVersion, workspaceRoot) {
  const isFsOrMemory = action.startsWith("filesystem.") || action.startsWith("memory.writeback.");
  if (!isFsOrMemory) {
    return null;
  }

  const targetInfo = analyzeTargetPath(target, workspaceRoot);

  if (isCredentialTarget(targetInfo)) {
    return {
      decision: "deny",
      reason: `Target '${target}' matches a protected credential path.`,
      policyVersion
    };
  }

  const isMutating = action.startsWith("filesystem.write")
    || action.startsWith("filesystem.delete")
    || action.startsWith("memory.writeback.");

  if (isMutating && isProtectedSecurityTarget(targetInfo)) {
    return {
      decision: "deny",
      reason: `Target '${target}' is a protected policy, security, or audit path.`,
      policyVersion
    };
  }

  if ((action === "filesystem.read.workspace" || action === "filesystem.write.workspace") && isConfigTarget(targetInfo)) {
    return {
      decision: "require_approval",
      reason: `Target '${target}' is a Locaily configuration file requiring human approval.`,
      policyVersion
    };
  }

  if ((action === "filesystem.read.workspace" || action === "filesystem.write.workspace") && targetInfo.outsideWorkspace) {
    return {
      decision: "require_approval",
      reason: `Target '${target}' resolves outside the active workspace root.`,
      policyVersion
    };
  }

  return null;
}

function evaluateBrowserLocalGuard(action, target, policyVersion) {
  if (action !== "browser.open.local") {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(String(target || ""));
  } catch {
    return {
      decision: "deny",
      reason: `Invalid URL target '${target}' for browser.open.local.`,
      policyVersion
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      decision: "deny",
      reason: `Disallowed URL protocol '${parsed.protocol}' for browser.open.local.`,
      policyVersion
    };
  }

  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      decision: "require_approval",
      reason: `Target URL host '${parsed.hostname}' is external and requires human approval.`,
      policyVersion
    };
  }

  return null;
}

/**
 * Create the default zero-dependency native policy evaluator behind Locaily's adapter interface.
 */
function createNativePolicyEvaluator({ policy, workspaceRoot = null }) {
  if (!policy || !policy.actionsMap) {
    throw new Error("createNativePolicyEvaluator requires a loaded policy.");
  }

  return {
    name: "locaily-native-policy-evaluator",
    version: policy.version,
    evaluate(actionRequest) {
      const reqValidation = validateActionRequest(actionRequest);
      if (!reqValidation.ok) {
        return {
          decision: "deny",
          reason: `Invalid action request: ${reqValidation.errors.join(" ")}`,
          policyVersion: policy.version
        };
      }

      const action = actionRequest.action.trim();
      const target = actionRequest.target.trim();

      if (ALWAYS_DENIED_ACTIONS.has(action)) {
        return {
          decision: "deny",
          reason: `Action '${action}' is permanently denied by Locaily execution policy.`,
          policyVersion: policy.version
        };
      }

      const fsGuard = evaluateFilesystemOrMemoryGuards(action, target, policy.version, workspaceRoot);
      if (fsGuard) {
        return fsGuard;
      }

      const browserGuard = evaluateBrowserLocalGuard(action, target, policy.version);
      if (browserGuard) {
        return browserGuard;
      }

      if (!policy.actionsMap.has(action)) {
        return {
          decision: "deny",
          reason: `Unknown action '${action}' denied by fail-closed default policy.`,
          policyVersion: policy.version
        };
      }

      const mappedDecision = policy.actionsMap.get(action);
      const decisionObj = {
        decision: mappedDecision,
        reason: mappedDecision === "allow"
          ? `Action '${action}' permitted by execution policy v${policy.version}.`
          : mappedDecision === "require_approval"
            ? `Action '${action}' requires human operator approval before execution.`
            : `Action '${action}' denied by execution policy v${policy.version}.`,
        policyVersion: policy.version
      };

      const decValidation = validatePolicyDecision(decisionObj);
      if (!decValidation.ok) {
        return {
          decision: "deny",
          reason: `Policy decision validation failed: ${decValidation.errors.join(" ")}`,
          policyVersion: policy.version
        };
      }

      return decisionObj;
    }
  };
}

/**
 * Wrap any evaluator adapter (native or external/NOPE) with fail-closed validation
 * and immutable hard-deny guardrails.
 */
function wrapEvaluatorAdapter(adapter, { policy }) {
  if (!adapter || typeof adapter.name !== "string" || !adapter.name.trim() || typeof adapter.evaluate !== "function") {
    throw new Error("Evaluator adapter must expose { name, evaluate(actionRequest, context) }.");
  }

  return {
    name: adapter.name.trim(),
    evaluate(actionRequest, context = {}) {
      const reqValidation = validateActionRequest(actionRequest);
      if (!reqValidation.ok) {
        return {
          decision: "deny",
          reason: `Invalid action request: ${reqValidation.errors.join(" ")}`,
          policyVersion: policy.version
        };
      }

      const action = actionRequest.action.trim();
      if (ALWAYS_DENIED_ACTIONS.has(action)) {
        return {
          decision: "deny",
          reason: `Action '${action}' is permanently denied by Locaily execution policy.`,
          policyVersion: policy.version
        };
      }

      let rawDecision;
      try {
        rawDecision = adapter.evaluate(actionRequest, context);
      } catch (error) {
        return {
          decision: "deny",
          reason: `Evaluator adapter error (fail-closed): ${error.message}`,
          policyVersion: policy.version
        };
      }

      const candidate = rawDecision && typeof rawDecision === "object" && !Array.isArray(rawDecision)
        ? {
            decision: rawDecision.decision,
            reason: rawDecision.reason,
            ...(rawDecision.constraints !== undefined ? { constraints: rawDecision.constraints } : {}),
            policyVersion: rawDecision.policyVersion || policy.version
          }
        : null;

      const decValidation = validatePolicyDecision(candidate);
      if (!decValidation.ok) {
        return {
          decision: "deny",
          reason: `Evaluator adapter returned invalid policy decision (fail-closed): ${decValidation.errors.join(" ")}`,
          policyVersion: policy.version
        };
      }

      return candidate;
    }
  };
}

module.exports = {
  validateActionRequest,
  validatePolicyDecision,
  createNativePolicyEvaluator,
  wrapEvaluatorAdapter
};
