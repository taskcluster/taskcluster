/**
Promise wrapper for superagent
*/

var superagent = require('superagent');
var Request = superagent.Request;
var Promise = require('promise');

function PromiseRequest() {
  Request.apply(this, arguments);
}

PromiseRequest.prototype = Object.create(Request.prototype);

PromiseRequest.prototype.end = function() {
  var _super = Request.prototype.end;
  var context = this;

  return new Promise(function(accept, reject) {
    _super.call(context, function(err, value) {
      if (err) return reject(err);
      accept(value);
    });
  });
};

module.exports = function(method, url) {
  return new PromiseRequest(method, url);
};
