import assert from 'assert';
import get from './helper/get';
import cmd from './helper/cmd';
import slugid from 'slugid';
import LocalWorker from '../dockerworker';
import TestWorker from '../testworker';
import Task from 'taskcluster-task-factory/task';

suite('Extend Task Graph', () => {

  var EXTENSION_LABEL = 'test_task_extension';

  var worker;
  setup(async () => {
    worker = new TestWorker(LocalWorker);
    await worker.launch();
  });

  teardown(async () => {
    await worker.terminate();
  });

  test('successfully extend graph', async () => {
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
      scopes: [
        'scheduler:extend-task-graph:' + graphId
      ],
      payload: {
        image: 'taskcluster/test-ubuntu',
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
    var result = await worker.postToScheduler(graphId, {
      metadata: {
        source: 'http://xfoobar.com'
      },
      scopes: [
        'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
        'scheduler:extend-task-graph:' + graphId
      ],
      tasks: [{
        taskId: primaryTaskId,
        label: 'primary',
        task: {
          metadata: {
            owner: 'tests@local.localhost'
          },
          scopes: [
            'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
            'scheduler:extend-task-graph:' + graphId
          ],
          payload: {
            image: 'taskcluster/test-ubuntu',
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

    var extendingTask = result.filter((task) => {
      return task.taskId === primaryTaskId;
    })[0];

    var customTask = result.filter((task) => {
      return task.taskId === customTaskId;
    })[0];

    assert.equal(extendingTask.run.state, 'completed', 'extending task should be successful');
    assert.equal(extendingTask.run.reasonResolved, 'completed', 'extending task should be successful');
    assert.ok(
      extendingTask.log.indexOf('extended graph') !== -1,
      'log is shown with graph extension'
    );

    assert.equal(customTask.run.state, 'completed', 'custom task should be successful');
    assert.equal(customTask.run.reasonResolved, 'completed', 'custom task should be successful');
    assert.ok(
      customTask.log.indexOf('wooot custom') !== 1, 'correctly executed commands'
    );
  });

  test('task failure when graph json is invalid', async () => {
    var graphId = slugid.v4();
    var primaryTaskId = slugid.v4();

    var result = await worker.postToScheduler(graphId, {
      metadata: {
        source: 'http://xfoobar.com'
      },
      scopes: [
        'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
        'scheduler:extend-task-graph:' + graphId
      ],
      tasks: [{
        taskId: primaryTaskId,
        label: 'primary',
        task: {
          metadata: {
            owner: 'tests@local.localhost'
          },
          scopes: [
            'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
            'scheduler:extend-task-graph:' + graphId
          ],
          payload: {
            image: 'taskcluster/test-ubuntu',
            command: cmd(
              'echo "{foo:bar}" > /graph.json'
            ),
            features: {},
            artifacts: {},
            graphs: ['/graph.json'],
            maxRunTime: 5 * 60
          }
        }
      }]
    });

    console.log(result[0].log);
    assert.ok(
      result[0].log.includes('Invalid json in taskgraph extension path'),
      'Task graph should have been logged as invalid'
    );
    assert.ok(
      result[0].log.includes('foo:bar'),
      'Error message should include contents of invalid json file'
    );
    assert.ok(
      result[0].run.state === 'failed',
      'Task should have been marked as failed'
    );
  });

  test('Update invalid taskgraph id', async () => {
    var graphId = slugid.v4();
    var badGraphId = slugid.v4();
    var primaryTaskId = slugid.v4();

    var graphTask = Task.create({
      taskGroupId: badGraphId,
      schedulerId: 'task-graph-scheduler',
      workerType: worker.workerType,
      provisionerId: worker.provisionerId,
      metadata: {
        description: 'testing',
        source: 'http://mytest/',
        owner: 'test@localhost.local'
      },
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('echo "wooot custom!"'),
        features: {},
        artifacts: {},
        maxRunTime: 5 * 60
      }
    });

    var graph = {
      tasks: [{
        taskId: slugid.v4(),
        label: EXTENSION_LABEL,
        requires: [],
        reruns: 0,
        task: graphTask
      }]
    };

    var json = JSON.stringify(graph);
    var result = await worker.postToScheduler(graphId, {
      metadata: {
        source: 'http://xfoobar.com'
      },
      scopes: [
        'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
        'scheduler:extend-task-graph:' + graphId
      ],
      tasks: [{
        taskId: primaryTaskId,
        label: 'primary',
        task: {
          metadata: {
            owner: 'tests@local.localhost'
          },
          scopes: [
            'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
            'scheduler:extend-task-graph:' + graphId
          ],
          payload: {
            image: 'taskcluster/test-ubuntu',
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

    assert.ok(
      result[0].log.includes('Graph server error while extending task graph'),
      'Task graph error not logged'
    );
    assert.ok(
      result[0].run.state === 'failed',
      'Task should have been marked as failed'
    );
  });

  test('Update graph with invalid task scopes', async () => {
    var graphId = slugid.v4();
    var primaryTaskId = slugid.v4();

    var graphTask = Task.create({
      taskGroupId: graphId,
      schedulerId: 'task-graph-scheduler',
      workerType: worker.workerType,
      provisionerId: worker.provisionerId,
      // Because this scope is not included in the scopes the graph has, extending
      // the task graph will fail
      scopes: [
        'this-is-a-bad-scope',
        'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
        'scheduler:extend-task-graph:' + graphId
      ],
      metadata: {
        description: 'testing',
        source: 'http://mytest/',
        owner: 'test@localhost.local'
      },
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('echo "wooot custom!"'),
        features: {},
        artifacts: {},
        maxRunTime: 5 * 60
      }
    });

    var graph = {
      tasks: [{
        taskId: slugid.v4(),
        label: EXTENSION_LABEL,
        requires: [],
        reruns: 0,
        task: graphTask
      }]
    };

    var json = JSON.stringify(graph);
    var result = await worker.postToScheduler(graphId, {
      metadata: {
        source: 'http://xfoobar.com'
      },
      scopes: [
        'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
        'scheduler:extend-task-graph:' + graphId
      ],
      tasks: [{
        taskId: primaryTaskId,
        label: 'primary',
        task: {
          metadata: {
            owner: 'tests@local.localhost'
          },
          scopes: [
            'queue:define-task:' + worker.provisionerId + '/' + worker.workerType,
            'scheduler:extend-task-graph:' + graphId
          ],
          payload: {
            image: 'taskcluster/test-ubuntu',
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

    var log = result[0].log;
    assert.ok(
      log.includes('Graph server error while extending task graph'),
      'Task graph error not logged'
    );
    assert.ok(
      log.includes('You do not have sufficient scopes') && log.includes('this-is-a-bad-scope'),
      'Error message did not include authorization failed message'
    );
    assert.ok(
      result[0].run.state === 'failed',
      'Task should have been marked as failed'
    );
  });
});
