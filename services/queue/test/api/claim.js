suite('claim timeouts', function() {
  var debug       = require('debug')('test:api:claim');
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

  // break all rules that have ever existed...
  // timeout is in seconds
  function sleep(timeout) {
    debug('sleeping for', timeout, 's');
    timeout = timeout * 1000;
    return new Promise(function(accept) {
      setTimeout(accept, timeout);
    });
  }

  suite('reclaim task by id', function() {
    var unique = String(Date.now());
    var created = new Date();
    var deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 120);

    var task = {
      version:          '0.2.0',
      provisionerId:    'jonasfj-provisioner',
      workerType:       't' + unique,
      routing:          'jonasfj-test.what-a-hack',
      timeout:          30,
      retries:          2, // add retries so we can reclaim the task
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
        unique:         unique,
        purpose:        'taskcluster-testing'
      }
    };

    var status;
    setup(function() {
      return request.post(baseUrl + '/task/new').
        send(task).
        end().
        then(function(res) {
          if (res.error) {
            throw res.error;
          }
          status = res.body.status;
        });
    });

    function claim(body) {
      return request.post(baseUrl + '/task/' + status.taskId + '/claim').
        send(body).
        end();
    }

    test('issue claim', function() {
      var params = {
        workerGroup: unique,
        workerId: unique
      };
      return claim(params).then(function(res) {
        var body = res.body;
        assert.equal(body.status.timeout, task.timeout);
        assert.equal(body.runId, 1);
      }).then(function() {
        return claim(params);
      }).then(function(res) {
        // cannot claim an already claimed task
        assert.equal(res.status, 404);
      });
    });
  });
});

