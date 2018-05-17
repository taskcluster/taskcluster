const assert = require('assert');
const {validScope} = require('./validate');
const {patternMatch} = require('./satisfaction');

/** Validate a scope expression */
const validateExpression = (expr) => {
  if (typeof expr === 'string') {
    return validScope(expr);
  }
  return Object.keys(expr).length === 1 && (
    'AnyOf' in expr && expr.AnyOf.every(validateExpression) ||
    'AllOf' in expr && expr.AllOf.every(validateExpression)
  );
};

/** Assert that a scope expression is valid */
exports.validExpression = (expr) => {
  assert(validateExpression(expr), 'expected a valid scope expression');
  return true;
};

/** Check if a scope-set statisfies a given scope expression */
exports.satisfiesExpression = function(scopeset, expression) {
  assert(Array.isArray(scopeset), 'Scopeset must be an array.');

  const isSatisfied = (expr) => {
    if (typeof expr === 'string') {
      return scopeset.some(s => patternMatch(s, expr));
    }
    return (
      'AllOf' in expr && expr.AllOf.every(isSatisfied) ||
      'AnyOf' in expr && expr.AnyOf.some(isSatisfied)
    );
  };

  return isSatisfied(expression);
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
exports.removeGivenScopes = function(scopeset, expression) {
  const simplify = (expr) => {
    if (typeof expr === 'string') {
      if (scopeset.some(s => patternMatch(s, expr))) {
        return null;
      }
      return expr;
    }

    if ('AllOf' in expr) {
      const AllOf = expr.AllOf.map(simplify).filter(e => e !== null);
      if (AllOf.length === 0) {
        return null;
      }
      if (AllOf.length === 1) {
        return AllOf[0];
      }
      return {AllOf};
    }

    if ('AnyOf' in expr) {
      const AnyOf = expr.AnyOf.map(simplify);
      if (AnyOf.includes(null)) {
        return null;
      }
      if (AnyOf.length === 1) {
        return AnyOf[0];
      }
      return {AnyOf};
    }

    // Throw an error if we have invalid expression
    const err = new Error('removeGivenScopes expected a valid scope expression');
    err.expression = expression;
    throw err;
  };

  return simplify(expression);
};
