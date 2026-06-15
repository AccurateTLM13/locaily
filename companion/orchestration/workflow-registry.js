const fs = require("node:fs");
const path = require("node:path");

const WORKFLOWS_PATH = path.join(__dirname, "registry", "workflows.json");

function loadWorkflowRegistryFile() {
  return JSON.parse(fs.readFileSync(WORKFLOWS_PATH, "utf8"));
}

function listWorkflows() {
  const registry = loadWorkflowRegistryFile();
  return registry.workflows.map((workflow) => ({
    workflow_id: workflow.workflow_id,
    name: workflow.name,
    description: workflow.description,
    track_id: workflow.track_id,
    input_type: workflow.input_type,
    output_type: workflow.output_type,
    status: workflow.status
  }));
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
  const workflow = registry.workflows.find((entry) => entry.workflow_id === normalized);

  if (!workflow) {
    const error = new Error(`Workflow '${normalized}' was not found.`);
    error.code = "WORKFLOW_NOT_FOUND";
    error.nextStep = "Use GET /orchestration/workflows to list available workflow ids.";
    throw error;
  }

  return workflow;
}

module.exports = {
  listWorkflows,
  getWorkflow
};
