module.exports = {
  queue: {
    publishMetaData:              'false',
    // For testing purposes we let claims expire very fast
    claimTimeout:                 30,
    publicArtifactBucket:         'test-bucket-for-any-garbage',
    privateArtifactBucket:        'test-bucket-for-any-garbage',
    artifactContainer:            'artifacts',
    statsComponent:               'test-queue',
    queuePrefix:                  'hacks'
  },

  taskcluster: {
    authBaseUrl:                  'http://localhost:60407/v1',

    credentials: {
      clientId:                   "test-server",
      accessToken:                "none"
    }
  },

  server: {
    publicUrl:                    'http://localhost:60401',
    port:                         60401
  },

  /* TODO: See if this works:
  pulse: {
    username:   'guest',
    password:   'guest',
    hostname:   'localhost'
  }
  */

  aws: {
    region:                       'us-west-2'
  }
};
