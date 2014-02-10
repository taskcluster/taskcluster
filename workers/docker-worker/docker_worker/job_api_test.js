suite('job api', function() {
  var TaskFactory = require('taskcluster-task-factory/task');
  var JobAPI = require('./job_api');

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

  suite('sendClaim', function() {
    test('issue a claim to the server', function(done) {
      var sentJSON = { woot: true };
      var ranServer = false;
      var claimURL = server.endpoint(
        'post',
        function(req, res) {
          ranServer = true;
          assert.deepEqual(req.body, sentJSON);
          res.send(200, {});
        }
      );

      subject = new JobAPI({
        job: task,
        claim: claimURL,
      });

      return subject.sendClaim(sentJSON).then(
        function(res) {
          assert.ok(ranServer);
          assert.deepEqual(res.body, {});
          assert.equal(res.statusCode, 200);
        }
      );
    });
  });

  suite('sendFinish', function() {
    test('issue a finish to the server', function(done) {
      var result = { yey: true };
      var expected = {};
      for (var key in task) {
        expected[key] = task[key];
      }
      expected.result = result;

      var ranServer = false;
      var finishURL = server.endpoint(
        'post',
        function(req, res) {
          assert.deepEqual(req.body, expected);
          ranServer = true;
          res.send(200, {});
        }
      );

      subject = new JobAPI({
        job: task,
        finish: finishURL,
      });

      return subject.sendFinish(result).then(
        function(res) {
          assert.equal(res.statusCode, 200);
          assert.ok(ranServer, 'server ran');
          assert.deepEqual(res.body, {});
        }
      );
    });
  });
});
