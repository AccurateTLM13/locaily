const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { readJson, writeJson, toPosixPath } = require("./fs-utils");

const LAB_ROOT = path.resolve(__dirname, "..");

async function sha256File(filePath) {
  const content = await fs.readFile(filePath);
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

async function writeChecksumRecord({ artifactPath, artifactType, checksumId = null }) {
  const absoluteArtifactPath = path.resolve(artifactPath);
  const checksum = await sha256File(absoluteArtifactPath);
  const relativeArtifactPath = toPosixPath(path.relative(path.resolve(LAB_ROOT, ".."), absoluteArtifactPath));
  const record = {
    schemaVersion: "benchmark.checksum.v1",
    checksumId: checksumId || buildChecksumId(relativeArtifactPath),
    artifactType,
    artifactPath: relativeArtifactPath,
    algorithm: "sha256",
    checksum,
    generatedAt: new Date().toISOString()
  };
  const checksumPath = path.join(LAB_ROOT, "evidence", "checksums", `${record.checksumId}.json`);

  await writeJson(checksumPath, record);

  return {
    checksumPath,
    record
  };
}

async function verifyChecksumRecord(checksumPath) {
  const record = await readJson(checksumPath);
  const artifactPath = path.resolve(LAB_ROOT, "..", record.artifactPath);
  const actual = await sha256File(artifactPath);

  return {
    ok: actual === record.checksum,
    expected: record.checksum,
    actual,
    artifactPath,
    record
  };
}

function buildChecksumId(relativeArtifactPath) {
  return relativeArtifactPath
    .replace(/^benchmark-lab\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.json$/, "");
}

module.exports = {
  sha256File,
  writeChecksumRecord,
  verifyChecksumRecord,
  buildChecksumId
};
