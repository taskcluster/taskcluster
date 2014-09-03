suite('Indexing', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('index:test:index_test');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var subject     = helper.setup({title: "indexing test"});

  // Create datetime for created and deadline as 25 minutes later
  var created = new Date();
  var deadline = new Date();
  deadline.setMinutes(deadline.getMinutes() + 25);

  // Hold reference to taskId
  var taskId = null;
  var myns   = null;
  var makeTask = function() {
    // Find taskId
    taskId = slugid.v4();
    myns = slugid.v4();
    return {
      "provisionerId":    "dummy-test-provisioner",
      "workerType":       "dummy-test-worker-type",
      "scopes":           [],
      "routes": [
        subject.routePrefix + "." + myns + ".my-indexed-thing",
        subject.routePrefix + "." + myns + ".my-indexed-thing-again",
        subject.routePrefix + "." + myns + ".one-ns.my-indexed-thing",
        subject.routePrefix + "." + myns + ".another-ns.my-indexed-thing-again"
      ],
      "retries":          3,
      "created":          created.toJSON(),
      "deadline":         deadline.toJSON(),
      "payload": {
        "desiredResolution":  "success"
      },
      "metadata": {
        "name":           "Print `'Hello World'` Once",
        "description":    "This task will prìnt `'Hello World'` **once**!",
        "owner":          "jojensen@mozilla.com",
        "source":         "https://github.com/taskcluster/taskcluster-index"
      },
      "tags": {
        "objective":      "Test task indexing"
      }
    };
  };

  test("Run task and test indexing", function() {
    // Make task
    var task = makeTask();

    // Submit task to queue
    debug("### Posting task");
    return subject.queue.createTask(
      taskId,
      task
    ).then(function(result) {
      // Claim task
      debug("### Claim task");
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:  'dummy-test-workergroup',
        workerId:     'dummy-test-worker-id'
      });
    }).then(function() {
      return helper.sleep(100);
    }).then(function() {
      debug("### Report task completed");
      return subject.queue.reportCompleted(taskId, 0, {
        success: true
      });
    }).then(function() {
      debug("### Give indexing 1s to run");
      return helper.sleep(5000);
    }).then(function() {
      debug("### Find task in index");
      return subject.index.find(myns + '.my-indexed-thing');
    }).then(function(result) {
      assert(result.taskId === taskId, "Wrong taskId");
    }).then(function() {
      debug("### Find task in index (again)");
      return subject.index.find(myns + '.my-indexed-thing-again');
    }).then(function(result) {
      assert(result.taskId === taskId, "Wrong taskId");
    }).then(function() {
      debug("### List task in namespace");
      return subject.index.listTasks(myns);
    }).then(function(result) {
      assert(result.tasks.length === 2, "Expected 2 tasks");
      result.tasks.forEach(function(task) {
        assert(task.taskId === taskId, "Wrong taskId");
      });
    }).then(function() {
      debug("### List namespaces in namespace");
      return subject.index.listNamespaces(myns);
    }).then(function(result) {
      assert(result.namespaces.length === 2, "Expected 2 namespaces");
      assert(result.namespaces.some(function(ns) {
        return ns.name === 'one-ns';
      }), "Expected to find one-ns");
      assert(result.namespaces.some(function(ns) {
        return ns.name === 'another-ns';
      }), "Expected to find another-ns");
    });
  });
});
