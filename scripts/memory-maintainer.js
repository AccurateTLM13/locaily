#!/usr/bin/env node

const path = require("node:path");
const { createDevelopmentMaintainerManager } = require("../companion/memory/events/maintainer-manager");

const ROOT = path.resolve(__dirname, "..");

function parseCommonArgs(argv) {
  const parsed = {
    project: "locaily",
    candidatesRoot: path.join(ROOT, "data", "memory", "development-candidates"),
    maintainerRoot: path.join(ROOT, "data", "memory", "development-maintainer"),
    runId: null,
    allowApplyLowRisk: false,
    allowApplyHighRisk: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--project" && argv[index + 1]) {
      parsed.project = argv[index + 1];
      index += 1;
    } else if (token === "--candidates-root" && argv[index + 1]) {
      parsed.candidatesRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--maintainer-root" && argv[index + 1]) {
      parsed.maintainerRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--run-id" && argv[index + 1]) {
      parsed.runId = argv[index + 1];
      index += 1;
    } else if (token === "--allow-apply-low-risk") {
      parsed.allowApplyLowRisk = true;
    } else if (token === "--allow-apply-high-risk") {
      parsed.allowApplyHighRisk = true;
    }
  }

  return parsed;
}

function createManager(args) {
  return createDevelopmentMaintainerManager({
    candidatesRoot: args.candidatesRoot,
    maintainerRoot: args.maintainerRoot
  });
}

function printResult(result) {
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const command = process.argv[2];
  const args = parseCommonArgs(process.argv.slice(3));
  const manager = createManager(args);

  if (command === "plan") {
    printResult(manager.planRun({ project: args.project }));
    return;
  }

  if (command === "status") {
    printResult(manager.getStatus({ project: args.project }));
    return;
  }

  if (command === "list") {
    printResult(manager.listRuns({ project: args.project }));
    return;
  }

  if (command === "show") {
    if (!args.runId) {
      console.error("Usage: npm run memory:maintainer:show -- --run-id maint_...");
      process.exit(1);
    }
    printResult(manager.getRun(args.runId));
    return;
  }

  if (command === "apply") {
    if (!args.runId) {
      console.error("Usage: npm run memory:maintainer:apply -- --run-id maint_... [--allow-apply-low-risk]");
      process.exit(1);
    }
    printResult(manager.applyRun({
      runId: args.runId,
      allowApplyLowRisk: args.allowApplyLowRisk,
      allowApplyHighRisk: args.allowApplyHighRisk
    }));
    return;
  }

  console.error(`Usage:
  npm run memory:maintainer:plan -- [--project locaily]
  npm run memory:maintainer:status -- [--project locaily]
  npm run memory:maintainer:list -- [--project locaily]
  npm run memory:maintainer:show -- --run-id maint_...
  npm run memory:maintainer:apply -- --run-id maint_... [--allow-apply-low-risk]`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
