/**
 * Promise wrapper for superagent
 */

var superagent  = require('superagent');

// in the browser Promise is expected to be defined.
var Promise = this.Promise || require('promise');

/**
 * Request object similar to superagent.Request, but with end() returning
 * a promise.
 */
function PromiseRequest() {
  superagent.Request.apply(this, arguments);
}

// Inherit form superagent.Request
PromiseRequest.prototype = Object.create(superagent.Request.prototype);

/** Send request and get a promise that `end` was emitted */
PromiseRequest.prototype.end = function(cb) {
  var _super = superagent.Request.prototype.end;
  var context = this;

  return new Promise(function(accept, reject) {
    _super.call(context, function(err, value) {
      if (cb) {
        cb(err, value);
      }

      if (err) {
        return reject(err);
      }
      accept(value);
    });
  });
};

/**
 * Request builder with same interface as superagent.
 * It is convenient to import this as `request` in place of superagent.
 */
var request = function(method, url) {
  return new PromiseRequest(method, url);
};

/** Helper for making a get request */
request.get = function(url, data) {
  var req = request('GET', url);
  if (data) {
    req.query(data);
  }
  return req;
};

/** Helper for making a head request */
request.head = function(url, data) {
  var req = request('HEAD', url);
  if (data) {
    req.send(data);
  }
  return req;
};

/** Helper for making a delete request */
request.del = function(url) {
  return request('DELETE', url);
};

/** Helper for making a patch request */
request.patch = function(url, data) {
  var req = request('PATCH', url);
  if (data) {
    req.send(data);
  }
  return req;
};

/** Helper for making a post request */
request.post = function(url, data) {
  var req = request('POST', url);
  if (data) {
    req.send(data);
  }
  return req;
};

/** Helper for making a put request */
request.put = function(url, data) {
  var req = request('PUT', url);
  if (data) {
    req.send(data);
  }
  return req;
};

// Export the request builder
module.exports = request;
