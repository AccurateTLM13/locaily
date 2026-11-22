const { appendFileSync, existsSync, mkdirSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { loadExecutionPolicy, ALWAYS_DENIED_ACTIONS } = require("./policy-loader");
const { createNativePolicyEvaluator, wrapEvaluatorAdapter } = require("./policy-evaluator-adapter");
const { createApprovalStore } = require("./approval-store");

const DEFAULT_DECISIONS_PATH = path.resolve(__dirname, "..", "..", "data", "security", "policy-decisions.jsonl");

const PERMISSION_TO_ACTION_MAP = new Map([
  ["model.run", "model.run"],
  ["tool.execute.deterministic", "tool.execute.deterministic"],
  ["file.read", "filesystem.read.workspace"],
  ["filesystem.read", "filesystem.read.workspace"],
  ["filesystem.read.workspace", "filesystem.read.workspace"],
  ["filesystem.read.outside_workspace", "filesystem.read.outside_workspace"],
  ["filesystem.read.config", "filesystem.read.config"],
  ["file.write", "filesystem.write.workspace"],
  ["filesystem.write", "filesystem.write.workspace"],
  ["filesystem.write.workspace", "filesystem.write.workspace"],
  ["filesystem.write.outside_workspace", "filesystem.write.outside_workspace"],
  ["filesystem.write.config", "filesystem.write.config"],
  ["file.delete", "filesystem.delete"],
  ["filesystem.delete", "filesystem.delete"],
  ["filesystem.delete.protected", "filesystem.delete.protected"],
  ["shell.execute", "shell.execute.arbitrary"],
  ["shell.execute.approved", "shell.execute.approved"],
  ["shell.execute.arbitrary", "shell.execute.arbitrary"],
  ["browser.open.local", "browser.open.local"],
  ["browser.write", "browser.open.external"],
  ["browser.open.external", "browser.open.external"],
  ["network.local", "network.local"],
  ["network.send", "network.external"],
  ["network.external", "network.external"],
  ["credentials.read", "credentials.read"],
  ["credentials.write", "credentials.write"],
  ["credentials.pass.external", "credentials.pass.external"],
  ["memory.read", "memory.read"],
  ["memory.writeback.propose", "memory.writeback.propose"],
  ["memory.writeback.apply", "memory.writeback.apply"],
  ["memory.delete", "memory.delete"],
  ["nearbyNode.register", "nearbyNode.register"],
  ["nearbyNode.invoke", "nearbyNode.invoke"],
  ["nearbyNode.invoke.unregistered", "nearbyNode.invoke.unregistered"],
  ["audit.disable", "audit.disable"],
  ["audit.delete", "audit.delete"],
  ["policy.modify.runtime", "policy.modify.runtime"],
  ["software.install.system", "software.install.system"],
  ["software.download_execute", "software.download_execute"],
  ["publish.external", "publish.external"],
  ["publish.social", "publish.social"]
]);

function mapPermissionToAction(permission) {
  const key = typeof permission === "string" ? permission.trim() : "";
  if (!key) return "";
  return PERMISSION_TO_ACTION_MAP.get(key) || key;
}

function inferRiskLevel(action) {
  if (!action || typeof action !== "string") return "high";
  if (ALWAYS_DENIED_ACTIONS.has(action)) return "critical";
  if (
    action.includes("delete")
    || action.startsWith("shell.")
    || action.startsWith("nearbyNode.")
    || action === "memory.writeback.apply"
    || action.startsWith("network.external")
    || action.startsWith("publish.")
  ) {
    return "high";
  }
  if (action.includes("write") || action.startsWith("network.") || action.includes("config")) {
    return "medium";
  }
  return "low";
}

function extractInputPathTarget(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  for (const candidate of [input.targetPath, input.filePath, input.path, input.repoPath]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

/**
 * Create Locaily's centralized fail-closed execution-policy gate.
 */
function createExecutionGate(options = {}) {
  const workspaceRoot = options.workspaceRoot
    ? path.resolve(options.workspaceRoot)
    : path.resolve(__dirname, "..", "..");
  const policy = loadExecutionPolicy(options.policyPath);
  const rawAdapter = options.evaluatorAdapter
    || createNativePolicyEvaluator({ policy, workspaceRoot });
  const adapter = wrapEvaluatorAdapter(rawAdapter, { policy });
  const approvalStore = createApprovalStore({
    filePath: options.approvalsFilePath,
    ttlMs: options.approvalTtlMs
  });
  const decisionsFilePath = options.decisionsFilePath
    ? path.resolve(options.decisionsFilePath)
    : DEFAULT_DECISIONS_PATH;
  const auditLog = options.auditLog || null;
  const recentDecisions = [];
  const stats = {
    evaluated: 0,
    allowed: 0,
    approved: 0,
    constrained: 0,
    requireApproval: 0,
    denied: 0
  };

  if (existsSync(decisionsFilePath)) {
    try {
      const lines = readFileSync(decisionsFilePath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim());
      for (const line of lines.slice(-200)) {
        try {
          recentDecisions.push(JSON.parse(line));
        } catch {
          // Skip corrupt historical lines without failing startup.
        }
      }
    } catch {
      // Ignore unreadable history log on startup.
    }
  }

  function recordDecisionEntry(entry) {
    recentDecisions.push(entry);
    if (recentDecisions.length > 500) {
      recentDecisions.splice(0, recentDecisions.length - 500);
    }

    try {
      mkdirSync(path.dirname(decisionsFilePath), { recursive: true });
      appendFileSync(decisionsFilePath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      // Do not allow JSONL disk failure to weaken runtime block decisions.
    }
  }

  async function recordAuditEvent({ actionRequest, result, durationMs, options: evalOpts }) {
    if (!auditLog || typeof auditLog.record !== "function" || evalOpts.recordAudit === false) {
      return;
    }

    const actionLabel = actionRequest && typeof actionRequest.action === "string" && actionRequest.action.trim()
      ? actionRequest.action.trim()
      : "unknown";
    const targetLen = actionRequest && typeof actionRequest.target === "string" ? actionRequest.target.length : 0;
    const reasonLen = actionRequest && typeof actionRequest.reason === "string" ? actionRequest.reason.length : 0;
    const riskLevel = actionRequest && typeof actionRequest.riskLevel === "string"
      ? actionRequest.riskLevel
      : "medium";

    try {
      await auditLog.record({
        run_id: null,
        trace_id: evalOpts.traceId || evalOpts.runId || null,
        source: {
          app_id: "locaily-execution-gate",
          surface: evalOpts.surface || "runtime",
          user_action: actionLabel,
          client_version: policy.version
        },
        tool: "execution-policy-gate",
        task: actionLabel,
        permissions_used: actionLabel !== "unknown" ? [actionLabel] : [],
        input_summary: {
          type: "action_request",
          chars: targetLen + reasonLen,
          attachments: 0,
          risk_level: riskLevel
        },
        output_summary: {
          type: "policy_decision",
          keys: [result.code, result.decision.decision]
        },
        fallbacks_used: [],
        duration_ms: durationMs,
        status: result.allowed ? "success" : "error",
        error_code: result.allowed ? null : result.code
      });
    } catch (error) {
      console.error("[Execution Policy Gate] Failed to write audit event:", error.message);
    }
  }

  async function evaluate(actionRequest, evalOptions = {}) {
    const startedAt = Date.now();
    const rawDecision = adapter.evaluate(actionRequest, { workspaceRoot });
    let result;

    if (rawDecision.decision === "allow") {
      stats.allowed += 1;
      result = {
        allowed: true,
        code: "POLICY_ALLOWED",
        decision: rawDecision,
        approval: null,
        actionRequest
      };
    } else if (rawDecision.decision === "constrain") {
      stats.constrained += 1;
      result = {
        allowed: true,
        code: "POLICY_CONSTRAINED",
        decision: rawDecision,
        approval: null,
        actionRequest
      };
    } else if (rawDecision.decision === "deny") {
      stats.denied += 1;
      result = {
        allowed: false,
        code: "POLICY_DENIED",
        decision: rawDecision,
        approval: null,
        actionRequest
      };
    } else {
      // require_approval
      if (evalOptions.approvalId) {
        const approvalCheck = approvalStore.checkApproval(evalOptions.approvalId, actionRequest);
        if (approvalCheck.valid) {
          stats.approved += 1;
          const constraints = approvalCheck.approval.constraints || null;
          result = {
            allowed: true,
            code: "POLICY_APPROVED",
            decision: {
              decision: constraints ? "constrain" : "allow",
              reason: `Action '${actionRequest.action}' approved by human operator (${approvalCheck.approval.id}).`,
              ...(constraints ? { constraints } : {}),
              policyVersion: policy.version
            },
            approval: approvalCheck.approval,
            actionRequest
          };
        } else {
          stats.denied += 1;
          result = {
            allowed: false,
            code: "APPROVAL_INVALID",
            decision: {
              decision: "deny",
              reason: `Approval verification failed: ${approvalCheck.reason}`,
              policyVersion: policy.version
            },
            approval: null,
            actionRequest
          };
        }
      } else if (evalOptions.dryRun === true || evalOptions.createApproval === false) {
        stats.requireApproval += 1;
        result = {
          allowed: false,
          code: "APPROVAL_REQUIRED",
          decision: rawDecision,
          approval: null,
          actionRequest
        };
      } else {
        stats.requireApproval += 1;
        const pendingApproval = approvalStore.createPending({
          actionRequest,
          policyDecision: rawDecision,
          runId: evalOptions.runId || null,
          traceId: evalOptions.traceId || null,
          metadata: evalOptions.surface ? { surface: evalOptions.surface } : null
        });
        result = {
          allowed: false,
          code: "APPROVAL_REQUIRED",
          decision: rawDecision,
          approval: pendingApproval,
          actionRequest
        };
      }
    }

    stats.evaluated += 1;
    const durationMs = Date.now() - startedAt;

    if (evalOptions.recordDecision !== false) {
      recordDecisionEntry({
        timestamp: new Date().toISOString(),
        surface: evalOptions.surface || "runtime",
        runId: evalOptions.runId || null,
        action: actionRequest && typeof actionRequest.action === "string" ? actionRequest.action : null,
        target: actionRequest && typeof actionRequest.target === "string" ? actionRequest.target : null,
        requestedBy: actionRequest && typeof actionRequest.requestedBy === "string" ? actionRequest.requestedBy : null,
        riskLevel: actionRequest && typeof actionRequest.riskLevel === "string" ? actionRequest.riskLevel : null,
        allowed: result.allowed,
        code: result.code,
        decision: result.decision.decision,
        reason: result.decision.reason,
        approvalId: result.approval ? result.approval.id : null,
        policyVersion: result.decision.policyVersion || policy.version,
        evaluator: adapter.name
      });
    }

    await recordAuditEvent({
      actionRequest,
      result,
      durationMs,
      options: evalOptions
    });

    return result;
  }

  async function evaluateToolExecution({
    tool,
    task = "run",
    input = null,
    requestedPermissions = null,
    requestedActions = null,
    options: toolOptions = {},
    meta = {}
  }) {
    const toolId = (tool && tool.id) || "unknown-tool";
    const requestedBy = (meta && meta.requestedBy) || `tool:${toolId}`;
    const rawPerms = Array.isArray(requestedPermissions)
      ? requestedPermissions
      : (tool && Array.isArray(tool.permissions) ? tool.permissions : []);

    const pathTarget = extractInputPathTarget(input);
    const defaultTarget = `tool:${toolId}:${task}`;
    const actionRequests = [];

    if (rawPerms.length === 0 && (!Array.isArray(requestedActions) || requestedActions.length === 0)) {
      actionRequests.push({
        action: "tool.execute.deterministic",
        target: defaultTarget,
        requestedBy,
        reason: `Execute deterministic tool '${toolId}' task '${task}'`,
        riskLevel: "low"
      });
    } else {
      for (const perm of rawPerms) {
        const mappedAction = mapPermissionToAction(perm);
        if (!mappedAction) continue;
        const usesPathTarget = mappedAction.startsWith("filesystem.") || mappedAction.startsWith("memory.writeback.");
        actionRequests.push({
          action: mappedAction,
          target: usesPathTarget && pathTarget ? pathTarget : defaultTarget,
          requestedBy,
          reason: `Execute tool '${toolId}' task '${task}' requiring '${perm}'`,
          riskLevel: inferRiskLevel(mappedAction)
        });
      }
    }

    if (Array.isArray(requestedActions)) {
      for (const extraAction of requestedActions) {
        actionRequests.push(extraAction);
      }
    }

    const results = [];
    for (const req of actionRequests) {
      const res = await evaluate(req, {
        approvalId: toolOptions.approvalId || null,
        dryRun: toolOptions.dryRun === true,
        createApproval: toolOptions.createApproval,
        runId: meta && meta.run_id ? meta.run_id : null,
        traceId: meta && meta.trace_id ? meta.trace_id : null,
        surface: toolOptions.surface || "tool-execution"
      });
      results.push(res);

      if (!res.allowed) {
        return {
          allowed: false,
          code: res.code,
          decision: res.decision,
          approval: res.approval,
          actionRequest: req,
          results
        };
      }
    }

    const last = results[results.length - 1] || null;
    return {
      allowed: true,
      code: last ? last.code : "POLICY_ALLOWED",
      decision: last ? last.decision : { decision: "allow", reason: "No blocked actions.", policyVersion: policy.version },
      approval: last ? last.approval : null,
      results
    };
  }

const READ_ONLY_PACK_ACTIONS = new Set([
  "model.run",
  "tool.execute.deterministic",
  "filesystem.read.workspace",
  "memory.read"
]);

  function evaluatePackPolicy(pack) {
    const perms = (pack && pack.permissions) || { required: [], optional: [] };
    const required = Array.isArray(perms.required) ? perms.required : [];
    const optional = Array.isArray(perms.optional) ? perms.optional : [];
    const actionsToCheck = required.length > 0
      ? required.map(mapPermissionToAction).filter(Boolean)
      : ["tool.execute.deterministic"];
    const allDeclaredActions = [...required, ...optional]
      .map(mapPermissionToAction)
      .filter(Boolean);
    const readOnly = allDeclaredActions.every((action) => READ_ONLY_PACK_ACTIONS.has(action));

    const packId = (pack && pack.id) || "unknown-pack";
    const allowed = [];
    const requireApproval = [];
    const denied = [];
    const evaluatedActions = [];

    for (const action of actionsToCheck) {
      const decision = adapter.evaluate({
        action,
        target: `workflow-pack:${packId}`,
        requestedBy: `workflow-pack:${packId}`,
        reason: `Pack permission declaration '${action}'`,
        riskLevel: inferRiskLevel(action)
      }, { workspaceRoot });

      evaluatedActions.push({
        action,
        decision: decision.decision,
        reason: decision.reason
      });

      if (decision.decision === "allow" || decision.decision === "constrain") {
        allowed.push(action);
      } else if (decision.decision === "require_approval") {
        requireApproval.push(action);
      } else {
        denied.push(action);
      }
    }

    return {
      ok: denied.length === 0 && requireApproval.length === 0,
      readOnly,
      policyVersion: policy.version,
      defaultDecision: policy.defaultDecision,
      evaluatedActions,
      allowed,
      requireApproval,
      denied
    };
  }

  function listDecisions(limit = 50) {
    const max = Number.isInteger(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), 500)
      : 50;
    return recentDecisions.slice(-max).reverse();
  }

  function getPolicySnapshot() {
    return {
      version: policy.version,
      status: policy.status,
      defaultDecision: policy.defaultDecision,
      sourcePath: policy.sourcePath,
      evaluator: adapter.name,
      immutableDeniedActions: Array.from(ALWAYS_DENIED_ACTIONS),
      actions: policy.actionsSnapshot,
      invariantWarnings: policy.invariantWarnings
    };
  }

  function getStatus() {
    const pendingCount = approvalStore.list({ status: "pending", limit: 500 }).length;
    return {
      enforced: true,
      status: policy.status,
      version: policy.version,
      defaultDecision: policy.defaultDecision,
      evaluator: adapter.name,
      pendingApprovals: pendingCount,
      immutableDeniedCount: ALWAYS_DENIED_ACTIONS.size,
      stats: { ...stats }
    };
  }

  return {
    policy,
    adapter,
    approvals: approvalStore,
    evaluate,
    evaluateToolExecution,
    evaluatePackPolicy,
    listDecisions,
    getPolicySnapshot,
    getStatus
  };
}

module.exports = {
  DEFAULT_DECISIONS_PATH,
  PERMISSION_TO_ACTION_MAP,
  mapPermissionToAction,
  createExecutionGate
};
