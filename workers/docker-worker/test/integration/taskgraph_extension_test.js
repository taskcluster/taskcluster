suite('Extend Task Graph', function() {
  var co = require('co');
  var get = require('./helper/get');
  var cmd = require('./helper/cmd');
  var slugid = require('slugid');

  var scheduler = new (require('taskcluster-client').Scheduler);
  var queue = new (require('taskcluster-client').Queue);

  var LocalWorker = require('../dockerworker');
  var TestWorker = require('../testworker');
  var Task = require('taskcluster-task-factory/task');

  var EXTENSION_LABEL = 'test_task_extension';

  var worker;
  setup(co(function * () {
    worker = new TestWorker(LocalWorker);
    yield worker.launch();
  }));

  teardown(co(function* () {
    yield worker.terminate();
  }));

  test('successfully extend graph', co(function* () {
    var graphId = slugid.v4();
    var primaryTaskId = slugid.v4();
    var customTaskId = slugid.v4();

    var graphTask = Task.create({
      taskGroupId: graphId,
      schedulerId: 'task-graph-scheduler',
      workerType: worker.workerType,
      provisionerId: worker.provisionerId,
      metadata: {
        description: 'testing',
        source: 'http://mytest/',
        owner: 'test@localhost.local'
      },
      payload: {
        image: 'ubuntu',
        command: cmd('echo "wooot custom!"'),
        features: {},
        artifacts: {},
        maxRunTime: 5 * 60
      }
    });

    var graph = {
      tasks: [{
        taskId: customTaskId,
        label: EXTENSION_LABEL,
        requires: [],
        reruns: 0,
        task: graphTask
      }]
    };

    var json = JSON.stringify(graph);
    var result = yield worker.postToScheduler(graphId, {
      metadata: {
        source: 'http://xfoobar.com'
      },
      scopes: [
        'queue:define-task:' + worker.provisionerId + '/' + worker.workerType
      ],
      tasks: [{
        taskId: primaryTaskId,
        label: 'primary',
        task: {
          metadata: {
            owner: 'tests@local.localhost'
          },
          payload: {
            image: 'ubuntu',
            command: cmd(
              'echo \'' + json + '\' > /graph.json'
            ),
            features: {},
            artifacts: {},
            graphs: ['/graph.json'],
            maxRunTime: 5 * 60
          }
        }
      }]
    });

    assert.equal(result.length, 2, 'two tasks ran in graph');

    var extendingTask = result.filter(function(task) {
      return task.taskId === primaryTaskId
    })[0];

    var customTask = result.filter(function(task) {
      return task.taskId === customTaskId;
    })[0];

    assert.ok(extendingTask.run.success, 'extending task was successful');
    assert.ok(
      extendingTask.log.indexOf('extended graph') !== -1,
      'log is shown with graph extension'
    );

    assert.ok(customTask.run.success, 'custom task was successful');
    assert.ok(
      customTask.log.indexOf('wooot custom') !== 1, 'correctly executed commands'
    );
  }));
});
