module.exports = {
  // Component specific configuration
  auth: {
    clientTableName:                'Clients',
    rolesTableName:                 'Roles',

    // Publish references and schemas
    publishMetaData:                'true'
  },

  // Server configuration
  server: {
    env:                            'production',
    forceSSL:                       true,
    // We trust the proxy on heroku, as the SSL end-point provided by heroku
    // is a proxy, so we have to trust it.
    trustProxy:                     true
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
