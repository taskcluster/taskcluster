module.exports = {
  logging: {
    secureLiveLogging: true
  },

  // DNS Server secret used for constructing hostnames from using the
  // stateless dns server
  statelessHostname: {
    enabled: true,
    secret: process.env.DNS_SERVER_SECRET,
    domain: 'taskcluster-worker.net'
  },

  schema: {
    region: 'us-west-2',
    bucket: 'schemas.taskcluster.net',
    path: 'docker-worker/v1/'
  }
};
