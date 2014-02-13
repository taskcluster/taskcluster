suite('request api', function() {
  var TaskFactory = require('taskcluster-task-factory/task');
  var RequestAPI = require('./request_api');

  var testServer = require('./test/server');

  // test server used by all the tests
  var server;
  setup(function() {
    return testServer().then(
      function(result) {
        server = result;
      }
    );
  });

  teardown(function(done) {
    server.close(done);
  });

  var subject;
  var task = TaskFactory.create();

  suite('sendStart', function() {
    test('issue a start to the server', function(done) {
      var sentJSON = { woot: true };
      var ranServer = false;
      var startURL = server.endpoint(
        'post',
        function(req, res) {
          ranServer = true;
          assert.deepEqual(req.body, sentJSON);
          res.send(200, {});
        }
      );

      subject = new RequestAPI({
        job: task,
        start: startURL,
      });

      return subject.sendStart(sentJSON).then(
        function(res) {
          assert.ok(ranServer);
          assert.deepEqual(res.body, {});
          assert.equal(res.statusCode, 200);
        }
      );
    });
  });

  suite('sendStop', function() {
    test('issue a stop to the server', function(done) {
      var result = { yey: true };

      var ranServer = false;
      var stopURL = server.endpoint(
        'post',
        function(req, res) {
          assert.deepEqual(req.body, result);
          ranServer = true;
          res.send(200, {});
        }
      );

      subject = new RequestAPI({
        task: task,
        stop: stopURL
      });

      return subject.sendStop(result).then(
        function(res) {
          assert.equal(res.statusCode, 200);
          assert.ok(ranServer, 'server ran');
          assert.deepEqual(res.body, {});
        }
      );
    });
  });
});
