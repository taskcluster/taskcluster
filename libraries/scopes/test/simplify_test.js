const utils = require("../src");
const testing = require("taskcluster-lib-testing");
const assert = require("assert");

suite(testing.suiteName(), function() {
  test('single scope simplifies to itself', function() {
    assert.deepStrictEqual(utils.simplifyScopeExpression("scope:1"), "scope:1");
  });

  test('AnyOf simplifies to itself', function() {
    assert.deepStrictEqual(
      utils.simplifyScopeExpression({AnyOf: ["scope:1", "scope:2"]}),
      {AnyOf: ["scope:1", "scope:2"]});
  });

  test('AllOf simplifies to itself', function() {
    assert.deepStrictEqual(
      utils.simplifyScopeExpression({AllOf: ["scope:1", "scope:2"]}),
      {AllOf: ["scope:1", "scope:2"]});
  });

  test('AnyOf list of scopes duplicates are removed', function() {
    assert.deepStrictEqual(
      utils.simplifyScopeExpression({AnyOf: ["scope:1", "scope:2", "scope:1"]}),
      {AnyOf: ["scope:1", "scope:2"]});
  });

  test('AllOf list of scopes duplicates are removed', function() {
    assert.deepStrictEqual(
      utils.simplifyScopeExpression({AllOf: ["scope:1", "scope:2", "scope:1"]}),
      {AllOf: ["scope:1", "scope:2"]});
  });

  test('AllOf list of scopes is normalized', function() {
    assert.deepStrictEqual(
      utils.simplifyScopeExpression({AllOf: ["scope:1", "scope:2", "scope:*"]}),
      {AllOf: ["scope:*"]});
  });

  test('AnyOf list of scopes is normalized', function() {
    assert.deepStrictEqual(
      utils.simplifyScopeExpression({AnyOf: ["scope:1", "scope:2", "scope:*"]}),
      {AnyOf: ["scope:*"]});
  });

  test('AnyOf list of scopes is normalized', function() {
    assert.deepStrictEqual(utils.simplifyScopeExpression({AnyOf: ["scope1", {AllOf: ["scope2a", "scope2b", "scope2*", "scope3"]}]}), {AnyOf: ["scope1", {AllOf: ["scope2*", "scope3"]}]});
  });

  test('AnyOf list of scopes is normalized', function() {
    assert.deepStrictEqual(utils.simplifyScopeExpression({AnyOf: ["scope1"]}), "scope1");
  });

  test('AllOf list of scopes is normalized', function() {
    assert.deepStrictEqual(utils.simplifyScopeExpression({AllOf: ["scope1"]}), "scope1");
  });

  test('Three Allof scopes is normalized', function() {
    assert.deepStrictEqual(utils.simplifyScopeExpression({AllOf: [{AllOf: ["scope1", "scope2"]}, {AllOf: ["scope2", "scope3"]}]}), {AllOf: ["scope1", "scope2", "scope3"]});
  });
});
