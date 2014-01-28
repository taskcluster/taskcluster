suite('test server test', function() {
  var agent = require('superagent-promise');
  var server = require('./server');

  var subject;
  setup(function() {
    return server().then(
      function(result) {
        subject = result;
      }
    );
  });

  teardown(function(done) {
    subject.close(done);
  });

  suite('#urlEndpoint', function() {
    test('issue request to given url', function() {
      var url = subject.endpoint('get', function(req, res) {
        res.send(200, { woot: true });
      });

      return agent('GET', url).end().then(
        function(res) {
          assert.equal(res.statusCode, 200);
          assert.deepEqual(res.body, { woot: true });
        }
      );
    });
  });
});
