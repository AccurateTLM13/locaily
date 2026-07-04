const { spawn } = require("node:child_process");

const PORT = 31319;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  const child = spawn(process.execPath, ["companion/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LOCAL_AI_PORT: String(PORT),
      OLLAMA_MODEL: "mock-local-model"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer();
    const health = await getJson("/health");
    const status = await getJson("/benchmark/status");

    assert(health.ok === true, "Expected health ok true.");
    assert(health.benchmark_lab, "Expected benchmark_lab health summary.");
    assert(health.benchmark_lab.statusEndpoint === "/benchmark/status", "Expected benchmark status endpoint hint.");
    assert(status.ok === true, "Expected benchmark status ok true.");
    assert(typeof status.benchmark_lab.records === "number", "Expected qualification record count.");
    assert(typeof status.benchmark_lab.checksums === "number", "Expected checksum count.");
    assert(status.benchmark_lab.byStatus && typeof status.benchmark_lab.byStatus === "object", "Expected byStatus object.");

    console.log("ok benchmark status smoke");
  } finally {
    child.kill();
  }

  child.on("exit", () => {});

  if (output.includes("EADDRINUSE")) {
    throw new Error(`Port ${PORT} was already in use.`);
  }
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await getJson("/health");
      return;
    } catch (error) {
      lastError = error;
      await sleep(200);
    }
  }

  throw lastError || new Error("Server did not start.");
}

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
