#!/usr/bin/env node

const path = require("node:path");
const {
  createDevelopmentCaptureProcessor,
  createDevelopmentCaptureWorker,
  configureCaptureGate
} = require("../companion/memory/events/capture");

const ROOT = path.resolve(__dirname, "..");

function parseCommonArgs(argv) {
  const parsed = {
    project: "locaily",
    eventsDir: path.join(ROOT, "data", "memory", "development-events"),
    sessionsRoot: path.join(ROOT, "data", "memory", "development-sessions"),
    candidatesRoot: path.join(ROOT, "data", "memory", "development-candidates"),
    maintainerRoot: path.join(ROOT, "data", "memory", "development-maintainer"),
    processorRoot: path.join(ROOT, "data", "memory", "development-capture")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--project" && argv[index + 1]) {
      parsed.project = argv[index + 1];
      index += 1;
    } else if (token === "--events-dir" && argv[index + 1]) {
      parsed.eventsDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--sessions-root" && argv[index + 1]) {
      parsed.sessionsRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--candidates-root" && argv[index + 1]) {
      parsed.candidatesRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--processor-root" && argv[index + 1]) {
      parsed.processorRoot = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

function createProcessor(args) {
  let worker = null;
  const processor = createDevelopmentCaptureProcessor({
    project: args.project,
    eventsDir: args.eventsDir,
    sessionsRoot: args.sessionsRoot,
    candidatesRoot: args.candidatesRoot,
    maintainerRoot: args.maintainerRoot,
    processorRoot: args.processorRoot,
    getWorkerStatus: () => (worker ? worker.getStatus() : null)
  });
  worker = createDevelopmentCaptureWorker({ processor });
  configureCaptureGate({
    project: args.project,
    policyPath: path.join(args.processorRoot, "capture-policy.json"),
    captureEnabled: true
  });
  return processor;
}

function printResult(result) {
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

async function runStatus(args) {
  const processor = createProcessor(args);
  printResult(await processor.getStatus());
}

async function runPause(args) {
  const processor = createProcessor(args);
  printResult(await processor.pauseCapture());
}

async function runResume(args) {
  const processor = createProcessor(args);
  printResult(await processor.resumeCapture());
}

async function runProcess(args) {
  const processor = createProcessor(args);
  printResult(await processor.processOnce());
}

async function main() {
  const command = process.argv[2] || "status";
  const args = parseCommonArgs(process.argv.slice(3));

  if (command === "status") {
    await runStatus(args);
    return;
  }

  if (command === "pause") {
    await runPause(args);
    return;
  }

  if (command === "resume") {
    await runResume(args);
    return;
  }

  if (command === "process") {
    await runProcess(args);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
