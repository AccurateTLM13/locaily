const policyLoader = require("./policy-loader");
const evaluatorAdapter = require("./policy-evaluator-adapter");
const approvalStore = require("./approval-store");
const executionGate = require("./execution-gate");

module.exports = {
  ...policyLoader,
  ...evaluatorAdapter,
  ...approvalStore,
  ...executionGate
};
