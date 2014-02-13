suite('stop request', function() {
  var runTask = require('../run_task')();

  var TaskFactory = require('taskcluster-task-factory/task');

  test('timing metrics', function() {
    var task = TaskFactory.create({
      image: 'ubuntu',
      command: ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        bufferLog: false,
        azureLivelog: false
      }
    });

    return runTask(task).then(
      function(taskStatus) {
        var start = taskStatus.start;
        var stop = taskStatus.stop;

        assert.ok(start, 'issues start event');
        assert.ok(stop, 'issues stop event');

        assert.equal(taskStatus.stop.exitCode, 0);
        assert.ok(stop.startTimestamp, 'has start time');
        assert.ok(stop.stopTimestamp, 'has stop time');
      }
    );
  });
});

