module.exports = {

  taskclusterSecrets: {
    publishMetaData:              'false',
    statsComponent:               'test-queue',
  },

  azure: {
    tableName:                    'AzureTableName',
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
