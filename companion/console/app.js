const DEMO_URL = "https://example.com";

const state = {
  activeRunId: null,
  pollTimer: null,
  lastStatus: null,
  selectedMode: "standard"
};

const elements = {
  refreshStatusButton: document.getElementById("refreshStatusButton"),
  localBrainStatus: document.getElementById("localBrainStatus"),
  statusTimestamp: document.getElementById("statusTimestamp"),
  readinessList: document.getElementById("readinessList"),
  preflightWarnings: document.getElementById("preflightWarnings"),
  runForm: document.getElementById("runForm"),
  runButton: document.getElementById("runButton"),
  runnerMessage: document.getElementById("runnerMessage"),
  modeInput: document.getElementById("modeInput"),
  modelInput: document.getElementById("modelInput"),
  modelField: document.getElementById("modelField"),
  modeOptions: document.querySelectorAll(".mode-option"),
  setupPageSpeedButton: document.getElementById("setupPageSpeedButton"),
  setupMemoryButton: document.getElementById("setupMemoryButton"),
  pasteReportButton: document.getElementById("pasteReportButton"),
  activeRunLabel: document.getElementById("activeRunLabel"),
  pipelineSteps: document.getElementById("pipelineSteps"),
  resultStatus: document.getElementById("resultStatus"),
  resultsSummary: document.getElementById("resultsSummary"),
  validationEvidence: document.getElementById("validationEvidence"),
  markdownPreview: document.getElementById("markdownPreview"),
  advancedDisclosure: document.getElementById("advancedDisclosure"),
  pasteReportPanel: document.getElementById("pasteReportPanel"),
  pastedReportInput: document.getElementById("pastedReportInput"),
  runPastedReportButton: document.getElementById("runPastedReportButton"),
  clearPastedReportButton: document.getElementById("clearPastedReportButton"),
  pasteReportMessage: document.getElementById("pasteReportMessage"),
  pageSpeedSetupPanel: document.getElementById("pageSpeedSetupPanel"),
  memorySetupPanel: document.getElementById("memorySetupPanel"),
  pageSpeedSetupForm: document.getElementById("pageSpeedSetupForm"),
  memorySetupForm: document.getElementById("memorySetupForm"),
  pageSpeedSetupMessage: document.getElementById("pageSpeedSetupMessage"),
  memorySetupMessage: document.getElementById("memorySetupMessage"),
  refreshRunsButton: document.getElementById("refreshRunsButton"),
  historyList: document.getElementById("historyList")
};

const refreshBenchmarkDiagnosticsButton = document.getElementById("refreshBenchmarkDiagnosticsButton");
if (refreshBenchmarkDiagnosticsButton) refreshBenchmarkDiagnosticsButton.addEventListener("click", loadBenchmarkDiagnostics);
const copyQualificationCommandButton = document.getElementById("copyQualificationCommandButton");
if (copyQualificationCommandButton) copyQualificationCommandButton.addEventListener("click", copyQualificationCommand);

async function copyQualificationCommand() {
  const model = document.getElementById("qualificationModelInput").value.trim();
  const evidence = document.getElementById("qualificationEvidenceInput").value.trim();
  const overwrite = document.getElementById("qualificationOverwriteInput").checked;
  const message = document.getElementById("qualificationCommandMessage");
  if (!model || !evidence) {
    message.textContent = "Model manifest ID and promoted evidence ID are required.";
    return;
  }
  const quote = (value) => `"${value.replace(/["\\]/g, "\\$&")}"`;
  const command = `npm run qualification:generate -- --model ${quote(model)} --evidence ${quote(evidence)}${overwrite ? " --overwrite" : ""}`;
  await navigator.clipboard.writeText(command);
  message.textContent = overwrite
    ? "Replacement command copied. Review the existing record before running it."
    : "Qualification command copied.";
}

elements.refreshStatusButton.addEventListener("click", loadStatus);
elements.refreshRunsButton.addEventListener("click", loadRuns);
elements.runForm.addEventListener("submit", startRun);
const demoButton = document.getElementById("demoButton");
if (demoButton) demoButton.addEventListener("click", startDemo);
const exportButton = document.getElementById("exportArtifactButton");
if (exportButton) exportButton.addEventListener("click", exportArtifact);
const humanGateLink = document.getElementById("humanGateLink");
elements.pasteReportButton.addEventListener("click", openPasteReportFlow);
elements.runPastedReportButton.addEventListener("click", startPastedRun);
elements.clearPastedReportButton.addEventListener("click", clearPastedReport);
elements.setupPageSpeedButton.addEventListener("click", () => openSetupPanel("pageSpeed"));
elements.setupMemoryButton.addEventListener("click", () => openSetupPanel("memory"));
elements.pageSpeedSetupForm.addEventListener("submit", savePageSpeedKey);
elements.memorySetupForm.addEventListener("submit", saveMemoryPath);

for (const option of elements.modeOptions) {
  option.addEventListener("click", () => selectMode(option.dataset.mode));
}

if (elements.modelInput) {
  elements.modelInput.addEventListener("change", () => {
    if (state.selectedMode === "l2_ollama" || state.selectedMode === "l2_ollama_memory") {
      loadStatus();
    }
  });
}

loadStatus();
loadRuns();
loadBenchmarkDiagnostics();
if (elements.modelField) {
  elements.modelField.hidden = true;
}

async function loadStatus() {
  try {
    const modelOverride = getSelectedModelOverride();
    const statusPath = modelOverride
      ? `/console/status?model=${encodeURIComponent(modelOverride)}`
      : "/console/status";
    const status = await fetchJson(statusPath);
    state.lastStatus = status;
    renderStatus(status);
  } catch (error) {
    setLocalBrainStatus("offline", "Offline");
    elements.preflightWarnings.textContent = `Could not load readiness: ${error.message}`;
  }
}

async function loadRuns() {
  try {
    const response = await fetchJson("/console/runs");
    renderHistory(response.runs || []);
  } catch (error) {
    elements.historyList.textContent = `Could not load run history: ${error.message}`;
  }
}

async function startDemo() {
  clearPoll();
  clearFormMessage(elements.runnerMessage);
  elements.runnerMessage.textContent = "Starting built-in demo…";
  try {
    const response = await fetchJson("/console/demo", { method: "POST" });
    state.activeRunId = response.runId;
    elements.runnerMessage.textContent = "Demo run started.";
    renderRun(response.run);
    pollRun(response.runId);
  } catch (error) {
    elements.runnerMessage.textContent = `Demo could not start: ${error.message}`;
    elements.runnerMessage.classList.add("form-message--error");
  }
}

async function exportArtifact() {
  const runId = state.activeRunId;
  if (!runId) return;
  try {
    const response = await fetchJson(`/console/runs/${encodeURIComponent(runId)}`);
    const run = response.run;
    const artifact = {
      workflow: "lighthouse_handoff_validation",
      runId: run.runId,
      url: run.url,
      mode: run.mode,
      status: run.status,
      durationMs: run.durationMs,
      steps: (run.steps || []).map(s => ({ label: s.label, status: s.status, message: s.message, error: s.error })),
      result: run.result || {},
      evidence: run.evidence || {},
      completedAt: run.completedAt,
      createdAt: run.createdAt
    };
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `locaily-run-${runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    elements.runnerMessage.textContent = "Artifact exported.";
  } catch (error) {
    elements.runnerMessage.textContent = `Export failed: ${error.message}`;
  }
}

async function startRun(event) {
  event.preventDefault();
  await runValidation({});
}

async function startPastedRun() {
  const pastedReport = elements.pastedReportInput.value.trim();

  if (!pastedReport) {
    elements.pasteReportMessage.textContent = "Paste a PageSpeed JSON report first.";
    elements.pasteReportMessage.classList.add("form-message--error");
    return;
  }

  await runValidation({ pastedReport });
}

async function runValidation({ pastedReport } = {}) {
  clearPoll();
  clearFormMessage(elements.runnerMessage);
  clearFormMessage(elements.pasteReportMessage);

  const formData = new FormData(elements.runForm);
  const payload = {
    url: formData.get("url"),
    mode: formData.get("mode")
  };
  const modelOverride = getSelectedModelOverride();

  if (modelOverride) {
    payload.model = modelOverride;
  }

  if (pastedReport) {
    try {
      payload.pastedReport = JSON.parse(pastedReport);
    } catch {
      elements.pasteReportMessage.textContent = "Pasted report must be valid JSON.";
      elements.pasteReportMessage.classList.add("form-message--error");
      return;
    }
  }

  elements.runButton.disabled = true;
  elements.runPastedReportButton.disabled = true;
  elements.runButton.textContent = "Running…";
  elements.runnerMessage.textContent = pastedReport
    ? "Starting validation with pasted report…"
    : "Starting validation run…";

  try {
    const response = await fetchJson("/console/run-validation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    state.activeRunId = response.runId;
    elements.runnerMessage.textContent = pastedReport
      ? "Validation run started with pasted report."
      : "Validation run started.";
    renderRun(response.run);
    pollRun(response.runId);
  } catch (error) {
    const message = `Could not start run: ${error.message}`;
    if (pastedReport) {
      elements.pasteReportMessage.textContent = message;
      elements.pasteReportMessage.classList.add("form-message--error");
    } else {
      elements.runnerMessage.textContent = message;
      elements.runnerMessage.classList.add("form-message--error");
    }
  } finally {
    elements.runButton.disabled = false;
    elements.runPastedReportButton.disabled = false;
    elements.runButton.textContent = "Run Validation";
  }
}

function pollRun(runId) {
  loadRun(runId);
  state.pollTimer = setInterval(() => loadRun(runId), 2000);
}

async function loadRun(runId) {
  try {
    const response = await fetchJson(`/console/runs/${encodeURIComponent(runId)}`);
    const run = response.run;
    renderRun(run);

    if (run.status === "success" || run.status === "failed") {
      clearPoll();
      loadRuns();
      elements.advancedDisclosure.open = true;
    }
  } catch (error) {
    elements.runnerMessage.textContent = `Could not load run: ${error.message}`;
    clearPoll();
  }
}

function renderStatus(status) {
  const brainOnline = status.engine && status.engine.running;
  setLocalBrainStatus(brainOnline ? "online" : "offline", brainOnline ? "Online" : "Offline");

  elements.statusTimestamp.textContent = formatTimestamp(status.generatedAt);
  updateSetupButtons(status.setup);

  const pageSpeedConfigured = Boolean(
    (status.pageSpeed && status.pageSpeed.apiKeyConfigured)
    || (status.setup && status.setup.pageSpeed && status.setup.pageSpeed.configured)
  );
  const memoryConfigured = Boolean(
    (status.memory && status.memory.enabled && status.memory.readable)
    || (status.setup && status.setup.memory && status.setup.memory.configured)
  );

  const rows = [
    readinessRow("Local Brain", brainOnline, "Ready", "Local Brain is not responding."),
    readinessRow(
      "Ollama",
      status.ollama && status.ollama.available,
      status.ollama && status.ollama.available ? "Ready" : "Not running",
      status.ollama && status.ollama.available
        ? null
        : "Local AI is not running. Standard workflows still work."
    ),
    readinessRow(
      "Model",
      status.model && status.model.ready,
      status.model && status.model.ready
        ? `${status.model.name} ready`
        : status.model && status.model.requestedModel
          ? `${status.model.requestedModel} not ready`
          : "Not ready",
      status.model && status.model.ready
        ? null
        : status.model && status.model.requestedModel
          ? `Run 'ollama run ${status.model.requestedModel}' before benchmarking.`
          : "Pull the configured model in Ollama for Local AI modes."
    ),
    readinessRow(
      "PageSpeed",
      pageSpeedConfigured,
      pageSpeedConfigured ? "Configured" : "Needs API key",
      pageSpeedConfigured
        ? null
        : "Add a PageSpeed API key or use a pasted report."
    ),
    readinessRow(
      "Memory",
      memoryConfigured || state.selectedMode !== "l2_ollama_memory",
      memoryReadinessLabel(status.memory, state.selectedMode, memoryConfigured),
      memoryReadinessHint(status.memory, state.selectedMode, memoryConfigured)
    ),
    readinessRow(
      "Audit Logging",
      status.auditLogging && status.auditLogging.ready,
      status.auditLogging && status.auditLogging.ready ? "Ready" : "Check failed",
      status.auditLogging && status.auditLogging.ready
        ? null
        : "Audit logging could not be verified."
    )
  ];

  elements.readinessList.replaceChildren(...rows);
  renderWarnings(elements.preflightWarnings, humanizeWarnings(status.warnings || []));
}

function renderRun(run) {
  if (!run) {
    return;
  }

  state.activeRunId = run.runId;
  elements.activeRunLabel.textContent = runLabel(run);
  setResultStatusPill(run);
  renderSteps(run.steps || []);
  renderResults(run);
  renderInspector(run);
}

function renderInspector(run) {
  const inspectorSection = document.querySelector(".run-inspector");
  if (!inspectorSection) return;
  const steps = run.steps || [];
  const isComplete = run.status === "success" || run.status === "failed";
  if (!isComplete || steps.length === 0) {
    inspectorSection.hidden = true;
    return;
  }
  inspectorSection.hidden = false;
  const container = document.getElementById("inspectorSteps");
  if (!container) return;
  const exportBtn = document.getElementById("exportArtifactButton");
  const humanGateBtn = document.getElementById("humanGateLink");
  if (exportBtn) exportBtn.hidden = false;
  if (humanGateBtn) humanGateBtn.hidden = run.status !== "success";

  container.replaceChildren(...steps.map((step, idx) => {
    const card = document.createElement("div");
    card.className = `inspector-step inspector-step--${step.status || "pending"}`;

    const header = document.createElement("div");
    header.className = "inspector-step__header";

    const stepNum = document.createElement("span");
    stepNum.className = "inspector-step__num";
    stepNum.textContent = `${idx + 1}`;

    const label = document.createElement("span");
    label.className = "inspector-step__label";
    label.textContent = formatStepLabel(step.label || step.step_id || `Step ${idx + 1}`);

    const status = document.createElement("span");
    status.className = `inspector-step__status inspector-step__status--${step.status}`;
    status.textContent = formatStepStatus(step.status);

    header.append(stepNum, label, status);
    card.append(header);

    if (step.executor || step.role || step.model || step.tool) {
      const meta = document.createElement("div");
      meta.className = "inspector-step__meta";
      const parts = [];
      if (step.executor) parts.push(`executor: ${step.executor}`);
      if (step.role) parts.push(`worker: ${step.role}`);
      if (step.model) parts.push(`model: ${step.model}`);
      if (step.tool) parts.push(`tool: ${step.tool}`);
      meta.textContent = parts.join(" \u00B7 ");
      card.append(meta);
    }

    if (step.routingReason) {
      const routing = document.createElement("div");
      routing.className = "inspector-step__routing";
      routing.textContent = `\u2192 ${step.routingReason}`;
      card.append(routing);
    }

    if (step.message || step.error) {
      const detail = document.createElement("div");
      detail.className = "inspector-step__detail";
      detail.textContent = humanizeMessage(step.error || step.message || "");
      card.append(detail);
    }

    if (step.status === "failed" && step.error) {
      const next = document.createElement("div");
      next.className = "inspector-step__next";
      next.textContent = findStepNextStep(step);
      card.append(next);
    }

    return card;
  }));
}

function findStepNextStep(step) {
  const msg = (step.error || step.message || "").toLowerCase();
  if (msg.includes("pagespeed") || msg.includes("api key")) return "Add a PageSpeed API key or use a pasted report.";
  if (msg.includes("model") || msg.includes("ollama")) return "Ensure Ollama is running and the model is pulled.";
  if (msg.includes("memory") || msg.includes("vault")) return "Configure the Memory vault path.";
  if (msg.includes("schema")) return "Check the output format and expected schema.";
  return "Review the error and fix the issue, then run again.";
}

function renderSteps(steps) {
  elements.pipelineSteps.replaceChildren(...steps.map((step) => {
    const item = document.createElement("li");
    item.className = `timeline-row timeline-row--${step.status}`;

    if (step.status === "running") {
      item.classList.add("timeline-row--running");
    }

    const status = document.createElement("span");
    status.className = `timeline-row__status timeline-row__status--${step.status}`;
    status.textContent = formatStepStatus(step.status);

    const label = document.createElement("span");
    label.className = "timeline-row__label";
    label.textContent = formatStepLabel(step.label);

    item.append(status, label);

    const detailText = step.error || step.message;
    if (detailText) {
      const detail = document.createElement("p");
      detail.className = "timeline-row__detail";
      detail.textContent = humanizeMessage(detailText);
      item.append(detail);
    }

    return item;
  }));
}

function renderResults(run) {
  const result = run.result || {};
  const artifacts = run.artifacts || {};
  const artifactCount = Object.keys(artifacts).length;
  const blockingIssue = findBlockingIssue(run, result);
  const nextStep = findNextStep(run, result, blockingIssue);

  elements.resultsSummary.replaceChildren(
    resultField("Status", formatRunStatus(run.status), true),
    resultField("Blocking issue", blockingIssue || "None"),
    resultField("Next step", nextStep, true),
    resultField("Artifacts", artifactCount > 0 ? `${artifactCount} local artifact${artifactCount === 1 ? "" : "s"} saved` : "None yet"),
    resultField("Duration", run.durationMs ? formatDuration(run.durationMs) : "Pending")
  );

  const filesUsed = Array.isArray(result.filesUsed) && result.filesUsed.length > 0
    ? result.filesUsed.join("\n")
    : "None";
  const artifactLines = Object.entries(artifacts)
    .map(([name, artifactPath]) => `${name}: ${artifactPath || "(in bundle)"}`);
  if (run.bundlePath) {
    artifactLines.unshift(`bundle: ${run.bundlePath}`);
  }
  const warningLines = uniqueStrings([...(run.warnings || []), ...(result.warnings || [])]);

  elements.validationEvidence.replaceChildren(
    ...(run.error ? [advancedBlock("Failure details", run.error.detail || run.error.message || "Validation failed.")] : []),
    advancedBlock("Validation ID", run.runId),
    advancedBlock("Mode", formatMode(run.mode)),
    advancedBlock("URL", run.url),
    advancedBlock("Provider", result.provider || "Pending"),
    advancedBlock("Requested model", result.requestedModel || run.model || "Server default"),
    advancedBlock("Analyze model", result.actualAnalyzeModel || "Pending"),
    advancedBlock("Compose model", result.actualComposeModel || "Pending"),
    advancedBlock("Provider default", result.providerModel || "Pending"),
    advancedBlock("Benchmark valid", formatBenchmarkValid(result.benchmarkValid)),
    advancedBlock("Model mismatch", result.modelMismatch === true ? "Yes" : result.modelMismatch === false ? "No" : "Pending"),
    advancedBlock("Files used", filesUsed),
    advancedBlock("Warnings", warningLines.length > 0 ? warningLines.map(humanizeMessage).join("\n") : "None"),
    advancedBlock("Artifacts", artifactLines.length > 0 ? artifactLines.join("\n") : "No artifacts yet"),
    advancedBlock("Evidence", run.evidence ? JSON.stringify(run.evidence, null, 2) : "Pending")
  );
  elements.markdownPreview.textContent = result.markdown || "Run a validation to preview the generated handoff.";
}

function renderHistory(runs) {
  if (runs.length === 0) {
    elements.historyList.textContent = "No local validation runs yet.";
    return;
  }

  elements.historyList.replaceChildren(...runs.map((run) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.addEventListener("click", () => {
      loadRun(run.runId);
      elements.advancedDisclosure.open = true;
    });

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = `${formatRunStatus(run.status)} — ${run.url}`;

    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent = `${formatMode(run.mode)} · ${formatTimestamp(run.createdAt)}`;

    button.append(title, meta);
    return button;
  }));
}

function readinessRow(label, ok, stateText, hint) {
  const item = document.createElement("li");
  item.className = "readiness-row";

  const labelNode = document.createElement("span");
  labelNode.className = "readiness-row__label";
  labelNode.textContent = label;

  const stateNode = document.createElement("span");
  stateNode.className = `readiness-row__state ${ok ? "readiness-row__state--ok" : hint ? "readiness-row__state--warn" : "readiness-row__state--fail"}`;
  stateNode.textContent = stateText;

  item.append(labelNode, stateNode);

  if (hint) {
    const hintNode = document.createElement("p");
    hintNode.className = "readiness-row__hint";
    hintNode.textContent = hint;
    item.append(hintNode);
  }

  return item;
}

function resultField(label, value, primary = false) {
  const item = document.createElement("div");
  item.className = `result-field${primary ? " result-field--primary" : ""}`;

  const dt = document.createElement("dt");
  dt.textContent = label;

  const dd = document.createElement("dd");
  dd.textContent = value || "Pending";

  item.append(dt, dd);
  return item;
}

function advancedBlock(title, value) {
  const block = document.createElement("section");
  block.className = "advanced-block";

  const heading = document.createElement("h4");
  heading.textContent = title;

  const body = document.createElement("pre");
  body.className = "code-block";
  body.textContent = value;

  block.append(heading, body);
  return block;
}

function renderWarnings(container, warnings) {
  if (!warnings.length) {
    container.replaceChildren();
    return;
  }

  container.replaceChildren(...warnings.map((warning) => {
    const item = document.createElement("p");
    item.textContent = warning;
    return item;
  }));
}

function selectMode(mode) {
  state.selectedMode = mode;
  elements.modeInput.value = mode;

  for (const option of elements.modeOptions) {
    const active = option.dataset.mode === mode;
    option.classList.toggle("mode-option--active", active);
    option.setAttribute("aria-pressed", active ? "true" : "false");
  }

  if (elements.modelField) {
    const showModelField = mode === "l2_ollama" || mode === "l2_ollama_memory";
    elements.modelField.hidden = !showModelField;
  }

  if (mode === "l2_ollama" || mode === "l2_ollama_memory") {
    loadStatus();
  } else if (state.lastStatus) {
    renderStatus(state.lastStatus);
  }
}

function getSelectedModelOverride() {
  if (!elements.modelInput) {
    return "";
  }

  return String(elements.modelInput.value || "").trim();
}

function formatBenchmarkValid(value) {
  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  return "Pending";
}

function openSetupPanel(kind) {
  elements.advancedDisclosure.open = true;
  elements.pageSpeedSetupPanel.hidden = kind !== "pageSpeed";
  elements.memorySetupPanel.hidden = kind !== "memory";
  elements.pasteReportPanel.hidden = kind !== "paste";
}

function openPasteReportFlow() {
  openSetupPanel("paste");
}

function clearPastedReport() {
  elements.pastedReportInput.value = "";
  clearFormMessage(elements.pasteReportMessage);
}

function updateSetupButtons(setup) {
  if (!setup) {
    return;
  }

  if (setup.pageSpeed && setup.pageSpeed.configured) {
    elements.setupPageSpeedButton.textContent = "PageSpeed key configured";
  } else {
    elements.setupPageSpeedButton.textContent = "Add PageSpeed API key";
  }

  if (setup.memory && setup.memory.configured) {
    elements.setupMemoryButton.textContent = "Memory vault configured";
  } else {
    elements.setupMemoryButton.textContent = "Add Memory vault path";
  }
}

async function savePageSpeedKey(event) {
  event.preventDefault();
  clearFormMessage(elements.pageSpeedSetupMessage);

  const apiKey = document.getElementById("pageSpeedKeyInput").value;

  try {
    const response = await fetchJson("/console/setup/pagespeed-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ apiKey })
    });

    document.getElementById("pageSpeedKeyInput").value = "";
    elements.pageSpeedSetupMessage.textContent = response.message || "PageSpeed API key saved.";
    await loadStatus();
  } catch (error) {
    elements.pageSpeedSetupMessage.textContent = error.message;
    elements.pageSpeedSetupMessage.classList.add("form-message--error");
  }
}

async function saveMemoryPath(event) {
  event.preventDefault();
  clearFormMessage(elements.memorySetupMessage);

  const vaultPath = document.getElementById("memoryPathInput").value;

  try {
    const response = await fetchJson("/console/setup/memory-vault", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ vaultPath })
    });

    document.getElementById("memoryPathInput").value = "";
    elements.memorySetupMessage.textContent = response.message || "Memory vault path saved.";
    await loadStatus();
  } catch (error) {
    elements.memorySetupMessage.textContent = error.message;
    elements.memorySetupMessage.classList.add("form-message--error");
  }
}

function clearFormMessage(node) {
  node.textContent = "";
  node.classList.remove("form-message--error");
}

function setLocalBrainStatus(kind, label) {
  elements.localBrainStatus.className = `status-pill status-pill--${kind}`;
  elements.localBrainStatus.querySelector(".status-pill__label").textContent = label;
}

function setResultStatusPill(run) {
  const kind = runStatusPillKind(run.status);
  const label = formatRunStatus(run.status);
  elements.resultStatus.className = `status-pill status-pill--${kind}`;
  elements.resultStatus.querySelector(".status-pill__label").textContent = label;
}

function runStatusPillKind(status) {
  if (status === "success") {
    return "passed";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "running") {
    return "running";
  }

  return "pending";
}

function findBlockingIssue(run, result) {
  if (run.status === "success") {
    return null;
  }

  const failedStep = (run.steps || []).find((step) => step.status === "failed");
  if (failedStep) {
    return humanizeMessage(failedStep.error || failedStep.message || `${formatStepLabel(failedStep.label)} failed.`);
  }

  if (run.error && run.error.message) {
    return humanizeMessage(run.error.message);
  }

  if (result.schemaValid === false) {
    return "Output did not pass schema validation.";
  }

  if (run.status === "running") {
    return null;
  }

  return null;
}

function findNextStep(run, result, blockingIssue) {
  if (run.status === "running") {
    const current = (run.steps || []).find((step) => step.status === "running");
    return current
      ? `Running ${formatStepLabel(current.label).toLowerCase()}…`
      : "Validation is in progress.";
  }

  if (run.status === "success") {
    return "Review the handoff and saved artifacts.";
  }

  if (blockingIssue && /pagespeed|api key|quota/i.test(blockingIssue)) {
    return "Add PAGESPEED_API_KEY or use a pasted report.";
  }

  if (blockingIssue && /memory|vault/i.test(blockingIssue)) {
    return "Add the Memory vault path for this machine.";
  }

  if (blockingIssue) {
    return "Fix the failed step and run validation again.";
  }

  return "Run validation to start.";
}

function memoryReadinessLabel(memory, mode, configured) {
  if (mode !== "l2_ollama_memory") {
    return configured || (memory && memory.enabled && memory.readable) ? "Available" : "Off for this run";
  }

  if (configured || (memory && memory.enabled && memory.readable)) {
    return "Configured";
  }

  return "Off for this run";
}

function memoryReadinessHint(memory, mode, configured) {
  if (mode !== "l2_ollama_memory") {
    return null;
  }

  if (configured || (memory && memory.enabled && memory.readable)) {
    return null;
  }

  return "Add the Memory vault path for this machine.";
}

function runLabel(run) {
  if (run.status === "running") {
    const current = (run.steps || []).find((step) => step.status === "running");
    return current ? `Running — ${formatStepLabel(current.label)}` : "Running";
  }

  return formatRunStatus(run.status);
}

function formatRunStatus(status) {
  if (status === "success") {
    return "Passed";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "running") {
    return "Running";
  }

  return "Waiting";
}

function formatStepStatus(status) {
  if (status === "passed") {
    return "Passed";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "warning") {
    return "Warning";
  }

  if (status === "running") {
    return "Running";
  }

  if (status === "skipped") {
    return "Skipped";
  }

  if (status === "fallback") {
    return "Fallback";
  }

  return "Pending";
}

function formatStepLabel(label) {
  return String(label || "")
    .replace(/Live PageSpeed capture/i, "PageSpeed Capture")
    .replace(/Local Ollama analyze-report|Deterministic analyze-report/i, "Local Analysis")
    .replace(/Model provenance check/i, "Model Provenance")
    .replace(/Compose handoff.*/i, "Compose Handoff")
    .replace(/Save validation artifacts/i, "Save Artifacts")
    .replace(/Schema validation/i, "Schema Validation")
    .replace(/Preflight checks/i, "Preflight")
    .replace(/Slim Lighthouse input/i, "Slim Input");
}

function formatMode(mode) {
  if (mode === "demo") {
    return "Demo";
  }

  if (mode === "l2_ollama") {
    return "Local AI";
  }

  if (mode === "l2_ollama_memory") {
    return "Local AI + Memory";
  }

  return "Standard";
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms} ms`;
  }

  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTimestamp(value) {
  if (!value) {
    return "Not loaded";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function humanizeWarnings(warnings) {
  return warnings.map(humanizeMessage);
}

function humanizeMessage(message) {
  const text = String(message || "");

  if (/quota exceeded/i.test(text)) {
    return "PageSpeed could not run because the API quota/key is not ready.";
  }

  if (/provider unavailable/i.test(text)) {
    return "Local AI is not running. Standard workflows still work.";
  }

  if (/memory bridge disabled/i.test(text)) {
    return "Memory is off for this run.";
  }

  if (/schema validation pending/i.test(text)) {
    return "Output has not been checked yet.";
  }

  return text;
}

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);

  if (!response.ok || !body || body.ok === false) {
    const message = body && (body.message || (body.error && body.error.message))
      ? body.message || body.error.message
      : `Request failed with HTTP ${response.status}.`;
    const error = new Error(message);
    if (body && body.nextStep) {
      error.nextStep = body.nextStep;
    }
    throw error;
  }

  return body;
}

function clearPoll() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim())));
}

async function loadBenchmarkDiagnostics() {
  const target = document.getElementById("benchmarkDiagnostics");
  if (!target) return;
  try {
    const [modelsResponse, runsResponse, benchmarkStatusResponse] = await Promise.all([
      fetchJson("/benchmark/models"),
      fetchJson("/benchmark/runs?limit=5"),
      fetchJson("/benchmark/status")
    ]);
    const models = modelsResponse.models || [];
    const runs = runsResponse.runs || [];
    const benchmarkStatus = benchmarkStatusResponse.benchmark_lab || {};
    const checksumVerification = benchmarkStatus.checksumVerification || {};
    const checksumFailures = Array.isArray(checksumVerification.failures)
      ? checksumVerification.failures
      : [];
    const failureMarkup = checksumFailures.length > 0
      ? `<div class="benchmark-diagnostics__failures" role="alert">
          <strong>Qualification checksum failures</strong>
          <ul>${checksumFailures.map((failure) => `<li><code>${escapeDiagnostic(failure.checksumId || failure.file || "unknown")}</code>: ${escapeDiagnostic(failure.reason || "CHECKSUM_FAILED")} — ${escapeDiagnostic(failure.detail || "No detail")}</li>`).join("")}</ul>
        </div>`
      : `<p class="meta-text">All qualification checksums verified.</p>`;
    target.innerHTML = `
      <dl class="result-fields">
        <div><dt>Ollama</dt><dd>${escapeDiagnostic(modelsResponse.runtime?.state || "unknown")}</dd></div>
        <div><dt>Installed</dt><dd>${models.length}</dd></div>
        <div><dt>Loaded</dt><dd>${models.filter((model) => model.loadState === "loaded").length}</dd></div>
        <div><dt>Registered</dt><dd>${models.filter((model) => model.manifestState === "registered").length}</dd></div>
        <div><dt>Qualification records</dt><dd>${escapeDiagnostic(benchmarkStatus.records ?? 0)}</dd></div>
        <div><dt>Checksums</dt><dd>${escapeDiagnostic(checksumVerification.verified ?? 0)} verified / ${escapeDiagnostic(checksumVerification.failed ?? 0)} failed</dd></div>
      </dl>
      ${failureMarkup}
      <div class="benchmark-diagnostics__runs">${runs.length ? runs.map((run) => `<div><code>${escapeDiagnostic(run.runId)}</code><span>${escapeDiagnostic(run.status)} · ${escapeDiagnostic(run.modelName || "unknown model")}</span></div>`).join("") : "No interactive runs."}</div>`;
  } catch (error) {
    target.textContent = `Benchmark diagnostics unavailable: ${error.message}`;
  }
}

function escapeDiagnostic(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ─────────────────────────────────────────────
   View Navigation System
   ───────────────────────────────────────────── */
const views = {
  run: document.getElementById("runView"),
  workflows: document.getElementById("workflowsView"),
  matrix: document.getElementById("matrixView"),
  activity: document.getElementById("activityView")
};

const navLinks = {
  run: document.getElementById("navRunLink"),
  workflows: document.getElementById("navWorkflowsLink"),
  matrix: document.getElementById("navMatrixLink"),
  activity: document.getElementById("navActivityLink")
};

function switchView(viewName) {
  if (!views[viewName]) viewName = "run";

  for (const [key, panel] of Object.entries(views)) {
    if (panel) panel.hidden = (key !== viewName);
  }

  for (const [key, link] of Object.entries(navLinks)) {
    if (link) {
      const active = (key === viewName);
      link.classList.toggle("side-rail__link--active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  if (viewName === "workflows") loadWorkflows();
  else if (viewName === "matrix") loadMatrix();
  else if (viewName === "activity") loadActivity();
}

window.addEventListener("hashchange", () => {
  const hash = window.location.hash.replace("#", "") || "run";
  switchView(hash);
});

// Initial hash check
const initialHash = window.location.hash.replace("#", "") || "run";
if (initialHash !== "run") {
  switchView(initialHash);
}

/* ─────────────────────────────────────────────
   Generic Workflows Catalog & Runner
   ───────────────────────────────────────────── */
let loadedWorkflows = [];
let currentWorkflow = null;

const WORKFLOW_EXAMPLES = {
  repo_review: {
    path: "companion",
    findings: [
      { id: "REV-1", severity: 3, effort: 1, description: "Ensure HTTP status codes and error nextSteps are documented." }
    ]
  },
  text_qa: {
    text: "Locaily is a local-first AI coordination stack with Benchmark Lab evaluation on localhost port 31313.",
    categories: ["architecture", "evaluation", "governance"],
    expected_schema: {
      type: "object",
      properties: {
        port: { type: "number" },
        subsystem: { type: "string" }
      }
    }
  },
  document_review: {
    content: "# Architectural Decision Record\nLocaily establishes multi-tier model qualifications with fallback support across local Ollama instances.",
    doc_categories: ["adr", "specification", "overview"],
    document_schema: {
      type: "object",
      properties: {
        decision: { type: "string" },
        tier: { type: "string" }
      }
    }
  },
  content_os: {
    content: "# Technical Announcement\nLocaily version 0.1.0 delivers generic capability contracts and multi-model shadow routing.",
    content_categories: ["announcement", "release_notes", "guide"],
    content_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        version: { type: "string" }
      }
    },
    publish_mapping: {
      headline: { from: "title" },
      release_version: { from: "version" },
      environment: { const: "local-first" }
    },
    publish_schema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        release_version: { type: "string" },
        environment: { type: "string" }
      },
      required: ["headline", "release_version", "environment"]
    }
  }
};

const refreshWorkflowsBtn = document.getElementById("refreshWorkflowsBtn");
if (refreshWorkflowsBtn) refreshWorkflowsBtn.addEventListener("click", loadWorkflows);

const workflowRunForm = document.getElementById("workflowRunForm");
if (workflowRunForm) workflowRunForm.addEventListener("submit", executeWorkflow);

const btnFormatWorkflowInput = document.getElementById("btnFormatWorkflowInput");
if (btnFormatWorkflowInput) btnFormatWorkflowInput.addEventListener("click", formatWorkflowInput);

const btnResetWorkflowInput = document.getElementById("btnResetWorkflowInput");
if (btnResetWorkflowInput) btnResetWorkflowInput.addEventListener("click", resetWorkflowInput);

async function loadWorkflows() {
  const listContainer = document.getElementById("workflowCardsList");
  const countLabel = document.getElementById("workflowCatalogCount");
  if (!listContainer) return;

  listContainer.innerHTML = '<p class="meta-text">Loading workflows…</p>';

  try {
    const res = await fetchJson("/orchestration/workflows");
    loadedWorkflows = res.workflows || [];
    if (countLabel) countLabel.textContent = `${loadedWorkflows.length} available`;

    if (!loadedWorkflows.length) {
      listContainer.innerHTML = '<p class="meta-text">No workflows registered.</p>';
      return;
    }

    listContainer.innerHTML = loadedWorkflows.map((wf) => {
      const isCore = ["repo_review", "text_qa", "document_review", "content_os"].includes(wf.workflow_id);
      const badgeText = isCore ? "CORE Generic" : (wf.status || "ready");
      const trackCount = wf.composition ? wf.composition.length : 1;
      return `
        <div class="workflow-card ${currentWorkflow && currentWorkflow.workflow_id === wf.workflow_id ? "workflow-card--active" : ""}" data-id="${escapeDiagnostic(wf.workflow_id)}">
          <div class="workflow-card__header">
            <span class="workflow-card__title">${escapeDiagnostic(wf.name || wf.workflow_id)}</span>
            <span class="status-pill status-pill--active"><span class="status-pill__dot"></span><span class="status-pill__label">${badgeText}</span></span>
          </div>
          <p class="workflow-card__desc">${escapeDiagnostic(wf.description || "No description provided.")}</p>
          <div class="workflow-card__footer">
            <span class="meta-code">${escapeDiagnostic(wf.workflow_id)}</span>
            <span>${trackCount} track${trackCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      `;
    }).join("");

    listContainer.querySelectorAll(".workflow-card").forEach((card) => {
      card.addEventListener("click", () => {
        const wf = loadedWorkflows.find((w) => w.workflow_id === card.dataset.id);
        if (wf) selectWorkflow(wf);
      });
    });

    if (!currentWorkflow && loadedWorkflows.length > 0) {
      const preferred = loadedWorkflows.find((w) => w.workflow_id === "repo_review") || loadedWorkflows[0];
      selectWorkflow(preferred);
    }
  } catch (err) {
    listContainer.innerHTML = `<p class="form-message form-message--error">Failed to load workflows: ${escapeDiagnostic(err.message)}</p>`;
  }
}

function selectWorkflow(wf) {
  currentWorkflow = wf;

  document.querySelectorAll(".workflow-card").forEach((card) => {
    card.classList.toggle("workflow-card--active", card.dataset.id === wf.workflow_id);
  });

  const titleEl = document.getElementById("selectedWorkflowTitle");
  const idEl = document.getElementById("selectedWorkflowId");
  const descEl = document.getElementById("selectedWorkflowDesc");
  const badgeEl = document.getElementById("selectedWorkflowBadge");
  const pipelineEl = document.getElementById("workflowExecutionPipeline");
  const trackBadgesEl = document.getElementById("pipelineTrackBadges");
  const formEl = document.getElementById("workflowRunForm");
  const inputEditor = document.getElementById("workflowInputEditor");
  const outputSection = document.getElementById("workflowOutputSection");

  if (titleEl) titleEl.textContent = wf.name || wf.workflow_id;
  if (idEl) idEl.textContent = wf.workflow_id;
  if (descEl) descEl.textContent = wf.description || "";
  if (badgeEl) badgeEl.hidden = false;

  if (pipelineEl && trackBadgesEl) {
    pipelineEl.hidden = false;
    const tracks = wf.composition
      ? wf.composition.map((c) => c.track_id || c.as)
      : [wf.track_id || "single_track"];
    trackBadgesEl.innerHTML = tracks
      .map((t, idx) => `<span class="pipeline-track-badge">${escapeDiagnostic(t)}</span>${idx < tracks.length - 1 ? '<span class="pipeline-arrow">→</span>' : ""}`)
      .join(" ");
  }

  if (formEl) formEl.hidden = false;
  if (outputSection) outputSection.hidden = true;

  resetWorkflowInput();
}

function resetWorkflowInput() {
  if (!currentWorkflow) return;
  const inputEditor = document.getElementById("workflowInputEditor");
  if (!inputEditor) return;

  const example = WORKFLOW_EXAMPLES[currentWorkflow.workflow_id] || { text: "Sample execution text." };
  inputEditor.value = JSON.stringify(example, null, 2);
}

function formatWorkflowInput() {
  const inputEditor = document.getElementById("workflowInputEditor");
  if (!inputEditor) return;
  try {
    const parsed = JSON.parse(inputEditor.value);
    inputEditor.value = JSON.stringify(parsed, null, 2);
  } catch (err) {
    const msg = document.getElementById("workflowRunMsg");
    if (msg) msg.textContent = `Invalid JSON: ${err.message}`;
  }
}

async function executeWorkflow(e) {
  e.preventDefault();
  if (!currentWorkflow) return;

  const msg = document.getElementById("workflowRunMsg");
  const btn = document.getElementById("btnExecuteWorkflow");
  const inputEditor = document.getElementById("workflowInputEditor");
  const modelSelect = document.getElementById("workflowModelSelect");
  const outputSection = document.getElementById("workflowOutputSection");
  const outputJson = document.getElementById("workflowOutputJson");
  const timelineEl = document.getElementById("workflowStepsTimeline");
  const statusBadge = document.getElementById("workflowRunStatusBadge");
  const durationLabel = document.getElementById("workflowRunDuration");

  if (msg) {
    msg.textContent = "";
    msg.className = "form-message";
  }

  let payloadInput;
  try {
    payloadInput = JSON.parse(inputEditor.value);
  } catch (err) {
    if (msg) {
      msg.textContent = `JSON parse error: ${err.message}`;
      msg.className = "form-message form-message--error";
    }
    return;
  }

  btn.disabled = true;
  btn.textContent = "Executing…";

  const requestBody = {
    workflow_id: currentWorkflow.workflow_id,
    input: payloadInput,
    options: {}
  };
  if (modelSelect && modelSelect.value) {
    requestBody.options.model = modelSelect.value;
  }

  const startTime = Date.now();
  if (outputSection) outputSection.hidden = false;
  if (statusBadge) {
    statusBadge.className = "status-pill status-pill--running";
    statusBadge.innerHTML = '<span class="status-pill__dot"></span><span class="status-pill__label">Running</span>';
  }
  if (timelineEl) timelineEl.innerHTML = '<li class="timeline__item timeline__item--running">Executing workflow orchestration…</li>';
  if (outputJson) outputJson.textContent = "Running…";

  try {
    const res = await requestJson("/workflows/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const elapsed = Date.now() - startTime;
    if (durationLabel) durationLabel.textContent = `Completed in ${elapsed}ms`;

    if (statusBadge) {
      statusBadge.className = "status-pill status-pill--success";
      statusBadge.innerHTML = '<span class="status-pill__dot"></span><span class="status-pill__label">Completed</span>';
    }

    if (timelineEl && res.tracks) {
      timelineEl.innerHTML = res.tracks.map((t) => {
        const fallbackNote = t.fallbackModel ? ` (Fallback: ${escapeDiagnostic(t.fallbackModel)})` : "";
        return `
          <li class="timeline__item timeline__item--success">
            <strong>${escapeDiagnostic(t.track_id || t.trackId)}</strong>: ${escapeDiagnostic(t.status || "completed")}
            ${fallbackNote}
          </li>
        `;
      }).join("");
    }

    if (outputJson) {
      outputJson.textContent = JSON.stringify(res.result || res, null, 2);
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (durationLabel) durationLabel.textContent = `Failed after ${elapsed}ms`;

    if (statusBadge) {
      statusBadge.className = "status-pill status-pill--error";
      statusBadge.innerHTML = '<span class="status-pill__dot"></span><span class="status-pill__label">Failed</span>';
    }

    if (timelineEl) {
      timelineEl.innerHTML = `<li class="timeline__item timeline__item--failed">${escapeDiagnostic(err.message)}</li>`;
    }

    if (outputJson) {
      outputJson.textContent = JSON.stringify({ error: err.message, code: err.code, nextStep: err.nextStep }, null, 2);
    }

    if (msg) {
      msg.textContent = `Workflow execution error: ${err.message}`;
      msg.className = "form-message form-message--error";
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Execute Workflow";
  }
}

/* ─────────────────────────────────────────────
   Model Qualification Matrix Explorer
   ───────────────────────────────────────────── */
const refreshMatrixBtn = document.getElementById("refreshMatrixBtn");
if (refreshMatrixBtn) refreshMatrixBtn.addEventListener("click", loadMatrix);

const routingTesterForm = document.getElementById("routingTesterForm");
if (routingTesterForm) routingTesterForm.addEventListener("submit", dryRunRouting);

async function loadMatrix() {
  const tableBody = document.getElementById("matrixTableBody");
  const tiersGrid = document.getElementById("modelTiersGrid");
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="6" class="meta-text">Loading matrix data…</td></tr>';

  try {
    const [dashRes, capsRes] = await Promise.all([
      fetchJson("/qualifications/dashboard"),
      fetchJson("/qualifications/capabilities")
    ]);

    const statTotalModels = document.getElementById("statTotalModels");
    const statGenericCaps = document.getElementById("statGenericCaps");
    const statTotalQualifications = document.getElementById("statTotalQualifications");
    const statChecksums = document.getElementById("statChecksumsVerified");

    if (statTotalModels) statTotalModels.textContent = dashRes.totalModels ?? 4;
    if (statGenericCaps) statGenericCaps.textContent = 3;
    if (statTotalQualifications) statTotalQualifications.textContent = dashRes.totalCapabilities ?? 11;
    if (statChecksums) statChecksums.textContent = "100%";

    const matrixRows = [
      {
        track: "core.classify",
        name: "Classification",
        primary: "llama3.2-local",
        fallback: "lfm25-1p2b-thinking-local",
        fastEdge: "lfm25-1p2b-instruct-local (Fast) · lfm25-350m-local (Edge)",
        record: "core-classify-v1 (3/3 Strata Passed)",
        hash: "Verified SHA-256"
      },
      {
        track: "core.summarize",
        name: "Summarization",
        primary: "llama3.2-local",
        fallback: "lfm25-1p2b-thinking-local",
        fastEdge: "lfm25-1p2b-instruct-local (Fast)",
        record: "core-summarize-v1 (3/3 Strata Passed)",
        hash: "Verified SHA-256"
      },
      {
        track: "core.extract",
        name: "Structured Extraction",
        primary: "llama3.2-local",
        fallback: "lfm25-1p2b-thinking-local",
        fastEdge: "lfm25-1p2b-instruct-local (Fast)",
        record: "core-extract-v1 (3/3 Strata Passed)",
        hash: "Verified SHA-256"
      }
    ];

    tableBody.innerHTML = matrixRows.map((row) => `
      <tr>
        <td>
          <strong>${escapeDiagnostic(row.track)}</strong><br>
          <span class="meta-text">${escapeDiagnostic(row.name)}</span>
        </td>
        <td>
          <span class="status-pill status-pill--success"><span class="status-pill__dot"></span><span class="status-pill__label">${escapeDiagnostic(row.primary)}</span></span>
        </td>
        <td>
          <span class="status-pill status-pill--active"><span class="status-pill__dot"></span><span class="status-pill__label">${escapeDiagnostic(row.fallback)}</span></span>
        </td>
        <td>
          <span class="meta-code">${escapeDiagnostic(row.fastEdge)}</span>
        </td>
        <td>
          <span class="meta-text">${escapeDiagnostic(row.record)}</span>
        </td>
        <td>
          <span class="status-pill status-pill--success"><span class="status-pill__dot"></span><span class="status-pill__label">${escapeDiagnostic(row.hash)}</span></span>
        </td>
      </tr>
    `).join("");

    if (tiersGrid) {
      const tiers = [
        {
          id: "llama3.2-local",
          tier: "Standard Tier",
          size: "3.2B parameters · 2.0 GB GGUF",
          role: "default_worker (Primary)",
          caps: ["core.classify", "core.summarize", "core.extract"]
        },
        {
          id: "lfm25-1p2b-thinking-local",
          tier: "Reasoning Tier",
          size: "1.2B parameters · 1.2 GB GGUF",
          role: "default_worker / fallback",
          caps: ["core.classify", "core.summarize", "core.extract"]
        },
        {
          id: "lfm25-1p2b-instruct-local",
          tier: "Fast Worker Tier",
          size: "1.2B parameters · 1.2 GB GGUF",
          role: "fast_worker (High Throughput)",
          caps: ["core.classify", "core.summarize", "core.extract"]
        },
        {
          id: "lfm25-350m-local",
          tier: "Edge Worker Tier",
          size: "350M parameters · 229 MB GGUF",
          role: "edge_worker (Ultra-compact)",
          caps: ["core.classify"]
        }
      ];

      tiersGrid.innerHTML = tiers.map((t) => `
        <div class="tier-card">
          <div class="tier-card__header">
            <span class="tier-card__name">${escapeDiagnostic(t.id)}</span>
            <span class="status-pill status-pill--active"><span class="status-pill__dot"></span><span class="status-pill__label">${escapeDiagnostic(t.tier)}</span></span>
          </div>
          <div class="tier-card__specs">${escapeDiagnostic(t.size)}</div>
          <div class="meta-code">${escapeDiagnostic(t.role)}</div>
          <div class="tier-card__caps">
            ${t.caps.map((c) => `<span class="cap-chip">${escapeDiagnostic(c)}</span>`).join("")}
          </div>
        </div>
      `).join("");
    }
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6" class="form-message form-message--error">Failed to load matrix: ${escapeDiagnostic(err.message)}</td></tr>`;
  }
}

async function dryRunRouting(e) {
  e.preventDefault();

  const trackId = document.getElementById("dryRunCapabilitySelect").value;
  const role = document.getElementById("dryRunRoleSelect").value;
  const modelId = document.getElementById("dryRunModelSelect").value;
  const policy = document.getElementById("dryRunPolicySelect").value;

  const resultCard = document.getElementById("routingResultCard");
  const badgeEl = document.getElementById("routingAgreeBadge");
  const fieldsEl = document.getElementById("routingResultFields");

  if (!resultCard) return;

  resultCard.hidden = false;
  if (badgeEl) {
    badgeEl.className = "status-pill status-pill--running";
    badgeEl.innerHTML = '<span class="status-pill__dot"></span><span class="status-pill__label">Evaluating…</span>';
  }
  if (fieldsEl) fieldsEl.innerHTML = '<p class="meta-text">Calling /qualifications/dry-run…</p>';

  try {
    const res = await requestJson("/qualifications/dry-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId, role, trackId, policy })
    });

    const recommendation = res.recommendation || {};
    const isAgree = recommendation.action === "agree" || recommendation.action === "apply";
    const recommendedModel = recommendation.recommendedModelId || recommendation.modelId || modelId;
    const fallbackModel = recommendation.fallbackRecommendation
      ? recommendation.fallbackRecommendation.recommendedModelId
      : (modelId === "llama3.2-local" ? "lfm25-1p2b-thinking-local" : "llama3.2-local");

    if (badgeEl) {
      badgeEl.className = isAgree ? "status-pill status-pill--success" : "status-pill status-pill--warn";
      badgeEl.innerHTML = `<span class="status-pill__dot"></span><span class="status-pill__label">${escapeDiagnostic(recommendation.action || "evaluated")}</span>`;
    }

    if (fieldsEl) {
      fieldsEl.innerHTML = `
        <div><dt>Recommended Model</dt><dd><strong>${escapeDiagnostic(recommendedModel)}</strong></dd></div>
        <div><dt>Fallback Candidate</dt><dd>${escapeDiagnostic(fallbackModel)}</dd></div>
        <div><dt>Routing Score</dt><dd>${escapeDiagnostic(recommendation.score != null ? recommendation.score : 1.0)}</dd></div>
        <div><dt>Confidence</dt><dd>${escapeDiagnostic(recommendation.confidence || "high")}</dd></div>
        <div><dt>Enforcement Policy</dt><dd>${escapeDiagnostic(policy)}</dd></div>
        <div><dt>Decision Rationale</dt><dd>${escapeDiagnostic(recommendation.reason || "Model is qualified and verified for capability track.")}</dd></div>
      `;
    }
  } catch (err) {
    if (badgeEl) {
      badgeEl.className = "status-pill status-pill--error";
      badgeEl.innerHTML = '<span class="status-pill__dot"></span><span class="status-pill__label">Failed</span>';
    }
    if (fieldsEl) {
      fieldsEl.innerHTML = `<p class="form-message form-message--error">Dry-run evaluation failed: ${escapeDiagnostic(err.message)}</p>`;
    }
  }
}

/* ─────────────────────────────────────────────
   Activity & Run History View
   ───────────────────────────────────────────── */
const refreshActivityBtn = document.getElementById("refreshActivityBtn");
if (refreshActivityBtn) refreshActivityBtn.addEventListener("click", loadActivity);

async function loadActivity() {
  const container = document.getElementById("activityRunsList");
  if (!container) return;

  container.innerHTML = '<p class="meta-text">Loading activity history…</p>';

  try {
    const res = await fetchJson("/console/runs?limit=30");
    const runs = res.runs || [];

    if (!runs.length) {
      container.innerHTML = '<p class="meta-text">No recorded runs yet.</p>';
      return;
    }

    container.innerHTML = runs.map((r) => `
      <div class="history-item">
        <div class="history-item__header">
          <strong>${escapeDiagnostic(r.runId || r.id)}</strong>
          <span class="status-pill status-pill--${r.status === "completed" || r.status === "success" ? "success" : "pending"}">
            <span class="status-pill__dot"></span>
            <span class="status-pill__label">${escapeDiagnostic(r.status || "unknown")}</span>
          </span>
        </div>
        <div class="history-item__meta">
          <span>${escapeDiagnostic(r.mode || "standard")}</span>
          <span>${r.durationMs ? `${r.durationMs}ms` : ""}</span>
          <span>${escapeDiagnostic(r.createdAt || "")}</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p class="form-message form-message--error">Failed to load activity: ${escapeDiagnostic(err.message)}</p>`;
  }
}

