const assert = require("assert");

exports.simplifyScopeExpression = (scope1, scope2) => {
  assert.deepStrictEqual(scope1, scope2);
  return scope1;
};
