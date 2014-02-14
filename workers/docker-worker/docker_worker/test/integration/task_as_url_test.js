suite('stop request', function() {
  var runTask = require('../run_task')();

  var TaskFactory = require('taskcluster-task-factory/task');

  var task = TaskFactory.create({
    image: 'ubuntu',
    command: ['/bin/bash', '-c', 'echo "first command!"'],
    features: {
      bufferLog: true,
      azureLivelog: false
    }
  });

  var express = require('express');
  var server;
  var url;
  setup(function(done) {
    var app = express();
    app.get('*', function(req, res) {
      res.send(200, task);
    });

    server = app.listen(0, function() {
      url = 'http://localhost:' + server.address().port + '/';
      done();
    });
  });

  test('timing metrics', function() {
    return runTask(url).then(
      function(taskStatus) {
        assert.ok(taskStatus.start, 'starts');
        assert.ok(taskStatus.stop, 'stops');

        var stop = taskStatus.stop;
        assert.ok(stop.logText.indexOf('first') !== -1);
      }
    );
  });
});


