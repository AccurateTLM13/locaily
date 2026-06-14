const PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const DEFAULT_STRATEGY = "mobile";
const DEFAULT_TIMEOUT_MS = 60000;
const CATEGORY_PARAMS = ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"];

let resolveApiKey = () => process.env.PAGESPEED_API_KEY || null;

function configurePageSpeed({ getApiKey } = {}) {
  if (typeof getApiKey === "function") {
    resolveApiKey = getApiKey;
  }
}

function getConfiguredApiKey() {
  const key = resolveApiKey();
  return key && String(key).trim() ? String(key).trim() : null;
}

function getPageSpeedStatus() {
  const apiKeyConfigured = Boolean(getConfiguredApiKey());

  return {
    endpoint: PAGESPEED_ENDPOINT,
    strategy: DEFAULT_STRATEGY,
    apiKeyConfigured,
    ready: true,
    warnings: apiKeyConfigured
      ? []
      : ["PageSpeed API key is not configured; live capture will use public quota if available."]
  };
}

async function capturePageSpeed(url, options = {}) {
  const requestUrl = buildPageSpeedUrl(url, options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message = body && body.error && body.error.message
        ? body.error.message
        : `PageSpeed request failed with HTTP ${response.status}.`;
      const error = new Error(message);
      error.code = "PAGESPEED_CAPTURE_FAILED";
      error.statusCode = response.status;
      throw error;
    }

    return {
      raw: body,
      slim: slimPageSpeedResult(body, url)
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("PageSpeed request timed out.");
      timeoutError.code = "PAGESPEED_TIMEOUT";
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePastedPageSpeedReport(value, fallbackUrl) {
  let parsed = value;

  if (typeof value === "string") {
    parsed = JSON.parse(value);
  }

  if (!parsed || typeof parsed !== "object") {
    const error = new Error("Pasted report must be a PageSpeed JSON object.");
    error.code = "INVALID_PASTED_REPORT";
    error.statusCode = 400;
    throw error;
  }

  if (!parsed.lighthouseResult && parsed.raw && parsed.raw.lighthouseResult) {
    parsed = parsed.raw;
  }

  if (!parsed.lighthouseResult) {
    const error = new Error("Pasted report is missing lighthouseResult.");
    error.code = "INVALID_PASTED_REPORT";
    error.statusCode = 400;
    throw error;
  }

  const url = parsed.lighthouseResult.finalUrl
    || parsed.lighthouseResult.requestedUrl
    || parsed.id
    || fallbackUrl;

  return {
    raw: parsed,
    slim: slimPageSpeedResult(parsed, url)
  };
}

function buildPageSpeedUrl(url, options = {}) {
  const requestUrl = new URL(PAGESPEED_ENDPOINT);
  requestUrl.searchParams.set("url", url);
  requestUrl.searchParams.set("strategy", options.strategy || DEFAULT_STRATEGY);

  for (const category of CATEGORY_PARAMS) {
    requestUrl.searchParams.append("category", category);
  }

  const apiKey = getConfiguredApiKey();
  if (apiKey) {
    requestUrl.searchParams.set("key", apiKey);
  }

  return requestUrl;
}

function slimPageSpeedResult(pageSpeedResult, requestedUrl) {
  const lighthouse = pageSpeedResult && pageSpeedResult.lighthouseResult
    ? pageSpeedResult.lighthouseResult
    : {};
  const categories = lighthouse.categories || {};
  const audits = lighthouse.audits || {};
  const finalUrl = lighthouse.finalUrl || pageSpeedResult.id || requestedUrl;

  return {
    url: finalUrl,
    capturedAt: lighthouse.fetchTime || new Date().toISOString(),
    scores: {
      performance: normalizeCategoryScore(categories.performance),
      accessibility: normalizeCategoryScore(categories.accessibility),
      bestPractices: normalizeCategoryScore(categories["best-practices"]),
      seo: normalizeCategoryScore(categories.seo)
    },
    opportunities: extractOpportunities(audits),
    diagnostics: extractDiagnostics(audits)
  };
}

function normalizeCategoryScore(category) {
  if (!category || typeof category.score !== "number" || !Number.isFinite(category.score)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(category.score * 100)));
}

function extractOpportunities(audits) {
  return Object.entries(audits)
    .filter(([, audit]) => isOpportunity(audit))
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      description: audit.description || null,
      displayValue: audit.displayValue || null,
      score: typeof audit.score === "number" ? audit.score : null,
      numericValue: typeof audit.numericValue === "number" ? audit.numericValue : null,
      metricSavings: audit.details && audit.details.metricSavings
        ? audit.details.metricSavings
        : null
    }))
    .sort((a, b) => (b.numericValue || 0) - (a.numericValue || 0))
    .slice(0, 8);
}

function extractDiagnostics(audits) {
  return Object.entries(audits)
    .filter(([, audit]) => audit && audit.scoreDisplayMode === "informative")
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      displayValue: audit.displayValue || null
    }))
    .slice(0, 6);
}

function isOpportunity(audit) {
  if (!audit || !audit.title) {
    return false;
  }

  if (audit.details && audit.details.type === "opportunity") {
    return true;
  }

  return audit.scoreDisplayMode === "metricSavings";
}

module.exports = {
  configurePageSpeed,
  capturePageSpeed,
  getPageSpeedStatus,
  parsePastedPageSpeedReport,
  slimPageSpeedResult
};
