module.exports = {
  // Task index configuration
  index: {
    // Route prefix used to form custom routes on the form
    //  'route.<routePrefix>.<namespace>'
    routePrefix:                  'index',

    // Name of task-graph table in azure table storage
    indexedTaskTableName:         'IndexedTasks',
    namespaceTableName:           'Namespaces',

    // Publish references and schemas
    publishMetaData:              'false',

    // Name of AMQP queue, if a non-exclusive queue is to be used.
    listenerQueueName:            undefined,
  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'https://index.taskcluster.net',

    // Port to listen for requests on
    port:                           undefined,

    // Environment 'development' or 'production'
    env:                            'development',

    // Force SSL, not useful when runnning locally
    forceSSL:                       false,

    // Trust a forwarding proxy
    trustProxy:                     false
  },

  // Configuration of access to other taskcluster components
  taskcluster: {
    // BaseUrl for auth, if default built-in baseUrl isn't to be used
    authBaseUrl:                  undefined,

    // BaseUrl for queue, if default built-in baseUrl isn't to be used
    queueBaseUrl:                 undefined,

    // Exchange prefix for queue, if default isn't to be used.
    queueExchangePrefix:          undefined,

    // TaskCluster credentials for this server, these must have scopes:
    // auth:credentials, queue:*
    // (typically configured using environment variables)
    credentials: {
      clientId:                   undefined,
      accessToken:                undefined
    }
  },

  // AMQP configuration
  amqp: {
    // URL for AMQP setup formatted as amqp://user:password@host:port/vhost
    url:                            undefined
  },

  // Azure credentials (usually configured using environment variables)
  azure: {
    accountName:                    null,
    accountKey:                     null
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
