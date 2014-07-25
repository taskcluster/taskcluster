suite('superagent-promise', function() {
  var assert  = require('assert');
  var request = require('./');
  var http    = require('http');
  var debug   = require('debug')('index_test');

  // start the server
  var server;
  var successBody = 'woot';
  var errorBody = 'Not Found';
  setup(function(done) {
    server = http.createServer(function(req, res) {
      if (/success$/.test(req.url)) {
        debug("Responding with 200");
        res.writeHead(200, {
          'Content-Length': successBody.length,
          'Content-Type': 'text/plain'
        });
        res.end(successBody);
      } else if(/NotFound$/.test(req.url)) {
        debug("Responding with 404");
        res.writeHead(404, {
          'Content-Length': errorBody.length,
          'Content-Type': 'text/plain'
        });
        res.end(errorBody);
      } else if(/error$/.test(req.url)) {
        debug("Responding with 200, but mismatching Content-Length");
        res.writeHead(404, {
          'Content-Length': successBody.length - 2,
          'Content-Type': 'text/plain'
        });
        res.end(successBody);
      }
    });

    server.listen(0, done);
  });

  teardown(function(done) {
    server.close(done);
  });

  test('issue request', function() {
    var addr = server.address();
    var url = 'http://' + addr.address + ':' + addr.port + "/success";

    return request('GET', url).end().then(function(res) {
      assert.equal(res.text, successBody);
    });
  });

  test('issue request with .get', function() {
    var addr = server.address();
    var url = 'http://' + addr.address + ':' + addr.port + "/success";

    return request.get(url).end().then(function(res) {
      assert.equal(res.text, successBody);
    });
  });

  test('issue 404 request', function() {
    var addr = server.address();
    var url = 'http://' + addr.address + ':' + addr.port + "/NotFound";

    return request('GET', url).end().then(function(res) {
      assert.ok(!res.ok);
      assert.equal(res.text, errorBody);
    });
  });

  test('test error', function(done) {
    var addr = server.address();
    var url = 'http://' + addr.address + ':' + addr.port + "/error";

    request('GET', url).end().then(function(res) {
      assert.ok(false);
      done();
    }, function(err) {
      assert.ok(err);
      done();
    });
  });
});
