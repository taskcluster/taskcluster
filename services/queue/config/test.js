module.exports = {
  queue: {
    publishMetaData:              'false',
    reaper: {
      // Let's not wait too long for reaping during tests
      interval:                   10,
      // Don't want to see error
      errorLimit:                 0
    },

    tasks: {
      // Use the test garbage bucket
      bucket:                     'test-bucket-for-any-garbage',
      publicBaseUrl:              null
    },

    credentials: {
      clientId:                   'zIroSzcvRPezmco_cecVmA',
      accessToken:                'Rj7z_GDMSaKWGadgs-je1Am7z5Q4zuQgOj6AZa0wzSSgAIkKQpB1RTG328W1Ls6WTA'
    }
  },

  server: {
    publicUrl:                      'http://localhost:600235',
    port:                           600235
  },

  // Local database
  database: {
    connectionString:               'postgres://queue:secret@localhost:5432/queue_v1',
  },

  // Use local AMQP installation
  amqp: {
    url:                            'amqp://guest:guest@localhost:5672'
  },
};
