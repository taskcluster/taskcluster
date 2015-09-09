var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var base        = require('taskcluster-base');
var v1          = require('../routes/api/v1');
var taskcluster = require('taskcluster-client');
var mocha       = require('mocha');
var server      = require('../bin/server');

// Load configuration
var cfg = base.config({
  defaults:     require('../config/defaults'),
  profile:      require('../config/test'),
  filename:     'taskcluster-auth'
});

// Create subject to be tested by test
var helper = module.exports = {};

helper.cfg = cfg;
helper.testaccount = _.keys(JSON.parse(cfg.get('auth:azureAccounts')))[0];
helper.root = cfg.get('auth:root');

// Skip tests if no AWS credentials is configured
if (!cfg.get('azure:accountKey') ||
    !cfg.get('auth:root:accessToken') ||
    !cfg.get('influx:connectionString')) {
  console.log("Skip tests for due to missing credentials!");
  process.exit(1);
}

var webServer = null;
mocha.before(async () => {
  webServer = await server('test');
  webServer.setTimeout(1500);

  // Create client for working with API
  helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
  var reference = v1.reference({baseUrl: helper.baseUrl});
  helper.Auth = taskcluster.createClient(reference);
  helper.auth = new helper.Auth({
    baseUrl:          helper.baseUrl,
    credentials:      cfg.get('auth:root')
  });
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
});
