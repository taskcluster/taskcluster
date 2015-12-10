import Debug from 'debug';
import path from 'path';
import base from 'taskcluster-base';

let debug = Debug('github:common');
var common = module.exports = {};

// Used in schema validation, shared across all config profiles
common.SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

// import a config file from ../config and merge it
// with sensible defaults and environment variables
common.loadConfig = function(profile) {
  return base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'pulse_username',
      'pulse_password',
      'taskclusterGithub_publishMetaData',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'github_credentials_token',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'influx_connectionString',
      'webhook_secret'
    ],
    filename:     'taskcluster-github'
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
    addPoint: (...args) => {debug("stats:", args)}
};

// Create a validator
common.buildValidator = function(cfg) {
  return base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    publish:          cfg.get('taskclusterGithub:publishMetaData') === 'true',
    schemaPrefix:     'github/v1/',
    aws:              cfg.get('aws')
  });
};

