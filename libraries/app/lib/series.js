var assert = require('assert');
var _ = require('lodash');


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


/** Collection of statistics series used in taskcluster-base */

/** Usage reports format for stats.monitorProcessUsage */
exports.UsageReports = new Series({
  name:       'UsageReports',
  columns: {
    component:      types.String,
    process:        types.String,
    cpu:            types.Number,
    memory:         types.Number
  }
});

/** Structure for API response times series */
exports.ResponseTimes = new Series({
  name:                 'ResponseTimes',
  columns: {
    duration:           types.Number,
    statusCode:         types.Number,
    requestMethod:      types.String,
    method:             types.String,
    component:          types.String
  },
  // Additional columns are req.params prefixed with "param", these should all
  // be strings
  additionalColumns:    types.String
});

/** Exchange reports for statistics */
exports.ExchangeReports = new Series({
  name:           'ExchangeReports',
  columns: {
    component:    types.String, // Component name (e.g. 'queue')
    process:      types.String, // Process name (e.g. 'server')
    duration:     types.Number, // Time it took to send the message
    routingKeys:  types.Number, // 1 + number CCed routing keys
    payloadSize:  types.Number, // Size of message bytes
    exchange:     types.String, // true || false
    error:        types.String  // true || false
  }
});

/** Statistics from Azure table operations */
exports.AzureTableOperations = new Series({
  name:             'AzureTableOperations',
  columns: {
    component:      types.String,
    process:        types.String,
    duration:       types.Number,
    table:          types.String,
    method:         types.String,
    error:          types.String
  }
});

/** Handler reports format for createHandlerTimer */
exports.HandlerReports = new Series({
  name:       'HandlerReports',
  columns: {
    component:      types.String,
    duration:       types.Number,
    exchange:       types.String,
    redelivered:    types.String,   // true || false
    error:          types.String    // true || false
  }
});
