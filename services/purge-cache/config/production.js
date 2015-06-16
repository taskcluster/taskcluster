module.exports = {
  purgeCache: {
    // Should be overwritten by environment variable
    publishMetaData:              'false',
    exchangePrefix:               'v1/',
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
    publicUrl:                    'https://purge-cache.taskcluster.net',
    port:                         80,
    env:                          'production',
    forceSSL:                     true,
    // We trust the proxy on heroku, as the SSL end-point provided by heroku
    // is a proxy, so we have to trust it.
    trustProxy:                   true
  },

  // Pulse credentials
  pulse: {
    username:                     'taskcluster-purge-cache',
    // Provided by environment variable
    password:                     undefined
  },

  // Credentials are given by environment variables
  aws: {
    accessKeyId:                  undefined,
    secretAccessKey:              undefined,
    region:                       'us-west-2'
  }
};