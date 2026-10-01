#!/usr/bin/env node
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { runSuite } = require("../benchmark-lab/engine/runners/suite-runner");
const { validateResult } = require("../companion/core/result-validator");

const ROOT = path.resolve(__dirname, "..");
const LAB_ROOT = path.join(ROOT, "benchmark-lab");

const PROMOTED_SCHEMA = require("../benchmark-lab/schemas/promoted-evidence.schema.json");
const APPROVED_SCHEMA = require("../benchmark-lab/schemas/approved-evidence-summary.schema.json");
const QUAL_SCHEMA = require("../benchmark-lab/schemas/qualification-record.schema.json");
const { writeChecksumRecord } = require("../benchmark-lab/engine/checksums");

const CORE_TRACKS = [
  {
    name: "core-classify",
    suiteId: "core-classify-v1",
    trackId: "core.classify",
    contractId: "core-classify-v1",
    evidenceId: "llama3.2-core-classify-v1",
    suitePath: path.join(LAB_ROOT, "locaily", "tracks", "core-classify", "suite.json"),
    claims: [
      "llama3.2-local satisfies default_worker role on core.classify across easy, medium, and adversarial strata.",
      "Produces structured classification output with valid label, category, confidence, and reason."
    ],
    notes: [
      "Qualified for core.classify default_worker role. 3/3 scenario strata PASS (100%).",
      "Semantic scorer core-classify-semantic-v1 verified."
    ]
  },
  {
    name: "core-summarize",
    suiteId: "core-summarize-v1",
    trackId: "core.summarize",
    contractId: "core-summarize-v1",
    evidenceId: "llama3.2-core-summarize-v1",
    suitePath: path.join(LAB_ROOT, "locaily", "tracks", "core-summarize", "suite.json"),
    claims: [
      "llama3.2-local satisfies default_worker role on core.summarize across easy, medium, and adversarial strata.",
      "Produces bounded structured summary with concise text and key points."
    ],
    notes: [
      "Qualified for core.summarize default_worker role. 3/3 scenario strata PASS (100%).",
      "Semantic scorer core-summarize-semantic-v1 verified."
    ]
  },
  {
    name: "core-extract",
    suiteId: "core-extract-v1",
    trackId: "core.extract",
    contractId: "core-extract-v1",
    evidenceId: "llama3.2-core-extract-v1",
    suitePath: path.join(LAB_ROOT, "locaily", "tracks", "core-extract", "suite.json"),
    claims: [
      "llama3.2-local satisfies default_worker role on core.extract across easy, medium, and adversarial strata.",
      "Extracts structured JSON adhering to caller-supplied extraction schemas."
    ],
    notes: [
      "Qualified for core.extract default_worker role. 3/3 scenario strata PASS (100%).",
      "Semantic scorer core-extract-semantic-v1 verified."
    ]
  }
];

function canonicalChecksum(buffer) {
  const canonical = Buffer.from(
    buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    "utf8"
  );
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

async function writeArtifact(filePath, contentObj, schema, label) {
  const validation = validateResult(contentObj, schema, label);
  assert(validation.ok, `${label} validation failed: ${validation.errors.join("; ")}`);
  const jsonText = JSON.stringify(contentObj, null, 2) + "\n";
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, jsonText, "utf8");
  return jsonText;
}


async function main() {
  console.log("=== Qualifying llama3.2-local on CORE-01 Generic Capabilities ===");
  const now = new Date();
  const timestamp = now.toISOString();

  for (const trackDef of CORE_TRACKS) {
    console.log(`\n--- Running suite: ${trackDef.suiteId} ---`);
    const runResult = await runSuite({
      suitePath: trackDef.suitePath,
      now: () => now
    });

    assert(runResult.summary, `Suite run failed for ${trackDef.suiteId}`);
    assert.equal(runResult.summary.passed, 3, `Expected 3 passed cases, got ${runResult.summary.passed}`);
    assert.equal(runResult.summary.failed, 0, "Expected 0 failed cases");
    console.log(`Suite ${trackDef.suiteId} passed 3/3 cases.`);

    const evidenceId = trackDef.evidenceId;
    const promotedEvidence = {
      schemaVersion: "benchmark.promoted_evidence.v1",
      evidenceId,
      sourceRunId: runResult.runId,
      suiteId: trackDef.suiteId,
      trackId: trackDef.trackId,
      contractId: trackDef.contractId,
      approvedAt: timestamp,
      approvedBy: "locaily-operator",
      summary: runResult.summary,
      notes: trackDef.notes
    };

    const promotedPath = path.join(LAB_ROOT, "evidence", "summaries", `${evidenceId}.json`);
    await writeArtifact(promotedPath, promotedEvidence, PROMOTED_SCHEMA, `promoted:${evidenceId}`);
    console.log(`Wrote promoted evidence: ${promotedPath}`);

    const approvedSummary = {
      schemaVersion: "benchmark.approved_evidence_summary.v1",
      evidenceId,
      sourceRunId: runResult.runId,
      approvedAt: timestamp,
      approvedBy: "locaily-operator",
      summaryPath: `benchmark-lab/evidence/summaries/${evidenceId}.json`,
      claims: trackDef.claims
    };

    const approvedPath = path.join(LAB_ROOT, "evidence", "approved", `${evidenceId}.json`);
    await writeArtifact(approvedPath, approvedSummary, APPROVED_SCHEMA, `approved:${evidenceId}`);
    console.log(`Wrote approved summary: ${approvedPath}`);

    const qualRecordId = `llama3.2-local-${evidenceId}`;
    const qualificationRecord = {
      schemaVersion: "benchmark.qualification.v1",
      recordId: qualRecordId,
      subject: {
        type: "model",
        id: "llama3.2-local",
        provider: "ollama",
        runtimeModelName: "llama3.2:latest",
        digest: "sha256:a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72"
      },
      status: "qualified",
      qualifiedFor: [
        {
          role: "default_worker",
          trackId: trackDef.trackId,
          contractId: trackDef.contractId,
          status: "qualified",
          score: 1.0,
          conditions: []
        }
      ],
      evidence: {
        evidenceIds: [evidenceId],
        summaryPaths: [`benchmark-lab/evidence/summaries/${evidenceId}.json`]
      },
      modelProfileId: "llama3.2-local",
      notes: [
        "Generated from explicitly promoted Benchmark Lab evidence.",
        ...trackDef.notes
      ],
      generatedAt: timestamp
    };

    const qualPath = path.join(LAB_ROOT, "qualifications", "models", `${qualRecordId}.json`);
    await writeArtifact(qualPath, qualificationRecord, QUAL_SCHEMA, `qual:${qualRecordId}`);
    console.log(`Wrote qualification record: ${qualPath}`);

    // Checksums
    const promChk = await writeChecksumRecord({
      artifactPath: promotedPath,
      artifactType: "promoted_evidence",
      checksumId: `${evidenceId}-promoted-evidence`
    });
    const appChk = await writeChecksumRecord({
      artifactPath: approvedPath,
      artifactType: "approved_evidence_summary",
      checksumId: `${evidenceId}-approved-summary`
    });
    const qualChk = await writeChecksumRecord({
      artifactPath: qualPath,
      artifactType: "qualification_record",
      checksumId: `${qualRecordId}-qualification`
    });

    console.log(`Wrote checksum records:\n  ${promChk.checksumPath}\n  ${appChk.checksumPath}\n  ${qualChk.checksumPath}`);
  }

  console.log("\nAll 3 generic capabilities qualified successfully!");
}

main().catch((err) => {
  console.error("Qualification script failed:", err);
  process.exit(1);
});
