suite('superagent-promise', function() {
  var assert = require('assert');
  var agent = require('./');
  var http = require('http');

  // start the server
  var server;
  var body = 'woot';
  setup(function(done) {
    server = http.createServer(function(req, res) {
      res.writeHead(200, {
        'Content-Length': body.length,
        'Content-Type': 'text/plain'
      });
      res.end(body);
    });

    server.listen(0, done);
  });

  teardown(function(done) {
    server.close(done);
  });


  test('issue request', function(done) {
    var addr = server.address();
    var url = 'http://' + addr.address + ':' + addr.port;

    agent('GET', url).end().then(
      function(res) {
        assert.equal(res.text, body);
        done();
      },

      function(err) {
        done(err);
      }
    );
  });
});
