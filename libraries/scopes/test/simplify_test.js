const utils = require("../src");
const testing = require("taskcluster-lib-testing");

suite(testing.suiteName(), function() {
  test("Single scope simplifies to itself", function() {
    utils.simplifyScopeExpression(["scope:1"], ["scope:1"]);
  });

  test("AnyOf simplifies to itself", function() {
    utils.simplifyScopeExpression({ AnyOf: ["scope:1", "scope:2"] }, { AnyOf: ["scope:1", "scope:2"] });
  });

  test("AllOf simplifies to itself", function() {
    utils.simplifyScopeExpression({ AllOf: ["scope:1", "scope:2"] }, { AllOf: ["scope:1", "scope:2"] });
  });
});
