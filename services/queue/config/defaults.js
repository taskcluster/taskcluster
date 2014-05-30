module.exports = {

















  // AMQP configuration as given to `amqp.createConnection`
  // See: https://github.com/postwait/node-amqp#connection-options-and-url
  // As we'll be offering this through an API end-point this should really only
  // be url.
  amqp: {
    // URL for AMQP setup formatted as amqp://user:password@host:port/vhost
    url:                            'amqp://guest:guest@localhost:5672'
  },
};
















module.exports = {
  // TaskCluster Queue configuration
  queue: {
    reaperInterval: 1000 * 15,

    // Name of S3 bucket where all task and artifacts will be stored
    taskBucket:                     'tasks.taskcluster.net',

    // True, if taskBucket is CNAME'd like task.taskcluster.net, note, that
    // bucket name always has to be equal to CNAME, so this is just a boolean
    // encoding as string to ENV can set it without having to provide
    // environment variable as empty string.
    taskBucketIsCNAME:              'true',

    // Bucket to which schemas should be published
    schemaBucket:                   'schemas.taskcluster.net',

    // Publish schemas to bucket on startup, this should default to false, only
    // do this in the actual production server... Hence, set it by environment
    // variable. Unset it `inorder` to set it false by environment variable.
    publishSchemas:                 false
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
    connectionString:               'postgres://queue:secret@localhost:5432/queue_v1',

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
  aws: {
    // Default AWS region, this is where the S3 bucket lives
    region:                       'us-west-2',

    // Lock API version to use the latest API from 2013, this is fuzzy locking,
    // but it does the trick...
    apiVersion:                   '2014-01-01'
  }
};
