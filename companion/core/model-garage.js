const fs = require("node:fs");
const path = require("node:path");
const { runToolWithValidation } = require("./result-validator");

const EVALUATION_PATH = path.join(__dirname, "../../data/garage-evaluations.jsonl");

const ROLE_ESCALATION_ORDER = [
  "fast_worker",
  "default_worker",
  "reasoning_worker"
];

const DEFAULT_CANDIDATES = {
  fast_worker: [
    { id: "lfm2.5-350m", model: "lfm2.5-350m", size_gb: 0.3, label: "LFM2.5 350M" },
    { id: "lfm2.5-1.2b", model: "lfm2.5-1.2b", size_gb: 0.9, label: "LFM2.5 1.2B" },
    { id: "qwen3-1.7b", model: "qwen3-1.7b", size_gb: 1.7, label: "Qwen3 1.7B" }
  ],
  default_worker: [
    { id: "lfm2.5-1.2b", model: "lfm2.5-1.2b", size_gb: 0.9, label: "LFM2.5 1.2B" },
    { id: "smollm3-3b", model: "smollm3-3b", size_gb: 3.0, label: "SmolLM3 3B" },
    { id: "llama3.2", model: "llama3.2", size_gb: 3.0, label: "Llama 3.2 3B" }
  ],
  reasoning_worker: [
    { id: "phi-4-mini", model: "phi-4-mini", size_gb: 2.5, label: "Phi-4 Mini" },
    { id: "deepseek-r1-distill-1.5b", model: "deepseek-r1-distill-qwen-1.5b", size_gb: 1.5, label: "DeepSeek R1 Distill 1.5B" }
  ],
  voice_worker: []
};

const BENCHMARK_TASKS = [
  {
    tool: "text.clean",
    task: "Clean text",
    input: {
      text: "hey um this is a rough note",
      format: "markdown"
    }
  },
  {
    tool: "text.classify",
    task: "Classify text",
    input: {
      text: "This listing looks suspicious and urgent.",
      labels: ["safe", "risky", "spam"]
    }
  },
  {
    tool: "text.extract_json",
    task: "Extract JSON",
    input: {
      text: "Name: Ada Lovelace, Role: Engineer",
      schema: {
        type: "object",
        required: ["name", "role"],
        properties: {
          name: { type: "string" },
          role: { type: "string" }
        }
      }
    }
  }
];

function createModelGarage(config = {}) {
  const candidates = normalizeCandidates(config.candidates || {});
  const loadedSlots = new Map();
  let lastSwitches = [];

  return {
    list({ profile = null, installedModels = [] } = {}) {
      const installedSet = new Set(installedModels);
      const roles = Object.keys(candidates).map((role) => ({
        role,
        active_model: getLoadedModelForRole(loadedSlots, role),
        candidates: candidates[role].map((candidate) => toPublicCandidate(candidate, {
          installedSet,
          loadedSlots,
          profile
        }))
      }));

      return {
        policy: profile ? profile.policy : null,
        max_auto_model_gb: profile ? profile.max_auto_model_gb : null,
        loaded_models: listLoadedModels(loadedSlots),
        roles,
        last_switches: lastSwitches
      };
    },
    prepareForRole({
      role,
      model,
      policy = "smart_load",
      maxAutoModelGb = 4,
      providerId = null,
      defaultRole = "default_worker",
      defaultModel = null
    }) {
      const normalizedRole = normalizeRole(role);
      const candidate = resolveCandidate(candidates, normalizedRole, model, maxAutoModelGb);
      const targetModel = candidate ? candidate.model : model;
      const switches = applyLoadPolicy({
        loadedSlots,
        targetModel,
        role: normalizedRole,
        policy,
        defaultRole,
        defaultModel: defaultModel || targetModel,
        candidate
      });

      lastSwitches = switches;

      return {
        ok: true,
        role: normalizedRole,
        model: targetModel,
        candidate,
        switches,
        provider: providerId
      };
    },
    releaseAfterTask({
      role,
      model,
      policy = "smart_load",
      defaultRole = "default_worker",
      defaultModel = null
    }) {
      const normalizedRole = normalizeRole(role);
      const switches = applyReleasePolicy({
        loadedSlots,
        role: normalizedRole,
        model,
        policy,
        defaultRole,
        defaultModel
      });

      if (switches.length > 0) {
        lastSwitches = switches;
      }

      return { switches };
    },
    escalateRole(currentRole) {
      const index = ROLE_ESCALATION_ORDER.indexOf(normalizeRole(currentRole));

      if (index === -1 || index >= ROLE_ESCALATION_ORDER.length - 1) {
        return null;
      }

      return ROLE_ESCALATION_ORDER[index + 1];
    },
    getLastSwitches() {
      return lastSwitches.slice();
    },
    async runEvaluation({
      runtime,
      toolRegistry,
      providerId,
      roleModels = {},
      roles = ["fast_worker", "default_worker"]
    }) {
      const results = [];
      const startedAt = Date.now();

      for (const role of roles) {
        const modelName = roleModels[role];

        if (!modelName) {
          continue;
        }

        for (const benchmark of BENCHMARK_TASKS) {
          const tool = toolRegistry.get(benchmark.tool);

          if (!tool) {
            continue;
          }

          const stepStartedAt = Date.now();
          let schemaValid = false;
          let ok = false;
          let errorCode = null;

          try {
            const execution = await runToolWithValidation({
              tool,
              fallbackPolicy: { on_schema_fail: "fail" },
              runOnce: async () => tool.handle({
                task: benchmark.task,
                input: benchmark.input,
                runtime,
                options: {
                  model: modelName,
                  model_role: role
                },
                meta: {}
              })
            });

            schemaValid = execution.validation.ok;
            ok = execution.ok;
          } catch (error) {
            errorCode = error.code || "EVALUATION_FAILED";
          }

          const entry = {
            timestamp: new Date().toISOString(),
            provider: providerId,
            role,
            model: modelName,
            benchmark: benchmark.tool,
            duration_ms: Date.now() - stepStartedAt,
            schema_valid: schemaValid,
            ok,
            error_code: errorCode
          };

          results.push(entry);
          appendEvaluationEntry(entry);
        }
      }

      return {
        ok: true,
        provider: providerId,
        roles,
        results,
        summary: summarizeEvaluationResults(results),
        duration_ms: Date.now() - startedAt
      };
    },
    getEvaluationSummary() {
      return summarizeEvaluationFile();
    }
  };
}

function normalizeCandidates(overrides) {
  const merged = {};

  for (const [role, defaults] of Object.entries(DEFAULT_CANDIDATES)) {
    merged[role] = Array.isArray(overrides[role]) ? overrides[role] : defaults.slice();
  }

  for (const [role, customCandidates] of Object.entries(overrides)) {
    if (!merged[role] && Array.isArray(customCandidates)) {
      merged[role] = customCandidates;
    }
  }

  return merged;
}

function resolveCandidate(candidates, role, configuredModel, maxAutoModelGb) {
  const roleCandidates = candidates[role] || [];
  const exact = roleCandidates.find((candidate) => candidate.model === configuredModel);

  if (exact && exact.size_gb <= maxAutoModelGb) {
    return exact;
  }

  const withinLimit = roleCandidates
    .filter((candidate) => candidate.size_gb <= maxAutoModelGb)
    .sort((left, right) => left.size_gb - right.size_gb);

  if (withinLimit.length === 0) {
    return {
      id: configuredModel,
      model: configuredModel,
      size_gb: estimateModelSizeGb(configuredModel),
      label: configuredModel,
      configured_fallback: true
    };
  }

  const configuredMatch = withinLimit.find((candidate) => candidate.model === configuredModel);
  return configuredMatch || withinLimit[0];
}

function applyLoadPolicy({
  loadedSlots,
  targetModel,
  role,
  policy,
  defaultRole,
  defaultModel,
  candidate
}) {
  const switches = [];
  const alreadyLoaded = loadedSlots.has(targetModel);

  if (policy === "single_loaded") {
    for (const [modelName] of loadedSlots) {
      if (modelName !== targetModel) {
        loadedSlots.delete(modelName);
        switches.push(buildSwitch("unload", modelName, role, "single_loaded_policy"));
      }
    }
  }

  if (!alreadyLoaded) {
    loadedSlots.set(targetModel, {
      model: targetModel,
      role,
      state: "loaded",
      loadedAt: new Date().toISOString(),
      size_gb: candidate ? candidate.size_gb : estimateModelSizeGb(targetModel)
    });
    switches.push(buildSwitch("load", targetModel, role, `${policy}_policy`));
  }

  for (const [modelName, slot] of loadedSlots) {
    slot.state = modelName === targetModel ? "active" : slot.state === "active" ? "loaded" : slot.state;
  }

  if (policy === "smart_load" && role === defaultRole && defaultModel && defaultModel !== targetModel) {
    if (!loadedSlots.has(defaultModel)) {
      loadedSlots.set(defaultModel, {
        model: defaultModel,
        role: defaultRole,
        state: "loaded",
        loadedAt: new Date().toISOString(),
        size_gb: estimateModelSizeGb(defaultModel)
      });
      switches.push(buildSwitch("load", defaultModel, defaultRole, "keep_default_warm"));
    }
  }

  switches.push(buildSwitch("activate", targetModel, role, "task_start"));

  return switches;
}

function applyReleasePolicy({
  loadedSlots,
  role,
  model,
  policy,
  defaultRole,
  defaultModel
}) {
  const switches = [];

  if (!model || !loadedSlots.has(model)) {
    return switches;
  }

  if (policy === "single_loaded") {
    loadedSlots.delete(model);
    switches.push(buildSwitch("unload", model, role, "single_loaded_release"));

    if (defaultModel && role !== defaultRole) {
      loadedSlots.set(defaultModel, {
        model: defaultModel,
        role: defaultRole,
        state: "active",
        loadedAt: new Date().toISOString(),
        size_gb: estimateModelSizeGb(defaultModel)
      });
      switches.push(buildSwitch("load", defaultModel, defaultRole, "restore_default"));
    }
  } else if (policy === "smart_load" && role !== defaultRole) {
    loadedSlots.delete(model);
    switches.push(buildSwitch("unload", model, role, "specialist_unload"));
  }

  return switches;
}

function buildSwitch(action, model, role, reason) {
  return {
    action,
    model,
    role,
    reason,
    timestamp: new Date().toISOString()
  };
}

function listLoadedModels(loadedSlots) {
  return Array.from(loadedSlots.values()).map((slot) => ({
    model: slot.model,
    role: slot.role,
    state: slot.state,
    size_gb: slot.size_gb,
    loaded_at: slot.loadedAt
  }));
}

function getLoadedModelForRole(loadedSlots, role) {
  for (const slot of loadedSlots.values()) {
    if (slot.role === role && slot.state === "active") {
      return slot.model;
    }
  }

  for (const slot of loadedSlots.values()) {
    if (slot.role === role) {
      return slot.model;
    }
  }

  return null;
}

function toPublicCandidate(candidate, { installedSet, loadedSlots, profile }) {
  const maxAutoModelGb = profile ? profile.max_auto_model_gb : null;
  const installed = installedSet.size === 0 || installedSet.has(candidate.model);
  const loadedSlot = loadedSlots.get(candidate.model);
  let state = installed ? "sleeping" : "missing";

  if (loadedSlot) {
    state = loadedSlot.state === "active" ? "active" : "loaded";
  }

  return {
    ...candidate,
    state,
    within_profile_limit: maxAutoModelGb === null || candidate.size_gb <= maxAutoModelGb
  };
}

function estimateModelSizeGb(modelName) {
  const normalized = String(modelName || "").toLowerCase();

  if (normalized.includes("mock")) {
    return 0.1;
  }

  if (normalized.includes("350m")) {
    return 0.3;
  }

  if (normalized.includes("1.2b") || normalized.includes("1.5b") || normalized.includes("1.7b")) {
    return 1.2;
  }

  if (normalized.includes("3b") || normalized.includes("3.2")) {
    return 3.0;
  }

  if (normalized.includes("7b")) {
    return 7.0;
  }

  return 2.0;
}

function appendEvaluationEntry(entry) {
  try {
    const dataDir = path.dirname(EVALUATION_PATH);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.appendFileSync(EVALUATION_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error(`[ModelGarage] Failed to write evaluation entry: ${error.message}`);
  }
}

function summarizeEvaluationResults(results) {
  const summary = {};

  for (const result of results) {
    const key = `${result.role}:${result.model}`;

    if (!summary[key]) {
      summary[key] = {
        role: result.role,
        model: result.model,
        benchmarks: 0,
        passed: 0,
        schema_valid_rate: 0,
        avg_duration_ms: 0,
        total_duration_ms: 0
      };
    }

    const bucket = summary[key];
    bucket.benchmarks += 1;
    bucket.passed += result.ok ? 1 : 0;
    bucket.total_duration_ms += result.duration_ms;
    bucket.avg_duration_ms = Math.round(bucket.total_duration_ms / bucket.benchmarks);
    bucket.schema_valid_rate = parseFloat((bucket.passed / bucket.benchmarks).toFixed(2));
  }

  return Object.values(summary);
}

function summarizeEvaluationFile() {
  if (!fs.existsSync(EVALUATION_PATH)) {
    return [];
  }

  try {
    const lines = fs.readFileSync(EVALUATION_PATH, "utf8").split("\n").filter((line) => line.trim());
    const results = lines.map((line) => JSON.parse(line));
    return summarizeEvaluationResults(results);
  } catch (error) {
    console.error(`[ModelGarage] Failed to read evaluation summary: ${error.message}`);
    return [];
  }
}

function normalizeRole(role) {
  return typeof role === "string" ? role.trim() : "default_worker";
}

module.exports = {
  DEFAULT_CANDIDATES,
  BENCHMARK_TASKS,
  ROLE_ESCALATION_ORDER,
  createModelGarage
};
