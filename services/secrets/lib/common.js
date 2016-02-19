import Debug from 'debug';
import path from 'path';
import base from 'taskcluster-base';

let debug = Debug('secrets:common');
var common = module.exports = {};

// Used in schema validation, shared across all config profiles
common.SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/secrets/v1/';

// Create a validator
common.buildValidator = function(cfg) {
  return base.validator({
    publish:          cfg.taskclusterSecrets.publishMetaData === 'true',
    folder:           path.join(__dirname, '..', 'schemas'),
    schemaPrefix:     'secrets/v1/',
    aws:              cfg.aws
  });
};

// Create InfluxDB connection for submitting statistics
common.buildInfluxStatsDrain = function(connectionString, maxDelay, maxPendingPoints) {
   return new base.stats.Influx({
    connectionString:   connectionString,
    maxDelay:           maxDelay,
    maxPendingPoints:   maxPendingPoints
   });
};

// This makes a good drain when influxdb isn't configured
common.stdoutStatsDrain = {
  addPoint(...args) {debug("stats:", args)},
  close() {}
};
