let assert = require('assert');

/**
 * Determine whether a scope is valid.  Scopes must be strings of ASCII
 * characters 0x20-0x7e (printable characters, including space but no other
 * whitespace)
 */

let _validScope = /^[\x20-\x7e]*$/;
exports.validScope = function(scope) {
  return typeof scope == 'string' && _validScope.test(scope);
};

/**
 * Validate scope-sets for well-formedness.  See scopeMatch for the description
 * of a scope-set.
 */
exports.validateScopeSets = function(scopesets) {
  let msg = 'scopes must be an array of arrays of strings ' +
            '(disjunctive normal form)';
  assert(Array.isArray(scopesets), msg);
  assert(scopesets.every(function(conj) {
    return Array.isArray(conj) && conj.every(exports.validScope);
  }), msg);
};

function validateScopePatterns(scopePatterns) {
  assert(scopePatterns instanceof Array && scopePatterns.every((scope) => {
    return typeof scope === 'string';
  }), 'scopes must be an array of strings');
}

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
exports.scopeMatch = function(scopePatterns, scopesets) {
  exports.validateScopeSets(scopesets);
  validateScopePatterns(scopePatterns);

  return scopesets.some(function(scopeset) {
    return scopeset.every(function(scope) {
      return scopePatterns.some(function(pattern) {
        if (scope === pattern) {
          return true;
        }
        if (/\*$/.test(pattern)) {
          return scope.indexOf(pattern.slice(0, -1)) === 0;
        }
        return false;
      });
    });
  });
};

/**
 * Finds scope intersections between two scope sets.
 */
exports.scopeIntersection = (scopeset1, scopeset2) => [
  ...scopeset1.filter(s => exports.scopeMatch(scopeset2, [[s]])),
  ...scopeset2.filter(s => exports.scopeMatch(scopeset1, [[s]])),
].filter((v, i, a) => a.indexOf(v) === i);
