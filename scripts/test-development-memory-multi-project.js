const assert = require("node:assert");
const { mkdtempSync, rmSync, existsSync } = require("node:fs");
const { readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createDevelopmentProjectRegistry } = require("../companion/memory/projects/project-registry");
const { generateStarterVault } = require("../companion/memory/projects/vault-generator");
const { validateImportVault } = require("../companion/memory/projects/vault-import");
const { buildProjectHealthReport } = require("../companion/memory/projects/project-health");
const { runProjectSetupStep } = require("../companion/memory/projects/project-setup");
const { createDevelopmentEventStore } = require("../companion/memory/events/event-store");

const VALID_EVENT_PATH = join(__dirname, "..", "companion", "schemas", "fixtures", "development-memory", "event.valid.json");

async function loadValidEvent(overrides = {}) {
  const event = JSON.parse(await readFile(VALID_EVENT_PATH, "utf8"));
  return { ...event, ...overrides };
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  return (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(`  ${error.message}`);
    }
  })();
}

async function run() {
  const checks = [
    ["registers projects with namespaced storage paths", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm10-registry-"));
      const registry = createDevelopmentProjectRegistry({
        repoRoot: root,
        registryRoot: join(root, "memory", "projects")
      });

      const alpha = registry.registerProject({
        slug: "alpha",
        displayName: "Alpha Project",
        workspaceRoot: root,
        setActive: true
      });
      assert.strictEqual(alpha.ok, true);
      assert.strictEqual(alpha.result.storageLayout, "namespaced");

      const paths = registry.resolveMemoryPaths("alpha");
      assert.ok(paths.eventsDir.includes(`${join("projects", "alpha")}`));
      assert.ok(existsSync(paths.eventsDir));

      rmSync(root, { recursive: true, force: true });
    }],
    ["isolates events and candidates by registered project slug", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm10-isolation-"));
      const registry = createDevelopmentProjectRegistry({
        repoRoot: root,
        registryRoot: join(root, "memory", "projects")
      });

      registry.registerProject({ slug: "alpha", displayName: "Alpha", workspaceRoot: root });
      registry.registerProject({ slug: "beta", displayName: "Beta", workspaceRoot: root });

      const alphaPaths = registry.resolveMemoryPaths("alpha");
      const betaPaths = registry.resolveMemoryPaths("beta");
      const alphaEvents = createDevelopmentEventStore({ dataDir: alphaPaths.eventsDir });
      const betaEvents = createDevelopmentEventStore({ dataDir: betaPaths.eventsDir });

      await alphaEvents.appendEvent(await loadValidEvent({
        eventId: "evt_alpha_test_001",
        project: "alpha",
        eventType: "human_note",
        source: { adapter: "human" },
        summary: "Alpha-only event"
      }));

      await betaEvents.appendEvent(await loadValidEvent({
        eventId: "evt_beta_test_001",
        project: "beta",
        eventType: "human_note",
        source: { adapter: "human" },
        summary: "Beta-only event"
      }));

      const alphaQuery = await alphaEvents.queryEvents({ project: "alpha" });
      const betaQuery = await betaEvents.queryEvents({ project: "beta" });

      assert.strictEqual(alphaQuery.result.count, 1);
      assert.strictEqual(betaQuery.result.count, 1);
      assert.strictEqual(alphaQuery.result.events[0].project, "alpha");
      assert.strictEqual(betaQuery.result.events[0].project, "beta");

      rmSync(root, { recursive: true, force: true });
    }],
    ["generates canonical starter vault and validates import", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm10-vault-"));
      const vaultPath = join(root, "vault-alpha");
      const generated = generateStarterVault({
        vaultPath,
        slug: "alpha",
        displayName: "Alpha Project",
        layout: "canonical"
      });

      assert.strictEqual(generated.ok, true);
      assert.ok(existsSync(join(vaultPath, "projects", "alpha", "STATUS.md")));
      assert.ok(existsSync(join(vaultPath, ".memory-bridge", "capture-policy.json")));

      const imported = validateImportVault({ vaultPath, slug: "alpha" });
      assert.strictEqual(imported.ok, true);
      assert.strictEqual(imported.result.hasCapturePolicy, true);

      rmSync(root, { recursive: true, force: true });
    }],
    ["setup flow registers, generates vault, and reports health", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm10-setup-"));
      const registry = createDevelopmentProjectRegistry({
        repoRoot: root,
        registryRoot: join(root, "memory", "projects")
      });
      const vaultPath = join(root, "vault-gamma");

      const registered = registry.registerProject({
        slug: "gamma",
        displayName: "Gamma Project",
        workspaceRoot: root,
        setActive: true
      });
      assert.strictEqual(registered.ok, true);

      const generated = runProjectSetupStep(registry, "generate-vault", {
        slug: "gamma",
        vaultPath,
        layout: "canonical"
      });
      assert.strictEqual(generated.ok, true);

      const enabled = runProjectSetupStep(registry, "enable-capture", { slug: "gamma" });
      assert.strictEqual(enabled.ok, true);

      const health = await buildProjectHealthReport(registry, "gamma");
      assert.strictEqual(health.ok, true);
      assert.strictEqual(health.result.slug, "gamma");
      assert.ok(health.result.memoryPaths.eventsDir.includes("gamma"));

      rmSync(root, { recursive: true, force: true });
    }],
    ["rejects duplicate project registration", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm10-dup-"));
      const registry = createDevelopmentProjectRegistry({
        repoRoot: root,
        registryRoot: join(root, "memory", "projects")
      });

      const first = registry.registerProject({ slug: "dup-test", displayName: "Dup", workspaceRoot: root });
      const second = registry.registerProject({ slug: "dup-test", displayName: "Dup", workspaceRoot: root });

      assert.strictEqual(first.ok, true);
      assert.strictEqual(second.ok, false);
      assert.strictEqual(second.error.code, "PROJECT_ALREADY_REGISTERED");

      rmSync(root, { recursive: true, force: true });
    }]
  ];

  for (const [name, fn] of checks) {
    await check(name, fn);
  }

  console.log(`\nMulti-project tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
