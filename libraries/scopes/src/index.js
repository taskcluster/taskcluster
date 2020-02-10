const assert = require('assert');

const VALID_SCOPE = /^[\x20-\x7e]*$/;

/**
 * Determine whether a scope is valid.  Scopes must be strings of ASCII
 * characters 0x20-0x7e (printable characters, including space but no other
 * whitespace)
 */
const validScope = exports.validScope = (scope) =>
  typeof scope == 'string' && VALID_SCOPE.test(scope);

/**
 * Finds scope intersections between two scope sets.
 */
exports.scopeIntersection = (scopeset1, scopeset2) => [
  ...scopeset1.filter(s1 => scopeset2.some(s2 => patternMatch(s2, s1))),
  ...scopeset2.filter(s2 => scopeset1.some(s1 => patternMatch(s1, s2))),
].filter((v, i, a) => a.indexOf(v) === i);

/**
 * Finds scope union between two scope sets.
 *
 * Note that as a side-effect, this will sort the given scopesets.
 */
exports.scopeUnion = (scopeset1, scopeset2) => {
  scopeset1.sort(scopeCompare);
  scopeset1 = normalizeScopeSet(scopeset1);
  scopeset2.sort(scopeCompare);
  scopeset2 = normalizeScopeSet(scopeset2);
  return mergeScopeSets(scopeset1, scopeset2);
};

/**
 * Return true if the given scope matches the given pattern (possibly ending with *)
 */
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
 * Compare scopes a and b to see which comes first if sorted
 * Such that 'a*' comes before 'a', but otherwise normal order.  In other words,
 * the trailing * is considered a special character that sorts *before* the end of
 * string.
 *
 * In particular, for a given prefix P that does not end in *, it will produce
 * the following contiguous segments of the set of scopes beginning with P (if
 * such scopes are present):
 *
 *  - P*
 *  - P
 *  - P<anything>
 *
 * In the case where P itself ends in *, the * in "P<anything>" is not a trailing star
 * and is thus not treated specially, so ordering is lexical.
 *
 * Example: ['*', '', 'a*', 'a', 'a(', 'aa', 'b'] is a list sorted as such.
 *
 * This sort order is useful for normalizing scopes, since it puts the "interesting"
 * scopes (those with a final `*`) up front.
 */
const scopeCompare = exports.scopeCompare = (a, b) => {
  let astar = a.endsWith('*');
  let bstar = b.endsWith('*');

  a = astar ? a.slice(0, -1) : a;
  b = bstar ? b.slice(0, -1) : b;

  if (astar !== bstar && a === b) {
    return astar ? -1 : 1;
  }

  // "normal" comparison
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
};

/**
 * Normalize a scopeset, eliminating redundant scopes.
 *
 * Formally, we say that a scope-set S is normalized if there is not two scopes
 * a, b in S such that a satisfies b.
 *
 * The given scopeset must be sorted with `scopeCompare`, or results will not
 * be normalized.  Given that constraint, the result will also be properly
 * sorted.
 *
 * The reasoning for this sorting is pretty simple. If we have a set of scopes:
 *   ['a', 'a*', 'ab', 'b']
 * We wish to normalize, the sorted set of scopes is
 *   ['a*', 'a', 'ab', 'b']
 * Now if we wish to construct the normalized scope-set, we just takes the
 * scopes out of the list one by one in the sorted order. And if the last scope
 * added the to normalized result list doesn't satisfy the current scope, the
 * current scope is added to the result list.
 */
const normalizeScopeSet = exports.normalizeScopeSet = scopeset => {
  const n = scopeset.length;
  const result = [];
  let i = 0;

  while (i < n) {
    let scope = scopeset[i++];
    result.push(scope);
    // consume duplicates
    while (i < n && scopeset[i] === scope) {
      i++;
    }
    if (scope.endsWith('*')) {
      let prefix = scope.slice(0, -1);
      while (i < n && scopeset[i].startsWith(prefix)) {
        i++;
      }
    }
  }

  return result;
};

/**
 * Take two sets of sorted scopes and merge them, normalizing in the process.
 * Normalizing means removing duplicates, as well as scopes implied by any
 * star-scopes.
 *
 * This method returns a new array, and leaves both arguments untouched.
 * Hence, you should not clone arrays prior to calling this method.
 *
 * Returns a set of normalized scopes. See scopeCompare for formal definition
 * for normalized scope-set.
 */
const mergeScopeSets = exports.mergeScopeSets = (scopes1, scopes2) => {
  // This is dead simple, we track the length with n and m
  let n = scopes1.length;
  let m = scopes2.length;
  // And we track the current offset in the scopes1 and scopes2 using
  // i and j respectfully. This ensure that we don't have modify the arguments.
  let i = 0;
  let j = 0;
  let scopes = [];
  while (i < n && j < m) {
    // Take a scope for each list
    let s1 = scopes1[i];
    let s2 = scopes2[j];
    let scope = null;
    if (s1 === s2) {
      // If the two scopes are exactly the same, then we add one of them
      // and we increment both i and j by one.
      scopes.push(s1);
      scope = s1;
      i += 1;
      j += 1;
    } else {
      // If the scopes are different, we compare them using the function used
      // for the sort order and choose the one that comes first.
      let z = scopeCompare(s1, s2);
      if (z < 0) {
        scope = s1;
        scopes.push(s1);
        i += 1;
      } else {
        scope = s2;
        scopes.push(s2);
        j += 1;
      }
    }
    // If we just added a star scope, we have to skip everything that
    // is satisfied by the star scope.
    if (scope.endsWith('*')) {
      let prefix = scope.slice(0, -1);
      while (i < n && scopes1[i].startsWith(prefix)) {
        i += 1;
      }
      while (j < m && scopes2[j].startsWith(prefix)) {
        j += 1;
      }
    }
  }
  // At this stage i = n or j = m, meaning that one of our two lists is now
  // empty, so we just add everything from one of them. But to ensure
  // normalization, we still do the endsWith('*') trick, skipping scopes that
  // are already satisfied.
  while (i < n) {
    let scope = scopes1[i];
    scopes.push(scope);
    i += 1;
    if (scope.endsWith('*')) {
      let prefix = scope.slice(0, -1);
      while (i < n && scopes1[i].startsWith(prefix)) {
        i += 1;
      }
    }
  }
  while (j < m) {
    let scope = scopes2[j];
    scopes.push(scope);
    j += 1;
    if (scope.endsWith('*')) {
      let prefix = scope.slice(0, -1);
      while (j < m && scopes2[j].startsWith(prefix)) {
        j += 1;
      }
    }
  }
  return scopes;
};

/**
 * Validate a scope expression */
const validateExpression = (expr) => {
  if (typeof expr === 'string') {
    return validScope(expr);
  }
  return Object.keys(expr).length === 1 && (
    'AnyOf' in expr && expr.AnyOf.every(validateExpression) ||
    'AllOf' in expr && expr.AllOf.every(validateExpression)
  );
};

/**
 * Assert that a scope expression is valid */
exports.validExpression = (expr) => {
  assert(validateExpression(expr), 'expected a valid scope expression');
  return true;
};

/**
 * Check if a scope-set statisfies a given scope expression */
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

 * Given a scope expression and set of scopes that satisfies it, return a
 * subset of those scopes that satisfies the scope expression.  This subset is
 * not necessarily minimal: in the case of AnyOf, it includes all scopes
 * satsifying any branch of that alternative.  To do otherwise would return
 * only one of several possible minimal scope sets.
 *
 * Returns undefined if the scopeset does not satisfy the expression.
 */
exports.scopesSatisfying = (scopeset, expression) => {
  let used = [];
  /* Evaluate the given expression, appending all used scopes to `scopes` and
   * returning true if satisfied, otherwise returning false and leaving `scopes`
   * as it was found.
   */
  const recurse = expr => {
    if (typeof expr === 'string') {
      if (scopeset.some(s => patternMatch(s, expr))) {
        used.push(expr);
        return true;
      }
      return false;
    }

    if ('AllOf' in expr) {
      let startIndex = used.length;
      for (let subexpr of expr.AllOf) {
        if (!recurse(subexpr)) {
          // does not match the AllOf, so bail out now and do not return any of
          // the accumulated scopes
          used.splice(startIndex);
          return false;
        }
      }
      return true;
    }

    if ('AnyOf' in expr) {
      let startIndex = used.length;
      let found = false;
      for (let subexpr of expr.AnyOf) {
        found = recurse(subexpr) || found;
      }
      if (!found) {
        // reset the scopes array
        used.splice(startIndex);
      }
      return found;
    }
  };

  if (recurse(expression)) {
    used.sort(scopeCompare);
    return normalizeScopeSet(used);
  }
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
