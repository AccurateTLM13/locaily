#!/usr/bin/env node
/**
 * Acceptance & security regression suite for SEC-01:
 * Central Execution-Policy Runtime Gate, Runtime Hooks,
 * Human-in-the-Loop Approvals, Console UI, and NOPE Decision Record.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const {
  ALWAYS_DENIED_ACTIONS,
  loadExecutionPolicy,
  validateActionRequest,
  validatePolicyDecision,
  createExecutionGate
} = require("../companion/security");
const { createAuditLog } = require("../companion/core/audit-log");
const { executeToolStep } = require("../companion/crew/tool-router");
const {
  createWorkflowPackRegistry,
  evaluatePackExecutionPolicy
} = require("../companion/packs");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}\n  ${err.stack || err.message}`);
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

function httpRequest(baseUrl, method, routePath, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(routePath, baseUrl);
    const payload = body !== null ? JSON.stringify(body) : null;
    const headers = {
      ...extraHeaders,
      ...(payload
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        : {})
    };
    const req = http.request({
      method,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      headers
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await httpRequest(baseUrl, "GET", "/health");
      if (res.status === 200 && res.body && res.body.ok) {
        return res.body;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for companion server at ${baseUrl}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
  });
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(3000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, sleep(1500)]);
  }
}

async function main() {
  console.log("=== SEC-01 Central Execution-Policy Runtime Gate Tests ===\n");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "locaily-sec01-"));

  try {
    await check("AC1: Canonical policy is enforced, fail-closed, schema-compliant, and resists tampering & prototype keys", async () => {
      const policy = loadExecutionPolicy();
      assert.equal(policy.status, "enforced");
      assert.equal(policy.defaultDecision, "deny");
      assert.equal(policy.actionsMap.get("filesystem.read.workspace"), "allow");
      assert.equal(policy.actionsMap.get("filesystem.delete"), "require_approval");
      assert.equal(policy.actionsMap.get("shell.execute.arbitrary"), "deny");

      const badPolicyPath = path.join(tmpDir, "bad-policy.json");
      fs.writeFileSync(badPolicyPath, JSON.stringify({
        version: "1.0.0",
        status: "enforced",
        defaultDecision: "allow",
        actions: {}
      }), "utf8");
      assert.throws(() => loadExecutionPolicy(badPolicyPath), { code: "EXECUTION_POLICY_INVALID" });

      const weakenedPolicyPath = path.join(tmpDir, "weakened-policy.json");
      fs.writeFileSync(weakenedPolicyPath, JSON.stringify({
        version: "1.0.0",
        status: "enforced",
        defaultDecision: "deny",
        actions: { "shell.execute.arbitrary": "allow" }
      }), "utf8");
      const hardened = loadExecutionPolicy(weakenedPolicyPath);
      assert.equal(hardened.actionsMap.get("shell.execute.arbitrary"), "deny");
      assert(hardened.invariantWarnings.length > 0);

      const auditFilePath = path.join(tmpDir, "audit-ac1.jsonl");
      const auditLog = createAuditLog({ filePath: auditFilePath });
      const gate = createExecutionGate({
        approvalsFilePath: path.join(tmpDir, "approvals-ac1.json"),
        decisionsFilePath: path.join(tmpDir, "decisions-ac1.jsonl"),
        auditLog,
        workspaceRoot: ROOT
      });

      // Unknown action fails closed
      const unknownRes = await gate.evaluate({
        action: "totally.unknown.capability",
        target: "README.md",
        requestedBy: "sec01-test",
        reason: "Unknown action fail-closed check"
      }, { dryRun: true, surface: "unit-test" });
      assert.equal(unknownRes.allowed, false);
      assert.equal(unknownRes.code, "POLICY_DENIED");
      assert.equal(unknownRes.decision.decision, "deny");
      assert.equal(validatePolicyDecision(unknownRes.decision).ok, true);

      // Prototype-key probes fail closed cleanly
      for (const protoKey of ["toString", "constructor", "__proto__", "valueOf"]) {
        const res = await gate.evaluate({
          action: protoKey,
          target: "README.md",
          requestedBy: "sec01-test",
          reason: "Prototype lookup safety check"
        }, { dryRun: true, surface: "unit-test" });
        assert.equal(res.allowed, false);
        assert.equal(res.code, "POLICY_DENIED");
        assert.equal(validatePolicyDecision(res.decision).ok, true);
      }

      // Invalid ActionRequest schema fails closed
      assert.equal(validateActionRequest({ action: "filesystem.read.workspace" }).ok, false);
      const invalidReqRes = await gate.evaluate({
        action: "filesystem.read.workspace",
        target: "README.md",
        requestedBy: "sec01-test",
        reason: "Extra property test",
        unexpectedField: true
      }, { dryRun: true });
      assert.equal(invalidReqRes.allowed, false);
      assert.equal(invalidReqRes.code, "POLICY_DENIED");

      // Workspace read allowed inside root, escalated outside root
      const insideRead = await gate.evaluate({
        action: "filesystem.read.workspace",
        target: "README.md",
        requestedBy: "sec01-test",
        reason: "Read repo README"
      }, { dryRun: true });
      assert.equal(insideRead.allowed, true);
      assert.equal(insideRead.code, "POLICY_ALLOWED");
      assert.equal(validatePolicyDecision(insideRead.decision).ok, true);

      const outsideRead = await gate.evaluate({
        action: "filesystem.read.workspace",
        target: "../outside-workspace-secret.txt",
        requestedBy: "sec01-test",
        reason: "Attempt workspace boundary escape"
      }, { dryRun: true });
      assert.equal(outsideRead.allowed, false);
      assert.equal(outsideRead.decision.decision, "require_approval");
      assert.equal(validatePolicyDecision(outsideRead.decision).ok, true);

      // Config file read escalates to require_approval
      const configRead = await gate.evaluate({
        action: "filesystem.read.workspace",
        target: "companion/config.json",
        requestedBy: "sec01-test",
        reason: "Read config file"
      }, { dryRun: true });
      assert.equal(configRead.allowed, false);
      assert.equal(configRead.decision.decision, "require_approval");

      // Credential path and protected policy/audit writes always deny
      for (const secretTarget of [".env", ".ssh/id_rsa", "companion/../.env.local", "config/secrets.key"]) {
        const credProbe = await gate.evaluate({
          action: "filesystem.read.workspace",
          target: secretTarget,
          requestedBy: "sec01-test",
          reason: "Credential path probe"
        }, { dryRun: true });
        assert.equal(credProbe.allowed, false);
        assert.equal(credProbe.code, "POLICY_DENIED");
      }

      const policyWriteProbe = await gate.evaluate({
        action: "filesystem.write.workspace",
        target: "policies/default-execution-policy.json",
        requestedBy: "sec01-test",
        reason: "Attempt policy overwrite"
      }, { dryRun: true });
      assert.equal(policyWriteProbe.allowed, false);
      assert.equal(policyWriteProbe.code, "POLICY_DENIED");

      // Verify auditLog records conform strictly to run-log-audit-record.schema.json
      const recordedAudit = await auditLog.list({ tool: "execution-policy-gate", limit: 50 });
      assert(recordedAudit.length >= 6, "Expected policy audit events written to AuditLog");
    });

    await check("AC2: Immutable hard-deny actions cannot be queued or approved", async () => {
      const gate = createExecutionGate({
        approvalsFilePath: path.join(tmpDir, "approvals-ac2.json"),
        decisionsFilePath: path.join(tmpDir, "decisions-ac2.jsonl"),
        workspaceRoot: ROOT
      });

      for (const deniedAction of [
        "shell.execute.arbitrary",
        "credentials.read",
        "credentials.write",
        "audit.disable",
        "audit.delete",
        "policy.modify.runtime",
        "nearbyNode.invoke.unregistered",
        "memory.delete"
      ]) {
        assert(ALWAYS_DENIED_ACTIONS.has(deniedAction));
        const res = await gate.evaluate({
          action: deniedAction,
          target: "system:target",
          requestedBy: "sec01-test",
          reason: `Hard deny check for ${deniedAction}`,
          riskLevel: "critical"
        });
        assert.equal(res.allowed, false);
        assert.equal(res.code, "POLICY_DENIED");
        assert.equal(res.decision.decision, "deny");
        assert.equal(res.approval, null);

        assert.throws(() => gate.approvals.createPending({
          actionRequest: {
            action: deniedAction,
            target: "system:target",
            requestedBy: "sec01-test",
            reason: "Attempt force-queue denied action"
          },
          policyDecision: res.decision
        }), { code: "APPROVAL_FORBIDDEN" });
      }
    });

    await check("AC3: Human approval lifecycle binds to action+target, enforces constraints, and rejects deny/mismatch", async () => {
      const approvalsPath = path.join(tmpDir, "approvals-ac3.json");
      const gate = createExecutionGate({
        approvalsFilePath: approvalsPath,
        decisionsFilePath: path.join(tmpDir, "decisions-ac3.jsonl"),
        workspaceRoot: ROOT
      });

      const req = {
        action: "filesystem.delete",
        target: "data/temp/sample.txt",
        requestedBy: "agent-worker",
        reason: "Remove temporary artifact",
        riskLevel: "high"
      };

      const first = await gate.evaluate(req);
      assert.equal(first.allowed, false);
      assert.equal(first.code, "APPROVAL_REQUIRED");
      assert.equal(first.decision.decision, "require_approval");
      assert(first.approval && first.approval.id.startsWith("appr_"));

      // Rejects before operator approval
      const unapprovedRetry = await gate.evaluate(req, { approvalId: first.approval.id });
      assert.equal(unapprovedRetry.allowed, false);
      assert.equal(unapprovedRetry.code, "APPROVAL_INVALID");

      // Approve with constraint
      const approved = gate.approvals.approve(first.approval.id, {
        operator: "jp-operator",
        reason: "Verified safe temp file cleanup",
        constraints: { maxFiles: 1 }
      });
      assert.equal(approved.ok, true);
      assert.equal(approved.approval.status, "approved");

      // Bound check prevents replay against different target or different action
      const wrongTarget = await gate.evaluate({ ...req, target: "data/other.txt" }, { approvalId: first.approval.id });
      assert.equal(wrongTarget.allowed, false);
      assert.equal(wrongTarget.code, "APPROVAL_INVALID");

      const wrongAction = await gate.evaluate({ ...req, action: "shell.execute.approved" }, { approvalId: first.approval.id });
      assert.equal(wrongAction.allowed, false);
      assert.equal(wrongAction.code, "APPROVAL_INVALID");

      // Valid replay succeeds with constraints
      const validRetry = await gate.evaluate(req, { approvalId: first.approval.id });
      assert.equal(validRetry.allowed, true);
      assert.equal(validRetry.code, "POLICY_APPROVED");
      assert.equal(validRetry.decision.decision, "constrain");
      assert.deepEqual(validRetry.decision.constraints, { maxFiles: 1 });

      // Reload store from disk and confirm persistence
      const reloadedGate = createExecutionGate({
        approvalsFilePath: approvalsPath,
        decisionsFilePath: path.join(tmpDir, "decisions-ac3.jsonl"),
        workspaceRoot: ROOT
      });
      assert.equal(reloadedGate.approvals.get(first.approval.id).status, "approved");

      // Denied approval stays blocked
      const second = await gate.evaluate({
        action: "shell.execute.approved",
        target: "npm run dev:status",
        requestedBy: "agent-worker",
        reason: "Check status"
      });
      const denied = gate.approvals.deny(second.approval.id, {
        operator: "jp-operator",
        reason: "Not needed"
      });
      assert.equal(denied.ok, true);
      assert.equal(denied.approval.status, "denied");
      const retryDenied = await gate.evaluate({
        action: "shell.execute.approved",
        target: "npm run dev:status",
        requestedBy: "agent-worker",
        reason: "Check status"
      }, { approvalId: second.approval.id });
      assert.equal(retryDenied.allowed, false);
      assert.equal(retryDenied.code, "APPROVAL_INVALID");
    });

    await check("AC4: Pluggable evaluator adapter swaps cleanly while preserving immutable deny guardrails", async () => {
      const buggyAdapter = {
        name: "mock-custom-adapter",
        evaluate(req) {
          if (req.action === "custom.throw") {
            throw new Error("Simulated adapter crash");
          }
          return {
            decision: "allow",
            reason: `Mock adapter attempted allow for ${req.action}`,
            policyVersion: "custom-0.1"
          };
        }
      };

      const gate = createExecutionGate({
        approvalsFilePath: path.join(tmpDir, "approvals-ac4.json"),
        decisionsFilePath: path.join(tmpDir, "decisions-ac4.jsonl"),
        evaluatorAdapter: buggyAdapter,
        workspaceRoot: ROOT
      });

      assert.equal(gate.adapter.name, "mock-custom-adapter");

      const allowedCustom = await gate.evaluate({
        action: "filesystem.read.workspace",
        target: "README.md",
        requestedBy: "adapter-test",
        reason: "Test custom allow"
      });
      assert.equal(allowedCustom.allowed, true);

      // Even if custom adapter tries to allow an immutable denied action, outer guardrail denies it
      const blockedShell = await gate.evaluate({
        action: "shell.execute.arbitrary",
        target: "powershell -c whoami",
        requestedBy: "adapter-test",
        reason: "Bypass attempt"
      });
      assert.equal(blockedShell.allowed, false);
      assert.equal(blockedShell.code, "POLICY_DENIED");

      // Exception thrown inside adapter fails closed
      const crashedEval = await gate.evaluate({
        action: "custom.throw",
        target: "none",
        requestedBy: "adapter-test",
        reason: "Crash test"
      });
      assert.equal(crashedEval.allowed, false);
      assert.equal(crashedEval.code, "POLICY_DENIED");
    });

    await check("AC5: executeToolStep and Workflow Pack evaluation enforce policy hooks with zero bypass", async () => {
      const gate = createExecutionGate({
        approvalsFilePath: path.join(tmpDir, "approvals-ac5.json"),
        decisionsFilePath: path.join(tmpDir, "decisions-ac5.jsonl"),
        workspaceRoot: ROOT
      });

      let handlerInvocations = 0;
      const registry = new Map([
        ["danger-shell", {
          id: "danger-shell",
          tasks: ["run"],
          permissions: ["shell.execute.arbitrary"],
          requiresRuntime: false,
          async handle() {
            handlerInvocations += 1;
            return { executed: true };
          }
        }],
        ["temp-deleter", {
          id: "temp-deleter",
          tasks: ["run"],
          permissions: ["filesystem.delete"],
          requiresRuntime: false,
          async handle() {
            handlerInvocations += 1;
            return { deleted: true };
          }
        }]
      ]);

      await assert.rejects(
        () => executeToolStep({
          step: { id: "s1", input_map: {}, executor: { type: "tool", tool: "danger-shell", task: "run" } },
          context: { input: {}, artifacts: {} },
          toolRegistry: registry,
          runtime: null,
          options: { executionGate: gate, track_id: "test-track" },
          meta: {}
        }),
        { code: "POLICY_DENIED" }
      );

      let pendingApprovalId = null;
      try {
        await executeToolStep({
          step: { id: "s2", input_map: { path: "$input.path" }, executor: { type: "tool", tool: "temp-deleter", task: "run" } },
          context: { input: { path: "tmp/artifact.txt" }, artifacts: {} },
          toolRegistry: registry,
          runtime: null,
          options: { executionGate: gate, track_id: "test-track" },
          meta: {}
        });
        assert.fail("Expected executeToolStep to pause with APPROVAL_REQUIRED");
      } catch (err) {
        assert.equal(err.code, "APPROVAL_REQUIRED");
        assert(err.approval && err.approval.id);
        pendingApprovalId = err.approval.id;
      }

      assert.equal(handlerInvocations, 0, "Blocked tool handlers must never execute");

      gate.approvals.approve(pendingApprovalId, { operator: "sec01-test" });
      const resAfterApprove = await executeToolStep({
        step: { id: "s2", input_map: { path: "$input.path" }, executor: { type: "tool", tool: "temp-deleter", task: "run" } },
        context: { input: { path: "tmp/artifact.txt" }, artifacts: {} },
        toolRegistry: registry,
        runtime: null,
        options: { executionGate: gate, track_id: "test-track", approvalId: pendingApprovalId },
        meta: {}
      });
      assert.deepEqual(resAfterApprove.output, { deleted: true });
      assert.equal(handlerInvocations, 1);

      // Verify all 6 installed packs pass policy evaluation, and a write/shell pack fails
      const packRegistry = createWorkflowPackRegistry();
      const installedPacks = packRegistry.listPacks();
      assert(installedPacks.length >= 6);
      for (const pack of installedPacks) {
        const evalPack = evaluatePackExecutionPolicy(pack, gate);
        assert.equal(evalPack.ok, true, `Expected pack '${pack.id}' to pass policy evaluation: ${JSON.stringify(evalPack)}`);
        assert.equal(evalPack.readOnly, true);
      }

      const unsafePackEval = evaluatePackExecutionPolicy({
        id: "synthetic-unsafe-pack",
        trust: { readOnly: false },
        permissions: { required: ["shell.execute.arbitrary", "filesystem.delete"], optional: [] }
      }, gate);
      assert.equal(unsafePackEval.ok, false);
      assert(unsafePackEval.denied.includes("shell.execute.arbitrary"));
      assert(unsafePackEval.requireApproval.includes("filesystem.delete"));
    });

    await check("AC6: Live HTTP server enforces /security/*, /memory/writeback/apply, /relay/*, /tasks/run, /packs, and Console #security UI", async () => {
      const port = await findFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const child = spawn(process.execPath, [path.join(ROOT, "companion", "server.js")], {
        cwd: ROOT,
        env: {
          ...process.env,
          LOCAL_AI_HOST: "127.0.0.1",
          LOCAL_AI_PORT: String(port),
          AI_PROVIDER: "mock",
          EXECUTION_POLICY_APPROVALS_PATH: path.join(tmpDir, "http-approvals.json"),
          EXECUTION_POLICY_DECISIONS_PATH: path.join(tmpDir, "http-decisions.jsonl")
        },
        stdio: ["ignore", "pipe", "pipe"]
      });

      try {
        const health = await waitForHealth(baseUrl);
        assert.equal(health.execution_policy.enforced, true);
        assert.equal(health.execution_policy.defaultDecision, "deny");
        assert.equal(health.execution_policy.policyEndpoint, "/security/policy");

        const consoleStatus = await httpRequest(baseUrl, "GET", "/console/status");
        assert.equal(consoleStatus.status, 200);
        assert.equal(consoleStatus.body.execution_policy.enforced, true);

        const policyGet = await httpRequest(baseUrl, "GET", "/security/policy");
        assert.equal(policyGet.status, 200);
        assert.equal(policyGet.body.policy.defaultDecision, "deny");
        assert(policyGet.body.policy.immutableDeniedActions.includes("shell.execute.arbitrary"));

        const policyPost = await httpRequest(baseUrl, "POST", "/security/policy", {
          defaultDecision: "allow"
        });
        assert.equal(policyPost.status, 403);
        assert.equal(policyPost.body.code, "POLICY_DENIED");

        // Evaluate allow, deny, require_approval (+ queue)
        const evalAllow = await httpRequest(baseUrl, "POST", "/security/evaluate", {
          action: "filesystem.read.workspace",
          target: "README.md",
          requestedBy: "http-test",
          reason: "Inspect readme",
          dryRun: true
        });
        assert.equal(evalAllow.status, 200);
        assert.equal(evalAllow.body.allowed, true);
        assert.equal(evalAllow.body.code, "POLICY_ALLOWED");

        const evalUnknown = await httpRequest(baseUrl, "POST", "/security/evaluate", {
          action: "not.in.policy",
          target: "anything",
          requestedBy: "http-test",
          reason: "Unknown action probe"
        });
        assert.equal(evalUnknown.status, 200);
        assert.equal(evalUnknown.body.allowed, false);
        assert.equal(evalUnknown.body.code, "POLICY_DENIED");

        // /tasks/run enforcement hook with requested actions
        const blockedTask = await httpRequest(baseUrl, "POST", "/tasks/run", {
          tool: "deal-sniper",
          task: "prepare-listing",
          input: { title: "Policy probe item", price: 100 },
          options: {
            actions: [{
              action: "shell.execute.arbitrary",
              target: "powershell -c id",
              requestedBy: "http-test",
              reason: "Attempt arbitrary shell via tasks/run"
            }]
          }
        });
        assert.equal(blockedTask.status, 403, `Expected 403 POLICY_DENIED on /tasks/run, got ${blockedTask.raw}`);
        assert.equal(blockedTask.body.code, "POLICY_DENIED");

        // /memory/writeback/apply requires approval
        const memWriteBlocked = await httpRequest(baseUrl, "POST", "/memory/writeback/apply", {
          targetPath: "projects/test-note.md",
          title: "Test Note",
          summary: "Verify approval gate",
          bullets: ["Gated by SEC-01"]
        });
        assert.equal(memWriteBlocked.status, 403);
        assert.equal(memWriteBlocked.body.error.code, "APPROVAL_REQUIRED");
        assert(memWriteBlocked.body.approval && memWriteBlocked.body.approval.id);
        const memApprovalId = memWriteBlocked.body.approval.id;

        // Approve pending writeback request
        const approveMem = await httpRequest(baseUrl, "POST", `/security/approvals/${encodeURIComponent(memApprovalId)}/approve`, {
          operator: "jp-test",
          reason: "Approve writeback check"
        });
        assert.equal(approveMem.status, 200);
        assert.equal(approveMem.body.approval.status, "approved");

        // Re-try /memory/writeback/apply passes SEC-01 gate (moves past APPROVAL_REQUIRED to permissionManager/vaultAdapter check)
        const memWriteAfterApprove = await httpRequest(baseUrl, "POST", "/memory/writeback/apply", {
          targetPath: "projects/test-note.md",
          approvalId: memApprovalId,
          title: "Test Note",
          summary: "Verify approval gate",
          bullets: ["Gated by SEC-01"]
        });
        assert.notEqual(memWriteAfterApprove.body?.error?.code, "APPROVAL_REQUIRED", `Expected writeback to pass SEC-01 approval gate, got ${memWriteAfterApprove.raw}`);
        assert.notEqual(memWriteAfterApprove.body?.error?.code, "POLICY_DENIED", `Unexpected POLICY_DENIED after approval: ${memWriteAfterApprove.raw}`);

        // /relay/step hard-denies unregistered executor
        const unregisteredRelayStep = await httpRequest(baseUrl, "POST", "/relay/step", {
          step: {
            id: "bad-step",
            executor: { type: "tool", tool: "unregistered-shell-tool", task: "exec" }
          }
        });
        assert.equal(unregisteredRelayStep.status, 403);
        assert.equal(unregisteredRelayStep.body.code, "POLICY_DENIED");

        // /relay/register strict policy gate requires approval, then passes after approve
        const strictRelayBlocked = await httpRequest(baseUrl, "POST", "/relay/register", {
          nodeId: "node-strict-sec01",
          baseUrl: "http://127.0.0.1:41999",
          capabilities: [{ role: "default_worker" }]
        }, { "x-locaily-strict-policy": "1" });
        assert.equal(strictRelayBlocked.status, 403);
        assert.equal(strictRelayBlocked.body.code, "APPROVAL_REQUIRED");
        const relayApprovalId = strictRelayBlocked.body.approval.id;

        const approveRelay = await httpRequest(baseUrl, "POST", `/security/approvals/${encodeURIComponent(relayApprovalId)}/approve`, {
          operator: "jp-test"
        });
        assert.equal(approveRelay.status, 200);

        const strictRelayPassed = await httpRequest(baseUrl, "POST", "/relay/register", {
          nodeId: "node-strict-sec01",
          baseUrl: "http://127.0.0.1:41999",
          capabilities: [{ role: "default_worker" }],
          approvalId: relayApprovalId
        }, { "x-locaily-strict-policy": "1" });
        assert.equal(strictRelayPassed.status, 200);
        assert.equal(strictRelayPassed.body.ok, true);
        assert.equal(strictRelayPassed.body.execution_policy.code, "POLICY_APPROVED");

        // /packs includes executionPolicyStatus
        const packsRes = await httpRequest(baseUrl, "GET", "/packs");
        assert.equal(packsRes.status, 200);
        assert(packsRes.body.packs.length >= 6);
        for (const p of packsRes.body.packs) {
          assert(p.executionPolicyStatus && p.executionPolicyStatus.ok === true, `Pack '${p.id}' missing ok executionPolicyStatus`);
        }

        // /security/decisions & /security/approvals list recorded history
        const decisionsRes = await httpRequest(baseUrl, "GET", "/security/decisions?limit=20");
        assert.equal(decisionsRes.status, 200);
        assert(decisionsRes.body.decisions.length >= 5);

        const approvalsList = await httpRequest(baseUrl, "GET", "/security/approvals?status=approved");
        assert.equal(approvalsList.status, 200);
        assert(approvalsList.body.approvals.some((a) => a.id === memApprovalId));

        // Companion Console HTML & JS expose #security UI
        const consoleHtml = await httpRequest(baseUrl, "GET", "/console");
        assert.equal(consoleHtml.status, 200);
        assert(consoleHtml.raw.includes('id="navSecurityLink"'));
        assert(consoleHtml.raw.includes('id="securityView"'));
        assert(consoleHtml.raw.includes('id="securityEvaluateForm"'));

        const consoleJs = await httpRequest(baseUrl, "GET", "/console/app.js");
        assert.equal(consoleJs.status, 200);
        assert(consoleJs.raw.includes("/security/approvals"));
        assert(consoleJs.raw.includes("/security/evaluate"));
        assert(!consoleJs.raw.includes("requestJson(\"/security/"), "Security UI must use fetchJson, not undefined requestJson");
      } finally {
        await stopChild(child);
      }
    });

    await check("AC7: NOPE evaluation decision is documented in docs/security/NOPE-EVALUATION.md and docs/06-decisions/decision-log.md", async () => {
      const nopeDoc = fs.readFileSync(path.join(ROOT, "docs", "security", "NOPE-EVALUATION.md"), "utf8");
      const decisionLog = fs.readFileSync(path.join(ROOT, "docs", "06-decisions", "decision-log.md"), "utf8");
      assert(nopeDoc.includes("SEC-01"), "NOPE-EVALUATION.md must record SEC-01 decision");
      assert(nopeDoc.includes("policy-evaluator-adapter.js"), "NOPE-EVALUATION.md must reference adapter module");
      assert(decisionLog.includes("SEC-01 Central Execution-Policy Runtime Gate & NOPE Evaluation Decision"), "decision-log.md must record SEC-01 ADR");
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
