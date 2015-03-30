module.exports = {

  // Hostname of this docker worker
  host: 'localhost',

  // Run test only teardown and logging events.
  testMode: false,

  // Run each container in as isolated fashion as possible (one core per container)
  // When this is true the capacity is always overriden to the number of cores.
  isolatedContainers: false,

  // Image used to  create the taskcluster proxy container.
  taskclusterProxyImage: 'quay.io/mozilla/taskcluster-proxy',
  taskclusterLogImage: 'quay.io/mozilla/taskcluster-logserve',
  testdroidProxyImage: 'quay.io/mozilla/testdroid-proxy:0.0.6',

  alivenessCheckInterval: 30000, // 30 seconds

  capacityManagement: {
    diskspaceThreshold: 10 * 1000000000,
  },

  dockerVolume: '/mnt',

  // Garbage Collection configuration
  garbageCollection: {
    imageExpiration: 2 * 60 * 60 * 1000,
    // Amount of time that should elapse before an exited container that was not
    // explicitly marked for removal is removed.
    containerExpiration: 30 * 60 * 1000,
    interval: 60 * 1000,
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
    reclaimDivisor: 1.3,
    // Tasks should be removed from the queue if they have been dequeued a lot.
    // Possible signs that the task is bad
    dequeueCount: 15
  },

  taskQueue: {
    // Task queue will be polled on a frequent interval for new pending tasks
    pollInterval: 5 * 1000,
    // If signed url for queue expires within now()+expiration, refresh queues
    expiration: 5 * 60 * 1000,
    // Number of times to retry requests to the task queue
    maxRetries: 5,
    // Amount of time to wait between retries
    requestRetryInterval: 2 * 1000
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

  testdroid: {
    url:      process.env.TESTDROID_URL,
    username: process.env.TESTDROID_USERNAME,
    password: process.env.TESTDROID_PASSWORD
  },

  dockerWorkerPrivateKey: '/etc/docker-worker-priv.pem'
};
