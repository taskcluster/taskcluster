suite('claim timeouts', function() {
  var debug       = require('debug')('test:claim timeouts');
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

  // Configure reaper
  var reaper = new base.testing.LocalApp({
    command:      path.join(__dirname, '..', '..', 'bin', 'reaper.js'),
    args:         ['test'],
    name:         'reaper.js'
  });

  // Setup server
  var baseUrl = null;
  setup(function() {
    return dropdb('test').then(function() {
      // Launch server
      return Promise.all(
        reaper.launch(),
        server.launch().then(function(baseUrl_) {
          baseUrl = baseUrl_;
        })
      );
    });
  });

  // Shutdown server
  teardown(function() {
    return Promise.all(
      reaper.terminate(),
      server.terminate()
    );
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

  suite('let task timeout (no claim)', function() {
    // this takes over 30 seconds at minimum
    this.timeout('2m');

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

    function claimWork() {
      var url = baseUrl + '/claim-work/' + task.provisionerId + '/' + task.workerType;
      return request
        .post(url)
        .send({
          workerGroup:  'testing',
          workerId:     'worker-' + unique
        })
        .end();
    }

    var body;
    setup(function() {
      return request('POST', baseUrl + '/task/new').
        send(task).
        end().
        then(function(res) {
          if (res.error) {
            throw res.error;
          }
        });
    });

    test('attempt to fetch more work', function() {
      function verifyClaim(res) {
        if (res.error) {
          throw res.error;
        }

        var status = res.body.status;
        // verify that this task is the one we submitted
        assert.equal(status.workerType, task.workerType);
      }

      // claim work
      return claimWork().
        // ensure we can claim the task
        then(verifyClaim).
        // ensure that tasks can not be claimed before timeout
        then(sleep.bind(null, task.timeout / 2)).
        then(claimWork.bind(this)).
        then(function(res) {
          assert.equal(res.status, 204);
        }).
        // then wait for it to timeout (this needs to be large enough so it
        // gets picked up by the set interval thing [yuck] but it's important
        // that this functionality actually works as intended)
        then(sleep.bind(null, 60)).
        then(claimWork.bind(this)).
        then(function(res) {
          // then verify it is available for retries
          verifyClaim(res);
          var status = res.body.status;
          assert.equal(status.retries, 0);
          assert.equal(status.runs.length, task.retries);
        });
      });
  });
});
