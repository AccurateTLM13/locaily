const { readFile } = require("node:fs/promises");
const path = require("node:path");

const STATIC_FILES = {
  "/console": {
    file: "index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/console/": {
    file: "index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/console/app.js": {
    file: "app.js",
    contentType: "text/javascript; charset=utf-8"
  },
  "/console/styles.css": {
    file: "styles.css",
    contentType: "text/css; charset=utf-8"
  },
  "/console/assets/locaily-logo.svg": {
    file: "assets/locaily-logo.svg",
    contentType: "image/svg+xml"
  }
};

function createConsoleController({
  runStore,
  validationRunner,
  getStatusSnapshot,
  localSetupStore,
  onSetupSaved
}) {
  async function serveStatic(pathname) {
    const asset = STATIC_FILES[pathname];

    if (!asset) {
      return null;
    }

    const body = await readFile(path.join(__dirname, asset.file));

    return {
      statusCode: 200,
      contentType: asset.contentType,
      body
    };
  }

  async function getStatus() {
    return {
      statusCode: 200,
      body: await getStatusSnapshot()
    };
  }

  async function startValidation(body) {
    try {
      const run = await validationRunner.startValidation({
        url: body && body.url,
        mode: body && body.mode,
        pastedReport: body && body.pastedReport
      });

      return {
        statusCode: 202,
        body: {
          ok: true,
          runId: run.runId,
          status: run.status,
          run
        }
      };
    } catch (error) {
      return {
        statusCode: error.statusCode || 400,
        body: {
          ok: false,
          code: error.code || "VALIDATION_START_FAILED",
          message: error.message || "Validation could not be started.",
          nextStep: "Check the URL and workflow mode, then try again."
        }
      };
    }
  }

  async function savePageSpeedKey(body) {
    try {
      localSetupStore.savePageSpeedApiKey(body && body.apiKey);
      if (typeof onSetupSaved === "function") {
        onSetupSaved();
      }

      return {
        statusCode: 200,
        body: {
          ok: true,
          setup: localSetupStore.getPublicSetup(),
          message: "PageSpeed API key saved locally."
        }
      };
    } catch (error) {
      return {
        statusCode: error.statusCode || 400,
        body: {
          ok: false,
          code: error.code || "SETUP_SAVE_FAILED",
          message: error.message || "PageSpeed API key could not be saved.",
          nextStep: "Enter a non-empty API key and try again."
        }
      };
    }
  }

  async function saveMemoryVaultPath(body) {
    try {
      localSetupStore.saveMemoryValidationVaultPath(body && body.vaultPath);
      if (typeof onSetupSaved === "function") {
        onSetupSaved();
      }

      return {
        statusCode: 200,
        body: {
          ok: true,
          setup: localSetupStore.getPublicSetup(),
          message: "Memory vault path saved locally."
        }
      };
    } catch (error) {
      return {
        statusCode: error.statusCode || 400,
        body: {
          ok: false,
          code: error.code || "SETUP_SAVE_FAILED",
          message: error.message || "Memory vault path could not be saved.",
          nextStep: "Enter a valid local vault path and try again."
        }
      };
    }
  }

  async function listRuns(searchParams) {
    const limit = searchParams.get("limit") || 50;
    const result = await runStore.listRuns(limit);

    return {
      statusCode: 200,
      body: result
    };
  }

  async function getRun(runId) {
    const result = await runStore.getRun(runId);

    if (!result.ok) {
      return {
        statusCode: 404,
        body: {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          nextStep: result.error.nextStep
        }
      };
    }

    return {
      statusCode: 200,
      body: {
        ok: true,
        run: result.run
      }
    };
  }

  return {
    serveStatic,
    getStatus,
    startValidation,
    savePageSpeedKey,
    saveMemoryVaultPath,
    listRuns,
    getRun
  };
}

module.exports = {
  createConsoleController
};
