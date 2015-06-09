var assert = require('assert');
var _ = require('lodash');
var debug = require('debug')('base:series');

/** Types supported for reporting */
var types = {
  String: function(v) { return /string/.test(typeof(v)); },
  Number: function(v) { return /number/.test(typeof(v)); },
  Any:    function(v) { return /string|number/.test(typeof(v)); }
};

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

exports.Series = Series;

/** Returns list of columns */
Series.prototype.columns = function() {
  return _.keys(this._options.columns);
};

/**
 * Create a reporter function that will validate points and submit them to the
 * drain, while always setting columns specified in tags. Note that values
 * specified in `tags` maybe overwritten by individual points.
 *
 * Example tags:
 * ```js
 * MySeries.reporter(drain, {
 *   component: 'queue',
 *   process: 'web'
 * })
 * ```
 */
Series.prototype.reporter = function(drain, tags) {
  var options = this._options;

  // Validate tags
  _.forIn(tags, function(value, key) {
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

  // Return a reporter
  return function(point) {
    // Validate point columns
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
    drain.addPoint(options.name, _.defaults({}, point, tags));
  };
};


/** Collection of statistics series used in taskcluster-base */

/** Usage reports format for stats.monitorProcessUsage */
exports.UsageReports = new Series({
  name:               'UsageReports',
  columns: {
    component:        types.String,
    process:          types.String,
    cpu:              types.Number,
    memory:           types.Number
  }
});

/** Structure for API response times series */
exports.ResponseTimes = new Series({
  name:               'ResponseTimes',
  columns: {
    duration:         types.Number,
    statusCode:       types.Number,
    requestMethod:    types.String,
    method:           types.String,
    component:        types.String
  },
  // Additional columns are req.params prefixed with "param", these should all
  // be strings
  additionalColumns:  types.String
});

/** Exchange reports for statistics */
exports.ExchangeReports = new Series({
  name:               'ExchangeReports',
  columns: {
    component:        types.String, // Component name (e.g. 'queue')
    process:          types.String, // Process name (e.g. 'server')
    duration:         types.Number, // Time it took to send the message
    routingKeys:      types.Number, // 1 + number CCed routing keys
    payloadSize:      types.Number, // Size of message bytes
    exchange:         types.String, // true || false
    error:            types.String  // true || false
  }
});

/** Statistics from Azure table operations */
exports.AzureTableOperations = new Series({
  name:             'AzureTableOperations',
  columns: {
    component:        types.String,
    process:          types.String,
    duration:         types.Number,
    table:            types.String,
    method:           types.String,
    error:            types.String
  }
});

/** Statistics from TaskCluster Client stats callback */
exports.APIClientCalls = new Series({
  name:               'APIClientCalls ',
  columns: {
    duration:         types.Number, // Duration of call in ms including retries
    retries:          types.Number, // Number of retries
    method:           types.String, // Name of method (signature)
    success:          types.Number, // 1 or 0
    resolution:       types.String, // http-<status> or err.code
    target:           types.String, // Queue, Index (class name if available)
    baseUrl:          types.String  // BaseUrl
  },
  additionalColumns:  types.String  // workerType, workerId, component, process
});

/** Handler reports format for stats.createHandlerTimer */
exports.HandlerReports = new Series({
  name:               'HandlerReports',
  columns: {
    component:        types.String,
    duration:         types.Number,
    exchange:         types.String,
    redelivered:      types.String,   // true || false
    error:            types.String    // true || false
  }
});
