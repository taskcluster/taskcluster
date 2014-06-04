module.exports = {
  // TaskCluster Queue configuration
  queue: {
    // Publish references and schemas
    publishMetaData:              'false',

    // Prefix for exchanges declared
    exchangePrefix:               'queue/v1/',

    // Settings for task reaper, note that this must be started as a separate
    // process bin/reaper.js run the reaper
    reaper: {
      // Timeóut between dealing with timed tasks
      interval:                   180,

      // Number of times reaping is allowed to fail in a row, before the process
      // crashes as sign if illness
      errorLimit:                 5
    },

    // Configuration of task storage
    tasks: {
      // S3 bucket to store tasks in
      bucket:                     'tasks.taskcluster.net',

      // Public base url for keys in the bucket, if cnamed, otherwise, leave it
      // null, and bucket URL will be used.
      publicBaseUrl:              'http://tasks.taskcluster.net'
    },

    // TaskCluster credentials for this server, these must have scopes:
    // auth:credentials
    // (typically configured using environment variables)
    credentials: {
      clientId:                   undefined,
      accessToken:                undefined
    }
  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'http://queue.taskcluster.net',

    // Port to listen for requests on
    port:                           undefined
  },

  // Database configuration
  database: {
    // Database connection string as pg://user:password@host:port/database
    connectionString:               undefined
  },


  // AMQP configuration
  amqp: {
    // URL for AMQP setup formatted as amqp://user:password@host:port/vhost
    url:                            undefined
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
