suite('Post-Task Tests', function() {
  var debug       = require('debug')('post_task_test');
  var assert      = require('assert');
  var Promise     = require('promise');
  var request     = require('superagent-promise');
  var path        = require('path');
  var base        = require('taskcluster-base');
  var dropdb      = require('../../bin/dropdb');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + 'test'),
    envs: [
      'aws_accessKeyId',
      'aws_secretAccessKey'
    ],
    filename:     'taskcluster-queue'
  });

  // Skip tests if no AWS credentials is configured
  if (!cfg.get('aws:accessKeyId')) {
    console.log("Skip tests due to missing aws credentials!");
    return;
  }

  // Configure server
  var server = new base.testing.LocalApp({
    command:      path.join(__dirname, '..', '..', 'bin', 'server.js'),
    args:         ['test'],
    name:         'server.js',
    baseUrlPath:  '/v1'
  });

  // Setup server
  var baseUrl = null;
  setup(function() {
    return dropdb('test').then(function() {
      // Launch server
      return server.launch().then(function(baseUrl_) {
        baseUrl = baseUrl_;
      });
    });
  });

  // Shutdown server
  teardown(function() {
    return server.terminate();
  });

  /** Test task publication */
  test('Post New Task', function() {
    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setDate(created.getDate() + 3);

    var task = {
      version:          '0.2.0',
      provisionerId:    'jonasfj-provisioner',
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
    return request.post(baseUrl + '/task/new').
      send(task).
      end().
      then(function(res) {
        assert(res.ok, "Queue should have accepted this task");
        debug("Server replied: %j", res.body);

        var taskId = res.body.status.taskId;
        return request.get(baseUrl + '/task/' + taskId + '/status').end();
      }).
      then(function(res) {
        var status = res.body.status;
        assert.equal(
          status.routing,
          task.routing
        );
        assert.equal(status.state, 'pending');
      });
  });


  /** Test validation of task publication */
  test('Post New Invalid Task', function() {
    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setDate(created.getDate() + 3);

    // Post request to server
    debug("Posting task/new to server");
    var submit_task = request.post(baseUrl + '/task/new').send({
      version:          '0.0.0',  // version 0.0.0 is invalid
      provisionerId:    'jonasfj-provisioner',
      workerType:       'my-ami',
      routing:          'jonasfj-test.what-a-hack',
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
    }).end();
    return submit_task.then(function(res) {
      assert(res.status === 400, "Rejected by validation");
      assert(!res.ok, "Validation should have rejected this task");
      debug("Server replied: %j", res.body);
    });
  });
});
