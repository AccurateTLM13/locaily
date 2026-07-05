const { mkdir, writeFile, readFile, readdir } = require("node:fs/promises");
const { join, basename, extname } = require("node:path");
const { validateResult } = require("../core/result-validator");
const schema = require("./schemas/track-run-record.schema.json");

const STORAGE_DIR = join(__dirname, "..", "..", "data", "evidence", "track-run-records");

async function ensureStorageDir() {
  await mkdir(STORAGE_DIR, { recursive: true });
}

function recordFilename(recordId) {
  return join(STORAGE_DIR, `${recordId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

function resolveRecordIdFromPath(filePath) {
  return basename(filePath, extname(filePath));
}

function stripNullOptionalFields(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripNullOptionalFields).filter((item) => item !== undefined);
  if (typeof obj !== "object") return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) continue;
    if (key === "childRuns" && Array.isArray(value) && value.length === 0) continue;
    result[key] = stripNullOptionalFields(value);
  }
  return result;
}

async function storeRecord(record) {
  await ensureStorageDir();
  const filePath = recordFilename(record.recordId);

  const existing = await recordExists(record.recordId);
  if (existing) {
    const err = new Error(`Track Run Record '${record.recordId}' already exists and will not be overwritten.`);
    err.code = "RECORD_ALREADY_EXISTS";
    throw err;
  }

  const cleaned = stripNullOptionalFields(record);

  const validation = validateResult(cleaned, schema, record.recordId);
  if (!validation.ok) {
    const err = new Error(`Track Run Record '${record.recordId}' failed schema validation: ${validation.errors.join("; ")}`);
    err.code = "RECORD_SCHEMA_INVALID";
    err.validation = validation;
    throw err;
  }

  await writeFile(filePath, JSON.stringify(cleaned, null, 2), "utf8");
  return { filePath, recordId: record.recordId };
}

async function loadRecord(recordId) {
  const filePath = recordFilename(recordId);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function recordExists(recordId) {
  const record = await loadRecord(recordId);
  return record !== null;
}

async function loadRecordsByWorkflow(workflowId) {
  await ensureStorageDir();
  const allRecords = [];
  let files;
  try {
    files = await readdir(STORAGE_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(STORAGE_DIR, file), "utf8");
      const record = JSON.parse(raw);
      if (record.workflowId === workflowId || record.correlationId === workflowId) {
        allRecords.push(record);
      }
    } catch {
      // skip unreadable files
    }
  }

  return allRecords;
}

async function loadRecordsByParent(parentRecordId) {
  await ensureStorageDir();
  const childRecords = [];
  let files;
  try {
    files = await readdir(STORAGE_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(STORAGE_DIR, file), "utf8");
      const record = JSON.parse(raw);
      if (record.parentRunId === parentRecordId) {
        childRecords.push(record);
      }
    } catch {
      // skip unreadable files
    }
  }

  return childRecords;
}

async function listAllRecords() {
  await ensureStorageDir();
  const allRecords = [];
  let files;
  try {
    files = await readdir(STORAGE_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(STORAGE_DIR, file), "utf8");
      const record = JSON.parse(raw);
      allRecords.push(record);
    } catch {
      // skip unreadable files
    }
  }

  allRecords.sort((a, b) => {
    const aTime = a.timestamps?.createdAt || "";
    const bTime = b.timestamps?.createdAt || "";
    return bTime.localeCompare(aTime);
  });

  return allRecords;
}

module.exports = {
  STORAGE_DIR,
  ensureStorageDir,
  storeRecord,
  loadRecord,
  recordExists,
  loadRecordsByWorkflow,
  loadRecordsByParent,
  listAllRecords
};
