"use strict";

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

/**
 * Validate scope-sets for well-formedness.  See scopeMatch for the description
 * of a scope-set.
 */
exports.validateScopeSets = function(scopesets) {
  var msg = "scopes must be an array of arrays of strings (disjunctive normal form)";
  assert(Array.isArray(scopesets), msg);
  assert(scopesets.every(function(conj) {
      return Array.isArray(conj) && conj.every(function(scope) {
          return typeof(scope) == 'string'
      });
  }), msg);
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
  exports.validateScopeSets(scopesets);
  assert(scopePatterns instanceof Array && scopePatterns.every(function(scope) {
    return typeof(scope) === 'string';
  }), "scopes must be an array of strings");
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
