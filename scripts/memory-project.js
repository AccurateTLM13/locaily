#!/usr/bin/env node

const path = require("node:path");
const {
  createDevelopmentProjectRegistry,
  runProjectSetupStep,
  buildProjectHealthReport,
  generateStarterVault
} = require("../companion/memory/projects");

const ROOT = path.resolve(__dirname, "..");

function parseCommonArgs(argv) {
  const parsed = {
    repoRoot: ROOT,
    registryRoot: path.join(ROOT, "data", "memory", "projects"),
    slug: null,
    displayName: null,
    workspaceRoot: ROOT,
    vaultPath: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--slug" && argv[index + 1]) {
      parsed.slug = argv[index + 1];
      index += 1;
    } else if (token === "--display-name" && argv[index + 1]) {
      parsed.displayName = argv[index + 1];
      index += 1;
    } else if (token === "--workspace-root" && argv[index + 1]) {
      parsed.workspaceRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--vault-path" && argv[index + 1]) {
      parsed.vaultPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--registry-root" && argv[index + 1]) {
      parsed.registryRoot = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

function printResult(result) {
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const command = process.argv[2] || "list";
  const args = parseCommonArgs(process.argv.slice(3));
  const registry = createDevelopmentProjectRegistry({
    repoRoot: args.repoRoot,
    registryRoot: args.registryRoot
  });

  if (command === "list") {
    printResult({ ok: true, result: registry.getRegistrySummary(), warnings: [] });
    return;
  }

  if (command === "register") {
    printResult(registry.registerProject({
      slug: args.slug,
      displayName: args.displayName || args.slug,
      workspaceRoot: args.workspaceRoot,
      vaultPath: args.vaultPath,
      setActive: true
    }));
    return;
  }

  if (command === "activate") {
    printResult(registry.setActiveProject(args.slug));
    return;
  }

  if (command === "generate-vault") {
    printResult(runProjectSetupStep(registry, "generate-vault", {
      slug: args.slug,
      vaultPath: args.vaultPath,
      layout: "canonical"
    }));
    return;
  }

  if (command === "health") {
    printResult(await buildProjectHealthReport(registry, args.slug || undefined));
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
