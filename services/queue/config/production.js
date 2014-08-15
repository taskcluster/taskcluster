module.exports = {
  queue: {
    // Should be overwritten by environment variable
    publishMetaData:              'false',
    exchangePrefix:               'queue/v1/',
    artifactBucket:               'taskcluster-artifacts',
    artifactContainer:            'artifacts',
    taskContainer:                'tasks',
    artifactTableName:            'Artifacts'
  },

  taskcluster: {
    authBaseUrl:                  'https://auth.taskcluster.net/v1',
    credentials: {
      // Provided by environment variable
      clientId:                   undefined,
      accessToken:                undefined
    }
  },

  server: {
    publicUrl:                    'https://queue.taskcluster.net',
    port:                         80,
    env:                          'production',
    forceSSL:                     true,
    // We trust the proxy on heroku, as the SSL end-point provided by heroku
    // is a proxy, so we have to trust it.
    trustProxy:                   true
  },

  database: {
    // Provided by environment variable
    connectionString:             undefined
  },

  azure: {
    // Provided by environment variable
    accountName:                  undefined,
    accountKey:                   undefined
  },

  amqp: {
    // Provided by environment variable
    url:                          undefined
  },

  // Credentials are given by environment variables
  aws: {
    accessKeyId:                  undefined,
    secretAccessKey:              undefined,
    region:                       'us-west-2'
  }
};
