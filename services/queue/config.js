var fs      = require('fs');
var nconf   = require('nconf');
var aws     = require('aws-sdk');

/** Default configuration values */
var DEFAULT_CONFIG_VALUES = {
  // Server (HTTP) configuration
  'server': {
    // Server hostname
    'hostname':                     'localhost',

    // Port to run the HTTP server on
    'port':                         3000,

    // Cookie secret used to sign cookies, must be secret at deployment
    'cookie-secret':                "Warn, if no secret is used on production"
  },

  // Database configuration
  'database': {
    // Database hostname
    'host':                         'localhost',

    // Database port
    'port':                         1234,

    // Database name
    'name':                         'queue-v1',

    // Database user
    'user':                         'queue',

    // Database password
    'password':                     '42'
  },

  // AMQP configuration as given to `amqp.createConnection`
  // See: https://github.com/postwait/node-amqp#connection-options-and-url
  'amqp': {
    'host':                         'localhost',
    'port':                         5672,
    'login':                        'guest',
    'password':                     'guest',
    'authMechanism':                'AMQPLAIN',
    'vhost':                        '/',
    'ssl': {
      'enable':                     false
    }
  },

  // TaskCluster Queue configuration
  'queue': {
    // Name of S3 bucket where all task and artifacts will be stored
    'task-bucket':                  'jonasfj-taskcluster-tasks'
  },

  // AWS SDK configuration
  'aws': {
    // Default AWS region, this is where the S3 bucket lives
    'region':                       'us-west-2',

    // Lock API version to use the latest API from 2013, this is fuzzy locking,
    // but it does the trick...
    'apiVersion':                   '2014-01-01'
  }
};

/** Load configuration */
exports.load = function(default_only) {

  if (!default_only || true) {
    // Load configuration from command line arguments, if requested
    nconf.argv();

    // Config from current working folder if present
    nconf.file('local', 'taskcluster-queue.conf.json');

    // User configuration
    nconf.file('user', '~/.taskcluster-queue.conf.json');

    // Global configuration
    nconf.file('global', '/etc/taskcluster-queue.conf.json');
  }

  // Load default configuration
  nconf.defaults(DEFAULT_CONFIG_VALUES);

  // Set configuration for aws-sdk
  aws.config.update(nconf.get('aws'));
}
