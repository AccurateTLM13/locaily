const { spawn } = require("node:child_process");
const path = require("node:path");

const DEFAULT_WORKER = path.resolve(__dirname, "..", "..", "benchmark-lab", "engine", "interactive-worker.js");
const MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function createWorkerClient(options = {}) {
  const workerPath = options.workerPath || DEFAULT_WORKER;
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  function start(request, handlers = {}) {
    const child = spawnImpl(process.execPath, [workerPath], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: { ...process.env },
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let terminalEvent = false;
    const timeout = setTimeout(() => {
      handlers.onProtocolError?.(protocolError("WORKER_TIMEOUT", `Benchmark worker exceeded its ${timeoutMs}ms execution limit.`));
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > MAX_LINE_BYTES) {
        handlers.onProtocolError?.(protocolError("WORKER_OUTPUT_TOO_LARGE", "Worker emitted an oversized event."));
        child.kill();
        return;
      }
      let newline;
      while ((newline = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (!isWorkerEvent(event)) throw protocolError("WORKER_EVENT_INVALID", "Worker emitted an invalid event envelope.");
          if (event.type === "completed" || event.type === "failed") terminalEvent = true;
          handlers.onEvent?.(event);
        } catch (error) {
          handlers.onProtocolError?.(error.code ? error : protocolError("WORKER_JSON_INVALID", "Worker emitted malformed JSONL."));
          child.kill();
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.on("error", (error) => handlers.onError?.(error));
    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      handlers.onExit?.({ code, signal, terminalEvent, stderr });
    });
    child.stdin.end(`${JSON.stringify({ schemaVersion: "benchmark.worker_request.v1", ...request })}\n`);

    return {
      cancel() {
        if (!child.killed) child.kill();
      },
      process: child
    };
  }

  return { start };
}

function isWorkerEvent(event) {
  return event && event.schemaVersion === "benchmark.worker_event.v1"
    && typeof event.type === "string" && typeof event.timestamp === "string"
    && event.data && typeof event.data === "object";
}

function protocolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = { createWorkerClient, isWorkerEvent };
