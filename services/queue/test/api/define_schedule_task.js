suite('Test reruns', function() {
  var LocalQueue  = require('../localqueue');
  var debug       = require('debug')('define_schedule_test');
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

  /** Test define tasks */
  test('GET task put url using v1/define-tasks', function() {
    // Post request to server
    debug("GET from define/tasks to server");
    var got_tasks = request.get(baseUrl + '/v1/define-tasks').send({
      tasksRequested:       5
    }).end();

    // Validate server reply
    return got_tasks.then(function(res) {
      assert(res.ok, "This should have succeeded");
      assert(
        Object.keys(res.body.tasks).length == 5,
        "Didn't generate number of tasks requested"
      );
    });
  });

  test('define a single task, schedule, and claim it', function() {
    // Post request to server
    debug("GET from define/tasks to server");
    var got_tasks = request.get(baseUrl + '/v1/define-tasks').send({
      tasksRequested:       1
    }).end();

    // Validate server reply
    var taskId = null;
    var got_taskid_and_url = got_tasks.then(function(res) {
      assert(res.ok, "This should have succeeded");
      assert(
        _.keys(res.body.tasks).length == 1,
        "Didn't generate number of tasks requested"
      );
      taskId = _.keys(res.body.tasks)[0];
      return res.body.tasks[taskId].taskPutUrl;
    });

    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setDate(created.getDate() + 3);

    // Define task on S3 using signed URL
    var task_defined = got_taskid_and_url.then(function(putUrl) {
      return request.put(putUrl).send({
        version:          '0.2.0',
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
      }).end().then(function(res) {
        assert(res.ok, "Put of task definition failed!");
      })
    });

    // When task is defined, let's try to schedule it
    var task_scheduled = task_defined.then(function() {
      return request.post(baseUrl + '/v1/task/' + taskId + '/schedule').end();
    });

    // Check that it was scheduled right
    var check_scheduling = task_scheduled.then(function(res) {
      assert(res.ok, "Scheduling of task failed");
      assert(res.body.status.state == 'pending');
    });

    // Test that if we claim a task, then we get the task we just created
    return check_scheduling.then(function() {
      request.post(baseUrl + '/v1/task/' + taskId + '/claim').send({
        workerGroup:    'my-test-group',
        workerId:       'jonasfj-test-worker'
      }).end().then(function(res) {
        assert(res.ok, "Failed to claim task");
        assert(res.body.status.taskId == taskId, "Claimed unexpected taskId!");
      });
    });
  });
});




