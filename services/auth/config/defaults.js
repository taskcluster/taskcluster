module.exports = {
  // Component specific configuration
  auth: {
    // Azure table for the client table
    clientTableName:                'TestClients',

    // Publish references and schemas
    publishMetaData:                'false',

    // Name of component in statistics
    statsComponent:                 'auth',

    // root credentials artificially inserted when application is started
    root: {
      clientId:                     undefined,
      accessToken:                  undefined
    },

    // Accounts that auth can delegate access to, as JSON
    azureAccounts:                  "{}"
  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'https://auth.taskcluster.net',

    // Port to listen for requests on
    port:                           undefined,

    // Environment 'development' or 'production'
    env:                            'development',

    // Force SSL, not useful when runnning locally
    forceSSL:                       false,

    // Trust a forwarding proxy
    trustProxy:                     false,

    // Secret used to signed cookies
    cookieSecret:                   'Warn, if no secret is used on production'
  },

  // Azure storage configuration
  azure: {
    // Azure table storage account name
    accountName:                    undefined,

    // Azure table storage account key
    accountKey:                     undefined
  },

  // InfluxDB for statistics
  influx: {
    // InfluxDB Connection string
    connectionString:               undefined
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
