module.exports = {
  // TaskCluster Queue configuration
  queue: {
    // Publish references and schemas
    publishMetaData:              'false'


    exchangePrefix:               'queue/v1/'

    reaper: {
      interval:                   30,
      errorLimit:                 5
      startInSeparateProcess:     'false'
    },

    tasks: {
      bucket:                     'tasks.taskcluster.net',
      publicBaseUrl:              'http://tasks.taskcluster.net'
    }
  },


  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'http://auth.taskcluster.net',

    // Port to listen for requests on
    port:                           undefined
  }

  // Database configuration
  database: {
    // Database connection string as anything://user:password@host:port/database
    connectionString:               'postgres://queue:secret@localhost:5432/queue_v1',
  },


  // AMQP configuration as given to `amqp.createConnection`
  // See: https://github.com/postwait/node-amqp#connection-options-and-url
  // As we'll be offering this through an API end-point this should really only
  // be url.
  amqp: {
    // URL for AMQP setup formatted as amqp://user:password@host:port/vhost
    url:                            'amqp://guest:guest@localhost:5672'
  },

  // AWS SDK configuration for publication of schemas and references
  aws: {
    // Access key id (typically configured using environment variables)
    accessKeyId:                    undefined,

    // Secret access key (typically configured using environment variables)
    secretAccessKey:                undefined,

    // Default AWS region, this is where the S3 bucket lives
    region:                         'us-west-2',

    // Lock API version to use the latest API from 2013, this is fuzzy locking,
    // but it does the trick...
    apiVersion:                     '2014-01-01'
  }
};
