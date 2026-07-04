const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { createToolRegistry } = require("../companion/tools/registry");
const {
  buildNarrowExtractionPrompt,
  validateNarrowSignal,
  calculateDuplicateRate
} = require("../companion/editorial/narrow-extractor");

async function main() {
  const root = mkdtempSync(join(tmpdir(), "locaily-editorial-"));

  try {
    mkdirSync(join(root, "wiki", "topics"), { recursive: true });
    writeFileSync(join(root, "index.md"), "# Index\n", "utf8");
    writeFileSync(join(root, "wiki", "topics", "Build Note.md"), "# Build Note\nA concrete thing changed and the strange part surprised me.\n", "utf8");

    const adapter = createVaultAdapter({
      enabled: true,
      vaultPath: root,
      readPolicy: "allowlist",
      allowedPaths: ["index.md", "wiki/topics/"],
      blockedPaths: ["raw/"],
      rawAccess: false
    });
    const registry = createToolRegistry();
    const scanTool = registry.get("editorial.scan_vault");
    const runtime = {
      generateJson: async () => ({
        signals: [
          buildSignal("A useful source-linked build story", ["wiki/topics/Build Note.md"]),
          buildSignal("A blocked raw-path hallucination", ["raw/secret.md"]),
          buildSignal("right", ["wiki/topics/Build Note.md"])
        ]
      })
    };
    const scan = await scanTool.handle({
      input: { editorialBrief: "Find real build stories.", batchCharLimit: 4000 },
      runtime,
      options: { memoryBridge: { adapter } }
    });

    assert.equal(scan.manifest.eligibleFileCount, 2);
    assert.equal(scan.manifest.processedFileCount, 2);
    assert.equal(scan.signals.length, 1, "Expected invalid source paths and tiny headlines to be removed.");
    assert.deepEqual(scan.signals[0].supportingFiles, ["wiki/topics/Build Note.md"]);

    const verifyReport = registry.get("editorial.verify_report");
    const reportCheck = await verifyReport.handle({
      input: {
        manifest: scan.manifest,
        report: {
          recommendedOpportunity: 0,
          opportunities: [{ ...scan.signals[0], selectionReason: "Concrete evidence." }]
        }
      }
    });
    assert.equal(reportCheck.valid, true);

    const promptEchoCheck = await verifyReport.handle({
      input: {
        manifest: scan.manifest,
        report: {
          recommendedOpportunity: 0,
          opportunities: [{
            ...scan.signals[0],
            headlineDirection: "x".repeat(141),
            selectionReason: "Prompt echo."
          }]
        }
      }
    });
    assert.equal(promptEchoCheck.valid, false);

    const verifyDraft = registry.get("editorial.verify_operator_log");
    const prose = Array.from({ length: 310 }, (_, index) => `word${index}`).join(" ");
    const draftCheck = await verifyDraft.handle({
      input: {
        draft: {
          slug: "useful-build-story",
          metaDescription: "What changed and why the strange part mattered.",
          supportingFiles: ["wiki/topics/Build Note.md"],
          sitemapEntry: "<url><loc>https://lemonteed.com/operator-log/useful-build-story/</loc></url>",
          html: `<!DOCTYPE html><html><head><meta name="description" content="test"><link rel="canonical" href="https://lemonteed.com/operator-log/useful-build-story/"><meta property="article:published_time" content="2026-06-18"></head><body><h1>Useful build story</h1><h2>The problem</h2><h2>What I did</h2><h2>The weird part</h2><h2>What's next</h2><p>${prose}</p></body></html>`
        }
      }
    });
    assert.equal(draftCheck.valid, true);

    const sourceContent = "The parser dropped duplicate audits. The validator then preserved the original metric. The odd part was that less model freedom produced a better handoff.";
    const narrowSignal = {
      sourcePath: "wiki/topics/Build Note.md",
      evidenceExcerpt: "The parser dropped duplicate audits.",
      problem: "The parser had duplicate audits.",
      change: "The validator preserved the original metric.",
      unexpectedObservation: "Less model freedom produced a better handoff.",
      evidenceStrength: "strong"
    };
    const narrowValidation = validateNarrowSignal(narrowSignal, {
      sourcePath: "wiki/topics/Build Note.md",
      content: sourceContent,
      editorialBrief: "Find concrete Operator Log story evidence."
    });
    assert.equal(narrowValidation.valid, true);

    const inventedExcerpt = validateNarrowSignal({
      ...narrowSignal,
      evidenceExcerpt: "This excerpt was invented."
    }, {
      sourcePath: "wiki/topics/Build Note.md",
      content: sourceContent,
      editorialBrief: "Find concrete Operator Log story evidence."
    });
    assert.equal(inventedExcerpt.valid, false);
    assert.equal(inventedExcerpt.excerptFound, false);

    assert(calculateDuplicateRate([narrowSignal, { ...narrowSignal }]) > 0.2);
    const narrowPrompt = buildNarrowExtractionPrompt({
      sourcePath: "wiki/topics/Build Note.md",
      content: sourceContent,
      editorialBrief: "Find evidence."
    });
    assert(!narrowPrompt.includes("publishabilityScore"));
    assert(narrowPrompt.includes("Do not generate a headline"));

    console.log("editorial-pack-unit-test: all checks passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function buildSignal(headlineDirection, supportingFiles) {
  return {
    headlineDirection,
    postType: "BUILD NOTES",
    zone: "Studio Lab",
    status: "IN PROGRESS",
    problem: "A concrete problem.",
    whatChanged: "A concrete change.",
    weirdPart: "A genuine surprise.",
    supportingFiles,
    missingFacts: [],
    publishabilityScore: 80,
    duplicateRisk: "low"
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
