suite("API", () => {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('index:test:api_test');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var taskcluster = require('taskcluster-client');
  var request     = require('superagent-promise');

  // Artifact names that we have assigned scopes to testing credentials for.
  var publicArtifactName = 'public/dummy-test-provisioner.log';
  var privateArtifactName = 'private/dummy-test-provisioner.log';

  // Create expiration
  var expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 25);

  test('insert (and rank)', function() {
    var myns    = slugid.v4();
    var taskId  = slugid.v4();
    var taskId2  = slugid.v4();
    return helper.index.insertTask(myns + '.my-task', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: "world"},
      expires:    expiry.toJSON()
    }).then(function() {
      return helper.index.findTask(myns + '.my-task').then(function(result) {
        assert(result.taskId === taskId, "Wrong taskId");
      });
    }).then(function() {
      return helper.index.insertTask(myns + '.my-task', {
        taskId:     taskId2,
        rank:       42,
        data:       {hello: "world - again"},
        expires:    expiry.toJSON()
      });
    }).then(function() {
      return helper.index.findTask(myns + '.my-task').then(function(result) {
        assert(result.taskId === taskId2, "Wrong taskId");
      });
    });
  });

  test('find (non-existing)', function() {
    var ns = slugid.v4() + '.' + slugid.v4();
    return helper.index.findTask(ns).then(function() {
      assert(false, "This shouldn't have worked");
    }, function(err) {
      assert(err.statusCode === 404, "Should have returned 404");
    });
  });

  test('list top-level namespaces', function() {
    return helper.index.listNamespaces('', {}).then(function(result) {
      result.namespaces.forEach(function(ns) {
        assert(ns.namespace.indexOf('.') === -1, "shouldn't have any dots");
      });
    });
  });

  test('list top-level namespaces (without auth)', function() {
    var index = new helper.Index();
    return index.listNamespaces('', {}).then(function(result) {
      result.namespaces.forEach(function(ns) {
        assert(ns.namespace.indexOf('.') === -1, "shouldn't have any dots");
      });
    });
  });

  test('list top-level tasks', function() {
    return helper.index.listTasks('', {}).then(function(result) {
      result.tasks.forEach(function(task) {
        assert(task.namespace.indexOf('.') === -1, "shouldn't have any dots");
      });
    });
  });

  test('list top-level tasks (without auth)', function() {
    var index = new helper.Index();
    return index.listTasks('', {}).then(function(result) {
      result.tasks.forEach(function(task) {
        assert(task.namespace.indexOf('.') === -1, "shouldn't have any dots");
      });
    });
  });

  test('access public and private artifact', function() {
    var taskId = slugid.v4();
    return helper.queue.createTask(taskId, {
      provisionerId:    "dummy-test-provisioner",
      workerType:       "dummy-test-worker-type",
      retries:          3,
      created:          taskcluster.fromNowJSON(),
      deadline:         taskcluster.fromNowJSON('30 min'),
      payload: {
        desiredResolution:  "success"
      },
      metadata: {
        name:           "Print `'Hello World'` Once",
        description:    "This task will prìnt `'Hello World'` **once**!",
        owner:          "jojensen@mozilla.com",
        source:         "https://github.com/taskcluster/taskcluster-index"
      },
      tags: {
        objective:      "Test task indexing"
      }
    }).then(function() {
      debug("### Claim task");
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:  'dummy-test-workergroup',
        workerId:     'dummy-test-worker-id'
      });
    }).then(function() {
      debug("### Create public artifact");
      return helper.queue.createArtifact(taskId, 0, publicArtifactName, {
        storageType:  'error',
        expires:      taskcluster.fromNowJSON('24 hours'),
        reason:       'invalid-resource-on-worker',
        message:      "Testing that we can access public artifacts from index"
      });
    }).then(function() {
      debug("### Create private artifact");
      return helper.queue.createArtifact(taskId, 0, privateArtifactName, {
        storageType:  'error',
        expires:      taskcluster.fromNowJSON('24 hours'),
        reason:       'file-missing-on-worker',
        message:      "Testing that we can access private artifacts from index"
      });
    }).then(function() {
      debug("### Report task completed");
      return helper.queue.reportCompleted(taskId, 0);
    }).then(function() {
      debug("### Insert task into index");
      return helper.index.insertTask(taskId + '.my-task', {
        taskId:     taskId,
        rank:       41,
        data:       {hello: "world"},
        expires:    taskcluster.fromNowJSON('24 hours')
      });
    }).then(function() {
      debug("### Download public artifact using index");
      var url = helper.index.buildUrl(
        helper.index.findArtifactFromTask,
        taskId + '.my-task',
        publicArtifactName
      );
      return request.get(url).redirects(0).end().catch(function(err) {
        return err.response;
      });
    }).then(function(res) {
      assert(res.statusCode === 303, "Expected 303 redirect");
      return request.get(res.headers.location).end().then(function() {
        assert(false, "Expected 403 response");
      }, function(err) {
        assert(err.response.statusCode === 403, "Expected 403");
        assert(err.response.body.reason === 'invalid-resource-on-worker');
      });
    }).then(function() {
      debug("### Download private artifact using index (no auth)");
      var url = helper.index.buildUrl(
        helper.index.findArtifactFromTask,
        taskId + '.my-task',
        privateArtifactName
      );
      return request.get(url).redirects(0).end().catch(function(err) {
        return err.response;
      });
    }).then(function(res) {
      assert(res.statusCode === 403, "Expected 403 access denied");
    }).then(function() {
      debug("### Download private artifact using index (with auth)");
      var url = helper.index.buildSignedUrl(
        helper.index.findArtifactFromTask,
        taskId + '.my-task',
        privateArtifactName, {
        expiration:     15 * 60
      });
      return request.get(url).redirects(0).end().catch(function(err) {
        return err.response;
      });
    }).then(function(res) {
      assert(res.statusCode === 303, "Expected 303 redirect");
      // We can't call the URL because server isn't configured with real
      // credentials in the test.
      assert(res.headers.location.indexOf('bewit') !== -1,
             "Expected redirect to signed url");
    });
  });
});


