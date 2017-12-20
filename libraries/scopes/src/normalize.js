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
export const scopeCompare = (a, b) => {
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
export const normalizeScopeSet = scopeset => {
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
export const mergeScopeSets = (scopes1, scopes2) => {
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
