const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { createOllamaRuntime } = require("../companion/runtime/ollama");
const { createToolRegistry } = require("../companion/tools/registry");
const { runTrack } = require("../companion/pit-crew");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { WIKI_ALLOWED_PATHS, DEFAULT_BLOCKED_PATHS } = require("../companion/memory/allowlist-presets");

const DEFAULT_MODEL = "hf.co/mradermacher/VibeThinker-3B-GGUF:Q4_K_M";

async function main() {
  const vaultPath = process.argv[2] || process.env.LOCAL_MEMORY_VAULT_PATH;
  const model = process.argv[3] || process.env.OPERATOR_LOG_MODEL || DEFAULT_MODEL;

  if (!vaultPath) {
    throw new Error("Usage: node scripts/operator-log-evaluation.js <vault-path> [model]");
  }

  const adapter = createVaultAdapter({
    enabled: true,
    vaultPath,
    readPolicy: "allowlist",
    allowedPaths: WIKI_ALLOWED_PATHS,
    blockedPaths: DEFAULT_BLOCKED_PATHS,
    rawAccess: false,
    writebackMode: "proposal_only"
  });
  const status = adapter.getStatus();

  if (!status.readable) {
    throw new Error(`Vault is not readable: ${status.warnings.join(" ")}`);
  }

  const runtime = createOllamaRuntime({ model });
  const toolRegistry = createToolRegistry();
  const options = {
    model,
    timeoutMs: 120000,
    profile_id: "operator-log-evaluation",
    memoryBridge: { adapter },
    getRoleSuitability: () => null,
    resolveModelForRole: (role) => ({ ok: true, role, model })
  };
  const editorialBrief = [
    "Find evidence-backed Lemonteed Operator Log stories across the Second Brain.",
    "Prefer concrete builds, decisions, dead ends, and surprising observations.",
    "Use the Lemonteed zones and BUILD NOTES, CONCEPT LOG, PARKING NOTICE, or FIELD REPORT types.",
    "Do not claim work shipped without evidence. Flag missing facts and duplicate risk."
  ].join(" ");

  const startedAt = Date.now();
  const discovery = await runTrack({
    trackId: "publishing.operator_log_discovery",
    input: {
      editorialBrief,
      maxSignalsPerBatch: 2,
      maxOpportunities: 6,
      batchCharLimit: 12000
    },
    runtime,
    toolRegistry,
    options,
    meta: { requestId: "operator-log-evaluation" }
  });

  let draft = null;
  const selectedIndex = discovery.result.recommendedOpportunity;
  const selected = discovery.result.opportunities && discovery.result.opportunities[selectedIndex];

  if (selected && discovery.schemaValid) {
    draft = await runTrack({
      trackId: "publishing.operator_log_draft",
      input: {
        opportunity: selected,
        publishDate: new Date().toISOString().slice(0, 10)
      },
      runtime,
      toolRegistry,
      options,
      meta: { requestId: "operator-log-evaluation-draft" }
    });
  }

  const finishedAt = new Date().toISOString();
  const artifact = {
    experimental: true,
    model,
    finishedAt,
    durationMs: Date.now() - startedAt,
    vault: {
      eligibleFileCount: status.projectCount + status.topicCount,
      rawAccess: false
    },
    discovery,
    draft
  };
  const outputDir = join(__dirname, "..", "data", "validation");
  mkdirSync(outputDir, { recursive: true });
  const stamp = finishedAt.replace(/[-:.]/g, "").replace("Z", "Z");
  const outputPath = join(outputDir, `operator-log-evaluation_${stamp}.local.json`);
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    model,
    durationMs: artifact.durationMs,
    discoverySchemaValid: discovery.schemaValid,
    opportunityCount: discovery.result.opportunities ? discovery.result.opportunities.length : 0,
    selectedIndex,
    selectedHeadline: selected ? selected.headlineDirection : null,
    draftSchemaValid: draft ? draft.schemaValid : null,
    draftWordCount: draft && draft.result.meta && draft.result.meta.verification
      ? draft.result.meta.verification.proseWordCount
      : null,
    outputPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
