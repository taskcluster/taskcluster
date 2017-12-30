import assert from 'assert';
import {validScope} from './validate';
import {patternMatch} from './satisfaction';

/**
 * Validate scope-expression for well-formedness.
 */
exports.validExpression = function(expr) {
  assert(expr, 'Scope expression must exist.');
  assert(typeof expr === 'object' && !Array.isArray(expr), 'Scope expressions must be objects.');
  const keys = Object.keys(expr);
  assert(keys.length === 1, 'Scope expressions must have only one key.');
  const operator = keys[0];
  assert(operator === 'AnyOf' || operator === 'AllOf',
    `Operator must be one of "AnyOf" or "AllOf". Found "${operator}" instead.`);
  const subexpressions = expr[operator];
  assert(Array.isArray(subexpressions), 'Sub-expressions must be arrays.');
  assert(subexpressions.length > 0, 'Sub-expressions must not be empty.');
  subexpressions.forEach(subexpr => {
    if (typeof subexpr === 'string') {
      assert(validScope(subexpr), `Each scope must be valid. "${subexpr}" is not valid.`);
    } else {
      exports.validExpression(subexpr);
    }
  });
  return true;
};

/**
 * Assert that an array of patterns satisfies a scope-expression.
 */
exports.satisfiesExpression = function(scopeset, expr) {
  assert(Array.isArray(scopeset), 'Scopeset must be an array.');
  assert(exports.validExpression(expr));
  const operator = Object.keys(expr)[0];
  const subexpressions = expr[operator];
  const method = operator === 'AnyOf' ? 'some' : 'every';
  return subexpressions[method](subexpr => typeof subexpr === 'string' ?
    scopeset.some(scope => patternMatch(scope, subexpr)) :
    exports.satisfiesExpression(scopeset, subexpr)
  );
};
