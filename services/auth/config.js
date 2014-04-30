var nconf   = require('nconf');
var aws     = require('aws-sdk-promise');

/** Default configuration values */
var DEFAULT_CONFIG_VALUES = {
  // taskcluster-auth configuration
  auth: {
    // Bucket to which schemas should be published
    schemaBucket:                   'schemas.taskcluster.net',

    // Publish schemas to bucket on startup (as string)
    publishSchemas:                 'false',

    // Validate out-going messages, this can be disabled if we trust that we
    // generate correct JSON internally and want more performance
    validateOutgoing:               true,

    // Azure credentials table name
    azureUserTable:                 "Users",

    // Whether or not to delete the users table (as string)
    clearUserTable:                 'false'
  },

  // Azure table credentials
  azureTableCredentials: {
    accountUrl:                     null,
    accountName:                    null,
    accountKey:                     null
  },

  // Server (HTTP) configuration
  server: {
    // Server hostname
    hostname:                       'localhost',

    // Port on which HTTP server is exposed, and port on which node will listen
    // unless `$PORT` is specified.
    port:                           5050,

    // Cookie secret used to sign cookies, must be secret at deployment
    cookieSecret:                   "Warn, if no secret is used on production"
  },

  // AWS SDK configuration for publication of schemas
  'aws': {
    // Default AWS region, this is where the S3 bucket lives
    'region':                       'us-west-2',

    // Lock API version to use the latest API from 2013, this is fuzzy locking,
    // but it does the trick...
    'apiVersion':                   '2014-01-01'
  }
};

var loaded = false;
/** Load configuration */
exports.load = function() {
  if (loaded) {
    return;
  }
  loaded = true;

  // Load configuration from command line arguments, if requested
  nconf.argv();

  // Configurations elements loaded from commandline, these are the only
  // values we should ever really need to change.
  nconf.env({
    separator:  '__',
    whitelist:  [
      'auth__publishSchemas',
      'auth__azureCredentialsTable',
      'auth__clearUserTable',
      'azureTableCredentials__accountUrl',
      'azureTableCredentials__accountName',
      'azureTableCredentials__accountKey',
      'server__hostname',
      'server__port',
      'server__cookieSecret',
      'aws__accessKeyId',
      'aws__secretAccessKey'
    ]
  });

  // Config from current working folder if present
  nconf.file('local', 'taskcluster-auth.conf.json');

  // User configuration
  nconf.file('user', '~/.taskcluster-auth.conf.json');

  // Global configuration
  nconf.file('global', '/etc/taskcluster-auth.conf.json');

  // Load default configuration
  nconf.defaults(DEFAULT_CONFIG_VALUES);

  // Set configuration for aws-sdk
  aws.config.update(nconf.get('aws'));
}
