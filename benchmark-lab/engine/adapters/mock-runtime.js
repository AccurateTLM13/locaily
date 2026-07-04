class MockRuntimeAdapter {
  constructor({ responsesByCaseId }) {
    this.responsesByCaseId = responsesByCaseId || {};
  }

  async generate({ caseId }) {
    const response = this.responsesByCaseId[caseId];

    if (!response) {
      return {
        ok: false,
        errorCode: "MOCK_RESPONSE_NOT_FOUND",
        rawText: "",
        durationMs: 0
      };
    }

    if (response.type === "timeout") {
      return {
        ok: false,
        errorCode: "TIMEOUT",
        rawText: "",
        durationMs: response.durationMs || 0
      };
    }

    if (response.type === "runtime-error") {
      return {
        ok: false,
        errorCode: "RUNTIME_ERROR",
        rawText: "",
        durationMs: response.durationMs || 0
      };
    }

    if (response.type === "malformed") {
      return {
        ok: true,
        rawText: response.rawText,
        durationMs: response.durationMs || 0
      };
    }

    return {
      ok: true,
      rawText: JSON.stringify(response.output),
      durationMs: response.durationMs || 0
    };
  }
}

module.exports = {
  MockRuntimeAdapter
};
