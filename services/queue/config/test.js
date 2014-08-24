module.exports = {
  queue: {
    publishMetaData:              'false',
    reaper: {
      // Let's not wait too long for reaping during tests
      interval:                   5,
      // Don't want to see error
      errorLimit:                 0
    },
    // For testing purposes we let claims expire very fast
    claimTimeout:                 30,
    artifactBucket:               'test-bucket-for-any-garbage',
    artifactContainer:            'artifacts',
    taskContainer:                'tasks',
    responseTimeComponent:        'test-queue'
  },

  taskcluster: {
    authBaseUrl:                  'http://localhost:60007/v1',

    credentials: {
      clientId:                   "test-server",
      accessToken:                "none"
    }
  },

  server: {
    publicUrl:                    'http://localhost:60001',
    port:                         60001
  },

  // Local database
  database: {
    connectionString:             'postgres://queue:secret@localhost:5432/queue_v1',
  },

  // Use local AMQP installation
  amqp: {
    url:                          'amqp://guest:guest@localhost:5672'
  },

  aws: {
    region:                       'us-west-2'
  }
};
