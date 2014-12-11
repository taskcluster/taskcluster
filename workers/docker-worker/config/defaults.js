module.exports = {

  // Hostname of this docker worker
  host: 'localhost',

  // Run test only teardown and logging events.
  testMode: false,

  // Image used to  create the taskcluster proxy container.
  taskclusterProxyImage: 'taskcluster/proxy',
  taskclusterLogImage: 'taskcluster/logserve',

  alivenessCheckInterval: 30000, // 30 seconds

  // Garbage Collection configuration
  garbageCollection: {
    imageExpiration: 2 * 60 * 60 * 1000,
    interval: 60 * 1000,
    diskspaceThreshold: 10 * 1000000000,
    dockerVolume: '/mnt'
  },

  // Shutdown configuration...
  shutdown: {
    enabled: false,
    minimumCycleSeconds: undefined
  },

  cache: {
    volumeCachePath: '/mnt/var/cache/docker-worker'
  },

  logging: {
    liveLogChunkInterval: 5000, // 5 seconds
    // Added to the current date to make up the expiry time for logs. This is
    // hack to generate a year in ms... Note that two args (year, month) are
    // required here instead of one due to some quirk of v8...
    liveLogExpires: Date.UTC(2020, 0) - Date.UTC(2019, 0),
    bulkLogExpires: Date.UTC(2020, 0) - Date.UTC(2019, 0),
  },

  task: {
    // We must reclaim somewhat frequently (but not too frequently) this is the
    // divisor used to figure out when to issue the reclaim based on taken until
    // for example `2` would mean half the time between now and taken until.
    reclaimDivisor: 1.3
  },

  /**
  Registries which we can authenticate against for pulls:

    registries: {
      // Note that these match based on the nearest path so the below
      // will authenticate for quay.io/mozilla/xfoo, etc...
      'quay.io/mozilla': {
        username: '...',
        password: '...'
      }
    }
  */
  registries: {},

  // Taskcluster client `credentials`.
  taskcluster: {
    clientId:    process.env.TASKCLUSTER_CLIENT_ID,
    accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN
  },

  // When true will create durable queue on pulse.
  createQueue: true,

  // Pulse credentials
  pulse: {
    username:   process.env.PULSE_USERNAME,
    password:   process.env.PULSE_PASSWORD
  },

  // Statsd configuration options (these are totally optional).
  statsd: {
    prefix: process.env.STATSD_PREFIX || '',
    url: process.env.STATSD_URL || 'tcp://localhost:8125'
  },

  dockerWorkerPrivateKey: '/etc/docker-worker-priv.pem'
};
