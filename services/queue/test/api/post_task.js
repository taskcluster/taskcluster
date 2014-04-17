suite('Post-Task Tests', function() {
  var LocalQueue  = require('../localqueue');
  var debug       = require('debug')('post_task_test');
  var assert      = require('assert');
  var Promise     = require('promise');
  var request     = require('superagent-promise');
  var config      = require('../../config');
  var nconf       = require('nconf');
  var _           = require('lodash');
  config.load();

  // Queue base URL
  var baseUrl     = 'http://' + nconf.get('server:hostname') + ':' +
                     nconf.get('server:port');
  var queue = null;
  setup(function() {
    queue = new LocalQueue();
    return queue.launch();
  });

  teardown(function() {
    queue.terminate();
  });

  /** Test task publication */
  test('Post New Task', function() {
    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setDate(created.getDate() + 3);

    // Post request to server
    debug("Posting task/new to server");
    var submit_task = request.post(baseUrl + '/v1/task/new').send({
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
    }).end();
    return submit_task.then(function(res) {
      assert(res.ok, "Queue should have accepted this task");
      debug("Server replied: %j", res.body);
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
    var submit_task = request.post(baseUrl + '/v1/task/new').send({
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
      assert(!res.ok, "Validation should have rejected this task");
      debug("Server replied: %j", res.body);
    });
  });

});




