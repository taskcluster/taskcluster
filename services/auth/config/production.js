module.exports = {
  // Component specific configuration
  auth: {
    // Azure table for the client table
    clientTableName:                'Clients',

    // Publish references and schemas
    publishMetaData:                'true'
  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'http://auth.taskcluster.net',

    // Run in development mode (logging and error handling)
    development:                    false,
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
