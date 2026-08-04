const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { PassThrough } = require("node:stream");
const { createBenchmarkRunStore } = require("../companion/benchmark/run-store");
const { createSuiteCatalog } = require("../companion/benchmark/suite-catalog");
const { createWorkerClient, isWorkerEvent } = require("../companion/benchmark/worker-client");

const DIGEST = "a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72";
let passed = 0;

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "locaily-m3-"));
  let fakeOllama;
  let companion;
  try {
    await testRunStoreRecovery(path.join(tempRoot, "recovery"));
    await testWorkerClientFailures();
    await testStaticContracts();
    fakeOllama = await startFakeOllama();
    const companionPort = await findFreePort();
    const baseUrl = `http://127.0.0.1:${companionPort}`;
    companion = startCompanion({ port: companionPort, ollamaUrl: fakeOllama.url, runDir: path.join(tempRoot, "api-runs") });
    await waitForJson(`${baseUrl}/health`);

    const inventory = await getJson(baseUrl, "/benchmark/models");
    check(inventory.runtime.state === "online", "inventory reports Ollama online");
    check(inventory.models.length === 1, "inventory returns installed models");
    check(inventory.models[0].manifestState === "registered", "inventory joins registered manifest");
    check(inventory.models[0].manifest.digestMatch === true, "inventory verifies exact digest");
    check(inventory.models[0].loadState === "unloaded", "installed is distinct from loaded");

    const suites = await getJson(baseUrl, "/benchmark/suites");
    check(suites.suites.some((suite) => suite.id === "accessibility-deep-v2" && suite.executable), "suite catalog exposes allowlisted v2 suite");

    const rejected = await postJson(baseUrl, "/benchmark/preflight", {
      modelId: "llama3.2:latest", suiteId: "accessibility-deep-v2", mode: "quick", trialCount: 1
    }, 409);
    check(rejected.code === "MODEL_NOT_LOADED", "preflight requires explicit load");

    const missing = await postJson(baseUrl, "/benchmark/preflight", {
      modelId: "missing:latest", suiteId: "accessibility-deep-v2", mode: "quick", trialCount: 1
    }, 404);
    check(missing.code === "MODEL_NOT_INSTALLED", "missing model is rejected truthfully");

    await postJson(baseUrl, `/benchmark/models/${encodeURIComponent("llama3.2:latest")}/load`, { keepAlive: "10m" }, 200);
    const loaded = await getJson(baseUrl, "/benchmark/models");
    check(loaded.models[0].loadState === "loaded", "explicit load updates inventory");

    const preflight = await postJson(baseUrl, "/benchmark/preflight", {
      modelId: "llama3.2:latest", suiteId: "accessibility-deep-v2", mode: "quick", trialCount: 1
    }, 200);
    check(preflight.eligible === true && preflight.model.digestMatch === true, "preflight returns exact eligible identity");

    fakeOllama.setDigest("0".repeat(64));
    const stale = await postJson(baseUrl, "/benchmark/preflight", {
      modelId: "llama3.2:latest", suiteId: "accessibility-deep-v2", mode: "qualification", trialCount: 5
    }, 409);
    check(stale.code === "MODEL_DIGEST_MISMATCH", "qualification preflight rejects stale model provenance");
    fakeOllama.setDigest(DIGEST);

    const request = {
      modelId: "llama3.2:latest",
      suiteId: "accessibility-deep-v2",
      mode: "quick",
      trialCount: 1,
      requestKey: "m3-test-request-0001"
    };
    const started = await postJson(baseUrl, "/benchmark/runs", request, 202);
    const duplicate = await postJson(baseUrl, "/benchmark/runs", request, 200);
    check(duplicate.duplicate === true && duplicate.runId === started.runId, "duplicate submit returns active run");
    const completed = await waitForRun(baseUrl, started.runId, "completed", 15000);
    check(completed.result.metrics.trialCount === 4, "worker returns M2 trial metrics");
    check(completed.result.metrics.scoredUncertainty.method === "wilson", "result includes Wilson uncertainty");
    check(completed.result.provenance.model.runtimeModelDigest === `sha256:${DIGEST}`, "result records exact runtime digest");
    check(completed.result.qualificationGate.eligible === false, "quick run remains screening evidence");
    check(!JSON.stringify(completed).includes("rawText") && !JSON.stringify(completed).includes('"input"'), "API run record excludes raw prompts and responses");

    const events = await getJson(baseUrl, `/benchmark/runs/${started.runId}/events?format=json`);
    check(events.events.some((event) => event.type === "case-completed") && events.events.some((event) => event.type === "trial-completed") && events.events.some((event) => event.type === "completed"), "polling event recovery includes case, trial, and terminal progress");
    const eventStream = await fetch(`${baseUrl}/benchmark/runs/${started.runId}/events`, { headers: { Accept: "text/event-stream" } }).then((response) => response.text());
    check(eventStream.includes("event: completed") && eventStream.includes("id:"), "SSE replays sequenced terminal events");

    fakeOllama.setGenerationDelay(2000);
    const cancelStart = await postJson(baseUrl, "/benchmark/runs", { ...request, requestKey: "m3-test-cancel-0002" }, 202);
    const cancelled = await postJson(baseUrl, `/benchmark/runs/${cancelStart.runId}/cancel`, {}, 200);
    check(cancelled.run.status === "cancelled", "operator cancellation reaches terminal state");

    const shell = await fetch(`${baseUrl}/`).then((response) => response.text());
    const shellJs = await fetch(`${baseUrl}/shell/app.js`).then((response) => response.text());
    const consoleHtml = await fetch(`${baseUrl}/console`).then((response) => response.text());
    check(shell.includes("Benchmark Lab") && shellJs.includes("renderBenchmarks"), "unified shell exposes interactive Benchmark Lab");
    check(consoleHtml.includes("Benchmark Lab diagnostics"), "legacy console exposes diagnostic-only surface");

    await stopChild(companion);
    companion = startCompanion({ port: companionPort, ollamaUrl: fakeOllama.url, runDir: path.join(tempRoot, "api-runs") });
    await waitForJson(`${baseUrl}/health`);
    const recovered = await getJson(baseUrl, `/benchmark/runs/${started.runId}`);
    check(recovered.run.status === "completed", "terminal run history survives server restart");

    await fakeOllama.close();
    fakeOllama = null;
    const offline = await getJson(baseUrl, "/benchmark/models");
    check(offline.runtime.state === "offline" && offline.models.length === 0, "offline Ollama state is truthful and non-fatal");

    console.log(`ok Benchmark Lab M3 (${passed} assertions)`);
  } finally {
    if (companion) await stopChild(companion);
    if (fakeOllama) await fakeOllama.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function testRunStoreRecovery(runDir) {
  const store = createBenchmarkRunStore({ runDir });
  const run = await store.createRun({ requestKey: "recovery-test", model: { runtimeModelName: "test" }, suiteId: "suite", suiteName: "Suite", mode: "quick", trialCount: 1 });
  await writeFile(path.join(runDir, "corrupt.local.json"), "{not-json", "utf8");
  const recoveredStore = createBenchmarkRunStore({ runDir });
  await recoveredStore.initialize();
  const recovered = await recoveredStore.getRun(run.runId);
  check(recovered.status === "failed" && recovered.error.code === "SERVER_RESTART", "non-terminal run fails truthfully on restart");
  check((await recoveredStore.listRuns()).runs.length === 1, "corrupt local run records are skipped without fabricating history");
}

async function testWorkerClientFailures() {
  await exerciseFakeWorker(({ child }) => child.stdout.write("{not-json}\n"), ({ protocolError }) => {
    check(protocolError && protocolError.code === "WORKER_JSON_INVALID", "malformed worker JSONL fails with a structured protocol code");
  });
  await exerciseFakeWorker(({ child }) => process.nextTick(() => child.emit("exit", 17, null)), ({ exit }) => {
    check(exit && exit.code === 17 && exit.terminalEvent === false, "worker crash is reported without a fabricated terminal event");
  });
  await exerciseFakeWorker(() => {}, ({ protocolError }) => {
    check(protocolError && protocolError.code === "WORKER_TIMEOUT", "runaway worker is terminated by the bounded execution timeout");
  }, 20);
}

function exerciseFakeWorker(trigger, verify, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const child = createFakeChild();
    let protocolError = null;
    let exit = null;
    createWorkerClient({ spawnImpl: () => child, timeoutMs }).start({ runId: "bench-test" }, {
      onProtocolError(error) { protocolError = error; },
      onExit(info) {
        exit = info;
        try { verify({ protocolError, exit }); resolve(); } catch (error) { reject(error); }
      }
    });
    trigger({ child });
  });
}

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.killed = false;
  child.kill = () => {
    if (child.killed) return;
    child.killed = true;
    process.nextTick(() => child.emit("exit", null, "SIGTERM"));
  };
  return child;
}

async function testStaticContracts() {
  const suites = await createSuiteCatalog().listSuites();
  check(suites.some((suite) => suite.id === "accessibility-deep-v2" && suite.caseCount === 4), "suite catalog counts cases and strata");
  check(isWorkerEvent({ schemaVersion: "benchmark.worker_event.v1", type: "started", timestamp: new Date().toISOString(), data: {} }), "worker event envelope is versioned");
  const companionFiles = await collectJsFiles(path.resolve(__dirname, "..", "companion"));
  const violations = [];
  for (const file of companionFiles) {
    const source = await readFile(file, "utf8");
    if (/require\([^)]*benchmark-lab[\\/]engine|from\s+["'][^"']*benchmark-lab[\\/]engine/.test(source)) violations.push(file);
  }
  check(violations.length === 0, "companion does not import Benchmark Lab engine modules");
  for (const schema of ["benchmark-model-inventory.schema.json", "benchmark-run-create.schema.json", "benchmark-worker-event.schema.json", "benchmark-lab-run.schema.json"]) {
    JSON.parse(await readFile(path.resolve(__dirname, "..", "companion", "schemas", schema), "utf8"));
  }
  check(true, "M3 companion schemas parse");
}

async function collectJsFiles(root) {
  const { readdir } = require("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

async function startFakeOllama() {
  let loaded = false;
  let generationDelayMs = 150;
  let digest = DIGEST;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    if (request.url === "/api/tags") return json(response, { models: [{ name: "llama3.2:latest", model: "llama3.2:latest", size: 2019393189, digest, modified_at: "2026-01-01T00:00:00Z", details: { family: "llama", families: ["llama"], parameter_size: "3.2B", quantization_level: "Q4_K_M", format: "gguf" } }] });
    if (request.url === "/api/ps") return json(response, { models: loaded ? [{ name: "llama3.2:latest", size: 2019393189, size_vram: 1800000000, digest, expires_at: new Date(Date.now() + 600000).toISOString(), context_length: 4096 }] : [] });
    if (request.url === "/api/show") return json(response, { capabilities: ["completion"], details: { family: "llama", families: ["llama"], parameter_size: "3.2B", quantization_level: "Q4_K_M", format: "gguf" } });
    if (request.url === "/api/version") return json(response, { version: "m3-fixture-1.0.0" });
    if (request.url === "/api/generate") {
      if (!Object.prototype.hasOwnProperty.call(body, "prompt")) {
        loaded = body.keep_alive !== 0;
        return json(response, { response: "", done: true });
      }
      await sleep(generationDelayMs);
      return json(response, { response: JSON.stringify({ label: "extract", summary: "Fixture summary", findings: [] }), done: true, total_duration: generationDelayMs * 1000000 });
    }
    json(response, { error: "not found" }, 404);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    setGenerationDelay(value) { generationDelayMs = value; },
    setDigest(value) { digest = value; },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function startCompanion({ port, ollamaUrl, runDir }) {
  return spawn(process.execPath, ["companion/server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, LOCAL_AI_HOST: "127.0.0.1", LOCAL_AI_PORT: String(port), OLLAMA_BASE_URL: ollamaUrl, BENCHMARK_RUN_DIR: runDir, DEVELOPMENT_MEMORY_CAPTURE: "0" },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForRun(baseUrl, runId, status, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = (await getJson(baseUrl, `/benchmark/runs/${runId}`)).run;
    if (latest.status === status) return latest;
    if (["failed", "cancelled"].includes(latest.status)) throw new Error(`Run ended as ${latest.status}: ${JSON.stringify(latest.error)}`);
    await sleep(100);
  }
  throw new Error(`Run did not reach ${status}: ${JSON.stringify(latest)}`);
}

async function getJson(baseUrl, route) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { Accept: "application/json" } });
  const body = await response.json();
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`);
  return body;
}

async function postJson(baseUrl, route, body, expectedStatus) {
  const response = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const parsed = await response.json();
  assert.equal(response.status, expectedStatus, `${route}: ${JSON.stringify(parsed)}`);
  return parsed;
}

async function waitForJson(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await sleep(100);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function findFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(3000)]);
}

function json(response, body, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`PASS: ${message}`);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
