module.exports = {
  exports: {
    publishMetaData:              'false',
    statsComponent:               'test-queue',
  },

  taskcluster: {
    authBaseUrl:                  'http://localhost:60414/v1',

    credentials: {
      clientId:                   "test-server",
      accessToken:                "none"
    }
  },

  server: {
    publicUrl:                    'http://localhost:60415',
    port:                         60415
  },

  /* TODO: See if this works:
  pulse: {
    username:   'guest',
    password:   'guest',
    hostname:   'localhost'
  }
  */
};