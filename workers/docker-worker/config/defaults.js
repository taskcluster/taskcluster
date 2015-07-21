module.exports = {
  deviceManagement: {
    cpu: {
      enabled: false
    },
    loopbackAudio: {
      enabled: true
    },
    loopbackVideo: {
      enabled: true
    },
    // Phone device configuration will provide details for what kinds of phones
    // this worker is responsible for providing to tasks. This will ensure that
    // tasks are not claimed if the worker detects there will be no phones available.
    // In the future a session can be started on these phones prior to claiming tasks
    // and that session passed into the task.
    phone: {
      enabled: false,
      sims: '1', // Number of sim cards.
      type: undefined // device type (ex. 'flame')
    }
  },

  dockerConfig: {
    // Privileged mode will allow tasks to run with elevated privileges similar
    // to process running on the host.  The task containers will have access to
    // all host devices and create docker daemons within containers.  Use this
    // option with caution.
    // TODO: Consider killing the node after completing one task or locking down
    // in other ways.
    allowPrivileged: false,
    // Default registry to use when making authenticated image requests.  This
    // is similar to what docker pull does when `docker pull ubuntu:14.10`.
    defaultRegistry: 'registry.hub.docker.com',
    // Maximum number of attempts to make when pulling an image
    maxAttempts: 5,
    // Delay factor rand randomizationFactor used to computer randomized
    // exponential backoff when attempting to retry docker pulls
    delayFactor: 15 * 1000,
    // Value between 0 and 1
    randomizationFactor: 0.25
  },

  features: {
    relengAPIProxy: {
      image: 'quay.io/djmitche/relengapi-proxy:0.0.2',
      token: process.env.RELENG_API_TOKEN
    }
  },

  ssl: {
    certificate: '/etc/star_taskcluster-worker_net.crt',
    key: '/etc/star_taskcluster-worker_net.key'
  },

  // Hostname of this docker worker
  host: 'localhost',

  statelessHostname: {
    enabled: false,
    secret: process.env.DNS_SERVER_SECRET,
    domain: 'taskcluster-worker.net'
  },

  // Run test only teardown and logging events.
  testMode: false,

  // Run each container in as isolated fashion as possible (one core per container)
  // When this is true the capacity is always overriden to the number of cores.
  isolatedContainers: false,

  // Image used to  create the taskcluster proxy container.
  taskclusterProxyImage: 'taskcluster/taskcluster-proxy:latest',
  taskclusterLogImage: 'taskcluster/livelog:v3',
  testdroidProxyImage: 'taskcluster/testdroid-proxy:0.0.6',
  balrogVPNProxyImage: 'taskclusterprivate/taskcluster-vpn-proxy:0.0.1',
  dindImage: 'taskcluster/dind-service:v1.6',

  alivenessCheckInterval: 30000, // 30 seconds

  capacityManagement: {
    diskspaceThreshold: 10 * 1000000000
  },

  dockerVolume: '/mnt',

  // Garbage Collection configuration
  garbageCollection: {
    imageExpiration: 2 * 60 * 60 * 1000,
    // Amount of time that should elapse before an exited container that was not
    // explicitly marked for removal is removed.
    containerExpiration: 30 * 60 * 1000,
    interval: 60 * 1000
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
    // When enabled live logs will be served over SSL
    secureLiveLogging: false,
    // Used by Azure live logger to chunk writes and send on an interval
    liveLogChunkInterval: 5000, // 5 seconds
    // Added to the current date to make up the expiry time for logs. This is
    // hack to generate a year in ms... Note that two args (year, month) are
    // required here instead of one due to some quirk of v8...
    liveLogExpires: Date.UTC(2020, 0) - Date.UTC(2019, 0),
    bulkLogExpires: Date.UTC(2020, 0) - Date.UTC(2019, 0)
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

  metricsCollection: {
    // Only collect host level metrics every minute
    hostMetricsInterval: 60 * 1000
  },

  influx: {
    connectionString: undefined,
    // Wait no more than 10 minutes before flushing stats
    maxDelay: 10 * 60,
    // Maximum number of points to queue before flush
    maxPendingPoints: 100,
  },

  testdroid: {
    url:      process.env.TESTDROID_URL,
    username: process.env.TESTDROID_USERNAME,
    password: process.env.TESTDROID_PASSWORD
  },

  dockerWorkerPrivateKey: '/etc/docker-worker-priv.pem',

  dockerSave: {
    expiration: 1000 * 60 * 60 * 24 * 7
  }
};
