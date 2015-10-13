module.exports = {

  taskclusterSecrets: {
    publishMetaData:              'false',
    statsComponent:               'test-queue',
    // Time delay before expiring secrets, in readable format, see:
    // taskcluster.fromNow, notice this should be negative!
    // But in testing we just expire secrets 4 days into the future that's good
    // fun :)
    secretExpirationDelay:        '4 days'
  },

  azure: {
    tableName:                    'SecretsTestTable',
    cryptoKey:                    'CNcj2aOozdo7Pn+HEkAIixwninIwKnbYc6JPS9mNxZk=',
    signingKey:                   'REALULTIMATEPOWER.NET'
  },

  taskcluster: {
    authBaseUrl:                  'https://auth.taskcluster.net/v1',
  },

  server: {
    publicUrl:                    'http://localhost:60415',
    port:                         60415
  },
};
