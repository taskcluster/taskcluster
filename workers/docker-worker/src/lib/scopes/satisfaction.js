const assert = require('assert');
const {validateScopeSets} = require('./validate');

const validateScopePatterns = (scopePatterns) => {
  assert(scopePatterns instanceof Array && scopePatterns.every((scope) => {
    return typeof scope === 'string';
  }), 'scopes must be an array of strings');
};

const patternMatch = exports.patternMatch = (pattern, scope) => {
  if (scope === pattern) {
    return true;
  }
  if (/\*$/.test(pattern)) {
    return scope.indexOf(pattern.slice(0, -1)) === 0;
  }
  return false;
};

/**
 * Auxiliary function to check if scopePatterns satisfies a scope-set
 *
 * Note that scopesets is an array of arrays of strings. For example:
 *  [['a', 'b'], ['c']]
 *
 * Is satisfied if either,
 *  i)  'a' and 'b' is satisfied, or
 *  ii) 'c' is satisfied.
 *
 * Also expressed as ('a' and 'b') or 'c'.
 */
exports.scopeMatch = (scopePatterns, scopesets) => {
  validateScopeSets(scopesets);
  validateScopePatterns(scopePatterns);

  return scopesets.some(scopeset =>
    scopeset.every(scope =>
      scopePatterns.some(pattern => patternMatch(pattern, scope))
    )
  );
};
