var debug         = require('debug')('base:stats');
var assert        = require('assert');
var _             = require('lodash');
var Promise       = require('promise');
var request       = require('superagent-promise');
var url           = require('url');
var urljoin       = require('url-join');

/** Types supported for reporting */
var types = {
  String: function(v) { return /string/.test(typeof(v)); },
  Number: function(v) { return /number/.test(typeof(v)); },
  Any:    function(v) { return /string|number/.test(typeof(v)); }
};

// Export types
exports.types = types;

/**
 * Create a times series that you can report to.
 *
 * options:
 * {
 *   // Name of the series in influxdb
 *   name:               'ResponseTimes',
 *
 *   // Required columns
 *   columns: {
 *     method:           stats.types.String,
 *     duration:         stats.types.Number,
 *     custom:           stats.types.Any
 *   },
 *
 *   // Type of additional columns if they are allowed (defaults `null`)
 *   additionalColumns:  stats.types.String
 * }
 */
var Series = function(options) {
  // Validate options
  assert(options,         "options are required");
  assert(options.name,    "Series must be named");
  options = _.defaults({}, options, {
    columns:              {},
    additionalColumns:    null
  });

  // Store options
  this._options = options;
};

// Export series
exports.Series = Series;

/**
 * Create a reporter function that will validate points and submit them to the
 * drain.
 */
Series.prototype.reporter = function(drain) {
  var options = this._options;

  // Return a reporter
  return function(point) {
    // Validate that
    _.forIn(point, function(value, key) {
      var validate = options.columns[key] || options.additionalColumns;
      if (!validate) {
        debug("additionalColumn %s not allowed in series: %s",
              key, options.name);
        throw new Error("additionalColumn " + key + " is not allowed!");
      }
      if (!validate(value)) {
        debug("Failed validate %s for key %s in series: %s",
              value, key, options.name);
        throw new Error("Failed validate key " + key + " in series: " +
                        options.name);
      }
    });

    // If validated we'll add the point to the drain
    drain.addPoint(options.name, point);
  };
};


/**
 * Create an Influx Database Connection
 *
 * options:
 * {
 *   // Connection string for
 *   connectionString:  '<protocol>://<user>:<pwd>@<host>:<port>/db/<database>',
 *
 *   // Max submission delay
 *   maxDelay:          60 * 5 // 5 minutes
 *
 *   // Maximum number of pending points before writing
 *   maxPendingPoints:  250
 * }
 */
var Influx = function(options) {
  assert(options,                   "options are required");
  assert(options.connectionString,  "options.connectionString is missing");
  options = _.defaults({}, options, {
    maxDelay:             60 * 5,
    maxPendingPoints:     250
  });
  this._options           = options;
  this._pendingPoints     = {};
  this._nbPendingPoints   = 0;
  this._flushTimeout = setTimeout(
    this.flush.bind(this, true),
    options.maxDelay * 1000
  );
};

/** Flush data to InfluxDB and optionally `restart` the timer */
Influx.prototype.flush = function(restart) {
  var that = this;

  // Clear timeout if asked to restart
  if (restart) {
    clearTimeout(this._flushTimeout);
    this._flushTimeout = null;
  }

  // Send points
  var done = Promise.resolve(null);
  if (this._nbPendingPoints > 0) {
    debug("Sending points to influxdb");

    // Prepare payload for transmission
    var payload = _.values(this._pendingPoints);
    payload.forEach(function(entry) {
      var nbCols = entry.columns.length;
      // Extend all points with some null properties, in case columns were added
      // after the initial creation
      entry.points.forEach(function(p) {
        p.length = nbCols;
      });
    });

    // Reset internals
    this._pendingPoints = {};
    this._nbPendingPoints = 0;

    // Send data
    done = request
      .post(urljoin(this._options.connectionString, 'series'))
      .query({
        time_precision: 'ms'
      })
      .send(payload)
      .end()
      .then(function(res) {
        // Handle errors
        if (!res.ok) {
          throw new Error("Request failed with HTTP code: " + res.status);
        }
      }).then(null, function(err) {
        debug("Failed to send to influxdb, err: %s, %j", err, err, err.stack);
      });
  }

  // Restart if requested
  if (restart) {
    done = done.then(function() {
      // Schedule the next flush
      this._flushTimeout = setTimeout(
        that.flush.bind(that, true),
        that._options.maxDelay * 1000
      );
    });
  }

  return done;
};

/** Flush a close InfluxDB connection */
Influx.prototype.close = function() {
  var that = this;
  clearTimeout(this._flushTimeout);
  this._flushTimeout = null;
  return that.flush(false);
};

/**
 * Add a new point to be saved in `series`.
 *
 * Example:
 *
 *     influx.addPoint('responseTime', {
 *       duration:   251
 *     });
 *
 */
Influx.prototype.addPoint = function(series, point) {
  // Get entry and create one if we don't have one
  var entry = this._pendingPoints[series];
  if (!entry) {
    entry = this._pendingPoints[series] = {
      name:     series,
      columns:  ['time'],
      points:   []
    };
  }

  // Transform point to list form
  var value = [new Date().getTime()];
  _.forIn(point, function(val, col) {
    // Find index for value
    var index = entry.columns.indexOf(col);
    // If it's not in columns, we add it
    if (index === -1) {
      entry.columns.push(col);
      var nbCols = entry.columns.length;
      index = nbCols - 1;
    }

    // Set the value
    value[index] = val;
  });

  // Add point to list of pending points
  entry.points.push(value);
  this._nbPendingPoints += 1;

  // Flush if we have too many points
  if (this._nbPendingPoints >= this._options.maxPendingPoints) {
    this.flush(true);
  }
};

/** Get the number of point currently waiting for submission*/
Influx.prototype.pendingPoints = function() {
  return this._nbPendingPoints;
};

// Export Influx
exports.Influx = Influx;

