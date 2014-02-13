suite('azure logging', function() {
  if (!process.env.AZURE_STORAGE_ACCOUNT) {
    test.skip(
      'azure logging test disabled env: AZURE_STORAGE_ACCOUNT missing'
    );
    return;
  }

  var runTask = require('../run_task')();
  var request = require('superagent-promise');
  var TaskFactory = require('taskcluster-task-factory/task');

  test('azure logger', function() {
    var task = TaskFactory.create({
      command: ['/bin/bash', '-c', 'echo "first command!"'],
      image: 'ubuntu',
      features: {
        azureLivelog: true,
        // turn on buffer log for testing
        bufferLog: true
      }
    });

    var result;
    return runTask(task).then(
      function(taskStatus) {
        result = taskStatus.stop;

        assert.ok(taskStatus.start);
        assert.ok(taskStatus.start.log);
        return request('GET', taskStatus.start.log).end();
      }
    ).then(
      function(req) {
        assert.equal(
          req.res.text,
          result.logText
        );
      }
    );
  });
});
