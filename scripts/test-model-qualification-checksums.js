const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");

const ROOT = path.resolve(__dirname, "..");
const QUALIFICATION_ARTIFACT = "benchmark-lab/qualifications/models/lfm25-1p2b-thinking-local-lfm25-1p2b-thinking-developer-task-writer-v1.json";

function canonicalChecksum(buffer) {
  const canonical = Buffer.from(
    buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    "utf8"
  );
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

async function writeJson(directory, name, value) {
  await fs.writeFile(path.join(directory, name), JSON.stringify(value, null, 2));
}

async function main() {
  const checksumDir = await fs.mkdtemp(path.join(os.tmpdir(), "locaily-qualification-checksums-"));

  try {
    const artifact = await fs.readFile(path.join(ROOT, QUALIFICATION_ARTIFACT));
    await writeJson(checksumDir, "valid-qualification.json", {
      artifactType: "qualification_record",
      artifactPath: QUALIFICATION_ARTIFACT,
      checksum: canonicalChecksum(artifact),
      checksumMode: "canonical_text_v1",
      checksumId: "valid-qualification"
    });
    await writeJson(checksumDir, "missing-qualification.json", {
      artifactType: "qualification_record",
      artifactPath: "benchmark-lab/qualifications/models/missing-qualification.json",
      checksum: "sha256:missing",
      checksumId: "missing-qualification"
    });
    await writeJson(checksumDir, "incomplete-qualification.json", {
      artifactType: "qualification_record",
      checksumId: "incomplete-qualification"
    });
    await writeJson(checksumDir, "escape-qualification.json", {
      artifactType: "qualification_record",
      artifactPath: "../package.json",
      checksum: "sha256:escape",
      checksumId: "escape-qualification"
    });
    await fs.writeFile(path.join(checksumDir, "malformed-qualification.json"), "{not-json");

    // Draft/raw artifacts are intentionally outside the qualification-record
    // checksum contract, even when their paths are stale or malformed.
    await writeJson(checksumDir, "ignored-draft.json", {
      artifactType: "draft_summary",
      artifactPath: "benchmark-lab/evidence/drafts/missing.json",
      checksum: "sha256:ignored"
    });
    await fs.writeFile(path.join(checksumDir, "ignored-raw.json"), "not-json");

    const status = createModelQualificationLoader({ checksumDir }).getStatus();
    assert.equal(status.checksumVerification.total, 5, "Only qualification checksum records should be counted.");
    assert.equal(status.checksumVerification.verified, 1, "The valid qualification checksum should pass.");
    assert.equal(status.checksumVerification.failed, 4, "Missing, malformed, and escaping qualification checksums should fail.");

    const failures = new Map(status.checksumVerification.failures.map((failure) => [failure.checksumId, failure.reason]));
    assert.equal(failures.get("missing-qualification"), "ARTIFACT_MISSING");
    assert.equal(failures.get("incomplete-qualification"), "CHECKSUM_RECORD_INCOMPLETE");
    assert.equal(failures.get("escape-qualification"), "ARTIFACT_PATH_ESCAPES_REPOSITORY");
    assert.equal(failures.get(null), "CHECKSUM_RECORD_INVALID_JSON");
    assert(!status.checksumVerification.failures.some((failure) => failure.file.endsWith("ignored-draft.json")), "Ignored draft checksum must not fail status.");
    assert(!status.checksumVerification.failures.some((failure) => failure.file.endsWith("ignored-raw.json")), "Ignored raw checksum must not fail status.");

    console.log("Qualification checksum tests passed: valid, missing, malformed, path-escape, and transient exclusion.");
  } finally {
    await fs.rm(checksumDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
