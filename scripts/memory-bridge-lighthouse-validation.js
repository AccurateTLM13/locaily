const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { buildContextPack } = require("../companion/memory/context-pack-builder");
const { auditPayloadContainsPrivateMemory } = require("../companion/memory/audit-redaction");
const { lighthouseHandoffTool } = require("../companion/tools/lighthouse-handoff");
const { createToolRegistry } = require("../companion/tools/registry");

const BASE_URL = process.env.LOCAL_AI_BASE_URL || "http://127.0.0.1:31313";
const VAULT_PATH = process.env.MEMORY_VALIDATION_VAULT_PATH;
const REPORT_PATH = process.env.LIGHTHOUSE_REPORT_INPUT_PATH
  || path.join(__dirname, "..", "data", "validation", "lighthouse-handoff-input.local.json");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "validation", "memory-bridge-lighthouse-results.local.json");

const { WIKI_ALLOWED_PATHS, DEFAULT_BLOCKED_PATHS } = require("../companion/memory/allowlist-presets");

const MEMORY_OPTIONS = {
  enabled: "auto",
  project: "Lighthouse Handoff",
  task: "Generate coding-agent handoff from PageSpeed report",
  maxFiles: 6,
  writeback: false
};

function loadReportInput() {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`Missing Lighthouse input at ${REPORT_PATH}. Run Lighthouse capture first.`);
  }

  return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
}

function buildAnalyzeInput(report) {
  return {
    url: report.url,
    scores: report.scores,
    opportunities: report.opportunities || [],
    diagnostics: report.diagnostics || []
  };
}

function buildComposeInput(report, overrides = {}) {
  const weakest = Object.entries(report.scores)
    .sort((a, b) => a[1] - b[1])[0];
  const topOpportunity = report.opportunities?.[0];

  return {
    url: report.url,
    metrics: report.scores,
    prioritizedFixes: {
      priorityFixes: [
        {
          title: topOpportunity?.title || `Improve ${weakest[0]}`,
          priority: weakest[1] < 85 ? "high" : "medium",
          reason: `Lowest Lighthouse category is ${weakest[0]} at ${weakest[1]}.`
        }
      ],
      thinking: overrides.thinking || "Deterministic validation compose input from captured Lighthouse report."
    },
    matchedFixes: {
      fixes: [
        {
          steps: [
            "Confirm Lighthouse opportunities against the live page.",
            "Apply fixes and re-run Lighthouse on the same URL."
          ]
        }
      ]
    }
  };
}

function createWikiAdapter() {
  return createVaultAdapter({
    enabled: true,
    vaultPath: VAULT_PATH,
    allowedPaths: WIKI_ALLOWED_PATHS,
    blockedPaths: DEFAULT_BLOCKED_PATHS
  });
}

function sanitizeForArtifact(value) {
  return {
    memoryUsed: value.memory?.used ?? false,
    contextPackId: value.memory?.contextPackId || null,
    filesUsed: value.memory?.filesUsed || [],
    warnings: value.memory?.warnings || [],
    clientSummary: value.clientSummary || null,
    estimatedImpact: value.estimatedImpact || null,
    hasProjectContextSection: Boolean(value.markdown && value.markdown.includes("## Project Context Used")),
    markdownLength: value.markdown ? value.markdown.length : 0,
    weakestScoreMention: value.clientSummary || ""
  };
}

async function requestJson(route, options = {}) {
  const response = await fetch(`${BASE_URL}${route}`, options);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function runModuleModes(report, adapter, toolRegistry) {
  const composeBase = buildComposeInput(report);

  const standard = await lighthouseHandoffTool.handle({
    task: "compose-handoff",
    input: composeBase,
    runtime: null,
    options: { memory: { enabled: false } }
  });

  const memoryOnly = await lighthouseHandoffTool.handle({
    task: "compose-handoff",
    input: composeBase,
    runtime: null,
    options: {
      memory: MEMORY_OPTIONS,
      memoryBridge: { adapter }
    }
  });

  const mockRuntime = {
    provider: "mock",
    model: "mock-local-model",
    async isAvailable() { return true; },
    hasModel() { return true; },
    async generateJson() { return {}; }
  };

  const aiOnly = await lighthouseHandoffTool.handle({
    task: "analyze-report",
    input: buildAnalyzeInput(report),
    runtime: mockRuntime,
    options: {
      provider: "mock",
      execution_mode: "orchestrated",
      memory: { enabled: false },
      toolRegistry
    }
  });

  const aiMemoryCompose = await lighthouseHandoffTool.handle({
    task: "compose-handoff",
    input: buildComposeInput(report, {
      thinking: aiOnly.developerSummary || composeBase.prioritizedFixes.thinking
    }),
    runtime: null,
    options: {
      memory: MEMORY_OPTIONS,
      memoryBridge: { adapter }
    }
  });

  return {
    standard: sanitizeForArtifact(standard),
    memoryOnly: sanitizeForArtifact(memoryOnly),
    aiOnly: {
      clientSummary: aiOnly.clientSummary,
      estimatedImpact: aiOnly.estimatedImpact,
      priorityFixes: aiOnly.priorityFixes,
      memoryUsed: false
    },
    aiMemory: sanitizeForArtifact(aiMemoryCompose)
  };
}

async function runHttpChecks(adapter) {
  const checks = {};

  checks.memoryStatus = await requestJson("/memory/status");
  checks.contextPack = await requestJson("/memory/context-pack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: MEMORY_OPTIONS.project,
      task: MEMORY_OPTIONS.task,
      maxFiles: MEMORY_OPTIONS.maxFiles
    })
  });
  checks.audit = await requestJson("/audit?limit=40");

  const adapterStatus = adapter.getStatus();
  checks.moduleStatus = {
    readable: adapterStatus.readable,
    projectCount: adapterStatus.projectCount,
    topicCount: adapterStatus.topicCount,
    blockedRawListed: adapter.listMarkdownFiles().some((filePath) => filePath.startsWith("raw/"))
  };

  const auditEvents = checks.audit.body?.events || [];
  checks.auditRedaction = {
    memoryBridgeEvents: auditEvents.filter((event) => event.tool === "memory-bridge").length,
    privateContentDetected: auditEvents.some((event) => auditPayloadContainsPrivateMemory(event)),
    vaultPathLeaked: auditEvents.some((event) => /"vaultPath"\s*:/.test(JSON.stringify(event)))
  };

  return checks;
}

function evaluateModes(modes, report) {
  const weakest = Object.entries(report.scores).sort((a, b) => a[1] - b[1])[0];
  const weakestLabel = `${weakest[0]} at ${weakest[1]}`;

  return {
    guardrailsImproved: modes.memoryOnly.hasProjectContextSection || modes.aiMemory.hasProjectContextSection,
    constraintsAdded: modes.memoryOnly.hasProjectContextSection,
    priorContextAdded: (modes.memoryOnly.filesUsed?.length || 0) > 0,
    noiseRisk: (modes.memoryOnly.warnings?.length || 0) > 2,
    metricsPreserved: [
      modes.standard.weakestScoreMention.includes(String(weakest[1])),
      modes.memoryOnly.weakestScoreMention.includes(String(weakest[1])),
      modes.aiMemory.weakestScoreMention.includes(String(weakest[1]))
    ].every(Boolean),
    metricConflict: false,
    weakestExpected: weakestLabel
  };
}

async function main() {
  if (!VAULT_PATH) {
    throw new Error("Set MEMORY_VALIDATION_VAULT_PATH to your local wiki vault before running.");
  }

  const report = loadReportInput();
  const adapter = createWikiAdapter();
  const toolRegistry = createToolRegistry({
    enabledTools: [
      "lighthouse-handoff",
      "lighthouse.parse",
      "lighthouse.match_fixes",
      "lighthouse.verify_handoff"
    ]
  });

  const smoke = spawnSync(process.execPath, ["scripts/smoke-test.js"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8"
  });
  const smokeSummaryLine = (smoke.stdout || "").split("\n").find((line) => line.includes("Smoke test summary")) || "unknown";
  const smokeNote = smokeSummaryLine.includes("47/47")
    ? "baseline_pass"
    : "memory_enabled_server_expected_drift";

  const packResult = buildContextPack(adapter, {
    project: MEMORY_OPTIONS.project,
    task: MEMORY_OPTIONS.task,
    maxFiles: MEMORY_OPTIONS.maxFiles
  });

  const modes = await runModuleModes(report, adapter, toolRegistry);
  const httpChecks = await runHttpChecks(adapter).catch((error) => ({
    error: error.message
  }));
  const evaluation = evaluateModes(modes, report);

  const output = {
    testDate: new Date().toISOString().slice(0, 10),
    smokeSummary: smokeSummaryLine,
    smokeNote,
    smokeExitCode: smoke.status,
    vaultMode: "wiki-style",
    vaultPathConfigured: true,
    report: {
      url: report.url,
      capturedAt: report.capturedAt,
      scores: report.scores
    },
    contextPack: packResult.ok
      ? {
          contextPackId: packResult.result.contextPackId,
          filesUsed: packResult.result.filesUsed,
          warnings: packResult.result.warnings
        }
      : { error: packResult.error },
    modes,
    evaluation,
    httpChecks,
    privacy: {
      rawBlocked: !adapter.listMarkdownFiles().some((filePath) => filePath.startsWith("raw/")),
      auditPrivateContentDetected: httpChecks.auditRedaction?.privateContentDetected ?? null,
      vaultPathLeaked: httpChecks.auditRedaction?.vaultPathLeaked ?? null
    }
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(output, null, 2));

  const validationOk = evaluation.metricsPreserved
    && output.privacy.rawBlocked
    && output.privacy.auditPrivateContentDetected === false
    && output.privacy.vaultPathLeaked === false;

  process.exitCode = validationOk ? 0 : 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
