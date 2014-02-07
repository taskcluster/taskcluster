var nconf   = require('nconf');
var aws     = require('aws-sdk');

/** Default configuration values */
var DEFAULT_CONFIG_VALUES = {
  // TaskCluster Queue configuration
  'queue': {
    // Name of S3 bucket where all task and artifacts will be stored
    'task-bucket':                  'tasks.taskcluster.net',

    // Validate out-going messages, this can be disabled if we trust that we
    // generate correct JSON internally and want more performance
    'validate-outgoing':            true
  },

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
    'port':                         5432,

    // Database name
    'name':                         'queue_v1',

    // Database user
    'user':                         'queue',

    // Database password
    'password':                     'secret',

    // Drop database table if they already exist, this is mainly useful for
    // debugging when given as command-line argument: --database:drop-tables
    'drop-tables':                  false
  },

  // AMQP configuration as given to `amqp.createConnection`
  // See: https://github.com/postwait/node-amqp#connection-options-and-url
  'amqp': {
    // AMQP hostname
    'host':                         'localhost',

    // AMQP port
    'port':                         5672,

    // AMQP user
    'login':                        'guest',

    // AMQP password
    'password':                     'guest',

    // AMQP authentication mechanism
    'authMechanism':                'AMQPLAIN',

    // AMQP virtual host
    'vhost':                        '/',

    // Use SSL, keys are required to enable this, refer to node-amqp
    // documentation for details, see:
    // https://github.com/postwait/node-amqp#connection-options-and-url
    'ssl': {
      'enable':                     false
    }
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

  if (!default_only) {
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
