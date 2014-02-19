var nconf   = require('nconf');
var aws     = require('aws-sdk');

/** Default configuration values */
var DEFAULT_CONFIG_VALUES = {
  // TaskCluster Queue configuration
  queue: {
    // Name of S3 bucket where all task and artifacts will be stored
    taskBucket:                     'tasks.taskcluster.net',

    // Bucket to which schemas should be published
    schemaBucket:                   'schemas.taskcluster.net',

    // Publish schemas to bucket on startup, this should default to false, only
    // do this in the actual production server... Hence, set it by environment
    // variable. Unset it `inorder` to set it false by environment variable.
    publishSchemas:                 false,

    // Validate out-going messages, this can be disabled if we trust that we
    // generate correct JSON internally and want more performance
    validateOutgoing:               true
  },

  // Server (HTTP) configuration
  server: {
    // Server hostname
    hostname:                       'localhost',

    // Port on which HTTP server is exposed, and port on which node will listen
    // unless `$PORT` is specified.
    port:                           3000,

    // Cookie secret used to sign cookies, must be secret at deployment
    cookieSecret:                   "Warn, if no secret is used on production"
  },

  // Database configuration
  database: {
    // Database connection string as anything://user:password@host:port/database
    connectionString:               'pg://queue:secret@localhost:5432/queue_v1',

    // Drop database table if they already exist, this is mainly useful for
    // debugging when given as command-line argument: --database:dropTables
    dropTables:                     false
  },

  // AMQP configuration as given to `amqp.createConnection`
  // See: https://github.com/postwait/node-amqp#connection-options-and-url
  // As we'll be offering this through an API end-point this should really only
  // be url.
  amqp: {
    // URL for AMQP setup formatted as amqp://user:password@host:port/vhost
    url:                            'amqp://guest:guest@localhost:5672'
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

    // Configurations elements loaded from commandline, these are the only
    // values we should ever really need to change.
    nconf.env({
      separator:  '__',
      whitelist:  [
        'queue__publishSchemas',
        'server__hostname',
        'server__port',
        'server__cookieSecret',
        'database__connectionString',
        'amqp__url',
        'aws__accessKeyId',
        'aws__secretAccessKey'
      ]
    });

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
