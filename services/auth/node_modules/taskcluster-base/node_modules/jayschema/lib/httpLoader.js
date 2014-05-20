//
// Example schema loader that loads schemas over HTTP[S].
// Wrapper for http.get. For SSL connections, the CA certificate is
// not verified.
//
// If you were to write your own HTTP[S] loader, you’d probably want
// to use https://github.com/mikeal/request to do the heavy lifting.
//

var http = require('http')
  , https = require('https')
  , Errors = require('./errors.js')
  , url = require('url')
  ;

var MAX_DEPTH = 5;

function loader(ref, callback, _depth) {

  _depth = _depth || 0;
  if (_depth >= MAX_DEPTH) {
    var desc = 'could not GET URL: ' + ref + ' (too many redirects)';
    var err = new Errors.SchemaLoaderError(ref, desc);
    return callback(err);
  }

  var options = url.parse(ref);

  var getter = http.get;
  if (options.protocol === 'https:') {
    options.rejectUnauthorized = false;
    getter = https.get;
  }

  getter(options, function(res) {

    if (res.statusCode >= 300 && res.statusCode <= 399) {
      // redirect
      return process.nextTick(loader.bind(null, res.headers.location,
        callback, _depth + 1));
    }

    if (res.statusCode < 200 || res.statusCode >= 400) {
        var desc = 'could not GET URL: ' + ref + ' (error ' + res.statusCode +
          ')';
        var err = new Errors.SchemaLoaderError(ref, desc);
        return callback(err);
    }

    var json = '';
    res.on('data', function(chunk) {
      json += chunk;
    });

    res.on('end', function() {
      try {
        var schema = JSON.parse(json);
        return callback(null, schema);
      } catch (jsonError) {
        var desc = 'could not parse data from URL as JSON: ' + ref;
        var err = new Errors.SchemaLoaderError(ref, desc, jsonError);
        return callback(err);
      }
    });

    res.on('error', function(httpError) {
      var desc = 'could not GET URL: ' + ref;
      var err = new Errors.SchemaLoaderError(ref, desc, httpError);
      callback(err);
    });

  });

}

module.exports = loader;
