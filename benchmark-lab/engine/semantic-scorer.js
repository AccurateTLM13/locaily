const path = require("node:path");

function loadSemanticScorer({ suite, suiteDir }) {
  if (!suite.semanticScorer) {
    return null;
  }

  const declaration = suite.semanticScorer;
  const modulePath = path.resolve(suiteDir, declaration.module);
  let scorerModule;

  try {
    scorerModule = require(modulePath);
  } catch (error) {
    throw new Error(`Semantic scorer module could not be loaded: ${declaration.module}. ${error.message}`);
  }

  const scenarios = scorerModule.scenarios || scorerModule.SCENARIO_REGISTRY;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error(`Semantic scorer module must export a non-empty scenarios array: ${declaration.module}`);
  }

  const scenariosByCaseId = new Map();
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario.id !== "string" || typeof scenario.evaluate !== "function") {
      throw new Error(`Semantic scorer contains an invalid scenario in ${declaration.module}.`);
    }
    if (scenariosByCaseId.has(scenario.id)) {
      throw new Error(`Semantic scorer contains duplicate scenario id: ${scenario.id}`);
    }
    scenariosByCaseId.set(scenario.id, scenario);
  }

  return {
    config: { ...declaration },
    scenariosByCaseId
  };
}

function evaluateSemanticCase({ scorer, benchmarkCase, output }) {
  const scenario = scorer.scenariosByCaseId.get(benchmarkCase.caseId);
  if (!scenario) {
    return {
      pass: false,
      code: "SEMANTIC_SCENARIO_NOT_FOUND",
      errors: [`No semantic scenario is declared for case ${benchmarkCase.caseId}.`]
    };
  }

  let evaluation;
  try {
    evaluation = scenario.evaluate.call(scenario, output, benchmarkCase);
  } catch (error) {
    return {
      pass: false,
      code: "SEMANTIC_EVALUATOR_ERROR",
      errors: [error.message]
    };
  }

  const pass = evaluation && (evaluation.pass === true || evaluation.verdict === "PASS");
  if (typeof pass !== "boolean") {
    return {
      pass: false,
      code: "SEMANTIC_RESULT_INVALID",
      errors: ["Semantic scorer must return { pass: boolean } or { verdict: \"PASS\" | \"FAIL\" }."]
    };
  }

  return {
    pass,
    code: pass ? "SEMANTIC_PASS" : "SEMANTIC_EXPECTATION_MISMATCH",
    errors: Array.isArray(evaluation.errors) ? evaluation.errors : [],
    details: evaluation.details || null
  };
}

module.exports = {
  loadSemanticScorer,
  evaluateSemanticCase
};
