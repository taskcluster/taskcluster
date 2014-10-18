var path = require('path');

module.exports = {
  testMode: true,
  createQueue: false,

  // Disable statsd by default...
  statsd: {
    prefix: '',
    url: 'tcp://localhost:8125'
  },

  logging: {
    // Expires one hour from now so test logs don't live too long...
    liveLogExpires: 3600,
    bulkLogExpires: 3600
  },

  cache: {
    volumeCachePath: path.join(__dirname, '..', 'test', 'tmp')
  }
};
