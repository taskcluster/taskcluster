module.exports = {
  // Treeherder configuration
  treeherder: {
    // Name of AMQP queue, if a non-exclusive queue is to be used.
    listenerQueueName:            undefined,

    // Component name in statistics
    statsComponent:               'treeherder',

    // Treeherder projects and credentials, this must be a JSON string with the
    // contents of "treeherder/etl/data/credentials.json"
    projects:                     '{}',

    // Treeherder baseUrl
    baseUrl:                      'https://treeherder.mozilla.org/api/',

    // Route prefix used form custom routes on the form:
    //   'route.<routePrefix>.<treeherderProject>'
    routePrefix:                  'treeherder'
  },

  // Configuration of access to other taskcluster components
  taskcluster: {
    queueBaseUrl:                 undefined,
    queueExchangePrefix:          undefined
  },

  // AMQP connection string
  amqp: {
    url:                          undefined
  },

  // InfluxDB configuration
  influx: {
    // Usually provided as environment variables, must be on the form:
    // https://<user>:<pwd>@<host>:<port>/db/<database>
    connectionString:               undefined,

    // Maximum delay before submitting pending points
    maxDelay:                       5 * 60,

    // Maximum pending points in memory
    maxPendingPoints:               250
  }
};
