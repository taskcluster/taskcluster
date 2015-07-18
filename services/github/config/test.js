module.exports = {
  webhook: {
    secret:                       'c-etait-un-secret'
  },

  exports: {
    publishMetaData:              'false',
    statsComponent:               'test-queue',
  },

  taskcluster: {
    authBaseUrl:                  'http://localhost:60414/v1',
    authPort:                     60414,
    credentials: {
      clientId:                   "test-server",
      accessToken:                "none"
    }
  },

  server: {
    publicUrl:                    'http://localhost:60415',
    port:                         60415
  },

  /*pulse: {
    username:   'public',
    password:   'public',
    hostname:   'pulse.mozilla.org'
  }*/
};
