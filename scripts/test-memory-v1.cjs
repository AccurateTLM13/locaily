const assert = require("node:assert");
const { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(`  ${error.message}`);
  }
}

function makeVault({ allowApply = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "locaily-mem-"));
  writeFileSync(join(root, "index.md"), "# Test Vault\n");
  mkdirSync(join(root, "projects"), { recursive: true });
  writeFileSync(join(root, "projects", "alpha.md"), "# Alpha\nThe lighthouse audit found a slow server response time.\n");
  writeFileSync(join(root, "projects", "beta.md"), "# Beta\nAccessibility contrast ratio failed WCAG AA.\n");
  return createVaultAdapter({
    enabled: true,
    vaultPath: root,
    allowApply,
    allowedPaths: ["index.md", "projects/", "topics/"],
    blockedPaths: ["raw/", "private/", ".memory-bridge/writeback-inbox/"]
  });
}

check("v1 search returns ranked hits by term frequency", () => {
  const adapter = makeVault();
  const result = adapter.search("lighthouse audit server", { limit: 5 });
  assert.ok(result.ok, JSON.stringify(result.error));
  assert.ok(result.result.count >= 1);
  const top = result.result.hits[0];
  assert.ok(top.path.startsWith("projects/"));
  assert.ok(top.score >= 1);
});

check("v1 search rejects empty query", () => {
  const adapter = makeVault();
  const result = adapter.search("");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error.code, "MISSING_QUERY");
});

check("v1 search disabled vault reports not readable", () => {
  const adapter = createVaultAdapter({ enabled: false, vaultPath: null });
  const result = adapter.search("anything");
  assert.strictEqual(result.ok, false);
});

check("v1 applyWriteback writes to allowlisted path", () => {
  const adapter = makeVault({ allowApply: true });
  const result = adapter.applyWriteback({
    targetPath: "projects/learnings.md",
    content: "# Learnings\n- Applied from relay node run.\n"
  });
  assert.ok(result.ok, JSON.stringify(result.error));
  const written = join(adapter.getVaultRoot(), "projects", "learnings.md");
  assert.ok(existsSync(written));
  assert.ok(readFileSync(written, "utf8").includes("Applied from relay node run"));
});

check("v1 applyWriteback refuses non-allowlisted path", () => {
  const adapter = makeVault({ allowApply: true });
  const result = adapter.applyWriteback({
    targetPath: "private/secret.md",
    content: "nope"
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error.code, "PATH_NOT_ALLOWED");
});

check("v1 applyWriteback refuses when apply disabled", () => {
  const adapter = makeVault({ allowApply: false });
  const result = adapter.applyWriteback({
    targetPath: "projects/x.md",
    content: "nope"
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error.code, "WRITEBACK_APPLY_DISABLED");
});

console.log(`\n${passed}/${passed + failed} memory v1 tests passed`);
process.exit(failed === 0 ? 0 : 1);
