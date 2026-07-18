const fs = require("node:fs");
const { mkdir, writeFile, readFile, readdir, rename, unlink } = require("node:fs/promises");
const { join } = require("node:path");
const { validateResult } = require("../../core/result-validator");
const {
  redactEventForPersistence,
  validateEventHasNoSecrets
} = require("./event-redaction");

const DEFAULT_RETENTION_DAYS = 90;

function createDevelopmentEventStore(options = {}) {
  const dataDir = options.dataDir || join(__dirname, "..", "..", "..", "data", "memory", "development-events");
  const schema = options.schema || require("../../schemas/development-memory-event.schema.json");
  const retentionDays = Number.isFinite(options.retentionDays)
    ? options.retentionDays
    : DEFAULT_RETENTION_DAYS;

  async function ensureStorageDir() {
    await mkdir(dataDir, { recursive: true });
  }

  function eventFilename(eventId) {
    const safeId = String(eventId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(dataDir, `${safeId}.json`);
  }

  function normalizeEvent(event) {
    const normalized = { ...event };

    if (!normalized.correlation || typeof normalized.correlation !== "object") {
      normalized.correlation = {};
    }

    return normalized;
  }

  function validateEventDocument(event, label = "event") {
    const validation = validateResult(event, schema, label);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "EVENT_SCHEMA_INVALID",
          message: `Development memory event failed schema validation: ${validation.errors.join("; ")}`,
          nextStep: "Fix the event payload to match development-memory-event.schema.json."
        },
        validation
      };
    }

    return { ok: true };
  }

  async function readEventFile(eventId) {
    const filePath = eventFilename(eventId);

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

  async function writeEventAtomic(event) {
    const filePath = eventFilename(event.eventId);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify(event, null, 2)}\n`;

    await writeFile(tempPath, payload, "utf8");

    try {
      await rename(tempPath, filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  function prepareEventForAppend(inputEvent) {
    const normalized = normalizeEvent(inputEvent);

    const secretCheck = validateEventHasNoSecrets(normalized);
    if (!secretCheck.ok) {
      return {
        ok: false,
        error: {
          code: secretCheck.code,
          message: secretCheck.message,
          nextStep: secretCheck.nextStep
        },
        warnings: []
      };
    }

    const redacted = redactEventForPersistence(normalized);
    const validationResult = validateEventDocument(redacted, redacted.eventId || "event");

    if (!validationResult.ok) {
      return {
        ok: false,
        error: validationResult.error,
        warnings: []
      };
    }

    return { ok: true, event: redacted };
  }

  function writeEventAtomicSync(event) {
    fs.mkdirSync(dataDir, { recursive: true });
    const filePath = eventFilename(event.eventId);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify(event, null, 2)}\n`;

    fs.writeFileSync(tempPath, payload, "utf8");

    try {
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup failure.
      }
      throw error;
    }
  }

  function readEventFileSync(eventId) {
    const filePath = eventFilename(eventId);

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  function appendPreparedEvent(existingReader, writer, redacted) {
    return existingReader(redacted.eventId).then((existing) => {
      if (existing) {
        const samePayload = JSON.stringify(existing) === JSON.stringify(redacted);
        if (samePayload) {
          return {
            ok: true,
            result: {
              eventId: existing.eventId,
              duplicate: true,
              storedAt: existing.capturedAt
            },
            warnings: ["Duplicate event submission returned existing record."]
          };
        }

        return {
          ok: false,
          error: {
            code: "EVENT_ID_CONFLICT",
            message: `Event '${redacted.eventId}' already exists with different content.`,
            nextStep: "Use a new eventId or submit the identical payload for idempotent retry."
          },
          warnings: []
        };
      }

      return writer(redacted).then(() => ({
        ok: true,
        result: {
          eventId: redacted.eventId,
          duplicate: false,
          storedAt: redacted.capturedAt
        },
        warnings: []
      }));
    });
  }

  async function appendEvent(inputEvent) {
    await ensureStorageDir();

    const prepared = prepareEventForAppend(inputEvent);
    if (!prepared.ok) {
      return prepared;
    }

    return appendPreparedEvent(readEventFile, writeEventAtomic, prepared.event);
  }

  function appendEventSync(inputEvent) {
    fs.mkdirSync(dataDir, { recursive: true });

    const prepared = prepareEventForAppend(inputEvent);
    if (!prepared.ok) {
      return prepared;
    }

    const existing = readEventFileSync(prepared.event.eventId);
    if (existing) {
      const samePayload = JSON.stringify(existing) === JSON.stringify(prepared.event);
      if (samePayload) {
        return {
          ok: true,
          result: {
            eventId: existing.eventId,
            duplicate: true,
            storedAt: existing.capturedAt
          },
          warnings: ["Duplicate event submission returned existing record."]
        };
      }

      return {
        ok: false,
        error: {
          code: "EVENT_ID_CONFLICT",
          message: `Event '${prepared.event.eventId}' already exists with different content.`,
          nextStep: "Use a new eventId or submit the identical payload for idempotent retry."
        },
        warnings: []
      };
    }

    writeEventAtomicSync(prepared.event);

    return {
      ok: true,
      result: {
        eventId: prepared.event.eventId,
        duplicate: false,
        storedAt: prepared.event.capturedAt
      },
      warnings: []
    };
  }

  async function getEvent(eventId) {
    await ensureStorageDir();
    const event = await readEventFile(eventId);

    if (!event) {
      return {
        ok: false,
        error: {
          code: "EVENT_NOT_FOUND",
          message: `Development memory event '${eventId}' was not found.`,
          nextStep: "Verify the eventId or use GET /memory/events to query available events."
        },
        warnings: []
      };
    }

    return {
      ok: true,
      result: event,
      warnings: []
    };
  }

  async function listEventFiles() {
    await ensureStorageDir();

    try {
      const files = await readdir(dataDir);
      return files.filter((file) => file.endsWith(".json"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  function matchesFilters(event, filters = {}) {
    if (filters.project && event.project !== filters.project) {
      return false;
    }

    if (filters.eventType && event.eventType !== filters.eventType) {
      return false;
    }

    if (filters.branch && event.source && event.source.branch !== filters.branch) {
      return false;
    }

    if (filters.objectiveId) {
      const value = event.correlation && event.correlation.objectiveId;
      if (value !== filters.objectiveId) {
        return false;
      }
    }

    if (filters.taskId) {
      const value = event.correlation && event.correlation.taskId;
      if (value !== filters.taskId) {
        return false;
      }
    }

    if (filters.runId) {
      const value = event.correlation && event.correlation.runId;
      if (value !== filters.runId) {
        return false;
      }
    }

    if (filters.sessionId) {
      const value = event.correlation && event.correlation.sessionId;
      if (value !== filters.sessionId) {
        return false;
      }
    }

    if (filters.from) {
      const fromMs = Date.parse(filters.from);
      const occurredMs = Date.parse(event.occurredAt);
      if (Number.isFinite(fromMs) && Number.isFinite(occurredMs) && occurredMs < fromMs) {
        return false;
      }
    }

    if (filters.to) {
      const toMs = Date.parse(filters.to);
      const occurredMs = Date.parse(event.occurredAt);
      if (Number.isFinite(toMs) && Number.isFinite(occurredMs) && occurredMs > toMs) {
        return false;
      }
    }

    return true;
  }

  async function queryEvents(filters = {}) {
    await ensureStorageDir();

    const files = await listEventFiles();
    const events = [];

    for (const file of files) {
      try {
        const raw = await readFile(join(dataDir, file), "utf8");
        const event = JSON.parse(raw);
        if (matchesFilters(event, filters)) {
          events.push(event);
        }
      } catch {
        // Skip unreadable or partial files from interrupted writes.
      }
    }

    events.sort((left, right) => {
      const leftMs = Date.parse(left.occurredAt) || 0;
      const rightMs = Date.parse(right.occurredAt) || 0;
      return rightMs - leftMs;
    });

    const limit = Number.isFinite(filters.limit) ? Math.max(1, filters.limit) : 100;
    const limited = events.slice(0, limit);

    return {
      ok: true,
      result: {
        count: limited.length,
        totalMatched: events.length,
        events: limited
      },
      warnings: []
    };
  }

  async function purgeExpiredEvents(options = {}) {
    const days = Number.isFinite(options.retentionDays) ? options.retentionDays : retentionDays;
    if (!options.keepRawEvents) {
      return { ok: true, result: { purged: 0 }, warnings: ["Retention purge skipped because keepRawEvents is false."] };
    }

    const cutoffMs = Date.now() - (days * 24 * 60 * 60 * 1000);
    const files = await listEventFiles();
    let purged = 0;

    for (const file of files) {
      try {
        const raw = await readFile(join(dataDir, file), "utf8");
        const event = JSON.parse(raw);
        const occurredMs = Date.parse(event.occurredAt);
        if (Number.isFinite(occurredMs) && occurredMs < cutoffMs) {
          await unlink(join(dataDir, file));
          purged += 1;
        }
      } catch {
        // Skip corrupt files; do not delete ambiguous records automatically.
      }
    }

    return {
      ok: true,
      result: { purged },
      warnings: []
    };
  }

  return {
    appendEvent,
    appendEventSync,
    getEvent,
    queryEvents,
    listEventFiles,
    purgeExpiredEvents,
    getStorageDir: () => dataDir
  };
}

module.exports = {
  createDevelopmentEventStore,
  DEFAULT_RETENTION_DAYS
};
