module.exports = {
  index: {
    routePrefix:                  'dummy-routes.index-testing',
    indexedTaskTableName:         'DummyTestIndexedTasks',
    namespaceTableName:           'DummyTestNamespaces',
    publishMetaData:              'false',
    listenerQueueName:            undefined,
    statsComponent:               'test-index'
  },

  taskcluster: {
    authBaseUrl:                  'http://localhost:60021/v1',
    credentials: {
      clientId:                   undefined,
      accessToken:                undefined
    }
  },

  server: {
    publicUrl:                    'http://localhost:60020',
    port:                         60020
  },

  amqp: {
    url:                          undefined
  },

  aws: {
    region:                       'us-west-2'
  }
};