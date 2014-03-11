suite('claim timeouts', function() {
  var debug       = require('debug')('test:api:claim');
  var LocalQueue  = require('../localqueue');
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
    setup(function(done) {
      return request.post(baseUrl + '/v1/task/new').
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
      return request.post(baseUrl + '/v1/task/' + status.taskId + '/claim').
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

