/**
 * These utilities are copied from tc-lib-scopes, which is otherwise not
 * designed for use in a webpack'd application.
 */

/**
 * Return true if the given scope matches the given pattern (possibly
 * ending with *)
 */
const patternMatch = (pattern, scope) => {
  if (scope === pattern) {
    return true;
  }

  if (/\*$/.test(pattern)) {
    return scope.indexOf(pattern.slice(0, -1)) === 0;
  }

  return false;
};

/**
 * Finds scope intersections between two scope sets.
 */
exports.scopeIntersection = (scopeset1, scopeset2) =>
  [
    ...scopeset1.filter(s1 => scopeset2.some(s2 => patternMatch(s2, s1))),
    ...scopeset2.filter(s2 => scopeset1.some(s1 => patternMatch(s1, s2))),
  ].filter((v, i, a) => a.indexOf(v) === i);
