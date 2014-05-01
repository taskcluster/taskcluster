suite('/pending-tasks/:provisionerId', function() {
  var LocalQueue  = require('../localqueue');
  var debug       = require('debug')('post_task_test');
  var assert      = require('assert');
  var Promise     = require('promise');
  var request     = require('superagent-promise');
  var nconf       = require('../../config/test')();

  // Queue base URL
  var baseUrl     = 'http://' + nconf.get('server:hostname') + ':' +
                     nconf.get('server:port');
  var queue = null;
  setup(function() {
    queue = new LocalQueue();
    return queue.launch();
  });

  teardown(function() {
    return queue.terminate();
  });

  var taskId;
  var provisionerId = 'jonsafj-provisioner';
  setup(function() {
    var created = new Date();
    var deadline = new Date();
    deadline.setDate(created.getDate() + 3);

    var task = {
      version:          '0.2.0',
      provisionerId:    provisionerId,
      workerType:       'my-ami', // let's just test a large routing key too, 128 chars please :)
      routing:          'jonasfj-test.what-a-hack.I suppose we might actually need it when we add taskgraph scheduler id, taskgraphId, task graph routing',
      timeout:          30,
      retries:          5,
      priority:         1,
      created:          created.toJSON(),
      deadline:         deadline.toJSON(),
      payload:          {},
      metadata: {
        name:           "Unit testing task",
        description:    "Task created during unit tests",
        owner:          'jonsafj@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue'
      },
      tags: {
        purpose:        'taskcluster-testing'
      }
    };

    // Post request to server
    debug("Posting task/new to server");
    return request.post(baseUrl + '/v1/task/new').
      send(task).
      end().
      then(function(res) {
        taskId = res.body.status.taskId;
      });
  });

  test('fetch by provisioner with tasks', function() {
    return request.
      get(baseUrl + '/v1/pending-tasks/' + provisionerId).
      end().
      then(function(res) {
        var tasks = res.body.tasks;
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].taskId, taskId);
      })
  });

  test('fetch by provisioner with no tasks', function() {
    return request.
      get(baseUrl + '/v1/pending-tasks/nobodyishome').
      end().
      then(function(res) {
        assert.equal(res.body.tasks.length, 0);
      })
  });
});

