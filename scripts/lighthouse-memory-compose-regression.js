const path = require("node:path");
const { createVaultAdapter, isAllowedPath } = require("../companion/memory/vault-adapter");
const { lighthouseHandoffTool } = require("../companion/tools/lighthouse-handoff");
const { auditPayloadContainsPrivateMemory, redactMemoryResultForAudit } = require("../companion/memory/audit-redaction");
const { buildAuditEvent, normalizeAuditEvent } = require("../companion/core/audit-log");

const TEMPLATE_VAULT_PATH = path.join(__dirname, "..", "templates", "memory-vault");

const METRICS = {
  performance: 76,
  accessibility: 100,
  bestPractices: 100,
  seo: 100
};

const URL = "https://lemonteed.com/";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildComposeInput() {
  return {
    url: URL,
    metrics: METRICS,
    prioritizedFixes: {
      priorityFixes: [
        {
          title: "Improve image delivery",
          priority: "high",
          reason: "Lowest Lighthouse category is performance at 76."
        }
      ],
      thinking: "L2 memory compose regression fixture."
    },
    matchedFixes: {
      fixes: [
        {
          steps: [
            "Audit render-blocking resources and defer non-critical scripts.",
            "Audit render-blocking resources and defer non-critical scripts.",
            "Optimize images and enable modern formats where possible."
          ]
        }
      ]
    }
  };
}

function assertAllowlistedFiles(filesUsed, allowedPaths) {
  assert(Array.isArray(filesUsed) && filesUsed.length > 0, "Expected non-empty filesUsed.");

  for (const filePath of filesUsed) {
    assert(
      isAllowedPath(filePath, allowedPaths),
      `filesUsed path '${filePath}' is not allowlisted.`
    );
    assert(!filePath.includes("raw/"), "raw/ must not appear in filesUsed.");
    assert(!/[A-Za-z]:\\/.test(filePath), "filesUsed must not contain absolute Windows paths.");
    assert(!filePath.includes("second-brain"), "filesUsed must not contain vault directory names.");
  }
}

function assertNoVaultPathLeaks(result, auditEvent) {
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("vaultPath"), "Result JSON must not include vaultPath.");
  assert(!result.markdown.includes("vaultPath"), "Markdown must not include vaultPath.");
  assert(!/[A-Za-z]:\\Users\\/.test(result.markdown), "Markdown must not include absolute user paths.");

  const auditSerialized = JSON.stringify(auditEvent);
  assert(!auditSerialized.includes("vaultPath"), "Audit payload must not include vaultPath.");
  assert(!auditPayloadContainsPrivateMemory(auditEvent), "Audit must not contain private memory content.");
}

async function main() {
  const adapter = createVaultAdapter({
    enabled: true,
    vaultPath: TEMPLATE_VAULT_PATH
  });
  const { effectiveAllowedPaths } = adapter.getEffectiveConfig();

  const result = await lighthouseHandoffTool.handle({
    task: "compose-handoff",
    input: buildComposeInput(),
    runtime: null,
    options: {
      memory: {
        enabled: "auto",
        project: "Lighthouse Handoff",
        task: "Generate coding-agent handoff from PageSpeed report",
        maxFiles: 6,
        writeback: false
      },
      memoryBridge: { adapter }
    }
  });

  assert(result.memory.used === true, "memory.used must be true when memory is enabled.");
  assertAllowlistedFiles(result.memory.filesUsed, effectiveAllowedPaths);
  assert(
    result.clientSummary.includes("76"),
    "clientSummary must preserve source performance score (76)."
  );
  assert(
    result.clientSummary.includes("performance"),
    "clientSummary must reference performance as weakest category."
  );
  assert(
    result.markdown.includes("## Project Context Used"),
    "Markdown must include Project Context Used section."
  );

  const uniqueChecklist = new Set(result.handoffChecklist);
  assert(
    uniqueChecklist.size === result.handoffChecklist.length,
    "handoffChecklist must not contain duplicate steps."
  );

  const redacted = redactMemoryResultForAudit(result, "lighthouse-handoff/compose-handoff");
  const auditEvent = normalizeAuditEvent(buildAuditEvent({
    identity: { run_id: "run_regression", trace_id: "trace_regression", requestId: "req_regression" },
    responseBody: {
      ok: true,
      tool: "lighthouse-handoff",
      task: "compose-handoff",
      result: redacted
    },
    statusCode: 200,
    startedAt: Date.now()
  }));

  assertNoVaultPathLeaks(result, auditEvent);

  console.log("Lighthouse memory compose regression passed.");
  console.log(`  memory.used: ${result.memory.used}`);
  console.log(`  filesUsed: ${result.memory.filesUsed.join(", ")}`);
  console.log(`  clientSummary: ${result.clientSummary}`);
}

main().catch((error) => {
  console.error("Lighthouse memory compose regression failed.");
  console.error(error.message);
  process.exitCode = 1;
});
