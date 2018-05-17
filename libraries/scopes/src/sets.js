const {scopeMatch} = require('./satisfaction');
const {scopeCompare, normalizeScopeSet, mergeScopeSets} = require('./normalize');

/**
 * Finds scope intersections between two scope sets.
 */
exports.scopeIntersection = (scopeset1, scopeset2) => [
  ...scopeset1.filter(s => scopeMatch(scopeset2, [[s]])),
  ...scopeset2.filter(s => scopeMatch(scopeset1, [[s]])),
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
