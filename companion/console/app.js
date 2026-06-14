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

elements.refreshStatusButton.addEventListener("click", loadStatus);
elements.refreshRunsButton.addEventListener("click", loadRuns);
elements.runForm.addEventListener("submit", startRun);
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

loadStatus();
loadRuns();

async function loadStatus() {
  try {
    const status = await fetchJson("/console/status");
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
      status.model && status.model.ready ? `${status.model.name} ready` : "Not ready",
      status.model && status.model.ready
        ? null
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
    .map(([name, artifactPath]) => `${name}: ${artifactPath}`);
  const warningLines = uniqueStrings([...(run.warnings || []), ...(result.warnings || [])]);

  elements.validationEvidence.replaceChildren(
    advancedBlock("Validation ID", run.runId),
    advancedBlock("Mode", formatMode(run.mode)),
    advancedBlock("URL", run.url),
    advancedBlock("Provider", result.provider || "Pending"),
    advancedBlock("Model", result.model || "Pending"),
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

  if (state.lastStatus) {
    renderStatus(state.lastStatus);
  }
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
    .replace(/Compose handoff.*/i, "Compose Handoff")
    .replace(/Save validation artifacts/i, "Save Artifacts")
    .replace(/Schema validation/i, "Schema Validation")
    .replace(/Preflight checks/i, "Preflight")
    .replace(/Slim Lighthouse input/i, "Slim Input");
}

function formatMode(mode) {
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
