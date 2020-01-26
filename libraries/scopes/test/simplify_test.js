const utils = require("../src");
const testing = require("taskcluster-lib-testing");
const assert = require("assert").strict;
const {flatten} = require('lodash');

suite(testing.suiteName(), function() {
  suite("isScope", function() {
    test("with a scope", function() {
      assert(utils.simplifyScopeExpression.isScope('foo:bar'));
    });

    test("with AnyOf", function() {
      assert(!utils.simplifyScopeExpression.isScope({AnyOf: ['a scope']}));
    });

    test("with AllOf", function() {
      assert(!utils.simplifyScopeExpression.isScope({AllOf: ['a scope']}));
    });
  });

  suite("isAnyOf", function() {
    test("with a scope", function() {
      assert(!utils.simplifyScopeExpression.isAnyOf('foo:bar'));
    });

    test("with AnyOf", function() {
      assert(utils.simplifyScopeExpression.isAnyOf({AnyOf: ['a scope']}));
    });

    test("with AllOf", function() {
      assert(!utils.simplifyScopeExpression.isAnyOf({AllOf: ['a scope']}));
    });
  });

  suite("isAllOf", function() {
    test("with a scope", function() {
      assert(!utils.simplifyScopeExpression.isAllOf('foo:bar'));
    });

    test("with AllOf", function() {
      assert(!utils.simplifyScopeExpression.isAllOf({AnyOf: ['a scope']}));
    });

    test("with AllOf", function() {
      assert(utils.simplifyScopeExpression.isAllOf({AllOf: ['a scope']}));
    });
  });

  suite("divideSubexpressions", function() {
    test('sorts and dedupes scopes', function() {
      assert.deepEqual(
        utils.simplifyScopeExpression.divideSubexpressions(["scope:1", "scope:*", "scope:1"]),
        {scopes: ["scope:*", "scope:1"], allOfs: [], anyOfs: []});
    });
    test('returns nonscopes', function() {
      assert.deepEqual(
        utils.simplifyScopeExpression.divideSubexpressions(
          ["scope:1", {AnyOf: ["scope:2"]}, {AllOf: ["scope:3"]}]),
        {
          scopes: ["scope:1"],
          anyOfs: [{AnyOf: ["scope:2"]}],
          allOfs: [{AllOf: ["scope:3"]}],
        });
    });
  });

  suite('simplification', function() {
    const extractScopes = expr => {
      if (utils.simplifyScopeExpression.isScope(expr)) {
        if (expr.endsWith('*')) {
          return [expr, expr.replace('*', '-abc')];
        } else {
          return [expr];
        }
      } else if (utils.simplifyScopeExpression.isAnyOf(expr)) {
        return flatten(expr.AnyOf.map(extractScopes));
      } else if (utils.simplifyScopeExpression.isAllOf(expr)) {
        return flatten(expr.AllOf.map(extractScopes));
      }
    };

    const combinations = scopes => {
      if (scopes.length > 0) {
        const subcomb = combinations(scopes.slice(1));
        return [...subcomb, ...subcomb.map(ss => [scopes[0], ...ss])];
      } else {
        return [[]];
      }
    };

    const t = (name, input, output) => {
      test(name, function() {
        // check that the simplification proceeds as expected
        assert.deepEqual(utils.simplifyScopeExpression(input), output);
      });

      test(name + ' - equivalency', function() {
        // check that for all scopesets involving the mentioned scopes,
        // the two expressions are equivalent.  This should catch any
        // invalid simplifications
        for (let scopeset of combinations(extractScopes(input))) {
          assert.equal(
            utils.satisfiesExpression(scopeset, input),
            utils.satisfiesExpression(scopeset, output),
            `\nsimplified expression: ${JSON.stringify(output)}\nscopeset: ${JSON.stringify(scopeset)}`);
        }
      });
    };

    t('single scope simplifies to itself',
      "scope:1",
      "scope:1");
    t('empty AnyOf', {AnyOf: []}, {AnyOf: []});
    t('empty AllOf', {AllOf: []}, {AllOf: []});
    t('AnyOf simplifies to itself',
      {AnyOf: ["scope:1", "scope:2"]},
      {AnyOf: ["scope:1", "scope:2"]});
    t('AllOf simplifies to itself',
      {AllOf: ["scope:1", "scope:2"]},
      {AllOf: ["scope:1", "scope:2"]});
    t('AnyOf list of scopes duplicates are removed',
      {AnyOf: ["scope:1", "scope:2", "scope:1"]},
      {AnyOf: ["scope:1", "scope:2"]});
    t('AnyOf list of subexpressions duplicates are removed',
      {AnyOf: ["scope:1", {AllOf: ["scope:2", "scope:3"]}, {AllOf: ["scope:2", "scope:3"]}]},
      {AnyOf: ["scope:1", {AllOf: ["scope:2", "scope:3"]}]});
    t('AllOf list of subexpressions duplicates are removed',
      {AllOf: ["scope:1", {AnyOf: ["scope:2", "scope:3"]}, {AnyOf: ["scope:2", "scope:3"]}]},
      {AllOf: ["scope:1", {AnyOf: ["scope:2", "scope:3"]}]});
    t('AllOf list of scopes duplicates are removed',
      {AllOf: ["scope:1", "scope:2", "scope:1"]},
      {AllOf: ["scope:1", "scope:2"]});
    t('AnyOf list of scopes is not normalized but is sorted',
      {AnyOf: ["scope:1", "other", "scope:2", "scope:*"]},
      {AnyOf: ["other", "scope:*", "scope:1", "scope:2"]});
    t('AllOf list of scopes is normalized',
      {AllOf: ["scope:1", "other", "scope:2", "scope:*"]},
      {AllOf: ["other", "scope:*"]});
    t('AllOf one scope reduces to that scope',
      {AllOf: ["scope:1"]},
      "scope:1");
    t('AnyOf one scope reduces to that scope',
      {AnyOf: ["scope:1"]},
      "scope:1");
    t('AllOf list of scopes and subexpressions, scopes are normalized',
      {AllOf: ["scope:1", {AnyOf: ["other2", "other3"]}, "other", "scope:*"]},
      {AllOf: ["other", "scope:*", {AnyOf: ["other2", "other3"]}]});
    t('AnyOf list of scopes and subexpressions, scopes are sorted but not normalized',
      {AnyOf: ["scope:1", {AllOf: ["other2", "other3"]}, "other", "scope:*"]},
      {AnyOf: ["other", "scope:*", "scope:1", {AllOf: ["other2", "other3"]}]});
    t('subexpressions of AnyOf are also simplified',
      {AnyOf: ["other", {AllOf: ["other2", "other3", "other2"]}]},
      {AnyOf: ["other", {AllOf: ["other2", "other3"]}]});
    t('subexpressions of AllOf are also simplified',
      {AllOf: ["other", {AnyOf: ["other2", "other3", "other2"]}]},
      {AllOf: ["other", {AnyOf: ["other2", "other3"]}]});
    t('deeply-nested AllOf: [AllOf: ..] simplified to just AllOf: [..] and normalized',
      {AllOf: [
        "scope1",
        {AllOf: [
          "scope2",
          "scope3a",
          "scope3b",
          {AllOf: [
            {AnyOf: [
              "other1",
              "other2",
            ]},
            "scope4",
            "scope3*",
          ]},
        ]},
      ]},
      {AllOf: ["scope1", "scope2", "scope3*", "scope4", {AnyOf: ["other1", "other2"]}]});
    t('parallel AnyOfs within AllOf are not coalesced',
      {AllOf: [{AnyOf: ["scope1", "scope2"]}, {AnyOf: ["scope2", "scope3"]}]},
      {AllOf: [{AnyOf: ["scope1", "scope2"]}, {AnyOf: ["scope2", "scope3"]}]});
    t('deeply-nested AnyOf: [AnyOf: ..] simplified to just AnyOf: [..]',
      {AnyOf: [
        "scope1",
        {AnyOf: [
          "scope2",
          "scope3a",
          "scope3b",
          {AnyOf: [
            {AllOf: [
              "other1",
              "other2",
            ]},
            "scope4",
            "scope3*",
          ]},
        ]},
      ]},
      {AnyOf: [
        "scope1",
        "scope2",
        "scope3*",
        "scope3a",
        "scope3b",
        "scope4",
        {AllOf: ["other1", "other2"]},
      ]});
    t('parallel AllOfs within AnyOf are not coalesced',
      {AnyOf: [{AllOf: ["scope1", "scope2"]}, {AllOf: ["scope2", "scope3"]}]},
      {AnyOf: [{AllOf: ["scope1", "scope2"]}, {AllOf: ["scope2", "scope3"]}]});
  });

  test('simplify a complex expression from a queue error', function() {
    const expr = {AllOf: [
      "scope1",
      "queue:route:a",
      {AnyOf: [
        {AllOf: [
          "queue:scheduler-id:something",
          {AnyOf: [
            "queue:create-task:highest:some/workerpool",
            "queue:create-task:very-high:some/workerpool",
            "queue:create-task:high:some/workerpool",
            "queue:create-task:medium:some/workerpool",
          ]},
        ]},
        {AnyOf: [
          "queue:create-task:some/workerpool",
          {AllOf: [
            "queue:define-task:some/workerpool",
            "queue:task-group-id:something/carDoq--Q6q4manuwsH9IA",
            "queue:schedule-task:something/carDoq--Q6q4manuwsH9IA/DKg4EV9xSPiMfbFUJciO1g",
          ]},
        ]},
      ]},
    ]};

    const needed = utils.removeGivenScopes([
      "scope1",
      "queue:route:a",
      "queue:create-task:medium:some/workerpool",
    ], expr);

    const simpl = utils.simplifyScopeExpression(needed);
    assert.deepEqual(simpl,
      {AnyOf: [
        "queue:create-task:some/workerpool",
        "queue:scheduler-id:something",
        {AllOf: [
          "queue:define-task:some/workerpool",
          "queue:schedule-task:something/carDoq--Q6q4manuwsH9IA/DKg4EV9xSPiMfbFUJciO1g",
          "queue:task-group-id:something/carDoq--Q6q4manuwsH9IA",
        ]},
      ]});
  });

  test('simplify a complex expression from smoketests', function() {
    const expr = {AllOf: [
      {AllOf: [
        "queue:create-task:highest:built-in/succeed",
        "queue:create-task:highest:built-in/fail",
        "queue:scheduler-id:smoketest",
      ]},
      {AllOf: [
        "auth:create-client:project/taskcluster/smoketest/*",
        "auth:reset-access-token:project/taskcluster/smoketest/*",
        "project:taskcluster:smoketest:*",
      ]},
      {AllOf: [
        "queue:create-task:highest:built-in/succeed",
        "queue:scheduler-id:smoketest",
      ]},
      {AllOf: [
        "queue:create-task:highest:built-in/succeed",
        "queue:scheduler-id:smoketest",
      ]},
      {AllOf: []},
      {AllOf: [
        "purge-cache:built-in/succeed:smoketest-cache",
      ]},
      {AllOf: [
        "auth:create-role:project:taskcluster:smoketest:*",
        "auth:delete-role:project:taskcluster:smoketest:*",
        "auth:update-role:project:taskcluster:smoketest:*",
        "project:taskcluster:smoketest:*",
      ]},
      {AllOf: [
        "secrets:get:project/taskcluster/smoketest/*",
        "secrets:set:project/taskcluster/smoketest/*",
      ]},
    ]};

    const simpl = utils.simplifyScopeExpression(expr);
    assert.deepEqual(simpl, {AllOf: [
      'auth:create-client:project/taskcluster/smoketest/*',
      'auth:create-role:project:taskcluster:smoketest:*',
      'auth:delete-role:project:taskcluster:smoketest:*',
      'auth:reset-access-token:project/taskcluster/smoketest/*',
      'auth:update-role:project:taskcluster:smoketest:*',
      'project:taskcluster:smoketest:*',
      'purge-cache:built-in/succeed:smoketest-cache',
      'queue:create-task:highest:built-in/fail',
      'queue:create-task:highest:built-in/succeed',
      'queue:scheduler-id:smoketest',
      'secrets:get:project/taskcluster/smoketest/*',
      'secrets:set:project/taskcluster/smoketest/*',
    ]});
  });
});
