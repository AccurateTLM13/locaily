const { readFileSync, existsSync, statSync } = require("node:fs");
const { basename, extname } = require("node:path");

const ingestionSchema = require("../schemas/document-ingestion.schema.json");
const reportSchema = require("../schemas/document-review-report.schema.json");

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const OCR_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".pdf"]);
const MAX_READ_BYTES = 1024 * 1024;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

function toolError(code, message, nextStep) {
  const error = new Error(message);
  error.code = code;
  error.nextStep = nextStep;
  return error;
}

function cleanText(raw) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSections(cleaned) {
  const sections = [];
  let current = { heading: "(top)", lines: [] };

  for (const line of cleaned.split("\n")) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      if (current.lines.some((l) => l.trim())) {
        sections.push(current);
      }
      current = { heading: heading[2].trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }

  if (current.lines.some((l) => l.trim())) {
    sections.push(current);
  }

  return sections.map((section) => ({
    heading: section.heading,
    text: section.lines.join("\n").trim()
  }));
}

function runIngest(input) {
  let text = null;
  let sourceType = "inline";
  let docName = String(input.doc_name || "").trim();

  if (typeof input.path === "string" && input.path.trim()) {
    const filePath = input.path.trim();
    const ext = extname(filePath).toLowerCase();

    if (OCR_EXTENSIONS.has(ext)) {
      throw toolError(
        "OCR_ADAPTER_REQUIRED",
        `Document '${basename(filePath)}' (${ext}) needs optical text extraction; no OCR adapter is registered.`,
        "Text extraction for images/PDF is a planned ingestion adapter (e.g. anydoc). CORE-01 deliberately does not add a dependency without a concrete capability decision; supply inline text content meanwhile."
      );
    }

    if (!TEXT_EXTENSIONS.has(ext)) {
      throw toolError(
        "DOCUMENT_FORMAT_UNSUPPORTED",
        `Document extension '${ext || "(none)"}' is not supported by text ingestion.`,
        "Supported now: .md, .markdown, .txt. Inline content is always accepted."
      );
    }

    if (!existsSync(filePath)) {
      throw toolError("DOCUMENT_PATH_NOT_FOUND", `Document '${filePath}' does not exist.`, "Send a readable local file path or inline content.");
    }

    const stat = statSync(filePath);

    if (!stat.isFile()) {
      throw toolError("DOCUMENT_PATH_NOT_FILE", `Document path '${filePath}' is not a file.`, "Send a file path.");
    }

    if (stat.size > MAX_READ_BYTES) {
      throw toolError("DOCUMENT_TOO_LARGE", `Document exceeds ${MAX_READ_BYTES} bytes.`, "Send a smaller document or an excerpt via content.");
    }

    text = readFileSync(filePath, "utf8");
    sourceType = "file";
    docName = docName || basename(filePath, ext);
  } else if (typeof input.content === "string" && input.content.trim()) {
    text = input.content;
    docName = docName || "inline-document";
  } else {
    throw toolError("INVALID_INPUT", "document-scan requires either 'path' or 'content'.", "Send { path } for a local text document or { content, doc_name } inline.");
  }

  const cleaned = cleanText(text);
  const sections = splitSections(cleaned);
  const words = cleaned.split(/\s+/).filter(Boolean).length;

  return {
    doc_name: docName,
    source_type: sourceType,
    char_count: cleaned.length,
    word_count: words,
    section_count: sections.length,
    sections,
    cleaned_text: cleaned
  };
}

function renderReportMarkdown(report) {
  const lines = [`# ${report.title}`, "", report.headline, ""];
  for (const section of report.sections) {
    lines.push(`## ${section.heading}`, "");
    for (const item of section.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function runComposeReport(input) {
  const document = input.document;
  if (!document || typeof document !== "object" || typeof document.cleaned_text !== "string") {
    throw toolError("INVALID_INPUT", "document-scan compose-report requires the upstream 'document' artifact.", "Wire input_map from the ingest composition alias.");
  }

  const sections = [];

  if (input.classification && typeof input.classification.category === "string") {
    sections.push({
      heading: "Classification",
      items: [`Document category: ${input.classification.category}. ${input.classification.reason || ""}`.trim()]
    });
  }

  if (input.extraction && input.extraction.data) {
    sections.push({
      heading: "Extracted Fields",
      items: Object.entries(input.extraction.data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    });
  }

  if (input.validation) {
    sections.push({
      heading: "Validation",
      items: [`Schema check ${input.validation.valid ? "passed" : "FAILED"}.`,
        ...(Array.isArray(input.validation.errors) ? input.validation.errors : [])]
    });
  }

  if (input.summary && typeof input.summary.summary === "string") {
    sections.push({
      heading: "Summary",
      items: [input.summary.summary, ...(Array.isArray(input.summary.key_points) ? input.summary.key_points : [])]
    });
  }

  const report = {
    title: `Document Review — ${document.doc_name}`,
    doc_name: document.doc_name,
    headline: `${document.word_count} words across ${document.section_count} section(s); ${sections.length} review section(s) assembled.`,
    sections
  };

  report.markdown = renderReportMarkdown(report);
  return report;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { code: "INVALID_INPUT", message: "document-scan input must be an object.", nextStep: "Send ingest or compose-report input." };
  }
  return null;
}

const documentScanTool = {
  id: "document-scan",
  name: "Document Scan",
  pack: "showcase-tools",
  description: "Deterministic text-document ingestion and review-report composition for the Document Review workflow. Read-only; image/PDF inputs fail closed with OCR_ADAPTER_REQUIRED until an OCR adapter decision is made.",
  tasks: ["ingest", "compose-report"],
  permissions: [],
  modelRole: null,
  requiresRuntime: false,
  inputSchema: null,
  outputSchema: null,
  input: null,
  output: reportSchema,
  schemas: {
    ingest: ingestionSchema,
    "compose-report": reportSchema
  },
  validateInput,
  async handle({ task, input }) {
    if (task === "ingest") {
      return runIngest(input);
    }

    if (task === "compose-report") {
      return runComposeReport(input);
    }

    throw toolError("UNKNOWN_TASK", `Task '${task}' is not supported by document-scan.`, "Supported tasks: ingest, compose-report.");
  }
};

module.exports = documentScanTool;
