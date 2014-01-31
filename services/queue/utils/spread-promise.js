var Promise = require('promise');

/** Patch Promise to support spread() which is nice in combination with all() */
exports.patch = function() {
  Promise.prototype.spread = function(accepted, rejected) {
    return this.then(function(array) {
      return accepted.apply(this, array);
    }, rejected);
  }
};