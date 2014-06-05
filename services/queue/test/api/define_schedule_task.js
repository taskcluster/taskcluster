suite('Test reruns', function() {
  var debug       = require('debug')('define_schedule_test');
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

  /** Test define tasks */
  test('GET task put url using v1/define-tasks', function() {
    // Post request to server
    debug("GET from define/tasks to server");
    var got_tasks = request.get(baseUrl + '/define-tasks').send({
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
    var got_tasks = request.get(baseUrl + '/define-tasks').send({
      tasksRequested:       1
    }).end();

    // Validate server reply
    var taskId = null;
    var got_taskid_and_url = got_tasks.then(function(res) {
      assert(res.ok, "This should have succeeded");
      assert(
        Object.keys(res.body.tasks).length == 1,
        "Didn't generate number of tasks requested"
      );
      taskId = Object.keys(res.body.tasks)[0];
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
      return request.post(baseUrl + '/task/' + taskId + '/schedule').end();
    });

    // Check that it was scheduled right
    var check_scheduling = task_scheduled.then(function(res) {
      assert(res.ok, "Scheduling of task failed");
      assert(res.body.status.state == 'pending');
    });

    // Test that if we claim a task, then we get the task we just created
    return check_scheduling.then(function() {
      request.post(baseUrl + '/task/' + taskId + '/claim').send({
        workerGroup:    'my-test-group',
        workerId:       'jonasfj-test-worker'
      }).end().then(function(res) {
        assert(res.ok, "Failed to claim task");
        assert(res.body.status.taskId == taskId, "Claimed unexpected taskId!");
      });
    });
  });
});




