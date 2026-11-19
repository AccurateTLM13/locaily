const fs = require("node:fs");
const path = require("node:path");
const { getDefaultWorkflowPackRegistry } = require("../packs");

const WORKFLOWS_PATH = path.join(__dirname, "registry", "workflows.json");

function loadWorkflowRegistryFile() {
  return JSON.parse(fs.readFileSync(WORKFLOWS_PATH, "utf8"));
}

function toWorkflowListEntry(workflow, packDefaults = {}) {
  return {
    workflow_id: workflow.workflow_id,
    name: workflow.name,
    description: workflow.description,
    track_id: workflow.track_id || null,
    composition: workflow.composition || null,
    input_requirements: workflow.input_requirements || null,
    output_alias: workflow.output_alias || null,
    input_type: workflow.input_type,
    output_type: workflow.output_type,
    status: workflow.status,
    intake: workflow.intake || null,
    pack_id: packDefaults.pack_id ?? workflow.pack_id ?? null,
    ...(workflow.pack_version ? { pack_version: workflow.pack_version } : {}),
    ...(workflow.pack_trust ? { pack_trust: workflow.pack_trust } : {}),
    default_fixture_input: workflow.default_fixture_input ?? null
  };
}

function listWorkflows() {
  const registry = loadWorkflowRegistryFile();
  const builtins = registry.workflows.map((workflow) => toWorkflowListEntry(workflow, { pack_id: null }));
  const packWorkflows = getDefaultWorkflowPackRegistry()
    .listPackWorkflows()
    .map((workflow) => toWorkflowListEntry(workflow));
  return [...builtins, ...packWorkflows];
}

function getWorkflow(workflowId) {
  if (!workflowId || typeof workflowId !== "string") {
    const error = new Error("Workflow id is required.");
    error.code = "INVALID_WORKFLOW";
    error.nextStep = "Send workflow_id in the request body.";
    throw error;
  }

  const normalized = workflowId.trim();
  const registry = loadWorkflowRegistryFile();
  const builtin = registry.workflows.find((entry) => entry.workflow_id === normalized);
  if (builtin) {
    return builtin;
  }

  const packWorkflow = getDefaultWorkflowPackRegistry().getPackWorkflow(normalized);
  if (packWorkflow) {
    return packWorkflow;
  }

  const error = new Error(`Workflow '${normalized}' was not found.`);
  error.code = "WORKFLOW_NOT_FOUND";
  error.nextStep = "Use GET /orchestration/workflows to list available workflow ids.";
  throw error;
}

module.exports = {
  listWorkflows,
  getWorkflow
};
