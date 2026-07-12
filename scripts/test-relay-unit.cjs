const assert = require("node:assert");
const { createRelayRegistry } = require("../companion/relay/registry");
const { createRelayRouter, ROUTING_POLICY, minimizeContext } = require("../companion/relay/router");
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

check("registry rejects duplicate nodeId without overwrite", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "dup", baseUrl: "http://dup:1" });
  let caught;
  try { reg.register({ nodeId: "dup", baseUrl: "http://dup:2" }); } catch (e) { caught = e; }
  assert.ok(caught, "expected throw for duplicate nodeId");
  assert.strictEqual(caught.code, "RELAY_NODE_DUPLICATE");
});

check("registry allows duplicate nodeId with overwrite: true", () => {
  const reg = createRelayRegistry();
  reg.register({ nodeId: "dup", baseUrl: "http://dup:1", label: "first" });
  const updated = reg.register({ nodeId: "dup", baseUrl: "http://dup:2", label: "second", overwrite: true });
  assert.strictEqual(updated.baseUrl, "http://dup:2");
  assert.strictEqual(updated.label, "second");
  assert.strictEqual(reg.list().length, 1);
});

check("registry rejects unsupported protocolVersion", () => {
  const reg = createRelayRegistry();
  let caught;
  try { reg.register({ nodeId: "pv", baseUrl: "http://pv:1", protocolVersion: "0.9" }); } catch (e) { caught = e; }
  assert.ok(caught, "expected throw for unsupported protocolVersion");
  assert.strictEqual(caught.code, "RELAY_PROTOCOL_VERSION_UNSUPPORTED");
});

check("registry accepts protocolVersion 1.0", () => {
  const reg = createRelayRegistry();
  const node = reg.register({ nodeId: "pv1", baseUrl: "http://pv1:1", protocolVersion: "1.0" });
  assert.strictEqual(node.nodeId, "pv1");
});

check("registry accepts missing protocolVersion (backward compat)", () => {
  const reg = createRelayRegistry();
  const node = reg.register({ nodeId: "pvm", baseUrl: "http://pvm:1" });
  assert.strictEqual(node.nodeId, "pvm");
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

check("registry accepts allowed capability when allowlist is configured", () => {
  const reg = createRelayRegistry({ allowedCapabilities: new Set(["developer_task_writer", "default_worker"]) });
  const node = reg.register({ nodeId: "a1", baseUrl: "http://a1:1", capabilities: ["developer_task_writer"] });
  assert.strictEqual(node.nodeId, "a1");
});

check("registry rejects unauthorized capability with RELAY_CAPABILITY_UNAUTHORIZED", () => {
  const reg = createRelayRegistry({ allowedCapabilities: new Set(["developer_task_writer", "default_worker"]) });
  let caught;
  try { reg.register({ nodeId: "a2", baseUrl: "http://a2:1", capabilities: ["unknown_tool"] }); } catch (e) { caught = e; }
  assert.ok(caught, "expected throw for unauthorized capability");
  assert.strictEqual(caught.code, "RELAY_CAPABILITY_UNAUTHORIZED");
  assert.ok(caught.message.includes("unknown_tool"), "error message should name the denied capability");
});

check("registry rejects mixed capabilities naming the denied ones", () => {
  const reg = createRelayRegistry({ allowedCapabilities: new Set(["developer_task_writer"]) });
  let caught;
  try {
    reg.register({ nodeId: "a3", baseUrl: "http://a3:1", capabilities: ["developer_task_writer", "evil_cap", "another_bad"] });
  } catch (e) { caught = e; }
  assert.ok(caught, "expected throw for mixed capabilities");
  assert.strictEqual(caught.code, "RELAY_CAPABILITY_UNAUTHORIZED");
  assert.ok(caught.message.includes("evil_cap"), "error message should name evil_cap");
  assert.ok(caught.message.includes("another_bad"), "error message should name another_bad");
});

check("registry normalizes role: prefix before allowlist check", () => {
  const reg = createRelayRegistry({ allowedCapabilities: new Set(["developer_task_writer"]) });
  const node = reg.register({ nodeId: "a4", baseUrl: "http://a4:1", capabilities: ["role:developer_task_writer"] });
  assert.strictEqual(node.nodeId, "a4");
});

check("registry accepts any capability when no allowlist is configured (backward compat)", () => {
  const reg = createRelayRegistry();
  const node = reg.register({ nodeId: "a5", baseUrl: "http://a5:1", capabilities: ["anything_goes", "whatever"] });
  assert.strictEqual(node.nodeId, "a5");
});

check("registry accepts allowed host when allowlist is configured", () => {
  const reg = createRelayRegistry({ allowedHosts: new Set(["127.0.0.1", "localhost"]) });
  const node = reg.register({ nodeId: "h1", baseUrl: "http://127.0.0.1:31314", capabilities: ["default_worker"] });
  assert.strictEqual(node.nodeId, "h1");
});

check("registry rejects denied host with RELAY_HOST_NOT_ALLOWED", () => {
  const reg = createRelayRegistry({ allowedHosts: new Set(["127.0.0.1"]) });
  let caught;
  try { reg.register({ nodeId: "h2", baseUrl: "http://192.168.1.100:31314", capabilities: ["default_worker"] }); } catch (e) { caught = e; }
  assert.ok(caught, "expected throw for denied host");
  assert.strictEqual(caught.code, "RELAY_HOST_NOT_ALLOWED");
  assert.ok(caught.message.includes("192.168.1.100"), "error message should name the denied hostname");
});

check("registry accepts localhost variants when both are in allowlist", () => {
  const reg = createRelayRegistry({ allowedHosts: new Set(["127.0.0.1", "localhost"]) });
  const nodeA = reg.register({ nodeId: "h3a", baseUrl: "http://127.0.0.1:31314", capabilities: ["default_worker"] });
  assert.strictEqual(nodeA.nodeId, "h3a");
  const nodeB = reg.register({ nodeId: "h3b", baseUrl: "http://localhost:31314", capabilities: ["default_worker"] });
  assert.strictEqual(nodeB.nodeId, "h3b");
});

check("registry accepts any host when no allowlist is configured (backward compat)", () => {
  const reg = createRelayRegistry();
  const node = reg.register({ nodeId: "h4", baseUrl: "http://10.0.0.5:31314", capabilities: ["default_worker"] });
  assert.strictEqual(node.nodeId, "h4");
});

check("router minimizeContext: returns full context unchanged when step has no input_map", () => {
  const step = { id: "s1", executor: { type: "model" } };
  const context = { input: { url: "http://example.com" }, artifacts: { step_a: { data: 1 }, step_b: { data: 2 } } };
  const result = minimizeContext(step, context);
  assert.strictEqual(result, context);
});

check("router minimizeContext: returns { input, artifacts: {} } when input_map references only $input", () => {
  const step = { id: "s1", executor: { type: "model" }, input_map: { url: "$input.url" } };
  const context = { input: { url: "http://example.com" }, artifacts: { step_a: { data: 1 } } };
  const result = minimizeContext(step, context);
  assert.deepStrictEqual(result.input, { url: "http://example.com" });
  assert.deepStrictEqual(result.artifacts, {});
});

check("router minimizeContext: filters artifacts to only referenced step_ids", () => {
  const step = {
    id: "s1",
    executor: { type: "model" },
    input_map: {
      field_a: "$artifacts.step_a.field",
      field_b: "$artifacts.step_b"
    }
  };
  const context = {
    input: { url: "http://example.com" },
    artifacts: {
      step_a: { field: "value_a" },
      step_b: { data: "value_b" },
      step_c: { data: "value_c" }
    }
  };
  const result = minimizeContext(step, context);
  assert.deepStrictEqual(result.input, { url: "http://example.com" });
  assert.deepStrictEqual(result.artifacts, {
    step_a: { field: "value_a" },
    step_b: { data: "value_b" }
  });
  assert.strictEqual("step_c" in result.artifacts, false);
});

check("router minimizeContext: does not mutate the original context object", () => {
  const step = {
    id: "s1",
    executor: { type: "model" },
    input_map: { url: "$input.url", scores: "$artifacts.parse_lighthouse.scores" }
  };
  const context = {
    input: { url: "http://example.com" },
    artifacts: {
      parse_lighthouse: { scores: { perf: 90 } },
      check_page: { status: 200 },
      write_handoff: { notes: "done" }
    }
  };
  const originalArtifactsKeys = Object.keys(context.artifacts).sort();
  const result = minimizeContext(step, context);
  const afterArtifactsKeys = Object.keys(context.artifacts).sort();
  assert.deepStrictEqual(afterArtifactsKeys, originalArtifactsKeys);
  assert.strictEqual(context.artifacts.parse_lighthouse.scores.perf, 90);
  assert.strictEqual(context.artifacts.check_page.status, 200);
  assert.strictEqual(context.artifacts.write_handoff.notes, "done");
});

check("router minimizeContext: returns empty { input: {}, artifacts: {} } when context is null/undefined", () => {
  const step = { id: "s1", executor: { type: "model" }, input_map: { url: "$input.url" } };
  const resultNull = minimizeContext(step, null);
  assert.deepStrictEqual(resultNull, { input: {}, artifacts: {} });
  const resultUndefined = minimizeContext(step, undefined);
  assert.deepStrictEqual(resultUndefined, { input: {}, artifacts: {} });
});

Promise.all(asyncChecks).then(() => {
  console.log(`\n${passed}/${passed + failed} relay unit tests passed`);
  process.exit(failed === 0 ? 0 : 1);
}).catch(() => {
  process.exit(1);
});
