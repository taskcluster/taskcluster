var config    = require('taskcluster-lib-config');

/** Load configuration */
var loadConfig = function() {
  // Load test configuration
  var cfg = config({
    envs: [
      'azure_accountName',
      'azure_accountKey',
      'azureTestTableName',
      'influxdb_connectionString'
    ],
    filename:               'taskcluster-base-test'
  });

  // Check that we have configuration or abort
  if (!cfg.get('azureTestTableName') ||
      !cfg.get('azure') ||
      !cfg.get('influxdb:connectionString')) {
    throw new Error("Config is missing");
  }

  return cfg;
};

// Export loadConfig
exports.loadConfig = loadConfig;
