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
});


