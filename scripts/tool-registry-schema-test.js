const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createToolRegistry,
  loadToolPack,
  parseToolPackManifest,
  validateLoadedToolPackManifest,
  toInternalToolRegistryMetadata,
  validateInternalToolRegistryEntry,
  registerTool
} = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { validateResult } = require("../companion/core/result-validator");

const toolPackManifestToolSchema = require("../companion/schemas/internal/tool-pack-manifest-tool.schema.json");
const toolPackManifestSchema = {
  ...require("../companion/schemas/internal/tool-pack-manifest.schema.json"),
  $defs: {
    manifestTool: toolPackManifestToolSchema
  }
};
const internalToolRegistryEntrySchema = require("../companion/schemas/internal/internal-tool-registry-entry.schema.json");
const publicToolMetadataSchema = require("../companion/schemas/internal/public-tool-metadata.schema.json");

const TOOL_PACKS_DIR = path.join(__dirname, "..", "tool-packs");

function loadToolPackManifests() {
  return fs.readdirSync(TOOL_PACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(TOOL_PACKS_DIR, entry.name, "tool.json"))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .map((manifestPath) => ({
      manifestPath,
      manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    }));
}

function assertSchemaValid(label, value, schema) {
  const validation = validateResult(value, schema, label);
  assert(validation.ok, `${label} failed schema validation: ${validation.errors.join("; ")}`);
}

function assertSchemaInvalid(label, value, schema) {
  const validation = validateResult(value, schema, label);
  assert(!validation.ok, `${label} should fail schema validation.`);
  assert(validation.errors.length > 0, `${label} should include validation errors.`);
}

function checkManifestFiles() {
  const manifests = loadToolPackManifests();
  assert(manifests.length >= 2, "Expected at least two tool pack manifests.");

  for (const { manifestPath, manifest } of manifests) {
    assertSchemaValid(path.basename(manifestPath), manifest, toolPackManifestSchema);

    for (const toolDef of manifest.tools) {
      assertSchemaValid(`${manifest.id}/${toolDef.id}`, toolDef, toolPackManifestToolSchema);
    }
  }
}

function checkInternalRegistryEntries() {
  const registry = createToolRegistry();
  const tools = registry.list();
  assert(tools.length >= 10, "Expected registered tools from packs and showcase handlers.");

  for (const tool of tools) {
    assert(typeof tool.handle === "function", `Tool '${tool.id}' must define handle at runtime.`);
    assertSchemaValid(`internal:${tool.id}`, toInternalToolRegistryMetadata(tool), internalToolRegistryEntrySchema);
  }

  const showcase = registry.get("lighthouse-handoff");
  assert(!Object.prototype.hasOwnProperty.call(toInternalToolRegistryMetadata(showcase), "trust"),
    "Showcase lighthouse-handoff may omit trust before public normalization.");
}

function checkPublicToolsMetadata() {
  const registry = createToolRegistry();

  for (const toolMeta of registry.listPublic()) {
    assertSchemaValid(`public:${toolMeta.id}`, toolMeta, publicToolMetadataSchema);
  }

  const lighthouse = registry.listPublic().find((tool) => tool.id === "lighthouse-handoff");
  assert.equal(lighthouse.pack_trust, "official", "Public metadata defaults pack_trust when internal trust is absent.");
  assert.equal(lighthouse.pack, "showcase-tools");
  assert.equal(lighthouse.model_role, "default_worker");
}

function checkMalformedRepresentatives() {
  assertSchemaInvalid("manifest missing trust", {
    id: "bad-pack",
    name: "Bad",
    version: "0.0.0",
    tools: [{ id: "x", output_schema: "out.json" }]
  }, toolPackManifestSchema);

  assertSchemaInvalid("manifest tool missing output_schema", {
    id: "text.bad"
  }, toolPackManifestToolSchema);

  assertSchemaInvalid("internal missing tasks", {
    id: "bad-tool",
    name: "Bad Tool"
  }, internalToolRegistryEntrySchema);

  assertSchemaInvalid("public uses trust instead of pack_trust", {
    id: "bad-tool",
    name: "Bad Tool",
    pack: "bad-pack",
    trust: "official",
    pack_version: "0.1.0",
    description: "",
    tasks: ["run"],
    permissions: [],
    model_role: null,
    runtime_required: false,
    input_schema: null,
    output_schema: null,
    input: null,
    output: null
  }, publicToolMetadataSchema);

  assertSchemaInvalid("public missing pack_trust", {
    id: "bad-tool",
    name: "Bad Tool",
    pack: "bad-pack",
    pack_version: "0.1.0",
    description: "",
    tasks: ["run"],
    permissions: [],
    model_role: null,
    runtime_required: false,
    input_schema: null,
    output_schema: null,
    input: null,
    output: null
  }, publicToolMetadataSchema);
}

function withTempManifestFile(contents, fn) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "locaily-tool-pack-"));
  const packDir = path.join(tmpRoot, "bad-pack");
  fs.mkdirSync(packDir, { recursive: true });
  const manifestPath = path.join(packDir, "tool.json");
  fs.writeFileSync(manifestPath, contents, "utf8");

  try {
    fn({ packDir, manifestPath });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function checkRuntimeManifestValidation() {
  assert.throws(
    () => validateLoadedToolPackManifest({
      id: "bad-pack",
      name: "Bad Pack",
      version: "0.0.0",
      tools: [{ id: "x", output_schema: "out.json" }]
    }, "/tmp/bad-pack/tool.json"),
    (error) => error.code === "TOOL_PACK_MANIFEST_INVALID"
      && error.manifestPath === "/tmp/bad-pack/tool.json"
      && error.packId === "bad-pack"
      && error.validation && error.validation.ok === false
      && Array.isArray(error.validation.errors)
      && error.validation.errors.length > 0,
    "Expected missing trust to throw TOOL_PACK_MANIFEST_INVALID."
  );

  assert.throws(
    () => validateLoadedToolPackManifest({
      id: "bad-pack",
      name: "Bad Pack",
      version: "0.0.0",
      trust: "official",
      tools: [{ id: "x" }]
    }, "/tmp/bad-pack/tool.json"),
    (error) => error.code === "TOOL_PACK_MANIFEST_INVALID"
      && error.validation.errors.some((message) => message.includes("output_schema")),
    "Expected invalid tool entry to throw TOOL_PACK_MANIFEST_INVALID."
  );

  withTempManifestFile("{ not-json", ({ manifestPath }) => {
    assert.throws(
      () => parseToolPackManifest(manifestPath),
      (error) => error.code === "TOOL_PACK_MANIFEST_PARSE_INVALID"
        && error.manifestPath === manifestPath,
      "Expected JSON parse failure to throw TOOL_PACK_MANIFEST_PARSE_INVALID."
    );
  });

  withTempManifestFile(JSON.stringify({
    id: "bad-pack",
    name: "Bad Pack",
    version: "0.0.0",
    tools: [{ id: "x", output_schema: "missing.json" }]
  }), ({ packDir, manifestPath }) => {
    const toolsMap = new Map();
    assert.throws(
      () => loadToolPack(packDir, manifestPath, toolsMap, new Set()),
      (error) => error.code === "TOOL_PACK_MANIFEST_INVALID",
      "Expected loadToolPack to reject schema-invalid manifest before registration."
    );
    assert.equal(toolsMap.size, 0, "Invalid manifest must not register tools.");
  });

  const registry = createToolRegistry();
  const textClean = registry.listPublic().find((tool) => tool.id === "text.clean");
  assert(textClean, "Expected text.clean to remain registered after manifest validation rollout.");
  assert.equal(textClean.pack, "standard-text-pack");
}

async function checkRuntimeInternalRegistryValidation() {
  const invalidTool = {
    id: "bad-internal",
    name: "Bad Internal Tool",
    pack: "test-pack",
    tasks: ["run"],
    modelRole: 123,
    handle: () => ({})
  };

  assert.throws(
    () => validateInternalToolRegistryEntry(invalidTool),
    (error) => error.code === "INTERNAL_TOOL_REGISTRY_ENTRY_INVALID"
      && error.toolId === "bad-internal"
      && error.packId === "test-pack"
      && error.validation && error.validation.ok === false
      && Array.isArray(error.validation.errors)
      && error.validation.errors.length > 0,
    "Expected invalid internal metadata to throw INTERNAL_TOOL_REGISTRY_ENTRY_INVALID."
  );

  const toolsMap = new Map();
  assert.throws(
    () => registerTool(toolsMap, invalidTool),
    (error) => error.code === "INTERNAL_TOOL_REGISTRY_ENTRY_INVALID",
    "Expected registerTool to reject invalid metadata."
  );
  assert.equal(toolsMap.size, 0, "Invalid tool must not remain registered.");

  const registry = createToolRegistry();
  const textClean = registry.get("text.clean");
  assert(typeof textClean.handle === "function", "Valid tool must retain handle function.");
  assert(typeof textClean.validateInput === "function", "Valid tool must retain validateInput when provided.");

  const validateTool = registry.get("text.validate_schema");
  const output = await validateTool.handle({
    task: "run",
    input: {
      data: { title: "Example" },
      schema: {
        type: "object",
        required: ["title"],
        properties: { title: { type: "string" } }
      }
    },
    runtime: createMockRuntime(),
    options: {}
  });

  assert(output && output.valid === true, "Registered handler should execute for valid tool.");
}

function main() {
  checkManifestFiles();
  checkRuntimeManifestValidation();
  checkInternalRegistryEntries();
  checkPublicToolsMetadata();
  checkMalformedRepresentatives();
  return checkRuntimeInternalRegistryValidation().then(() => {
    console.log("Tool registry schema contract tests passed.");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
