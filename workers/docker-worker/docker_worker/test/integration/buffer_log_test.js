suite('buffer log test', function() {
  var runTask = require('../run_task')();

  var TaskFactory = require('taskcluster-task-factory/task');

  test('simple echo', function() {
    var task = TaskFactory.create({
      image: 'ubuntu',
      command: ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        bufferLog: true,
        azureLivelog: false
      }
    });

    return runTask(task).then(
      function(taskStatus) {
        assert.ok(taskStatus.start, 'starts');
        assert.ok(taskStatus.stop, 'stops');

        var result = taskStatus.stop;
        assert.ok(result.logText.indexOf('first command') !== -1);
        assert.equal(result.exitCode, 0);
      }
    );
  });
});
