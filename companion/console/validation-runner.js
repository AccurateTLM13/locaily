const lighthouseHandoffSchema = require("../schemas/lighthouse-handoff.schema.json");
const { validateResult } = require("../core/result-validator");
const { auditPayloadContainsPrivateMemory } = require("../memory/audit-redaction");
const { capturePageSpeed, parsePastedPageSpeedReport } = require("./pagespeed");

const VALIDATION_MODES = new Set(["standard", "l2_ollama", "l2_ollama_memory"]);
const CONSOLE_SOURCE = {
  app_id: "locaily-test-bench",
  surface: "console",
  user_action: "lighthouse-handoff-validation",
  client_version: "0.1.0"
};

function createValidationRunner({ runStore, runTask, getStatusSnapshot, listAuditEvents }) {
  async function startValidation({ url, mode, pastedReport }) {
    const normalizedPastedReport = normalizePastedReport(pastedReport);
    const normalizedMode = normalizeMode(mode);
    const normalizedUrl = normalizedPastedReport
      ? normalizeValidationUrl(url, { allowEmpty: true })
      : normalizeValidationUrl(url);
    const run = await runStore.createRun({
      url: normalizedUrl,
      mode: normalizedMode,
      inputSource: normalizedPastedReport ? "pasted" : "live"
    });

    if (normalizedPastedReport) {
      await runStore.updateRun(run.runId, (record) => {
        record.pastedReport = normalizedPastedReport;
        return record;
      });
    }

    setImmediate(() => {
      runValidation(run.runId).catch(async (error) => {
        await failRun(run.runId, error);
      });
    });

    return run;
  }

  async function runValidation(runId) {
    const startedAt = Date.now();
    let currentStep = null;

    await runStore.updateRun(runId, (run) => {
      run.status = "running";
      return run;
    });

    try {
      const runSnapshot = (await runStore.getRun(runId)).run;
      const mode = runSnapshot.mode;
      const url = runSnapshot.url;

      currentStep = "preflight";
      await startStep(runId, currentStep);
      const status = await getStatusSnapshot();
      const preflightWarnings = validatePreflight(status, mode);
      await addWarnings(runId, preflightWarnings);
      await finishStep(runId, currentStep, preflightWarnings.length > 0 ? "warning" : "passed", "System check complete.");

      currentStep = "pagespeed_capture";
      await startStep(runId, currentStep);
      const pageSpeed = runSnapshot.pastedReport
        ? parsePastedPageSpeedReport(runSnapshot.pastedReport, url)
        : await capturePageSpeed(url);
      const pageSpeedArtifact = await runStore.writeJsonArtifact(runId, "pagespeed-raw", pageSpeed.raw);
      await runStore.updateRun(runId, (run) => {
        run.artifacts.pageSpeedRaw = pageSpeedArtifact;
        if (pageSpeed.slim && pageSpeed.slim.url) {
          run.url = pageSpeed.slim.url;
        }
        return run;
      });
      await finishStep(
        runId,
        currentStep,
        runSnapshot.pastedReport ? "skipped" : "passed",
        runSnapshot.pastedReport ? "Used pasted PageSpeed report." : "Live PageSpeed capture complete."
      );

      currentStep = "slim_input";
      await startStep(runId, currentStep);
      const slimArtifact = await runStore.writeJsonArtifact(runId, "lighthouse-slim", pageSpeed.slim);
      await runStore.updateRun(runId, (run) => {
        run.artifacts.slimInput = slimArtifact;
        return run;
      });
      await finishStep(runId, currentStep, "passed", "Slim Lighthouse input saved.");

      currentStep = "analyze_report";
      await startStep(runId, currentStep);
      const analyzeEnvelope = await runAnalyzeReport(pageSpeed.slim, mode);
      const analyzeArtifact = await runStore.writeJsonArtifact(runId, "analyze-report", analyzeEnvelope.body);
      await runStore.updateRun(runId, (run) => {
        run.artifacts.analyzeReport = analyzeArtifact;
        return run;
      });
      assertEnvelopeOk(analyzeEnvelope, "analyze-report");
      await finishStep(runId, currentStep, "passed", "Analyze report completed.");

      currentStep = "compose_handoff";
      await startStep(runId, currentStep);
      const composeInput = buildComposeInput(pageSpeed.slim, analyzeEnvelope.body.result);
      const composeEnvelope = await runComposeHandoff(composeInput, mode);
      const composeArtifact = await runStore.writeJsonArtifact(runId, "compose-handoff", composeEnvelope.body);
      await runStore.updateRun(runId, (run) => {
        run.artifacts.composeHandoff = composeArtifact;
        return run;
      });
      assertEnvelopeOk(composeEnvelope, "compose-handoff");
      const memoryWarnings = getMemoryWarnings(composeEnvelope.body.result, mode);
      await addWarnings(runId, memoryWarnings.all);
      await finishStep(runId, currentStep, memoryWarnings.timeline.length > 0 ? "warning" : "passed", "Handoff composed.");

      currentStep = "schema_validation";
      await startStep(runId, currentStep);
      const schemaEvidence = await validateHandoffSchema(composeEnvelope.body.result);
      const verifyEnvelope = await runVerifyHandoff(composeEnvelope.body.result);
      assertEnvelopeOk(verifyEnvelope, "verify-handoff");
      await runStore.writeJsonArtifact(runId, "verify-handoff", verifyEnvelope.body);
      const verifierValid = verifyEnvelope.body.result && verifyEnvelope.body.result.valid === true;
      await finishStep(runId, currentStep, schemaEvidence.valid && verifierValid ? "passed" : "failed", schemaEvidence.valid && verifierValid ? "Schema validation passed." : "Schema validation failed.");

      if (!schemaEvidence.valid || !verifierValid) {
        throw stepError("SCHEMA_VALIDATION_FAILED", "Generated handoff did not match the Lighthouse Handoff schema.", "schema_validation", schemaEvidence.errors.join(" "));
      }

      currentStep = "metric_preservation";
      await startStep(runId, currentStep);
      const metricEvidence = checkMetricPreservation(composeEnvelope.body.result, pageSpeed.slim);
      await finishStep(runId, currentStep, metricEvidence.preserved ? "passed" : "failed", metricEvidence.message);

      if (!metricEvidence.preserved) {
        throw stepError("METRIC_PRESERVATION_FAILED", metricEvidence.message, "metric_preservation");
      }

      currentStep = "privacy_audit";
      await startStep(runId, currentStep);
      const privacyEvidence = await checkPrivacyAudit(listAuditEvents);
      await finishStep(runId, currentStep, privacyEvidence.ok ? "passed" : "failed", privacyEvidence.message);

      if (!privacyEvidence.ok) {
        throw stepError("PRIVACY_AUDIT_FAILED", privacyEvidence.message, "privacy_audit");
      }

      currentStep = "artifact_save";
      await startStep(runId, currentStep);
      const markdownArtifact = await runStore.writeTextArtifact(runId, "handoff", composeEnvelope.body.result.markdown || "");
      const finalSummary = buildFinalSummary({
        runId,
        mode,
        url,
        startedAt,
        slim: pageSpeed.slim,
        analyzeEnvelope,
        composeEnvelope,
        schemaEvidence,
        verifyEnvelope,
        metricEvidence,
        privacyEvidence,
        markdownArtifact
      });
      const summaryArtifact = await runStore.writeJsonArtifact(runId, "summary", finalSummary);
      await runStore.updateRun(runId, (run) => {
        run.status = "success";
        run.completedAt = new Date().toISOString();
        run.durationMs = Date.now() - startedAt;
        run.result = finalSummary.result;
        run.evidence = finalSummary.evidence;
        run.artifacts.markdown = markdownArtifact;
        run.artifacts.summary = summaryArtifact;
        return run;
      });
      await finishStep(runId, currentStep, "passed", "Validation artifacts saved.");
    } catch (error) {
      if (currentStep && !error.step) {
        error.step = currentStep;
      }

      if (currentStep) {
        await runStore.setStep(runId, currentStep, {
          status: "failed",
          error: error.message || "Validation failed.",
          message: error.detail || null
        });
      }

      await failRun(runId, error, startedAt);
    }
  }

  async function runAnalyzeReport(slim, mode) {
    return runTask({
      tool: "lighthouse-handoff",
      task: "analyze-report",
      input: buildAnalyzeInput(slim),
      context: {
        source: {
          ...CONSOLE_SOURCE,
          user_action: "validation.analyze-report"
        }
      },
      options: {
        execution_mode: "orchestrated",
        use_runtime: mode !== "standard",
        memory: {
          enabled: false
        }
      }
    });
  }

  async function runComposeHandoff(input, mode) {
    return runTask({
      tool: "lighthouse-handoff",
      task: "compose-handoff",
      input,
      context: {
        source: {
          ...CONSOLE_SOURCE,
          user_action: "validation.compose-handoff"
        }
      },
      options: {
        use_runtime: false,
        memory: mode === "l2_ollama_memory"
          ? {
              enabled: "auto",
              project: "Lighthouse Handoff",
              task: "Generate coding-agent handoff from PageSpeed report",
              maxFiles: 8,
              writeback: false
            }
          : {
              enabled: false
            }
      }
    });
  }

  async function runVerifyHandoff(handoff) {
    return runTask({
      tool: "lighthouse.verify_handoff",
      input: {
        handoff
      },
      context: {
        source: {
          ...CONSOLE_SOURCE,
          user_action: "validation.verify-handoff"
        }
      },
      options: {
        use_runtime: false
      }
    });
  }

  async function validateHandoffSchema(handoff) {
    const validation = validateResult(handoff, lighthouseHandoffSchema);

    return {
      valid: validation.ok,
      errors: validation.errors
    };
  }

  async function addWarnings(runId, warnings) {
    for (const warning of warnings) {
      await runStore.appendWarning(runId, warning);
    }
  }

  async function startStep(runId, stepId) {
    await runStore.setStep(runId, stepId, {
      status: "running",
      message: null,
      error: null
    });
  }

  async function finishStep(runId, stepId, status, message) {
    await runStore.setStep(runId, stepId, {
      status,
      message
    });
  }

  async function failRun(runId, error, startedAt = Date.now()) {
    await runStore.updateRun(runId, (run) => {
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - startedAt;
      run.error = {
        code: error.code || "VALIDATION_FAILED",
        message: error.message || "Validation failed.",
        step: error.step || null,
        detail: error.detail || null
      };
      return run;
    });
  }

  return {
    startValidation,
    modes: Array.from(VALIDATION_MODES)
  };
}

function validatePreflight(status, mode) {
  const warnings = [];

  if (!status.ok) {
    throw stepError("PREFLIGHT_FAILED", "Console status could not be built.", "preflight");
  }

  if (!status.pageSpeed.ready) {
    throw stepError("PAGESPEED_NOT_READY", "PageSpeed capture is not ready.", "preflight");
  }

  warnings.push(...status.pageSpeed.warnings);

  if (mode === "l2_ollama" || mode === "l2_ollama_memory") {
    if (status.provider.active !== "ollama") {
      throw stepError("PROVIDER_NOT_OLLAMA", "L2 validation requires the active provider to be Ollama.", "preflight");
    }

    if (!status.ollama.available) {
      throw stepError("OLLAMA_UNAVAILABLE", "Ollama is not available.", "preflight");
    }

    if (!status.model.ready) {
      throw stepError("MODEL_NOT_READY", "The selected Ollama model is not ready.", "preflight");
    }
  }

  if (mode === "l2_ollama_memory") {
    if (!status.memory.enabled || !status.memory.readable) {
      throw stepError("MEMORY_NOT_READY", "Memory Bridge must be enabled and readable for L2 Ollama + Memory validation.", "preflight");
    }

    warnings.push(...status.memory.warnings);
  }

  if (!status.auditLogging.ready) {
    warnings.push("Audit logging could not be checked; privacy/audit step may fail.");
  }

  return uniqueStrings(warnings);
}

function buildAnalyzeInput(slim) {
  return {
    url: slim.url,
    scores: slim.scores,
    opportunities: slim.opportunities || [],
    diagnostics: slim.diagnostics || []
  };
}

function buildComposeInput(slim, analyzeResult) {
  return {
    url: slim.url,
    metrics: slim.scores,
    prioritizedFixes: {
      priorityFixes: Array.isArray(analyzeResult.priorityFixes)
        ? analyzeResult.priorityFixes
        : [],
      thinking: analyzeResult.developerSummary || "Validation compose input from analyzed Lighthouse report."
    },
    matchedFixes: {
      fixes: [
        {
          steps: Array.isArray(analyzeResult.handoffChecklist)
            ? analyzeResult.handoffChecklist
            : []
        }
      ]
    }
  };
}

function assertEnvelopeOk(envelope, task) {
  if (!envelope || !envelope.body || envelope.statusCode >= 400 || envelope.body.ok !== true) {
    const body = envelope && envelope.body ? envelope.body : {};
    const message = body.message || (body.error && body.error.message) || `${task} failed.`;
    const error = stepError(body.code || "TASK_RUN_FAILED", message, task.replace(/-/g, "_"));
    error.detail = body.next_step || (body.error && body.error.nextStep) || null;
    throw error;
  }
}

function checkMetricPreservation(handoff, slim) {
  const weakest = findWeakestScore(slim.scores);
  const scoreText = String(weakest.value);
  const categoryText = formatScoreName(weakest.name);
  const haystack = `${handoff.clientSummary || ""}\n${handoff.markdown || ""}`.toLowerCase();
  const scorePresent = haystack.includes(scoreText);
  const categoryPresent = haystack.includes(categoryText);

  return {
    preserved: scorePresent && categoryPresent,
    weakestCategory: weakest.name,
    weakestScore: weakest.value,
    expected: `${categoryText} at ${weakest.value}`,
    message: scorePresent && categoryPresent
      ? `Weakest score preserved: ${categoryText} at ${weakest.value}.`
      : `Generated handoff did not preserve weakest PageSpeed score: ${categoryText} at ${weakest.value}.`
  };
}

async function checkPrivacyAudit(listAuditEvents) {
  const audit = await listAuditEvents({ limit: 50 });
  const events = audit.events || [];
  const privateContentDetected = events.some((event) => auditPayloadContainsPrivateMemory(event));
  const vaultPathLeaked = events.some((event) => /"vaultPath"\s*:/.test(JSON.stringify(event)));

  return {
    ok: privateContentDetected === false && vaultPathLeaked === false,
    eventsChecked: events.length,
    privateContentDetected,
    vaultPathLeaked,
    message: privateContentDetected || vaultPathLeaked
      ? "Private memory content or vault path was detected in audit events."
      : `Audit privacy check passed across ${events.length} recent events.`
  };
}

function isInformationalMemoryWarning(warning) {
  return typeof warning === "string" && warning.startsWith("File selection capped at maxFiles=");
}

function getMemoryWarnings(handoff, mode) {
  if (mode !== "l2_ollama_memory") {
    return { all: [], timeline: [] };
  }

  const memory = handoff.memory || {};
  const warnings = Array.isArray(memory.warnings) ? [...memory.warnings] : [];
  const filesUsed = Array.isArray(memory.filesUsed) ? memory.filesUsed : [];

  if (memory.used && filesUsed.length < 2) {
    warnings.push("Memory context was thin; this is a warning, not a validation failure.");
  }

  const all = uniqueStrings(warnings);
  const timeline = all.filter((warning) => !isInformationalMemoryWarning(warning));

  return { all, timeline };
}

function buildFinalSummary({
  runId,
  mode,
  url,
  startedAt,
  slim,
  analyzeEnvelope,
  composeEnvelope,
  schemaEvidence,
  verifyEnvelope,
  metricEvidence,
  privacyEvidence,
  markdownArtifact
}) {
  const handoff = composeEnvelope.body.result;
  const memory = handoff.memory || {};

  return {
    runId,
    workflow: "lighthouse_handoff_validation",
    mode,
    result: {
      url,
      scores: slim.scores,
      weakestCategory: metricEvidence.weakestCategory,
      weakestScore: metricEvidence.weakestScore,
      provider: composeEnvelope.body.provider || analyzeEnvelope.body.provider || null,
      model: composeEnvelope.body.model || analyzeEnvelope.body.model || null,
      memoryUsed: Boolean(memory.used),
      filesUsed: Array.isArray(memory.filesUsed) ? memory.filesUsed : [],
      schemaValid: schemaEvidence.valid && verifyEnvelope.body.ok === true && verifyEnvelope.body.result.valid === true,
      durationMs: Date.now() - startedAt,
      warnings: Array.isArray(memory.warnings) ? memory.warnings : [],
      markdown: handoff.markdown || "",
      artifactPaths: {
        markdown: markdownArtifact
      }
    },
    evidence: {
      schema: schemaEvidence,
      handoffVerifier: verifyEnvelope.body.result || null,
      metricPreservation: metricEvidence,
      privacyAudit: privacyEvidence,
      analyzeRunId: analyzeEnvelope.body.run_id,
      composeRunId: composeEnvelope.body.run_id,
      pageSpeedCapturedAt: slim.capturedAt
    }
  };
}

function findWeakestScore(scores) {
  return Object.entries(scores || {})
    .filter(([, value]) => typeof value === "number")
    .sort((a, b) => a[1] - b[1])
    .map(([name, value]) => ({ name, value }))[0] || {
      name: "performance",
      value: 0
    };
}

function normalizeValidationUrl(url, options = {}) {
  if ((!url || !String(url).trim()) && options.allowEmpty) {
    return "https://example.com/";
  }

  if (typeof url !== "string" || !url.trim()) {
    throw invalidRequest("URL is required.");
  }

  let parsed;

  try {
    parsed = new URL(url.trim());
  } catch (error) {
    throw invalidRequest("Enter a valid URL including https:// or http://.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw invalidRequest("Validation URL must use http:// or https://.");
  }

  return parsed.toString();
}

function normalizeMode(mode) {
  const normalized = String(mode || "standard").trim();

  if (!VALIDATION_MODES.has(normalized)) {
    throw invalidRequest("Workflow mode must be standard, l2_ollama, or l2_ollama_memory.");
  }

  return normalized;
}

function normalizePastedReport(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw invalidRequest("Pasted report must be valid JSON.");
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  throw invalidRequest("Pasted report must be a JSON object.");
}

function invalidRequest(message) {
  const error = new Error(message);
  error.code = "INVALID_REQUEST";
  error.statusCode = 400;
  return error;
}

function stepError(code, message, step, detail = null) {
  const error = new Error(message);
  error.code = code;
  error.step = step;
  error.detail = detail;
  return error;
}

function formatScoreName(name) {
  if (name === "bestPractices") {
    return "best practices";
  }

  return String(name || "performance").replace(/([A-Z])/g, " $1").toLowerCase();
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter((value) => typeof value === "string" && value.trim())));
}

module.exports = {
  createValidationRunner
};
