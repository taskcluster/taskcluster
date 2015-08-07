var path = require('path');

module.exports = {
  capacity: 1,
  testMode: true,
  createQueue: false,

  dockerConfig: {
    allowPrivileged: false,
    defaultRegistry: 'registry.hub.docker.com',
    maxAttempts: 5,
    delayFactor: 100,
    randomizationFactor: 0.25
  },

  influx: {
    maxDelay: 1,
    maxPendingPoints: 1,
    allowHTTP: true
  },

  ssl: {
    certificate: '/worker/test/fixtures/ssl_cert.crt',
    key: '/worker/test/fixtures/ssl_cert.key'
  },

  logging: {
    // Expires one hour from now so test logs don't live too long...
    liveLogExpires: 3600 * 1000,
    bulkLogExpires: 3600 * 1000
  },

  cache: {
    volumeCachePath: path.join('/tmp', 'test-cache')
  },

  capacityManagement: {
    diskspaceThreshold: 1 * 1000000000,
  },

  dockerVolume: '/tmp',

  dockerWorkerPrivateKey: '/worker/test/docker-worker-priv.pem',

  interactive: {
    artifactName: 'private/docker-worker-tests/'
  }
};
