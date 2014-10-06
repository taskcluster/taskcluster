suite('event', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var taskcluster = require('../');
  var debug       = require('debug')('test:WebListener');
  var base        = require('taskcluster-base');

  // Load configuration
  var cfg = base.config({
    defaults:     {},
    profile:      {},
    envs:         [
      'taskcluster_credentials_clientId',     // Only for testing
      'taskcluster_credentials_accessToken'   // Only for testing
    ],
    filename:     'taskcluster-client'
  });

  // Check that we have credentials to run these test
  if (!cfg.get('taskcluster:credentials:accessToken')) {
    console.log("Skipping weblistener_test.js due to missing configuration");
    return;
  }

  // Test against localhost if you want to
  var baseUrl = undefined; //'http://localhost:60002/v1';

  test('create WebListener', function() {
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
    assert(listener);
  });

  test('connect and close', function() {
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
    return listener.connect().then(function() {
      return listener.close();
    });
  });

  test('listen for task', function() {
    // Decide taskId upfront
    var taskId = slugid.v4();

    // Create listener
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});

    // Listen for message
    var gotMessage = new Promise(function(accept) {
      listener.on('message', function(message) {
        if (message.payload.status.taskId === taskId) {
          accept();
        }
      });
    });

    // Connect listener
    return listener.connect().then(function() {
      // Bind to queue events
      var queueEvents = new taskcluster.QueueEvents();
      return listener.bind(queueEvents.taskDefined({taskId: taskId}));
    }).then(function() {
      // Submit a test task
      var queue = new taskcluster.Queue({
        credentials:  cfg.get('taskcluster:credentials')
      });
      var deadline = new Date();
      deadline.setHours(deadline.getHours() + 2);
      return queue.defineTask(taskId, {
        provisionerId:    "dummy-test-provisioner",
        workerType:       "dummy-test-worker-type",
        schedulerId:      "dummy-test-scheduler",
        created:          (new Date()).toJSON(),
        deadline:         deadline.toJSON(),
        payload:          {},
        metadata: {
          name:           "Print `'Hello World'` Once",
          description:    "This task will prìnt `'Hello World'` **once**!",
          owner:          "jojensen@mozilla.com",
          source:         "https://github.com/taskcluster/taskcluster-events"
        }
      });
    }).then(function() {
      return gotMessage;
    }).then(function() {
      return listener.close();
    });
  });


  test('listen for task (bind early)', function() {
    // Decide taskId upfront
    var taskId = slugid.v4();

    // Create listener
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});

    // Listen for message
    var gotMessage = new Promise(function(accept) {
      listener.on('message', function(message) {
        if (message.payload.status.taskId === taskId) {
          accept();
        }
      });
    });

    // Bind to queue events
    var queueEvents = new taskcluster.QueueEvents();
    return listener.bind(queueEvents.taskDefined({taskId: taskId})).then(function() {
      // Connect listener
      return listener.connect();
    }).then(function() {
      // Submit a test task
      var queue = new taskcluster.Queue({
        credentials:  cfg.get('taskcluster:credentials')
      });
      var deadline = new Date();
      deadline.setHours(deadline.getHours() + 2);
      return queue.defineTask(taskId, {
        provisionerId:    "dummy-test-provisioner",
        workerType:       "dummy-test-worker-type",
        schedulerId:      "dummy-test-scheduler",
        created:          (new Date()).toJSON(),
        deadline:         deadline.toJSON(),
        payload:          {},
        metadata: {
          name:           "Print `'Hello World'` Once",
          description:    "This task will prìnt `'Hello World'` **once**!",
          owner:          "jojensen@mozilla.com",
          source:         "https://github.com/taskcluster/taskcluster-events"
        }
      });
    }).then(function() {
      return gotMessage;
    }).then(function() {
      return listener.close();
    });
  });
});