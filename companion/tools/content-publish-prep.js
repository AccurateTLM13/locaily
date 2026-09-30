const packageSchema = require("../schemas/content-publish-package.schema.json");

function toolError(code, message, nextStep) {
  const error = new Error(message);
  error.code = code;
  error.nextStep = nextStep;
  return error;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function frontMatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      continue;
    }
    lines.push(Array.isArray(value) ? `${key}: [${value.join(", ")}]` : `${key}: "${String(value).replace(/"/g, "'")}"`);
  }
  lines.push("---");
  return lines.join("\n");
}

function runCompose(input) {
  const document = input.document;
  if (!document || typeof document !== "object" || typeof document.cleaned_text !== "string") {
    throw toolError("INVALID_INPUT", "content-publish-prep requires the upstream 'document' artifact.", "Wire input_map from the ingest composition alias.");
  }

  const transformed = (input.transformed && input.transformed.result) || {};
  const title = String(transformed.title || document.doc_name || "Untitled").trim();
  const description = String(transformed.description || (input.summary && input.summary.summary) || "").trim();
  const tags = [
    ...(input.classification && typeof input.classification.category === "string" ? [input.classification.category] : []),
    ...(Array.isArray(transformed.tags) ? transformed.tags.map(String) : [])
  ];

  const checklist = [];
  if (!description) {
    checklist.push("Add a meta description before publishing.");
  }
  if (tags.length === 0) {
    checklist.push("Assign at least one tag.");
  }
  if (input.validation && input.validation.valid === false) {
    checklist.push(`Resolve publish-schema validation failure: ${(input.validation.errors || []).join("; ")}`);
  }
  if (!/^#\s+\S/m.test(document.cleaned_text)) {
    checklist.push("Document body has no top-level heading; add one for readability.");
  }

  const slug = slugify(transformed.slug || title) || slugify(document.doc_name) || "untitled";

  const pkg = {
    slug,
    title,
    description,
    tags,
    front_matter: frontMatter({
      title,
      slug,
      description,
      tags,
      word_count: document.word_count
    }),
    body_markdown: "",
    checklist,
    ready: checklist.length === 0 && (!input.validation || input.validation.valid !== false)
  };

  pkg.body_markdown = `${pkg.front_matter}\n\n${document.cleaned_text}`;
  return pkg;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { code: "INVALID_INPUT", message: "content-publish-prep input must be an object.", nextStep: "Send compose input with document + transformed artifacts." };
  }
  return null;
}

const contentPublishPrepTool = {
  id: "content-publish-prep",
  name: "Content Publish Prep",
  pack: "showcase-tools",
  description: "Deterministic Content OS export: assembles upstream document, transform, classification, summary, and validation artifacts into a publish-ready package with front-matter and a preflight checklist.",
  tasks: ["compose"],
  permissions: [],
  modelRole: null,
  requiresRuntime: false,
  inputSchema: null,
  outputSchema: null,
  input: null,
  output: packageSchema,
  schemas: { compose: packageSchema },
  validateInput,
  async handle({ task, input }) {
    if (task === "compose") {
      return runCompose(input);
    }

    throw toolError("UNKNOWN_TASK", `Task '${task}' is not supported by content-publish-prep.`, "Supported tasks: compose.");
  }
};

module.exports = contentPublishPrepTool;
