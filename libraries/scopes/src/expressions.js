import assert from 'assert';
import {validScope} from './validate';
import {patternMatch} from './satisfaction';

/**
 * Validate scope-expression for well-formedness.
 */
exports.validExpression = function(expr) {
  assert(expr, 'Scope expression must exist.');
  assert(typeof expr === 'object' && !Array.isArray(expr), `Scope expressions must be objects. Received ${expr}`);
  const keys = Object.keys(expr);
  assert(keys.length === 1, 'Scope expressions must have only one key.');
  const operator = keys[0];
  assert(operator === 'AnyOf' || operator === 'AllOf',
    `Operator must be one of "AnyOf" or "AllOf". Found "${operator}" instead.`);
  const subexpressions = expr[operator];
  assert(Array.isArray(subexpressions), 'Sub-expressions must be arrays.');
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

/**
 * Given a scopeset and a scope-expression, remove any scopes
 * that are in the scopeset so that all remaining scopes
 * are ones that are missing. If all scopes are provided, this
 * function will return null. This function is useful to
 * generate nice error messages about which scopes a client
 * is missing.
 *
 * This is separate from satisfiesExpression in order to keep
 * that code path simple and clean due to its important nature.
 *
 * Returns a scope expression where all scopes that exist are
 * missing from the scopeset. Any scopes under an AllOf key
 * are definitely needed to satisfy the expression and at least
 * one of the scopes under an AnyOf must be provided to satisfy.
 */
exports.removeGivenScopes = function(scopeset, expr, topLevel=true) {
  assert(Array.isArray(scopeset), 'Scopeset must be an array.');

  if (typeof expr === 'string') {
    if (scopeset.some(scope => patternMatch(scope, expr))) {
      return null;
    }
    return expr;
  }

  if (expr.AllOf) {
    const AllOf = expr.AllOf.map(e => exports.removeGivenScopes(scopeset, e, false)).filter(e => e !== null);
    if (AllOf.length === 0) {
      return null;
    }
    if (AllOf.length === 1 && (!topLevel || typeof AllOf[0] !== 'string')) {
      return AllOf[0];
    }
    return {AllOf};
  }

  const AnyOf = expr.AnyOf.map(e => exports.removeGivenScopes(scopeset, e, false));
  if (AnyOf.some(e => e === null)) {
    return null;
  }
  if (AnyOf.length === 1 && (!topLevel || typeof AnyOf[0] !== 'string')) {
    return AnyOf[0];
  }
  return {AnyOf};
};
