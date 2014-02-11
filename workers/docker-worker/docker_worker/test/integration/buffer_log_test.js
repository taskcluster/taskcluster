suite('buffer log test', function() {
  var runTask = require('../run_task')();

  var TaskFactory = require('taskcluster-task-factory/task');

  test('simple echo', function() {
    var task = TaskFactory.create({
      image: 'ubuntu',
      command: ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        buffer_log: true,
        azure_livelog: false
      }
    });

    return runTask(task).then(
      function(taskStatus) {
        assert.ok(taskStatus.claimed);
        var result = taskStatus.finish.result;

        assert.ok(result.extra_info.log.indexOf('first command') !== -1);
        assert.equal(result.task_result.exit_status, 0);
      }
    );
  });
});
