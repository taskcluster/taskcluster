import Debug from 'debug';
import path from 'path';
import base from 'taskcluster-base';

let debug = Debug('secrets:common');
var common = module.exports = {};

// Used in schema validation, shared across all config profiles
common.SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/secrets/v1/';

// import a config file from ../config and merge it
// with sensible defaults and environment variables
common.loadConfig = function(profile) {
  return base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'azure_accountName',
      'azure_tableName',
      'azure_cryptoKey',
      'azure_signingKey',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'influx_connectionString',
      'taskclusterSecrets_publishMetaData'
    ],
    filename:     'taskcluster-secrets'
  });
};

// Create a validator
common.buildValidator = function(cfg) {
  return base.validator({
    publish:          cfg.get('taskclusterSecrets:publishMetaData') === 'true',
    folder:           path.join(__dirname, '..', 'schemas'),
    schemaPrefix:     'secrets/v1/',
    aws:              cfg.get('aws')
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
