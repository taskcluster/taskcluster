const {patternMatch} = require('./satisfaction');
const {scopeCompare, normalizeScopeSet, mergeScopeSets} = require('./normalize');

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
