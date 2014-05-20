module.exports = {
  // Component specific configuration
  auth: {
    // Azure table for the client table
    clientTableName:                'ClientTable',

    // Publish references and schemas
    publishMetaData:                'false'
  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'http://auth.taskcluster.net',

    // Port to listen for requests on
    port:                           undefined,

    // Run in development mode (logging and error handling)
    development:                    false,

    // Secret used to signed cookies
    cookieSecret:                   'Warn, if no secret is used on production'
  },

  // Azure table storage configuration
  azureTable: {
    // Azure table storage account name
    accountName:                    undefined,

    // Azure table storage account key
    accountKey:                     undefined,

    // Azure table account URL, make sure to use HTTPS
    accountUrl:                     undefined
  },

  // AWS SDK configuration for publication of schemas and references
  aws: {
    // Default AWS region, this is where the S3 bucket lives
    region:                         'us-west-2',

    // Lock API version to use the latest API from 2013, this is fuzzy locking,
    // but it does the trick...
    apiVersion:                     '2014-01-01'
  }
};
