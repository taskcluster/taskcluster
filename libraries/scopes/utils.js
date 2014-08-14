var fs          = require('fs');
var path        = require('path');
var assert      = require('assert');

/** List files in folder recursively */
exports.listFolder = function(folder, fileList) {
  if (fileList == undefined) {
    fileList = [];
  }
  fs.readdirSync(folder).forEach(function(obj) {
    var objPath = path.join(folder, obj);
    if (fs.statSync(objPath).isDirectory()) {
      return exports.listFolder(objPath, fileList);
    } else {
      fileList.push(objPath);
    }
  });
  return fileList;
};

/** Normalize scope sets
 *
 * Normalize a scope-set, basically wrap strings in an extra array if a layer
 * is missing. Examples:
 *    'a'           -> [['a']]        // 'a' must be satisfied
 *    ['a', 'b']    -> [['a'], ['b']] // 'a' or 'b' must be satisfied
 *    [['a', 'b']]  -> [['a', 'b']]   // 'a' and 'b' must be satisfied
 */
exports.normalizeScopeSets = function(scopesets) {
  if (typeof(scopesets) == 'string') {
    scopesets = [[scopesets]];
  }
  return scopesets.map(function(scopeset) {
    if (typeof(scopeset) == 'string') {
      return [scopeset];
    }
    return scopeset;
  });
};

/**
 * Auxiliary function to check if scopePatterns satisfies a scope-set
 *
 * Note that scope-set is an array of arrays of strings on disjunctive normal
 * form without negation. For example:
 *  [['a', 'b'], ['c']]
 *
 * Is satisfied if either,
 *  i)  'a' and 'b' is satisfied, or
 *  ii) 'c' is satisfied.
 *
 * Also expressed as ('a' and 'b') or 'c'.
 */
exports.scopeMatch = function(scopePatterns, scopesets) {
  var scopesets = exports.normalizeScopeSets(scopesets);
  if (typeof(scopePatterns) == 'string') {
    scopePatterns = [scopePatterns];
  }
  assert(scopesets instanceof Array, "scopesets must be a string or an array");
  return scopesets.some(function(scopeset) {
    assert(scopesets instanceof Array, "scopeset must be a string or an array");
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
