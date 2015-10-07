module.exports = {
  // Component specific configuration
  auth: {
    // Azure table for the client table
    clientTableName:                'Clients',

    // Azure table for the roles table
    rolesTableName:                 'Roles',

    // Key for signing in base.Entity (sufficiently random string required)
    tableSigningKey:                undefined,
    // Key for data encryption in base.Entity (32 random bytes as base64)
    tableCryptoKey:                 undefined,

    // Publish references and schemas
    publishMetaData:                'false',

    // Exchange prefix for exchanges declared
    exchangePrefix:                 'v1/',

    // Name of component in statistics
    statsComponent:                 'auth',

    // root accessToken, if defined will cause root client to be
    // automatically created when application is started
    rootAccessToken:                undefined,

    // Accounts that auth can delegate access to, as JSON
    azureAccounts:                  "{}",

    // ClientId to use when issuing temporary credentials
    clientIdForTempCreds:           undefined
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

  // Pulse credentials
  pulse: {
    username:                       undefined,
    password:                       undefined
  },

  // InfluxDB for statistics
  influx: {
    // InfluxDB Connection string
    connectionString:               undefined
  },

  // AWS SDK configuration for delegation of S3 access and publication of
  // schemas and references
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
