const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createRunStore } = require("../companion/console/run-store");
const { createValidationRunner } = require("../companion/console/validation-runner");

for (const artifactMode of ["split", "bundle"]) {
  test(`schema failure evidence survives reload in ${artifactMode} mode`, async () => {
    const validationDir = await mkdtemp(join(tmpdir(), "locaily-console-failure-"));
    try {
      const store = createRunStore({ validationDir, artifactMode });
      const runner = createValidationRunner({
        runStore: store,
        getStatusSnapshot: async () => ({ ok: true }),
        listAuditEvents: async () => [],
        runTask: async ({ task }) => ({
          statusCode: 200,
          body: {
            ok: true,
            result: task === "verify-handoff" ? { valid: true, errors: [] } : task === "compose-handoff" ? {
              clientSummary: "Summary", developerSummary: "Details", estimatedImpact: "High",
              priorityFixes: [{ title: "Broken fixture", priority: "invalid", reason: "Test" }],
              handoffChecklist: []
            } : {}
          }
        })
      });
      const started = await runner.startValidation({ url: "https://example.com/", mode: "demo" });
      const deadline = Date.now() + 5000;
      let run;
      do {
        await new Promise((resolve) => setTimeout(resolve, 20));
        run = (await store.getRun(started.runId)).run;
      } while (!["failed", "success"].includes(run.status) && Date.now() < deadline);

      assert.equal(run.status, "failed");
      assert.equal(run.error.code, "SCHEMA_VALIDATION_FAILED");
      assert.match(run.error.detail, /priorityFixes\[0\]\.priority/);
      assert.equal(run.evidence.schema.valid, false);
      assert.ok(run.evidence.schema.errors.some((error) => error.includes("priorityFixes[0].priority")));
      assert.equal(run.steps.find((step) => step.id === "schema_validation").status, "failed");
      const reloaded = await createRunStore({ validationDir, artifactMode }).getRun(started.runId);
      assert.equal(reloaded.ok, true);
      assert.deepEqual(reloaded.run.evidence, run.evidence);
      assert.deepEqual(reloaded.run.error, run.error);
    } finally {
      await rm(validationDir, { recursive: true, force: true });
    }
  });
}

test("run history preserves zero scores and explicit false results", async () => {
  const validationDir = await mkdtemp(join(tmpdir(), "locaily-console-history-"));
  try {
    const store = createRunStore({ validationDir });
    const run = await store.createRun({ url: "https://example.com/", mode: "demo" });
    await store.updateRun(run.runId, (record) => {
      record.result = { weakestScore: 0, memoryUsed: false, schemaValid: false };
      return record;
    });
    for (const reader of [store, createRunStore({ validationDir })]) {
      const summary = (await reader.listRuns()).runs[0];
      assert.equal(summary.weakestScore, 0);
      assert.equal(summary.memoryUsed, false);
      assert.equal(summary.schemaValid, false);
    }
  } finally {
    await rm(validationDir, { recursive: true, force: true });
  }
});
