const assert = require("node:assert");
const { createRelayRegistry } = require("../companion/relay/registry");
const { createRelayRouter, ROUTING_POLICY } = require("../companion/relay/router");
const { describeProtocol } = require("../companion/relay/protocol");
const { createRelayAuth } = require("../companion/relay/auth");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(`  ${error.message}`);
  }
}

const asyncChecks = [];

async function checkAsync(name, fn) {
  const promise = (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(`  ${error.message}`);
    }
  })();

  asyncChecks.push(promise);
  return promise;
}

check("protocol describes endpoints and shapes", () => {
  const protocol = describeProtocol();
  assert.strictEqual(protocol.version, "1.0");
  assert.ok(protocol.endpoints.register);
  assert.ok(protocol.messageShapes.nodeRegistration.nodeId);
});

check("registry registers and lists nodes", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["developer_task_writer"] });
  const list = reg.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].nodeId, "b");
  assert.strictEqual(list[0].healthy, true);
});

check("registry rejects registration without nodeId/baseUrl", () => {
  const reg = createRelayRegistry();
  assert.throws(() => reg.register({ baseUrl: "http://b:1" }), { code: "RELAY_NODE_ID_REQUIRED" });
  assert.throws(() => reg.register({ nodeId: "b" }), { code: "RELAY_BASE_URL_REQUIRED" });
});

check("registry selectForRole picks capable healthy node", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["developer_task_writer"] });
  reg.register({ nodeId: "c", baseUrl: "http://c:1", capabilities: ["default_worker"] });
  const picked = reg.selectForRole("developer_task_writer");
  assert.strictEqual(picked.nodeId, "b");
  assert.strictEqual(reg.selectForRole("missing_role"), null);
});

check("registry heartbeat + markUnhealthy flips health", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  reg.markUnhealthy("b");
  assert.strictEqual(reg.get("b").healthy, false);
  reg.heartbeat("b");
  assert.strictEqual(reg.get("b").healthy, true);
});

check("registry stats aggregate counts", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const stats = reg.getStats();
  assert.strictEqual(stats.total, 1);
  assert.strictEqual(stats.healthy, 1);
});

check("router decideTarget: local_only never routes", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const router = createRelayRouter({ registry: reg, connector: null });
  const decision = router.decideTarget({
    step: { executor: { type: "model", role: "default_worker" } },
    localCapable: true,
    policy: ROUTING_POLICY.LOCAL_ONLY,
    registry: reg
  });
  assert.strictEqual(decision.target, "local");
});

check("router decideTarget: prefer_relay routes to capable node", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const router = createRelayRouter({ registry: reg, connector: null });
  const decision = router.decideTarget({
    step: { executor: { type: "model", role: "default_worker" } },
    localCapable: true,
    policy: ROUTING_POLICY.PREFER_RELAY,
    registry: reg
  });
  assert.strictEqual(decision.target, "relay");
  assert.strictEqual(decision.node.nodeId, "b");
});

check("router decideTarget: route_if_unavailable keeps local when capable", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const router = createRelayRouter({ registry: reg, connector: null });
  const decision = router.decideTarget({
    step: { executor: { type: "model", role: "default_worker" } },
    localCapable: true,
    policy: ROUTING_POLICY.ROUTE_IF_UNAVAILABLE,
    registry: reg
  });
  assert.strictEqual(decision.target, "local");
});

check("router decideTarget: route_if_unavailable routes when local incapable", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const router = createRelayRouter({ registry: reg, connector: null });
  const decision = router.decideTarget({
    step: { executor: { type: "model", role: "default_worker" } },
    localCapable: false,
    policy: ROUTING_POLICY.ROUTE_IF_UNAVAILABLE,
    registry: reg
  });
  assert.strictEqual(decision.target, "relay");
});

check("router decideTarget: tool steps never route", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const router = createRelayRouter({ registry: reg, connector: null });
  const decision = router.decideTarget({
    step: { executor: { type: "tool", tool: "x" } },
    localCapable: true,
    policy: ROUTING_POLICY.PREFER_RELAY,
    registry: reg
  });
  assert.strictEqual(decision.target, "local");
});

checkAsync("router routes step to relay node and records dispatch", async () => {
  const reg = createRelayRegistry();
  const node = reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  let dispatched = null;
  const connector = {
    async executeRemoteStep({ step, node: targetNode }) {
      dispatched = targetNode.nodeId;
      return { ok: true, output: { routed: true }, meta: { role: "default_worker", model: "mock" } };
    }
  };
  const audit = { records: [], async record(e) { this.records.push(e); } };
  const router = createRelayRouter({ registry: reg, connector, auditLog: audit });

  const result = await router.executeStepWithFallback({
    step: { id: "s1", executor: { type: "model", role: "default_worker" } },
    context: {},
    options: { relay: { enabled: true, policy: ROUTING_POLICY.PREFER_RELAY } },
    localExecute: async () => ({ output: { local: true }, meta: {} })
  });

  assert.strictEqual(dispatched, "b");
  assert.strictEqual(result.output.routed, true);
  assert.strictEqual(result.meta.nodeId, "b");
  assert.strictEqual(result.meta.relay, true);
  assert.strictEqual(reg.get("b").dispatchCount, 1);
});

checkAsync("router falls back to local on relay failure and audits", async () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const connector = {
    async executeRemoteStep() {
      const err = new Error("boom");
      err.code = "RELAY_NODE_UNREACHABLE";
      throw err;
    }
  };
  const audit = { records: [], async record(e) { this.records.push(e); } };
  const router = createRelayRouter({ registry: reg, connector, auditLog: audit });

  const result = await router.executeStepWithFallback({
    step: { id: "s1", executor: { type: "model", role: "default_worker" } },
    context: {},
    options: { relay: { enabled: true, policy: ROUTING_POLICY.PREFER_RELAY } },
    meta: { run_id: "run-1" },
    localExecute: async () => ({ output: { local: true }, meta: { role: "default_worker" } })
  });

  assert.strictEqual(result.output.local, true);
  assert.strictEqual(result.meta.relay, undefined);
  assert.ok(audit.records.some((r) => r.error_code === "RELAY_FALLBACK"));
  assert.strictEqual(reg.get("b").healthy, false);
});

checkAsync("router uses local when relay disabled", async () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  let called = false;
  const connector = {
    async executeRemoteStep() { called = true; return { ok: true, output: {}, meta: {} }; }
  };
  const router = createRelayRouter({ registry: reg, connector });

  const result = await router.executeStepWithFallback({
    step: { id: "s1", executor: { type: "model", role: "default_worker" } },
    context: {},
    options: { relay: { enabled: false } },
    localExecute: async () => ({ output: { local: true }, meta: {} })
  });

  assert.strictEqual(called, false);
  assert.strictEqual(result.output.local, true);
});

checkAsync("router executeStepWithAssignedNode routes to assigned node", async () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  let dispatched = null;
  const connector = {
    async executeRemoteStep({ node: targetNode }) {
      dispatched = targetNode.nodeId;
      return { ok: true, output: { routed: true }, meta: { role: "default_worker", model: "mock" } };
    }
  };
  const router = createRelayRouter({ registry: reg, connector });

  const result = await router.executeStepWithAssignedNode({
    step: { id: "s1", executor: { type: "model", role: "default_worker" } },
    context: {},
    options: { relay: { enabled: true } },
    assignedNodeId: "b",
    localExecute: async () => ({ output: { local: true }, meta: {} })
  });

  assert.strictEqual(dispatched, "b");
  assert.strictEqual(result.output.routed, true);
  assert.strictEqual(result.meta.nodeId, "b");
  assert.strictEqual(result.meta.relay, true);
  assert.strictEqual(result.meta.fallback, false);
  assert.strictEqual(reg.get("b").dispatchCount, 1);
});

checkAsync("router executeStepWithAssignedNode falls back locally when assigned node is unhealthy", async () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  reg.markUnhealthy("b");
  let called = false;
  const connector = {
    async executeRemoteStep() { called = true; return { ok: true, output: {}, meta: {} }; }
  };
  const router = createRelayRouter({ registry: reg, connector });

  const result = await router.executeStepWithAssignedNode({
    step: { id: "s1", executor: { type: "model", role: "default_worker" } },
    context: {},
    options: { relay: { enabled: true } },
    assignedNodeId: "b",
    localExecute: async () => ({ output: { local: true }, meta: {} })
  });

  assert.strictEqual(called, false);
  assert.strictEqual(result.output.local, true);
});

checkAsync("router executeStepWithAssignedNode falls back locally and audits on relay failure", async () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "b", baseUrl: "http://b:1", capabilities: ["default_worker"] });
  const connector = {
    async executeRemoteStep() {
      const err = new Error("boom");
      err.code = "RELAY_NODE_UNREACHABLE";
      throw err;
    }
  };
  const audit = { records: [], async record(e) { this.records.push(e); } };
  const router = createRelayRouter({ registry: reg, connector, auditLog: audit });

  const result = await router.executeStepWithAssignedNode({
    step: { id: "s1", executor: { type: "model", role: "default_worker" } },
    context: {},
    options: { relay: { enabled: true } },
    meta: { run_id: "run-1" },
    assignedNodeId: "b",
    localExecute: async () => ({ output: { local: true }, meta: { role: "default_worker" } })
  });

  assert.strictEqual(result.output.local, true);
  assert.strictEqual(result.meta.relay, undefined);
  assert.ok(audit.records.some((r) => r.error_code === "RELAY_FALLBACK"));
  assert.strictEqual(reg.get("b").healthy, false);
});

check("auth getToken returns configured token", () => {
  const auth = createRelayAuth({ token: "secret-123" });
  assert.strictEqual(auth.getToken(), "secret-123");
});

check("auth verifyRequest returns null when token matches", () => {
  const auth = createRelayAuth({ token: "secret-123" });
  const req = { headers: { authorization: "Bearer secret-123" } };
  assert.strictEqual(auth.verifyRequest(req), null);
});

check("auth verifyRequest returns error when header is missing", () => {
  const auth = createRelayAuth({ token: "secret-123" });
  const req = { headers: {} };
  const err = auth.verifyRequest(req);
  assert.ok(err);
  assert.strictEqual(err.code, "RELAY_AUTH_MISSING");
  assert.ok(err.message);
  assert.ok(err.nextStep);
});

check("auth verifyRequest returns error when token is wrong", () => {
  const auth = createRelayAuth({ token: "secret-123" });
  const req = { headers: { authorization: "Bearer wrong-token" } };
  const err = auth.verifyRequest(req);
  assert.ok(err);
  assert.strictEqual(err.code, "RELAY_AUTH_INVALID");
  assert.ok(err.message);
  assert.ok(err.nextStep);
});

check("auth verifyRequest returns error when header format is invalid", () => {
  const auth = createRelayAuth({ token: "secret-123" });
  const req = { headers: { authorization: "Basic abc123" } };
  const err = auth.verifyRequest(req);
  assert.ok(err);
  assert.strictEqual(err.code, "RELAY_AUTH_INVALID");
});

check("auth verifyRequest returns null when no token is configured", () => {
  const auth = createRelayAuth({ token: null });
  const req = { headers: {} };
  assert.strictEqual(auth.verifyRequest(req), null);
});

check("auth authError returns structured error for each code", () => {
  const auth = createRelayAuth({ token: "secret-123" });
  const missing = auth.authError("RELAY_AUTH_MISSING");
  assert.strictEqual(missing.code, "RELAY_AUTH_MISSING");
  assert.ok(missing.message);
  assert.ok(missing.nextStep);

  const invalid = auth.authError("RELAY_AUTH_INVALID");
  assert.strictEqual(invalid.code, "RELAY_AUTH_INVALID");
  assert.ok(invalid.message);
  assert.ok(invalid.nextStep);

  const required = auth.authError("RELAY_AUTH_REQUIRED");
  assert.strictEqual(required.code, "RELAY_AUTH_REQUIRED");
  assert.ok(required.message);
  assert.ok(required.nextStep);
});

Promise.all(asyncChecks).then(() => {
  console.log(`\n${passed}/${passed + failed} relay unit tests passed`);
  process.exit(failed === 0 ? 0 : 1);
}).catch(() => {
  process.exit(1);
});
