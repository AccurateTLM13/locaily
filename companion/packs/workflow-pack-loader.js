const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../core/result-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PACKS_DIR = path.join(REPO_ROOT, "workflow-packs");
const BUILTIN_WORKFLOWS_PATH = path.join(REPO_ROOT, "companion", "orchestration", "registry", "workflows.json");
const BUILTIN_TRACKS_DIR = path.join(REPO_ROOT, "companion", "crew", "tracks");

const workflowPackManifestSchema = require("../schemas/workflow-pack-manifest.schema.json");
const taskTrackSchema = require("../schemas/internal/task-track.schema.json");
const toolPackManifestToolSchema = require("../schemas/internal/tool-pack-manifest-tool.schema.json");
const toolPackManifestSchema = {
  ...require("../schemas/internal/tool-pack-manifest.schema.json"),
  $defs: {
    manifestTool: toolPackManifestToolSchema
  }
};

function readJsonStrict(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Resolve a pack-relative path and fail closed if it escapes packDir.
 */
function resolveInsidePack(packDir, relativePath) {
  if (!relativePath || typeof relativePath !== "string" || !relativePath.trim()) {
    const err = new Error("Pack path reference must be a non-empty relative path string.");
    err.code = "WORKFLOW_PACK_PATH_INVALID";
    throw err;
  }

  const trimmed = relativePath.trim();
  if (path.isAbsolute(trimmed)) {
    const err = new Error(`Pack path '${trimmed}' must be relative to the pack root, not absolute.`);
    err.code = "WORKFLOW_PACK_PATH_ESCAPE";
    throw err;
  }

  const normalizedRoot = path.resolve(packDir);
  const resolved = path.resolve(normalizedRoot, trimmed);

  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    const err = new Error(`Pack path '${trimmed}' escapes pack directory '${normalizedRoot}'.`);
    err.code = "WORKFLOW_PACK_PATH_ESCAPE";
    throw err;
  }

  return resolved;
}

function createPackError(code, message) {
  return { code, message };
}

function getBuiltinWorkflowIds() {
  try {
    const data = readJsonStrict(BUILTIN_WORKFLOWS_PATH);
    return new Set((data.workflows || []).map((w) => w.workflow_id).filter(Boolean));
  } catch {
    return new Set();
  }
}

function getBuiltinTrackIds() {
  const ids = new Set();
  if (!fs.existsSync(BUILTIN_TRACKS_DIR)) {
    return ids;
  }

  for (const file of fs.readdirSync(BUILTIN_TRACKS_DIR)) {
    if (!file.endsWith(".track.json")) continue;
    try {
      const track = readJsonStrict(path.join(BUILTIN_TRACKS_DIR, file));
      if (track && track.track_id) ids.add(track.track_id);
    } catch {
      // Ignore malformed built-in track files during passive scan
    }
  }
  return ids;
}

function validateInputAgainstRequirements(requirements, input) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return { ok: true, errors: [] };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Fixture input must be an object."] };
  }

  const errors = [];
  for (const req of requirements) {
    const value = input[req.field];
    if (req.required === true && (value === undefined || value === null)) {
      errors.push(`Missing required fixture input field '${req.field}'.`);
      continue;
    }
    if (value === undefined || value === null) continue;

    const matches = req.type === "integer"
      ? Number.isInteger(value)
      : req.type === "array"
        ? Array.isArray(value)
        : req.type === "object"
          ? (typeof value === "object" && !Array.isArray(value))
          : typeof value === req.type;

    if (!matches) {
      errors.push(`Fixture input field '${req.field}' must be of type '${req.type}'.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function resolveTrackReferencedSchema(packDir, schemaRef) {
  if (!schemaRef || typeof schemaRef !== "string") return null;
  const trimmed = schemaRef.trim();
  // First check pack-local path (strictly contained unless clearly built-in repo prefix)
  const isRepoShared = trimmed.startsWith("companion/") || trimmed.startsWith("tool-packs/");
  if (!isRepoShared) {
    const absPack = resolveInsidePack(packDir, trimmed);
    if (!fs.existsSync(absPack)) {
      const err = new Error(`Track schema '${trimmed}' not found inside pack.`);
      err.code = "WORKFLOW_PACK_MISSING_FILE";
      throw err;
    }
    return absPack;
  }

  const absRepo = path.resolve(REPO_ROOT, trimmed);
  if (!absRepo.startsWith(REPO_ROOT + path.sep) || !fs.existsSync(absRepo)) {
    const err = new Error(`Shared schema '${trimmed}' not found in repository.`);
    err.code = "WORKFLOW_PACK_MISSING_FILE";
    throw err;
  }
  return absRepo;
}

/**
 * Validate a Workflow Pack directory on disk without mutating runtime state.
 */
function validateWorkflowPack(packDir) {
  const normalizedPackDir = path.resolve(packDir);
  const issues = [];
  const warnings = [];
  const addIssue = (code, message) => issues.push(createPackError(code, message));

  if (!fs.existsSync(normalizedPackDir) || !fs.statSync(normalizedPackDir).isDirectory()) {
    addIssue("WORKFLOW_PACK_NOT_FOUND", `Pack directory '${normalizedPackDir}' does not exist.`);
    return buildValidationResponse(null, normalizedPackDir, null, issues, warnings, {});
  }

  const manifestPath = path.join(normalizedPackDir, "pack.json");
  if (!fs.existsSync(manifestPath)) {
    addIssue("WORKFLOW_PACK_MANIFEST_MISSING", `Missing pack.json in '${normalizedPackDir}'.`);
    return buildValidationResponse(null, normalizedPackDir, null, issues, warnings, {});
  }

  let manifest;
  try {
    manifest = readJsonStrict(manifestPath);
  } catch (err) {
    addIssue("WORKFLOW_PACK_MANIFEST_PARSE_INVALID", `Failed to parse pack.json: ${err.message}`);
    return buildValidationResponse(null, normalizedPackDir, null, issues, warnings, {});
  }

  const manifestValidation = validateResult(manifest, workflowPackManifestSchema, "pack");
  if (!manifestValidation.ok) {
    for (const errMsg of manifestValidation.errors) {
      addIssue("WORKFLOW_PACK_MANIFEST_INVALID", errMsg);
    }
  }

  const packId = typeof manifest.id === "string" ? manifest.id : null;
  if (packId && path.basename(normalizedPackDir) !== packId) {
    warnings.push(`Directory name '${path.basename(normalizedPackDir)}' differs from manifest.id '${packId}'.`);
  }

  const loadedTracks = new Map();
  const loadedPrompts = new Map();
  const loadedFixtures = [];
  let loadedToolPack = null;
  let loadedPermissions = { required: [], optional: [] };
  let loadedQualReqs = [];

  // 1. Validate declared tracks
  if (Array.isArray(manifest.tracks)) {
    for (const relTrackPath of manifest.tracks) {
      try {
        const absTrackPath = resolveInsidePack(normalizedPackDir, relTrackPath);
        if (!fs.existsSync(absTrackPath)) {
          addIssue("WORKFLOW_PACK_MISSING_FILE", `Declared track file '${relTrackPath}' does not exist.`);
          continue;
        }
        const trackJson = readJsonStrict(absTrackPath);
        const trackVal = validateResult(trackJson, taskTrackSchema, "track");
        if (!trackVal.ok) {
          addIssue("TASK_TRACK_INVALID", `Track '${relTrackPath}' invalid: ${trackVal.errors.join("; ")}`);
          continue;
        }
        if (loadedTracks.has(trackJson.track_id)) {
          addIssue("WORKFLOW_PACK_DUPLICATE_TRACK", `Duplicate track_id '${trackJson.track_id}' inside pack.`);
          continue;
        }
        if (trackJson.output_schema) {
          resolveTrackReferencedSchema(normalizedPackDir, trackJson.output_schema);
        }
        for (const step of trackJson.steps || []) {
          if (step.executor?.type === "model" && step.executor.schema) {
            resolveTrackReferencedSchema(normalizedPackDir, step.executor.schema);
          }
        }
        loadedTracks.set(trackJson.track_id, {
          track: trackJson,
          filePath: absTrackPath,
          relPath: relTrackPath
        });
      } catch (err) {
        addIssue(err.code || "WORKFLOW_PACK_TRACK_ERROR", err.message);
      }
    }
  }

  // 2. Validate tools manifest if declared
  if (typeof manifest.tools === "string") {
    try {
      const absToolsPath = resolveInsidePack(normalizedPackDir, manifest.tools);
      if (!fs.existsSync(absToolsPath)) {
        addIssue("WORKFLOW_PACK_MISSING_FILE", `Declared tools manifest '${manifest.tools}' does not exist.`);
      } else {
        const toolManifest = readJsonStrict(absToolsPath);
        const toolVal = validateResult(toolManifest, toolPackManifestSchema, "manifest");
        if (!toolVal.ok) {
          addIssue("TOOL_PACK_MANIFEST_INVALID", `Tools manifest '${manifest.tools}' invalid: ${toolVal.errors.join("; ")}`);
        } else {
          const toolDir = path.dirname(absToolsPath);
          for (const t of toolManifest.tools || []) {
            for (const schemaKey of ["output_schema", "input_schema"]) {
              if (!t[schemaKey]) continue;
              const absSchema = resolveInsidePack(toolDir, t[schemaKey]);
              // Also verify containment within pack root
              resolveInsidePack(normalizedPackDir, path.relative(normalizedPackDir, absSchema));
              if (!fs.existsSync(absSchema)) {
                addIssue("WORKFLOW_PACK_MISSING_FILE", `Tool '${t.id}' ${schemaKey} '${t[schemaKey]}' does not exist.`);
              } else {
                readJsonStrict(absSchema);
              }
            }
          }
          loadedToolPack = {
            packId,
            packDir: normalizedPackDir,
            toolDir,
            manifestPath: absToolsPath,
            manifest: toolManifest
          };
        }
      }
    } catch (err) {
      addIssue(err.code || "WORKFLOW_PACK_TOOL_ERROR", err.message);
    }
  }

  // 3. Validate declared prompts
  if (manifest.prompts && typeof manifest.prompts === "object" && !Array.isArray(manifest.prompts)) {
    for (const [key, relPromptPath] of Object.entries(manifest.prompts)) {
      try {
        const absPromptPath = resolveInsidePack(normalizedPackDir, relPromptPath);
        if (!fs.existsSync(absPromptPath)) {
          addIssue("WORKFLOW_PACK_MISSING_FILE", `Prompt '${key}' file '${relPromptPath}' does not exist.`);
          continue;
        }
        const template = fs.readFileSync(absPromptPath, "utf8");
        if (!template.trim()) {
          addIssue("WORKFLOW_PACK_PROMPT_EMPTY", `Prompt '${key}' file '${relPromptPath}' is empty.`);
          continue;
        }
        loadedPrompts.set(key, { filePath: absPromptPath, relPath: relPromptPath, template });
      } catch (err) {
        addIssue(err.code || "WORKFLOW_PACK_PROMPT_ERROR", err.message);
      }
    }
  }

  // 4. Validate declared schemas
  if (Array.isArray(manifest.schemas)) {
    for (const relSchemaPath of manifest.schemas) {
      try {
        const absSchemaPath = resolveInsidePack(normalizedPackDir, relSchemaPath);
        if (!fs.existsSync(absSchemaPath)) {
          addIssue("WORKFLOW_PACK_MISSING_FILE", `Declared schema '${relSchemaPath}' does not exist.`);
          continue;
        }
        const parsed = readJsonStrict(absSchemaPath);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          addIssue("WORKFLOW_PACK_SCHEMA_INVALID", `Schema '${relSchemaPath}' must be a JSON object.`);
        }
      } catch (err) {
        addIssue(err.code || "WORKFLOW_PACK_SCHEMA_ERROR", err.message);
      }
    }
  }

  // 5. Validate permissions file
  if (typeof manifest.permissions === "string") {
    try {
      const absPermPath = resolveInsidePack(normalizedPackDir, manifest.permissions);
      if (!fs.existsSync(absPermPath)) {
        addIssue("WORKFLOW_PACK_MISSING_FILE", `Permissions file '${manifest.permissions}' does not exist.`);
      } else {
        const permJson = readJsonStrict(absPermPath);
        if (!permJson || typeof permJson !== "object" || !Array.isArray(permJson.required)) {
          addIssue("WORKFLOW_PACK_PERMISSIONS_INVALID", `Permissions file '${manifest.permissions}' must have a 'required' string array.`);
        } else {
          loadedPermissions = {
            required: permJson.required.filter((p) => typeof p === "string" && p.trim()),
            optional: Array.isArray(permJson.optional) ? permJson.optional.filter((p) => typeof p === "string" && p.trim()) : []
          };
        }
      }
    } catch (err) {
      addIssue(err.code || "WORKFLOW_PACK_PERMISSIONS_ERROR", err.message);
    }
  }

  // 6. Validate qualification requirements
  if (typeof manifest.qualification_requirements === "string") {
    try {
      const absQualPath = resolveInsidePack(normalizedPackDir, manifest.qualification_requirements);
      if (!fs.existsSync(absQualPath)) {
        addIssue("WORKFLOW_PACK_MISSING_FILE", `Qualification requirements file '${manifest.qualification_requirements}' does not exist.`);
      } else {
        const qualJson = readJsonStrict(absQualPath);
        if (!Array.isArray(qualJson)) {
          addIssue("WORKFLOW_PACK_QUAL_INVALID", `Qualification requirements '${manifest.qualification_requirements}' must be an array.`);
        } else {
          for (const req of qualJson) {
            if (!req || typeof req.track_id !== "string" || typeof req.role !== "string") {
              addIssue("WORKFLOW_PACK_QUAL_INVALID", "Each qualification requirement needs string 'track_id' and 'role'.");
            }
          }
          loadedQualReqs = qualJson;
        }
      }
    } catch (err) {
      addIssue(err.code || "WORKFLOW_PACK_QUAL_ERROR", err.message);
    }
  }

  // 7. Validate README if declared
  if (typeof manifest.readme === "string") {
    try {
      const absReadme = resolveInsidePack(normalizedPackDir, manifest.readme);
      if (!fs.existsSync(absReadme)) {
        addIssue("WORKFLOW_PACK_MISSING_FILE", `Declared readme '${manifest.readme}' does not exist.`);
      }
    } catch (err) {
      addIssue(err.code || "WORKFLOW_PACK_README_ERROR", err.message);
    }
  }

  // 8. Validate workflow track references & fixtures
  const builtinTracks = getBuiltinTrackIds();
  const knownTrackIds = new Set([...builtinTracks, ...loadedTracks.keys()]);
  const workflowsById = new Map();

  for (const wf of Array.isArray(manifest.workflows) ? manifest.workflows : []) {
    if (workflowsById.has(wf.workflow_id)) {
      addIssue("WORKFLOW_PACK_DUPLICATE_WORKFLOW", `Duplicate workflow_id '${wf.workflow_id}' inside pack.`);
      continue;
    }
    workflowsById.set(wf.workflow_id, wf);

    if (Array.isArray(wf.composition) && wf.composition.length > 0) {
      for (const entry of wf.composition) {
        if (!knownTrackIds.has(entry.track_id)) {
          addIssue("WORKFLOW_PACK_UNKNOWN_TRACK", `Workflow '${wf.workflow_id}' references unknown track '${entry.track_id}'.`);
        }
      }
    } else if (wf.track_id) {
      if (!knownTrackIds.has(wf.track_id)) {
        addIssue("WORKFLOW_PACK_UNKNOWN_TRACK", `Workflow '${wf.workflow_id}' references unknown track '${wf.track_id}'.`);
      }
    } else {
      addIssue("WORKFLOW_PACK_WORKFLOW_INCOMPLETE", `Workflow '${wf.workflow_id}' must define either 'track_id' or 'composition'.`);
    }
  }

  if (Array.isArray(manifest.fixtures)) {
    for (const fixtureDef of manifest.fixtures) {
      try {
        const absFixturePath = resolveInsidePack(normalizedPackDir, fixtureDef.path);
        if (!fs.existsSync(absFixturePath)) {
          addIssue("WORKFLOW_PACK_MISSING_FILE", `Fixture '${fixtureDef.name}' path '${fixtureDef.path}' does not exist.`);
          continue;
        }
        const fixturePayload = readJsonStrict(absFixturePath);
        const wf = workflowsById.get(fixtureDef.workflow_id);
        if (!wf) {
          addIssue("WORKFLOW_PACK_FIXTURE_INVALID", `Fixture '${fixtureDef.name}' targets unknown pack workflow '${fixtureDef.workflow_id}'.`);
          continue;
        }
        const fixtureInput = fixturePayload && Object.prototype.hasOwnProperty.call(fixturePayload, "input")
          ? fixturePayload.input
          : fixturePayload;
        const reqCheck = validateInputAgainstRequirements(wf.input_requirements, fixtureInput);
        if (!reqCheck.ok) {
          addIssue("WORKFLOW_PACK_FIXTURE_INVALID", `Fixture '${fixtureDef.name}' input invalid: ${reqCheck.errors.join("; ")}`);
          continue;
        }
        loadedFixtures.push({
          ...fixtureDef,
          absPath: absFixturePath,
          payload: fixturePayload,
          input: fixtureInput
        });
      } catch (err) {
        addIssue(err.code || "WORKFLOW_PACK_FIXTURE_ERROR", err.message);
      }
    }
  }

  return buildValidationResponse(packId, normalizedPackDir, manifest, issues, warnings, {
    tracks: loadedTracks,
    toolPack: loadedToolPack,
    prompts: loadedPrompts,
    fixtures: loadedFixtures,
    permissions: loadedPermissions,
    qualificationRequirements: loadedQualReqs
  });
}

function buildValidationResponse(packId, packDir, manifest, issues, warnings, loaded) {
  const errorCodes = [...new Set(issues.map((i) => i.code))];
  const errors = issues.map((i) => `[${i.code}] ${i.message}`);
  return {
    ok: issues.length === 0,
    packId,
    packDir,
    manifest,
    errors,
    errorCodes,
    warnings,
    loaded,
    summary: manifest ? {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      trust: manifest.trust,
      workflowCount: (manifest.workflows || []).length,
      trackCount: (manifest.tracks || []).length,
      toolCount: loaded.toolPack ? (loaded.toolPack.manifest.tools || []).length : 0,
      promptCount: Object.keys(manifest.prompts || {}).length,
      fixtureCount: (manifest.fixtures || []).length
    } : null
  };
}

function getConfiguredPackRoots(options = {}) {
  if (Array.isArray(options.packDirs)) {
    return options.packDirs.map((d) => path.resolve(d));
  }

  const roots = [DEFAULT_PACKS_DIR];
  const envDirs = process.env.LOCAILY_WORKFLOW_PACK_DIRS;
  if (typeof envDirs === "string" && envDirs.trim()) {
    for (const part of envDirs.split(/[,;]/)) {
      const trimmed = part.trim();
      if (trimmed) roots.push(path.resolve(trimmed));
    }
  }
  if (Array.isArray(options.extraPackDirs)) {
    for (const extra of options.extraPackDirs) {
      if (extra) roots.push(path.resolve(extra));
    }
  }
  return [...new Set(roots)];
}

function discoverPackDirectories(roots) {
  const dirs = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let stat;
    try {
      stat = fs.statSync(root);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    // Allow pointing directly at a single pack directory containing pack.json
    if (fs.existsSync(path.join(root, "pack.json"))) {
      dirs.push(root);
      continue;
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name);
      if (fs.existsSync(path.join(candidate, "pack.json"))) {
        dirs.push(candidate);
      }
    }
  }
  return dirs;
}

/**
 * Create an isolated Workflow Pack registry instance.
 */
function createWorkflowPackRegistry(options = {}) {
  const packsById = new Map();
  const workflowsById = new Map();
  const tracksById = new Map();
  const promptsByKey = new Map();
  const toolPacks = [];
  const loadErrors = [];

  function reload(reloadOpts = options) {
    packsById.clear();
    workflowsById.clear();
    tracksById.clear();
    promptsByKey.clear();
    toolPacks.length = 0;
    loadErrors.length = 0;

    const builtinWorkflowIds = getBuiltinWorkflowIds();
    const builtinTrackIds = getBuiltinTrackIds();
    const roots = getConfiguredPackRoots(reloadOpts);
    const packDirs = discoverPackDirectories(roots);

    for (const packDir of packDirs) {
      const validation = validateWorkflowPack(packDir);
      if (!validation.ok) {
        loadErrors.push({
          code: validation.errorCodes[0] || "WORKFLOW_PACK_INVALID",
          packId: validation.packId,
          packDir,
          errors: validation.errors
        });
        continue;
      }

      const { manifest, loaded } = validation;
      const packId = manifest.id;

      if (packsById.has(packId)) {
        loadErrors.push({
          code: "WORKFLOW_PACK_ID_CONFLICT",
          packId,
          packDir,
          errors: [`[WORKFLOW_PACK_ID_CONFLICT] Duplicate pack id '${packId}'.`]
        });
        continue;
      }

      const conflictingWf = (manifest.workflows || []).find(
        (wf) => builtinWorkflowIds.has(wf.workflow_id) || workflowsById.has(wf.workflow_id)
      );
      if (conflictingWf) {
        loadErrors.push({
          code: "WORKFLOW_PACK_ID_CONFLICT",
          packId,
          packDir,
          errors: [`[WORKFLOW_PACK_ID_CONFLICT] Workflow id '${conflictingWf.workflow_id}' conflicts with an existing workflow.`]
        });
        continue;
      }

      let conflictingTrackId = null;
      for (const trackId of loaded.tracks.keys()) {
        if (builtinTrackIds.has(trackId) || tracksById.has(trackId)) {
          conflictingTrackId = trackId;
          break;
        }
      }
      if (conflictingTrackId) {
        loadErrors.push({
          code: "WORKFLOW_PACK_ID_CONFLICT",
          packId,
          packDir,
          errors: [`[WORKFLOW_PACK_ID_CONFLICT] Track id '${conflictingTrackId}' conflicts with an existing track.`]
        });
        continue;
      }

      // Register tracks
      const trackMetaMap = manifest.track_metadata || {};
      for (const [trackId, trackEntry] of loaded.tracks.entries()) {
        tracksById.set(trackId, {
          track: trackEntry.track,
          packId,
          packDir,
          filePath: trackEntry.filePath,
          metadata: trackMetaMap[trackId] || {}
        });
      }

      // Register prompts
      for (const [templateKey, promptEntry] of loaded.prompts.entries()) {
        promptsByKey.set(templateKey, {
          packId,
          packDir,
          filePath: promptEntry.filePath,
          template: promptEntry.template
        });
      }

      // Register tool pack descriptor
      if (loaded.toolPack) {
        toolPacks.push({
          packId,
          packDir,
          toolDir: loaded.toolPack.toolDir,
          manifestPath: loaded.toolPack.manifestPath,
          tools: loaded.toolPack.manifest.tools || []
        });
      }

      // Register workflows
      for (const wf of manifest.workflows || []) {
        const firstFixture = loaded.fixtures.find((f) => f.workflow_id === wf.workflow_id);
        workflowsById.set(wf.workflow_id, {
          ...wf,
          pack_id: packId,
          pack_version: manifest.version,
          pack_trust: manifest.trust,
          default_fixture_input: firstFixture ? firstFixture.input : null
        });
      }

      packsById.set(packId, {
        id: packId,
        name: manifest.name,
        version: manifest.version,
        trust: manifest.trust,
        description: manifest.description,
        packDir,
        manifest,
        permissions: loaded.permissions,
        qualificationRequirements: loaded.qualificationRequirements,
        fixtures: loaded.fixtures.map((f) => ({
          name: f.name,
          workflow_id: f.workflow_id,
          path: f.path,
          expected_fields: f.expected_fields || []
        })),
        workflows: (manifest.workflows || []).map((w) => w.workflow_id),
        tracks: [...loaded.tracks.keys()],
        tools: loaded.toolPack ? (loaded.toolPack.manifest.tools || []).map((t) => t.id) : [],
        prompts: [...loaded.prompts.keys()]
      });
    }
  }

  reload(options);

  return {
    reload,
    listPacks() {
      return [...packsById.values()].map(toPublicPackSummary);
    },
    getPack(packId) {
      const record = packsById.get(packId);
      return record ? toPublicPackSummary(record) : null;
    },
    getLoadErrors() {
      return [...loadErrors];
    },
    listPackWorkflows() {
      return [...workflowsById.values()];
    },
    getPackWorkflow(workflowId) {
      return workflowsById.get(workflowId) || null;
    },
    listPackTracks() {
      return [...tracksById.values()].map((entry) => ({
        track_id: entry.track.track_id,
        version: entry.track.version,
        name: entry.track.name,
        description: entry.track.description,
        steps: Array.isArray(entry.track.steps) ? entry.track.steps.map((s) => s.id) : [],
        pack_id: entry.packId
      }));
    },
    listPackTrackIds() {
      return [...tracksById.keys()];
    },
    getPackTrack(trackId) {
      const entry = tracksById.get(trackId);
      return entry ? entry.track : null;
    },
    getPackDirForTrack(trackId) {
      const entry = tracksById.get(trackId);
      return entry ? entry.packDir : null;
    },
    getPackTrackMetadata(trackId) {
      const entry = tracksById.get(trackId);
      return entry ? entry.metadata : null;
    },
    getPackPromptTemplate(templateKey) {
      const entry = promptsByKey.get(templateKey);
      return entry ? entry.template : null;
    },
    getToolPackDescriptors() {
      return [...toolPacks];
    },
    resolvePackSchemaPath(schemaPath, trackId = null) {
      if (!schemaPath || typeof schemaPath !== "string") return null;
      const trimmed = schemaPath.trim();
      if (trackId) {
        const entry = tracksById.get(trackId);
        if (entry) {
          const isRepoShared = trimmed.startsWith("companion/") || trimmed.startsWith("tool-packs/");
          if (!isRepoShared) {
            const candidate = resolveInsidePack(entry.packDir, trimmed);
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        }
      }
      return path.resolve(REPO_ROOT, trimmed);
    }
  };
}

function toPublicPackSummary(record) {
  return {
    id: record.id,
    name: record.name,
    version: record.version,
    trust: record.trust,
    description: record.description,
    workflows: record.workflows,
    tracks: record.tracks,
    tools: record.tools,
    prompts: record.prompts,
    fixtures: record.fixtures,
    permissions: record.permissions,
    qualification_requirements: record.qualificationRequirements
  };
}

function evaluatePackPermissions(pack, permissionManager) {
  const perms = (pack && pack.permissions) || { required: [], optional: [] };
  const required = Array.isArray(perms.required) ? perms.required : [];
  const optional = Array.isArray(perms.optional) ? perms.optional : [];

  if (!permissionManager || typeof permissionManager.list !== "function") {
    return {
      ok: required.length === 0,
      required,
      optional,
      approved: [],
      missing: required,
      denied: []
    };
  }

  const state = permissionManager.list();
  const approvedSet = new Set(state.approved || []);
  const deniedSet = new Set(state.denied || []);

  const approved = required.filter((p) => approvedSet.has(p) && !deniedSet.has(p));
  const denied = required.filter((p) => deniedSet.has(p));
  const missing = required.filter((p) => !approvedSet.has(p) && !deniedSet.has(p));

  return {
    ok: denied.length === 0 && missing.length === 0,
    required,
    optional,
    approved,
    missing,
    denied
  };
}

function evaluatePackQualificationReadiness(pack, qualificationResolver) {
  const reqs = (pack && (pack.qualification_requirements || pack.qualificationRequirements)) || [];
  if (!Array.isArray(reqs) || reqs.length === 0) {
    return { ready: true, requirements: [] };
  }

  const allCaps = qualificationResolver && typeof qualificationResolver.resolveAllCapabilities === "function"
    ? qualificationResolver.resolveAllCapabilities()
    : [];

  const evaluated = reqs.map((req) => {
    const minStatus = req.min_status || "qualified";
    const minScore = typeof req.min_score === "number" ? req.min_score : 0;
    const matches = allCaps.filter((c) => c.trackId === req.track_id && c.role === req.role);
    const qualified = matches.find((c) => {
      const statusOk = minStatus === "conditional"
        ? (c.state === "qualified" || c.state === "conditional")
        : c.state === "qualified";
      const scoreOk = (c.score ?? 0) >= minScore;
      return statusOk && scoreOk;
    });

    const bestMatch = qualified || matches[0] || null;
    return {
      track_id: req.track_id,
      role: req.role,
      min_status: minStatus,
      min_score: minScore,
      satisfied: Boolean(qualified),
      current_state: bestMatch ? bestMatch.state : "untested",
      matched_model: bestMatch ? bestMatch.modelId : null,
      score: bestMatch ? bestMatch.score : null
    };
  });

  return {
    ready: evaluated.every((r) => r.satisfied),
    requirements: evaluated
  };
}

let defaultRegistry = null;

function getDefaultWorkflowPackRegistry() {
  if (!defaultRegistry) {
    defaultRegistry = createWorkflowPackRegistry();
  }
  return defaultRegistry;
}

function reloadDefaultWorkflowPacks(options = {}) {
  const reg = getDefaultWorkflowPackRegistry();
  reg.reload(options);
  return reg;
}

function resolvePackSchemaPath(schemaPath, trackId = null) {
  return getDefaultWorkflowPackRegistry().resolvePackSchemaPath(schemaPath, trackId);
}

module.exports = {
  DEFAULT_PACKS_DIR,
  resolveInsidePack,
  validateWorkflowPack,
  createWorkflowPackRegistry,
  evaluatePackPermissions,
  evaluatePackQualificationReadiness,
  getDefaultWorkflowPackRegistry,
  reloadDefaultWorkflowPacks,
  resolvePackSchemaPath
};
