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
 * Determine whether a scope is valid.  Scopes must be strings of ASCII
 * characters 0x20-0x7e (printable characters, including space but no other
 * whitespace)
 */

var _validScope = /^[\x20-\x7e]*$/;
exports.validScope = function(scope) {
    return typeof(scope) == 'string' && _validScope.test(scope);
};

/**
 * Validate scope-sets for well-formedness.  See scopeMatch for the description
 * of a scope-set.
 */
exports.validateScopeSets = function(scopesets) {
  var msg = "scopes must be an array of arrays of strings " +
            "(disjunctive normal form)";
  assert(Array.isArray(scopesets), msg);
  assert(scopesets.every(function(conj) {
      return Array.isArray(conj) && conj.every(exports.validScope);
  }), msg);
};

/**
 * Auxiliary function to check if scopePatterns satisfies a scope-set
 *
 * Note that scope-set is an array of arrays of strings on negation-free
 * disjunctive normal form. For example:
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
