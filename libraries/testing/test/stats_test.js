suite('stats', function() {
  var base          = require('../');
  var assert        = require('assert');
  var _             = require('lodash');
  var Promise       = require('promise');
  var debug         = require('debug')('test:stats_test');

  // Load necessary configuration
  var cfg = base.config({
    envs: [
      'influxdb_connectionString',
    ],
    filename:               'taskcluster-base-test'
  });

  if (!cfg.get('influxdb:connectionString')) {
    console.log("Skipping 'stats', missing config file: " +
                "taskcluster-base-test.conf.json");
    return;
  }

  test("Create Series", function() {
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        method:           base.stats.types.String,
        duration:         base.stats.types.Number,
      },
      additionalColumns:  base.stats.types.String,
    });
  });

  test("Create Influx", function() {
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });
  });

  test("Submit to influx", function() {
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });
    influx.addPoint('TestSeries', {
      colA:   'A',
      colB:   123
    });
    return influx.close().then(function() {
      assert(influx.pendingPoints() === 0, "Points should be submitted");
    });
  });

  test("Submit to influx (by timeout)", function() {
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString'),
      maxDelay:           1
    });
    influx.addPoint('TestSeries', {
      colA:   'A',
      colB:   123
    });
    return new Promise(function(accept) {
      setTimeout(accept, 1500);
    }).then(function() {
      assert(influx.pendingPoints() === 0, "Points should be submitted");
    });
  });

  test("Create reporter", function() {
    // Create test series
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        colA:             base.stats.types.String,
        colB:             base.stats.types.Number,
      },
      additionalColumns:  base.stats.types.String,
    });

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Create reporter
    var reporter = TestSeries.reporter(influx);

    // Report with reporter
    reporter({
      colA:   'A',
      colB:   123
    });

    assert(influx.pendingPoints() === 1, "We should have 1 point");
    return influx.close().then(function() {
      assert(influx.pendingPoints() === 0, "Points should be submitted");
    });
  });

  test("Create reporter (with NullDrain)", function() {
    // Create test series
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        colA:             base.stats.types.String,
        colB:             base.stats.types.Number,
      },
      additionalColumns:  base.stats.types.String,
    });

    // Create statistics drain with NullDrain
    var drain = new base.stats.NullDrain();

    // Create reporter
    var reporter = TestSeries.reporter(drain);

    // Report with reporter
    reporter({
      colA:   'A',
      colB:   123
    });

    assert(drain.pendingPoints() === 1, "We should have 1 point");
    return drain.close().then(function() {
      assert(drain.pendingPoints() === 0, "Points should be submitted");
    });
  });


  test("Report wrong columns", function() {
    // Create test series
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        colA:             base.stats.types.String,
        colB:             base.stats.types.Number,
      },
      additionalColumns:  base.stats.types.String,
    });

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Create reporter
    var reporter = TestSeries.reporter(influx);

    var err;
    try {
      // Report with reporter
      reporter({
        colA:   123,
        colB:   123
      });
    }
    catch(e) {
      err = e;
    }

    assert(err, "Expected an error");
    assert(influx.pendingPoints() === 0, "We should have 0 points");
  });

  test("Report wrong columns (again)", function() {
    // Create test series
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        colA:             base.stats.types.String,
        colB:             base.stats.types.Number,
      },
      additionalColumns:  base.stats.types.String,
    });

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Create reporter
    var reporter = TestSeries.reporter(influx);

    var err;
    try {
      // Report with reporter
      reporter({
        colA:   'strgin',
        colB:   'dsfsdf'
      });
    }
    catch(e) {
      err = e;
    }

    assert(err, "Expected an error");
    assert(influx.pendingPoints() === 0, "We should have 0 points");
  });

  test("Report additional columns", function() {
    // Create test series
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        colA:             base.stats.types.String,
        colB:             base.stats.types.Number,
      },
      additionalColumns:  base.stats.types.String,
    });

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Create reporter
    var reporter = TestSeries.reporter(influx);

    // Report with reporter
    reporter({
      colA:   'A',
      colB:   123,
      colAdd: 'string'
    });

    assert(influx.pendingPoints() === 1, "We should have 1 point");
    return influx.close().then(function() {
      assert(influx.pendingPoints() === 0, "Points should be submitted");
    });
  });

  test("Report additional columns (wrong type)", function() {
    // Create test series
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        colA:             base.stats.types.String,
        colB:             base.stats.types.Number,
      },
      additionalColumns:  base.stats.types.String,
    });

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Create reporter
    var reporter = TestSeries.reporter(influx);

    var err;
    try {
      // Report with reporter
      reporter({
        colA:   'A',
        colB:   123,
        colAdd: 34545
      });
    }
    catch(e) {
      err = e;
    }

    assert(err, "Expected an error");
    assert(influx.pendingPoints() === 0, "We should have 0 points");
  });

  test("Report additional columns (not allowed)", function() {
    // Create test series
    var TestSeries = new base.stats.Series({
      name:               'TestSeries',
      columns: {
        colA:             base.stats.types.String,
        colB:             base.stats.types.Number,
      }
    });

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Create reporter
    var reporter = TestSeries.reporter(influx);

    var err;
    try {
      // Report with reporter
      reporter({
        colA:   'A',
        colB:   123,
        colAdd: "string"
      });
    }
    catch(e) {
      err = e;
    }

    assert(err, "Expected an error");
    assert(influx.pendingPoints() === 0, "We should have 0 points");
  });

  test("startProcessUsageReporting (and stop)", function() {
    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Start monitoring
    base.stats.startProcessUsageReporting({
      drain:      influx,
      interval:   0.1,
      component:  'taskcluster-base-test',
      process:    'mocha'
    });

    return new Promise(function(accept) {
      setTimeout(accept, 400);
    }).then(function() {
      assert(influx.pendingPoints() >= 2, "We should have at least 2 points");
      base.stats.stopProcessUsageReporting();
    });
  });

  // We don't have taskcluster-client to play with here, so instead we'll rely
  // on a hardcoded message to write tests.
  var EXAMPLE_MESSAGE = {
    "payload": {
      "status": {
        "taskId": "5yfpbMMqSmSQ86t83vMZxA",
        "provisionerId": "aws-provisioner",
        "workerType": "cli",
        "schedulerId": "-",
        "taskGroupId": "5yfpbMMqSmSQ86t83vMZxA",
        "priority": 3,
        "deadline": "2014-09-05T00:49:58.600Z",
        "retriesLeft": 5,
        "state": "completed",
        "runs": [
          {
            "runId": 0,
            "state": "completed",
            "reasonCreated": "scheduled",
            "scheduled": "2014-09-05T00:20:03.022Z",
            "reasonResolved": "completed",
            "success": true,
            "workerGroup": "us-west-2c",
            "workerId": "i-b2c169bd",
            "takenUntil": "2014-09-05T00:40:04.185Z",
            "started": "2014-09-05T00:20:04.188Z",
            "resolved": "2014-09-05T00:20:15.472Z"
          }
        ]
      },
      "runId": 0,
      "success": true,
      "workerGroup": "us-west-2c",
      "workerId": "i-b2c169bd",
      "version": 1
    },
    "exchange": "queue/v1/task-completed",
    "routingKey": "primary.5yfpbMMqSmSQ86t83vMZxA.0.us-west-2c.i-b2c169bd.aws-provisioner.cli.-.5yfpbMMqSmSQ86t83vMZxA._",
    "redelivered": false
  };

  test("createHandlerTimer", function() {
    // Create message
    var message = _.cloneDeep(EXAMPLE_MESSAGE);

    // Create a message handler that waits 250 ms
    var handler = function() {
      return new Promise(function(accept) {
        setTimeout(accept, 250);
      });
    };

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Wrap handler
    var timedHandler = base.stats.createHandlerTimer(handler, {
      drain:        influx,
      component:    'taskcluster-base-test'
    });

    // Test that nothing has been reported yet
    assert(influx.pendingPoints() === 0, "We shouldn't have any points");

    // Test the timed handler
    return timedHandler(message).then(function() {
      assert(influx.pendingPoints() === 1, "We should have one point");
    });
  });

  test("createHandlerTimer (error)", function() {
    // Create message
    var message = _.cloneDeep(EXAMPLE_MESSAGE);

    // Create a message handler that waits 250 ms
    var handler = function() {
      return new Promise(function(accept) {
        setTimeout(accept, 250);
      }).then(function() {
        throw new Error("An expected error");
      });
    };

    // Create InfluxDB connection
    var influx = new base.stats.Influx({
      connectionString:   cfg.get('influxdb:connectionString')
    });

    // Wrap handler
    var timedHandler = base.stats.createHandlerTimer(handler, {
      drain:        influx,
      component:    'taskcluster-base-test'
    });

    // Test that nothing has been reported yet
    assert(influx.pendingPoints() === 0, "We shouldn't have any points");

    // Test the timed handler
    return timedHandler(message).then(function() {
      assert(false, "We should have got an error!");
    }, function(err) {
      debug("Expected error: %j", err);
    }).then(function() {
      assert(influx.pendingPoints() === 1, "We should have one point");
    });
  });
});


