const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { readJson, writeJson, toPosixPath } = require("./fs-utils");

const LAB_ROOT = path.resolve(__dirname, "..");

const TEXT_EXTENSIONS = new Set([".json", ".md", ".js", ".txt", ".yaml", ".yml", ".toml", ".html", ".css", ".xml", ".svg"]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function normalizeText(content) {
  return content.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function sha256File(filePath, checksumMode) {
  const raw = await fs.readFile(filePath);

  let content;
  if (checksumMode === "canonical_text_v1") {
    content = Buffer.from(normalizeText(raw), "utf8");
  } else {
    content = raw;
  }

  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function detectChecksumMode(filePath) {
  return isTextFile(filePath) ? "canonical_text_v1" : "byte_exact";
}

async function writeChecksumRecord({ artifactPath, artifactType, checksumId = null, checksumMode = null }) {
  const absoluteArtifactPath = path.resolve(artifactPath);
  const mode = checksumMode || detectChecksumMode(absoluteArtifactPath);
  const checksum = await sha256File(absoluteArtifactPath, mode);
  const relativeArtifactPath = toPosixPath(path.relative(path.resolve(LAB_ROOT, ".."), absoluteArtifactPath));
  const record = {
    schemaVersion: "benchmark.checksum.v1",
    checksumId: checksumId || buildChecksumId(relativeArtifactPath),
    artifactType,
    artifactPath: relativeArtifactPath,
    algorithm: "sha256",
    checksumMode: mode,
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
  const mode = record.checksumMode || "byte_exact";
  const actual = await sha256File(artifactPath, mode);

  const ok = actual === record.checksum;

  if (!ok && mode === "byte_exact" && isTextFile(artifactPath)) {
    const canonicalActual = await sha256File(artifactPath, "canonical_text_v1");
    if (canonicalActual === record.checksum) {
      return {
        ok: true,
        expected: record.checksum,
        actual: canonicalActual,
        artifactPath,
        record,
        _note: "Legacy byte-exact checksum matched via canonical normalization"
      };
    }
  }

  return {
    ok,
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
  buildChecksumId,
  isTextFile,
  normalizeText,
  detectChecksumMode
};
