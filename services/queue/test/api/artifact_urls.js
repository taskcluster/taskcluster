suite('/task/:taskId/artifact-urls', function() {
  var debug       = require('debug')('post_task_test');
  var assert      = require('assert');
  var Promise     = require('promise');
  var request     = require('superagent-promise');
  var path        = require('path');
  var base        = require('taskcluster-base');
  var dropdb      = require('../../bin/dropdb');

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

  // first we need a task to actually post artifact to
  var taskId;
  var runid;
  setup(function() {
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
    return request.post(baseUrl + '/task/new').
      send(task).
      end().
      then(function(res) {
        taskId = res.body.status.taskId;
      }).
      then(function() {
        return request.
          post(baseUrl + '/task/' + taskId + '/claim').
          send({
            workerGroup: 'workerGroup',
            workerId: 'workerId'
          }).
          end();
      }).
      then(function(res) {
        runId = res.body.runId;
      });
  });

  test('post then fetch artifacts', function() {
    // slot for map of artifacts returned by artifact urls.
    var artifacts;
    var expectedArtifactData = 'I HAZ DATA';
    var expectedArtifactType = 'text/plain';

    var artifactRequest = {
      runId: runId,
      workerGroup: 'workerGroup',
      workerId: 'workerId',
      artifacts: {
        foo: { contentType: expectedArtifactType },
        bar: { contentType: 'application/json' }
      }
    };


    var url = baseUrl + '/task/' + taskId + '/artifact-urls';
    var artifactRequest = request.post(url).
      send(artifactRequest).
      end().
      then(function(res) {
        artifacts = res.body.artifacts;
        assert.ok(artifacts.foo, 'has requested artifact foo');
        assert.ok(artifacts.bar, 'has requested artifact bar');

        var expires = new Date(res.body.expires);
        assert.ok(expires > new Date(), expires + ' is in the future');

        // attempt to populate some data in the artifact
        var putUrl = artifacts.foo.artifactPutUrl;
        return request.
          put(putUrl, expectedArtifactData).
          set('Content-Type', expectedArtifactType).
          end();
      });

    var fetchArtifact = artifactRequest.
      then(function(res) {
        if (res.error) throw res.error;
        var fetchUrl = artifacts.foo.artifactUrl;
        return request.get(fetchUrl).end();
      });

    var fetchArtifactResult = fetchArtifact.
      then(function(res) {
        if (res.error) throw res.error;
        assert.ok(!res.error);
        assert.equal(res.text, expectedArtifactData);
      });

    return fetchArtifactResult;
  });
});
