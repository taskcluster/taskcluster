suite('Test reruns', function() {
  var debug       = require('debug')('rerun_test');
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
  /** Test that task can rerun */
  test('Post task, claim, completed, rerun and claim again', function() {
    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setDate(created.getDate() + 3);

    // Post request to server
    debug("Posting task/new to server");
    var submit_task = request.post(baseUrl + '/task/new').send({
      version:          '0.2.0',
      provisionerId:    'jonasfj-provisioner',
      workerType:       'my-ami',
      routing:          'jonasfj-test.what-a-hack',
      timeout:          60,
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

    // Find the taskId and check that it was posted correctly
    var taskId = null;
    var has_taskid = submit_task.then(function(res) {
      assert(res.ok, "Queue should have accepted this task");
      assert(res.body.status.taskId, "Should have assigned taskId");
      taskId = res.body.status.taskId;
    });

    // Fetch task status
    var fetch_pending_task_status = has_taskid.then(function() {
      var endpoint = '/task/' + taskId + '/status';
      return request.get(baseUrl + endpoint).end();
    });

    // Check that task is now 'completed'
    var check_task_status_0 = fetch_pending_task_status.then(function(res) {
      assert(res.ok, "Failed to fetch task status");
      assert(res.body.status.taskId == taskId, "Wrong taskId in reply");
      assert(res.body.status.runs.length == 0, "We should have 0 runs!");
      assert(res.body.status.state == 'pending');
    });

    // Claim work
    var claimed_work = check_task_status_0.then(function() {
      var endpoint = '/claim-work/jonasfj-provisioner/my-ami';
      return request.post(baseUrl + endpoint).send({
        workerGroup:    'my-test-group',
        workerId:       'jonasfj-test-worker'
      }).end();
    });

    // Check taskId claimed is the one we have
    var logsPutUrl = null;
    var resultPutUrl = null;
    var check_taskid_claimed = claimed_work.then(function(res) {
      assert(res.ok, "We should be able to claim work");
      assert(res.status == 200, "No 204 when we have work available");
      assert(res.body.status.taskId == taskId, "Got wrong taskId");
      assert(res.body.logsPutUrl, "Missing logsPutUrl, this is wrong!");
      assert(res.body.resultPutUrl, "Missing resultPutUrl, this is wrong!");
      assert(res.body.runId, "Missing runId, this is wrong!");
      assert(res.body.runId == 1, "runId must be 1 as this is the first run!");
      logsPutUrl    = res.body.logsPutUrl;
      resultPutUrl  = res.body.resultPutUrl;
    });

    // Fetch task status
    var fetch_task_status = check_taskid_claimed.then(function() {
      var endpoint = '/task/' + taskId + '/status';
      return request.get(baseUrl + endpoint).end();
    });

    // Check that task is now 'completed'
    var check_task_status = fetch_task_status.then(function(res) {
      assert(res.ok, "Failed to fetch task status");
      assert(res.body.status.taskId == taskId, "Wrong taskId in reply");
      assert(res.body.status.runs.length == 1, "We should have 1 run!");
      assert(res.body.status.state == 'running');
      assert(res.body.status.runs[0].runId == 1);
      assert(res.body.status.runs[0].workerGroup == 'my-test-group');
      assert(res.body.status.runs[0].workerId == 'jonasfj-test-worker');
    });

    // Check that we claimed the right taskId
    var put_logs_json = check_task_status.then(function() {
      return request.put(logsPutUrl).send({
        version:      '0.2.0',
        logs:         {}
      }).end().then(function(res) {
        assert(res.ok, "Failed to upload logs.json");
      });
    });

    // Put logs.json
    var put_result_json = put_logs_json.then(function() {
      return request.put(resultPutUrl).send({
        version:      '0.2.0',
        artifacts:    {},
        statistics: {
          started:        created.toJSON(),
          finished:       (new Date()).toJSON()
        },
        metadata: {
          workerGroup:    'my-test-group',
          workerId:       'jonasfj-test-worker',
          success:        true
        },
        result:       {}
      }).end().then(function(res) {
        assert(res.ok, "Failed to upload logs.json");
      });
    });

    // Put result.json
    var complete_task = put_result_json.then(function() {
      var endpoint = '/task/' + taskId + '/completed';
      return request.post(baseUrl + endpoint).send({
        runId:          1,  // First runId should always be 1
        success:        true,
        workerGroup:    'my-test-group',
        workerId:       'jonasfj-test-worker'
      }).end().then(function(res) {
        assert(res.ok, "Failed to report task completed");
        assert(res.body.status.taskId == taskId, "Wrong taskId in reply");
        assert(res.body.status.state == 'completed', "Wrong state in reply");
      });
    });

    // Fetch task status
    var fetch_task_status_again = complete_task.then(function() {
      var endpoint = '/task/' + taskId + '/status';
      return request.get(baseUrl + endpoint).end();
    });

    // Check that task is now 'completed'
    var check_task_status_again = fetch_task_status_again.then(function(res) {
      assert(res.ok, "Failed to fetch task status");
      assert(res.body.status.taskId == taskId, "Wrong taskId in reply");
      assert(res.body.status.runs.length == 1, "We should have 1 run!");
      assert(res.body.status.state == 'completed');
      assert(res.body.status.runs[0].runId == 1);
      assert(res.body.status.runs[0].workerGroup == 'my-test-group');
      assert(res.body.status.runs[0].workerId == 'jonasfj-test-worker');
    });

    // Rerun task...
    var rerun_task = check_task_status_again.then(function() {
      var endpoint = '/task/' + taskId + '/rerun';
      return request.post(baseUrl + endpoint).end();
    });

    // Check rerun response
    var check_rerun_task = rerun_task.then(function(res) {
      assert(res.ok, "Request to rerun failed");
      assert(res.body.status.taskId == taskId, "Wrong taskId in reply");
      assert(res.body.status.runs.length == 1, "We should have 1 run!");
      assert(res.body.status.state == 'pending');
    });

    // Claim task again
    var claim_task_again = check_rerun_task.then(function() {
      var endpoint = '/claim-work/jonasfj-provisioner/my-ami';
      return request.post(baseUrl + endpoint).send({
        workerGroup:    'my-test-group',
        workerId:       'jonasfj-test-worker2'
      }).end();
    });

    // Check that task was claimed again
    return claim_task_again.then(function(res) {
      assert(res.ok, "Failed to fetch task status");
      assert(res.body.status.taskId == taskId, "Wrong taskId in reply");
      assert(res.body.status.state == 'running');
      assert(res.body.status.runs.length == 2, "We should have 2 run!");
      var run1 = res.body.status.runs.filter(function(run) {
        return run.runId == 1;
      });
      assert(run1.length == 1, "Multiple runs with runId == 1");
      var run2 = res.body.status.runs.filter(function(run) {
        return run.runId == 2;
      });
      assert(run2.length == 1, "Multiple runs with runId == 2");
      assert(run1[0].workerGroup == 'my-test-group', "Wrong workerGroup");
      assert(run1[0].workerId == 'jonasfj-test-worker', "Wrong workerId");
      assert(run2[0].workerGroup == 'my-test-group', "Wrong workerGroup");
      assert(run2[0].workerId == 'jonasfj-test-worker2', "Wrong workerId");
      assert(res.status == 200, "No 204 when we have work available");
      assert(res.body.logsPutUrl, "Missing logsPutUrl, this is wrong!");
      assert(res.body.resultPutUrl, "Missing resultPutUrl, this is wrong!");
      assert(res.body.runId, "Missing runId, this is wrong!");
      assert(res.body.runId == 2, "runId must be 2 as this is the first run!");
    });
  });
});
