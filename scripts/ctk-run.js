#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  PROJECT_ROOT,
  createDefaultCapabilityKernel
} = require("../companion/capability-kernel");

function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const eventPath = path.resolve(
    readArg(args, "--event")
      || path.join(
        PROJECT_ROOT,
        "companion",
        "capabilities",
        "status-handoff",
        "fixtures",
        "project-status-changed.event.json"
      )
  );
  const storeDirArg = readArg(args, "--store-dir");
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const kernel = createDefaultCapabilityKernel({
    ...(storeDirArg ? { storeDir: path.resolve(storeDirArg) } : {})
  });
  const result = await kernel.submitEvent(event, {
    capabilityId: readArg(args, "--capability") || undefined,
    capabilityVersion: readArg(args, "--version") || undefined,
    approvalGranted: args.includes("--approve")
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.state === "completed" || result.state === "ignored" ? 0 : 2;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error.code || "CTK_CLI_FAILED",
    message: error.message
  }, null, 2));
  process.exitCode = 1;
});
