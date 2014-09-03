module.exports = {
  index: {
    routePrefix:                  'index',
    indexedTaskTableName:         'IndexedTasks',
    namespaceTableName:           'Namespaces',
    listenerQueueName:            'index/incoming-tasks'
  },

  server: {
    publicUrl:                      'https://index.taskcluster.net',
    port:                           80,
    env:                            'production',
    forceSSL:                       true,
    // We trust the proxy on heroku, as the SSL end-point provided by heroku
    // is a proxy, so we have to trust it.
    trustProxy:                     true
  }
};
