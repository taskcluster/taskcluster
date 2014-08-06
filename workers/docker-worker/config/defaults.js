module.exports = {
  // Run test only teardown and logging events.
  testMode: false,

  // Image used to  create the taskcluster proxy container.
  taskclusterProxyImage: 'taskcluster/proxy',

  logging: {
    // Added to the current date to make up the expiry time for logs. This is
    // hack to generate a year in ms...
    liveLogExpires: Date.UTC(2020) - Date.UTC(2019),
    bulkLogExpires: Date.UTC(2020) - Date.UTC(2019),
  },

  // Taskcluster client `credentials`.
  taskcluster: {
    clientId:    process.env.TASKCLUSTER_CLIENT_ID,
    accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN
  },

  // Statsd configuration options (these are totally optional).
  statsd: {
    prefix: process.env.STATSD_PREFIX || '',
    url: process.env.STATSD_URL || 'tcp://localhost:8125'
  }
};
