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
      features: {
        azure_livelog: true,
        // turn on buffer log for testing
        buffer_log: true
      },

      parameters: {
        docker: { image: 'ubuntu' }
      }
    });

    var result;
    return runTask(task).then(
      function(taskStatus) {
        assert.ok(taskStatus.claimed);
        assert.ok(taskStatus.claimed.log);

        result = taskStatus.finish.result;

        assert.ok(result.artifacts.log, 'has artifact for log url');
        return request('GET', result.artifacts.log).end();
      }
    ).then(
      function(req) {
        assert.equal(
          req.res.text,
          result.extra_info.log
        );
      }
    );
  });
});
