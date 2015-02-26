module.exports = {
  queue: {
    publishMetaData:              'false',
    claimTimeout:                 20 * 60,
    publicArtifactBucket:         'test-bucket-for-any-garbage',
    privateArtifactBucket:        'test-bucket-for-any-garbage',
    artifactContainer:            'artifacts',
    statsComponent:               'test-queue',
    queuePrefix:                  'hacks',
    taskTableName:                'LocalTasks',
    artifactTableName:            'LocalArtifacts',
    claimQueue:                   'local-claim-queue',
    deadlineQueue:                'local-deadline-queue',
    deadlineDelay:                1 * 60 * 1000,
    // Positive, means we expire artifacts 4 days ahead of time, useful for
    // testing. In production this should be "- x hours" or so...
    artifactExpirationDelay:      '- 1 min',
    // Positive, means that expire tasks 4 days ahead of time, useful for
    // testing. In production this should be "- x hours" or so...
    taskExpirationDelay:          '- 1 min',
    deadline: {
      pollingDelay:               1000,
      parallelism:                1
    },

    claim: {
      pollingDelay:               1000,
      parallelism:                1
    }
  },

  server: {
    publicUrl:                    'http://localhost:60001',
    port:                         60001
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
