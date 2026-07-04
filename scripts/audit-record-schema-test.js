const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readFile, rm } = require("node:fs/promises");
const {
  appendAuditRecord,
  buildAuditEvent,
  createAuditLog,
  normalizeAuditEvent,
  validateAuditRecord
} = require("../companion/core/audit-log");
const { buildOrchestrationLogEvent } = require("../companion/orchestration/run-logger");
const { buildMemoryAuditEvent } = require("../companion/memory/audit-redaction");
const { validateResult } = require("../companion/core/result-validator");

const runLogAuditRecordSchema = require("../companion/schemas/internal/run-log-audit-record.schema.json");

function assertSchemaValid(label, value) {
  const validation = validateResult(value, runLogAuditRecordSchema, label);
  assert(validation.ok, `${label} failed schema validation: ${validation.errors.join("; ")}`);
}

function buildToolRunCandidate() {
  return buildAuditEvent({
    identity: { run_id: "audit-contract-run", trace_id: "audit-contract-trace" },
    contextPacket: {
      source: {
        app_id: "audit-contract-test",
        surface: "unit",
        user_action: "record",
        client_version: "0.1.0"
      },
      task: {
        tool: "lighthouse-handoff",
        goal: "analyze-report",
        model_role: "default_worker"
      },
      input: {
        type: "json",
        content: { url: "https://example.com", secret: "do-not-log-raw" },
        attachments: []
      }
    },
    tool: {
      id: "lighthouse-handoff",
      permissions: ["model.run"]
    },
    provider: "mock",
    model: "mock-model",
    responseBody: {
      ok: true,
      run_id: "audit-contract-run",
      trace_id: "audit-contract-trace",
      tool: "lighthouse-handoff",
      task: "analyze-report",
      provider: "mock",
      model: "mock-model",
      result: {
        clientSummary: "ok",
        handoffChecklist: []
      },
      meta: {
        duration_ms: 5
      }
    },
    statusCode: 200,
    startedAt: Date.now() - 5
  });
}

function buildOrchestrationCandidate() {
  return buildOrchestrationLogEvent({
    identity: { run_id: "audit-contract-orch", trace_id: "audit-contract-orch-trace" },
    plan: {
      workflow_id: "lighthouse_handoff",
      task_id: "website_audit.lighthouse_handoff",
      track_id: "website_audit.lighthouse_handoff",
      plan_id: "plan-audit-contract",
      status: "completed",
      steps: [
        {
          step_id: "extract_metrics",
          track_id: "website_audit.lighthouse_handoff",
          status: "completed",
          worker_used: {
            type: "tool",
            tool: "lighthouse.parse",
            task: "run"
          },
          duration_ms: 12,
          error: null
        }
      ]
    },
    provider: "mock",
    model: "mock-model",
    status: "completed",
    durationMs: 42
  });
}

function buildMemoryCandidate() {
  return buildMemoryAuditEvent({
    identity: { run_id: "audit-contract-memory", trace_id: "audit-contract-memory-trace" },
    startedAt: Date.now() - 3,
    endpoint: "memory/context-pack",
    requestBody: {
      project: "demo",
      task: "handoff",
      maxFiles: 2
    },
    responseBody: {
      ok: true,
      result: {
        contextPackId: "pack-1",
        project: "demo",
        task: "handoff",
        filesUsed: ["notes.md"],
        warnings: []
      }
    },
    statusCode: 200
  });
}

function checkProducerSnapshots() {
  const candidates = [
    ["tool-run", buildToolRunCandidate()],
    ["orchestration", buildOrchestrationCandidate()],
    ["memory-bridge", buildMemoryCandidate()],
    ["tool-run-failure", buildAuditEvent({
      identity: { run_id: "audit-contract-failure" },
      responseBody: {
        ok: false,
        tool: "deal-sniper",
        error: { code: "MODEL_UNAVAILABLE" }
      },
      statusCode: 503,
      startedAt: Date.now()
    })]
  ];

  for (const [label, candidate] of candidates) {
    const normalized = normalizeAuditEvent(candidate);
    assertSchemaValid(`producer:${label}`, normalized);
    validateAuditRecord(normalized);
  }
}

async function checkAppendValidJsonlLine() {
  const filePath = path.join(os.tmpdir(), `audit-record-contract-${Date.now()}.jsonl`);
  const candidate = buildToolRunCandidate();

  try {
    const written = await appendAuditRecord(filePath, candidate);
    const raw = await readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim());

    assert.equal(lines.length, 1, "Expected one JSONL line to be written.");
    const parsed = JSON.parse(lines[0]);
    assert.deepEqual(parsed, written, "Written JSONL line must match returned audit event.");
    assertSchemaValid("jsonl-line", parsed);
    assert(!raw.includes("do-not-log-raw"), "Audit JSONL must not contain raw input content.");
  } finally {
    await rm(filePath, { force: true });
  }
}

async function checkInvalidRecordRejected() {
  const filePath = path.join(os.tmpdir(), `audit-record-invalid-${Date.now()}.jsonl`);
  const invalidCandidate = {
    tool: "workflow-orchestrator",
    task: "lighthouse_handoff",
    status: "success",
    input_summary: {
      task_id: "website_audit.lighthouse_handoff"
    },
    output_summary: {
      final_status: "completed"
    }
  };

  try {
    assert.throws(
      () => validateAuditRecord(normalizeAuditEvent(invalidCandidate)),
      (error) => error.code === "AUDIT_RECORD_INVALID"
        && error.eventType === "workflow-orchestrator"
        && error.validation
        && error.validation.ok === false
        && Array.isArray(error.validation.errors)
        && error.validation.errors.length > 0,
      "Expected invalid audit metadata to throw AUDIT_RECORD_INVALID."
    );

    await assert.rejects(
      () => appendAuditRecord(filePath, invalidCandidate),
      (error) => error.code === "AUDIT_RECORD_INVALID",
      "Expected appendAuditRecord to reject invalid metadata."
    );

    assert.equal(fs.existsSync(filePath), false, "Invalid audit record must not create JSONL file.");
  } finally {
    await rm(filePath, { force: true });
  }
}

async function checkWriteFailureDistinctFromSchemaFailure() {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), "audit-record-write-fail-"));
  const candidate = buildToolRunCandidate();

  try {
    await assert.rejects(
      () => appendAuditRecord(dirPath, candidate),
      (error) => error.code === "AUDIT_RECORD_WRITE_FAILED"
        && error.code !== "AUDIT_RECORD_INVALID",
      "Expected filesystem write failure to throw AUDIT_RECORD_WRITE_FAILED."
    );
  } finally {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function checkReadCompatibilityAndLegacyLines() {
  const filePath = path.join(os.tmpdir(), `audit-record-read-${Date.now()}.jsonl`);
  const legacyLine = JSON.stringify({
    event_id: "audit_legacy_example",
    timestamp: "2020-01-01T00:00:00.000Z",
    status: "success",
    tool: "legacy-tool",
    unexpected_legacy_field: true
  });

  fs.writeFileSync(filePath, `${legacyLine}\n`, "utf8");

  const auditLog = createAuditLog({ filePath });
  await appendAuditRecord(filePath, buildToolRunCandidate());

  const events = await auditLog.list({ limit: 10 });
  assert(events.length >= 2, "Expected read path to retain prior lines and new valid records.");
  assert(events.some((event) => event.event_id === "audit_legacy_example"), "Expected legacy audit line to remain readable.");
  assert(events.some((event) => event.tool === "lighthouse-handoff"), "Expected newly written audit line to be readable.");

  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const newlyWrittenLine = lines[lines.length - 1];
  assertSchemaValid("new-jsonl-line", JSON.parse(newlyWrittenLine));

  await rm(filePath, { force: true });
}

async function main() {
  checkProducerSnapshots();
  await checkAppendValidJsonlLine();
  await checkInvalidRecordRejected();
  await checkWriteFailureDistinctFromSchemaFailure();
  await checkReadCompatibilityAndLegacyLines();
  console.log("Audit record schema contract tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
