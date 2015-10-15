var base        = require('taskcluster-base');

var testProfile = "test";

// Create and export helper object
var helper = module.exports = {};

// Load configuration
var cfg = base.config({
  defaults:     require('../config/defaults'),
  profile:      require('../config/' + testProfile),
  envs: [
    'pulse_username',
    'pulse_password',
    'taskcluster_credentials_clientId',
    'taskcluster_credentials_accessToken',
    'azure_accountName',
    'azure_accountKey'
  ],
  filename:     'taskcluster-hooks'
});

helper.hasAzureCredentials = cfg.get('azure:accountName');
