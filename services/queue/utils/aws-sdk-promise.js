var aws     = require('aws-sdk');
var Promise = require('promise');

/** Patch aws.Request to have a promise() method that returns a promise */
exports.patch = function() {
  aws.Request.prototype.promise = function() {
    var that = this;
    return new Promise(function(accept, reject) {
      that.on('complete', function(response) {
        if (response.error) {
          reject(response.error);
        } else {
          accept(response);
        }
      });
      that.send();
    });
  };
};
